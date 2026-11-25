"""Audit log."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel

from app.models.base import new_uuid, utcnow


class AuditLog(SQLModel, table=True):
    __tablename__ = "audit_log"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    user_id: Optional[str] = None
    store_id: Optional[str] = None
    action: str = Field(index=True)
    entity_type: str
    entity_id: Optional[str] = None
    detail_json: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)
