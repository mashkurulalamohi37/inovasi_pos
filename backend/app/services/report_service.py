"""Reporting service — query builders, CSV export, margin/cashier."""

from __future__ import annotations

import csv
import io
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlmodel import Session, select, func

from app.models.core import UserAccount
from app.models.industry import BeefWastage, ElectronicsRma, FashionOffer, FashionProductVariant, FashionSalesLineExtension
from app.models.inventory import StockBalance, StockLedger
from app.models.product import Product, ProductVariant
from app.models.reports import ReportExport
from app.models.sales import Payment, PurchaseInvoice, SalesInvoice, SalesInvoiceLine
from app.reports.registry import get_report_def
from app.services.subscription_service import get_current_subscription


@dataclass
class ReportFilters:
    from_date: datetime | None = None
    to_date: datetime | None = None
    industry_pack: str | None = None
    store_id: str | None = None
    product_id: str | None = None
    category_id: str | None = None
    subcategory_id: str | None = None
    brand_id: str | None = None
    supplier_id: str | None = None
    customer_id: str | None = None
    cashier_id: str | None = None
    payment_method: str | None = None
    status: str | None = None
    transaction_type: str | None = None
    search: str | None = None
    ref_no: str | None = None
    limit: int = 5000
    offset: int = 0


def require_advanced_reports(session: Session, company_id: str) -> None:
    sub = get_current_subscription(session, company_id)
    if not sub.get("limits", {}).get("advanced_reports"):
        raise HTTPException(
            status_code=403,
            detail="Advanced reports require Professional or Enterprise plan.",
        )


def _invoice_date_col():
    return func.coalesce(SalesInvoice.completed_at, SalesInvoice.created_at)


def _apply_invoice_filters(q, company_id: str, filters: ReportFilters):
    q = q.where(SalesInvoice.company_id == company_id, SalesInvoice.status == "completed")
    if filters.from_date:
        q = q.where(_invoice_date_col() >= filters.from_date)
    if filters.to_date:
        q = q.where(_invoice_date_col() <= filters.to_date)
    if filters.industry_pack:
        q = q.where(SalesInvoice.industry_pack == filters.industry_pack)
    if filters.store_id:
        q = q.where(SalesInvoice.store_id == filters.store_id)
    return q


def sales_summary(session: Session, company_id: str, filters: ReportFilters) -> dict[str, Any]:
    q = select(func.count(SalesInvoice.id), func.coalesce(func.sum(SalesInvoice.total), 0))
    q = _apply_invoice_filters(q, company_id, filters)
    rows = session.exec(q).one()
    return {"invoice_count": rows[0], "total_sales": float(rows[1])}


def sales_by_industry(session: Session, company_id: str, filters: ReportFilters) -> list[dict[str, Any]]:
    q = select(SalesInvoice)
    q = _apply_invoice_filters(q, company_id, filters)
    invoices = session.exec(q).all()
    by_ind: dict[str, float] = {}
    for inv in invoices:
        by_ind[inv.industry_pack] = by_ind.get(inv.industry_pack, 0) + inv.total
    return [{"industry_pack": k, "total": v} for k, v in sorted(by_ind.items())]


def grocery_split(session: Session, company_id: str, filters: ReportFilters) -> dict[str, float]:
    f = ReportFilters(
        from_date=filters.from_date,
        to_date=filters.to_date,
        industry_pack="grocery",
        store_id=filters.store_id,
    )
    q = select(SalesInvoice)
    q = _apply_invoice_filters(q, company_id, f)
    invoices = session.exec(q).all()
    retail = sum(i.total for i in invoices if i.price_mode != "wholesale")
    wholesale = sum(i.total for i in invoices if i.price_mode == "wholesale")
    return {"retail": retail, "wholesale": wholesale}


