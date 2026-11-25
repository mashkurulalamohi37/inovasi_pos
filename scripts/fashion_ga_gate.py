#!/usr/bin/env python3
"""Local Fashion edition GA gate — does NOT claim remote CI or production backup schedules.

Runs:
  1) pytest -m fashion
  2) Optional live API checks (import status + health) when --api-url is set

Exit 0 only when local fashion suite (and optional API checks) pass.
Prints remaining §46 human evidence items that must not be invented.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"


def run_fashion_pytest() -> int:
    cmd = [sys.executable, "-m", "pytest", "tests/", "-m", "fashion", "-q", "--tb=line"]
    print(">", " ".join(cmd), f"(cwd={BACKEND})")
    proc = subprocess.run(cmd, cwd=BACKEND)
    return proc.returncode


def check_api(api_url: str) -> list[str]:
    try:
        import httpx
    except ImportError:
        return ["httpx not installed — skip API checks (pip install httpx)"]

    failures: list[str] = []
    base = api_url.rstrip("/")
    # Accept either http://host:port or .../api/v1
    health_roots = []
    if base.endswith("/api/v1"):
        health_roots.append(base[: -len("/api/v1")])
        api_v1 = base
    else:
        health_roots.append(base)
        api_v1 = f"{base}/api/v1"

    with httpx.Client(timeout=15.0) as client:
        live_ok = False
        for root in health_roots:
            for path in ("/health/live", "/health"):
                try:
                    r = client.get(f"{root}{path}")
                    if r.status_code == 200:
                        live_ok = True
                        print(f"OK {path} -> {r.status_code}")
                        break
                except httpx.HTTPError as exc:
                    failures.append(f"{path}: {exc}")
            if live_ok:
                break
        if not live_ok:
            failures.append("health/live (or /health) not reachable")

        # import status requires auth — try unauthenticated first; 401 is OK for reachability
        try:
            r = client.get(f"{api_v1}/import/status")
            if r.status_code in (200, 401, 403):
                print(f"OK /import/status reachable -> {r.status_code}")
                if r.status_code == 200:
                    body = r.json()
                    live = body.get("live_modules") or []
                    for mod in ("products", "opening_stock", "fashion_variants"):
                        if mod not in live:
                            failures.append(f"import status missing live module: {mod}")
                        else:
                            print(f"OK import live_modules contains {mod}")
            else:
                failures.append(f"/import/status unexpected status {r.status_code}")
        except httpx.HTTPError as exc:
            failures.append(f"/import/status: {exc}")

    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description="Local Fashion GA gate")
    parser.add_argument(
        "--api-url",
        default="",
        help="Optional API base (e.g. http://127.0.0.1:9001 or .../api/v1) for health/import checks",
    )
    parser.add_argument("--skip-pytest", action="store_true", help="Only run API checks")
    args = parser.parse_args()

    print("=== Fashion GA gate (local) ===")
    print("Label remains Pilot / Conditional GA until remote CI + prod backup/monitor evidence.\n")

    rc = 0
    if not args.skip_pytest:
        rc = run_fashion_pytest()
        if rc != 0:
            print("FAIL pytest -m fashion")
            return rc
        print("OK pytest -m fashion passed")

    if args.api_url:
        failures = check_api(args.api_url)
        for f in failures:
            print(f"FAIL {f}")
        if failures:
            return 1
        print("OK API health / import checks passed")
    else:
        print("- API checks skipped (pass --api-url to enable)")

    print(
        "\nSection 46 still requires human evidence (do not invent):\n"
        "  [ ] Remote CI green on default branch\n"
        "  [ ] Production checklist + backup schedule\n"
        "  [ ] Observability / alerts in production\n"
        "  [ ] Flip label to Production Ready / GA only after those close\n"
    )
    print("Local Fashion gate: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
