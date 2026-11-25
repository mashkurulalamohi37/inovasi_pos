"""Phase 6B-15 — cross-vertical consistency (runtime, not source-string)."""

import json

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.core import Company
from app.models.industry import CosmeticsBatch, CosmeticsProductProfile, PharmaBatch
from app.models.inventory import StockBalance
from app.models.product import Product, ProductVariant
from app.models.sales import SalesInvoiceLine
from tests.test_building_vertical_wiring import _contractor, _create_confirmed_order, _units
from tests.test_cosmetics_vertical_wiring import _cos_sale
from tests.test_operations import _grocery_sale, _store_id, get_product_by_sku


def _found_shades(session: Session, product_id: str) -> tuple[ProductVariant, ProductVariant]:
    shades = session.exec(
        select(ProductVariant).where(ProductVariant.product_id == product_id).order_by(ProductVariant.variant_code)
    ).all()
    by_code = {s.variant_code: s for s in shades}
    assert "101" in by_code and "102" in by_code, "COS-FOUND seed shades 101/102 required"
    return by_code["101"], by_code["102"]


def test_grocery_sale_without_vertical_batch(auth_headers, client: TestClient):
    """Generic grocery products sell without industry batch metadata."""
    inv = _grocery_sale(client, auth_headers, "xvert-groc-001", qty=1)
    assert inv["id"]
    assert float(inv["total"]) > 0


def test_pharmacy_sale_requires_batch_valid_succeeds(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "PHRM-001")
    no_batch = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json={
            "client_transaction_id": "xvert-pharma-no-batch",
            "industry_pack": "pharmacy",
            "lines": [{
                "product_id": product["id"],
                "sku": product["sku"],
                "name": product["name"],
                "qty": 1,
                "unit_price": product["base_price"],
                "meta": {},
            }],
            "subtotal": product["base_price"],
            "tax": round(product["base_price"] * 0.05, 2),
            "total": round(product["base_price"] * 1.05, 2),
            "tender": "cash",
        },
    )
    assert no_batch.status_code == 409
    assert "batch" in no_batch.json()["detail"].lower()

    batch = session.exec(select(PharmaBatch).where(PharmaBatch.product_id == product["id"])).first()
    assert batch is not None
    ok = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json={
            "client_transaction_id": "xvert-pharma-with-batch",
            "industry_pack": "pharmacy",
            "lines": [{
                "product_id": product["id"],
                "sku": product["sku"],
                "name": product["name"],
                "qty": 1,
                "unit_price": product["base_price"],
                "meta": {"batch_id": batch.id, "fefo": True},
            }],
            "subtotal": product["base_price"],
            "tax": round(product["base_price"] * 0.05, 2),
            "total": round(product["base_price"] * 1.05, 2),
            "tender": "cash",
        },
    )
    assert ok.status_code == 200, ok.text


def test_cosmetics_expired_quarantined_blocked_reassert(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "COS-LIP")
    expired = session.exec(select(CosmeticsBatch).where(CosmeticsBatch.batch_no == "COS-LIP-EXP")).first()
    assert expired is not None
    res = _cos_sale(client, auth_headers, product, expired.id, qty=1, txn_id="xvert-cos-exp")
    assert res.status_code == 409
    assert "expired" in res.json()["detail"].lower()


def test_cosmetics_shade_b_zero_batch_rejected_despite_product_stock(
    auth_headers, client: TestClient, session: Session
):
    """P0: shade with no batches must not sell against product-level StockBalance from another shade."""
    product = get_product_by_sku(client, auth_headers, "COS-FOUND")
    store_id = _store_id(client, auth_headers)
    shade_a, shade_b = _found_shades(session, product["id"])

    shade_a_batches = session.exec(
        select(CosmeticsBatch).where(
            CosmeticsBatch.product_id == product["id"],
            CosmeticsBatch.variant_id == shade_a.id,
            CosmeticsBatch.qty_on_hand > 0,
        )
    ).all()
    assert shade_a_batches, "seed must stock shade 101"
    shade_b_batches = session.exec(
        select(CosmeticsBatch).where(
            CosmeticsBatch.product_id == product["id"],
            CosmeticsBatch.variant_id == shade_b.id,
        )
    ).all()
    assert not any((b.qty_on_hand or 0) > 0 and b.status in {"available", "near_expiry"} for b in shade_b_batches)

    bal = session.exec(
        select(StockBalance).where(
            StockBalance.product_id == product["id"],
            StockBalance.store_id == store_id,
        )
    ).first()
    assert bal is not None and (bal.qty_on_hand or 0) > 0

    quote = client.post(
        "/api/v1/industry/cosmetics/quote",
        headers=auth_headers,
        json={
            "product_id": product["id"],
            "variant_id": shade_b.id,
            "qty": 1,
            "store_id": store_id,
        },
    )
    assert quote.status_code == 400, quote.text
    detail = quote.json()["detail"].lower()
    assert "shade" in detail or "variant" in detail or "batch" in detail or "stock" in detail

    sale = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json={
            "client_transaction_id": "xvert-cos-shade-b-zero",
            "industry_pack": "cosmetics",
            "store_id": store_id,
            "lines": [{
                "product_id": product["id"],
                "sku": product["sku"],
                "name": product["name"],
                "qty": 1,
                "unit_price": product["base_price"],
                "meta": {"variant_id": shade_b.id, "store_id": store_id},
            }],
            "subtotal": product["base_price"],
            "tax": round(product["base_price"] * 0.05, 2),
            "total": round(product["base_price"] * 1.05, 2),
            "tender": "cash",
        },
    )
    assert sale.status_code == 409, sale.text
    sale_detail = sale.json()["detail"].lower()
    assert "shade" in sale_detail or "variant" in sale_detail or "batch" in sale_detail or "stock" in sale_detail

    # Wrong shade: cannot post shade B using shade A's batch
    mismatched = _cos_sale(
        client,
        auth_headers,
        product,
        shade_a_batches[0].id,
        qty=1,
        txn_id="xvert-cos-shade-mismatch",
        variant_id=shade_b.id,
        store_id=store_id,
    )
    assert mismatched.status_code == 409
    assert "variant" in mismatched.json()["detail"].lower() or "shade" in mismatched.json()["detail"].lower()

    # Shade A still sellable
    ok_quote = client.post(
        "/api/v1/industry/cosmetics/quote",
        headers=auth_headers,
        json={
            "product_id": product["id"],
            "variant_id": shade_a.id,
            "qty": 1,
            "store_id": store_id,
        },
    )
    assert ok_quote.status_code == 200, ok_quote.text
    assert ok_quote.json()["batch_id"]