def fashion_campaigns(session: Session, company_id: str, filters: ReportFilters) -> list[dict[str, Any]]:
    f = ReportFilters(
        from_date=filters.from_date,
        to_date=filters.to_date,
        industry_pack="fashion",
        store_id=filters.store_id,
    )
    q = select(SalesInvoice).where(SalesInvoice.campaign_name.isnot(None))  # type: ignore
    q = _apply_invoice_filters(q, company_id, f)
    invoices = session.exec(q).all()
    qty_by_inv: dict[str, float] = {}
    if invoices:
        for inv_id, qty in session.exec(
            select(SalesInvoiceLine.invoice_id, func.coalesce(func.sum(SalesInvoiceLine.qty), 0)).where(
                SalesInvoiceLine.invoice_id.in_([i.id for i in invoices])  # type: ignore
            ).group_by(SalesInvoiceLine.invoice_id)
        ).all():
            qty_by_inv[inv_id] = float(qty or 0)
    campaigns: dict[str, dict[str, Any]] = {}
    for inv in invoices:
        name = inv.campaign_name or "Unknown"
        if name not in campaigns:
            campaigns[name] = {
                "campaign_name": name,
                "sales_value": 0.0,
                "discount_value": 0.0,
                "net_sales": 0.0,
                "items_sold": 0.0,
            }
        campaigns[name]["sales_value"] += inv.total
        campaigns[name]["discount_value"] += inv.discount
        campaigns[name]["net_sales"] += inv.total - inv.discount
        campaigns[name]["items_sold"] += qty_by_inv.get(inv.id, 0.0)
    return list(campaigns.values())

def _parse_line_meta(meta_json: str | None) -> dict[str, Any]:
    if not meta_json:
        return {}
    try:
        data = json.loads(meta_json)
        return data if isinstance(data, dict) else {}
    except (TypeError, json.JSONDecodeError):
        return {}


def _fashion_sale_lines(
    session: Session, company_id: str, filters: ReportFilters
) -> list[tuple[SalesInvoice, SalesInvoiceLine]]:
    f = ReportFilters(
        from_date=filters.from_date,
        to_date=filters.to_date,
        industry_pack="fashion",
        store_id=filters.store_id,
        product_id=filters.product_id,
        limit=filters.limit,
    )
    q = select(SalesInvoice)
    q = _apply_invoice_filters(q, company_id, f)
    invoices = session.exec(q).all()
    if not invoices:
        return []
    inv_by_id = {i.id: i for i in invoices}
    lines = session.exec(
        select(SalesInvoiceLine).where(SalesInvoiceLine.invoice_id.in_(list(inv_by_id.keys())))  # type: ignore
    ).all()
    out: list[tuple[SalesInvoice, SalesInvoiceLine]] = []
    for ln in lines:
        if filters.product_id and ln.product_id != filters.product_id:
            continue
        inv = inv_by_id.get(ln.invoice_id)
        if inv:
            out.append((inv, ln))
    return out


def _resolve_fashion_variant(
    session: Session,
    company_id: str,
    line: SalesInvoiceLine,
    ext_by_line: dict[str, FashionSalesLineExtension],
) -> ProductVariant | None:
    ext = ext_by_line.get(line.id)
    variant_id = None
    if ext and ext.variant_id:
        variant_id = ext.variant_id
    else:
        meta = _parse_line_meta(line.meta_json)
        variant_id = meta.get("variant_id") or meta.get("productId")
    if not variant_id:
        return None
    variant = session.get(ProductVariant, variant_id)
    if variant and variant.company_id == company_id:
        return variant
    # Legacy FashionProductVariant id may appear on older lines
    legacy = session.get(FashionProductVariant, variant_id)
    if not legacy:
        return None
    stmt = select(ProductVariant).where(
        ProductVariant.company_id == company_id,
        ProductVariant.product_id == legacy.product_id,
        ProductVariant.size == legacy.size,
        ProductVariant.color == legacy.color,
    )
    return session.exec(stmt).first()


