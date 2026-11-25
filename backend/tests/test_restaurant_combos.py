"""Restaurant combo meals — build, sell, route to kitchen, and bill."""

from fastapi.testclient import TestClient

from tests.test_operations import _store_id, login


BASE = "/api/v1/industry/restaurant"


def _menu(client, headers):
    res = client.get("/api/v1/products?industry=restaurant&limit=250", headers=headers)
    if res.status_code != 200:
        res = client.get("/api/v1/products?limit=250", headers=headers)
    assert res.status_code == 200, res.text
    body = res.json()
    return body["items"] if isinstance(body, dict) else body


def _two_products(client, headers):
    items = [p for p in _menu(client, headers) if p.get("is_active") is not False]
    assert len(items) >= 2, "need at least two products to build a combo"
    return items[0], items[1]


def _make_combo(client, headers, name, price, products):
    return client.post(
        f"{BASE}/combos",
        headers=headers,
        json={
            "name": name,
            "combo_price": price,
            "items": [
                {"product_id": p["id"], "item_role": role}
                for p, role in zip(products, ["main", "side", "drink", "addon"])
            ],
        },
    )


def _open_order(client, headers):
    tables = client.get(f"{BASE}/tables", headers=headers).json()
    free = next(t for t in tables if t["status"] == "available")
    res = client.post(
        f"{BASE}/orders",
        headers=headers,
        json={
            "service_mode": "dine_in",
            "table_id": free["id"],
            "guest_count": 2,
            "store_id": _store_id(client, headers),
        },
    )
    assert res.status_code == 200, res.text
    return res.json()


# --- CRUD -----------------------------------------------------------------


def test_create_list_update_delete_combo(auth_headers, client: TestClient):
    a, b = _two_products(client, auth_headers)
    res = _make_combo(client, auth_headers, "Test Lunch Combo", 99.0, [a, b])
    assert res.status_code == 200, res.text
    combo = res.json()
    assert combo["name"] == "Test Lunch Combo"
    assert combo["combo_price"] == 99.0
    assert len(combo["items"]) == 2
    assert {i["item_role"] for i in combo["items"]} == {"main", "side"}
    # savings is reported against the sum of component menu prices
    assert combo["savings"] == round(combo["components_total"] - 99.0, 2)

    listed = client.get(f"{BASE}/combos", headers=auth_headers).json()
    assert any(c["id"] == combo["id"] for c in listed)

    res = client.patch(
        f"{BASE}/combos/{combo['id']}",
        headers=auth_headers,
        json={
            "name": "Renamed Combo",
            "combo_price": 120.0,
            "items": [
                {"product_id": a["id"], "item_role": "main"},
                {"product_id": b["id"], "item_role": "drink"},
            ],
        },
    )
    assert res.status_code == 200, res.text
    updated = res.json()
    assert updated["name"] == "Renamed Combo"
    assert updated["combo_price"] == 120.0
    assert {i["item_role"] for i in updated["items"]} == {"main", "drink"}
    # components replaced wholesale, not duplicated
    assert len(updated["items"]) == 2

    res = client.delete(f"{BASE}/combos/{combo['id']}", headers=auth_headers)
    assert res.status_code == 200, res.text
    listed = client.get(f"{BASE}/combos", headers=auth_headers).json()
    assert not any(c["id"] == combo["id"] for c in listed)


def test_combo_validation_rejects_bad_input(auth_headers, client: TestClient):
    a, b = _two_products(client, auth_headers)

    res = _make_combo(client, auth_headers, "", 50.0, [a, b])
    assert res.status_code == 400

    res = _make_combo(client, auth_headers, "Single Item Combo", 50.0, [a])
    assert res.status_code == 400
    assert "at least 2" in res.json()["detail"]

    res = _make_combo(client, auth_headers, "Free Combo", 0, [a, b])
    assert res.status_code == 400

    res = client.post(
        f"{BASE}/combos",
        headers=auth_headers,
        json={
            "name": "Dupe Combo",
            "combo_price": 50,
            "items": [
                {"product_id": a["id"], "item_role": "main"},
                {"product_id": a["id"], "item_role": "side"},
            ],
        },
    )
    assert res.status_code == 400
    assert "twice" in res.json()["detail"]

    res = client.post(
        f"{BASE}/combos",
        headers=auth_headers,
        json={
            "name": "Bad Role Combo",
            "combo_price": 50,
            "items": [
                {"product_id": a["id"], "item_role": "dessert"},
                {"product_id": b["id"], "item_role": "side"},
            ],
        },
    )
    assert res.status_code == 400
    assert "item_role" in res.json()["detail"]


def test_duplicate_combo_name_rejected(auth_headers, client: TestClient):
    a, b = _two_products(client, auth_headers)
    first = _make_combo(client, auth_headers, "Unique Combo Name", 75.0, [a, b])
    assert first.status_code == 200
    again = _make_combo(client, auth_headers, "Unique Combo Name", 80.0, [a, b])
    assert again.status_code == 400
    assert "already exists" in again.json()["detail"]
    client.delete(f"{BASE}/combos/{first.json()['id']}", headers=auth_headers)


# --- Selling --------------------------------------------------------------


