from typing import Annotated, Optional

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlmodel import Session

from app.database import get_session
from app.dependencies import AuthContext, get_current_user, require_permission
from app.schemas.operations import ExchangeIn, RefundIn, SalesReturnIn, VoidIn
from app.services.sales_return_service import (
    create_exchange,
    create_refund,
    create_sales_return,
    create_void,
    get_receipt,
    list_exchanges,
    list_returns,
    reprint_receipt,
)

router = APIRouter(tags=["sales-returns"])


@router.get("/sales/returns")
def returns_list(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    limit: int = 50,
):
    return list_returns(session, auth.company_id, limit)


@router.get("/sales/exchanges")
def exchanges_list(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    limit: int = 50,
    industry_pack: Optional[str] = None,
):
    return list_exchanges(session, auth.company_id, limit=limit, industry_pack=industry_pack)


@router.get("/sales/returns/{return_id}")
def return_detail(
    return_id: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    from app.models.operations import SalesReturn
    from app.services.sales_return_service import _return_out
    r = session.get(SalesReturn, return_id)
    if not r or r.company_id != auth.company_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Return not found")
    return _return_out(r)


@router.post("/sales/{invoice_id}/return")
def sales_return(
    invoice_id: str,
    body: SalesReturnIn,
    auth: Annotated[AuthContext, Depends(require_permission("pos.return"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = create_sales_return(session, auth, invoice_id, body.model_dump())
    session.commit()
    return result


@router.post("/sales/{invoice_id}/refund")
def sales_refund(
    invoice_id: str,
    body: RefundIn,
    auth: Annotated[AuthContext, Depends(require_permission("pos.return"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = create_refund(session, auth, invoice_id, body.model_dump())
    session.commit()
    if result.get("status") == "pending_approval":
        return JSONResponse(status_code=202, content=result)
    return result


@router.post("/sales/{invoice_id}/void")
def sales_void(
    invoice_id: str,
    body: VoidIn,
    auth: Annotated[AuthContext, Depends(require_permission("pos.return"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = create_void(session, auth, invoice_id, body.model_dump())
    session.commit()
    if result.get("status") == "pending_approval":
        return JSONResponse(status_code=202, content=result)
    return result


@router.post("/sales/{invoice_id}/exchange")
def sales_exchange(
    invoice_id: str,
    body: ExchangeIn,
    auth: Annotated[AuthContext, Depends(require_permission("pos.return"))],
    session: Annotated[Session, Depends(get_session)],
):
    payload = body.model_dump()
    if not payload.get("return_lines") and payload.get("lines"):
        payload["return_lines"] = payload["lines"]
    result = create_exchange(session, auth, invoice_id, payload)
    session.commit()
    return result


@router.get("/sales/{invoice_id}/receipt")
def sales_receipt(
    invoice_id: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    return get_receipt(session, auth.company_id, invoice_id)


@router.post("/sales/{invoice_id}/receipt/reprint")
def sales_receipt_reprint(
    invoice_id: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    result = reprint_receipt(session, auth, invoice_id)
    session.commit()
    return result
