"""Integration platform models — connectors, inbox/outbox, OAuth state."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel

from app.models.base import TimestampMixin, new_uuid, utcnow


class IntegrationConnector(TimestampMixin, table=True):
    __tablename__ = "integration_connector"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    connector_code: str = Field(index=True)  # webhook, generic_oauth, etc.
    name: str
    status: str = "active"  # active, disabled, error
    config_json: Optional[str] = None
    oauth_access_token: Optional[str] = None
    oauth_refresh_token: Optional[str] = None
    oauth_expires_at: Optional[datetime] = None
    last_error: Optional[str] = None


class IntegrationInbox(TimestampMixin, table=True):
    __tablename__ = "integration_inbox"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    connector_id: Optional[str] = Field(default=None, foreign_key="integration_connector.id")
    event_type: str = Field(index=True)
    payload_json: str
    status: str = "pending"  # pending, processed, failed
    source: str = "webhook"
    error_message: Optional[str] = None
    processed_at: Optional[datetime] = None


class IntegrationOutbox(TimestampMixin, table=True):
    __tablename__ = "integration_outbox"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    connector_id: str = Field(foreign_key="integration_connector.id", index=True)
    event_type: str = Field(index=True)
    payload_json: str
    status: str = "pending"  # pending, sent, failed
    attempts: int = 0
    last_error: Optional[str] = None
    next_retry_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None


class IntegrationOAuthState(SQLModel, table=True):
    __tablename__ = "integration_oauth_state"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    connector_id: str = Field(foreign_key="integration_connector.id", index=True)
    state: str = Field(unique=True, index=True)
    redirect_uri: Optional[str] = None
    expires_at: datetime = Field(default_factory=utcnow)
    created_at: datetime = Field(default_factory=utcnow)
