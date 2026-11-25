"""Inventory movement engine — authoritative perpetual stock posting."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func
from sqlmodel import Session, select

from app.inventory.constants import (
    ADJUSTMENT_MINUS,
    ADJUSTMENT_PLUS,
    DAMAGE,
    OPENING,
    PURCHASE_RECEIVE,
    PURCHASE_RETURN,
    RESERVATION_HOLD,
    RESERVATION_RELEASE,
    SALE,
    SALES_RETURN,
    TRANSFER_IN,
    TRANSFER_OUT,
    normalize_movement_type,
)
from app.inventory.exceptions import InsufficientStockError
from app.inventory.locking import for_update, supports_row_lock
from app.models.base import parse_iso_dt
from app.models.config_engine import StorePolicy
from app.models.industry import (
    ElectronicsSerialStock,
    FashionProductVariant,
    PharmaBatch,
)
from app.models.inventory import StockAdjustment, StockBalance, StockLedger, StockReservation, StockTransfer
from app.models.product import Product


def _available_qty(balance: StockBalance) -> float:
    return max(0.0, (balance.qty_on_hand or 0) - (balance.qty_reserved or 0))


def _get_store_policy(session: Session, company_id: str, store_id: str | None, key: str, default: str) -> str:
    if not store_id:
        return default
    row = session.exec(
        select(StorePolicy).where(
            StorePolicy.company_id == company_id,
            StorePolicy.store_id == store_id,
            StorePolicy.policy_key == key,
        )
    ).first()
    return row.policy_value if row else default


def allow_negative_stock(session: Session, company_id: str, store_id: str | None) -> bool:
    val = _get_store_policy(session, company_id, store_id, "allow_negative_stock", "false")
    return str(val).lower() in ("true", "1", "yes")


def resolve_store_id(session: Session, company_id: str, store_identifier: str | None, allow_default_fallback: bool = True) -> str | None:
    from app.models.core import Store
    from sqlmodel import func

    if store_identifier:
        store = session.exec(
            select(Store).where(Store.company_id == company_id, Store.id == store_identifier)
        ).first()
        if store:
            return store.id
        store_by_code = session.exec(
            select(Store).where(Store.company_id == company_id, func.lower(Store.code) == store_identifier.lower())
        ).first()
        if store_by_code:
            return store_by_code.id
        store_by_name = session.exec(
            select(Store).where(Store.company_id == company_id, func.lower(Store.name) == store_identifier.lower())
        ).first()
        if store_by_name:
            return store_by_name.id

    if allow_default_fallback:
        default_store = session.exec(
            select(Store).where(Store.company_id == company_id).order_by(Store.created_at.asc())
        ).first()
        return default_store.id if default_store else None
    return None


def get_inventory_policies(session: Session, company_id: str) -> list[dict]:
    from app.models.core import Store

    stores = session.exec(select(Store).where(Store.company_id == company_id)).all()
    out: list[dict] = []
    for store in stores:
        out.append({
            "store_id": store.id,
            "allow_negative_stock": allow_negative_stock(session, company_id, store.id),
            "cost_method": _get_store_policy(session, company_id, store.id, "inventory_cost_method", "moving_average"),
        })
    return out


def upsert_inventory_policy(
    session: Session,
    company_id: str,
    store_id: str,
    *,
    allow_negative: bool | None = None,
    cost_method: str | None = None,
    updated_by: str | None = None,
) -> dict:
    def _set(key: str, value: str) -> None:
        row = session.exec(
            select(StorePolicy).where(
                StorePolicy.company_id == company_id,
                StorePolicy.store_id == store_id,
                StorePolicy.policy_key == key,
            )
        ).first()
        if row:
            row.policy_value = value
            session.add(row)
        else:
            session.add(
                StorePolicy(
                    company_id=company_id,
                    store_id=store_id,
                    policy_key=key,
                    policy_value=value,
                )
            )

    if allow_negative is not None:
        _set("allow_negative_stock", "true" if allow_negative else "false")
    if cost_method is not None:
        _set("inventory_cost_method", cost_method)
    session.flush()
    return {
        "store_id": store_id,
        "allow_negative_stock": allow_negative_stock(session, company_id, store_id),
        "cost_method": _get_store_policy(session, company_id, store_id, "inventory_cost_method", "moving_average"),
    }


def _supports_row_lock(session: Session) -> bool:
    return supports_row_lock(session)


def _maybe_for_update(session: Session, stmt):
    return for_update(session, stmt)


def _get_or_create_balance(
    session: Session,
    company_id: str,
    product_id: str,
    store_id: str | None,
    warehouse_id: str | None = None,
    *,
    for_update: bool = False,
) -> StockBalance:
    stmt = select(StockBalance).where(
        StockBalance.company_id == company_id,
        StockBalance.product_id == product_id,
        StockBalance.store_id == store_id,
        StockBalance.warehouse_id == warehouse_id,
    )
    if for_update:
        stmt = _maybe_for_update(session, stmt)
    bal = session.exec(stmt).first()
    if not bal:
        bal = StockBalance(
            company_id=company_id,
            product_id=product_id,
            store_id=store_id,
            warehouse_id=warehouse_id,
            qty_on_hand=0,
            qty_reserved=0,
            unit_cost_avg=0,
        )
        session.add(bal)
        session.flush()
        if for_update and _supports_row_lock(session):
            # Re-select with lock so concurrent creators serialize on the row.
            bal = session.exec(
                _maybe_for_update(session, select(StockBalance).where(StockBalance.id == bal.id))
            ).one()
    return bal


def _expire_stale_reservations(session: Session, company_id: str, product_id: str) -> None:
    """Release any active reservations whose expires_at has passed so abandoned carts do not lock stock."""
    now = datetime.now(timezone.utc)
    stale = list(
        session.exec(
            select(StockReservation).where(
                StockReservation.company_id == company_id,
                StockReservation.product_id == product_id,
                StockReservation.status == "active",
            )
        ).all()
    )
    for res in stale:
        if not res.expires_at:
            continue
        exp = res.expires_at if res.expires_at.tzinfo else res.expires_at.replace(tzinfo=timezone.utc)
        if exp <= now:
            stmt = select(StockBalance).where(
                StockBalance.company_id == company_id,
                StockBalance.product_id == product_id,
            )
            if res.store_id:
                stmt = stmt.where(StockBalance.store_id == res.store_id)
            remaining = float(res.qty or 0)
            for bal in session.exec(stmt).all():
                if remaining <= 0:
                    break
                rel = min(remaining, float(bal.qty_reserved or 0))
                if rel > 0:
                    bal.qty_reserved = max(0.0, float(bal.qty_reserved or 0) - rel)
                    session.add(bal)
                    remaining -= rel
            res.status = "expired"
            session.add(res)


def _store_balances_for_product(
    session: Session,
    company_id: str,
    product_id: str,
    store_id: str | None,
    *,
    for_update: bool = False,
) -> list[StockBalance]:
    stmt = select(StockBalance).where(
        StockBalance.company_id == company_id,
        StockBalance.product_id == product_id,
    )
    if store_id:
        stmt = stmt.where(StockBalance.store_id == store_id)
    if for_update:
        stmt = _maybe_for_update(session, stmt)
    rows = list(session.exec(stmt).all())
    if store_id and sum(_available_qty(b) for b in rows) <= 0:
        null_stmt = select(StockBalance).where(
            StockBalance.company_id == company_id,
            StockBalance.product_id == product_id,
            StockBalance.store_id == None,  # noqa: E711
        )
        if for_update:
            null_stmt = _maybe_for_update(session, null_stmt)
        for nb in session.exec(null_stmt).all():
            if nb not in rows:
                rows.append(nb)
    rows.sort(key=lambda b: (b.warehouse_id is not None, b.warehouse_id or ""))
    return rows


def _resolve_fashion_legacy_variant(
    session: Session,
    *,
    product_id: str,
    variant_id: str | None,
) -> FashionProductVariant | None:
    """Map sale/receive variant identity onto legacy FashionProductVariant for compat mirror.

    Source of truth for fashion stock is StockBalance/StockLedger + generic ProductVariant
    identity. FashionProductVariant.stock_qty is a controlled compatibility mirror only.
    """
    if not variant_id:
        return None
    legacy = session.exec(
        _maybe_for_update(
            session,
            select(FashionProductVariant).where(FashionProductVariant.id == variant_id),
        )
    ).first()
    if legacy:
        return legacy
    from app.models.product import ProductVariant

    generic = session.get(ProductVariant, variant_id)
    if not generic or generic.product_id != product_id:
        return None
    stmt = select(FashionProductVariant).where(FashionProductVariant.product_id == product_id)
    if generic.barcode:
        match = session.exec(
            _maybe_for_update(
                session,
                stmt.where(FashionProductVariant.barcode == generic.barcode),
            )
        ).first()
        if match:
            return match
    if generic.size and generic.color:
        match = session.exec(
            _maybe_for_update(
                session,
                stmt.where(
                    FashionProductVariant.size == generic.size,
                    FashionProductVariant.color == generic.color,
                ),
            )
        ).first()
        if match:
            return match
    if generic.variant_code:
        match = session.exec(
            _maybe_for_update(
                session,
                stmt.where(FashionProductVariant.sku == generic.variant_code),
            )
        ).first()
        if match:
            return match
    return None


def _total_available_at_store(
    session: Session,
    company_id: str,
    product_id: str,
    store_id: str | None,
) -> float:
    return sum(_available_qty(b) for b in _store_balances_for_product(session, company_id, product_id, store_id))


def _update_moving_average(balance: StockBalance, in_qty: float, unit_cost: float) -> None:
    if in_qty <= 0:
        return
    prev_qty = balance.qty_on_hand or 0
    prev_cost = balance.unit_cost_avg or 0
    new_qty = prev_qty + in_qty
    if new_qty <= 0:
        balance.unit_cost_avg = unit_cost
    else:
        balance.unit_cost_avg = round(((prev_qty * prev_cost) + (in_qty * unit_cost)) / new_qty, 4)


def sync_industry_stock_on_movement(
    session: Session,
    company_id: str,
    product: Product | None,
    *,
    qty_delta: float,
    variant_id: str | None = None,
    batch_id: str | None = None,
    serial_no: str | None = None,
) -> None:
    """Mirror StockBalance deltas onto industry satellite qty fields.

    Legitimate `.qty_on_hand` / satellite qty writers (do not bypass this path for sales/GRN):
    - `record_stock_movement` → updates `StockBalance.qty_on_hand` then calls this helper
    - pharmacy / cosmetics / surgical satellite syncs invoked only from here (or their
      dedicated `sync_*_qty` helpers called by this function)
    - seed / migrations / tests may set balances directly for fixtures
    Business APIs must not assign `StockBalance.qty_on_hand` outside `record_stock_movement`.
    """
    if not product or qty_delta == 0:
        return
    pack = product.industry_pack
    if pack == "fashion" and variant_id:
        # Compatibility mirror only — never an independent stock authority.
        variant = _resolve_fashion_legacy_variant(
            session, product_id=product.id, variant_id=variant_id
        )
        if variant:
            variant.stock_qty = max(0.0, (variant.stock_qty or 0) + qty_delta)
            session.add(variant)
    elif pack == "pharmacy" and batch_id:
        batch = session.exec(
            for_update(session, select(PharmaBatch).where(PharmaBatch.id == batch_id))
        ).first()
        if batch and batch.company_id == company_id:
            new_qty = (batch.qty_on_hand or 0) + qty_delta
            if qty_delta < 0 and new_qty < -0.0001:
                raise InsufficientStockError(product.id, abs(qty_delta), batch.qty_on_hand or 0)
            batch.qty_on_hand = max(0.0, new_qty)
            session.add(batch)
    elif pack in {"electronics", "mobile-shop"} and serial_no:
        row = session.exec(
            for_update(
                session,
                select(ElectronicsSerialStock).where(
                    ElectronicsSerialStock.company_id == company_id,
                    ElectronicsSerialStock.serial_imei == serial_no,
                ),
            )
        ).first()
        if not row:
            row = session.exec(
                for_update(
                    session,
                    select(ElectronicsSerialStock).where(
                        ElectronicsSerialStock.company_id == company_id,
                        ElectronicsSerialStock.imei_no == serial_no,
                    ),
                )
            ).first()
        if row:
            if qty_delta < 0:
                # Extension may mark sold, then warranty auto-register sets status=warranty
                # in the same transaction before ledger sync runs.
                if row.status == "available":
                    row.status = "sold"
                elif row.status not in {"sold", "warranty"}:
                    raise InsufficientStockError(product.id, abs(qty_delta), 0)
            elif qty_delta > 0 and row.status in {"sold", "returned", "warranty"}:
                row.status = "available"
            session.add(row)
    elif pack == "surgical-shop" and (batch_id or serial_no):
        from app.services.surgical_service import sync_stock_unit_qty

        try:
            sync_stock_unit_qty(
                session,
                company_id,
                stock_unit_id=batch_id,
                qty_delta=qty_delta,
                serial_no=serial_no,
                on_return=qty_delta > 0,
            )
        except ValueError as exc:
            raise InsufficientStockError(product.id, abs(qty_delta), 0) from exc
    elif pack == "cosmetics" and batch_id:
        from app.services.cosmetics_service import sync_batch_qty

        try:
            sync_batch_qty(session, company_id, batch_id=batch_id, qty_delta=qty_delta)
        except ValueError as exc:
            raise InsufficientStockError(product.id, abs(qty_delta), 0) from exc


def record_stock_movement(
    session: Session,
    *,
    company_id: str,
    product_id: str,
    store_id: str | None,
    warehouse_id: str | None,
    in_qty: float = 0,
    out_qty: float = 0,
    transaction_type: str,
    transaction_ref: str | None = None,
    reference_id: str | None = None,
    unit_cost: float = 0,
    note: str | None = None,
    created_by: str | None = None,
    variant_id: str | None = None,
    batch_id: str | None = None,
    serial_no: str | None = None,
    allow_negative: bool | None = None,
) -> StockBalance:
    if store_id:
        store_id = resolve_store_id(session, company_id, store_id, allow_default_fallback=False)
    movement = normalize_movement_type(transaction_type) or transaction_type
    product = session.get(Product, product_id)
    neg_ok = allow_negative if allow_negative is not None else allow_negative_stock(session, company_id, store_id)

    remaining_out = out_qty
    remaining_in = in_qty
    last_balance: StockBalance | None = None

    if out_qty > 0:
        _expire_stale_reservations(session, company_id, product_id)
        # Lock all candidate balance rows first, then re-check availability under lock.
        buckets = _store_balances_for_product(
            session, company_id, product_id, store_id, for_update=True
        )
        if not buckets:
            buckets = [
                _get_or_create_balance(
                    session, company_id, product_id, store_id, warehouse_id, for_update=True
                )
            ]
        if not neg_ok:
            available = sum(_available_qty(b) for b in buckets)
            if available < out_qty:
                raise InsufficientStockError(product_id, out_qty, available, store_id)
        for bal in buckets:
            if remaining_out <= 0:
                break
            take = remaining_out
            if not neg_ok:
                take = min(take, _available_qty(bal))
                if take <= 0:
                    continue
            bal.qty_on_hand = (bal.qty_on_hand or 0) - take
            remaining_out -= take
            session.add(bal)
            qty_delta = -take
            session.add(
                StockLedger(
                    company_id=company_id,
                    product_id=product_id,
                    store_id=bal.store_id,
                    warehouse_id=bal.warehouse_id,
                    variant_id=variant_id,
                    batch_id=batch_id,
                    serial_id=serial_no,
                    transaction_type=movement,
                    transaction_ref=transaction_ref,
                    in_qty=0,
                    out_qty=take,
                    qty_delta=qty_delta,
                    balance_after=bal.qty_on_hand,
                    unit_cost=unit_cost or bal.unit_cost_avg,
                    total_cost=(unit_cost or bal.unit_cost_avg) * take,
                    reference_type=movement,
                    reference_id=reference_id,
                    note=note,
                    created_by=created_by,
                )
            )
            sync_industry_stock_on_movement(
                session, company_id, product, qty_delta=-take,
                variant_id=variant_id, batch_id=batch_id, serial_no=serial_no,
            )
            last_balance = bal
        if remaining_out > 0:
            if not neg_ok:
                raise InsufficientStockError(product_id, out_qty, out_qty - remaining_out, store_id)
            bal = _get_or_create_balance(
                session, company_id, product_id, store_id, warehouse_id, for_update=True
            )
            bal.qty_on_hand = (bal.qty_on_hand or 0) - remaining_out
            session.add(bal)
            session.add(
                StockLedger(
                    company_id=company_id,
                    product_id=product_id,
                    store_id=bal.store_id,
                    warehouse_id=bal.warehouse_id,
                    variant_id=variant_id,
                    batch_id=batch_id,
                    serial_id=serial_no,
                    transaction_type=movement,
                    transaction_ref=transaction_ref,
                    in_qty=0,
                    out_qty=remaining_out,
                    qty_delta=-remaining_out,
                    balance_after=bal.qty_on_hand,
                    unit_cost=unit_cost or bal.unit_cost_avg,
                    total_cost=(unit_cost or bal.unit_cost_avg) * remaining_out,
                    reference_type=movement,
                    reference_id=reference_id,
                    note=note,
                    created_by=created_by,
                )
            )
            sync_industry_stock_on_movement(
                session, company_id, product, qty_delta=-remaining_out,
                variant_id=variant_id, batch_id=batch_id, serial_no=serial_no,
            )
            last_balance = bal

    if in_qty > 0:
        bal = _get_or_create_balance(
            session, company_id, product_id, store_id, warehouse_id, for_update=True
        )
        _update_moving_average(bal, remaining_in, unit_cost)
        bal.qty_on_hand = (bal.qty_on_hand or 0) + remaining_in
        session.add(bal)
        session.add(
            StockLedger(
                company_id=company_id,
                product_id=product_id,
                store_id=bal.store_id,
                warehouse_id=bal.warehouse_id,
                variant_id=variant_id,
                batch_id=batch_id,
                serial_id=serial_no,
                transaction_type=movement,
                transaction_ref=transaction_ref,
                in_qty=remaining_in,
                out_qty=0,
                qty_delta=remaining_in,
                balance_after=bal.qty_on_hand,
                unit_cost=unit_cost or bal.unit_cost_avg,
                total_cost=(unit_cost or bal.unit_cost_avg) * remaining_in,
                reference_type=movement,
                reference_id=reference_id,
                note=note,
                created_by=created_by,
            )
        )
        sync_industry_stock_on_movement(
            session, company_id, product, qty_delta=remaining_in,
            variant_id=variant_id, batch_id=batch_id, serial_no=serial_no,
        )
        last_balance = bal

    if last_balance is None:
        last_balance = _get_or_create_balance(session, company_id, product_id, store_id, warehouse_id)
    return last_balance


def adjust_stock_for_sale(
    session: Session,
    company_id: str,
    product_id: str,
    store_id: str | None,
    qty: float,
    reference_id: str | None = None,
    created_by: str | None = None,
    variant_id: str | None = None,
    batch_id: str | None = None,
    serial_no: str | None = None,
) -> None:
    record_stock_movement(
        session,
        company_id=company_id,
        product_id=product_id,
        store_id=store_id,
        warehouse_id=None,
        out_qty=qty,
        transaction_type=SALE,
        transaction_ref=reference_id,
        reference_id=reference_id,
        note="POS sale deduction",
        created_by=created_by,
        variant_id=variant_id,
        batch_id=batch_id,
        serial_no=serial_no,
    )


def adjust_stock(
    session: Session,
    company_id: str,
    product_id: str,
    store_id: str | None,
    qty_after: float,
    reason: str,
    user_id: str | None,
) -> None:
    store_id = resolve_store_id(session, company_id, store_id)
    bal = _get_or_create_balance(session, company_id, product_id, store_id, None)
    before = bal.qty_on_hand or 0
    delta = qty_after - before
    session.add(
        StockAdjustment(
            company_id=company_id,
            product_id=product_id,
            store_id=store_id,
            qty_before=before,
            qty_after=qty_after,
            reason=reason,
            adjusted_by=user_id,
        )
    )
    if delta >= 0:
        record_stock_movement(
            session,
            company_id=company_id,
            product_id=product_id,
            store_id=store_id,
            warehouse_id=None,
            in_qty=delta,
            transaction_type=ADJUSTMENT_PLUS,
            note=reason,
            created_by=user_id,
        )
    else:
        record_stock_movement(
            session,
            company_id=company_id,
            product_id=product_id,
            store_id=store_id,
            warehouse_id=None,
            out_qty=abs(delta),
            transaction_type=ADJUSTMENT_MINUS,
            note=reason,
            created_by=user_id,
        )


def ensure_fashion_variant(
    session: Session,
    company_id: str,
    product: Product,
    variant_id: str | None = None,
) -> str:
    """Ensure a valid ProductVariant exists for a fashion product line.

    If variant_id is provided, validate it belongs to this product.
    If variant_id is None:
      - If active variants exist, pick the first active variant.
      - If no variants exist for this product, auto-create a standard ProductVariant
        and legacy mirror so that stock posting, ledger recording, and POS checkout work.
    Returns the resolved variant_id.
    """
    from app.models.product import ProductVariant
    from app.models.industry import FashionProductVariant

    if variant_id:
        vv = session.get(ProductVariant, variant_id)
        if not vv or vv.company_id != company_id or vv.product_id != product.id:
            raise HTTPException(status_code=400, detail="Invalid fashion variant for opening stock")
        return vv.id

    # variant_id not provided: try to find an existing active variant
    variants = session.exec(
        select(ProductVariant).where(
            ProductVariant.company_id == company_id,
            ProductVariant.product_id == product.id,
            ProductVariant.is_active == True,
        )
    ).all()
    if variants:
        return variants[0].id

    # No variant exists: auto-create a default/standard variant
    std_code = f"{product.sku}-STD" if not product.sku.endswith("-STD") else product.sku
    new_v = ProductVariant(
        company_id=company_id,
        product_id=product.id,
        variant_code=std_code,
        size="Standard",
        color="Default",
        barcode=product.barcode or product.sku,
        is_active=True,
    )
    session.add(new_v)
    session.flush()

    legacy = session.exec(
        select(FashionProductVariant).where(
            FashionProductVariant.product_id == product.id,
            FashionProductVariant.sku == std_code,
        )
    ).first()
    if not legacy:
        session.add(
            FashionProductVariant(
                product_id=product.id,
                sku=std_code,
                barcode=new_v.barcode,
                size="Standard",
                color="Default",
                stock_qty=0.0,
            )
        )
        session.flush()

    return new_v.id


def post_opening_stock(
    session: Session,
    *,
    company_id: str,
    product_id: str,
    store_id: str | None,
    warehouse_id: str | None = None,
    qty: float,
    unit_cost: float = 0,
    variant_id: str | None = None,
    note: str | None = None,
    created_by: str | None = None,
    transaction_ref: str = "OPENING",
    batch_no: str | None = None,
    lot_no: str | None = None,
    expiry_date=None,
    manufacture_date=None,
    serials: list[str] | None = None,
) -> None:
    """Post opening balance via record_stock_movement (Option B mirror intact)."""
    if qty <= 0:
        raise HTTPException(status_code=400, detail="Opening stock qty must be greater than zero")
    if store_id or not warehouse_id:
        store_id = resolve_store_id(session, company_id, store_id)
    product = session.get(Product, product_id)
    if not product or product.company_id != company_id:
        raise HTTPException(status_code=400, detail="Product not found")
    if product.industry_pack == "fashion":
        variant_id = ensure_fashion_variant(session, company_id, product, variant_id)

    resolved_batch_id: str | None = None
    first_serial: str | None = None
    serials_payload = [{"serial_no": s} for s in serials] if serials else None
    if product.industry_pack in {"pharmacy", "cosmetics", "surgical-shop", "electronics", "mobile-shop"}:
        resolved_batch_id = apply_industry_receive_stock(
            session,
            company_id,
            product,
            qty,
            variant_id=variant_id,
            batch_no=batch_no,
            expiry_date=expiry_date,
            serials=serials_payload,
            store_id=store_id,
            cost_price=unit_cost,
            lot_no=lot_no,
            manufacture_date=manufacture_date,
        )
        if serials:
            first_serial = serials[0]

    # Check if there is an existing 'Initial Opening Stock' adjustment from Product Master
    init_adj = session.exec(
        select(StockAdjustment).where(
            StockAdjustment.company_id == company_id,
            StockAdjustment.store_id == store_id,
            StockAdjustment.product_id == product_id,
            StockAdjustment.reason == "Initial Opening Stock",
        )
    ).first()

    effective_in_qty = qty
    if init_adj:
        # Product master already seeded init_adj.qty_after; only add any additional delta
        effective_in_qty = max(0.0, qty - (init_adj.qty_after or 0.0))
        session.delete(init_adj)

    if effective_in_qty > 0:
        record_stock_movement(
            session,
            company_id=company_id,
            product_id=product_id,
            store_id=store_id,
            warehouse_id=warehouse_id,
            in_qty=effective_in_qty,
            transaction_type=OPENING,
            transaction_ref=transaction_ref,
            unit_cost=unit_cost,
            note=note or "Opening balance",
            created_by=created_by,
            variant_id=variant_id,
            batch_id=resolved_batch_id,
            serial_no=first_serial,
        )
    else:
        # Stock balance is already at target from Product Master.
        # Confirm opening stock in ledger without doubling the physical balance.
        bal = _get_or_create_balance(session, company_id, product_id, store_id, warehouse_id)
        session.add(
            StockLedger(
                company_id=company_id,
                product_id=product_id,
                store_id=store_id,
                warehouse_id=warehouse_id,
                variant_id=variant_id,
                batch_id=resolved_batch_id,
                serial_id=first_serial,
                transaction_type=OPENING,
                transaction_ref=transaction_ref,
                in_qty=0,
                out_qty=0,
                qty_delta=0,
                balance_after=bal.qty_on_hand,
                unit_cost=unit_cost or bal.unit_cost_avg,
                total_cost=0,
                reference_type=OPENING,
                reference_id=transaction_ref,
                note=note or f"Opening balance confirmed at {bal.qty_on_hand}",
                created_by=created_by,
            )
        )

    amount = round(qty * unit_cost, 2)
    if amount > 0:
        from app.services.accounting_service import get_account_by_code, post_journal_entry

        inventory_account = get_account_by_code(session, company_id, "1300")
        opening_equity_account = get_account_by_code(session, company_id, "3100")
        post_journal_entry(
            session,
            company_id=company_id,
            created_by=created_by,
            entry_date=datetime.now(timezone.utc),
            source_type="opening_stock",
            source_id=product_id,
            lines=[
                {"account_id": inventory_account.id, "debit": amount, "store_id": store_id},
                {"account_id": opening_equity_account.id, "credit": amount, "store_id": store_id},
            ],
            memo=f"Opening stock: {product.sku} x{qty}",
        )


def transfer_stock(
    session: Session,
    company_id: str,
    product_id: str,
    from_store_id: str | None,
    to_store_id: str | None,
    qty: float,
    reason: str,
    user_id: str | None,
    from_warehouse_id: str | None = None,
    to_warehouse_id: str | None = None,
) -> None:
    transfer = StockTransfer(
        company_id=company_id,
        product_id=product_id,
        from_store_id=from_store_id,
        to_store_id=to_store_id,
        from_warehouse_id=from_warehouse_id,
        to_warehouse_id=to_warehouse_id,
        qty=qty,
        reason=reason,
        transferred_by=user_id,
    )
    session.add(transfer)
    session.flush()
    record_stock_movement(
        session,
        company_id=company_id,
        product_id=product_id,
        store_id=from_store_id,
        warehouse_id=from_warehouse_id,
        out_qty=qty,
        transaction_type=TRANSFER_OUT,
        reference_id=transfer.id,
        note=f"Transfer out: {reason}",
        created_by=user_id,
    )
    record_stock_movement(
        session,
        company_id=company_id,
        product_id=product_id,
        store_id=to_store_id,
        warehouse_id=to_warehouse_id,
        in_qty=qty,
        transaction_type=TRANSFER_IN,
        reference_id=transfer.id,
        note=f"Transfer in: {reason}",
        created_by=user_id,
    )


def mark_stock_damaged(
    session: Session,
    company_id: str,
    product_id: str,
    store_id: str | None,
    warehouse_id: str | None,
    qty: float,
    reason: str,
    created_by: str | None,
    variant_id: str | None = None,
    batch_id: str | None = None,
    serial_no: str | None = None,
) -> StockBalance:
    """Move qty out of sellable stock into the damaged holding bucket — physically
    present, not sellable, pending inspection/write-off/restore."""
    if qty <= 0:
        raise HTTPException(status_code=400, detail="qty must be greater than zero")
    balance = record_stock_movement(
        session,
        company_id=company_id,
        product_id=product_id,
        store_id=store_id,
        warehouse_id=warehouse_id,
        out_qty=qty,
        transaction_type=DAMAGE,
        note=reason,
        created_by=created_by,
        variant_id=variant_id,
        batch_id=batch_id,
        serial_no=serial_no,
    )
    balance.qty_damaged = round((balance.qty_damaged or 0) + qty, 4)
    session.add(balance)
    session.flush()
    return balance


def restore_damaged_stock(
    session: Session,
    company_id: str,
    product_id: str,
    store_id: str | None,
    warehouse_id: str | None,
    qty: float,
    created_by: str | None,
    variant_id: str | None = None,
) -> StockBalance:
    """Inspection found damaged stock is actually saleable — move it back to
    qty_on_hand."""
    if qty <= 0:
        raise HTTPException(status_code=400, detail="qty must be greater than zero")
    balance = _get_or_create_balance(session, company_id, product_id, store_id, warehouse_id, for_update=True)
    if qty > (balance.qty_damaged or 0) + 1e-6:
        raise HTTPException(status_code=400, detail="qty exceeds damaged stock on hand")
    balance.qty_damaged = round((balance.qty_damaged or 0) - qty, 4)
    session.add(balance)
    session.flush()
    return record_stock_movement(
        session,
        company_id=company_id,
        product_id=product_id,
        store_id=store_id,
        warehouse_id=warehouse_id,
        in_qty=qty,
        transaction_type=ADJUSTMENT_PLUS,
        note="Restored from damaged stock",
        created_by=created_by,
        variant_id=variant_id,
    )


def write_off_damaged_stock(
    session: Session,
    company_id: str,
    product_id: str,
    store_id: str | None,
    warehouse_id: str | None,
    qty: float,
    reason: str,
    created_by: str | None,
) -> StockBalance:
    """Permanently remove damaged stock from inventory — it was already deducted
    from qty_on_hand when marked damaged, so this only clears the damaged bucket
    and logs the write-off; qty_on_hand does not change again."""
    if qty <= 0:
        raise HTTPException(status_code=400, detail="qty must be greater than zero")
    balance = _get_or_create_balance(session, company_id, product_id, store_id, warehouse_id, for_update=True)
    if qty > (balance.qty_damaged or 0) + 1e-6:
        raise HTTPException(status_code=400, detail="qty exceeds damaged stock on hand")
    balance.qty_damaged = round((balance.qty_damaged or 0) - qty, 4)
    session.add(balance)
    session.add(
        StockLedger(
            company_id=company_id,
            product_id=product_id,
            store_id=store_id,
            warehouse_id=warehouse_id,
            transaction_type="damage_writeoff",
            in_qty=0,
            out_qty=qty,
            qty_delta=0,
            balance_after=balance.qty_on_hand,
            unit_cost=balance.unit_cost_avg,
            total_cost=round(qty * (balance.unit_cost_avg or 0), 2),
            reference_type="damage_writeoff",
            note=reason,
            created_by=created_by,
        )
    )
    session.flush()
    return balance


def dispatch_transfer(
    session: Session,
    company_id: str,
    product_id: str,
    from_store_id: str | None,
    to_store_id: str | None,
    qty: float,
    reason: str,
    user_id: str | None,
    from_warehouse_id: str | None = None,
    to_warehouse_id: str | None = None,
) -> StockTransfer:
    """Two-phase transfer, phase 1: stock leaves the source now (deducted from
    qty_on_hand) but sits in the destination's qty_in_transit bucket — not
    sellable there — until receive_transfer confirms physical arrival. Unlike
    transfer_stock (atomic, both legs post immediately), use this when the
    goods are actually in transit (e.g. a truck en route) rather than
    instantaneously at the destination."""
    if qty <= 0:
        raise HTTPException(status_code=400, detail="qty must be greater than zero")
    transfer = StockTransfer(
        company_id=company_id,
        product_id=product_id,
        from_store_id=from_store_id,
        to_store_id=to_store_id,
        from_warehouse_id=from_warehouse_id,
        to_warehouse_id=to_warehouse_id,
        qty=qty,
        reason=reason,
        transferred_by=user_id,
        status="in_transit",
    )
    session.add(transfer)
    session.flush()
    record_stock_movement(
        session,
        company_id=company_id,
        product_id=product_id,
        store_id=from_store_id,
        warehouse_id=from_warehouse_id,
        out_qty=qty,
        transaction_type=TRANSFER_OUT,
        reference_id=transfer.id,
        note=f"Dispatch (in transit): {reason}",
        created_by=user_id,
    )
    dest_balance = _get_or_create_balance(session, company_id, product_id, to_store_id, to_warehouse_id, for_update=True)
    dest_balance.qty_in_transit = round((dest_balance.qty_in_transit or 0) + qty, 4)
    session.add(dest_balance)
    session.flush()
    return transfer


def receive_transfer(
    session: Session,
    company_id: str,
    transfer_id: str,
    user_id: str | None,
) -> StockTransfer:
    """Two-phase transfer, phase 2: goods physically arrived — move qty out of
    the destination's qty_in_transit bucket and into its sellable qty_on_hand."""
    transfer = session.get(StockTransfer, transfer_id)
    if not transfer or transfer.company_id != company_id:
        raise HTTPException(status_code=404, detail="Transfer not found")
    if transfer.status != "in_transit":
        raise HTTPException(status_code=409, detail=f"Transfer is not in transit (status={transfer.status})")
    dest_balance = _get_or_create_balance(
        session, company_id, transfer.product_id, transfer.to_store_id, transfer.to_warehouse_id, for_update=True
    )
    if transfer.qty > (dest_balance.qty_in_transit or 0) + 1e-6:
        raise HTTPException(status_code=409, detail="In-transit balance is less than the transfer qty")
    dest_balance.qty_in_transit = round((dest_balance.qty_in_transit or 0) - transfer.qty, 4)
    session.add(dest_balance)
    session.flush()
    record_stock_movement(
        session,
        company_id=company_id,
        product_id=transfer.product_id,
        store_id=transfer.to_store_id,
        warehouse_id=transfer.to_warehouse_id,
        in_qty=transfer.qty,
        transaction_type=TRANSFER_IN,
        reference_id=transfer.id,
        note=f"Received transfer: {transfer.reason}",
        created_by=user_id,
    )
    transfer.status = "completed"
    transfer.received_at = datetime.now(timezone.utc).replace(tzinfo=None)
    transfer.received_by = user_id
    session.add(transfer)
    session.flush()
    return transfer


