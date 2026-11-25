"""Mini HR bounded context — employee identity (not auth/RBAC engines)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlmodel import Field, SQLModel

from app.models.base import TimestampMixin, new_uuid


class MiniHrDepartment(TimestampMixin, table=True):
    __tablename__ = "mini_hr_department"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    department_code: str = Field(index=True)
    department_name: str
    description: Optional[str] = None
    manager_employee_id: Optional[str] = Field(default=None, index=True)
    is_active: bool = True


class MiniHrDesignation(TimestampMixin, table=True):
    __tablename__ = "mini_hr_designation"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    designation_code: str = Field(index=True)
    designation_name: str
    description: Optional[str] = None
    level: Optional[int] = None
    is_active: bool = True


class MiniHrEmployee(TimestampMixin, table=True):
    __tablename__ = "mini_hr_employee"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    employee_code: str = Field(index=True)
    first_name: str
    last_name: Optional[str] = None
    full_name: str
    display_name: Optional[str] = None
    mobile: Optional[str] = None
    email: Optional[str] = None
    gender: Optional[str] = None
    date_of_birth: Optional[date] = None
    joining_date: Optional[date] = None
    department_id: Optional[str] = Field(default=None, foreign_key="mini_hr_department.id", index=True)
    designation_id: Optional[str] = Field(default=None, foreign_key="mini_hr_designation.id", index=True)
    reporting_manager_employee_id: Optional[str] = Field(default=None, index=True)
    primary_store_id: Optional[str] = Field(default=None, foreign_key="store.id", index=True)
    employment_type: Optional[str] = None
    employee_status: str = Field(default="active", index=True)  # active|inactive|suspended|resigned
    user_account_id: Optional[str] = Field(default=None, foreign_key="user_account.id", index=True)
    photo_url: Optional[str] = None
    address: Optional[str] = None
    emergency_contact: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool = True
    # Future HRMS integration boundary (no sync engine in this phase)
    external_employee_id: Optional[str] = Field(default=None, index=True)
    external_source: Optional[str] = None
    external_sync_at: Optional[datetime] = None
    created_by: Optional[str] = None


class MiniHrEmployeeStoreAssignment(TimestampMixin, table=True):
    __tablename__ = "mini_hr_employee_store_assignment"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    employee_id: str = Field(foreign_key="mini_hr_employee.id", index=True)
    store_id: str = Field(foreign_key="store.id", index=True)
    assignment_type: str = Field(default="secondary")  # primary|secondary|temporary
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    is_primary: bool = False
    is_active: bool = True
    created_by: Optional[str] = None


class MiniHrAttendance(TimestampMixin, table=True):
    __tablename__ = "mini_hr_attendance"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    store_id: str = Field(foreign_key="store.id", index=True)
    employee_id: str = Field(foreign_key="mini_hr_employee.id", index=True)
    attendance_date: date = Field(index=True)
    # Null for an absence — an absent employee never clocked in. See migration
    # 046_attendance_absence.
    clock_in: Optional[datetime] = None
    clock_out: Optional[datetime] = None
    status: str = Field(default="present", index=True)  # present|late|half_day|absent
    notes: Optional[str] = None
    created_by: Optional[str] = None


class MiniHrLeaveRequest(TimestampMixin, table=True):
    __tablename__ = "mini_hr_leave_request"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    employee_id: str = Field(foreign_key="mini_hr_employee.id", index=True)
    store_id: Optional[str] = Field(default=None, foreign_key="store.id", index=True)
    leave_type: str = Field(default="annual", index=True)  # annual|sick|emergency|unpaid|other
    start_date: date = Field(index=True)
    end_date: date = Field(index=True)
    total_days: float = 1.0
    reason: Optional[str] = None
    status: str = Field(default="pending", index=True)  # pending|approved|rejected|cancelled
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_notes: Optional[str] = None
    created_by: Optional[str] = None


class MiniHrShiftRoster(TimestampMixin, table=True):
    __tablename__ = "mini_hr_shift_roster"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    employee_id: str = Field(foreign_key="mini_hr_employee.id", index=True)
    store_id: Optional[str] = Field(default=None, foreign_key="store.id", index=True)
    shift_date: date = Field(index=True)
    # morning|afternoon|evening|night|off
    shift_type: str = Field(default="morning", index=True)
    notes: Optional[str] = None
    created_by: Optional[str] = None




