"""High-level referral integration service for Pulse POS."""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from app.config import settings
from app.integrations.referral.client import ReferralClient
from app.integrations.referral.events import PaymentSucceeded, SubscriptionCreated, UserRegistered
from app.integrations.referral.models import Signals

logger = logging.getLogger("referral_service")


class ReferralService:
    """Coordinates all referral platform communication for Pulse POS."""

    def __init__(self):
        self._client: ReferralClient | None = None

    @property
    def is_enabled(self) -> bool:
        return bool(
            settings.referral_enabled
            and settings.referral_platform_url
            and settings.referral_product_key_id
            and settings.referral_product_secret
            and settings.referral_signing_secret
        )

    def get_client(self) -> ReferralClient | None:
        if not self.is_enabled:
            return None
        if self._client is None:
            self._client = ReferralClient(
                base_url=settings.referral_platform_url,
                key_id=settings.referral_product_key_id,
                secret=settings.referral_product_secret,
                signing_secret=settings.referral_signing_secret,
            )
        return self._client

    async def attribute_and_register_tenant_async(
        self,
        company_id: str,
        company_code: str,
        admin_email: str,
        plan_code: str,
        referral_code: str | None = None,
        attribution_token: str | None = None,
        client_ip: str | None = None,
    ) -> dict[str, Any] | None:
        """Attributes tenant registration and emits initial events to Referral Platform."""
        client = self.get_client()
        if not client:
            return None

        registered_at = datetime.now(timezone.utc).isoformat()
        signals = Signals(email=admin_email, ip=client_ip)

        attribution_res = None
        # 1. Attribute referral if code or token was supplied
        if referral_code or attribution_token:
            try:
                attribution_res = await client.attribute(
                    external_user_id=company_id,
                    registered_at=registered_at,
                    referral_code=referral_code,
                    attribution_token=attribution_token,
                    signals=signals,
                    fail_soft=True,
                )
            except Exception as exc:
                logger.warning("Referral attribution error for %s: %s", company_id, exc)

        # 2. Emit user.registered event for the merchant
        try:
            reg_event = UserRegistered(
                external_user_id=company_id,
                registered_at=registered_at,
                signals={"email": admin_email, "ip": client_ip, "company_code": company_code},
            )
            await client.send_event(reg_event)
        except Exception as exc:
            logger.warning("Failed to emit user.registered for %s: %s", company_id, exc)

        # 3. Emit subscription.created event
        try:
            sub_id = f"sub_{company_id[:16]}"
            sub_event = SubscriptionCreated(
                subscription_id=sub_id,
                external_user_id=company_id,
                plan_code=plan_code,
                metadata={"company_code": company_code},
            )
            await client.send_event(sub_event)
        except Exception as exc:
            logger.warning("Failed to emit subscription.created for %s: %s", company_id, exc)

        return {
            "attributed": attribution_res is not None and attribution_res.status == "ATTRIBUTED",
            "referrer_code": attribution_res.referrer_code if attribution_res else None,
        }

    def attribute_and_register_tenant(
        self,
        company_id: str,
        company_code: str,
        admin_email: str,
        plan_code: str,
        referral_code: str | None = None,
        attribution_token: str | None = None,
        client_ip: str | None = None,
    ) -> None:
        """Fire-and-forget sync wrapper for attribution and registration."""
        if not self.is_enabled:
            return

        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(
                    self.attribute_and_register_tenant_async(
                        company_id=company_id,
                        company_code=company_code,
                        admin_email=admin_email,
                        plan_code=plan_code,
                        referral_code=referral_code,
                        attribution_token=attribution_token,
                        client_ip=client_ip,
                    )
                )
            else:
                loop.run_until_complete(
                    self.attribute_and_register_tenant_async(
                        company_id=company_id,
                        company_code=company_code,
                        admin_email=admin_email,
                        plan_code=plan_code,
                        referral_code=referral_code,
                        attribution_token=attribution_token,
                        client_ip=client_ip,
                    )
                )
        except Exception as exc:
            logger.warning("Could not schedule tenant attribution task: %s", exc)

    async def emit_payment_succeeded_async(
        self,
        payment_id: str,
        company_id: str,
        subscription_id: str,
        plan_code: str,
        amount_bdt: float,
        billing_reason: str = "initial",
        credit_applied_bdt: float = 0.0,
        credit_reservation_id: str | None = None,
    ) -> None:
        """Emits payment.succeeded event so referral commissions can mature."""
        client = self.get_client()
        if not client:
            return

        # Convert BDT into minor integer units (1 BDT = 100 poisha)
        amount_gross = int(round(amount_bdt * 100))
        credit_applied = int(round(credit_applied_bdt * 100))
        net_paid = max(0, amount_gross - credit_applied)

        event = PaymentSucceeded(
            payment_id=payment_id,
            external_user_id=company_id,
            subscription_id=subscription_id,
            plan_code=plan_code,
            billing_reason=billing_reason,
            currency="BDT",
            amount_gross=amount_gross,
            discount_amount=0,
            tax_amount=0,
            credit_applied_amount=credit_applied,
            credit_reservation_id=credit_reservation_id,
            amount_net_paid=net_paid,
        )
        try:
            await client.send_event(event)
        except Exception as exc:
            logger.warning("Failed to emit payment.succeeded for %s: %s", payment_id, exc)

    async def get_tenant_credit_balance(self, company_id: str) -> dict[str, Any]:
        """Returns spendable and available credit balance in BDT."""
        client = self.get_client()
        if not client:
            return {
                "spendable_bdt": 0.0,
                "available_bdt": 0.0,
                "currency": "BDT",
                "enabled": False,
            }

        bal = await client.get_credit_balance(external_user_id=company_id, currency="BDT")
        return {
            "spendable_bdt": bal.spendable_minor / 100.0,
            "available_bdt": bal.available_minor / 100.0,
            "currency": bal.currency,
            "enabled": True,
        }

    async def reserve_subscription_credit(
        self,
        company_id: str,
        amount_bdt: float,
        order_ref: str,
    ) -> dict[str, Any] | None:
        """Reserves referral credits for subscription payment."""
        client = self.get_client()
        if not client:
            return None

        amount_minor = int(round(amount_bdt * 100))
        if amount_minor <= 0:
            return None

        try:
            resv = await client.reserve_credit(
                external_user_id=company_id,
                requested_amount=amount_minor,
                order_ref=order_ref,
                currency="BDT",
            )
            return {
                "reservation_id": resv.reservation_id,
                "reserved_bdt": resv.reserved_amount / 100.0,
                "state": resv.state,
            }
        except Exception as exc:
            logger.warning("Failed to reserve credit for %s: %s", company_id, exc)
            return None

    def get_referral_summary(self, company_id: str, company_code: str | None = None) -> dict[str, Any]:
        """Provides referral details for merchant dashboard."""
        portal_base = settings.referral_portal_url.rstrip("/")
        # The merchant's vanity referral code is typically their company_code or ID
        merchant_code = (company_code or company_id[:8]).upper()
        return {
            "enabled": self.is_enabled,
            "merchant_referral_code": merchant_code,
            "portal_url": f"{portal_base}?external_user_id={company_id}",
            "share_url": f"{settings.cors_origin_list[0]}/onboarding?ref={merchant_code}",
        }

    async def get_sso_url(
        self,
        external_user_id: str,
        display_name: str | None = None,
        email: str | None = None,
        phone: str | None = None,
    ) -> dict[str, Any]:
        """Requests an SSO handoff token and returns the redirect URL for the merchant."""
        platform_base = settings.referral_platform_url.rstrip("/")
        client = self.get_client()
        if not client:
            portal_url = settings.referral_portal_url or platform_base
            return {
                "success": True,
                "sso_url": f"{portal_url}?external_user_id={external_user_id}",
                "fallback": True,
            }

        try:
            res = await client.create_handoff(
                external_user_id=external_user_id,
                display_name=display_name,
                email=email,
                phone=phone,
                product_slug=settings.referral_product_slug,
            )
            data = res.get("data", {})
            token = data.get("handoff_token")
            redirect_url = data.get("redirect_url")

            if redirect_url:
                sso_url = f"{platform_base}{redirect_url}" if redirect_url.startswith("/") else redirect_url
            elif token:
                sso_url = f"{platform_base}/auth/callback?token={token}"
            else:
                sso_url = f"{platform_base}/auth/callback"

            return {
                "success": True,
                "sso_url": sso_url,
                "handoff_token": token,
                "redirect_url": redirect_url,
                "expires_in": data.get("expires_in", 60),
            }
        except Exception as exc:
            logger.warning("SSO handoff request failed: %s; falling back to direct portal", exc)
            portal_url = settings.referral_portal_url or platform_base
            return {
                "success": True,
                "sso_url": f"{portal_url}?external_user_id={external_user_id}",
                "fallback": True,
                "error": str(exc),
            }

    def attribute_customer(
        self,
        customer_id: str,
        referral_code: str,
        email: str | None = None,
        phone: str | None = None,
    ) -> None:
        """Asynchronously records referral attribution for a newly registered customer."""
        client = self.get_client()
        if not client:
            return

        async def _run():
            now_iso = datetime.now(timezone.utc).isoformat()
            signals = Signals(email=email, phone=phone) if (email or phone) else None
            try:
                await client.attribute(
                    external_user_id=customer_id,
                    registered_at=now_iso,
                    referral_code=referral_code,
                    signals=signals,
                    fail_soft=True,
                )
            except Exception as exc:
                logger.warning("Failed to attribute customer %s: %s", customer_id, exc)

        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(_run())
            else:
                loop.run_until_complete(_run())
        except Exception as exc:
            logger.warning("Could not schedule customer attribution: %s", exc)


referral_service = ReferralService()
