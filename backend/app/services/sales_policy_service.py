"""Sales policy helpers — return windows, receipt requirements, POS pricing authority."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlmodel import Session, select

from app.dependencies import AuthContext, write_audit
from app.models.config_engine import PriceListEntry, StorePolicy
from app.models.product import Product
from app.models.sales import SalesInvoice


def _get_store_policy(session: Session, company_id: str, store_id: str | None, key: str, default: str) -> str:
    if store_id:
        row = session.exec(
            select(StorePolicy).where(
                StorePolicy.company_id == company_id,
                StorePolicy.store_id == store_id,
                StorePolicy.policy_key == key,
            )
        ).first()
        if row:
            return row.policy_value

    # Fallback to company-wide store policy
    row = session.exec(
        select(StorePolicy).where(
            StorePolicy.company_id == company_id,
            StorePolicy.policy_key == key,
        )
    ).first()
    return row.policy_value if row else default


def get_sales_policies(session: Session, company_id: str, store_id: str | None) -> dict:
    return {
        "store_id": store_id,
        "return_window_days": int(_get_store_policy(session, company_id, store_id, "sales_return_window_days", "30")),
        "return_requires_receipt": _get_store_policy(
            session, company_id, store_id, "sales_return_requires_receipt", "false"
        ).lower() in ("true", "1", "yes"),
        "cart_reservation_minutes": int(_get_store_policy(session, company_id, store_id, "cart_reservation_minutes", "15")),
        "require_open_shift": _get_store_policy(
            session, company_id, store_id, "pos.require_open_shift", "false"
        ).lower() in ("true", "1", "yes"),
        "cashier_max_discount_pct": float(
            _get_store_policy(session, company_id, store_id, "pos.cashier_max_discount_pct", "10")
        ),
    }


def update_sales_policy(
    session: Session,
    auth: AuthContext,
    data: dict,
    store_id: str | None = None,
) -> dict:
    from app.models.core import Store
    sid = store_id or auth.store_id
    if not sid:
        first_store = session.exec(select(Store).where(Store.company_id == auth.company_id)).first()
        sid = first_store.id if first_store else None

    key_map = {
        "cashier_max_discount_pct": "pos.cashier_max_discount_pct",
        "return_window_days": "sales_return_window_days",
        "return_requires_receipt": "sales_return_requires_receipt",
        "cart_reservation_minutes": "cart_reservation_minutes",
        "require_open_shift": "pos.require_open_shift",
    }

    if sid:
        for payload_key, policy_key in key_map.items():
            if payload_key in data and data[payload_key] is not None:
                val_str = str(data[payload_key])
                row = session.exec(
                    select(StorePolicy).where(
                        StorePolicy.company_id == auth.company_id,
                        StorePolicy.store_id == sid,
                        StorePolicy.policy_key == policy_key,
                    )
                ).first()
                if row:
                    row.policy_value = val_str
                    session.add(row)
                else:
                    session.add(
                        StorePolicy(
                            company_id=auth.company_id,
                            store_id=sid,
                            policy_key=policy_key,
                            policy_value=val_str,
                        )
                    )
        session.flush()

    return get_sales_policies(session, auth.company_id, sid)


def validate_return_policy(session: Session, company_id: str, invoice: SalesInvoice) -> None:
    store_id = invoice.store_id or None
    window_days = int(_get_store_policy(session, company_id, store_id, "sales_return_window_days", "30"))
    requires_receipt = _get_store_policy(
        session, company_id, store_id, "sales_return_requires_receipt", "false"
    ).lower() in ("true", "1", "yes")

    if invoice.completed_at:
        completed = invoice.completed_at
        if completed.tzinfo is None:
            completed = completed.replace(tzinfo=timezone.utc)
        age_days = (datetime.now(timezone.utc) - completed).days
        if age_days > window_days:
            raise HTTPException(
                status_code=409,
                detail=f"Return window expired ({window_days} days)",
            )

    if requires_receipt:
        from app.models.sales import Receipt

        receipt = session.exec(select(Receipt).where(Receipt.invoice_id == invoice.id)).first()
        if not receipt:
            raise HTTPException(status_code=409, detail="Original receipt required for returns")


def _product_meta(product: Product) -> dict[str, Any]:
    if not product.meta_json:
        return {}
    try:
        data = json.loads(product.meta_json)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def _as_naive_utc(dt: datetime) -> datetime:
    """Normalize to naive UTC — stored starts_at/ends_at are naive (DateTime
    column, no timezone), so comparisons must use the same convention
    throughout (this codebase has previously shipped a tz-aware-vs-naive
    comparison bug for exactly this reason)."""
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _active_price_list_entry(
    session: Session, company_id: str, store_id: str | None, product_id: str
) -> PriceListEntry | None:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rows = session.exec(
        select(PriceListEntry).where(
            PriceListEntry.company_id == company_id,
            PriceListEntry.product_id == product_id,
            PriceListEntry.starts_at <= now,
        )
    ).all()
    active = [
        r
        for r in rows
        if (r.store_id is None or r.store_id == store_id)
        and (r.ends_at is None or _as_naive_utc(r.ends_at) >= now)
    ]
    if not active:
        return None
    # Prefer store-specific over company-wide; among ties, the most recently started wins.
    active.sort(key=lambda r: (r.store_id is not None, _as_naive_utc(r.starts_at)), reverse=True)
    return active[0]


def resolve_list_price(
    session: Session,
    company_id: str,
    store_id: str | None,
    product: Product,
) -> float:
    """Effective price for a product, in priority order:
    1. An active price_list_entry (effective-dated — starts_at <= now <= ends_at)
    2. StorePolicy's immediate `unit_price:{id|sku}` override
    3. Product.base_price
    """
    base = float(product.base_price or 0)
    scheduled = _active_price_list_entry(session, company_id, store_id, product.id)
    if scheduled:
        return scheduled.price
    if not store_id:
        return base
    raw = _get_store_policy(session, company_id, store_id, f"unit_price:{product.id}", "")
    if not raw:
        raw = _get_store_policy(session, company_id, store_id, f"unit_price:{product.sku}", "")
    if not raw:
        return base
    try:
        return float(raw)
    except (TypeError, ValueError):
        return base


def enforce_line_pricing(
    session: Session,
    auth: AuthContext,
    *,
    product: Product,
    unit_price: float,
    qty: float,
    meta: dict[str, Any] | None,
    store_id: str | None,
    industry_pack: str | None = None,
) -> None:
    """Enforce MSP / max discount / manager override for POS lines.

    Focus pack: fashion (always). Other packs only when product meta defines MSP/max_discount.
    """
    pack = industry_pack or product.industry_pack
    meta = dict(meta or {})
    product_meta = _product_meta(product)
    list_price = resolve_list_price(session, auth.company_id, store_id, product)
    msp_raw = product_meta.get("min_selling_price")
    msp = float(msp_raw) if msp_raw is not None and msp_raw != "" else None
    max_disc_raw = product_meta.get("max_discount_pct")
    product_max_disc = float(max_disc_raw) if max_disc_raw is not None and max_disc_raw != "" else None
    cashier_cap = float(
        _get_store_policy(session, auth.company_id, store_id, "pos.cashier_max_discount_pct", "10")
    )
    effective_cap = product_max_disc if product_max_disc is not None else cashier_cap

    if unit_price < 0:
        raise HTTPException(status_code=400, detail="Unit price cannot be negative")

    # Jewelry lines priced dynamically by metal weight, spot rate, wastage, and making charges
    if pack == "jewelry" and (
        meta.get("metal_rate")
        or meta.get("goldRate")
        or meta.get("netWeight")
        or meta.get("net_metal_weight")
        or meta.get("certificate")
    ):
        return

    # Pricing authority runs for every pack. It used to return here for anything
    # other than fashion unless the product carried MSP/max-discount meta, and
    # seeded products carry neither — so for 16 of 17 packs a cashier could sell
    # an 850.00 item for 0.01 with no override, no reason and no audit entry.
    # Lines with no resolvable list price (services, tips, ad-hoc items) still
    # fall through untouched, because discount_pct stays 0 below.

    discount_pct = 0.0
    if list_price > 0 and unit_price < list_price - 0.001:
        discount_pct = round((list_price - unit_price) / list_price * 100, 4)

    needs_override = False
    reasons: list[str] = []
    if msp is not None and unit_price + 0.001 < msp:
        needs_override = True
        reasons.append(f"below MSP {msp}")
    if discount_pct > effective_cap + 0.001:
        needs_override = True
        reasons.append(f"discount {discount_pct:.2f}% exceeds cap {effective_cap}%")

    if not needs_override:
        return

    can_override = (
        "pos.manager_discount" in auth.permissions
        or "pos.price_override" in auth.permissions
        or auth.role_code.upper() in {"ADMIN", "OWNER", "SUPER_ADMIN"}
        or auth.is_platform_admin
    )
    override_reason = str(meta.get("price_override_reason") or meta.get("override_reason") or "").strip()
    if can_override and not override_reason:
        override_reason = "Admin price override"
    if not can_override:
        raise HTTPException(
            status_code=403,
            detail=f"Price override required ({'; '.join(reasons)}); needs pos.manager_discount",
        )
    if not override_reason:
        raise HTTPException(
            status_code=400,
            detail="price_override_reason required when selling below MSP or over discount cap",
        )
    write_audit(
        session,
        auth,
        "pos.price_override",
        "product",
        product.id,
        {
            "sku": product.sku,
            "list_price": list_price,
            "unit_price": unit_price,
            "qty": qty,
            "msp": msp,
            "discount_pct": discount_pct,
            "cap": effective_cap,
            "reasons": reasons,
            "override_reason": override_reason,
            "industry_pack": pack,
        },
    )


def enforce_sale_pricing(
    session: Session,
    auth: AuthContext,
    *,
    industry_pack: str,
    lines: list,
    store_id: str | None,
    header_discount: float = 0,
    subtotal: float = 0,
) -> None:
    """Validate all sale lines (+ optional header discount) against pricing policy."""
    for line in lines:
        product_id = getattr(line, "product_id", None)
        meta = getattr(line, "meta", None) or {}
        if not product_id:
            product_id = meta.get("product_id") or meta.get("productId")
        if not product_id:
            continue
        product = session.get(Product, product_id)
        if not product or product.company_id != auth.company_id:
            continue
        if not product.is_active:
            raise HTTPException(status_code=400, detail=f"Inactive product cannot be sold: {product.sku}")
        enforce_line_pricing(
            session,
            auth,
            product=product,
            unit_price=float(getattr(line, "unit_price", 0) or 0),
            qty=float(getattr(line, "qty", 1) or 1),
            meta=meta if isinstance(meta, dict) else {},
            store_id=store_id,
            industry_pack=industry_pack,
        )

    # Applies to every pack. This was previously gated on industry_pack ==
    # "fashion", leaving the other 16 packs with no ceiling on a header discount
    # at all — a 999,999 discount on an 850.00 basket was accepted silently.
    if header_discount > 0 and subtotal > 0:
        header_pct = round(header_discount / subtotal * 100, 4)
        cashier_cap = float(
            _get_store_policy(session, auth.company_id, store_id, "pos.cashier_max_discount_pct", "10")
        )
        is_admin_or_manager = (
            "pos.manager_discount" in auth.permissions
            or "pos.price_override" in auth.permissions
            or auth.role_code.upper() in {"ADMIN", "OWNER", "SUPER_ADMIN"}
            or auth.is_platform_admin
        )
        if header_pct > cashier_cap + 0.001 and not is_admin_or_manager:
            raise HTTPException(
                status_code=403,
                detail=f"Header discount {header_pct:.2f}% exceeds cashier cap {cashier_cap}%",
            )


def _price_list_entry_out(r: PriceListEntry) -> dict:
    return {
        "id": r.id,
        "store_id": r.store_id,
        "product_id": r.product_id,
        "price": r.price,
        "starts_at": r.starts_at.isoformat(),
        "ends_at": r.ends_at.isoformat() if r.ends_at else None,
        "name": r.name,
    }


def list_price_list_entries(
    session: Session, company_id: str, product_id: str | None = None, store_id: str | None = None
) -> list[dict]:
    stmt = select(PriceListEntry).where(PriceListEntry.company_id == company_id)
    if product_id:
        stmt = stmt.where(PriceListEntry.product_id == product_id)
    if store_id:
        stmt = stmt.where(PriceListEntry.store_id == store_id)
    rows = session.exec(stmt.order_by(PriceListEntry.starts_at.desc())).all()  # type: ignore
    return [_price_list_entry_out(r) for r in rows]


def create_price_list_entry(session: Session, auth: AuthContext, body: dict) -> dict:
    from app.models.base import parse_iso_dt

    product_id = body.get("product_id")
    if not product_id:
        raise HTTPException(status_code=400, detail="product_id is required")
    product = session.get(Product, product_id)
    if not product or product.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Product not found")

    price = float(body.get("price") or 0)
    if price <= 0:
        raise HTTPException(status_code=400, detail="price must be greater than zero")

    starts_at = parse_iso_dt(body.get("starts_at"))
    if not starts_at:
        raise HTTPException(status_code=400, detail="starts_at is required (ISO datetime)")
    ends_at = parse_iso_dt(body.get("ends_at")) if body.get("ends_at") else None
    starts_at = _as_naive_utc(starts_at)
    if ends_at:
        ends_at = _as_naive_utc(ends_at)
        if ends_at <= starts_at:
            raise HTTPException(status_code=400, detail="ends_at must be after starts_at")

    store_id = body.get("store_id") or None

    row = PriceListEntry(
        company_id=auth.company_id,
        store_id=store_id,
        product_id=product_id,
        price=price,
        starts_at=starts_at,
        ends_at=ends_at,
        name=(body.get("name") or "").strip() or None,
        created_by=auth.user_id,
    )
    session.add(row)
    write_audit(
        session, auth, "price_list_entry_create", "price_list_entry", row.id,
        {"product_id": product_id, "price": price, "starts_at": row.starts_at.isoformat()},
    )
    session.commit()
    session.refresh(row)
    return _price_list_entry_out(row)


def delete_price_list_entry(session: Session, auth: AuthContext, entry_id: str) -> dict:
    row = session.get(PriceListEntry, entry_id)
    if not row or row.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Price list entry not found")
    write_audit(session, auth, "price_list_entry_delete", "price_list_entry", row.id)
    session.delete(row)
    session.commit()
    return {"id": entry_id, "deleted": True}
