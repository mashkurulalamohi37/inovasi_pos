"""Typed event models and builders for inbound Referral Platform events (§8.3)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class BaseEvent(BaseModel):
    model_config = ConfigDict(extra="ignore")

    event_id: str = Field(default_factory=lambda: f"evt_{uuid.uuid4().hex[:16]}")
    schema_version: int = 1
    occurred_at: str = Field(default_factory=_utc_now_iso)

    def to_envelope(self) -> dict[str, Any]:
        data = self.model_dump(exclude={"event_id", "schema_version", "occurred_at"})
        return {
            "event_id": self.event_id,
            "event_type": self.get_event_type(),
            "schema_version": self.schema_version,
            "occurred_at": self.occurred_at,
            "data": data,
        }

    @classmethod
    def get_event_type(cls) -> str:
        raise NotImplementedError


class UserRegistered(BaseEvent):
    external_user_id: str
    registered_at: str
    signals: dict[str, Any] | None = None

    @classmethod
    def get_event_type(cls) -> str:
        return "user.registered"


class SubscriptionCreated(BaseEvent):
    subscription_id: str
    external_user_id: str
    plan_code: str
    status: str = "ACTIVE"
    period_start: str | None = None
    period_end: str | None = None
    metadata: dict[str, Any] | None = None

    @classmethod
    def get_event_type(cls) -> str:
        return "subscription.created"


class SubscriptionUpdated(BaseEvent):
    subscription_id: str
    external_user_id: str | None = None
    plan_code: str | None = None
    status: str | None = None
    period_start: str | None = None
    period_end: str | None = None

    @classmethod
    def get_event_type(cls) -> str:
        return "subscription.updated"


class SubscriptionCancelled(BaseEvent):
    subscription_id: str
    effective_at: str | None = None

    @classmethod
    def get_event_type(cls) -> str:
        return "subscription.cancelled"


class PaymentSucceeded(BaseEvent):
    payment_id: str
    external_user_id: str
    subscription_id: str | None = None
    plan_code: str | None = "starter"
    billing_reason: Literal["initial", "renewal", "upgrade", "one_time"] = "initial"
    currency: str = "BDT"
    amount_gross: int  # in poisha (1 BDT = 100 poisha)
    discount_amount: int = 0
    tax_amount: int = 0
    credit_applied_amount: int = 0
    credit_reservation_id: str | None = None
    amount_net_paid: int | None = None
    amount_minor: int | None = None
    paid_at: str | None = None
    payment_fingerprint: str | None = None
    product_slug: str = "pulsepos"

    @classmethod
    def get_event_type(cls) -> str:
        return "payment.succeeded"

    def to_envelope(self) -> dict[str, Any]:
        minor = self.amount_minor if self.amount_minor is not None else (self.amount_net_paid if self.amount_net_paid is not None else self.amount_gross)
        net_paid = self.amount_net_paid if self.amount_net_paid is not None else minor
        paid_dt = self.paid_at or self.occurred_at

        data: dict[str, Any] = {
            "payment_id": self.payment_id,
            "amount_minor": minor,
            "currency": self.currency,
            "subscription_id": self.subscription_id,
            "external_user_id": self.external_user_id,
            "plan_code": self.plan_code or "starter",
            "billing_reason": self.billing_reason,
            "amount_gross": self.amount_gross,
            "discount_amount": self.discount_amount,
            "tax_amount": self.tax_amount,
            "credit_applied_amount": self.credit_applied_amount,
            "amount_net_paid": net_paid,
            "paid_at": paid_dt,
        }
        if self.credit_reservation_id:
            data["credit_reservation_id"] = self.credit_reservation_id
        if self.payment_fingerprint:
            data["payment_fingerprint"] = self.payment_fingerprint

        return {
            "event_id": self.event_id,
            "event_type": self.get_event_type(),
            "schema_version": self.schema_version,
            "occurred_at": self.occurred_at,
            "product_slug": self.product_slug,
            "customer": {
                "external_id": self.external_user_id,
            },
            "data": data,
        }


class PaymentRefunded(BaseEvent):
    refund_id: str
    payment_id: str
    amount_refunded: int  # in poisha
    external_user_id: str | None = None
    reason: str | None = None

    @classmethod
    def get_event_type(cls) -> str:
        return "payment.refunded"
