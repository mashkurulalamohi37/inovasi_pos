"""Phase 28A — Mini HR foundation: employee master, user linkage, RBAC, store scope."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.audit import AuditLog
from app.models.core import Company, Store, UserAccount
from app.models.mini_hr import MiniHrEmployee
from app.security import verify_password
from tests.test_operations import login


def _store_ids(client: TestClient, headers: dict) -> list[str]:
    stores = client.get("/api/v1/org/stores", headers=headers).json()
    return [s["id"] for s in stores]


def test_create_employee_without_login(auth_headers, client: TestClient):
    stores = _store_ids(client, auth_headers)
    res = client.post(
        "/api/v1/mini-hr/employees",
        headers=auth_headers,
        json={
            "employee_code": "EMP-NOLOGIN",
            "first_name": "No",
            "last_name": "Login",
            "primary_store_id": stores[0] if stores else None,
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["has_login"] is False
    assert body["user_account_id"] is None
    assert "password" not in body
    assert "password_hash" not in body


def test_create_login_hashed_and_username_unique(auth_headers, client: TestClient, session: Session):
    emp = client.post(
        "/api/v1/mini-hr/employees",
        headers=auth_headers,
        json={"employee_code": "EMP-LOGIN", "first_name": "Rafiq"},
    ).json()
    pwd = "TempPass9x!"
    created = client.post(
        f"/api/v1/mini-hr/employees/{emp['id']}/create-user",
        headers=auth_headers,
        json={"username": "rafiq.hr", "temporary_password": pwd, "role_code": "Cashier"},
    )
    assert created.status_code == 200, created.text
    out = created.json()
    assert out["username"] == "rafiq.hr"
    assert "temporary_password" not in out
    assert "password" not in out

    user = session.get(UserAccount, out["user_account_id"])
    assert user is not None
    assert user.password_hash != pwd
    assert verify_password(pwd, user.password_hash)

    detail = client.get(f"/api/v1/mini-hr/employees/{emp['id']}", headers=auth_headers).json()
    assert "password" not in detail
    assert detail["has_login"] is True

    emp2 = client.post(
        "/api/v1/mini-hr/employees",
        headers=auth_headers,
        json={"employee_code": "EMP-DUPU", "first_name": "Dup"},
    ).json()
    dup = client.post(
        f"/api/v1/mini-hr/employees/{emp2['id']}/create-user",
        headers=auth_headers,
        json={"username": "rafiq.hr", "temporary_password": "AnotherPass9!", "role_code": "Cashier"},
    )
    assert dup.status_code == 409


def test_weak_password_rejected(auth_headers, client: TestClient):
    emp = client.post(
        "/api/v1/mini-hr/employees",
        headers=auth_headers,
        json={"employee_code": "EMP-WEAK", "first_name": "Weak"},
    ).json()
    res = client.post(
        f"/api/v1/mini-hr/employees/{emp['id']}/create-user",
        headers=auth_headers,
        json={"username": "weak.user", "temporary_password": "password", "role_code": "Cashier"},
    )
    assert res.status_code == 422


def test_suspend_blocks_login_and_reactivate(auth_headers, client: TestClient):
    emp = client.post(
        "/api/v1/mini-hr/employees",
        headers=auth_headers,
        json={"employee_code": "EMP-SUS", "first_name": "Sus"},
    ).json()
    client.post(
        f"/api/v1/mini-hr/employees/{emp['id']}/create-user",
        headers=auth_headers,
        json={"username": "sus.user", "temporary_password": "SuspendPass9!", "role_code": "Cashier"},
    )
    # username login works
    ok = client.post(
        "/api/v1/auth/login",
        json={"email": "sus.user", "password": "SuspendPass9!", "company_code": "PULSE-DEMO"},
    )
    assert ok.status_code == 200

    sus = client.post(f"/api/v1/mini-hr/employees/{emp['id']}/suspend-access", headers=auth_headers)
    assert sus.status_code == 200
    blocked = client.post(
        "/api/v1/auth/login",
        json={"email": "sus.user", "password": "SuspendPass9!", "company_code": "PULSE-DEMO"},
    )
    assert blocked.status_code == 403

    act = client.post(f"/api/v1/mini-hr/employees/{emp['id']}/activate-access", headers=auth_headers)
    assert act.status_code == 200
    again = client.post(
        "/api/v1/auth/login",
        json={"email": "sus.user", "password": "SuspendPass9!", "company_code": "PULSE-DEMO"},
    )
    assert again.status_code == 200


def test_cashier_cannot_manage_hr(client: TestClient):
    # Ensure a cashier login exists via seed: try cashier@pulse.pos if present, else create via admin
    admin = login(client, "admin@pulse.pos", "admin123")
    emp = client.post(
        "/api/v1/mini-hr/employees",
        headers=admin,
        json={"employee_code": "EMP-CASHRBAC", "first_name": "Cash"},
    ).json()
    client.post(
        f"/api/v1/mini-hr/employees/{emp['id']}/create-user",
        headers=admin,
        json={"username": "cash.rbac", "temporary_password": "CashPass99!", "role_code": "Cashier"},
    )
    cash = login(client, "cash.rbac", "CashPass99!")
    denied = client.post(
        "/api/v1/mini-hr/employees",
        headers=cash,
        json={"employee_code": "X", "first_name": "Nope"},
    )
    assert denied.status_code == 403
    reset = client.post(
        f"/api/v1/mini-hr/employees/{emp['id']}/reset-password",
        headers=cash,
        json={"temporary_password": "HackPass99!"},
    )
    assert reset.status_code == 403


def test_tenant_isolation_employee(auth_headers, client: TestClient, session: Session):
    other = session.exec(select(Company).where(Company.code != "PULSE-DEMO")).first()
    if not other:
        return
    foreign = MiniHrEmployee(
        company_id=other.id,
        employee_code="FOREIGN-1",
        first_name="Foreign",
        full_name="Foreign Emp",
    )
    session.add(foreign)
    session.commit()
    res = client.get(f"/api/v1/mini-hr/employees/{foreign.id}", headers=auth_headers)
    assert res.status_code == 404
    listed = client.get("/api/v1/mini-hr/employees", headers=auth_headers).json()
    assert not any(e["employee_code"] == "FOREIGN-1" for e in listed)


def test_store_scope_enforced(auth_headers, client: TestClient, session: Session):
    stores = client.get("/api/v1/org/stores", headers=auth_headers).json()
    if len(stores) < 2:
        # create second store
        created = client.post(
            "/api/v1/org/stores",
            headers=auth_headers,
            json={"code": "HR-STORE-B", "name": "HR Store B"},
        )
        assert created.status_code == 200, created.text
        stores = client.get("/api/v1/org/stores", headers=auth_headers).json()
    store_a, store_b = stores[0]["id"], stores[1]["id"]

    emp = client.post(
        "/api/v1/mini-hr/employees",
        headers=auth_headers,
        json={"employee_code": "EMP-SCOPE", "first_name": "Scope", "primary_store_id": store_a},
    ).json()
    client.post(
        f"/api/v1/mini-hr/employees/{emp['id']}/create-user",
        headers=auth_headers,
        json={"username": "scope.user", "temporary_password": "ScopePass9!", "role_code": "Cashier"},
    )
    cash = login(client, "scope.user", "ScopePass9!")

    # Allowed store list filter
    ok_list = client.get("/api/v1/sales", headers=cash, params={"store_id": store_a})
    assert ok_list.status_code == 200
    denied_list = client.get("/api/v1/sales", headers=cash, params={"store_id": store_b})
    assert denied_list.status_code == 403

    # Inactive assignment must not grant access
    asg = client.post(
        f"/api/v1/mini-hr/employees/{emp['id']}/stores",
        headers=auth_headers,
        json={"store_id": store_b, "is_primary": False},
    )
    assert asg.status_code == 200
    both = login(client, "scope.user", "ScopePass9!")
    assert client.get("/api/v1/sales", headers=both, params={"store_id": store_b}).status_code == 200
    client.delete(
        f"/api/v1/mini-hr/employees/{emp['id']}/stores/{asg.json()['id']}",
        headers=auth_headers,
    )
    again = login(client, "scope.user", "ScopePass9!")
    assert client.get("/api/v1/sales", headers=again, params={"store_id": store_b}).status_code == 403


def test_hr_actions_audited(auth_headers, client: TestClient, session: Session):
    emp = client.post(
        "/api/v1/mini-hr/employees",
        headers=auth_headers,
        json={"employee_code": "EMP-AUD", "first_name": "Aud"},
    ).json()
    logs = session.exec(select(AuditLog).where(AuditLog.action == "hr.employee_create")).all()
    assert any(l.entity_id == emp["id"] for l in logs)


def test_dashboard(auth_headers, client: TestClient):
    res = client.get("/api/v1/mini-hr/dashboard", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert "total_employees" in body
    assert "employees_with_login" in body


def test_cross_tenant_store_assign_blocked(auth_headers, client: TestClient, session: Session):
    other = session.exec(select(Company).where(Company.code != "PULSE-DEMO")).first()
    if not other:
        return
    foreign_store = session.exec(select(Store).where(Store.company_id == other.id)).first()
    if not foreign_store:
        return
    emp = client.post(
        "/api/v1/mini-hr/employees",
        headers=auth_headers,
        json={"employee_code": "EMP-XT", "first_name": "Xten"},
    ).json()
    res = client.post(
        f"/api/v1/mini-hr/employees/{emp['id']}/stores",
        headers=auth_headers,
        json={"store_id": foreign_store.id},
    )
    assert res.status_code == 404


def test_my_profile_and_photo_upload(auth_headers, client: TestClient):
    # GET /my-profile auto-links employee profile and returns valid data
    prof = client.get("/api/v1/mini-hr/my-profile", headers=auth_headers)
    assert prof.status_code == 200
    data = prof.json()
    assert "id" in data
    assert "full_name" in data
    assert "employee_code" in data

    # Upload photo via dedicated /my-profile/upload-photo
    file_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    up_res = client.post(
        "/api/v1/mini-hr/my-profile/upload-photo",
        headers=auth_headers,
        files={"file": ("profile.png", file_bytes, "image/png")},
    )
    assert up_res.status_code == 200
    up_data = up_res.json()
    assert up_data["photo_url"] is not None
    assert up_data["photo_url"].startswith("/uploads/profile_pics/")

    # Also test upload using employees/me/upload-photo alias
    up_me = client.post(
        "/api/v1/mini-hr/employees/me/upload-photo",
        headers=auth_headers,
        files={"file": ("profile2.png", file_bytes, "image/png")},
    )
    assert up_me.status_code == 200
    assert up_me.json()["photo_url"].startswith("/uploads/profile_pics/")

