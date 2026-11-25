"""Real PostgreSQL concurrency matrix (Phase 6B-16).

Each test uses separate DB sessions on parallel threads — never sequential simulation.
"""

from __future__ import annotations

import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed

import pytest
from fastapi import HTTPException
from sqlmodel import Session, select

from app.inventory.exceptions import InsufficientStockError
from app.models.industry import (
    BuildingDelivery,
    CosmeticsBatch,
    ElectronicsSerialStock,
    JewelryCertificate,
    OpticalOrder,
    PharmaBatch,
    RestaurantTable,
    SalonVisit,
    SurgicalStockUnit,
)
from app.models.inventory import StockLedger
from app.services.electronics_service import mark_serial_sold
from app.services.inventory_service import adjust_stock_for_sale, record_stock_movement
from app.services.jewelry_service import mark_certificate_sold
from app.services.surgical_service import mark_unit_sold_from_sale
from tests_postgres.helpers import (
    classify_pair,
    load_admin_auth,
    on_hand,
    product_by_sku,
    set_on_hand,
)

pytestmark = pytest.mark.postgres


def _worker_stock_out(engine, company_id, product_id, store_id, tag: str):
    with Session(engine) as session:
        try:
            adjust_stock_for_sale(
                session,
                company_id,
                product_id,
                store_id,
                1.0,
                reference_id=f"conc-{tag}-{uuid.uuid4().hex[:8]}",
                created_by="pg-test",
            )
            session.commit()
            return "ok"
        except InsufficientStockError as exc:
            session.rollback()
            return exc
        except Exception as exc:  # noqa: BLE001
            session.rollback()
            return exc


@pytest.mark.postgres
def test_generic_stock_oversell_concurrent(pg_engine, pg_session, admin_auth):
    product = product_by_sku(pg_session, admin_auth.company_id, "GROC-001")
    store_id = admin_auth.store_id
    set_on_hand(
        pg_session,
        company_id=admin_auth.company_id,
        product_id=product.id,
        store_id=store_id,
        qty=1.0,
    )

    with ThreadPoolExecutor(max_workers=2) as pool:
        f1 = pool.submit(_worker_stock_out, pg_engine, admin_auth.company_id, product.id, store_id, "a")
        f2 = pool.submit(_worker_stock_out, pg_engine, admin_auth.company_id, product.id, store_id, "b")
        r1, r2 = f1.result(), f2.result()

    oks = [r for r in (r1, r2) if r == "ok"]
    errs = [r for r in (r1, r2) if r != "ok"]
    assert len(oks) == 1, f"expected exactly one success, got {r1!r} {r2!r}"
    assert len(errs) == 1
    assert isinstance(errs[0], InsufficientStockError)

    with Session(pg_engine) as session:
        assert on_hand(session, admin_auth.company_id, product.id, store_id) == 0.0
        outs = list(
            session.exec(
                select(StockLedger).where(
                    StockLedger.company_id == admin_auth.company_id,
                    StockLedger.product_id == product.id,
                    StockLedger.out_qty > 0,
                )
            ).all()
        )
        # At least one SALE out for this race; seed may have prior ledgers — filter by note/ref prefix
        race_outs = [l for l in outs if (l.reference_id or "").startswith("conc-")]
        assert len(race_outs) == 1
        assert all((l.balance_after or 0) >= 0 for l in race_outs)


def _worker_batch_out(engine, company_id, product_id, store_id, batch_id, tag: str):
    with Session(engine) as session:
        try:
            record_stock_movement(
                session,
                company_id=company_id,
                product_id=product_id,
                store_id=store_id,
                warehouse_id=None,
                out_qty=1.0,
                transaction_type="sale",
                reference_id=f"pharma-conc-{tag}-{uuid.uuid4().hex[:8]}",
                batch_id=batch_id,
                created_by="pg-test",
            )
            session.commit()
            return "ok"
        except (InsufficientStockError, ValueError) as exc:
            session.rollback()
            return exc
        except Exception as exc:  # noqa: BLE001
            session.rollback()
            return exc


@pytest.mark.postgres
def test_pharmacy_batch_oversell_concurrent(pg_engine, pg_session, admin_auth):
    product = product_by_sku(pg_session, admin_auth.company_id, "PHRM-001")
    store_id = admin_auth.store_id
    set_on_hand(
        pg_session,
        company_id=admin_auth.company_id,
        product_id=product.id,
        store_id=store_id,
        qty=5.0,
    )
    batch = pg_session.exec(
        select(PharmaBatch).where(
            PharmaBatch.company_id == admin_auth.company_id,
            PharmaBatch.product_id == product.id,
        )
    ).first()
    if not batch:
        pytest.skip("No PharmaBatch in seed for PHAR-001")
    batch.qty_on_hand = 1.0
    pg_session.add(batch)
    pg_session.commit()

    with ThreadPoolExecutor(max_workers=2) as pool:
        f1 = pool.submit(
            _worker_batch_out, pg_engine, admin_auth.company_id, product.id, store_id, batch.id, "a"
        )
        f2 = pool.submit(
            _worker_batch_out, pg_engine, admin_auth.company_id, product.id, store_id, batch.id, "b"
        )
        r1, r2 = f1.result(), f2.result()

    oks = [r for r in (r1, r2) if r == "ok"]
    assert len(oks) == 1, f"expected one success: {r1!r} {r2!r}"
    with Session(pg_engine) as session:
        b = session.get(PharmaBatch, batch.id)
        assert b is not None
        assert float(b.qty_on_hand or 0) == 0.0
        assert on_hand(session, admin_auth.company_id, product.id, store_id) == 4.0


@pytest.mark.postgres
def test_cosmetics_batch_oversell_concurrent(pg_engine, pg_session, admin_auth):
    batch = pg_session.exec(
        select(CosmeticsBatch).where(CosmeticsBatch.company_id == admin_auth.company_id)
    ).first()
    if not batch:
        pytest.skip("No CosmeticsBatch in seed")
    product_id = batch.product_id
    store_id = admin_auth.store_id
    set_on_hand(
        pg_session,
        company_id=admin_auth.company_id,
        product_id=product_id,
        store_id=store_id,
        qty=10.0,
    )
    batch.qty_on_hand = 1.0
    batch.status = "available"
    pg_session.add(batch)
    pg_session.commit()
    batch_id = batch.id

    with ThreadPoolExecutor(max_workers=2) as pool:
        f1 = pool.submit(
            _worker_batch_out, pg_engine, admin_auth.company_id, product_id, store_id, batch_id, "ca"
        )
        f2 = pool.submit(
            _worker_batch_out, pg_engine, admin_auth.company_id, product_id, store_id, batch_id, "cb"
        )
        r1, r2 = f1.result(), f2.result()

    assert len([r for r in (r1, r2) if r == "ok"]) == 1, f"{r1!r} {r2!r}"
    with Session(pg_engine) as session:
        b = session.get(CosmeticsBatch, batch_id)
        assert float(b.qty_on_hand or 0) == 0.0
        assert on_hand(session, admin_auth.company_id, product_id, store_id) == 9.0


def _worker_mark_serial(engine, auth_dict, serial, invoice_tag):
    with Session(engine) as session:
        auth = load_admin_auth(session)
        try:
            mark_serial_sold(
                session,
                auth,
                serial=serial,
                invoice_id=f"inv-{invoice_tag}-{uuid.uuid4().hex[:8]}",
                customer_id=None,
            )
            session.commit()
            return "ok"
        except (ValueError, HTTPException) as exc:
            session.rollback()
            return exc
        except Exception as exc:  # noqa: BLE001
            session.rollback()
            return exc


@pytest.mark.postgres
def test_electronics_serial_double_sale_concurrent(pg_engine, pg_session, admin_auth):
    row = pg_session.exec(
        select(ElectronicsSerialStock).where(
            ElectronicsSerialStock.company_id == admin_auth.company_id,
            ElectronicsSerialStock.status == "available",
        )
    ).first()
    if not row:
        # Create a disposable serial on an electronics product
        from app.models.product import Product

        prod = pg_session.exec(
            select(Product).where(
                Product.company_id == admin_auth.company_id,
                Product.industry_pack == "electronics",
            )
        ).first()
        if not prod:
            pytest.skip("No electronics product")
        serial = f"E-CONC-{uuid.uuid4().hex[:10]}"
        row = ElectronicsSerialStock(
            company_id=admin_auth.company_id,
            product_id=prod.id,
            store_id=admin_auth.store_id,
            serial_imei=serial,
            status="available",
        )
        pg_session.add(row)
        pg_session.commit()
        pg_session.refresh(row)
    else:
        serial = row.serial_imei

    with ThreadPoolExecutor(max_workers=2) as pool:
        f1 = pool.submit(_worker_mark_serial, pg_engine, {}, serial, "a")
        f2 = pool.submit(_worker_mark_serial, pg_engine, {}, serial, "b")
        r1, r2 = f1.result(), f2.result()

    assert len([r for r in (r1, r2) if r == "ok"]) == 1, f"{r1!r} {r2!r}"
    with Session(pg_engine) as session:
        refreshed = session.exec(
            select(ElectronicsSerialStock).where(
                ElectronicsSerialStock.company_id == admin_auth.company_id,
                ElectronicsSerialStock.serial_imei == serial,
            )
        ).one()
        assert refreshed.status == "sold"
        assert refreshed.sales_invoice_id is not None


@pytest.mark.postgres
def test_mobile_imei_double_sale_concurrent(pg_engine, pg_session, admin_auth):
    from app.models.product import Product

    prod = pg_session.exec(
        select(Product).where(
            Product.company_id == admin_auth.company_id,
            Product.industry_pack == "mobile-shop",
        )
    ).first()
    if not prod:
        pytest.skip("No mobile-shop product")
    serial = f"M-IMEI-{uuid.uuid4().hex[:10]}"
    pg_session.add(
        ElectronicsSerialStock(
            company_id=admin_auth.company_id,
            product_id=prod.id,
            store_id=admin_auth.store_id,
            serial_imei=serial,
            imei_no=serial,
            status="available",
        )
    )
    pg_session.commit()

    with ThreadPoolExecutor(max_workers=2) as pool:
        f1 = pool.submit(_worker_mark_serial, pg_engine, {}, serial, "m1")
        f2 = pool.submit(_worker_mark_serial, pg_engine, {}, serial, "m2")
        r1, r2 = f1.result(), f2.result()

    assert len([r for r in (r1, r2) if r == "ok"]) == 1, f"{r1!r} {r2!r}"


def _worker_surgical(engine, unit_id, serial_no, tag):
    with Session(engine) as session:
        auth = load_admin_auth(session)
        try:
            mark_unit_sold_from_sale(
                session,
                auth,
                stock_unit_id=unit_id,
                serial_no=serial_no,
                invoice_id=f"surg-{tag}-{uuid.uuid4().hex[:8]}",
            )
            session.commit()
            return "ok"
        except (ValueError, HTTPException) as exc:
            session.rollback()
            return exc
        except Exception as exc:  # noqa: BLE001
            session.rollback()
            return exc


@pytest.mark.postgres
def test_surgical_serial_double_sale_concurrent(pg_engine, pg_session, admin_auth):
    unit = pg_session.exec(
        select(SurgicalStockUnit).where(
            SurgicalStockUnit.company_id == admin_auth.company_id,
            SurgicalStockUnit.status == "available",
            SurgicalStockUnit.serial_no.is_not(None),  # type: ignore[union-attr]
        )
    ).first()
    if not unit:
        from app.models.product import Product

        prod = pg_session.exec(
            select(Product).where(
                Product.company_id == admin_auth.company_id,
                Product.industry_pack == "surgical-shop",
            )
        ).first()
        if not prod:
            pytest.skip("No surgical product")
        serial = f"UDI-{uuid.uuid4().hex[:10]}"
        unit = SurgicalStockUnit(
            company_id=admin_auth.company_id,
            product_id=prod.id,
            store_id=admin_auth.store_id,
            serial_no=serial,
            qty_on_hand=1.0,
            status="available",
        )
        pg_session.add(unit)
        pg_session.commit()
        pg_session.refresh(unit)

    with ThreadPoolExecutor(max_workers=2) as pool:
        f1 = pool.submit(_worker_surgical, pg_engine, unit.id, unit.serial_no, "a")
        f2 = pool.submit(_worker_surgical, pg_engine, unit.id, unit.serial_no, "b")
        r1, r2 = f1.result(), f2.result()

    assert len([r for r in (r1, r2) if r == "ok"]) == 1, f"{r1!r} {r2!r}"
    with Session(pg_engine) as session:
        u = session.get(SurgicalStockUnit, unit.id)
        assert u.status == "sold"


def _worker_cert(engine, cert_id, tag):
    with Session(engine) as session:
        auth = load_admin_auth(session)
        try:
            mark_certificate_sold(
                session,
                auth,
                certificate_id=cert_id,
                certificate_no=None,
                invoice_id=f"jew-{tag}-{uuid.uuid4().hex[:8]}",
                customer_id=None,
            )
            session.commit()
            return "ok"
        except (ValueError, HTTPException) as exc:
            session.rollback()
            return exc
        except Exception as exc:  # noqa: BLE001
            session.rollback()
            return exc


@pytest.mark.postgres
def test_jewelry_certificate_double_sale_concurrent(pg_engine, pg_session, admin_auth):
    cert = pg_session.exec(
        select(JewelryCertificate).where(
            JewelryCertificate.company_id == admin_auth.company_id,
            JewelryCertificate.status == "active",
        )
    ).first()
    if not cert:
        pytest.skip("No active jewelry certificate in seed")
    cert_id = cert.id

    with ThreadPoolExecutor(max_workers=2) as pool:
        f1 = pool.submit(_worker_cert, pg_engine, cert_id, "a")
        f2 = pool.submit(_worker_cert, pg_engine, cert_id, "b")
        r1, r2 = f1.result(), f2.result()

    assert len([r for r in (r1, r2) if r == "ok"]) == 1, f"{r1!r} {r2!r}"
    with Session(pg_engine) as session:
        c = session.get(JewelryCertificate, cert_id)
        assert c.status == "sold"


def _worker_table_order(engine, table_id, store_id, tag):
    with Session(engine) as session:
        auth = load_admin_auth(session)
        from app.services.restaurant_service import create_order

        try:
            create_order(
                session,
                auth,
                {
                    "store_id": store_id,
                    "service_mode": "dine_in",
                    "table_id": table_id,
                    "guest_count": 2,
                },
            )
            # create_order commits internally
            return "ok"
        except HTTPException as exc:
            session.rollback()
            return exc
        except Exception as exc:  # noqa: BLE001
            session.rollback()
            return exc


@pytest.mark.postgres
def test_restaurant_table_double_occupation_concurrent(pg_engine, pg_session, admin_auth):
    table = pg_session.exec(
        select(RestaurantTable).where(
            RestaurantTable.company_id == admin_auth.company_id,
            RestaurantTable.store_id == admin_auth.store_id,
        )
    ).first()
    if not table:
        pytest.skip("No restaurant table")
    table.status = "available"
    table.current_order_id = None
    pg_session.add(table)
    pg_session.commit()
    table_id = table.id
    store_id = admin_auth.store_id

    with ThreadPoolExecutor(max_workers=2) as pool:
        f1 = pool.submit(_worker_table_order, pg_engine, table_id, store_id, "a")
        f2 = pool.submit(_worker_table_order, pg_engine, table_id, store_id, "b")
        r1, r2 = f1.result(), f2.result()

    oks = [r for r in (r1, r2) if r == "ok"]
    errs = [r for r in (r1, r2) if r != "ok"]
    assert len(oks) == 1, f"{r1!r} {r2!r}"
    assert len(errs) == 1
    assert isinstance(errs[0], HTTPException) and errs[0].status_code == 409
    with Session(pg_engine) as session:
        t = session.get(RestaurantTable, table_id)
        assert t.status == "occupied"
        assert t.current_order_id is not None


@pytest.mark.postgres
def test_optical_finalize_concurrent(pg_engine, pg_session, admin_auth):
    from app.models.industry import OpticalOrder, OpticalOrderLine
    from app.models.product import Product
    from app.services.optical_service import finalize_order

    frame = pg_session.exec(
        select(Product).where(
            Product.company_id == admin_auth.company_id,
            Product.sku == "OP-001",
        )
    ).first()
    assert frame is not None
    order = OpticalOrder(
        company_id=admin_auth.company_id,
        store_id=admin_auth.store_id or "",
        order_no=f"OPT-CONC-{uuid.uuid4().hex[:8]}",
        status="ready",
        gross_amount=0,
        net_amount=0,
        paid_amount=0,
        due_amount=0,
        created_by=admin_auth.user_id,
    )
    pg_session.add(order)
    pg_session.flush()
    pg_session.add(
        OpticalOrderLine(
            order_id=order.id,
            line_type="frame",
            product_id=frame.id,
            sku=frame.sku,
            description=frame.name,
            qty=0,
            unit_price=0,
            supply_mode="non_stocked",
        )
    )
    pg_session.commit()
    order_id = order.id

    def worker(tag: str):
        with Session(pg_engine) as session:
            auth = load_admin_auth(session)
            try:
                finalize_order(
                    session,
                    auth,
                    order_id,
                    {
                        "client_transaction_id": f"opt-conc-{tag}-{uuid.uuid4().hex}",
                        "allow_due": True,
                        "payments": [],
                    },
                )
                return "ok"
            except HTTPException as exc:
                session.rollback()
                return exc
            except Exception as exc:  # noqa: BLE001
                session.rollback()
                return exc

    with ThreadPoolExecutor(max_workers=2) as pool:
        f1 = pool.submit(worker, "a")
        f2 = pool.submit(worker, "b")
        r1, r2 = f1.result(), f2.result()

    assert len([r for r in (r1, r2) if r == "ok"]) == 1, f"{r1!r} {r2!r}"
    with Session(pg_engine) as session:
        o = session.get(OpticalOrder, order_id)
        assert o.sales_invoice_id is not None


