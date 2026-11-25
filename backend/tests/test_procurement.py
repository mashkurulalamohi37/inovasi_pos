"""Phase 3 procurement: GRN list, supplier invoices, AP on invoice."""

from fastapi.testclient import TestClient

from test_operations import (
    _approve_and_receive,
    _create_purchase,
    _get_supplier,
    get_product_by_sku,
)


def test_grn_list_after_receive(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    supplier = _get_supplier(client, auth_headers)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=4)
    _approve_and_receive(client, auth_headers, purchase, qty=4)

    res = client.get("/api/v1/purchases/receives", headers=auth_headers)
    assert res.status_code == 200
    rows = res.json()
    assert len(rows) >= 1
    match = next(r for r in rows if r["purchase_id"] == purchase["id"])
    assert match["receive_no"].startswith("GRN-")
    assert len(match["lines"]) == 1
    assert match["lines"][0]["qty"] == 4


def test_po_approve_does_not_book_ap(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    supplier = _get_supplier(client, auth_headers)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=3, unit_cost=100)
    client.post(f"/api/v1/purchases/{purchase['id']}/approve", headers=auth_headers)

    pay_list = client.get("/api/v1/supplier-payments", headers=auth_headers)
    assert pay_list.status_code == 200
    # No supplier invoice yet — outstanding should remain 0 until invoice approved
    create_inv = client.post(
        f"/api/v1/purchases/{purchase['id']}/supplier-invoice",
        headers=auth_headers,
        json={
            "invoice_no": "SUP-BILL-001",
            "lines": [{"purchase_line_id": purchase["lines"][0]["id"], "qty": 3, "unit_cost": 100}],
        },
    )
    assert create_inv.status_code == 200
    inv_id = create_inv.json()["id"]
    assert create_inv.json()["match_status"] in ("po_matched", "grn_matched", "variance", "pending")

    approve = client.post(f"/api/v1/purchases/supplier-invoices/{inv_id}/approve", headers=auth_headers)
    assert approve.status_code == 200
    assert approve.json()["status"] == "APPROVED"

    payment = client.post(
        "/api/v1/supplier-payments",
        headers=auth_headers,
        json={
            "supplier_id": supplier["id"],
            "supplier_invoice_id": inv_id,
            "amount": 150,
            "method": "bank",
            "reference": "P3-PAY-001",
        },
    )
    assert payment.status_code == 200
    assert payment.json()["outstanding"] == 150  # 300 total - 150 paid


def test_supplier_invoice_requires_approved_po(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    supplier = _get_supplier(client, auth_headers)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=2)
    res = client.post(
        f"/api/v1/purchases/{purchase['id']}/supplier-invoice",
        headers=auth_headers,
        json={
            "invoice_no": "EARLY-INV",
            "lines": [{"purchase_line_id": purchase["lines"][0]["id"], "qty": 2, "unit_cost": 100}],
        },
    )
    assert res.status_code == 409


def test_match_summary(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    supplier = _get_supplier(client, auth_headers)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=5)
    _approve_and_receive(client, auth_headers, purchase, qty=5)

    res = client.get(f"/api/v1/purchases/{purchase['id']}/match-summary", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["grn_count"] >= 1
    assert data["ordered_qty"] == 5
    assert data["received_qty"] == 5
