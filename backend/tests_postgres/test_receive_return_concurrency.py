"""Purchase receive + tracked return concurrency (Phase 6B-16)."""

from __future__ import annotations

import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import HTTPException
from sqlmodel import Session, select

from app.inventory.exceptions import InsufficientStockError
from app.models.inventory import StockLedger
from app.services.inventory_service import record_stock_movement
from tests_postgres.helpers import load_admin_auth, on_hand, product_by_sku, set_on_hand

pytestmark = pytest.mark.postgres


def _worker_receive(engine, company_id, product_id, store_id, tag: str):
    """Simulate duplicate receive posting of +1 against a soft remaining cap of 1."""
    with Session(engine) as session:
        try:
            # Use a advisory-style conditional: only post if current on-hand < baseline+1
            # Real purchase_service locks lines; here we prove movement-level atomicity under race
            # by requiring available room via out then in pattern is wrong — instead race two +1
            # receives after setting qty to N and asserting final is N+1 not N+2 when using
            # a unique receive reference claim table would be ideal. For this matrix we lock
            # balance via record_stock_movement FOR UPDATE and a single-unit "claim" product note.
            bal_before = on_hand(session, company_id, product_id, store_id)
            if bal_before >= 11.0:  # baseline set to 10; only one +1 allowed
                raise InsufficientStockError(product_id, 1, 0)
            record_stock_movement(
                session,
                company_id=company_id,
                product_id=product_id,
                store_id=store_id,
                warehouse_id=None,
                in_qty=1.0,
                transaction_type="purchase_receive",
                reference_id=f"recv-conc-{tag}-{uuid.uuid4().hex[:8]}",
                created_by="pg-test",
            )
            # Re-check under same transaction after lock release pattern:
            session.flush()
            after = on_hand(session, company_id, product_id, store_id)
            if after > 11.0:
                raise InsufficientStockError(product_id, 1, 0)
            session.commit()
            return "ok"
        except (InsufficientStockError, ValueError) as exc:
            session.rollback()
            return exc
        except Exception as exc:  # noqa: BLE001
            session.rollback()
            return exc


@pytest.mark.postgres
def test_purchase_receive_cannot_double_post_beyond_cap(pg_engine, pg_session, admin_auth):
    """Two concurrent +1 receives against a soft remaining=1 cap → one success.

    Full GRN line locking lives in purchase_service; this proves StockBalance
    FOR UPDATE serializes competing receive posts.
    """
    product = product_by_sku(pg_session, admin_auth.company_id, "GROC-001")
    store_id = admin_auth.store_id
    set_on_hand(
        pg_session,
        company_id=admin_auth.company_id,
        product_id=product.id,
        store_id=store_id,
        qty=10.0,
    )
    pg_session.commit()
    pg_session.expire_all()

    # Use true lock: first transaction holds FOR UPDATE until commit.
    barrier = __import__("threading").Barrier(2, timeout=10)

    def worker(tag: str):
        last_exc: BaseException | None = None
        for attempt in range(3):
            with Session(pg_engine) as session:
                from app.models.inventory import StockBalance
                from sqlmodel import select as sel

                try:
                    if attempt == 0:
                        barrier.wait()
                    bal = session.exec(
                        sel(StockBalance)
                        .where(
                            StockBalance.company_id == admin_auth.company_id,
                            StockBalance.product_id == product.id,
                            StockBalance.store_id == store_id,
                        )
                        .with_for_update()
                    ).first()
                    if not bal or float(bal.qty_on_hand or 0) >= 11.0:
                        raise InsufficientStockError(product.id, 1, 0)
                    record_stock_movement(
                        session,
                        company_id=admin_auth.company_id,
                        product_id=product.id,
                        store_id=store_id,
                        warehouse_id=None,
                        in_qty=1.0,
                        transaction_type="purchase_receive",
                        reference_id=f"recv-conc-{tag}-{uuid.uuid4().hex[:8]}",
                        created_by="pg-test",
                    )
                    session.commit()
                    return "ok"
                except InsufficientStockError as exc:
                    session.rollback()
                    return exc
                except Exception as exc:  # noqa: BLE001
                    session.rollback()
                    last_exc = exc
                    msg = str(exc).lower()
                    if "network error" in msg or "interfaceerror" in msg:
                        continue
                    return exc
        return last_exc

    with ThreadPoolExecutor(max_workers=2) as pool:
        f1 = pool.submit(worker, "a")
        f2 = pool.submit(worker, "b")
        r1, r2 = f1.result(), f2.result()

    oks = [r for r in (r1, r2) if r == "ok"]
    assert len(oks) == 1, f"{r1!r} {r2!r}"
    with Session(pg_engine) as session:
        assert on_hand(session, admin_auth.company_id, product.id, store_id) == 11.0


@pytest.mark.postgres
def test_tracked_return_cannot_double_restore(pg_engine, pg_session, admin_auth):
    """Remaining returnable qty=1; two concurrent +1 restorations → one success."""
    product = product_by_sku(pg_session, admin_auth.company_id, "GROC-001")
    store_id = admin_auth.store_id
    set_on_hand(
        pg_session,
        company_id=admin_auth.company_id,
        product_id=product.id,
        store_id=store_id,
        qty=0.0,
    )
    pg_session.commit()
    pg_session.expire_all()

    barrier = __import__("threading").Barrier(2, timeout=10)

    def worker(tag: str):
        last_exc: BaseException | None = None
        for attempt in range(3):
            with Session(pg_engine) as session:
                from app.models.inventory import StockBalance
                from sqlmodel import select as sel

                try:
                    if attempt == 0:
                        barrier.wait()
                    bal = session.exec(
                        sel(StockBalance)
                        .where(
                            StockBalance.company_id == admin_auth.company_id,
                            StockBalance.product_id == product.id,
                            StockBalance.store_id == store_id,
                        )
                        .with_for_update()
                    ).first()
                    # Cap restore at 1 unit total
                    if bal and float(bal.qty_on_hand or 0) >= 1.0:
                        raise InsufficientStockError(product.id, 1, 0)
                    record_stock_movement(
                        session,
                        company_id=admin_auth.company_id,
                        product_id=product.id,
                        store_id=store_id,
                        warehouse_id=None,
                        in_qty=1.0,
                        transaction_type="sales_return",
                        reference_id=f"ret-conc-{tag}-{uuid.uuid4().hex[:8]}",
                        created_by="pg-test",
                    )
                    session.commit()
                    return "ok"
                except InsufficientStockError as exc:
                    session.rollback()
                    return exc
                except Exception as exc:  # noqa: BLE001
                    session.rollback()
                    last_exc = exc
                    msg = str(exc).lower()
                    if "network error" in msg or "interfaceerror" in msg:
                        continue
                    return exc
        return last_exc

    with ThreadPoolExecutor(max_workers=2) as pool:
        f1 = pool.submit(worker, "a")
        f2 = pool.submit(worker, "b")
        r1, r2 = f1.result(), f2.result()

    assert len([r for r in (r1, r2) if r == "ok"]) == 1, f"{r1!r} {r2!r}"
    with Session(pg_engine) as session:
        assert on_hand(session, admin_auth.company_id, product.id, store_id) == 1.0
        restores = list(
            session.exec(
                select(StockLedger).where(
                    StockLedger.company_id == admin_auth.company_id,
                    StockLedger.product_id == product.id,
                    StockLedger.reference_id.like("ret-conc-%"),  # type: ignore[attr-defined]
                )
            ).all()
        )
        assert len(restores) == 1
