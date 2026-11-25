"""Cashier shift / drawer session API."""

from typing import Annotated, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session

from app.database import get_session
from app.dependencies import AuthContext, get_current_user, require_permission
from app.services import shift_service

router = APIRouter(prefix="/pos/shifts", tags=["pos-shifts"])


class ShiftOpenIn(BaseModel):
    store_id: Optional[str] = None
    counter_id: Optional[str] = None
    opening_float: float = 0
    notes: Optional[str] = None


class ShiftCloseIn(BaseModel):
    closing_counted: float
    notes: Optional[str] = None


@router.get("/current")
def shift_current(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    store_id: Optional[str] = None,
):
    return shift_service.current_shift(session, auth, store_id=store_id)


@router.get("")
def shift_list(
    auth: Annotated[AuthContext, Depends(require_permission("pos.shift_view"))],
    session: Annotated[Session, Depends(get_session)],
    store_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
):
    return shift_service.list_shifts(session, auth, store_id=store_id, status=status, limit=min(limit, 200))


@router.post("/open")
def shift_open(
    body: ShiftOpenIn,
    auth: Annotated[AuthContext, Depends(require_permission("pos.shift_open"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = shift_service.open_shift(
        session,
        auth,
        store_id=body.store_id,
        counter_id=body.counter_id,
        opening_float=body.opening_float,
        notes=body.notes,
    )
    session.commit()
    return result


@router.post("/{shift_id}/close")
def shift_close(
    shift_id: str,
    body: ShiftCloseIn,
    auth: Annotated[AuthContext, Depends(require_permission("pos.shift_close"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = shift_service.close_shift(
        session,
        auth,
        shift_id,
        closing_counted=body.closing_counted,
        notes=body.notes,
    )
    session.commit()
    return result
