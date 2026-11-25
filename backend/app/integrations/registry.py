"""Connector registry — available integration types."""

from __future__ import annotations

from typing import Any

CONNECTOR_REGISTRY: dict[str, dict[str, Any]] = {
    "webhook": {
        "code": "webhook",
        "name": "Outbound Webhook",
        "description": "POST sale and inventory events to your HTTPS endpoint",
        "auth_type": "secret",
        "config_schema": {
            "url": {"type": "string", "required": True},
            "secret": {"type": "string", "required": False},
            "events": {"type": "array", "default": ["sale.completed"]},
        },
        "events": ["sale.completed", "purchase.received", "stock.low"],
    },
    "generic_oauth": {
        "code": "generic_oauth",
        "name": "OAuth2 Connector",
        "description": "Connect via OAuth2 authorization code flow",
        "auth_type": "oauth2",
        "config_schema": {
            "authorize_url": {"type": "string", "required": True},
            "token_url": {"type": "string", "required": True},
            "client_id": {"type": "string", "required": True},
            "client_secret": {"type": "string", "required": True},
            "scopes": {"type": "string", "default": "read write"},
        },
        "events": [],
    },
}


def list_connectors_registry() -> list[dict[str, Any]]:
    return [
        {
            "code": c["code"],
            "name": c["name"],
            "description": c["description"],
            "auth_type": c["auth_type"],
            "events": c.get("events", []),
        }
        for c in CONNECTOR_REGISTRY.values()
    ]


def get_connector_def(code: str) -> dict[str, Any] | None:
    return CONNECTOR_REGISTRY.get(code)
