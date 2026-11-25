"""Public (unauthenticated) SaaS endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.cache import cache_get_or_set, cache_key
from app.database import get_session
from app.models.core import Company

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/tenant/{company_code}")
def resolve_tenant_branding(
    company_code: str,
    session: Annotated[Session, Depends(get_session)],
):
    code = company_code.strip().upper().replace(" ", "-")

    def _load():
        company = session.exec(select(Company).where(Company.code == code)).first()
        if not company:
            return None
        approval = getattr(company, "approval_status", None) or "approved"
        # Rejected / hard-deleted workspaces stay hidden; pending can resolve for messaging
        if not company.is_active and approval not in {"pending", "approved"}:
            return None
        if company.is_suspended and approval == "rejected":
            return None
        return {
            "tenant_id": company.id,
            "name": company.name,
            "company_code": company.code,
            "logo_url": None,
            "is_suspended": company.is_suspended,
            "approval_status": approval,
            "is_active": company.is_active,
        }

    data = cache_get_or_set(cache_key("public", "tenant", code), _load, ttl_seconds=120)
    if not data:
        raise HTTPException(status_code=404, detail="Company workspace not found")
    return data
