#!/usr/bin/env python3
"""Lightweight API performance smoke test for Pulse POS pilot environments."""

from __future__ import annotations

import argparse
import statistics
import sys
import time

try:
    import httpx
except ImportError:
    print("Install httpx: pip install httpx")
    sys.exit(1)


DEFAULT_BASE = "http://localhost:8000/api/v1"
ADMIN_EMAIL = "admin@pulse.pos"
ADMIN_PASSWORD = "admin123"
ADMIN_COMPANY_CODE = "PULSE-DEMO"


def timed(name: str, fn) -> float:
    start = time.perf_counter()
    fn()
    elapsed = (time.perf_counter() - start) * 1000
    print(f"  {name}: {elapsed:.1f} ms")
    return elapsed


def main() -> int:
    parser = argparse.ArgumentParser(description="Pulse POS API smoke performance test")
    parser.add_argument("--base-url", default=DEFAULT_BASE)
    parser.add_argument("--email", default=ADMIN_EMAIL)
    parser.add_argument("--password", default=ADMIN_PASSWORD)
    parser.add_argument("--warn-ms", type=float, default=2000.0, help="Warn if any call exceeds this ms")
    args = parser.parse_args()
    base = args.base_url.rstrip("/")

    results: list[float] = []
    with httpx.Client(timeout=30.0) as client:
        print(f"Target: {base}")

        def health():
            r = client.get(base.replace("/api/v1", "") + "/health")
            r.raise_for_status()

        results.append(timed("health", health))

        token = None

        def login():
            nonlocal token
            r = client.post(
                f"{base}/auth/login",
                json={"email": args.email, "password": args.password, "company_code": ADMIN_COMPANY_CODE},
            )
            r.raise_for_status()
            token = r.json()["access_token"]

        results.append(timed("login", login))
        headers = {"Authorization": f"Bearer {token}"}

        def products():
            r = client.get(f"{base}/products", headers=headers, params={"limit": 50})
            r.raise_for_status()
            assert "items" in r.json()

        results.append(timed("products (50)", products))

        def sales_history():
            r = client.get(f"{base}/sales/history", headers=headers, params={"limit": 50})
            r.raise_for_status()

        results.append(timed("sales history", sales_history))

        def reports():
            r = client.get(f"{base}/reports/sales-summary", headers=headers)
            r.raise_for_status()

        results.append(timed("sales summary report", reports))

        def audit():
            r = client.get(f"{base}/audit-logs", headers=headers, params={"limit": 50})
            r.raise_for_status()

        results.append(timed("audit logs", audit))

        def system_health():
            r = client.get(f"{base}/system/health", headers=headers)
            r.raise_for_status()

        results.append(timed("system health", system_health))

    p95 = statistics.quantiles(results, n=20)[18] if len(results) >= 2 else results[0]
    avg = statistics.mean(results)
    print(f"\nSummary: avg={avg:.1f} ms, p95~{p95:.1f} ms, calls={len(results)}")

    slow = [r for r in results if r > args.warn_ms]
    if slow:
        print(f"WARNING: {len(slow)} call(s) exceeded {args.warn_ms} ms threshold.")
        return 1
    print("PASS: all calls within threshold.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
