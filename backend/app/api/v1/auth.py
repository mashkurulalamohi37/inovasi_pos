import hashlib
import time
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel import Session, select

from app.config import settings
from app.database import get_session
from app.dependencies import AuthContext, get_current_user, get_optional_user, write_audit
from app.models.core import Company, RefreshToken, Role, Store, UserAccount, UserRole
from app.models.saas import LoginAttempt
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    RefreshRequest,
    TokenResponse,
    UserOut,
)
from app.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    validate_password_strength,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])

MAX_LOGIN_ATTEMPTS = settings.login_max_attempts
LOCKOUT_MINUTES = settings.login_lockout_minutes


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _normalize_company_code(code: str) -> str:
    return code.strip().upper().replace(" ", "-")


def _client_ip(request: Request) -> str | None:
    # Resolved via app.net so X-Forwarded-For is only honoured when the peer is
    # a configured reverse proxy — otherwise any caller could forge the address
    # recorded in AuditLog and choose its own lockout bucket.
    from app.net import client_ip

    return client_ip(request)


def _attempt_key(ip_address: str | None) -> str:
    """Bucket identity for failed logins. Never NULL, so lookups stay simple."""
    return (ip_address or "unknown")[:64]


def _check_login_lock(session: Session, email: str, ip_address: str | None) -> None:
    """Block brute force without letting one attacker lock out a real user.

    Counters are scoped to (email, source IP): flooding failures from a single
    address only locks that address out, so a cashier at the till is unaffected.
    A much higher all-IP ceiling still catches distributed password spraying,
    which needs many distinct source addresses to reach.
    """
    now = datetime.now(timezone.utc)
    rows = session.exec(select(LoginAttempt).where(LoginAttempt.email == email)).all()
    key = _attempt_key(ip_address)

    for row in rows:
        if row.ip_address == key:
            locked_until = _as_utc(row.locked_until)
            if locked_until and locked_until > now:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Account temporarily locked"
                )

    window_start = now - timedelta(minutes=LOCKOUT_MINUTES)
    recent_total = sum(
        row.failed_count for row in rows if (_as_utc(row.last_attempt_at) or now) > window_start
    )
    if recent_total >= settings.login_global_max_attempts:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Account temporarily locked"
        )


def _record_login_failure(session: Session, email: str, ip_address: str | None) -> None:
    now = datetime.now(timezone.utc)
    key = _attempt_key(ip_address)
    attempt = session.exec(
        select(LoginAttempt).where(LoginAttempt.email == email, LoginAttempt.ip_address == key)
    ).first()
    if not attempt:
        attempt = LoginAttempt(email=email, failed_count=1, ip_address=key, last_attempt_at=now)
    else:
        # Failures older than one lockout window no longer count, so a stale
        # counter can't re-lock an account on its very next mistyped password.
        last_attempt = _as_utc(attempt.last_attempt_at) or now
        if last_attempt < now - timedelta(minutes=LOCKOUT_MINUTES):
            attempt.failed_count = 1
            attempt.locked_until = None
        else:
            attempt.failed_count += 1
        attempt.last_attempt_at = now
        if attempt.failed_count >= MAX_LOGIN_ATTEMPTS:
            attempt.locked_until = now + timedelta(minutes=LOCKOUT_MINUTES)
    session.add(attempt)


def _clear_login_attempts(session: Session, email: str) -> None:
    # A correct password proves identity, so reset every source's counter.
    for attempt in session.exec(select(LoginAttempt).where(LoginAttempt.email == email)).all():
        attempt.failed_count = 0
        attempt.locked_until = None
        session.add(attempt)


# Cache recently rotated tokens for a short grace window (60s) to gracefully absorb
# concurrent queries and browser race conditions without spuriously revoking sessions.
_ROTATION_GRACE_CACHE: dict[str, tuple[TokenResponse, float]] = {}
_GRACE_WINDOW_SECONDS = 60.0


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _refresh_expires_at() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)


def _revoke_user_refresh_tokens(session: Session, user_id: str) -> None:
    tokens = session.exec(
        select(RefreshToken).where(RefreshToken.user_id == user_id, RefreshToken.revoked == False)  # noqa: E712
    ).all()
    for rt in tokens:
        rt.revoked = True
        session.add(rt)
    _ROTATION_GRACE_CACHE.clear()


