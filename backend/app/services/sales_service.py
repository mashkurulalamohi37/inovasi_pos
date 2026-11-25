"""Sales creation with idempotent client_transaction_id and industry extensions."""

import json
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.dependencies import AuthContext, write_audit
from app.inventory.exceptions import InsufficientStockError
from app.inventory.locking import for_update
from app.models.config_engine import NumberSeries, ReceiptTemplate, StorePolicy
from app.models.inventory import StockBalance
from app.models.product import Customer, CustomerBalance
from app.models.sales import Payment, Receipt, SalesInvoice, SalesInvoiceLine, SyncLog
from app.schemas.commerce import SaleCreate, SaleOut
from app.services.industry_sales_service import save_line_extension, validate_sale_lines
from app.services.inventory_service import adjust_stock_for_sale, consume_reservation


def _next_invoice_number(session: Session, company_id: str) -> str:
    """Allocate the next invoice number atomically.

    This used to read next_number into Python, format it, then increment the ORM
    object. With no row lock — and no unique constraint on
    sales_invoice.invoice_number — two tills ringing up at the same moment read
    the same value and were issued the SAME invoice number. Measured on this
    build: 12 concurrent sales produced 2 distinct numbers, one of them reused 9
    times.

    A single UPDATE ... SET next_number = next_number + 1 takes an exclusive row
    lock in the database for the life of the transaction, so concurrent callers
    serialise on it and each gets a distinct number. Reading the value back
    inside the same transaction is safe for the same reason, and avoids relying
    on RETURNING (Postgres and SQLite >= 3.35 only).
    """
    ns = session.exec(
        select(NumberSeries).where(NumberSeries.company_id == company_id, NumberSeries.series_code == "SALES")
    ).first()
    if not ns:
        ns = NumberSeries(company_id=company_id, series_code="SALES", prefix="INV", next_number=1001)
        session.add(ns)
        session.flush()

    prefix = ns.prefix
    session.execute(
        update(NumberSeries)
        .where(NumberSeries.company_id == company_id, NumberSeries.series_code == "SALES")
        .values(next_number=NumberSeries.next_number + 1)
    )
    # Re-read our own uncommitted increment; the row lock above guarantees no
    # other transaction can be between the update and this read.
    session.refresh(ns)
    return f"{prefix}-{ns.next_number - 1:06d}"


def _resolve_receipt_template(session: Session, company_id: str, pack_code: str) -> ReceiptTemplate | None:
    pack_default = session.exec(
        select(ReceiptTemplate).where(
            ReceiptTemplate.company_id == company_id,
            ReceiptTemplate.pack_code == pack_code,
            ReceiptTemplate.is_default == True,  # noqa: E712
        )
    ).first()
    if pack_default:
        return pack_default
    pack_any = session.exec(
        select(ReceiptTemplate).where(
            ReceiptTemplate.company_id == company_id,
            ReceiptTemplate.pack_code == pack_code,
        )
    ).first()
    if pack_any:
        return pack_any
    return session.exec(
        select(ReceiptTemplate).where(
            ReceiptTemplate.company_id == company_id,
            ReceiptTemplate.is_default == True,  # noqa: E712
        )
    ).first()


def _normalize_payments(body: SaleCreate) -> list[dict]:
    if body.payments:
        return [p.model_dump() for p in body.payments]
    return [{"method": body.tender, "amount": body.total, "reference": None}]


#: Money tolerance, matching the existing payment-total check.
_MONEY_TOLERANCE = 0.02


