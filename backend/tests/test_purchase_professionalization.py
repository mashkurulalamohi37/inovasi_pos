"""Phase 2 purchase professionalization — contract, validation, ledger, security."""

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.audit import AuditLog
from app.models.core import Company
from app.models.sales import PurchaseInvoice
from tests.test_operations import (
    _approve_and_receive,
    _create_purchase,
    _get_supplier,
    _store_id,
    get_product_by_sku,
    login,
)


def _supplier_invoice_flow(client: TestClient, headers: dict, purchase: dict, product: dict) -> dict:
    line = purchase["lines"][0]
    inv = client.post(
        f"/api/v1/purchases/{purchase['id']}/supplier-invoice",
        headers=headers,
        json={
            "invoice_no": f"SINV-TEST-{purchase['id'][:6]}",
            "lines": [{"purchase_line_id": line["id"], "qty": line["qty"], "unit_cost": line["unit_cost"]}],
        },
    )
    assert inv.status_code == 200
    inv_data = inv.json()
    approve = client.post(
        f"/api/v1/purchases/supplier-invoices/{inv_data['id']}/approve",
        headers=headers,
    )
    assert approve.status_code == 200
    return approve.json()


def test_edit_draft_purchase(auth_headers, client, session):
    from sqlmodel import select

    from app.models.product import ProductVariant

    product = get_product_by_sku(client, auth_headers, "GROC-001")
    product2 = get_product_by_sku(client, auth_headers, "FASH-001")
    variant = session.exec(
        select(ProductVariant).where(ProductVariant.variant_code == "FASH-001-M-BLU")
    ).first()
    assert variant is not None
    supplier = _get_supplier(client, auth_headers)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=5, unit_cost=100)
    res = client.put(
        f"/api/v1/purchases/{purchase['id']}",
        headers=auth_headers,
        json={
            "lines": [
                {"product_id": product["id"], "qty": 3, "unit_cost": 100},
                {
                    "product_id": product2["id"],
                    "variant_id": variant.id,
                    "qty": 2,
                    "unit_cost": 200,
                },
            ],
            "discount_amount": 50,
            "tax_amount": 10,
            "remarks": "Updated draft",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "DRAFT"
    assert len(data["lines"]) == 2
    assert data["discount_amount"] == 50
    assert data["tax_amount"] == 10
    assert data["total"] == 660  # 300+400-50+10
    assert data["lines"][1]["variant_id"] == variant.id


def test_cannot_edit_approved_purchase(auth_headers, client):
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    supplier = _get_supplier(client, auth_headers)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"])
    client.post(f"/api/v1/purchases/{purchase['id']}/approve", headers=auth_headers)
    res = client.put(
        f"/api/v1/purchases/{purchase['id']}",
        headers=auth_headers,
        json={"remarks": "Should fail"},
    )
    assert res.status_code == 409


def test_partial_receive(auth_headers, client):
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    supplier = _get_supplier(client, auth_headers)
    store_id = _store_id(client, auth_headers)
    before = _stock_qty(client, auth_headers, product["id"], store_id)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=10)
    client.post(f"/api/v1/purchases/{purchase['id']}/approve", headers=auth_headers)
    line_id = purchase["lines"][0]["id"]
    receive = client.post(
        f"/api/v1/purchases/{purchase['id']}/receive",
        headers=auth_headers,
        json={"lines": [{"purchase_line_id": line_id, "qty": 4}]},
    )
    assert receive.status_code == 200
    data = receive.json()
    purchase_data = data.get("purchase", data)
    assert purchase_data["status"] == "PARTIALLY_RECEIVED"
    assert purchase_data["lines"][0]["received_qty"] == 4
    assert purchase_data["lines"][0]["open_qty"] == 6
    assert data.get("receive_no")
    after = _stock_qty(client, auth_headers, product["id"], store_id)
    assert after == before + 4


def test_over_receive_rejected(auth_headers, client):
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    supplier = _get_supplier(client, auth_headers)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=5)
    client.post(f"/api/v1/purchases/{purchase['id']}/approve", headers=auth_headers)
    line_id = purchase["lines"][0]["id"]
    res = client.post(
        f"/api/v1/purchases/{purchase['id']}/receive",
        headers=auth_headers,
        json={"lines": [{"purchase_line_id": line_id, "qty": 99}]},
    )
    assert res.status_code == 400


