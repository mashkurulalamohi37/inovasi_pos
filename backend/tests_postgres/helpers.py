"""Helpers for PostgreSQL concurrency / rollback tests."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Callable

from sqlmodel import Session, select

from app.dependencies import AuthContext
from app.models.core import Company, Role, Store, UserAccount, UserRole
from app.models.inventory import StockBalance, StockLedger
from app.models.product import Product
from app.services.permission_service import load_role_permissions


def load_admin_auth(session: Session) -> AuthContext:
    company = session.exec(select(Company).where(Company.code == "PULSE-DEMO")).one()
    user = session.exec(
        select(UserAccount).where(
            UserAccount.company_id == company.id,
            UserAccount.email == "admin@pulse.pos",
        )
    ).one()
    ur = session.exec(select(UserRole).where(UserRole.user_id == user.id)).first()
    role = session.get(Role, ur.role_id) if ur else None
    store = session.exec(select(Store).where(Store.company_id == company.id)).first()
    perms = load_role_permissions(session, role.id) if role else set()
    # Broaden for vertical service permission checks in concurrency tests
    perms = set(perms) | {
        "sales.create",
        "sales.return",
        "purchase.receive",
        "restaurant.order_manage",
        "optical.order_manage",
        "salon.checkout",
        "building.dispatch",
        "inventory.adjust",
    }
    return AuthContext(
        user_id=user.id,
        company_id=company.id,
        store_id=store.id if store else None,
        role_id=role.id if role else "",
        role_code=role.code if role else "admin",
        email=user.email,
        permissions=perms,
        is_platform_admin=False,
    )


def product_by_sku(session: Session, company_id: str, sku: str) -> Product:
    return session.exec(
        select(Product).where(Product.company_id == company_id, Product.sku == sku)
    ).one()


def set_on_hand(
    session: Session,
    *,
    company_id: str,
    product_id: str,
    store_id: str | None,
    qty: float,
) -> StockBalance:
    bal = session.exec(
        select(StockBalance).where(
            StockBalance.company_id == company_id,
            StockBalance.product_id == product_id,
            StockBalance.store_id == store_id,
            StockBalance.warehouse_id.is_(None),  # type: ignore[union-attr]
        )
    ).first()
    if not bal:
        bal = StockBalance(
            company_id=company_id,
            product_id=product_id,
            store_id=store_id,
            warehouse_id=None,
            qty_on_hand=qty,
            qty_reserved=0,
            unit_cost_avg=0,
        )
    else:
        bal.qty_on_hand = qty
        bal.qty_reserved = 0
    session.add(bal)
    session.commit()
    session.refresh(bal)
    return bal


def on_hand(session: Session, company_id: str, product_id: str, store_id: str | None) -> float:
    rows = session.exec(
        select(StockBalance).where(
            StockBalance.company_id == company_id,
            StockBalance.product_id == product_id,
            StockBalance.store_id == store_id,
        )
    ).all()
    return float(sum(float(r.qty_on_hand or 0) for r in rows))


def ledger_out_count(
    session: Session,
    *,
    company_id: str,
    product_id: str,
    reference_id: str | None = None,
) -> int:
    stmt = select(StockLedger).where(
        StockLedger.company_id == company_id,
        StockLedger.product_id == product_id,
        StockLedger.out_qty > 0,
    )
    if reference_id:
        stmt = stmt.where(StockLedger.reference_id == reference_id)
    return len(list(session.exec(stmt).all()))


def run_parallel(fn_a: Callable[[], Any], fn_b: Callable[[], Any]) -> tuple[Any, Any]:
    """Execute two callables on separate threads (true concurrency)."""
    with ThreadPoolExecutor(max_workers=2) as pool:
        fa = pool.submit(fn_a)
        fb = pool.submit(fn_b)
        results = []
        for fut in as_completed([fa, fb]):
            try:
                results.append(("ok", fut.result()))
            except Exception as exc:  # noqa: BLE001 — capture race losers
                results.append(("err", exc))
    # Preserve submit order mapping
    out_a = fa.result() if fa.exception() is None else fa.exception()
    out_b = fb.result() if fb.exception() is None else fb.exception()
    return out_a, out_b


def classify_pair(a: Any, b: Any) -> tuple[int, int]:
    """Return (success_count, failure_count) for two parallel outcomes."""
    def ok(x: Any) -> bool:
        return not isinstance(x, BaseException)

    successes = sum(1 for x in (a, b) if ok(x))
    return successes, 2 - successes
