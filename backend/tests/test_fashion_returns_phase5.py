"""Phase 5 — Fashion returns / size×color exchange + damaged non-restock."""

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.audit import AuditLog
from app.models.industry import FashionProductVariant
from app.models.inventory import StockBalance, StockLedger
from app.models.operations import SalesReturn
from app.models.product import Product, ProductVariant
from app.models.sales import SalesInvoiceLine
from tests.test_industry_sales import _sale_payload, get_product_by_sku
from tests.test_operations import _store_id


def _sell_fashion(
    client: TestClient,
    headers: dict,
    session: Session,
    *,
    product_sku: str,
    variant_code: str,
    tx_prefix: str,
) -> tuple[dict, ProductVariant, str]:
    product = get_product_by_sku(client, headers, product_sku)
    variant = session.exec(
        select(ProductVariant).where(ProductVariant.variant_code == variant_code)
    ).first()
    assert variant is not None
    store_id = _store_id(client, headers)
    sale = client.post(
        "/api/v1/sales",
        headers=headers,
        json=_sale_payload(
            f"{tx_prefix}-{uuid.uuid4().hex[:8]}",
            "fashion",
            product["sku"],
            product["name"],
            product["base_price"],
            product_id=product["id"],
            meta={"variant_id": variant.id, "size": variant.size, "color": variant.color},
            store_id=store_id,
        ),
    )
    assert sale.status_code == 200, sale.text
    inv_line = session.exec(
        select(SalesInvoiceLine).where(SalesInvoiceLine.invoice_id == sale.json()["id"])
    ).first()
    assert inv_line is not None
    return product, variant, inv_line.id


def test_fashion_size_color_exchange_same_product(auth_headers, client: TestClient, session: Session):
    product, from_v, line_id = _sell_fashion(
        client, auth_headers, session, product_sku="FASH-001", variant_code="FASH-001-M-BLU", tx_prefix="p5-ex"
    )
    to_v = session.exec(
        select(ProductVariant).where(ProductVariant.variant_code == "FASH-001-L-BLK")
    ).first()
    assert to_v is not None

    legacy_from = session.exec(
        select(FashionProductVariant).where(
            FashionProductVariant.product_id == product["id"],
            FashionProductVariant.size == "M",
            FashionProductVariant.color == "Blue",
        )
    ).first()
    legacy_to = session.exec(
        select(FashionProductVariant).where(
            FashionProductVariant.product_id == product["id"],
            FashionProductVariant.size == "L",
            FashionProductVariant.color == "Black",
        )
    ).first()
    assert legacy_from and legacy_to
    from_before = legacy_from.stock_qty or 0
    to_before = legacy_to.stock_qty or 0

    invoice_id = session.exec(
        select(SalesInvoiceLine).where(SalesInvoiceLine.id == line_id)
    ).first().invoice_id

    res = client.post(
        f"/api/v1/sales/{invoice_id}/exchange",
        headers=auth_headers,
        json={
            "reason": "Size/color swap",
            "condition": "saleable",
            "return_lines": [
                {"invoice_line_id": line_id, "qty": 1, "meta": {"variant_id": from_v.id}}
            ],
            "new_lines": [
                {
                    "product_id": product["id"],
                    "sku": product["sku"],
                    "name": product["name"],
                    "qty": 1,
                    "unit_price": product["base_price"],
                    "variant_id": to_v.id,
                }
            ],
        },
    )
    assert res.status_code == 200, res.text
    assert res.json()["exchange_no"].startswith("EX-")

    session.expire_all()
    legacy_from2 = session.get(FashionProductVariant, legacy_from.id)
    legacy_to2 = session.get(FashionProductVariant, legacy_to.id)
    assert legacy_from2 is not None and legacy_to2 is not None
    # from_before / to_before captured after original sale.
    # Exchange: restock returned variant (+1), issue replacement (-1).
    assert (legacy_from2.stock_qty or 0) == from_before + 1
    assert (legacy_to2.stock_qty or 0) == to_before - 1


def test_fashion_cross_product_exchange_allowed(auth_headers, client: TestClient, session: Session):
    """Cross-product/cross-style exchange is intentionally supported (commit 1b66d9c);
    see also test_cross_product_exchange in test_tailoring_improvements.py."""
    product, from_v, line_id = _sell_fashion(
        client, auth_headers, session, product_sku="FASH-001", variant_code="FASH-001-S-BLU", tx_prefix="p5-xprod"
    )
    other = session.exec(
        select(ProductVariant).where(ProductVariant.variant_code == "FASH-002-32-KHK")
    ).first()
    assert other is not None
    invoice_id = session.exec(
        select(SalesInvoiceLine).where(SalesInvoiceLine.id == line_id)
    ).first().invoice_id

    res = client.post(
        f"/api/v1/sales/{invoice_id}/exchange",
        headers=auth_headers,
        json={
            "reason": "Customer prefers a different style",
            "return_lines": [
                {"invoice_line_id": line_id, "qty": 1, "meta": {"variant_id": from_v.id}}
            ],
            "new_lines": [
                {
                    "product_id": other.product_id,
                    "sku": "FASH-002",
                    "name": "Slim Fit Chino",
                    "qty": 1,
                    "unit_price": 1890,
                    "variant_id": other.id,
                }
            ],
        },
    )
    assert res.status_code == 200, res.text
    assert "exchange_no" in res.json()


