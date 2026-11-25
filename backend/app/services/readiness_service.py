"""Production readiness checks for go-live."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.config import settings


def _db_connected(engine: Engine) -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


def migration_status(engine: Engine) -> dict[str, Any]:
    try:
        from alembic.config import Config
        from alembic.runtime.migration import MigrationContext
        from alembic.script import ScriptDirectory

        with engine.connect() as conn:
            context = MigrationContext.configure(conn)
            current = context.get_current_revision()
        ini = Path(__file__).resolve().parents[2] / "alembic.ini"
        cfg = Config(str(ini))
        script = ScriptDirectory.from_config(cfg)
        head = script.get_current_head()
        return {
            "current": current,
            "head": head,
            "up_to_date": current == head,
        }
    except Exception as exc:
        return {"current": None, "head": None, "up_to_date": None, "error": str(exc)}


def build_readiness(engine: Engine) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []

    db_ok = _db_connected(engine)
    checks.append({"name": "database", "ok": db_ok, "detail": "connected" if db_ok else "disconnected"})

    mig = migration_status(engine)
    if settings.environment in ("production", "staging"):
        mig_ok = bool(mig.get("up_to_date"))
    else:
        mig_ok = bool(mig.get("up_to_date")) or mig.get("current") is None
    checks.append({
        "name": "migrations",
        "ok": mig_ok,
        "detail": f"current={mig.get('current')} head={mig.get('head')}",
        **mig,
    })

    if settings.environment == "production":
        checks.append({
            "name": "seed_disabled",
            "ok": not settings.seed_on_startup,
            "detail": f"SEED_ON_STARTUP={settings.seed_on_startup}",
        })
        checks.append({
            "name": "public_onboarding_disabled",
            "ok": not settings.allow_public_onboarding,
            "detail": f"ALLOW_PUBLIC_ONBOARDING={settings.allow_public_onboarding}",
        })
        secret_ok = len(settings.secret_key) >= 32 and settings.secret_key not in {
            "change-me-in-production-use-openssl-rand-hex-32",
            "change-me-in-production-use-openssl-rand",
            "dev-secret-change-in-production",
            "test-secret",
        }
        checks.append({"name": "secret_key", "ok": secret_ok, "detail": "strong" if secret_ok else "weak"})

    ready = all(c["ok"] for c in checks if c["ok"] is not None)
    return {
        "ready": ready,
        "environment": settings.environment,
        "checks": checks,
    }
