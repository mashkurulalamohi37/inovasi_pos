"""Subscription plans and usage limits."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlmodel import Session, select, func

from app.models.config_engine import IndustryPack
from app.models.core import Company, Counter, Store, UserAccount
from app.models.base import as_utc
from app.models.saas import (
    Notification,
    SubscriptionInvoice,
    SubscriptionPayment,
    SubscriptionPlan,
    SubscriptionUsage,
    TenantSubscription,
)


DEFAULT_PLANS = [
    # Prices are Bangladeshi Taka (BDT) per month.
    {"code": "starter", "name": "Starter", "max_stores": 1, "max_counters": 2, "max_users": 2, "max_industry_packs": 1,
     "advanced_reports": False, "offline_sync": False, "api_integration": False, "price_monthly": 2990},
    {"code": "professional", "name": "Professional", "max_stores": 5, "max_counters": 20, "max_users": 50, "max_industry_packs": 3,
     "advanced_reports": True, "offline_sync": True, "api_integration": False, "price_monthly": 7990},
    {"code": "enterprise", "name": "Enterprise", "max_stores": 999, "max_counters": 999, "max_users": 999, "max_industry_packs": 99,
     "advanced_reports": True, "offline_sync": True, "api_integration": True, "price_monthly": 19990},
]


def ensure_plans(session: Session) -> None:
    """Seed default plans if missing, and keep default BDT prices in sync."""
    for p in DEFAULT_PLANS:
        existing = session.exec(select(SubscriptionPlan).where(SubscriptionPlan.code == p["code"])).first()
        if not existing:
            session.add(SubscriptionPlan(**p))
            continue
        # Migrate legacy USD-style demo prices (29 / 99 / 299) to BDT.
        if float(existing.price_monthly or 0) in {29.0, 99.0, 299.0}:
            existing.price_monthly = float(p["price_monthly"])
    session.flush()


def _assignment_count(session: Session, plan_id: str) -> int:
    return int(
        session.exec(
            select(func.count(TenantSubscription.id)).where(TenantSubscription.plan_id == plan_id)
        ).one()
    )


def serialize_plan(session: Session, plan: SubscriptionPlan) -> dict:
    return {
        "id": plan.id,
        "code": plan.code,
        "name": plan.name,
        "max_stores": plan.max_stores,
        "max_counters": plan.max_counters,
        "max_users": plan.max_users,
        "max_industry_packs": plan.max_industry_packs,
        "advanced_reports": plan.advanced_reports,
        "offline_sync": plan.offline_sync,
        "api_integration": plan.api_integration,
        "price_monthly": plan.price_monthly,
        "is_active": plan.is_active,
        "assignment_count": _assignment_count(session, plan.id),
        "created_at": plan.created_at.isoformat() if plan.created_at else None,
        "updated_at": plan.updated_at.isoformat() if plan.updated_at else None,
    }


def get_plans(session: Session) -> list[SubscriptionPlan]:
    return list(session.exec(select(SubscriptionPlan).where(SubscriptionPlan.is_active == True).order_by(SubscriptionPlan.price_monthly)).all())  # noqa: E712


def list_all_plans(session: Session, *, active: bool | None = None) -> list[SubscriptionPlan]:
    stmt = select(SubscriptionPlan).order_by(SubscriptionPlan.price_monthly, SubscriptionPlan.code)
    if active is True:
        stmt = stmt.where(SubscriptionPlan.is_active == True)  # noqa: E712
    elif active is False:
        stmt = stmt.where(SubscriptionPlan.is_active == False)  # noqa: E712
    return list(session.exec(stmt).all())


def get_plan(session: Session, plan_id: str) -> SubscriptionPlan:
    plan = session.get(SubscriptionPlan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan


def create_plan(session: Session, data: dict) -> SubscriptionPlan:
    code = (data.get("code") or "").strip().lower()
    if not code:
        raise HTTPException(status_code=400, detail="Plan code is required")
    if session.exec(select(SubscriptionPlan).where(SubscriptionPlan.code == code)).first():
        raise HTTPException(status_code=409, detail="Plan code already exists")
    for key in ("max_stores", "max_counters", "max_users", "max_industry_packs"):
        if int(data.get(key, 0)) < 0:
            raise HTTPException(status_code=400, detail=f"{key} cannot be negative")
    if float(data.get("price_monthly", 0)) < 0:
        raise HTTPException(status_code=400, detail="price_monthly cannot be negative")
    plan = SubscriptionPlan(
        code=code,
        name=(data.get("name") or code).strip(),
        max_stores=int(data.get("max_stores", 1)),
        max_counters=int(data.get("max_counters", 2)),
        max_users=int(data.get("max_users", 5)),
        max_industry_packs=int(data.get("max_industry_packs", 1)),
        advanced_reports=bool(data.get("advanced_reports", False)),
        offline_sync=bool(data.get("offline_sync", False)),
        api_integration=bool(data.get("api_integration", False)),
        price_monthly=float(data.get("price_monthly", 0)),
        is_active=bool(data.get("is_active", True)),
    )
    session.add(plan)
    session.flush()
    return plan


def update_plan(session: Session, plan_id: str, data: dict) -> SubscriptionPlan:
    plan = get_plan(session, plan_id)
    # Codes are immutable after create.
    data = {k: v for k, v in data.items() if k != "code"}
    for field in (
        "name",
        "max_stores",
        "max_counters",
        "max_users",
        "max_industry_packs",
        "advanced_reports",
        "offline_sync",
        "api_integration",
        "price_monthly",
        "is_active",
    ):
        if field in data and data[field] is not None:
            if field.startswith("max_") and int(data[field]) < 0:
                raise HTTPException(status_code=400, detail=f"{field} cannot be negative")
            if field == "price_monthly" and float(data[field]) < 0:
                raise HTTPException(status_code=400, detail="price_monthly cannot be negative")
            setattr(plan, field, data[field])
    session.add(plan)
    session.flush()
    return plan


def set_plan_status(session: Session, plan_id: str, is_active: bool) -> SubscriptionPlan:
    return update_plan(session, plan_id, {"is_active": is_active})


def delete_plan(session: Session, plan_id: str) -> None:
    plan = get_plan(session, plan_id)
    count = _assignment_count(session, plan.id)
    if count > 0:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "PLAN_IN_USE",
                "detail": "Plan is assigned to tenants; deactivate it instead",
                "assigned_tenant_count": count,
            },
        )
    session.delete(plan)
    session.flush()


def assign_plan(
    session: Session,
    company_id: str,
    plan_code: str,
    *,
    allow_inactive: bool = False,
    billing_cycle: str = "monthly",
    billing_months: int | None = None,
    expires_at: datetime | None = None,
    status: str = "active",
) -> TenantSubscription:
    company = session.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Tenant not found")
    plan = session.exec(select(SubscriptionPlan).where(SubscriptionPlan.code == plan_code)).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if not plan.is_active and not allow_inactive:
        raise HTTPException(status_code=409, detail="Cannot assign an inactive package")
    now = datetime.now(timezone.utc)
    cycle = (billing_cycle or "monthly").lower()
    if cycle not in {"monthly", "yearly", "custom"}:
        cycle = "monthly"

    end = expires_at
    if status == "pending_approval":
        end = None
    elif end is None:
        months = billing_months
        if months is None:
            months = 12 if cycle == "yearly" else 1
        # Approximate month length for period tracking
        end = now + timedelta(days=30 * int(months))

    sub = session.exec(select(TenantSubscription).where(TenantSubscription.company_id == company_id)).first()
    if sub:
        sub.plan_id = plan.id
        sub.status = status
        sub.billing_cycle = cycle
        if status != "pending_approval":
            sub.started_at = now
        sub.expires_at = end
        session.add(sub)
    else:
        sub = TenantSubscription(
            company_id=company_id,
            plan_id=plan.id,
            status=status,
            billing_cycle=cycle,
            started_at=now,
            expires_at=end,
        )
        session.add(sub)
    session.flush()
    refresh_usage(session, company_id)
    return sub


def set_subscription_status(session: Session, company_id: str, status: str) -> TenantSubscription:
    if status not in {"active", "suspended", "cancelled"}:
        raise HTTPException(status_code=400, detail="Invalid subscription status")
    company = session.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Tenant not found")
    sub = session.exec(select(TenantSubscription).where(TenantSubscription.company_id == company_id)).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Tenant has no subscription")
    sub.status = status
    if status == "cancelled":
        sub.expires_at = datetime.now(timezone.utc)
    elif status == "active" and not sub.expires_at:
        cycle = getattr(sub, "billing_cycle", None) or "monthly"
        months = 12 if cycle == "yearly" else 1
        sub.started_at = datetime.now(timezone.utc)
        sub.expires_at = datetime.now(timezone.utc) + timedelta(days=30 * months)
    session.add(sub)
    session.flush()
    return sub


def get_current_subscription(session: Session, company_id: str) -> dict:
    sub = session.exec(select(TenantSubscription).where(TenantSubscription.company_id == company_id)).first()
    if not sub:
        return {"plan_code": None, "status": "none"}
    plan = session.get(SubscriptionPlan, sub.plan_id)
    usage = session.exec(select(SubscriptionUsage).where(SubscriptionUsage.company_id == company_id)).all()
    return {
        "plan_code": plan.code if plan else None,
        "plan_name": plan.name if plan else None,
        "plan_id": plan.id if plan else None,
        "status": sub.status,
        "billing_cycle": getattr(sub, "billing_cycle", None) or "monthly",
        "started_at": sub.started_at.isoformat() if sub.started_at else None,
        "expires_at": sub.expires_at.isoformat() if sub.expires_at else None,
        "limits": {
            "max_stores": plan.max_stores if plan else 0,
            "max_counters": plan.max_counters if plan else 0,
            "max_users": plan.max_users if plan else 0,
            "max_industry_packs": plan.max_industry_packs if plan else 0,
            "advanced_reports": plan.advanced_reports if plan else False,
            "offline_sync": plan.offline_sync if plan else False,
            "api_integration": plan.api_integration if plan else False,
        },
        "usage": {u.metric: {"current": u.current_value, "limit": u.limit_value} for u in usage},
    }


def refresh_usage(session: Session, company_id: str) -> None:
    sub = session.exec(select(TenantSubscription).where(TenantSubscription.company_id == company_id)).first()
    if not sub:
        return
    plan = session.get(SubscriptionPlan, sub.plan_id)
    if not plan:
        return
    metrics = {
        "stores": (session.exec(select(func.count(Store.id)).where(Store.company_id == company_id)).one(), plan.max_stores),
        "counters": (session.exec(select(func.count(Counter.id)).where(Counter.company_id == company_id)).one(), plan.max_counters),
        "users": (session.exec(select(func.count(UserAccount.id)).where(UserAccount.company_id == company_id)).one(), plan.max_users),
        "industry_packs": (
            session.exec(select(func.count(IndustryPack.id)).where(IndustryPack.company_id == company_id, IndustryPack.enabled_company == True)).one(),  # noqa: E712
            plan.max_industry_packs,
        ),
    }
    for metric, (current, limit) in metrics.items():
        row = session.exec(
            select(SubscriptionUsage).where(SubscriptionUsage.company_id == company_id, SubscriptionUsage.metric == metric)
        ).first()
        if row:
            row.current_value = float(current)
            row.limit_value = float(limit)
            row.updated_at = datetime.now(timezone.utc)
            session.add(row)
        else:
            session.add(SubscriptionUsage(company_id=company_id, metric=metric, current_value=float(current), limit_value=float(limit)))


def check_limit(session: Session, company_id: str, metric: str, increment: float = 0) -> dict:
    refresh_usage(session, company_id)
    row = session.exec(
        select(SubscriptionUsage).where(SubscriptionUsage.company_id == company_id, SubscriptionUsage.metric == metric)
    ).first()
    if not row:
        return {"allowed": True, "warning": False}
    projected = row.current_value + increment
    pct = (projected / row.limit_value * 100) if row.limit_value else 0
    return {
        "allowed": projected <= row.limit_value,
        "warning": pct >= 80,
        "current": row.current_value,
        "limit": row.limit_value,
        "projected": projected,
        "usage_pct": round(pct, 1),
    }


def enforce_limit(session: Session, company_id: str, metric: str, increment: float = 1) -> None:
    result = check_limit(session, company_id, metric, increment)
    if not result["allowed"]:
        raise HTTPException(
            status_code=403,
            detail=f"Subscription limit reached for {metric}. Upgrade required.",
        )


def list_invoices(session: Session, company_id: str) -> list[dict]:
    rows = session.exec(select(SubscriptionInvoice).where(SubscriptionInvoice.company_id == company_id)).all()
    return [
        {
            "id": r.id,
            "invoice_number": r.invoice_number,
            "amount": r.amount,
            "status": r.status,
            "due_date": r.due_date.isoformat() if r.due_date else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]

def extend_subscription(
    session: Session,
    company_id: str,
    days: int,
    *,
    note: str | None = None,
    plan_code: str | None = None,
    amount: float = 0.0,
    payment_method: str = "manual",
) -> TenantSubscription:
    company = session.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Tenant not found")

    now_utc = datetime.now(timezone.utc)
    sub = session.exec(select(TenantSubscription).where(TenantSubscription.company_id == company_id)).first()

    if plan_code:
        plan = session.exec(select(SubscriptionPlan).where(SubscriptionPlan.code == plan_code)).first()
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")
        plan_id = plan.id
    elif sub:
        plan_id = sub.plan_id
    else:
        default_plan = session.exec(
            select(SubscriptionPlan).where(SubscriptionPlan.is_active == True).order_by(SubscriptionPlan.price_monthly)
        ).first()
        if not default_plan:
            raise HTTPException(status_code=400, detail="No active plan found")
        plan_id = default_plan.id

    if sub:
        sub_exp_utc = as_utc(sub.expires_at)
        base_time = sub_exp_utc if (sub_exp_utc and sub_exp_utc > now_utc) else now_utc
        new_expires = base_time + timedelta(days=days)
        sub.expires_at = new_expires.replace(tzinfo=None) if (sub.expires_at is not None and sub.expires_at.tzinfo is None) else new_expires
        sub.status = "active"
        if plan_id:
            sub.plan_id = plan_id
        session.add(sub)
    else:
        sub = TenantSubscription(
            company_id=company_id,
            plan_id=plan_id,
            status="active",
            billing_cycle="custom",
            started_at=now_utc.replace(tzinfo=None),
            expires_at=(now_utc + timedelta(days=days)).replace(tzinfo=None),
        )
        session.add(sub)

    session.flush()

    # Create Invoice and Payment records for auditing and reporting safely
    try:
        import uuid
        inv_num = f"INV-SUB-{datetime.now().strftime('%Y%m%d%H%M%S')}-{company_id[:4].upper()}-{uuid.uuid4().hex[:4].upper()}"
        inv = SubscriptionInvoice(
            company_id=company_id,
            invoice_number=inv_num,
            amount=amount,
            status="paid",
            due_date=now_utc.replace(tzinfo=None),
        )
        session.add(inv)
        session.flush()

        pay = SubscriptionPayment(
            company_id=company_id,
            invoice_id=inv.id,
            amount=amount,
            method=payment_method,
            paid_at=now_utc.replace(tzinfo=None),
        )
        session.add(pay)
        session.flush()
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Failed to record subscription invoice/payment: %s", exc)

    # Resolve existing subscription expiration notifications and push extension notice
    try:
        old_alerts = session.exec(
            select(Notification).where(
                Notification.company_id == company_id,
                Notification.event_type.in_(["subscription_expired", "subscription_expiring", "subscription_suspended"]),
                Notification.is_read == False,
            )
        ).all()
        for alert in old_alerts:
            alert.is_read = True
            session.add(alert)

        exp_str = sub.expires_at.strftime("%b %d, %Y") if sub.expires_at else "active"
        session.add(
            Notification(
                company_id=company_id,
                event_type="subscription_extended",
                title="🎉 Subscription Extended",
                message=f"Plan extended by {days} days. Valid until {exp_str}.",
                link="/app/subscription/plans",
            )
        )
        session.flush()
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Failed to update subscription notifications: %s", exc)

    refresh_usage(session, company_id)
    return sub

