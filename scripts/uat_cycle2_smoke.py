#!/usr/bin/env python3
"""UAT Cycle 2 API verification — offline dedup, returns, industry endpoints."""

from __future__ import annotations

import argparse
import sys
import time
import uuid

try:
    import httpx
except ImportError:
    print("pip install httpx")
    sys.exit(1)

CHECKS: list[tuple[str, bool, str]] = []


def record(name: str, ok: bool, detail: str = "") -> None:
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {name}" + (f" — {detail}" if detail else ""))
    CHECKS.append((name, ok, detail))


def login(client: httpx.Client, api: str, email: str, password: str) -> str | None:
    r = client.post(f"{api}/auth/login", json={"email": email, "password": password, "company_code": "PULSE-DEMO"})
    if r.status_code != 200:
        return None
    return r.json()["access_token"]


def get_product(client: httpx.Client, api: str, h: dict, sku: str) -> dict | None:
    items = client.get(f"{api}/products", headers=h, params={"q": sku}).json()["items"]
    return next((p for p in items if p["sku"] == sku), None)


def post_sale(client: httpx.Client, api: str, h: dict, tx: str, pack: str, product: dict, meta: dict | None = None) -> dict | None:
    subtotal = product["base_price"]
    tax = round(subtotal * 0.05, 2)
    total = round(subtotal + tax, 2)
    line = {
        "product_id": product["id"],
        "sku": product["sku"],
        "name": product["name"],
        "qty": 1,
        "unit_price": product["base_price"],
    }
    if meta:
        line["meta"] = meta
    r = client.post(
        f"{api}/sales",
        headers=h,
        json={
            "client_transaction_id": tx,
            "industry_pack": pack,
            "lines": [line],
            "subtotal": subtotal,
            "tax": tax,
            "total": total,
            "tender": "cash",
        },
    )
    if r.status_code != 200:
        return None
    return r.json()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://localhost:8000")
    args = parser.parse_args()
    base = args.base.rstrip("/")
    api = f"{base}/api/v1"

    with httpx.Client(timeout=60.0) as client:
        token = login(client, api, "admin@pulse.pos", "admin123")
        if not token:
            record("Admin login", False)
            return 1
        record("Admin login", True)
        h = {"Authorization": f"Bearer {token}"}

        cashier_token = login(client, api, "cashier@pulse.pos", "cashier123")
        record("Cashier login", cashier_token is not None)

        # Offline sync dedup (SYNC-02, SYNC-05)
        groc = get_product(client, api, h, "GROC-001")
        if groc:
            tx = f"uat-offline-{uuid.uuid4().hex}"
            s1 = post_sale(client, api, h, tx, "grocery", groc)
            s2 = post_sale(client, api, h, tx, "grocery", groc)
            ok = s1 and s2 and s1["id"] == s2["id"] and s2.get("duplicate") is True
            record("Offline dedup (client_transaction_id)", ok, f"invoice={s1.get('invoice_number') if s1 else 'n/a'}")
        else:
            record("Offline dedup (client_transaction_id)", False, "GROC-001 missing")

        # Restaurant tables + sale (POS-R01 API)
        tables = client.get(f"{api}/industry/restaurant/tables", headers=h)
        record("Restaurant tables API", tables.status_code == 200 and len(tables.json()) > 0)

        rest = get_product(client, api, h, "REST-001")
        if rest and tables.json():
            table_id = tables.json()[0]["id"]
            sale = post_sale(
                client, api, h, f"uat-rest-{uuid.uuid4().hex[:8]}", "restaurant", rest,
                {"table_id": table_id, "combo": True},
            )
            record("Restaurant sale API", sale is not None, sale.get("invoice_number", "") if sale else "")

        # Jewelry gold rate + sale (POS-J01 API)
        gold = client.get(f"{api}/industry/jewelry/gold-rate", headers=h)
        record("Jewelry gold rate API", gold.status_code == 200)

        jewl = get_product(client, api, h, "JEWL-001")
        if jewl:
            jsale = post_sale(
                client, api, h, f"uat-jewl-{uuid.uuid4().hex[:8]}", "jewelry", jewl,
                {"netWeight": 4.5, "goldRate": 9850, "makingCharge": 800},
            )
            record("Jewelry sale API", jsale is not None, jsale.get("invoice_number", "") if jsale else "")

        # Grocery return (RET-01)
        if groc:
            sale = post_sale(client, api, h, f"uat-ret-{uuid.uuid4().hex[:8]}", "grocery", groc)
            if sale:
                history = client.get(f"{api}/sales/history", headers=h, params={"limit": 1})
                inv_id = sale["id"]
                detail = client.get(f"{api}/sales/{inv_id}", headers=h)
                if detail.status_code == 200 and detail.json().get("lines"):
                    line_id = detail.json()["lines"][0]["id"]
                    ret = client.post(
                        f"{api}/sales/{inv_id}/return",
                        headers=h,
                        json={"reason": "UAT Cycle 2", "lines": [{"invoice_line_id": line_id, "qty": 1}]},
                    )
                    record("Grocery return API", ret.status_code == 200, ret.json().get("return_no", ""))

        # Refund + cashier approval (REF-02, REF-03)
        if groc and cashier_token:
            sale = post_sale(client, api, h, f"uat-ref-{uuid.uuid4().hex[:8]}", "grocery", groc)
            ch = {"Authorization": f"Bearer {cashier_token}"}
            if sale:
                refund = client.post(
                    f"{api}/sales/{sale['id']}/refund",
                    headers=ch,
                    json={"amount": 50, "method": "cash"},
                )
                approval_ok = refund.status_code == 202
                record("Cashier refund approval request", approval_ok)
                if approval_ok:
                    mgr = login(client, api, "manager@pulse.pos", "manager123")
                    if mgr:
                        mh = {"Authorization": f"Bearer {mgr}"}
                        appr = client.post(
                            f"{api}/approvals/{refund.json()['approval_id']}/approve",
                            headers=mh,
                            json={"comment": "UAT Cycle 2"},
                        )
                        record("Manager approves refund", appr.status_code == 200)

        # Receipt reprint audit (POS-04, AUD-03)
        history = client.get(f"{api}/sales/history", headers=h, params={"limit": 1})
        if history.status_code == 200 and history.json():
            inv_id = history.json()[0]["id"]
            rp = client.post(f"{api}/sales/{inv_id}/receipt/reprint", headers=h)
            record("Receipt reprint API", rp.status_code == 200 and rp.json().get("reprinted"))

        # Frontend login page
        try:
            fe = client.get("http://localhost:3001/login", follow_redirects=True)
            record("Frontend login page", fe.status_code == 200, f"status={fe.status_code}")
        except Exception as e:
            record("Frontend login page", False, str(e))

    passed = sum(1 for _, ok, _ in CHECKS if ok)
    total = len(CHECKS)
    print(f"\n{passed}/{total} Cycle 2 checks passed")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
