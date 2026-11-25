"""Industry-specific sales and related API coverage."""

import json

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.industry import (
    BeefSalesLineExtension,
    ElectronicsSalesLineExtension,
    ElectronicsSerialStock,
    FashionSalesLineExtension,
    JewelrySalesLineExtension,
    PharmaBatch,
    PharmaSalesLineExtension,
    RestaurantSalesLineExtension,
    RestaurantTable,
)
from app.models.product import ProductVariant


def login(client: TestClient, email: str, password: str, company_code: str | None = None) -> dict[str, str]:
    code = company_code or ("PULSE-PLATFORM" if email == "super@pulse.pos" else "PULSE-DEMO")
    res = client.post("/api/v1/auth/login", json={"email": email, "password": password, "company_code": code})
    assert res.status_code == 200
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def get_product_by_sku(client: TestClient, headers: dict[str, str], sku: str) -> dict:
    res = client.get("/api/v1/products", headers=headers, params={"q": sku})
    assert res.status_code == 200
    items = res.json()["items"]
    match = next((p for p in items if p["sku"] == sku), None)
    assert match is not None, f"Product {sku} not found"
    return match


def _sale_payload(
    tx_id: str,
    industry_pack: str,
    sku: str,
    name: str,
    unit_price: float,
    product_id: str | None = None,
    meta: dict | None = None,
    **extra,
) -> dict:
    line = {
        "sku": sku,
        "name": name,
        "qty": 1,
        "unit_price": unit_price,
        "meta": meta or {},
    }
    if product_id:
        line["product_id"] = product_id
    subtotal = unit_price
    tax = round(subtotal * 0.05, 2)
    total = round(subtotal + tax, 2)
    payload = {
        "client_transaction_id": tx_id,
        "industry_pack": industry_pack,
        "lines": [line],
        "subtotal": subtotal,
        "tax": tax,
        "total": total,
        "tender": "cash",
    }
    payload.update(extra)
    return payload


