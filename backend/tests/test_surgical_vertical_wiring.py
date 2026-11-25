"""Phase 6B-7 — Surgical Shop vertical wiring tests."""

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.audit import AuditLog
from app.models.industry import SurgicalRecall, SurgicalStockUnit
from app.models.inventory import StockBalance
from app.models.sales import SalesInvoiceLine
from tests.test_operations import _create_purchase, _get_supplier, _store_id, get_product_by_sku, login


def _approve(client, headers, purchase_id: str):
    res = client.post(f"/api/v1/purchases/{purchase_id}/approve", headers=headers)
    assert res.status_code == 200
    return res.json()


def _sale_payload(product, store_id, meta, qty=1):
    price = product["base_price"]
    return {
        "client_transaction_id": f"sg-{product['sku']}-{datetime.now(timezone.utc).timestamp()}",
        "industry_pack": "surgical-shop",
        "store_id": store_id,
        "lines": [{
            "product_id": product["id"],
            "sku": product["sku"],
            "name": product["name"],
            "qty": qty,
            "unit_price": price,
            "meta": meta,
        }],
        "subtotal": price * qty,
        "tax": 0,
        "total": price * qty,
        "tender": "cash",
    }


def test_surgical_profiles_and_stock_list(auth_headers, client: TestClient):
    profiles = client.get("/api/v1/industry/surgical/profiles", headers=auth_headers)
    assert profiles.status_code == 200
    assert any(p.get("sku") == "SG-001" for p in profiles.json())

    stock = client.get("/api/v1/industry/surgical/stock", headers=auth_headers)
    assert stock.status_code == 200
    rows = stock.json()
    assert len(rows) >= 1
    assert "sterile_status" in rows[0]


def test_profile_upsert_and_permission(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "SG-001")
    ok = client.post(
        "/api/v1/industry/surgical/profiles",
        headers=auth_headers,
        json={
            "product_id": product["id"],
            "device_type": "consumable",
            "tracking_mode": "batch",
            "sterile_required": True,
            "manufacturer_name": "Pulse MedSupply Updated",
        },
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["manufacturer_name"] == "Pulse MedSupply Updated"
    cashier = login(client, "cashier@pulse.pos", "cashier123")
    denied = client.post(
        "/api/v1/industry/surgical/profiles",
        headers=cashier,
        json={"product_id": product["id"], "tracking_mode": "lot"},
    )
    assert denied.status_code == 403


def test_grn_batch_receive_and_duplicate_serial(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "SG-001")
    supplier = _get_supplier(client, auth_headers)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=10, unit_cost=200)
    _approve(client, auth_headers, purchase["id"])
    exp = (datetime.now(timezone.utc) + timedelta(days=200)).date().isoformat()
    receive = client.post(
        f"/api/v1/purchases/{purchase['id']}/receive",
        headers=auth_headers,
        json={
            "lines": [{
                "purchase_line_id": purchase["lines"][0]["id"],
                "qty": 10,
                "batch_no": "SG-GRN-BATCH-01",
                "expiry_date": exp,
                "sterile_status": "sterile",
                "sterilization_method": "EO",
            }],
        },
    )
    assert receive.status_code == 200, receive.text
    units = session.exec(
        select(SurgicalStockUnit).where(SurgicalStockUnit.batch_no == "SG-GRN-BATCH-01")
    ).all()
    assert len(units) == 1
    assert units[0].qty_on_hand == 10

    serial_product = get_product_by_sku(client, auth_headers, "SG-002")
    purchase2 = _create_purchase(client, auth_headers, serial_product, supplier["id"], qty=1, unit_cost=1000)
    _approve(client, auth_headers, purchase2["id"])
    existing = session.exec(
        select(SurgicalStockUnit).where(SurgicalStockUnit.serial_no == "SG-FRC-SN-001")
    ).first()
    assert existing is not None
    dup = client.post(
        f"/api/v1/purchases/{purchase2['id']}/receive",
        headers=auth_headers,
        json={
            "lines": [{
                "purchase_line_id": purchase2["lines"][0]["id"],
                "qty": 1,
                "serials": [{"serial_no": existing.serial_no, "udi_code": "UDI-DUP-TEST"}],
                "udi_code": "UDI-DUP-TEST",
                "sterile_status": "sterile",
            }],
        },
    )
    assert dup.status_code == 409
    assert "duplicate" in dup.json()["detail"].lower()


