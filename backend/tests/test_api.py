def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_login(client):
    res = client.post("/api/v1/auth/login", json={"email": "admin@pulse.pos", "password": "admin123", "company_code": "PULSE-DEMO"})
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert "refresh_token" in data


def test_login_requires_company_code(client):
    res = client.post("/api/v1/auth/login", json={"email": "admin@pulse.pos", "password": "admin123"})
    assert res.status_code == 422


def test_login_wrong_company_code(client):
    res = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@pulse.pos", "password": "admin123", "company_code": "WRONG-CODE"},
    )
    assert res.status_code == 401


def test_login_invalid(client):
    res = client.post("/api/v1/auth/login", json={"email": "admin@pulse.pos", "password": "wrong", "company_code": "PULSE-DEMO"})
    assert res.status_code == 401


def test_me(auth_headers, client):
    res = client.get("/api/v1/auth/me", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["email"] == "admin@pulse.pos"
    assert res.json()["role_code"] == "Super Admin"
    # admin@pulse.pos is PULSE-DEMO's own tenant Super Admin, not the SaaS platform
    # operator — is_platform_admin must stay False or the frontend would show them
    # the cross-tenant SaaS control center and bypass subscription-scoped pack menus.
    assert res.json()["is_platform_admin"] is False


def test_industry_packs(auth_headers, client):
    res = client.get("/api/v1/configuration/industry-packs", headers=auth_headers)
    assert res.status_code == 200
    packs = res.json()
    assert len(packs) >= 7


def test_feature_flags(auth_headers, client):
    res = client.get("/api/v1/configuration/feature-flags", headers=auth_headers)
    assert res.status_code == 200
    assert any(f["key"] == "grocery.wholesale_price" for f in res.json())


def test_menu_config_round_trip(auth_headers, client):
    get_res = client.get("/api/v1/configuration/menu-config", headers=auth_headers)
    assert get_res.status_code == 200
    assert "menus" in get_res.json()

    patch_res = client.patch(
        "/api/v1/configuration/menu-config",
        headers=auth_headers,
        json={"pack_code": "beef-shop", "route_path": "/app/beef-shop/cuts", "enabled": False},
    )
    assert patch_res.status_code == 200
    menus = patch_res.json()["menus"]
    assert menus["beef-shop"]["/app/beef-shop/cuts"] is False

    get_res2 = client.get("/api/v1/configuration/menu-config", headers=auth_headers)
    assert get_res2.json()["menus"]["beef-shop"]["/app/beef-shop/cuts"] is False


def test_screen_config_round_trip(auth_headers, client):
    # Initial empty screen config
    res1 = client.get("/api/v1/configuration/screen-config/barcode_designer", headers=auth_headers)
    assert res1.status_code == 200
    assert res1.json()["screen_key"] == "barcode_designer"
    assert res1.json()["config"] == {}

    # Save barcode designer layout choices
    payload = {
        "config": {
            "preset": "40x25",
            "columns": 2,
            "showStoreName": True,
            "currencySymbol": "TK",
            "barcodeHeight": 22,
        }
    }
    put_res = client.put("/api/v1/configuration/screen-config/barcode_designer", headers=auth_headers, json=payload)
    assert put_res.status_code == 200
    assert put_res.json()["screen_key"] == "barcode_designer"
    assert put_res.json()["config"]["preset"] == "40x25"
    assert put_res.json()["config"]["columns"] == 2
    assert put_res.json()["config"]["showStoreName"] is True

    # Re-fetch to ensure online cloud persistence
    res2 = client.get("/api/v1/configuration/screen-config/barcode_designer", headers=auth_headers)
    assert res2.status_code == 200
    assert res2.json()["config"]["preset"] == "40x25"
    assert res2.json()["config"]["columns"] == 2
    assert res2.json()["config"]["barcodeHeight"] == 22


def test_products(auth_headers, client):
    res = client.get("/api/v1/products", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert len(data["items"]) >= 7


def test_tenant_isolation_products(auth_headers, client, session):
    from app.models.core import Company
    from app.models.product import Product

    other = Company(code="OTHER-CO", name="Other Co")
    session.add(other)
    session.flush()
    session.add(Product(company_id=other.id, sku="SECRET-001", name="Secret", industry_pack="grocery", base_price=1))
    session.commit()
    res = client.get("/api/v1/products", headers=auth_headers)
    skus = [p["sku"] for p in res.json()["items"]]
    assert "SECRET-001" not in skus
    assert "BEEF-001" in skus


def test_tenant_isolation_sales(auth_headers, client, session):
    from app.models.core import Company
    from app.models.sales import SalesInvoice

    other = Company(code="OTHER-SALES", name="Other Sales Co")
    session.add(other)
    session.flush()
    session.add(SalesInvoice(company_id=other.id, store_id="", invoice_number="INV-OTHER", industry_pack="grocery", total=9999))
    session.commit()
    res = client.get("/api/v1/sales/history", headers=auth_headers)
    totals = [r["total"] for r in res.json()]
    assert 9999 not in totals


def test_tenant_isolation_flags(auth_headers, client, session):
    from app.models.core import Company, UserAccount, Role, UserRole
    from app.models.config_engine import TenantFeature
    from app.security import hash_password

    other = Company(code="OTHER-FLAGS", name="Other Flags Co")
    session.add(other)
    session.flush()
    session.add(TenantFeature(company_id=other.id, flag_key="grocery.wholesale_price", enabled=False))
    session.commit()
    res = client.get("/api/v1/configuration/feature-flags", headers=auth_headers)
    flags = {f["key"]: f["enabled"] for f in res.json()}
    assert "grocery.wholesale_price" in flags


def test_product_create(auth_headers, client):
    res = client.post("/api/v1/products", headers=auth_headers, json={
        "sku": "TEST-NEW-001", "name": "Test Product", "industry_pack": "grocery", "base_price": 100,
    })
    assert res.status_code == 200
    assert res.json()["sku"] == "TEST-NEW-001"


def test_refresh_token(client):
    login = client.post("/api/v1/auth/login", json={"email": "admin@pulse.pos", "password": "admin123", "company_code": "PULSE-DEMO"})
    refresh = login.json()["refresh_token"]
    res = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert res.status_code == 200
    assert "access_token" in res.json()


def test_refresh_token_rotation_grace_period(client):
    login = client.post("/api/v1/auth/login", json={"email": "admin@pulse.pos", "password": "admin123", "company_code": "PULSE-DEMO"})
    refresh = login.json()["refresh_token"]
    # 1st refresh
    res1 = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert res1.status_code == 200
    # 2nd refresh with the same old token (race condition / concurrent query)
    res2 = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert res2.status_code == 200
    assert res2.json()["access_token"] == res1.json()["access_token"]


def test_access_token_sid_remains_valid_after_refresh(client):
    login = client.post("/api/v1/auth/login", json={"email": "admin@pulse.pos", "password": "admin123", "company_code": "PULSE-DEMO"})
    initial_access = login.json()["access_token"]
    refresh = login.json()["refresh_token"]

    # Verify initial access token works
    res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {initial_access}"})
    assert res.status_code == 200

    # Rotate refresh token
    refresh_res = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert refresh_res.status_code == 200
    new_refresh = refresh_res.json()["refresh_token"]

    # In-flight request using old access token must still succeed (NOT 401 Session ended)
    res_after = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {initial_access}"})
    assert res_after.status_code == 200

    # When user explicitly logs out, both access and refresh tokens are invalidated
    logout_res = client.post("/api/v1/auth/logout", json={"refresh_token": new_refresh})
    assert logout_res.status_code == 200

    # Old and new access tokens are now rejected because the session was explicitly ended
    res_logged_out = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {initial_access}"})
    assert res_logged_out.status_code == 401
    assert res_logged_out.json()["detail"] == "Session ended"


def test_refresh_token_expires_at_future(client, session):
    from datetime import datetime, timezone

    from sqlmodel import select

    from app.models.core import RefreshToken

    login = client.post("/api/v1/auth/login", json={"email": "admin@pulse.pos", "password": "admin123", "company_code": "PULSE-DEMO"})
    token_hash = __import__("hashlib").sha256(login.json()["refresh_token"].encode()).hexdigest()
    rt = session.exec(select(RefreshToken).where(RefreshToken.token_hash == token_hash)).first()
    assert rt is not None
    expires = rt.expires_at.replace(tzinfo=timezone.utc) if rt.expires_at.tzinfo is None else rt.expires_at
    assert expires > datetime.now(timezone.utc)


def test_change_password_revokes_refresh(client):
    login = client.post("/api/v1/auth/login", json={"email": "admin@pulse.pos", "password": "admin123", "company_code": "PULSE-DEMO"})
    tokens = login.json()
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    res = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "admin123", "new_password": "Admin456!"},  # compliant: uppercase + digit
        headers=headers,
    )
    assert res.status_code == 200
    refresh_res = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert refresh_res.status_code == 401
    # restore password for other tests
    login2 = client.post("/api/v1/auth/login", json={"email": "admin@pulse.pos", "password": "Admin456!", "company_code": "PULSE-DEMO"})
    headers2 = {"Authorization": f"Bearer {login2.json()['access_token']}"}
    client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "Admin456!", "new_password": "admin123"},  # restore (seed pwd is exempt via seed)
        headers=headers2,
    )