def list_pending_transfers(session: Session, company_id: str, store_id: str | None = None) -> list[dict]:
    stmt = select(StockTransfer).where(
        StockTransfer.company_id == company_id, StockTransfer.status == "in_transit"
    )
    if store_id:
        stmt = stmt.where(StockTransfer.to_store_id == store_id)
    rows = session.exec(stmt.order_by(StockTransfer.created_at.desc())).all()  # type: ignore
    return [
        {
            "id": t.id,
            "product_id": t.product_id,
            "from_store_id": t.from_store_id,
            "to_store_id": t.to_store_id,
            "qty": t.qty,
            "reason": t.reason,
            "status": t.status,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in rows
    ]


def _coerce_expiry(expiry_date) -> datetime | None:
    if expiry_date is None:
        return None
    if isinstance(expiry_date, datetime):
        return expiry_date
    if isinstance(expiry_date, str):
        parsed = parse_iso_dt(expiry_date)
        if parsed:
            return parsed
        try:
            from datetime import date

            d = date.fromisoformat(expiry_date[:10])
            return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)
        except ValueError:
            pass
        import re
        m = re.match(r"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$", expiry_date.strip())
        if m:
            p1, p2, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if 1 <= p2 <= 12:
                try:
                    return datetime(year, p2, p1, 23, 59, 59, tzinfo=timezone.utc)
                except ValueError:
                    pass
            if 1 <= p1 <= 12:
                try:
                    return datetime(year, p1, p2, 23, 59, 59, tzinfo=timezone.utc)
                except ValueError:
                    pass
        return None
    return None