def test_return_more_than_received_rejected(auth_headers, client):
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    supplier = _get_supplier(client, auth_headers)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=5)
    _approve_and_receive(client, auth_headers, purchase, qty=3)
    line_id = purchase["lines"][0]["id"]
    res = client.post(
        f"/api/v1/purchases/{purchase['id']}/return",
        headers=auth_headers,
        json={
            "reason": "Damaged",
            "lines": [{"product_id": product["id"], "purchase_line_id": line_id, "qty": 5, "unit_cost": 500}],
        },
    )
    assert res.status_code == 400


def test_return_requires_reason(auth_headers, client):
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    supplier = _get_supplier(client, auth_headers)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=2)
    _approve_and_receive(client, auth_headers, purchase, qty=2)
    line_id = purchase["lines"][0]["id"]
    res = client.post(
        f"/api/v1/purchases/{purchase['id']}/return",
        headers=auth_headers,
        json={"lines": [{"product_id": product["id"], "purchase_line_id": line_id, "qty": 1, "unit_cost": 500}]},
    )
    assert res.status_code == 400


def test_supplier_ledger_running_balance(auth_headers, client):
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    supplier = _get_supplier(client, auth_headers)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=2, unit_cost=1000)
    _approve_and_receive(client, auth_headers, purchase, qty=2)
    inv = _supplier_invoice_flow(client, auth_headers, purchase, product)
    pay = client.post(
        "/api/v1/supplier-payments",
        headers=auth_headers,
        json={
            "supplier_id": supplier["id"],
            "supplier_invoice_id": inv["id"],
            "amount": 1000,
            "method": "bank",
            "reference": "PAY-001",
        },
    )
    assert pay.status_code == 200

    ledger = client.get(f"/api/v1/suppliers/{supplier['id']}/ledger", headers=auth_headers)
    assert ledger.status_code == 200
    data = ledger.json()
    assert data["supplier_id"] == supplier["id"]
    assert len(data["entries"]) >= 2
    types = {e["type"] for e in data["entries"]}
    assert "supplier_invoice" in types
    assert "supplier_payment" in types
    assert data["closing_balance"] == data["entries"][-1]["balance"]


def test_payment_exceeds_due_rejected(auth_headers, client):
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    supplier = _get_supplier(client, auth_headers)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=1, unit_cost=500)
    _approve_and_receive(client, auth_headers, purchase, qty=1)
    inv = _supplier_invoice_flow(client, auth_headers, purchase, product)
    res = client.post(
        "/api/v1/supplier-payments",
        headers=auth_headers,
        json={"supplier_id": supplier["id"], "supplier_invoice_id": inv["id"], "amount": 99999},
    )
    assert res.status_code == 400


def test_purchase_list_filters(auth_headers, client):
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    supplier = _get_supplier(client, auth_headers)
    _create_purchase(client, auth_headers, product, supplier["id"])
    res = client.get(
        "/api/v1/purchases",
        headers=auth_headers,
        params={"status": "DRAFT", "supplier_id": supplier["id"]},
    )
    assert res.status_code == 200
    assert all(p["status"] == "DRAFT" for p in res.json())


def test_purchase_audit_log_written(auth_headers, client, session: Session):
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    supplier = _get_supplier(client, auth_headers)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"])
    logs = session.exec(
        select(AuditLog).where(
            AuditLog.entity_type == "purchase_invoice",
            AuditLog.entity_id == purchase["id"],
        )
    ).all()
    assert len(logs) >= 1


def test_purchase_tenant_isolation_other_company(auth_headers, client, session: Session):
    other = session.exec(select(Company).where(Company.code != "PULSE-DEMO")).first()
    if not other:
        pytest.skip("No second company in seed")
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    supplier = _get_supplier(client, auth_headers)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"])
    foreign_po = PurchaseInvoice(
        company_id=other.id,
        invoice_number="PO-FOREIGN",
        supplier_id=supplier["id"],
        status="DRAFT",
        subtotal=100,
        total=100,
        due_amount=100,
    )
    session.add(foreign_po)
    session.commit()
    res = client.get(f"/api/v1/purchases/{foreign_po.id}", headers=auth_headers)
    assert res.status_code == 404