def _validate_sale_totals(body: SaleCreate) -> None:
    """Refuse a header that is worth less than the lines it contains.

    subtotal/discount/tax/total were persisted exactly as sent, so a caller could
    post an 850.00 line with total 0.01 and the invoice, the GL journal and the
    stock movement were all written at 0.01.

    This checks a floor rather than an exact identity on purpose. Verticals
    legitimately push the total *above* the line value — restaurant folds a
    service charge in, others add tax or delivery — and building/optical derive
    subtotal from their own order records under UOM conversion. Undercharging is
    the fraud direction, so that is what is blocked.
    """
    line_value = round(sum(float(line.qty) * float(line.unit_price) for line in body.lines), 2)
    discount = float(body.discount or 0)
    if discount > line_value + _MONEY_TOLERANCE:
        raise HTTPException(
            status_code=400,
            detail=f"Discount {discount} exceeds line total {line_value}",
        )
    floor = round(line_value - discount, 2)
    if float(body.total or 0) < floor - _MONEY_TOLERANCE:
        raise HTTPException(
            status_code=400,
            detail=f"Sale total {body.total} is below the line total after discount ({floor})",
        )


def _validate_payment_total(body: SaleCreate, payments: list[dict], customer_id: str | None) -> str:
    paid = round(sum(float(p["amount"]) for p in payments), 2)
    expected_total = round(float(body.total or 0), 2)
    if paid > expected_total + 0.05:
        raise HTTPException(status_code=400, detail=f"Payment total {paid} exceeds sale total {expected_total}")
    if abs(paid - expected_total) > 0.05:
        if not customer_id:
            raise HTTPException(
                status_code=400,
                detail=f"Payment total {paid} does not match sale total {expected_total}; customer required for due sale",
            )
    if len(payments) > 1:
        return "split"
    return str(payments[0]["method"]).lower()


def _customer_balance(session: Session, company_id: str, customer_id: str) -> CustomerBalance:
    bal = session.exec(
        select(CustomerBalance).where(
            CustomerBalance.company_id == company_id,
            CustomerBalance.customer_id == customer_id,
        )
    ).first()
    if not bal:
        bal = CustomerBalance(company_id=company_id, customer_id=customer_id, outstanding=0)
        session.add(bal)
        session.flush()
    return bal


def _validate_customer(session: Session, company_id: str, customer_id: str) -> Customer:
    c = session.get(Customer, customer_id)
    if not c or c.company_id != company_id:
        raise HTTPException(status_code=400, detail="Invalid customer")
    if not c.is_active:
        raise HTTPException(status_code=400, detail="Customer is inactive")
    return c


def _reservation_ids_for_sale(body: SaleCreate) -> set[str]:
    ids: set[str] = set(body.reservation_ids or [])
    for line in body.lines:
        if line.reservation_id:
            ids.add(line.reservation_id)
        meta_rid = (line.meta or {}).get("reservation_id")
        if meta_rid:
            ids.add(str(meta_rid))
    return ids