def apply_industry_receive_stock(
    session: Session,
    company_id: str,
    product: Product,
    qty: float,
    *,
    variant_id: str | None = None,
    batch_id: str | None = None,
    batch_no: str | None = None,
    expiry_date=None,
    serial_no: str | None = None,
    serials: list | None = None,
    store_id: str | None = None,
    purchase_id: str | None = None,
    receive_id: str | None = None,
    cost_price: float | None = None,
    supplier_id: str | None = None,
    require_serial: bool = False,
    lot_no: str | None = None,
    udi_code: str | None = None,
    manufacture_date=None,
    sterile_status: str | None = None,
    sterilization_method: str | None = None,
    manufacturer_name: str | None = None,
) -> str | None:
    pack = product.industry_pack
    resolved_batch_id: str | None = batch_id
    # Fashion: do NOT mutate FashionProductVariant.stock_qty here.
    # Receive stock posts via record_stock_movement → sync_industry_stock_on_movement
    # (controlled compatibility mirror). Dual independent writes caused drift (P1).
    if pack == "pharmacy" and batch_no:
        exp = _coerce_expiry(expiry_date)
        batch = session.exec(
            select(PharmaBatch).where(
                PharmaBatch.company_id == company_id,
                PharmaBatch.product_id == product.id,
                PharmaBatch.batch_no == batch_no,
            )
        ).first()
        if batch:
            resolved_batch_id = batch.id
        elif exp:
            new_batch = PharmaBatch(
                company_id=company_id,
                product_id=product.id,
                batch_no=batch_no,
                expiry_date=exp,
                qty_on_hand=0,
            )
            session.add(new_batch)
            session.flush()
            resolved_batch_id = new_batch.id
    elif pack == "cosmetics":
        from app.services.cosmetics_service import receive_batch_for_line

        resolved_batch_id = receive_batch_for_line(
            session,
            company_id=company_id,
            product=product,
            qty=qty,
            store_id=store_id,
            variant_id=variant_id,
            purchase_id=purchase_id,
            receive_id=receive_id,
            supplier_id=supplier_id,
            batch_no=batch_no,
            lot_no=lot_no,
            expiry_date=expiry_date,
            manufacture_date=manufacture_date,
        )
    elif pack in {"electronics", "mobile-shop"} and (serials or serial_no or require_serial):
        from app.services.electronics_service import receive_serials_for_line

        receive_serials_for_line(
            session,
            company_id=company_id,
            product=product,
            qty=qty,
            serials=serials,
            serial_no=serial_no,
            store_id=store_id,
            variant_id=variant_id,
            purchase_id=purchase_id,
            receive_id=receive_id,
            cost_price=cost_price,
            supplier_id=supplier_id,
            require_serial=require_serial or bool(serials or serial_no),
        )
    elif pack == "surgical-shop":
        from app.services.surgical_service import receive_stock_for_line

        resolved_batch_id = receive_stock_for_line(
            session,
            company_id=company_id,
            product=product,
            qty=qty,
            store_id=store_id,
            variant_id=variant_id,
            purchase_id=purchase_id,
            receive_id=receive_id,
            supplier_id=supplier_id,
            batch_no=batch_no,
            lot_no=lot_no,
            expiry_date=expiry_date,
            manufacture_date=manufacture_date,
            serial_no=serial_no,
            serials=serials,
            udi_code=udi_code,
            sterile_status=sterile_status,
            sterilization_method=sterilization_method,
            manufacturer_name=manufacturer_name,
        )

    return resolved_batch_id


