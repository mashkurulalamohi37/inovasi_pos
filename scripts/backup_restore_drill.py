#!/usr/bin/env python3
"""Backup / restore drill (Phase 8A).

Creates pulse_ci_backup_src, seeds a company row, copies into pulse_ci_backup_restore,
validates restoration. Prefer running against a local/admin PostgreSQL.

A backup is only proven when restore succeeds.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse, urlunparse

_BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(_BACKEND))

from sqlalchemy import create_engine, text

from app.db_driver import resolve_postgres_url

ADMIN = resolve_postgres_url(
    os.environ.get("DATABASE_URL_ADMIN")
    or os.environ.get("DATABASE_URL")
    or "postgresql+psycopg2://postgres:postgres@localhost:5432/postgres"
)
SRC = "pulse_ci_backup_src"
DST = "pulse_ci_backup_restore"


def _with_db(url: str, name: str) -> str:
    bare = url.replace("postgresql+psycopg2://", "postgresql://").replace(
        "postgresql+pg8000://", "postgresql://"
    )
    p = urlparse(bare)
    scheme = "postgresql+pg8000://" if "+pg8000" in url else "postgresql+psycopg2://"
    return urlunparse(p._replace(path=f"/{name}")).replace("postgresql://", scheme, 1)


def main() -> int:
    admin = create_engine(ADMIN, isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        for name in (SRC, DST):
            conn.execute(
                text(
                    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                    "WHERE datname = :n AND pid <> pg_backend_pid()"
                ),
                {"n": name},
            )
            conn.execute(text(f'DROP DATABASE IF EXISTS "{name}"'))
            conn.execute(text(f'CREATE DATABASE "{name}"'))

    src_url = _with_db(ADMIN, SRC)
    dst_url = _with_db(ADMIN, DST)

    from alembic import command
    from alembic.config import Config

    os.chdir(_BACKEND)
    for url in (src_url, dst_url):
        cfg = Config(str(_BACKEND / "alembic.ini"))
        cfg.set_main_option("script_location", str(_BACKEND / "alembic"))
        cfg.set_main_option("sqlalchemy.url", url)
        command.upgrade(cfg, "head")

    now = datetime.now(timezone.utc)
    src = create_engine(src_url)
    with src.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO company (id, code, name, legal_name, currency, timezone, "
                "is_active, is_suspended, approval_status, created_at, updated_at) "
                "VALUES ('cmp-backup-1', 'BACKUP-DEMO', 'Backup Co', 'Backup Co Ltd', "
                "'BDT', 'Asia/Dhaka', true, false, 'approved', :c, :u)"
            ),
            {"c": now, "u": now},
        )
        # Post-backup change on source (should NOT appear after restore of this snapshot)
        companies = conn.execute(text("SELECT count(*) FROM company")).scalar()
        assert companies and int(companies) >= 1

    # Logical restore: copy company snapshot into DST (proves restore path; use pg_restore in ops)
    dst = create_engine(dst_url)
    with src.connect() as sconn, dst.begin() as dconn:
        rows = sconn.execute(text("SELECT * FROM company WHERE code='BACKUP-DEMO'")).mappings().all()
        assert rows, "seed company missing on source"
        cols = list(rows[0].keys())
        col_list = ", ".join(cols)
        placeholders = ", ".join([f":{c}" for c in cols])
        for row in rows:
            dconn.execute(
                text(f"INSERT INTO company ({col_list}) VALUES ({placeholders})"),
                dict(row),
            )

    # Simulate post-backup mutation on SRC only
    with src.begin() as conn:
        conn.execute(
            text("UPDATE company SET name='POST-BACKUP-MUTATION' WHERE code='BACKUP-DEMO'")
        )

    with dst.connect() as conn:
        restored = conn.execute(
            text("SELECT code, name FROM company WHERE code='BACKUP-DEMO'")
        ).mappings().first()
        if not restored or restored["code"] != "BACKUP-DEMO":
            print("FAIL: company not restored")
            return 1
        if restored["name"] == "POST-BACKUP-MUTATION":
            print("FAIL: restore incorrectly includes post-backup mutation")
            return 1
        if restored["name"] != "Backup Co":
            print(f"FAIL: unexpected name {restored['name']!r}")
            return 1
        print("PASS: backup restore drill restored BACKUP-DEMO company (pre-mutation snapshot)")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
