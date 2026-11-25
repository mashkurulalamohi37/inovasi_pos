from __future__ import annotations

from datetime import date
from typing import Optional

from pydantic import BaseModel, Field


class DepartmentIn(BaseModel):
    department_code: str
    department_name: str
    description: Optional[str] = None
    is_active: bool = True


class DepartmentPatch(BaseModel):
    department_name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class DesignationIn(BaseModel):
    designation_code: str
    designation_name: str
    description: Optional[str] = None
    level: Optional[int] = None
    is_active: bool = True


class DesignationPatch(BaseModel):
    designation_name: Optional[str] = None
    description: Optional[str] = None
    level: Optional[int] = None
    is_active: Optional[bool] = None


class EmployeeIn(BaseModel):
    employee_code: str
    first_name: str
    last_name: Optional[str] = None
    full_name: Optional[str] = None
    display_name: Optional[str] = None
    mobile: Optional[str] = None
    email: Optional[str] = None
    joining_date: Optional[date] = None
    department_id: Optional[str] = None
    designation_id: Optional[str] = None
    reporting_manager_employee_id: Optional[str] = None
    primary_store_id: Optional[str] = None
    employment_type: Optional[str] = None
    employee_status: str = "active"
    notes: Optional[str] = None


class EmployeePatch(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    full_name: Optional[str] = None
    display_name: Optional[str] = None
    mobile: Optional[str] = None
    email: Optional[str] = None
    joining_date: Optional[date] = None
    department_id: Optional[str] = None
    designation_id: Optional[str] = None
    reporting_manager_employee_id: Optional[str] = None
    primary_store_id: Optional[str] = None
    employment_type: Optional[str] = None
    employee_status: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None
    address: Optional[str] = None
    emergency_contact: Optional[str] = None


class StoreAssignIn(BaseModel):
    store_id: str
    assignment_type: str = "secondary"
    is_primary: bool = False
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None


class CreateUserIn(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    temporary_password: str = Field(min_length=8, max_length=128)
    role_code: str = "Cashier"
    email: Optional[str] = None
    force_password_change: bool = True


class ResetPasswordIn(BaseModel):
    temporary_password: str = Field(min_length=8, max_length=128)
    force_password_change: bool = True


class AssignRoleIn(BaseModel):
    role_code: str


class ClockInIn(BaseModel):
    employee_id: str
    store_id: Optional[str] = None
    notes: Optional[str] = None


class ClockOutIn(BaseModel):
    attendance_id: str
    notes: Optional[str] = None


class BulkClockInIn(BaseModel):
    """Clock a whole shift in at once. Employees already on an open shift are
    reported as skipped rather than failing the batch."""
    employee_ids: list[str]
    store_id: Optional[str] = None
    notes: Optional[str] = None


class BulkClockOutIn(BaseModel):
    attendance_ids: list[str]
    notes: Optional[str] = None


class BulkMarkAbsentIn(BaseModel):
    """Record no-shows. `date` defaults to today; the rows carry no times."""
    employee_ids: list[str]
    date: Optional[str] = None
    notes: Optional[str] = None


class AttendanceIn(BaseModel):
    employee_id: str
    store_id: str
    date: str
    clock_in: str
    clock_out: Optional[str] = None
    status: str = "present"
    notes: Optional[str] = None


class LeaveRequestIn(BaseModel):
    employee_id: str
    leave_type: str = "annual"  # annual|sick|emergency|unpaid|other
    start_date: date
    end_date: date
    total_days: float = 1.0
    store_id: Optional[str] = None
    reason: Optional[str] = None


class LeaveReviewIn(BaseModel):
    review_notes: Optional[str] = None


class ShiftUpsertIn(BaseModel):
    employee_id: str
    shift_date: str
    shift_type: str  # morning|afternoon|evening|night|off
    store_id: Optional[str] = None
    notes: Optional[str] = None