def test_combo_price_is_split_exactly_across_components(auth_headers, client: TestClient):
    a, b = _two_products(client, auth_headers)
    combo = _make_combo(client, auth_headers, "Split Combo", 101.0, [a, b]).json()
    order = _open_order(client, auth_headers)

    res = client.post(
        f"{BASE}/orders/{order['id']}/combo",
        headers=auth_headers,
        json={"combo_id": combo["id"], "qty": 1},
    )
    assert res.status_code == 200, res.text
    updated = res.json()

    combo_lines = [l for l in updated["lines"] if l.get("combo_name") == "Split Combo"]
    assert len(combo_lines) == 2
    # every component shares one group id
    assert len({l["combo_group_id"] for l in combo_lines}) == 1
    # and the parts add back up to the combo price, to the paisa
    assert round(sum(l["line_total"] for l in combo_lines), 2) == 101.0
    assert updated["subtotal"] == 101.0


def test_combo_qty_multiplies_price(auth_headers, client: TestClient):
    a, b = _two_products(client, auth_headers)
    combo = _make_combo(client, auth_headers, "Qty Combo", 60.0, [a, b]).json()
    order = _open_order(client, auth_headers)
    res = client.post(
        f"{BASE}/orders/{order['id']}/combo",
        headers=auth_headers,
        json={"combo_id": combo["id"], "qty": 3},
    )
    assert res.status_code == 200, res.text
    assert res.json()["subtotal"] == 180.0


def test_combo_components_reach_the_kitchen(auth_headers, client: TestClient):
    a, b = _two_products(client, auth_headers)
    combo = _make_combo(client, auth_headers, "Kitchen Combo", 90.0, [a, b]).json()
    order = _open_order(client, auth_headers)
    client.post(
        f"{BASE}/orders/{order['id']}/combo",
        headers=auth_headers,
        json={"combo_id": combo["id"], "qty": 1},
    )
    res = client.post(f"{BASE}/orders/{order['id']}/send-kot", headers=auth_headers, json={})
    assert res.status_code == 200, res.text
    kots = res.json()["kots"]
    sent_names = {line["product_name"] for kot in kots for line in kot["lines"]}
    # both components are cooked, not just a single bundled "combo" row
    assert {a["name"], b["name"]} <= sent_names
    # and each component is routed by its own station, so a combo spanning the
    # grill and the kitchen produces a ticket for each
    stations = {kot["kitchen_station"] for kot in kots}
    expected = {(l["kitchen_station"] or "main") for l in
                client.get(f"{BASE}/orders/{order['id']}", headers=auth_headers).json()["lines"]}
    assert stations == expected


def test_combo_can_be_billed_and_paid(auth_headers, client: TestClient):
    a, b = _two_products(client, auth_headers)
    combo = _make_combo(client, auth_headers, "Payable Combo", 100.0, [a, b]).json()
    order = _open_order(client, auth_headers)
    client.post(
        f"{BASE}/orders/{order['id']}/combo",
        headers=auth_headers,
        json={"combo_id": combo["id"], "qty": 1},
    )
    # Settlement recomputes the bill with tax/service on top of the combo price,
    # so let the backend tender the full amount rather than paying the pre-tax
    # order total.
    res = client.post(
        f"{BASE}/orders/{order['id']}/pay",
        headers=auth_headers,
        json={"tender": "cash", "tax_rate": 0, "service_charge": 0},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["order"]["status"] == "paid"
    assert body["invoice"]["id"]
    # the combo price is what actually gets invoiced — no component leaks in at
    # its full menu price
    assert body["order"]["subtotal"] == 100.0
    assert body["invoice"]["total"] == 100.0


def test_voiding_a_combo_removes_every_component(auth_headers, client: TestClient):
    a, b = _two_products(client, auth_headers)
    combo = _make_combo(client, auth_headers, "Void Combo", 88.0, [a, b]).json()
    order = _open_order(client, auth_headers)
    added = client.post(
        f"{BASE}/orders/{order['id']}/combo",
        headers=auth_headers,
        json={"combo_id": combo["id"], "qty": 1},
    ).json()
    group_id = next(l["combo_group_id"] for l in added["lines"] if l.get("combo_group_id"))
    assert added["subtotal"] == 88.0

    res = client.post(
        f"{BASE}/orders/{order['id']}/combo/{group_id}/void",
        headers=auth_headers,
        json={"reason": "guest changed mind"},
    )
    assert res.status_code == 200, res.text
    voided = res.json()
    group_lines = [l for l in voided["lines"] if l.get("combo_group_id") == group_id]
    # the whole bundle goes, never a half-priced remnant
    assert all(l["status"] == "cancelled" for l in group_lines)
    assert voided["subtotal"] == 0


def test_add_combo_rejects_unknown_combo(auth_headers, client: TestClient):
    order = _open_order(client, auth_headers)
    res = client.post(
        f"{BASE}/orders/{order['id']}/combo",
        headers=auth_headers,
        json={"combo_id": "does-not-exist"},
    )
    assert res.status_code == 404


def test_cashier_can_sell_but_not_create_combos(auth_headers, client: TestClient):
    """Selling is order_manage; building the menu is combo_manage."""
    a, b = _two_products(client, auth_headers)
    combo = _make_combo(client, auth_headers, "Perms Combo", 70.0, [a, b])
    assert combo.status_code == 200

    cashier = login(client, "cashier@pulse.pos", "cashier123")
    res = client.post(
        f"{BASE}/combos",
        headers=cashier,
        json={
            "name": "Cashier Combo",
            "combo_price": 50,
            "items": [
                {"product_id": a["id"], "item_role": "main"},
                {"product_id": b["id"], "item_role": "side"},
            ],
        },
    )
    assert res.status_code == 403

    order = _open_order(client, cashier)
    sold = client.post(
        f"{BASE}/orders/{order['id']}/combo",
        headers=cashier,
        json={"combo_id": combo.json()["id"], "qty": 1},
    )
    assert sold.status_code == 200, sold.text
