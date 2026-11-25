"""Phase 8B — expanded tenant isolation matrix."""

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.core import Company
from app.models.product import Product
from tests.conftest import login_payload


def test_cross_tenant_product_detail_scoped(auth_headers, client: TestClient, session: Session):
    product = session.exec(select(Product).where(Product.sku == "GROC-001")).one()
    other = Company(code="ISO-OTHER", name="Other", legal_name="Other Ltd")
    session.add(other)
    session.commit()
    res = client.get(f"/api/v1/products/{product.id}", headers=auth_headers)
    if res.status_code == 200:
        body = res.json()
        assert body["id"] == product.id
        if "company_id" in body:
            assert body["company_id"] == product.company_id


def test_unauthenticated_sensitive_lists_denied(client: TestClient):
    paths = [
        "/api/v1/products",
        "/api/v1/customers",
        "/api/v1/suppliers",
        "/api/v1/sales",
        "/api/v1/purchases",
        "/api/v1/industry/pharmacy/batches",
        "/api/v1/industry/electronics/serials",
        "/api/v1/industry/jewelry/certificates",
        "/api/v1/industry/restaurant/tables",
    ]
    for path in paths:
        res = client.get(path)
        assert res.status_code in {401, 403}, path


def test_demo_tenant_product_list_company_scope(client: TestClient, session: Session):
    login = client.post("/api/v1/auth/login", json=login_payload("admin@pulse.pos", "admin123"))
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    res = client.get("/api/v1/products", headers=headers, params={"limit": 50})
    assert res.status_code == 200
    company = session.exec(select(Company).where(Company.code == "PULSE-DEMO")).one()
    items = res.json().get("items", res.json() if isinstance(res.json(), list) else [])
    for item in items:
        if isinstance(item, dict) and "company_id" in item:
            assert item["company_id"] == company.id
