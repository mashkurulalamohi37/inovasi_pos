"""
Client UAT automated scenarios — maps to PILOT_UAT_CHECKLIST.md test IDs.
Run: cd backend && python -m pytest tests/test_client_uat.py -v
"""

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.product import ProductVariant
from tests.test_operations import (
    _approve_and_receive,
    _create_purchase,
    _get_supplier,
    _grocery_sale,
    get_product_by_sku,
    login,
)


def _sale_for_pack(
    client: TestClient, headers: dict, pack: str, sku: str, tx_suffix: str, session: Session | None = None,
) -> dict:
    product = get_product_by_sku(client, headers, sku)
    subtotal = product["base_price"]
    total = round(subtotal * 1.05, 2)
    meta: dict = {}
    lines = [{
        "product_id": product["id"],
        "sku": product["sku"],
        "name": product["name"],
        "qty": 1,
        "unit_price": product["base_price"],
        "meta": meta,
    }]
    if pack == "pharmacy":
        fefo = client.get(f"/api/v1/industry/pharmacy/fefo/{product['id']}", headers=headers)
        assert fefo.status_code == 200, fefo.text
        lines[0]["meta"] = {"batch_id": fefo.json()["id"], "fefo": True}
    if pack == "electronics":
        lines[0]["meta"] = {"serial": "SN12345678901234", "warrantyMonths": 12}
    if pack == "fashion":
        assert session is not None, "fashion sales require a size/color variant_id — pass session"
        variant = session.exec(
            select(ProductVariant).where(ProductVariant.product_id == product["id"])
        ).first()
        assert variant is not None
        lines[0]["meta"] = {"variant_id": variant.id}
    res = client.post(
        "/api/v1/sales",
        headers=headers,
        json={
            "client_transaction_id": f"uat-{pack}-{tx_suffix}",
            "industry_pack": pack,
            "lines": lines,
            "subtotal": subtotal,
            "tax": round(subtotal * 0.05, 2),
            "total": total,
            "tender": "cash",
        },
    )
    assert res.status_code == 200, res.text
    return res.json()


# --- Section A: Super Admin ---


def test_uat_sa01_super_admin_login(client: TestClient):
  login(client, "super@pulse.pos", "super123")


def test_uat_sa02_list_tenants(client: TestClient):
    h = login(client, "super@pulse.pos", "super123")
    res = client.get("/api/v1/super-admin/tenants", headers=h)
    assert res.status_code == 200
    assert any(t["code"] == "PULSE-DEMO" for t in res.json())


def test_uat_sa06_subscription_plans(client: TestClient):
    res = client.get("/api/v1/subscriptions/plans")
    codes = [p["code"] for p in res.json()]
    assert "starter" in codes and "enterprise" in codes


def test_uat_sa03_suspend_and_sa05_reactivate(client: TestClient):
    super = login(client, "super@pulse.pos", "super123")
    tenants = client.get("/api/v1/super-admin/tenants", headers=super).json()
    demo = next(t for t in tenants if t["code"] == "PULSE-DEMO")
    client.post(f"/api/v1/super-admin/tenants/{demo['id']}/suspend", headers=super)
    blocked = client.post("/api/v1/auth/login", json={"email": "admin@pulse.pos", "password": "admin123", "company_code": "PULSE-DEMO"})
    assert blocked.status_code == 403
    client.post(f"/api/v1/super-admin/tenants/{demo['id']}/activate", headers=super)
    ok = client.post("/api/v1/auth/login", json={"email": "admin@pulse.pos", "password": "admin123", "company_code": "PULSE-DEMO"})
    assert ok.status_code == 200


def test_uat_sa09_support_access(client: TestClient):
    super = login(client, "super@pulse.pos", "super123")
    tenants = client.get("/api/v1/super-admin/tenants", headers=super).json()
    company_id = next(t["id"] for t in tenants if t["code"] == "PULSE-DEMO")
    start = client.post(
        "/api/v1/super-admin/support-access/start",
        headers=super,
        json={"company_id": company_id, "reason": "UAT", "duration_minutes": 30},
    )
    assert start.status_code == 200
    imp_id = start.json()["impersonation_id"]
    end = client.post(f"/api/v1/super-admin/support-access/{imp_id}/end", headers=super)
    assert end.status_code == 200


# --- Section B: Tenant Admin ---


def test_uat_ta01_admin_login(auth_headers, client: TestClient):
    me = client.get("/api/v1/auth/me", headers=auth_headers)
    assert me.status_code == 200
    assert me.json()["role_code"] == "Super Admin"


