"""Phase 4 sales hardening: split pay, reservations, return policy, sync replay."""

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.config_engine import StorePolicy
from app.models.sales import Payment, SalesInvoice

from test_operations import _grocery_sale, get_product_by_sku


def test_split_payment_creates_multiple_payment_rows(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    subtotal = product["base_price"] * 2
    tax = round(subtotal * 0.05, 2)
    total = round(subtotal + tax, 2)
    res = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json={
            "client_transaction_id": "p4-split-001",
            "industry_pack": "grocery",
            "lines": [
                {
                    "product_id": product["id"],
                    "sku": product["sku"],
                    "name": product["name"],
                    "qty": 2,
                    "unit_price": product["base_price"],
                }
            ],
            "subtotal": subtotal,
            "tax": tax,
            "total": total,
            "tender": "split",
            "payments": [
                {"method": "cash", "amount": round(total * 0.6, 2)},
                {"method": "card", "amount": round(total * 0.4, 2)},
            ],
        },
    )
    assert res.status_code == 200
    inv = session.get(SalesInvoice, res.json()["id"])
    assert inv is not None
    assert inv.tender == "split"
    pays = session.exec(select(Payment).where(Payment.invoice_id == inv.id)).all()
    assert len(pays) == 2
    assert round(sum(p.amount for p in pays), 2) == total


def test_sale_with_reservation_consumes_stock(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    me = client.get("/api/v1/auth/me", headers=auth_headers).json()
    store_id = me["store_id"]

    hold = client.post(
        "/api/v1/inventory/reservations",
        headers=auth_headers,
        json={"product_id": product["id"], "store_id": store_id, "qty": 1, "reference_type": "cart"},
    )
    assert hold.status_code == 200
    res_id = hold.json()["id"]

    subtotal = product["base_price"]
    tax = round(subtotal * 0.05, 2)
    total = round(subtotal + tax, 2)
    sale = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json={
            "client_transaction_id": "p4-reservation-001",
            "industry_pack": "grocery",
            "lines": [
                {
                    "product_id": product["id"],
                    "sku": product["sku"],
                    "name": product["name"],
                    "qty": 1,
                    "unit_price": product["base_price"],
                    "reservation_id": res_id,
                }
            ],
            "subtotal": subtotal,
            "tax": tax,
            "total": total,
            "tender": "cash",
            "reservation_ids": [res_id],
        },
    )
    assert sale.status_code == 200

    res_check = client.get(f"/api/v1/inventory/reservations", headers=auth_headers)
    row = next(r for r in res_check.json() if r["id"] == res_id)
    assert row["status"] == "consumed"


def test_sync_status_duplicate(auth_headers, client: TestClient):
    sale = _grocery_sale(client, auth_headers, "p4-sync-dup-001", qty=1)
    dup = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json={
            "client_transaction_id": "p4-sync-dup-001",
            "industry_pack": "grocery",
            "lines": [{"sku": "x", "name": "x", "qty": 1, "unit_price": 1}],
            "subtotal": 1,
            "total": 1,
            "tender": "cash",
        },
    )
    assert dup.status_code == 200
    assert dup.json()["duplicate"] is True

    status = client.get("/api/v1/sales/sync/p4-sync-dup-001", headers=auth_headers)
    assert status.status_code == 200
    assert status.json()["status"] in ("duplicate", "synced")
    assert status.json()["invoice_number"] == sale["invoice_number"]


def test_return_blocked_after_window(auth_headers, client: TestClient, session: Session):
    sale = _grocery_sale(client, auth_headers, "p4-return-window-001", qty=1)
    inv = session.get(SalesInvoice, sale["id"])
    assert inv is not None
    inv.completed_at = datetime.now(timezone.utc) - timedelta(days=60)
    session.add(inv)
    policy = session.exec(
        select(StorePolicy).where(
            StorePolicy.company_id == inv.company_id,
            StorePolicy.store_id == inv.store_id,
            StorePolicy.policy_key == "sales_return_window_days",
        )
    ).first()
    if policy:
        policy.policy_value = "30"
        session.add(policy)
    session.commit()

    from app.models.sales import SalesInvoiceLine

    line = session.exec(select(SalesInvoiceLine).where(SalesInvoiceLine.invoice_id == inv.id)).first()
    ret = client.post(
        f"/api/v1/sales/{sale['id']}/return",
        headers=auth_headers,
        json={"reason": "Late return", "lines": [{"invoice_line_id": line.id, "qty": 1}]},
    )
    assert ret.status_code == 409


def test_sales_policy_endpoint(auth_headers, client: TestClient):
    res = client.get("/api/v1/sales/policy", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert "return_window_days" in data
    assert "cart_reservation_minutes" in data
