"""Phase 4 — Fashion POS pricing authority + cashier shifts + last-unit stock."""

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.audit import AuditLog
from app.models.industry import FashionProductVariant
from app.models.inventory import StockBalance
from app.models.product import Product, ProductVariant
from app.models.sales import CashierShift, SalesInvoice
from tests.test_industry_sales import _sale_payload, get_product_by_sku, login
from tests.test_operations import _store_id


def test_fashion_msp_blocks_without_override(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "FASH-001")
    variant = session.exec(
        select(ProductVariant).where(ProductVariant.variant_code == "FASH-001-M-BLU")
    ).first()
    assert variant is not None
    # Seed MSP is 990; sell far below
    payload = _sale_payload(
        f"fash-msp-{uuid.uuid4().hex[:8]}",
        "fashion",
        product["sku"],
        product["name"],
        500,
        product_id=product["id"],
        meta={"variant_id": variant.id, "size": variant.size, "color": variant.color},
    )
    # Admin has manager_discount but missing reason → 400
    res = client.post("/api/v1/sales", json=payload, headers=auth_headers)
    assert res.status_code == 400
    assert "price_override_reason" in res.json()["detail"].lower()


def test_fashion_msp_override_audited(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "FASH-001")
    variant = session.exec(
        select(ProductVariant).where(ProductVariant.variant_code == "FASH-001-M-BLU")
    ).first()
    assert variant is not None
    payload = _sale_payload(
        f"fash-ov-{uuid.uuid4().hex[:8]}",
        "fashion",
        product["sku"],
        product["name"],
        800,
        product_id=product["id"],
        meta={
            "variant_id": variant.id,
            "price_override_reason": "VIP customer manager approved",
        },
    )
    res = client.post("/api/v1/sales", json=payload, headers=auth_headers)
    assert res.status_code == 200, res.text
    audits = session.exec(
        select(AuditLog).where(AuditLog.action == "pos.price_override", AuditLog.entity_id == product["id"])
    ).all()
    assert len(audits) >= 1


def test_fashion_cashier_cannot_override_msp(client: TestClient, session: Session):
    headers = login(client, "cashier@pulse.pos", "cashier123")
    product = session.exec(select(Product).where(Product.sku == "FASH-001")).first()
    assert product is not None
    variant = session.exec(
        select(ProductVariant).where(ProductVariant.variant_code == "FASH-001-S-BLU")
    ).first()
    assert variant is not None
    payload = _sale_payload(
        f"fash-cash-{uuid.uuid4().hex[:8]}",
        "fashion",
        product.sku,
        product.name,
        500,
        product_id=product.id,
        meta={"variant_id": variant.id, "price_override_reason": "please"},
    )
    res = client.post("/api/v1/sales", json=payload, headers=headers)
    assert res.status_code == 403


def test_shift_open_close_variance(auth_headers, client: TestClient, session: Session):
    store_id = _store_id(client, auth_headers)
    opened = client.post(
        "/api/v1/pos/shifts/open",
        headers=auth_headers,
        json={"store_id": store_id, "opening_float": 1000},
    )
    assert opened.status_code == 200, opened.text
    shift_id = opened.json()["id"]
    assert opened.json()["status"] == "open"

    current = client.get("/api/v1/pos/shifts/current", headers=auth_headers)
    assert current.status_code == 200
    assert current.json()["id"] == shift_id

    # Fashion sale at list price attaches shift
    product = get_product_by_sku(client, auth_headers, "FASH-001")
    variant = session.exec(
        select(ProductVariant).where(ProductVariant.variant_code == "FASH-001-M-BLU")
    ).first()
    assert variant is not None
    sale = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json=_sale_payload(
            f"fash-shift-{uuid.uuid4().hex[:8]}",
            "fashion",
            product["sku"],
            product["name"],
            product["base_price"],
            product_id=product["id"],
            meta={"variant_id": variant.id},
            store_id=store_id,
        ),
    )
    assert sale.status_code == 200, sale.text
    inv = session.get(SalesInvoice, sale.json()["id"])
    assert inv is not None
    assert inv.shift_id == shift_id

    closed = client.post(
        f"/api/v1/pos/shifts/{shift_id}/close",
        headers=auth_headers,
        json={"closing_counted": 1000 + float(inv.total)},
    )
    assert closed.status_code == 200, closed.text
    body = closed.json()
    assert body["status"] == "closed"
    assert body["expected_cash"] is not None
    assert abs(float(body["variance"])) < 0.02