def fashion_size_color_sales(session: Session, company_id: str, filters: ReportFilters) -> list[dict[str, Any]]:
    pairs = _fashion_sale_lines(session, company_id, filters)
    if not pairs:
        return []
    line_ids = [ln.id for _, ln in pairs]
    ext_rows = session.exec(
        select(FashionSalesLineExtension).where(FashionSalesLineExtension.line_id.in_(line_ids))  # type: ignore
    ).all()
    ext_by_line = {e.line_id: e for e in ext_rows}

    buckets: dict[str, dict[str, Any]] = {}
    for _inv, ln in pairs:
        variant = _resolve_fashion_variant(session, company_id, ln, ext_by_line)
        size = (variant.size if variant else None) or _parse_line_meta(ln.meta_json).get("size") or ""
        color = (variant.color if variant else None) or _parse_line_meta(ln.meta_json).get("color") or ""
        variant_code = variant.variant_code if variant else ""
        variant_id = variant.id if variant else ""
        key = f"{ln.product_id or ln.sku}|{size}|{color}|{variant_id}"
        if key not in buckets:
            buckets[key] = {
                "product_id": ln.product_id or "",
                "sku": ln.sku,
                "name": ln.name,
                "variant_id": variant_id,
                "variant_code": variant_code,
                "size": size,
                "color": color,
                "sold_qty": 0.0,
                "revenue": 0.0,
                "line_count": 0,
            }
        buckets[key]["sold_qty"] += float(ln.qty or 0)
        buckets[key]["revenue"] += float(ln.line_total or 0)
        buckets[key]["line_count"] += 1

    rows = list(buckets.values())
    for row in rows:
        row["sold_qty"] = round(row["sold_qty"], 2)
        row["revenue"] = round(row["revenue"], 2)
    rows.sort(key=lambda r: (-r["sold_qty"], r["sku"], r["size"], r["color"]))
    return rows[: filters.limit]


def fashion_variant_sell_through(session: Session, company_id: str, filters: ReportFilters) -> list[dict[str, Any]]:
    sales_rows = fashion_size_color_sales(session, company_id, filters)
    if not sales_rows and not filters.product_id:
        # Still show stocked variants with zero sales in period
        sales_rows = []

    sold_by_variant: dict[str, dict[str, Any]] = {
        r["variant_id"]: r for r in sales_rows if r.get("variant_id")
    }

    # Received qty from ledger (inbound with variant_id)
    ledger_q = select(StockLedger).where(
        StockLedger.company_id == company_id,
        StockLedger.variant_id.isnot(None),  # type: ignore
        StockLedger.in_qty > 0,  # type: ignore
    )
    if filters.store_id:
        ledger_q = ledger_q.where(StockLedger.store_id == filters.store_id)
    if filters.from_date:
        ledger_q = ledger_q.where(StockLedger.created_at >= filters.from_date)  # type: ignore
    if filters.to_date:
        ledger_q = ledger_q.where(StockLedger.created_at <= filters.to_date)  # type: ignore
    received: dict[str, float] = {}
    for led in session.exec(ledger_q).all():
        vid = led.variant_id or ""
        if not vid:
            continue
        if filters.product_id and led.product_id != filters.product_id:
            continue
        received[vid] = received.get(vid, 0.0) + float(led.in_qty or 0)

    # Option B on-hand mirror via ProductVariant → FashionProductVariant
    variant_ids = set(sold_by_variant.keys()) | set(received.keys())
    if filters.product_id and not variant_ids:
        for v in session.exec(
            select(ProductVariant).where(
                ProductVariant.company_id == company_id,
                ProductVariant.product_id == filters.product_id,
            )
        ).all():
            variant_ids.add(v.id)

    rows: list[dict[str, Any]] = []
    for vid in sorted(variant_ids):
        variant = session.get(ProductVariant, vid)
        if not variant or variant.company_id != company_id:
            continue
        if filters.product_id and variant.product_id != filters.product_id:
            continue
        sold = sold_by_variant.get(vid, {})
        sold_qty = float(sold.get("sold_qty") or 0)
        recv_qty = round(received.get(vid, 0.0), 2)
        legacy = session.exec(
            select(FashionProductVariant).where(
                FashionProductVariant.product_id == variant.product_id,
                FashionProductVariant.size == variant.size,
                FashionProductVariant.color == variant.color,
            )
        ).first()
        on_hand = float(legacy.stock_qty if legacy else 0)
        denom = sold_qty + on_hand
        sell_through = round((sold_qty / denom * 100) if denom else 0.0, 2)
        recv_denom = recv_qty if recv_qty else 0.0
        sell_through_recv = round((sold_qty / recv_denom * 100) if recv_denom else 0.0, 2)
        product = session.get(Product, variant.product_id)
        rows.append({
            "variant_id": vid,
            "product_id": variant.product_id,
            "sku": product.sku if product else (sold.get("sku") or ""),
            "name": product.name if product else (sold.get("name") or ""),
            "variant_code": variant.variant_code,
            "size": variant.size or "",
            "color": variant.color or "",
            "sold_qty": round(sold_qty, 2),
            "received_qty": recv_qty,
            "on_hand_qty": round(on_hand, 2),
            "revenue": round(float(sold.get("revenue") or 0), 2),
            "sell_through_pct": sell_through,
            "sell_through_vs_received_pct": sell_through_recv,
        })
    rows.sort(key=lambda r: (-r["sold_qty"], r["sku"], r["size"], r["color"]))
    return rows[: filters.limit]


