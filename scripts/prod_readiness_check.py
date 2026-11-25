#!/usr/bin/env python3
"""Production / pilot deployment readiness checks. Does not print secret values."""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

try:
    import httpx
except ImportError:
    print("pip install httpx")
    sys.exit(1)

INSECURE_PATTERNS = (
    "change-me",
    "REPLACE_WITH",
    "super123",
    "admin123",
    "demo",
    "test-secret",
    "pulse@localhost",
)
WEAK_SECRET_VALUES = frozenset({
    "change-me-in-production-use-openssl-rand-hex-32",
    "change-me-in-production-use-openssl-rand",
    "dev-secret-change-in-production",
    "test-secret",
    "change-me-in-production",
})


def load_env_file(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.is_file():
        return out
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        out[key.strip()] = val.strip().strip('"').strip("'")
    return out


def check_env(env: dict[str, str], label: str) -> list[tuple[str, bool, str]]:
    results: list[tuple[str, bool, str]] = []

    def req(key: str, ok: bool, detail: str) -> None:
        results.append((f"{label}: {key}", ok, detail))

    environment = env.get("ENVIRONMENT", os.environ.get("ENVIRONMENT", "development"))
    req("ENVIRONMENT=production", environment == "production", environment)

    seed = env.get("SEED_ON_STARTUP", os.environ.get("SEED_ON_STARTUP", "false")).lower()
    req("SEED_ON_STARTUP=false", seed in ("false", "0", "no"), seed)

    secret = env.get("SECRET_KEY", os.environ.get("SECRET_KEY", ""))
    secret_ok = len(secret) >= 32 and secret not in WEAK_SECRET_VALUES
    if any(p in secret.lower() for p in INSECURE_PATTERNS):
        secret_ok = False
    req("SECRET_KEY strong", secret_ok, "32+ chars, not placeholder")

    refresh = env.get("JWT_REFRESH_SECRET_KEY", os.environ.get("JWT_REFRESH_SECRET_KEY", ""))
    refresh_ok = len(refresh) >= 32 and refresh not in WEAK_SECRET_VALUES and refresh != secret
    if refresh and any(p in refresh.lower() for p in INSECURE_PATTERNS):
        refresh_ok = False
    req("JWT_REFRESH_SECRET_KEY strong", refresh_ok, "distinct from SECRET_KEY")

    cors = env.get("CORS_ORIGINS", os.environ.get("CORS_ORIGINS", ""))
    cors_list = [c.strip() for c in cors.split(",") if c.strip()]
    cors_ok = cors_list and "*" not in cors and all(c.startswith("https://") for c in cors_list)
    req("CORS_ORIGINS restricted HTTPS", cors_ok, cors[:60] + ("..." if len(cors) > 60 else ""))

    db_pass = env.get("POSTGRES_PASSWORD", "")
    db_ok = (
        len(db_pass) >= 16
        and "REPLACE" not in db_pass
        and db_pass.lower() not in ("pulse", "postgres", "password")
    )
    req("POSTGRES_PASSWORD changed", db_ok if db_pass else False, "set and not default")

    vite = env.get("VITE_API_URL", "")
    vite_ok = vite.startswith("https://") and "/api/v1" in vite
    req("VITE_API_URL production HTTPS", vite_ok if vite else False, vite[:50])

    backup = env.get("BACKUP_PATH", env.get("backup_path", "/var/backups/pulse"))
    req("BACKUP_PATH configured", bool(backup), backup)

    log_level = env.get("LOG_LEVEL", "info")
    req("LOG_LEVEL set", log_level in ("warning", "error", "info"), log_level)

    return results


def check_runtime(base: str, api: str) -> list[tuple[str, bool, str]]:
    results: list[tuple[str, bool, str]] = []
    with httpx.Client(timeout=20.0) as client:
        try:
            r = client.get(f"{base}/health")
            results.append(("GET /health", r.status_code == 200, r.text[:40]))
        except Exception as e:
            results.append(("GET /health", False, str(e)))
            return results

        try:
            r = client.get(f"{api}/system/health")
            ok = r.status_code == 200 and r.json().get("database") == "connected"
            results.append(("GET /system/health", ok, r.json().get("database", "")))
        except Exception as e:
            results.append(("GET /system/health", False, str(e)))

        try:
            r = client.get(f"{api}/system/backup/status")
            results.append(("GET /backup/status", r.status_code == 200, ""))
        except Exception as e:
            results.append(("GET /backup/status", False, str(e)))

    return results


def main() -> int:
    parser = argparse.ArgumentParser(description="Pulse POS production readiness check")
    parser.add_argument("--env-file", default=".env", help="Path to .env for static checks")
    parser.add_argument("--base", default="http://localhost:8000", help="API base URL")
    parser.add_argument("--skip-runtime", action="store_true")
    args = parser.parse_args()

    root = Path(__file__).resolve().parent.parent
    env_path = Path(args.env_file)
    if not env_path.is_absolute():
        env_path = root / env_path

    merged = load_env_file(env_path)
    merged.update({k: v for k, v in os.environ.items() if k.startswith(("SECRET", "POSTGRES", "CORS", "ENVIRONMENT", "SEED", "VITE", "JWT", "BACKUP", "LOG"))})

    all_results: list[tuple[str, bool, str]] = []
    all_results.extend(check_env(merged, "env"))

    if not args.skip_runtime:
        base = args.base.rstrip("/")
        api = f"{base}/api/v1"
        all_results.extend(check_runtime(base, api))

    failed = 0
    for name, ok, detail in all_results:
        status = "PASS" if ok else "FAIL"
        print(f"[{status}] {name}" + (f" — {detail}" if detail else ""))
        if not ok:
            failed += 1

    print(f"\n{len(all_results) - failed}/{len(all_results)} checks passed")
    if failed:
        print("Deployment NOT ready — fix failures before go-live.")
        return 1
    print("Static/runtime checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
