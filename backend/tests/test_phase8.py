"""Phase 8: SaaS onboarding, subscriptions, devices, approvals, super admin."""

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models.config_engine import IndustryPack


def login(client: TestClient, email: str, password: str, company_code: str | None = None) -> dict[str, str]:
    code = company_code or ("PULSE-PLATFORM" if email == "super@pulse.pos" else "PULSE-DEMO")
    res = client.post("/api/v1/auth/login", json={"email": email, "password": password, "company_code": code})
    assert res.status_code == 200, res.text
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def super_headers(client: TestClient) -> dict[str, str]:
    return login(client, "super@pulse.pos", "super123")


def approve_company(client: TestClient, company_id: str, plan_code: str | None = None) -> dict:
    headers = super_headers(client)
    body = {"billing_cycle": "monthly", "billing_months": 1}
    if plan_code:
        body["plan_code"] = plan_code
    res = client.post(f"/api/v1/super-admin/tenants/{company_id}/approve", headers=headers, json=body)
    assert res.status_code == 200, res.text
    return res.json()


def onboard_payload(**overrides) -> dict:
    base = {
        "company_code": "PILOT-001",
        "company_name": "Pilot Retail",
        "admin_email": "pilot@example.com",
        "admin_password": "pilot123",
        "industry_packs": ["grocery"],
        "plan_code": "starter",
    }
    base.update(overrides)
    return base


def test_public_onboarding_creates_tenant(client: TestClient):
    res = client.post("/api/v1/onboarding/tenant/public", json=onboard_payload())
    assert res.status_code == 200
    data = res.json()
    assert data["company_code"] == "PILOT-001"
    assert data["admin_email"] == "pilot@example.com"
    assert data["plan_code"] == "starter"
    assert data["approval_status"] == "pending"

    blocked = client.post(
        "/api/v1/auth/login",
        json={"email": "pilot@example.com", "password": "pilot123", "company_code": "PILOT-001"},
    )
    assert blocked.status_code == 403
    assert "pending" in blocked.json()["detail"].lower()

    approve_company(client, data["company_id"], "starter")
    headers = login(client, "pilot@example.com", "pilot123", "PILOT-001")
    me = client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["company_name"] == "Pilot Retail"


def test_public_onboarding_rejects_duplicate_code(client: TestClient):
    client.post("/api/v1/onboarding/tenant/public", json=onboard_payload())
    res = client.post(
        "/api/v1/onboarding/tenant/public",
        json=onboard_payload(admin_email="other@example.com", company_code="PILOT-001"),
    )
    assert res.status_code == 409


def test_starter_plan_limits_industry_packs(client: TestClient, session: Session):
    res = client.post(
        "/api/v1/onboarding/tenant/public",
        json=onboard_payload(company_code="STARTER-01", admin_email="starter@example.com"),
    )
    assert res.status_code == 200
    company_id = res.json()["company_id"]
    approve_company(client, company_id, "starter")
    headers = login(client, "starter@example.com", "pilot123", "STARTER-01")

    session.add(
        IndustryPack(
            company_id=company_id,
            industry_code="pharmacy",
            enabled_company=False,
            enabled_store=False,
            enabled_counter=False,
            updated_by="test",
        )
    )
    session.commit()

    enable = client.patch(
        "/api/v1/configuration/industry-packs/pharmacy",
        headers=headers,
        json={"enabled_company": True},
    )
    assert enable.status_code == 403
    assert "limit" in enable.json()["detail"].lower()


def test_super_admin_lists_tenants(client: TestClient):
    headers = super_headers(client)
    res = client.get("/api/v1/super-admin/tenants", headers=headers)
    assert res.status_code == 200
    tenants = res.json()
    assert len(tenants) >= 1
    codes = [t["code"] for t in tenants]
    assert "PULSE-DEMO" in codes
    assert all("plan_code" in t for t in tenants)