def test_cashier_cannot_create_purchase(client):
    headers = login(client, "cashier@pulse.pos", "cashier123")
    product = get_product_by_sku(client, headers, "GROC-001")
    supplier = _get_supplier(client, headers)
    res = client.post(
        "/api/v1/purchases",
        headers=headers,
        json={
            "supplier_id": supplier["id"],
            "store_id": _store_id(client, headers),
            "lines": [{"product_id": product["id"], "qty": 1, "unit_cost": 10}],
        },
    )
    assert res.status_code == 403


def _stock_qty(client: TestClient, headers: dict, product_id: str, store_id: str | None = None) -> float:
    params = {"store_id": store_id} if store_id else {}
    res = client.get("/api/v1/inventory/stock", headers=headers, params=params)
    assert res.status_code == 200
    rows = [s for s in res.json() if s["product_id"] == product_id]
    return sum(r["qty_on_hand"] for r in rows)


def test_purchase_meta_and_line_amounts_persist(auth_headers, client, session):
    """expected_date, reference_no, and per-line discount/tax must survive the DB round trip."""
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    supplier = _get_supplier(client, auth_headers)
    store_id = _store_id(client, auth_headers)
    res = client.post(
        "/api/v1/purchases",
        headers=auth_headers,
        json={
            "supplier_id": supplier["id"],
            "store_id": store_id,
            "expected_date": "2026-08-01T00:00:00",
            "reference_no": "SUP-BILL-778",
            "discount_amount": 5,
            "tax_amount": 2,
            "lines": [
                {"product_id": product["id"], "qty": 4, "unit_cost": 50, "discount_amount": 10, "tax_amount": 6},
            ],
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["expected_date"].startswith("2026-08-01")
    assert data["reference_no"] == "SUP-BILL-778"
    line = data["lines"][0]
    assert line["discount_amount"] == 10
    assert line["tax_amount"] == 6
    assert line["line_total"] == 196  # 4*50 - 10 + 6
    assert data["subtotal"] == 196
    assert data["total"] == 193  # 196 - 5 + 2
    row = session.get(PurchaseInvoice, data["id"])
    assert row is not None and row.reference_no == "SUP-BILL-778"
    assert row.expected_date is not None

    # Direct receive path carries the same metadata and posts stock.
    before = _stock_qty(client, auth_headers, product["id"], store_id)
    res2 = client.post(
        "/api/v1/purchases/direct-receive",
        headers=auth_headers,
        json={
            "supplier_id": supplier["id"],
            "store_id": store_id,
            "expected_date": "2026-08-05T00:00:00",
            "reference_no": "SUP-BILL-779",
            "lines": [{"product_id": product["id"], "qty": 3, "unit_cost": 40, "discount_amount": 5, "tax_amount": 0}],
        },
    )
    assert res2.status_code == 200
    direct = res2.json()
    assert direct["purchase"]["reference_no"] == "SUP-BILL-779"
    assert direct["purchase"]["status"] == "RECEIVED"
    assert _stock_qty(client, auth_headers, product["id"], store_id) == before + 3


def test_e2e_purchase_professional_flow(auth_headers, client):
    """Admin PO → approve → partial GRN → invoice → payment → ledger."""
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    supplier = _get_supplier(client, auth_headers)
    store_id = _store_id(client, auth_headers)
    before_stock = _stock_qty(client, auth_headers, product["id"], store_id)

    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=8, unit_cost=250)
    client.post(f"/api/v1/purchases/{purchase['id']}/approve", headers=auth_headers)
    line_id = purchase["lines"][0]["id"]
    receive = client.post(
        f"/api/v1/purchases/{purchase['id']}/receive",
        headers=auth_headers,
        json={"lines": [{"purchase_line_id": line_id, "qty": 5}]},
    )
    assert receive.status_code == 200
    after_stock = _stock_qty(client, auth_headers, product["id"], store_id)
    assert after_stock == before_stock + 5

    inv = _supplier_invoice_flow(client, auth_headers, purchase, product)
    pay = client.post(
        "/api/v1/supplier-payments",
        headers=auth_headers,
        json={"supplier_id": supplier["id"], "supplier_invoice_id": inv["id"], "amount": 500, "method": "cash"},
    )
    assert pay.status_code == 200

    ledger = client.get(f"/api/v1/suppliers/{supplier['id']}/ledger", headers=auth_headers)
    assert ledger.status_code == 200
    assert ledger.json()["entries"]


def test_direct_receive_creates_po_grn_and_stock(auth_headers, client, session: Session):
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    supplier = _get_supplier(client, auth_headers)
    store_id = _store_id(client, auth_headers)
    before = _stock_qty(client, auth_headers, product["id"], store_id)

    res = client.post(
        "/api/v1/purchases/direct-receive",
        headers=auth_headers,
        json={
            "supplier_id": supplier["id"],
            "store_id": store_id,
            "remarks": "Direct purchase test",
            "lines": [{"product_id": product["id"], "qty": 3, "unit_cost": 120}],
        },
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["receive_no"]
    assert data["receive_id"]
    purchase = data["purchase"]
    assert purchase["status"] == "RECEIVED"
    assert purchase["lines"][0]["received_qty"] == 3
    assert purchase["lines"][0]["open_qty"] == 0

    after = _stock_qty(client, auth_headers, product["id"], store_id)
    assert after == before + 3

    receives = client.get("/api/v1/purchases/receives", headers=auth_headers, params={"purchase_id": purchase["id"]})
    assert receives.status_code == 200
    assert any(r["id"] == data["receive_id"] for r in receives.json())

    audits = session.exec(
        select(AuditLog).where(
            AuditLog.entity_type == "purchase_invoice",
            AuditLog.entity_id == purchase["id"],
            AuditLog.action == "purchase_direct_receive",
        )
    ).all()
    assert audits


def test_direct_receive_requires_lines(auth_headers, client):
    supplier = _get_supplier(client, auth_headers)
    res = client.post(
        "/api/v1/purchases/direct-receive",
        headers=auth_headers,
        json={"supplier_id": supplier["id"], "store_id": _store_id(client, auth_headers), "lines": []},
    )
    assert res.status_code in (400, 422)


def test_receive_rejects_foreign_line_id(auth_headers, client):
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    supplier = _get_supplier(client, auth_headers)
    p1 = _create_purchase(client, auth_headers, product, supplier["id"], qty=2)
    p2 = _create_purchase(client, auth_headers, product, supplier["id"], qty=2)
    client.post(f"/api/v1/purchases/{p1['id']}/approve", headers=auth_headers)
    foreign_line = p2["lines"][0]["id"]
    res = client.post(
        f"/api/v1/purchases/{p1['id']}/receive",
        headers=auth_headers,
        json={"lines": [{"purchase_line_id": foreign_line, "qty": 1}]},
    )
    assert res.status_code == 400
    assert "does not belong" in res.json()["detail"].lower()


def test_receive_rejects_empty_quantities(auth_headers, client):
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    supplier = _get_supplier(client, auth_headers)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=2)
    client.post(f"/api/v1/purchases/{purchase['id']}/approve", headers=auth_headers)
    line_id = purchase["lines"][0]["id"]
    res = client.post(
        f"/api/v1/purchases/{purchase['id']}/receive",
        headers=auth_headers,
        json={"lines": [{"purchase_line_id": line_id, "qty": 0}]},
    )
    assert res.status_code == 400


def test_cashier_cannot_direct_receive(client):
    headers = login(client, "cashier@pulse.pos", "cashier123")
    product = get_product_by_sku(client, headers, "GROC-001")
    supplier = _get_supplier(client, headers)
    res = client.post(
        "/api/v1/purchases/direct-receive",
        headers=headers,
        json={
            "supplier_id": supplier["id"],
            "store_id": _store_id(client, headers),
            "lines": [{"product_id": product["id"], "qty": 1, "unit_cost": 10}],
        },
    )
    assert res.status_code == 403
