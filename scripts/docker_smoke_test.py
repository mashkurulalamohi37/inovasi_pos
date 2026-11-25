#!/usr/bin/env python3
"""Docker stack API smoke test — run after docker compose up."""

from __future__ import annotations

import argparse
import json
import sys
import time

try:
    import httpx
except ImportError:
    print("pip install httpx")
    sys.exit(1)

BASE = "http://localhost:8000"
API = f"{BASE}/api/v1"

CHECKS: list[tuple[str, callable]] = []


def record(name: str, ok: bool, detail: str = "") -> None:
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {name}" + (f" — {detail}" if detail else ""))
    CHECKS.append((name, ok))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://localhost:8000")
    args = parser.parse_args()
    base = args.base.rstrip("/")
    api = f"{base}/api/v1"

    with httpx.Client(timeout=30.0) as client:
        # Health
        try:
            r = client.get(f"{base}/health")
            record("GET /health", r.status_code == 200, r.text[:80])
        except Exception as e:
            record("GET /health", False, str(e))
            return 1

        try:
            r = client.get(f"{api}/system/health")
            record("GET /system/health", r.status_code == 200 and r.json().get("database") == "connected")
        except Exception as e:
            record("GET /system/health", False, str(e))

        try:
            r = client.get(f"{api}/system/version")
            record("GET /system/version", r.status_code == 200 and "version" in r.json())
        except Exception as e:
            record("GET /system/version", False, str(e))

        # Super admin login
        token_admin = None
        try:
            r = client.post(f"{api}/auth/login", json={"email": "super@pulse.pos", "password": "super123", "company_code": "PULSE-PLATFORM"})
            ok = r.status_code == 200
            if ok:
                token_admin = r.json()["access_token"]
            record("Super admin login", ok)
        except Exception as e:
            record("Super admin login", False, str(e))

        # Tenant admin login
        token = None
        try:
            r = client.post(f"{api}/auth/login", json={"email": "admin@pulse.pos", "password": "admin123", "company_code": "PULSE-DEMO"})
            ok = r.status_code == 200
            if ok:
                token = r.json()["access_token"]
            record("Tenant admin login", ok)
        except Exception as e:
            record("Tenant admin login", False, str(e))

        if not token:
            print("\nCannot continue without tenant token")
            return 1

        h = {"Authorization": f"Bearer {token}"}

        try:
            r = client.get(f"{api}/products", headers=h, params={"limit": 5})
            record("Product list", r.status_code == 200 and "items" in r.json(), f"count={len(r.json().get('items', []))}")
        except Exception as e:
            record("Product list", False, str(e))

        try:
            r = client.get(f"{api}/sales/history", headers=h, params={"limit": 5})
            record("Sales history", r.status_code == 200)
        except Exception as e:
            record("Sales history", False, str(e))

        try:
            r = client.get(f"{api}/reports/sales-summary", headers=h)
            record("Reports summary", r.status_code == 200)
        except Exception as e:
            record("Reports summary", False, str(e))

        try:
            r = client.get(f"{api}/audit-logs", headers=h, params={"limit": 5})
            record("Audit logs", r.status_code == 200)
        except Exception as e:
            record("Audit logs", False, str(e))

        try:
            r = client.get(f"{api}/import/status", headers=h)
            record("Import status", r.status_code == 200)
        except Exception as e:
            record("Import status", False, str(e))

        # Grocery sale
        try:
            products = client.get(f"{api}/products", headers=h, params={"q": "GROC-001"}).json()["items"]
            product = next((p for p in products if p["sku"] == "GROC-001"), products[0] if products else None)
            if product:
                tx = f"docker-smoke-{int(time.time())}"
                subtotal = product["base_price"]
                tax = round(subtotal * 0.05, 2)
                total = round(subtotal + tax, 2)
                sale = client.post(
                    f"{api}/sales",
                    headers=h,
                    json={
                        "client_transaction_id": tx,
                        "industry_pack": "grocery",
                        "lines": [{
                            "product_id": product["id"],
                            "sku": product["sku"],
                            "name": product["name"],
                            "qty": 1,
                            "unit_price": product["base_price"],
                        }],
                        "subtotal": subtotal,
                        "tax": tax,
                        "total": total,
                        "tender": "cash",
                    },
                )
                record("POS sale", sale.status_code == 200, sale.json().get("invoice_number", ""))
            else:
                record("POS sale", False, "no product")
        except Exception as e:
            record("POS sale", False, str(e))

    passed = sum(1 for _, ok in CHECKS if ok)
    total = len(CHECKS)
    print(f"\n{passed}/{total} checks passed")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