def test_tenant_suspension_blocks_login(client: TestClient):
    admin = login(client, "admin@pulse.pos", "admin123")
    me = client.get("/api/v1/auth/me", headers=admin)
    company_id = me.json()["company_id"]

    super = super_headers(client)
    suspend = client.post(f"/api/v1/super-admin/tenants/{company_id}/suspend", headers=super)
    assert suspend.status_code == 200
    assert suspend.json()["is_suspended"] is True

    blocked = client.post("/api/v1/auth/login", json={"email": "admin@pulse.pos", "password": "admin123", "company_code": "PULSE-DEMO"})
    assert blocked.status_code == 403
    assert "suspended" in blocked.json()["detail"].lower()

    client.post(f"/api/v1/super-admin/tenants/{company_id}/activate", headers=super)


def test_device_register_approve_block(auth_headers, client: TestClient):
    reg = client.post(
        "/api/v1/devices/register",
        headers=auth_headers,
        json={"device_id": "pos-terminal-001", "device_name": "Front Counter"},
    )
    assert reg.status_code == 200
    assert reg.json()["status"] == "pending"
    device_pk = reg.json()["id"]

    listed = client.get("/api/v1/devices", headers=auth_headers)
    assert any(d["device_id"] == "pos-terminal-001" for d in listed.json())

    approved = client.post(f"/api/v1/devices/{device_pk}/approve", headers=auth_headers)
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"

    blocked = client.post(f"/api/v1/devices/{device_pk}/block", headers=auth_headers)
    assert blocked.status_code == 200
    assert blocked.json()["status"] == "blocked"


def test_device_heartbeat(auth_headers, client: TestClient):
    client.post(
        "/api/v1/devices/register",
        headers=auth_headers,
        json={"device_id": "pos-heartbeat-001"},
    )
    beat = client.post(
        "/api/v1/devices/heartbeat",
        headers=auth_headers,
        json={"device_id": "pos-heartbeat-001"},
    )
    assert beat.status_code == 200
    assert beat.json()["last_seen_at"] is not None


