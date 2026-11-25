from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
from app.dependencies import AuthContext, get_current_user, require_permission, write_audit
from app.models.operations import PromoCode
from app.schemas.operations import PromoCodeIn, PromoCodeValidateIn

router = APIRouter(prefix="/promo-codes", tags=["promo-codes"])


def _out(p: PromoCode) -> dict:
    return {
        "id": p.id,
        "code": p.code,
        "discount_type": p.discount_type,
        "value": p.value,
        "is_active": p.is_active,
        "min_subtotal": p.min_subtotal,
        "expires_at": p.expires_at.isoformat() if p.expires_at else None,
    }


@router.get("")
def list_promo_codes(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    rows = session.exec(
        select(PromoCode).where(PromoCode.company_id == auth.company_id).order_by(PromoCode.created_at.desc())  # type: ignore
    ).all()
    return [_out(p) for p in rows]


@router.post("")
def create_promo_code(
    body: PromoCodeIn,
    auth: Annotated[AuthContext, Depends(require_permission("config.flags"))],
    session: Annotated[Session, Depends(get_session)],
):
    code = body.code.strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Code is required")
    existing = session.exec(
        select(PromoCode).where(PromoCode.company_id == auth.company_id, PromoCode.code == code)
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="A promo code with this code already exists")
    promo = PromoCode(
        company_id=auth.company_id,
        code=code,
        discount_type=body.discount_type,
        value=body.value,
        is_active=body.is_active,
        min_subtotal=body.min_subtotal,
        expires_at=datetime.fromisoformat(body.expires_at) if body.expires_at else None,
    )
    session.add(promo)
    write_audit(session, auth, "promo_code_create", "promo_code", promo.id)
    session.commit()
    session.refresh(promo)
    return _out(promo)


@router.put("/{promo_id}")
def update_promo_code(
    promo_id: str,
    body: PromoCodeIn,
    auth: Annotated[AuthContext, Depends(require_permission("config.flags"))],
    session: Annotated[Session, Depends(get_session)],
):
    promo = session.get(PromoCode, promo_id)
    if not promo or promo.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Promo code not found")
    promo.code = body.code.strip().upper() or promo.code
    promo.discount_type = body.discount_type
    promo.value = body.value
    promo.is_active = body.is_active
    promo.min_subtotal = body.min_subtotal
    promo.expires_at = datetime.fromisoformat(body.expires_at) if body.expires_at else None
    session.add(promo)
    write_audit(session, auth, "promo_code_update", "promo_code", promo.id)
    session.commit()
    session.refresh(promo)
    return _out(promo)


@router.delete("/{promo_id}")
def delete_promo_code(
    promo_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("config.flags"))],
    session: Annotated[Session, Depends(get_session)],
):
    promo = session.get(PromoCode, promo_id)
    if not promo or promo.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Promo code not found")
    session.delete(promo)
    write_audit(session, auth, "promo_code_delete", "promo_code", promo_id)
    session.commit()
    return {"id": promo_id, "deleted": True}


@router.post("/validate")
def validate_promo_code(
    body: PromoCodeValidateIn,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    code = body.code.strip().upper()
    promo = session.exec(
        select(PromoCode).where(PromoCode.company_id == auth.company_id, PromoCode.code == code)
    ).first()
    if not promo or not promo.is_active:
        raise HTTPException(status_code=404, detail="Invalid promo code")
    if promo.expires_at:
        expires = promo.expires_at if promo.expires_at.tzinfo else promo.expires_at.replace(tzinfo=timezone.utc)
        if expires <= datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="This promo code has expired")
    if promo.min_subtotal and body.subtotal < promo.min_subtotal:
        raise HTTPException(status_code=400, detail=f"Minimum order of {promo.min_subtotal:.0f} required for this code")
    return _out(promo)
