from datetime import datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends
from sqlmodel import Session, select, func

from app.database import get_session
from app.dependencies import AuthContext, get_current_user, require_permission, write_audit
from app.models.operations import PaymentMethod, SupplierPayment
from app.models.sales import Payment
from app.schemas.operations import PaymentMethodIn

router = APIRouter(prefix="/payments", tags=["payments"])


def _apply_payment_filters(
    stmt,
    payment_type: Optional[str],
    method: Optional[str],
    from_date: Optional[datetime],
    to_date: Optional[datetime],
):
    """Shared by the transaction list and the summary so both can describe the
    same set. All filters are optional; omitting them keeps the previous
    company-wide behaviour, which is what the Payments KPI cards still request."""
    if payment_type:
        stmt = stmt.where(Payment.payment_type == payment_type)
    if method:
        stmt = stmt.where(func.lower(Payment.method) == method.lower())
    if from_date:
        stmt = stmt.where(Payment.created_at >= from_date)
    if to_date:
        stmt = stmt.where(Payment.created_at <= to_date)
    return stmt


@router.get("")
def list_payments(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    payment_type: Optional[str] = None,
    method: Optional[str] = None,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    limit: int = 100,
):
    stmt = select(Payment).where(Payment.company_id == auth.company_id).order_by(Payment.created_at.desc())  # type: ignore
    stmt = _apply_payment_filters(stmt, payment_type, method, from_date, to_date)
    rows = session.exec(stmt.limit(limit)).all()
    return [
        {
            "id": p.id,
            "payment_type": p.payment_type,
            "direction": p.direction,
            "invoice_id": p.invoice_id,
            "supplier_id": p.supplier_id,
            "return_id": p.return_id,
            "store_id": p.store_id,
            "counter_id": p.counter_id,
            "cashier_id": p.cashier_id,
            "method": p.method,
            "amount": p.amount,
            "reference": p.reference,
            "status": p.status,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in rows
    ]


@router.get("/summary")
def payments_summary(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    payment_type: Optional[str] = None,
    method: Optional[str] = None,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
):
    stmt = select(Payment).where(Payment.company_id == auth.company_id, Payment.status == "completed")
    stmt = _apply_payment_filters(stmt, payment_type, method, from_date, to_date)
    rows = session.exec(stmt).all()
    cash = sum(p.amount for p in rows if p.direction == "in" and p.method.lower() == "cash")
    card = sum(p.amount for p in rows if p.direction == "in" and p.method.lower() == "card")
    mobile = sum(p.amount for p in rows if p.direction == "in" and p.method.lower() in ("mobile", "mfs"))
    refunds = sum(p.amount for p in rows if p.payment_type == "refund" or p.direction == "out")
    supplier = session.exec(select(SupplierPayment).where(SupplierPayment.company_id == auth.company_id)).all()
    supplier_total = sum(s.amount for s in supplier)
    gross = sum(p.amount for p in rows if p.direction == "in")
    return {
        "cash_collected": cash,
        "card_collected": card,
        "mobile_collected": mobile,
        "refund_amount": refunds,
        "net_collection": gross - refunds,
        "supplier_payments": supplier_total,
        "transaction_count": len(rows),
    }


@router.post("/refund")
def create_refund_payment(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("pos.return"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.sales_return_service import create_refund
    result = create_refund(session, auth, body["invoice_id"], body)
    session.commit()
    return result


@router.get("/payment-methods")
def list_payment_methods(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    rows = session.exec(select(PaymentMethod).where(PaymentMethod.company_id == auth.company_id)).all()
    if not rows:
        return [
            {"id": "cash", "code": "cash", "name": "Cash", "is_active": True, "linked_account_id": None},
            {"id": "card", "code": "card", "name": "Card", "is_active": True, "linked_account_id": None},
            {"id": "mobile", "code": "mobile", "name": "Mobile Banking", "is_active": True, "linked_account_id": None},
        ]
    return [
        {"id": r.id, "code": r.code, "name": r.name, "is_active": r.is_active, "linked_account_id": r.linked_account_id}
        for r in rows
    ]


@router.post("/payment-methods")
def create_payment_method(
    body: PaymentMethodIn,
    auth: Annotated[AuthContext, Depends(require_permission("config.flags"))],
    session: Annotated[Session, Depends(get_session)],
):
    pm = PaymentMethod(
        company_id=auth.company_id, code=body.code, name=body.name, is_active=body.is_active,
        linked_account_id=body.linked_account_id,
    )
    session.add(pm)
    write_audit(session, auth, "payment_method_create", "payment_method", pm.id)
    session.commit()
    session.refresh(pm)
    return {"id": pm.id, "code": pm.code, "name": pm.name, "is_active": pm.is_active, "linked_account_id": pm.linked_account_id}


@router.put("/payment-methods/{method_id}")
def update_payment_method(
    method_id: str,
    body: PaymentMethodIn,
    auth: Annotated[AuthContext, Depends(require_permission("config.flags"))],
    session: Annotated[Session, Depends(get_session)],
):
    pm = session.get(PaymentMethod, method_id)
    if not pm or pm.company_id != auth.company_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Payment method not found")
    pm.name = body.name
    pm.is_active = body.is_active
    pm.linked_account_id = body.linked_account_id
    session.add(pm)
    write_audit(session, auth, "payment_method_update", "payment_method", pm.id)
    session.commit()
    return {"id": pm.id, "code": pm.code, "name": pm.name, "is_active": pm.is_active, "linked_account_id": pm.linked_account_id}
