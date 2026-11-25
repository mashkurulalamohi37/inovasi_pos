"""Phase 6 — Fashion size/color reports, sell-through reconcile, dashboard, RBAC."""

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.inventory import StockLedger
from app.models.product import ProductVariant
from app.rbac import DEFAULT_ROLE_PERMISSIONS, PERMISSIONS
from tests.test_industry_sales import _sale_payload, get_product_by_sku, login
from tests.test_operations import _store_id


def test_fashion_permission_codes_registered():
    codes = {p[0] for p in PERMISSIONS}
    assert "fashion.view" in codes
    assert "fashion.manage" in codes
    assert "fashion.report" in codes
    assert "fashion.view" in DEFAULT_ROLE_PERMISSIONS["Cashier"]
    assert "fashion.manage" in DEFAULT_ROLE_PERMISSIONS["Store Manager"]
    assert "fashion.manage" not in DEFAULT_ROLE_PERMISSIONS["Cashier"]


def test_fashion_size_color_sales_reconciles_to_sale_and_ledger(
    auth_headers, client: TestClient, session: Session
):
    product = get_product_by_sku(client, auth_headers, "FASH-001")
    variant = session.exec(
        select(ProductVariant).where(ProductVariant.variant_code == "FASH-001-M-BLU")
    ).first()
    assert variant is not None
    store_id = _store_id(client, auth_headers)

    sale = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json=_sale_payload(
            f"p6-sale-{uuid.uuid4().hex[:8]}",
            "fashion",
            product["sku"],
            product["name"],
            product["base_price"],
            product_id=product["id"],
            meta={"variant_id": variant.id, "size": variant.size, "color": variant.color},
            store_id=store_id,
        ),
    )
    assert sale.status_code == 200, sale.text

    report = client.get(
        "/api/v1/reports/fashion-size-color-sales",
        headers=auth_headers,
        params={"product_id": product["id"]},
    )
    assert report.status_code == 200, report.text
    rows = report.json()
    match = next((r for r in rows if r.get("variant_id") == variant.id), None)
    assert match is not None, rows
    assert match["sold_qty"] >= 1
    assert match["size"] == variant.size
    assert match["color"] == variant.color

    ledger_out = [
        r
        for r in session.exec(select(StockLedger).where(StockLedger.variant_id == variant.id)).all()
        if (r.out_qty or 0) > 0
    ]
    assert sum(r.out_qty for r in ledger_out) >= match["sold_qty"]
    sell_through = client.get(
        "/api/v1/reports/fashion-variant-sell-through",
        headers=auth_headers,
        params={"product_id": product["id"]},
    )
    assert sell_through.status_code == 200, sell_through.text
    st_row = next((r for r in sell_through.json() if r.get("variant_id") == variant.id), None)
    assert st_row is not None
    assert st_row["sold_qty"] >= 1
    assert "sell_through_pct" in st_row

    catalog = client.get("/api/v1/reports/catalog", headers=auth_headers)
    assert catalog.status_code == 200
    keys = {item["key"] for item in catalog.json()}
    assert "fashion-size-color-sales" in keys
    assert "fashion-variant-sell-through" in keys
    assert "fashion-variant-stock" in keys


def test_fashion_dashboard_kpi(auth_headers, client: TestClient):
    res = client.get("/api/v1/reports/fashion-dashboard-kpi", headers=auth_headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert "today_sales" in body
    assert "today_units" in body
    assert "sell_through_pct" in body
    assert "active_offers" in body
    assert "low_stock_variants" in body
    assert "top_size_color" in body


def test_fashion_rbac_cashier_can_view_not_manage(client: TestClient):
    headers = login(client, "cashier@pulse.pos", "cashier123")
    offers = client.get("/api/v1/industry/fashion/offers", headers=headers)
    assert offers.status_code == 200, offers.text

    create = client.post(
        "/api/v1/industry/fashion/alterations",
        headers=headers,
        json={"customer_name": "Test", "product_sku": "FASH-001", "instruction": "hem"},
    )
    assert create.status_code == 403


def test_fashion_report_data_export_path(auth_headers, client: TestClient):
    data = client.get(
        "/api/v1/reports/data/fashion-size-color-sales",
        headers=auth_headers,
    )
    assert data.status_code == 200, data.text
    assert data.json()["report_code"] == "fashion-size-color-sales"
    assert "rows" in data.json()