def fashion_variant_stock(session: Session, company_id: str, filters: ReportFilters) -> list[dict[str, Any]]:
    q = select(ProductVariant).where(
        ProductVariant.company_id == company_id,
        ProductVariant.is_active == True,  # noqa: E712
    )
    if filters.product_id:
        q = q.where(ProductVariant.product_id == filters.product_id)
    variants = session.exec(q).all()
    rows: list[dict[str, Any]] = []
    for variant in variants:
        product = session.get(Product, variant.product_id)
        if not product or product.company_id != company_id:
            continue
        if (product.industry_pack or "") != "fashion":
            continue
        legacy = session.exec(
            select(FashionProductVariant).where(
                FashionProductVariant.product_id == variant.product_id,
                FashionProductVariant.size == variant.size,
                FashionProductVariant.color == variant.color,
            )
        ).first()
        rows.append({
            "variant_id": variant.id,
            "product_id": variant.product_id,
            "sku": product.sku,
            "name": product.name,
            "variant_code": variant.variant_code,
            "size": variant.size or "",
            "color": variant.color or "",
            "barcode": variant.barcode or "",
            "on_hand_qty": round(float(legacy.stock_qty if legacy else 0), 2),
        })
    rows.sort(key=lambda r: (r["sku"], r["size"], r["color"]))
    return rows[: filters.limit]


