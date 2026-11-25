"""Professional POS/ERP reports — real queries from posted transaction tables."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlmodel import Session, select, or_

from app.inventory.constants import normalize_movement_type
from app.models.accounting import Expense, ExpenseCategory
from app.models.core import Store, UserAccount
from app.models.inventory import StockBalance, StockLedger
from app.models.operations import (
    PurchaseReceive,
    PurchaseReceiveLine,
    PurchaseReturn,
    PurchaseReturnLine,
    SalesReturn,
    SalesReturnLine,
    SupplierBalance,
)
from app.models.product import BrandMaster, Customer, CustomerBalance, Product, ProductCategory, Supplier, Unit
from app.models.sales import CashierShift, Payment, PurchaseInvoice, PurchaseInvoiceLine, SalesInvoice, SalesInvoiceLine
from app.services.accounting_service import get_profit_and_loss
from app.services.customer_service import get_customer_ledger
from app.services.purchase_service import get_supplier_ledger
from app.models.base import as_utc


def _movement_value(row: StockLedger) -> float:
    if row.total_cost:
        return float(row.total_cost)
    delta = row.qty_delta if row.qty_delta else (row.in_qty - row.out_qty)
    return round(delta * float(row.unit_cost or 0), 2)


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _category_descendant_ids(session: Session, company_id: str, category_id: str) -> set[str]:
    """A category filter should include products tagged with any of its subcategories,
    not just products tagged with that exact category id (ProductCategory is a
    self-referential tree via parent_id, of arbitrary depth in principle)."""
    rows = session.exec(select(ProductCategory).where(ProductCategory.company_id == company_id)).all()
    children_by_parent: dict[str, list[str]] = defaultdict(list)
    for row in rows:
        if row.parent_id:
            children_by_parent[row.parent_id].append(row.id)
    ids = {category_id}
    frontier = [category_id]
    while frontier:
        next_frontier = []
        for cid in frontier:
            for child_id in children_by_parent.get(cid, []):
                if child_id not in ids:
                    ids.add(child_id)
                    next_frontier.append(child_id)
        frontier = next_frontier
    return ids


def _load_product_map(
    session: Session,
    company_id: str,
    filters: ReportFilters,
) -> dict[str, Product]:
    q = select(Product).where(Product.company_id == company_id)
    if filters.product_id:
        q = q.where(Product.id == filters.product_id)
    if filters.category_id:
        # Includes the category's own products plus every subcategory beneath it.
        cat_ids = _category_descendant_ids(session, company_id, filters.category_id)
        q = q.where(Product.category_id.in_(cat_ids))  # type: ignore
    if filters.subcategory_id:
        # Leaf-level, exact match only — no traversal.
        q = q.where(Product.category_id == filters.subcategory_id)
    if filters.brand_id:
        q = q.where(Product.brand_id == filters.brand_id)
    if filters.search:
        term = f"%{filters.search.lower()}%"
        q = q.where(
            or_(
                Product.sku.ilike(term),  # type: ignore
                Product.name.ilike(term),  # type: ignore
                Product.barcode.ilike(term),  # type: ignore
            )
        )
    rows = session.exec(q).all()
    return {p.id: p for p in rows}


def _category_map(session: Session, company_id: str) -> dict[str, ProductCategory]:
    rows = session.exec(select(ProductCategory).where(ProductCategory.company_id == company_id)).all()
    return {c.id: c for c in rows}


def _brand_map(session: Session, company_id: str) -> dict[str, BrandMaster]:
    rows = session.exec(select(BrandMaster).where(BrandMaster.company_id == company_id)).all()
    return {b.id: b for b in rows}


def _unit_map(session: Session, company_id: str) -> dict[str, Unit]:
    rows = session.exec(select(Unit).where(Unit.company_id == company_id)).all()
    return {u.id: u for u in rows}


def _store_map(session: Session, company_id: str) -> dict[str, Store]:
    rows = session.exec(select(Store).where(Store.company_id == company_id)).all()
    return {s.id: s for s in rows}


def stock_balance_report(session: Session, company_id: str, filters: ReportFilters) -> list[dict[str, Any]]:
    """Opening/receive/issue/closing from stock_ledger movements."""
    products = _load_product_map(session, company_id, filters)
    if not products:
        return []

    categories = _category_map(session, company_id)
    brands = _brand_map(session, company_id)
    stores = _store_map(session, company_id)

    q = select(StockLedger).where(StockLedger.company_id == company_id)
    if filters.store_id:
        q = q.where(StockLedger.store_id == filters.store_id)
    if filters.product_id:
        q = q.where(StockLedger.product_id == filters.product_id)
    entries = session.exec(q.order_by(StockLedger.created_at)).all()  # type: ignore

    from_dt = as_utc(filters.from_date)
    to_dt = as_utc(filters.to_date)

    buckets: dict[tuple[str | None, str], dict[str, float]] = defaultdict(
        lambda: {"opening_qty": 0.0, "opening_value": 0.0, "receive_qty": 0.0, "issue_qty": 0.0}
    )

    for row in entries:
        if row.product_id not in products:
            continue
        ts = as_utc(row.created_at)
        if ts is None:
            continue
        key = (row.store_id, row.product_id)
        if from_dt and ts < from_dt:
            delta = row.qty_delta if row.qty_delta else (row.in_qty - row.out_qty)
            buckets[key]["opening_qty"] += delta
            buckets[key]["opening_value"] += _movement_value(row)
        elif (not from_dt or ts >= from_dt) and (not to_dt or ts <= to_dt):
            buckets[key]["receive_qty"] += row.in_qty
            buckets[key]["issue_qty"] += row.out_qty

    rows: list[dict[str, Any]] = []
    for (store_id, product_id), agg in sorted(buckets.items(), key=lambda x: (x[0][0] or "", x[0][1])):
        prod = products[product_id]
        cat = categories.get(prod.category_id) if prod.category_id else None
        parent_cat = categories.get(cat.parent_id) if cat and cat.parent_id else None
        brand = brands.get(prod.brand_id) if prod.brand_id else None
        store = stores.get(store_id) if store_id else None
        opening_qty = round(agg["opening_qty"], 4)
        receive_qty = round(agg["receive_qty"], 4)
        issue_qty = round(agg["issue_qty"], 4)
        closing_qty = round(opening_qty + receive_qty - issue_qty, 4)
        opening_value = round(agg["opening_value"], 2)
        # Value extension: proportional to qty using average unit cost from ledger
        avg_cost = (opening_value / opening_qty) if opening_qty else float(prod.cost_price or 0)
        receive_value = round(receive_qty * avg_cost, 2)
        issue_value = round(issue_qty * avg_cost, 2)
        closing_value = round(opening_value + receive_value - issue_value, 2)
        rows.append({
            "store_id": store_id or "",
            "store_name": store.name if store else "—",
            "category": parent_cat.name if parent_cat else (cat.name if cat else "—"),
            "sub_category": cat.name if parent_cat and cat else "—",
            "item_code": prod.sku,
            "item_name": prod.name,
            "item_description": prod.meta_json or "",
            "barcode": prod.barcode or "",
            "product_id": product_id,
            "opening_qty": opening_qty,
            "opening_value": opening_value,
            "receive_qty": receive_qty,
            "issue_qty": issue_qty,
            "closing_qty": closing_qty,
            "closing_value": closing_value,
        })

    start = filters.offset
    end = start + filters.limit
    return rows[start:end]


def item_ledger_report(session: Session, company_id: str, filters: ReportFilters) -> list[dict[str, Any]]:
    products = _load_product_map(session, company_id, filters)
    if filters.product_id and filters.product_id not in products:
        return []
    if not filters.product_id and filters.search and not products:
        return []

    stores = _store_map(session, company_id)
    units = _unit_map(session, company_id)
    users: dict[str, UserAccount] = {}

    q = select(StockLedger).where(StockLedger.company_id == company_id)
    if filters.store_id:
        q = q.where(StockLedger.store_id == filters.store_id)
    if filters.product_id:
        q = q.where(StockLedger.product_id == filters.product_id)
    if filters.transaction_type:
        q = q.where(StockLedger.transaction_type == filters.transaction_type)
    all_rows = session.exec(q.order_by(StockLedger.created_at)).all()  # type: ignore

    from_dt = as_utc(filters.from_date)
    to_dt = as_utc(filters.to_date)

    opening_qty = 0.0
    opening_value = 0.0
    for row in all_rows:
        if row.product_id and row.product_id not in products:
            continue
        ts = as_utc(row.created_at)
        if ts and from_dt and ts < from_dt:
            delta = row.qty_delta if row.qty_delta else (row.in_qty - row.out_qty)
            opening_qty += delta
            opening_value += _movement_value(row)

    out: list[dict[str, Any]] = []
    if from_dt:
        out.append({
            "date": from_dt.date().isoformat(),
            "transaction_no": "OPENING",
            "transaction_type": "opening",
            "store_name": stores.get(filters.store_id).name if filters.store_id and filters.store_id in stores else "—",
            "item_code": products[filters.product_id].sku if filters.product_id else "—",
            "item_name": products[filters.product_id].name if filters.product_id else "—",
            "barcode": products[filters.product_id].barcode or "" if filters.product_id else "",
            "unit": "",
            "in_qty": 0,
            "out_qty": 0,
            "balance_qty": round(opening_qty, 4),
            "unit_cost": 0,
            "movement_value": 0,
            "balance_value": round(opening_value, 2),
            "created_by": "",
            "reference_type": "",
            "reference_id": "",
        })

    balance_qty = opening_qty
    balance_value = opening_value
    for row in all_rows:
        if row.product_id and row.product_id not in products:
            continue
        ts = as_utc(row.created_at)
        if not ts:
            continue
        if from_dt and ts < from_dt:
            continue
        if to_dt and ts > to_dt:
            continue
        prod = products.get(row.product_id) if row.product_id else None
        store = stores.get(row.store_id) if row.store_id else None
        unit = units.get(prod.unit_id) if prod and prod.unit_id else None
        if row.created_by and row.created_by not in users:
            users[row.created_by] = session.get(UserAccount, row.created_by)
        user = users.get(row.created_by) if row.created_by else None
        delta = row.qty_delta if row.qty_delta else (row.in_qty - row.out_qty)
        balance_qty += delta
        mv = _movement_value(row)
        balance_value += mv
        out.append({
            "date": ts.date().isoformat(),
            "transaction_no": row.transaction_ref or row.id[:8],
            "transaction_type": normalize_movement_type(row.transaction_type) or row.transaction_type,
            "store_name": store.name if store else "—",
            "item_code": prod.sku if prod else "—",
            "item_name": prod.name if prod else "—",
            "barcode": prod.barcode or "" if prod else "",
            "unit": unit.code if unit else "",
            "in_qty": row.in_qty,
            "out_qty": row.out_qty,
            "balance_qty": round(balance_qty, 4),
            "unit_cost": row.unit_cost,
            "movement_value": round(mv, 2),
            "balance_value": round(balance_value, 2),
            "created_by": user.email if user else "",
            "reference_type": row.reference_type or "",
            "reference_id": row.reference_id or "",
            "product_id": row.product_id or "",
            "store_id": row.store_id or "",
        })

    start = filters.offset
    end = start + filters.limit
    return out[start:end]


def sales_register_report(session: Session, company_id: str, filters: ReportFilters) -> list[dict[str, Any]]:
    q = select(SalesInvoice).where(SalesInvoice.company_id == company_id)
    if filters.status:
        q = q.where(SalesInvoice.status == filters.status)
    else:
        q = q.where(or_(SalesInvoice.status == "completed", SalesInvoice.status == "returned"))
    if filters.store_id:
        q = q.where(SalesInvoice.store_id == filters.store_id)
    if filters.customer_id:
        q = q.where(SalesInvoice.customer_id == filters.customer_id)
    if filters.cashier_id:
        q = q.where(SalesInvoice.cashier_id == filters.cashier_id)
    if filters.payment_method:
        q = q.where(SalesInvoice.tender == filters.payment_method)
    if filters.from_date:
        q = q.where(or_(SalesInvoice.completed_at >= filters.from_date, SalesInvoice.created_at >= filters.from_date))  # type: ignore
    if filters.to_date:
        q = q.where(or_(SalesInvoice.completed_at <= filters.to_date, SalesInvoice.created_at <= filters.to_date))  # type: ignore
    if filters.ref_no:
        q = q.where(SalesInvoice.invoice_number.ilike(f"%{filters.ref_no}%"))  # type: ignore

    invoices = session.exec(q.order_by(SalesInvoice.created_at.desc())).all()  # type: ignore
    stores = _store_map(session, company_id)
    customers = {c.id: c for c in session.exec(select(Customer).where(Customer.company_id == company_id)).all()}
    users: dict[str, UserAccount] = {}

    inv_ids = [i.id for i in invoices]
    line_qty: dict[str, float] = defaultdict(float)
    if inv_ids:
        for ln in session.exec(select(SalesInvoiceLine).where(SalesInvoiceLine.invoice_id.in_(inv_ids))).all():  # type: ignore
            line_qty[ln.invoice_id] += ln.qty

    rows: list[dict[str, Any]] = []
    for inv in invoices[filters.offset : filters.offset + filters.limit]:
        if inv.cashier_id and inv.cashier_id not in users:
            users[inv.cashier_id] = session.get(UserAccount, inv.cashier_id)
        cust = customers.get(inv.customer_id) if inv.customer_id else None
        store = stores.get(inv.store_id)
        cashier = users.get(inv.cashier_id) if inv.cashier_id else None
        paid = inv.paid_amount or 0
        due = inv.due_amount or 0
        payment_status = "paid" if due <= 0 else ("partial" if paid > 0 else "due")
        rows.append({
            "invoice_id": inv.id,
            "invoice_no": inv.invoice_number,
            "date": (inv.completed_at or inv.created_at).date().isoformat() if (inv.completed_at or inv.created_at) else "",
            "store": store.name if store else inv.store_id,
            "customer": cust.name if cust else "Walk-in",
            "cashier": cashier.email if cashier else "",
            "qty": round(line_qty.get(inv.id, 0), 2),
            "gross_amount": inv.subtotal,
            "discount": inv.discount,
            "vat_tax": inv.tax,
            "net_amount": inv.total,
            "paid_amount": paid,
            "due_amount": due,
            "payment_status": payment_status,
            "invoice_status": inv.status,
        })
    return rows


def sales_return_report(session: Session, company_id: str, filters: ReportFilters) -> list[dict[str, Any]]:
    q = select(SalesReturn).where(SalesReturn.company_id == company_id)
    if filters.from_date:
        q = q.where(SalesReturn.returned_at >= filters.from_date)  # type: ignore
    if filters.to_date:
        q = q.where(SalesReturn.returned_at <= filters.to_date)  # type: ignore
    if filters.ref_no:
        q = q.where(SalesReturn.return_no.ilike(f"%{filters.ref_no}%"))  # type: ignore
    returns = session.exec(q.order_by(SalesReturn.returned_at.desc())).all()  # type: ignore

    customers = {c.id: c for c in session.exec(select(Customer).where(Customer.company_id == company_id)).all()}
    invoices = {
        i.id: i
        for i in session.exec(select(SalesInvoice).where(SalesInvoice.company_id == company_id)).all()
    }

    rows: list[dict[str, Any]] = []
    for ret in returns:
        lines = session.exec(select(SalesReturnLine).where(SalesReturnLine.return_id == ret.id)).all()
        inv = invoices.get(ret.invoice_id)
        cust = customers.get(inv.customer_id) if inv and inv.customer_id else None
        for ln in lines:
            rows.append({
                "return_id": ret.id,
                "return_no": ret.return_no,
                "date": ret.returned_at.date().isoformat() if ret.returned_at else "",
                "invoice_no": inv.invoice_number if inv else "",
                "invoice_id": ret.invoice_id,
                "customer": cust.name if cust else "Walk-in",
                "item": ln.name,
                "return_qty": ln.qty,
                "return_amount": ln.line_total,
                "reason": ret.reason or "",
                "refund_amount": ln.line_total,
                "status": ret.status,
            })

    start = filters.offset
    end = start + filters.limit
    return rows[start:end]


def purchase_register_report(session: Session, company_id: str, filters: ReportFilters) -> list[dict[str, Any]]:
    q = select(PurchaseInvoice).where(PurchaseInvoice.company_id == company_id)
    if filters.store_id:
        q = q.where(PurchaseInvoice.store_id == filters.store_id)
    if filters.supplier_id:
        q = q.where(PurchaseInvoice.supplier_id == filters.supplier_id)
    if filters.status:
        q = q.where(PurchaseInvoice.status == filters.status)
    if filters.from_date:
        q = q.where(PurchaseInvoice.purchase_date >= filters.from_date)  # type: ignore
    if filters.to_date:
        q = q.where(PurchaseInvoice.purchase_date <= filters.to_date)  # type: ignore
    if filters.ref_no:
        q = q.where(PurchaseInvoice.invoice_number.ilike(f"%{filters.ref_no}%"))  # type: ignore

    purchases = session.exec(q.order_by(PurchaseInvoice.purchase_date.desc())).all()  # type: ignore
    suppliers = {s.id: s for s in session.exec(select(Supplier).where(Supplier.company_id == company_id)).all()}
    stores = _store_map(session, company_id)

    rows: list[dict[str, Any]] = []
    for po in purchases[filters.offset : filters.offset + filters.limit]:
        lines = session.exec(select(PurchaseInvoiceLine).where(PurchaseInvoiceLine.purchase_id == po.id)).all()
        total_qty = sum(ln.qty for ln in lines)
        received_qty = sum(ln.received_qty for ln in lines)
        sup = suppliers.get(po.supplier_id) if po.supplier_id else None
        store = stores.get(po.store_id) if po.store_id else None
        recv_status = "received" if received_qty >= total_qty and total_qty > 0 else (
            "partial" if received_qty > 0 else "pending"
        )
        due = po.due_amount or 0
        paid = po.paid_amount or 0
        payment_status = "paid" if due <= 0 else ("partial" if paid > 0 else "due")
        rows.append({
            "purchase_id": po.id,
            "po_no": po.invoice_number,
            "date": po.purchase_date.date().isoformat() if po.purchase_date else "",
            "supplier": sup.name if sup else "—",
            "store": store.name if store else "—",
            "status": po.status,
            "total_qty": round(total_qty, 2),
            "gross_amount": po.subtotal,
            "discount": po.discount_amount,
            "vat_tax": po.tax_amount,
            "net_amount": po.total,
            "received_status": recv_status,
            "invoice_status": po.status,
            "payment_status": payment_status,
        })
    return rows


def grn_report(session: Session, company_id: str, filters: ReportFilters) -> list[dict[str, Any]]:
    q = select(PurchaseReceive).where(PurchaseReceive.company_id == company_id)
    if filters.store_id:
        q = q.where(PurchaseReceive.store_id == filters.store_id)
    if filters.from_date:
        q = q.where(PurchaseReceive.received_at >= filters.from_date)  # type: ignore
    if filters.to_date:
        q = q.where(PurchaseReceive.received_at <= filters.to_date)  # type: ignore
    if filters.ref_no:
        q = q.where(PurchaseReceive.receive_no.ilike(f"%{filters.ref_no}%"))  # type: ignore

    receives = session.exec(q.order_by(PurchaseReceive.received_at.desc())).all()  # type: ignore
    stores = _store_map(session, company_id)
    products = {p.id: p for p in session.exec(select(Product).where(Product.company_id == company_id)).all()}
    purchases = {
        p.id: p
        for p in session.exec(select(PurchaseInvoice).where(PurchaseInvoice.company_id == company_id)).all()
    }
    suppliers = {s.id: s for s in session.exec(select(Supplier).where(Supplier.company_id == company_id)).all()}

    rows: list[dict[str, Any]] = []
    for rcv in receives:
        po = purchases.get(rcv.purchase_id)
        sup = suppliers.get(po.supplier_id) if po and po.supplier_id else None
        store = stores.get(rcv.store_id) if rcv.store_id else None
        lines = session.exec(select(PurchaseReceiveLine).where(PurchaseReceiveLine.receive_id == rcv.id)).all()
        for ln in lines:
            prod = products.get(ln.product_id)
            rows.append({
                "grn_id": rcv.id,
                "grn_no": rcv.receive_no,
                "date": rcv.received_at.date().isoformat() if rcv.received_at else "",
                "po_no": po.invoice_number if po else "",
                "purchase_id": rcv.purchase_id,
                "supplier": sup.name if sup else "—",
                "store": store.name if store else "—",
                "item": prod.name if prod else ln.product_id,
                "received_qty": ln.qty,
                "unit_cost": ln.unit_cost,
                "total_cost": round(ln.qty * ln.unit_cost, 2),
                "received_by": rcv.received_by or "",
            })

    start = filters.offset
    end = start + filters.limit
    return rows[start:end]


def supplier_ledger_report(session: Session, company_id: str, filters: ReportFilters) -> list[dict[str, Any]]:
    if not filters.supplier_id:
        return []
    from_s = filters.from_date.isoformat() if filters.from_date else None
    to_s = filters.to_date.isoformat() if filters.to_date else None
    data = get_supplier_ledger(session, company_id, filters.supplier_id, from_s, to_s)
    sup = session.get(Supplier, filters.supplier_id)
    rows: list[dict[str, Any]] = []
    if filters.from_date:
        rows.append({
            "date": filters.from_date.date().isoformat(),
            "transaction_no": "OPENING",
            "transaction_type": "opening",
            "reference": "",
            "debit": 0,
            "credit": 0,
            "balance": data.get("opening_balance", 0),
            "supplier": sup.name if sup else "",
        })
    for e in data.get("entries", []):
        rows.append({
            "date": e["at"][:10] if e.get("at") else "",
            "transaction_no": e.get("ref", ""),
            "transaction_type": e.get("type", ""),
            "reference": e.get("entity_id", ""),
            "debit": e.get("debit", 0),
            "credit": e.get("credit", 0),
            "balance": e.get("balance", 0),
            "supplier": sup.name if sup else "",
        })
    start = filters.offset
    end = start + filters.limit
    return rows[start:end]


def customer_ledger_report(session: Session, company_id: str, filters: ReportFilters) -> list[dict[str, Any]]:
    if not filters.customer_id:
        return []
    from_s = filters.from_date.isoformat() if filters.from_date else None
    to_s = filters.to_date.isoformat() if filters.to_date else None
    data = get_customer_ledger(session, company_id, filters.customer_id, from_s, to_s)
    cust = session.get(Customer, filters.customer_id)
    rows: list[dict[str, Any]] = []
    if filters.from_date:
        rows.append({
            "date": filters.from_date.date().isoformat(),
            "transaction_no": "OPENING",
            "transaction_type": "opening",
            "reference": "",
            "debit": 0,
            "credit": 0,
            "balance": data.get("opening_balance", 0),
            "customer": cust.name if cust else "",
        })
    for e in data.get("entries", []):
        rows.append({
            "date": e["at"][:10] if e.get("at") else "",
            "transaction_no": e.get("ref", ""),
            "transaction_type": e.get("type", ""),
            "reference": e.get("entity_id", ""),
            "debit": e.get("debit", 0),
            "credit": e.get("credit", 0),
            "balance": e.get("balance", 0),
            "customer": cust.name if cust else "",
        })
    start = filters.offset
    end = start + filters.limit
    return rows[start:end]


def daily_sales_summary_report(session: Session, company_id: str, filters: ReportFilters) -> list[dict[str, Any]]:
    q = select(SalesInvoice).where(
        SalesInvoice.company_id == company_id,
        or_(SalesInvoice.status == "completed", SalesInvoice.status == "returned"),
    )
    if filters.store_id:
        q = q.where(SalesInvoice.store_id == filters.store_id)
    if filters.from_date:
        q = q.where(or_(SalesInvoice.completed_at >= filters.from_date, SalesInvoice.created_at >= filters.from_date))  # type: ignore
    if filters.to_date:
        q = q.where(or_(SalesInvoice.completed_at <= filters.to_date, SalesInvoice.created_at <= filters.to_date))  # type: ignore
    invoices = session.exec(q).all()

    by_day: dict[str, dict[str, float]] = defaultdict(lambda: {
        "invoice_count": 0, "gross_sales": 0, "discount": 0, "vat_tax": 0,
        "net_sales": 0, "return_amount": 0, "collection": 0, "due_sales": 0,
    })
    for inv in invoices:
        dt = (inv.completed_at or inv.created_at)
        if not dt:
            continue
        key = dt.date().isoformat()
        by_day[key]["invoice_count"] += 1
        by_day[key]["gross_sales"] += inv.subtotal
        by_day[key]["discount"] += inv.discount
        by_day[key]["vat_tax"] += inv.tax
        by_day[key]["net_sales"] += inv.total
        by_day[key]["collection"] += inv.paid_amount or 0
        by_day[key]["due_sales"] += inv.due_amount or 0

    returns_q = select(SalesReturn).where(SalesReturn.company_id == company_id)
    if filters.from_date:
        returns_q = returns_q.where(SalesReturn.returned_at >= filters.from_date)  # type: ignore
    if filters.to_date:
        returns_q = returns_q.where(SalesReturn.returned_at <= filters.to_date)  # type: ignore
    for ret in session.exec(returns_q).all():
        key = ret.returned_at.date().isoformat() if ret.returned_at else ""
        if key:
            by_day[key]["return_amount"] += ret.total_amount

    rows = [
        {
            "date": day,
            "invoice_count": int(v["invoice_count"]),
            "gross_sales": round(v["gross_sales"], 2),
            "discount": round(v["discount"], 2),
            "vat_tax": round(v["vat_tax"], 2),
            "net_sales": round(v["net_sales"], 2),
            "return_amount": round(v["return_amount"], 2),
            "collection": round(v["collection"], 2),
            "due_sales": round(v["due_sales"], 2),
            "gross_profit": None,
        }
        for day, v in sorted(by_day.items())
    ]
    start = filters.offset
    end = start + filters.limit
    return rows[start:end]


def low_stock_report(session: Session, company_id: str, filters: ReportFilters) -> list[dict[str, Any]]:
    from app.services.inventory_service import get_low_stock

    threshold = 20.0
    rows = get_low_stock(session, company_id, threshold=threshold)
    if filters.store_id:
        rows = [r for r in rows if r.get("store_id") == filters.store_id]
    if filters.search:
        term = filters.search.lower()
        rows = [r for r in rows if term in r["sku"].lower() or term in r["name"].lower()]
    out = [
        {
            "store_id": r.get("store_id") or "",
            "item_code": r["sku"],
            "item_name": r["name"],
            "product_id": r["product_id"],
            "qty_on_hand": r["qty_on_hand"],
            "qty_available": r["qty_available"],
            "reorder_point": r["reorder_point"],
        }
        for r in rows
    ]
    start = filters.offset
    end = start + filters.limit
    return out[start:end]


def purchase_return_report(session: Session, company_id: str, filters: ReportFilters) -> list[dict[str, Any]]:
    q = select(PurchaseReturn).where(PurchaseReturn.company_id == company_id)
    if filters.from_date:
        q = q.where(PurchaseReturn.returned_at >= filters.from_date)  # type: ignore
    if filters.to_date:
        q = q.where(PurchaseReturn.returned_at <= filters.to_date)  # type: ignore
    if filters.supplier_id:
        q = q.where(PurchaseReturn.supplier_id == filters.supplier_id)
    if filters.ref_no:
        q = q.where(PurchaseReturn.return_no.ilike(f"%{filters.ref_no}%"))  # type: ignore
    returns = session.exec(q.order_by(PurchaseReturn.returned_at.desc())).all()  # type: ignore
    purchases = {
        p.id: p
        for p in session.exec(select(PurchaseInvoice).where(PurchaseInvoice.company_id == company_id)).all()
    }
    suppliers = {s.id: s for s in session.exec(select(Supplier).where(Supplier.company_id == company_id)).all()}
    products = {p.id: p for p in session.exec(select(Product).where(Product.company_id == company_id)).all()}

    rows: list[dict[str, Any]] = []
    for ret in returns:
        po = purchases.get(ret.purchase_id)
        sup = suppliers.get(ret.supplier_id) if ret.supplier_id else None
        lines = session.exec(select(PurchaseReturnLine).where(PurchaseReturnLine.return_id == ret.id)).all()
        for ln in lines:
            prod = products.get(ln.product_id)
            rows.append({
                "return_id": ret.id,
                "return_no": ret.return_no,
                "date": ret.returned_at.date().isoformat() if ret.returned_at else "",
                "po_no": po.invoice_number if po else "",
                "purchase_id": ret.purchase_id,
                "supplier": sup.name if sup else "—",
                "item": prod.name if prod else ln.product_id,
                "return_qty": ln.qty,
                "return_amount": round(ln.qty * ln.unit_cost, 2),
                "reason": ret.reason or "",
                "status": "posted",
            })

    start = filters.offset
    end = start + filters.limit
    return rows[start:end]


def payment_collection_report(session: Session, company_id: str, filters: ReportFilters) -> list[dict[str, Any]]:
    q = select(Payment).where(Payment.company_id == company_id)
    if filters.from_date:
        q = q.where(Payment.created_at >= filters.from_date)  # type: ignore
    if filters.to_date:
        q = q.where(Payment.created_at <= filters.to_date)  # type: ignore
    if filters.payment_method:
        q = q.where(Payment.method == filters.payment_method)
    if filters.store_id:
        q = q.where(Payment.store_id == filters.store_id)
    payments = session.exec(q.order_by(Payment.created_at.desc())).all()  # type: ignore
    stores = _store_map(session, company_id)

    rows: list[dict[str, Any]] = []
    for pay in payments[filters.offset : filters.offset + filters.limit]:
        store = stores.get(pay.store_id) if pay.store_id else None
        rows.append({
            "date": pay.created_at.date().isoformat() if pay.created_at else "",
            "payment_id": pay.id,
            "type": pay.payment_type,
            "direction": pay.direction,
            "method": pay.method,
            "amount": pay.amount,
            "reference": pay.reference or "",
            "store": store.name if store else "",
            "status": pay.status,
        })
    return rows


def inventory_report(session: Session, company_id: str, filters: ReportFilters) -> list[dict[str, Any]]:
    """Live stock levels per item/store — complete inventory overview."""
    products = _load_product_map(session, company_id, filters)
    if not products:
        return []
    categories = _category_map(session, company_id)
    brands = _brand_map(session, company_id)
    stores = _store_map(session, company_id)

    q = select(StockBalance).where(StockBalance.company_id == company_id)
    if filters.store_id:
        q = q.where(StockBalance.store_id == filters.store_id)
    balances = session.exec(q).all()

    rows: list[dict[str, Any]] = []
    for bal in balances:
        if bal.product_id not in products:
            continue
        prod = products[bal.product_id]
        cat = categories.get(prod.category_id) if prod.category_id else None
        brand = brands.get(prod.brand_id) if prod.brand_id else None
        store = stores.get(bal.store_id) if bal.store_id else None
        available = round(bal.qty_on_hand - bal.qty_reserved, 4)
        rows.append({
            "store": store.name if store else "—",
            "item_code": prod.sku,
            "item_name": prod.name,
            "category": cat.name if cat else "—",
            "brand": brand.name if brand else "—",
            "product_id": bal.product_id,
            "store_id": bal.store_id or "",
            "qty_on_hand": round(bal.qty_on_hand, 4),
            "qty_reserved": round(bal.qty_reserved, 4),
            "qty_available": available,
            "qty_damaged": round(bal.qty_damaged, 4),
            "qty_in_transit": round(bal.qty_in_transit, 4),
            "unit_cost": round(bal.unit_cost_avg, 2),
            "stock_value": round(bal.qty_on_hand * bal.unit_cost_avg, 2),
        })

    rows.sort(key=lambda r: (r["store"], r["item_name"]))
    start = filters.offset
    end = start + filters.limit
    return rows[start:end]


def profit_loss_report(session: Session, company_id: str, filters: ReportFilters) -> list[dict[str, Any]]:
    """Row-shaped view of the accounting P&L statement for the report catalog/export."""
    from_dt = filters.from_date or datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    to_dt = filters.to_date or datetime.now(timezone.utc)
    pnl = get_profit_and_loss(session, company_id, from_dt, to_dt)

    rows: list[dict[str, Any]] = []
    for r in pnl.get("revenue", []):
        rows.append({"section": "Revenue", "code": r["code"], "account": r["name"], "amount": r["amount"]})
    rows.append({"section": "Revenue", "code": "", "account": "Total revenue", "amount": pnl.get("total_revenue", 0)})
    for r in pnl.get("cogs", []):
        rows.append({"section": "COGS", "code": r["code"], "account": r["name"], "amount": r["amount"]})
    rows.append({"section": "COGS", "code": "", "account": "Total COGS", "amount": pnl.get("total_cogs", 0)})
    rows.append({"section": "Summary", "code": "", "account": "Gross profit", "amount": pnl.get("gross_profit", 0)})
    for r in pnl.get("operating_expenses", []):
        rows.append({"section": "Operating expenses", "code": r["code"], "account": r["name"], "amount": r["amount"]})
    rows.append({"section": "Operating expenses", "code": "", "account": "Total operating expenses", "amount": pnl.get("total_operating_expenses", 0)})
    rows.append({"section": "Summary", "code": "", "account": "Net profit", "amount": pnl.get("net_profit", 0)})

    start = filters.offset
    end = start + filters.limit
    return rows[start:end]


def category_analysis_report(session: Session, company_id: str, filters: ReportFilters) -> list[dict[str, Any]]:
    """Revenue and quantity sold grouped by top-level category."""
    q = select(SalesInvoice).where(SalesInvoice.company_id == company_id, SalesInvoice.status == "completed")
    if filters.store_id:
        q = q.where(SalesInvoice.store_id == filters.store_id)
    if filters.from_date:
        q = q.where(or_(SalesInvoice.completed_at >= filters.from_date, SalesInvoice.created_at >= filters.from_date))  # type: ignore
    if filters.to_date:
        q = q.where(or_(SalesInvoice.completed_at <= filters.to_date, SalesInvoice.created_at <= filters.to_date))  # type: ignore
    invoices = session.exec(q).all()
    invoice_ids = [inv.id for inv in invoices]
    if not invoice_ids:
        return []

    lines = session.exec(select(SalesInvoiceLine).where(SalesInvoiceLine.invoice_id.in_(invoice_ids))).all()  # type: ignore
    products = {p.id: p for p in session.exec(select(Product).where(Product.company_id == company_id)).all()}
    categories = _category_map(session, company_id)

    buckets: dict[str, dict[str, float]] = defaultdict(lambda: {"qty_sold": 0.0, "revenue": 0.0, "line_count": 0.0})
    for ln in lines:
        prod = products.get(ln.product_id) if ln.product_id else None
        cat = categories.get(prod.category_id) if prod and prod.category_id else None
        if cat and cat.parent_id:
            cat = categories.get(cat.parent_id) or cat
        label = cat.name if cat else "Uncategorized"
        buckets[label]["qty_sold"] += ln.qty
        buckets[label]["revenue"] += ln.line_total
        buckets[label]["line_count"] += 1

    total_revenue = sum(v["revenue"] for v in buckets.values()) or 1
    rows = [
        {
            "category": label,
            "qty_sold": round(v["qty_sold"], 2),
            "revenue": round(v["revenue"], 2),
            "line_count": int(v["line_count"]),
            "revenue_share_pct": round(v["revenue"] / total_revenue * 100, 1),
        }
        for label, v in sorted(buckets.items(), key=lambda x: -x[1]["revenue"])
    ]
    start = filters.offset
    end = start + filters.limit
    return rows[start:end]


def trend_analysis_report(session: Session, company_id: str, filters: ReportFilters) -> list[dict[str, Any]]:
    """Day-by-day sales trend with day-over-day change."""
    q = select(SalesInvoice).where(SalesInvoice.company_id == company_id, SalesInvoice.status == "completed")
    if filters.store_id:
        q = q.where(SalesInvoice.store_id == filters.store_id)
    if filters.from_date:
        q = q.where(or_(SalesInvoice.completed_at >= filters.from_date, SalesInvoice.created_at >= filters.from_date))  # type: ignore
    if filters.to_date:
        q = q.where(or_(SalesInvoice.completed_at <= filters.to_date, SalesInvoice.created_at <= filters.to_date))  # type: ignore
    invoices = session.exec(q).all()

    by_day: dict[str, dict[str, float]] = defaultdict(lambda: {"invoice_count": 0.0, "revenue": 0.0})
    for inv in invoices:
        dt = inv.completed_at or inv.created_at
        if not dt:
            continue
        key = dt.date().isoformat()
        by_day[key]["invoice_count"] += 1
        by_day[key]["revenue"] += inv.total

    ordered = sorted(by_day.items())
    rows: list[dict[str, Any]] = []
    prev_revenue: float | None = None
    for day, v in ordered:
        change_pct = round((v["revenue"] - prev_revenue) / prev_revenue * 100, 1) if prev_revenue else None
        rows.append({
            "date": day,
            "invoice_count": int(v["invoice_count"]),
            "revenue": round(v["revenue"], 2),
            "avg_order_value": round(v["revenue"] / v["invoice_count"], 2) if v["invoice_count"] else 0,
            "change_vs_prev_day_pct": change_pct,
        })
        prev_revenue = v["revenue"]

    start = filters.offset
    end = start + filters.limit
    return rows[start:end]


def daily_item_sales_report(session: Session, company_id: str, filters: ReportFilters) -> list[dict[str, Any]]:
    """Item-level sales grouped by day."""
    q = select(SalesInvoice).where(SalesInvoice.company_id == company_id, SalesInvoice.status == "completed")
    if filters.store_id:
        q = q.where(SalesInvoice.store_id == filters.store_id)
    if filters.from_date:
        q = q.where(or_(SalesInvoice.completed_at >= filters.from_date, SalesInvoice.created_at >= filters.from_date))  # type: ignore
    if filters.to_date:
        q = q.where(or_(SalesInvoice.completed_at <= filters.to_date, SalesInvoice.created_at <= filters.to_date))  # type: ignore
    invoices = {inv.id: inv for inv in session.exec(q).all()}
    if not invoices:
        return []

    lines = session.exec(select(SalesInvoiceLine).where(SalesInvoiceLine.invoice_id.in_(list(invoices.keys())))).all()  # type: ignore
    buckets: dict[tuple[str, str], dict[str, Any]] = defaultdict(lambda: {"qty_sold": 0.0, "revenue": 0.0, "sku": "", "name": ""})
    for ln in lines:
        inv = invoices[ln.invoice_id]
        dt = inv.completed_at or inv.created_at
        if not dt:
            continue
        key = (dt.date().isoformat(), ln.sku)
        buckets[key]["qty_sold"] += ln.qty
        buckets[key]["revenue"] += ln.line_total
        buckets[key]["sku"] = ln.sku
        buckets[key]["name"] = ln.name

    rows = [
        {
            "date": day,
            "item_code": v["sku"],
            "item_name": v["name"],
            "qty_sold": round(v["qty_sold"], 2),
            "revenue": round(v["revenue"], 2),
        }
        for (day, _sku), v in sorted(buckets.items(), key=lambda x: (x[0][0], -x[1]["revenue"]))
    ]
    start = filters.offset
    end = start + filters.limit
    return rows[start:end]


def daily_item_purchase_report(session: Session, company_id: str, filters: ReportFilters) -> list[dict[str, Any]]:
    """Item-level purchases grouped by day."""
    q = select(PurchaseInvoice).where(PurchaseInvoice.company_id == company_id)
    if filters.store_id:
        q = q.where(PurchaseInvoice.store_id == filters.store_id)
    if filters.supplier_id:
        q = q.where(PurchaseInvoice.supplier_id == filters.supplier_id)
    if filters.from_date:
        q = q.where(PurchaseInvoice.purchase_date >= filters.from_date)  # type: ignore
    if filters.to_date:
        q = q.where(PurchaseInvoice.purchase_date <= filters.to_date)  # type: ignore
    invoices = {inv.id: inv for inv in session.exec(q).all()}
    if not invoices:
        return []

    products = {p.id: p for p in session.exec(select(Product).where(Product.company_id == company_id)).all()}
    lines = session.exec(select(PurchaseInvoiceLine).where(PurchaseInvoiceLine.purchase_id.in_(list(invoices.keys())))).all()  # type: ignore
    buckets: dict[tuple[str, str], dict[str, Any]] = defaultdict(lambda: {"qty_purchased": 0.0, "cost": 0.0, "sku": "", "name": ""})
    for ln in lines:
        inv = invoices[ln.purchase_id]
        dt = inv.purchase_date
        if not dt:
            continue
        prod = products.get(ln.product_id)
        key = (dt.date().isoformat(), ln.product_id)
        buckets[key]["qty_purchased"] += ln.qty
        buckets[key]["cost"] += ln.line_total
        buckets[key]["sku"] = prod.sku if prod else ""
        buckets[key]["name"] = prod.name if prod else ln.product_id

    rows = [
        {
            "date": day,
            "item_code": v["sku"],
            "item_name": v["name"],
            "qty_purchased": round(v["qty_purchased"], 2),
            "cost": round(v["cost"], 2),
        }
        for (day, _pid), v in sorted(buckets.items(), key=lambda x: (x[0][0], -x[1]["cost"]))
    ]
    start = filters.offset
    end = start + filters.limit
    return rows[start:end]


def due_customer_report(session: Session, company_id: str, filters: ReportFilters) -> list[dict[str, Any]]:
    """Customers with an outstanding balance greater than zero."""
    balances = session.exec(
        select(CustomerBalance).where(CustomerBalance.company_id == company_id, CustomerBalance.outstanding > 0)
    ).all()
    if not balances:
        return []

    customer_q = select(Customer).where(Customer.company_id == company_id)
    if filters.customer_id:
        customer_q = customer_q.where(Customer.id == filters.customer_id)
    if filters.search:
        term = f"%{filters.search.lower()}%"
        customer_q = customer_q.where(or_(Customer.name.ilike(term), Customer.phone.ilike(term)))  # type: ignore
    customers = {c.id: c for c in session.exec(customer_q).all()}

    rows: list[dict[str, Any]] = []
    for bal in balances:
        cust = customers.get(bal.customer_id)
        if not cust:
            continue
        rows.append({
            "customer_code": cust.code,
            "customer_name": cust.name,
            "phone": cust.phone or "",
            "customer_id": cust.id,
            "outstanding": round(bal.outstanding, 2),
            "credit_limit": round(cust.credit_limit, 2) if cust.credit_limit else None,
        })
    rows.sort(key=lambda r: -r["outstanding"])
    start = filters.offset
    end = start + filters.limit
    return rows[start:end]


def expense_report(session: Session, company_id: str, filters: ReportFilters) -> list[dict[str, Any]]:
    """Posted expenses within a date range, grouped by category."""
    q = select(Expense).where(Expense.company_id == company_id)
    if filters.store_id:
        q = q.where(Expense.store_id == filters.store_id)
    if filters.from_date:
        q = q.where(Expense.expense_date >= filters.from_date)  # type: ignore
    if filters.to_date:
        q = q.where(Expense.expense_date <= filters.to_date)  # type: ignore
    expenses = session.exec(q.order_by(Expense.expense_date.desc())).all()  # type: ignore
    categories = {c.id: c for c in session.exec(select(ExpenseCategory).where(ExpenseCategory.company_id == company_id)).all()}
    stores = _store_map(session, company_id)

    rows = [
        {
            "date": e.expense_date.date().isoformat() if e.expense_date else "",
            "category": categories[e.category_id].name if e.category_id in categories else "—",
            "store": stores.get(e.store_id).name if e.store_id and e.store_id in stores else "—",
            "payee": e.payee or "",
            "amount": round(e.amount, 2),
            "note": e.note or "",
        }
        for e in expenses
    ]
    start = filters.offset
    end = start + filters.limit
    return rows[start:end]


def daily_account_closing_report(session: Session, company_id: str, filters: ReportFilters) -> list[dict[str, Any]]:
    """Cashier shift close-outs — expected vs counted cash, per day."""
    q = select(CashierShift).where(CashierShift.company_id == company_id, CashierShift.status == "closed")
    if filters.store_id:
        q = q.where(CashierShift.store_id == filters.store_id)
    if filters.from_date:
        q = q.where(CashierShift.closed_at >= filters.from_date)  # type: ignore
    if filters.to_date:
        q = q.where(CashierShift.closed_at <= filters.to_date)  # type: ignore
    shifts = session.exec(q.order_by(CashierShift.closed_at.desc())).all()  # type: ignore
    stores = _store_map(session, company_id)
    cashiers = {u.id: u for u in session.exec(select(UserAccount).where(UserAccount.company_id == company_id)).all()}

    rows = [
        {
            "date": s.closed_at.date().isoformat() if s.closed_at else "",
            "store": stores.get(s.store_id).name if s.store_id in stores else "—",
            "cashier": cashiers[s.cashier_id].full_name if s.cashier_id in cashiers else "—",
            "opening_float": round(s.opening_float, 2),
            "expected_cash": round(s.expected_cash, 2) if s.expected_cash is not None else None,
            "counted_cash": round(s.closing_counted, 2) if s.closing_counted is not None else None,
            "variance": round(s.variance, 2) if s.variance is not None else None,
        }
        for s in shifts
    ]
    start = filters.offset
    end = start + filters.limit
    return rows[start:end]


def product_details_report(session: Session, company_id: str, filters: ReportFilters) -> list[dict[str, Any]]:
    """Full product master listing with category/brand/pricing."""
    products = _load_product_map(session, company_id, filters)
    categories = _category_map(session, company_id)
    brands = _brand_map(session, company_id)
    units = _unit_map(session, company_id)

    rows = [
        {
            "item_code": p.sku,
            "item_name": p.name,
            "barcode": p.barcode or "",
            "category": categories[p.category_id].name if p.category_id in categories else "—",
            "brand": brands[p.brand_id].name if p.brand_id in brands else "—",
            "unit": units[p.unit_id].name if p.unit_id in units else "—",
            "industry_pack": p.industry_pack,
            "base_price": round(p.base_price, 2),
            "wholesale_price": round(p.wholesale_price, 2) if p.wholesale_price is not None else None,
            "cost_price": round(p.cost_price, 2) if p.cost_price is not None else None,
            "is_active": p.is_active,
        }
        for p in sorted(products.values(), key=lambda x: x.name)
    ]
    start = filters.offset
    end = start + filters.limit
    return rows[start:end]


def dashboard_kpi(session: Session, company_id: str, store_id: str | None = None) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = today_start.replace(day=1)

    today_stmt = select(SalesInvoice).where(
        SalesInvoice.company_id == company_id,
        SalesInvoice.status == "completed",
        or_(SalesInvoice.completed_at >= today_start, SalesInvoice.created_at >= today_start),  # type: ignore
    )
    if store_id:
        today_stmt = today_stmt.where(SalesInvoice.store_id == store_id)
    today_invoices = session.exec(today_stmt).all()
    today_sales = sum(i.total for i in today_invoices)
    today_collection = sum(i.paid_amount or 0 for i in today_invoices)

    purchases_stmt = select(PurchaseInvoice).where(
        PurchaseInvoice.company_id == company_id,
        PurchaseInvoice.purchase_date >= today_start,  # type: ignore
    )
    if store_id:
        purchases_stmt = purchases_stmt.where(PurchaseInvoice.store_id == store_id)
    today_purchases = session.exec(purchases_stmt).all()
    today_purchase = sum(p.total for p in today_purchases)

    from app.services.inventory_service import get_low_stock

    low = get_low_stock(session, company_id, store_id=store_id)

    bal_stmt = select(StockBalance).where(StockBalance.company_id == company_id)
    if store_id:
        bal_stmt = bal_stmt.where(StockBalance.store_id == store_id)
    balances = session.exec(bal_stmt).all()
    stock_value = sum((b.qty_on_hand or 0) * (b.unit_cost_avg or 0) for b in balances)

    supplier_due = sum(
        b.outstanding
        for b in session.exec(select(SupplierBalance).where(SupplierBalance.company_id == company_id)).all()
    )
    from app.models.product import CustomerBalance

    customer_due = sum(
        b.outstanding
        for b in session.exec(select(CustomerBalance).where(CustomerBalance.company_id == company_id)).all()
    )

    month_stmt = select(SalesInvoice).where(
        SalesInvoice.company_id == company_id,
        SalesInvoice.status == "completed",
        or_(SalesInvoice.completed_at >= month_start, SalesInvoice.created_at >= month_start),  # type: ignore
    )
    if store_id:
        month_stmt = month_stmt.where(SalesInvoice.store_id == store_id)
    month_invoices = session.exec(month_stmt).all()
    by_day: dict[str, float] = defaultdict(float)
    for inv in month_invoices:
        dt = inv.completed_at or inv.created_at
        if dt:
            by_day[dt.date().isoformat()] += inv.total
    monthly_trend = [{"date": d, "sales": round(v, 2)} for d, v in sorted(by_day.items())]

    # Top products by revenue (month)
    inv_ids = [i.id for i in month_invoices]
    product_rev: dict[str, float] = defaultdict(float)
    product_name: dict[str, str] = {}
    if inv_ids:
        for ln in session.exec(
            select(SalesInvoiceLine).where(SalesInvoiceLine.invoice_id.in_(inv_ids))  # type: ignore
        ).all():
            pid = ln.product_id or ln.sku
            product_rev[pid] += ln.line_total
            product_name[pid] = ln.name
    top_products = [
        {"name": product_name[k], "revenue": round(v, 2)}
        for k, v in sorted(product_rev.items(), key=lambda x: -x[1])[:10]
    ]

    by_method: dict[str, float] = defaultdict(float)
    for inv in month_invoices:
        by_method[inv.tender or "cash"] += inv.total
    sales_by_payment = [{"method": k, "amount": round(v, 2)} for k, v in sorted(by_method.items(), key=lambda x: -x[1])]

    movement_summary = session.exec(
        select(StockLedger).where(
            StockLedger.company_id == company_id,
            StockLedger.created_at >= today_start,  # type: ignore
        )
    ).all()
    stock_in = sum(r.in_qty for r in movement_summary)
    stock_out = sum(r.out_qty for r in movement_summary)

    return {
        "today_sales": round(today_sales, 2),
        "today_collection": round(today_collection, 2),
        "today_purchase": round(today_purchase, 2),
        "today_expense": None,
        "today_expense_reason": "Expense module not implemented in Phase 4",
        "current_stock_value": round(stock_value, 2),
        "low_stock_count": len(low),
        "supplier_due": round(supplier_due, 2),
        "customer_due": round(customer_due, 2),
        "monthly_sales_trend": monthly_trend,
        "top_selling_products": top_products,
        "sales_by_payment_method": sales_by_payment,
        "stock_movement_summary": {"in_qty": round(stock_in, 2), "out_qty": round(stock_out, 2)},
    }


PROFESSIONAL_REPORT_RUNNERS: dict[str, Any] = {
    "stock-balance": stock_balance_report,
    "item-ledger": item_ledger_report,
    "sales-register": sales_register_report,
    "sales-return": sales_return_report,
    "purchase-register": purchase_register_report,
    "grn-report": grn_report,
    "supplier-ledger": supplier_ledger_report,
    "customer-ledger": customer_ledger_report,
    "daily-sales-summary": daily_sales_summary_report,
    "payment-collection-detail": payment_collection_report,
    "low-stock": low_stock_report,
    "purchase-return": purchase_return_report,
    "inventory-report": inventory_report,
    "profit-loss-report": profit_loss_report,
    "category-analysis": category_analysis_report,
    "trend-analysis": trend_analysis_report,
    "daily-item-sales": daily_item_sales_report,
    "daily-item-purchase": daily_item_purchase_report,
    "due-customer-report": due_customer_report,
    "expense-report": expense_report,
    "daily-account-closing": daily_account_closing_report,
    "product-details-report": product_details_report,
}


def run_professional_report(
    session: Session,
    company_id: str,
    report_code: str,
    filters: ReportFilters,
) -> list[dict[str, Any]]:
    runner = PROFESSIONAL_REPORT_RUNNERS.get(report_code)
    if not runner:
        raise ValueError(f"Unknown professional report: {report_code}")
    return runner(session, company_id, filters)
