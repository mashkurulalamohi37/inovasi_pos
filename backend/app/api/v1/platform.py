from datetime import datetime, timezone
import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select, func

from app.cache import invalidate_company_config
from app.database import get_session
from app.dependencies import AuthContext, get_current_user, require_platform_admin, write_audit
from app.models.audit import AuditLog
from app.models.config_engine import IndustryPack
from app.models.core import Company, UserAccount
from app.models.saas import ApprovalRequest, SubscriptionPlan, TenantSubscription
from app.schemas.configuration import PackActivationRequestOut, PackActivationResolveIn
from app.services.approval_service import create_approval, list_approvals, list_notifications, mark_notification_read, resolve_approval
from app.services.device_service import approve_device, assign_counter, block_device, heartbeat, list_devices, register_device
from app.services.health_service import run_health_check
from app.services.onboarding_service import get_tenant_detail
from app.services.support_service import end_support_access, list_support_sessions, start_support_access
from app.services import platform_iam_service as iam

router_devices = APIRouter(prefix="/devices", tags=["devices"])
router_approvals = APIRouter(prefix="/approvals", tags=["approvals"])
router_notifications = APIRouter(prefix="/notifications", tags=["notifications"])


class DeviceRegisterBody(BaseModel):
    device_id: str
    device_name: str | None = None
    store_id: str | None = None
    counter_id: str | None = None
    device_type: str = "browser"
    browser_fingerprint: str | None = None


class AssignCounterBody(BaseModel):
    counter_id: str
    store_id: str | None = None


class ApprovalResolveBody(BaseModel):
    comment: str | None = None


class ApprovalCreateBody(BaseModel):
    request_type: str
    entity_type: str
    entity_id: str | None = None
    title: str
    detail: dict | None = None


class SupportAccessStartBody(BaseModel):
    company_id: str
    target_user_id: str | None = None
    reason: str | None = None
    duration_minutes: int = 60


class CreateUserBody(BaseModel):
    company_id: str
    email: str
    password: str
    full_name: str
    role_code: str
    username: str | None = None
    store_id: str | None = None
    is_platform_admin: bool = False


class UpdateUserBody(BaseModel):
    full_name: str | None = None
    password: str | None = None
    role_code: str | None = None
    store_id: str | None = None
    is_active: bool | None = None
    is_platform_admin: bool | None = None


class CreateRoleBody(BaseModel):
    company_id: str
    code: str
    name: str
    grant_all: bool = False
    copy_from_role: str | None = None


class RolePermissionBody(BaseModel):
    company_id: str
    role_code: str
    permission_code: str
    allowed: bool


class GrantAllBody(BaseModel):
    company_id: str
    role_code: str


@router_devices.post("/register")
def device_register(
    body: DeviceRegisterBody,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    result = register_device(session, auth, body.model_dump())
    session.commit()
    return result


@router_devices.get("")
def devices_list(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    return list_devices(session, auth.company_id)


@router_devices.post("/{device_pk}/approve")
def device_approve(
    device_pk: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    result = approve_device(session, auth, device_pk)
    session.commit()
    return result


@router_devices.post("/{device_pk}/block")
def device_block(
    device_pk: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    result = block_device(session, auth, device_pk)
    session.commit()
    return result


@router_devices.post("/{device_pk}/assign-counter")
def device_assign(
    device_pk: str,
    body: AssignCounterBody,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    result = assign_counter(session, auth, device_pk, body.counter_id, body.store_id)
    session.commit()
    return result


@router_devices.post("/heartbeat")
def device_heartbeat(
    body: DeviceRegisterBody,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    result = heartbeat(session, auth, body.device_id)
    session.commit()
    return result


@router_approvals.get("")
def approvals_list(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    status: str | None = None,
):
    return list_approvals(session, auth.company_id, status)


@router_approvals.post("")
def approval_create(
    body: ApprovalCreateBody,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    result = create_approval(session, auth, request_type=body.request_type, entity_type=body.entity_type,
                             entity_id=body.entity_id, title=body.title, detail=body.detail)
    session.commit()
    return result


@router_approvals.post("/{request_id}/approve")
def approval_approve(
    request_id: str,
    body: ApprovalResolveBody,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    result = resolve_approval(session, auth, request_id, "approve", body.comment)
    session.commit()
    return result


@router_approvals.post("/{request_id}/reject")
def approval_reject(
    request_id: str,
    body: ApprovalResolveBody,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    result = resolve_approval(session, auth, request_id, "reject", body.comment)
    session.commit()
    return result


@router_notifications.get("")
def notifications_list(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    unread_only: bool = False,
):
    return list_notifications(session, auth.company_id, auth.user_id, unread_only)


@router_notifications.post("/{notification_id}/read")
def notification_read(
    notification_id: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    result = mark_notification_read(session, auth.company_id, notification_id)
    session.commit()
    return result


@router_notifications.post("/read-all")
def notifications_read_all(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    from app.models.saas import Notification
    stmt = select(Notification).where(Notification.company_id == auth.company_id, Notification.is_read == False)
    rows = session.exec(stmt).all()
    for r in rows:
        r.is_read = True
        session.add(r)
    session.commit()
    return {"status": "ok", "marked_read": len(rows)}


super_router = APIRouter(prefix="/super-admin", tags=["super-admin"])


@super_router.get("/audit-summary")
def audit_summary(
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
):
    rows = session.exec(select(AuditLog.action, func.count(AuditLog.id)).group_by(AuditLog.action)).all()
    return [{"action": a, "count": c} for a, c in rows]


@super_router.get("/system-health")
def super_health(
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
):
    from app.models.core import Company
    demo = session.exec(select(Company).where(Company.code == "PULSE-DEMO")).first()
    health = run_health_check(session, demo.id) if demo else {"summary": {}, "items": []}
    return health


@super_router.get("/tenants/{company_id}")
def super_tenant_detail(
    company_id: str,
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
):
    return get_tenant_detail(session, company_id)


@super_router.get("/support-access")
def super_support_list(
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
):
    return list_support_sessions(session)


@super_router.post("/support-access/start")
def super_support_start(
    body: SupportAccessStartBody,
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
):
    result = start_support_access(
        session,
        auth,
        company_id=body.company_id,
        target_user_id=body.target_user_id,
        reason=body.reason,
        duration_minutes=body.duration_minutes,
    )
    write_audit(session, auth, "support_access_token", "support_impersonation", result["impersonation_id"])
    session.commit()
    return result


@super_router.post("/support-access/{impersonation_id}/end")
def super_support_end(
    impersonation_id: str,
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
):
    result = end_support_access(session, auth, impersonation_id)
    session.commit()
    return result


@super_router.get("/companies")
def super_companies(
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
):
    return iam.list_platform_companies(session)


@super_router.get("/users")
def super_users(
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
    company_id: str | None = None,
):
    return iam.list_users(session, company_id)


@super_router.post("/users")
def super_create_user(
    body: CreateUserBody,
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
):
    result = iam.create_user(
        session,
        company_id=body.company_id,
        email=body.email,
        password=body.password,
        full_name=body.full_name,
        role_code=body.role_code,
        username=body.username,
        store_id=body.store_id,
        is_platform_admin=body.is_platform_admin,
    )
    write_audit(session, auth, "user_create", "user_account", result["id"], {"email": result["email"]})
    session.commit()
    return result


@super_router.patch("/users/{user_id}")
def super_update_user(
    user_id: str,
    body: UpdateUserBody,
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
):
    result = iam.update_user(session, user_id, **body.model_dump(exclude_none=True))
    write_audit(session, auth, "user_update", "user_account", user_id)
    session.commit()
    return result


@super_router.get("/roles")
def super_roles(
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
    company_id: str,
):
    return iam.list_roles(session, company_id)


@super_router.post("/roles")
def super_create_role(
    body: CreateRoleBody,
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
):
    result = iam.create_role(
        session,
        company_id=body.company_id,
        code=body.code,
        name=body.name,
        grant_all=body.grant_all,
        copy_from_role=body.copy_from_role,
    )
    write_audit(session, auth, "role_create", "role", result["id"], {"code": result["code"]})
    session.commit()
    return result


@super_router.get("/permissions")
def super_permissions(
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
):
    return iam.list_permission_catalog(session)


@super_router.get("/role-permissions")
def super_role_permissions(
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
    company_id: str,
    role_code: str | None = None,
):
    return iam.list_role_permissions(session, company_id, role_code)


@super_router.put("/role-permissions")
def super_set_role_permission(
    body: RolePermissionBody,
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
):
    result = iam.set_role_permission(
        session,
        company_id=body.company_id,
        role_code=body.role_code,
        permission_code=body.permission_code,
        allowed=body.allowed,
    )
    write_audit(
        session,
        auth,
        "role_permission_update",
        "role",
        body.role_code,
        {"permission": body.permission_code, "allowed": body.allowed, "company_id": body.company_id},
    )
    session.commit()
    return result


@super_router.post("/roles/grant-all")
def super_grant_all(
    body: GrantAllBody,
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
):
    result = iam.grant_all_permissions(session, company_id=body.company_id, role_code=body.role_code)
    write_audit(session, auth, "role_grant_all", "role", body.role_code, {"company_id": body.company_id})
    session.commit()
    return result


@super_router.get("/pack-requests", response_model=list[PackActivationRequestOut])
def super_list_pack_requests(
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
    status: str | None = None,
):
    stmt = (
        select(ApprovalRequest)
        .where(ApprovalRequest.request_type == "industry_pack_activation")
        .order_by(ApprovalRequest.created_at.desc())
    )
    if status:
        stmt = stmt.where(ApprovalRequest.status == status)

    requests = session.exec(stmt).all()
    out = []
    for r in requests:
        company = session.get(Company, r.company_id)
        user = session.get(UserAccount, r.requested_by)

        detail = {}
        if r.detail_json:
            try:
                detail = json.loads(r.detail_json)
            except Exception:
                detail = {}

        plan_name = None
        sub = session.exec(
            select(TenantSubscription).where(TenantSubscription.company_id == r.company_id)
        ).first()
        if sub:
            plan = session.get(SubscriptionPlan, sub.plan_id)
            if plan:
                plan_name = plan.name

        out.append(
            PackActivationRequestOut(
                id=r.id,
                company_id=r.company_id,
                company_code=company.code if company else None,
                company_name=company.name if company else None,
                industry_code=r.entity_id or "",
                pack_name=detail.get("pack_name") or r.entity_id,
                status=r.status,
                requested_by=r.requested_by,
                requested_by_name=user.full_name if user else (detail.get("requested_by_email") or r.requested_by),
                created_at=r.created_at,
                resolved_at=r.resolved_at,
                resolved_by=r.resolved_by,
                comment=r.comment,
                note=detail.get("note"),
                plan_name=plan_name,
            )
        )
    return out


@super_router.post("/pack-requests/{request_id}/resolve", response_model=PackActivationRequestOut)
def super_resolve_pack_request(
    request_id: str,
    body: PackActivationResolveIn,
    auth: Annotated[AuthContext, Depends(require_platform_admin)],
    session: Annotated[Session, Depends(get_session)],
):
    action = body.action.lower().strip()
    if action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="Action must be 'approve' or 'reject'")

    req = session.get(ApprovalRequest, request_id)
    if not req or req.request_type != "industry_pack_activation":
        raise HTTPException(status_code=404, detail="Activation request not found")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {req.status}")

    company = session.get(Company, req.company_id)
    user = session.get(UserAccount, req.requested_by)
    now = datetime.now(timezone.utc)

    if action == "approve":
        req.status = "approved"
        req.resolved_by = auth.email
        req.resolved_at = now
        req.comment = body.comment
        session.add(req)

        # Enable the industry pack across company, store, and counter scopes
        industry_code = req.entity_id
        pack = session.exec(
            select(IndustryPack).where(
                IndustryPack.company_id == req.company_id,
                IndustryPack.industry_code == industry_code,
            )
        ).first()
        if not pack:
            pack = IndustryPack(
                company_id=req.company_id,
                industry_code=industry_code,
                enabled_company=True,
                enabled_store=True,
                enabled_counter=True,
                updated_by=auth.email,
            )
            session.add(pack)
        else:
            pack.enabled_company = True
            pack.enabled_store = True
            pack.enabled_counter = True
            pack.updated_by = auth.email
            session.add(pack)

        write_audit(
            session,
            auth,
            "pack_activation_approved",
            "industry_pack",
            industry_code,
            {"company_id": req.company_id, "comment": body.comment, "request_id": req.id},
        )
        session.commit()
        session.refresh(req)
        invalidate_company_config(req.company_id)
    else:
        req.status = "rejected"
        req.resolved_by = auth.email
        req.resolved_at = now
        req.comment = body.comment
        session.add(req)
        write_audit(
            session,
            auth,
            "pack_activation_rejected",
            "industry_pack",
            req.entity_id,
            {"company_id": req.company_id, "comment": body.comment, "request_id": req.id},
        )
        session.commit()
        session.refresh(req)

    detail = {}
    if req.detail_json:
        try:
            detail = json.loads(req.detail_json)
        except Exception:
            detail = {}

    return PackActivationRequestOut(
        id=req.id,
        company_id=req.company_id,
        company_code=company.code if company else None,
        company_name=company.name if company else None,
        industry_code=req.entity_id or "",
        pack_name=detail.get("pack_name") or req.entity_id,
        status=req.status,
        requested_by=req.requested_by,
        requested_by_name=user.full_name if user else (detail.get("requested_by_email") or req.requested_by),
        created_at=req.created_at,
        resolved_at=req.resolved_at,
        resolved_by=req.resolved_by,
        comment=req.comment,
        note=detail.get("note"),
    )

