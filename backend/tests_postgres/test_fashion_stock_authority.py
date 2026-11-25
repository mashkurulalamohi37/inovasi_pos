"""Fashion stock authority — Option B (Phase 6B-16).

Canonical inventory: StockBalance / StockLedger
Fashion identity: generic ProductVariant
Legacy FashionProductVariant.stock_qty: controlled compatibility mirror only
"""

from __future__ import annotations

import pytest
from sqlmodel import Session, select

from app.models.industry import FashionProductVariant
from app.models.product import Product, ProductVariant
from app.services.inventory_service import (
    apply_industry_receive_stock,
    record_stock_movement,
)
from tests_postgres.helpers import on_hand, product_by_sku, set_on_hand

pytestmark = pytest.mark.postgres


@pytest.mark.postgres
def test_fashion_product_variant_is_identity_stockbalance_is_sot(pg_engine, pg_session, admin_auth):
    fashion = product_by_sku(pg_session, admin_auth.company_id, "FASH-001")
    generic = pg_session.exec(
        select(ProductVariant).where(
            ProductVariant.company_id == admin_auth.company_id,
            ProductVariant.product_id == fashion.id,
        )
    ).first()
    assert generic is not None, "seed must include generic ProductVariant for FASH-001"

    # Correlate to the SAME physical variant via barcode, matching exactly how
    # _resolve_fashion_legacy_variant resolves it in production — two independent
    # `.first()` queries across separate tables are not guaranteed to return
    # corresponding rows (no shared ordering/identity between the two tables).
    legacy = pg_session.exec(
        select(FashionProductVariant).where(
            FashionProductVariant.product_id == fashion.id,
            FashionProductVariant.barcode == generic.barcode,
        )
    ).first()
    assert legacy is not None

    store_id = admin_auth.store_id
    set_on_hand(
        pg_session,
        company_id=admin_auth.company_id,
        product_id=fashion.id,
        store_id=store_id,
        qty=10.0,
    )
    legacy.stock_qty = 10.0
    pg_session.add(legacy)
    pg_session.commit()

    with Session(pg_engine) as session:
        record_stock_movement(
            session,
            company_id=admin_auth.company_id,
            product_id=fashion.id,
            store_id=store_id,
            warehouse_id=None,
            out_qty=2.0,
            transaction_type="sale",
            reference_id="fashion-sot-sale",
            variant_id=generic.id,
            created_by="pg-test",
        )
        session.commit()

    with Session(pg_engine) as session:
        assert on_hand(session, admin_auth.company_id, fashion.id, store_id) == 8.0
        leg = session.exec(
            select(FashionProductVariant).where(FashionProductVariant.id == legacy.id)
        ).one()
        # Compat mirror updated via ProductVariant → legacy resolution
        assert float(leg.stock_qty or 0) == 8.0


@pytest.mark.postgres
def test_apply_industry_receive_does_not_double_bump_fashion(pg_engine, pg_session, admin_auth):
    fashion = product_by_sku(pg_session, admin_auth.company_id, "FASH-001")
    legacy = pg_session.exec(
        select(FashionProductVariant).where(FashionProductVariant.product_id == fashion.id)
    ).first()
    assert legacy is not None
    before = float(legacy.stock_qty or 0)
    product = pg_session.get(Product, fashion.id)

    with Session(pg_engine) as session:
        apply_industry_receive_stock(
            session,
            admin_auth.company_id,
            product,
            5.0,
            variant_id=legacy.id,
            store_id=admin_auth.store_id,
        )
        session.commit()

    with Session(pg_engine) as session:
        leg = session.get(FashionProductVariant, legacy.id)
        # Must NOT independently increment stock_qty (movement path owns mirror)
        assert float(leg.stock_qty or 0) == before
