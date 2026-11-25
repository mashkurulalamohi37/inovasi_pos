"""Redis-backed application cache with memory fallback.

Used for hot read paths (config packs/flags, menu, tenant branding, report catalog).
Keys are namespaced: pulse:{env}:{tenant?}:{resource}:{id}
"""

from __future__ import annotations

import json
import logging
import threading
from typing import Any, Callable, TypeVar

from app.config import settings

logger = logging.getLogger("pulse.cache")

T = TypeVar("T")

_redis_client = None
_redis_error: str | None = None
_memory: dict[str, tuple[float, str]] = {}
_memory_lock = threading.Lock()


def _now() -> float:
    import time

    return time.time()


def _get_redis():
    global _redis_client, _redis_error
    if not settings.cache_enabled:
        return None
    if settings.cache_backend != "redis" or not settings.redis_url:
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
        _redis_error = None
        return _redis_client
    except Exception as exc:  # noqa: BLE001
        _redis_error = str(exc)
        _redis_client = None
        logger.warning("cache redis unavailable: %s", exc)
        return None


def redis_status() -> dict[str, Any]:
    client = _get_redis()
    return {
        "enabled": settings.cache_enabled,
        "backend": settings.cache_backend,
        "connected": client is not None,
        "error": _redis_error,
    }


def cache_key(*parts: str) -> str:
    clean = [str(p).strip().replace(" ", "_") for p in parts if p is not None and str(p) != ""]
    return "pulse:" + ":".join([settings.environment, *clean])


def cache_get(key: str) -> Any | None:
    if not settings.cache_enabled:
        return None
    client = _get_redis()
    if client is not None:
        try:
            raw = client.get(key)
            if raw is None:
                return None
            return json.loads(raw)
        except Exception as exc:  # noqa: BLE001
            logger.warning("cache get failed key=%s err=%s", key, exc)
            return None
    with _memory_lock:
        item = _memory.get(key)
        if not item:
            return None
        expires_at, raw = item
        if expires_at and expires_at < _now():
            _memory.pop(key, None)
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return None


def cache_set(key: str, value: Any, ttl_seconds: int | None = None) -> None:
    if not settings.cache_enabled:
        return
    ttl = ttl_seconds if ttl_seconds is not None else settings.cache_ttl_seconds
    raw = json.dumps(value, default=str)
    client = _get_redis()
    if client is not None:
        try:
            client.setex(key, max(1, ttl), raw)
            return
        except Exception as exc:  # noqa: BLE001
            logger.warning("cache set failed key=%s err=%s", key, exc)
    with _memory_lock:
        _memory[key] = (_now() + max(1, ttl), raw)


def cache_delete(key: str) -> None:
    client = _get_redis()
    if client is not None:
        try:
            client.delete(key)
        except Exception as exc:  # noqa: BLE001
            logger.warning("cache delete failed key=%s err=%s", key, exc)
    with _memory_lock:
        _memory.pop(key, None)


def cache_delete_prefix(prefix: str) -> int:
    """Delete keys matching prefix*. Redis uses SCAN; memory uses startswith."""
    deleted = 0
    client = _get_redis()
    if client is not None:
        try:
            cursor = 0
            while True:
                cursor, keys = client.scan(cursor=cursor, match=f"{prefix}*", count=200)
                if keys:
                    deleted += int(client.delete(*keys))
                if cursor == 0:
                    break
            return deleted
        except Exception as exc:  # noqa: BLE001
            logger.warning("cache delete_prefix failed prefix=%s err=%s", prefix, exc)
    with _memory_lock:
        victims = [k for k in _memory if k.startswith(prefix)]
        for k in victims:
            _memory.pop(k, None)
        deleted = len(victims)
    return deleted


def cache_get_or_set(key: str, factory: Callable[[], T], ttl_seconds: int | None = None) -> T:
    cached = cache_get(key)
    if cached is not None:
        return cached  # type: ignore[return-value]
    value = factory()
    cache_set(key, value, ttl_seconds=ttl_seconds)
    return value


def invalidate_company_config(company_id: str) -> None:
    prefix = cache_key("cfg", company_id)
    cache_delete_prefix(prefix)


def invalidate_tenant_branding(company_code: str) -> None:
    cache_delete(cache_key("public", "tenant", company_code.strip().upper()))


def reset_cache_for_tests() -> None:
    global _redis_client, _redis_error
    with _memory_lock:
        _memory.clear()
    _redis_client = None
    _redis_error = None