def _build_tokens(session: Session, user: UserAccount, role: Role, store_id: Optional[str]) -> TokenResponse:
    refresh = create_refresh_token({"sub": user.id, "company_id": user.company_id})
    # The RefreshToken row *is* the session record. Stamping its id into the
    # access token as "sid" makes access tokens revocable: logout (and password
    # change) revoke the row, and get_current_user rejects any token pointing at
    # it. Without this, a logged-out access token stayed usable until it expired.
    session_row = RefreshToken(
        user_id=user.id,
        token_hash=_token_hash(refresh),
        expires_at=_refresh_expires_at(),
        revoked=False,
    )
    session.add(session_row)
    payload = {
        "sub": user.id,
        "company_id": user.company_id,
        "store_id": store_id or user.store_id,
        "role_id": role.id,
        "role_code": role.code,
        "sid": session_row.id,
    }
    access = create_access_token(payload)
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/login", response_model=TokenResponse)
def login(
    body: LoginRequest,
    request: Request,
    session: Annotated[Session, Depends(get_session)],
):
    ip = _client_ip(request)
    identifier = body.email.strip()
    lock_key = identifier.lower()
    _check_login_lock(session, lock_key, ip)
    company_code = _normalize_company_code(body.company_code)
    company = session.exec(select(Company).where(Company.code == company_code)).first()
    if not company:
        _record_login_failure(session, lock_key, ip)
        session.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    # Accept email or username (case-insensitive for both)
    from sqlalchemy import func

    user = session.exec(
        select(UserAccount).where(
            func.lower(UserAccount.email) == identifier.lower(),
            UserAccount.company_id == company.id,
        )
    ).first()
    if not user:
        user = session.exec(
            select(UserAccount).where(
                func.lower(UserAccount.username) == identifier.lower(),
                UserAccount.company_id == company.id,
            )
        ).first()
    if not user or not verify_password(body.password, user.password_hash):
        _record_login_failure(session, lock_key, ip)
        session.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    if company.is_suspended and not user.is_platform_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant suspended")

    approval = getattr(company, "approval_status", None) or "approved"
    if approval == "pending" and not user.is_platform_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Workspace signup is pending platform approval. You will be able to sign in after approval.",
        )
    if approval == "rejected" and not user.is_platform_admin:
        reason = getattr(company, "rejection_reason", None) or "Signup was rejected"
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=reason)

    if not company.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Workspace inactive")

    ur = session.exec(select(UserRole).where(UserRole.user_id == user.id)).first()
    role = session.get(Role, ur.role_id) if ur else None
    if not role:
        # Fallback 1: match role by user.role field on UserAccount
        if user.role:
            role = session.exec(
                select(Role).where(
                    Role.company_id == user.company_id,
                    func.lower(Role.code) == user.role.lower(),
                )
            ).first()
        # Fallback 2: fallback to any Admin role for tenant company
        if not role:
            role = session.exec(
                select(Role).where(
                    Role.company_id == user.company_id,
                    (func.lower(Role.code) == "admin") | (func.lower(Role.code) == "super admin"),
                )
            ).first()
        # Auto-heal missing UserRole link in DB
        if role and not ur:
            session.add(UserRole(user_id=user.id, role_id=role.id))
            session.flush()

    if not role:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No role assigned")

    store_id = user.store_id
    if body.store_code:
        store = session.exec(
            select(Store).where(Store.company_id == user.company_id, Store.code == body.store_code)
        ).first()
        if store:
            store_id = store.id

    user.last_login_at = datetime.now(timezone.utc)
    session.add(user)
    _clear_login_attempts(session, lock_key)
    from app.models.audit import AuditLog

    session.add(
        AuditLog(
            company_id=user.company_id,
            user_id=user.id,
            store_id=store_id,
            action="login",
            entity_type="user",
            entity_id=user.id,
            ip_address=ip,
        )
    )
    tokens = _build_tokens(session, user, role, store_id)
    session.commit()
    return tokens