def create_reservation(
    session: Session,
    *,
    company_id: str,
    product_id: str,
    store_id: str | None,
    warehouse_id: str | None,
    qty: float,
    reference_type: str,
    reference_id: str | None,
    created_by: str | None,
    variant_id: str | None = None,
    batch_id: str | None = None,
    serial_id: str | None = None,
    expires_minutes: int = 30,
) -> StockReservation:
    _expire_stale_reservations(session, company_id, product_id)
    available = _total_available_at_store(session, company_id, product_id, store_id)
    if available < qty:
        raise InsufficientStockError(product_id, qty, available, store_id)

    remaining = qty
    buckets = _store_balances_for_product(session, company_id, product_id, store_id)
    for bal in buckets:
        if remaining <= 0:
            break
        alloc = min(remaining, _available_qty(bal))
        if alloc <= 0:
            continue
        bal.qty_reserved = (bal.qty_reserved or 0) + alloc
        session.add(bal)
        remaining -= alloc

    expires_at = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes)
    res = StockReservation(
        company_id=company_id,
        product_id=product_id,
        store_id=store_id,
        warehouse_id=warehouse_id,
        variant_id=variant_id,
        batch_id=batch_id,
        serial_id=serial_id,
        qty=qty,
        status="active",
        reference_type=reference_type,
        reference_id=reference_id,
        expires_at=expires_at,
        created_by=created_by,
    )
    session.add(res)
    session.flush()
    record_stock_movement(
        session,
        company_id=company_id,
        product_id=product_id,
        store_id=store_id,
        warehouse_id=warehouse_id,
        out_qty=0,
        in_qty=0,
        transaction_type=RESERVATION_HOLD,
        reference_id=res.id,
        note=f"Reserved {qty} for {reference_type}",
        created_by=created_by,
    )
    return res