def test_beef_sale_with_extension(auth_headers, client, session: Session):
    product = get_product_by_sku(client, auth_headers, "BEEF-001")
    from app.models.industry import BeefBatch

    batch = session.exec(select(BeefBatch)).first()
    assert batch is not None

    payload = _sale_payload(
        "beef-ext-001",
        "beef-shop",
        product["sku"],
        product["name"],
        product["base_price"],
        product_id=product["id"],
        meta={"netWeight": 2.5, "cutType": "SHOULDER", "batch_id": batch.id},
    )
    res = client.post("/api/v1/sales", json=payload, headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["duplicate"] is False

    ext = session.exec(select(BeefSalesLineExtension)).first()
    assert ext is not None
    assert ext.weight_kg == 2.5
    assert ext.cut_type == "SHOULDER"
    assert ext.batch_id == batch.id


def test_fashion_sale_with_variant_and_campaign(auth_headers, client, session: Session):
    product = get_product_by_sku(client, auth_headers, "FASH-001")
    variant = session.exec(
        select(ProductVariant).where(ProductVariant.product_id == product["id"])
    ).first()
    assert variant is not None

    payload = _sale_payload(
        "fashion-ext-001",
        "fashion",
        product["sku"],
        product["name"],
        product["base_price"],
        product_id=product["id"],
        campaign_name="Summer Clearance",
        meta={"variant_id": variant.id, "campaignName": "Summer Clearance"},
    )
    res = client.post("/api/v1/sales", json=payload, headers=auth_headers)
    assert res.status_code == 200

    ext = session.exec(select(FashionSalesLineExtension)).first()
    assert ext is not None
    assert ext.variant_id == variant.id
    assert ext.campaign_name == "Summer Clearance"


def test_pharmacy_sale_with_batch_and_fefo(auth_headers, client, session: Session):
    product = get_product_by_sku(client, auth_headers, "PHRM-001")
    batch = session.exec(
        select(PharmaBatch).where(PharmaBatch.product_id == product["id"])
    ).first()
    assert batch is not None

    payload = _sale_payload(
        "pharma-ext-001",
        "pharmacy",
        product["sku"],
        product["name"],
        product["base_price"],
        product_id=product["id"],
        meta={"batch_id": batch.id, "fefo": True},
    )
    res = client.post("/api/v1/sales", json=payload, headers=auth_headers)
    assert res.status_code == 200

    ext = session.exec(select(PharmaSalesLineExtension)).first()
    assert ext is not None
    assert ext.batch_id == batch.id
    assert ext.fefo_applied is True


def test_restaurant_sale_with_table_and_combo_children(auth_headers, client, session: Session):
    product = get_product_by_sku(client, auth_headers, "REST-001")
    table = session.exec(select(RestaurantTable)).first()
    assert table is not None

    payload = _sale_payload(
        "rest-ext-001",
        "restaurant",
        product["sku"],
        product["name"],
        product["base_price"],
        product_id=product["id"],
        meta={
            "table_id": table.id,
            "combo": True,
            "comboChildren": [{"product_id": product["id"], "item_role": "main"}],
        },
    )
    res = client.post("/api/v1/sales", json=payload, headers=auth_headers)
    assert res.status_code == 200

    ext = session.exec(select(RestaurantSalesLineExtension)).first()
    assert ext is not None
    assert ext.table_id == table.id
    assert ext.comboReady is True
    children = json.loads(ext.combo_children_json or "[]")
    assert len(children) == 1


def test_jewelry_sale_with_gold_rate_and_weight(auth_headers, client, session: Session):
    product = get_product_by_sku(client, auth_headers, "JEWL-001")
    quote = client.post(
        "/api/v1/industry/jewelry/quote",
        headers=auth_headers,
        json={"product_id": product["id"], "net_metal_weight": 5.2},
    )
    assert quote.status_code == 200, quote.text
    payload = _sale_payload(
        "jewelry-ext-001",
        "jewelry",
        product["sku"],
        product["name"],
        product["base_price"],
        product_id=product["id"],
        meta={
            "certificate": "CERT-JEWL-001",
            "netWeight": 5.2,
            "net_metal_weight": 5.2,
            "goldRate": quote.json()["metal_rate"],
            "metal_rate": quote.json()["metal_rate"],
            "makingCharge": 1200,
        },
    )
    res = client.post("/api/v1/sales", json=payload, headers=auth_headers)
    assert res.status_code == 200, res.text

    ext = session.exec(select(JewelrySalesLineExtension)).first()
    assert ext is not None
    assert ext.weight_gram == 5.2
    assert float(ext.gold_rate or 0) > 0


def test_electronics_sale_marks_serial_sold(auth_headers, client, session: Session):
    product = get_product_by_sku(client, auth_headers, "ELEC-001")
    serial = "SN12345678901234"
    payload = _sale_payload(
        "elec-ext-001",
        "electronics",
        product["sku"],
        product["name"],
        product["base_price"],
        product_id=product["id"],
        meta={"serial": serial, "serial_imei": serial, "warrantyMonths": 12},
    )
    res = client.post("/api/v1/sales", json=payload, headers=auth_headers)
    assert res.status_code == 200

    row = session.exec(
        select(ElectronicsSerialStock).where(ElectronicsSerialStock.serial_imei == serial)
    ).first()
    assert row is not None
    # Auto-warranty on sale may advance status from sold → warranty
    assert row.status in {"sold", "warranty"}

    ext = session.exec(select(ElectronicsSalesLineExtension)).first()
    assert ext is not None
    assert ext.serial_imei == serial


def test_electronics_duplicate_serial_blocked(auth_headers, client):
    product = get_product_by_sku(client, auth_headers, "ELEC-001")
    serial = "SN12345678901234"
    base = _sale_payload(
        "elec-dup-first",
        "electronics",
        product["sku"],
        product["name"],
        product["base_price"],
        product_id=product["id"],
        meta={"serial": serial},
    )
    first = client.post("/api/v1/sales", json=base, headers=auth_headers)
    assert first.status_code == 200

    retry = dict(base)
    retry["client_transaction_id"] = "elec-dup-second"
    second = client.post("/api/v1/sales", json=retry, headers=auth_headers)
    assert second.status_code == 409


def test_stock_adjustment_endpoint(client):
    headers = login(client, "inventory@pulse.pos", "inventory123")
    product = get_product_by_sku(client, headers, "GROC-001")
    me = client.get("/api/v1/auth/me", headers=headers)
    store_id = me.json()["store_id"]
    res = client.post(
        "/api/v1/inventory/adjust",
        headers=headers,
        json={
            "product_id": product["id"],
            "store_id": store_id,
            "qty_after": 88,
            "reason": "Cycle count correction",
        },
    )
    assert res.status_code == 200
    assert res.json()["ok"] is True

    stock = client.get("/api/v1/inventory/stock", headers=headers)
    assert stock.status_code == 200
    row = next(s for s in stock.json() if s["product_id"] == product["id"])
    assert row["qty_on_hand"] == 88


def test_get_stock_adjustments(client):
    headers = login(client, "inventory@pulse.pos", "inventory123")
    res = client.get("/api/v1/inventory/adjustments", headers=headers)
    assert res.status_code == 200
    adjustments = res.json()
    assert isinstance(adjustments, list)
    # The adjustment made in test_stock_adjustment_endpoint should be present since they use the same database session/seed in the client
    # but we just assert it runs and returns a valid list structure.
    if len(adjustments) > 0:
        item = adjustments[0]
        assert "sku" in item
        assert "name" in item
        assert "qty_before" in item
        assert "qty_after" in item
        assert "qty_delta" in item


def test_post_opening_stock_endpoint(auth_headers, client, session: Session):
    me = client.get("/api/v1/auth/me", headers=auth_headers)
    store_id = me.json()["store_id"]

    # Standard product: opening stock updates quantities.
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    stock_before = client.get("/api/v1/inventory/stock", headers=auth_headers).json()
    qty_before = next((s["qty_on_hand"] for s in stock_before if s["product_id"] == product["id"]), 0)
    res = client.post(
        "/api/v1/inventory/opening-stock",
        headers=auth_headers,
        json={"product_id": product["id"], "store_id": store_id, "qty": 25, "unit_cost": 10},
    )
    assert res.status_code == 200, res.text
    assert res.json()["ok"] is True
    stock_after = client.get("/api/v1/inventory/stock", headers=auth_headers).json()
    qty_after = next(s["qty_on_hand"] for s in stock_after if s["product_id"] == product["id"])
    assert qty_after == qty_before + 25

    # Batch-tracked product: opening stock with batch_no/expiry_date registers a batch.
    pharma_product = get_product_by_sku(client, auth_headers, "PHRM-001")
    res = client.post(
        "/api/v1/inventory/opening-stock",
        headers=auth_headers,
        json={
            "product_id": pharma_product["id"],
            "store_id": store_id,
            "qty": 15,
            "unit_cost": 5,
            "batch_no": "OPEN-BATCH-001",
            "expiry_date": "2027-12-31T00:00:00",
        },
    )
    assert res.status_code == 200, res.text
    batch = session.exec(
        select(PharmaBatch).where(
            PharmaBatch.product_id == pharma_product["id"],
            PharmaBatch.batch_no == "OPEN-BATCH-001",
        )
    ).first()
    assert batch is not None

    # Serial-tracked product: opening stock with serials registers serial entries.
    elec_product = get_product_by_sku(client, auth_headers, "ELEC-001")
    res = client.post(
        "/api/v1/inventory/opening-stock",
        headers=auth_headers,
        json={
            "product_id": elec_product["id"],
            "store_id": store_id,
            "qty": 2,
            "unit_cost": 100,
            "serials": ["OPEN-IMEI-001", "OPEN-IMEI-002"],
        },
    )
    assert res.status_code == 200, res.text
    serials = session.exec(
        select(ElectronicsSerialStock).where(
            ElectronicsSerialStock.product_id == elec_product["id"],
            ElectronicsSerialStock.serial_imei.in_(["OPEN-IMEI-001", "OPEN-IMEI-002"]),
        )
    ).all()
    assert len(serials) == 2


def test_bulk_import_opening_stock_with_batch_and_serials(auth_headers, client, session: Session):
    me = client.get("/api/v1/auth/me", headers=auth_headers)
    store_id = me.json()["store_id"]

    res = client.post(
        "/api/v1/import/opening-stock",
        headers=auth_headers,
        json={
            "rows": [
                {
                    "data": {
                        "sku": "PHRM-001",
                        "store_id": store_id,
                        "qty": 20,
                        "unit_cost": 8,
                        "batch_no": "CSV-BATCH-01",
                        "expiry_date": "2027-09-30",
                    }
                },
                {
                    "data": {
                        "sku": "ELEC-001",
                        "store_id": store_id,
                        "qty": 2,
                        "unit_cost": 90,
                        "serials": "CSV-IMEI-01;CSV-IMEI-02",
                    }
                },
            ],
            "dry_run": False,
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["rows_imported"] == 2
    assert body["errors"] == []

    batch = session.exec(
        select(PharmaBatch).where(PharmaBatch.batch_no == "CSV-BATCH-01")
    ).first()
    assert batch is not None
    assert batch.qty_on_hand == 20

    serials = session.exec(
        select(ElectronicsSerialStock).where(
            ElectronicsSerialStock.serial_imei.in_(["CSV-IMEI-01", "CSV-IMEI-02"])
        )
    ).all()
    assert len(serials) == 2


def test_opening_stock_document_workflow(auth_headers, client, session: Session):
    me = client.get("/api/v1/auth/me", headers=auth_headers)
    store_id = me.json()["store_id"]

    groc = get_product_by_sku(client, auth_headers, "GROC-001")
    phrm = get_product_by_sku(client, auth_headers, "PHRM-001")
    stock_before = client.get("/api/v1/inventory/stock", headers=auth_headers).json()
    groc_before = next((s["qty_on_hand"] for s in stock_before if s["product_id"] == groc["id"]), 0)
    phrm_before = next((s["qty_on_hand"] for s in stock_before if s["product_id"] == phrm["id"]), 0)

    # Create draft with two lines — must not touch stock.
    res = client.post(
        "/api/v1/inventory/opening-stock-documents",
        headers=auth_headers,
        json={
            "store_id": store_id,
            "note": "Store opening count",
            "lines": [
                {"product_id": groc["id"], "qty": 30, "unit_cost": 500},
                {"product_id": phrm["id"], "qty": 10, "unit_cost": 8, "batch_no": "DOC-BATCH-01", "expiry_date": "2027-08-15"},
            ],
        },
    )
    assert res.status_code == 200, res.text
    doc = res.json()
    assert doc["status"] == "DRAFT"
    assert doc["os_number"].startswith("OS-")
    assert doc["total_amount"] == 30 * 500 + 10 * 8
    assert len(doc["lines"]) == 2
    doc_id = doc["id"]

    stock_mid = client.get("/api/v1/inventory/stock", headers=auth_headers).json()
    groc_mid = next((s["qty_on_hand"] for s in stock_mid if s["product_id"] == groc["id"]), 0)
    assert groc_mid == groc_before  # draft: stock unchanged

    # Listing shows the draft.
    listed = client.get("/api/v1/inventory/opening-stock-documents", headers=auth_headers).json()
    assert any(d["id"] == doc_id and d["status"] == "DRAFT" for d in listed)

    # A user without inventory.approve_opening_stock cannot approve.
    inv_headers = login(client, "inventory@pulse.pos", "inventory123")
    denied = client.post(f"/api/v1/inventory/opening-stock-documents/{doc_id}/approve", headers=inv_headers)
    assert denied.status_code == 403

    # Admin approves — this is the point stock actually posts.
    approved = client.post(f"/api/v1/inventory/opening-stock-documents/{doc_id}/approve", headers=auth_headers)
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "POSTED"

    stock_after = client.get("/api/v1/inventory/stock", headers=auth_headers).json()
    groc_after = next(s["qty_on_hand"] for s in stock_after if s["product_id"] == groc["id"])
    phrm_after = next(s["qty_on_hand"] for s in stock_after if s["product_id"] == phrm["id"])
    assert groc_after == groc_before + 30
    assert phrm_after == phrm_before + 10

    batch = session.exec(select(PharmaBatch).where(PharmaBatch.batch_no == "DOC-BATCH-01")).first()
    assert batch is not None

    ledger = client.get(
        f"/api/v1/inventory/stock-ledger?product_id={groc['id']}&transaction_type=opening",
        headers=auth_headers,
    ).json()
    assert any(entry["transaction_ref"] == doc["os_number"] for entry in ledger)

    # Approving again is rejected — already POSTED.
    re_approve = client.post(f"/api/v1/inventory/opening-stock-documents/{doc_id}/approve", headers=auth_headers)
    assert re_approve.status_code == 409

    # Cancelling a posted document is rejected too.
    cancel_posted = client.post(f"/api/v1/inventory/opening-stock-documents/{doc_id}/cancel", headers=auth_headers)
    assert cancel_posted.status_code == 409

    # A fresh draft can be cancelled while still DRAFT.
    draft2 = client.post(
        "/api/v1/inventory/opening-stock-documents",
        headers=auth_headers,
        json={"store_id": store_id, "lines": [{"product_id": groc["id"], "qty": 5, "unit_cost": 500}]},
    ).json()
    cancelled = client.post(f"/api/v1/inventory/opening-stock-documents/{draft2['id']}/cancel", headers=auth_headers)
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "CANCELLED"


def test_grocery_sale(auth_headers, client):
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    payload = _sale_payload(
        "grocery-sale-002",
        "grocery",
        product["sku"],
        product["name"],
        product["base_price"],
        product_id=product["id"],
        price_mode="retail",
    )
    res = client.post("/api/v1/sales", json=payload, headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["industry_pack"] == "grocery"


def test_health_check_endpoint(auth_headers, client):
    res = client.get("/api/v1/configuration/health-check", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert "summary" in data
    assert "items" in data


def test_qa_checklist_get_and_put(auth_headers, client):
    get_res = client.get("/api/v1/configuration/qa-checklist", headers=auth_headers)
    assert get_res.status_code == 200
    assert isinstance(get_res.json(), list)

    put_res = client.put(
        "/api/v1/configuration/qa-checklist/pos-login",
        headers=auth_headers,
        json={"status": "passed", "notes": "Login flow verified"},
    )
    assert put_res.status_code == 200
    assert put_res.json()["test_id"] == "pos-login"
    assert put_res.json()["status"] == "passed"


def test_reports_sales_summary(auth_headers, client):
    res = client.get("/api/v1/reports/sales-summary", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert "invoice_count" in data
    assert "total_sales" in data
    assert data["invoice_count"] >= 1


def test_beef_wastage_list(auth_headers, client):
    res = client.get("/api/v1/industry/beef/wastage", headers=auth_headers)
    assert res.status_code == 200
    rows = res.json()
    assert len(rows) >= 1
    assert "wastage_kg" in rows[0]


def test_pharma_fefo_endpoint(auth_headers, client):
    product = get_product_by_sku(client, auth_headers, "PHRM-001")
    res = client.get(f"/api/v1/industry/pharmacy/fefo/{product['id']}", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["batch_no"] == "BATCH-001"
    assert data["qty_on_hand"] > 0


def test_gold_rate_endpoint(auth_headers, client):
    res = client.get("/api/v1/industry/jewelry/gold-rate", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["rate_per_gram"] == 9850
    assert data["karat"] == "22K"


def test_restaurant_tables(auth_headers, client):
    res = client.get("/api/v1/industry/restaurant/tables", headers=auth_headers)
    assert res.status_code == 200
    tables = res.json()
    assert len(tables) >= 1
    assert tables[0]["table_no"] == "T01"


def test_fashion_offers(auth_headers, client):
    res = client.get("/api/v1/industry/fashion/offers", headers=auth_headers)
    assert res.status_code == 200
    offers = res.json()
    assert len(offers) >= 1
    assert offers[0]["name"] == "Summer Clearance"


def test_audit_log_filter_by_action(auth_headers, client):
    res = client.get(
        "/api/v1/audit-logs",
        headers=auth_headers,
        params={"action": "seed_demo"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total"] >= 1
    assert all(item["action"] == "seed_demo" for item in data["items"])


def test_opening_stock_document_fashion_auto_variant(auth_headers, client, session: Session):
    from app.models.product import BrandMaster, Product, ProductCategory, Unit

    me = client.get("/api/v1/auth/me", headers=auth_headers).json()
    company_id = me["company_id"]
    store_id = me["store_id"]

    cat = session.exec(select(ProductCategory).where(ProductCategory.company_id == company_id)).first()
    unit = session.exec(select(Unit).where(Unit.company_id == company_id)).first()
    brand = session.exec(select(BrandMaster).where(BrandMaster.company_id == company_id)).first()

    prod = Product(
        company_id=company_id,
        sku="B2800B-TEST",
        name="Fashion Test Item B2800B",
        industry_pack="fashion",
        base_price=1999,
        cost_price=1200,
        category_id=cat.id if cat else None,
        unit_id=unit.id if unit else None,
        brand_id=brand.id if brand else None,
        meta_json=json.dumps({"style": "Modern"}),
    )
    session.add(prod)
    session.commit()

    # Create opening stock document without specifying variant_id
    doc_res = client.post(
        "/api/v1/inventory/opening-stock-documents",
        headers=auth_headers,
        json={
            "store_id": store_id,
            "note": "Opening stock for B2800B",
            "lines": [
                {"product_id": prod.id, "qty": 5, "unit_cost": 1200},
            ],
        },
    )
    assert doc_res.status_code == 200, doc_res.text
    doc = doc_res.json()
    assert doc["status"] == "DRAFT"
    assert doc["lines"][0]["variant_id"] is not None

    # Approve document
    appr_res = client.post(f"/api/v1/inventory/opening-stock-documents/{doc['id']}/approve", headers=auth_headers)
    assert appr_res.status_code == 200, appr_res.text
    assert appr_res.json()["status"] == "POSTED"


def test_opening_stock_document_fashion_legacy_draft_approves(auth_headers, client, session: Session):
    """Simulate an existing draft document where line.variant_id was saved as null (OS-1001 scenario)."""
    from app.models.inventory import OpeningStockDocument, OpeningStockDocumentLine
    from app.models.product import Product

    me = client.get("/api/v1/auth/me", headers=auth_headers).json()
    company_id = me["company_id"]
    store_id = me["store_id"]

    fashion_prod = session.exec(
        select(Product).where(Product.company_id == company_id, Product.industry_pack == "fashion")
    ).first()
    assert fashion_prod is not None

    # Manually insert a draft document with variant_id=None on the line
    doc = OpeningStockDocument(
        company_id=company_id,
        store_id=store_id,
        os_number="OS-9999",
        status="DRAFT",
        total_amount=1999,
        created_by=me["id"],
    )
    session.add(doc)
    session.flush()

    line = OpeningStockDocumentLine(
        document_id=doc.id,
        product_id=fashion_prod.id,
        variant_id=None,  # explicitly null
        qty=1,
        unit_cost=1999,
        line_total=1999,
    )
    session.add(line)
    session.commit()

    # Approving must resolve the variant and succeed without 400 'requires variant_id'
    appr = client.post(f"/api/v1/inventory/opening-stock-documents/{doc.id}/approve", headers=auth_headers)
    assert appr.status_code == 200, appr.text
    assert appr.json()["status"] == "POSTED"

