"""Cosmetics vertical — profiles, batches, FEFO, testers, quote, returns."""

from __future__ import annotations

import calendar
import json
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import HTTPException
from sqlmodel import Session, func, select

from app.dependencies import AuthContext, write_audit
from app.inventory.constants import SELLABLE_TO_TESTER
from app.inventory.locking import for_update
from app.models.industry import (
    CosmeticsBatch,
    CosmeticsProductProfile,
    CosmeticsSalesLineExtension,
    CosmeticsTesterBalance,
)
from app.models.inventory import StockBalance
from app.models.product import BrandMaster, Product, ProductBarcode, ProductVariant
from app.models.sales import SalesInvoiceLine
from app.rbac import role_has_permission

BATCH_STATUSES = {
    "available",
    "near_expiry",
    "expired",
    "quarantined",
    "recalled",
    "damaged",
    "depleted",
}

SELLABLE_BATCH_STATUSES = {"available", "near_expiry"}

BLOCKED_SALE_STATUSES = {"expired", "quarantined", "recalled", "damaged", "depleted"}

TESTER_STATUSES = {"active", "depleted", "damaged", "disposed"}

RETURN_CONDITIONS = {"unopened", "opened", "damaged", "defective", "expired", "saleable"}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _parse_dt(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return _as_utc(value)
    text = str(value).strip()
    if not text:
        return None
    try:
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        return _as_utc(datetime.fromisoformat(text))
    except ValueError:
        pass

    # Match MM/YYYY or MM-YYYY (e.g. "06/2028", "6/2028")
    m = re.match(r"^(\d{1,2})[/.-](\d{4})$", text)
    if m:
        month, year = int(m.group(1)), int(m.group(2))
        if 1 <= month <= 12:
            last_day = calendar.monthrange(year, month)[1]
            return datetime(year, month, last_day, 23, 59, 59, tzinfo=timezone.utc)

    # Match YYYY/MM or YYYY-MM (e.g. "2028-06")
    m2 = re.match(r"^(\d{4})[/.-](\d{1,2})$", text)
    if m2:
        year, month = int(m2.group(1)), int(m2.group(2))
        if 1 <= month <= 12:
            last_day = calendar.monthrange(year, month)[1]
            return datetime(year, month, last_day, 23, 59, 59, tzinfo=timezone.utc)

    # Match DD/MM/YYYY, MM/DD/YYYY or DD-MM-YYYY
    m3 = re.match(r"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$", text)
    if m3:
        p1, p2, year = int(m3.group(1)), int(m3.group(2)), int(m3.group(3))
        # Prefer DD/MM/YYYY if p2 is valid month (1..12)
        if 1 <= p2 <= 12:
            try:
                return datetime(year, p2, p1, 23, 59, 59, tzinfo=timezone.utc)
            except ValueError:
                pass
        # Fallback to MM/DD/YYYY if p1 is valid month (1..12)
        if 1 <= p1 <= 12:
            try:
                return datetime(year, p1, p2, 23, 59, 59, tzinfo=timezone.utc)
            except ValueError:
                pass

    try:
        return _as_utc(datetime.strptime(text[:10], "%Y-%m-%d"))
    except Exception:
        return None


def _require(auth: AuthContext, code: str) -> None:
    if auth.is_platform_admin or auth.role_code in {"Admin", "Super Admin"}:
        return
    if code in (auth.permissions or set()) or role_has_permission(auth.role_code, code):
        return
    raise HTTPException(status_code=403, detail=f"Missing permission: {code}")


def get_profile(session: Session, company_id: str, product_id: str) -> CosmeticsProductProfile | None:
    return session.exec(
        select(CosmeticsProductProfile).where(
            CosmeticsProductProfile.company_id == company_id,
            CosmeticsProductProfile.product_id == product_id,
        )
    ).first()


def _profile_out(p: CosmeticsProductProfile, product: Product | None = None, brand: BrandMaster | None = None) -> dict[str, Any]:
    return {
        "id": p.id,
        "product_id": p.product_id,
        "sku": product.sku if product else None,
        "product_name": product.name if product else None,
        "brand_id": p.brand_id,
        "brand_code": brand.code if brand else None,
        "brand_name": brand.name if brand else None,
        "product_type": p.product_type,
        "product_category": p.product_category,
        "finish": p.finish,
        "shade_family": p.shade_family,
        "size_value": p.size_value,
        "size_uom": p.size_uom,
        "batch_tracked": p.batch_tracked,
        "expiry_tracked": p.expiry_tracked,
        "tester_allowed": p.tester_allowed,
        "sample_allowed": p.sample_allowed,
        "near_expiry_warning_days": p.near_expiry_warning_days,
        "period_after_opening_months": p.period_after_opening_months,
        "manufacturer_name": p.manufacturer_name,
        "country_of_origin": p.country_of_origin,
        "is_active": p.is_active,
    }


def list_profiles(
    session: Session,
    company_id: str,
    *,
    q: str | None = None,
    product_type: str | None = None,
    brand_id: str | None = None,
) -> list[dict[str, Any]]:
    rows = session.exec(
        select(CosmeticsProductProfile, Product)
        .join(Product, CosmeticsProductProfile.product_id == Product.id)
        .where(CosmeticsProductProfile.company_id == company_id)
        .order_by(Product.sku)
    ).all()
    brands = {
        b.id: b
        for b in session.exec(select(BrandMaster).where(BrandMaster.company_id == company_id)).all()
    }
    out: list[dict[str, Any]] = []
    q_lower = (q or "").strip().lower()
    for profile, product in rows:
        if product_type and (profile.product_type or "").lower() != product_type.lower():
            continue
        if brand_id and profile.brand_id != brand_id:
            continue
        if q_lower:
            brand = brands.get(profile.brand_id) if profile.brand_id else None
            hay = f"{product.sku} {product.name} {profile.product_type or ''} {brand.name if brand else ''}".lower()
            if q_lower not in hay:
                continue
        out.append(_profile_out(profile, product, brands.get(profile.brand_id) if profile.brand_id else None))
    return out


def upsert_profile(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    _require(auth, "cosmetics.profile_manage")
    product_id = body.get("product_id")
    if not product_id:
        raise HTTPException(status_code=400, detail="product_id required")
    product = session.get(Product, product_id)
    if not product or product.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.industry_pack != "cosmetics":
        raise HTTPException(status_code=400, detail="Product is not a cosmetics pack item")

    brand_id = body.get("brand_id")
    brand = None
    if brand_id:
        brand = session.get(BrandMaster, brand_id)
        if not brand or brand.company_id != auth.company_id:
            raise HTTPException(status_code=400, detail="Invalid brand_id")

    row = get_profile(session, auth.company_id, product_id)
    created = row is None
    if not row:
        row = CosmeticsProductProfile(company_id=auth.company_id, product_id=product_id)
        session.add(row)

    for field in (
        "product_type",
        "product_category",
        "finish",
        "shade_family",
        "size_uom",
        "manufacturer_name",
        "country_of_origin",
        "attributes_json",
    ):
        if field in body:
            setattr(row, field, body.get(field))
    if "brand_id" in body:
        row.brand_id = brand_id
    if "size_value" in body:
        row.size_value = float(body["size_value"]) if body["size_value"] is not None else None
    if "batch_tracked" in body:
        row.batch_tracked = bool(body["batch_tracked"])
    if "expiry_tracked" in body:
        row.expiry_tracked = bool(body["expiry_tracked"])
    if "tester_allowed" in body:
        row.tester_allowed = bool(body["tester_allowed"])
    if "sample_allowed" in body:
        row.sample_allowed = bool(body["sample_allowed"])
    if "near_expiry_warning_days" in body and body["near_expiry_warning_days"] is not None:
        row.near_expiry_warning_days = int(body["near_expiry_warning_days"])
    if "period_after_opening_months" in body:
        row.period_after_opening_months = (
            int(body["period_after_opening_months"]) if body["period_after_opening_months"] is not None else None
        )
    if "is_active" in body:
        row.is_active = bool(body["is_active"])
    session.add(row)
    session.flush()
    write_audit(
        session,
        auth,
        "cosmetics.profile.create" if created else "cosmetics.profile.update",
        "cosmetics_product_profile",
        row.id,
        {"product_id": product_id},
    )
    return _profile_out(row, product, brand)


def brand_shelf_summary(session: Session, company_id: str) -> list[dict[str, Any]]:
    profiles = session.exec(
        select(CosmeticsProductProfile).where(CosmeticsProductProfile.company_id == company_id)
    ).all()
    brand_ids = {p.brand_id for p in profiles if p.brand_id}
    brands = {
        b.id: b
        for b in session.exec(select(BrandMaster).where(BrandMaster.company_id == company_id)).all()
        if b.id in brand_ids
    }
    out: list[dict[str, Any]] = []
    for brand_id, brand in brands.items():
        brand_profiles = [p for p in profiles if p.brand_id == brand_id]
        product_ids = [p.product_id for p in brand_profiles]
        near_expiry_count = 0
        out_of_stock_count = 0
        for pid in product_ids:
            batches = session.exec(
                select(CosmeticsBatch).where(
                    CosmeticsBatch.company_id == company_id,
                    CosmeticsBatch.product_id == pid,
                )
            ).all()
            for b in batches:
                refresh_batch_status(b)
                if b.status == "near_expiry" and (b.qty_on_hand or 0) > 0:
                    near_expiry_count += 1
            bal = session.exec(
                select(StockBalance).where(
                    StockBalance.company_id == company_id,
                    StockBalance.product_id == pid,
                )
            ).all()
            total = sum(max(0.0, (r.qty_on_hand or 0) - (r.qty_reserved or 0)) for r in bal)
            if total <= 0:
                out_of_stock_count += 1
        out.append(
            {
                "brand_id": brand.id,
                "code": brand.code,
                "name": brand.name,
                "product_count": len(brand_profiles),
                "near_expiry_count": near_expiry_count,
                "out_of_stock_count": out_of_stock_count,
            }
        )
    out.sort(key=lambda r: r["name"] or "")
    return out


def refresh_batch_status(batch: CosmeticsBatch, warning_days: int = 90) -> None:
    """Update near_expiry / expired / depleted from qty and dates. Does not override quarantine/recall/damage."""
    if batch.status in {"quarantined", "recalled", "damaged"}:
        return
    if (batch.qty_on_hand or 0) <= 0:
        batch.status = "depleted"
        return
    exp = _as_utc(batch.expiry_date)
    if exp:
        now = _utc_now()
        if exp <= now:
            batch.status = "expired"
            return
        days = (exp - now).days
        if days <= warning_days:
            batch.status = "near_expiry"
            return
    if batch.status in {"depleted", "expired", "near_expiry"}:
        batch.status = "available"


def _days_to_expiry(batch: CosmeticsBatch) -> int | None:
    exp = _as_utc(batch.expiry_date)
    if not exp:
        return None
    return (exp - _utc_now()).days


def _batch_out(batch: CosmeticsBatch, product: Product | None = None, profile: CosmeticsProductProfile | None = None) -> dict[str, Any]:
    warn = profile.near_expiry_warning_days if profile else 90
    refresh_batch_status(batch, warn)
    days = _days_to_expiry(batch)
    return {
        "id": batch.id,
        "product_id": batch.product_id,
        "sku": product.sku if product else None,
        "product_name": product.name if product else None,
        "variant_id": batch.variant_id,
        "store_id": batch.store_id,
        "supplier_id": batch.supplier_id,
        "batch_no": batch.batch_no,
        "lot_no": batch.lot_no,
        "manufacture_date": batch.manufacture_date.isoformat() if batch.manufacture_date else None,
        "expiry_date": batch.expiry_date.isoformat() if batch.expiry_date else None,
        "received_date": batch.received_date.isoformat() if batch.received_date else None,
        "qty_on_hand": batch.qty_on_hand or 0,
        "status": batch.status,
        "days_to_expiry": days,
        "near_expiry_warning": bool(days is not None and days <= warn and days >= 0),
    }


def reconcile_cosmetics_batches(
    session: Session,
    company_id: str,
    product_id: str,
    store_id: str | None = None,
) -> None:
    """Reconcile product-level CosmeticsBatch quantities with StockBalance and merge duplicate batch_no rows."""
    product = session.get(Product, product_id)
    if not product or product.company_id != company_id or product.industry_pack != "cosmetics":
        return
    profile = get_profile(session, company_id, product_id)
    if profile and profile.batch_tracked is False:
        return

    all_batches = list(
        session.exec(
            select(CosmeticsBatch).where(
                CosmeticsBatch.company_id == company_id,
                CosmeticsBatch.product_id == product_id,
            )
        ).all()
    )
    if any(b.variant_id is not None for b in all_batches):
        return

    warn = profile.near_expiry_warning_days if profile else 90

    # 1. Merge duplicate rows sharing the same batch_no (case-insensitive)
    by_bno: dict[str, list[CosmeticsBatch]] = {}
    for b in all_batches:
        if "-NS-" in (b.batch_no or ""):
            continue
        key = (b.batch_no or "").strip().lower()
        if not key:
            continue
        by_bno.setdefault(key, []).append(b)

    primary_batches: list[CosmeticsBatch] = []
    for key, group in by_bno.items():
        primary = group[0]
        if len(group) > 1:
            combined_qty = sum(max(0.0, float(g.qty_on_hand or 0)) for g in group)
            for dup in group[1:]:
                if not primary.store_id and dup.store_id:
                    primary.store_id = dup.store_id
                dup.qty_on_hand = 0.0
                dup.status = "depleted"
                session.add(dup)
            primary.qty_on_hand = combined_qty
            refresh_batch_status(primary, warn)
            session.add(primary)
        primary_batches.append(primary)

    # 2. Check authoritative StockBalance for this product
    bal_stmt = select(StockBalance).where(
        StockBalance.company_id == company_id,
        StockBalance.product_id == product_id,
    )
    if store_id:
        bal_stmt = bal_stmt.where(StockBalance.store_id == store_id)
    bals = list(session.exec(bal_stmt).all())
    total_stock = sum(max(0.0, float(b.qty_on_hand or 0) - float(b.qty_reserved or 0)) for b in bals)
    total_on_hand = sum(max(0.0, float(b.qty_on_hand or 0)) for b in bals)
    if total_on_hand <= 0:
        all_bals = list(
            session.exec(
                select(StockBalance).where(
                    StockBalance.company_id == company_id,
                    StockBalance.product_id == product_id,
                )
            ).all()
        )
        total_stock = sum(max(0.0, float(b.qty_on_hand or 0) - float(b.qty_reserved or 0)) for b in all_bals)
        total_on_hand = sum(max(0.0, float(b.qty_on_hand or 0)) for b in all_bals)

    target_stock = max(total_stock, total_on_hand)
    if target_stock <= 0 or not primary_batches:
        session.flush()
        return

    for b in primary_batches:
        refresh_batch_status(b, warn)

    active_batches = [b for b in primary_batches if b.status != "expired"]
    total_batch_qty = sum(max(0.0, float(b.qty_on_hand or 0)) for b in active_batches)

    # If duplicate batch merge caused a single batch to exceed StockBalance (e.g. 1.0 meta + 4.0 opening = 5.0 vs 4.0)
    if len(active_batches) == 1 and total_batch_qty > target_stock and active_batches[0].status in SELLABLE_BATCH_STATUSES:
        active_batches[0].qty_on_hand = target_stock
        refresh_batch_status(active_batches[0], warn)
        session.add(active_batches[0])
        session.flush()
        return

    if target_stock > total_batch_qty:
        shortfall = target_stock - total_batch_qty
        sellable = [b for b in active_batches if b.status in SELLABLE_BATCH_STATUSES]
        if sellable:
            sellable.sort(key=lambda b: (_as_utc(b.expiry_date) or datetime.max.replace(tzinfo=timezone.utc), b.batch_no or ""))
            target_b = sellable[0]
            target_b.qty_on_hand = (target_b.qty_on_hand or 0.0) + shortfall
            refresh_batch_status(target_b, warn)
            session.add(target_b)
        else:
            now = _utc_now()
            revivable = [
                b for b in active_batches
                if b.status == "depleted" and (not b.expiry_date or _as_utc(b.expiry_date) > now)
            ]
            if revivable:
                target_b = revivable[0]
                target_b.qty_on_hand = (target_b.qty_on_hand or 0.0) + shortfall
                target_b.status = "available"
                refresh_batch_status(target_b, warn)
                session.add(target_b)

    session.flush()


def ensure_stock_batch(
    session: Session,
    company_id: str,
    product_id: str,
    store_id: str | None = None,
    variant_id: str | None = None,
) -> CosmeticsBatch | None:
    product = session.get(Product, product_id)
    if not product or product.company_id != company_id or product.industry_pack != "cosmetics":
        return None
    profile = get_profile(session, company_id, product_id)
    if profile and profile.batch_tracked is False:
        return None

    if not variant_id:
        reconcile_cosmetics_batches(session, company_id, product_id, store_id)

    p_meta: dict[str, Any] = {}
    if product.meta_json:
        try:
            p_meta = json.loads(product.meta_json)
        except Exception:
            p_meta = {}

    meta_exp = _parse_dt(p_meta.get("expiry_date"))

    existing = session.exec(
        select(CosmeticsBatch).where(
            CosmeticsBatch.company_id == company_id,
            CosmeticsBatch.product_id == product_id,
            CosmeticsBatch.qty_on_hand > 0,
        )
    ).first()
    if existing:
        if meta_exp and existing.expiry_date != meta_exp:
            existing.expiry_date = meta_exp
            refresh_batch_status(existing, 90)
            session.add(existing)
            session.flush()
        return existing

    bal_stmt = select(StockBalance).where(
        StockBalance.company_id == company_id,
        StockBalance.product_id == product_id,
    )
    if store_id:
        bal_stmt = bal_stmt.where(StockBalance.store_id == store_id)
    bals = session.exec(bal_stmt).all()
    total_qty = sum(max(0.0, float(b.qty_on_hand or 0) - float(b.qty_reserved or 0)) for b in bals)
    if total_qty <= 0:
        all_bals = session.exec(
            select(StockBalance).where(
                StockBalance.company_id == company_id,
                StockBalance.product_id == product_id,
            )
        ).all()
        total_qty = sum(max(0.0, float(b.qty_on_hand or 0) - float(b.qty_reserved or 0)) for b in all_bals)

    batch_qty = max(1.0, total_qty)

    zero_batch = session.exec(
        select(CosmeticsBatch).where(
            CosmeticsBatch.company_id == company_id,
            CosmeticsBatch.product_id == product_id,
            CosmeticsBatch.status.in_(["available", "depleted"]),
        )
    ).first()
    if zero_batch:
        zero_batch.qty_on_hand = batch_qty
        zero_batch.status = "available"
        if not zero_batch.expiry_date or _as_utc(zero_batch.expiry_date) <= _utc_now():
            zero_batch.expiry_date = _utc_now() + timedelta(days=365)
        session.add(zero_batch)
        session.flush()
        return zero_batch

    clean_sku = (product.sku or "COS").replace(" ", "-").upper()
    batch_no = p_meta.get("batch_no") or f"BATCH-{clean_sku}-01"
    now = _utc_now()
    batch = CosmeticsBatch(
        company_id=company_id,
        product_id=product_id,
        variant_id=variant_id,
        store_id=store_id,
        batch_no=batch_no,
        lot_no="INITIAL",
        manufacture_date=now - timedelta(days=30),
        expiry_date=meta_exp or (now + timedelta(days=365)),
        received_date=now,
        qty_on_hand=batch_qty,
        status="available",
    )
    session.add(batch)
    session.flush()
    return batch


def create_batch(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    product_id = body.get("product_id")
    if not product_id:
        raise HTTPException(status_code=400, detail="product_id is required")
    product = session.get(Product, product_id)
    if not product or product.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Product not found")
    batch_no = (body.get("batch_no") or "").strip()
    if not batch_no:
        raise HTTPException(status_code=400, detail="batch_no is required")
    exp = _parse_dt(body.get("expiry_date")) or (_utc_now() + timedelta(days=365))
    mfg = _parse_dt(body.get("manufacture_date"))
    qty = float(body.get("qty_on_hand") or body.get("qty") or 1.0)
    store_id = body.get("store_id") or auth.store_id
    variant_id = body.get("variant_id")
    lot_no = body.get("lot_no")

    existing_batch = session.exec(
        select(CosmeticsBatch).where(
            CosmeticsBatch.company_id == auth.company_id,
            CosmeticsBatch.product_id == product_id,
            func.lower(CosmeticsBatch.batch_no) == batch_no.lower(),
        )
    ).first()
    target_batch: CosmeticsBatch
    if existing_batch:
        if exp:
            existing_batch.expiry_date = exp
        if mfg:
            existing_batch.manufacture_date = mfg
        if lot_no:
            existing_batch.lot_no = lot_no
        if store_id and not existing_batch.store_id:
            existing_batch.store_id = store_id
        existing_batch.qty_on_hand = (existing_batch.qty_on_hand or 0.0) + qty
        refresh_batch_status(existing_batch, 90)
        session.add(existing_batch)
        session.flush()
        target_batch = existing_batch
    else:
        batch = CosmeticsBatch(
            company_id=auth.company_id,
            product_id=product_id,
            variant_id=variant_id,
            store_id=store_id,
            batch_no=batch_no,
            lot_no=lot_no,
            manufacture_date=mfg,
            expiry_date=exp,
            received_date=_utc_now(),
            qty_on_hand=qty,
            status="available",
        )
        session.add(batch)
        session.flush()
        target_batch = batch

    # Ensure StockBalance covers the sellable batch stock so POS sales do not fail on StockBalance
    bal_stmt = select(StockBalance).where(
        StockBalance.company_id == auth.company_id,
        StockBalance.product_id == product_id,
    )
    if store_id:
        bal_stmt = bal_stmt.where(StockBalance.store_id == store_id)
    bals = list(session.exec(bal_stmt).all())
    curr_stock = sum(max(0.0, float(b.qty_on_hand or 0)) for b in bals)
    all_batches = list(
        session.exec(
            select(CosmeticsBatch).where(
                CosmeticsBatch.company_id == auth.company_id,
                CosmeticsBatch.product_id == product_id,
            )
        ).all()
    )
    total_batch_qty = sum(
        max(0.0, float(b.qty_on_hand or 0))
        for b in all_batches
        if "-NS-" not in (b.batch_no or "") and b.status not in BLOCKED_SALE_STATUSES
    )
    if total_batch_qty > curr_stock:
        from app.inventory.constants import ADJUSTMENT_PLUS
        from app.services.inventory_service import record_stock_movement

        record_stock_movement(
            session,
            company_id=auth.company_id,
            product_id=product_id,
            store_id=store_id,
            warehouse_id=None,
            in_qty=total_batch_qty - curr_stock,
            transaction_type=ADJUSTMENT_PLUS,
            note=f"Batch stock registered ({batch_no})",
            created_by=auth.user_id,
        )

    profile = get_profile(session, auth.company_id, product_id)
    return _batch_out(target_batch, product, profile)


def list_batches(
    session: Session,
    company_id: str,
    *,
    brand_id: str | None = None,
    product_id: str | None = None,
    product_type: str | None = None,
    variant_id: str | None = None,
    store_id: str | None = None,
    status: str | None = None,
    near_days: int | None = None,
) -> list[dict[str, Any]]:
    if product_id and not variant_id:
        reconcile_cosmetics_batches(session, company_id, product_id, store_id)
    stmt = select(CosmeticsBatch).where(CosmeticsBatch.company_id == company_id)
    if product_id:
        stmt = stmt.where(CosmeticsBatch.product_id == product_id)
    if variant_id:
        stmt = stmt.where(CosmeticsBatch.variant_id == variant_id)
    if store_id:
        stmt = stmt.where((CosmeticsBatch.store_id == store_id) | (CosmeticsBatch.store_id == None))
    rows = list(session.exec(stmt).all())
    if not rows and product_id and store_id:
        stmt2 = select(CosmeticsBatch).where(
            CosmeticsBatch.company_id == company_id,
            CosmeticsBatch.product_id == product_id,
        )
        if variant_id:
            stmt2 = stmt2.where(CosmeticsBatch.variant_id == variant_id)
        rows = list(session.exec(stmt2).all())
    if not rows and product_id:
        auto_b = ensure_stock_batch(session, company_id, product_id, store_id, variant_id)
        if auto_b:
            rows = [auto_b]
    products = {
        p.id: p
        for p in session.exec(select(Product).where(Product.company_id == company_id, Product.industry_pack == "cosmetics")).all()
    }
    profiles = {
        p.product_id: p
        for p in session.exec(
            select(CosmeticsProductProfile).where(CosmeticsProductProfile.company_id == company_id)
        ).all()
    }
    out: list[dict[str, Any]] = []
    for batch in rows:
        profile = profiles.get(batch.product_id)
        if brand_id and (not profile or profile.brand_id != brand_id):
            continue
        if product_type and (not profile or (profile.product_type or "").lower() != product_type.lower()):
            continue
        warn = profile.near_expiry_warning_days if profile else 90
        refresh_batch_status(batch, warn)
        if status:
            st = status.replace("-", "_").lower()
            if st in {"available", "sellable"}:
                if batch.status not in SELLABLE_BATCH_STATUSES:
                    continue
            elif st in {"near_expiry", "near expiry"}:
                if batch.status != "near_expiry":
                    continue
            elif batch.status != st:
                continue
        days = _days_to_expiry(batch)
        if near_days is not None:
            if days is None or days < 0 or days > near_days:
                continue
        out.append(_batch_out(batch, products.get(batch.product_id), profile))

    # Deduplicate by product_id and batch_no (case-insensitive) to prevent duplicates in POS dropdown
    deduped: list[dict[str, Any]] = []
    seen_batches: set[str] = set()
    for item in out:
        pid = str(item.get("product_id") or "")
        bno = str(item.get("batch_no") or "").strip().lower()
        key = f"{pid}::{bno}"
        if key in seen_batches and bno:
            for existing_item in deduped:
                if f"{existing_item.get('product_id')}::{str(existing_item.get('batch_no') or '').strip().lower()}" == key:
                    existing_item["qty_on_hand"] = (existing_item.get("qty_on_hand") or 0) + (item.get("qty_on_hand") or 0)
                    existing_item["sellable_qty"] = (existing_item.get("sellable_qty") or 0) + (item.get("sellable_qty") or 0)
                    break
            continue
        seen_batches.add(key)
        deduped.append(item)

    deduped.sort(key=lambda r: (r.get("expiry_date") or "9999", r.get("batch_no") or ""))
    return deduped


def _ensure_batch_matches_variant(batch: CosmeticsBatch, variant_id: str | None) -> None:
    """Shade-specific sales must use a batch for that variant — never product-level aggregates."""
    if not variant_id:
        return
    if batch.variant_id != variant_id:
        raise ValueError("Batch does not match selected shade/variant")


def variant_sellable_qty(
    session: Session,
    company_id: str,
    product_id: str,
    *,
    variant_id: str,
    store_id: str | None = None,
) -> float:
    """Sum qty across sellable CosmeticsBatch rows for a shade (not StockBalance)."""
    stmt = select(CosmeticsBatch).where(
        CosmeticsBatch.company_id == company_id,
        CosmeticsBatch.product_id == product_id,
        CosmeticsBatch.variant_id == variant_id,
        CosmeticsBatch.qty_on_hand > 0,
    )
    if store_id:
        stmt = stmt.where((CosmeticsBatch.store_id == store_id) | (CosmeticsBatch.store_id == None))
    profile = get_profile(session, company_id, product_id)
    warn = profile.near_expiry_warning_days if profile else 90
    total = 0.0
    for b in session.exec(stmt).all():
        refresh_batch_status(b, warn)
        if b.status in SELLABLE_BATCH_STATUSES:
            total += b.qty_on_hand or 0
    return total


def get_fefo_batch(
    session: Session,
    company_id: str,
    product_id: str,
    *,
    variant_id: str | None = None,
    store_id: str | None = None,
) -> CosmeticsBatch | None:
    if not variant_id:
        reconcile_cosmetics_batches(session, company_id, product_id, store_id)
    stmt = select(CosmeticsBatch).where(
        CosmeticsBatch.company_id == company_id,
        CosmeticsBatch.product_id == product_id,
        CosmeticsBatch.qty_on_hand > 0,
    )
    if variant_id:
        stmt = stmt.where(CosmeticsBatch.variant_id == variant_id)
    if store_id:
        stmt = stmt.where((CosmeticsBatch.store_id == store_id) | (CosmeticsBatch.store_id == None))
    rows = list(session.exec(stmt).all())
    if not rows and store_id:
        stmt2 = select(CosmeticsBatch).where(
            CosmeticsBatch.company_id == company_id,
            CosmeticsBatch.product_id == product_id,
            CosmeticsBatch.qty_on_hand > 0,
        )
        if variant_id:
            stmt2 = stmt2.where(CosmeticsBatch.variant_id == variant_id)
        rows = list(session.exec(stmt2).all())
    if not rows:
        auto_b = ensure_stock_batch(session, company_id, product_id, store_id, variant_id)
        if auto_b:
            rows = [auto_b]
    profile = get_profile(session, company_id, product_id)
    warn = profile.near_expiry_warning_days if profile else 90
    candidates: list[CosmeticsBatch] = []
    for b in rows:
        refresh_batch_status(b, warn)
        if b.status in BLOCKED_SALE_STATUSES:
            continue
        if b.status not in SELLABLE_BATCH_STATUSES:
            continue
        candidates.append(b)
    if not candidates:
        return None
    candidates.sort(key=lambda b: (_as_utc(b.expiry_date) or datetime.max.replace(tzinfo=timezone.utc), b.batch_no or ""))
    return candidates[0]


def quarantine_batch(session: Session, auth: AuthContext, batch_id: str, body: dict[str, Any]) -> dict[str, Any]:
    _require(auth, "cosmetics.quarantine")
    batch = session.get(CosmeticsBatch, batch_id)
    if not batch or batch.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Batch not found")
    batch.status = "quarantined"
    session.add(batch)
    write_audit(
        session,
        auth,
        "cosmetics.quarantine",
        "cosmetics_batch",
        batch.id,
        {"batch_no": batch.batch_no, "reason": body.get("reason")},
    )
    product = session.get(Product, batch.product_id)
    profile = get_profile(session, auth.company_id, batch.product_id)
    return _batch_out(batch, product, profile)


def sync_batch_qty(session: Session, company_id: str, *, batch_id: str, qty_delta: float) -> None:
    batch = session.exec(
        for_update(session, select(CosmeticsBatch).where(CosmeticsBatch.id == batch_id))
    ).first()
    if not batch or batch.company_id != company_id:
        return
    profile = get_profile(session, company_id, batch.product_id)
    warn = profile.near_expiry_warning_days if profile else 90
    new_qty = (batch.qty_on_hand or 0) + qty_delta
    if qty_delta < 0 and new_qty < -0.0001:
        # Check if sibling sellable batches for the same product & variant can cover the remainder
        need_more = abs(new_qty)
        sibling_stmt = select(CosmeticsBatch).where(
            CosmeticsBatch.company_id == company_id,
            CosmeticsBatch.product_id == batch.product_id,
            CosmeticsBatch.id != batch.id,
            CosmeticsBatch.qty_on_hand > 0,
        )
        if batch.variant_id:
            sibling_stmt = sibling_stmt.where(CosmeticsBatch.variant_id == batch.variant_id)
        else:
            sibling_stmt = sibling_stmt.where(CosmeticsBatch.variant_id == None)  # noqa: E711
        siblings = list(session.exec(for_update(session, sibling_stmt)).all())
        sellable_siblings: list[CosmeticsBatch] = []
        for sib in siblings:
            refresh_batch_status(sib, warn)
            if sib.status in SELLABLE_BATCH_STATUSES:
                sellable_siblings.append(sib)
        sellable_siblings.sort(
            key=lambda b: (
                (b.batch_no or "").strip().lower() != (batch.batch_no or "").strip().lower(),
                _as_utc(b.expiry_date) or datetime.max.replace(tzinfo=timezone.utc),
            )
        )
        for sib in sellable_siblings:
            if need_more <= 0.0001:
                break
            take_sib = min(need_more, float(sib.qty_on_hand or 0))
            if take_sib > 0:
                sib.qty_on_hand = max(0.0, float(sib.qty_on_hand or 0) - take_sib)
                need_more -= take_sib
                refresh_batch_status(sib, warn)
                session.add(sib)

        if need_more > 0.0001 and batch.variant_id:
            raise ValueError(
                f"Insufficient cosmetics batch stock for {batch.batch_no}: "
                f"have {batch.qty_on_hand or 0}, need {abs(qty_delta)}"
            )
        new_qty = 0.0

    batch.qty_on_hand = max(0.0, new_qty)
    if batch.status not in {"quarantined", "recalled", "damaged"}:
        refresh_batch_status(batch, warn)
    session.add(batch)


def receive_batch_for_line(
    session: Session,
    *,
    company_id: str,
    product: Product,
    qty: float,
    store_id: str | None,
    variant_id: str | None,
    purchase_id: str | None,
    receive_id: str | None,
    supplier_id: str | None,
    batch_no: str | None = None,
    lot_no: str | None = None,
    expiry_date: Any = None,
    manufacture_date: Any = None,
) -> str | None:
    """Create/find CosmeticsBatch at qty_on_hand=0; inventory movement syncs qty (no double-count)."""
    profile = get_profile(session, company_id, product.id)
    batch_tracked = profile.batch_tracked if profile else True
    expiry_tracked = profile.expiry_tracked if profile else True
    if not batch_tracked:
        return None
    bno = (batch_no or "").strip()
    if not bno:
        clean_sku = (product.sku or "COS").replace(" ", "-").upper()
        bno = f"BATCH-{clean_sku}-01"
    exp = _parse_dt(expiry_date)
    if not exp and product.meta_json:
        try:
            p_meta = json.loads(product.meta_json)
            exp = _parse_dt(p_meta.get("expiry_date"))
        except Exception:
            pass
    if not exp:
        exp = _utc_now() + timedelta(days=365)
    mfg = _parse_dt(manufacture_date)
    if mfg and exp and exp <= mfg:
        raise HTTPException(status_code=400, detail="Expiry date must be after manufacture date")

    stmt = select(CosmeticsBatch).where(
        CosmeticsBatch.company_id == company_id,
        CosmeticsBatch.product_id == product.id,
        func.lower(CosmeticsBatch.batch_no) == bno.lower(),
    )
    if store_id:
        stmt = stmt.where((CosmeticsBatch.store_id == store_id) | (CosmeticsBatch.store_id == None))  # noqa: E711
    if variant_id:
        stmt = stmt.where(CosmeticsBatch.variant_id == variant_id)
    existing = session.exec(stmt).first()
    if existing:
        if store_id and not existing.store_id:
            existing.store_id = store_id
        if exp:
            existing.expiry_date = exp
        if mfg:
            existing.manufacture_date = mfg
        session.add(existing)
        session.flush()
        return existing.id

    batch = CosmeticsBatch(
        company_id=company_id,
        product_id=product.id,
        variant_id=variant_id,
        store_id=store_id,
        supplier_id=supplier_id,
        batch_no=bno,
        lot_no=(lot_no or "").strip() or None,
        manufacture_date=mfg,
        expiry_date=exp,
        received_date=_utc_now(),
        purchase_id=purchase_id,
        receive_id=receive_id,
        qty_on_hand=0.0,
        status="available",
    )
    session.add(batch)
    session.flush()
    return batch.id


def quote(
    session: Session,
    auth: AuthContext,
    body: dict[str, Any],
) -> dict[str, Any]:
    product_id = body.get("product_id")
    if not product_id:
        raise HTTPException(status_code=400, detail="product_id required")
    product = session.get(Product, product_id)
    if not product or product.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.industry_pack != "cosmetics":
        raise HTTPException(status_code=400, detail="Product is not a cosmetics pack item")

    qty = float(body.get("qty") or body.get("entered_qty") or 1)
    if qty <= 0:
        raise HTTPException(status_code=400, detail="qty must be positive")
    variant_id = body.get("variant_id") or None
    store_id = body.get("store_id") or None
    batch_id = body.get("batch_id") or None
    profile = get_profile(session, auth.company_id, product_id)
    batch: CosmeticsBatch | None = None
    fefo_applied = False

    if not variant_id:
        reconcile_cosmetics_batches(session, auth.company_id, product_id, store_id)

    if profile and profile.batch_tracked:
        if variant_id and not batch_id:
            avail = variant_sellable_qty(
                session, auth.company_id, product_id, variant_id=variant_id, store_id=store_id
            )
            if avail < qty:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"No sellable stock for selected shade/variant "
                        f"(variant batch qty {avail}, need {qty}; product-level stock is not used)"
                    ),
                )
        if batch_id:
            batch = session.get(CosmeticsBatch, batch_id)
            if not batch and not variant_id:
                batch = get_fefo_batch(session, auth.company_id, product_id, variant_id=variant_id, store_id=store_id)
                fefo_applied = batch is not None
            if not batch or batch.company_id != auth.company_id or batch.product_id != product_id:
                raise HTTPException(status_code=400, detail="Invalid batch for cosmetics quote")
        else:
            batch = get_fefo_batch(session, auth.company_id, product_id, variant_id=variant_id, store_id=store_id)
            fefo_applied = batch is not None
            if not batch:
                raise HTTPException(status_code=400, detail="No sellable FEFO batch available")
        warn = profile.near_expiry_warning_days if profile else 90
        refresh_batch_status(batch, warn)
        if batch.status in BLOCKED_SALE_STATUSES:
            raise HTTPException(status_code=400, detail=f"Batch status '{batch.status}' cannot be sold")
        try:
            _ensure_batch_matches_variant(batch, variant_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if (batch.qty_on_hand or 0) < qty:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient batch qty: have {batch.qty_on_hand or 0}, need {qty}",
            )

    shade = None
    size = None
    if variant_id:
        variant = session.get(ProductVariant, variant_id)
        if variant and variant.company_id == auth.company_id:
            shade = variant.color or variant.variant_code
            size = variant.size
    if profile and not size and profile.size_value is not None:
        size = f"{profile.size_value}{profile.size_uom or ''}"

    unit_price = float(product.base_price or 0)
    days = _days_to_expiry(batch) if batch else None
    warn_days = profile.near_expiry_warning_days if profile else 90
    near_expiry_warning = bool(batch and days is not None and 0 <= days <= warn_days)

    return {
        "product_id": product.id,
        "sku": product.sku,
        "name": product.name,
        "qty": qty,
        "unit_price": unit_price,
        "line_total": round(unit_price * qty, 2),
        "price_source": "STANDARD",
        "variant_id": variant_id,
        "batch_id": batch.id if batch else None,
        "batch_no": batch.batch_no if batch else None,
        "expiry_date": batch.expiry_date.isoformat() if batch and batch.expiry_date else None,
        "batch_status": batch.status if batch else None,
        "days_to_expiry": days,
        "near_expiry_warning": near_expiry_warning,
        "fefo_applied": fefo_applied,
        "shade": shade,
        "size": size,
    }


def validate_cosmetics_sale_lines(session: Session, auth: AuthContext, lines: list) -> None:
    for line in lines:
        meta = getattr(line, "meta", None) or {}
        if not isinstance(meta, dict):
            meta = {}
        product_id = getattr(line, "product_id", None) or meta.get("product_id")
        product = session.get(Product, product_id) if product_id else None
        if not product or product.industry_pack != "cosmetics":
            continue
        profile = get_profile(session, auth.company_id, product.id)
        batch_id = meta.get("batch_id") or None
        variant_id = meta.get("variant_id") or None
        store_id = meta.get("store_id") or auth.store_id
        if not variant_id:
            reconcile_cosmetics_batches(session, auth.company_id, product.id, store_id)
        if not profile or not profile.batch_tracked:
            if batch_id:
                b_obj = session.get(CosmeticsBatch, batch_id)
                if not b_obj and not variant_id:
                    b_obj = get_fefo_batch(session, auth.company_id, product.id, variant_id=variant_id, store_id=store_id)
                    if b_obj:
                        meta["batch_id"] = b_obj.id
                        meta["batch_no"] = b_obj.batch_no
                        if hasattr(line, "meta"):
                            line.meta = meta
            continue
        qty = float(getattr(line, "qty", None) or meta.get("qty") or 0)
        if variant_id and not batch_id:
            avail = variant_sellable_qty(
                session, auth.company_id, product.id, variant_id=variant_id, store_id=store_id
            )
            if avail < qty:
                raise ValueError(
                    f"No sellable stock for selected shade/variant on {product.sku} "
                    f"(variant batch qty {avail}, need {qty}; product-level stock is not used)"
                )
        if not batch_id:
            batch = get_fefo_batch(session, auth.company_id, product.id, variant_id=variant_id, store_id=store_id)
            if not batch:
                batch = ensure_stock_batch(session, auth.company_id, product.id, store_id, variant_id)
            if not batch:
                raise ValueError(f"No sellable FEFO batch for {product.sku}")
            # mutate meta so sale posts against FEFO batch
            meta["batch_id"] = batch.id
            meta["batch_no"] = batch.batch_no
            meta["fefo"] = True
            if hasattr(line, "meta"):
                line.meta = meta
            batch_id = batch.id
        batch = session.get(CosmeticsBatch, batch_id)
        if not batch and not variant_id:
            batch = get_fefo_batch(session, auth.company_id, product.id, variant_id=variant_id, store_id=store_id)
            if not batch:
                batch = ensure_stock_batch(session, auth.company_id, product.id, store_id, variant_id)
            if batch:
                meta["batch_id"] = batch.id
                meta["batch_no"] = batch.batch_no
                if hasattr(line, "meta"):
                    line.meta = meta
                batch_id = batch.id
        if not batch or batch.company_id != auth.company_id or batch.product_id != product.id:
            raise ValueError("Invalid batch for cosmetics sale")
        _ensure_batch_matches_variant(batch, variant_id)
        warn = profile.near_expiry_warning_days
        refresh_batch_status(batch, warn)
        if batch.status == "expired":
            raise ValueError("Cannot sell expired cosmetics batch")
        if batch.status in BLOCKED_SALE_STATUSES:
            raise ValueError(f"Cannot sell cosmetics batch with status '{batch.status}'")
        if (batch.qty_on_hand or 0) < qty:
            raise ValueError(
                f"Insufficient cosmetics batch stock for {batch.batch_no}: "
                f"have {batch.qty_on_hand or 0}, need {qty}"
            )


def save_cosmetics_line_extension(session: Session, line_id: str, meta: dict[str, Any]) -> None:
    exp = meta.get("expiry_date") or meta.get("expiry")
    exp_dt = _parse_dt(exp) if exp else None
    session.add(
        CosmeticsSalesLineExtension(
            line_id=line_id,
            variant_id=meta.get("variant_id"),
            batch_id=meta.get("batch_id"),
            batch_no=str(meta.get("batch_no") or meta.get("batch") or "") or None,
            expiry_date=exp_dt,
            shade=str(meta.get("shade") or "") or None,
            size=str(meta.get("size") or "") or None,
            price_source=str(meta.get("price_source") or "STANDARD"),
        )
    )


def resolve_barcode(session: Session, company_id: str, code: str) -> dict[str, Any]:
    code = (code or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="code required")
    bc = session.exec(
        select(ProductBarcode).where(
            ProductBarcode.company_id == company_id,
            ProductBarcode.barcode == code,
            ProductBarcode.is_active == True,  # noqa: E712
        )
    ).first()
    product = None
    variant_id = None
    if bc:
        product = session.get(Product, bc.product_id)
        variant_id = bc.variant_id
    if not product:
        product = session.exec(
            select(Product).where(
                Product.company_id == company_id,
                Product.barcode == code,
                Product.industry_pack == "cosmetics",
            )
        ).first()
    if not product or product.industry_pack != "cosmetics":
        # variant barcode
        variant = session.exec(
            select(ProductVariant).where(
                ProductVariant.company_id == company_id,
                ProductVariant.barcode == code,
            )
        ).first()
        if variant:
            product = session.get(Product, variant.product_id)
            variant_id = variant.id
    if not product or product.company_id != company_id or product.industry_pack != "cosmetics":
        raise HTTPException(status_code=404, detail="Barcode not found for cosmetics product")
    if not product.is_active:
        raise HTTPException(
            status_code=400,
            detail="Product is deactivated in Product Master. Please activate it from Product Master to sell in POS."
        )
    profile = get_profile(session, company_id, product.id)
    variant = session.get(ProductVariant, variant_id) if variant_id else None

    from app.models.inventory import StockBalance
    bal = session.exec(
        select(StockBalance).where(
            StockBalance.company_id == company_id,
            StockBalance.product_id == product.id,
        )
    ).all()
    total_stock = sum(max(0.0, float(b.qty_on_hand or 0)) for b in bal)

    return {
        "product_id": product.id,
        "sku": product.sku,
        "name": product.name,
        "barcode": code,
        "variant_id": variant_id,
        "shade": variant.color if variant else None,
        "size": variant.size if variant else (f"{profile.size_value}{profile.size_uom or ''}" if profile and profile.size_value else None),
        "base_price": product.base_price,
        "stock": total_stock,
        "is_active": product.is_active,
        "batch_tracked": profile.batch_tracked if profile else True,
        "profile": _profile_out(profile, product) if profile else None,
    }


def convert_to_tester(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    _require(auth, "cosmetics.tester_manage")
    product_id = body.get("product_id")
    qty = float(body.get("qty") or 0)
    store_id = body.get("store_id")
    reason = (body.get("reason") or "").strip()
    if not product_id or qty <= 0:
        raise HTTPException(status_code=400, detail="product_id and positive qty required")
    if not reason:
        raise HTTPException(status_code=400, detail="reason required for tester conversion")
    product = session.get(Product, product_id)
    if not product or product.company_id != auth.company_id or product.industry_pack != "cosmetics":
        raise HTTPException(status_code=404, detail="Cosmetics product not found")
    profile = get_profile(session, auth.company_id, product_id)
    if profile and not profile.tester_allowed:
        raise HTTPException(status_code=400, detail="Tester conversion not allowed for this product")

    variant_id = body.get("variant_id")
    batch_id = body.get("batch_id")
    if not batch_id and profile and profile.batch_tracked:
        batch = get_fefo_batch(session, auth.company_id, product_id, variant_id=variant_id, store_id=store_id)
        if not batch:
            raise HTTPException(status_code=400, detail="No sellable batch for tester conversion")
        batch_id = batch.id

    from app.services.inventory_service import record_stock_movement

    record_stock_movement(
        session,
        company_id=auth.company_id,
        product_id=product_id,
        store_id=store_id,
        warehouse_id=None,
        out_qty=qty,
        transaction_type=SELLABLE_TO_TESTER,
        transaction_ref="TESTER",
        note=reason,
        created_by=auth.user_id,
        variant_id=variant_id,
        batch_id=batch_id,
    )

    tester = CosmeticsTesterBalance(
        company_id=auth.company_id,
        product_id=product_id,
        variant_id=variant_id,
        store_id=store_id,
        batch_id=batch_id,
        qty=qty,
        status="active",
        reason=reason,
        converted_by=auth.user_id or auth.email,
        converted_at=_utc_now(),
    )
    session.add(tester)
    session.flush()
    write_audit(
        session,
        auth,
        "cosmetics.tester_convert",
        "cosmetics_tester_balance",
        tester.id,
        {"product_id": product_id, "qty": qty, "batch_id": batch_id, "reason": reason},
    )
    return _tester_out(tester, product)


def _tester_out(t: CosmeticsTesterBalance, product: Product | None = None) -> dict[str, Any]:
    return {
        "id": t.id,
        "product_id": t.product_id,
        "sku": product.sku if product else None,
        "product_name": product.name if product else None,
        "variant_id": t.variant_id,
        "store_id": t.store_id,
        "batch_id": t.batch_id,
        "qty": t.qty,
        "status": t.status,
        "reason": t.reason,
        "converted_by": t.converted_by,
        "converted_at": t.converted_at.isoformat() if t.converted_at else None,
    }


def list_testers(
    session: Session,
    company_id: str,
    *,
    product_id: str | None = None,
    store_id: str | None = None,
    status: str | None = None,
) -> list[dict[str, Any]]:
    stmt = select(CosmeticsTesterBalance).where(CosmeticsTesterBalance.company_id == company_id)
    if product_id:
        stmt = stmt.where(CosmeticsTesterBalance.product_id == product_id)
    if store_id:
        stmt = stmt.where(CosmeticsTesterBalance.store_id == store_id)
    if status:
        stmt = stmt.where(CosmeticsTesterBalance.status == status)
    rows = session.exec(stmt).all()
    products = {p.id: p for p in session.exec(select(Product).where(Product.company_id == company_id)).all()}
    return [_tester_out(t, products.get(t.product_id)) for t in rows]


def update_tester_status(session: Session, auth: AuthContext, tester_id: str, body: dict[str, Any]) -> dict[str, Any]:
    _require(auth, "cosmetics.tester_manage")
    tester = session.get(CosmeticsTesterBalance, tester_id)
    if not tester or tester.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Tester not found")
    status = str(body.get("status") or "").strip().lower()
    if status not in {"depleted", "damaged", "disposed"}:
        raise HTTPException(status_code=400, detail="status must be depleted|damaged|disposed")
    # One-way: never silently return to sellable
    tester.status = status
    if body.get("reason"):
        tester.reason = (tester.reason or "") + f" | {body['reason']}"
    session.add(tester)
    write_audit(
        session,
        auth,
        "cosmetics.tester_status",
        "cosmetics_tester_balance",
        tester.id,
        {"status": status, "reason": body.get("reason")},
    )
    product = session.get(Product, tester.product_id)
    return _tester_out(tester, product)


def validate_cosmetics_return_lines(session: Session, auth: AuthContext, inv, lines_in: list) -> None:
    for item in lines_in:
        condition = str(item.get("condition") or "").strip().lower()
        # Header condition may be applied later; require per-line or will check header in caller
        if condition and condition not in RETURN_CONDITIONS:
            raise HTTPException(
                status_code=400,
                detail="Cosmetics return condition must be unopened|opened|damaged|defective|expired",
            )
        line_id = item.get("invoice_line_id") or item.get("line_id")
        if not line_id:
            continue
        line = session.get(SalesInvoiceLine, line_id)
        if not line or line.invoice_id != inv.id:
            raise HTTPException(status_code=400, detail="Invalid return line")


def apply_cosmetics_return(
    session: Session,
    auth: AuthContext,
    inv_line: SalesInvoiceLine,
    qty: float,
    meta: dict[str, Any],
    condition: str,
) -> None:
    """Handle cosmetics return stock policy.

    Unopened/saleable: StockBalance + original batch already restored via sales_return movement.
    Opened/damaged/defective/expired: financial return OK; do NOT increase sellable StockBalance.
    Physical non-sellable qty is recorded on a dedicated quarantined/damaged/expired batch row
    (never flips the original sellable batch status).
    """
    cond = (condition or "").strip().lower()
    if cond in {"unopened", "saleable"}:
        batch_id = meta.get("batch_id")
        if batch_id:
            batch = session.get(CosmeticsBatch, batch_id)
            if batch and batch.company_id == auth.company_id:
                profile = get_profile(session, auth.company_id, batch.product_id)
                refresh_batch_status(batch, profile.near_expiry_warning_days if profile else 90)
                session.add(batch)
        return

    # Non-sellable path: track returned units separately (no StockBalance change)
    batch_id = meta.get("batch_id")
    source = session.get(CosmeticsBatch, batch_id) if batch_id else None
    product_id = inv_line.product_id
    if not product_id:
        return
    status = "quarantined"
    if cond == "expired":
        status = "expired"
    elif cond in {"damaged", "defective"}:
        status = "damaged"
    ret_batch = CosmeticsBatch(
        company_id=auth.company_id,
        product_id=product_id,
        variant_id=meta.get("variant_id") or (source.variant_id if source else None),
        store_id=meta.get("store_id") or (source.store_id if source else None),
        supplier_id=source.supplier_id if source else None,
        batch_no=(source.batch_no if source else meta.get("batch_no") or "RET") + f"-NS-{cond[:3].upper()}",
        lot_no=source.lot_no if source else None,
        manufacture_date=source.manufacture_date if source else None,
        expiry_date=source.expiry_date if source else None,
        received_date=_utc_now(),
        qty_on_hand=qty,
        status=status,
    )
    session.add(ret_batch)
    session.flush()
    write_audit(
        session,
        auth,
        "cosmetics.return_nonsellable",
        "cosmetics_batch",
        ret_batch.id,
        {"qty": qty, "condition": cond, "status": status, "source_batch_id": batch_id},
    )


def sync_cosmetics_batch_from_meta(
    session: Session,
    company_id: str,
    product: Product,
    meta: dict[str, Any] | None,
) -> None:
    """Syncs CosmeticsBatch when product metadata (e.g. Expiry date: 06/2028) is created or updated."""
    if not meta or not isinstance(meta, dict):
        return
    exp_str = meta.get("expiry_date")
    if not exp_str:
        return
    exp_dt = _parse_dt(exp_str)
    if not exp_dt:
        return

    clean_sku = (product.sku or "COS").upper().replace(" ", "-")
    batch_no = str(meta.get("batch_no") or f"BATCH-{clean_sku}-01").strip()

    # Look for matching batch_no first
    batch = session.exec(
        select(CosmeticsBatch).where(
            CosmeticsBatch.company_id == company_id,
            CosmeticsBatch.product_id == product.id,
            func.lower(CosmeticsBatch.batch_no) == batch_no.lower(),
        )
    ).first()

    if not batch and not meta.get("batch_no"):
        # If user didn't specify batch_no explicitly, match any first batch
        batch = session.exec(
            select(CosmeticsBatch).where(
                CosmeticsBatch.company_id == company_id,
                CosmeticsBatch.product_id == product.id,
            )
        ).first()

    if batch:
        batch.expiry_date = exp_dt
        if meta.get("batch_no"):
            batch.batch_no = batch_no
        refresh_batch_status(batch, 90)
        session.add(batch)
    else:
        bal = session.exec(
            select(StockBalance).where(
                StockBalance.company_id == company_id,
                StockBalance.product_id == product.id,
            )
        ).all()
        stock = sum(max(0.0, float(b.qty_on_hand or 0)) for b in bal)
        new_batch = CosmeticsBatch(
            company_id=company_id,
            product_id=product.id,
            batch_no=batch_no,
            expiry_date=exp_dt,
            qty_on_hand=stock if stock > 0 else 1.0,
            status="available",
        )
        session.add(new_batch)

    # Also support syncing second batch if provided in meta
    second_exp_str = meta.get("second_batch_expiry")
    second_bno = str(meta.get("second_batch_no") or "").strip()
    if second_exp_str and second_bno:
        second_exp_dt = _parse_dt(second_exp_str)
        if second_exp_dt:
            sec_batch = session.exec(
                select(CosmeticsBatch).where(
                    CosmeticsBatch.company_id == company_id,
                    CosmeticsBatch.product_id == product.id,
                    func.lower(CosmeticsBatch.batch_no) == second_bno.lower(),
                )
            ).first()
            if sec_batch:
                sec_batch.expiry_date = second_exp_dt
                refresh_batch_status(sec_batch, 90)
                session.add(sec_batch)
            else:
                new_sec = CosmeticsBatch(
                    company_id=company_id,
                    product_id=product.id,
                    batch_no=second_bno,
                    expiry_date=second_exp_dt,
                    qty_on_hand=max(1.0, float(meta.get("second_batch_qty") or 10.0)),
                    status="available",
                )
                session.add(new_sec)

    session.flush()
    reconcile_cosmetics_batches(session, company_id, product.id)
