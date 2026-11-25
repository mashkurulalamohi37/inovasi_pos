"""PostgreSQL-only test tier (Phase 6B-16).

Requires:
  PULSE_POSTGRES_TESTS=1
  DATABASE_URL=postgresql+psycopg2://.../pulse_pos_test  (or similar non-production name)

Never silently falls back to SQLite.
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

import pytest
from sqlalchemy.pool import NullPool
from sqlmodel import Session, create_engine, select

# Ensure backend/ is on path when running from repo root
_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

os.environ.setdefault("SECRET_KEY", "ci-test-secret-key-with-32-chars-minimum")
os.environ.setdefault("SEED_ON_STARTUP", "false")

_PRODUCTION_NAME_RE = re.compile(r"(^|_)(prod|production|live)(_|$)", re.I)


def _require_postgres_url() -> str:
    if os.environ.get("PULSE_POSTGRES_TESTS") != "1":
        pytest.skip("PostgreSQL tests require PULSE_POSTGRES_TESTS=1", allow_module_level=True)
    url = os.environ.get("DATABASE_URL") or ""
    if not url:
        raise RuntimeError("DATABASE_URL is required when PULSE_POSTGRES_TESTS=1")
    if url.startswith("sqlite"):
        raise RuntimeError("PostgreSQL tests refuse sqlite:// DATABASE_URL — no silent fallback")
    if not url.startswith("postgresql"):
        raise RuntimeError(f"DATABASE_URL must be postgresql+…, got: {url[:32]}")
    from app.db_driver import resolve_postgres_url

    url = resolve_postgres_url(url)
    parsed = urlparse(
        url.replace("postgresql+psycopg2://", "postgresql://", 1).replace(
            "postgresql+pg8000://", "postgresql://", 1
        )
    )
    db_name = (parsed.path or "/").lstrip("/")
    if not db_name:
        raise RuntimeError("DATABASE_URL must include a database name")
    if _PRODUCTION_NAME_RE.search(db_name) and not re.search(r"(test|ci|pulse_pos)", db_name, re.I):
        raise RuntimeError(
            f"Refusing production-like database name '{db_name}'. "
            "Use a name containing test/ci/pulse_pos."
        )
    return url


@pytest.fixture(scope="session")
def pg_url() -> str:
    return _require_postgres_url()


@pytest.fixture(scope="session")
def pg_engine(pg_url: str):
    from app.db_driver import resolve_postgres_url

    url = resolve_postgres_url(pg_url)
    engine = create_engine(url, poolclass=NullPool, pool_pre_ping=True)
    # Migrate to head once per session
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(_BACKEND / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(cfg, "head")

    import app.models  # noqa: F401
    from app.seed import seed_demo_data
    from sqlalchemy import text as sa_text

    # Reset tenant data so force seed is idempotent across local re-runs
    with engine.begin() as conn:
        conn.execute(
            sa_text(
                "DO $$ DECLARE r RECORD; BEGIN "
                "FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname='public' "
                "AND tablename <> 'alembic_version') LOOP "
                "EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE'; "
                "END LOOP; END $$;"
            )
        )

    with Session(engine) as session:
        seed_demo_data(force=True, session=session)

    yield engine
    engine.dispose()


@pytest.fixture
def pg_session(pg_engine):
    """Per-test session. Teardown is defensive: concurrent workers may invalidate connections."""
    session = Session(pg_engine)
    try:
        yield session
    finally:
        try:
            session.rollback()
        except Exception:
            pass
        try:
            session.close()
        except Exception:
            pass


@pytest.fixture
def admin_auth(pg_session):
    from tests_postgres.helpers import load_admin_auth

    return load_admin_auth(pg_session)


def pytest_configure(config):
    config.addinivalue_line("markers", "postgres: requires live PostgreSQL (tests_postgres/)")


def pytest_collection_modifyitems(config, items):
    if os.environ.get("PULSE_POSTGRES_TESTS") == "1":
        return
    skip = pytest.mark.skip(reason="Set PULSE_POSTGRES_TESTS=1 and DATABASE_URL to postgresql")
    for item in items:
        if "tests_postgres" in str(item.fspath):
            item.add_marker(skip)