def test_audit_logs(auth_headers, client):
    res = client.get("/api/v1/audit-logs", headers=auth_headers)
    assert res.status_code == 200
    assert "items" in res.json()


def test_sale_idempotency(auth_headers, client):
    payload = {
        "client_transaction_id": "test-idempotent-001",
        "industry_pack": "grocery",
        "lines": [{"sku": "GROC-001", "name": "Basmati Rice", "qty": 1, "unit_price": 650}],
        "subtotal": 650,
        "tax": 32,
        "total": 682,
        "tender": "cash",
    }
    r1 = client.post("/api/v1/sales", json=payload, headers=auth_headers)
    r2 = client.post("/api/v1/sales", json=payload, headers=auth_headers)
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r2.json()["duplicate"] is True
    assert r1.json()["invoice_number"] == r2.json()["invoice_number"]


def test_rbac_cashier_denied(client):
    res = client.post("/api/v1/auth/login", json={"email": "cashier@pulse.pos", "password": "cashier123", "company_code": "PULSE-DEMO"})
    token = res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    res = client.patch(
        "/api/v1/configuration/industry-packs/beef-shop",
        json={"enabled_company": False},
        headers=headers,
    )
    assert res.status_code == 403


def test_beef_wastage(auth_headers, client):
    res = client.post(
        "/api/v1/industry/beef/wastage",
        json={"wastage_kg": 1.5, "wastage_type": "spoilage", "reason": "Test"},
        headers=auth_headers,
    )
    assert res.status_code == 200


def test_electronics_serial_validation(auth_headers, client):
    res = client.get("/api/v1/industry/electronics/serials/validate/SN12345678901234", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["valid"] is True

    res2 = client.get("/api/v1/industry/electronics/serials/validate/SHORT", headers=auth_headers)
    assert res2.json()["valid"] is False
