"""Phase 6B-2H — pharmacy stock reconciliation, returns, Rx/restricted validation."""

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.audit import AuditLog
from app.models.industry import PharmaBatch, PharmaProductProfile, PharmaRestrictedMedicineLog
from app.models.inventory import StockBalance, StockLedger
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


def _pharma_sale(client, headers, product, batch_id, qty=1, *, rx_ref=None, restricted=False, txn_id="pharma-rec"):
    meta = {"batch_id": batch_id, "fefo": True}
    if rx_ref:
        meta["rx_ref"] = rx_ref
    if restricted:
        meta["restricted"] = True
    return client.post(
        "/api/v1/sales",
        headers=headers,
        json={
            "client_transaction_id": f"{txn_id}-{batch_id[:8]}",
            "industry_pack": "pharmacy",
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


def test_grn_batch_stock_balance_reconciliation(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "PHRM-001")
    supplier = _get_supplier(client, auth_headers)
    store_id = _store_id(client, auth_headers)
    before_stock = _stock_qty(client, auth_headers, product["id"], store_id)
    before_batches = session.exec(
        select(PharmaBatch).where(PharmaBatch.product_id == product["id"])
    ).all()
    before_batch_total = sum(b.qty_on_hand or 0 for b in before_batches)

    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=10, unit_cost=8)
    client.post(f"/api/v1/purchases/{purchase['id']}/approve", headers=auth_headers)
    line_id = purchase["lines"][0]["id"]
    expiry = (datetime.now(timezone.utc) + timedelta(days=200)).date().isoformat()
    receive = client.post(
        f"/api/v1/purchases/{purchase['id']}/receive",
        headers=auth_headers,
        json={"lines": [{"purchase_line_id": line_id, "qty": 10, "batch_no": "GRN-REC-001", "expiry_date": expiry}]},
    )
    assert receive.status_code == 200

    after_stock = _stock_qty(client, auth_headers, product["id"], store_id)
    assert after_stock == before_stock + 10

    new_batch = session.exec(
        select(PharmaBatch).where(
            PharmaBatch.product_id == product["id"],
            PharmaBatch.batch_no == "GRN-REC-001",
        )
    ).first()
    assert new_batch is not None
    assert new_batch.qty_on_hand == 10

    after_batch_total = sum(
        b.qty_on_hand or 0
        for b in session.exec(select(PharmaBatch).where(PharmaBatch.product_id == product["id"])).all()
    )
    assert after_batch_total == before_batch_total + 10

    ledger = session.exec(
        select(StockLedger).where(
            StockLedger.product_id == product["id"],
            StockLedger.batch_id == new_batch.id,
            StockLedger.in_qty == 10,
        )
    ).first()
    assert ledger is not None


def test_sale_decrements_batch_and_stock_balance(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "PHRM-001")
    store_id = _store_id(client, auth_headers)
    batch = session.exec(select(PharmaBatch).where(PharmaBatch.product_id == product["id"])).first()
    before_stock = _stock_qty(client, auth_headers, product["id"], store_id)
    before_batch = batch.qty_on_hand

    res = _pharma_sale(client, auth_headers, product, batch.id, qty=2, txn_id="sale-rec")
    assert res.status_code == 200

    session.refresh(batch)
    assert batch.qty_on_hand == before_batch - 2
    assert _stock_qty(client, auth_headers, product["id"], store_id) == before_stock - 2


def test_sales_return_restores_batch_and_stock(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "PHRM-001")
    store_id = _store_id(client, auth_headers)
    batch = session.exec(select(PharmaBatch).where(PharmaBatch.product_id == product["id"])).first()
    before_batch = batch.qty_on_hand
    before_stock = _stock_qty(client, auth_headers, product["id"], store_id)

    sale = _pharma_sale(client, auth_headers, product, batch.id, qty=3, txn_id="return-rec-sale")
    assert sale.status_code == 200
    inv_line = session.exec(
        select(SalesInvoiceLine).where(SalesInvoiceLine.invoice_id == sale.json()["id"])
    ).first()

    ret = client.post(
        f"/api/v1/sales/{sale.json()['id']}/return",
        headers=auth_headers,
        json={"reason": "Customer return", "lines": [{"invoice_line_id": inv_line.id, "qty": 2}]},
    )
    assert ret.status_code == 200

    session.refresh(batch)
    assert batch.qty_on_hand == before_batch - 1
    assert _stock_qty(client, auth_headers, product["id"], store_id) == before_stock - 1


def test_expired_batch_return_restores_but_not_sellable(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "PHRM-001")
    batch = session.exec(select(PharmaBatch).where(PharmaBatch.product_id == product["id"])).first()
    batch.expiry_date = datetime.now(timezone.utc) + timedelta(days=30)
    session.add(batch)
    session.commit()
    session.refresh(batch)

    sale = _pharma_sale(client, auth_headers, product, batch.id, qty=1, txn_id="exp-ret-sale")
    assert sale.status_code == 200
    inv_line = session.exec(
        select(SalesInvoiceLine).where(SalesInvoiceLine.invoice_id == sale.json()["id"])
    ).first()
    session.refresh(batch)
    after_sale = batch.qty_on_hand

    batch.expiry_date = datetime.now(timezone.utc) - timedelta(days=1)
    session.add(batch)
    session.commit()

    ret = client.post(
        f"/api/v1/sales/{sale.json()['id']}/return",
        headers=auth_headers,
        json={"reason": "Return after expiry", "lines": [{"invoice_line_id": inv_line.id, "qty": 1}]},
    )
    assert ret.status_code == 200
    session.refresh(batch)
    assert batch.qty_on_hand == after_sale + 1

    blocked = _pharma_sale(client, auth_headers, product, batch.id, qty=1, txn_id="exp-ret-block")
    assert blocked.status_code == 409
    assert "expired" in blocked.json()["detail"].lower()


def test_purchase_return_reduces_batch_and_stock(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "PHRM-001")
    supplier = _get_supplier(client, auth_headers)
    store_id = _store_id(client, auth_headers)

    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=5, unit_cost=8)
    client.post(f"/api/v1/purchases/{purchase['id']}/approve", headers=auth_headers)
    line_id = purchase["lines"][0]["id"]
    expiry = (datetime.now(timezone.utc) + timedelta(days=150)).date().isoformat()
    client.post(
        f"/api/v1/purchases/{purchase['id']}/receive",
        headers=auth_headers,
        json={"lines": [{"purchase_line_id": line_id, "qty": 5, "batch_no": "PUR-RET-BATCH", "expiry_date": expiry}]},
    )
    batch = session.exec(
        select(PharmaBatch).where(PharmaBatch.batch_no == "PUR-RET-BATCH")
    ).first()
    assert batch.qty_on_hand == 5
    before_stock = _stock_qty(client, auth_headers, product["id"], store_id)

    ret = client.post(
        f"/api/v1/purchases/{purchase['id']}/return",
        headers=auth_headers,
        json={
            "reason": "Supplier recall",
            "lines": [{"purchase_line_id": line_id, "product_id": product["id"], "qty": 2}],
        },
    )
    assert ret.status_code == 200
    session.refresh(batch)
    assert batch.qty_on_hand == 3
    assert _stock_qty(client, auth_headers, product["id"], store_id) == before_stock - 2