def test_approval_create_and_approve(auth_headers, client: TestClient):
    create = client.post(
        "/api/v1/approvals",
        headers=auth_headers,
        json={
            "request_type": "price_override",
            "entity_type": "sale",
            "entity_id": "sale-test-1",
            "title": "Manager discount approval",
            "detail": {"amount": 500},
        },
    )
    assert create.status_code == 200
    assert create.json()["status"] == "pending"
    req_id = create.json()["id"]

    pending = client.get("/api/v1/approvals", headers=auth_headers, params={"status": "pending"})
    assert any(a["id"] == req_id for a in pending.json())

    approved = client.post(
        f"/api/v1/approvals/{req_id}/approve",
        headers=auth_headers,
        json={"comment": "Approved by manager"},
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"


def test_notification_create_and_read(auth_headers, client: TestClient):
    client.post(
        "/api/v1/approvals",
        headers=auth_headers,
        json={
            "request_type": "refund",
            "entity_type": "sale",
            "title": "Refund approval needed",
        },
    )
    notes = client.get("/api/v1/notifications", headers=auth_headers, params={"unread_only": True})
    assert notes.status_code == 200
    assert len(notes.json()) >= 1
    note_id = notes.json()[0]["id"]
    assert notes.json()[0]["is_read"] is False

    read = client.post(f"/api/v1/notifications/{note_id}/read", headers=auth_headers)
    assert read.status_code == 200
    assert read.json()["is_read"] is True


def test_login_rate_limit(client: TestClient):
    email = "ratelimit@pulse.pos"
    for _ in range(5):
        res = client.post("/api/v1/auth/login", json={"email": email, "password": "wrong-password", "company_code": "PULSE-DEMO"})
        assert res.status_code == 401

    locked = client.post("/api/v1/auth/login", json={"email": email, "password": "wrong-password", "company_code": "PULSE-DEMO"})
    assert locked.status_code == 429
    assert "locked" in locked.json()["detail"].lower()


def test_system_health(client: TestClient):
    res = client.get("/api/v1/system/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["database"] == "connected"


def test_system_version(client: TestClient):
    res = client.get("/api/v1/system/version")
    assert res.status_code == 200
    data = res.json()
    assert "version" in data
    assert isinstance(data["version"], str) and len(data["version"]) > 0


def test_system_backup_status(client: TestClient):
    res = client.get("/api/v1/system/backup/status")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "configured"
    assert "backup_postgres" in data["message"]


def test_super_admin_rbac_denied_for_normal_admin(auth_headers, client: TestClient):
    res = client.get("/api/v1/super-admin/tenants", headers=auth_headers)
    assert res.status_code == 403
    assert "platform admin" in res.json()["detail"].lower()


def test_enterprise_plan_allows_all_packs(client: TestClient, session: Session):
    res = client.post(
        "/api/v1/onboarding/tenant/public",
        json=onboard_payload(
            company_code="ENT-001",
            admin_email="enterprise@example.com",
            plan_code="enterprise",
            industry_packs=["grocery", "pharmacy", "fashion"],
        ),
    )
    assert res.status_code == 200
    company_id = res.json()["company_id"]
    approve_company(client, company_id, "enterprise")
    headers = login(client, "enterprise@example.com", "pilot123", "ENT-001")

    session.add(
        IndustryPack(
            company_id=company_id,
            industry_code="electronics",
            enabled_company=False,
            enabled_store=False,
            enabled_counter=False,
            updated_by="test",
        )
    )
    session.commit()

    enable = client.patch(
        "/api/v1/configuration/industry-packs/electronics",
        headers=headers,
        json={"enabled_company": True},
    )
    assert enable.status_code == 200
    assert enable.json()["enabled_company"] is True


def test_subscription_plans_public(client: TestClient):
    res = client.get("/api/v1/subscriptions/plans")
    assert res.status_code == 200
    codes = [p["code"] for p in res.json()]
    assert "starter" in codes
    assert "enterprise" in codes


def test_subscription_usage_warnings(auth_headers, client: TestClient):
    res = client.get("/api/v1/subscriptions/usage", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert "usage" in data
    assert "warnings" in data
    assert isinstance(data["warnings"], list)


def test_cashier_refund_creates_approval(client: TestClient):
    from tests.test_operations import _grocery_sale, login

    admin = login(client, "admin@pulse.pos", "admin123")
    sale = _grocery_sale(client, admin, "phase8-refund-approval-001")

    cashier = login(client, "cashier@pulse.pos", "cashier123")
    refund = client.post(
        f"/api/v1/sales/{sale['id']}/refund",
        headers=cashier,
        json={"amount": 50, "method": "cash"},
    )
    assert refund.status_code == 202
    body = refund.json()
    assert body["status"] == "pending_approval"
    approval_id = body["approval_id"]

    manager = login(client, "manager@pulse.pos", "manager123")
    approved = client.post(
        f"/api/v1/approvals/{approval_id}/approve",
        headers=manager,
        json={"comment": "Refund approved"},
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"


def test_cashier_void_creates_approval(client: TestClient, session: Session):
    from tests.test_operations import _grocery_sale
    from app.models.sales import SalesInvoice

    admin = login(client, "admin@pulse.pos", "admin123")
    sale = _grocery_sale(client, admin, "phase8-void-approval-001")

    cashier = login(client, "cashier@pulse.pos", "cashier123")
    void = client.post(
        f"/api/v1/sales/{sale['id']}/void",
        headers=cashier,
        json={"reason": "Rang up wrong item"},
    )
    assert void.status_code == 202, void.text
    body = void.json()
    assert body["status"] == "pending_approval"
    approval_id = body["approval_id"]

    inv = session.get(SalesInvoice, sale["id"])
    assert inv.status == "completed"  # unchanged until approved

    manager = login(client, "manager@pulse.pos", "manager123")
    approved = client.post(
        f"/api/v1/approvals/{approval_id}/approve",
        headers=manager,
        json={"comment": "Void approved"},
    )
    assert approved.status_code == 200, approved.text

    session.expire_all()
    inv2 = session.get(SalesInvoice, sale["id"])
    assert inv2.status == "voided"


def test_manager_void_executes_immediately(client: TestClient, session: Session):
    from tests.test_operations import _grocery_sale
    from app.models.sales import SalesInvoice

    manager = login(client, "manager@pulse.pos", "manager123")
    sale = _grocery_sale(client, manager, "phase8-void-immediate-001")

    void = client.post(
        f"/api/v1/sales/{sale['id']}/void",
        headers=manager,
        json={"reason": "Customer changed mind before leaving counter"},
    )
    assert void.status_code == 200, void.text
    assert void.json()["status"] == "voided"

    inv = session.get(SalesInvoice, sale["id"])
    assert inv.status == "voided"

    # A second void attempt on an already-voided sale must be rejected.
    again = client.post(
        f"/api/v1/sales/{sale['id']}/void",
        headers=manager,
        json={"reason": "duplicate attempt"},
    )
    assert again.status_code == 409


def test_super_admin_tenant_detail(client: TestClient):
    super = super_headers(client)
    tenants = client.get("/api/v1/super-admin/tenants", headers=super)
    company_id = next(t["id"] for t in tenants.json() if t["code"] == "PULSE-DEMO")
    detail = client.get(f"/api/v1/super-admin/tenants/{company_id}", headers=super)
    assert detail.status_code == 200
    data = detail.json()
    assert data["code"] == "PULSE-DEMO"
    assert "stores" in data
    assert data["store_count"] >= 1


def test_support_access_start_and_end(client: TestClient):
    super = super_headers(client)
    tenants = client.get("/api/v1/super-admin/tenants", headers=super)
    company_id = next(t["id"] for t in tenants.json() if t["code"] == "PULSE-DEMO")

    start = client.post(
        "/api/v1/super-admin/support-access/start",
        headers=super,
        json={"company_id": company_id, "reason": "Pilot support", "duration_minutes": 30},
    )
    assert start.status_code == 200
    data = start.json()
    assert data["support_mode"] is True
    assert data["access_token"]
    imp_id = data["impersonation_id"]

    support_headers = {"Authorization": f"Bearer {data['access_token']}"}
    me = client.get("/api/v1/auth/me", headers=support_headers)
    assert me.status_code == 200
    assert me.json()["support_mode"] is True
    assert me.json()["company_id"] == company_id

    end = client.post(f"/api/v1/super-admin/support-access/{imp_id}/end", headers=super)
    assert end.status_code == 200
    assert end.json()["is_active"] is False


def test_import_status(auth_headers, client: TestClient):
    res = client.get("/api/v1/import/status", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["mode"] in {"stub", "hybrid", "live"}
    assert "opening_stock" in res.json().get("live_modules", [])


def test_subscriptions_assign_platform_admin(client: TestClient):
    super = super_headers(client)
    onboard = client.post(
        "/api/v1/onboarding/tenant/public",
        json=onboard_payload(company_code="ASSIGN-01", admin_email="assign@example.com", plan_code="starter"),
    )
    company_id = onboard.json()["company_id"]
    assign = client.post(
        "/api/v1/subscriptions/assign",
        headers=super,
        json={"company_id": company_id, "plan_code": "enterprise"},
    )
    assert assign.status_code == 200
    assert assign.json()["plan_code"] == "enterprise"


def test_production_rejects_weak_secret():
    import pytest
    from pydantic import ValidationError

    from app.config import Settings

    with pytest.raises(ValidationError):
        Settings(
            environment="production",
            secret_key="change-me-in-production",
            database_url="postgresql+psycopg2://pulse:pulse@localhost/pulse_pos",
            seed_on_startup=False,
        )


def test_manage_migrate_runs(session: Session):
    from app.manage import run_migrations

    run_migrations("head")