def fashion_dashboard_kpi(session: Session, company_id: str, store_id: str | None = None) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = today_start.replace(day=1)

    def _fashion_invoices(from_dt: datetime) -> list[SalesInvoice]:
        f = ReportFilters(from_date=from_dt, industry_pack="fashion", store_id=store_id)
        q = select(SalesInvoice)
        q = _apply_invoice_filters(q, company_id, f)
        return list(session.exec(q).all())

    today_invoices = _fashion_invoices(today_start)
    month_invoices = _fashion_invoices(month_start)
    today_sales = sum(i.total for i in today_invoices)

    today_units = 0.0
    if today_invoices:
        today_units = float(
            session.exec(
                select(func.coalesce(func.sum(SalesInvoiceLine.qty), 0)).where(
                    SalesInvoiceLine.invoice_id.in_([i.id for i in today_invoices])  # type: ignore
                )
            ).one()
            or 0
        )

    month_filters = ReportFilters(from_date=month_start, industry_pack="fashion", store_id=store_id, limit=5000)
    size_color = fashion_size_color_sales(session, company_id, month_filters)
    top_size_color = [
        {
            "size": r["size"],
            "color": r["color"],
            "variant_code": r["variant_code"],
            "name": r["name"],
            "sold_qty": r["sold_qty"],
            "revenue": r["revenue"],
        }
        for r in size_color[:5]
    ]

    sell_rows = fashion_variant_sell_through(session, company_id, month_filters)
    sold_sum = sum(r["sold_qty"] for r in sell_rows)
    on_hand_sum = sum(r["on_hand_qty"] for r in sell_rows)
    sell_through_pct = round((sold_sum / (sold_sum + on_hand_sum) * 100) if (sold_sum + on_hand_sum) else 0.0, 2)

    active_offers = session.exec(
        select(func.count(FashionOffer.id)).where(
            FashionOffer.company_id == company_id,
            FashionOffer.is_active == True,  # noqa: E712
        )
    ).one()

    low_threshold = 5.0
    low_variants = 0
    for row in fashion_variant_stock(session, company_id, ReportFilters(limit=5000)):
        if row["on_hand_qty"] <= low_threshold:
            low_variants += 1

    campaign_sales = sum(
        float(r.get("net_sales") or 0)
        for r in fashion_campaigns(
            session,
            company_id,
            ReportFilters(from_date=today_start, industry_pack="fashion", store_id=store_id),
        )
    )

    return {
        "today_sales": round(today_sales, 2),
        "today_units": round(today_units, 2),
        "month_invoice_count": len(month_invoices),
        "sell_through_pct": sell_through_pct,
        "active_offers": int(active_offers or 0),
        "low_stock_variants": low_variants,
        "campaign_sales_today": round(campaign_sales, 2),
        "top_size_color": top_size_color,
    }

def beef_wastage(session: Session, company_id: str) -> list[dict[str, Any]]:
    rows = session.exec(select(BeefWastage).where(BeefWastage.company_id == company_id)).all()
    return [
        {
            "id": r.id,
            "wastage_kg": r.wastage_kg,
            "wastage_type": r.wastage_type,
            "reason": r.reason,
            "recorded_at": r.recorded_at.isoformat() if r.recorded_at else "",
        }
        for r in rows
    ]


def electronics_rma(session: Session, company_id: str) -> list[dict[str, Any]]:
    rows = session.exec(select(ElectronicsRma).where(ElectronicsRma.company_id == company_id)).all()
    return [
        {
            "id": r.id,
            "serial_imei": r.serial_imei,
            "action_type": r.action_type,
            "approval_status": r.approval_status,
        }
        for r in rows
    ]


def purchase_summary(session: Session, company_id: str) -> dict[str, Any]:
    rows = session.exec(select(PurchaseInvoice).where(PurchaseInvoice.company_id == company_id)).all()
    return {
        "count": len(rows),
        "total_amount": sum(r.total for r in rows),
        "due_amount": sum(r.due_amount or 0 for r in rows),
        "by_status": {s: len([r for r in rows if r.status == s]) for s in {r.status for r in rows}},
    }


def payment_collection(session: Session, company_id: str, filters: ReportFilters) -> dict[str, Any]:
    q = select(Payment).where(Payment.company_id == company_id)
    if filters.from_date:
        q = q.where(Payment.created_at >= filters.from_date)  # type: ignore
    if filters.to_date:
        q = q.where(Payment.created_at <= filters.to_date)  # type: ignore
    rows = session.exec(q).all()
    return {
        "collected": sum(p.amount for p in rows if p.direction == "in"),
        "refunded": sum(p.amount for p in rows if p.direction == "out"),
        "count": len(rows),
    }


