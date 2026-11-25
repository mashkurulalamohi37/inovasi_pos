"""Phase 6B-14 — Cosmetics vertical wiring tests."""

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.audit import AuditLog
from app.models.core import Company
from app.models.industry import CosmeticsBatch
from app.models.inventory import StockBalance
from app.models.product import Product
from app.models.sales import SalesInvoiceLine
from tests.test_operations import (
    _create_purchase,
    _get_supplier,
    _store_id,
    get_product_by_sku,
    login,
)


def _stock_qty(client: TestClient, headers: dict, product_id: str, store_id: str | None = None) -> float:
    params = {"store_id": store_id} if store_id else {}
    res = client.get("/api/v1/inventory/stock", headers=headers, params=params)
    assert res.status_code == 200
    return sum(r["qty_on_hand"] for r in res.json() if r["product_id"] == product_id)


def _cos_sale(client, headers, product, batch_id, qty=1, *, txn_id="cos-sale", variant_id=None, store_id=None):
    meta = {"batch_id": batch_id}
    if variant_id:
        meta["variant_id"] = variant_id
    if store_id:
        meta["store_id"] = store_id
    return client.post(
        "/api/v1/sales",
        headers=headers,
        json={
            "client_transaction_id": f"{txn_id}-{batch_id[:8]}-{qty}",
            "industry_pack": "cosmetics",
            "store_id": store_id,
            "lines": [{
                "product_id": product["id"],
                "sku": product["sku"],
                "name": product["name"],
                "qty": qty,
                "unit_price": product["base_price"],
                "meta": meta,
            }],
            "subtotal": product["base_price"] * qty,
            "tax": round(product["base_price"] * qty * 0.05, 2),
            "total": round(product["base_price"] * qty * 1.05, 2),
            "tender": "cash",
        },
    )


def test_cosmetics_profile_upsert_and_tenant_isolation(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "COS-LIP")
    ok = client.post(
        "/api/v1/industry/cosmetics/profiles",
        headers=auth_headers,
        json={"product_id": product["id"], "finish": "satin", "shade_family": "nude"},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["finish"] == "satin"

    got = client.get(f"/api/v1/industry/cosmetics/profiles/{product['id']}", headers=auth_headers)
    assert got.status_code == 200
    assert got.json()["shade_family"] == "nude"

    brands = client.get("/api/v1/industry/cosmetics/brands", headers=auth_headers)
    assert brands.status_code == 200
    assert any(b.get("name") in {"Unilever", "Marico"} for b in brands.json())

    other_co = session.exec(select(Company).where(Company.code != "PULSE-DEMO")).first()
    assert other_co is not None
    foreign = Product(
        company_id=other_co.id,
        sku="FK-COS-X",
        name="Foreign Lip",
        industry_pack="cosmetics",
        base_price=10,
    )
    session.add(foreign)
    session.commit()
    blocked = client.post(
        "/api/v1/industry/cosmetics/profiles",
        headers=auth_headers,
        json={"product_id": foreign.id, "finish": "gloss"},
    )
    assert blocked.status_code in {400, 404}


def test_grn_creates_batch_without_double_count(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "COS-CREAM")
    supplier = _get_supplier(client, auth_headers)
    store_id = _store_id(client, auth_headers)
    before_stock = _stock_qty(client, auth_headers, product["id"], store_id)

    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=8, unit_cost=400)
    client.post(f"/api/v1/purchases/{purchase['id']}/approve", headers=auth_headers)
    line_id = purchase["lines"][0]["id"]
    expiry = (datetime.now(timezone.utc) + timedelta(days=200)).date().isoformat()
    receive = client.post(
        f"/api/v1/purchases/{purchase['id']}/receive",
        headers=auth_headers,
        json={
            "lines": [{
                "purchase_line_id": line_id,
                "qty": 8,
                "batch_no": "COS-GRN-001",
                "expiry_date": expiry,
            }]
        },
    )
    assert receive.status_code == 200, receive.text

    after_stock = _stock_qty(client, auth_headers, product["id"], store_id)
    assert after_stock == before_stock + 8

    new_batch = session.exec(
        select(CosmeticsBatch).where(
            CosmeticsBatch.product_id == product["id"],
            CosmeticsBatch.batch_no == "COS-GRN-001",
        )
    ).first()
    assert new_batch is not None
    assert new_batch.qty_on_hand == 8

    sellable_batch_total = sum(
        b.qty_on_hand or 0
        for b in session.exec(select(CosmeticsBatch).where(CosmeticsBatch.product_id == product["id"])).all()
        if b.status in {"available", "near_expiry"}
    )
    assert after_stock == sellable_batch_total



