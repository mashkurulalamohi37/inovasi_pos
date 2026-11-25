"""Mini HR API — employee master, departments, designations, user access."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, File, UploadFile
from sqlmodel import Session

from app.database import get_session
from app.dependencies import AuthContext, get_current_user, require_permission
from app.schemas.mini_hr import (
    AssignRoleIn,
    AttendanceIn,
    BulkClockInIn,
    BulkClockOutIn,
    BulkMarkAbsentIn,
    ClockInIn,
    ClockOutIn,
    CreateUserIn,
    DepartmentIn,
    DepartmentPatch,
    DesignationIn,
    DesignationPatch,
    EmployeeIn,
    EmployeePatch,
    LeaveRequestIn,
    LeaveReviewIn,
    ResetPasswordIn,
    ShiftUpsertIn,
    StoreAssignIn,
)
from app.services import mini_hr_service as svc

router = APIRouter(prefix="/mini-hr", tags=["mini-hr"])


@router.get("/dashboard")
def hr_dashboard(
    auth: Annotated[AuthContext, Depends(require_permission("hr.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.dashboard(session, auth)


@router.get("/employees")
def list_employees(
    auth: Annotated[AuthContext, Depends(require_permission("hr.view"))],
    session: Annotated[Session, Depends(get_session)],
    q: Annotated[str | None, Query()] = None,
    status: Annotated[str | None, Query()] = None,
):
    return svc.list_employees(session, auth, q=q, status=status)


@router.post("/employees")
def create_employee(
    body: EmployeeIn,
    auth: Annotated[AuthContext, Depends(require_permission("hr.employee_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.create_employee(session, auth, body.model_dump())


@router.get("/employees/{employee_id}")
def get_employee(
    employee_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("hr.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.get_employee(session, auth, employee_id)


@router.patch("/employees/{employee_id}")
def patch_employee(
    employee_id: str,
    body: EmployeePatch,
    auth: Annotated[AuthContext, Depends(require_permission("hr.employee_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.patch_employee(session, auth, employee_id, body.model_dump(exclude_unset=True))


@router.get("/departments")
def list_departments(
    auth: Annotated[AuthContext, Depends(require_permission("hr.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.list_departments(session, auth)


@router.post("/departments")
def create_department(
    body: DepartmentIn,
    auth: Annotated[AuthContext, Depends(require_permission("hr.department_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.create_department(session, auth, body.model_dump())


@router.patch("/departments/{department_id}")
def patch_department(
    department_id: str,
    body: DepartmentPatch,
    auth: Annotated[AuthContext, Depends(require_permission("hr.department_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.patch_department(session, auth, department_id, body.model_dump(exclude_unset=True))


@router.get("/designations")
def list_designations(
    auth: Annotated[AuthContext, Depends(require_permission("hr.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.list_designations(session, auth)


@router.post("/designations")
def create_designation(
    body: DesignationIn,
    auth: Annotated[AuthContext, Depends(require_permission("hr.designation_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.create_designation(session, auth, body.model_dump())


@router.patch("/designations/{designation_id}")
def patch_designation(
    designation_id: str,
    body: DesignationPatch,
    auth: Annotated[AuthContext, Depends(require_permission("hr.designation_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.patch_designation(session, auth, designation_id, body.model_dump(exclude_unset=True))


@router.get("/employees/{employee_id}/stores")
def list_stores(
    employee_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("hr.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.list_store_assignments(session, auth, employee_id)


@router.post("/employees/{employee_id}/stores")
def assign_store(
    employee_id: str,
    body: StoreAssignIn,
    auth: Annotated[AuthContext, Depends(require_permission("hr.store_assignment_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.assign_store(session, auth, employee_id, body.model_dump())


@router.delete("/employees/{employee_id}/stores/{assignment_id}")
def remove_store(
    employee_id: str,
    assignment_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("hr.store_assignment_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.remove_store_assignment(session, auth, employee_id, assignment_id)


@router.post("/employees/{employee_id}/create-user")
def create_user(
    employee_id: str,
    body: CreateUserIn,
    auth: Annotated[AuthContext, Depends(require_permission("hr.user_access_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.create_user_account(session, auth, employee_id, body.model_dump())


@router.post("/employees/{employee_id}/reset-password")
def reset_password(
    employee_id: str,
    body: ResetPasswordIn,
    auth: Annotated[AuthContext, Depends(require_permission("hr.password_reset"))],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.reset_password(session, auth, employee_id, body.model_dump())


@router.post("/employees/{employee_id}/assign-role")
def assign_role(
    employee_id: str,
    body: AssignRoleIn,
    auth: Annotated[AuthContext, Depends(require_permission("hr.role_assign"))],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.assign_role(session, auth, employee_id, body.model_dump())


@router.post("/employees/{employee_id}/suspend-access")
def suspend_access(
    employee_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("hr.user_access_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.suspend_access(session, auth, employee_id)


@router.post("/employees/{employee_id}/activate-access")
def activate_access(
    employee_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("hr.user_access_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.activate_access(session, auth, employee_id)


@router.get("/user-access")
def user_access(
    auth: Annotated[AuthContext, Depends(require_permission("hr.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.user_access_directory(session, auth)


@router.get("/my-profile")
def my_profile(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.my_profile(session, auth)


@router.get("/generate-temp-password")
def gen_temp_password(
    auth: Annotated[AuthContext, Depends(require_permission("hr.user_access_manage"))],
):
    return {"temporary_password": svc.generate_temp_password()}


@router.get("/employees/{employee_id}/activity")
def get_employee_activity(
    employee_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("hr.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.employee_activity(session, auth, employee_id)


@router.get("/attendance")
def list_attendance(
    auth: Annotated[AuthContext, Depends(require_permission("hr.view"))],
    session: Annotated[Session, Depends(get_session)],
    date: Annotated[str | None, Query()] = None,
    store_id: Annotated[str | None, Query()] = None,
    employee_id: Annotated[str | None, Query()] = None,
):
    return svc.list_attendance(session, auth, date_str=date, store_id=store_id, employee_id=employee_id)


@router.post("/attendance/clock-in")
def clock_in(
    body: ClockInIn,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.clock_in(session, auth, employee_id=body.employee_id, store_id=body.store_id, notes=body.notes)


@router.post("/attendance/clock-out")
def clock_out(
    body: ClockOutIn,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.clock_out(session, auth, attendance_id=body.attendance_id, notes=body.notes)


@router.post("/attendance/bulk-clock-in")
def bulk_clock_in(
    body: BulkClockInIn,
    auth: Annotated[AuthContext, Depends(require_permission("hr.employee_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    """Clock in a whole shift. Gated on hr.employee_manage because it records
    attendance on behalf of other staff, matching the manual-entry route."""
    return svc.bulk_clock_in(
        session, auth, employee_ids=body.employee_ids, store_id=body.store_id, notes=body.notes
    )


@router.post("/attendance/bulk-clock-out")
def bulk_clock_out(
    body: BulkClockOutIn,
    auth: Annotated[AuthContext, Depends(require_permission("hr.employee_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.bulk_clock_out(session, auth, attendance_ids=body.attendance_ids, notes=body.notes)


@router.post("/attendance/bulk-mark-absent")
def bulk_mark_absent(
    body: BulkMarkAbsentIn,
    auth: Annotated[AuthContext, Depends(require_permission("hr.employee_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.bulk_mark_absent(
        session, auth, employee_ids=body.employee_ids, attendance_date_str=body.date, notes=body.notes
    )


@router.post("/attendance")
def create_attendance(
    body: AttendanceIn,
    auth: Annotated[AuthContext, Depends(require_permission("hr.employee_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.create_attendance_entry(session, auth, body.model_dump())


# ─────────────────────────  LEAVE MANAGEMENT ROUTES  ─────────────────────────

@router.get("/leave")
def list_leave(
    auth: Annotated[AuthContext, Depends(require_permission("hr.view"))],
    session: Annotated[Session, Depends(get_session)],
    status: Annotated[str | None, Query()] = None,
    employee_id: Annotated[str | None, Query()] = None,
    leave_type: Annotated[str | None, Query()] = None,
    from_date: Annotated[str | None, Query()] = None,
    to_date: Annotated[str | None, Query()] = None,
):
    return svc.list_leave_requests(session, auth, status=status, employee_id=employee_id, leave_type=leave_type, from_date=from_date, to_date=to_date)


@router.post("/leave")
def create_leave(
    body: LeaveRequestIn,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.create_leave_request(session, auth, body.model_dump())


@router.post("/leave/{leave_id}/approve")
def approve_leave(
    leave_id: str,
    body: LeaveReviewIn,
    auth: Annotated[AuthContext, Depends(require_permission("hr.employee_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.approve_leave(session, auth, leave_id, review_notes=body.review_notes)


@router.post("/leave/{leave_id}/reject")
def reject_leave(
    leave_id: str,
    body: LeaveReviewIn,
    auth: Annotated[AuthContext, Depends(require_permission("hr.employee_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.reject_leave(session, auth, leave_id, review_notes=body.review_notes)


@router.post("/leave/{leave_id}/cancel")
def cancel_leave(
    leave_id: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.cancel_leave(session, auth, leave_id)


@router.get("/payroll-summary")
def get_payroll_summary(
    auth: Annotated[AuthContext, Depends(require_permission("hr.view"))],
    session: Annotated[Session, Depends(get_session)],
    year: Annotated[int, Query()],
    month: Annotated[int, Query()],
    store_id: Annotated[str | None, Query()] = None,
):
    return svc.get_payroll_summary(session, auth, year=year, month=month, store_id=store_id)


@router.get("/shift-roster")
def list_shift_roster(
    auth: Annotated[AuthContext, Depends(require_permission("hr.view"))],
    session: Annotated[Session, Depends(get_session)],
    week_start: Annotated[str, Query()],
    store_id: Annotated[str | None, Query()] = None,
):
    return svc.list_shift_roster(session, auth, week_start=week_start, store_id=store_id)


@router.post("/shift-roster")
def upsert_shift(
    body: ShiftUpsertIn,
    auth: Annotated[AuthContext, Depends(require_permission("hr.employee_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.upsert_shift(
        session, auth,
        employee_id=body.employee_id,
        shift_date=body.shift_date,
        shift_type=body.shift_type,
        store_id=body.store_id,
        notes=body.notes,
    )


@router.delete("/shift-roster/{roster_id}")
def delete_shift(
    roster_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("hr.employee_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.delete_shift(session, auth, roster_id)


@router.post("/my-profile/upload-photo")
async def upload_my_profile_photo(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    file: UploadFile = File(...),
):
    profile = svc.my_profile(session, auth)
    emp_id = profile["id"]
    content = await file.read()
    return svc.upload_profile_pic(
        session,
        auth,
        employee_id=emp_id,
        file_content=content,
        filename=file.filename or "photo.jpg",
    )


@router.post("/employees/{id}/upload-photo")
async def upload_photo(
    id: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    file: UploadFile = File(...),
):
    from app.models.mini_hr import MiniHrEmployee
    from fastapi import HTTPException

    # If id is "me", "self", or matches the current user_id, resolve their profile
    if id in ("me", "self", "my-profile") or id == auth.user_id:
        profile = svc.my_profile(session, auth)
        id = profile["id"]
        emp = session.get(MiniHrEmployee, id)
    else:
        emp = session.get(MiniHrEmployee, id)
        if not emp and id == auth.user_id:
            profile = svc.my_profile(session, auth)
            id = profile["id"]
            emp = session.get(MiniHrEmployee, id)

    if not emp or emp.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Employee not found")

    is_manager = (
        "hr.employee_manage" in auth.permissions
        or auth.is_platform_admin
        or auth.role_code in ("Admin", "Super Admin")
    )
    if not is_manager and emp.user_account_id != auth.user_id:
        raise HTTPException(status_code=403, detail="Permission denied")

    content = await file.read()
    return svc.upload_profile_pic(
        session,
        auth,
        employee_id=id,
        file_content=content,
        filename=file.filename or "photo.jpg",
    )



