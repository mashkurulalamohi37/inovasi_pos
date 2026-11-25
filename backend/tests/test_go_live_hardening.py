"""Phase 8 go-live hardening tests."""

from fastapi.testclient import TestClient


def test_health_live(client: TestClient):
    res = client.get("/health/live")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_health_ready(client: TestClient):
    res = client.get("/health/ready")
    assert res.status_code in (200, 503)
    body = res.json()
    assert "ready" in body
    assert "checks" in body
    assert any(c["name"] == "database" for c in body["checks"])


def test_system_readiness_endpoint(client: TestClient):
    res = client.get("/api/v1/system/readiness")
    assert res.status_code in (200, 503)
    assert "checks" in res.json()


def test_security_headers(client: TestClient):
    res = client.get("/health")
    assert res.headers.get("X-Content-Type-Options") == "nosniff"
    assert res.headers.get("X-Frame-Options") == "DENY"
    assert res.headers.get("X-Request-ID")


def test_system_version_phases(client: TestClient):
    res = client.get("/api/v1/system/version")
    assert res.status_code == 200
    data = res.json()
    assert data.get("phases", {}).get("hardening") is True


def test_import_no_duplicate_routes(client: TestClient):
    """Opening stock route registered once (duplicate removed in Phase 8)."""
    from app.main import app

    paths = [getattr(r, "path", "") for r in app.routes]
    opening = [p for p in paths if p.endswith("/import/opening-stock")]
    assert len(opening) == 1


def test_tenant_product_isolation(auth_headers, client: TestClient, session):
    from app.models.product import Product

    other = Product(company_id="isolated-co", sku="ISO-999", name="Isolated", industry_pack="grocery", base_price=1)
    session.add(other)
    session.commit()
    res = client.get("/api/v1/products", headers=auth_headers, params={"q": "ISO-999"})
    assert res.status_code == 200
    assert not any(p["sku"] == "ISO-999" for p in res.json()["items"])