def create_sale_idempotent(session: Session, auth: AuthContext, body: SaleCreate) -> SaleOut:
    # Idempotency keys belong to a tenant. Without the company_id predicate this
    # matched ANY tenant's invoice, so posting another company's
    # client_transaction_id returned their invoice id, invoice number and total —
    # and silently swallowed the caller's own sale as a "duplicate" that was
    # never recorded.
    existing = session.exec(
        select(SalesInvoice).where(
            SalesInvoice.company_id == auth.company_id,
            SalesInvoice.client_transaction_id == body.client_transaction_id,
        )
    ).first()
    if existing:
        session.add(
            SyncLog(
                company_id=auth.company_id,
                client_transaction_id=body.client_transaction_id,
                invoice_id=existing.id,
                status="duplicate",
                detail_json=json.dumps({"message": "Already synced"}),
            )
        )
        return SaleOut(
            id=existing.id,
            invoice_number=existing.invoice_number,
            client_transaction_id=existing.client_transaction_id,
            total=existing.total,
            status=existing.status,
            industry_pack=existing.industry_pack,
            duplicate=True,
        )

    try:
        validate_sale_lines(
            session,
            auth,
            body.industry_pack,
            body.lines,
            customer_id=body.customer_id,
        )
    except ValueError as exc:
        detail = str(exc)
        lower = detail.lower()
        if "pos.manager_discount" in detail or "override required" in lower:
            raise HTTPException(status_code=403, detail=detail) from exc
        if (
            "price_override_reason" in lower
            or "cannot be negative" in lower
            or "inactive" in lower
            or "variant_id" in lower
            or "size/color" in lower
        ):
            raise HTTPException(status_code=400, detail=detail) from exc
        raise HTTPException(status_code=409, detail=detail) from exc

    from app.access.store_scope import assert_store_access
    from app.services.device_service import validate_device_for_sale
    from app.services.sales_policy_service import enforce_sale_pricing
    from app.services.shift_service import attach_open_shift, require_open_shift_if_configured

    store_id = body.store_id or auth.store_id or ""
    assert_store_access(session, auth, store_id or None)
    try:
        enforce_sale_pricing(
            session,
            auth,
            industry_pack=body.industry_pack,
            lines=body.lines,
            store_id=store_id or None,
            header_discount=float(body.discount or 0),
            subtotal=float(body.subtotal or 0),
        )
    except HTTPException:
        raise
    try:
        require_open_shift_if_configured(session, auth, store_id or None)
    except HTTPException:
        from app.services.shift_service import open_shift as do_open_shift
        try:
            do_open_shift(session, auth, store_id=store_id or None, opening_float=0, notes="Auto-opened on checkout")
        except Exception:
            pass
    open_shift = attach_open_shift(session, auth, store_id or None)
    policy = session.exec(
        select(StorePolicy).where(
            StorePolicy.company_id == auth.company_id,
            StorePolicy.store_id == store_id,
            StorePolicy.policy_key == "device_control",
        )
    ).first()
    device_control = policy and str(policy.policy_value).lower() in ("true", "1", "yes")
    validate_device_for_sale(session, auth.company_id, body.device_id, bool(device_control))

    payments = _normalize_payments(body)
    customer_id = body.customer_id
    customer = None
    if customer_id:
        customer = _validate_customer(session, auth.company_id, customer_id)
    tender_label = _validate_payment_total(body, payments, customer_id)
    paid_amount = round(sum(float(p["amount"]) for p in payments), 2)
    due_amount = round(max(0, body.total - paid_amount), 2)
    if due_amount < 1.0:
        due_amount = 0.0
    if due_amount > 0 and customer_id and customer:
        bal = _customer_balance(session, auth.company_id, customer_id)
        if customer.credit_limit is not None and bal.outstanding + due_amount > customer.credit_limit + 0.01:
            raise HTTPException(status_code=400, detail="Customer credit limit exceeded")
    reservation_ids = _reservation_ids_for_sale(body)
    consumed_reservations: set[str] = set()

    invoice_number = _next_invoice_number(session, auth.company_id)
    invoice = SalesInvoice(
        company_id=auth.company_id,
        store_id=body.store_id or auth.store_id or "",
        counter_id=body.counter_id,
        invoice_number=invoice_number,
        client_transaction_id=body.client_transaction_id,
        customer_id=customer_id,
        industry_pack=body.industry_pack,
        status=body.status,
        subtotal=body.subtotal,
        discount=body.discount,
        tax=body.tax,
        total=body.total,
        paid_amount=paid_amount if body.status == "completed" else 0,
        due_amount=due_amount if body.status == "completed" else 0,
        tender=tender_label,
        price_mode=body.price_mode,
        campaign_name=body.campaign_name,
        cashier_id=auth.user_id,
        shift_id=open_shift.id if open_shift else None,
        completed_at=datetime.now(timezone.utc) if body.status == "completed" else None,
        meta_json=json.dumps(body.industry_meta) if body.industry_meta else None,
    )
    session.add(invoice)
    try:
        session.flush()
    except IntegrityError as exc:
        # client_transaction_id still carries a GLOBAL unique index, so a key
        # already used by a different tenant collides here. The per-tenant
        # lookup above means we no longer hand back their invoice; surface a
        # clean 409 rather than letting a raw IntegrityError become a 500.
        # A composite (company_id, client_transaction_id) constraint would
        # remove the collision entirely — that needs a migration.
        session.rollback()
        raise HTTPException(
            status_code=409,
            detail="This transaction reference is already in use. Retry with a new client_transaction_id.",
        ) from exc

    cogs_total = 0.0
    for line in body.lines:
        inv_line = SalesInvoiceLine(
            invoice_id=invoice.id,
            product_id=line.product_id,
            sku=line.sku,
            name=line.name,
            qty=line.qty,
            unit_price=line.unit_price,
            line_total=round(line.unit_price * line.qty, 2),
            meta_json=json.dumps(line.meta),
        )
        session.add(inv_line)
        session.flush()
        save_line_extension(session, auth, body.industry_pack, inv_line.id, invoice.id, line.meta)

        if body.status != "completed" or not line.product_id:
            continue

        meta = line.meta or {}
        line_res_id = line.reservation_id or meta.get("reservation_id")
        stock_handled = False

        if line_res_id and line_res_id in reservation_ids and line_res_id not in consumed_reservations:
            try:
                consume_reservation(
                    session,
                    auth.company_id,
                    str(line_res_id),
                    reference_id=invoice.id,
                    created_by=auth.user_id,
                )
                consumed_reservations.add(str(line_res_id))
                stock_handled = True
            except InsufficientStockError as exc:
                raise HTTPException(status_code=409, detail=str(exc)) from exc

        if not stock_handled:
            try:
                stock_qty = float(line.qty)
                if body.industry_pack in {"hardware", "stationery"}:
                    from app.services.hardware_service import hardware_stock_qty_from_meta

                    stock_qty = hardware_stock_qty_from_meta(meta, float(line.qty))
                skip_stock = body.industry_pack == "building-materials" and (
                    meta.get("fulfillment") == "delivery" or meta.get("building_order_id")
                )
                if skip_stock:
                    continue
                adjust_stock_for_sale(
                    session,
                    auth.company_id,
                    line.product_id,
                    body.store_id or auth.store_id,
                    stock_qty,
                    reference_id=invoice.id,
                    created_by=auth.user_id,
                    variant_id=meta.get("variant_id"),
                    batch_id=meta.get("batch_id") or meta.get("stock_unit_id"),
                    serial_no=meta.get("serial") or meta.get("serial_imei") or meta.get("serial_no"),
                )
            except InsufficientStockError as exc:
                raise HTTPException(status_code=409, detail=str(exc)) from exc

        cost_row = session.exec(
            for_update(
                session,
                select(StockBalance).where(
                    StockBalance.company_id == auth.company_id,
                    StockBalance.product_id == line.product_id,
                    StockBalance.store_id == (body.store_id or auth.store_id),
                ),
            )
        ).first()
        if cost_row and cost_row.unit_cost_avg:
            cogs_total += float(line.qty) * cost_row.unit_cost_avg

    for res_id in reservation_ids - consumed_reservations:
        try:
            consume_reservation(
                session,
                auth.company_id,
                res_id,
                reference_id=invoice.id,
                created_by=auth.user_id,
            )
        except HTTPException:
            pass

    for pay in payments:
        session.add(
            Payment(
                company_id=auth.company_id,
                invoice_id=invoice.id,
                payment_type="sale",
                direction="in",
                store_id=body.store_id or auth.store_id,
                counter_id=body.counter_id,
                cashier_id=auth.user_id,
                method=str(pay["method"]).lower(),
                amount=float(pay["amount"]),
                reference=pay.get("reference"),
                status="completed",
            )
        )

    template = _resolve_receipt_template(session, auth.company_id, body.industry_pack)
    session.add(
        Receipt(
            company_id=auth.company_id,
            invoice_id=invoice.id,
            template_id=template.id if template else None,
            content_json=json.dumps({
                "invoice_number": invoice_number,
                "total": body.total,
                "subtotal": body.subtotal,
                "discount": body.discount,
                "tax": body.tax,
                "industry_pack": body.industry_pack,
                "lines": len(body.lines),
                "payments": payments,
                "template_id": template.id if template else None,
                "brand_name": template.brand_name if template else None,
                "tagline": template.tagline if template else None,
                "address_lines": template.address_lines if template else None,
                "footer_notes": template.footer_notes if template else None,
                "paper_width_mm": template.paper_width_mm if template else 80,
            }),
        )
    )
    session.add(
        SyncLog(
            company_id=auth.company_id,
            client_transaction_id=body.client_transaction_id,
            invoice_id=invoice.id,
            status="synced",
        )
    )
    write_audit(
        session, auth, "sale_complete", "sales_invoice", invoice.id,
        {"total": body.total, "industry_pack": body.industry_pack, "tender": tender_label},
    )
    if body.status == "completed":
        from app.services.integration_service import enqueue_company_event

        enqueue_company_event(
            session,
            auth.company_id,
            "sale.completed",
            {
                "invoice_id": invoice.id,
                "invoice_number": invoice.invoice_number,
                "total": body.total,
                "industry_pack": body.industry_pack,
                "store_id": body.store_id or auth.store_id,
                "tender": tender_label,
                "line_count": len(body.lines),
            },
        )
    if body.status == "completed" and due_amount > 0 and customer_id:
        bal = _customer_balance(session, auth.company_id, customer_id)
        bal.outstanding = round(bal.outstanding + due_amount, 2)
        session.add(bal)

    if body.status == "completed" and body.total > 0:
        from app.services.accounting_service import get_account_by_code, get_linked_account_id, post_journal_entry

        # Derived from total - tax (not subtotal - discount) so it always balances against the
        # payment/AR debit lines (which sum to total) regardless of how a caller composed the bill —
        # e.g. restaurant orders fold a service_charge into total/tax without it appearing in subtotal.
        net_revenue = round(body.total - body.tax, 2)
        # Cap each payment's GL contribution so debit lines never exceed body.total — the
        # payment-total tolerance allows a small cash overpayment (change given), and change
        # isn't revenue-backing cash retained, so it must not appear on the debit side or the
        # entry would fail to balance against credit_lines (which sum to exactly total).
        debit_lines = []
        remaining_total = body.total
        for pay in payments:
            amount = min(float(pay["amount"]), max(0.0, remaining_total))
            remaining_total = round(remaining_total - amount, 2)
            if amount > 0:
                debit_lines.append({"account_id": get_linked_account_id(session, auth.company_id, pay["method"]), "debit": amount})
        if due_amount > 0:
            debit_lines.append({"account_id": get_account_by_code(session, auth.company_id, "1200").id, "debit": due_amount})
        credit_lines = [{"account_id": get_account_by_code(session, auth.company_id, "4100").id, "credit": net_revenue}]
        if body.tax > 0:
            credit_lines.append({"account_id": get_account_by_code(session, auth.company_id, "2200").id, "credit": body.tax})
        post_journal_entry(
            session,
            company_id=auth.company_id,
            created_by=auth.user_id,
            entry_date=datetime.now(timezone.utc),
            source_type="sale",
            source_id=invoice.id,
            lines=debit_lines + credit_lines,
            memo=f"Sale {invoice.invoice_number}",
        )
        if cogs_total > 0:
            cogs_account = get_account_by_code(session, auth.company_id, "5100")
            inventory_account = get_account_by_code(session, auth.company_id, "1300")
            post_journal_entry(
                session,
                company_id=auth.company_id,
                created_by=auth.user_id,
                entry_date=datetime.now(timezone.utc),
                source_type="sale",
                source_id=invoice.id,
                lines=[
                    {"account_id": cogs_account.id, "debit": round(cogs_total, 2), "store_id": body.store_id or auth.store_id},
                    {"account_id": inventory_account.id, "credit": round(cogs_total, 2), "store_id": body.store_id or auth.store_id},
                ],
                memo=f"COGS: {invoice.invoice_number}",
            )

    if body.status == "completed" and customer_id:
        from app.services.customer_service import earn_loyalty_points, redeem_loyalty_points

        redeem_points = body.loyalty_redeem_points or 0
        if redeem_points > 0:
            redeem_loyalty_points(session, auth, body.store_id or auth.store_id, customer_id, redeem_points, invoice.id)
        earn_loyalty_points(session, auth, body.store_id or auth.store_id, customer_id, body.total, invoice.id)

    session.flush()
    return SaleOut(
        id=invoice.id,
        invoice_number=invoice.invoice_number,
        client_transaction_id=invoice.client_transaction_id,
        total=invoice.total,
        status=invoice.status,
        industry_pack=invoice.industry_pack,
        duplicate=False,
    )


