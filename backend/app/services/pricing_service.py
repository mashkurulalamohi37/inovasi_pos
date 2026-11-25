"""Pricing & Markdown Rules service layer."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException
from sqlmodel import Session, select

from app.dependencies import AuthContext, write_audit
from app.models.product import TimePricingRule
from app.schemas.commerce import TimePricingRuleCreate, TimePricingRuleUpdate


def _rule_to_dict(rule: TimePricingRule) -> dict[str, Any]:
    days_of_week: list[int] = []
    category_ids: list[str] = []
    product_ids: list[str] = []

    try:
        if rule.days_of_week_json:
            days_of_week = json.loads(rule.days_of_week_json)
    except Exception:
        days_of_week = [0, 1, 2, 3, 4, 5, 6]

    try:
        if rule.category_ids_json:
            category_ids = json.loads(rule.category_ids_json)
    except Exception:
        category_ids = []

    try:
        if rule.product_ids_json:
            product_ids = json.loads(rule.product_ids_json)
    except Exception:
        product_ids = []

    return {
        "id": rule.id,
        "name": rule.name,
        "discount_type": rule.discount_type,
        "discount_value": rule.discount_value,
        "start_time": rule.start_time,
        "end_time": rule.end_time,
        "days_of_week": days_of_week,
        "category_ids": category_ids,
        "product_ids": product_ids,
        "industry_pack": rule.industry_pack,
        "badge_label": rule.badge_label,
        "description": rule.description,
        "is_active": rule.is_active,
        "created_at": rule.created_at,
        "updated_at": rule.updated_at,
    }


def list_pricing_rules(session: Session, auth: AuthContext) -> list[dict[str, Any]]:
    rules = session.exec(
        select(TimePricingRule)
        .where(TimePricingRule.company_id == auth.company_id)
        .order_by(TimePricingRule.created_at.desc())
    ).all()
    return [_rule_to_dict(r) for r in rules]


def get_pricing_rule(session: Session, auth: AuthContext, rule_id: str) -> dict[str, Any]:
    rule = session.get(TimePricingRule, rule_id)
    if not rule or rule.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Pricing rule not found")
    return _rule_to_dict(rule)


def create_pricing_rule(session: Session, auth: AuthContext, data: TimePricingRuleCreate) -> dict[str, Any]:
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Rule name is required")

    rule = TimePricingRule(
        company_id=auth.company_id,
        name=name,
        discount_type=data.discount_type or "half_price",
        discount_value=data.discount_value if data.discount_value is not None else 50.0,
        start_time=data.start_time or "20:00",
        end_time=data.end_time or "23:59",
        days_of_week_json=json.dumps(data.days_of_week or [0, 1, 2, 3, 4, 5, 6]),
        category_ids_json=json.dumps(data.category_ids or []),
        product_ids_json=json.dumps(data.product_ids or []),
        industry_pack=data.industry_pack or "all",
        badge_label=data.badge_label or "⚡ 50% Fresh Clearance",
        description=data.description,
        is_active=data.is_active,
    )
    session.add(rule)
    session.commit()
    session.refresh(rule)

    write_audit(
        session,
        auth,
        "create",
        "time_pricing_rule",
        rule.id,
        {"name": rule.name, "discount_type": rule.discount_type, "discount_value": rule.discount_value},
    )

    return _rule_to_dict(rule)


def update_pricing_rule(
    session: Session, auth: AuthContext, rule_id: str, data: TimePricingRuleUpdate
) -> dict[str, Any]:
    rule = session.get(TimePricingRule, rule_id)
    if not rule or rule.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Pricing rule not found")

    if data.name is not None:
        rule.name = data.name.strip()
    if data.discount_type is not None:
        rule.discount_type = data.discount_type
    if data.discount_value is not None:
        rule.discount_value = data.discount_value
    if data.start_time is not None:
        rule.start_time = data.start_time
    if data.end_time is not None:
        rule.end_time = data.end_time
    if data.days_of_week is not None:
        rule.days_of_week_json = json.dumps(data.days_of_week)
    if data.category_ids is not None:
        rule.category_ids_json = json.dumps(data.category_ids)
    if data.product_ids is not None:
        rule.product_ids_json = json.dumps(data.product_ids)
    if data.industry_pack is not None:
        rule.industry_pack = data.industry_pack
    if data.badge_label is not None:
        rule.badge_label = data.badge_label
    if data.description is not None:
        rule.description = data.description
    if data.is_active is not None:
        rule.is_active = data.is_active

    rule.updated_at = datetime.now(timezone.utc)
    session.add(rule)
    session.commit()
    session.refresh(rule)

    write_audit(
        session,
        auth,
        "update",
        "time_pricing_rule",
        rule.id,
        {"name": rule.name, "is_active": rule.is_active},
    )

    return _rule_to_dict(rule)


def delete_pricing_rule(session: Session, auth: AuthContext, rule_id: str) -> dict[str, Any]:
    rule = session.get(TimePricingRule, rule_id)
    if not rule or rule.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Pricing rule not found")

    rule_name = rule.name
    session.delete(rule)
    session.commit()

    write_audit(
        session,
        auth,
        "delete",
        "time_pricing_rule",
        rule_id,
        {"name": rule_name},
    )

    return {"ok": True, "id": rule_id, "name": rule_name}
