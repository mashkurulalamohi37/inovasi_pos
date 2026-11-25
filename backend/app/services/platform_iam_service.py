"""Platform super-admin IAM: users, roles, and permissions across tenants."""

from __future__ import annotations

from fastapi import HTTPException
from sqlmodel import Session, select

from app.models.core import Company, Permission, Role, RolePermission, Store, UserAccount, UserRole
from app.rbac import DEFAULT_ROLE_PERMISSIONS, PERMISSIONS
from app.security import hash_password


def ensure_permission_catalog(session: Session) -> dict[str, str]:
    """Ensure global permission rows exist; return code → id map."""
    perm_map: dict[str, str] = {}
    for code, name, module in PERMISSIONS:
        row = session.exec(select(Permission).where(Permission.code == code)).first()
        if not row:
            row = Permission(code=code, name=name, module=module)
            session.add(row)
            session.flush()
        else:
            row.name = name
            row.module = module
            session.add(row)
        perm_map[code] = row.id
    return perm_map


def ensure_platform_super_admin(
    session: Session,
    *,
    email: str = "super@pulse.pos",
    password: str = "super123",
    full_name: str = "Platform Super Admin",
    reset_password: bool = False,
) -> UserAccount:
    """Idempotently create/update the platform Super Admin account."""
    platform = session.exec(select(Company).where(Company.code == "PULSE-PLATFORM")).first()
    if not platform:
        platform = Company(code="PULSE-PLATFORM", name="Pulse Platform", legal_name="Pulse SaaS Operator")
        session.add(platform)
        session.flush()

    store = session.exec(select(Store).where(Store.company_id == platform.id)).first()
    if not store:
        store = Store(company_id=platform.id, code="HQ", name="Platform HQ")
        session.add(store)
        session.flush()

    role = session.exec(
        select(Role).where(Role.company_id == platform.id, Role.code == "Super Admin")
    ).first()
    if not role:
        role = Role(company_id=platform.id, code="Super Admin", name="Super Admin", is_system=True)
        session.add(role)
        session.flush()

    perm_map = ensure_permission_catalog(session)
    for perm_code in DEFAULT_ROLE_PERMISSIONS.get("Super Admin", {p[0] for p in PERMISSIONS}):
        pid = perm_map.get(perm_code)
        if not pid:
            continue
        existing = session.exec(
            select(RolePermission).where(
                RolePermission.role_id == role.id, RolePermission.permission_id == pid
            )
        ).first()
        if existing:
            existing.allowed = True
            session.add(existing)
        else:
            session.add(RolePermission(role_id=role.id, permission_id=pid, allowed=True))

    user = session.exec(select(UserAccount).where(UserAccount.email == email)).first()
    if user:
        if reset_password:
            user.password_hash = hash_password(password)
        user.is_platform_admin = True
        user.is_active = True
        user.company_id = platform.id
        user.store_id = store.id
        user.full_name = full_name
        session.add(user)
    else:
        user = UserAccount(
            company_id=platform.id,
            store_id=store.id,
            email=email,
            username=email.split("@")[0],
            full_name=full_name,
            password_hash=hash_password(password),
            is_platform_admin=True,
        )
        session.add(user)
        session.flush()

    ur = session.exec(select(UserRole).where(UserRole.user_id == user.id)).first()
    if ur:
        ur.role_id = role.id
        session.add(ur)
    else:
        session.add(UserRole(user_id=user.id, role_id=role.id))

    session.flush()
    return user


def _company_or_404(session: Session, company_id: str) -> Company:
    company = session.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


def _serialize_user(session: Session, user: UserAccount) -> dict:
    company = session.get(Company, user.company_id)
    ur = session.exec(select(UserRole).where(UserRole.user_id == user.id)).first()
    role = session.get(Role, ur.role_id) if ur else None
    store = session.get(Store, user.store_id) if user.store_id else None
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "full_name": user.full_name,
        "company_id": user.company_id,
        "company_code": company.code if company else None,
        "company_name": company.name if company else None,
        "store_id": user.store_id,
        "store_code": store.code if store else None,
        "role_code": role.code if role else None,
        "role_id": role.id if role else None,
        "is_active": user.is_active,
        "is_platform_admin": user.is_platform_admin,
    }