def test_electronics_sold_serial_cannot_double_sell(auth_headers, client: TestClient, session: Session):
    from app.models.industry import ElectronicsSerialStock

    product = get_product_by_sku(client, auth_headers, "ELEC-001")
    row = ElectronicsSerialStock(
        company_id=session.exec(select(ElectronicsSerialStock).limit(1)).first().company_id,
        product_id=product["id"],
        serial_imei="XVERT-ELEC-SOLD-001",
        status="sold",
    )
    session.add(row)
    session.commit()

    res = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json={
            "client_transaction_id": "xvert-elec-double-sell",
            "industry_pack": "electronics",
            "lines": [{
                "product_id": product["id"],
                "sku": product["sku"],
                "name": product["name"],
                "qty": 1,
                "unit_price": product["base_price"],
                "meta": {"serial": row.serial_imei},
            }],
            "subtotal": product["base_price"],
            "tax": round(product["base_price"] * 0.05, 2),
            "total": round(product["base_price"] * 1.05, 2),
            "tender": "cash",
        },
    )
    assert res.status_code == 409


def test_building_confirm_invoice_skips_stock_until_dispatch(
    auth_headers, client: TestClient, session: Session
):
    product = get_product_by_sku(client, auth_headers, "BM-CEMENT")
    units = _units(client, auth_headers)
    contractor = _contractor(client, auth_headers)
    store_id = _store_id(client, auth_headers)

    bal_before = session.exec(
        select(StockBalance).where(
            StockBalance.product_id == product["id"],
            StockBalance.store_id == store_id,
        )
    ).first()
    qty_before = float(bal_before.qty_on_hand) if bal_before else 0.0

    order = _create_confirmed_order(
        client, auth_headers, product=product, units=units, contractor=contractor, entered_qty=2
    )
    assert order["status"] == "confirmed"
    assert order["sales_invoice_id"]

    session.expire_all()
    bal_after = session.exec(
        select(StockBalance).where(
            StockBalance.product_id == product["id"],
            StockBalance.store_id == store_id,
        )
    ).first()
    qty_after = float(bal_after.qty_on_hand) if bal_after else 0.0
    assert qty_after == qty_before, "delivery fulfillment must not deduct stock on invoice confirm"

    inv_lines = session.exec(
        select(SalesInvoiceLine).where(SalesInvoiceLine.invoice_id == order["sales_invoice_id"])
    ).all()
    assert inv_lines
    meta = json.loads(inv_lines[0].meta_json or "{}")
    assert meta.get("fulfillment") == "delivery" or meta.get("building_order_id")


def test_cosmetics_cross_tenant_lookup_rejected(auth_headers, client: TestClient, session: Session):
    other_co = session.exec(select(Company).where(Company.code != "PULSE-DEMO")).first()
    assert other_co is not None
    foreign = Product(
        company_id=other_co.id,
        sku="FK-XVERT-COS",
        name="Foreign Cosmetics",
        industry_pack="cosmetics",
        base_price=10,
    )
    session.add(foreign)
    session.commit()

    profile = client.get(f"/api/v1/industry/cosmetics/profiles/{foreign.id}", headers=auth_headers)
    assert profile.status_code in {400, 404}

    quote = client.post(
        "/api/v1/industry/cosmetics/quote",
        headers=auth_headers,
        json={"product_id": foreign.id, "qty": 1},
    )
    assert quote.status_code in {400, 404}


def test_bookstore_cross_tenant_profile_rejected(auth_headers, client: TestClient, session: Session):
    other_co = session.exec(select(Company).where(Company.code != "PULSE-DEMO")).first()
    assert other_co is not None
    foreign = Product(
        company_id=other_co.id,
        sku="FK-XVERT-BK",
        name="Foreign Book",
        industry_pack="bookstore",
        base_price=10,
    )
    session.add(foreign)
    session.commit()
    res = client.get(f"/api/v1/industry/bookstore/profiles/{foreign.id}", headers=auth_headers)
    assert res.status_code in {400, 404}


def test_cosmetics_not_validated_by_pharma_batch_rules(
    auth_headers, client: TestClient, session: Session
):
    """Contamination: cosmetics sale must not require PharmaBatch — cosmetics batch is enough."""
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
    profile = session.exec(
        select(CosmeticsProductProfile).where(CosmeticsProductProfile.product_id == product["id"])
    ).first()
    assert profile is not None

    # Explicitly omit pharma batch_id; only cosmetics batch_id
    res = _cos_sale(client, auth_headers, product, batch.id, qty=1, txn_id="xvert-no-pharma", store_id=store_id)
    assert res.status_code == 200, res.text
    assert "pharma" not in (res.json().get("detail") or "").lower() if res.status_code != 200 else True