def test_sale_blocks_expired_quarantine_recall_and_sold_serial(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "SG-001")
    store_id = _store_id(client, auth_headers)
    company_id = session.exec(select(SurgicalStockUnit).limit(1)).first().company_id

    expired = SurgicalStockUnit(
        company_id=company_id,
        product_id=product["id"],
        store_id=store_id,
        batch_no="SG-EXPIRED-01",
        expiry_date=datetime.now(timezone.utc) - timedelta(days=1),
        qty_on_hand=5,
        status="available",
        sterile_status="sterile",
    )
    session.add(expired)
    session.commit()

    bad = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json=_sale_payload(product, store_id, {"stock_unit_id": expired.id, "batch_id": expired.id}),
    )
    assert bad.status_code == 409
    assert "expired" in bad.json()["detail"].lower()

    unit = session.exec(
        select(SurgicalStockUnit).where(
            SurgicalStockUnit.batch_no == "SG-BATCH-001",
            SurgicalStockUnit.qty_on_hand > 0,
        )
    ).first()
    assert unit is not None
    q = client.post(
        f"/api/v1/industry/surgical/stock/{unit.id}/quarantine",
        headers=auth_headers,
        json={"reason": "QC hold"},
    )
    assert q.status_code == 200, q.text
    assert q.json()["status"] == "quarantined"
    audit = session.exec(select(AuditLog).where(AuditLog.action == "surgical.quarantine")).all()
    assert len(audit) >= 1

    blocked = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json=_sale_payload(product, store_id, {"stock_unit_id": unit.id, "batch_id": unit.id}),
    )
    assert blocked.status_code == 409
    assert "quarantine" in blocked.json()["detail"].lower()

    release = client.post(
        f"/api/v1/industry/surgical/stock/{unit.id}/release",
        headers=auth_headers,
        json={"note": "QC passed"},
    )
    assert release.status_code == 200
    assert release.json()["status"] == "available"

    bal_before = session.exec(select(StockBalance).where(StockBalance.product_id == product["id"])).first()
    qty_before = float(bal_before.qty_on_hand) if bal_before else 0
    unit_qty_before = float(unit.qty_on_hand)
    sale = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json=_sale_payload(
            product,
            store_id,
            {
                "stock_unit_id": unit.id,
                "batch_id": unit.id,
                "batch_no": unit.batch_no,
                "sterile_status": unit.sterile_status,
                "expiry": unit.expiry_date.isoformat() if unit.expiry_date else None,
            },
            qty=2,
        ),
    )
    assert sale.status_code == 200, sale.text
    session.refresh(unit)
    assert unit.qty_on_hand == unit_qty_before - 2
    bal_after = session.exec(select(StockBalance).where(StockBalance.product_id == product["id"])).first()
    assert float(bal_after.qty_on_hand) == qty_before - 2

    forceps = get_product_by_sku(client, auth_headers, "SG-002")
    serial = session.exec(
        select(SurgicalStockUnit).where(SurgicalStockUnit.serial_no == "SG-FRC-SN-001")
    ).first()
    assert serial is not None
    sale1 = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json=_sale_payload(
            forceps,
            store_id,
            {
                "stock_unit_id": serial.id,
                "batch_id": serial.id,
                "serial": serial.serial_no,
                "udi_code": serial.udi_code,
            },
        ),
    )
    assert sale1.status_code == 200, sale1.text
    sale2 = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json=_sale_payload(
            forceps,
            store_id,
            {
                "stock_unit_id": serial.id,
                "batch_id": serial.id,
                "serial": serial.serial_no,
            },
        ),
    )
    assert sale2.status_code == 409
    detail = sale2.json()["detail"].lower()
    assert "sold" in detail or "quarantine" in detail or "insufficient" in detail or "cannot" in detail