def list_platform_companies(session: Session) -> list[dict]:
    rows = session.exec(select(Company).order_by(Company.code)).all()
    return [
        {
            "id": c.id,
            "code": c.code,
            "name": c.name,
            "is_active": c.is_active,
            "is_suspended": c.is_suspended,
            "is_platform": c.code == "PULSE-PLATFORM",
        }
        for c in rows
    ]


def list_users(session: Session, company_id: str | None = None) -> list[dict]:
    q = select(UserAccount)
    if company_id:
        q = q.where(UserAccount.company_id == company_id)
    users = session.exec(q.order_by(UserAccount.email)).all()
    return [_serialize_user(session, u) for u in users]


def create_user(
    session: Session,
    *,
    company_id: str,
    email: str,
    password: str,
    full_name: str,
    role_code: str,
    username: str | None = None,
    store_id: str | None = None,
    is_platform_admin: bool = False,
) -> dict:
    company = _company_or_404(session, company_id)
    email_norm = email.strip().lower()
    if session.exec(select(UserAccount).where(UserAccount.email == email_norm)).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    role = session.exec(
        select(Role).where(Role.company_id == company_id, Role.code == role_code)
    ).first()
    if not role:
        raise HTTPException(status_code=404, detail=f"Role '{role_code}' not found for this company")

    store = None
    if store_id:
        store = session.get(Store, store_id)
        if not store or store.company_id != company_id:
            raise HTTPException(status_code=400, detail="Invalid store for company")
    else:
        store = session.exec(select(Store).where(Store.company_id == company_id)).first()

    if is_platform_admin and company.code != "PULSE-PLATFORM":
        raise HTTPException(status_code=400, detail="Platform admin flag only allowed on PULSE-PLATFORM")

    user = UserAccount(
        company_id=company_id,
        store_id=store.id if store else None,
        email=email_norm,
        username=(username or email_norm.split("@")[0]).strip(),
        full_name=full_name.strip(),
        password_hash=hash_password(password),
        is_platform_admin=is_platform_admin,
        is_active=True,
    )
    session.add(user)
    session.flush()
    session.add(UserRole(user_id=user.id, role_id=role.id))
    session.flush()
    return _serialize_user(session, user)


