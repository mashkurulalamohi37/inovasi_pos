"""Validated request/response models for subscription plans and assignments."""

from __future__ import annotations

import re
from typing import Optional

from pydantic import BaseModel, Field, field_validator

_PLAN_CODE_RE = re.compile(r"^[a-z][a-z0-9_-]{1,31}$")


class PlanCreate(BaseModel):
    code: str
    name: str
    max_stores: int = Field(default=1, ge=0)
    max_counters: int = Field(default=2, ge=0)
    max_users: int = Field(default=5, ge=0)
    max_industry_packs: int = Field(default=1, ge=0)
    advanced_reports: bool = False
    offline_sync: bool = False
    api_integration: bool = False
    price_monthly: float = Field(default=0, ge=0)
    is_active: bool = True

    @field_validator("code")
    @classmethod
    def normalize_code(cls, v: str) -> str:
        code = (v or "").strip().lower()
        if not _PLAN_CODE_RE.match(code):
            raise ValueError("Plan code must be 2–32 chars: lowercase letter, then letters/digits/_/-")
        return code

    @field_validator("name")
    @classmethod
    def normalize_name(cls, v: str) -> str:
        name = (v or "").strip()
        if not name:
            raise ValueError("Plan name is required")
        if len(name) > 120:
            raise ValueError("Plan name is too long")
        return name


class PlanUpdate(BaseModel):
    name: Optional[str] = None
    max_stores: Optional[int] = Field(default=None, ge=0)
    max_counters: Optional[int] = Field(default=None, ge=0)
    max_users: Optional[int] = Field(default=None, ge=0)
    max_industry_packs: Optional[int] = Field(default=None, ge=0)
    advanced_reports: Optional[bool] = None
    offline_sync: Optional[bool] = None
    api_integration: Optional[bool] = None
    price_monthly: Optional[float] = Field(default=None, ge=0)
    is_active: Optional[bool] = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        name = v.strip()
        if not name:
            raise ValueError("Plan name cannot be empty")
        if len(name) > 120:
            raise ValueError("Plan name is too long")
        return name


class PlanStatusBody(BaseModel):
    is_active: bool


class AssignPlanBody(BaseModel):
    company_id: str
    plan_code: str
    billing_cycle: str = "monthly"  # monthly | yearly | custom
    billing_months: Optional[int] = Field(default=None, ge=1, le=120)
    expires_at: Optional[str] = None  # ISO datetime; overrides billing_months when set

    @field_validator("plan_code")
    @classmethod
    def normalize_plan_code(cls, v: str) -> str:
        return (v or "").strip().lower()

    @field_validator("company_id")
    @classmethod
    def require_company(cls, v: str) -> str:
        company_id = (v or "").strip()
        if not company_id:
            raise ValueError("company_id is required")
        return company_id

    @field_validator("billing_cycle")
    @classmethod
    def normalize_cycle(cls, v: str) -> str:
        cycle = (v or "monthly").strip().lower()
        if cycle not in {"monthly", "yearly", "custom"}:
            raise ValueError("billing_cycle must be monthly, yearly, or custom")
        return cycle


class ChangePlanBody(BaseModel):
    plan_code: str

    @field_validator("plan_code")
    @classmethod
    def normalize_plan_code(cls, v: str) -> str:
        return (v or "").strip().lower()


class SubscriptionStatusBody(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        status = (v or "").strip().lower()
        if status not in {"active", "suspended", "cancelled"}:
            raise ValueError("status must be active, suspended, or cancelled")
        return status

class ExtendSubscriptionBody(BaseModel):
    days: int = Field(..., ge=1, le=3650)
    note: Optional[str] = None
    plan_code: Optional[str] = None


class ManualPaymentRequestBody(BaseModel):
    plan_code: str
    method: str = "bkash"  # bkash, nagad, rocket, bank, cash
    trx_id: str
    sender_number: str
    amount: float = Field(..., gt=0)
    months: int = Field(default=1, ge=1, le=120)
    note: Optional[str] = None

    @field_validator("plan_code")
    @classmethod
    def normalize_plan(cls, v: str) -> str:
        return (v or "").strip().lower()

    @field_validator("method")
    @classmethod
    def normalize_method(cls, v: str) -> str:
        return (v or "bkash").strip().lower()

    @field_validator("trx_id")
    @classmethod
    def require_trx(cls, v: str) -> str:
        s = (v or "").strip()
        if not s:
            raise ValueError("Transaction ID (TrxID) is required")
        return s

    @field_validator("sender_number")
    @classmethod
    def require_sender(cls, v: str) -> str:
        s = (v or "").strip()
        if not s:
            raise ValueError("Sender phone number / account is required")
        return s


class RejectPaymentRequestBody(BaseModel):
    reason: Optional[str] = None