def test_purchase_return_over_batch_qty_rejected(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "PHRM-001")
    supplier = _get_supplier(client, auth_headers)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=3, unit_cost=8)
    client.post(f"/api/v1/purchases/{purchase['id']}/approve", headers=auth_headers)
    line_id = purchase["lines"][0]["id"]
    expiry = (datetime.now(timezone.utc) + timedelta(days=150)).date().isoformat()
    client.post(
        f"/api/v1/purchases/{purchase['id']}/receive",
        headers=auth_headers,
        json={"lines": [{"purchase_line_id": line_id, "qty": 3, "batch_no": "PUR-OVER-BATCH", "expiry_date": expiry}]},
    )
    batch = session.exec(select(PharmaBatch).where(PharmaBatch.batch_no == "PUR-OVER-BATCH")).first()

    ret = client.post(
        f"/api/v1/purchases/{purchase['id']}/return",
        headers=auth_headers,
        json={
            "reason": "Too much",
            "lines": [{"purchase_line_id": line_id, "product_id": product["id"], "qty": batch.qty_on_hand + 1}],
        },
    )
    assert ret.status_code == 400


def test_rx_required_blocked_without_reference(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "PHRM-002")
    batch = session.exec(select(PharmaBatch).where(PharmaBatch.product_id == product["id"])).first()
    res = _pharma_sale(client, auth_headers, product, batch.id, txn_id="rx-block")
    assert res.status_code == 409
    assert "prescription" in res.json()["detail"].lower()


def test_rx_required_allowed_with_reference(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "PHRM-002")
    batch = session.exec(select(PharmaBatch).where(PharmaBatch.product_id == product["id"])).first()
    res = _pharma_sale(
        client, auth_headers, product, batch.id, txn_id="rx-ok", rx_ref="RX-TEST-12345",
    )
    assert res.status_code == 200


def test_restricted_product_blocked_for_cashier(client: TestClient, session: Session):
    product = get_product_by_sku(client, login(client, "cashier@pulse.pos", "cashier123"), "PHRM-002")
    batch = session.exec(select(PharmaBatch).where(PharmaBatch.product_id == product["id"])).first()
    headers = login(client, "cashier@pulse.pos", "cashier123")
    res = _pharma_sale(
        client, headers, product, batch.id, txn_id="restricted-block", rx_ref="RX-CASHIER",
    )
    assert res.status_code == 409
    assert "restricted" in res.json()["detail"].lower()


def test_restricted_product_allowed_for_admin_with_audit(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "PHRM-002")
    batch = session.exec(select(PharmaBatch).where(PharmaBatch.product_id == product["id"])).first()
    res = _pharma_sale(
        client,
        auth_headers,
        product,
        batch.id,
        txn_id="restricted-ok",
        rx_ref="RX-ADMIN",
        restricted=True,
    )
    assert res.status_code == 200
    invoice_id = res.json()["id"]
    logs = session.exec(
        select(PharmaRestrictedMedicineLog).where(PharmaRestrictedMedicineLog.invoice_id == invoice_id)
    ).all()
    assert len(logs) >= 1
    assert logs[0].product_id == product["id"]


def test_pharma_return_without_batch_metadata_rejected(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "PHRM-001")
    batch = session.exec(select(PharmaBatch).where(PharmaBatch.product_id == product["id"])).first()
    sale = _pharma_sale(client, auth_headers, product, batch.id, txn_id="no-batch-meta")
    inv_line = session.exec(
        select(SalesInvoiceLine).where(SalesInvoiceLine.invoice_id == sale.json()["id"])
    ).first()
    inv_line.meta_json = "{}"
    session.add(inv_line)
    session.commit()

    ret = client.post(
        f"/api/v1/sales/{sale.json()['id']}/return",
        headers=auth_headers,
        json={"reason": "Missing batch", "lines": [{"invoice_line_id": inv_line.id, "qty": 1}]},
    )
    assert ret.status_code == 400
    assert "batch_id" in ret.json()["detail"].lower()
