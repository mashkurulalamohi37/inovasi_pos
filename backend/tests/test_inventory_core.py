"""Phase 2 inventory core: reservations, negative stock policy, transfers."""

from fastapi.testclient import TestClient


def _product(client: TestClient, headers: dict[str, str], sku: str = "GROC-001") -> dict:
    res = client.get("/api/v1/products", headers=headers, params={"q": sku})
    assert res.status_code == 200
    match = next(p for p in res.json()["items"] if p["sku"] == sku)
    return match


def _store_id(client: TestClient, headers: dict[str, str]) -> str:
    me = client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200
    return me.json()["store_id"]


def _total_on_hand(client: TestClient, headers: dict[str, str], product_id: str, store_id: str) -> float:
    res = client.get("/api/v1/inventory/stock", headers=headers, params={"store_id": store_id})
    assert res.status_code == 200
    return sum(r["qty_on_hand"] for r in res.json() if r["product_id"] == product_id)


def test_stock_list_includes_reserved_fields(auth_headers, client):
    product = _product(client, auth_headers)
    store_id = _store_id(client, auth_headers)
    res = client.get("/api/v1/inventory/stock", headers=auth_headers, params={"store_id": store_id})
    assert res.status_code == 200
    row = next(r for r in res.json() if r["product_id"] == product["id"])
    assert "qty_reserved" in row
    assert "qty_available" in row
    assert row["qty_available"] == row["qty_on_hand"] - row["qty_reserved"]


def test_inventory_policy_defaults(auth_headers, client):
    res = client.get("/api/v1/inventory/policy", headers=auth_headers)
    assert res.status_code == 200
    assert len(res.json()) >= 1
    assert res.json()[0]["allow_negative_stock"] is False


def test_reservation_hold_and_release(auth_headers, client):
    product = _product(client, auth_headers)
    store_id = _store_id(client, auth_headers)
    before_available = _total_on_hand(client, auth_headers, product["id"], store_id)

    create = client.post(
        "/api/v1/inventory/reservations",
        headers=auth_headers,
        json={"product_id": product["id"], "store_id": store_id, "qty": 5, "reference_type": "test"},
    )
    assert create.status_code == 200
    res_id = create.json()["id"]

    stock = client.get("/api/v1/inventory/stock", headers=auth_headers, params={"store_id": store_id})
    row = next(r for r in stock.json() if r["product_id"] == product["id"])
    assert row["qty_reserved"] >= 5
    assert row["qty_available"] <= before_available - 5

    release = client.post(f"/api/v1/inventory/reservations/{res_id}/release", headers=auth_headers)
    assert release.status_code == 200
    assert release.json()["status"] == "released"

    stock2 = client.get("/api/v1/inventory/stock", headers=auth_headers, params={"store_id": store_id})
    row2 = next(r for r in stock2.json() if r["product_id"] == product["id"])
    assert row2["qty_reserved"] < row["qty_reserved"]


def test_negative_stock_blocked_on_sale(auth_headers, client):
    product = _product(client, auth_headers)
    store_id = _store_id(client, auth_headers)
    on_hand = _total_on_hand(client, auth_headers, product["id"], store_id)

    res = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json={
            "client_transaction_id": "inv-core-oversell-001",
            "industry_pack": "grocery",
            "store_id": store_id,
            "lines": [
                {
                    "product_id": product["id"],
                    "sku": product["sku"],
                    "name": product["name"],
                    "qty": on_hand + 1000,
                    "unit_price": product["base_price"],
                }
            ],
            "subtotal": product["base_price"] * (on_hand + 1000),
            "tax": 0,
            "total": product["base_price"] * (on_hand + 1000),
            "tender": "cash",
        },
    )
    assert res.status_code == 409


def test_stock_transfer_between_stores(auth_headers, client):
    stores = client.get("/api/v1/org/stores", headers=auth_headers)
    assert stores.status_code == 200
    store_ids = [s["id"] for s in stores.json()]
    assert len(store_ids) >= 2
    from_store, to_store = store_ids[0], store_ids[1]

    product = _product(client, auth_headers)
    before_from = _total_on_hand(client, auth_headers, product["id"], from_store)
    before_to = _total_on_hand(client, auth_headers, product["id"], to_store)

    xfer = client.post(
        "/api/v1/inventory/transfer",
        headers=auth_headers,
        json={
            "product_id": product["id"],
            "from_store_id": from_store,
            "to_store_id": to_store,
            "qty": 3,
            "reason": "Phase 2 test transfer",
        },
    )
    assert xfer.status_code == 200

    after_from = _total_on_hand(client, auth_headers, product["id"], from_store)
    after_to = _total_on_hand(client, auth_headers, product["id"], to_store)
    assert after_from == before_from - 3
    assert after_to == before_to + 3
