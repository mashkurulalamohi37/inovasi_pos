"""Approval workflow and notifications."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlmodel import Session, select

from app.dependencies import AuthContext, write_audit
from app.models.saas import ApprovalAction, ApprovalRequest, Notification


def create_approval(
    session: Session,
    auth: AuthContext,
    *,
    request_type: str,
    entity_type: str,
    entity_id: str | None,
    title: str,
    detail: dict | None = None,
) -> dict:
    req = ApprovalRequest(
        company_id=auth.company_id,
        request_type=request_type,
        entity_type=entity_type,
        entity_id=entity_id,
        requested_by=auth.user_id,
        status="pending",
        title=title,
        detail_json=json.dumps(detail or {}),
    )
    session.add(req)
    write_audit(session, auth, "approval_request", "approval_request", req.id, {"type": request_type})
    _notify(session, auth.company_id, None, "approval_request", f"Approval needed: {title}", f"/app/approvals")
    session.flush()
    return _approval_out(req)


def list_approvals(session: Session, company_id: str, status: str | None = None) -> list[dict]:
    stmt = select(ApprovalRequest).where(ApprovalRequest.company_id == company_id)
    if status:
        stmt = stmt.where(ApprovalRequest.status == status)
    rows = session.exec(stmt.order_by(ApprovalRequest.created_at.desc())).all()  # type: ignore
    return [_approval_out(r) for r in rows]


def resolve_approval(
    session: Session,
    auth: AuthContext,
    request_id: str,
    action: str,
    comment: str | None = None,
) -> dict:
    req = session.get(ApprovalRequest, request_id)
    if not req or req.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Approval not found")
    if req.status != "pending":
        raise HTTPException(status_code=409, detail="Already resolved")
    req.status = "approved" if action == "approve" else "rejected"
    req.resolved_by = auth.user_id
    req.resolved_at = datetime.now(timezone.utc)
    req.comment = comment
    session.add(req)
    session.add(ApprovalAction(request_id=req.id, action=action, actor_id=auth.user_id, comment=comment))
    write_audit(session, auth, f"approval_{action}", "approval_request", req.id)

    if action == "approve" and req.request_type == "refund" and req.entity_id:
        detail = json.loads(req.detail_json or "{}")
        from app.services.sales_return_service import _execute_refund

        refund_result = _execute_refund(session, auth, req.entity_id, detail)
        detail["refund_id"] = refund_result.get("id")
        req.detail_json = json.dumps({**detail, **refund_result})

    if action == "approve" and req.request_type == "void" and req.entity_id:
        detail = json.loads(req.detail_json or "{}")
        from app.services.sales_return_service import _execute_void

        void_result = _execute_void(session, auth, req.entity_id, detail)
        req.detail_json = json.dumps({**detail, **void_result})

    session.flush()
    return _approval_out(req)


def sync_subscription_notifications(session: Session, company_id: str) -> None:
    """Ensure in-app notification alerts exist if tenant subscription is expiring soon or expired."""
    if not company_id:
        return
    try:
        from app.models.base import as_utc
        from app.models.saas import TenantSubscription

        sub = session.exec(select(TenantSubscription).where(TenantSubscription.company_id == company_id)).first()
        if not sub:
            return

        now_utc = datetime.now(timezone.utc)
        if sub.status == "suspended":
            existing = session.exec(
                select(Notification).where(
                    Notification.company_id == company_id,
                    Notification.event_type == "subscription_suspended",
                    Notification.is_read == False,
                )
            ).first()
            if not existing:
                session.add(
                    Notification(
                        company_id=company_id,
                        event_type="subscription_suspended",
                        title="⚠️ Subscription Suspended",
                        message="Store access and POS billing operations have been suspended. Please renew your plan or contact support.",
                        link="/app/subscription/plans",
                    )
                )
                session.flush()
            return

        sub_exp_utc = as_utc(sub.expires_at)
        if not sub_exp_utc:
            return

        days_left = (sub_exp_utc - now_utc).total_seconds() / 86400.0
        exp_date_str = sub_exp_utc.strftime("%b %d, %Y")

        if days_left <= 0:
            existing = session.exec(
                select(Notification).where(
                    Notification.company_id == company_id,
                    Notification.event_type == "subscription_expired",
                    Notification.is_read == False,
                )
            ).first()
            if not existing:
                session.add(
                    Notification(
                        company_id=company_id,
                        event_type="subscription_expired",
                        title="⚠️ Subscription Expired",
                        message=f"Your subscription expired on {exp_date_str}. Renew now to avoid POS sales checkout interruption.",
                        link="/app/subscription/plans",
                    )
                )
                session.flush()
        elif days_left <= 7:
            days_int = max(1, int(round(days_left)))
            existing = session.exec(
                select(Notification).where(
                    Notification.company_id == company_id,
                    Notification.event_type == "subscription_expiring",
                    Notification.is_read == False,
                )
            ).first()
            if not existing:
                session.add(
                    Notification(
                        company_id=company_id,
                        event_type="subscription_expiring",
                        title=f"🔔 Subscription Expiring in {days_int} Day{'s' if days_int > 1 else ''}",
                        message=f"Your plan expires on {exp_date_str} ({days_int} days remaining). Please renew your subscription to maintain uninterrupted service.",
                        link="/app/subscription/plans",
                    )
                )
                session.flush()
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Failed to sync subscription notifications: %s", exc)


def list_notifications(session: Session, company_id: str, user_id: str | None = None, unread_only: bool = False) -> list[dict]:
    sync_subscription_notifications(session, company_id)
    stmt = select(Notification).where(Notification.company_id == company_id)
    if user_id:
        stmt = stmt.where((Notification.user_id == user_id) | (Notification.user_id == None))  # noqa: E711
    if unread_only:
        stmt = stmt.where(Notification.is_read == False)  # noqa: E712
    rows = session.exec(stmt.order_by(Notification.created_at.desc()).limit(50)).all()  # type: ignore
    return [_notification_out(n) for n in rows]


def mark_notification_read(session: Session, company_id: str, notification_id: str) -> dict:
    n = session.get(Notification, notification_id)
    if not n or n.company_id != company_id:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.is_read = True
    session.add(n)
    session.flush()
    return _notification_out(n)


def _notify(session: Session, company_id: str, user_id: str | None, event_type: str, title: str, link: str | None = None) -> None:
    session.add(Notification(company_id=company_id, user_id=user_id, event_type=event_type, title=title, message=title, link=link))


def _approval_out(r: ApprovalRequest) -> dict:
    return {
        "id": r.id,
        "request_type": r.request_type,
        "entity_type": r.entity_type,
        "entity_id": r.entity_id,
        "status": r.status,
        "title": r.title,
        "requested_by": r.requested_by,
        "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
        "comment": r.comment,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def _notification_out(n: Notification) -> dict:
    return {
        "id": n.id,
        "event_type": n.event_type,
        "title": n.title,
        "message": n.message,
        "link": n.link,
        "is_read": n.is_read,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }
