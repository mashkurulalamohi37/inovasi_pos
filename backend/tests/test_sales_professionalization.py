"""Phase 3 sales professionalization — customer, due, ledger, returns, security."""

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.audit import AuditLog
from app.models.core import Company
from app.models.sales import SalesInvoice
from tests.test_operations import _grocery_sale, get_product_by_sku, login


def _create_customer(client: TestClient, headers: dict, code: str = "CUST-P3") -> dict:
    res = client.post(
        "/api/v1/customers",
        headers=headers,
        json={"code": code, "name": "Phase3 Customer", "phone": "01710000001"},
    )
    assert res.status_code == 200
    return res.json()


def test_customer_create_and_update(auth_headers, client):
    c = _create_customer(client, auth_headers)
    assert c["code"] == "CUST-P3"
    res = client.patch(
        f"/api/v1/customers/{c['id']}",
        headers=auth_headers,
        json={"name": "Updated Customer", "credit_limit": 50000},
    )
    assert res.status_code == 200
    assert res.json()["name"] == "Updated Customer"


def test_sale_with_customer_and_due(auth_headers, client):
    customer = _create_customer(client, auth_headers, "CUST-DUE")
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    subtotal = product["base_price"] * 2
    tax = round(subtotal * 0.05, 2)
    total = round(subtotal + tax, 2)
    res = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json={
            "client_transaction_id": "tx-due-p3-001",
            "industry_pack": "grocery",
            "customer_id": customer["id"],
            "lines": [{
                "product_id": product["id"],
                "sku": product["sku"],
                "name": product["name"],
                "qty": 2,
                "unit_price": product["base_price"],
            }],
            "subtotal": subtotal,
            "tax": tax,
            "total": total,
            "payments": [{"method": "cash", "amount": total / 2}],
        },
    )
    assert res.status_code == 200
    detail = client.get(f"/api/v1/sales/{res.json()['id']}", headers=auth_headers)
    assert detail.status_code == 200
    data = detail.json()
    assert data["customer_id"] == customer["id"]
    assert data["due_amount"] == pytest.approx(total / 2, abs=0.02)


def test_get_sales_list_filters(auth_headers, client):
    _grocery_sale(client, auth_headers, "tx-list-p3-001")
    res = client.get("/api/v1/sales", headers=auth_headers, params={"industry_pack": "grocery", "limit": 10})
    assert res.status_code == 200
    assert len(res.json()) >= 1


def test_sales_return_requires_reason(auth_headers, client):
    inv = _grocery_sale(client, auth_headers, "tx-ret-reason-p3")
    line = client.get(f"/api/v1/sales/{inv['id']}", headers=auth_headers).json()["lines"][0]
    res = client.post(
        f"/api/v1/sales/{inv['id']}/return",
        headers=auth_headers,
        json={"lines": [{"invoice_line_id": line["id"], "qty": 1}]},
    )
    assert res.status_code == 400


def test_sales_return_partial(auth_headers, client):
    inv = _grocery_sale(client, auth_headers, "tx-ret-partial-p3")
    detail = client.get(f"/api/v1/sales/{inv['id']}", headers=auth_headers).json()
    line = detail["lines"][0]
    res = client.post(
        f"/api/v1/sales/{inv['id']}/return",
        headers=auth_headers,
        json={"reason": "Damaged", "lines": [{"invoice_line_id": line["id"], "qty": 1}]},
    )
    assert res.status_code == 200


def test_refund_exceeds_rejected(auth_headers, client):
    inv = _grocery_sale(client, auth_headers, "tx-refund-p3")
    res = client.post(
        f"/api/v1/sales/{inv['id']}/refund",
        headers=auth_headers,
        json={"amount": inv["total"] + 1000, "method": "cash"},
    )
    assert res.status_code == 400


def test_due_collection(auth_headers, client):
    customer = _create_customer(client, auth_headers, "CUST-COLLECT")
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    total = round(product["base_price"] * 3 * 1.05, 2)
    sale = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json={
            "client_transaction_id": "tx-collect-p3",
            "industry_pack": "grocery",
            "customer_id": customer["id"],
            "lines": [{
                "product_id": product["id"],
                "sku": product["sku"],
                "name": product["name"],
                "qty": 3,
                "unit_price": product["base_price"],
            }],
            "subtotal": product["base_price"] * 3,
            "tax": round(product["base_price"] * 3 * 0.05, 2),
            "total": total,
            "payments": [{"method": "cash", "amount": 100}],
        },
    )
    assert sale.status_code == 200
    inv_id = sale.json()["id"]
    pay = client.post(
        "/api/v1/customer-payments",
        headers=auth_headers,
        json={"customer_id": customer["id"], "invoice_id": inv_id, "amount": 50, "method": "cash"},
    )
    assert pay.status_code == 200
    ledger = client.get(f"/api/v1/customers/{customer['id']}/ledger", headers=auth_headers)
    assert ledger.status_code == 200
    assert ledger.json()["entries"]


def test_customer_ledger_running_balance(auth_headers, client):
    customer = _create_customer(client, auth_headers, "CUST-LEDGER")
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    subtotal = product["base_price"]
    tax = round(subtotal * 0.05, 2)
    total = round(subtotal + tax, 2)
    client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json={
            "client_transaction_id": "tx-ledger-p3",
            "industry_pack": "grocery",
            "customer_id": customer["id"],
            "lines": [{
                "product_id": product["id"],
                "sku": product["sku"],
                "name": product["name"],
                "qty": 1,
                "unit_price": product["base_price"],
            }],
            "subtotal": subtotal,
            "tax": tax,
            "total": total,
            "payments": [{"method": "cash", "amount": 10}],
        },
    )
    ledger = client.get(f"/api/v1/customers/{customer['id']}/ledger", headers=auth_headers)
    assert ledger.status_code == 200
    assert ledger.json()["current_outstanding"] > 0


def test_sale_audit_log(auth_headers, client, session: Session):
    inv = _grocery_sale(client, auth_headers, "tx-audit-p3")
    logs = session.exec(
        select(AuditLog).where(
            AuditLog.entity_type == "sales_invoice",
            AuditLog.entity_id == inv["id"],
        )
    ).all()
    assert len(logs) >= 1


def test_sale_tenant_isolation(auth_headers, client, session: Session):
    other = session.exec(select(Company).where(Company.code != "PULSE-DEMO")).first()
    if not other:
        pytest.skip("No second company")
    inv = _grocery_sale(client, auth_headers, "tx-tenant-p3")
    foreign = SalesInvoice(
        company_id=other.id,
        store_id=inv.get("store_id") or "x",
        invoice_number="INV-FOREIGN",
        industry_pack="grocery",
        status="completed",
        total=100,
    )
    session.add(foreign)
    session.commit()
    res = client.get(f"/api/v1/sales/{foreign.id}", headers=auth_headers)
    assert res.status_code == 404


def test_cashier_refund_approval_or_execute(client):
    headers = login(client, "cashier@pulse.pos", "cashier123")
    inv = _grocery_sale(client, headers, "tx-cashier-refund-p3")
    res = client.post(
        f"/api/v1/sales/{inv['id']}/refund",
        headers=headers,
        json={"amount": 10, "method": "cash"},
    )
    assert res.status_code in (200, 202)