def stock_ledger_rows(session: Session, company_id: str, limit: int = 50) -> list[dict[str, Any]]:
    rows = session.exec(
        select(StockLedger)
        .where(StockLedger.company_id == company_id)
        .order_by(StockLedger.created_at.desc())  # type: ignore
        .limit(limit)
    ).all()
    return [
        {
            "id": r.id,
            "transaction_type": r.transaction_type,
            "in_qty": r.in_qty,
            "out_qty": r.out_qty,
            "reference_id": r.reference_id or "",
            "created_at": r.created_at.isoformat() if r.created_at else "",
        }
        for r in rows
    ]


def cashier_report(session: Session, company_id: str, filters: ReportFilters) -> list[dict[str, Any]]:
    q = select(SalesInvoice)
    q = _apply_invoice_filters(q, company_id, filters)
    invoices = session.exec(q).all()
    by_cashier: dict[str, dict[str, Any]] = {}
    for inv in invoices:
        cid = inv.cashier_id or "unknown"
        if cid not in by_cashier:
            user = session.get(UserAccount, cid) if cid != "unknown" else None
            by_cashier[cid] = {
                "cashier_id": cid,
                "cashier_email": user.email if user else "",
                "invoice_count": 0,
                "total_sales": 0.0,
            }
        by_cashier[cid]["invoice_count"] += 1
        by_cashier[cid]["total_sales"] += inv.total
    return sorted(by_cashier.values(), key=lambda x: -x["total_sales"])


def margin_report(session: Session, company_id: str, filters: ReportFilters) -> list[dict[str, Any]]:
    q = select(SalesInvoice)
    q = _apply_invoice_filters(q, company_id, filters)
    invoices = session.exec(q).all()
    if not invoices:
        return []
    inv_ids = [i.id for i in invoices]
    lines = session.exec(select(SalesInvoiceLine).where(SalesInvoiceLine.invoice_id.in_(inv_ids))).all()  # type: ignore
    product_ids = {ln.product_id for ln in lines if ln.product_id}
    products = {
        p.id: p
        for p in session.exec(select(Product).where(Product.id.in_(list(product_ids)))).all()  # type: ignore
    } if product_ids else {}

    def unit_cost(product_id: str | None) -> float:
        if not product_id:
            return 0.0
        prod = products.get(product_id)
        if prod and prod.cost_price:
            return float(prod.cost_price)
        bal = session.exec(
            select(StockBalance).where(
                StockBalance.company_id == company_id,
                StockBalance.product_id == product_id,
            )
        ).first()
        if bal and bal.unit_cost_avg:
            return float(bal.unit_cost_avg)
        return 0.0

    rows: list[dict[str, Any]] = []
    for ln in lines:
        cost = unit_cost(ln.product_id) * ln.qty
        revenue = ln.line_total
        margin = round(revenue - cost, 2)
        margin_pct = round((margin / revenue * 100) if revenue else 0, 2)
        rows.append({
            "sku": ln.sku,
            "name": ln.name,
            "qty": ln.qty,
            "revenue": revenue,
            "cost": round(cost, 2),
            "margin": margin,
            "margin_pct": margin_pct,
        })
    return rows[: filters.limit]


