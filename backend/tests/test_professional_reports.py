"""Phase 4 professional reports — accuracy, tenant isolation, export audit."""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.core import Company
from app.models.inventory import StockLedger
from app.models.reports import ReportExport
from tests.test_operations import (
    _approve_and_receive,
    _create_purchase,
    _get_supplier,
    _grocery_sale,
    _store_id,
    get_product_by_sku,
    login,
)


def _report_rows(client: TestClient, headers: dict, report_code: str, **params) -> list[dict]:
    res = client.get(f"/api/v1/reports/data/{report_code}", headers=headers, params=params)
    assert res.status_code == 200, res.text
    return res.json()["rows"]


def _seed_stock_movement(client: TestClient, headers: dict) -> tuple[dict, dict, str]:
    """Receive stock then sell — returns product, supplier, store_id."""
    product = get_product_by_sku(client, headers, "GROC-001")
    supplier = _get_supplier(client, headers)
    store_id = _store_id(client, headers)
    purchase = _create_purchase(client, headers, product, supplier["id"], qty=20, unit_cost=50)
    _approve_and_receive(client, headers, purchase, qty=20)
    _grocery_sale(client, headers, f"p4-report-sale-{purchase['id'][:8]}", qty=3)
    return product, supplier, store_id


def test_p0_catalog_includes_core_reports(auth_headers, client: TestClient):
    res = client.get("/api/v1/reports/catalog", headers=auth_headers)
    assert res.status_code == 200
    keys = {r["key"] for r in res.json()}
    for code in (
        "stock-balance",
        "item-ledger",
        "sales-register",
        "sales-return",
        "purchase-register",
        "grn-report",
        "supplier-ledger",
        "customer-ledger",
        "daily-sales-summary",
    ):
        assert code in keys


def test_stock_balance_opening_receive_issue_closing(auth_headers, client: TestClient):
    product, _, store_id = _seed_stock_movement(client, auth_headers)
    from_dt = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    to_dt = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    rows = _report_rows(
        client,
        auth_headers,
        "stock-balance",
        from_date=from_dt,
        to_date=to_dt,
        store_id=store_id,
        product_id=product["id"],
    )
    assert len(rows) >= 1
    row = next(r for r in rows if r["product_id"] == product["id"])
    assert row["receive_qty"] >= 20
    assert row["issue_qty"] >= 3
    assert row["closing_qty"] == round(row["opening_qty"] + row["receive_qty"] - row["issue_qty"], 4)


def test_stock_balance_category_includes_subcategories(auth_headers, client: TestClient):
    # Parent category "Beverage" with two subcategories, "Soft Drinks" and "Juice",
    # each holding one product. ProductCategory is a self-referential tree, so
    # filtering by the *parent* must include both subcategories' products, while
    # filtering by a specific *subcategory* must return only that one.
    suffix = uuid4().hex[:8]
    parent = client.post(
        "/api/v1/categories",
        headers=auth_headers,
        json={"code": f"BEV-{suffix}", "name": f"Beverage {suffix}"},
    )
    assert parent.status_code == 200, parent.text
    parent_id = parent.json()["id"]

    soft_drinks = client.post(
        "/api/v1/categories",
        headers=auth_headers,
        json={"code": f"SOFT-{suffix}", "name": f"Soft Drinks {suffix}", "parent_id": parent_id},
    )
    assert soft_drinks.status_code == 200, soft_drinks.text
    soft_drinks_id = soft_drinks.json()["id"]

    juice = client.post(
        "/api/v1/categories",
        headers=auth_headers,
        json={"code": f"JUICE-{suffix}", "name": f"Juice {suffix}", "parent_id": parent_id},
    )
    assert juice.status_code == 200, juice.text
    juice_id = juice.json()["id"]

    products = client.get("/api/v1/products", headers=auth_headers, params={"page_size": 2}).json()["items"]
    assert len(products) >= 2, "Need at least two seeded products for this test"
    product_a, product_b = products[0], products[1]

    for product, category_id in ((product_a, soft_drinks_id), (product_b, juice_id)):
        upd = client.patch(
            f"/api/v1/products/{product['id']}",
            headers=auth_headers,
            json={"category_id": category_id},
        )
        assert upd.status_code == 200, upd.text

    # Filtering by the parent category returns both subcategories' products.
    parent_rows = _report_rows(client, auth_headers, "stock-balance", category_id=parent_id)
    parent_product_ids = {r["product_id"] for r in parent_rows}
    assert product_a["id"] in parent_product_ids
    assert product_b["id"] in parent_product_ids

    # Filtering by one specific subcategory returns only its own product.
    soft_drinks_rows = _report_rows(client, auth_headers, "stock-balance", subcategory_id=soft_drinks_id)
    soft_drinks_product_ids = {r["product_id"] for r in soft_drinks_rows}
    assert product_a["id"] in soft_drinks_product_ids
    assert product_b["id"] not in soft_drinks_product_ids


def test_item_ledger_running_balance(auth_headers, client: TestClient):
    product, _, store_id = _seed_stock_movement(client, auth_headers)
    from_dt = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    to_dt = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    rows = _report_rows(
        client,
        auth_headers,
        "item-ledger",
        from_date=from_dt,
        to_date=to_dt,
        store_id=store_id,
        product_id=product["id"],
    )
    assert rows[0]["transaction_type"] == "opening"
    assert len(rows) >= 2
    last = rows[-1]
    assert "balance_qty" in last