def test_uat_ta14_health_check(auth_headers, client: TestClient):
    res = client.get("/api/v1/system/health", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["database"] == "connected"


def test_uat_ta09_device_approve(auth_headers, client: TestClient):
    reg = client.post(
        "/api/v1/devices/register",
        headers=auth_headers,
        json={"device_id": f"uat-device-{uuid.uuid4().hex[:8]}"},
    )
    assert reg.status_code == 200
    pk = reg.json()["id"]
    approved = client.post(f"/api/v1/devices/{pk}/approve", headers=auth_headers)
    assert approved.json()["status"] == "approved"


# --- Section C: POS industries ---


def test_uat_pos_g01_grocery_sale(auth_headers, client: TestClient):
    sale = _grocery_sale(client, auth_headers, f"uat-groc-{uuid.uuid4().hex[:8]}")
    assert sale["invoice_number"]


def test_uat_pos_p01_pharmacy_sale(auth_headers, client: TestClient):
    _sale_for_pack(client, auth_headers, "pharmacy", "PHRM-001", uuid.uuid4().hex)


def test_uat_pos_f01_fashion_sale(auth_headers, client: TestClient, session: Session):
    _sale_for_pack(client, auth_headers, "fashion", "FASH-001", uuid.uuid4().hex, session=session)


def test_uat_pos_e01_electronics_sale(auth_headers, client: TestClient):
    _sale_for_pack(client, auth_headers, "electronics", "ELEC-001", uuid.uuid4().hex)


def test_uat_pos_b01_beef_sale(auth_headers, client: TestClient):
    _sale_for_pack(client, auth_headers, "beef-shop", "BEEF-001", uuid.uuid4().hex)


def test_uat_pos07_idempotent_sale(auth_headers, client: TestClient):
    tx = f"uat-idem-{uuid.uuid4().hex}"
    p1 = _grocery_sale(client, auth_headers, tx)
    p2 = _grocery_sale(client, auth_headers, tx)
    assert p1["id"] == p2["id"]
    assert p2.get("duplicate") is True


# --- Section D: Inventory & Purchase ---


def test_uat_inv01_product_create(auth_headers, client: TestClient):
    sku = f"UAT-SKU-{uuid.uuid4().hex[:6]}"
    res = client.post(
        "/api/v1/products",
        headers=auth_headers,
        json={"sku": sku, "name": "UAT Product", "industry_pack": "grocery", "base_price": 99},
    )
    assert res.status_code == 200


def test_uat_pur02_04_purchase_receive(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    supplier = _get_supplier(client, auth_headers)
    po = _create_purchase(client, auth_headers, product, supplier["id"], qty=5)
    received = _approve_and_receive(client, auth_headers, po, qty=5)
    assert received["purchase"]["status"] in ("RECEIVED", "PARTIALLY_RECEIVED")


def test_uat_pur03_cashier_cannot_approve(client: TestClient):
    cashier = login(client, "cashier@pulse.pos", "cashier123")
    admin = login(client, "admin@pulse.pos", "admin123")
    product = get_product_by_sku(client, admin, "GROC-001")
    supplier = _get_supplier(client, admin)
    po = _create_purchase(client, admin, product, supplier["id"], qty=2)
    denied = client.post(f"/api/v1/purchases/{po['id']}/approve", headers=cashier)
    assert denied.status_code == 403


# --- Section E: Returns & Refunds ---


def test_uat_ref02_cashier_refund_approval(client: TestClient):
    admin = login(client, "admin@pulse.pos", "admin123")
    sale = _grocery_sale(client, admin, f"uat-ref-{uuid.uuid4().hex[:8]}")
    cashier = login(client, "cashier@pulse.pos", "cashier123")
    refund = client.post(
        f"/api/v1/sales/{sale['id']}/refund",
        headers=cashier,
        json={"amount": 50, "method": "cash"},
    )
    assert refund.status_code == 202
    approval_id = refund.json()["approval_id"]
    manager = login(client, "manager@pulse.pos", "manager123")
    approved = client.post(
        f"/api/v1/approvals/{approval_id}/approve",
        headers=manager,
        json={"comment": "UAT approve"},
    )
    assert approved.status_code == 200


# --- Section F: Security ---


def test_uat_sec08_cashier_rbac(auth_headers, client: TestClient):
    cashier = login(client, "cashier@pulse.pos", "cashier123")
    res = client.patch(
        "/api/v1/configuration/industry-packs/grocery",
        headers=cashier,
        json={"enabled_company": False},
    )
    assert res.status_code == 403


def test_uat_sec09_tenant_isolation(auth_headers, client: TestClient, session: Session):
    from app.models.product import Product

    other = Product(company_id="other-company-id", sku="OTHER-1", name="Other", industry_pack="grocery", base_price=1)
    session.add(other)
    session.commit()
    res = client.get("/api/v1/products", headers=auth_headers, params={"q": "OTHER-1"})
    items = res.json()["items"]
    assert not any(p["sku"] == "OTHER-1" for p in items)


# --- Section G: Reports & Audit ---


def test_uat_rep01_sales_summary(auth_headers, client: TestClient):
    res = client.get("/api/v1/reports/sales-summary", headers=auth_headers)
    assert res.status_code == 200


def test_uat_aud01_audit_logs(auth_headers, client: TestClient):
    res = client.get("/api/v1/audit-logs", headers=auth_headers, params={"limit": 10})
    assert res.status_code == 200


# --- Data import dry run ---


def test_uat_import_products_dry_run(auth_headers, client: TestClient):
    res = client.post(
        "/api/v1/import/products",
        headers=auth_headers,
        json={"rows": [{"data": {"sku": "IMP-001", "name": "Import test"}}], "dry_run": True},
    )
    assert res.status_code == 200
    assert res.json()["dry_run"] is True


def test_uat_import_opening_stock_dry_run(auth_headers, client: TestClient):
    res = client.post(
        "/api/v1/import/opening-stock",
        headers=auth_headers,
        json={"rows": [{"data": {"sku": "GROC-001", "qty": 10}}], "dry_run": True},
    )
    assert res.status_code == 200
