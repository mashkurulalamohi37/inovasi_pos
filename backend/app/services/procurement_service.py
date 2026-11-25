"""Procurement engine — GRN listing, supplier invoices, PO/GRN matching, AP."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlmodel import Session, select

from app.dependencies import AuthContext, write_audit
from app.models.config_engine import NumberSeries
from app.models.operations import (
    PurchaseReceive,
    PurchaseReceiveLine,
    SupplierBalance,
    SupplierInvoice,
    SupplierInvoiceLine,
)
from app.models.product import Product, Supplier
from app.models.sales import PurchaseInvoice, PurchaseInvoiceLine


def _next_number(session: Session, company_id: str, series_code: str, prefix: str) -> str:
    ns = session.exec(
        select(NumberSeries).where(NumberSeries.company_id == company_id, NumberSeries.series_code == series_code)
    ).first()
    if not ns:
        ns = NumberSeries(company_id=company_id, series_code=series_code, prefix=prefix, next_number=1001)
        session.add(ns)
        session.flush()
    num = f"{ns.prefix}-{ns.next_number:04d}"
    ns.next_number += 1
    session.add(ns)
    return num


def _ensure_supplier_balance(session: Session, company_id: str, supplier_id: str) -> SupplierBalance:
    bal = session.exec(
        select(SupplierBalance).where(
            SupplierBalance.company_id == company_id,
            SupplierBalance.supplier_id == supplier_id,
        )
    ).first()
    if not bal:
        bal = SupplierBalance(company_id=company_id, supplier_id=supplier_id, outstanding=0)
        session.add(bal)
        session.flush()
    return bal


def _receive_out(receive: PurchaseReceive, purchase: PurchaseInvoice, lines: list[PurchaseReceiveLine]) -> dict:
    return {
        "id": receive.id,
        "receive_no": receive.receive_no,
        "purchase_id": receive.purchase_id,
        "purchase_no": purchase.invoice_number,
        "store_id": receive.store_id,
        "warehouse_id": receive.warehouse_id,
        "received_at": receive.received_at.isoformat() if receive.received_at else None,
        "remarks": receive.remarks,
        "lines": [
            {
                "id": ln.id,
                "product_id": ln.product_id,
                "purchase_line_id": ln.purchase_line_id,
                "qty": ln.qty,
                "unit_cost": ln.unit_cost,
            }
            for ln in lines
        ],
    }


def list_receives(
    session: Session,
    company_id: str,
    *,
    purchase_id: str | None = None,
    limit: int = 100,
) -> list[dict]:
    stmt = select(PurchaseReceive).where(PurchaseReceive.company_id == company_id)
    if purchase_id:
        stmt = stmt.where(PurchaseReceive.purchase_id == purchase_id)
    receives = session.exec(stmt.order_by(PurchaseReceive.received_at.desc()).limit(limit)).all()  # type: ignore
    out: list[dict] = []
    for receive in receives:
        purchase = session.get(PurchaseInvoice, receive.purchase_id)
        if not purchase:
            continue
        lines = session.exec(
            select(PurchaseReceiveLine).where(PurchaseReceiveLine.receive_id == receive.id)
        ).all()
        out.append(_receive_out(receive, purchase, lines))
    return out


def get_receive(session: Session, company_id: str, receive_id: str) -> dict:
    receive = session.get(PurchaseReceive, receive_id)
    if not receive or receive.company_id != company_id:
        raise HTTPException(status_code=404, detail="GRN not found")
    purchase = session.get(PurchaseInvoice, receive.purchase_id)
    if not purchase:
        raise HTTPException(status_code=404, detail="Linked purchase not found")
    lines = session.exec(select(PurchaseReceiveLine).where(PurchaseReceiveLine.receive_id == receive.id)).all()
    return _receive_out(receive, purchase, lines)


def _invoice_out(inv: SupplierInvoice, lines: list[SupplierInvoiceLine]) -> dict:
    return {
        "id": inv.id,
        "invoice_no": inv.invoice_no,
        "purchase_id": inv.purchase_id,
        "supplier_id": inv.supplier_id,
        "receive_id": inv.receive_id,
        "status": inv.status,
        "match_status": inv.match_status,
        "subtotal": inv.subtotal,
        "tax_amount": inv.tax_amount,
        "total": inv.total,
        "paid_amount": inv.paid_amount,
        "due_amount": inv.due_amount,
        "invoice_date": inv.invoice_date.isoformat() if inv.invoice_date else None,
        "remarks": inv.remarks,
        "lines": [
            {
                "id": ln.id,
                "purchase_line_id": ln.purchase_line_id,
                "product_id": ln.product_id,
                "qty": ln.qty,
                "unit_cost": ln.unit_cost,
                "line_total": ln.line_total,
            }
            for ln in lines
        ],
    }


def list_supplier_invoices(
    session: Session,
    company_id: str,
    *,
    purchase_id: str | None = None,
    supplier_id: str | None = None,
) -> list[dict]:
    stmt = select(SupplierInvoice).where(SupplierInvoice.company_id == company_id)
    if purchase_id:
        stmt = stmt.where(SupplierInvoice.purchase_id == purchase_id)
    if supplier_id:
        stmt = stmt.where(SupplierInvoice.supplier_id == supplier_id)
    rows = session.exec(stmt.order_by(SupplierInvoice.created_at.desc())).all()  # type: ignore
    result = []
    for inv in rows:
        lines = session.exec(
            select(SupplierInvoiceLine).where(SupplierInvoiceLine.supplier_invoice_id == inv.id)
        ).all()
        result.append(_invoice_out(inv, lines))
    return result


def compute_match_status(
    session: Session,
    purchase: PurchaseInvoice,
    invoice_lines: list[SupplierInvoiceLine],
    receive_id: str | None,
) -> str:
    po_lines = {
        ln.id: ln
        for ln in session.exec(
            select(PurchaseInvoiceLine).where(PurchaseInvoiceLine.purchase_id == purchase.id)
        ).all()
    }
    po_total = sum(ln.line_total for ln in po_lines.values())
    inv_total = sum(ln.line_total for ln in invoice_lines)
    po_qty_ok = True
    grn_qty_ok = True
    cost_ok = True

    for inv_ln in invoice_lines:
        po_ln = po_lines.get(inv_ln.purchase_line_id)
        if not po_ln:
            return "variance"
        if abs(inv_ln.unit_cost - po_ln.unit_cost) > 0.01:
            cost_ok = False
        if inv_ln.qty > po_ln.qty + 0.001:
            po_qty_ok = False
        if inv_ln.qty > po_ln.received_qty + 0.001:
            grn_qty_ok = False

    if abs(inv_total - po_total) > 0.01:
        cost_ok = False

    if not po_qty_ok or not cost_ok:
        return "variance"
    if receive_id and grn_qty_ok:
        return "grn_matched"
    if grn_qty_ok and po_qty_ok and cost_ok:
        return "po_matched"
    return "variance"


def create_supplier_invoice(
    session: Session,
    auth: AuthContext,
    purchase_id: str,
    body: dict,
) -> dict:
    purchase = session.get(PurchaseInvoice, purchase_id)
    if not purchase or purchase.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Purchase not found")
    if purchase.status not in ("APPROVED", "PARTIALLY_RECEIVED", "RECEIVED"):
        raise HTTPException(status_code=409, detail="Purchase must be approved before supplier invoice")
    if not purchase.supplier_id:
        raise HTTPException(status_code=400, detail="Purchase has no supplier")

    lines_in = body.get("lines") or []
    if not lines_in:
        raise HTTPException(status_code=400, detail="At least one invoice line required")

    receive_id = body.get("receive_id")
    if receive_id:
        receive = session.get(PurchaseReceive, receive_id)
        if not receive or receive.purchase_id != purchase.id:
            raise HTTPException(status_code=400, detail="Invalid GRN for this purchase")

    subtotal = 0.0
    inv = SupplierInvoice(
        company_id=auth.company_id,
        supplier_id=purchase.supplier_id,
        purchase_id=purchase.id,
        receive_id=receive_id,
        invoice_no=body.get("invoice_no") or _next_number(session, auth.company_id, "SUP-INV", "SINV"),
        invoice_date=datetime.now(timezone.utc),
        status="DRAFT",
        match_status="pending",
        tax_amount=float(body.get("tax_amount") or 0),
        remarks=body.get("remarks"),
        created_by=auth.user_id,
    )
    session.add(inv)
    session.flush()

    inv_lines: list[SupplierInvoiceLine] = []
    for ln in lines_in:
        pl = session.get(PurchaseInvoiceLine, ln["purchase_line_id"])
        if not pl or pl.purchase_id != purchase.id:
            raise HTTPException(status_code=400, detail="Invalid purchase line")
        qty = float(ln.get("qty") or 0)
        unit_cost = float(ln.get("unit_cost") if ln.get("unit_cost") is not None else pl.unit_cost)
        line_total = round(qty * unit_cost, 2)
        subtotal += line_total
        row = SupplierInvoiceLine(
            supplier_invoice_id=inv.id,
            purchase_line_id=pl.id,
            product_id=pl.product_id,
            qty=qty,
            unit_cost=unit_cost,
            line_total=line_total,
        )
        session.add(row)
        inv_lines.append(row)

    inv.subtotal = round(subtotal, 2)
    inv.total = round(subtotal + inv.tax_amount, 2)
    inv.due_amount = inv.total
    inv.match_status = compute_match_status(session, purchase, inv_lines, receive_id)
    session.add(inv)
    write_audit(session, auth, "supplier_invoice_create", "supplier_invoice", inv.id, {"total": inv.total})
    session.flush()
    return _invoice_out(inv, inv_lines)


def approve_supplier_invoice(session: Session, auth: AuthContext, invoice_id: str) -> dict:
    inv = session.get(SupplierInvoice, invoice_id)
    if not inv or inv.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Supplier invoice not found")
    if inv.status != "DRAFT":
        raise HTTPException(status_code=409, detail="Invoice already approved")

    inv.status = "APPROVED"
    inv.match_status = compute_match_status(
        session,
        session.get(PurchaseInvoice, inv.purchase_id),  # type: ignore[arg-type]
        session.exec(
            select(SupplierInvoiceLine).where(SupplierInvoiceLine.supplier_invoice_id == inv.id)
        ).all(),
        inv.receive_id,
    )
    session.add(inv)

    bal = _ensure_supplier_balance(session, auth.company_id, inv.supplier_id)
    bal.outstanding += inv.due_amount
    session.add(bal)

    purchase = session.get(PurchaseInvoice, inv.purchase_id)
    if purchase:
        purchase.due_amount = (purchase.due_amount or 0) + inv.due_amount
        session.add(purchase)

    write_audit(session, auth, "supplier_invoice_approve", "supplier_invoice", inv.id, {"total": inv.total})
    session.flush()
    lines = session.exec(
        select(SupplierInvoiceLine).where(SupplierInvoiceLine.supplier_invoice_id == inv.id)
    ).all()
    return _invoice_out(inv, lines)


def get_purchase_match_summary(session: Session, company_id: str, purchase_id: str) -> dict:
    purchase = session.get(PurchaseInvoice, purchase_id)
    if not purchase or purchase.company_id != company_id:
        raise HTTPException(status_code=404, detail="Purchase not found")
    po_lines = session.exec(
        select(PurchaseInvoiceLine).where(PurchaseInvoiceLine.purchase_id == purchase.id)
    ).all()
    receives = list_receives(session, company_id, purchase_id=purchase_id)
    invoices = list_supplier_invoices(session, company_id, purchase_id=purchase_id)
    return {
        "purchase_id": purchase.id,
        "purchase_no": purchase.invoice_number,
        "po_total": purchase.total,
        "received_qty": sum(ln.received_qty for ln in po_lines),
        "ordered_qty": sum(ln.qty for ln in po_lines),
        "grn_count": len(receives),
        "supplier_invoice_count": len(invoices),
        "invoices": [
            {"id": i["id"], "invoice_no": i["invoice_no"], "status": i["status"], "match_status": i["match_status"], "total": i["total"]}
            for i in invoices
        ],
    }
