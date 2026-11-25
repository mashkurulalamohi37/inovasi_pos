"""Phase 8B — distributed / memory rate-limit tests."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _reset_limiter(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_FORCE", "1")
    monkeypatch.setenv("RATE_LIMIT_ENABLED", "true")
    monkeypatch.setenv("RATE_LIMIT_BACKEND", "memory")
    monkeypatch.delenv("RATE_LIMIT_REQUIRE_REDIS", raising=False)
    from app.config import settings
    from app.middleware import rate_limit as rl

    prev = (
        settings.rate_limit_force,
        settings.rate_limit_enabled,
        settings.rate_limit_backend,
        settings.rate_limit_require_redis,
        settings.redis_url,
    )
    settings.rate_limit_force = True
    settings.rate_limit_enabled = True
    settings.rate_limit_backend = "memory"
    settings.rate_limit_require_redis = False
    rl.reset_rate_limit_state_for_tests()
    yield
    (
        settings.rate_limit_force,
        settings.rate_limit_enabled,
        settings.rate_limit_backend,
        settings.rate_limit_require_redis,
        settings.redis_url,
    ) = prev
    rl.reset_rate_limit_state_for_tests()


def test_login_rate_limit_returns_429(client: TestClient):
    payload = {
        "email": "admin@pulse.pos",
        "password": "wrong-password",
        "company_code": "PULSE-DEMO",
    }
    statuses = []
    for _ in range(12):
        res = client.post(
            "/api/v1/auth/login",
            json=payload,
            headers={"X-RateLimit-Account": "admin@pulse.pos"},
        )
        statuses.append(res.status_code)
    assert 429 in statuses
    assert statuses.count(429) >= 1
    last = client.post("/api/v1/auth/login", json=payload, headers={"X-RateLimit-Account": "admin@pulse.pos"})
    assert last.status_code == 429
    assert last.headers.get("X-RateLimit-Remaining") == "0"


def test_pos_sales_not_rate_limited_by_auth_rules(auth_headers, client: TestClient):
    # Completing many GETs / sales path should not 429 from auth limiter
    for _ in range(15):
        res = client.get("/api/v1/products", headers=auth_headers, params={"limit": 5})
        assert res.status_code != 429


def test_redis_backend_shares_counter(monkeypatch, client: TestClient):
    import fakeredis

    fake = fakeredis.FakeRedis(decode_responses=True)
    monkeypatch.setenv("RATE_LIMIT_BACKEND", "redis")
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/15")
    from app.config import settings
    from app.middleware import rate_limit as rl

    settings.rate_limit_backend = "redis"
    settings.redis_url = "redis://localhost:6379/15"
    rl.reset_rate_limit_state_for_tests()
    monkeypatch.setattr(rl, "_get_redis", lambda: fake)

    payload = {"email": "a@b.c", "password": "x", "company_code": "PULSE-DEMO"}
    headers = {"X-RateLimit-Account": "shared-user"}
    codes = [client.post("/api/v1/auth/login", json=payload, headers=headers).status_code for _ in range(12)]
    assert 429 in codes
    # Shared key visible in fake redis
    keys = list(fake.keys("rl:*"))
    assert keys


def test_require_redis_rejects_auth_when_down(monkeypatch, client: TestClient):
    from app.config import settings
    from app.middleware import rate_limit as rl

    settings.rate_limit_backend = "redis"
    settings.rate_limit_require_redis = True
    settings.redis_url = "redis://127.0.0.1:1/0"
    rl.reset_rate_limit_state_for_tests()
    monkeypatch.setattr(rl, "_get_redis", lambda: None)

    res = client.post(
        "/api/v1/auth/login",
        json={"email": "a@b.c", "password": "x", "company_code": "PULSE-DEMO"},
    )
    assert res.status_code == 503