@router.post("/refresh", response_model=TokenResponse)
def refresh(body: RefreshRequest, session: Annotated[Session, Depends(get_session)]):
    req_hash = _token_hash(body.refresh_token)
    now_ts = time.time()

    # 1. Grace window for concurrent or retried refresh calls
    cached = _ROTATION_GRACE_CACHE.get(req_hash)
    if cached:
        cached_tokens, cached_ts = cached
        if now_ts - cached_ts < _GRACE_WINDOW_SECONDS:
            return cached_tokens
        _ROTATION_GRACE_CACHE.pop(req_hash, None)

    try:
        payload = decode_token(body.refresh_token)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token") from exc
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    rt = session.exec(
        select(RefreshToken).where(
            RefreshToken.token_hash == req_hash,
            RefreshToken.revoked == False,  # noqa: E712
        )
    ).first()
    if not rt:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token revoked")

    expires_at = _as_utc(rt.expires_at)
    if expires_at and expires_at < datetime.now(timezone.utc):
        rt.revoked = True
        session.add(rt)
        session.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")

    user = session.get(UserAccount, payload["sub"])
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    ur = session.exec(select(UserRole).where(UserRole.user_id == user.id)).first()
    role = session.get(Role, ur.role_id) if ur else None
    if not role:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No role")

    new_refresh = create_refresh_token({"sub": user.id, "company_id": user.company_id})
    new_hash = _token_hash(new_refresh)

    # Maintain existing session row and update token hash so in-flight requests with 'sid' aren't killed
    rt.token_hash = new_hash
    rt.expires_at = _refresh_expires_at()
    rt.revoked = False
    session.add(rt)

    access_payload = {
        "sub": user.id,
        "company_id": user.company_id,
        "store_id": user.store_id,
        "role_id": role.id,
        "role_code": role.code,
        "sid": rt.id,
    }
    new_access = create_access_token(access_payload)
    tokens = TokenResponse(access_token=new_access, refresh_token=new_refresh)

    _ROTATION_GRACE_CACHE[req_hash] = (tokens, now_ts)
    # Prune stale entries
    stale_keys = [k for k, (_, ts) in _ROTATION_GRACE_CACHE.items() if now_ts - ts > _GRACE_WINDOW_SECONDS * 2]
    for k in stale_keys:
        _ROTATION_GRACE_CACHE.pop(k, None)

    session.commit()
    return tokens


@router.post("/logout")
def logout(
    body: RefreshRequest,
    session: Annotated[Session, Depends(get_session)],
    auth: Annotated[AuthContext | None, Depends(get_optional_user)] = None,
):
    token_hash = _token_hash(body.refresh_token)
    _ROTATION_GRACE_CACHE.pop(token_hash, None)
    rt = session.exec(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    ).first()
    if rt:
        rt.revoked = True
        session.add(rt)
    if auth:
        write_audit(session, auth, "logout", "user", auth.user_id)
    session.commit()
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(auth: Annotated[AuthContext, Depends(get_current_user)], session: Annotated[Session, Depends(get_session)]):
    user = session.get(UserAccount, auth.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    company = session.get(Company, user.company_id)
    store = session.get(Store, auth.store_id) if auth.store_id else None
    return UserOut(
        id=user.id,
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        company_id=user.company_id,
        company_code=company.code if company else None,
        company_name=company.name if company else None,
        store_id=auth.store_id,
        store_code=store.code if store else None,
        store_name=store.name if store else None,
        role_code=auth.role_code,
        role_id=auth.role_id,
        permissions=sorted(auth.permissions),
        # Strictly the real SaaS platform operator — never broadened by role name.
        # Frontend uses this to gate the SaaS control center / cross-pack menu bypass,
        # so a tenant's own Admin/Super Admin must not be reported as a platform admin here.
        is_platform_admin=bool(auth.is_platform_operator),
        support_mode=auth.support_mode,
        impersonation_id=auth.impersonation_id,
        must_change_password=bool(getattr(user, "must_change_password", False)),
    )


@router.post("/change-password")
def change_password(
    body: ChangePasswordRequest,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    user = session.get(UserAccount, auth.user_id)
    if not user or not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password incorrect")
    try:
        validate_password_strength(body.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    user.password_hash = hash_password(body.new_password)
    user.must_change_password = False
    session.add(user)
    _revoke_user_refresh_tokens(session, user.id)
    write_audit(session, auth, "change_password", "user", user.id)
    session.commit()
    return {"ok": True}
