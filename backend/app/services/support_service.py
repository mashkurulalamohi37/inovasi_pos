"""Platform support impersonation with time-limited audited access."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlmodel import Session, select

from app.dependencies import AuthContext
from app.models.audit import AuditLog
from app.models.core import Company, Role, UserAccount, UserRole
from app.models.saas import SupportImpersonation
from app.security import create_access_token


def _expire_stale_sessions(session: Session) -> None:
    now = datetime.now(timezone.utc)
    rows = session.exec(
        select(SupportImpersonation).where(
            SupportImpersonation.is_active == True,  # noqa: E712
        )
    ).all()
    for row in rows:
        expires = row.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires <= now:
            row.is_active = False
            session.add(row)


def list_support_sessions(session: Session, active_only: bool = False) -> list[dict]:
    _expire_stale_sessions(session)
    stmt = select(SupportImpersonation)
    if active_only:
        stmt = stmt.where(SupportImpersonation.is_active == True)  # noqa: E712
    rows = session.exec(stmt.order_by(SupportImpersonation.created_at.desc()).limit(50)).all()  # type: ignore
    result = []
    for row in rows:
        company = session.get(Company, row.target_company_id)
        platform_user = session.get(UserAccount, row.platform_user_id)
        target_user = session.get(UserAccount, row.target_user_id)
        result.append(_session_out(row, company, platform_user, target_user))
    return result


def start_support_access(
    session: Session,
    auth: AuthContext,
    *,
    company_id: str,
    target_user_id: str | None = None,
    reason: str | None = None,
    duration_minutes: int = 60,
) -> dict:
    company = session.get(Company, company_id)
    if not company or company.code == "PULSE-PLATFORM":
        raise HTTPException(status_code=404, detail="Tenant not found")

    _expire_stale_sessions(session)

    target = session.get(UserAccount, target_user_id) if target_user_id else None
    if not target:
        # Prefer Super Admin, then Admin, then any company admin-like role.
        preferred_codes = ("Super Admin", "Admin")
        for code in preferred_codes:
            for role in session.exec(select(Role).where(Role.company_id == company_id, Role.code == code)):
                ur = session.exec(select(UserRole).where(UserRole.role_id == role.id)).first()
                if ur:
                    candidate = session.get(UserAccount, ur.user_id)
                    if candidate and candidate.is_active:
                        target = candidate
                        break
            if target:
                break
        if not target:
            # Fallback: first active user in the tenant
            for user in session.exec(select(UserAccount).where(UserAccount.company_id == company_id)):
                if user.is_active:
                    target = user
                    break

    if not target or target.company_id != company_id:
        raise HTTPException(status_code=404, detail="Target tenant user not found")

    ur = session.exec(select(UserRole).where(UserRole.user_id == target.id)).first()
    role = session.get(Role, ur.role_id) if ur else None
    if not role:
        raise HTTPException(status_code=400, detail="Target user has no role")

    expires_at = datetime.now(timezone.utc) + timedelta(minutes=duration_minutes)
    imp = SupportImpersonation(
        platform_user_id=auth.user_id,
        target_company_id=company_id,
        target_user_id=target.id,
        expires_at=expires_at,
        reason=reason,
        is_active=True,
    )
    session.add(imp)
    session.flush()

    payload = {
        "sub": target.id,
        "company_id": company_id,
        "store_id": target.store_id,
        "role_id": role.id,
        "role_code": role.code,
        "support_mode": True,
        "impersonation_id": imp.id,
        "platform_user_id": auth.user_id,
    }
    access = create_access_token(payload, expires_delta=timedelta(minutes=duration_minutes))

    session.add(
        AuditLog(
            company_id=company_id,
            user_id=auth.user_id,
            action="support_access_start",
            entity_type="support_impersonation",
            entity_id=imp.id,
            detail_json=f'{{"target_user_id":"{target.id}","reason":"{reason or ""}"}}',
        )
    )
    session.flush()

    return {
        "access_token": access,
        "token_type": "bearer",
        "impersonation_id": imp.id,
        "expires_at": expires_at.isoformat(),
        "target_company_id": company_id,
        "target_company_name": company.name,
        "target_user_email": target.email,
        "support_mode": True,
    }


def end_support_access(session: Session, auth: AuthContext, impersonation_id: str) -> dict:
    imp = session.get(SupportImpersonation, impersonation_id)
    if not imp:
        raise HTTPException(status_code=404, detail="Support session not found")
    if not auth.is_platform_admin and auth.user_id != imp.platform_user_id:
        if not (auth.support_mode and auth.impersonation_id == impersonation_id):
            raise HTTPException(status_code=403, detail="Not allowed to end this session")
    imp.is_active = False
    session.add(imp)
    session.add(
        AuditLog(
            company_id=imp.target_company_id,
            user_id=auth.platform_user_id or auth.user_id,
            action="support_access_end",
            entity_type="support_impersonation",
            entity_id=imp.id,
        )
    )
    session.flush()
    return {"id": imp.id, "is_active": False}


def validate_impersonation(session: Session, impersonation_id: str, user_id: str) -> None:
    imp = session.get(SupportImpersonation, impersonation_id)
    if not imp or not imp.is_active:
        raise HTTPException(status_code=403, detail="Support session ended")
    expires = imp.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires <= datetime.now(timezone.utc):
        imp.is_active = False
        session.add(imp)
        session.flush()
        raise HTTPException(status_code=403, detail="Support session expired")
    if imp.target_user_id != user_id:
        raise HTTPException(status_code=403, detail="Invalid support session")


def _session_out(
    row: SupportImpersonation,
    company: Company | None,
    platform_user: UserAccount | None,
    target_user: UserAccount | None,
) -> dict:
    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    return {
        "id": row.id,
        "platform_user_email": platform_user.email if platform_user else None,
        "target_company_id": row.target_company_id,
        "target_company_name": company.name if company else None,
        "target_user_email": target_user.email if target_user else None,
        "reason": row.reason,
        "is_active": row.is_active,
        "expires_at": expires.isoformat(),
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }
