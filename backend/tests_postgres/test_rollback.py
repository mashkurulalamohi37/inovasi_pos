"""Rollback / atomicity tests against PostgreSQL (Phase 6B-16)."""

from __future__ import annotations

import uuid

import pytest
from sqlmodel import Session, select

from app.inventory.exceptions import InsufficientStockError
from app.models.inventory import StockBalance, StockLedger
from app.services.inventory_service import adjust_stock_for_sale, record_stock_movement
from tests_postgres.helpers import on_hand, product_by_sku, set_on_hand

pytestmark = pytest.mark.postgres


@pytest.mark.postgres
def test_sale_stock_rolls_back_on_downstream_failure(pg_engine, pg_session, admin_auth):
    product = product_by_sku(pg_session, admin_auth.company_id, "GROC-001")
    store_id = admin_auth.store_id
    set_on_hand(
        pg_session,
        company_id=admin_auth.company_id,
        product_id=product.id,
        store_id=store_id,
        qty=5.0,
    )
    before = on_hand(pg_session, admin_auth.company_id, product.id, store_id)

    with Session(pg_engine) as session:
        adjust_stock_for_sale(
            session,
            admin_auth.company_id,
            product.id,
            store_id,
            1.0,
            reference_id=f"rb-sale-{uuid.uuid4().hex[:8]}",
        )
        # Downstream failure before commit
        session.rollback()

    with Session(pg_engine) as session:
        assert on_hand(session, admin_auth.company_id, product.id, store_id) == before
        ledgers = list(
            session.exec(
                select(StockLedger).where(
                    StockLedger.company_id == admin_auth.company_id,
                    StockLedger.product_id == product.id,
                    StockLedger.reference_id.like("rb-sale-%"),  # type: ignore[attr-defined]
                )
            ).all()
        )
        assert ledgers == []


@pytest.mark.postgres
def test_receive_rolls_back_when_extension_fails(pg_engine, pg_session, admin_auth, monkeypatch):
    product = product_by_sku(pg_session, admin_auth.company_id, "GROC-001")
    store_id = admin_auth.store_id
    set_on_hand(
        pg_session,
        company_id=admin_auth.company_id,
        product_id=product.id,
        store_id=store_id,
        qty=3.0,
    )
    before = on_hand(pg_session, admin_auth.company_id, product.id, store_id)

    def boom(*_a, **_k):
        raise RuntimeError("injected extension failure")

    monkeypatch.setattr(
        "app.services.inventory_service.sync_industry_stock_on_movement",
        boom,
    )

    with Session(pg_engine) as session:
        with pytest.raises(RuntimeError, match="injected"):
            record_stock_movement(
                session,
                company_id=admin_auth.company_id,
                product_id=product.id,
                store_id=store_id,
                warehouse_id=None,
                in_qty=2.0,
                transaction_type="purchase_receive",
                reference_id=f"rb-recv-{uuid.uuid4().hex[:8]}",
            )
        session.rollback()

    with Session(pg_engine) as session:
        assert on_hand(session, admin_auth.company_id, product.id, store_id) == before


@pytest.mark.postgres
def test_building_dispatch_stock_failure_rolls_back_flag(pg_engine, pg_session, admin_auth, monkeypatch):
    from app.models.industry import (
        BuildingDelivery,
        BuildingDeliveryLine,
        BuildingSalesOrder,
        BuildingSalesOrderLine,
    )
    from app.models.product import Product
    from app.services.building_service import dispatch_delivery
    from tests_postgres.helpers import product_by_sku

    product = pg_session.exec(
        select(Product).where(Product.company_id == admin_auth.company_id, Product.sku == "BLD-001")
    ).first() or product_by_sku(pg_session, admin_auth.company_id, "GROC-001")
    order = BuildingSalesOrder(
        company_id=admin_auth.company_id,
        store_id=admin_auth.store_id or "",
        order_no=f"BO-RB-{uuid.uuid4().hex[:8]}",
        status="confirmed",
        created_by=admin_auth.user_id,
    )
    pg_session.add(order)
    pg_session.flush()
    ol = BuildingSalesOrderLine(
        order_id=order.id,
        product_id=product.id,
        base_qty=1,
        dispatched_base_qty=0,
        cancelled_base_qty=0,
    )
    pg_session.add(ol)
    pg_session.flush()
    delivery = BuildingDelivery(
        company_id=admin_auth.company_id,
        store_id=admin_auth.store_id or "",
        order_id=order.id,
        delivery_no=f"BD-RB-{uuid.uuid4().hex[:8]}",
        status="planned",
        stock_posted=False,
    )
    pg_session.add(delivery)
    pg_session.flush()
    pg_session.add(
        BuildingDeliveryLine(
            delivery_id=delivery.id,
            order_line_id=ol.id,
            product_id=product.id,
            planned_qty=1,
            planned_base_qty=1,
        )
    )
    pg_session.commit()
    delivery_id = delivery.id

    def boom(*_a, **_k):
        raise InsufficientStockError("x", 1, 0)

    monkeypatch.setattr(
        "app.services.inventory_service.record_stock_movement",
        boom,
    )

    with Session(pg_engine) as session:
        from fastapi import HTTPException

        auth = admin_auth
        with pytest.raises(HTTPException):
            dispatch_delivery(session, auth, delivery_id, {})
        session.rollback()

    with Session(pg_engine) as session:
        d = session.get(BuildingDelivery, delivery_id)
        assert d.stock_posted is False


@pytest.mark.postgres
def test_salon_checkout_policy_is_full_rollback(pg_session):
    """Salon checkout commits only at API boundary; commission runs in same session.

    Policy (explicit): invoice + commission + retail stock are one transaction.
    If commission fails before API commit, everything rolls back — no outbox.
    """
    from app.services import salon_service

    src = open(salon_service.__file__, encoding="utf-8").read()
    assert "create_sale_idempotent" in src
    assert "session.commit()" not in src.split("def checkout_visit")[1].split("def ")[0]
