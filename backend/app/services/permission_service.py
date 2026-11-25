"""Resolve effective permissions for a role from defaults + DB overrides."""

from __future__ import annotations

from sqlmodel import Session, select

from app.models.core import Permission, Role, RolePermission
from app.rbac import DEFAULT_ROLE_PERMISSIONS


def load_role_permissions(session: Session, role_id: str) -> set[str]:
    role = session.get(Role, role_id)
    if not role:
        return set()

    effective = set(DEFAULT_ROLE_PERMISSIONS.get(role.code, set()))
    overrides = session.exec(select(RolePermission).where(RolePermission.role_id == role_id)).all()
    if not overrides:
        return effective

    perm_ids = {rp.permission_id for rp in overrides}
    perm_map = {
        p.id: p.code
        for p in session.exec(select(Permission).where(Permission.id.in_(perm_ids))).all()  # type: ignore[attr-defined]
    }

    for rp in overrides:
        code = perm_map.get(rp.permission_id)
        if not code:
            continue
        if rp.allowed:
            effective.add(code)
        else:
            effective.discard(code)

    return effective


def role_has_effective_permission(session: Session, role_id: str, role_code: str, permission_code: str) -> bool:
    perms = load_role_permissions(session, role_id) if role_id else DEFAULT_ROLE_PERMISSIONS.get(role_code, set())
    return permission_code in perms
