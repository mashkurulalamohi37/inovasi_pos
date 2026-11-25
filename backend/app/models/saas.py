"""SaaS platform models: subscriptions, devices, notifications, approvals."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel

from app.models.base import TimestampMixin, new_uuid, utcnow


class SubscriptionPlan(TimestampMixin, table=True):
    __tablename__ = "subscription_plan"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    code: str = Field(unique=True, index=True)  # starter, professional, enterprise
    name: str
    max_stores: int = 1
    max_counters: int = 2
    max_users: int = 2
    max_industry_packs: int = 1
    advanced_reports: bool = False
    offline_sync: bool = False
    api_integration: bool = False
    price_monthly: float = 0
    is_active: bool = True


class TenantSubscription(TimestampMixin, table=True):
    __tablename__ = "tenant_subscription"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True, unique=True)
    plan_id: str = Field(foreign_key="subscription_plan.id", index=True)
    status: str = "active"  # active, suspended, cancelled, pending_approval
    billing_cycle: str = "monthly"  # monthly, yearly, custom
    started_at: datetime = Field(default_factory=utcnow)
    expires_at: Optional[datetime] = None


class SubscriptionUsage(TimestampMixin, table=True):
    __tablename__ = "subscription_usage"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    metric: str = Field(index=True)  # stores, counters, users, industry_packs
    current_value: float = 0
    limit_value: float = 0
    updated_at: datetime = Field(default_factory=utcnow)


class SubscriptionInvoice(TimestampMixin, table=True):
    __tablename__ = "subscription_invoice"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    invoice_number: str
    amount: float = 0
    status: str = "pending"
    due_date: Optional[datetime] = None


class SubscriptionPayment(TimestampMixin, table=True):
    __tablename__ = "subscription_payment"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    invoice_id: Optional[str] = Field(default=None, foreign_key="subscription_invoice.id")
    amount: float = 0
    method: str = "bank"
    paid_at: datetime = Field(default_factory=utcnow)


class PosDevice(TimestampMixin, table=True):
    __tablename__ = "pos_device"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    device_id: str = Field(index=True)
    device_name: str
    company_id: str = Field(foreign_key="company.id", index=True)
    store_id: Optional[str] = Field(default=None, foreign_key="store.id")
    counter_id: Optional[str] = Field(default=None, foreign_key="counter.id")
    device_type: str = "browser"
    browser_fingerprint: Optional[str] = None
    status: str = "pending"  # pending, approved, blocked
    last_seen_at: Optional[datetime] = None
    registered_by: Optional[str] = None


class DeviceSession(SQLModel, table=True):
    __tablename__ = "device_session"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    device_id: str = Field(foreign_key="pos_device.id", index=True)
    user_id: Optional[str] = Field(default=None, foreign_key="user_account.id")
    started_at: datetime = Field(default_factory=utcnow)
    ended_at: Optional[datetime] = None


class Notification(TimestampMixin, table=True):
    __tablename__ = "notification"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    user_id: Optional[str] = Field(default=None, foreign_key="user_account.id")
    event_type: str
    title: str
    message: str
    link: Optional[str] = None
    is_read: bool = False


class NotificationPreference(TimestampMixin, table=True):
    __tablename__ = "notification_preference"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    user_id: str = Field(foreign_key="user_account.id", index=True)
    event_type: str
    enabled: bool = True


class ApprovalRequest(TimestampMixin, table=True):
    __tablename__ = "approval_request"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    request_type: str  # purchase, discount, return, refund, stock_adjust, restricted_medicine, device
    entity_type: str
    entity_id: Optional[str] = None
    requested_by: str = Field(foreign_key="user_account.id")
    status: str = "pending"  # pending, approved, rejected
    title: str
    detail_json: Optional[str] = None
    resolved_by: Optional[str] = None
    resolved_at: Optional[datetime] = None
    comment: Optional[str] = None


class ApprovalAction(TimestampMixin, table=True):
    __tablename__ = "approval_action"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    request_id: str = Field(foreign_key="approval_request.id", index=True)
    action: str  # approve, reject
    actor_id: str = Field(foreign_key="user_account.id")
    comment: Optional[str] = None


class LoginAttempt(SQLModel, table=True):
    __tablename__ = "login_attempt"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    email: str = Field(index=True)
    ip_address: Optional[str] = None
    failed_count: int = 0
    locked_until: Optional[datetime] = None
    last_attempt_at: datetime = Field(default_factory=utcnow)


class RevokedToken(SQLModel, table=True):
    __tablename__ = "revoked_token"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    token_jti: str = Field(unique=True, index=True)
    revoked_at: datetime = Field(default_factory=utcnow)
    reason: Optional[str] = None


class SupportImpersonation(TimestampMixin, table=True):
    __tablename__ = "support_impersonation"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    platform_user_id: str = Field(foreign_key="user_account.id")
    target_company_id: str = Field(foreign_key="company.id")
    target_user_id: str = Field(foreign_key="user_account.id")
    expires_at: datetime
    is_active: bool = True
    reason: Optional[str] = None