def test_fefo_picks_earliest_excludes_expired(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "COS-LIP")
    store_id = _store_id(client, auth_headers)
    res = client.get(
        "/api/v1/industry/cosmetics/batches/fefo",
        headers=auth_headers,
        params={"product_id": product["id"], "store_id": store_id},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["batch_no"] != "COS-LIP-EXP"
    # Near-expiry (45d) should beat valid (200d) for FEFO
    assert body["batch_no"] == "COS-LIP-NEAR"


def test_expired_and_quarantined_sale_blocked(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "COS-LIP")
    expired = session.exec(
        select(CosmeticsBatch).where(CosmeticsBatch.batch_no == "COS-LIP-EXP")
    ).first()
    assert expired is not None
    res = _cos_sale(client, auth_headers, product, expired.id, qty=1, txn_id="cos-exp-block")
    assert res.status_code == 409
    assert "expired" in res.json()["detail"].lower()

    valid = session.exec(
        select(CosmeticsBatch).where(CosmeticsBatch.batch_no == "COS-LIP-VALID")
    ).first()
    q = client.post(
        f"/api/v1/industry/cosmetics/batches/{valid.id}/quarantine",
        headers=auth_headers,
        json={"reason": "Leak"},
    )
    assert q.status_code == 200, q.text
    blocked = _cos_sale(client, auth_headers, product, valid.id, qty=1, txn_id="cos-q-block")
    assert blocked.status_code == 409
    assert "quarantine" in blocked.json()["detail"].lower()


def test_tester_convert_sellable_down_cannot_sell_rbac_audit(
    auth_headers, client: TestClient, session: Session
):
    product = get_product_by_sku(client, auth_headers, "COS-LIP")
    store_id = _store_id(client, auth_headers)
    near = session.exec(
        select(CosmeticsBatch).where(CosmeticsBatch.batch_no == "COS-LIP-NEAR")
    ).first()
    # Use cream or re-seed path — near may be depleted by other tests; pick any sellable
    batch = session.exec(
        select(CosmeticsBatch).where(
            CosmeticsBatch.product_id == product["id"],
            CosmeticsBatch.qty_on_hand > 0,
            CosmeticsBatch.status.in_(["available", "near_expiry"]),
        )
    ).first()
    if not batch:
        # Restore a sellable batch for this test
        batch = near or session.exec(select(CosmeticsBatch).where(CosmeticsBatch.product_id == product["id"])).first()
        batch.status = "available"
        batch.qty_on_hand = max(batch.qty_on_hand or 0, 5)
        batch.expiry_date = datetime.now(timezone.utc) + timedelta(days=120)
        session.add(batch)
        bal = session.exec(
            select(StockBalance).where(
                StockBalance.product_id == product["id"], StockBalance.store_id == store_id
            )
        ).first()
        if bal:
            bal.qty_on_hand = max(bal.qty_on_hand or 0, 5)
            session.add(bal)
        session.commit()
        session.refresh(batch)

    before_stock = _stock_qty(client, auth_headers, product["id"], store_id)
    before_batch = batch.qty_on_hand

    conv = client.post(
        "/api/v1/industry/cosmetics/testers/convert",
        headers=auth_headers,
        json={
            "product_id": product["id"],
            "batch_id": batch.id,
            "store_id": store_id,
            "qty": 1,
            "reason": "Counter display tester",
        },
    )
    assert conv.status_code == 200, conv.text
    tester_id = conv.json()["id"]
    session.refresh(batch)
    assert batch.qty_on_hand == before_batch - 1
    assert _stock_qty(client, auth_headers, product["id"], store_id) == before_stock - 1

    testers = client.get("/api/v1/industry/cosmetics/testers", headers=auth_headers)
    assert testers.status_code == 200
    assert any(t["id"] == tester_id for t in testers.json())

    audits = session.exec(
        select(AuditLog).where(
            AuditLog.entity_type == "cosmetics_tester_balance",
            AuditLog.entity_id == tester_id,
        )
    ).all()
    assert len(audits) >= 1

    cashier = login(client, "cashier@pulse.pos", "cashier123")
    denied = client.post(
        "/api/v1/industry/cosmetics/testers/convert",
        headers=cashier,
        json={
            "product_id": product["id"],
            "batch_id": batch.id,
            "store_id": store_id,
            "qty": 1,
            "reason": "nope",
        },
    )
    assert denied.status_code == 403

    q_denied = client.post(
        f"/api/v1/industry/cosmetics/batches/{batch.id}/quarantine",
        headers=cashier,
        json={"reason": "nope"},
    )
    assert q_denied.status_code == 403


def test_sale_decrements_stock_and_batch_once(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "COS-CREAM")
    store_id = _store_id(client, auth_headers)
    batch = session.exec(
        select(CosmeticsBatch).where(
            CosmeticsBatch.product_id == product["id"],
            CosmeticsBatch.qty_on_hand > 0,
            CosmeticsBatch.status.in_(["available", "near_expiry"]),
        )
    ).first()
    assert batch is not None
    before_stock = _stock_qty(client, auth_headers, product["id"], store_id)
    before_batch = batch.qty_on_hand

    res = _cos_sale(client, auth_headers, product, batch.id, qty=2, txn_id="cos-dec", store_id=store_id)
    assert res.status_code == 200, res.text
    session.refresh(batch)
    assert batch.qty_on_hand == before_batch - 2
    assert _stock_qty(client, auth_headers, product["id"], store_id) == before_stock - 2


def test_return_unopened_restores_opened_does_not(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "COS-CREAM")
    store_id = _store_id(client, auth_headers)
    batch = session.exec(
        select(CosmeticsBatch).where(
            CosmeticsBatch.product_id == product["id"],
            CosmeticsBatch.qty_on_hand >= 2,
            CosmeticsBatch.status.in_(["available", "near_expiry"]),
        )
    ).first()
    assert batch is not None
    before_stock = _stock_qty(client, auth_headers, product["id"], store_id)
    before_batch = batch.qty_on_hand

    sale = _cos_sale(client, auth_headers, product, batch.id, qty=2, txn_id="cos-ret", store_id=store_id)
    assert sale.status_code == 200, sale.text
    inv_id = sale.json()["id"]
    lines = session.exec(select(SalesInvoiceLine).where(SalesInvoiceLine.invoice_id == inv_id)).all()
    assert len(lines) == 1
    line = lines[0]

    # Unopened restores sellable
    ret1 = client.post(
        f"/api/v1/sales/{inv_id}/return",
        headers=auth_headers,
        json={
            "reason": "Customer change of mind",
            "condition": "unopened",
            "lines": [{"invoice_line_id": line.id, "qty": 1, "condition": "unopened"}],
        },
    )
    assert ret1.status_code == 200, ret1.text
    session.refresh(batch)
    mid_stock = _stock_qty(client, auth_headers, product["id"], store_id)
    assert mid_stock == before_stock - 1
    assert batch.qty_on_hand == before_batch - 1

    # Opened: financial OK, no sellable restore
    ret2 = client.post(
        f"/api/v1/sales/{inv_id}/return",
        headers=auth_headers,
        json={
            "reason": "Opened in store",
            "condition": "opened",
            "lines": [{"invoice_line_id": line.id, "qty": 1, "condition": "opened"}],
        },
    )
    assert ret2.status_code == 200, ret2.text
    session.refresh(batch)
    assert _stock_qty(client, auth_headers, product["id"], store_id) == mid_stock
    assert batch.qty_on_hand == before_batch - 1
    # Non-sellable tracking batch created
    ns = [
        b
        for b in session.exec(
            select(CosmeticsBatch).where(CosmeticsBatch.product_id == product["id"])
        ).all()
        if b.status == "quarantined" and "NS-OPE" in (b.batch_no or "")
    ]
    assert len(ns) >= 1


def test_over_return_blocked(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "COS-CREAM")
    store_id = _store_id(client, auth_headers)
    batch = session.exec(
        select(CosmeticsBatch).where(
            CosmeticsBatch.product_id == product["id"],
            CosmeticsBatch.qty_on_hand >= 1,
            CosmeticsBatch.status.in_(["available", "near_expiry"]),
        )
    ).first()
    assert batch is not None
    sale = _cos_sale(client, auth_headers, product, batch.id, qty=1, txn_id="cos-over", store_id=store_id)
    assert sale.status_code == 200, sale.text
    line = session.exec(
        select(SalesInvoiceLine).where(SalesInvoiceLine.invoice_id == sale.json()["id"])
    ).first()
    bad = client.post(
        f"/api/v1/sales/{sale.json()['id']}/return",
        headers=auth_headers,
        json={
            "reason": "Too much",
            "condition": "unopened",
            "lines": [{"invoice_line_id": line.id, "qty": 2, "condition": "unopened"}],
        },
    )
    assert bad.status_code == 400
