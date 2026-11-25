"""Referral & Commission Platform Client for Pulse POS."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any

import httpx

from app.integrations.referral.events import BaseEvent
from app.integrations.referral.exceptions import (
    AuthenticationError,
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
    RateLimitError,
    ReferralSDKError,
    ServerError,
    ValidationError,
)
from app.integrations.referral.models import (
    AttributionRequest,
    AttributionResponse,
    CreditBalanceResponse,
    CreditReservationRequest,
    CreditReservationResponse,
    Signals,
)

logger = logging.getLogger("referral_client")


def compute_signature(signing_secret: str, timestamp: int, raw_body: bytes) -> str:
    """Computes HMAC-SHA256 signature for event intake.

    Header format: v1=<hex HMAC-SHA256(signing_secret, timestamp + "." + raw_body)>
    """
    message = f"{timestamp}.".encode("utf-8") + raw_body
    digest = hmac.new(signing_secret.encode("utf-8"), message, hashlib.sha256).hexdigest()
    return f"v1={digest}"


class ReferralClient:
    """Async client for interacting with the Referral & Commission Platform."""

    def __init__(
        self,
        base_url: str,
        key_id: str,
        secret: str,
        signing_secret: str,
        timeout: float = 8.0,
        max_retries: int = 3,
    ):
        self.base_url = base_url.rstrip("/")
        self.key_id = key_id
        self.secret = secret
        self.signing_secret = signing_secret
        self.timeout = timeout
        self.max_retries = max_retries
        self._auth_header = f"Bearer {key_id}.{secret}"

    def _build_signed_headers(self, raw_body: bytes) -> dict[str, str]:
        timestamp = int(time.time())
        signature = compute_signature(self.signing_secret, timestamp, raw_body)
        return {
            "Authorization": self._auth_header,
            "Content-Type": "application/json",
            "X-Signature-Timestamp": str(timestamp),
            "X-Signature": signature,
        }

    def _handle_error_response(self, response: httpx.Response) -> None:
        status = response.status_code
        try:
            body = response.json()
            err_info = body.get("error", {}) if isinstance(body, dict) else {}
            msg = err_info.get("message") or response.text
            code = err_info.get("code")
            details = err_info.get("details")
        except Exception:
            msg = response.text
            code = None
            details = None

        if status == 401:
            raise AuthenticationError(msg, code, details)
        elif status == 403:
            raise PermissionDeniedError(msg, code, details)
        elif status == 404:
            raise NotFoundError(msg, code, details)
        elif status == 409:
            raise ConflictError(msg, code, details)
        elif status == 422:
            raise ValidationError(msg, code, details)
        elif status == 429:
            raise RateLimitError(msg, code, details)
        elif status >= 500:
            raise ServerError(msg, code, details)
        else:
            raise ReferralSDKError(msg, code, details)

    async def _request_with_retry(
        self,
        method: str,
        path: str,
        content: bytes | None = None,
        headers: dict[str, str] | None = None,
        params: dict[str, Any] | None = None,
    ) -> httpx.Response:
        url = f"{self.base_url}{path}"
        req_headers = {
            "Authorization": self._auth_header,
            "Content-Type": "application/json",
        }
        if headers:
            req_headers.update(headers)

        last_exc: Exception | None = None
        for attempt in range(self.max_retries):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    resp = await client.request(
                        method=method,
                        url=url,
                        content=content,
                        headers=req_headers,
                        params=params,
                    )
                    if resp.status_code >= 500 and attempt < self.max_retries - 1:
                        await self._backoff(attempt)
                        continue
                    if not resp.is_success:
                        self._handle_error_response(resp)
                    return resp
            except (httpx.ConnectError, httpx.TimeoutException, ServerError) as exc:
                last_exc = exc
                if attempt < self.max_retries - 1:
                    await self._backoff(attempt)
                    continue
                raise
            except ReferralSDKError:
                raise
            except Exception as exc:
                last_exc = exc
                if attempt < self.max_retries - 1:
                    await self._backoff(attempt)
                    continue
                raise ReferralSDKError(str(exc)) from exc

        raise ReferralSDKError(f"Request failed after {self.max_retries} attempts") from last_exc

    async def _backoff(self, attempt: int) -> None:
        import asyncio
        delay = 0.1 * (2 ** attempt)
        await asyncio.sleep(delay)

    async def attribute(
        self,
        external_user_id: str,
        registered_at: datetime | str,
        referral_code: str | None = None,
        attribution_token: str | None = None,
        signals: Signals | dict[str, Any] | None = None,
        fail_soft: bool = True,
    ) -> AttributionResponse | None:
        """Attributes a new or existing user to a referral code or token.

        Fails soft by default: Returns None on any error so customer signup is never blocked.
        """
        if isinstance(registered_at, str):
            dt_str = registered_at
        else:
            dt_str = registered_at.astimezone(timezone.utc).isoformat()

        sig_dict = signals.model_dump(exclude_none=True) if isinstance(signals, Signals) else (signals or {})

        payload: dict[str, Any] = {
            "external_user_id": external_user_id,
            "registered_at": dt_str,
        }
        if referral_code:
            payload["referral_code"] = referral_code.strip().upper()
        if attribution_token:
            payload["attribution_token"] = attribution_token.strip()
        if sig_dict:
            payload["signals"] = sig_dict

        try:
            body_bytes = json.dumps(payload).encode("utf-8")
            resp = await self._request_with_retry("POST", "/v1/attributions", content=body_bytes)
            data = resp.json()
            return AttributionResponse(**data)
        except Exception as exc:
            logger.warning("Referral attribution call failed: %s", exc)
            if fail_soft:
                return None
            raise

    async def create_handoff(
        self,
        external_user_id: str,
        display_name: str | None = None,
        email: str | None = None,
        phone: str | None = None,
        product_slug: str = "pulsepos",
    ) -> dict[str, Any]:
        """Requests an SSO handoff token from the Central Referral & Support Platform."""
        payload: dict[str, Any] = {
            "product_slug": product_slug,
            "external_user_id": str(external_user_id),
        }
        if display_name:
            payload["display_name"] = display_name
        if email:
            payload["email"] = email
        if phone:
            payload["phone"] = phone

        body_bytes = json.dumps(payload).encode("utf-8")
        resp = await self._request_with_retry("POST", "/v1/auth/handoff", content=body_bytes)
        return resp.json()

    async def send_event(self, event: BaseEvent | dict[str, Any]) -> dict[str, Any]:
        """Sends an HMAC-signed event into the platform's transactional intake pipeline."""
        if hasattr(event, "to_envelope"):
            envelope = event.to_envelope()
        elif isinstance(event, dict):
            envelope = event
        else:
            envelope = dict(event)
        raw_body = json.dumps(envelope).encode("utf-8")
        headers = self._build_signed_headers(raw_body)
        resp = await self._request_with_retry("POST", "/v1/events", content=raw_body, headers=headers)
        return resp.json() if resp.content else {"accepted": True}

    async def get_credit_balance(self, external_user_id: str, currency: str = "BDT") -> CreditBalanceResponse:
        """Retrieves spendable referral credit balance for a tenant/user."""
        try:
            resp = await self._request_with_retry(
                "GET",
                "/v1/credits/balance",
                params={"external_user_id": external_user_id, "currency": currency},
            )
            return CreditBalanceResponse(**resp.json())
        except Exception as exc:
            logger.warning("Failed to fetch referral credit balance: %s", exc)
            return CreditBalanceResponse(spendable_minor=0, credit_only_minor=0, available_minor=0, currency=currency)

    async def reserve_credit(
        self,
        external_user_id: str,
        requested_amount: int,
        order_ref: str,
        currency: str = "BDT",
    ) -> CreditReservationResponse:
        """Reserves referral credits for subscription checkout."""
        import uuid
        payload = {
            "external_user_id": external_user_id,
            "requested_amount": requested_amount,
            "order_ref": order_ref,
            "idempotency_key": f"resv_{uuid.uuid4().hex[:12]}",
            "currency": currency,
        }
        body_bytes = json.dumps(payload).encode("utf-8")
        resp = await self._request_with_retry("POST", "/v1/credits/reservations", content=body_bytes)
        return CreditReservationResponse(**resp.json())

    async def capture_credit(
        self,
        reservation_id: str,
        amount_minor: int | None = None,
        payment_id: str | None = None,
    ) -> dict[str, Any]:
        """Captures a previously reserved credit."""
        payload: dict[str, Any] = {}
        if amount_minor is not None:
            payload["amount_minor"] = amount_minor
        if payment_id is not None:
            payload["payment_id"] = payment_id

        body_bytes = json.dumps(payload).encode("utf-8") if payload else None
        resp = await self._request_with_retry(
            "POST",
            f"/v1/credits/reservations/{reservation_id}/capture",
            content=body_bytes,
        )
        return resp.json() if resp.content else {"state": "CAPTURED"}

    async def release_credit(self, reservation_id: str) -> dict[str, Any]:
        """Releases an unconsumed credit reservation back to the user's spendable balance."""
        resp = await self._request_with_retry("POST", f"/v1/credits/reservations/{reservation_id}/release")
        return resp.json() if resp.content else {"state": "RELEASED"}
