from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlmodel import Session

from app.config import settings
from app.database import get_session
from app.dependencies import AuthContext, get_current_user, require_platform_admin, write_audit
from app.services.onboarding_service import list_tenants, onboard_tenant, suspend_tenant
from app.services.subscription_service import assign_plan, get_current_subscription, refresh_usage

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


class OnboardRequest(BaseModel):
    company_code: str
    company_name: str
    legal_name: str | None = None
    tax_id: str | None = None
    brand_name: str | None = None
    store_code: str | None = None
    store_name: str | None = None
    store_address: str | None = None
    warehouse_code: str | None = None
    warehouse_name: str | None = None
    counter_code: str | None = None
    counter_name: str | None = None
    admin_email: EmailStr
    admin_username: str | None = None
    admin_name: str | None = None
    admin_password: str = Field(min_length=8)

    industry_packs: list[str] = ["grocery"]
    plan_code: str = "starter"

    referral_code: str | None = None
    attribution_token: str | None = None


@router.post("/tenant")
def create_tenant(
    body: OnboardRequest,
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
    request: Request = None,
):
    payload = body.model_dump()
    if request and request.client:
        payload["client_ip"] = request.client.host
    result = onboard_tenant(session, auth, payload)
    session.commit()
    return result


@router.post("/tenant/public")
def create_tenant_public(
    body: OnboardRequest,
    session: Annotated[Session, Depends(get_session)],
    request: Request = None,
):
    """Self-service onboarding when no super admin session (pilot signup)."""
    if not settings.allow_public_onboarding:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Public onboarding is disabled. Contact your platform administrator.",
        )
    payload = body.model_dump()
    if request and request.client:
        payload["client_ip"] = request.client.host
    result = onboard_tenant(session, None, payload)
    session.commit()
    return result