def update_user(
    session: Session,
    user_id: str,
    *,
    full_name: str | None = None,
    password: str | None = None,
    role_code: str | None = None,
    store_id: str | None = None,
    is_active: bool | None = None,
    is_platform_admin: bool | None = None,
) -> dict:
    user = session.get(UserAccount, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    company = session.get(Company, user.company_id)

    if full_name is not None:
        user.full_name = full_name.strip()
    if password:
        user.password_hash = hash_password(password)
    if is_active is not None:
        user.is_active = is_active
    if store_id is not None:
        if store_id == "":
            user.store_id = None
        else:
            store = session.get(Store, store_id)
            if not store or store.company_id != user.company_id:
                raise HTTPException(status_code=400, detail="Invalid store for company")
            user.store_id = store_id
    if is_platform_admin is not None:
        if is_platform_admin and (not company or company.code != "PULSE-PLATFORM"):
            raise HTTPException(status_code=400, detail="Platform admin flag only allowed on PULSE-PLATFORM")
        user.is_platform_admin = is_platform_admin
    if role_code is not None:
        role = session.exec(
            select(Role).where(Role.company_id == user.company_id, Role.code == role_code)
        ).first()
        if not role:
            raise HTTPException(status_code=404, detail=f"Role '{role_code}' not found")
        ur = session.exec(select(UserRole).where(UserRole.user_id == user.id)).first()
        if ur:
            ur.role_id = role.id
            session.add(ur)
        else:
            session.add(UserRole(user_id=user.id, role_id=role.id))

    session.add(user)
    session.flush()
    return _serialize_user(session, user)


def list_roles(session: Session, company_id: str) -> list[dict]:
    _company_or_404(session, company_id)
    roles = session.exec(select(Role).where(Role.company_id == company_id).order_by(Role.code)).all()
    out = []
    for role in roles:
        count = len(session.exec(select(UserRole).where(UserRole.role_id == role.id)).all())
        out.append(
            {
                "id": role.id,
                "company_id": role.company_id,
                "code": role.code,
                "name": role.name,
                "is_system": role.is_system,
                "user_count": count,
            }
        )
    return out


def create_role(
    session: Session,
    *,
    company_id: str,
    code: str,
    name: str,
    grant_all: bool = False,
    copy_from_role: str | None = None,
) -> dict:
    _company_or_404(session, company_id)
    code_norm = code.strip()
    if not code_norm:
        raise HTTPException(status_code=400, detail="Role code is required")
    existing = session.exec(
        select(Role).where(Role.company_id == company_id, Role.code == code_norm)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Role code already exists for this company")

    role = Role(company_id=company_id, code=code_norm, name=name.strip() or code_norm, is_system=False)
    session.add(role)
    session.flush()

    perm_map = ensure_permission_catalog(session)
    if grant_all:
        for pid in perm_map.values():
            session.add(RolePermission(role_id=role.id, permission_id=pid, allowed=True))
    elif copy_from_role:
        source = session.exec(
            select(Role).where(Role.company_id == company_id, Role.code == copy_from_role)
        ).first()
        if not source:
            raise HTTPException(status_code=404, detail=f"Source role '{copy_from_role}' not found")
        for rp in session.exec(select(RolePermission).where(RolePermission.role_id == source.id)).all():
            session.add(RolePermission(role_id=role.id, permission_id=rp.permission_id, allowed=rp.allowed))
    elif code_norm in DEFAULT_ROLE_PERMISSIONS:
        for perm_code in DEFAULT_ROLE_PERMISSIONS[code_norm]:
            pid = perm_map.get(perm_code)
            if pid:
                session.add(RolePermission(role_id=role.id, permission_id=pid, allowed=True))

    session.flush()
    return {
        "id": role.id,
        "company_id": role.company_id,
        "code": role.code,
        "name": role.name,
        "is_system": role.is_system,
        "user_count": 0,
    }


def list_permission_catalog(session: Session) -> list[dict]:
    ensure_permission_catalog(session)
    rows = session.exec(select(Permission).order_by(Permission.module, Permission.code)).all()
    return [{"id": p.id, "code": p.code, "name": p.name, "module": p.module} for p in rows]


def list_role_permissions(session: Session, company_id: str, role_code: str | None = None) -> list[dict]:
    _company_or_404(session, company_id)
    ensure_permission_catalog(session)
    roles_q = select(Role).where(Role.company_id == company_id)
    if role_code:
        roles_q = roles_q.where(Role.code == role_code)
    roles = session.exec(roles_q).all()
    perms = session.exec(select(Permission).order_by(Permission.code)).all()

    allowed_map: dict[tuple[str, str], bool] = {}
    for role in roles:
        for rp in session.exec(select(RolePermission).where(RolePermission.role_id == role.id)).all():
            perm = session.get(Permission, rp.permission_id)
            if perm:
                allowed_map[(role.code, perm.code)] = rp.allowed

    out: list[dict] = []
    for role in roles:
        for perm in perms:
            out.append(
                {
                    "role_code": role.code,
                    "permission_code": perm.code,
                    "permission_name": perm.name,
                    "module": perm.module,
                    "allowed": allowed_map.get((role.code, perm.code), False),
                }
            )
    return out


def set_role_permission(
    session: Session,
    *,
    company_id: str,
    role_code: str,
    permission_code: str,
    allowed: bool,
) -> dict:
    _company_or_404(session, company_id)
    role = session.exec(
        select(Role).where(Role.company_id == company_id, Role.code == role_code)
    ).first()
    perm = session.exec(select(Permission).where(Permission.code == permission_code)).first()
    if not role or not perm:
        raise HTTPException(status_code=404, detail="Role or permission not found")

    rp = session.exec(
        select(RolePermission).where(
            RolePermission.role_id == role.id, RolePermission.permission_id == perm.id
        )
    ).first()
    if rp:
        rp.allowed = allowed
        session.add(rp)
    else:
        session.add(RolePermission(role_id=role.id, permission_id=perm.id, allowed=allowed))
    session.flush()
    return {"role_code": role_code, "permission_code": permission_code, "allowed": allowed}


def grant_all_permissions(session: Session, *, company_id: str, role_code: str) -> dict:
    _company_or_404(session, company_id)
    role = session.exec(
        select(Role).where(Role.company_id == company_id, Role.code == role_code)
    ).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    perm_map = ensure_permission_catalog(session)
    for pid in perm_map.values():
        rp = session.exec(
            select(RolePermission).where(
                RolePermission.role_id == role.id, RolePermission.permission_id == pid
            )
        ).first()
        if rp:
            rp.allowed = True
            session.add(rp)
        else:
            session.add(RolePermission(role_id=role.id, permission_id=pid, allowed=True))
    session.flush()
    return {"role_code": role_code, "granted": len(perm_map)}
