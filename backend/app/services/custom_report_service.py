"""Whitelisted sources + safe runners for custom reports."""

from __future__ import annotations

import csv
import io
import json
from datetime import datetime
from typing import Any, Optional

from fastapi import HTTPException
from sqlmodel import Session, select

from app.models.inventory import StockLedger
from app.models.core import Store
from app.models.product import Customer, Product, Supplier
from app.models.reports import CustomReport
from app.models.sales import PurchaseInvoice, PurchaseInvoiceLine, SalesInvoice, SalesInvoiceLine


ColumnDef = dict[str, Any]
SourceDef = dict[str, Any]

CUSTOM_REPORT_SOURCES: dict[str, SourceDef] = {
    "sales_lines": {
        "key": "sales_lines",
        "label": "Sales lines",
        "description": "Completed sales invoice lines",
        "date_column": "sale_date",
        "columns": [
            {"code": "sale_date", "label": "Sale date", "type": "date", "filterable": True},
            {"code": "invoice_number", "label": "Invoice no", "type": "text", "filterable": True},
            {"code": "store_code", "label": "Store", "type": "text", "filterable": True},
            {"code": "industry_pack", "label": "Industry pack", "type": "text", "filterable": True},
            {"code": "customer_name", "label": "Customer", "type": "text", "filterable": True},
            {"code": "sku", "label": "SKU", "type": "text", "filterable": True},
            {"code": "product_name", "label": "Product", "type": "text", "filterable": True},
            {"code": "size", "label": "Size", "type": "text", "filterable": True},
            {"code": "color", "label": "Color", "type": "text", "filterable": True},
            {"code": "qty", "label": "Qty", "type": "number", "filterable": False},
            {"code": "unit_price", "label": "Unit price", "type": "number", "filterable": False},
            {"code": "line_total", "label": "Line total", "type": "number", "filterable": False},
            {"code": "status", "label": "Status", "type": "text", "filterable": True},
            {"code": "tender", "label": "Tender", "type": "text", "filterable": True},
        ],
    },
    "purchase_lines": {
        "key": "purchase_lines",
        "label": "Purchase lines",
        "description": "Purchase order lines",
        "date_column": "purchase_date",
        "columns": [
            {"code": "purchase_date", "label": "Purchase date", "type": "date", "filterable": True},
            {"code": "invoice_number", "label": "PO no", "type": "text", "filterable": True},
            {"code": "supplier_name", "label": "Supplier", "type": "text", "filterable": True},
            {"code": "store_code", "label": "Store", "type": "text", "filterable": True},
            {"code": "sku", "label": "SKU", "type": "text", "filterable": True},
            {"code": "product_name", "label": "Product", "type": "text", "filterable": True},
            {"code": "qty", "label": "Ordered qty", "type": "number", "filterable": False},
            {"code": "received_qty", "label": "Received qty", "type": "number", "filterable": False},
            {"code": "unit_cost", "label": "Unit cost", "type": "number", "filterable": False},
            {"code": "line_total", "label": "Line total", "type": "number", "filterable": False},
            {"code": "status", "label": "Status", "type": "text", "filterable": True},
        ],
    },
    "stock_movements": {
        "key": "stock_movements",
        "label": "Stock movements",
        "description": "Posted inventory ledger rows",
        "date_column": "moved_at",
        "columns": [
            {"code": "moved_at", "label": "Date", "type": "date", "filterable": True},
            {"code": "store_code", "label": "Store", "type": "text", "filterable": True},
            {"code": "sku", "label": "SKU", "type": "text", "filterable": True},
            {"code": "product_name", "label": "Product", "type": "text", "filterable": True},
            {"code": "transaction_type", "label": "Type", "type": "text", "filterable": True},
            {"code": "in_qty", "label": "In qty", "type": "number", "filterable": False},
            {"code": "out_qty", "label": "Out qty", "type": "number", "filterable": False},
            {"code": "qty_delta", "label": "Delta", "type": "number", "filterable": False},
            {"code": "balance_after", "label": "Balance after", "type": "number", "filterable": False},
            {"code": "reference_type", "label": "Reference type", "type": "text", "filterable": True},
            {"code": "transaction_ref", "label": "Reference", "type": "text", "filterable": True},
            {"code": "note", "label": "Note", "type": "text", "filterable": False},
        ],
    },
}


def list_sources() -> list[dict[str, Any]]:
    return [
        {
            "key": s["key"],
            "label": s["label"],
            "description": s["description"],
            "date_column": s["date_column"],
            "columns": s["columns"],
        }
        for s in CUSTOM_REPORT_SOURCES.values()
    ]


def get_source(source_key: str) -> SourceDef:
    src = CUSTOM_REPORT_SOURCES.get(source_key)
    if not src:
        raise HTTPException(status_code=400, detail=f"Unknown source: {source_key}")
    return src


def _parse_meta(meta_json: str | None) -> dict[str, Any]:
    if not meta_json:
        return {}
    try:
        data = json.loads(meta_json)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def _match_text(value: Any, needle: str) -> bool:
    if needle is None or needle == "":
        return True
    return needle.lower() in str(value or "").lower()