def release_reservation(session: Session, company_id: str, reservation_id: str) -> StockReservation:
    res = session.get(StockReservation, reservation_id)
    if not res or res.company_id != company_id:
        raise HTTPException(status_code=404, detail="Reservation not found")
    if res.status != "active":
        raise HTTPException(status_code=400, detail="Reservation is not active")

    remaining = res.qty
    buckets = _store_balances_for_product(session, company_id, res.product_id, res.store_id)
    for bal in buckets:
        if remaining <= 0:
            break
        release = min(remaining, bal.qty_reserved or 0)
        if release <= 0:
            continue
        bal.qty_reserved = max(0.0, (bal.qty_reserved or 0) - release)
        session.add(bal)
        remaining -= release

    res.status = "released"
    session.add(res)
    record_stock_movement(
        session,
        company_id=company_id,
        product_id=res.product_id,
        store_id=res.store_id,
        warehouse_id=res.warehouse_id,
        transaction_type=RESERVATION_RELEASE,
        reference_id=res.id,
        note="Reservation released",
    )
    return res


def consume_reservation(
    session: Session,
    company_id: str,
    reservation_id: str,
    *,
    reference_id: str | None = None,
    created_by: str | None = None,
) -> StockReservation:
    res = session.get(StockReservation, reservation_id)
    if not res or res.company_id != company_id:
        raise HTTPException(status_code=404, detail="Reservation not found")
    if res.status != "active":
        raise HTTPException(status_code=400, detail="Reservation is not active")

    remaining = res.qty
    buckets = _store_balances_for_product(session, company_id, res.product_id, res.store_id)
    for bal in buckets:
        if remaining <= 0:
            break
        unreserve = min(remaining, bal.qty_reserved or 0)
        if unreserve <= 0:
            continue
        bal.qty_reserved = max(0.0, (bal.qty_reserved or 0) - unreserve)
        session.add(bal)
        remaining -= unreserve

    record_stock_movement(
        session,
        company_id=company_id,
        product_id=res.product_id,
        store_id=res.store_id,
        warehouse_id=res.warehouse_id,
        out_qty=res.qty,
        transaction_type=SALE,
        reference_id=reference_id or res.id,
        created_by=created_by,
        variant_id=res.variant_id,
        batch_id=res.batch_id,
        serial_no=res.serial_id,
    )
    res.status = "consumed"
    session.add(res)
    return res


