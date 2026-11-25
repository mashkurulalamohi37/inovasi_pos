"""Cashier shift / drawer session — open, close, variance."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlmodel import Session, select

from app.dependencies import AuthContext, write_audit
from app.models.core import UserAccount
from app.models.sales import CashierShift, Payment, SalesInvoice
from app.services.sales_policy_service import get_sales_policies


def _shift_out(row: CashierShift) -> dict:
    return {
        "id": row.id,
        "company_id": row.company_id,
        "store_id": row.store_id,
        "counter_id": row.counter_id,
        "cashier_id": row.cashier_id,
        "status": row.status,
        "opened_at": row.opened_at.isoformat() if row.opened_at else None,
        "opening_float": row.opening_float,
        "closed_at": row.closed_at.isoformat() if row.closed_at else None,
        "closing_counted": row.closing_counted,
        "expected_cash": row.expected_cash,
        "variance": row.variance,
        "notes": row.notes,
        "closed_by": row.closed_by,
    }


def get_open_shift(
    session: Session,
    company_id: str,
    cashier_id: str,
    store_id: str | None = None,
) -> CashierShift | None:
    stmt = select(CashierShift).where(
        CashierShift.company_id == company_id,
        CashierShift.cashier_id == cashier_id,
        CashierShift.status == "open",
    )
    if store_id:
        stmt = stmt.where(CashierShift.store_id == store_id)
    return session.exec(stmt.order_by(CashierShift.opened_at.desc())).first()  # type: ignore


def attach_open_shift(session: Session, auth: AuthContext, store_id: str | None) -> CashierShift | None:
    """Return current open shift for cashier (no create)."""
    if not auth.user_id:
        return None
    return get_open_shift(session, auth.company_id, auth.user_id, store_id)


def require_open_shift_if_configured(session: Session, auth: AuthContext, store_id: str | None) -> None:
    policies = get_sales_policies(session, auth.company_id, store_id)
    if not policies.get("require_open_shift"):
        return
    shift = attach_open_shift(session, auth, store_id)
    if not shift:
        raise HTTPException(status_code=409, detail="Open cashier shift required before sale")


def open_shift(
    session: Session,
    auth: AuthContext,
    *,
    store_id: str | None = None,
    counter_id: str | None = None,
    opening_float: float = 0,
    notes: str | None = None,
) -> dict:
    sid = store_id or auth.store_id
    if not sid:
        raise HTTPException(status_code=400, detail="store_id required to open shift")
    if opening_float < 0:
        raise HTTPException(status_code=400, detail="opening_float cannot be negative")
    existing = get_open_shift(session, auth.company_id, auth.user_id, sid)
    if existing:
        raise HTTPException(status_code=409, detail="Cashier already has an open shift at this store")
    row = CashierShift(
        company_id=auth.company_id,
        store_id=sid,
        counter_id=counter_id,
        cashier_id=auth.user_id,
        status="open",
        opened_at=datetime.now(timezone.utc),
        opening_float=float(opening_float),
        notes=notes,
    )
    session.add(row)
    session.flush()
    write_audit(
        session,
        auth,
        "pos.shift_open",
        "cashier_shift",
        row.id,
        {"store_id": sid, "opening_float": opening_float},
    )
    return _shift_out(row)


def _expected_cash(session: Session, shift: CashierShift) -> float:
    """Opening float + cash tender payments during the shift window."""
    payments = session.exec(
        select(Payment).where(
            Payment.company_id == shift.company_id,
            Payment.cashier_id == shift.cashier_id,
            Payment.store_id == shift.store_id,
            Payment.direction == "in",
            Payment.method == "cash",
            Payment.status == "completed",
        )
    ).all()
    cash_in = 0.0
    opened = shift.opened_at
    if opened and opened.tzinfo is None:
        opened = opened.replace(tzinfo=timezone.utc)
    for pay in payments:
        created = pay.created_at
        if created and created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if opened and created and created < opened:
            continue
        # Also attribute via invoice.shift_id when present
        if pay.invoice_id:
            inv = session.get(SalesInvoice, pay.invoice_id)
            if inv and inv.shift_id and inv.shift_id != shift.id:
                continue
            if inv and inv.shift_id == shift.id:
                cash_in += float(pay.amount or 0)
                continue
            if inv and not inv.shift_id and opened and created and created >= opened:
                cash_in += float(pay.amount or 0)
                continue
        elif opened and created and created >= opened:
            cash_in += float(pay.amount or 0)
    return round(float(shift.opening_float or 0) + cash_in, 2)


def close_shift(
    session: Session,
    auth: AuthContext,
    shift_id: str,
    *,
    closing_counted: float,
    notes: str | None = None,
) -> dict:
    row = session.get(CashierShift, shift_id)
    if not row or row.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Shift not found")
    if row.status != "open":
        raise HTTPException(status_code=409, detail="Shift is already closed")
    if row.cashier_id != auth.user_id and "pos.shift_close" not in auth.permissions:
        raise HTTPException(status_code=403, detail="Cannot close another cashier's shift")
    if closing_counted < 0:
        raise HTTPException(status_code=400, detail="closing_counted cannot be negative")
    expected = _expected_cash(session, row)
    variance = round(float(closing_counted) - expected, 2)
    row.status = "closed"
    row.closed_at = datetime.now(timezone.utc)
    row.closing_counted = float(closing_counted)
    row.expected_cash = expected
    row.variance = variance
    row.closed_by = auth.user_id
    if notes:
        row.notes = notes
    session.add(row)
    write_audit(
        session,
        auth,
        "pos.shift_close",
        "cashier_shift",
        row.id,
        {"expected_cash": expected, "closing_counted": closing_counted, "variance": variance},
    )
    session.flush()
    return _shift_out(row)


def current_shift(session: Session, auth: AuthContext, store_id: str | None = None) -> dict | None:
    """The cashier's own view of their currently open shift. Deliberately does
    NOT include a running expected-cash figure — a "blind close" control: the
    cashier counts and submits their drawer before the system's expected total
    is ever revealed to them, so entering a number that conveniently matches
    what they saw can't hide a shortage. See close_shift (reveals variance only
    after the count is committed) and list_shifts (managers can see the running
    total for oversight, gated the same way as the rest of that function)."""
    row = get_open_shift(session, auth.company_id, auth.user_id, store_id or auth.store_id)
    if not row:
        return None
    return _shift_out(row)


def list_shifts(
    session: Session,
    auth: AuthContext,
    *,
    store_id: str | None = None,
    status: str | None = None,
    limit: int = 50,
) -> list[dict]:
    stmt = select(CashierShift).where(CashierShift.company_id == auth.company_id)
    if store_id:
        stmt = stmt.where(CashierShift.store_id == store_id)
    if status:
        stmt = stmt.where(CashierShift.status == status)
    # Cashiers see own; managers with view see store
    is_restricted_to_own = "pos.shift_view" not in auth.permissions or (
        "pos.manager_discount" not in auth.permissions and auth.role_code == "Cashier"
    )
    if is_restricted_to_own:
        stmt = stmt.where(CashierShift.cashier_id == auth.user_id)
    rows = session.exec(stmt.order_by(CashierShift.opened_at.desc()).limit(limit)).all()  # type: ignore
    out = [_shift_out(r) for r in rows]
    if not is_restricted_to_own:
        # Manager oversight view: running expected cash + cashier name are fine
        # to show here — "blind close" only withholds this from the cashier's
        # own current_shift self-view, not from a manager watching the floor.
        users = {u.id: u for u in session.exec(select(UserAccount).where(UserAccount.company_id == auth.company_id))}
        for row_dict, row in zip(out, rows):
            usr = users.get(row.cashier_id)
            row_dict["cashier_name"] = (usr.full_name or usr.username) if usr else row.cashier_id
            if row.status == "open":
                row_dict["expected_cash_so_far"] = _expected_cash(session, row)
    return out