@pytest.mark.postgres
def test_salon_checkout_concurrent(pg_engine, pg_session, admin_auth):
    from app.models.industry import SalonVisit, SalonVisitLine
    from app.services.salon_service import checkout_visit

    visit = SalonVisit(
        company_id=admin_auth.company_id,
        visit_no=f"SV-CONC-{uuid.uuid4().hex[:8]}",
        store_id=admin_auth.store_id,
        customer_name="Concurrent Guest",
        status="ready_to_pay",
        gross_amount=0,
        net_amount=0,
        paid_amount=0,
        due_amount=0,
        created_by=admin_auth.user_id,
    )
    pg_session.add(visit)
    pg_session.flush()
    pg_session.add(
        SalonVisitLine(
            visit_id=visit.id,
            line_type="service",
            name="Wash",
            sku="SVC",
            qty=1,
            unit_price=0,
            line_total=0,
            status="completed",
        )
    )
    pg_session.commit()
    visit_id = visit.id

    def worker(tag: str):
        with Session(pg_engine) as session:
            auth = load_admin_auth(session)
            try:
                out = checkout_visit(
                    session,
                    auth,
                    visit_id,
                    {
                        "client_transaction_id": f"salon-conc-{tag}-{uuid.uuid4().hex}",
                        "allow_incomplete": True,
                        "payments": [{"method": "cash", "amount": 0}],
                    },
                )
                session.commit()
                return out
            except HTTPException as exc:
                session.rollback()
                return exc
            except Exception as exc:  # noqa: BLE001
                session.rollback()
                return exc

    with ThreadPoolExecutor(max_workers=2) as pool:
        f1 = pool.submit(worker, "a")
        f2 = pool.submit(worker, "b")
        r1, r2 = f1.result(), f2.result()

    def is_primary(x):
        return isinstance(x, dict) and not (x.get("invoice") or {}).get("duplicate")

    primaries = [r for r in (r1, r2) if is_primary(r)]
    assert len(primaries) <= 1
    assert any(isinstance(r, dict) for r in (r1, r2)), f"{r1!r} {r2!r}"
    with Session(pg_engine) as session:
        v = session.get(SalonVisit, visit_id)
        assert v.sales_invoice_id is not None


@pytest.mark.postgres
def test_building_dispatch_concurrent(pg_engine, pg_session, admin_auth):
    from app.models.industry import (
        BuildingDelivery,
        BuildingDeliveryLine,
        BuildingSalesOrder,
        BuildingSalesOrderLine,
    )
    from app.models.product import Product
    from app.services.building_service import dispatch_delivery

    product = pg_session.exec(
        select(Product).where(
            Product.company_id == admin_auth.company_id,
            Product.sku == "BLD-001",
        )
    ).first()
    if not product:
        product = product_by_sku(pg_session, admin_auth.company_id, "GROC-001")
    order = BuildingSalesOrder(
        company_id=admin_auth.company_id,
        store_id=admin_auth.store_id or "",
        order_no=f"BO-CONC-{uuid.uuid4().hex[:8]}",
        status="confirmed",
        created_by=admin_auth.user_id,
    )
    pg_session.add(order)
    pg_session.flush()
    ol = BuildingSalesOrderLine(
        order_id=order.id,
        product_id=product.id,
        base_qty=0,
        dispatched_base_qty=0,
        cancelled_base_qty=0,
    )
    pg_session.add(ol)
    pg_session.flush()
    delivery = BuildingDelivery(
        company_id=admin_auth.company_id,
        store_id=admin_auth.store_id or "",
        order_id=order.id,
        delivery_no=f"BD-CONC-{uuid.uuid4().hex[:8]}",
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
            planned_qty=0,
            planned_base_qty=0,
        )
    )
    pg_session.commit()
    delivery_id = delivery.id

    def worker():
        with Session(pg_engine) as session:
            auth = load_admin_auth(session)
            try:
                out = dispatch_delivery(session, auth, delivery_id, {})
                session.commit()
                return out
            except HTTPException as exc:
                session.rollback()
                return exc
            except Exception as exc:  # noqa: BLE001
                session.rollback()
                return exc

    with ThreadPoolExecutor(max_workers=2) as pool:
        f1 = pool.submit(worker)
        f2 = pool.submit(worker)
        r1, r2 = f1.result(), f2.result()

    with Session(pg_engine) as session:
        d = session.get(BuildingDelivery, delivery_id)
        assert d.stock_posted is True
        assert any(isinstance(r, dict) for r in (r1, r2)), f"{r1!r} {r2!r}"