def _rows_for_export(session: Session, company_id: str, report_key: str, filters: ReportFilters) -> list[dict[str, Any]]:
    report_key = report_key.replace("_", "-")
    if report_key == "sales-summary":
        s = sales_summary(session, company_id, filters)
        return [{"metric": k, "value": v} for k, v in s.items()]
    if report_key == "sales-by-industry":
        return sales_by_industry(session, company_id, filters)
    if report_key == "grocery-wholesale-retail":
        s = grocery_split(session, company_id, filters)
        return [{"mode": k, "total": v} for k, v in s.items()]
    if report_key == "fashion-campaigns":
        return fashion_campaigns(session, company_id, filters)
    if report_key == "fashion-size-color-sales":
        return fashion_size_color_sales(session, company_id, filters)
    if report_key == "fashion-variant-sell-through":
        return fashion_variant_sell_through(session, company_id, filters)
    if report_key == "fashion-variant-stock":
        return fashion_variant_stock(session, company_id, filters)
    if report_key == "beef-wastage":
        return beef_wastage(session, company_id)
    if report_key == "electronics-rma":
        return electronics_rma(session, company_id)
    if report_key == "purchase-summary":
        s = purchase_summary(session, company_id)
        rows = [{"metric": k, "value": v} for k, v in s.items() if k != "by_status"]
        for status, count in s.get("by_status", {}).items():
            rows.append({"metric": f"status_{status}", "value": count})
        return rows
    if report_key == "payment-collection":
        s = payment_collection(session, company_id, filters)
        return [{"metric": k, "value": v} for k, v in s.items()]
    if report_key == "stock-ledger":
        return stock_ledger_rows(session, company_id, limit=min(filters.limit, 500))
    if report_key == "cashier-report":
        return cashier_report(session, company_id, filters)
    if report_key == "margin-report":
        return margin_report(session, company_id, filters)
    if report_key == "dashboard-kpi":
        from app.services.professional_reports import dashboard_kpi

        kpi = dashboard_kpi(session, company_id)
        rows: list[dict[str, Any]] = []
        for key, value in kpi.items():
            if isinstance(value, (dict, list)):
                continue
            rows.append({"metric": key, "value": value})
        return rows
    from app.services.professional_reports import PROFESSIONAL_REPORT_RUNNERS, run_professional_report
    if report_key in PROFESSIONAL_REPORT_RUNNERS:
        return run_professional_report(session, company_id, report_key, filters)
    raise HTTPException(status_code=404, detail="Unknown report key")


def rows_to_csv(rows: list[dict[str, Any]]) -> str:
    if not rows:
        return ""
    output = io.StringIO()
    fieldnames = list(rows[0].keys())
    writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow({k: row.get(k, "") for k in fieldnames})
    return output.getvalue()


def export_report_csv(
    session: Session,
    company_id: str,
    user_id: str | None,
    report_key: str,
    filters: ReportFilters,
) -> tuple[str, str, int]:
    definition = get_report_def(report_key)
    if not definition:
        raise HTTPException(status_code=404, detail="Unknown report key")
    if definition["advanced"]:
        require_advanced_reports(session, company_id)

    rows = _rows_for_export(session, company_id, report_key, filters)
    csv_text = rows_to_csv(rows)
    filename = f"{report_key}-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.csv"

    export = ReportExport(
        company_id=company_id,
        report_key=report_key,
        row_count=len(rows),
        filters_json=json.dumps({
            k: v
            for k, v in {
                "from_date": filters.from_date.isoformat() if filters.from_date else None,
                "to_date": filters.to_date.isoformat() if filters.to_date else None,
                "industry_pack": filters.industry_pack,
                "store_id": filters.store_id,
                "product_id": filters.product_id,
                "category_id": filters.category_id,
                "brand_id": filters.brand_id,
                "supplier_id": filters.supplier_id,
                "customer_id": filters.customer_id,
                "cashier_id": filters.cashier_id,
                "payment_method": filters.payment_method,
                "status": filters.status,
                "transaction_type": filters.transaction_type,
                "search": filters.search,
                "ref_no": filters.ref_no,
            }.items()
            if v is not None
        }),
        created_by=user_id,
        completed_at=datetime.now(timezone.utc),
        status="completed",
    )
    session.add(export)
    session.flush()
    return csv_text, filename, len(rows)


def list_exports(session: Session, company_id: str, limit: int = 50) -> list[dict[str, Any]]:
    rows = session.exec(
        select(ReportExport)
        .where(ReportExport.company_id == company_id)
        .order_by(ReportExport.created_at.desc())  # type: ignore
        .limit(limit)
    ).all()
    return [
        {
            "id": r.id,
            "report_key": r.report_key,
            "format": r.format,
            "status": r.status,
            "row_count": r.row_count,
            "created_at": r.created_at,
            "completed_at": r.completed_at,
        }
        for r in rows
    ]
