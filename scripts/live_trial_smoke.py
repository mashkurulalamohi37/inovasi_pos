#!/usr/bin/env python3
"""Live trial transactions before pilot go-live — API verification."""

from __future__ import annotations

import argparse
import sys
import uuid

try:
    import httpx
except ImportError:
    sys.exit(1)

CHECKS: list[tuple[str, bool, str]] = []


def record(name: str, ok: bool, detail: str = "") -> None:
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    CHECKS.append((name, ok, detail))


def login(client: httpx.Client, api: str, email: str, password: str) -> str | None:
    r = client.post(f"{api}/auth/login", json={"email": email, "password": password, "company_code": "PULSE-DEMO"})
    return r.json()["access_token"] if r.status_code == 200 else None


def product(client: httpx.Client, api: str, h: dict, sku: str) -> dict | None:
    items = client.get(f"{api}/products", headers=h, params={"q": sku}).json()["items"]
    return next((p for p in items if p["sku"] == sku), None)


def sale(client: httpx.Client, api: str, h: dict, pack: str, sku: str, meta: dict | None = None) -> dict | None:
    p = product(client, api, h, sku)
    if not p:
        return None
    sub = p["base_price"]
    tax = round(sub * 0.05, 2)
    line = {"product_id": p["id"], "sku": p["sku"], "name": p["name"], "qty": 1, "unit_price": p["base_price"]}
    if meta:
        line["meta"] = meta
    r = client.post(
        f"{api}/sales",
        headers=h,
        json={
            "client_transaction_id": f"trial-{pack}-{uuid.uuid4().hex[:8]}",
            "industry_pack": pack,
            "lines": [line],
            "subtotal": sub,
            "tax": tax,
            "total": round(sub + tax, 2),
            "tender": "cash",
        },
    )
    return r.json() if r.status_code == 200 else None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://localhost:8000")
    parser.add_argument("--email", default="admin@pulse.pos")
    parser.add_argument("--password", default="admin123")
    args = parser.parse_args()
    api = f"{args.base.rstrip('/')}/api/v1"

    with httpx.Client(timeout=60.0) as client:
        token = login(client, api, args.email, args.password)
        if not token:
            record("Login", False)
            return 1
        h = {"Authorization": f"Bearer {token}"}
        record("Login", True)

        elec = product(client, api, h, "ELEC-001")
        elec_serial: str | None = None
        if elec:
            elec_serial = f"SN-LIVE-{uuid.uuid4().hex[:12].upper()}"
            supplier = client.get(f"{api}/suppliers", headers=h).json()[0]
            me = client.get(f"{api}/auth/me", headers=h).json()
            po = client.post(
                f"{api}/purchases",
                headers=h,
                json={
                    "supplier_id": supplier["id"],
                    "store_id": me["store_id"],
                    "lines": [{"product_id": elec["id"], "qty": 1, "unit_cost": 25000, "serial_no": elec_serial}],
                },
            )
            if po.status_code == 200:
                pid = po.json()["id"]
                client.post(f"{api}/purchases/{pid}/approve", headers=h)
                recv = client.post(
                    f"{api}/purchases/{pid}/receive",
                    headers=h,
                    json={"lines": [{"purchase_line_id": po.json()["lines"][0]["id"], "qty": 1, "serial_no": elec_serial}]},
                )
                if recv.status_code != 200:
                    elec_serial = None

        for pack, sku, meta in [
            ("grocery", "GROC-001", None),
            ("beef-shop", "BEEF-001", None),
            ("fashion", "FASH-001", None),
            ("pharmacy", "PHRM-001", None),
        ]:
            if pack == "pharmacy":
                p = product(client, api, h, sku)
                if p:
                    fefo = client.get(f"{api}/industry/pharmacy/fefo/{p['id']}", headers=h)
                    if fefo.status_code == 200:
                        meta = {"batch_id": fefo.json()["id"], "fefo": True}
            s = sale(client, api, h, pack, sku, meta)
            record(f"Trial sale {pack}", s is not None, s.get("invoice_number", "") if s else "")

        if elec and elec_serial:
            s = sale(client, api, h, "electronics", "ELEC-001", {"serial": elec_serial})
            record("Trial sale electronics", s is not None, s.get("invoice_number", "") if s else "")
        else:
            record("Trial sale electronics", False, "no serial stock")

        groc = product(client, api, h, "GROC-001")
        if groc:
            supplier = client.get(f"{api}/suppliers", headers=h).json()[0]
            me = client.get(f"{api}/auth/me", headers=h).json()
            po = client.post(
                f"{api}/purchases",
                headers=h,
                json={
                    "supplier_id": supplier["id"],
                    "store_id": me["store_id"],
                    "lines": [{"product_id": groc["id"], "qty": 3, "unit_cost": 500}],
                },
            )
            if po.status_code == 200:
                pid = po.json()["id"]
                client.post(f"{api}/purchases/{pid}/approve", headers=h)
                recv = client.post(
                    f"{api}/purchases/{pid}/receive",
                    headers=h,
                    json={"lines": [{"purchase_line_id": po.json()["lines"][0]["id"], "qty": 3}]},
                )
                record("Purchase receive", recv.status_code == 200, recv.json().get("receive_no", ""))

        g_sale = sale(client, api, h, "grocery", "GROC-001")
        if g_sale:
            refund = client.post(
                f"{api}/sales/{g_sale['id']}/refund",
                headers=h,
                json={"amount": min(50, g_sale.get("total", 50)), "method": "cash"},
            )
            record("Refund (admin)", refund.status_code == 200)

            rp = client.post(f"{api}/sales/{g_sale['id']}/receipt/reprint", headers=h)
            record("Receipt reprint", rp.status_code == 200)

        ledger = client.get(f"{api}/inventory/stock-ledger", headers=h, params={"limit": 5})
        record("Stock ledger", ledger.status_code == 200)

        summary = client.get(f"{api}/reports/sales-summary", headers=h)
        record("Sales report", summary.status_code == 200)

        audit = client.get(f"{api}/audit-logs", headers=h, params={"limit": 5})
        record("Audit log", audit.status_code == 200)

    passed = sum(1 for _, ok, _ in CHECKS if ok)
    print(f"\n{passed}/{len(CHECKS)} trial transactions passed")
    return 0 if passed == len(CHECKS) else 1


if __name__ == "__main__":
    sys.exit(main())