def test_recall_blocks_stock_and_lists_sales(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "SG-003")
    store_id = _store_id(client, auth_headers)
    unit = session.exec(
        select(SurgicalStockUnit).where(SurgicalStockUnit.batch_no == "IV-BATCH-001")
    ).first()
    assert unit is not None

    recall = client.post(
        "/api/v1/industry/surgical/recalls",
        headers=auth_headers,
        json={
            "product_id": product["id"],
            "batch_no": "IV-BATCH-001",
            "reason": "Manufacturer advisory",
            "severity": "high",
        },
    )
    assert recall.status_code == 200, recall.text
    body = recall.json()
    assert body["status"] == "stock_blocked"
    assert body["notification_available"] is False
    session.refresh(unit)
    assert unit.status == "recalled"

    blocked = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json=_sale_payload(product, store_id, {"stock_unit_id": unit.id, "batch_id": unit.id}),
    )
    assert blocked.status_code == 409
    assert "recall" in blocked.json()["detail"].lower()

    detail = client.get(f"/api/v1/industry/surgical/recalls/{body['id']}", headers=auth_headers)
    assert detail.status_code == 200
    assert "affected_stock" in detail.json()
    assert "affected_sales" in detail.json()
    assert session.get(SurgicalRecall, body["id"]) is not None

    cashier = login(client, "cashier@pulse.pos", "cashier123")
    denied = client.post(
        "/api/v1/industry/surgical/recalls",
        headers=cashier,
        json={"batch_no": "X", "reason": "nope"},
    )
    assert denied.status_code == 403


def test_expiry_endpoint_and_release_expired_blocked(auth_headers, client: TestClient, session: Session):
    exp = client.get("/api/v1/industry/surgical/expiry", headers=auth_headers, params={"near_days": 90})
    assert exp.status_code == 200
    assert isinstance(exp.json(), list)

    product = get_product_by_sku(client, auth_headers, "SG-001")
    store_id = _store_id(client, auth_headers)
    company_id = session.exec(select(SurgicalStockUnit).limit(1)).first().company_id
    unit = SurgicalStockUnit(
        company_id=company_id,
        product_id=product["id"],
        store_id=store_id,
        batch_no="SG-QC-EXP",
        expiry_date=datetime.now(timezone.utc) - timedelta(days=2),
        qty_on_hand=3,
        status="quarantined",
        quarantine_reason="hold",
        sterile_status="sterile",
    )
    session.add(unit)
    session.commit()
    release = client.post(
        f"/api/v1/industry/surgical/stock/{unit.id}/release",
        headers=auth_headers,
        json={"note": "try"},
    )
    assert release.status_code == 400
    assert "expired" in release.json()["detail"].lower()


def test_surgical_return_restores_and_quarantines_serial(auth_headers, client: TestClient, session: Session):
    forceps = get_product_by_sku(client, auth_headers, "SG-002")
    store_id = _store_id(client, auth_headers)
    company_id = session.exec(select(SurgicalStockUnit).limit(1)).first().company_id
    serial = SurgicalStockUnit(
        company_id=company_id,
        product_id=forceps["id"],
        store_id=store_id,
        serial_no="SG-FRC-SN-RET-01",
        udi_code="UDI-SG-FRC-RET-01",
        qty_on_hand=1,
        status="available",
        sterile_status="sterile",
    )
    session.add(serial)
    bal = session.exec(select(StockBalance).where(StockBalance.product_id == forceps["id"])).first()
    if bal:
        bal.qty_on_hand = (bal.qty_on_hand or 0) + 1
        session.add(bal)
    session.commit()

    sale = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json=_sale_payload(
            forceps,
            store_id,
            {
                "stock_unit_id": serial.id,
                "batch_id": serial.id,
                "serial": serial.serial_no,
                "udi_code": serial.udi_code,
            },
        ),
    )
    assert sale.status_code == 200, sale.text
    invoice_id = sale.json()["id"]
    inv_line = session.exec(
        select(SalesInvoiceLine).where(SalesInvoiceLine.invoice_id == invoice_id)
    ).first()
    assert inv_line is not None

    ret = client.post(
        f"/api/v1/sales/{invoice_id}/return",
        headers=auth_headers,
        json={
            "reason": "Customer return",
            "condition": "saleable",
            "lines": [{"invoice_line_id": inv_line.id, "qty": 1}],
        },
    )
    assert ret.status_code == 200, ret.text
    session.refresh(serial)
    assert serial.qty_on_hand >= 1
    assert serial.status == "quarantined"