def list_reservations(session: Session, company_id: str, status: str | None = None) -> list[dict]:
    stmt = select(StockReservation).where(StockReservation.company_id == company_id)
    if status:
        stmt = stmt.where(StockReservation.status == status)
    rows = session.exec(stmt.order_by(StockReservation.created_at.desc())).all()  # type: ignore
    return [
        {
            "id": r.id,
            "product_id": r.product_id,
            "store_id": r.store_id,
            "warehouse_id": r.warehouse_id,
            "qty": r.qty,
            "status": r.status,
            "reference_type": r.reference_type,
            "reference_id": r.reference_id,
            "expires_at": r.expires_at.isoformat() if r.expires_at else None,
        }
        for r in rows
    ]


def get_stock_balances(session: Session, company_id: str, store_id: str | None):
    stmt = select(StockBalance, Product).join(Product, Product.id == StockBalance.product_id).where(
        StockBalance.company_id == company_id
    )
    if store_id:
        stmt = stmt.where(func.lower(StockBalance.store_id) == store_id.lower())
    rows = session.exec(stmt).all()

    aggregated: dict[tuple[str, str | None, str | None], dict] = {}
    for bal, prod in rows:
        key = (bal.product_id, bal.store_id, bal.warehouse_id)
        if key not in aggregated:
            aggregated[key] = {
                "product_id": bal.product_id,
                "sku": prod.sku,
                "name": prod.name,
                "store_id": bal.store_id,
                "warehouse_id": bal.warehouse_id,
                "qty_on_hand": 0.0,
                "qty_reserved": 0.0,
                "qty_available": 0.0,
                "qty_damaged": 0.0,
                "qty_in_transit": 0.0,
                "unit_cost_avg": bal.unit_cost_avg or 0,
            }
        aggregated[key]["qty_on_hand"] += bal.qty_on_hand or 0
        aggregated[key]["qty_reserved"] += bal.qty_reserved or 0
        aggregated[key]["qty_damaged"] += bal.qty_damaged or 0
        aggregated[key]["qty_in_transit"] += bal.qty_in_transit or 0
        aggregated[key]["qty_available"] = aggregated[key]["qty_on_hand"] - aggregated[key]["qty_reserved"]
    return list(aggregated.values())


