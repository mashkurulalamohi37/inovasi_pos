"""Phase 6 reporting — CSV export, margin, catalog, date filters."""

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.reports import ReportExport

from test_operations import _grocery_sale


def test_report_catalog(auth_headers, client: TestClient):
    res = client.get("/api/v1/reports/catalog", headers=auth_headers)
    assert res.status_code == 200
    keys = {r["key"] for r in res.json()}
    assert "sales-summary" in keys
    assert "margin-report" in keys


def test_export_sales_summary_csv(auth_headers, client: TestClient, session: Session):
    _grocery_sale(client, auth_headers, "p6-export-001", qty=1)
    res = client.get("/api/v1/reports/export/sales-summary", headers=auth_headers)
    assert res.status_code == 200
    assert "text/csv" in res.headers.get("content-type", "")
    body = res.text
    assert "metric" in body or "invoice_count" in body or "value" in body
    exports = session.exec(select(ReportExport).where(ReportExport.report_key == "sales-summary")).all()
    assert len(exports) >= 1


def test_margin_report(auth_headers, client: TestClient):
    _grocery_sale(client, auth_headers, "p6-margin-001", qty=2)
    res = client.get("/api/v1/reports/margin", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert "summary" in data
    assert data["summary"]["line_count"] >= 1


def test_export_margin_csv(auth_headers, client: TestClient):
    _grocery_sale(client, auth_headers, "p6-margin-csv", qty=1)
    res = client.get("/api/v1/reports/export/margin-report", headers=auth_headers)
    assert res.status_code == 200
    assert "sku" in res.text.lower() or "margin" in res.text.lower()


def test_cashier_report(auth_headers, client: TestClient):
    _grocery_sale(client, auth_headers, "p6-cashier-001", qty=1)
    res = client.get("/api/v1/reports/cashier", headers=auth_headers)
    assert res.status_code == 200
    rows = res.json()
    assert len(rows) >= 1
    assert rows[0]["invoice_count"] >= 1


def test_list_exports(auth_headers, client: TestClient):
    client.get("/api/v1/reports/export/sales-summary", headers=auth_headers)
    res = client.get("/api/v1/reports/exports", headers=auth_headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list)