def test_fashion_void_restores_stock_mirror(auth_headers, client: TestClient, session: Session):
    """Void composes create_sales_return + refund under the hood; confirm the
    FashionProductVariant.stock_qty compatibility mirror is correctly restored,
    not just the canonical ProductVariant path."""
    product, variant, line_id = _sell_fashion(
        client, auth_headers, session, product_sku="FASH-001", variant_code="FASH-001-S-BLU", tx_prefix="p5-void"
    )
    legacy = session.exec(
        select(FashionProductVariant).where(
            FashionProductVariant.product_id == product["id"],
            FashionProductVariant.size == variant.size,
            FashionProductVariant.color == variant.color,
        )
    ).first()
    assert legacy is not None
    stock_before_sale = (legacy.stock_qty or 0) + 1  # sale already decremented by 1

    invoice_id = session.exec(
        select(SalesInvoiceLine).where(SalesInvoiceLine.id == line_id)
    ).first().invoice_id

    void = client.post(
        f"/api/v1/sales/{invoice_id}/void",
        headers=auth_headers,
        json={"reason": "Cashier rang wrong size"},
    )
    assert void.status_code == 200, void.text
    assert void.json()["status"] == "voided"

    session.expire_all()
    legacy2 = session.get(FashionProductVariant, legacy.id)
    assert (legacy2.stock_qty or 0) == stock_before_sale


def test_fashion_exchange_requires_variant(auth_headers, client: TestClient, session: Session):
    product, from_v, line_id = _sell_fashion(
        client, auth_headers, session, product_sku="FASH-001", variant_code="FASH-001-M-BLK", tx_prefix="p5-nov"
    )
    invoice_id = session.exec(
        select(SalesInvoiceLine).where(SalesInvoiceLine.id == line_id)
    ).first().invoice_id
    res = client.post(
        f"/api/v1/sales/{invoice_id}/exchange",
        headers=auth_headers,
        json={
            "reason": "No variant",
            "return_lines": [
                {"invoice_line_id": line_id, "qty": 1, "meta": {"variant_id": from_v.id}}
            ],
            "new_lines": [
                {
                    "product_id": product["id"],
                    "sku": product["sku"],
                    "name": product["name"],
                    "qty": 1,
                    "unit_price": product["base_price"],
                }
            ],
        },
    )
    assert res.status_code == 400
    assert "variant" in res.json()["detail"].lower()


def test_fashion_damaged_return_no_restock(auth_headers, client: TestClient, session: Session):
    product, variant, line_id = _sell_fashion(
        client, auth_headers, session, product_sku="FASH-001", variant_code="FASH-001-L-BLU", tx_prefix="p5-dmg"
    )
    legacy = session.exec(
        select(FashionProductVariant).where(
            FashionProductVariant.product_id == product["id"],
            FashionProductVariant.size == "L",
            FashionProductVariant.color == "Blue",
        )
    ).first()
    assert legacy is not None
    before = legacy.stock_qty or 0
    invoice_id = session.exec(
        select(SalesInvoiceLine).where(SalesInvoiceLine.id == line_id)
    ).first().invoice_id

    prod = session.get(Product, product["id"])
    store_id = _store_id(client, auth_headers)
    bal = session.exec(
        select(StockBalance).where(
            StockBalance.company_id == prod.company_id,
            StockBalance.product_id == product["id"],
            StockBalance.store_id == store_id,
        )
    ).first()
    assert bal is not None
    qty_before = bal.qty_on_hand or 0

    res = client.post(
        f"/api/v1/sales/{invoice_id}/return",
        headers=auth_headers,
        json={
            "reason": "Torn seam",
            "condition": "damaged",
            "lines": [
                {"invoice_line_id": line_id, "qty": 1, "meta": {"variant_id": variant.id}}
            ],
        },
    )
    assert res.status_code == 200, res.text
    ret = session.get(SalesReturn, res.json()["id"])
    assert ret is not None
    assert ret.condition == "damaged"

    session.expire_all()
    legacy2 = session.get(FashionProductVariant, legacy.id)
    bal2 = session.get(StockBalance, bal.id)
    assert legacy2 is not None and bal2 is not None
    # Sale already decremented; damaged return must NOT restore
    assert (legacy2.stock_qty or 0) == before
    assert (bal2.qty_on_hand or 0) == qty_before

    audits = session.exec(
        select(AuditLog).where(AuditLog.action == "fashion.return_non_restock")
    ).all()
    assert len(audits) >= 1

    # No sales_return stock movement for this return
    ledger = session.exec(
        select(StockLedger).where(
            StockLedger.reference_id == ret.id,
            StockLedger.transaction_type == "sales_return",
        )
    ).all()
    assert len(ledger) == 0


def test_fashion_invalid_condition_rejected(auth_headers, client: TestClient, session: Session):
    product, variant, line_id = _sell_fashion(
        client, auth_headers, session, product_sku="FASH-003", variant_code="FASH-003-M-GRY", tx_prefix="p5-badcond"
    )
    invoice_id = session.exec(
        select(SalesInvoiceLine).where(SalesInvoiceLine.id == line_id)
    ).first().invoice_id
    res = client.post(
        f"/api/v1/sales/{invoice_id}/return",
        headers=auth_headers,
        json={
            "reason": "Bad condition",
            "condition": "opened",
            "lines": [
                {"invoice_line_id": line_id, "qty": 1, "meta": {"variant_id": variant.id}}
            ],
        },
    )
    assert res.status_code == 400