def _apply_column_filters(row: dict[str, Any], filters: dict[str, str], columns: list[ColumnDef]) -> bool:
    filterable = {c["code"] for c in columns if c.get("filterable")}
    for code, needle in filters.items():
        if code in ("from_date", "to_date", "limit") or not needle:
            continue
        if code not in filterable:
            continue
        if not _match_text(row.get(code), needle):
            return False
    return True


def _project(row: dict[str, Any], columns: list[str], labels: dict[str, str]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for code in columns:
        label = labels.get(code, code)
        out[label] = row.get(code)
    return out


def run_sales_lines(
    session: Session,
    company_id: str,
    from_date: datetime | None,
    to_date: datetime | None,
    filters: dict[str, str],
    limit: int,
) -> list[dict[str, Any]]:
    q = (
        select(SalesInvoiceLine, SalesInvoice, Store, Customer)
        .join(SalesInvoice, SalesInvoice.id == SalesInvoiceLine.invoice_id)
        .join(Store, Store.id == SalesInvoice.store_id, isouter=True)
        .join(Customer, Customer.id == SalesInvoice.customer_id, isouter=True)
        .where(SalesInvoice.company_id == company_id)
        .where(SalesInvoice.status.in_(["completed", "returned"]))
    )
    if from_date:
        q = q.where(SalesInvoice.completed_at >= from_date)
    if to_date:
        q = q.where(SalesInvoice.completed_at <= to_date)
    q = q.order_by(SalesInvoice.completed_at.desc()).limit(max(limit * 3, 500))

    rows: list[dict[str, Any]] = []
    for line, inv, store, customer in session.exec(q).all():
        meta = _parse_meta(line.meta_json)
        row = {
            "sale_date": (inv.completed_at or inv.created_at).isoformat() if (inv.completed_at or inv.created_at) else None,
            "invoice_number": inv.invoice_number,
            "store_code": store.code if store else None,
            "industry_pack": inv.industry_pack,
            "customer_name": customer.name if customer else None,
            "sku": line.sku,
            "product_name": line.name,
            "size": meta.get("size"),
            "color": meta.get("color"),
            "qty": line.qty,
            "unit_price": line.unit_price,
            "line_total": line.line_total,
            "status": inv.status,
            "tender": inv.tender,
        }
        if _apply_column_filters(row, filters, CUSTOM_REPORT_SOURCES["sales_lines"]["columns"]):
            rows.append(row)
        if len(rows) >= limit:
            break
    return rows


def run_purchase_lines(
    session: Session,
    company_id: str,
    from_date: datetime | None,
    to_date: datetime | None,
    filters: dict[str, str],
    limit: int,
) -> list[dict[str, Any]]:
    q = (
        select(PurchaseInvoiceLine, PurchaseInvoice, Product, Supplier, Store)
        .join(PurchaseInvoice, PurchaseInvoice.id == PurchaseInvoiceLine.purchase_id)
        .join(Product, Product.id == PurchaseInvoiceLine.product_id, isouter=True)
        .join(Supplier, Supplier.id == PurchaseInvoice.supplier_id, isouter=True)
        .join(Store, Store.id == PurchaseInvoice.store_id, isouter=True)
        .where(PurchaseInvoice.company_id == company_id)
    )
    if from_date:
        q = q.where(PurchaseInvoice.purchase_date >= from_date)
    if to_date:
        q = q.where(PurchaseInvoice.purchase_date <= to_date)
    q = q.order_by(PurchaseInvoice.purchase_date.desc()).limit(max(limit * 3, 500))

    rows: list[dict[str, Any]] = []
    for line, po, product, supplier, store in session.exec(q).all():
        row = {
            "purchase_date": po.purchase_date.isoformat() if po.purchase_date else None,
            "invoice_number": po.invoice_number,
            "supplier_name": supplier.name if supplier else None,
            "store_code": store.code if store else None,
            "sku": product.sku if product else None,
            "product_name": product.name if product else None,
            "qty": line.qty,
            "received_qty": line.received_qty,
            "unit_cost": line.unit_cost,
            "line_total": line.line_total,
            "status": po.status,
        }
        if _apply_column_filters(row, filters, CUSTOM_REPORT_SOURCES["purchase_lines"]["columns"]):
            rows.append(row)
        if len(rows) >= limit:
            break
    return rows


def run_stock_movements(
    session: Session,
    company_id: str,
    from_date: datetime | None,
    to_date: datetime | None,
    filters: dict[str, str],
    limit: int,
) -> list[dict[str, Any]]:
    q = (
        select(StockLedger, Product, Store)
        .join(Product, Product.id == StockLedger.product_id, isouter=True)
        .join(Store, Store.id == StockLedger.store_id, isouter=True)
        .where(StockLedger.company_id == company_id)
    )
    if from_date:
        q = q.where(StockLedger.created_at >= from_date)
    if to_date:
        q = q.where(StockLedger.created_at <= to_date)
    q = q.order_by(StockLedger.created_at.desc()).limit(max(limit * 3, 500))

    rows: list[dict[str, Any]] = []
    for led, product, store in session.exec(q).all():
        row = {
            "moved_at": led.created_at.isoformat() if led.created_at else None,
            "store_code": store.code if store else None,
            "sku": product.sku if product else None,
            "product_name": product.name if product else None,
            "transaction_type": led.transaction_type,
            "in_qty": led.in_qty,
            "out_qty": led.out_qty,
            "qty_delta": led.qty_delta,
            "balance_after": led.balance_after,
            "reference_type": led.reference_type,
            "transaction_ref": led.transaction_ref,
            "note": led.note,
        }
        if _apply_column_filters(row, filters, CUSTOM_REPORT_SOURCES["stock_movements"]["columns"]):
            rows.append(row)
        if len(rows) >= limit:
            break
    return rows


RUNNERS = {
    "sales_lines": run_sales_lines,
    "purchase_lines": run_purchase_lines,
    "stock_movements": run_stock_movements,
}


def validate_columns(source_key: str, columns: list[str]) -> list[str]:
    src = get_source(source_key)
    allowed = {c["code"] for c in src["columns"]}
    cleaned = [c for c in columns if c in allowed]
    if not cleaned:
        raise HTTPException(status_code=400, detail="Select at least one valid column")
    return cleaned


def create_custom_report(
    session: Session,
    company_id: str,
    user_id: str | None,
    title: str,
    source_key: str,
    columns: list[str],
    column_labels: dict[str, str] | None = None,
) -> CustomReport:
    cols = validate_columns(source_key, columns)
    report = CustomReport(
        company_id=company_id,
        title=title.strip() or "Untitled report",
        source_key=source_key,
        columns_json=json.dumps(cols),
        column_labels_json=json.dumps(column_labels or {}),
        created_by=user_id,
        updated_by=user_id,
        status="active",
    )
    session.add(report)
    session.commit()
    session.refresh(report)
    return report


def update_custom_report(
    session: Session,
    company_id: str,
    user_id: str | None,
    report_id: str,
    *,
    title: str | None = None,
    columns: list[str] | None = None,
    column_labels: dict[str, str] | None = None,
    status: str | None = None,
) -> CustomReport:
    report = session.get(CustomReport, report_id)
    if not report or report.company_id != company_id:
        raise HTTPException(status_code=404, detail="Custom report not found")
    if title is not None:
        report.title = title.strip() or report.title
    if columns is not None:
        report.columns_json = json.dumps(validate_columns(report.source_key, columns))
    if column_labels is not None:
        report.column_labels_json = json.dumps(column_labels)
    if status is not None:
        if status not in ("active", "archived"):
            raise HTTPException(status_code=400, detail="Invalid status")
        report.status = status
    report.updated_by = user_id
    session.add(report)
    session.commit()
    session.refresh(report)
    return report


def list_custom_reports(session: Session, company_id: str, include_archived: bool = False) -> list[CustomReport]:
    q = select(CustomReport).where(CustomReport.company_id == company_id)
    if not include_archived:
        q = q.where(CustomReport.status == "active")
    return list(session.exec(q.order_by(CustomReport.updated_at.desc())).all())


def get_custom_report(session: Session, company_id: str, report_id: str) -> CustomReport:
    report = session.get(CustomReport, report_id)
    if not report or report.company_id != company_id:
        raise HTTPException(status_code=404, detail="Custom report not found")
    return report


def run_custom_report(
    session: Session,
    company_id: str,
    report: CustomReport,
    from_date: datetime | None,
    to_date: datetime | None,
    filters: dict[str, str] | None = None,
    limit: int = 500,
) -> dict[str, Any]:
    columns = json.loads(report.columns_json or "[]")
    labels = json.loads(report.column_labels_json or "{}")
    src = get_source(report.source_key)
    label_map = {c["code"]: labels.get(c["code"]) or c["label"] for c in src["columns"]}
    runner = RUNNERS[report.source_key]
    raw = runner(session, company_id, from_date, to_date, filters or {}, min(max(limit, 1), 2000))
    projected = [_project(r, columns, label_map) for r in raw]
    return {
        "report_id": report.id,
        "title": report.title,
        "source_key": report.source_key,
        "columns": [{"code": c, "label": label_map.get(c, c)} for c in columns],
        "row_count": len(projected),
        "rows": projected,
    }


def custom_report_to_csv(payload: dict[str, Any]) -> str:
    rows = payload.get("rows") or []
    if not rows:
        return ""
    output = io.StringIO()
    fieldnames = list(rows[0].keys())
    writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow({k: row.get(k, "") for k in fieldnames})
    return output.getvalue()


def report_out(report: CustomReport) -> dict[str, Any]:
    return {
        "id": report.id,
        "title": report.title,
        "source_key": report.source_key,
        "columns": json.loads(report.columns_json or "[]"),
        "column_labels": json.loads(report.column_labels_json or "{}"),
        "status": report.status,
        "created_by": report.created_by,
        "updated_by": report.updated_by,
        "created_at": report.created_at.isoformat() if report.created_at else None,
        "updated_at": report.updated_at.isoformat() if report.updated_at else None,
    }
