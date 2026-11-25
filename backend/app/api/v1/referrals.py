"""Referral & Support SSO handoff and integration endpoints for Pulse POS."""

from __future__ import annotations

import logging
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session

from app.database import get_session
from app.dependencies import AuthContext, bearer, get_current_user
from app.integrations.referral import referral_service
from app.models.core import Company, UserAccount

logger = logging.getLogger("referrals_api")

router = APIRouter(tags=["referrals"])


async def get_optional_auth_context(
    creds: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer)],
    session: Annotated[Session, Depends(get_session)],
) -> Optional[AuthContext]:
    """Retrieves authenticated user context if credentials provided; otherwise None."""
    if not creds or not creds.credentials:
        return None
    try:
        return get_current_user(creds, session)
    except Exception:
        return None


@router.get("/sso-url", summary="Get SSO handoff URL for central Referral & Support platform")
async def get_sso_url_endpoint(
    session: Annotated[Session, Depends(get_session)],
    auth: Annotated[Optional[AuthContext], Depends(get_optional_auth_context)],
):
    """Requests a short-lived single-use handoff token from the central Referral & Support platform.

    Returns the SSO redirect URL: http://118.179.223.42:8085/auth/callback?token=<handoff_token>
    which automatically provisions the merchant partner account, signs them in, and navigates
    them directly to their Partner Dashboard.
    """
    if auth:
        company = session.get(Company, auth.company_id)
        user = session.get(UserAccount, auth.user_id)
        external_user_id = auth.company_id
        display_name = (company.name if company else None) or (user.full_name if user else "PulsePOS Merchant")
        email = auth.email or (company.email if company else None) or (user.email if user else None)
        phone = (company.phone if company else None) or ""
    else:
        # Fallback for demo or development environment when credentials not supplied
        external_user_id = "demo_merchant_pulsepos"
        display_name = "PulsePOS Demo Merchant"
        email = "merchant@pulsepos.example.com"
        phone = ""

    result = await referral_service.get_sso_url(
        external_user_id=external_user_id,
        display_name=display_name,
        email=email,
        phone=phone,
    )
    return result


@router.get("/summary", summary="Get referral status and balance summary for merchant")
async def get_summary_endpoint(
    session: Annotated[Session, Depends(get_session)],
    auth: Annotated[Optional[AuthContext], Depends(get_optional_auth_context)],
):
    company_id = auth.company_id if auth else "demo_merchant_pulsepos"
    company = session.get(Company, company_id) if auth else None
    summary = referral_service.get_referral_summary(
        company_id=company_id,
        company_code=company.code if company else "DEMO",
    )
    balance = await referral_service.get_tenant_credit_balance(company_id)
    summary.update(balance)
    return summary