def _returned_qty_map(session: Session, invoice_id: str) -> dict[str, float]:
    from app.models.operations import SalesReturn, SalesReturnLine

    return_ids = [
        r.id for r in session.exec(
            select(SalesReturn).where(SalesReturn.invoice_id == invoice_id)
        ).all()
    ]
    if not return_ids:
        return {}
    rows = session.exec(
        select(SalesReturnLine).where(SalesReturnLine.return_id.in_(return_ids))  # type: ignore[attr-defined]
    ).all()
    out: dict[str, float] = {}
    for ln in rows:
        out[ln.invoice_line_id] = out.get(ln.invoice_line_id, 0) + ln.qty
    return out


def _sale_out(session: Session, inv: SalesInvoice) -> dict:
    from app.models.core import Store, UserAccount

    customer = session.get(Customer, inv.customer_id) if inv.customer_id else None
    store = session.get(Store, inv.store_id) if inv.store_id else None
    cashier = session.get(UserAccount, inv.cashier_id) if inv.cashier_id else None
    lines = session.exec(select(SalesInvoiceLine).where(SalesInvoiceLine.invoice_id == inv.id)).all()
    returned = _returned_qty_map(session, inv.id)
    payments = session.exec(select(Payment).where(Payment.invoice_id == inv.id)).all()
    return {
        "id": inv.id,
        "invoice_number": inv.invoice_number,
        "customer_id": inv.customer_id,
        "customer_name": customer.name if customer else None,
        "store_id": inv.store_id,
        "store_name": store.name if store else None,
        "cashier_id": inv.cashier_id,
        "cashier_name": cashier.full_name if cashier and hasattr(cashier, "full_name") else (cashier.email if cashier else None),
        "industry_pack": inv.industry_pack,
        "status": inv.status,
        "subtotal": inv.subtotal,
        "discount": inv.discount,
        "tax": inv.tax,
        "total": inv.total,
        "paid_amount": inv.paid_amount or 0,
        "due_amount": inv.due_amount or 0,
        "tender": inv.tender,
        "completed_at": (inv.completed_at.replace(tzinfo=timezone.utc).isoformat() if inv.completed_at and inv.completed_at.tzinfo is None else inv.completed_at.isoformat()) if inv.completed_at else None,
        "created_at": (inv.created_at.replace(tzinfo=timezone.utc).isoformat() if inv.created_at and inv.created_at.tzinfo is None else inv.created_at.isoformat()) if inv.created_at else None,
        "lines": [
            {
                "id": ln.id,
                "product_id": ln.product_id,
                "sku": ln.sku,
                "name": ln.name,
                "qty": ln.qty,
                "returned_qty": returned.get(ln.id, 0),
                "returnable_qty": max(0, ln.qty - returned.get(ln.id, 0)),
                "unit_price": ln.unit_price,
                "line_total": ln.line_total,
                "meta": json.loads(ln.meta_json or "{}"),
            }
            for ln in lines
        ],
        "payments": [
            {
                "id": p.id,
                "method": p.method,
                "amount": p.amount,
                "payment_type": p.payment_type,
                "direction": p.direction,
            }
            for p in payments
        ],
    }


