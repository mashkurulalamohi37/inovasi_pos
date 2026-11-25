"""Distributed-capable rate limiting (Phase 8B).

Backends:
  - memory: process-local (single replica only)
  - redis: shared INCR/EXPIRE counters across replicas

Failure policy (documented in docs/RATE_LIMITING.md):
  - Auth paths: if Redis unavailable → log + memory fallback (avoid total login outage)
  - When RATE_LIMIT_REQUIRE_REDIS=true and Redis down → auth returns 503

POS sale / purchase paths are intentionally NOT rate-limited here.
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict
from threading import Lock
from typing import Protocol

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

logger = logging.getLogger("pulse.rate_limit")

# path -> (max requests, window seconds)
RATE_LIMITED_PATHS: dict[str, tuple[int, int]] = {
    "/api/v1/auth/login": (10, 60),
    "/api/v1/auth/refresh": (30, 60),
    "/api/v1/onboarding/tenant/public": (5, 300),
}

AUTH_PATHS = frozenset({"/api/v1/auth/login", "/api/v1/auth/refresh"})

_buckets: dict[str, list[float]] = defaultdict(list)
_lock = Lock()
_redis_client = None
_redis_last_error: str | None = None


class RateLimiterBackend(Protocol):
    def hit(self, key: str, limit: int, window_seconds: int) -> tuple[bool, int]:
        """Return (allowed, remaining). remaining may be -1 if unknown."""


class MemoryRateLimiter:
    def hit(self, key: str, limit: int, window_seconds: int) -> tuple[bool, int]:
        now = time.monotonic()
        with _lock:
            hits = [t for t in _buckets[key] if now - t < window_seconds]
            if len(hits) >= limit:
                _buckets[key] = hits
                return False, 0
            hits.append(now)
            _buckets[key] = hits
            return True, max(0, limit - len(hits))


class RedisRateLimiter:
    def __init__(self, client):
        self._client = client

    def hit(self, key: str, limit: int, window_seconds: int) -> tuple[bool, int]:
        # Atomic-ish: INCR then EXPIRE on first hit
        pipe = self._client.pipeline()
        pipe.incr(key)
        pipe.ttl(key)
        count, ttl = pipe.execute()
        if ttl == -1:
            self._client.expire(key, window_seconds)
        if int(count) > limit:
            return False, 0
        return True, max(0, limit - int(count))


def _get_redis():
    global _redis_client, _redis_last_error
    from app.config import settings

    if not settings.redis_url:
        _redis_last_error = "REDIS_URL not set"
        return None
    try:
        if _redis_client is None:
            import redis

            _redis_client = redis.Redis.from_url(
                settings.redis_url,
                decode_responses=True,
                socket_connect_timeout=1.5,
                socket_timeout=1.5,
            )
        _redis_client.ping()
        _redis_last_error = None
        return _redis_client
    except Exception as exc:  # noqa: BLE001
        _redis_last_error = str(exc)
        _redis_client = None
        logger.warning("rate_limit redis unavailable: %s", exc)
        return None


def reset_rate_limit_state_for_tests() -> None:
    """Clear memory buckets and cached redis client (tests only)."""
    global _redis_client, _redis_last_error
    with _lock:
        _buckets.clear()
    _redis_client = None
    _redis_last_error = None


def resolve_backend() -> tuple[RateLimiterBackend, str]:
    """Return (backend, backend_name_used)."""
    from app.config import settings

    if settings.rate_limit_backend == "redis":
        client = _get_redis()
        if client is not None:
            return RedisRateLimiter(client), "redis"
        logger.warning(
            "rate_limit fallback=memory reason=%s",
            _redis_last_error or "unknown",
        )
        return MemoryRateLimiter(), "memory_fallback"
    return MemoryRateLimiter(), "memory"


def _client_key(request: Request) -> str:
    # Resolved via app.net so X-Forwarded-For is only honoured when the peer is
    # a configured reverse proxy. Trusting the raw header let any client rotate
    # its own bucket key and bypass the login throttle completely.
    from app.net import client_ip

    return client_ip(request) or "unknown"


def _account_hint(request: Request) -> str:
    # Best-effort body peek is expensive; use header override for tests/clients.
    hint = request.headers.get("X-RateLimit-Account") or ""
    return hint.strip().lower()[:128]


def build_limit_key(path: str, request: Request) -> str:
    ip = _client_key(request)
    account = _account_hint(request)
    if path in AUTH_PATHS and account:
        return f"rl:{path}:ip:{ip}:acct:{account}"
    return f"rl:{path}:ip:{ip}"


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        from app.config import settings

        if not settings.rate_limit_enabled:
            return await call_next(request)

        # Always enforce in production/staging; allow force in tests via RATE_LIMIT_FORCE=1
        active_env = settings.environment in ("production", "staging") or settings.rate_limit_force
        if not active_env:
            return await call_next(request)

        limit_cfg = RATE_LIMITED_PATHS.get(request.url.path)
        if not limit_cfg or request.method != "POST":
            return await call_next(request)

        max_requests, window = limit_cfg
        backend, backend_name = resolve_backend()

        if (
            settings.rate_limit_require_redis
            and settings.rate_limit_backend == "redis"
            and backend_name != "redis"
            and request.url.path in AUTH_PATHS
        ):
            logger.error("rate_limit require_redis=true but redis down; rejecting auth")
            return JSONResponse(
                status_code=503,
                content={"detail": "Authentication temporarily unavailable. Try again shortly."},
                headers={"Retry-After": "5"},
            )

        key = build_limit_key(request.url.path, request)
        allowed, remaining = backend.hit(key, max_requests, window)
        if not allowed:
            logger.info(
                "rate_limit exceeded path=%s backend=%s",
                request.url.path,
                backend_name,
            )
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Try again later."},
                headers={
                    "Retry-After": str(window),
                    "X-RateLimit-Limit": str(max_requests),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Backend": backend_name,
                },
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(max_requests)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Backend"] = backend_name
        return response
