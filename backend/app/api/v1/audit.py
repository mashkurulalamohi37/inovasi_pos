import json
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select, func

from app.database import get_session
from app.dependencies import AuthContext, get_current_user, require_permission
from app.models.audit import AuditLog
from app.schemas.common import PaginatedResponse

router = APIRouter(prefix="/audit-logs", tags=["audit"])


@router.get("")
def list_audit_logs(
    auth: Annotated[AuthContext, Depends(require_permission("reports.export"))],
    session: Annotated[Session, Depends(get_session)],
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    user_id: Optional[str] = None,
    store_id: Optional[str] = None,
):
    stmt = select(AuditLog).where(AuditLog.company_id == auth.company_id)
    count_stmt = select(func.count(AuditLog.id)).where(AuditLog.company_id == auth.company_id)
    if action:
        stmt = stmt.where(AuditLog.action == action)
        count_stmt = count_stmt.where(AuditLog.action == action)
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
        count_stmt = count_stmt.where(AuditLog.entity_type == entity_type)
    if user_id:
        stmt = stmt.where(AuditLog.user_id == user_id)
        count_stmt = count_stmt.where(AuditLog.user_id == user_id)
    if store_id:
        stmt = stmt.where(AuditLog.store_id == store_id)
        count_stmt = count_stmt.where(AuditLog.store_id == store_id)

    total = session.exec(count_stmt).one()
    rows = session.exec(
        stmt.order_by(AuditLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size)  # type: ignore
    ).all()

    items = [
        {
            "id": r.id,
            "user_id": r.user_id,
            "store_id": r.store_id,
            "action": r.action,
            "entity_type": r.entity_type,
            "entity_id": r.entity_id,
            "detail": json.loads(r.detail_json) if r.detail_json else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
    pages = max(1, (total + page_size - 1) // page_size)
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size, pages=pages)