def _parse_list_date_bound(value: str, *, end_of_day: bool) -> datetime | None:
    raw = value.strip().replace("Z", "+00:00")
    try:
        if len(raw) == 10 and raw[4] == "-" and raw[7] == "-":
            day = datetime.fromisoformat(raw)
            if day.tzinfo is None:
                day = day.replace(tzinfo=timezone.utc)
            if end_of_day:
                return day.replace(hour=23, minute=59, second=59, microsecond=999999)
            return day.replace(hour=0, minute=0, second=0, microsecond=0)
        parsed = datetime.fromisoformat(raw)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed
    except ValueError:
        return None


def list_sales(
    session: Session,
    company_id: str,
    *,
    status: str | None = None,
    customer_id: str | None = None,
    store_id: str | None = None,
    cashier_id: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    industry_pack: str | None = None,
    limit: int = 100,
) -> list[dict]:
    stmt = select(SalesInvoice).where(SalesInvoice.company_id == company_id)
    if status:
        stmt = stmt.where(SalesInvoice.status == status)
    if customer_id:
        stmt = stmt.where(SalesInvoice.customer_id == customer_id)
    if store_id:
        stmt = stmt.where(SalesInvoice.store_id == store_id)
    if cashier_id:
        stmt = stmt.where(SalesInvoice.cashier_id == cashier_id)
    if industry_pack:
        stmt = stmt.where(SalesInvoice.industry_pack == industry_pack)
    if from_date:
        start = _parse_list_date_bound(from_date, end_of_day=False)
        if start is not None:
            stmt = stmt.where(SalesInvoice.created_at >= start)
    if to_date:
        end = _parse_list_date_bound(to_date, end_of_day=True)
        if end is not None:
            stmt = stmt.where(SalesInvoice.created_at <= end)
    rows = session.exec(stmt.order_by(SalesInvoice.created_at.desc())).all()  # type: ignore
    return [_sale_out(session, inv) for inv in rows[:limit]]


