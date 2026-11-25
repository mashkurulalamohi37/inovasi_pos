"""Webhook outbound adapter."""

from __future__ import annotations

import hashlib
import hmac
import json
from typing import Any

import httpx


def deliver_webhook(url: str, payload: dict[str, Any], secret: str | None = None) -> tuple[bool, str | None]:
    body = json.dumps(payload, default=str)
    headers = {"Content-Type": "application/json", "User-Agent": "PulsePOS-Webhook/1.0"}
    if secret:
        sig = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
        headers["X-Pulse-Signature"] = f"sha256={sig}"
    try:
        with httpx.Client(timeout=15.0) as client:
            res = client.post(url, content=body, headers=headers)
        if res.status_code >= 400:
            return False, f"HTTP {res.status_code}: {res.text[:200]}"
        return True, None
    except httpx.HTTPError as exc:
        return False, str(exc)
