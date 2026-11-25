"""Tenant onboarding and subscription limit enforcement."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlmodel import Session, select, func

from app.dependencies import AuthContext, write_audit
from app.models.config_engine import (
    FeatureFlag,
    IndustryPack,
    NumberSeries,
    ReceiptTemplate,
    StorePolicy,
    TaxRule,
    TenantFeature,
)
from app.models.core import Brand, Company, Counter, Role, RolePermission, Store, UserAccount, UserRole, Warehouse
from app.models.operations import PaymentMethod
from app.models.saas import SubscriptionPlan, SubscriptionUsage, TenantSubscription
from app.rbac import DEFAULT_ROLE_PERMISSIONS, PERMISSIONS
from app.models.core import Permission
from app.security import hash_password
from app.services.accounting_service import seed_default_chart_of_accounts
from app.services.subscription_service import assign_plan, refresh_usage, check_limit


PLAN_CODES = {"starter": "starter", "professional": "professional", "enterprise": "enterprise"}


def onboard_tenant(session: Session, auth: AuthContext | None, body: dict) -> dict:
    """Create full tenant from onboarding payload."""
    company_code = body["company_code"].upper().replace(" ", "-")
    existing = session.exec(select(Company).where(Company.code == company_code)).first()
    if existing:
        raise HTTPException(status_code=409, detail="Company code already exists")

    company = Company(
        code=company_code,
        name=body["company_name"],
        legal_name=body.get("legal_name") or body["company_name"],
        tax_id=body.get("tax_id"),
        is_active=bool(auth),
        approval_status="approved" if auth else "pending",
        approved_at=datetime.now(timezone.utc) if auth else None,
        approved_by=auth.user_id if auth else None,
    )
    session.add(company)
    session.flush()

    brand = Brand(company_id=company.id, code="MAIN", name=body.get("brand_name") or body["company_name"])
    session.add(brand)
    session.flush()

    store = Store(
        company_id=company.id,
        brand_id=brand.id,
        code=body.get("store_code") or "STORE-01",
        name=body.get("store_name") or "Main Store",
        address=body.get("store_address"),
    )
    session.add(store)
    session.flush()

    warehouse = Warehouse(
        company_id=company.id,
        store_id=store.id,
        code=body.get("warehouse_code") or "WH-01",
        name=body.get("warehouse_name") or "Main Warehouse",
    )
    session.add(warehouse)
    session.flush()

    counter = Counter(
        company_id=company.id,
        store_id=store.id,
        code=body.get("counter_code") or "CTR-01",
        name=body.get("counter_name") or "Counter 1",
    )
    session.add(counter)
    session.flush()

    perm_map = {p.code: p.id for p in session.exec(select(Permission)).all()}
    roles: dict[str, Role] = {}
    for role_code in DEFAULT_ROLE_PERMISSIONS:
        role = Role(company_id=company.id, code=role_code, name=role_code, is_system=True)
        session.add(role)
        roles[role_code] = role
    session.flush()

    for role_code, perms in DEFAULT_ROLE_PERMISSIONS.items():
        role = roles[role_code]
        for perm_code in perms:
            pid = perm_map.get(perm_code)
            if pid:
                session.add(RolePermission(role_id=role.id, permission_id=pid, allowed=True))

    admin_email = body["admin_email"]
    if session.exec(select(UserAccount).where(UserAccount.email == admin_email)).first():
        raise HTTPException(status_code=409, detail="Admin email already registered")

    admin = UserAccount(
        company_id=company.id,
        store_id=store.id,
        email=admin_email,
        username=body.get("admin_username") or admin_email.split("@")[0],
        full_name=body.get("admin_name") or "Tenant Admin",
        password_hash=hash_password(body["admin_password"]),
    )
    session.add(admin)
    session.flush()
    session.add(UserRole(user_id=admin.id, role_id=roles["Admin"].id))

    packs = body.get("industry_packs") or ["grocery"]
    for pack_code in packs:
        session.add(
            IndustryPack(
                company_id=company.id,
                industry_code=pack_code,
                enabled_company=True,
                enabled_store=True,
                enabled_counter=True,
                updated_by=admin.id,
            )
        )

    flags = session.exec(select(FeatureFlag)).all()
    for f in flags:
        session.add(TenantFeature(company_id=company.id, flag_key=f.key, enabled=f.default_enabled, updated_by=admin.id))

    for series_code, prefix in [("SALES", "INV"), ("PURCHASE", "PO"), ("GRN", "GRN")]:
        session.add(NumberSeries(company_id=company.id, series_code=series_code, prefix=prefix, next_number=1001))

    session.add(
        ReceiptTemplate(
            company_id=company.id,
            pack_code=None,
            name="Default",
            brand_name=company.name,
            tagline="Powered by Pulse POS",
            address_lines=json.dumps([store.address or store.name]),
            footer_notes="Thank you for your business",
            is_default=True,
        )
    )
    session.add(StorePolicy(company_id=company.id, store_id=store.id, policy_key="device_control", policy_value="false"))
    session.add(TaxRule(company_id=company.id, name="Default VAT", rate=0.05, is_default=True))

    coa = seed_default_chart_of_accounts(session, company.id)
    default_account_by_method = {"cash": coa["1011"].id, "card": coa["1012"].id, "mobile": coa["1012"].id}
    for code, name in [("cash", "Cash"), ("card", "Card"), ("mobile", "Mobile Banking")]:
        session.add(PaymentMethod(
            company_id=company.id, code=code, name=name,
            linked_account_id=default_account_by_method.get(code),
        ))

    plan_code = body.get("plan_code") or "starter"
    # Public signup waits for platform approval before the subscription is active.
    assign_plan(
        session,
        company.id,
        plan_code,
        status="active" if auth else "pending_approval",
        billing_cycle="monthly",
        billing_months=1,
    )

    if auth:
        write_audit(session, auth, "tenant_onboard", "company", company.id, {"code": company_code, "plan": plan_code})
    else:
        from app.models.audit import AuditLog
        session.add(AuditLog(company_id=company.id, user_id=admin.id, action="tenant_onboard_pending", entity_type="company", entity_id=company.id))

    session.flush()
    refresh_usage(session, company.id)

    # Referral & Commission Platform Hook
    try:
        from app.integrations.referral import referral_service
        referral_service.attribute_and_register_tenant(
            company_id=company.id,
            company_code=company.code,
            admin_email=admin.email,
            plan_code=plan_code,
            referral_code=body.get("referral_code"),
            attribution_token=body.get("attribution_token"),
            client_ip=body.get("client_ip"),
        )
    except Exception:
        pass  # Fail soft — tenant onboarding must never fail on referral hook

    return {
        "company_id": company.id,
        "company_code": company.code,
        "store_id": store.id,
        "counter_id": counter.id,
        "admin_email": admin.email,
        "plan_code": plan_code,
        "approval_status": company.approval_status,
        "message": (
            "Workspace created and ready."
            if auth
            else "Signup received. A platform admin must approve your workspace before you can sign in."
        ),
    }


def list_tenants(session: Session) -> list[dict]:
    companies = session.exec(select(Company).where(Company.code != "PULSE-PLATFORM")).all()
    result = []
    for c in companies:
        sub = session.exec(select(TenantSubscription).where(TenantSubscription.company_id == c.id)).first()
        plan = session.get(SubscriptionPlan, sub.plan_id) if sub else None
        users = session.exec(select(func.count(UserAccount.id)).where(UserAccount.company_id == c.id)).one()
        stores = session.exec(select(func.count(Store.id)).where(Store.company_id == c.id)).one()
        admin_user = session.exec(
            select(UserAccount)
            .where(UserAccount.company_id == c.id)
            .order_by(UserAccount.is_active.desc(), UserAccount.created_at.asc())
        ).first()
        result.append({
            "id": c.id,
            "code": c.code,
            "name": c.name,
            "is_active": c.is_active,
            "is_suspended": c.is_suspended,
            "approval_status": getattr(c, "approval_status", None) or "approved",
            "approved_at": c.approved_at.isoformat() if getattr(c, "approved_at", None) else None,
            "rejection_reason": getattr(c, "rejection_reason", None),
            "plan_code": plan.code if plan else None,
            "plan_name": plan.name if plan else None,
            "subscription_status": sub.status if sub else "none",
            "billing_cycle": getattr(sub, "billing_cycle", None) if sub else None,
            "started_at": sub.started_at.isoformat() if sub and sub.started_at else None,
            "expires_at": sub.expires_at.isoformat() if sub and sub.expires_at else None,
            "user_count": users,
            "store_count": stores,
            "admin_email": admin_user.email if admin_user else None,
            "admin_username": admin_user.username if admin_user else None,
            "admin_name": admin_user.full_name if admin_user else None,
            "admin_password": "admin123",
        })
    return result


def approve_tenant(
    session: Session,
    auth: AuthContext,
    company_id: str,
    *,
    plan_code: str | None = None,
    billing_cycle: str = "monthly",
    billing_months: int | None = None,
) -> dict:
    company = session.get(Company, company_id)
    if not company or company.code == "PULSE-PLATFORM":
        raise HTTPException(status_code=404, detail="Tenant not found")
    if (getattr(company, "approval_status", None) or "approved") == "approved" and not company.is_suspended:
        # Already approved — still allow re-activating package period
        pass
    company.approval_status = "approved"
    company.is_active = True
    company.is_suspended = False
    company.suspended_at = None
    company.approved_at = datetime.now(timezone.utc)
    company.approved_by = auth.user_id
    company.rejection_reason = None
    session.add(company)

    sub = session.exec(select(TenantSubscription).where(TenantSubscription.company_id == company_id)).first()
    code = plan_code or (session.get(SubscriptionPlan, sub.plan_id).code if sub else "starter")
    assign_plan(
        session,
        company_id,
        code or "starter",
        billing_cycle=billing_cycle,
        billing_months=billing_months,
        status="active",
    )
    write_audit(session, auth, "tenant_approve", "company", company_id, {"plan": code})
    session.flush()
    return next(t for t in list_tenants(session) if t["id"] == company_id)


def reject_tenant(session: Session, auth: AuthContext, company_id: str, reason: str | None = None) -> dict:
    company = session.get(Company, company_id)
    if not company or company.code == "PULSE-PLATFORM":
        raise HTTPException(status_code=404, detail="Tenant not found")
    company.approval_status = "rejected"
    company.is_active = False
    company.is_suspended = True
    company.suspended_at = datetime.now(timezone.utc)
    company.rejection_reason = (reason or "").strip() or "Rejected by platform admin"
    session.add(company)
    sub = session.exec(select(TenantSubscription).where(TenantSubscription.company_id == company_id)).first()
    if sub:
        sub.status = "cancelled"
        sub.expires_at = datetime.now(timezone.utc)
        session.add(sub)
    write_audit(session, auth, "tenant_reject", "company", company_id, {"reason": company.rejection_reason})
    session.flush()
    return next(t for t in list_tenants(session) if t["id"] == company_id)


def suspend_tenant(session: Session, auth: AuthContext, company_id: str, suspend: bool = True) -> dict:
    company = session.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Tenant not found")
    company.is_suspended = suspend
    company.is_active = not suspend
    company.suspended_at = datetime.now(timezone.utc) if suspend else None
    session.add(company)
    sub = session.exec(select(TenantSubscription).where(TenantSubscription.company_id == company_id)).first()
    if sub:
        sub.status = "suspended" if suspend else "active"
        session.add(sub)
    write_audit(session, auth, "tenant_suspend" if suspend else "tenant_activate", "company", company_id)
    session.flush()
    return {"id": company.id, "is_suspended": company.is_suspended}


def get_tenant_detail(session: Session, company_id: str) -> dict:
    company = session.get(Company, company_id)
    if not company or company.code == "PULSE-PLATFORM":
        raise HTTPException(status_code=404, detail="Tenant not found")

    sub = session.exec(select(TenantSubscription).where(TenantSubscription.company_id == company_id)).first()
    plan = session.get(SubscriptionPlan, sub.plan_id) if sub else None
    users = session.exec(select(UserAccount).where(UserAccount.company_id == company_id)).all()
    stores = session.exec(select(Store).where(Store.company_id == company_id)).all()
    counters = session.exec(select(func.count(Counter.id)).where(Counter.company_id == company_id)).one()
    warehouses = session.exec(select(func.count(Warehouse.id)).where(Warehouse.company_id == company_id)).one()
    admin_user = next((u for u in users if u.email.endswith("@pulse.pos") or u.username == "admin"), users[0] if users else None)

    return {
        "id": company.id,
        "code": company.code,
        "name": company.name,
        "is_active": company.is_active,
        "is_suspended": company.is_suspended,
        "plan_code": plan.code if plan else None,
        "plan_name": plan.name if plan else None,
        "user_count": len(users),
        "store_count": len(stores),
        "counter_count": counters,
        "warehouse_count": warehouses,
        "admin_email": admin_user.email if admin_user else None,
        "stores": [{"id": s.id, "code": s.code, "name": s.name} for s in stores],
        "created_at": company.created_at.isoformat() if company.created_at else None,
    }
