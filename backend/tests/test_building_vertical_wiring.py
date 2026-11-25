"""Phase 6B-11 — Building Materials vertical wiring tests."""

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.inventory import StockBalance
from tests.test_operations import (
    _store_id,
    get_product_by_sku,
    login,
)


def _units(client: TestClient, headers: dict) -> dict[str, str]:
    res = client.get("/api/v1/units", headers=headers)
    assert res.status_code == 200, res.text
    return {u["code"]: u["id"] for u in res.json()}


def _contractor(client: TestClient, headers: dict) -> dict:
    res = client.get("/api/v1/industry/building/contractors", headers=headers, params={"q": "Karim"})
    assert res.status_code == 200, res.text
    hit = next((c for c in res.json() if c.get("code") == "CUS-003"), None)
    assert hit is not None
    return hit


def _create_confirmed_order(
    client: TestClient,
    headers: dict,
    *,
    product: dict,
    units: dict[str, str],
    contractor: dict,
    entered_qty: float = 10,
    site_id: str | None = None,
) -> dict:
    store_id = _store_id(client, headers)
    body = {
        "store_id": store_id,
        "customer_id": contractor["id"],
        "site_id": site_id,
        "lines": [
            {
                "product_id": product["id"],
                "entered_qty": entered_qty,
                "sales_uom_id": units["BAG"],
            }
        ],
    }
    created = client.post("/api/v1/industry/building/orders", headers=headers, json=body)
    assert created.status_code == 200, created.text
    order = created.json()
    confirmed = client.post(
        f"/api/v1/industry/building/orders/{order['id']}/confirm",
        headers=headers,
        json={"allow_due": True},
    )
    assert confirmed.status_code == 200, confirmed.text
    return confirmed.json()


