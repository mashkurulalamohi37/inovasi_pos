"""Phase 6B-2 — pharmacy vertical wiring tests."""

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.audit import AuditLog
from app.models.industry import PharmaBatch, PharmaPrescriptionRecord
from tests.test_operations import get_product_by_sku, login


def test_pharma_batches_list_with_status(auth_headers, client: TestClient):
    res = client.get("/api/v1/industry/pharmacy/batches", headers=auth_headers)
    assert res.status_code == 200
    rows = res.json()
    assert len(rows) >= 1
    assert "status" in rows[0]
    assert "days_to_expiry" in rows[0]


def test_pharma_fefo_excludes_expired(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "PHRM-001")
    expired = PharmaBatch(
        company_id=session.exec(select(PharmaBatch).limit(1)).first().company_id,
        product_id=product["id"],
        batch_no="EXP-BATCH-001",
        expiry_date=datetime.now(timezone.utc) - timedelta(days=1),
        qty_on_hand=50,
    )
    session.add(expired)
    session.commit()
    res = client.get(f"/api/v1/industry/pharmacy/fefo/{product['id']}", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["batch_no"] != "EXP-BATCH-001"


def test_expired_batch_cannot_be_sold(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "PHRM-001")
    batch = PharmaBatch(
        company_id=session.exec(select(PharmaBatch).limit(1)).first().company_id,
        product_id=product["id"],
        batch_no="EXP-SALE-001",
        expiry_date=datetime.now(timezone.utc) - timedelta(days=5),
        qty_on_hand=10,
    )
    session.add(batch)
    session.commit()
    session.refresh(batch)
    res = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json={
            "client_transaction_id": "pharma-expired-block-001",
            "industry_pack": "pharmacy",
            "lines": [{
                "product_id": product["id"],
                "sku": product["sku"],
                "name": product["name"],
                "qty": 1,
                "unit_price": product["base_price"],
                "meta": {"batch_id": batch.id},
            }],
            "subtotal": product["base_price"],
            "tax": round(product["base_price"] * 0.05, 2),
            "total": round(product["base_price"] * 1.05, 2),
            "tender": "cash",
        },
    )
    assert res.status_code == 409
    assert "expired" in res.json()["detail"].lower()


def test_pharma_sale_decrements_batch_stock(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "PHRM-001")
    batch = session.exec(select(PharmaBatch).where(PharmaBatch.product_id == product["id"])).first()
    assert batch is not None
    before = batch.qty_on_hand
    res = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json={
            "client_transaction_id": "pharma-batch-dec-001",
            "industry_pack": "pharmacy",
            "lines": [{
                "product_id": product["id"],
                "sku": product["sku"],
                "name": product["name"],
                "qty": 1,
                "unit_price": product["base_price"],
                "meta": {"batch_id": batch.id, "fefo": True},
            }],
            "subtotal": product["base_price"],
            "tax": round(product["base_price"] * 0.05, 2),
            "total": round(product["base_price"] * 1.05, 2),
            "tender": "cash",
        },
    )
    assert res.status_code == 200
    session.refresh(batch)
    assert batch.qty_on_hand == before - 1


def test_pharma_prescription_create_list(auth_headers, client: TestClient, session: Session):
    created = client.post(
        "/api/v1/industry/pharmacy/prescriptions",
        headers=auth_headers,
        json={
            "patient_name": "Test Patient",
            "doctor_name": "Dr. Test",
            "rx_ref": "RX-TEST-001",
            "prescription_date": datetime.now(timezone.utc).isoformat(),
        },
    )
    assert created.status_code == 200
    pid = created.json()["id"]
    listed = client.get("/api/v1/industry/pharmacy/prescriptions", headers=auth_headers)
    assert listed.status_code == 200
    assert any(r["id"] == pid for r in listed.json())
    audit = session.exec(
        select(AuditLog).where(AuditLog.entity_type == "pharma_prescription_record", AuditLog.entity_id == pid)
    ).all()
    assert len(audit) >= 1


def test_pharma_prescription_permission_denied(client: TestClient):
    headers = login(client, "cashier@pulse.pos", "cashier123")
    res = client.post(
        "/api/v1/industry/pharmacy/prescriptions",
        headers=headers,
        json={"patient_name": "X"},
    )
    assert res.status_code == 403


def test_pharma_batches_near_expiry_filter(auth_headers, client: TestClient):
    res = client.get("/api/v1/industry/pharmacy/batches?status=near-expiry&near_days=365", headers=auth_headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_pharma_prescription_tenant_isolation(auth_headers, client: TestClient, session: Session):
    from app.models.core import Company

    created = client.post(
        "/api/v1/industry/pharmacy/prescriptions",
        headers=auth_headers,
        json={"patient_name": "Tenant Rx", "rx_ref": "RX-TENANT"},
    ).json()
    other = session.exec(select(Company).where(Company.code == "PULSE-PLATFORM")).first()
    if not other:
        return
    plat_headers = login(client, "super@pulse.pos", "super123", "PULSE-PLATFORM")
    listed = client.get("/api/v1/industry/pharmacy/prescriptions", headers=plat_headers).json()
    assert not any(r["id"] == created["id"] for r in listed)
