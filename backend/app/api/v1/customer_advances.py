from datetime import datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
from app.dependencies import AuthContext, get_current_user, require_permission, write_audit
from app.models.operations import CustomerAdvance
from app.schemas.operations import CustomerAdvanceApplyIn, CustomerAdvanceIn

router = APIRouter(prefix="/customer-advances", tags=["customer-advances"])


def _out(a: CustomerAdvance) -> dict:
    return {
        "id": a.id,
        "customer_id": a.customer_id,
        "amount": a.amount,
        "applied_amount": a.applied_amount,
        "balance": a.amount - a.applied_amount,
        "advance_date": a.advance_date.isoformat() if a.advance_date else None,
        "note": a.note,
    }


@router.get("")
def list_customer_advances(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    customer_id: Optional[str] = None,
):
    stmt = select(CustomerAdvance).where(CustomerAdvance.company_id == auth.company_id)
    if customer_id:
        stmt = stmt.where(CustomerAdvance.customer_id == customer_id)
    rows = session.exec(stmt.order_by(CustomerAdvance.advance_date.desc())).all()  # type: ignore
    return [_out(a) for a in rows]


@router.post("")
def create_customer_advance(
    body: CustomerAdvanceIn,
    auth: Annotated[AuthContext, Depends(require_permission("sales.create"))],
    session: Annotated[Session, Depends(get_session)],
):
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")
    advance = CustomerAdvance(
        company_id=auth.company_id,
        customer_id=body.customer_id,
        amount=body.amount,
        advance_date=datetime.fromisoformat(body.advance_date) if body.advance_date else datetime.utcnow(),
        note=body.note,
        created_by=auth.user_id,
    )
    session.add(advance)
    write_audit(session, auth, "customer_advance_create", "customer_advance", advance.id, {"amount": body.amount})
    session.commit()
    session.refresh(advance)
    return _out(advance)


@router.post("/{advance_id}/apply")
def apply_customer_advance(
    advance_id: str,
    body: CustomerAdvanceApplyIn,
    auth: Annotated[AuthContext, Depends(require_permission("sales.create"))],
    session: Annotated[Session, Depends(get_session)],
):
    advance = session.get(CustomerAdvance, advance_id)
    if not advance or advance.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Advance not found")
    remaining = advance.amount - advance.applied_amount
    if body.amount <= 0 or body.amount > remaining:
        raise HTTPException(status_code=400, detail=f"Amount must be between 0 and the remaining balance ({remaining:.2f})")
    advance.applied_amount += body.amount
    session.add(advance)
    write_audit(session, auth, "customer_advance_apply", "customer_advance", advance.id, {"amount": body.amount})
    session.commit()
    session.refresh(advance)
    return _out(advance)
