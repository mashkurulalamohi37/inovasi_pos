"""Cache layer unit tests (memory backend)."""

from app.cache import (
    cache_get,
    cache_key,
    cache_set,
    cache_delete,
    cache_get_or_set,
    reset_cache_for_tests,
)


def test_memory_cache_roundtrip(monkeypatch):
    reset_cache_for_tests()
    monkeypatch.setenv("CACHE_ENABLED", "true")
    monkeypatch.setenv("CACHE_BACKEND", "memory")
    from app.config import settings

    settings.cache_enabled = True
    settings.cache_backend = "memory"
    settings.redis_url = None

    key = cache_key("test", "a")
    assert cache_get(key) is None
    cache_set(key, {"ok": True}, ttl_seconds=30)
    assert cache_get(key) == {"ok": True}
    cache_delete(key)
    assert cache_get(key) is None


def test_cache_get_or_set(monkeypatch):
    reset_cache_for_tests()
    from app.config import settings

    settings.cache_enabled = True
    settings.cache_backend = "memory"
    settings.redis_url = None

    calls = {"n": 0}

    def factory():
        calls["n"] += 1
        return {"n": calls["n"]}

    key = cache_key("test", "factory")
    assert cache_get_or_set(key, factory) == {"n": 1}
    assert cache_get_or_set(key, factory) == {"n": 1}
    assert calls["n"] == 1
