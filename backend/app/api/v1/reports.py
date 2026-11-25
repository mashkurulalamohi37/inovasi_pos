"""Reports API — summaries, professional reports, CSV export, dashboard KPI."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlmodel import Session

from app.database import get_session
from app.dependencies import AuthContext, get_current_user, require_permission, write_audit
from app.reports.registry import get_report_def, list_catalog
from app.services.professional_reports import dashboard_kpi
from app.services.report_service import (
    ReportFilters,
    beef_wastage,
    cashier_report,
    electronics_rma,
    export_report_csv,
    fashion_campaigns,
    fashion_dashboard_kpi,
    fashion_size_color_sales,
    fashion_variant_sell_through,
    fashion_variant_stock,
    grocery_split,
    list_exports,
    margin_report,
    payment_collection,
    purchase_summary,
    require_advanced_reports,
    sales_by_industry,
    sales_summary,
    stock_ledger_rows,
    _rows_for_export,
)
from app.services.subscription_service import get_current_subscription

from app.services.custom_report_service import (
    create_custom_report,
    custom_report_to_csv,
    get_custom_report,
    list_custom_reports,
    list_sources,
    report_out,
    run_custom_report,
    update_custom_report,
)

router = APIRouter(prefix="/reports", tags=["reports"])


def _parse_filters(
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    industry_pack: Optional[str] = None,
    store_id: Optional[str] = None,
    product_id: Optional[str] = None,
    category_id: Optional[str] = None,
    subcategory_id: Optional[str] = None,
    brand_id: Optional[str] = None,
    supplier_id: Optional[str] = None,
    customer_id: Optional[str] = None,
    cashier_id: Optional[str] = None,
    payment_method: Optional[str] = None,
    status: Optional[str] = None,
    transaction_type: Optional[str] = None,
    search: Optional[str] = None,
    ref_no: Optional[str] = None,
    limit: int = 500,
    offset: int = 0,
) -> ReportFilters:
    return ReportFilters(
        from_date=from_date,
        to_date=to_date,
        industry_pack=industry_pack,
        store_id=store_id,
        product_id=product_id,
        category_id=category_id,
        subcategory_id=subcategory_id,
        brand_id=brand_id,
        supplier_id=supplier_id,
        customer_id=customer_id,
        cashier_id=cashier_id,
        payment_method=payment_method,
        status=status,
        transaction_type=transaction_type,
        search=search,
        ref_no=ref_no,
        limit=limit,
        offset=offset,
    )


def _check_report_permission(auth: AuthContext, definition: dict) -> None:
    perm = definition["permission"]
    if not auth.is_platform_admin and auth.role_code not in ("Admin", "Super Admin") and perm not in auth.permissions:
        raise HTTPException(status_code=403, detail=f"Permission required: {perm}")


@router.get("/dashboard-kpi")
def dashboard_kpi_endpoint(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    store_id: Optional[str] = None,
):
    target_store = store_id or auth.store_id
    return dashboard_kpi(session, auth.company_id, store_id=target_store)


@router.get("/fashion-dashboard-kpi")
def fashion_dashboard_kpi_endpoint(
    auth: Annotated[AuthContext, Depends(require_permission("fashion.view"))],
    session: Annotated[Session, Depends(get_session)],
    store_id: Optional[str] = None,
):
    return fashion_dashboard_kpi(session, auth.company_id, store_id=store_id)


@router.get("/catalog")
def report_catalog(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    from app.cache import cache_get_or_set, cache_key

    sub = get_current_subscription(session, auth.company_id)
    advanced = bool(sub.get("limits", {}).get("advanced_reports"))

    def _load():
        return list_catalog(advanced_enabled=advanced)

    return cache_get_or_set(
        cache_key("cfg", auth.company_id, "report_catalog", "adv" if advanced else "basic"),
        _load,
        ttl_seconds=120,
    )


# ── Custom report builder ────────────────────────────────────────────────────

@router.get("/custom/sources")
def custom_report_sources(
    auth: Annotated[AuthContext, Depends(require_permission("reports.view"))],
):
    return list_sources()


@router.get("/custom")
def custom_reports_list(
    auth: Annotated[AuthContext, Depends(require_permission("reports.view"))],
    session: Annotated[Session, Depends(get_session)],
    include_archived: bool = False,
):
    return [report_out(r) for r in list_custom_reports(session, auth.company_id, include_archived)]


@router.post("/custom")
def custom_reports_create(
    auth: Annotated[AuthContext, Depends(require_permission("reports.custom"))],
    session: Annotated[Session, Depends(get_session)],
    body: dict,
):
    title = str(body.get("title") or "").strip()
    source_key = str(body.get("source_key") or "").strip()
    columns = body.get("columns") or []
    column_labels = body.get("column_labels") or {}
    if not title:
        raise HTTPException(status_code=400, detail="title is required")
    if not isinstance(columns, list):
        raise HTTPException(status_code=400, detail="columns must be a list")
    report = create_custom_report(
        session,
        auth.company_id,
        auth.user_id,
        title=title,
        source_key=source_key,
        columns=[str(c) for c in columns],
        column_labels={str(k): str(v) for k, v in dict(column_labels).items()} if column_labels else {},
    )
    write_audit(session, auth, "custom_report.create", "custom_report", report.id, {"title": title, "source": source_key})
    return report_out(report)


@router.get("/custom/{report_id}")
def custom_reports_get(
    report_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("reports.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    return report_out(get_custom_report(session, auth.company_id, report_id))


@router.patch("/custom/{report_id}")
def custom_reports_update(
    report_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("reports.custom"))],
    session: Annotated[Session, Depends(get_session)],
    body: dict,
):
    report = update_custom_report(
        session,
        auth.company_id,
        auth.user_id,
        report_id,
        title=body.get("title"),
        columns=body.get("columns"),
        column_labels=body.get("column_labels"),
        status=body.get("status"),
    )
    write_audit(session, auth, "custom_report.update", "custom_report", report.id, {"title": report.title})
    return report_out(report)


@router.post("/custom/{report_id}/run")
def custom_reports_run(
    report_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("reports.view"))],
    session: Annotated[Session, Depends(get_session)],
    body: dict | None = None,
):
    body = body or {}
    report = get_custom_report(session, auth.company_id, report_id)
    from_raw = body.get("from_date")
    to_raw = body.get("to_date")
    from_date = datetime.fromisoformat(from_raw.replace("Z", "+00:00")) if from_raw else None
    to_date = datetime.fromisoformat(to_raw.replace("Z", "+00:00")) if to_raw else None
    filters = {str(k): str(v) for k, v in dict(body.get("filters") or {}).items() if v not in (None, "")}
    limit = int(body.get("limit") or 500)
    return run_custom_report(session, auth.company_id, report, from_date, to_date, filters, limit)


@router.get("/custom/{report_id}/export")
def custom_reports_export(
    report_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("reports.export"))],
    session: Annotated[Session, Depends(get_session)],
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    limit: int = Query(2000, ge=1, le=5000),
):
    report = get_custom_report(session, auth.company_id, report_id)
    payload = run_custom_report(session, auth.company_id, report, from_date, to_date, {}, limit)
    csv_text = custom_report_to_csv(payload)
    write_audit(
        session, auth, "custom_report.export", "custom_report", report.id,
        {"rows": payload["row_count"], "title": report.title},
    )
    filename = f"custom-{report.id[:8]}-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.csv"
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/data/{report_code}")
def report_data(
    report_code: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    industry_pack: Optional[str] = None,
    store_id: Optional[str] = None,
    product_id: Optional[str] = None,
    category_id: Optional[str] = None,
    subcategory_id: Optional[str] = None,
    brand_id: Optional[str] = None,
    supplier_id: Optional[str] = None,
    customer_id: Optional[str] = None,
    cashier_id: Optional[str] = None,
    payment_method: Optional[str] = None,
    status: Optional[str] = None,
    transaction_type: Optional[str] = None,
    search: Optional[str] = None,
    ref_no: Optional[str] = None,
    limit: int = Query(500, ge=1, le=5000),
    offset: int = Query(0, ge=0),
):
    normalized_code = report_code.replace("_", "-")
    definition = get_report_def(normalized_code)
    if not definition:
        raise HTTPException(status_code=404, detail="Unknown report code")
    _check_report_permission(auth, definition)
    if definition.get("advanced"):
        require_advanced_reports(session, auth.company_id)
    filters = _parse_filters(
        from_date, to_date, industry_pack, store_id, product_id, category_id, subcategory_id, brand_id,
        supplier_id, customer_id, cashier_id, payment_method, status, transaction_type,
        search, ref_no, limit, offset,
    )
    rows = _rows_for_export(session, auth.company_id, normalized_code, filters)
    return {
        "report_code": report_code,
        "rows": rows,
        "row_count": len(rows),
        "offset": offset,
        "limit": limit,
        "filters": {
            k: v for k, v in {
                "from_date": from_date.isoformat() if from_date else None,
                "to_date": to_date.isoformat() if to_date else None,
                "store_id": store_id,
                "product_id": product_id,
                "supplier_id": supplier_id,
                "customer_id": customer_id,
            }.items() if v is not None
        },
    }


@router.get("/sales-summary")
def sales_summary_endpoint(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    industry_pack: Optional[str] = None,
    store_id: Optional[str] = None,
):
    return sales_summary(session, auth.company_id, _parse_filters(from_date, to_date, industry_pack, store_id))


@router.get("/sales-by-industry")
def sales_by_industry_endpoint(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    store_id: Optional[str] = None,
):
    return sales_by_industry(session, auth.company_id, _parse_filters(from_date, to_date, None, store_id))


@router.get("/grocery-wholesale-retail")
def grocery_split_endpoint(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    store_id: Optional[str] = None,
):
    return grocery_split(session, auth.company_id, _parse_filters(from_date, to_date, None, store_id))


@router.get("/fashion-campaigns")
def fashion_campaigns_endpoint(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    store_id: Optional[str] = None,
):
    require_advanced_reports(session, auth.company_id)
    return fashion_campaigns(session, auth.company_id, _parse_filters(from_date, to_date, None, store_id))


@router.get("/fashion-size-color-sales")
def fashion_size_color_sales_endpoint(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    store_id: Optional[str] = None,
    product_id: Optional[str] = None,
):
    return fashion_size_color_sales(
        session,
        auth.company_id,
        _parse_filters(from_date, to_date, None, store_id, product_id),
    )


@router.get("/fashion-variant-sell-through")
def fashion_variant_sell_through_endpoint(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    store_id: Optional[str] = None,
    product_id: Optional[str] = None,
):
    return fashion_variant_sell_through(
        session,
        auth.company_id,
        _parse_filters(from_date, to_date, None, store_id, product_id),
    )


@router.get("/fashion-variant-stock")
def fashion_variant_stock_endpoint(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    product_id: Optional[str] = None,
):
    return fashion_variant_stock(
        session,
        auth.company_id,
        _parse_filters(product_id=product_id),
    )


@router.get("/beef-wastage")
def beef_wastage_endpoint(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    require_advanced_reports(session, auth.company_id)
    return beef_wastage(session, auth.company_id)

@router.get("/electronics-rma")
def electronics_rma_endpoint(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    require_advanced_reports(session, auth.company_id)
    return electronics_rma(session, auth.company_id)


@router.get("/purchase-summary")
def purchase_summary_endpoint(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    return purchase_summary(session, auth.company_id)


@router.get("/payment-collection")
def payment_collection_endpoint(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
):
    return payment_collection(session, auth.company_id, _parse_filters(from_date, to_date))


@router.get("/stock-ledger")
def stock_ledger_endpoint(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    limit: int = Query(50, ge=1, le=500),
):
    return stock_ledger_rows(session, auth.company_id, limit)


@router.get("/cashier")
def cashier_report_endpoint(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    industry_pack: Optional[str] = None,
    store_id: Optional[str] = None,
):
    return cashier_report(session, auth.company_id, _parse_filters(from_date, to_date, industry_pack, store_id))


@router.get("/margin")
def margin_report_endpoint(
    auth: Annotated[AuthContext, Depends(require_permission("reports.margin"))],
    session: Annotated[Session, Depends(get_session)],
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    industry_pack: Optional[str] = None,
    store_id: Optional[str] = None,
    limit: int = Query(500, ge=1, le=5000),
):
    require_advanced_reports(session, auth.company_id)
    f = _parse_filters(from_date, to_date, industry_pack, store_id, limit=limit)
    rows = margin_report(session, auth.company_id, f)
    total_revenue = sum(r["revenue"] for r in rows)
    total_cost = sum(r["cost"] for r in rows)
    total_margin = round(total_revenue - total_cost, 2)
    return {
        "summary": {
            "line_count": len(rows),
            "revenue": round(total_revenue, 2),
            "cost": round(total_cost, 2),
            "margin": total_margin,
            "margin_pct": round((total_margin / total_revenue * 100) if total_revenue else 0, 2),
        },
        "lines": rows,
    }


@router.get("/exports")
def list_report_exports(
    auth: Annotated[AuthContext, Depends(require_permission("reports.export"))],
    session: Annotated[Session, Depends(get_session)],
    limit: int = Query(50, ge=1, le=200),
):
    return list_exports(session, auth.company_id, limit)


@router.get("/export/{report_key}")
def download_report_csv(
    report_key: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    industry_pack: Optional[str] = None,
    store_id: Optional[str] = None,
    product_id: Optional[str] = None,
    category_id: Optional[str] = None,
    subcategory_id: Optional[str] = None,
    brand_id: Optional[str] = None,
    supplier_id: Optional[str] = None,
    customer_id: Optional[str] = None,
    cashier_id: Optional[str] = None,
    payment_method: Optional[str] = None,
    status: Optional[str] = None,
    transaction_type: Optional[str] = None,
    search: Optional[str] = None,
    ref_no: Optional[str] = None,
):
    definition = get_report_def(report_key)
    if not definition:
        raise HTTPException(status_code=404, detail="Unknown report key")
    _check_report_permission(auth, definition)
    if not definition.get("formats", {}).get("csv", True):
        raise HTTPException(status_code=400, detail="CSV export not available for this report")
    filters = _parse_filters(
        from_date, to_date, industry_pack, store_id, product_id, category_id, subcategory_id, brand_id,
        supplier_id, customer_id, cashier_id, payment_method, status, transaction_type,
        search, ref_no, limit=5000,
    )
    csv_text, filename, row_count = export_report_csv(
        session, auth.company_id, auth.user_id, report_key, filters,
    )
    write_audit(session, auth, "report_export", "report", report_key, {"row_count": row_count, "format": "csv"})
    session.commit()
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/export")
def export_report_post(
    report_key: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    industry_pack: Optional[str] = None,
    store_id: Optional[str] = None,
    product_id: Optional[str] = None,
    category_id: Optional[str] = None,
    brand_id: Optional[str] = None,
    supplier_id: Optional[str] = None,
    customer_id: Optional[str] = None,
    cashier_id: Optional[str] = None,
    payment_method: Optional[str] = None,
    status: Optional[str] = None,
    transaction_type: Optional[str] = None,
    search: Optional[str] = None,
    ref_no: Optional[str] = None,
):
    """POST export — returns CSV attachment (audit logged)."""
    return download_report_csv(
        report_key, auth, session, from_date, to_date, industry_pack, store_id,
        product_id, category_id, brand_id, supplier_id, customer_id, cashier_id,
        payment_method, status, transaction_type, search, ref_no,
    )