def get_stock_ledger(
    session: Session,
    company_id: str,
    *,
    product_id: str | None = None,
    store_id: str | None = None,
    transaction_type: str | None = None,
    limit: int = 100,
):
    from app.models.core import Store
    stmt = (
        select(StockLedger, Product, Store)
        .outerjoin(Product, Product.id == StockLedger.product_id)
        .outerjoin(Store, Store.id == StockLedger.store_id)
        .where(StockLedger.company_id == company_id)
    )
    if product_id:
        stmt = stmt.where(StockLedger.product_id == product_id)
    if store_id:
        stmt = stmt.where(StockLedger.store_id == store_id)
    if transaction_type:
        normalized = normalize_movement_type(transaction_type)
        legacy = {transaction_type}
        if normalized:
            legacy.add(normalized)
        stmt = stmt.where(StockLedger.transaction_type.in_(legacy))
    stmt = stmt.order_by(StockLedger.created_at.desc())  # type: ignore
    rows = session.exec(stmt.limit(limit)).all()

    result = []
    for led, prod, store in rows:
        in_qty = float(led.in_qty or 0.0)
        out_qty = float(led.out_qty or 0.0)
        qty = in_qty if in_qty > 0 else out_qty
        unit_price = float((prod.base_price if prod else 0.0) or 0.0)
        unit_cost = float(led.unit_cost or (prod.cost_price if prod else 0.0) or 0.0)
        total_price = round(qty * unit_price, 2)
        total_cost = round(float(led.total_cost or (qty * unit_cost)), 2)

        result.append({
            "id": led.id,
            "product_id": led.product_id,
            "sku": prod.sku if prod else "",
            "name": prod.name if prod else "",
            "store_id": led.store_id,
            "store_name": store.name if store else None,
            "warehouse_id": led.warehouse_id,
            "transaction_type": led.transaction_type,
            "transaction_ref": led.transaction_ref,
            "variant_id": led.variant_id,
            "batch_id": led.batch_id,
            "serial_id": led.serial_id,
            "in_qty": in_qty,
            "out_qty": out_qty,
            "balance_after": float(led.balance_after or 0.0),
            "unit_price": unit_price,
            "unit_cost": unit_cost,
            "total_price": total_price,
            "total_cost": total_cost,
            "note": led.note,
            "created_at": led.created_at.isoformat() if led.created_at else None,
        })
    return result


