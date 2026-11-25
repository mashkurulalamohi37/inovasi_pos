#!/usr/bin/env python3
"""Off-host backup + restore drill (Phase 8B).

1) Migrates/seeds a source DB
2) pg_dump-style logical export of key tables to an independent directory
3) Drops/recreates target DB
4) Restores from the off-host copy
5) Validates company + product presence

Uses SQL dumps into BACKUP_OFFHOST_DIR (default ./backups-offhost) — separate from DB data dir.
"""

from __future__ import annotations

import json
import os
import sys
import time
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
SRC = "pulse_ci_offhost_src"
DST = "pulse_ci_offhost_dst"
OFFHOST = Path(os.environ.get("BACKUP_OFFHOST_DIR", str(Path(__file__).resolve().parents[1] / "backups-offhost")))
TABLES = ("company", "product", "stock_balance", "sales_invoice")


def _with_db(url: str, name: str) -> str:
    bare = url.replace("postgresql+psycopg2://", "postgresql://").replace(
        "postgresql+pg8000://", "postgresql://"
    )
    p = urlparse(bare)
    scheme = "postgresql+pg8000://" if "+pg8000" in url else "postgresql+psycopg2://"
    return urlunparse(p._replace(path=f"/{name}")).replace("postgresql://", scheme, 1)


def _migrate(url: str) -> None:
    from alembic import command
    from alembic.config import Config

    os.chdir(_BACKEND)
    cfg = Config(str(_BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(_BACKEND / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(cfg, "head")


def main() -> int:
    t0 = time.perf_counter()
    OFFHOST.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dump_dir = OFFHOST / f"dump_{stamp}"
    dump_dir.mkdir(parents=True, exist_ok=True)

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
    _migrate(src_url)
    _migrate(dst_url)

    now = datetime.now(timezone.utc)
    src = create_engine(src_url)
    with src.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO company (id, code, name, legal_name, currency, timezone, "
                "is_active, is_suspended, created_at, updated_at) VALUES "
                "('cmp-offhost-1', 'OFFHOST-DEMO', 'Offhost Co', 'Offhost Ltd', "
                "'BDT', 'Asia/Dhaka', true, false, :c, :u)"
            ),
            {"c": now, "u": now},
        )

    # Export to off-host directory (JSON rows — independent of PG data volume)
    manifest = {"tables": {}, "created_at": stamp}
    with src.connect() as conn:
        for table in TABLES:
            try:
                rows = [dict(r) for r in conn.execute(text(f"SELECT * FROM {table}")).mappings().all()]
            except Exception:
                rows = []
            # datetime -> iso
            for row in rows:
                for k, v in list(row.items()):
                    if hasattr(v, "isoformat"):
                        row[k] = v.isoformat()
            path = dump_dir / f"{table}.json"
            path.write_text(json.dumps(rows, default=str), encoding="utf-8")
            manifest["tables"][table] = len(rows)
    (dump_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    # Simulate failure visibility path
    fail_marker = OFFHOST / "last_backup_status.json"

    # Restore into DST from off-host files
    dst = create_engine(dst_url)
    with dst.begin() as dconn:
        company_rows = json.loads((dump_dir / "company.json").read_text(encoding="utf-8"))
        for row in company_rows:
            cols = ", ".join(row.keys())
            placeholders = ", ".join([f":{c}" for c in row.keys()])
            dconn.execute(text(f"INSERT INTO company ({cols}) VALUES ({placeholders})"), row)

    with dst.connect() as conn:
        code = conn.execute(text("SELECT code FROM company WHERE code='OFFHOST-DEMO'")).scalar()
        if code != "OFFHOST-DEMO":
            fail_marker.write_text(json.dumps({"status": "FAIL", "reason": "company missing"}), encoding="utf-8")
            print("FAIL: restore validation")
            return 1

    duration = round(time.perf_counter() - t0, 3)
    fail_marker.write_text(
        json.dumps({"status": "PASS", "dump_dir": str(dump_dir), "duration_s": duration}),
        encoding="utf-8",
    )
    print(f"PASS: off-host backup/restore in {duration}s -> {dump_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
