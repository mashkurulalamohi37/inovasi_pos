"""Phase 7 — Live catalog import, offer CRUD, fashion CI marker."""

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.industry import FashionOffer
from app.models.product import Customer, Product, Supplier


def test_import_status_all_live(auth_headers, client: TestClient):
    res = client.get("/api/v1/import/status", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["mode"] == "live"
    assert "products" in body["live_modules"]
    assert "suppliers" in body["live_modules"]
    assert "customers" in body["live_modules"]
    assert "opening_stock" in body["live_modules"]
    assert "fashion_variants" in body["live_modules"]
    assert body["stub_modules"] == []


def test_import_products_fashion_and_upsert(auth_headers, client: TestClient, session: Session):
    sku = f"FASH-P7-{uuid.uuid4().hex[:6].upper()}"
    create = client.post(
        "/api/v1/import/products",
        headers=auth_headers,
        json={
            "dry_run": False,
            "rows": [
                {
                    "data": {
                        "sku": sku,
                        "name": "Phase7 Tee",
                        "industry_pack": "fashion",
                        "base_price": 1290,
                        "barcode": f"BC{sku}",
                    }
                }
            ],
        },
    )
    assert create.status_code == 200, create.text
    assert create.json()["rows_imported"] == 1
    product = session.exec(select(Product).where(Product.sku == sku)).first()
    assert product is not None
    assert product.industry_pack == "fashion"
    assert product.meta_json and "style_code" in product.meta_json

    update = client.post(
        "/api/v1/import/products",
        headers=auth_headers,
        json={
            "rows": [{"data": {"sku": sku, "name": "Phase7 Tee Updated", "industry_pack": "fashion", "base_price": 1390}}],
        },
    )
    assert update.status_code == 200, update.text
    assert update.json()["rows_updated"] == 1
    session.expire_all()
    product2 = session.exec(select(Product).where(Product.sku == sku)).first()
    assert product2 is not None
    assert product2.name == "Phase7 Tee Updated"
    assert product2.base_price == 1390


def test_import_suppliers_and_customers(auth_headers, client: TestClient, session: Session):
    sup_code = f"SUP-P7-{uuid.uuid4().hex[:6].upper()}"
    cust_code = f"CUST-P7-{uuid.uuid4().hex[:6].upper()}"
    suppliers = client.post(
        "/api/v1/import/suppliers",
        headers=auth_headers,
        json={
            "rows": [
                {
                    "data": {
                        "code": sup_code,
                        "name": "Fashion Mill Co",
                        "contact_phone": "01700009999",
                        "contact_email": "mill@example.com",
                        "address": "Dhaka",
                    }
                }
            ],
        },
    )
    assert suppliers.status_code == 200, suppliers.text
    assert suppliers.json()["rows_imported"] == 1
    assert session.exec(select(Supplier).where(Supplier.code == sup_code)).first() is not None

    customers = client.post(
        "/api/v1/import/customers",
        headers=auth_headers,
        json={
            "rows": [
                {
                    "data": {
                        "code": cust_code,
                        "name": "Boutique Walk-in",
                        "phone": "01711009999",
                        "loyalty_tier": "gold",
                    }
                }
            ],
        },
    )
    assert customers.status_code == 200, customers.text
    assert customers.json()["rows_imported"] == 1
    cust = session.exec(select(Customer).where(Customer.code == cust_code)).first()
    assert cust is not None
    assert cust.customer_group == "gold"


def test_import_products_dry_run_no_persist(auth_headers, client: TestClient, session: Session):
    sku = f"FASH-DRY-{uuid.uuid4().hex[:6].upper()}"
    res = client.post(
        "/api/v1/import/products",
        headers=auth_headers,
        json={
            "dry_run": True,
            "rows": [{"data": {"sku": sku, "name": "Dry", "industry_pack": "fashion", "base_price": 100}}],
        },
    )
    assert res.status_code == 200
    assert res.json()["rows_imported"] == 0
    assert res.json()["rows_valid"] == 1
    assert session.exec(select(Product).where(Product.sku == sku)).first() is None


def test_fashion_offer_crud(auth_headers, client: TestClient, session: Session):
    created = client.post(
        "/api/v1/industry/fashion/offers",
        headers=auth_headers,
        json={"name": "Phase7 Flash", "season": "SS26", "department": "Women", "discount_pct": 15},
    )
    assert created.status_code == 200, created.text
    offer_id = created.json()["id"]
    assert created.json()["discount_pct"] == 15

    patched = client.patch(
        f"/api/v1/industry/fashion/offers/{offer_id}",
        headers=auth_headers,
        json={"is_active": False, "discount_pct": 20},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["is_active"] is False
    assert patched.json()["discount_pct"] == 20

    active_only = client.get("/api/v1/industry/fashion/offers", headers=auth_headers)
    assert active_only.status_code == 200
    assert all(o["id"] != offer_id for o in active_only.json())

    with_inactive = client.get(
        "/api/v1/industry/fashion/offers",
        headers=auth_headers,
        params={"include_inactive": True},
    )
    assert with_inactive.status_code == 200
    assert any(o["id"] == offer_id for o in with_inactive.json())

    row = session.get(FashionOffer, offer_id)
    assert row is not None
    assert row.is_active is False


def test_fashion_offer_bygo_validation(auth_headers, client: TestClient):
    missing_qty = client.post(
        "/api/v1/industry/fashion/offers",
        headers=auth_headers,
        json={"name": "Buy 2 Get 1", "offer_type": "bygo", "get_qty": 1, "get_discount_pct": 100},
    )
    assert missing_qty.status_code == 400

    bad_pct = client.post(
        "/api/v1/industry/fashion/offers",
        headers=auth_headers,
        json={"name": "Buy 2 Get 1", "offer_type": "bygo", "buy_qty": 2, "get_qty": 1, "get_discount_pct": 150},
    )
    assert bad_pct.status_code == 400

    ok = client.post(
        "/api/v1/industry/fashion/offers",
        headers=auth_headers,
        json={"name": "Buy 2 Get 1 Free", "offer_type": "bygo", "buy_qty": 2, "get_qty": 1, "get_discount_pct": 100, "stackable": True},
    )
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["offer_type"] == "bygo"
    assert body["buy_qty"] == 2
    assert body["stackable"] is True


def test_fashion_offer_preview_bygo_discounts_cheapest_units(auth_headers, client: TestClient):
    offer = client.post(
        "/api/v1/industry/fashion/offers",
        headers=auth_headers,
        json={"name": "Buy 2 Get 1 Free", "offer_type": "bygo", "buy_qty": 2, "get_qty": 1, "get_discount_pct": 100},
    ).json()

    # 3 units at prices 500, 800, 1000 -> one complete group of 3 (buy 2 get 1) ->
    # the cheapest unit (500) is free.
    res = client.post(
        "/api/v1/industry/fashion/offers/preview",
        headers=auth_headers,
        json={
            "offer_ids": [offer["id"]],
            "lines_by_offer": {
                offer["id"]: [
                    {"qty": 1, "unit_price": 500},
                    {"qty": 1, "unit_price": 800},
                    {"qty": 1, "unit_price": 1000},
                ]
            },
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total_discount"] == 500.0
    assert body["offers"][0]["discount_amount"] == 500.0

    # Only 2 units -> group of 3 never completes -> no discount.
    short = client.post(
        "/api/v1/industry/fashion/offers/preview",
        headers=auth_headers,
        json={
            "offer_ids": [offer["id"]],
            "lines_by_offer": {offer["id"]: [{"qty": 1, "unit_price": 500}, {"qty": 1, "unit_price": 800}]},
        },
    )
    assert short.status_code == 200
    assert short.json()["total_discount"] == 0.0


def test_fashion_offer_preview_stacking_rules(auth_headers, client: TestClient):
    stackable_a = client.post(
        "/api/v1/industry/fashion/offers",
        headers=auth_headers,
        json={"name": "Stackable A", "discount_pct": 10, "stackable": True},
    ).json()
    stackable_b = client.post(
        "/api/v1/industry/fashion/offers",
        headers=auth_headers,
        json={"name": "Stackable B", "discount_pct": 5, "stackable": True},
    ).json()
    exclusive = client.post(
        "/api/v1/industry/fashion/offers",
        headers=auth_headers,
        json={"name": "Exclusive Deal", "discount_pct": 20, "stackable": False},
    ).json()

    lines = [{"qty": 1, "unit_price": 1000}]

    combined = client.post(
        "/api/v1/industry/fashion/offers/preview",
        headers=auth_headers,
        json={
            "offer_ids": [stackable_a["id"], stackable_b["id"]],
            "lines_by_offer": {stackable_a["id"]: lines, stackable_b["id"]: lines},
        },
    )
    assert combined.status_code == 200, combined.text
    assert combined.json()["total_discount"] == 150.0  # 10% + 5% of 1000

    rejected = client.post(
        "/api/v1/industry/fashion/offers/preview",
        headers=auth_headers,
        json={
            "offer_ids": [stackable_a["id"], exclusive["id"]],
            "lines_by_offer": {stackable_a["id"]: lines, exclusive["id"]: lines},
        },
    )
    assert rejected.status_code == 400
    assert "non-stackable" in rejected.json()["detail"].lower()

    alone = client.post(
        "/api/v1/industry/fashion/offers/preview",
        headers=auth_headers,
        json={"offer_ids": [exclusive["id"]], "lines_by_offer": {exclusive["id"]: lines}},
    )
    assert alone.status_code == 200
    assert alone.json()["total_discount"] == 200.0
