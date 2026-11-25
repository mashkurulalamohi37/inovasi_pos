import json
import uuid
from datetime import datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import get_session
from app.dependencies import AuthContext, get_current_user, require_permission, require_platform_admin, write_audit
from app.integrations.referral import referral_service
from app.models.core import Company
from app.models.saas import SubscriptionPlan, ApprovalRequest
from app.schemas.subscriptions import (
    AssignPlanBody,
    ChangePlanBody,
    PlanCreate,
    PlanStatusBody,
    PlanUpdate,
    SubscriptionStatusBody,
    ExtendSubscriptionBody,
    ManualPaymentRequestBody,
    RejectPaymentRequestBody,
)
from app.services.onboarding_service import approve_tenant, list_tenants, reject_tenant, suspend_tenant
from app.services.subscription_service import (
    assign_plan,
    create_plan,
    delete_plan,
    extend_subscription,
    get_current_subscription,
    get_plan,
    get_plans,
    list_all_plans,
    list_invoices,
    refresh_usage,
    serialize_plan,
    set_plan_status,
    set_subscription_status,
    update_plan,
)

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])
admin_router = APIRouter(prefix="/super-admin", tags=["super-admin"])


class ApplyReferralCreditBody(BaseModel):
    amount_bdt: float


@router.get("/referral-summary")
async def get_referral_summary(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    """Returns referral program status, balance, share link, and portal URL for the merchant."""
    company = session.get(Company, auth.company_id)
    summary = referral_service.get_referral_summary(
        company_id=auth.company_id,
        company_code=company.code if company else None,
    )
    credit_bal = await referral_service.get_tenant_credit_balance(auth.company_id)
    summary.update(credit_bal)
    return summary


@router.post("/apply-credits")
async def apply_referral_credits(
    body: ApplyReferralCreditBody,
    auth: Annotated[AuthContext, Depends(require_permission("settings.manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    """Reserves referral credits for subscription discount."""
    if body.amount_bdt <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    order_ref = f"sub_inv_{auth.company_id[:8]}_{int(datetime.now().timestamp())}"
    resv = await referral_service.reserve_subscription_credit(
        company_id=auth.company_id,
        amount_bdt=body.amount_bdt,
        order_ref=order_ref,
    )
    if not resv:
        raise HTTPException(
            status_code=400,
            detail="Unable to reserve referral credits. Check available balance.",
        )
    return resv


@router.get("/plans")
def plans_list(session: Annotated[Session, Depends(get_session)]):
    return [serialize_plan(session, p) for p in get_plans(session)]


@router.get("/current")
def current_plan(

    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    return get_current_subscription(session, auth.company_id)


@router.get("/usage")
def usage(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    refresh_usage(session, auth.company_id)
    sub = get_current_subscription(session, auth.company_id)
    warnings = []
    for metric, data in sub.get("usage", {}).items():
        if data.get("limit") and data["current"] / data["limit"] >= 0.8:
            warnings.append({
                "metric": metric,
                "usage_pct": round(data["current"] / data["limit"] * 100, 1),
                "message": "80% usage reached" if data["current"] / data["limit"] < 1 else "Limit reached",
            })
    return {**sub, "warnings": warnings}


@router.post("/change-plan")
def change_plan(
    body: ChangePlanBody,
    auth: Annotated[AuthContext, Depends(require_permission("settings.manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    assign_plan(session, auth.company_id, body.plan_code)
    write_audit(session, auth, "subscription_change", "tenant_subscription", auth.company_id, {"plan": body.plan_code})
    session.commit()
    return get_current_subscription(session, auth.company_id)


@router.post("/assign")
def assign_subscription(
    body: AssignPlanBody,
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
):
    expires = None
    if body.expires_at:
        try:
            expires = datetime.fromisoformat(body.expires_at.replace("Z", "+00:00"))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid expires_at") from exc
    assign_plan(
        session,
        body.company_id,
        body.plan_code,
        billing_cycle=body.billing_cycle,
        billing_months=body.billing_months,
        expires_at=expires,
        status="active",
    )
    write_audit(
        session,
        auth,
        "subscription_assign",
        "tenant_subscription",
        body.company_id,
        {"plan": body.plan_code, "billing_cycle": body.billing_cycle},
    )
    session.commit()

    # Emit payment.succeeded event to Referral Platform
    try:
        plan_obj = session.exec(select(SubscriptionPlan).where(SubscriptionPlan.code == body.plan_code)).first()
        if plan_obj and plan_obj.price_monthly:
            import asyncio
            months = body.billing_months or 1
            gross_bdt = float(plan_obj.price_monthly) * months
            pay_id = f"pay_{uuid.uuid4().hex[:12]}"
            sub_id = f"sub_{body.company_id[:16]}"
            asyncio.create_task(
                referral_service.emit_payment_succeeded_async(
                    payment_id=pay_id,
                    company_id=body.company_id,
                    subscription_id=sub_id,
                    plan_code=body.plan_code,
                    amount_bdt=gross_bdt,
                    billing_reason="initial",
                )
            )
    except Exception:
        pass

    return get_current_subscription(session, body.company_id)


@router.get("/invoices")
def invoices(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    return list_invoices(session, auth.company_id)


@admin_router.get("/tenants")
def super_tenants(
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
):
    return list_tenants(session)


@admin_router.post("/tenants/{company_id}/suspend")
def super_suspend(
    company_id: str,
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
):
    result = suspend_tenant(session, auth, company_id, True)
    try:
        set_subscription_status(session, company_id, "suspended")
    except HTTPException as exc:
        if exc.status_code != 404:
            raise
    session.commit()
    return result


@admin_router.post("/tenants/{company_id}/activate")
def super_activate(
    company_id: str,
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
):
    result = suspend_tenant(session, auth, company_id, False)
    try:
        set_subscription_status(session, company_id, "active")
    except HTTPException as exc:
        if exc.status_code != 404:
            raise
    session.commit()
    return result


class ResetTenantPasswordBody(BaseModel):
    password: str
    user_id: Optional[str] = None
    email: Optional[str] = None


@admin_router.post("/tenants/{company_id}/reset-password")
def super_reset_tenant_password(
    company_id: str,
    body: ResetTenantPasswordBody,
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
):
    from app.security import hash_password

    if len(body.password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")
    query = select(UserAccount).where(UserAccount.company_id == company_id)
    if body.user_id:
        query = query.where(UserAccount.id == body.user_id)
    elif body.email:
        query = query.where(UserAccount.email == body.email)
    else:
        query = query.order_by(UserAccount.is_active.desc(), UserAccount.created_at.asc())
    
    user = session.exec(query).first()
    if not user:
        raise HTTPException(status_code=404, detail="No user found for this tenant")
    
    user.password_hash = hash_password(body.password)
    user.is_active = True
    session.add(user)
    session.commit()
    return {"status": "ok", "message": f"Password updated for {user.email}", "email": user.email}



@admin_router.post("/subscriptions/assign")
def super_assign_plan(
    body: AssignPlanBody,
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
):
    expires = None
    if body.expires_at:
        try:
            expires = datetime.fromisoformat(body.expires_at.replace("Z", "+00:00"))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid expires_at") from exc
    assign_plan(
        session,
        body.company_id,
        body.plan_code,
        billing_cycle=body.billing_cycle,
        billing_months=body.billing_months,
        expires_at=expires,
        status="active",
    )
    write_audit(
        session,
        auth,
        "subscription_assign",
        "tenant_subscription",
        body.company_id,
        {"plan": body.plan_code, "billing_cycle": body.billing_cycle},
    )
    session.commit()
    return get_current_subscription(session, body.company_id)


class TenantApproveBody(BaseModel):
    plan_code: str | None = None
    billing_cycle: str = "monthly"
    billing_months: int | None = 1


class TenantRejectBody(BaseModel):
    reason: str | None = None


@admin_router.post("/tenants/{company_id}/approve")
def super_approve_tenant(
    company_id: str,
    body: TenantApproveBody,
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
):
    result = approve_tenant(
        session,
        auth,
        company_id,
        plan_code=body.plan_code,
        billing_cycle=body.billing_cycle,
        billing_months=body.billing_months,
    )
    session.commit()
    return result


@admin_router.post("/tenants/{company_id}/reject")
def super_reject_tenant(
    company_id: str,
    body: TenantRejectBody,
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
):
    result = reject_tenant(session, auth, company_id, body.reason)
    session.commit()
    return result


@admin_router.patch("/tenants/{company_id}/subscription-status")
def super_subscription_status(
    company_id: str,
    body: SubscriptionStatusBody,
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
):
    set_subscription_status(session, company_id, body.status)
    write_audit(
        session,
        auth,
        "subscription_status",
        "tenant_subscription",
        company_id,
        {"status": body.status},
    )
    session.commit()
    return get_current_subscription(session, company_id)


@admin_router.get("/plans")
def super_list_plans(
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
    active: Optional[bool] = None,
):
    return [serialize_plan(session, p) for p in list_all_plans(session, active=active)]


@admin_router.get("/plans/{plan_id}")
def super_get_plan(
    plan_id: str,
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
):
    return serialize_plan(session, get_plan(session, plan_id))


@admin_router.post("/plans", status_code=status.HTTP_201_CREATED)
def super_create_plan(
    body: PlanCreate,
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
):
    plan = create_plan(session, body.model_dump())
    write_audit(session, auth, "subscription_plan_create", "subscription_plan", plan.id, {"code": plan.code})
    session.commit()
    return serialize_plan(session, plan)


@admin_router.patch("/plans/{plan_id}")
def super_update_plan(
    plan_id: str,
    body: PlanUpdate,
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
):
    plan = update_plan(session, plan_id, body.model_dump(exclude_unset=True))
    write_audit(session, auth, "subscription_plan_update", "subscription_plan", plan.id, {"code": plan.code})
    session.commit()
    return serialize_plan(session, plan)


@admin_router.patch("/plans/{plan_id}/status")
def super_plan_status(
    plan_id: str,
    body: PlanStatusBody,
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
):
    plan = set_plan_status(session, plan_id, body.is_active)
    write_audit(
        session,
        auth,
        "subscription_plan_status",
        "subscription_plan",
        plan.id,
        {"code": plan.code, "is_active": plan.is_active},
    )
    session.commit()
    return serialize_plan(session, plan)


@admin_router.delete("/plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def super_delete_plan(
    plan_id: str,
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
):
    plan = get_plan(session, plan_id)
    code = plan.code
    delete_plan(session, plan_id)
    write_audit(session, auth, "subscription_plan_delete", "subscription_plan", plan_id, {"code": code})
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@admin_router.get("/usage")
def super_usage(
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
):
    return list_tenants(session)

@router.post("/payment-request")
def submit_payment_request(
    body: ManualPaymentRequestBody,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    """Merchants submit manual payment (bKash/Nagad/Bank/Cash) with TrxID for Super Admin approval."""
    company = session.get(Company, auth.company_id)
    plan = session.exec(select(SubscriptionPlan).where(SubscriptionPlan.code == body.plan_code)).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Subscription plan not found")

    detail = {
        "plan_code": body.plan_code,
        "plan_name": plan.name,
        "method": body.method,
        "trx_id": body.trx_id,
        "sender_number": body.sender_number,
        "amount": body.amount,
        "months": body.months,
        "note": body.note,
        "company_name": company.name if company else auth.company_id,
        "company_code": company.code if company else "",
    }
    req = ApprovalRequest(
        company_id=auth.company_id,
        request_type="subscription_payment",
        entity_type="tenant_subscription",
        entity_id=auth.company_id,
        requested_by=auth.user_id,
        status="pending",
        title=f"Subscription: {plan.name} via {body.method.upper()} (TrxID: {body.trx_id})",
        detail_json=json.dumps(detail),
    )
    session.add(req)
    write_audit(session, auth, "subscription_payment_request", "approval_request", req.id, detail)
    session.commit()
    return {"status": "ok", "message": "Subscription payment request submitted successfully", "request_id": req.id}


@router.get("/my-payment-requests")
def my_payment_requests(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    """View payment requests submitted by the current tenant."""
    rows = session.exec(
        select(ApprovalRequest)
        .where(
            ApprovalRequest.company_id == auth.company_id,
            ApprovalRequest.request_type == "subscription_payment",
        )
        .order_by(ApprovalRequest.created_at.desc())
    ).all()
    results = []
    for r in rows:
        detail = {}
        if r.detail_json:
            try:
                detail = json.loads(r.detail_json)
            except Exception:
                pass
        results.append({
            "id": r.id,
            "title": r.title,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
            "comment": r.comment,
            "detail": detail,
        })
    return results


@admin_router.post("/tenants/{company_id}/extend")
def super_extend_tenant_subscription(
    company_id: str,
    body: ExtendSubscriptionBody,
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
):
    """Super Admin 1-click extension for a tenant (+30 days, +90 days, +365 days, or custom)."""
    extend_subscription(
        session,
        company_id,
        days=body.days,
        note=body.note,
        plan_code=body.plan_code,
        payment_method="super_admin_extension",
    )
    write_audit(
        session,
        auth,
        "subscription_extend",
        "tenant_subscription",
        company_id,
        {"days": body.days, "note": body.note, "plan_code": body.plan_code},
    )
    session.commit()
    return get_current_subscription(session, company_id)


@admin_router.get("/payment-requests")
def super_list_payment_requests(
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
):
    """Super Admin list of all manual subscription payment requests across all tenants."""
    rows = session.exec(
        select(ApprovalRequest)
        .where(ApprovalRequest.request_type == "subscription_payment")
        .order_by(ApprovalRequest.created_at.desc())
    ).all()
    results = []
    for r in rows:
        company = session.get(Company, r.company_id)
        user = session.get(UserAccount, r.requested_by) if r.requested_by else None
        detail = {}
        if r.detail_json:
            try:
                detail = json.loads(r.detail_json)
            except Exception:
                pass
        results.append({
            "id": r.id,
            "company_id": r.company_id,
            "company_name": company.name if company else detail.get("company_name", r.company_id),
            "company_code": company.code if company else detail.get("company_code", ""),
            "requested_by_email": user.email if user else "",
            "title": r.title,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
            "resolved_by": r.resolved_by,
            "comment": r.comment,
            "detail": detail,
        })
    return results


@admin_router.post("/payment-requests/{request_id}/approve")
def super_approve_payment_request(
    request_id: str,
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
):
    """Super Admin approves manual payment, extends subscription, and records invoice/payment."""
    req = session.get(ApprovalRequest, request_id)
    if not req or req.request_type != "subscription_payment":
        raise HTTPException(status_code=404, detail="Payment request not found")
    if req.status != "pending":
        raise HTTPException(status_code=409, detail=f"Request is already {req.status}")

    detail = {}
    if req.detail_json:
        try:
            detail = json.loads(req.detail_json)
        except Exception:
            pass

    plan_code = detail.get("plan_code")
    months = int(detail.get("months", 1))
    days = 365 if months >= 12 else (months * 30)
    amount = float(detail.get("amount", 0))
    method = detail.get("method", "manual")
    trx_id = detail.get("trx_id", "")

    extend_subscription(
        session,
        req.company_id,
        days=days,
        note=f"Approved manual payment: {trx_id}",
        plan_code=plan_code,
        amount=amount,
        payment_method=method,
    )

    req.status = "approved"
    req.resolved_by = auth.user_id
    req.resolved_at = datetime.now(timezone.utc)
    session.add(req)

    write_audit(
        session,
        auth,
        "subscription_payment_approve",
        "approval_request",
        req.id,
        {"company_id": req.company_id, "amount": amount, "days": days, "trx_id": trx_id},
    )
    session.commit()
    return {"status": "ok", "message": f"Payment approved. Subscription extended by {days} days."}


@admin_router.post("/payment-requests/{request_id}/reject")
def super_reject_payment_request(
    request_id: str,
    body: RejectPaymentRequestBody,
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
):
    """Super Admin rejects manual payment with an optional reason."""
    req = session.get(ApprovalRequest, request_id)
    if not req or req.request_type != "subscription_payment":
        raise HTTPException(status_code=404, detail="Payment request not found")
    if req.status != "pending":
        raise HTTPException(status_code=409, detail=f"Request is already {req.status}")

    req.status = "rejected"
    req.resolved_by = auth.user_id
    req.resolved_at = datetime.now(timezone.utc)
    req.comment = body.reason
    session.add(req)

    write_audit(
        session,
        auth,
        "subscription_payment_reject",
        "approval_request",
        req.id,
        {"company_id": req.company_id, "reason": body.reason},
    )
    session.commit()
    return {"status": "ok", "message": "Payment request rejected."}

