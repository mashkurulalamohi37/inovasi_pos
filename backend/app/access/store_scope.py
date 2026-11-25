"""Store access scope helper (RBAC answers what; this answers where)."""

from __future__ import annotations

from fastapi import HTTPException
from sqlmodel import Session, select

from app.dependencies import AuthContext
from app.models.core import Store
from app.models.mini_hr import MiniHrEmployee, MiniHrEmployeeStoreAssignment


def get_employee_for_user(session: Session, company_id: str, user_id: str) -> MiniHrEmployee | None:
    return session.exec(
        select(MiniHrEmployee).where(
            MiniHrEmployee.company_id == company_id,
            MiniHrEmployee.user_account_id == user_id,
        )
    ).first()


def active_store_ids_for_employee(session: Session, employee_id: str) -> set[str]:
    rows = session.exec(
        select(MiniHrEmployeeStoreAssignment).where(
            MiniHrEmployeeStoreAssignment.employee_id == employee_id,
            MiniHrEmployeeStoreAssignment.is_active == True,  # noqa: E712
        )
    ).all()
    return {r.store_id for r in rows}


def accessible_store_ids(session: Session, auth: AuthContext) -> set[str] | None:
    """Return allowed store IDs, or None when unrestricted (admin / no employee scope)."""
    if auth.is_platform_admin or auth.role_code in {"Admin", "Super Admin"}:
        return None
    emp = get_employee_for_user(session, auth.company_id, auth.user_id)
    if emp:
        if emp.employee_status in {"inactive", "suspended", "resigned"} or not emp.is_active:
            return set()
        allowed = active_store_ids_for_employee(session, emp.id)
        if emp.primary_store_id:
            allowed.add(emp.primary_store_id)
        return allowed
    if auth.store_id is None:
        return None
    return {auth.store_id}


def can_access_store(session: Session, auth: AuthContext, store_id: str | None) -> bool:
    if not store_id:
        return True
    store = session.get(Store, store_id)
    if not store or store.company_id != auth.company_id:
        return False
    allowed = accessible_store_ids(session, auth)
    if allowed is None:
        return True
    return store_id in allowed


def assert_store_access(session: Session, auth: AuthContext, store_id: str | None) -> None:
    if not can_access_store(session, auth, store_id):
        raise HTTPException(status_code=403, detail="Store access denied")
