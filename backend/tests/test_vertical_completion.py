"""Phase 7 vertical completion — pilot pack back-office APIs."""

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.industry import ElectronicsSerialStock
from test_operations import get_product_by_sku


def test_beef_cuts_list(auth_headers, client: TestClient):
    res = client.get("/api/v1/industry/beef/cuts", headers=auth_headers)
    assert res.status_code == 200
    assert len(res.json()) >= 1


def test_beef_wastage_list_and_create(auth_headers, client: TestClient):
    batches = client.get("/api/v1/industry/beef/batches", headers=auth_headers).json()
    batch_id = batches[0]["id"] if batches else None
    create = client.post(
        "/api/v1/industry/beef/wastage",
        headers=auth_headers,
        json={"batch_id": batch_id, "wastage_type": "trim", "wastage_kg": 0.25, "reason": "Test"},
    )
    assert create.status_code == 200
    listed = client.get("/api/v1/industry/beef/wastage", headers=auth_headers)
    assert listed.status_code == 200
    assert len(listed.json()) >= 1


def test_pharma_batches_all(auth_headers, client: TestClient):
    res = client.get("/api/v1/industry/pharmacy/batches", headers=auth_headers)
    assert res.status_code == 200
    rows = res.json()
    assert len(rows) >= 1
    assert "batch_no" in rows[0]


def test_fashion_offers(auth_headers, client: TestClient):
    res = client.get("/api/v1/industry/fashion/offers", headers=auth_headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_restaurant_tables_and_kots(auth_headers, client: TestClient):
    tables = client.get("/api/v1/industry/restaurant/tables", headers=auth_headers)
    assert tables.status_code == 200
    assert len(tables.json()) >= 1
    assert "table_no" in tables.json()[0]
    free = next(t for t in tables.json() if t["status"] == "available")
    store_id = free["store_id"]
    order = client.post(
        "/api/v1/industry/restaurant/orders",
        headers=auth_headers,
        json={"service_mode": "dine_in", "table_id": free["id"], "guest_count": 2, "store_id": store_id},
    )
    assert order.status_code == 200, order.text
    product = client.get("/api/v1/products", headers=auth_headers, params={"q": "REST-001"}).json()["items"]
    rest = next(p for p in product if p["sku"] == "REST-001")
    client.post(
        f"/api/v1/industry/restaurant/orders/{order.json()['id']}/lines",
        headers=auth_headers,
        json={"product_id": rest["id"], "qty": 1},
    )
    kot = client.post(
        f"/api/v1/industry/restaurant/orders/{order.json()['id']}/send-kot",
        headers=auth_headers,
        json={},
    )
    assert kot.status_code == 200, kot.text
    kots = client.get("/api/v1/industry/restaurant/kots", headers=auth_headers)
    assert kots.status_code == 200
    assert any(k.get("order_id") == order.json()["id"] for k in kots.json())


def test_electronics_rma_create(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "ELEC-001")
    company_id = session.exec(select(ElectronicsSerialStock).limit(1)).first().company_id
    serial = "12345678901234"
    row = ElectronicsSerialStock(
        company_id=company_id,
        product_id=product["id"],
        serial_imei=serial,
        status="sold",
    )
    session.add(row)
    session.commit()
    res = client.post(
        "/api/v1/industry/electronics/rma",
        headers=auth_headers,
        json={
            "serial_imei": serial,
            "customer_name": "Test User",
            "product_name": product["name"],
            "product_id": product["id"],
            "problem_description": "Does not power on",
            "action_type": "return",
        },
    )
    assert res.status_code == 200, res.text
    listed = client.get("/api/v1/industry/electronics/rma", headers=auth_headers)
    assert listed.status_code == 200
    assert any(r["serial_imei"] == serial for r in listed.json())


def test_jewelry_gold_rate(auth_headers, client: TestClient):
    res = client.get("/api/v1/industry/jewelry/gold-rate", headers=auth_headers)
    assert res.status_code == 200
    assert "rate_per_gram" in res.json()
