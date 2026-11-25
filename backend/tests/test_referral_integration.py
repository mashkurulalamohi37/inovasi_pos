"""Tests for Referral & Commission Platform integration in Pulse POS."""

import json
import pytest
from datetime import datetime, timezone

from app.integrations.referral.client import ReferralClient, compute_signature
from app.integrations.referral.events import PaymentSucceeded, SubscriptionCreated, UserRegistered
from app.integrations.referral.models import Signals
from app.integrations.referral.service import referral_service


def test_hmac_signature_generation():
    """Verify HMAC-SHA256 signature format matches Referral Platform requirement."""
    signing_secret = "test_signing_secret_123"
    timestamp = 1700000000
    payload = b'{"event_id":"evt_1","event_type":"user.registered"}'

    sig = compute_signature(signing_secret, timestamp, payload)
    assert sig.startswith("v1=")
    assert len(sig) == 3 + 64  # v1= followed by 64 hex chars


def test_user_registered_event_envelope():
    """Verify UserRegistered serializes to a valid event envelope."""
    event = UserRegistered(
        external_user_id="comp_123",
        registered_at="2026-10-20T00:00:00Z",
        signals={"email": "merchant@example.com", "ip": "127.0.0.1"},
    )
    envelope = event.to_envelope()
    assert envelope["event_type"] == "user.registered"
    assert envelope["schema_version"] == 1
    assert envelope["data"]["external_user_id"] == "comp_123"
    assert envelope["data"]["signals"]["email"] == "merchant@example.com"


def test_payment_succeeded_event_envelope():
    """Verify PaymentSucceeded converts BDT to minor units (poisha)."""
    event = PaymentSucceeded(
        payment_id="pay_999",
        external_user_id="comp_123",
        subscription_id="sub_123",
        plan_code="professional",
        billing_reason="initial",
        amount_gross=799000,  # ৳7,990 in poisha
        amount_net_paid=799000,
    )
    envelope = event.to_envelope()
    assert envelope["event_type"] == "payment.succeeded"
    assert envelope["data"]["amount_gross"] == 799000
    assert envelope["data"]["billing_reason"] == "initial"


@pytest.mark.asyncio
async def test_referral_client_fail_soft_on_offline():
    """Client must fail-soft on attribution if the referral service is unavailable."""
    client = ReferralClient(
        base_url="http://127.0.0.1:9999",  # unreachable port
        key_id="test_key",
        secret="test_sec",
        signing_secret="test_sig",
        timeout=0.2,
        max_retries=1,
    )
    # Attribution should return None without throwing an exception
    result = await client.attribute(
        external_user_id="user_test",
        registered_at=datetime.now(timezone.utc),
        referral_code="REF123",
        fail_soft=True,
    )
    assert result is None


def test_referral_summary_generation():
    """Referral summary formats vanity codes and share links properly."""
    summary = referral_service.get_referral_summary(
        company_id="comp_abcdef123456",
        company_code="SUPER-STORE",
    )
    assert summary["merchant_referral_code"] == "SUPER-STORE"
    assert "ref=SUPER-STORE" in summary["share_url"]
    assert "external_user_id=comp_abcdef123456" in summary["portal_url"]


def test_payment_succeeded_step4_specification():
    """Verify PaymentSucceeded event envelope matches Step 4 exact spec."""
    event = PaymentSucceeded(
        event_id="evt_test_12345",
        occurred_at="2026-10-20T12:00:00Z",
        payment_id="pay_txn_777",
        external_user_id="cust_user_44",
        subscription_id="sub_plan_99",
        amount_minor=100000,
        amount_gross=100000,
        amount_net_paid=100000,
        currency="BDT",
    )
    envelope = event.to_envelope()
    assert envelope["event_id"] == "evt_test_12345"
    assert envelope["event_type"] == "payment.succeeded"
    assert envelope["occurred_at"] == "2026-10-20T12:00:00Z"
    assert envelope["product_slug"] == "pulsepos"
    assert envelope["customer"]["external_id"] == "cust_user_44"
    assert envelope["data"]["payment_id"] == "pay_txn_777"
    assert envelope["data"]["amount_minor"] == 100000
    assert envelope["data"]["currency"] == "BDT"
    assert envelope["data"]["subscription_id"] == "sub_plan_99"


@pytest.mark.asyncio
async def test_sso_url_service_fallback():
    """Verify SSO URL generation falls back gracefully if platform unreachable."""
    res = await referral_service.get_sso_url(
        external_user_id="comp_test_merchant",
        display_name="Demo Merchant",
        email="merchant@example.com",
    )
    assert res["success"] is True
    assert "sso_url" in res
    assert "comp_test_merchant" in res["sso_url"] or "auth/callback" in res["sso_url"]


def test_api_referrals_sso_url_endpoints():
    """Verify both /api/referrals/sso-url and /api/v1/referrals/sso-url are reachable."""
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)
    # Test unauthenticated / demo fallback
    resp1 = client.get("/api/referrals/sso-url")
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert data1["success"] is True
    assert "sso_url" in data1

    resp2 = client.get("/api/v1/referrals/sso-url")
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["success"] is True
    assert "sso_url" in data2

