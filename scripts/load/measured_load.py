"""Python measured load runner (Phase 8B) — works without k6 binary.

Uses real HTTP against FastAPI + PostgreSQL. Prints p50/p95/p99.
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import httpx

BASE = os.environ.get("BASE_URL", "http://127.0.0.1:9001")
API = f"{BASE}/api/v1"
EMAIL = os.environ.get("E2E_EMAIL", "admin@pulse.pos")
PASSWORD = os.environ.get("E2E_PASSWORD", "admin123")
COMPANY = os.environ.get("E2E_COMPANY_CODE", "PULSE-DEMO")


def percentile(sorted_vals: list[float], p: float) -> float:
    if not sorted_vals:
        return 0.0
    k = (len(sorted_vals) - 1) * (p / 100.0)
    f = int(k)
    c = min(f + 1, len(sorted_vals) - 1)
    if f == c:
        return sorted_vals[f]
    return sorted_vals[f] + (sorted_vals[c] - sorted_vals[f]) * (k - f)


def login(client: httpx.Client) -> str:
    r = client.post(
        f"{API}/auth/login",
        json={"email": EMAIL, "password": PASSWORD, "company_code": COMPANY},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def one_iteration(token: str) -> list[tuple[str, float, int]]:
    headers = {"Authorization": f"Bearer {token}"}
    results: list[tuple[str, float, int]] = []
    with httpx.Client(timeout=30) as client:
        for name, method, url, kwargs in [
            ("live", "GET", f"{BASE}/health/live", None),
            ("products", "GET", f"{API}/products?q=GROC&limit=20", headers),
            ("stock", "GET", f"{API}/inventory/stock", headers),
            ("purchases", "GET", f"{API}/purchases?limit=20", headers),
            ("pharmacy_batches", "GET", f"{API}/industry/pharmacy/batches?limit=20", headers),
            ("electronics_serials", "GET", f"{API}/industry/electronics/serials?limit=20", headers),
        ]:
            t0 = time.perf_counter()
            if method == "GET":
                r = client.get(url, headers=kwargs)
            else:
                r = client.request(method, url, headers=kwargs)
            ms = (time.perf_counter() - t0) * 1000
            results.append((name, ms, r.status_code))
    return results


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--vus", type=int, default=int(os.environ.get("K6_VUS_SMOKE", "3")))
    parser.add_argument("--iterations", type=int, default=int(os.environ.get("LOAD_ITERATIONS", "10")))
    args = parser.parse_args()

    with httpx.Client(timeout=30) as client:
        token = login(client)

    all_lat: dict[str, list[float]] = {}
    failures = 0
    total = 0
    t_start = time.perf_counter()

    def worker(_):
        return one_iteration(token)

    with ThreadPoolExecutor(max_workers=args.vus) as pool:
        futs = [pool.submit(worker, i) for i in range(args.iterations)]
        for fut in as_completed(futs):
            for name, ms, status in fut.result():
                total += 1
                all_lat.setdefault(name, []).append(ms)
                if status >= 400:
                    failures += 1

    elapsed = time.perf_counter() - t_start
    report = {
        "requests": total,
        "failures": failures,
        "error_rate": (failures / total) if total else 0,
        "throughput_rps": total / elapsed if elapsed else 0,
        "duration_s": round(elapsed, 3),
        "vus": args.vus,
        "iterations": args.iterations,
        "endpoints": {},
    }
    for name, vals in sorted(all_lat.items()):
        s = sorted(vals)
        report["endpoints"][name] = {
            "count": len(s),
            "p50_ms": round(percentile(s, 50), 2),
            "p95_ms": round(percentile(s, 95), 2),
            "p99_ms": round(percentile(s, 99), 2),
            "max_ms": round(max(s), 2),
            "mean_ms": round(statistics.mean(s), 2),
        }

    out_path = os.environ.get("LOAD_REPORT_PATH", "scripts/load/results_smoke.json")
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(json.dumps(report, indent=2))
    # Soft threshold: error rate < 5%
    return 0 if report["error_rate"] < 0.05 else 1


if __name__ == "__main__":
    raise SystemExit(main())
