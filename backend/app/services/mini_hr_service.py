"""Mini HR service — employee master + UserAccount linkage (reuses auth/RBAC)."""

from __future__ import annotations

import re
import secrets
import string
from datetime import date, datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlmodel import Session, select

from app.dependencies import AuthContext, write_audit
from app.models.audit import AuditLog
from app.models.core import Role, Store, UserAccount, UserRole
from app.models.mini_hr import (
    MiniHrAttendance,
    MiniHrDepartment,
    MiniHrDesignation,
    MiniHrEmployee,
    MiniHrEmployeeStoreAssignment,
    MiniHrLeaveRequest,
    MiniHrShiftRoster,
)
from app.security import hash_password, validate_password_strength

_WEAK_PASSWORDS = frozenset({"123456", "password", "employee123", "admin123", "changeme"})
_USERNAME_RE = re.compile(r"^[a-z0-9._-]{3,64}$")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _emp_out(e: MiniHrEmployee) -> dict[str, Any]:
    return {
        "id": e.id,
        "company_id": e.company_id,
        "employee_code": e.employee_code,
        "first_name": e.first_name,
        "last_name": e.last_name,
        "full_name": e.full_name,
        "display_name": e.display_name,
        "mobile": e.mobile,
        "email": e.email,
        "joining_date": e.joining_date.isoformat() if e.joining_date else None,
        "department_id": e.department_id,
        "designation_id": e.designation_id,
        "reporting_manager_employee_id": e.reporting_manager_employee_id,
        "primary_store_id": e.primary_store_id,
        "employment_type": e.employment_type,
        "employee_status": e.employee_status,
        "user_account_id": e.user_account_id,
        "has_login": bool(e.user_account_id),
        "is_active": e.is_active,
        "notes": e.notes,
        "external_employee_id": e.external_employee_id,
        "external_source": e.external_source,
        "photo_url": e.photo_url,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


def _require_company_store(session: Session, company_id: str, store_id: str) -> Store:
    store = session.get(Store, store_id)
    if not store or store.company_id != company_id:
        raise HTTPException(status_code=404, detail="Store not found")
    return store


def _get_employee(session: Session, auth: AuthContext, employee_id: str) -> MiniHrEmployee:
    emp = session.get(MiniHrEmployee, employee_id)
    if not emp or emp.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Employee not found")
    return emp


def dashboard(session: Session, auth: AuthContext) -> dict[str, Any]:
    today = date.today()
    
    # 1. Basic counts
    emps = session.exec(
        select(MiniHrEmployee).where(MiniHrEmployee.company_id == auth.company_id)
    ).all()
    depts = session.exec(
        select(MiniHrDepartment).where(MiniHrDepartment.company_id == auth.company_id)
    ).all()
    desigs = session.exec(
        select(MiniHrDesignation).where(MiniHrDesignation.company_id == auth.company_id)
    ).all()
    stores = session.exec(
        select(Store).where(Store.company_id == auth.company_id)
    ).all()

    dept_map = {d.id: d.department_name for d in depts}
    desig_map = {d.id: d.designation_name for d in desigs}
    store_map = {s.id: s.name for s in stores}

    by_status: dict[str, int] = {}
    with_login = 0
    dept_counts: dict[str, int] = {}
    desig_counts: dict[str, int] = {}
    store_counts: dict[str, int] = {}

    for e in emps:
        by_status[e.employee_status] = by_status.get(e.employee_status, 0) + 1
        if e.user_account_id:
            with_login += 1
        
        # Breakdown by department
        dept_name = dept_map.get(e.department_id) if e.department_id else "Unassigned"
        dept_counts[dept_name] = dept_counts.get(dept_name, 0) + 1

        # Breakdown by designation
        desig_name = desig_map.get(e.designation_id) if e.designation_id else "Unassigned"
        desig_counts[desig_name] = desig_counts.get(desig_name, 0) + 1

        # Breakdown by primary store
        store_name = store_map.get(e.primary_store_id) if e.primary_store_id else "Unassigned"
        store_counts[store_name] = store_counts.get(store_name, 0) + 1

    # 2. Today's attendance stats
    attendance_today = session.exec(
        select(MiniHrAttendance)
        .where(
            MiniHrAttendance.company_id == auth.company_id,
            MiniHrAttendance.attendance_date == today
        )
    ).all()

    att_present = 0
    att_late = 0
    att_active = 0
    for a in attendance_today:
        att_present += 1
        if a.status == "late":
            att_late += 1
        if not a.clock_out:
            att_active += 1

    # 3. Leave stats
    leaves_pending = session.exec(
        select(MiniHrLeaveRequest)
        .where(
            MiniHrLeaveRequest.company_id == auth.company_id,
            MiniHrLeaveRequest.status == "pending"
        )
    ).all()

    leaves_today = session.exec(
        select(MiniHrLeaveRequest)
        .where(
            MiniHrLeaveRequest.company_id == auth.company_id,
            MiniHrLeaveRequest.status == "approved",
            MiniHrLeaveRequest.start_date <= today,
            MiniHrLeaveRequest.end_date >= today
        )
    ).all()

    # Get employee details for who is on leave today
    emp_ids_on_leave = {l.employee_id for l in leaves_today}
    emps_on_leave_rows = session.exec(
        select(MiniHrEmployee)
        .where(MiniHrEmployee.id.in_(emp_ids_on_leave))
    ).all() if emp_ids_on_leave else []
    emp_on_leave_map = {e.id: e.full_name or e.first_name for e in emps_on_leave_rows}

    on_leave_today_list = [
        {
            "id": l.id,
            "employee_name": emp_on_leave_map.get(l.employee_id, "Unknown"),
            "leave_type": l.leave_type,
            "end_date": l.end_date.isoformat(),
        }
        for l in leaves_today
    ]

    stores_with = session.exec(
        select(MiniHrEmployeeStoreAssignment.store_id)
        .where(
            MiniHrEmployeeStoreAssignment.company_id == auth.company_id,
            MiniHrEmployeeStoreAssignment.is_active == True,  # noqa: E712
        )
        .distinct()
    ).all()

    return {
        "total_employees": len(emps),
        "active_employees": by_status.get("active", 0),
        "inactive_employees": by_status.get("inactive", 0),
        "suspended_employees": by_status.get("suspended", 0),
        "employees_with_login": with_login,
        "employees_without_login": len(emps) - with_login,
        "total_departments": len(depts),
        "stores_with_employees": len(stores_with),
        "by_status": by_status,
        
        # New analytics fields
        "dept_distribution": [{"name": k, "count": v} for k, v in dept_counts.items()],
        "desig_distribution": [{"name": k, "count": v} for k, v in desig_counts.items()],
        "store_distribution": [{"name": k, "count": v} for k, v in store_counts.items()],
        "attendance_today": {
            "total_present": att_present,
            "late": att_late,
            "active_shifts": att_active,
        },
        "leaves": {
            "pending_count": len(leaves_pending),
            "on_leave_today_count": len(leaves_today),
            "on_leave_today_list": on_leave_today_list,
        }
    }


def list_departments(session: Session, auth: AuthContext) -> list[dict]:
    rows = session.exec(
        select(MiniHrDepartment).where(MiniHrDepartment.company_id == auth.company_id)
    ).all()
    return [
        {
            "id": d.id,
            "department_code": d.department_code,
            "department_name": d.department_name,
            "description": d.description,
            "is_active": d.is_active,
        }
        for d in rows
    ]


def create_department(session: Session, auth: AuthContext, body: dict) -> dict:
    code = body["department_code"].strip().upper()
    existing = session.exec(
        select(MiniHrDepartment).where(
            MiniHrDepartment.company_id == auth.company_id,
            MiniHrDepartment.department_code == code,
        )
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Department code already exists")
    d = MiniHrDepartment(
        company_id=auth.company_id,
        department_code=code,
        department_name=body["department_name"].strip(),
        description=body.get("description"),
        is_active=body.get("is_active", True),
    )
    session.add(d)
    write_audit(session, auth, "hr.department_create", "mini_hr_department", d.id, {"code": code})
    session.commit()
    session.refresh(d)
    return {"id": d.id, "department_code": d.department_code, "department_name": d.department_name, "is_active": d.is_active}


def patch_department(session: Session, auth: AuthContext, dept_id: str, body: dict) -> dict:
    d = session.get(MiniHrDepartment, dept_id)
    if not d or d.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Department not found")
    for k in ("department_name", "description", "is_active"):
        if k in body and body[k] is not None:
            setattr(d, k, body[k])
    d.updated_at = _now()
    session.add(d)
    write_audit(session, auth, "hr.department_update", "mini_hr_department", d.id, body)
    session.commit()
    session.refresh(d)
    return {"id": d.id, "department_code": d.department_code, "department_name": d.department_name, "is_active": d.is_active}


def list_designations(session: Session, auth: AuthContext) -> list[dict]:
    rows = session.exec(
        select(MiniHrDesignation).where(MiniHrDesignation.company_id == auth.company_id)
    ).all()
    return [
        {
            "id": d.id,
            "designation_code": d.designation_code,
            "designation_name": d.designation_name,
            "description": d.description,
            "level": d.level,
            "is_active": d.is_active,
        }
        for d in rows
    ]


def create_designation(session: Session, auth: AuthContext, body: dict) -> dict:
    code = body["designation_code"].strip().upper()
    existing = session.exec(
        select(MiniHrDesignation).where(
            MiniHrDesignation.company_id == auth.company_id,
            MiniHrDesignation.designation_code == code,
        )
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Designation code already exists")
    d = MiniHrDesignation(
        company_id=auth.company_id,
        designation_code=code,
        designation_name=body["designation_name"].strip(),
        description=body.get("description"),
        level=body.get("level"),
        is_active=body.get("is_active", True),
    )
    session.add(d)
    write_audit(session, auth, "hr.designation_create", "mini_hr_designation", d.id, {"code": code})
    session.commit()
    session.refresh(d)
    return {"id": d.id, "designation_code": d.designation_code, "designation_name": d.designation_name, "is_active": d.is_active}


def patch_designation(session: Session, auth: AuthContext, des_id: str, body: dict) -> dict:
    d = session.get(MiniHrDesignation, des_id)
    if not d or d.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Designation not found")
    for k in ("designation_name", "description", "level", "is_active"):
        if k in body and body[k] is not None:
            setattr(d, k, body[k])
    d.updated_at = _now()
    session.add(d)
    write_audit(session, auth, "hr.designation_update", "mini_hr_designation", d.id, body)
    session.commit()
    session.refresh(d)
    return {"id": d.id, "designation_code": d.designation_code, "designation_name": d.designation_name, "is_active": d.is_active}


def list_employees(session: Session, auth: AuthContext, q: str | None = None, status: str | None = None) -> list[dict]:
    stmt = select(MiniHrEmployee).where(MiniHrEmployee.company_id == auth.company_id)
    if status:
        stmt = stmt.where(MiniHrEmployee.employee_status == status)
    rows = session.exec(stmt).all()
    if q:
        ql = q.lower()
        rows = [e for e in rows if ql in e.full_name.lower() or ql in e.employee_code.lower()]
    return [_emp_out(e) for e in rows]


def get_employee(session: Session, auth: AuthContext, employee_id: str) -> dict:
    return _emp_out(_get_employee(session, auth, employee_id))


def create_employee(session: Session, auth: AuthContext, body: dict) -> dict:
    code = body["employee_code"].strip().upper()
    dup = session.exec(
        select(MiniHrEmployee).where(
            MiniHrEmployee.company_id == auth.company_id,
            MiniHrEmployee.employee_code == code,
        )
    ).first()
    if dup:
        raise HTTPException(status_code=409, detail="Employee code already exists")
    if body.get("department_id"):
        dept = session.get(MiniHrDepartment, body["department_id"])
        if not dept or dept.company_id != auth.company_id:
            raise HTTPException(status_code=404, detail="Department not found")
    if body.get("designation_id"):
        des = session.get(MiniHrDesignation, body["designation_id"])
        if not des or des.company_id != auth.company_id:
            raise HTTPException(status_code=404, detail="Designation not found")
    primary = body.get("primary_store_id")
    if primary:
        _require_company_store(session, auth.company_id, primary)

    first = body["first_name"].strip()
    last = (body.get("last_name") or "").strip() or None
    full = (body.get("full_name") or "").strip() or f"{first} {last or ''}".strip()
    emp = MiniHrEmployee(
        company_id=auth.company_id,
        employee_code=code,
        first_name=first,
        last_name=last,
        full_name=full,
        display_name=body.get("display_name"),
        mobile=body.get("mobile"),
        email=body.get("email"),
        joining_date=body.get("joining_date"),
        department_id=body.get("department_id"),
        designation_id=body.get("designation_id"),
        reporting_manager_employee_id=body.get("reporting_manager_employee_id"),
        primary_store_id=primary,
        employment_type=body.get("employment_type"),
        employee_status=body.get("employee_status") or "active",
        notes=body.get("notes"),
        created_by=auth.user_id,
    )
    session.add(emp)
    session.flush()
    if primary:
        session.add(
            MiniHrEmployeeStoreAssignment(
                company_id=auth.company_id,
                employee_id=emp.id,
                store_id=primary,
                assignment_type="primary",
                is_primary=True,
                is_active=True,
                created_by=auth.user_id,
            )
        )
    write_audit(session, auth, "hr.employee_create", "mini_hr_employee", emp.id, {"code": code})
    session.commit()
    session.refresh(emp)
    return _emp_out(emp)


def patch_employee(session: Session, auth: AuthContext, employee_id: str, body: dict) -> dict:
    emp = _get_employee(session, auth, employee_id)
    if body.get("department_id"):
        dept = session.get(MiniHrDepartment, body["department_id"])
        if not dept or dept.company_id != auth.company_id:
            raise HTTPException(status_code=404, detail="Department not found")
    if body.get("designation_id"):
        des = session.get(MiniHrDesignation, body["designation_id"])
        if not des or des.company_id != auth.company_id:
            raise HTTPException(status_code=404, detail="Designation not found")
    if body.get("primary_store_id"):
        _require_company_store(session, auth.company_id, body["primary_store_id"])
    for k, v in body.items():
        if v is not None and hasattr(emp, k):
            setattr(emp, k, v)
    if body.get("first_name") or body.get("last_name"):
        emp.full_name = body.get("full_name") or f"{emp.first_name} {emp.last_name or ''}".strip()
    # Status coupling to login
    if body.get("employee_status") in {"inactive", "suspended", "resigned"} and emp.user_account_id:
        user = session.get(UserAccount, emp.user_account_id)
        if user and user.company_id == auth.company_id:
            user.is_active = False
            session.add(user)
    if body.get("employee_status") == "active" and body.get("is_active") is not False and emp.user_account_id:
        # do not auto-reactivate login — use activate-access endpoint
        pass
    emp.updated_at = _now()
    session.add(emp)
    write_audit(session, auth, "hr.employee_update", "mini_hr_employee", emp.id, {k: v for k, v in body.items() if k != "notes"})
    session.commit()
    session.refresh(emp)
    return _emp_out(emp)


def list_store_assignments(session: Session, auth: AuthContext, employee_id: str) -> list[dict]:
    emp = _get_employee(session, auth, employee_id)
    rows = session.exec(
        select(MiniHrEmployeeStoreAssignment).where(
            MiniHrEmployeeStoreAssignment.employee_id == emp.id,
            MiniHrEmployeeStoreAssignment.company_id == auth.company_id,
        )
    ).all()
    return [
        {
            "id": r.id,
            "store_id": r.store_id,
            "assignment_type": r.assignment_type,
            "is_primary": r.is_primary,
            "is_active": r.is_active,
            "effective_from": r.effective_from.isoformat() if r.effective_from else None,
            "effective_to": r.effective_to.isoformat() if r.effective_to else None,
        }
        for r in rows
    ]


def assign_store(session: Session, auth: AuthContext, employee_id: str, body: dict) -> dict:
    emp = _get_employee(session, auth, employee_id)
    store = _require_company_store(session, auth.company_id, body["store_id"])
    existing = session.exec(
        select(MiniHrEmployeeStoreAssignment).where(
            MiniHrEmployeeStoreAssignment.employee_id == emp.id,
            MiniHrEmployeeStoreAssignment.store_id == store.id,
            MiniHrEmployeeStoreAssignment.is_active == True,  # noqa: E712
        )
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Store already assigned")
    is_primary = bool(body.get("is_primary"))
    if is_primary:
        for row in session.exec(
            select(MiniHrEmployeeStoreAssignment).where(
                MiniHrEmployeeStoreAssignment.employee_id == emp.id,
                MiniHrEmployeeStoreAssignment.is_primary == True,  # noqa: E712
            )
        ).all():
            row.is_primary = False
            row.assignment_type = "secondary"
            session.add(row)
        emp.primary_store_id = store.id
        session.add(emp)
    asg = MiniHrEmployeeStoreAssignment(
        company_id=auth.company_id,
        employee_id=emp.id,
        store_id=store.id,
        assignment_type=body.get("assignment_type") or ("primary" if is_primary else "secondary"),
        is_primary=is_primary,
        effective_from=body.get("effective_from"),
        effective_to=body.get("effective_to"),
        is_active=True,
        created_by=auth.user_id,
    )
    session.add(asg)
    write_audit(
        session,
        auth,
        "hr.store_assign",
        "mini_hr_employee",
        emp.id,
        {"store_id": store.id, "assignment_id": asg.id},
    )
    session.commit()
    session.refresh(asg)
    return {"id": asg.id, "store_id": asg.store_id, "is_primary": asg.is_primary, "is_active": asg.is_active}


def remove_store_assignment(session: Session, auth: AuthContext, employee_id: str, assignment_id: str) -> dict:
    emp = _get_employee(session, auth, employee_id)
    asg = session.get(MiniHrEmployeeStoreAssignment, assignment_id)
    if not asg or asg.employee_id != emp.id or asg.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Assignment not found")
    asg.is_active = False
    asg.updated_at = _now()
    session.add(asg)
    write_audit(session, auth, "hr.store_unassign", "mini_hr_employee", emp.id, {"assignment_id": assignment_id})
    session.commit()
    return {"id": asg.id, "is_active": False}


def _validate_password(password: str) -> None:
    """Delegate to the centralised security policy validator."""
    try:
        validate_password_strength(password)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _normalize_username(username: str) -> str:
    u = username.strip().lower()
    if not _USERNAME_RE.match(u):
        raise HTTPException(status_code=422, detail="Invalid username (use a-z, 0-9, . _ -)")
    return u


def create_user_account(session: Session, auth: AuthContext, employee_id: str, body: dict) -> dict:
    emp = _get_employee(session, auth, employee_id)
    if emp.user_account_id:
        raise HTTPException(status_code=409, detail="Employee already has a login")
    if emp.employee_status in {"inactive", "resigned"}:
        raise HTTPException(status_code=409, detail="Cannot create login for inactive/resigned employee")

    username = _normalize_username(body["username"])
    password = body["temporary_password"]
    _validate_password(password)

    # Unique username within company
    dup_u = session.exec(
        select(UserAccount).where(
            UserAccount.company_id == auth.company_id,
            UserAccount.username == username,
        )
    ).first()
    if dup_u:
        raise HTTPException(status_code=409, detail="Username already exists")

    email = (body.get("email") or emp.email or f"{username}@{auth.company_id[:8]}.local").strip().lower()
    dup_e = session.exec(
        select(UserAccount).where(
            UserAccount.company_id == auth.company_id,
            UserAccount.email == email,
        )
    ).first()
    if dup_e:
        raise HTTPException(status_code=409, detail="Email already exists for a user account")

    role_code = body.get("role_code") or "Cashier"
    role = session.exec(
        select(Role).where(Role.company_id == auth.company_id, Role.code == role_code)
    ).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found in this company")

    user = UserAccount(
        company_id=auth.company_id,
        store_id=emp.primary_store_id or auth.store_id,
        email=email,
        username=username,
        full_name=emp.full_name,
        password_hash=hash_password(password),
        is_active=True,
        must_change_password=bool(body.get("force_password_change", True)),
    )
    session.add(user)
    session.flush()
    session.add(UserRole(user_id=user.id, role_id=role.id))
    emp.user_account_id = user.id
    session.add(emp)
    write_audit(
        session,
        auth,
        "hr.user_create",
        "mini_hr_employee",
        emp.id,
        {"user_id": user.id, "username": username, "role_code": role_code},
    )
    session.commit()
    # One-time: do not return password; caller already knows the temporary password they set
    return {
        "employee_id": emp.id,
        "user_account_id": user.id,
        "username": username,
        "email": email,
        "role_code": role_code,
        "must_change_password": user.must_change_password,
    }


def reset_password(session: Session, auth: AuthContext, employee_id: str, body: dict) -> dict:
    emp = _get_employee(session, auth, employee_id)
    if not emp.user_account_id:
        raise HTTPException(status_code=409, detail="Employee has no login")
    user = session.get(UserAccount, emp.user_account_id)
    if not user or user.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="User account not found")
    password = body["temporary_password"]
    _validate_password(password)
    user.password_hash = hash_password(password)
    user.must_change_password = bool(body.get("force_password_change", True))
    session.add(user)
    write_audit(session, auth, "hr.password_reset", "mini_hr_employee", emp.id, {"user_id": user.id})
    session.commit()
    return {"employee_id": emp.id, "user_account_id": user.id, "must_change_password": user.must_change_password}


def assign_role(session: Session, auth: AuthContext, employee_id: str, body: dict) -> dict:
    emp = _get_employee(session, auth, employee_id)
    if not emp.user_account_id:
        raise HTTPException(status_code=409, detail="Employee has no login")
    user = session.get(UserAccount, emp.user_account_id)
    if not user or user.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="User account not found")
    role = session.exec(
        select(Role).where(Role.company_id == auth.company_id, Role.code == body["role_code"])
    ).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    # Replace primary role (single UserRole model used by auth today)
    existing = session.exec(select(UserRole).where(UserRole.user_id == user.id)).all()
    for ur in existing:
        session.delete(ur)
    session.add(UserRole(user_id=user.id, role_id=role.id))
    write_audit(
        session,
        auth,
        "hr.role_assign",
        "mini_hr_employee",
        emp.id,
        {"user_id": user.id, "role_code": role.code},
    )
    session.commit()
    return {"employee_id": emp.id, "role_code": role.code}


def suspend_access(session: Session, auth: AuthContext, employee_id: str) -> dict:
    emp = _get_employee(session, auth, employee_id)
    emp.employee_status = "suspended"
    if emp.user_account_id:
        user = session.get(UserAccount, emp.user_account_id)
        if user and user.company_id == auth.company_id:
            user.is_active = False
            session.add(user)
    session.add(emp)
    write_audit(session, auth, "hr.access_suspend", "mini_hr_employee", emp.id, {})
    session.commit()
    return _emp_out(emp)


def activate_access(session: Session, auth: AuthContext, employee_id: str) -> dict:
    emp = _get_employee(session, auth, employee_id)
    emp.employee_status = "active"
    emp.is_active = True
    if emp.user_account_id:
        user = session.get(UserAccount, emp.user_account_id)
        if user and user.company_id == auth.company_id:
            user.is_active = True
            session.add(user)
    session.add(emp)
    write_audit(session, auth, "hr.access_activate", "mini_hr_employee", emp.id, {})
    session.commit()
    return _emp_out(emp)


def user_access_directory(session: Session, auth: AuthContext) -> list[dict]:
    emps = session.exec(
        select(MiniHrEmployee).where(MiniHrEmployee.company_id == auth.company_id)
    ).all()
    out = []
    for e in emps:
        username = None
        role_codes: list[str] = []
        account_status = "no_login"
        last_login = None
        if e.user_account_id:
            user = session.get(UserAccount, e.user_account_id)
            if user:
                username = user.username
                account_status = "active" if user.is_active else "disabled"
                last_login = user.last_login_at.isoformat() if user.last_login_at else None
                for ur in session.exec(select(UserRole).where(UserRole.user_id == user.id)).all():
                    role = session.get(Role, ur.role_id)
                    if role:
                        role_codes.append(role.code)
        stores = list_store_assignments(session, auth, e.id)
        out.append(
            {
                "employee_id": e.id,
                "employee_code": e.employee_code,
                "full_name": e.full_name,
                "username": username,
                "roles": role_codes,
                "stores": [s for s in stores if s["is_active"]],
                "employee_status": e.employee_status,
                "account_status": account_status,
                "last_login_at": last_login,
            }
        )
    return out


def my_profile(session: Session, auth: AuthContext) -> dict:
    emp = session.exec(
        select(MiniHrEmployee).where(
            MiniHrEmployee.company_id == auth.company_id,
            MiniHrEmployee.user_account_id == auth.user_id,
        )
    ).first()
    if not emp and auth.user_id:
        user = session.get(UserAccount, auth.user_id)
        if user and user.email:
            emp = session.exec(
                select(MiniHrEmployee).where(
                    MiniHrEmployee.company_id == auth.company_id,
                    MiniHrEmployee.email == user.email,
                )
            ).first()
            if emp:
                emp.user_account_id = user.id
                session.add(emp)
                session.commit()
                session.refresh(emp)

    if not emp and auth.user_id:
        user = session.get(UserAccount, auth.user_id)
        full_name = (user.full_name if user and user.full_name else "").strip() or (user.username if user and user.username else "User Profile")
        email = (user.email if user and user.email else "").strip() or f"user_{auth.user_id[:8]}@pulse.local"
        name_parts = full_name.split(" ", 1)
        first_name = name_parts[0] or "User"
        last_name = name_parts[1] if len(name_parts) > 1 else ""

        base_code = f"EMP-{(user.username if user and user.username else 'USER').upper()}"
        code = base_code
        idx = 1
        while session.exec(
            select(MiniHrEmployee).where(
                MiniHrEmployee.company_id == auth.company_id,
                MiniHrEmployee.employee_code == code,
            )
        ).first():
            code = f"{base_code}-{idx}"
            idx += 1

        emp = MiniHrEmployee(
            company_id=auth.company_id,
            user_account_id=auth.user_id,
            employee_code=code,
            first_name=first_name,
            last_name=last_name,
            full_name=full_name,
            email=email,
            mobile=None,
            employee_status="active",
            primary_store_id=user.store_id if user and user.store_id else None,
            notes="Auto-linked user account profile",
        )
        session.add(emp)
        session.commit()
        session.refresh(emp)

        if user and user.store_id:
            assignment = session.exec(
                select(MiniHrEmployeeStoreAssignment).where(
                    MiniHrEmployeeStoreAssignment.company_id == auth.company_id,
                    MiniHrEmployeeStoreAssignment.employee_id == emp.id,
                    MiniHrEmployeeStoreAssignment.store_id == user.store_id,
                )
            ).first()
            if not assignment:
                session.add(
                    MiniHrEmployeeStoreAssignment(
                        company_id=auth.company_id,
                        employee_id=emp.id,
                        store_id=user.store_id,
                        assignment_type="primary",
                        is_primary=True,
                        is_active=True,
                        created_by=auth.user_id,
                    )
                )
                session.commit()

    if not emp:
        raise HTTPException(status_code=404, detail="No employee profile linked to this account")

    data = _emp_out(emp)
    data["stores"] = list_store_assignments(session, auth, emp.id)
    return data


def generate_temp_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    while True:
        pwd = "".join(secrets.choice(alphabet) for _ in range(length))
        if pwd.lower() not in _WEAK_PASSWORDS:
            return pwd


def employee_activity(session: Session, auth: AuthContext, employee_id: str) -> list[dict]:
    import json
    emp = _get_employee(session, auth, employee_id)
    stmt = select(AuditLog).where(AuditLog.company_id == auth.company_id)
    if emp.user_account_id:
        stmt = stmt.where(
            (AuditLog.entity_id == emp.id) | (AuditLog.user_id == emp.user_account_id)
        )
    else:
        stmt = stmt.where(AuditLog.entity_id == emp.id)
    
    rows = session.exec(stmt.order_by(AuditLog.created_at.desc())).all()
    return [
        {
            "id": r.id,
            "action": r.action,
            "entity_type": r.entity_type,
            "entity_id": r.entity_id,
            "user_id": r.user_id,
            "detail": json.loads(r.detail_json) if r.detail_json else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


def _att_out(a: MiniHrAttendance) -> dict[str, Any]:
    duration_minutes = None
    if a.clock_out and a.clock_in:
        duration_minutes = int((a.clock_out - a.clock_in).total_seconds() // 60)
    return {
        "id": a.id,
        "company_id": a.company_id,
        "store_id": a.store_id,
        "employee_id": a.employee_id,
        "date": a.attendance_date.isoformat() if a.attendance_date else None,
        "clock_in": a.clock_in.isoformat() if a.clock_in else None,
        "clock_out": a.clock_out.isoformat() if a.clock_out else None,
        "status": a.status,
        "notes": a.notes,
        "duration_minutes": duration_minutes,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


def list_attendance(
    session: Session,
    auth: AuthContext,
    date_str: str | None = None,
    store_id: str | None = None,
    employee_id: str | None = None,
) -> list[dict]:
    stmt = select(MiniHrAttendance).where(MiniHrAttendance.company_id == auth.company_id)
    if date_str:
        try:
            d = date.fromisoformat(date_str)
            stmt = stmt.where(MiniHrAttendance.attendance_date == d)
        except ValueError:
            pass
    if store_id:
        stmt = stmt.where(MiniHrAttendance.store_id == store_id)
    if employee_id:
        stmt = stmt.where(MiniHrAttendance.employee_id == employee_id)
    
    rows = session.exec(stmt.order_by(MiniHrAttendance.clock_in.desc())).all()
    return [_att_out(r) for r in rows]


def _clock_in_one(
    session: Session,
    auth: AuthContext,
    employee_id: str,
    store_id: str | None = None,
    notes: str | None = None,
) -> tuple[MiniHrAttendance | None, str | None]:
    """Stage one clock-in without committing.

    Returns ``(record, None)`` on success or ``(None, reason)`` when the employee
    is already on an open shift. Shared by the single and bulk entry points so
    the store-resolution, duplicate and late-status rules can never drift apart.
    Raises for genuinely bad input (unknown employee, unusable store).
    """
    emp = _get_employee(session, auth, employee_id)
    target_store_id = store_id or emp.primary_store_id or auth.store_id
    if not target_store_id:
        raise HTTPException(status_code=422, detail="Store ID is required for clock-in")
    _require_company_store(session, auth.company_id, target_store_id)

    today = date.today()
    existing = session.exec(
        select(MiniHrAttendance).where(
            MiniHrAttendance.company_id == auth.company_id,
            MiniHrAttendance.employee_id == emp.id,
            MiniHrAttendance.attendance_date == today,
            MiniHrAttendance.clock_out == None,  # noqa: E711
        )
    ).first()
    if existing:
        return None, "Employee is already clocked in"

    now = _now()
    status = "present"
    if now.hour > 9 or (now.hour == 9 and now.minute > 30):
        status = "late"

    att = MiniHrAttendance(
        company_id=auth.company_id,
        store_id=target_store_id,
        employee_id=emp.id,
        attendance_date=today,
        clock_in=now,
        status=status,
        notes=notes,
        created_by=auth.user_id,
    )
    session.add(att)
    write_audit(session, auth, "hr.clock_in", "mini_hr_attendance", att.id, {"employee_id": emp.id, "store_id": target_store_id})
    return att, None


def clock_in(session: Session, auth: AuthContext, employee_id: str, store_id: str | None = None, notes: str | None = None) -> dict:
    att, skipped = _clock_in_one(session, auth, employee_id, store_id, notes)
    if skipped:
        raise HTTPException(status_code=409, detail=skipped)
    session.commit()
    session.refresh(att)
    return _att_out(att)


def bulk_clock_in(
    session: Session,
    auth: AuthContext,
    employee_ids: list[str],
    store_id: str | None = None,
    notes: str | None = None,
) -> dict:
    """Clock in many employees in one round trip.

    Idempotent by design: anyone already on an open shift is reported under
    ``skipped`` instead of failing the batch, so re-submitting the same roster is
    safe. There is no unique constraint on (employee, date), so the payload is
    de-duplicated here as well.
    """
    staged: list[MiniHrAttendance] = []
    skipped: list[dict] = []
    failed: list[dict] = []
    seen: set[str] = set()

    for employee_id in employee_ids:
        if employee_id in seen:
            continue
        seen.add(employee_id)
        try:
            att, skip_reason = _clock_in_one(session, auth, employee_id, store_id, notes)
        except HTTPException as exc:
            failed.append({"employee_id": employee_id, "detail": str(exc.detail)})
            continue
        if skip_reason:
            skipped.append({"employee_id": employee_id, "reason": skip_reason})
        elif att is not None:
            staged.append(att)

    session.commit()
    for att in staged:
        session.refresh(att)

    return {
        "clocked_in": [_att_out(a) for a in staged],
        "skipped": skipped,
        "failed": failed,
    }


def bulk_mark_absent(
    session: Session,
    auth: AuthContext,
    employee_ids: list[str],
    attendance_date_str: str | None = None,
    notes: str | None = None,
) -> dict:
    """Record a no-show.

    The row carries a date and a status but no clock_in/clock_out, so an absence
    never contributes to shift-duration totals. Requires migration
    046_attendance_absence, which drops the NOT NULL on clock_in.

    Anyone who already has a record for that date is skipped — you cannot be both
    absent and clocked in.
    """
    if attendance_date_str:
        try:
            target_date = datetime.fromisoformat(attendance_date_str).date()
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid date format (use YYYY-MM-DD)")
    else:
        target_date = date.today()

    staged: list[MiniHrAttendance] = []
    skipped: list[dict] = []
    failed: list[dict] = []
    seen: set[str] = set()

    for employee_id in employee_ids:
        if employee_id in seen:
            continue
        seen.add(employee_id)
        try:
            emp = _get_employee(session, auth, employee_id)
        except HTTPException as exc:
            failed.append({"employee_id": employee_id, "detail": str(exc.detail)})
            continue

        existing = session.exec(
            select(MiniHrAttendance).where(
                MiniHrAttendance.company_id == auth.company_id,
                MiniHrAttendance.employee_id == emp.id,
                MiniHrAttendance.attendance_date == target_date,
            )
        ).first()
        if existing:
            skipped.append({"employee_id": employee_id, "reason": "Already has an attendance record"})
            continue

        target_store_id = emp.primary_store_id or auth.store_id
        if not target_store_id:
            failed.append({"employee_id": employee_id, "detail": "Employee has no store assigned"})
            continue

        att = MiniHrAttendance(
            company_id=auth.company_id,
            store_id=target_store_id,
            employee_id=emp.id,
            attendance_date=target_date,
            clock_in=None,
            clock_out=None,
            status="absent",
            notes=notes,
            created_by=auth.user_id,
        )
        session.add(att)
        write_audit(session, auth, "hr.mark_absent", "mini_hr_attendance", att.id, {"employee_id": emp.id})
        staged.append(att)

    session.commit()
    for att in staged:
        session.refresh(att)

    return {
        "marked_absent": [_att_out(a) for a in staged],
        "skipped": skipped,
        "failed": failed,
    }


def bulk_clock_out(
    session: Session,
    auth: AuthContext,
    attendance_ids: list[str],
    notes: str | None = None,
) -> dict:
    """Close many open shifts at once. Rows already closed are skipped."""
    staged: list[MiniHrAttendance] = []
    skipped: list[dict] = []
    failed: list[dict] = []
    seen: set[str] = set()

    for attendance_id in attendance_ids:
        if attendance_id in seen:
            continue
        seen.add(attendance_id)
        att = session.get(MiniHrAttendance, attendance_id)
        if not att or att.company_id != auth.company_id:
            failed.append({"attendance_id": attendance_id, "detail": "Attendance record not found"})
            continue
        if att.clock_out:
            skipped.append({"attendance_id": attendance_id, "reason": "Employee has already clocked out"})
            continue
        att.clock_out = _now()
        if notes:
            att.notes = f"{att.notes or ''} {notes}".strip()
        att.updated_at = _now()
        session.add(att)
        write_audit(session, auth, "hr.clock_out", "mini_hr_attendance", att.id, {"employee_id": att.employee_id})
        staged.append(att)

    session.commit()
    for att in staged:
        session.refresh(att)

    return {
        "clocked_out": [_att_out(a) for a in staged],
        "skipped": skipped,
        "failed": failed,
    }


def clock_out(session: Session, auth: AuthContext, attendance_id: str, notes: str | None = None) -> dict:
    att = session.get(MiniHrAttendance, attendance_id)
    if not att or att.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Attendance record not found")
    if att.clock_out:
        raise HTTPException(status_code=409, detail="Employee has already clocked out")
    
    att.clock_out = _now()
    if notes:
        att.notes = f"{att.notes or ''} {notes}".strip()
    att.updated_at = _now()
    session.add(att)
    write_audit(session, auth, "hr.clock_out", "mini_hr_attendance", att.id, {"employee_id": att.employee_id})
    session.commit()
    session.refresh(att)
    return _att_out(att)


def create_attendance_entry(session: Session, auth: AuthContext, body: dict) -> dict:
    emp = _get_employee(session, auth, body["employee_id"])
    store = _require_company_store(session, auth.company_id, body["store_id"])
    
    try:
        att_date = date.fromisoformat(body["date"])
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid date format (use YYYY-MM-DD)")
    
    clock_in_time = datetime.fromisoformat(body["clock_in"])
    clock_out_time = datetime.fromisoformat(body["clock_out"]) if body.get("clock_out") else None

    att = MiniHrAttendance(
        company_id=auth.company_id,
        store_id=store.id,
        employee_id=emp.id,
        attendance_date=att_date,
        clock_in=clock_in_time,
        clock_out=clock_out_time,
        status=body.get("status") or "present",
        notes=body.get("notes"),
        created_by=auth.user_id,
    )
    session.add(att)
    write_audit(session, auth, "hr.attendance_create", "mini_hr_attendance", att.id, {"employee_id": emp.id})
    session.commit()
    session.refresh(att)
    return _att_out(att)


# ─────────────────────────────  LEAVE MANAGEMENT  ────────────────────────────


def _leave_out(lr: MiniHrLeaveRequest, emp_map: dict | None = None) -> dict[str, Any]:
    emp_info = emp_map.get(lr.employee_id, {}) if emp_map else {}
    return {
        "id": lr.id,
        "company_id": lr.company_id,
        "employee_id": lr.employee_id,
        "employee_name": emp_info.get("full_name") or emp_info.get("first_name", ""),
        "employee_code": emp_info.get("employee_code", ""),
        "store_id": lr.store_id,
        "leave_type": lr.leave_type,
        "start_date": lr.start_date.isoformat() if lr.start_date else None,
        "end_date": lr.end_date.isoformat() if lr.end_date else None,
        "total_days": lr.total_days,
        "reason": lr.reason,
        "status": lr.status,
        "reviewed_by": lr.reviewed_by,
        "reviewed_at": lr.reviewed_at.isoformat() if lr.reviewed_at else None,
        "review_notes": lr.review_notes,
        "created_by": lr.created_by,
        "created_at": lr.created_at.isoformat() if lr.created_at else None,
        "updated_at": lr.updated_at.isoformat() if lr.updated_at else None,
    }


def list_leave_requests(
    session: Session,
    auth: AuthContext,
    status: str | None = None,
    employee_id: str | None = None,
    leave_type: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
) -> dict[str, Any]:
    stmt = select(MiniHrLeaveRequest).where(MiniHrLeaveRequest.company_id == auth.company_id)
    if status:
        stmt = stmt.where(MiniHrLeaveRequest.status == status)
    if employee_id:
        stmt = stmt.where(MiniHrLeaveRequest.employee_id == employee_id)
    if leave_type:
        stmt = stmt.where(MiniHrLeaveRequest.leave_type == leave_type)
    if from_date:
        stmt = stmt.where(MiniHrLeaveRequest.start_date >= date.fromisoformat(from_date))
    if to_date:
        stmt = stmt.where(MiniHrLeaveRequest.end_date <= date.fromisoformat(to_date))
    stmt = stmt.order_by(MiniHrLeaveRequest.created_at.desc())  # type: ignore[union-attr]
    rows = session.exec(stmt).all()

    # enrich with employee names
    emp_ids = list({r.employee_id for r in rows})
    emp_rows = session.exec(
        select(MiniHrEmployee).where(MiniHrEmployee.id.in_(emp_ids))  # type: ignore[attr-defined]
    ).all()
    emp_map = {e.id: {"full_name": e.full_name, "first_name": e.first_name, "employee_code": e.employee_code} for e in emp_rows}

    leave_list = [_leave_out(r, emp_map) for r in rows]

    # summary stats
    total = len(leave_list)
    pending = sum(1 for r in leave_list if r["status"] == "pending")
    approved = sum(1 for r in leave_list if r["status"] == "approved")
    rejected = sum(1 for r in leave_list if r["status"] == "rejected")
    approved_days = sum(r["total_days"] for r in leave_list if r["status"] == "approved")
    sick_days = sum(r["total_days"] for r in leave_list if r["status"] == "approved" and r["leave_type"] == "sick")

    return {
        "summary": {
            "total": total,
            "pending": pending,
            "approved": approved,
            "rejected": rejected,
            "approved_days": approved_days,
            "sick_days": sick_days,
        },
        "items": leave_list,
    }


def create_leave_request(
    session: Session,
    auth: AuthContext,
    data: dict[str, Any],
) -> dict[str, Any]:
    employee_id = data["employee_id"]
    emp = session.get(MiniHrEmployee, employee_id)
    if not emp or emp.company_id != auth.company_id:
        raise HTTPException(404, "Employee not found")

    start = data["start_date"]
    end = data["end_date"]
    if isinstance(start, str):
        start = date.fromisoformat(start)
    if isinstance(end, str):
        end = date.fromisoformat(end)
    if end < start:
        raise HTTPException(400, "end_date must be on or after start_date")

    total_days = data.get("total_days") or float((end - start).days + 1)

    lr = MiniHrLeaveRequest(
        company_id=auth.company_id,
        employee_id=employee_id,
        store_id=data.get("store_id") or emp.primary_store_id,
        leave_type=data.get("leave_type", "annual"),
        start_date=start,
        end_date=end,
        total_days=total_days,
        reason=data.get("reason"),
        status="pending",
        created_by=auth.user_id,
    )
    session.add(lr)
    write_audit(session, auth, "hr.leave_request_create", "mini_hr_leave_request", lr.id, {"employee_id": employee_id, "type": lr.leave_type})
    session.commit()
    session.refresh(lr)
    return _leave_out(lr)


def _review_leave(
    session: Session,
    auth: AuthContext,
    leave_id: str,
    new_status: str,
    review_notes: str | None,
) -> dict[str, Any]:
    lr = session.get(MiniHrLeaveRequest, leave_id)
    if not lr or lr.company_id != auth.company_id:
        raise HTTPException(404, "Leave request not found")
    if lr.status not in ("pending",):
        raise HTTPException(400, f"Cannot {new_status} a request that is already '{lr.status}'")
    lr.status = new_status
    lr.reviewed_by = auth.user_id
    lr.reviewed_at = _now()
    lr.review_notes = review_notes
    session.add(lr)
    write_audit(session, auth, f"hr.leave_{new_status}", "mini_hr_leave_request", lr.id, {"employee_id": lr.employee_id})
    session.commit()
    session.refresh(lr)
    return _leave_out(lr)


def approve_leave(session: Session, auth: AuthContext, leave_id: str, review_notes: str | None = None) -> dict:
    return _review_leave(session, auth, leave_id, "approved", review_notes)


def reject_leave(session: Session, auth: AuthContext, leave_id: str, review_notes: str | None = None) -> dict:
    return _review_leave(session, auth, leave_id, "rejected", review_notes)


def cancel_leave(session: Session, auth: AuthContext, leave_id: str) -> dict[str, Any]:
    lr = session.get(MiniHrLeaveRequest, leave_id)
    if not lr or lr.company_id != auth.company_id:
        raise HTTPException(404, "Leave request not found")
    if lr.status not in ("pending",):
        raise HTTPException(400, f"Cannot cancel a request that is '{lr.status}'")
    lr.status = "cancelled"
    session.add(lr)
    write_audit(session, auth, "hr.leave_cancel", "mini_hr_leave_request", lr.id, {})
    session.commit()
    session.refresh(lr)
    return _leave_out(lr)


def get_payroll_summary(
    session: Session,
    auth: AuthContext,
    year: int,
    month: int,
    store_id: str | None = None,
) -> list[dict[str, Any]]:
    import calendar
    _, last_day = calendar.monthrange(year, month)
    start_of_month = date(year, month, 1)
    end_of_month = date(year, month, last_day)

    # 1. Fetch employees
    stmt = select(MiniHrEmployee).where(
        MiniHrEmployee.company_id == auth.company_id,
        MiniHrEmployee.is_active == True,
    )
    if store_id:
        stmt = stmt.where(MiniHrEmployee.primary_store_id == store_id)
    employees = session.exec(stmt).all()

    # 2. Maps for department/designation names
    depts = session.exec(select(MiniHrDepartment).where(MiniHrDepartment.company_id == auth.company_id)).all()
    desigs = session.exec(select(MiniHrDesignation).where(MiniHrDesignation.company_id == auth.company_id)).all()
    dept_map = {d.id: d.department_name for d in depts}
    desig_map = {d.id: d.designation_name for d in desigs}

    result = []
    for emp in employees:
        # Get all approved leave requests that intersect with this month
        leaves = session.exec(
            select(MiniHrLeaveRequest).where(
                MiniHrLeaveRequest.employee_id == emp.id,
                MiniHrLeaveRequest.status == "approved",
                MiniHrLeaveRequest.start_date <= end_of_month,
                MiniHrLeaveRequest.end_date >= start_of_month,
            )
        ).all()

        paid_leave_days = 0.0
        unpaid_leave_days = 0.0
        for l in leaves:
            overlap_start = max(l.start_date, start_of_month)
            overlap_end = min(l.end_date, end_of_month)
            days = float((overlap_end - overlap_start).days + 1)
            
            if l.leave_type == "unpaid":
                unpaid_leave_days += days
            else:
                paid_leave_days += days

        # Get attendance count and sum duration
        attendance = session.exec(
            select(MiniHrAttendance).where(
                MiniHrAttendance.employee_id == emp.id,
                MiniHrAttendance.attendance_date >= start_of_month,
                MiniHrAttendance.attendance_date <= end_of_month,
            )
        ).all()

        days_worked = len(attendance)
        
        # Calculate total duration in minutes
        total_minutes = 0
        for att in attendance:
            if att.clock_in and att.clock_out:
                total_minutes += int((att.clock_out - att.clock_in).total_seconds() // 60)
            elif att.clock_in: # Active shifts count as 8 hours (480 mins) as fallback
                total_minutes += 480

        hours_logged = float(total_minutes / 60.0)

        # Standard payable days calculation: active days worked + paid leave taken
        payable_days = float(days_worked) + paid_leave_days

        result.append({
            "employee_id": emp.id,
            "employee_name": emp.full_name or emp.first_name,
            "employee_code": emp.employee_code,
            "department": dept_map.get(emp.department_id, "Unassigned") if emp.department_id else "Unassigned",
            "designation": desig_map.get(emp.designation_id, "Unassigned") if emp.designation_id else "Unassigned",
            "days_worked": days_worked,
            "hours_logged": round(hours_logged, 1),
            "paid_leave_days": paid_leave_days,
            "unpaid_leave_days": unpaid_leave_days,
            "payable_days": payable_days,
        })

    return result


# ─── Shift Roster ──────────────────────────────────────────────────────────────

def _roster_out(r: MiniHrShiftRoster, emp_map: dict | None = None) -> dict[str, Any]:
    emp_info = emp_map.get(r.employee_id, {}) if emp_map else {}
    return {
        "id": r.id,
        "employee_id": r.employee_id,
        "employee_name": emp_info.get("full_name") or emp_info.get("first_name", ""),
        "employee_code": emp_info.get("employee_code", ""),
        "store_id": r.store_id,
        "shift_date": r.shift_date.isoformat(),
        "shift_type": r.shift_type,
        "notes": r.notes,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def list_shift_roster(
    session: Session,
    auth: AuthContext,
    week_start: str,
    store_id: str | None = None,
) -> list[dict[str, Any]]:
    start = date.fromisoformat(week_start)
    from datetime import timedelta
    end = start + timedelta(days=6)

    stmt = select(MiniHrShiftRoster).where(
        MiniHrShiftRoster.company_id == auth.company_id,
        MiniHrShiftRoster.shift_date >= start,
        MiniHrShiftRoster.shift_date <= end,
    )
    if store_id:
        stmt = stmt.where(MiniHrShiftRoster.store_id == store_id)
    rows = session.exec(stmt).all()

    emp_ids = list({r.employee_id for r in rows})
    emp_rows = session.exec(
        select(MiniHrEmployee).where(MiniHrEmployee.id.in_(emp_ids))  # type: ignore[attr-defined]
    ).all() if emp_ids else []
    emp_map = {e.id: {"full_name": e.full_name, "first_name": e.first_name, "employee_code": e.employee_code} for e in emp_rows}

    return [_roster_out(r, emp_map) for r in rows]


def upsert_shift(
    session: Session,
    auth: AuthContext,
    employee_id: str,
    shift_date: str,
    shift_type: str,
    store_id: str | None = None,
    notes: str | None = None,
) -> dict[str, Any]:
    _get_employee(session, auth, employee_id)
    shift_date_obj = date.fromisoformat(shift_date)

    # Check existing — one entry per employee per date
    existing = session.exec(
        select(MiniHrShiftRoster).where(
            MiniHrShiftRoster.company_id == auth.company_id,
            MiniHrShiftRoster.employee_id == employee_id,
            MiniHrShiftRoster.shift_date == shift_date_obj,
        )
    ).first()

    if existing:
        existing.shift_type = shift_type
        existing.store_id = store_id
        existing.notes = notes
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return _roster_out(existing)
    else:
        roster = MiniHrShiftRoster(
            company_id=auth.company_id,
            employee_id=employee_id,
            store_id=store_id,
            shift_date=shift_date_obj,
            shift_type=shift_type,
            notes=notes,
            created_by=auth.user_id,
        )
        session.add(roster)
        session.commit()
        session.refresh(roster)
        return _roster_out(roster)


def delete_shift(session: Session, auth: AuthContext, roster_id: str) -> dict[str, str]:
    roster = session.get(MiniHrShiftRoster, roster_id)
    if not roster or roster.company_id != auth.company_id:
        raise HTTPException(404, "Shift roster entry not found")
    session.delete(roster)
    session.commit()
    return {"deleted": roster_id}


def upload_profile_pic(
    session: Session,
    auth: AuthContext,
    employee_id: str,
    file_content: bytes,
    filename: str,
) -> dict[str, Any]:
    emp = _get_employee(session, auth, employee_id)
    
    # Check extension
    import os
    ext = os.path.splitext(filename)[1].lower()
    if ext not in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
        raise HTTPException(status_code=400, detail="Unsupported image type. Use PNG, JPG, JPEG, WEBP or GIF.")
        
    # Check size (5MB maximum)
    if len(file_content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image size exceeds 5MB limit.")

    # Unique name
    import uuid
    import time
    unique_filename = f"emp_{employee_id}_{int(time.time())}_{uuid.uuid4().hex[:6]}{ext}"
    
    save_path = os.path.join("uploads", "profile_pics", unique_filename)
    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    
    # Save file contents
    with open(save_path, "wb") as f:
        f.write(file_content)
        
    # Update employee model
    relative_url = f"/uploads/profile_pics/{unique_filename}"
    emp.photo_url = relative_url
    session.add(emp)
    
    write_audit(session, auth, "hr.employee_upload_photo", "mini_hr_employee", emp.id, {"photo_url": relative_url})
    session.commit()
    session.refresh(emp)
    
    return _emp_out(emp)



