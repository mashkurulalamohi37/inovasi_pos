from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(dt: datetime | None) -> datetime | None:
    """Normalize datetimes for safe comparison (naive values treated as UTC)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def parse_iso_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return as_utc(datetime.fromisoformat(value.replace("Z", "+00:00")))
    except ValueError:
        return None


def new_uuid() -> str:
    return str(uuid.uuid4())


class TimestampMixin(SQLModel):
    created_at: datetime | None = Field(default_factory=utcnow, nullable=False)
    updated_at: datetime | None = Field(default_factory=utcnow, nullable=False)


class TenantMixin(SQLModel):
    company_id: str = Field(index=True, foreign_key="company.id")
