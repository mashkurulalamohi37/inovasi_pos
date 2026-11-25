"""Sales return, refund, exchange, receipt reprint."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlmodel import Session, select

from app.dependencies import AuthContext, write_audit
from app.models.config_engine import NumberSeries, ReceiptTemplate
from app.models.industry import ElectronicsRma, ElectronicsSerialStock, FashionProductVariant
from app.models.operations import Exchange, ExchangeLine, Refund, SalesReturn, SalesReturnLine
from app.models.product import ProductVariant
from app.models.sales import Payment, Receipt, SalesInvoice, SalesInvoiceLine
from app.inventory.constants import SALE, SALES_RETURN
from app.services.sales_policy_service import validate_return_policy
from app.services.inventory_service import record_stock_movement

FASHION_RETURN_CONDITIONS = frozenset({"saleable", "damaged", "defective"})


def _line_meta(inv_line: SalesInvoiceLine, extra: dict | None = None) -> dict:
    meta = dict(extra or {})
    if inv_line.meta_json:
        try:
            inv_meta = json.loads(inv_line.meta_json)
            if isinstance(inv_meta, dict):
                meta = {**inv_meta, **meta}
        except json.JSONDecodeError:
            pass
    return meta


def _resolve_fashion_variant(
    session: Session,
    company_id: str,
    variant_id: str | None,
    *,
    expected_product_id: str | None = None,
) -> tuple[str, str]:
    """Return (product_id, variant_id) for ProductVariant or legacy FashionProductVariant."""
    if not variant_id:
        raise HTTPException(status_code=400, detail="Fashion exchange/return requires variant_id")
    pv = session.get(ProductVariant, variant_id)
    if pv and pv.company_id == company_id:
        if expected_product_id and pv.product_id != expected_product_id:
            raise HTTPException(
                status_code=400,
                detail="Replacement variant must belong to the same product as the returned item",
            )
        if not pv.is_active:
            raise HTTPException(status_code=400, detail=f"Variant is inactive: {pv.variant_code}")
        return pv.product_id, pv.id

    legacy = session.get(FashionProductVariant, variant_id)
    if legacy:
        if expected_product_id and legacy.product_id != expected_product_id:
            raise HTTPException(
                status_code=400,
                detail="Replacement variant must belong to the same product as the returned item",
            )
        # Prefer matching generic ProductVariant for ledger/Option B consistency
        match = None
        if legacy.barcode:
            match = session.exec(
                select(ProductVariant).where(
                    ProductVariant.company_id == company_id,
                    ProductVariant.product_id == legacy.product_id,
                    ProductVariant.barcode == legacy.barcode,
                )
            ).first()
        if not match and legacy.size and legacy.color:
            match = session.exec(
                select(ProductVariant).where(
                    ProductVariant.company_id == company_id,
                    ProductVariant.product_id == legacy.product_id,
                    ProductVariant.size == legacy.size,
                    ProductVariant.color == legacy.color,
                )
            ).first()
        if not match and legacy.sku:
            match = session.exec(
                select(ProductVariant).where(
                    ProductVariant.company_id == company_id,
                    ProductVariant.product_id == legacy.product_id,
                    ProductVariant.variant_code == legacy.sku,
                )
            ).first()
        return legacy.product_id, (match.id if match else legacy.id)

    raise HTTPException(status_code=400, detail=f"Unknown fashion variant: {variant_id}")


def _validate_fashion_return_lines(
    session: Session,
    auth: AuthContext,
    inv: SalesInvoice,
    lines_in: list[dict],
    *,
    condition: str,
) -> None:
    cond = str(condition or "saleable").strip().lower()
    if cond not in FASHION_RETURN_CONDITIONS:
        raise HTTPException(
            status_code=400,
            detail="Fashion return condition must be saleable|damaged|defective",
        )
    for ln in lines_in:
        inv_line = session.get(SalesInvoiceLine, ln.get("invoice_line_id") or ln.get("line_id"))
        if not inv_line or inv_line.invoice_id != inv.id:
            raise HTTPException(status_code=400, detail="Invalid invoice line")
        meta = _line_meta(inv_line, ln.get("meta") or {})
        variant_id = meta.get("variant_id") or meta.get("productId")
        if not variant_id and inv_line.product_id:
            pv = session.exec(
                select(ProductVariant).where(
                    ProductVariant.company_id == auth.company_id,
                    ProductVariant.product_id == inv_line.product_id,
                )
            ).first()
            if pv:
                variant_id = pv.id
        if not variant_id:
            raise HTTPException(
                status_code=400,
                detail=f"Fashion return requires variant_id on line {inv_line.sku}",
            )
        product_id, resolved = _resolve_fashion_variant(
            session,
            auth.company_id,
            str(variant_id),
            expected_product_id=inv_line.product_id,
        )
        ln.setdefault("meta", {})
        ln["meta"]["variant_id"] = resolved
        line_cond = str(ln.get("condition") or cond).strip().lower()
        if line_cond not in FASHION_RETURN_CONDITIONS:
            raise HTTPException(
                status_code=400,
                detail="Fashion return line condition must be saleable|damaged|defective",
            )
        ln["condition"] = line_cond


def _validate_fashion_exchange(
    session: Session,
    auth: AuthContext,
    inv: SalesInvoice,
    body: dict,
) -> None:
    return_lines = body.get("return_lines") or body.get("lines") or []
    new_lines = body.get("new_lines") or []
    if not new_lines:
        raise HTTPException(status_code=400, detail="Fashion exchange requires new_lines with replacement variant")
    _validate_fashion_return_lines(
        session,
        auth,
        inv,
        return_lines,
        condition=str(body.get("condition") or "saleable"),
    )
    for nl in new_lines:
        variant_id = nl.get("variant_id") or (nl.get("meta") or {}).get("variant_id")
        if not variant_id:
            raise HTTPException(status_code=400, detail="Fashion exchange requires variant_id for replacement item")
        pid, resolved = _resolve_fashion_variant(
            session,
            auth.company_id,
            str(variant_id),
            expected_product_id=None,
        )
        nl["product_id"] = pid
        nl["variant_id"] = resolved


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


def _get_invoice(session: Session, company_id: str, invoice_id: str) -> SalesInvoice:
    inv = session.get(SalesInvoice, invoice_id)
    if not inv or inv.company_id != company_id:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return inv


def _returned_qty(session: Session, line_id: str) -> float:
    rows = session.exec(select(SalesReturnLine).where(SalesReturnLine.invoice_line_id == line_id)).all()
    return sum(r.qty for r in rows)


def create_sales_return(session: Session, auth: AuthContext, invoice_id: str, body: dict) -> dict:
    inv = _get_invoice(session, auth.company_id, invoice_id)
    validate_return_policy(session, auth.company_id, inv)
    lines_in = body.get("lines") or []
    if not lines_in:
        raise HTTPException(status_code=400, detail="Return lines required")
    reason = str(body.get("reason") or "").strip() or "Customer Return"
    body["reason"] = reason
    industry = inv.industry_pack
    condition = body.get("condition", "saleable")
    total = 0.0
    if industry == "pharmacy":
        from app.services.pharma_service import validate_pharma_return_lines
        try:
            validate_pharma_return_lines(session, auth, inv, lines_in)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    if industry == "surgical-shop":
        from app.services.surgical_service import validate_surgical_return_lines
        validate_surgical_return_lines(session, auth, inv, lines_in)
    if industry == "cosmetics":
        from app.services.cosmetics_service import validate_cosmetics_return_lines
        # Require condition on header or each line
        header_cond = str(body.get("condition") or "").strip().lower()
        for ln in lines_in:
            cond = str(ln.get("condition") or header_cond or "").strip().lower()
            if not cond:
                raise HTTPException(
                    status_code=400,
                    detail="Cosmetics return requires condition: unopened|opened|damaged|defective|expired",
                )
            ln["condition"] = cond
        validate_cosmetics_return_lines(session, auth, inv, lines_in)
        if header_cond and header_cond not in {"unopened", "opened", "damaged", "defective", "expired", "saleable"}:
            raise HTTPException(
                status_code=400,
                detail="Cosmetics return condition must be unopened|opened|damaged|defective|expired",
            )
    if industry in {"hardware", "stationery"}:
        from app.services.hardware_service import validate_hardware_return_lines
        validate_hardware_return_lines(session, auth, inv, lines_in)
    if industry == "fashion":
        condition = str(body.get("condition") or "saleable").strip().lower()
        body["condition"] = condition
        _validate_fashion_return_lines(session, auth, inv, lines_in, condition=condition)
    ret = SalesReturn(
        company_id=auth.company_id,
        invoice_id=inv.id,
        return_no=_next_number(session, auth.company_id, "SRET", "SR"),
        industry_pack=industry,
        reason=body.get("reason"),
        condition=condition,
        returned_by=auth.user_id,
        meta_json=json.dumps(body.get("meta") or {}),
    )
    session.add(ret)
    session.flush()
    restore_stock = industry != "restaurant" and (condition == "saleable" or industry == "surgical-shop")
    if industry == "cosmetics":
        # Only unopened (or legacy saleable) restores sellable StockBalance + available batch via movement.
        # opened/damaged/defective/expired: financial return without sellable restore.
        restore_stock = False  # per-line decision below
    for ln in lines_in:
        inv_line = session.get(SalesInvoiceLine, ln.get("invoice_line_id") or ln.get("line_id"))
        if not inv_line or inv_line.invoice_id != inv.id:
            raise HTTPException(status_code=400, detail="Invalid invoice line")
        qty = float(ln.get("qty") or 0)
        already = _returned_qty(session, inv_line.id)
        if industry not in {"hardware", "stationery"} and qty + already > inv_line.qty:
            raise HTTPException(status_code=400, detail=f"Return qty exceeds sold for {inv_line.sku}")
        line_total = qty * inv_line.unit_price
        total += line_total
        meta = ln.get("meta") or {}
        line_condition = ln.get("condition") or condition
        session.add(
            SalesReturnLine(
                return_id=ret.id,
                invoice_line_id=inv_line.id,
                product_id=inv_line.product_id,
                sku=inv_line.sku,
                name=inv_line.name,
                qty=qty,
                unit_price=inv_line.unit_price,
                line_total=line_total,
                condition=line_condition,
                meta_json=json.dumps(meta),
            )
        )
        line_restore = restore_stock
        if industry == "cosmetics":
            line_restore = str(line_condition or "").strip().lower() in {"unopened", "saleable"}
        if industry == "fashion":
            line_restore = str(line_condition or "").strip().lower() == "saleable"
        if line_restore and inv_line.product_id:
            line_meta = _line_meta(inv_line, meta)
            restore_qty = qty
            if industry in {"hardware", "stationery"}:
                from app.services.hardware_service import hardware_stock_qty_from_meta

                restore_qty = hardware_stock_qty_from_meta(line_meta, qty)
            record_stock_movement(
                session,
                company_id=auth.company_id,
                product_id=inv_line.product_id,
                store_id=inv.store_id,
                warehouse_id=None,
                in_qty=restore_qty,
                transaction_type=SALES_RETURN,
                transaction_ref=ret.return_no,
                reference_id=ret.id,
                note=body.get("reason"),
                created_by=auth.user_id,
                variant_id=line_meta.get("variant_id"),
                batch_id=line_meta.get("batch_id") or line_meta.get("stock_unit_id"),
                serial_no=line_meta.get("serial") or line_meta.get("serial_imei") or line_meta.get("serial_no"),
            )
            return_meta = line_meta
        else:
            return_meta = _line_meta(inv_line, meta)
            if industry == "fashion" and str(line_condition or "").strip().lower() in {"damaged", "defective"}:
                write_audit(
                    session,
                    auth,
                    "fashion.return_non_restock",
                    "sales_return",
                    ret.id,
                    {
                        "invoice_line_id": inv_line.id,
                        "sku": inv_line.sku,
                        "qty": qty,
                        "condition": line_condition,
                        "variant_id": return_meta.get("variant_id"),
                    },
                )
        if inv_line.product_id:
            _apply_industry_return(session, auth, industry, inv_line, qty, return_meta, line_condition)
    ret.total_amount = total
    session.add(ret)
    inv.status = "returned" if total >= inv.total else inv.status
    session.add(inv)
    write_audit(session, auth, "sales_return", "sales_return", ret.id, {"total": total, "industry": industry})
    session.flush()
    return _return_out(ret)


def _apply_industry_return(session, auth, industry, inv_line, qty, meta, condition):
    if industry in {"electronics", "mobile-shop"}:
        serial = meta.get("serial") or meta.get("serial_imei") or meta.get("imei") or meta.get("imei_1")
        if serial and industry == "mobile-shop":
            from app.services.electronics_service import find_serial

            row = find_serial(session, auth.company_id, str(serial))
            if row:
                if condition == "saleable":
                    # Do not auto-sellable; require QC — status returned
                    row.status = "returned"
                    row.condition = meta.get("condition") or row.condition or "like_new"
                else:
                    row.status = "returned"
                    row.condition = meta.get("condition") or "fair"
                    session.add(
                        ElectronicsRma(
                            company_id=auth.company_id,
                            invoice_number=inv_line.invoice_id,
                            customer_name=meta.get("customer_name", ""),
                            product_id=inv_line.product_id,
                            product_name=inv_line.name,
                            serial_id=row.id,
                            serial_imei=serial,
                            warranty_status=meta.get("warranty_status", "unknown"),
                            return_reason=meta.get("reason", "Return"),
                            action_type=meta.get("action_type", "return"),
                            approval_status="pending",
                        )
                    )
                row.sales_invoice_id = None
                row.sold_at = None
                session.add(row)
        elif serial and condition == "saleable":
            row = session.exec(
                select(ElectronicsSerialStock).where(
                    ElectronicsSerialStock.company_id == auth.company_id,
                    ElectronicsSerialStock.serial_imei == serial,
                )
            ).first()
            if row:
                row.status = "available"
                session.add(row)
        elif serial:
            session.add(
                ElectronicsRma(
                    company_id=auth.company_id,
                    invoice_number=inv_line.invoice_id,
                    customer_name=meta.get("customer_name", ""),
                    product_name=inv_line.name,
                    serial_imei=serial,
                    warranty_status=meta.get("warranty_status", "unknown"),
                    return_reason=meta.get("reason", "Return"),
                    action_type=meta.get("action_type", "return"),
                    approval_status="pending",
                )
            )
    elif industry == "jewelry":
        from app.models.industry import JewelrySalesLineExtension
        from app.services.jewelry_service import update_certificate_status

        cert_id = meta.get("certificate_id")
        cert_no = meta.get("certificate") or meta.get("certificate_no")
        if not cert_id and not cert_no:
            ext = session.exec(
                select(JewelrySalesLineExtension).where(JewelrySalesLineExtension.line_id == inv_line.id)
            ).first()
            if ext:
                cert_id = ext.certificate_id
                cert_no = ext.certificate_no
            if inv_line.meta_json:
                try:
                    inv_meta = json.loads(inv_line.meta_json)
                    cert_id = cert_id or inv_meta.get("certificate_id")
                    cert_no = cert_no or inv_meta.get("certificate") or inv_meta.get("certificate_no")
                except json.JSONDecodeError:
                    pass
        status = "exchanged" if meta.get("exchange") or meta.get("is_exchange") else "returned"
        update_certificate_status(session, auth.company_id, cert_id, str(cert_no) if cert_no else None, status)
    elif industry == "surgical-shop":
        from app.services.surgical_service import apply_surgical_return

        apply_surgical_return(session, auth, inv_line, qty, meta, condition)
    elif industry == "cosmetics":
        from app.services.cosmetics_service import apply_cosmetics_return

        apply_cosmetics_return(session, auth, inv_line, qty, meta, condition)


def _refunded_amount(session: Session, invoice_id: str) -> float:
    rows = session.exec(select(Refund).where(Refund.invoice_id == invoice_id)).all()
    return sum(r.amount for r in rows)


def create_refund(session: Session, auth: AuthContext, invoice_id: str, body: dict) -> dict:
    from app.rbac import role_has_permission

    if not role_has_permission(auth.role_code, "pos.refund"):
        from app.services.approval_service import create_approval

        inv = _get_invoice(session, auth.company_id, invoice_id)
        amount = float(body.get("amount") or 0)
        if amount <= 0:
            raise HTTPException(status_code=400, detail="Refund amount required")
        if amount > inv.total:
            raise HTTPException(status_code=400, detail="Refund exceeds invoice total")
        already = _refunded_amount(session, invoice_id)
        if amount + already > inv.total + 0.01:
            raise HTTPException(status_code=400, detail="Refund exceeds refundable balance")
        approval = create_approval(
            session,
            auth,
            request_type="refund",
            entity_type="sales_invoice",
            entity_id=invoice_id,
            title=f"Refund approval for {inv.invoice_number}",
            detail={
                "invoice_id": invoice_id,
                "invoice_number": inv.invoice_number,
                "amount": amount,
                "method": body.get("method", "cash"),
                "reference": body.get("reference"),
                "return_id": body.get("return_id"),
            },
        )
        return {
            "status": "pending_approval",
            "approval_id": approval["id"],
            "invoice_id": invoice_id,
            "amount": amount,
        }

    return _execute_refund(session, auth, invoice_id, body)


def _execute_refund(session: Session, auth: AuthContext, invoice_id: str, body: dict) -> dict:
    inv = _get_invoice(session, auth.company_id, invoice_id)
    amount = float(body.get("amount") or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Refund amount required")
    if amount > inv.total:
        raise HTTPException(status_code=400, detail="Refund exceeds invoice total")
    already = _refunded_amount(session, invoice_id)
    if amount + already > inv.total + 0.01:
        raise HTTPException(status_code=400, detail="Refund exceeds refundable balance")
    refund = Refund(
        company_id=auth.company_id,
        invoice_id=inv.id,
        return_id=body.get("return_id"),
        refund_no=_next_number(session, auth.company_id, "REF", "RF"),
        amount=amount,
        method=body.get("method", "cash"),
        reference=body.get("reference"),
        refunded_by=auth.user_id,
    )
    session.add(refund)
    session.add(
        Payment(
            company_id=auth.company_id,
            invoice_id=inv.id,
            payment_type="refund",
            direction="out",
            return_id=refund.id,
            store_id=inv.store_id,
            counter_id=inv.counter_id,
            cashier_id=auth.user_id,
            method=refund.method,
            amount=amount,
            reference=refund.refund_no,
            status="completed",
        )
    )
    write_audit(session, auth, "refund", "refund", refund.id, {"amount": amount})
    session.flush()

    from app.services.accounting_service import get_account_by_code, get_linked_account_id, post_journal_entry

    cash_account_id = get_linked_account_id(session, auth.company_id, refund.method)
    returns_account = get_account_by_code(session, auth.company_id, "4200")
    post_journal_entry(
        session,
        company_id=auth.company_id,
        created_by=auth.user_id,
        entry_date=datetime.now(timezone.utc),
        source_type="refund",
        source_id=refund.id,
        lines=[
            {"account_id": returns_account.id, "debit": amount, "store_id": inv.store_id},
            {"account_id": cash_account_id, "credit": amount, "store_id": inv.store_id},
        ],
        memo=f"Refund: {refund.refund_no}",
    )

    return {"id": refund.id, "refund_no": refund.refund_no, "amount": amount}


def _check_voidable(session: Session, company_id: str, inv: SalesInvoice) -> None:
    """A void undoes a cashier's own mistake right after checkout — it is not a
    substitute for the customer-return flow, so it only applies to a completed
    sale with no prior return/refund activity, within a short store-configured
    window."""
    if inv.status != "completed":
        raise HTTPException(
            status_code=409,
            detail=f"Only a completed sale with no prior returns can be voided (status={inv.status})",
        )
    if _refunded_amount(session, inv.id) > 0:
        raise HTTPException(
            status_code=409,
            detail="Sale already has a refund on record; use return/refund instead of void",
        )
    from app.services.sales_policy_service import _get_store_policy

    window_minutes = int(_get_store_policy(session, company_id, inv.store_id, "pos.void_window_minutes", "120"))
    if inv.completed_at:
        completed = inv.completed_at
        if completed.tzinfo is None:
            completed = completed.replace(tzinfo=timezone.utc)
        age_minutes = (datetime.now(timezone.utc) - completed).total_seconds() / 60
        if age_minutes > window_minutes:
            raise HTTPException(
                status_code=409,
                detail=f"Void window expired ({window_minutes} minutes) — use return/refund instead",
            )


def create_void(session: Session, auth: AuthContext, invoice_id: str, body: dict) -> dict:
    """Void a completed sale: full restock + full refund reversal, gated behind
    pos.void_sale. A cashier without that permission gets a pending approval
    request instead of an immediate void (same pattern as create_refund)."""
    from app.rbac import role_has_permission

    reason = str(body.get("reason") or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Void reason is required")

    inv = _get_invoice(session, auth.company_id, invoice_id)
    _check_voidable(session, auth.company_id, inv)

    if not role_has_permission(auth.role_code, "pos.void_sale"):
        from app.services.approval_service import create_approval

        approval = create_approval(
            session,
            auth,
            request_type="void",
            entity_type="sales_invoice",
            entity_id=invoice_id,
            title=f"Void approval for {inv.invoice_number}",
            detail={"invoice_id": invoice_id, "invoice_number": inv.invoice_number, "reason": reason},
        )
        return {
            "status": "pending_approval",
            "approval_id": approval["id"],
            "invoice_id": invoice_id,
        }

    return _execute_void(session, auth, invoice_id, {"reason": reason})


def _execute_void(session: Session, auth: AuthContext, invoice_id: str, body: dict) -> dict:
    inv = _get_invoice(session, auth.company_id, invoice_id)
    _check_voidable(session, auth.company_id, inv)
    reason = str(body.get("reason") or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Void reason is required")

    lines = session.exec(
        select(SalesInvoiceLine).where(SalesInvoiceLine.invoice_id == inv.id)
    ).all()
    if not lines:
        raise HTTPException(status_code=400, detail="Sale has no lines to void")

    return_lines = [
        {"invoice_line_id": ln.id, "qty": ln.qty, "meta": _line_meta(ln)}
        for ln in lines
    ]
    create_sales_return(
        session,
        auth,
        invoice_id,
        {"lines": return_lines, "reason": f"VOID: {reason}", "condition": "saleable"},
    )

    if inv.total > 0:
        _execute_refund(
            session,
            auth,
            invoice_id,
            {"amount": inv.total, "method": inv.tender or "cash", "reference": "VOID"},
        )

    inv.status = "voided"
    session.add(inv)
    write_audit(
        session,
        auth,
        "pos.void_sale",
        "sales_invoice",
        inv.id,
        {"reason": reason, "total": inv.total, "invoice_number": inv.invoice_number},
    )
    session.flush()
    return {"id": inv.id, "invoice_number": inv.invoice_number, "status": "voided", "total": inv.total}


def create_exchange(session: Session, auth: AuthContext, invoice_id: str, body: dict) -> dict:
    inv = _get_invoice(session, auth.company_id, invoice_id)
    # Exchange is a universal retail flow — a customer swapping goods is not
    # specific to a vertical. This used to be hard-gated to fashion/mobile-shop/
    # electronics, which meant a grocery or hardware till simply could not process
    # one. Pack-specific rules still apply below (fashion validates size/colour
    # variants); every other pack gets the generic return-plus-new-lines flow.
    if inv.industry_pack == "fashion":
        _validate_fashion_exchange(session, auth, inv, body)
    return_result = create_sales_return(session, auth, invoice_id, {
        "lines": body.get("return_lines") or body.get("lines") or [],
        "reason": body.get("reason", "Exchange"),
        "condition": body.get("condition", "saleable"),
        "meta": body.get("meta") or {},
    })
    ret_id = return_result["id"]
    exchange = Exchange(
        company_id=auth.company_id,
        invoice_id=inv.id,
        return_id=ret_id,
        exchange_no=_next_number(session, auth.company_id, "EXCH", "EX"),
        industry_pack=inv.industry_pack,
        price_difference=float(body.get("price_difference") or 0),
        exchanged_by=auth.user_id,
        meta_json=json.dumps(body.get("meta") or {}),
    )
    session.add(exchange)
    session.flush()
    for nl in body.get("new_lines") or []:
        session.add(
            ExchangeLine(
                exchange_id=exchange.id,
                direction="in",
                product_id=nl.get("product_id"),
                sku=nl.get("sku", ""),
                name=nl.get("name", ""),
                qty=float(nl.get("qty") or 1),
                unit_price=float(nl.get("unit_price") or 0),
                variant_id=nl.get("variant_id"),
                meta_json=json.dumps(nl.get("meta") or {}),
            )
        )
        if nl.get("product_id"):
            try:
                record_stock_movement(
                    session,
                    company_id=auth.company_id,
                    product_id=nl["product_id"],
                    store_id=inv.store_id,
                    warehouse_id=None,
                    out_qty=float(nl.get("qty") or 1),
                    transaction_type=SALE,
                    transaction_ref=exchange.exchange_no,
                    reference_id=exchange.id,
                    created_by=auth.user_id,
                    variant_id=nl.get("variant_id"),
                )
            except Exception as exc:
                from app.inventory.exceptions import InsufficientStockError

                if isinstance(exc, InsufficientStockError):
                    raise HTTPException(status_code=409, detail=str(exc)) from exc
                raise
    write_audit(session, auth, "exchange", "exchange", exchange.id)
    session.flush()
    return {"id": exchange.id, "exchange_no": exchange.exchange_no, "return_id": ret_id}


def get_receipt(session: Session, company_id: str, invoice_id: str) -> dict:
    inv = _get_invoice(session, company_id, invoice_id)
    receipt = session.exec(select(Receipt).where(Receipt.invoice_id == inv.id)).first()
    lines = session.exec(select(SalesInvoiceLine).where(SalesInvoiceLine.invoice_id == inv.id)).all()
    content = json.loads(receipt.content_json) if receipt and receipt.content_json else {}
    template = None
    if receipt and receipt.template_id:
        template = session.get(ReceiptTemplate, receipt.template_id)
    elif receipt is None or not receipt.template_id:
        template = session.exec(
            select(ReceiptTemplate).where(
                ReceiptTemplate.company_id == company_id,
                ReceiptTemplate.pack_code == inv.industry_pack,
                ReceiptTemplate.is_default == True,  # noqa: E712
            )
        ).first()
    return {
        "invoice_id": inv.id,
        "invoice_number": inv.invoice_number,
        "industry_pack": inv.industry_pack,
        "total": inv.total,
        "tender": inv.tender,
        "completed_at": inv.completed_at.isoformat() if inv.completed_at else None,
        "content": content,
        "template": {
            "id": template.id,
            "name": template.name,
            "brand_name": template.brand_name,
            "tagline": template.tagline,
            "footer_notes": template.footer_notes,
        } if template else None,
        "lines": [
            {"sku": l.sku, "name": l.name, "qty": l.qty, "unit_price": l.unit_price, "line_total": l.line_total,
             "meta": json.loads(l.meta_json or "{}")}
            for l in lines
        ],
    }


def reprint_receipt(session: Session, auth: AuthContext, invoice_id: str) -> dict:
    data = get_receipt(session, auth.company_id, invoice_id)
    write_audit(session, auth, "receipt_reprint", "receipt", invoice_id, {"invoice_number": data["invoice_number"]})
    session.flush()
    return {**data, "reprinted": True, "reprinted_at": datetime.now(timezone.utc).isoformat()}


def list_returns(session: Session, company_id: str, limit: int = 50):
    rows = session.exec(
        select(SalesReturn).where(SalesReturn.company_id == company_id).order_by(SalesReturn.created_at.desc())  # type: ignore
    ).limit(limit).all()
    return [_return_out(r) for r in rows]


def list_exchanges(
    session: Session,
    company_id: str,
    *,
    limit: int = 50,
    industry_pack: str | None = None,
) -> list[dict]:
    from app.models.sales import SalesInvoice

    q = select(Exchange).where(Exchange.company_id == company_id)
    if industry_pack:
        q = q.where(Exchange.industry_pack == industry_pack)
    rows = session.exec(q.order_by(Exchange.exchanged_at.desc()).limit(limit)).all()  # type: ignore
    out: list[dict] = []
    for ex in rows:
        inv = session.get(SalesInvoice, ex.invoice_id)
        ret = session.get(SalesReturn, ex.return_id) if ex.return_id else None
        new_lines = session.exec(
            select(ExchangeLine).where(ExchangeLine.exchange_id == ex.id, ExchangeLine.direction == "in")
        ).all()
        out.append({
            "id": ex.id,
            "exchange_no": ex.exchange_no,
            "invoice_id": ex.invoice_id,
            "invoice_number": inv.invoice_number if inv else None,
            "return_id": ex.return_id,
            "return_no": ret.return_no if ret else None,
            "reason": ret.reason if ret else None,
            "price_difference": ex.price_difference,
            "status": ex.status,
            "exchanged_at": ex.exchanged_at.isoformat() if ex.exchanged_at else None,
            "new_lines": [
                {
                    "product_id": nl.product_id,
                    "sku": nl.sku,
                    "name": nl.name,
                    "qty": nl.qty,
                    "variant_id": nl.variant_id,
                }
                for nl in new_lines
            ],
        })
    return out


def _return_out(r: SalesReturn) -> dict:
    return {
        "id": r.id,
        "return_no": r.return_no,
        "invoice_id": r.invoice_id,
        "industry_pack": r.industry_pack,
        "reason": r.reason,
        "condition": r.condition,
        "total_amount": r.total_amount,
        "status": r.status,
        "returned_at": r.returned_at.isoformat() if r.returned_at else None,
    }
