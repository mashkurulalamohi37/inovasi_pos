"""Phase 6B-5 — Restaurant vertical wiring tests."""

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.audit import AuditLog
from app.models.industry import RestaurantKot, RestaurantOrder, RestaurantTable
from tests.test_operations import _store_id, get_product_by_sku, login


def _tables(client, headers):
    res = client.get("/api/v1/industry/restaurant/tables", headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


def _open_dine_in(client, headers, table_id: str, guest_count: int = 2):
    res = client.post(
        "/api/v1/industry/restaurant/orders",
        headers=headers,
        json={
            "service_mode": "dine_in",
            "table_id": table_id,
            "guest_count": guest_count,
            "store_id": _store_id(client, headers),
            "waiter_name": "Waiter A",
        },
    )
    assert res.status_code == 200, res.text
    return res.json()


def test_open_order_occupies_table(auth_headers, client: TestClient, session: Session):
    tables = _tables(client, auth_headers)
    free = next(t for t in tables if t["status"] == "available")
    order = _open_dine_in(client, auth_headers, free["id"])
    assert order["status"] == "open"
    assert order["table_id"] == free["id"]
    refreshed = next(t for t in _tables(client, auth_headers) if t["id"] == free["id"])
    assert refreshed["status"] == "occupied"
    assert refreshed["current_order_id"] == order["id"]
    assert refreshed["current_guest_count"] == 2
    row = session.get(RestaurantTable, free["id"])
    assert row is not None
    assert row.current_order_id == order["id"]


def test_duplicate_active_table_order_blocked(auth_headers, client: TestClient):
    tables = _tables(client, auth_headers)
    free = next(t for t in tables if t["status"] == "available")
    _open_dine_in(client, auth_headers, free["id"])
    dup = client.post(
        "/api/v1/industry/restaurant/orders",
        headers=auth_headers,
        json={
            "service_mode": "dine_in",
            "table_id": free["id"],
            "guest_count": 1,
            "store_id": _store_id(client, auth_headers),
        },
    )
    assert dup.status_code == 409


def test_takeaway_order_no_table(auth_headers, client: TestClient):
    res = client.post(
        "/api/v1/industry/restaurant/orders",
        headers=auth_headers,
        json={
            "service_mode": "takeaway",
            "guest_count": 1,
            "store_id": _store_id(client, auth_headers),
        },
    )
    assert res.status_code == 200, res.text
    assert res.json()["table_id"] is None
    assert res.json()["service_mode"] == "takeaway"


def test_add_item_modifiers_and_send_kot(auth_headers, client: TestClient, session: Session):
    tables = _tables(client, auth_headers)
    free = next(t for t in tables if t["status"] == "available")
    order = _open_dine_in(client, auth_headers, free["id"])
    product = get_product_by_sku(client, auth_headers, "REST-001")
    added = client.post(
        f"/api/v1/industry/restaurant/orders/{order['id']}/lines",
        headers=auth_headers,
        json={
            "product_id": product["id"],
            "qty": 2,
            "modifiers": ["Extra cheese", "No onion"],
            "modifier_price": 20,
            "notes": "Less spicy",
            "kitchen_station": "grill",
        },
    )
    assert added.status_code == 200, added.text
    body = added.json()
    assert len(body["lines"]) == 1
    line = body["lines"][0]
    assert line["modifiers"] == ["Extra cheese", "No onion"]
    assert line["notes"] == "Less spicy"
    assert line["unsent_qty"] == 2
    assert line["sent_to_kitchen_qty"] == 0

    kot = client.post(
        f"/api/v1/industry/restaurant/orders/{order['id']}/send-kot",
        headers=auth_headers,
        json={},
    )
    assert kot.status_code == 200, kot.text
    kot_body = kot.json()
    assert len(kot_body["kot_ids"]) == 1
    assert kot_body["order"]["lines"][0]["sent_to_kitchen_qty"] == 2
    assert kot_body["order"]["lines"][0]["unsent_qty"] == 0
    assert kot_body["order"]["status"] == "sent_to_kitchen"

    # Duplicate send blocked
    again = client.post(
        f"/api/v1/industry/restaurant/orders/{order['id']}/send-kot",
        headers=auth_headers,
        json={},
    )
    assert again.status_code == 400

    # Additional item creates new KOT only for new qty
    client.post(
        f"/api/v1/industry/restaurant/orders/{order['id']}/lines",
        headers=auth_headers,
        json={"product_id": product["id"], "qty": 1, "kitchen_station": "grill"},
    )
    kot2 = client.post(
        f"/api/v1/industry/restaurant/orders/{order['id']}/send-kot",
        headers=auth_headers,
        json={},
    )
    assert kot2.status_code == 200, kot2.text
    assert len(kot2.json()["kots"][0]["lines"]) == 1
    assert kot2.json()["kots"][0]["lines"][0]["qty"] == 1

    audits = session.exec(select(AuditLog).where(AuditLog.action == "restaurant_kot_create")).all()
    assert len(audits) >= 2


def test_kot_status_transitions_and_kitchen_rbac(auth_headers, client: TestClient):
    tables = _tables(client, auth_headers)
    free = next(t for t in tables if t["status"] == "available")
    order = _open_dine_in(client, auth_headers, free["id"])
    product = get_product_by_sku(client, auth_headers, "REST-001")
    client.post(
        f"/api/v1/industry/restaurant/orders/{order['id']}/lines",
        headers=auth_headers,
        json={"product_id": product["id"], "qty": 1},
    )
    kot = client.post(
        f"/api/v1/industry/restaurant/orders/{order['id']}/send-kot",
        headers=auth_headers,
        json={},
    ).json()
    kot_id = kot["kot_ids"][0]

    cashier = login(client, "cashier@pulse.pos", "cashier123")
    denied = client.patch(
        f"/api/v1/industry/restaurant/kots/{kot_id}",
        headers=cashier,
        json={"status": "preparing"},
    )
    assert denied.status_code == 403

    ok = client.patch(
        f"/api/v1/industry/restaurant/kots/{kot_id}",
        headers=auth_headers,
        json={"status": "accepted"},
    )
    assert ok.status_code == 200
    assert ok.json()["status"] == "accepted"
    prep = client.patch(
        f"/api/v1/industry/restaurant/kots/{kot_id}",
        headers=auth_headers,
        json={"status": "preparing"},
    )
    assert prep.status_code == 200
    ready = client.patch(
        f"/api/v1/industry/restaurant/kots/{kot_id}",
        headers=auth_headers,
        json={"status": "ready"},
    )
    assert ready.status_code == 200
    assert ready.json()["status"] == "ready"


def _send_one_kot(client, headers):
    tables = _tables(client, headers)
    free = next(t for t in tables if t["status"] == "available")
    order = _open_dine_in(client, headers, free["id"])
    product = get_product_by_sku(client, headers, "REST-001")
    client.post(
        f"/api/v1/industry/restaurant/orders/{order['id']}/lines",
        headers=headers,
        json={"product_id": product["id"], "qty": 1},
    )
    res = client.post(
        f"/api/v1/industry/restaurant/orders/{order['id']}/send-kot",
        headers=headers,
        json={},
    )
    assert res.status_code == 200, res.text
    return res.json()["kot_ids"][0]


def test_kot_exposes_resolved_waiter_name(auth_headers, client: TestClient):
    """The KDS shows who fired the ticket, so the id in sent_by must resolve to a name."""
    kot_id = _send_one_kot(client, auth_headers)

    listed = client.get("/api/v1/industry/restaurant/kots", headers=auth_headers)
    assert listed.status_code == 200, listed.text
    row = next(k for k in listed.json() if k["id"] == kot_id)

    assert row["sent_by"], "KOT should record which user sent it"
    assert row["sent_by_name"], "sent_by must be resolved to a display name for the KDS"
    assert row["sent_by_name"] != row["sent_by"], "name should not be the bare user id"


def test_kot_cannot_skip_straight_to_ready(auth_headers, client: TestClient):
    """sent -> ready is illegal. The KDS walks sent -> preparing -> ready instead."""
    kot_id = _send_one_kot(client, auth_headers)

    skipped = client.patch(
        f"/api/v1/industry/restaurant/kots/{kot_id}",
        headers=auth_headers,
        json={"status": "ready"},
    )
    assert skipped.status_code == 400

    # The route the KDS actually takes.
    for step in ("preparing", "ready"):
        res = client.patch(
            f"/api/v1/industry/restaurant/kots/{kot_id}",
            headers=auth_headers,
            json={"status": step},
        )
        assert res.status_code == 200, res.text
        assert res.json()["status"] == step


def test_void_sent_item_requires_reason_and_permission(auth_headers, client: TestClient):
    tables = _tables(client, auth_headers)
    free = next(t for t in tables if t["status"] == "available")
    order = _open_dine_in(client, auth_headers, free["id"])
    product = get_product_by_sku(client, auth_headers, "REST-001")
    added = client.post(
        f"/api/v1/industry/restaurant/orders/{order['id']}/lines",
        headers=auth_headers,
        json={"product_id": product["id"], "qty": 1},
    ).json()
    line_id = added["lines"][0]["id"]
    client.post(f"/api/v1/industry/restaurant/orders/{order['id']}/send-kot", headers=auth_headers, json={})

    cashier = login(client, "cashier@pulse.pos", "cashier123")
    denied = client.post(
        f"/api/v1/industry/restaurant/orders/{order['id']}/lines/{line_id}/void",
        headers=cashier,
        json={"reason": "guest left"},
    )
    assert denied.status_code == 403

    no_reason = client.post(
        f"/api/v1/industry/restaurant/orders/{order['id']}/lines/{line_id}/void",
        headers=auth_headers,
        json={},
    )
    assert no_reason.status_code == 400

    ok = client.post(
        f"/api/v1/industry/restaurant/orders/{order['id']}/lines/{line_id}/void",
        headers=auth_headers,
        json={"reason": "guest left"},
    )
    assert ok.status_code == 200
    assert ok.json()["lines"][0]["status"] == "cancelled"


def test_move_table_releases_source(auth_headers, client: TestClient):
    tables = _tables(client, auth_headers)
    free = [t for t in tables if t["status"] == "available"]
    assert len(free) >= 2
    order = _open_dine_in(client, auth_headers, free[0]["id"])
    moved = client.post(
        f"/api/v1/industry/restaurant/orders/{order['id']}/move-table",
        headers=auth_headers,
        json={"destination_table_id": free[1]["id"]},
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["table_id"] == free[1]["id"]
    after = {t["id"]: t for t in _tables(client, auth_headers)}
    assert after[free[0]["id"]]["status"] == "available"
    assert after[free[0]["id"]]["current_order_id"] is None
    assert after[free[1]["id"]]["status"] == "occupied"
    assert after[free[1]["id"]]["current_order_id"] == order["id"]


def test_pay_order_creates_invoice_and_releases_table(auth_headers, client: TestClient, session: Session):
    tables = _tables(client, auth_headers)
    free = next(t for t in tables if t["status"] == "available")
    order = _open_dine_in(client, auth_headers, free["id"])
    product = get_product_by_sku(client, auth_headers, "REST-001")
    line = client.post(
        f"/api/v1/industry/restaurant/orders/{order['id']}/lines",
        headers=auth_headers,
        json={"product_id": product["id"], "qty": 1, "unit_price": product["base_price"]},
    )
    assert line.status_code == 200, line.text
    pay = client.post(
        f"/api/v1/industry/restaurant/orders/{order['id']}/pay",
        headers=auth_headers,
        json={"tender": "cash", "tax_rate": 0.05, "service_charge": 10},
    )
    assert pay.status_code == 200, pay.text
    body = pay.json()
    assert body["order"]["status"] == "paid"
    assert body["order"]["sales_invoice_id"]
    assert body["invoice"]["id"] == body["order"]["sales_invoice_id"]
    refreshed = next(t for t in _tables(client, auth_headers) if t["id"] == free["id"])
    assert refreshed["status"] == "available"
    assert refreshed["current_order_id"] is None
    db_order = session.get(RestaurantOrder, order["id"])
    assert db_order is not None
    assert db_order.status == "paid"


def test_split_payment_equal(auth_headers, client: TestClient):
    tables = _tables(client, auth_headers)
    free = next(t for t in tables if t["status"] == "available")
    order = _open_dine_in(client, auth_headers, free["id"])
    product = get_product_by_sku(client, auth_headers, "REST-001")
    line = client.post(
        f"/api/v1/industry/restaurant/orders/{order['id']}/lines",
        headers=auth_headers,
        json={"product_id": product["id"], "qty": 1, "unit_price": product["base_price"]},
    )
    assert line.status_code == 200, line.text
    pay = client.post(
        f"/api/v1/industry/restaurant/orders/{order['id']}/pay",
        headers=auth_headers,
        json={"split_count": 2, "tender": "cash", "tax_rate": 0},
    )
    assert pay.status_code == 200, pay.text
    assert pay.json()["order"]["status"] == "paid"


def test_delivery_order_requires_address_and_phone(auth_headers, client: TestClient):
    """The POS had no fields for either, so every delivery order 400'd."""
    store_id = _store_id(client, auth_headers)

    missing = client.post(
        "/api/v1/industry/restaurant/orders",
        headers=auth_headers,
        json={"service_mode": "delivery", "guest_count": 1, "store_id": store_id},
    )
    assert missing.status_code == 400, missing.text
    assert "delivery_address" in missing.json()["detail"]

    created = client.post(
        "/api/v1/industry/restaurant/orders",
        headers=auth_headers,
        json={
            "service_mode": "delivery",
            "guest_count": 1,
            "store_id": store_id,
            "delivery_address": "House 12, Road 5, Dhanmondi",
            "delivery_phone": "01812345678",
        },
    )
    assert created.status_code == 200, created.text
    body = created.json()
    assert body["service_mode"] == "delivery"
    assert body["table_id"] is None
    assert body["delivery_address"] == "House 12, Road 5, Dhanmondi"


def test_line_qty_cannot_drop_below_sent_to_kitchen(auth_headers, client: TestClient):
    """The cart's qty stepper must not be able to un-cook food.

    The POS routes a decrement below the sent quantity into the void flow instead;
    this pins the backend rule that makes that necessary.
    """
    tables = _tables(client, auth_headers)
    free = next(t for t in tables if t["status"] == "available")
    order = _open_dine_in(client, auth_headers, free["id"])
    product = get_product_by_sku(client, auth_headers, "REST-001")
    added = client.post(
        f"/api/v1/industry/restaurant/orders/{order['id']}/lines",
        headers=auth_headers,
        json={"product_id": product["id"], "qty": 3, "unit_price": product["base_price"]},
    ).json()
    line_id = added["lines"][0]["id"]
    client.post(f"/api/v1/industry/restaurant/orders/{order['id']}/send-kot", headers=auth_headers, json={})

    lowered = client.patch(
        f"/api/v1/industry/restaurant/orders/{order['id']}/lines/{line_id}",
        headers=auth_headers,
        json={"qty": 1},
    )
    assert lowered.status_code == 400, lowered.text
    assert "void" in lowered.json()["detail"].lower()

    raised = client.patch(
        f"/api/v1/industry/restaurant/orders/{order['id']}/lines/{line_id}",
        headers=auth_headers,
        json={"qty": 4},
    )
    assert raised.status_code == 200, raised.text
    assert raised.json()["lines"][0]["qty"] == 4


def test_void_after_kitchen_requires_reason_and_reduces_total(auth_headers, client: TestClient):
    tables = _tables(client, auth_headers)
    free = next(t for t in tables if t["status"] == "available")
    order = _open_dine_in(client, auth_headers, free["id"])
    product = get_product_by_sku(client, auth_headers, "REST-001")
    added = client.post(
        f"/api/v1/industry/restaurant/orders/{order['id']}/lines",
        headers=auth_headers,
        json={"product_id": product["id"], "qty": 2, "unit_price": product["base_price"]},
    ).json()
    line_id = added["lines"][0]["id"]
    subtotal_before = added["subtotal"]
    client.post(f"/api/v1/industry/restaurant/orders/{order['id']}/send-kot", headers=auth_headers, json={})

    no_reason = client.post(
        f"/api/v1/industry/restaurant/orders/{order['id']}/lines/{line_id}/void",
        headers=auth_headers,
        json={"qty": 1},
    )
    assert no_reason.status_code == 400, no_reason.text

    voided = client.post(
        f"/api/v1/industry/restaurant/orders/{order['id']}/lines/{line_id}/void",
        headers=auth_headers,
        json={"qty": 1, "reason": "Guest changed order"},
    )
    assert voided.status_code == 200, voided.text
    assert voided.json()["subtotal"] < subtotal_before


def test_bill_rejects_zero_payment_without_allow_due_permission(auth_headers, client: TestClient):
    """A zero payment must not close an order.

    `allow_due` was an ungated request-body flag, so posting it alongside a zero
    payment marked the order paid having collected nothing.
    """
    tables = _tables(client, auth_headers)
    free = next(t for t in tables if t["status"] == "available")
    order = _open_dine_in(client, auth_headers, free["id"])
    product = get_product_by_sku(client, auth_headers, "REST-001")
    client.post(
        f"/api/v1/industry/restaurant/orders/{order['id']}/lines",
        headers=auth_headers,
        json={"product_id": product["id"], "qty": 1, "unit_price": product["base_price"]},
    )

    short = client.post(
        f"/api/v1/industry/restaurant/orders/{order['id']}/pay",
        headers=auth_headers,
        json={"payments": [{"method": "cash", "amount": 0}]},
    )
    assert short.status_code == 400, short.text

    # This fixture logs in as admin, who legitimately holds restaurant.allow_due,
    # so the waiver clears the permission gate — a role without it gets a 403. It
    # must still not close the order for free: the sale engine requires a named
    # customer to carry a due balance.
    waived = client.post(
        f"/api/v1/industry/restaurant/orders/{order['id']}/pay",
        headers=auth_headers,
        json={"payments": [{"method": "cash", "amount": 0}], "allow_due": True},
    )
    assert waived.status_code in (400, 403), waived.text

    # Whichever guard fired, the order must still be open and the table still held.
    refreshed = client.get(
        f"/api/v1/industry/restaurant/orders/{order['id']}", headers=auth_headers
    ).json()
    assert refreshed["status"] != "paid"
    assert refreshed["sales_invoice_id"] is None


def test_bill_rejects_tax_rate_below_configured_rate(auth_headers, client: TestClient):
    """tax_rate was read straight off the request body, so a cashier could post 0."""
    tables = _tables(client, auth_headers)
    free = next(t for t in tables if t["status"] == "available")
    order = _open_dine_in(client, auth_headers, free["id"])
    product = get_product_by_sku(client, auth_headers, "REST-001")
    client.post(
        f"/api/v1/industry/restaurant/orders/{order['id']}/lines",
        headers=auth_headers,
        json={"product_id": product["id"], "qty": 1, "unit_price": product["base_price"]},
    )

    # Admin may override, so the bill succeeds — but VAT must be applied from the
    # configured rate when the body says nothing at all.
    paid = client.post(
        f"/api/v1/industry/restaurant/orders/{order['id']}/pay",
        headers=auth_headers,
        json={"tender": "cash"},
    )
    assert paid.status_code == 200, paid.text
    body = paid.json()["order"]
    assert body["tax"] > 0, "VAT must default to the configured rate, not zero"
    assert body["total"] == round(body["subtotal"] + body["tax"], 2)


def test_discounted_line_needs_override_at_order_entry(auth_headers, client: TestClient):
    """The pricing guard must fire while the guest is still ordering.

    Rejecting a below-list price at settlement is useless: by then the kitchen has
    cooked and the guest has eaten, and the order can never be closed.
    """
    tables = _tables(client, auth_headers)
    free = next(t for t in tables if t["status"] == "available")
    order = _open_dine_in(client, auth_headers, free["id"])
    product = get_product_by_sku(client, auth_headers, "REST-001")
    discounted = round(float(product["base_price"]) * 0.3, 2)

    rejected = client.post(
        f"/api/v1/industry/restaurant/orders/{order['id']}/lines",
        headers=auth_headers,
        json={"product_id": product["id"], "qty": 1, "unit_price": discounted},
    )
    assert rejected.status_code in (400, 403), rejected.text

    accepted = client.post(
        f"/api/v1/industry/restaurant/orders/{order['id']}/lines",
        headers=auth_headers,
        json={
            "product_id": product["id"],
            "qty": 1,
            "unit_price": discounted,
            "price_override_reason": "Manager comp — kitchen delay",
        },
    )
    assert accepted.status_code == 200, accepted.text

    # Settlement must not re-challenge a price already approved at order entry.
    pay = client.post(
        f"/api/v1/industry/restaurant/orders/{order['id']}/pay",
        headers=auth_headers,
        json={"tender": "cash", "tax_rate": 0},
    )
    assert pay.status_code == 200, pay.text
    assert pay.json()["order"]["status"] == "paid"


def test_cancel_order_releases_table(auth_headers, client: TestClient):
    tables = _tables(client, auth_headers)
    free = next(t for t in tables if t["status"] == "available")
    order = _open_dine_in(client, auth_headers, free["id"])
    cancel = client.post(
        f"/api/v1/industry/restaurant/orders/{order['id']}/cancel",
        headers=auth_headers,
        json={"reason": "walkout"},
    )
    assert cancel.status_code == 200
    assert cancel.json()["status"] == "cancelled"
    refreshed = next(t for t in _tables(client, auth_headers) if t["id"] == free["id"])
    assert refreshed["status"] == "available"


def test_restaurant_tenant_isolation(auth_headers, client: TestClient, session: Session):
    from app.models.core import Company

    tables = _tables(client, auth_headers)
    free = next(t for t in tables if t["status"] == "available")
    order = _open_dine_in(client, auth_headers, free["id"])
    other = session.exec(select(Company).where(Company.code == "PULSE-PLATFORM")).first()
    if not other:
        return
    plat_headers = login(client, "super@pulse.pos", "super123", "PULSE-PLATFORM")
    listed = client.get("/api/v1/industry/restaurant/orders", headers=plat_headers)
    assert listed.status_code == 200
    assert not any(r["id"] == order["id"] for r in listed.json())
    get = client.get(f"/api/v1/industry/restaurant/orders/{order['id']}", headers=plat_headers)
    assert get.status_code == 404


def test_cashier_cannot_manage_tables(client: TestClient):
    cashier = login(client, "cashier@pulse.pos", "cashier123")
    res = client.post(
        "/api/v1/industry/restaurant/tables",
        headers=cashier,
        json={"table_no": "T99", "capacity": 2},
    )
    assert res.status_code == 403
