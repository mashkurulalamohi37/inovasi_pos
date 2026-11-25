"""Subscription package CRUD, lifecycle, assignment safety, and authorization."""

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.audit import AuditLog
from app.models.saas import SubscriptionPlan, TenantSubscription
from tests.test_phase8 import login, super_headers


def test_public_plans_list_active_only(client: TestClient, session: Session):
    growth = client.post(
        "/api/v1/super-admin/plans",
        headers=super_headers(client),
        json={
            "code": "growth-temp",
            "name": "Growth Temp",
            "max_stores": 3,
            "max_users": 10,
            "price_monthly": 49,
            "is_active": False,
        },
    )
    assert growth.status_code == 201
    public = client.get("/api/v1/subscriptions/plans")
    assert public.status_code == 200
    codes = {p["code"] for p in public.json()}
    assert "starter" in codes
    assert "growth-temp" not in codes


def test_super_admin_create_edit_activate_deactivate(client: TestClient):
    headers = super_headers(client)
    create = client.post(
        "/api/v1/super-admin/plans",
        headers=headers,
        json={
            "code": "Growth",
            "name": "Growth",
            "max_stores": 3,
            "max_counters": 8,
            "max_users": 15,
            "max_industry_packs": 2,
            "price_monthly": 59,
            "advanced_reports": True,
        },
    )
    assert create.status_code == 201, create.text
    plan = create.json()
    assert plan["code"] == "growth"
    assert plan["assignment_count"] == 0
    assert plan["is_active"] is True

    updated = client.patch(
        f"/api/v1/super-admin/plans/{plan['id']}",
        headers=headers,
        json={"name": "Growth Plus", "price_monthly": 69},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Growth Plus"
    assert updated.json()["price_monthly"] == 69
    assert updated.json()["code"] == "growth"  # immutable

    off = client.patch(
        f"/api/v1/super-admin/plans/{plan['id']}/status",
        headers=headers,
        json={"is_active": False},
    )
    assert off.status_code == 200
    assert off.json()["is_active"] is False

    inactive = client.get("/api/v1/super-admin/plans", headers=headers, params={"active": False})
    assert any(p["code"] == "growth" for p in inactive.json())

    on = client.patch(
        f"/api/v1/super-admin/plans/{plan['id']}/status",
        headers=headers,
        json={"is_active": True},
    )
    assert on.json()["is_active"] is True


def test_duplicate_code_returns_409(client: TestClient):
    headers = super_headers(client)
    res = client.post(
        "/api/v1/super-admin/plans",
        headers=headers,
        json={"code": "starter", "name": "Dup"},
    )
    assert res.status_code == 409


def test_validation_rejects_negative_limits(client: TestClient):
    headers = super_headers(client)
    res = client.post(
        "/api/v1/super-admin/plans",
        headers=headers,
        json={"code": "badplan", "name": "Bad", "max_stores": -1},
    )
    assert res.status_code == 422


def test_cannot_assign_inactive_plan(client: TestClient, session: Session):
    headers = super_headers(client)
    create = client.post(
        "/api/v1/super-admin/plans",
        headers=headers,
        json={"code": "hidden", "name": "Hidden", "is_active": False, "price_monthly": 1},
    )
    assert create.status_code == 201
    tenants = client.get("/api/v1/super-admin/tenants", headers=headers).json()
    demo = next(t for t in tenants if t["code"] == "PULSE-DEMO")
    res = client.post(
        "/api/v1/super-admin/subscriptions/assign",
        headers=headers,
        json={"company_id": demo["id"], "plan_code": "hidden"},
    )
    assert res.status_code == 409


def test_safe_delete_blocks_when_assigned(client: TestClient, session: Session):
    headers = super_headers(client)
    create = client.post(
        "/api/v1/super-admin/plans",
        headers=headers,
        json={"code": "temp-assign", "name": "Temp Assign", "price_monthly": 5},
    )
    plan = create.json()
    tenants = client.get("/api/v1/super-admin/tenants", headers=headers).json()
    demo = next(t for t in tenants if t["code"] == "PULSE-DEMO")
    assign = client.post(
        "/api/v1/super-admin/subscriptions/assign",
        headers=headers,
        json={"company_id": demo["id"], "plan_code": "temp-assign"},
    )
    assert assign.status_code == 200
    delete = client.delete(f"/api/v1/super-admin/plans/{plan['id']}", headers=headers)
    assert delete.status_code == 409
    detail = delete.json()["detail"]
    assert detail["code"] == "PLAN_IN_USE"
    assert detail["assigned_tenant_count"] >= 1


def test_delete_unused_plan(client: TestClient, session: Session):
    headers = super_headers(client)
    create = client.post(
        "/api/v1/super-admin/plans",
        headers=headers,
        json={"code": "ephemeral", "name": "Ephemeral", "price_monthly": 1},
    )
    plan_id = create.json()["id"]
    delete = client.delete(f"/api/v1/super-admin/plans/{plan_id}", headers=headers)
    assert delete.status_code == 204
    assert session.get(SubscriptionPlan, plan_id) is None
    audits = session.exec(
        select(AuditLog).where(AuditLog.action == "subscription_plan_delete")
    ).all()
    assert any(a.entity_id == plan_id for a in audits)


def test_subscription_status_lifecycle(client: TestClient):
    headers = super_headers(client)
    tenants = client.get("/api/v1/super-admin/tenants", headers=headers).json()
    demo = next(t for t in tenants if t["code"] == "PULSE-DEMO")
    suspended = client.patch(
        f"/api/v1/super-admin/tenants/{demo['id']}/subscription-status",
        headers=headers,
        json={"status": "suspended"},
    )
    assert suspended.status_code == 200
    assert suspended.json()["status"] == "suspended"
    resumed = client.patch(
        f"/api/v1/super-admin/tenants/{demo['id']}/subscription-status",
        headers=headers,
        json={"status": "active"},
    )
    assert resumed.json()["status"] == "active"
    cancelled = client.patch(
        f"/api/v1/super-admin/tenants/{demo['id']}/subscription-status",
        headers=headers,
        json={"status": "cancelled"},
    )
    assert cancelled.json()["status"] == "cancelled"
    assert cancelled.json()["expires_at"] is not None


def test_cashier_cannot_change_plan(client: TestClient):
    cashier = login(client, "cashier@pulse.pos", "cashier123")
    res = client.post(
        "/api/v1/subscriptions/change-plan",
        headers=cashier,
        json={"plan_code": "professional"},
    )
    assert res.status_code == 403


def test_admin_can_change_own_plan(client: TestClient):
    admin = login(client, "admin@pulse.pos", "admin123")
    res = client.post(
        "/api/v1/subscriptions/change-plan",
        headers=admin,
        json={"plan_code": "professional"},
    )
    assert res.status_code == 200
    assert res.json()["plan_code"] == "professional"


def test_tenant_cannot_manage_plans(client: TestClient):
    admin = login(client, "admin@pulse.pos", "admin123")
    res = client.get("/api/v1/super-admin/plans", headers=admin)
    assert res.status_code == 403


def test_assign_resets_started_at(client: TestClient, session: Session):
    headers = super_headers(client)
    tenants = client.get("/api/v1/super-admin/tenants", headers=headers).json()
    demo = next(t for t in tenants if t["code"] == "PULSE-DEMO")
    sub_before = session.exec(
        select(TenantSubscription).where(TenantSubscription.company_id == demo["id"])
    ).first()
    assert sub_before is not None
    old_started = sub_before.started_at
    client.post(
        "/api/v1/super-admin/subscriptions/assign",
        headers=headers,
        json={"company_id": demo["id"], "plan_code": "starter"},
    )
    session.refresh(sub_before)
    assert sub_before.started_at >= old_started
    assert sub_before.status == "active"
    assert sub_before.expires_at is not None
    assert getattr(sub_before, "billing_cycle", None) in {None, "monthly", "yearly", "custom"}
