import json
from dataclasses import dataclass
from typing import Annotated, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select

from app.database import get_session
from app.models.core import Role, UserAccount, UserRole
from app.security import decode_token
from app.services.permission_service import load_role_permissions

bearer = HTTPBearer(auto_error=False)


@dataclass
class AuthContext:
    user_id: str
    company_id: str
    store_id: Optional[str]
    role_id: str
    role_code: str
    email: str
    permissions: set[str]
    # True for any company-wide elevated role (tenant Admin/Super Admin, or the
    # real platform operator) — grants full permissions *within the caller's own
    # tenant*. NOT sufficient for cross-tenant platform-console access; see
    # is_platform_operator for that.
    is_platform_admin: bool = False
    # True only for the actual SaaS platform operator (UserAccount.is_platform_admin
    # in the DB, restricted to the PULSE-PLATFORM company by platform_iam_service).
    # This — not is_platform_admin — is what gates /super-admin/* routes.
    is_platform_operator: bool = False
    support_mode: bool = False
    impersonation_id: str | None = None
    platform_user_id: str | None = None


def get_db() -> Session:
    return next(get_session())


def get_current_user(
    creds: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer)],
    session: Annotated[Session, Depends(get_session)],
) -> AuthContext:
    if not creds or not creds.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = decode_token(creds.credentials)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc
    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    # Access tokens issued by /auth/login and /auth/refresh carry the id of the
    # session (RefreshToken row) they belong to. Logout and change-password
    # revoke that row, which must invalidate the access token immediately —
    # signature-and-expiry alone let a logged-out token keep working. Tokens
    # without "sid" (support-mode impersonation, or issued before this change)
    # keep the previous behaviour.
    session_id = payload.get("sid")
    if session_id:
        from app.models.core import RefreshToken

        session_row = session.get(RefreshToken, session_id)
        if not session_row or session_row.revoked:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session ended")

    user = session.get(UserAccount, payload.get("sub"))
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User inactive")

    from app.models.core import Company
    company = session.get(Company, user.company_id)
    if company and company.is_suspended and not user.is_platform_admin and not payload.get("support_mode"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant suspended")

    if user.company_id != payload.get("company_id"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company mismatch")

    role_id = payload.get("role_id")
    role = session.get(Role, role_id) if role_id else None
    if not role:
        ur = session.exec(select(UserRole).where(UserRole.user_id == user.id)).first()
        if ur:
            role = session.get(Role, ur.role_id)
    role_code = role.code if role else "Cashier"

    impersonation_id = payload.get("impersonation_id")
    if impersonation_id:
        from app.services.support_service import validate_impersonation

        validate_impersonation(session, impersonation_id, user.id)

    permissions = load_role_permissions(session, role.id) if role else set()
    if user.is_platform_admin or role_code in ("Admin", "Super Admin"):
        from app.rbac import PERMISSIONS
        permissions = {p[0] for p in PERMISSIONS}

    return AuthContext(
        user_id=user.id,
        company_id=user.company_id,
        store_id=payload.get("store_id") or user.store_id,
        role_id=role.id if role else "",
        role_code=role_code,
        email=user.email,
        permissions=permissions,
        # Tenant Admin / Super Admin get full permissions within their own company.
        is_platform_admin=bool(user.is_platform_admin or role_code in ("Admin", "Super Admin")),
        # Real platform operator only — never derived from a tenant role name.
        is_platform_operator=user.is_platform_admin,
        support_mode=bool(payload.get("support_mode")),
        impersonation_id=impersonation_id,
        platform_user_id=payload.get("platform_user_id"),
    )


def get_optional_user(
    creds: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer)],
    session: Annotated[Session, Depends(get_session)],
) -> AuthContext | None:
    if not creds or not creds.credentials:
        return None
    try:
        return get_current_user(creds, session)
    except HTTPException:
        return None


def require_platform_admin(
    auth: Annotated[AuthContext, Depends(get_current_user)],
) -> AuthContext:
    # Cross-tenant SaaS console access requires the real platform-operator flag —
    # a tenant's own Admin/Super Admin role must NOT reach other tenants' data.
    if auth.is_platform_operator:
        return auth
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Platform admin required")


def require_permission(permission: str):
    def _dep(auth: Annotated[AuthContext, Depends(get_current_user)]) -> AuthContext:
        if auth.is_platform_admin or auth.role_code in ("Admin", "Super Admin"):
            return auth
        if permission not in auth.permissions:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Permission required: {permission}")
        return auth

    return _dep


def require_permissions(*permissions: str):
    """Require every listed permission (platform Admin bypasses)."""

    def _dep(auth: Annotated[AuthContext, Depends(get_current_user)]) -> AuthContext:
        if auth.is_platform_admin or auth.role_code in ("Admin", "Super Admin"):
            return auth
        missing = [p for p in permissions if p not in auth.permissions]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission required: {', '.join(missing)}",
            )
        return auth

    return _dep


def tenant_filter(model, auth: AuthContext):
    return model.company_id == auth.company_id


def write_audit(
    session: Session,
    auth: AuthContext,
    action: str,
    entity_type: str,
    entity_id: Optional[str] = None,
    detail: Optional[dict] = None,
) -> None:
    from app.models.audit import AuditLog

    cid = auth.company_id
    if not cid and entity_type in ("company", "tenant", "tenant_subscription") and entity_id:
        cid = entity_id
    if not cid:
        return

    session.add(
        AuditLog(
            company_id=cid,
            user_id=auth.user_id,
            store_id=auth.store_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            detail_json=json.dumps(detail) if detail else None,
        )
    )