def test_current_shift_is_blind_no_expected_cash_leak(auth_headers, client: TestClient):
    """A cashier's own current-shift view must never reveal the system's
    running expected cash — otherwise they could just type back what they see
    and hide a shortage. The figure is only ever revealed after a close is
    committed (test_shift_open_close_variance) or to a manager (test below)."""
    store_id = _store_id(client, auth_headers)
    client.post(
        "/api/v1/pos/shifts/open",
        headers=auth_headers,
        json={"store_id": store_id, "opening_float": 500},
    )
    current = client.get("/api/v1/pos/shifts/current", headers=auth_headers)
    assert current.status_code == 200
    assert current.json()["status"] == "open"
    assert "expected_cash_so_far" not in current.json()

    # Close so this shift doesn't linger and block later tests in this file
    # that open a fresh shift for the same cashier/store.
    client.post(
        f"/api/v1/pos/shifts/{current.json()['id']}/close",
        headers=auth_headers,
        json={"closing_counted": 500},
    )


def test_manager_shift_list_sees_running_expected_cash_for_open_drawers(client: TestClient):
    """Multi-drawer oversight: a manager watching the floor can see the live
    expected total for an open drawer (and who's on it) even though the
    cashier operating that drawer cannot — see test above."""
    cashier = login(client, "cashier@pulse.pos", "cashier123")
    store_id = _store_id(client, cashier)
    opened = client.post(
        "/api/v1/pos/shifts/open",
        headers=cashier,
        json={"store_id": store_id, "opening_float": 200},
    )
    assert opened.status_code == 200, opened.text
    shift_id = opened.json()["id"]

    manager_list = client.get(
        "/api/v1/pos/shifts", headers=auth_headers_for_admin(client), params={"store_id": store_id, "status": "open"}
    )
    assert manager_list.status_code == 200
    row = next(r for r in manager_list.json() if r["id"] == shift_id)
    assert "expected_cash_so_far" in row
    assert row["expected_cash_so_far"] == 200
    assert row.get("cashier_name")

    client.post(f"/api/v1/pos/shifts/{shift_id}/close", headers=cashier, json={"closing_counted": 200})


def auth_headers_for_admin(client: TestClient) -> dict[str, str]:
    return login(client, "admin@pulse.pos", "admin123")


def test_shift_required_policy_blocks_sale(auth_headers, client: TestClient, session: Session):
    from app.models.config_engine import StorePolicy
    from app.models.core import Store

    store_id = _store_id(client, auth_headers)
    # Ensure no open shift for admin
    open_rows = session.exec(
        select(CashierShift).where(CashierShift.status == "open", CashierShift.store_id == store_id)
    ).all()
    for row in open_rows:
        row.status = "closed"
        session.add(row)
    session.commit()

    company = session.exec(select(Store).where(Store.id == store_id)).first()
    assert company is not None
    policy = StorePolicy(
        company_id=company.company_id,
        store_id=store_id,
        policy_key="pos.require_open_shift",
        policy_value="true",
    )
    session.add(policy)
    session.commit()

    product = get_product_by_sku(client, auth_headers, "FASH-001")
    variant = session.exec(
        select(ProductVariant).where(ProductVariant.variant_code == "FASH-001-L-BLU")
    ).first()
    res = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json=_sale_payload(
            f"fash-noshift-{uuid.uuid4().hex[:8]}",
            "fashion",
            product["sku"],
            product["name"],
            product["base_price"],
            product_id=product["id"],
            meta={"variant_id": variant.id if variant else None},
            store_id=store_id,
        ),
    )
    assert res.status_code == 409
    assert "shift" in res.json()["detail"].lower()


def test_fashion_last_unit_second_sale_fails(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "FASH-003")
    variant = session.exec(
        select(ProductVariant).where(ProductVariant.variant_code == "FASH-003-XL-BLK")
    ).first()
    assert variant is not None
    store_id = _store_id(client, auth_headers)
    prod = session.get(Product, product["id"])
    assert prod is not None

    bal = session.exec(
        select(StockBalance).where(
            StockBalance.company_id == prod.company_id,
            StockBalance.product_id == product["id"],
            StockBalance.store_id == store_id,
        )
    ).first()
    assert bal is not None
    bal.qty_on_hand = 1
    bal.qty_reserved = 0
    session.add(bal)
    session.commit()

    legacy = session.exec(
        select(FashionProductVariant).where(
            FashionProductVariant.product_id == product["id"],
            FashionProductVariant.sku == "FASH-003-XL-BLK",
        )
    ).first()
    before = (legacy.stock_qty or 0) if legacy else 0

    first = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json=_sale_payload(
            f"fash-last1-{uuid.uuid4().hex[:8]}",
            "fashion",
            product["sku"],
            product["name"],
            product["base_price"],
            product_id=product["id"],
            meta={"variant_id": variant.id},
            store_id=store_id,
        ),
    )
    assert first.status_code == 200, first.text

    second = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json=_sale_payload(
            f"fash-last2-{uuid.uuid4().hex[:8]}",
            "fashion",
            product["sku"],
            product["name"],
            product["base_price"],
            product_id=product["id"],
            meta={"variant_id": variant.id},
            store_id=store_id,
        ),
    )
    assert second.status_code == 409

    session.expire_all()
    if legacy:
        after = session.get(FashionProductVariant, legacy.id)
        assert after is not None
        assert (after.stock_qty or 0) == max(0, before - 1)
