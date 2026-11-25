"""Integrations API — connector registry, inbox/outbox, OAuth."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from app.database import get_session
from app.dependencies import AuthContext, get_current_user, require_permission
from app.schemas.integrations import (
    ConnectorCreate,
    ConnectorOut,
    ConnectorRegistryOut,
    ConnectorUpdate,
    InboxOut,
    InboxReceive,
    OAuthCallbackIn,
    OAuthStartOut,
    OutboxOut,
    ProcessResultOut,
)
from app.services import integration_service as svc

router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.get("/registry", response_model=list[ConnectorRegistryOut])
def get_registry(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    svc.require_api_integration(session, auth.company_id)
    return svc.list_registry()


@router.get("/connectors", response_model=list[ConnectorOut])
def list_connectors(
    auth: Annotated[AuthContext, Depends(require_permission("config.integrations"))],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.list_connectors(session, auth.company_id)


@router.post("/connectors", response_model=ConnectorOut)
def create_connector(
    body: ConnectorCreate,
    auth: Annotated[AuthContext, Depends(require_permission("config.integrations"))],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.create_connector(
        session,
        auth.company_id,
        body.connector_code,
        body.name,
        body.config,
        body.status,
    )


@router.patch("/connectors/{connector_id}", response_model=ConnectorOut)
def update_connector(
    connector_id: str,
    body: ConnectorUpdate,
    auth: Annotated[AuthContext, Depends(require_permission("config.integrations"))],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.update_connector(
        session,
        auth.company_id,
        connector_id,
        name=body.name,
        config=body.config,
        status=body.status,
    )


@router.delete("/connectors/{connector_id}", status_code=204)
def delete_connector(
    connector_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("config.integrations"))],
    session: Annotated[Session, Depends(get_session)],
):
    svc.delete_connector(session, auth.company_id, connector_id)


@router.get("/outbox", response_model=list[OutboxOut])
def list_outbox(
    auth: Annotated[AuthContext, Depends(require_permission("config.integrations"))],
    session: Annotated[Session, Depends(get_session)],
    limit: int = Query(100, ge=1, le=500),
):
    return svc.list_outbox(session, auth.company_id, limit)


@router.post("/outbox/process", response_model=ProcessResultOut)
def process_outbox(
    auth: Annotated[AuthContext, Depends(require_permission("config.integrations"))],
    session: Annotated[Session, Depends(get_session)],
    limit: int = Query(50, ge=1, le=200),
):
    return svc.process_outbox(session, auth.company_id, limit)


@router.get("/inbox", response_model=list[InboxOut])
def list_inbox(
    auth: Annotated[AuthContext, Depends(require_permission("config.integrations"))],
    session: Annotated[Session, Depends(get_session)],
    limit: int = Query(100, ge=1, le=500),
):
    return svc.list_inbox(session, auth.company_id, limit)


@router.post("/inbox", response_model=InboxOut)
def receive_inbox(
    body: InboxReceive,
    auth: Annotated[AuthContext, Depends(require_permission("config.integrations"))],
    session: Annotated[Session, Depends(get_session)],
):
    row = svc.receive_inbox(
        session,
        auth.company_id,
        body.event_type,
        body.payload,
        source=body.source,
    )
    return {
        "id": row["id"],
        "connector_id": None,
        "event_type": body.event_type,
        "status": row["status"],
        "source": body.source,
        "error_message": None,
        "processed_at": None,
        "created_at": None,
    }


@router.post("/inbox/process", response_model=ProcessResultOut)
def process_inbox(
    auth: Annotated[AuthContext, Depends(require_permission("config.integrations"))],
    session: Annotated[Session, Depends(get_session)],
    limit: int = Query(50, ge=1, le=200),
):
    return svc.process_inbox(session, auth.company_id, limit)


@router.post("/oauth/{connector_id}/start", response_model=OAuthStartOut)
def oauth_start(
    connector_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("config.integrations"))],
    session: Annotated[Session, Depends(get_session)],
    redirect_uri: str | None = None,
):
    return svc.oauth_start(session, auth.company_id, connector_id, redirect_uri)


@router.post("/oauth/callback", response_model=ConnectorOut)
def oauth_callback(
    body: OAuthCallbackIn,
    auth: Annotated[AuthContext, Depends(require_permission("config.integrations"))],
    session: Annotated[Session, Depends(get_session)],
):
    return svc.oauth_callback(session, auth.company_id, body.state, body.code)


@router.post("/connectors/{connector_id}/inbox", response_model=InboxOut)
def connector_inbox_webhook(
    connector_id: str,
    body: InboxReceive,
    session: Annotated[Session, Depends(get_session)],
    company_id: str = Query(..., description="Tenant company id for webhook routing"),
    secret: str | None = Query(None),
):
    """Public-ish inbound webhook — validated by connector secret in config."""
    from app.models.integrations import IntegrationConnector

    conn = session.get(IntegrationConnector, connector_id)
    if not conn or conn.company_id != company_id:
        raise HTTPException(status_code=404, detail="Connector not found")
    config = svc._parse_config(conn.config_json)  # noqa: SLF001
    expected = config.get("secret")
    if expected and secret != expected:
        raise HTTPException(status_code=401, detail="Invalid webhook secret")
    row = svc.receive_inbox(
        session,
        company_id,
        body.event_type,
        body.payload,
        connector_id=connector_id,
        source=body.source,
    )
    return {
        "id": row["id"],
        "connector_id": connector_id,
        "event_type": body.event_type,
        "status": row["status"],
        "source": body.source,
        "error_message": None,
        "processed_at": None,
        "created_at": None,
    }