def get_sale(session: Session, company_id: str, invoice_id: str) -> dict:
    inv = session.get(SalesInvoice, invoice_id)
    if not inv or inv.company_id != company_id:
        raise HTTPException(status_code=404, detail="Sale not found")
    return _sale_out(session, inv)


def list_held_sales(session: Session, company_id: str, store_id: str | None = None) -> list[dict]:
    stmt = select(SalesInvoice).where(
        SalesInvoice.company_id == company_id,
        SalesInvoice.status == "held",
    )
    if store_id:
        stmt = stmt.where(SalesInvoice.store_id == store_id)
    rows = session.exec(stmt.order_by(SalesInvoice.created_at.desc())).all()  # type: ignore
    return [_sale_out(session, inv) for inv in rows]


def cancel_held_sale(session: Session, auth: AuthContext, invoice_id: str) -> dict:
    inv = session.get(SalesInvoice, invoice_id)
    if not inv or inv.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Sale not found")
    if inv.status != "held":
        raise HTTPException(status_code=409, detail="Only held sales can be cancelled")
    inv.status = "cancelled"
    session.add(inv)
    write_audit(session, auth, "held_sale_cancel", "sales_invoice", inv.id)
    session.flush()
    return {"id": inv.id, "status": inv.status}


def complete_held_sale(session: Session, auth: AuthContext, invoice_id: str, body: dict) -> dict:
    inv = session.get(SalesInvoice, invoice_id)
    if not inv or inv.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Sale not found")
    if inv.status != "held":
        raise HTTPException(status_code=409, detail="Sale is not held")
    payments = body.get("payments") or [{"method": body.get("tender", "cash"), "amount": inv.total}]
    paid = round(sum(float(p["amount"]) for p in payments), 2)
    if paid > inv.total + 0.02:
        raise HTTPException(status_code=400, detail="Payment exceeds sale total")
    due = round(max(0, inv.total - paid), 2)
    if due > 0 and not inv.customer_id:
        raise HTTPException(status_code=400, detail="Customer required for due sale")
    if due > 0 and inv.customer_id:
        customer = _validate_customer(session, auth.company_id, inv.customer_id)
        bal = _customer_balance(session, auth.company_id, inv.customer_id)
        if customer.credit_limit is not None and bal.outstanding + due > customer.credit_limit + 0.01:
            raise HTTPException(status_code=400, detail="Customer credit limit exceeded")

    lines = session.exec(select(SalesInvoiceLine).where(SalesInvoiceLine.invoice_id == inv.id)).all()
    for line in lines:
        if not line.product_id:
            continue
        meta = json.loads(line.meta_json or "{}")
        if inv.industry_pack == "building-materials" and (
            meta.get("fulfillment") == "delivery" or meta.get("building_order_id")
        ):
            continue
        stock_qty = float(line.qty)
        if inv.industry_pack in {"hardware", "stationery"}:
            from app.services.hardware_service import hardware_stock_qty_from_meta

            stock_qty = hardware_stock_qty_from_meta(meta, float(line.qty))
        adjust_stock_for_sale(
            session,
            auth.company_id,
            line.product_id,
            inv.store_id,
            stock_qty,
            reference_id=inv.id,
            created_by=auth.user_id,
            variant_id=meta.get("variant_id"),
            batch_id=meta.get("batch_id") or meta.get("stock_unit_id"),
            serial_no=meta.get("serial") or meta.get("serial_imei") or meta.get("serial_no"),
        )
    for pay in payments:
        session.add(
            Payment(
                company_id=auth.company_id,
                invoice_id=inv.id,
                customer_id=inv.customer_id,
                payment_type="sale",
                direction="in",
                store_id=inv.store_id,
                cashier_id=auth.user_id,
                method=str(pay["method"]).lower(),
                amount=float(pay["amount"]),
                reference=pay.get("reference"),
                status="completed",
            )
        )
    inv.status = "completed"
    inv.paid_amount = paid
    inv.due_amount = due
    inv.completed_at = datetime.now(timezone.utc)
    session.add(inv)
    if due > 0 and inv.customer_id:
        bal = _customer_balance(session, auth.company_id, inv.customer_id)
        bal.outstanding = round(bal.outstanding + due, 2)
        session.add(bal)
    write_audit(session, auth, "held_sale_complete", "sales_invoice", inv.id, {"total": inv.total})
    session.flush()
    return _sale_out(session, inv)


def get_sync_status(session: Session, company_id: str, client_transaction_id: str) -> dict:
    log = session.exec(
        select(SyncLog).where(
            SyncLog.company_id == company_id,
            SyncLog.client_transaction_id == client_transaction_id,
        )
    ).first()
    if not log:
        return {"client_transaction_id": client_transaction_id, "status": "not_found"}
    invoice = session.get(SalesInvoice, log.invoice_id) if log.invoice_id else None
    # Never dereference an invoice belonging to another tenant. Rows written
    # before the idempotency lookup was company-scoped can still point across
    # tenants, and this endpoint would happily return their invoice number.
    if invoice is not None and invoice.company_id != company_id:
        return {"client_transaction_id": client_transaction_id, "status": "not_found"}
    return {
        "client_transaction_id": client_transaction_id,
        "status": log.status,
        "invoice_id": log.invoice_id,
        "invoice_number": invoice.invoice_number if invoice else None,
        "detail": json.loads(log.detail_json) if log.detail_json else None,
    }
