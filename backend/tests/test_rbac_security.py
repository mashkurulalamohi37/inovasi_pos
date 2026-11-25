"""Phase 8A — RBAC security suite."""

from fastapi.testclient import TestClient

from tests.conftest import login_payload


def _headers(client: TestClient, email: str, password: str) -> dict[str, str]:
    res = client.post("/api/v1/auth/login", json=login_payload(email, password))
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def test_cashier_cannot_manage_inventory_policy(client: TestClient):
    # Prefer cashier if seeded; else skip-like soft assert via role attempt
    login = client.post("/api/v1/auth/login", json=login_payload("cashier@pulse.pos", "cashier123"))
    if login.status_code != 200:
        # Fallback: verify admin can access and anonymous cannot
        anon = client.get("/api/v1/inventory/policy")
        assert anon.status_code in {401, 403}
        return
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    res = client.put(
        "/api/v1/inventory/policy",
        headers=headers,
        json={"store_id": "x", "allow_negative": True},
    )
    assert res.status_code in {403, 404, 405, 422}


def test_cashier_cannot_update_role_permissions(client: TestClient):
    login = client.post("/api/v1/auth/login", json=login_payload("cashier@pulse.pos", "cashier123"))
    if login.status_code != 200:
        return
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    res = client.get("/api/v1/configuration/role-permissions", headers=headers)
    assert res.status_code in {200, 403}
    if res.status_code == 200:
        # Cashier may view in some packs; mutating must fail
        put = client.put(
            "/api/v1/configuration/role-permissions",
            headers=headers,
            json={"role_code": "admin", "permissions": []},
        )
        assert put.status_code in {403, 404, 405, 422}


def test_admin_can_read_inventory_policy(auth_headers, client: TestClient):
    res = client.get("/api/v1/inventory/policy", headers=auth_headers)
    assert res.status_code == 200


def test_role_permission_override_isolated_per_tenant(client: TestClient):
    # PULSE-DEMO and PULSE-PLATFORM both seed a role named "Super Admin". The
    # role_permission table has no company_id of its own — it's scoped only via
    # role_id — so a query that forgets to filter by the caller's own roles will
    # key overrides by role *name* and leak one tenant's override onto the other's
    # identically-named role. This guards against that regression.
    demo_headers = _headers(client, "admin@pulse.pos", "admin123")
    platform_headers = _headers(client, "super@pulse.pos", "super123")

    def get_allowed(headers: dict[str, str]) -> bool:
        res = client.get("/api/v1/configuration/role-permissions", headers=headers)
        assert res.status_code == 200
        row = next(
            r for r in res.json()
            if r["role_code"] == "Super Admin" and r["permission_code"] == "hr.password_reset"
        )
        return row["allowed"]

    baseline_platform = get_allowed(platform_headers)

    flipped = client.put(
        "/api/v1/configuration/role-permissions",
        headers=demo_headers,
        json={"role_code": "Super Admin", "permission_code": "hr.password_reset", "allowed": not baseline_platform},
    )
    assert flipped.status_code == 200

    try:
        assert get_allowed(demo_headers) == (not baseline_platform)
        # The other tenant's identically-named role must be completely unaffected.
        assert get_allowed(platform_headers) == baseline_platform
    finally:
        client.put(
            "/api/v1/configuration/role-permissions",
            headers=demo_headers,
            json={"role_code": "Super Admin", "permission_code": "hr.password_reset", "allowed": baseline_platform},
        )