def test_sales_register_accuracy(auth_headers, client: TestClient):
    inv = _grocery_sale(client, auth_headers, "p4-sales-reg-001", qty=2)
    from_dt = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    to_dt = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    rows = _report_rows(client, auth_headers, "sales-register", from_date=from_dt, to_date=to_dt)
    match = next((r for r in rows if r.get("invoice_id") == inv["id"]), None)
    assert match is not None
    assert match["net_amount"] == inv["total"]
    assert match["invoice_no"] == inv["invoice_number"]


def test_purchase_register_and_grn(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    supplier = _get_supplier(client, auth_headers)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=8, unit_cost=120)
    _approve_and_receive(client, auth_headers, purchase, qty=8)
    from_dt = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    to_dt = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()

    po_rows = _report_rows(client, auth_headers, "purchase-register", from_date=from_dt, to_date=to_dt)
    po = next((r for r in po_rows if r.get("purchase_id") == purchase["id"]), None)
    assert po is not None
    assert po["total_qty"] == 8
    assert po["received_status"] in ("received", "partial")

    grn_rows = _report_rows(client, auth_headers, "grn-report", from_date=from_dt, to_date=to_dt)
    assert any(r.get("purchase_id") == purchase["id"] for r in grn_rows)
    grn = next(r for r in grn_rows if r.get("purchase_id") == purchase["id"])
    assert grn["received_qty"] == 8


def test_daily_sales_summary(auth_headers, client: TestClient):
    _grocery_sale(client, auth_headers, "p4-daily-sum-001", qty=1)
    today = datetime.now(timezone.utc).date().isoformat()
    rows = _report_rows(
        client,
        auth_headers,
        "daily-sales-summary",
        from_date=f"{today}T00:00:00+00:00",
        to_date=f"{today}T23:59:59+00:00",
    )
    assert len(rows) >= 1
    assert rows[0]["invoice_count"] >= 1
    assert rows[0]["net_sales"] > 0


def test_supplier_ledger_requires_supplier_filter(auth_headers, client: TestClient):
    rows = _report_rows(
        client,
        auth_headers,
        "supplier-ledger",
        from_date=(datetime.now(timezone.utc) - timedelta(days=30)).isoformat(),
    )
    assert rows == []


def test_customer_ledger_report(auth_headers, client: TestClient):
    from tests.test_sales_professionalization import _create_customer

    customer = _create_customer(client, auth_headers, "CUST-RPT-P4")
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    subtotal = product["base_price"]
    tax = round(subtotal * 0.05, 2)
    total = round(subtotal + tax, 2)
    client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json={
            "client_transaction_id": "p4-cust-led-001",
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
            "payments": [{"method": "cash", "amount": 0}],
        },
    )
    from_dt = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    to_dt = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    rows = _report_rows(
        client,
        auth_headers,
        "customer-ledger",
        customer_id=customer["id"],
        from_date=from_dt,
        to_date=to_dt,
    )
    assert rows[0]["transaction_type"] == "opening"
    assert len(rows) >= 2
    assert rows[-1]["balance"] > 0


def test_date_boundary_empty_rows(auth_headers, client: TestClient):
    future = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
    future_end = (datetime.now(timezone.utc) + timedelta(days=366)).isoformat()
    rows = _report_rows(client, auth_headers, "sales-register", from_date=future, to_date=future_end)
    assert rows == []


def test_report_tenant_isolation(auth_headers, client: TestClient, session: Session):
    other = session.exec(select(Company).where(Company.code != "PULSE-DEMO")).first()
    if not other:
        pytest.skip("No second company")
    session.add(
        StockLedger(
            company_id=other.id,
            store_id="foreign-store",
            product_id="foreign-prod",
            transaction_type="adjustment",
            in_qty=999,
            out_qty=0,
            qty_delta=999,
            unit_cost=1,
        )
    )
    session.commit()
    rows = _report_rows(client, auth_headers, "stock-balance")
    assert not any(r.get("item_code") == "foreign-prod" for r in rows)
    assert not any(r.get("closing_qty") == 999 for r in rows)


def test_report_permission_denied(client: TestClient):
    headers = login(client, "cashier@pulse.pos", "cashier123")
    res = client.get("/api/v1/reports/data/sales-register", headers=headers)
    assert res.status_code == 403


def test_professional_report_export_log(auth_headers, client: TestClient, session: Session):
    _grocery_sale(client, auth_headers, "p4-export-log-001", qty=1)
    from_dt = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    to_dt = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    res = client.get(
        "/api/v1/reports/export/sales-register",
        headers=auth_headers,
        params={"from_date": from_dt, "to_date": to_dt},
    )
    assert res.status_code == 200
    assert "text/csv" in res.headers.get("content-type", "")
    exports = session.exec(
        select(ReportExport).where(ReportExport.report_key == "sales-register")
    ).all()
    assert len(exports) >= 1
    assert exports[0].row_count >= 1


def test_dashboard_kpi_endpoint(auth_headers, client: TestClient):
    _grocery_sale(client, auth_headers, "p4-kpi-001", qty=1)
    res = client.get("/api/v1/reports/dashboard-kpi", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    for key in (
        "today_sales",
        "today_collection",
        "today_purchase",
        "current_stock_value",
        "low_stock_count",
        "monthly_sales_trend",
        "top_selling_products",
        "sales_by_payment_method",
        "stock_movement_summary",
    ):
        assert key in data
    assert data["today_sales"] > 0


def test_low_stock_report(auth_headers, client: TestClient):
    res = client.get("/api/v1/reports/data/low-stock", headers=auth_headers)
    assert res.status_code == 200
    assert isinstance(res.json()["rows"], list)
