"""Integration platform schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class ConnectorRegistryOut(BaseModel):
    code: str
    name: str
    description: str
    auth_type: str
    events: list[str]


class ConnectorCreate(BaseModel):
    connector_code: str
    name: str
    config: dict[str, Any] = Field(default_factory=dict)
    status: str = "active"


class ConnectorUpdate(BaseModel):
    name: Optional[str] = None
    config: Optional[dict[str, Any]] = None
    status: Optional[str] = None


class ConnectorOut(BaseModel):
    id: str
    connector_code: str
    name: str
    status: str
    config: dict[str, Any]
    oauth_connected: bool
    last_error: Optional[str] = None
    created_at: Optional[datetime] = None


class OutboxOut(BaseModel):
    id: str
    connector_id: str
    event_type: str
    status: str
    attempts: int
    last_error: Optional[str] = None
    sent_at: Optional[datetime] = None
    created_at: Optional[datetime] = None


class InboxOut(BaseModel):
    id: str
    connector_id: Optional[str] = None
    event_type: str
    status: str
    source: str
    error_message: Optional[str] = None
    processed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None


class InboxReceive(BaseModel):
    event_type: str
    payload: dict[str, Any] = Field(default_factory=dict)
    source: str = "webhook"


class OAuthStartOut(BaseModel):
    authorize_url: str
    state: str


class OAuthCallbackIn(BaseModel):
    state: str
    code: str


class ProcessResultOut(BaseModel):
    processed: int
    failed: int
