"""Pricing & Markdown Rules API endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.database import get_session
from app.dependencies import AuthContext, get_current_user, require_permission
from app.schemas.commerce import TimePricingRuleCreate, TimePricingRuleOut, TimePricingRuleUpdate
from app.services import pricing_service

router = APIRouter(prefix="/pricing", tags=["pricing"])


@router.get("/rules", response_model=list[TimePricingRuleOut])
def list_rules(
    auth: AuthContext = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[dict[str, Any]]:
    return pricing_service.list_pricing_rules(session, auth)



@router.post("/rules", response_model=TimePricingRuleOut)
def create_rule(
    body: TimePricingRuleCreate,
    auth: AuthContext = Depends(require_permission("config.flags")),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    return pricing_service.create_pricing_rule(session, auth, body)


@router.get("/rules/{rule_id}", response_model=TimePricingRuleOut)
def get_rule(
    rule_id: str,
    auth: AuthContext = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    return pricing_service.get_pricing_rule(session, auth, rule_id)



@router.put("/rules/{rule_id}", response_model=TimePricingRuleOut)
def update_rule(
    rule_id: str,
    body: TimePricingRuleUpdate,
    auth: AuthContext = Depends(require_permission("config.flags")),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    return pricing_service.update_pricing_rule(session, auth, rule_id, body)


@router.delete("/rules/{rule_id}")
def delete_rule(
    rule_id: str,
    auth: AuthContext = Depends(require_permission("config.flags")),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    return pricing_service.delete_pricing_rule(session, auth, rule_id)
