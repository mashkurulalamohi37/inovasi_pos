"""Integration platform — connectors, inbox/outbox, OAuth."""

from __future__ import annotations

import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException
from sqlmodel import Session, select

from app.integrations.adapters.webhook import deliver_webhook
from app.integrations.registry import CONNECTOR_REGISTRY, get_connector_def, list_connectors_registry
from app.models.integrations import (
    IntegrationConnector,
    IntegrationInbox,
    IntegrationOAuthState,
    IntegrationOutbox,
)
from app.services.subscription_service import get_current_subscription


def require_api_integration(session: Session, company_id: str) -> None:
    sub = get_current_subscription(session, company_id)
    if not sub.get("limits", {}).get("api_integration"):
        raise HTTPException(
            status_code=403,
            detail="API integrations require an Enterprise subscription.",
        )


def list_registry() -> list[dict[str, Any]]:
    return list_connectors_registry()


def _parse_config(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def _connector_out(row: IntegrationConnector) -> dict[str, Any]:
    return {
        "id": row.id,
        "connector_code": row.connector_code,
        "name": row.name,
        "status": row.status,
        "config": _parse_config(row.config_json),
        "oauth_connected": bool(row.oauth_access_token),
        "last_error": row.last_error,
        "created_at": row.created_at,
    }


def list_connectors(session: Session, company_id: str) -> list[dict[str, Any]]:
    rows = session.exec(
        select(IntegrationConnector).where(IntegrationConnector.company_id == company_id)
    ).all()
    return [_connector_out(r) for r in rows]


def create_connector(
    session: Session,
    company_id: str,
    connector_code: str,
    name: str,
    config: dict[str, Any],
    status: str = "active",
) -> dict[str, Any]:
    require_api_integration(session, company_id)
    definition = get_connector_def(connector_code)
    if not definition:
        raise HTTPException(status_code=400, detail="Unknown connector type")
    if connector_code == "webhook" and not config.get("url"):
        raise HTTPException(status_code=400, detail="Webhook URL is required")
    row = IntegrationConnector(
        company_id=company_id,
        connector_code=connector_code,
        name=name,
        status=status,
        config_json=json.dumps(config),
    )
    session.add(row)
    session.flush()
    return _connector_out(row)


def update_connector(
    session: Session,
    company_id: str,
    connector_id: str,
    *,
    name: str | None = None,
    config: dict[str, Any] | None = None,
    status: str | None = None,
) -> dict[str, Any]:
    row = session.get(IntegrationConnector, connector_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Connector not found")
    if name is not None:
        row.name = name
    if config is not None:
        if row.connector_code == "webhook" and not config.get("url"):
            raise HTTPException(status_code=400, detail="Webhook URL is required")
        row.config_json = json.dumps(config)
    if status is not None:
        row.status = status
    session.add(row)
    session.flush()
    return _connector_out(row)


def delete_connector(session: Session, company_id: str, connector_id: str) -> None:
    row = session.get(IntegrationConnector, connector_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Connector not found")
    session.delete(row)


def _connector_subscribed(config: dict[str, Any], event_type: str, definition: dict[str, Any]) -> bool:
    events = config.get("events")
    if not events:
        events = definition.get("events", [])
    return event_type in events


def enqueue_company_event(
    session: Session,
    company_id: str,
    event_type: str,
    payload: dict[str, Any],
) -> int:
    """Fan-out event to all active connectors that subscribe to it."""
    connectors = session.exec(
        select(IntegrationConnector).where(
            IntegrationConnector.company_id == company_id,
            IntegrationConnector.status == "active",
        )
    ).all()
    count = 0
    body = json.dumps(payload, default=str)
    for conn in connectors:
        definition = get_connector_def(conn.connector_code) or {}
        config = _parse_config(conn.config_json)
        if conn.connector_code != "webhook":
            continue
        if not _connector_subscribed(config, event_type, definition):
            continue
        session.add(
            IntegrationOutbox(
                company_id=company_id,
                connector_id=conn.id,
                event_type=event_type,
                payload_json=body,
                status="pending",
            )
        )
        count += 1
    session.flush()
    return count


def _deliver_outbox_row(session: Session, row: IntegrationOutbox, conn: IntegrationConnector) -> bool:
    config = _parse_config(conn.config_json)
    payload = json.loads(row.payload_json)
    envelope = {
        "event": row.event_type,
        "company_id": row.company_id,
        "connector_id": row.connector_id,
        "payload": payload,
        "sent_at": datetime.now(timezone.utc).isoformat(),
    }
    ok, err = deliver_webhook(str(config.get("url")), envelope, config.get("secret"))
    row.attempts += 1
    if ok:
        row.status = "sent"
        row.sent_at = datetime.now(timezone.utc)
        row.last_error = None
        conn.last_error = None
    else:
        row.status = "failed"
        row.last_error = err
        row.next_retry_at = datetime.now(timezone.utc) + timedelta(minutes=min(row.attempts * 5, 60))
        conn.last_error = err
        conn.status = "error"
    session.add(row)
    session.add(conn)
    return ok


def process_outbox(session: Session, company_id: str, limit: int = 50) -> dict[str, int]:
    rows = session.exec(
        select(IntegrationOutbox).where(
            IntegrationOutbox.company_id == company_id,
            IntegrationOutbox.status.in_(["pending", "failed"]),  # type: ignore[attr-defined]
        ).order_by(IntegrationOutbox.created_at).limit(limit)  # type: ignore[arg-type]
    ).all()
    processed = failed = 0
    for row in rows:
        conn = session.get(IntegrationConnector, row.connector_id)
        if not conn or conn.status == "disabled":
            row.status = "failed"
            row.last_error = "Connector disabled or missing"
            session.add(row)
            failed += 1
            continue
        if _deliver_outbox_row(session, row, conn):
            processed += 1
        else:
            failed += 1
    session.flush()
    return {"processed": processed, "failed": failed}


def list_outbox(session: Session, company_id: str, limit: int = 100) -> list[dict[str, Any]]:
    rows = session.exec(
        select(IntegrationOutbox)
        .where(IntegrationOutbox.company_id == company_id)
        .order_by(IntegrationOutbox.created_at.desc())  # type: ignore[attr-defined]
        .limit(limit)
    ).all()
    return [
        {
            "id": r.id,
            "connector_id": r.connector_id,
            "event_type": r.event_type,
            "status": r.status,
            "attempts": r.attempts,
            "last_error": r.last_error,
            "sent_at": r.sent_at,
            "created_at": r.created_at,
        }
        for r in rows
    ]


def receive_inbox(
    session: Session,
    company_id: str,
    event_type: str,
    payload: dict[str, Any],
    *,
    connector_id: str | None = None,
    source: str = "webhook",
) -> dict[str, Any]:
    row = IntegrationInbox(
        company_id=company_id,
        connector_id=connector_id,
        event_type=event_type,
        payload_json=json.dumps(payload, default=str),
        status="pending",
        source=source,
    )
    session.add(row)
    session.flush()
    return {"id": row.id, "status": row.status}


def process_inbox(session: Session, company_id: str, limit: int = 50) -> dict[str, int]:
    rows = session.exec(
        select(IntegrationInbox).where(
            IntegrationInbox.company_id == company_id,
            IntegrationInbox.status == "pending",
        ).order_by(IntegrationInbox.created_at).limit(limit)  # type: ignore[arg-type]
    ).all()
    processed = failed = 0
    for row in rows:
        try:
            # Pilot: mark received events as processed (extend per event_type later).
            _ = json.loads(row.payload_json)
            row.status = "processed"
            row.processed_at = datetime.now(timezone.utc)
            processed += 1
        except Exception as exc:  # noqa: BLE001
            row.status = "failed"
            row.error_message = str(exc)
            failed += 1
        session.add(row)
    session.flush()
    return {"processed": processed, "failed": failed}


def list_inbox(session: Session, company_id: str, limit: int = 100) -> list[dict[str, Any]]:
    rows = session.exec(
        select(IntegrationInbox)
        .where(IntegrationInbox.company_id == company_id)
        .order_by(IntegrationInbox.created_at.desc())  # type: ignore[attr-defined]
        .limit(limit)
    ).all()
    return [
        {
            "id": r.id,
            "connector_id": r.connector_id,
            "event_type": r.event_type,
            "status": r.status,
            "source": r.source,
            "error_message": r.error_message,
            "processed_at": r.processed_at,
            "created_at": r.created_at,
        }
        for r in rows
    ]


def oauth_start(session: Session, company_id: str, connector_id: str, redirect_uri: str | None) -> dict[str, str]:
    require_api_integration(session, company_id)
    conn = session.get(IntegrationConnector, connector_id)
    if not conn or conn.company_id != company_id:
        raise HTTPException(status_code=404, detail="Connector not found")
    if conn.connector_code != "generic_oauth":
        raise HTTPException(status_code=400, detail="Connector does not support OAuth")
    config = _parse_config(conn.config_json)
    state = secrets.token_urlsafe(24)
    expires = datetime.now(timezone.utc) + timedelta(minutes=15)
    session.add(
        IntegrationOAuthState(
            company_id=company_id,
            connector_id=connector_id,
            state=state,
            redirect_uri=redirect_uri,
            expires_at=expires,
        )
    )
    params = {
        "response_type": "code",
        "client_id": config.get("client_id", ""),
        "redirect_uri": redirect_uri or "",
        "scope": config.get("scopes", "read write"),
        "state": state,
    }
    authorize_url = f"{config.get('authorize_url')}?{urlencode(params)}"
    session.flush()
    return {"authorize_url": authorize_url, "state": state}


def oauth_callback(session: Session, company_id: str, state: str, code: str) -> dict[str, Any]:
    oauth_state = session.exec(
        select(IntegrationOAuthState).where(IntegrationOAuthState.state == state)
    ).first()
    if not oauth_state or oauth_state.company_id != company_id:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")
    if oauth_state.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="OAuth state expired")
    conn = session.get(IntegrationConnector, oauth_state.connector_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connector not found")
    config = _parse_config(conn.config_json)
    token_url = config.get("token_url")
    if not token_url:
        raise HTTPException(status_code=400, detail="token_url not configured")
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "client_id": config.get("client_id"),
        "client_secret": config.get("client_secret"),
        "redirect_uri": oauth_state.redirect_uri or "",
    }
    try:
        with httpx.Client(timeout=20.0) as client:
            res = client.post(token_url, data=data)
        if res.status_code >= 400:
            raise HTTPException(status_code=400, detail=f"Token exchange failed: {res.text[:200]}")
        tokens = res.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    conn.oauth_access_token = tokens.get("access_token")
    conn.oauth_refresh_token = tokens.get("refresh_token")
    expires_in = tokens.get("expires_in")
    if expires_in:
        conn.oauth_expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))
    conn.last_error = None
    session.add(conn)
    session.delete(oauth_state)
    session.flush()
    return _connector_out(conn)