def _product_reorder_levels(session: Session, company_id: str, product_ids: list[str]) -> dict[str, float]:
    """Per-product reorder_level from meta_json, when set to a positive number."""
    if not product_ids:
        return {}
    rows = session.exec(
        select(Product).where(Product.company_id == company_id, Product.id.in_(product_ids))
    ).all()
    levels: dict[str, float] = {}
    for p in rows:
        if not p.meta_json:
            continue
        try:
            meta = json.loads(p.meta_json)
        except (TypeError, ValueError):
            continue
        level = meta.get("reorder_level")
        if isinstance(level, (int, float)) and level > 0:
            levels[p.id] = float(level)
    return levels


def get_low_stock(session: Session, company_id: str, threshold: float = 20, store_id: str | None = None):
    balances = get_stock_balances(session, company_id, store_id=store_id)
    by_product: dict[str, dict] = {}
    for row in balances:
        pid = row["product_id"]
        if pid not in by_product:
            by_product[pid] = {**row, "qty_on_hand": 0.0, "qty_available": 0.0}
        by_product[pid]["qty_on_hand"] += row["qty_on_hand"]
        by_product[pid]["qty_available"] += row["qty_available"]
    reorder_levels = _product_reorder_levels(session, company_id, list(by_product.keys()))
    result = []
    for pid, data in by_product.items():
        reorder_point = reorder_levels.get(pid, threshold)
        if data["qty_available"] >= reorder_point:
            continue
        result.append({
            "product_id": pid,
            "sku": data["sku"],
            "name": data["name"],
            "store_id": data.get("store_id"),
            "qty_on_hand": data["qty_on_hand"],
            "qty_available": data["qty_available"],
            "reorder_point": reorder_point,
        })
    return result


def get_stock_summary(session: Session, company_id: str, store_id: str | None = None):
    balances = get_stock_balances(session, company_id, store_id=store_id)
    total_units = sum(b["qty_on_hand"] for b in balances)
    total_value = sum(b["qty_on_hand"] * (b.get("unit_cost_avg") or 0) for b in balances)
    product_ids = {b["product_id"] for b in balances}
    low = get_low_stock(session, company_id, store_id=store_id)
    return {
        "sku_count": len(product_ids),
        "total_units": total_units,
        "total_value": round(total_value, 2),
        "low_stock_count": len(low),
    }