def test_building_profiles_list(auth_headers, client: TestClient):
    listed = client.get("/api/v1/industry/building/profiles", headers=auth_headers)
    assert listed.status_code == 200, listed.text
    assert any(p.get("sku") == "BM-CEMENT" for p in listed.json())

    product = get_product_by_sku(client, auth_headers, "BM-CEMENT")
    ok = client.post(
        "/api/v1/industry/building/profiles",
        headers=auth_headers,
        json={"product_id": product["id"], "grade": "53 Grade Premium"},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["grade"] == "53 Grade Premium"


def test_building_site_create_tenant_isolation(auth_headers, client: TestClient):
    contractor = _contractor(client, auth_headers)
    created = client.post(
        "/api/v1/industry/building/sites",
        headers=auth_headers,
        json={
            "customer_id": contractor["id"],
            "site_code": "SITE-TEST-01",
            "site_name": "Test Tower",
            "address": "Test Road, Dhaka",
        },
    )
    assert created.status_code == 200, created.text
    site_id = created.json()["id"]

    other = login(client, "admin@pulse.pos", "admin123")
    denied = client.get(f"/api/v1/industry/building/orders", headers=other)
    assert denied.status_code == 200
    listed = client.get("/api/v1/industry/building/sites", headers=auth_headers)
    assert listed.status_code == 200
    assert any(s["id"] == site_id for s in listed.json())


def test_building_order_confirm(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "BM-CEMENT")
    units = _units(client, auth_headers)
    contractor = _contractor(client, auth_headers)
    order = _create_confirmed_order(
        client, auth_headers, product=product, units=units, contractor=contractor, entered_qty=5
    )
    assert order["status"] == "confirmed"
    assert order["sales_invoice_id"]
    assert float(order["total"]) > 0


def test_building_partial_delivery(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "BM-CEMENT")
    units = _units(client, auth_headers)
    contractor = _contractor(client, auth_headers)
    order = _create_confirmed_order(
        client, auth_headers, product=product, units=units, contractor=contractor, entered_qty=10
    )
    line_id = order["lines"][0]["id"]

    delivery = client.post(
        "/api/v1/industry/building/deliveries",
        headers=auth_headers,
        json={
            "order_id": order["id"],
            "lines": [{"order_line_id": line_id, "planned_qty": 4}],
        },
    )
    assert delivery.status_code == 200, delivery.text
    dlv_id = delivery.json()["id"]

    disp = client.post(f"/api/v1/industry/building/deliveries/{dlv_id}/dispatch", headers=auth_headers, json={})
    assert disp.status_code == 200, disp.text

    conf = client.post(f"/api/v1/industry/building/deliveries/{dlv_id}/confirm", headers=auth_headers, json={})
    assert conf.status_code == 200, conf.text

    refreshed = client.get(f"/api/v1/industry/building/orders/{order['id']}", headers=auth_headers)
    assert refreshed.status_code == 200
    body = refreshed.json()
    assert body["status"] in {"partially_delivered", "partially_dispatched"}
    line = body["lines"][0]
    assert float(line["delivered_base_qty"]) == 200  # 4 bags × 50 kg


def test_building_over_delivery_rejected(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "BM-CEMENT")
    units = _units(client, auth_headers)
    contractor = _contractor(client, auth_headers)
    order = _create_confirmed_order(
        client, auth_headers, product=product, units=units, contractor=contractor, entered_qty=2
    )
    line_id = order["lines"][0]["id"]

    over = client.post(
        "/api/v1/industry/building/deliveries",
        headers=auth_headers,
        json={
            "order_id": order["id"],
            "lines": [{"order_line_id": line_id, "planned_qty": 99}],
        },
    )
    assert over.status_code == 400


def test_building_dispatch_stock_out_exact_base(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "BM-CEMENT")
    units = _units(client, auth_headers)
    contractor = _contractor(client, auth_headers)
    store_id = _store_id(client, auth_headers)

    bal_before = session.exec(
        select(StockBalance).where(
            StockBalance.product_id == product["id"],
            StockBalance.store_id == store_id,
        )
    ).first()
    qty_before = float(bal_before.qty_on_hand) if bal_before else 0

    order = _create_confirmed_order(
        client, auth_headers, product=product, units=units, contractor=contractor, entered_qty=3
    )
    line_id = order["lines"][0]["id"]
    base_out = float(order["lines"][0]["base_qty"])

    delivery = client.post(
        "/api/v1/industry/building/deliveries",
        headers=auth_headers,
        json={
            "order_id": order["id"],
            "lines": [{"order_line_id": line_id, "planned_qty": 3}],
        },
    )
    assert delivery.status_code == 200, delivery.text
    dlv_id = delivery.json()["id"]

    disp = client.post(f"/api/v1/industry/building/deliveries/{dlv_id}/dispatch", headers=auth_headers, json={})
    assert disp.status_code == 200, disp.text

    session.expire_all()
    bal_after = session.exec(
        select(StockBalance).where(
            StockBalance.product_id == product["id"],
            StockBalance.store_id == store_id,
        )
    ).first()
    assert bal_after is not None
    assert float(bal_after.qty_on_hand) == qty_before - base_out


def test_building_duplicate_dispatch_idempotent(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "BM-CEMENT")
    units = _units(client, auth_headers)
    contractor = _contractor(client, auth_headers)
    store_id = _store_id(client, auth_headers)

    order = _create_confirmed_order(
        client, auth_headers, product=product, units=units, contractor=contractor, entered_qty=1
    )
    line_id = order["lines"][0]["id"]

    delivery = client.post(
        "/api/v1/industry/building/deliveries",
        headers=auth_headers,
        json={
            "order_id": order["id"],
            "lines": [{"order_line_id": line_id, "planned_qty": 1}],
        },
    )
    assert delivery.status_code == 200, delivery.text
    dlv_id = delivery.json()["id"]

    first = client.post(f"/api/v1/industry/building/deliveries/{dlv_id}/dispatch", headers=auth_headers, json={})
    assert first.status_code == 200, first.text

    bal_mid = session.exec(
        select(StockBalance).where(
            StockBalance.product_id == product["id"],
            StockBalance.store_id == store_id,
        )
    ).first()
    mid = float(bal_mid.qty_on_hand)

    second = client.post(f"/api/v1/industry/building/deliveries/{dlv_id}/dispatch", headers=auth_headers, json={})
    assert second.status_code == 200, second.text
    assert second.json()["stock_posted"] is True

    session.expire_all()
    bal_end = session.exec(
        select(StockBalance).where(
            StockBalance.product_id == product["id"],
            StockBalance.store_id == store_id,
        )
    ).first()
    assert float(bal_end.qty_on_hand) == mid


def test_building_rbac_denial(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "BM-CEMENT")
    cashier = login(client, "cashier@pulse.pos", "cashier123")
    denied = client.post(
        "/api/v1/industry/building/profiles",
        headers=cashier,
        json={"product_id": product["id"], "grade": "X"},
    )
    assert denied.status_code == 403


def test_building_quote_uom(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "BM-CEMENT")
    units = _units(client, auth_headers)
    contractor = _contractor(client, auth_headers)

    quote = client.post(
        "/api/v1/industry/building/quote",
        headers=auth_headers,
        json={
            "product_id": product["id"],
            "entered_qty": 2,
            "sales_uom_id": units["BAG"],
            "customer_id": contractor["id"],
        },
    )
    assert quote.status_code == 200, quote.text
    body = quote.json()
    assert body["base_qty"] == 100
    assert body["conversion_factor"] == 50
    assert body["price_source"] in {"CUSTOMER_PRICE", "CONTRACTOR_TIER", "STANDARD", "BULK_TIER"}
