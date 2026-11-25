"""Phase 6B-1 — Fashion vertical wiring tests."""

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.audit import AuditLog
from app.models.product import ProductVariant
from tests.test_operations import get_product_by_sku, login


def test_fashion_variants_list_generic(auth_headers, client: TestClient):
    res = client.get("/api/v1/industry/fashion/variants", headers=auth_headers)
    assert res.status_code == 200
    rows = res.json()
    assert len(rows) >= 1
    generic = [r for r in rows if r.get("source") == "generic"]
    assert generic, "Expected generic product_variant rows for fashion"
    assert any(r["variant_code"] == "FASH-001-M-BLU" for r in generic)


def test_fashion_variant_create_update(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "FASH-001")
    created = client.post(
        f"/api/v1/products/{product['id']}/variants",
        headers=auth_headers,
        json={
            "variant_code": "FASH-001-L-RED",
            "size": "L",
            "color": "Red",
            "barcode": "FASH001LRED",
            "is_active": True,
        },
    )
    assert created.status_code == 200
    vid = created.json()["id"]
    updated = client.patch(
        f"/api/v1/products/{product['id']}/variants/{vid}",
        headers=auth_headers,
        json={"is_active": False},
    )
    assert updated.status_code == 200
    assert updated.json()["is_active"] is False
    audit = session.exec(
        select(AuditLog).where(AuditLog.entity_type == "product_variant", AuditLog.entity_id == vid)
    ).all()
    assert len(audit) >= 1


def test_fashion_barcode_lookup_variant(auth_headers, client: TestClient):
    res = client.get("/api/v1/products/barcode/FASH001MBLU", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["matched_variant_id"]
    assert body["matched_variant"]["size"] == "M"


def test_fashion_barcode_inactive_variant(auth_headers, client: TestClient, session: Session):
    variant = session.exec(
        select(ProductVariant).where(ProductVariant.barcode == "FASH001MBLU")
    ).first()
    assert variant is not None
    variant.is_active = False
    session.add(variant)
    session.commit()
    res = client.get("/api/v1/products/barcode/FASH001MBLU", headers=auth_headers)
    assert res.status_code == 404


def test_list_exchanges_fashion(auth_headers, client: TestClient):
    res = client.get("/api/v1/sales/exchanges?industry_pack=fashion", headers=auth_headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_fashion_alteration_create_list_status(auth_headers, client: TestClient, session: Session):
    created = client.post(
        "/api/v1/industry/fashion/alterations",
        headers=auth_headers,
        json={
            "customer_name": "Test Customer",
            "product_sku": "FASH-001-M-BLU",
            "instruction": "Hem shorten",
            "charge_amount": 150,
            "delivery_date": "2026-12-31T12:00:00",
        },
    )
    assert created.status_code == 200
    job_id = created.json()["id"]
    listed = client.get("/api/v1/industry/fashion/alterations", headers=auth_headers)
    assert listed.status_code == 200
    assert any(r["id"] == job_id for r in listed.json())
    updated = client.patch(
        f"/api/v1/industry/fashion/alterations/{job_id}",
        headers=auth_headers,
        json={"status": "in_progress"},
    )
    assert updated.status_code == 200
    audit = session.exec(
        select(AuditLog).where(AuditLog.entity_type == "fashion_alteration_request", AuditLog.entity_id == job_id)
    ).all()
    assert len(audit) >= 2


def test_fashion_alteration_negative_charge_blocked(auth_headers, client: TestClient):
    res = client.post(
        "/api/v1/industry/fashion/alterations",
        headers=auth_headers,
        json={"customer_name": "X", "product_sku": "X", "charge_amount": -1},
    )
    assert res.status_code == 400


def test_fashion_alteration_tenant_isolation(auth_headers, client: TestClient, session: Session):
    from app.models.core import Company

    created = client.post(
        "/api/v1/industry/fashion/alterations",
        headers=auth_headers,
        json={"customer_name": "Tenant Test", "product_sku": "FASH-001", "charge_amount": 50},
    ).json()
    other = session.exec(select(Company).where(Company.code == "PULSE-PLATFORM")).first()
    if not other:
        return
    plat_headers = login(client, "super@pulse.pos", "super123", "PULSE-PLATFORM")
    listed = client.get("/api/v1/industry/fashion/alterations", headers=plat_headers).json()
    assert not any(r["id"] == created["id"] for r in listed)
    patch = client.patch(
        f"/api/v1/industry/fashion/alterations/{created['id']}",
        headers=plat_headers,
        json={"status": "cancelled"},
    )
    assert patch.status_code == 404
