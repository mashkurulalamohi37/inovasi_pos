"""Surgical Shop vertical — profiles, stock units, quarantine, recall, sale validation."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import HTTPException
from sqlmodel import Session, select

from app.dependencies import AuthContext, write_audit
from app.inventory.locking import for_update
from app.models.industry import (
    SurgicalProductProfile,
    SurgicalRecall,
    SurgicalSalesLineExtension,
    SurgicalStockUnit,
)
from app.models.product import Product
from app.models.sales import SalesInvoice, SalesInvoiceLine

TRACKING_MODES = {"none", "batch", "lot", "serial", "batch_and_serial"}

STOCK_STATUSES = {
    "available",
    "quarantined",
    "released",
    "expired",
    "recalled",
    "damaged",
    "sold",
    "returned",
    "retired",
}

SELLABLE_STATUSES = {"available", "released"}

BLOCKED_SALE_STATUSES = {"quarantined", "expired", "recalled", "damaged", "sold", "returned", "retired"}

STERILE_STATUSES = {"sterile", "non_sterile", "unknown"}

RECALL_STATUSES = {
    "open",
    "investigating",
    "stock_blocked",
    "customer_contact",
    "resolved",
    "closed",
}


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
        try:
            return _as_utc(datetime.strptime(text[:10], "%Y-%m-%d"))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"Invalid date: {value}") from exc


def _next_no(session: Session, company_id: str, prefix: str, model, field: str) -> str:
    rows = session.exec(select(model).where(model.company_id == company_id)).all()
    return f"{prefix}-{len(rows) + 1:06d}"


def _normalize_tracking_flags(body: dict[str, Any]) -> dict[str, Any]:
    mode = str(body.get("tracking_mode") or "batch").strip().lower()
    if mode not in TRACKING_MODES:
        raise HTTPException(status_code=400, detail=f"Invalid tracking_mode: {mode}")
    out = dict(body)
    out["tracking_mode"] = mode
    if "batch_tracked" not in body:
        out["batch_tracked"] = mode in {"batch", "batch_and_serial"}
    if "lot_tracked" not in body:
        out["lot_tracked"] = mode == "lot" or bool(body.get("lot_tracked"))
    if "serial_tracked" not in body:
        out["serial_tracked"] = mode in {"serial", "batch_and_serial"}
    if "expiry_tracked" not in body:
        out["expiry_tracked"] = mode != "none"
    return out


def get_profile(session: Session, company_id: str, product_id: str) -> SurgicalProductProfile | None:
    return session.exec(
        select(SurgicalProductProfile).where(
            SurgicalProductProfile.company_id == company_id,
            SurgicalProductProfile.product_id == product_id,
        )
    ).first()


def _profile_out(p: SurgicalProductProfile, product: Product | None = None) -> dict[str, Any]:
    return {
        "id": p.id,
        "product_id": p.product_id,
        "sku": product.sku if product else None,
        "product_name": product.name if product else None,
        "device_type": p.device_type,
        "device_class": p.device_class,
        "manufacturer_name": p.manufacturer_name,
        "model_no": p.model_no,
        "reference_code": p.reference_code,
        "catalog_no": p.catalog_no,
        "tracking_mode": p.tracking_mode,
        "lot_tracked": p.lot_tracked,
        "batch_tracked": p.batch_tracked,
        "serial_tracked": p.serial_tracked,
        "expiry_tracked": p.expiry_tracked,
        "udi_required": p.udi_required,
        "sterile_required": p.sterile_required,
        "sterilization_method": p.sterilization_method,
        "reusable": p.reusable,
        "single_use": p.single_use,
        "warranty_months": p.warranty_months,
        "storage_instruction": p.storage_instruction,
        "regulatory_notes": p.regulatory_notes,
        "is_active": p.is_active,
    }


def upsert_profile(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    product_id = body.get("product_id")
    if not product_id:
        raise HTTPException(status_code=400, detail="product_id required")
    product = session.get(Product, product_id)
    if not product or product.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.industry_pack != "surgical-shop":
        raise HTTPException(status_code=400, detail="Product is not a surgical-shop item")

    body = _normalize_tracking_flags(body)
    ref = (body.get("reference_code") or "").strip() or None
    catalog = (body.get("catalog_no") or "").strip() or None
    if ref:
        dup = session.exec(
            select(SurgicalProductProfile).where(
                SurgicalProductProfile.company_id == auth.company_id,
                SurgicalProductProfile.reference_code == ref,
                SurgicalProductProfile.product_id != product_id,
            )
        ).first()
        if dup:
            raise HTTPException(status_code=409, detail=f"Duplicate reference_code: {ref}")
    if catalog:
        dup = session.exec(
            select(SurgicalProductProfile).where(
                SurgicalProductProfile.company_id == auth.company_id,
                SurgicalProductProfile.catalog_no == catalog,
                SurgicalProductProfile.product_id != product_id,
            )
        ).first()
        if dup:
            raise HTTPException(status_code=409, detail=f"Duplicate catalog_no: {catalog}")

    row = get_profile(session, auth.company_id, product_id)
    if not row:
        row = SurgicalProductProfile(company_id=auth.company_id, product_id=product_id)
        session.add(row)

    for field in (
        "device_type",
        "device_class",
        "manufacturer_name",
        "model_no",
        "sterilization_method",
        "storage_instruction",
        "regulatory_notes",
        "attributes_json",
    ):
        if field in body:
            setattr(row, field, body.get(field))
    row.reference_code = ref
    row.catalog_no = catalog
    row.tracking_mode = body["tracking_mode"]
    row.lot_tracked = bool(body.get("lot_tracked"))
    row.batch_tracked = bool(body.get("batch_tracked"))
    row.serial_tracked = bool(body.get("serial_tracked"))
    row.expiry_tracked = bool(body.get("expiry_tracked", True))
    row.udi_required = bool(body.get("udi_required"))
    row.sterile_required = bool(body.get("sterile_required"))
    row.reusable = bool(body.get("reusable"))
    row.single_use = bool(body.get("single_use", not row.reusable))
    if "warranty_months" in body:
        row.warranty_months = int(body["warranty_months"]) if body["warranty_months"] is not None else None
    if "is_active" in body:
        row.is_active = bool(body["is_active"])
    session.add(row)
    session.flush()
    write_audit(session, auth, "surgical.profile_upsert", "surgical_product_profile", row.id, {"product_id": product_id})
    return _profile_out(row, product)


def list_profiles(session: Session, company_id: str, *, q: str | None = None) -> list[dict[str, Any]]:
    rows = session.exec(
        select(SurgicalProductProfile, Product)
        .join(Product, SurgicalProductProfile.product_id == Product.id)
        .where(SurgicalProductProfile.company_id == company_id)
        .order_by(Product.sku)
    ).all()
    out: list[dict[str, Any]] = []
    q_lower = (q or "").strip().lower()
    for profile, product in rows:
        if q_lower:
            hay = f"{product.sku} {product.name} {profile.manufacturer_name or ''} {profile.reference_code or ''}".lower()
            if q_lower not in hay:
                continue
        out.append(_profile_out(profile, product))
    return out


def _refresh_expiry_status(unit: SurgicalStockUnit) -> None:
    if unit.status in {"recalled", "sold", "damaged", "retired", "returned"}:
        return
    exp = _as_utc(unit.expiry_date)
    if exp and exp <= _utc_now() and unit.status not in {"quarantined"}:
        unit.status = "expired"


def _days_to_expiry(unit: SurgicalStockUnit) -> int | None:
    exp = _as_utc(unit.expiry_date)
    if not exp:
        return None
    return (exp - _utc_now()).days


def _unit_out(unit: SurgicalStockUnit, product: Product | None = None, profile: SurgicalProductProfile | None = None) -> dict[str, Any]:
    _refresh_expiry_status(unit)
    days = _days_to_expiry(unit)
    return {
        "id": unit.id,
        "product_id": unit.product_id,
        "sku": product.sku if product else None,
        "product_name": product.name if product else None,
        "manufacturer_name": unit.manufacturer_name or (profile.manufacturer_name if profile else None),
        "store_id": unit.store_id,
        "batch_no": unit.batch_no,
        "lot_no": unit.lot_no,
        "serial_no": unit.serial_no,
        "udi_code": unit.udi_code,
        "manufacture_date": unit.manufacture_date.isoformat() if unit.manufacture_date else None,
        "expiry_date": unit.expiry_date.isoformat() if unit.expiry_date else None,
        "received_date": unit.received_date.isoformat() if unit.received_date else None,
        "qty_on_hand": unit.qty_on_hand,
        "status": unit.status,
        "sterile_status": unit.sterile_status,
        "sterilization_method": unit.sterilization_method,
        "quarantine_reason": unit.quarantine_reason,
        "recall_reference": unit.recall_reference,
        "days_to_expiry": days,
        "device_type": profile.device_type if profile else None,
        "tracking_mode": profile.tracking_mode if profile else None,
    }


def list_stock_units(
    session: Session,
    company_id: str,
    *,
    product_id: str | None = None,
    store_id: str | None = None,
    status: str | None = None,
    sterile_status: str | None = None,
    batch_no: str | None = None,
    lot_no: str | None = None,
    serial_no: str | None = None,
    manufacturer: str | None = None,
    q: str | None = None,
    sellable_only: bool = False,
    near_days: int | None = None,
    expired_only: bool = False,
) -> list[dict[str, Any]]:
    stmt = (
        select(SurgicalStockUnit, Product)
        .join(Product, SurgicalStockUnit.product_id == Product.id)
        .where(SurgicalStockUnit.company_id == company_id)
    )
    if product_id:
        stmt = stmt.where(SurgicalStockUnit.product_id == product_id)
    if store_id:
        stmt = stmt.where(SurgicalStockUnit.store_id == store_id)
    if batch_no:
        stmt = stmt.where(SurgicalStockUnit.batch_no == batch_no)
    if lot_no:
        stmt = stmt.where(SurgicalStockUnit.lot_no == lot_no)
    if serial_no:
        stmt = stmt.where(SurgicalStockUnit.serial_no == serial_no)
    if sterile_status:
        stmt = stmt.where(SurgicalStockUnit.sterile_status == sterile_status)
    rows = session.exec(stmt.order_by(SurgicalStockUnit.expiry_date)).all()
    out: list[dict[str, Any]] = []
    q_lower = (q or "").strip().lower()
    mfr_lower = (manufacturer or "").strip().lower()
    now = _utc_now()
    for unit, product in rows:
        profile = get_profile(session, company_id, unit.product_id)
        row = _unit_out(unit, product, profile)
        if status and row["status"] != status:
            continue
        if sellable_only:
            if row["status"] not in SELLABLE_STATUSES or (unit.qty_on_hand or 0) <= 0:
                continue
            if unit.expiry_date and _as_utc(unit.expiry_date) <= now:
                continue
        if expired_only:
            if not unit.expiry_date or _as_utc(unit.expiry_date) > now:
                continue
        if near_days is not None and not expired_only:
            days = row["days_to_expiry"]
            if days is None or days < 0 or days > near_days:
                continue
        if mfr_lower and mfr_lower not in (row["manufacturer_name"] or "").lower():
            continue
        if q_lower:
            hay = f"{row['sku']} {row['product_name']} {row['batch_no']} {row['lot_no']} {row['serial_no']} {row['udi_code']}".lower()
            if q_lower not in hay:
                continue
        out.append(row)
    return out


def assert_serial_udi_unique(
    session: Session,
    company_id: str,
    *,
    serial_no: str | None = None,
    udi_code: str | None = None,
    exclude_id: str | None = None,
) -> None:
    if serial_no:
        existing = session.exec(
            select(SurgicalStockUnit).where(
                SurgicalStockUnit.company_id == company_id,
                SurgicalStockUnit.serial_no == serial_no.strip(),
            )
        ).first()
        if existing and existing.id != exclude_id:
            raise HTTPException(status_code=409, detail=f"Duplicate serial number: {serial_no}")
    if udi_code:
        existing = session.exec(
            select(SurgicalStockUnit).where(
                SurgicalStockUnit.company_id == company_id,
                SurgicalStockUnit.udi_code == udi_code.strip(),
            )
        ).first()
        if existing and existing.id != exclude_id:
            raise HTTPException(status_code=409, detail=f"Duplicate UDI: {udi_code}")


def receive_stock_for_line(
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
    serial_no: str | None = None,
    serials: list | None = None,
    udi_code: str | None = None,
    sterile_status: str | None = None,
    sterilization_method: str | None = None,
    manufacturer_name: str | None = None,
) -> str | None:
    """Create/update SurgicalStockUnit rows for GRN. Returns primary stock_unit_id for ledger batch_id."""
    profile = get_profile(session, company_id, product.id)
    mode = profile.tracking_mode if profile else "batch"
    batch_tracked = profile.batch_tracked if profile else True
    lot_tracked = profile.lot_tracked if profile else False
    serial_tracked = profile.serial_tracked if profile else False
    expiry_tracked = profile.expiry_tracked if profile else True
    udi_required = profile.udi_required if profile else False
    sterile_required = profile.sterile_required if profile else False

    if mode == "none":
        return None

    exp = _parse_dt(expiry_date)
    mfg = _parse_dt(manufacture_date)
    if mfg and exp and exp < mfg:
        raise HTTPException(status_code=400, detail="Expiry date cannot be before manufacture date")
    if expiry_tracked and not exp and (batch_tracked or lot_tracked or serial_tracked):
        raise HTTPException(status_code=400, detail="Expiry date required for expiry-tracked surgical product")
    if exp and exp <= _utc_now():
        # Policy: reject expired receipt (quarantine path would need explicit flag)
        raise HTTPException(status_code=400, detail="Expired stock cannot be received as available")

    sterile = (sterile_status or "").strip().lower() or ("sterile" if sterile_required else "unknown")
    if sterile not in STERILE_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid sterile_status: {sterile}")
    if sterile_required and sterile != "sterile":
        raise HTTPException(status_code=400, detail="Sterile status required for this product")
    method = sterilization_method or (profile.sterilization_method if profile else None)
    mfr = manufacturer_name or (profile.manufacturer_name if profile else None)

    entries: list[dict[str, Any]] = []
    if serials:
        entries = list(serials)
    elif serial_no:
        entries = [{"serial_no": serial_no, "udi_code": udi_code}]

    if serial_tracked or mode in {"serial", "batch_and_serial"}:
        if not entries:
            raise HTTPException(status_code=400, detail="Serial number(s) required for serial-tracked surgical product")
        if int(qty) != len(entries):
            raise HTTPException(
                status_code=400,
                detail=f"Serial count ({len(entries)}) must match receive qty ({int(qty)})",
            )
        created_ids: list[str] = []
        for entry in entries:
            sn = str(entry.get("serial_no") or entry.get("serial") or "").strip()
            udi = str(entry.get("udi_code") or entry.get("udi") or udi_code or "").strip() or None
            if not sn:
                raise HTTPException(status_code=400, detail="Serial number required")
            if udi_required and not udi:
                raise HTTPException(status_code=400, detail="UDI required for this product")
            assert_serial_udi_unique(session, company_id, serial_no=sn, udi_code=udi)
            unit = SurgicalStockUnit(
                company_id=company_id,
                product_id=product.id,
                variant_id=variant_id,
                store_id=store_id,
                supplier_id=supplier_id,
                manufacturer_name=mfr,
                batch_no=(batch_no or entry.get("batch_no") or "").strip() or None,
                lot_no=(lot_no or entry.get("lot_no") or "").strip() or None,
                serial_no=sn,
                udi_code=udi,
                manufacture_date=mfg or _parse_dt(entry.get("manufacture_date")),
                expiry_date=exp or _parse_dt(entry.get("expiry_date")),
                received_date=_utc_now(),
                purchase_id=purchase_id,
                receive_id=receive_id,
                qty_on_hand=0.0,  # ledger sync applies qty
                status="available",
                sterile_status=str(entry.get("sterile_status") or sterile),
                sterilization_method=method,
            )
            if batch_tracked and not unit.batch_no:
                raise HTTPException(status_code=400, detail="Batch number required for batch-tracked surgical product")
            if lot_tracked and not unit.lot_no:
                raise HTTPException(status_code=400, detail="Lot number required for lot-tracked surgical product")
            session.add(unit)
            session.flush()
            created_ids.append(unit.id)
        return created_ids[0] if created_ids else None

    # Batch / lot aggregate unit
    bno = (batch_no or "").strip() or None
    lno = (lot_no or "").strip() or None
    if batch_tracked and not bno:
        raise HTTPException(status_code=400, detail="Batch number required for batch-tracked surgical product")
    if lot_tracked and not lno:
        raise HTTPException(status_code=400, detail="Lot number required for lot-tracked surgical product")
    if udi_required and not (udi_code or "").strip():
        raise HTTPException(status_code=400, detail="UDI required for this product")
    if udi_code:
        assert_serial_udi_unique(session, company_id, udi_code=udi_code.strip())

    existing = None
    if bno or lno:
        stmt = select(SurgicalStockUnit).where(
            SurgicalStockUnit.company_id == company_id,
            SurgicalStockUnit.product_id == product.id,
            SurgicalStockUnit.serial_no.is_(None),
            SurgicalStockUnit.status.in_(list(SELLABLE_STATUSES | {"quarantined"})),
        )
        if store_id:
            stmt = stmt.where(SurgicalStockUnit.store_id == store_id)
        if bno:
            stmt = stmt.where(SurgicalStockUnit.batch_no == bno)
        if lno:
            stmt = stmt.where(SurgicalStockUnit.lot_no == lno)
        existing = session.exec(stmt).first()

    if existing:
        # qty applied via inventory ledger sync (same as PharmaBatch)
        if exp:
            existing.expiry_date = exp
        if mfg:
            existing.manufacture_date = mfg
        if sterile:
            existing.sterile_status = sterile
        session.add(existing)
        session.flush()
        return existing.id

    unit = SurgicalStockUnit(
        company_id=company_id,
        product_id=product.id,
        variant_id=variant_id,
        store_id=store_id,
        supplier_id=supplier_id,
        manufacturer_name=mfr,
        batch_no=bno,
        lot_no=lno,
        udi_code=(udi_code or "").strip() or None,
        manufacture_date=mfg,
        expiry_date=exp,
        received_date=_utc_now(),
        purchase_id=purchase_id,
        receive_id=receive_id,
        qty_on_hand=0.0,  # ledger sync applies qty
        status="available",
        sterile_status=sterile,
        sterilization_method=method,
    )
    session.add(unit)
    session.flush()
    return unit.id


def sync_stock_unit_qty(
    session: Session,
    company_id: str,
    *,
    stock_unit_id: str | None,
    qty_delta: float,
    serial_no: str | None = None,
    invoice_id: str | None = None,
    on_return: bool = False,
) -> None:
    unit: SurgicalStockUnit | None = None
    if stock_unit_id:
        unit = session.exec(
            for_update(session, select(SurgicalStockUnit).where(SurgicalStockUnit.id == stock_unit_id))
        ).first()
    elif serial_no:
        unit = session.exec(
            for_update(
                session,
                select(SurgicalStockUnit).where(
                    SurgicalStockUnit.company_id == company_id,
                    SurgicalStockUnit.serial_no == serial_no,
                ),
            )
        ).first()
    if not unit or unit.company_id != company_id:
        return

    if qty_delta < 0:
        # Extension may mark serial sold before ledger sync (sales_service order)
        if unit.serial_no and unit.status == "sold" and (unit.qty_on_hand or 0) <= 0:
            return
        new_qty = (unit.qty_on_hand or 0) + qty_delta
        if new_qty < -0.0001:
            raise ValueError(
                f"Insufficient surgical stock for {unit.batch_no or unit.serial_no or unit.id}: "
                f"have {unit.qty_on_hand or 0}, need {abs(qty_delta)}"
            )
        unit.qty_on_hand = max(0.0, new_qty)
        if unit.serial_no:
            unit.status = "sold"
            if invoice_id:
                unit.sales_invoice_id = invoice_id
        elif unit.qty_on_hand <= 0:
            pass
    else:
        unit.qty_on_hand = (unit.qty_on_hand or 0) + qty_delta
        if on_return:
            if unit.serial_no or unit.status == "sold":
                unit.status = "quarantined"
                unit.quarantine_reason = unit.quarantine_reason or "Returned — pending QC release"
            elif unit.status == "expired":
                pass
            elif unit.status == "recalled":
                pass
            else:
                _refresh_expiry_status(unit)
                if unit.status not in {"expired", "recalled", "quarantined"}:
                    unit.status = "available"
            unit.sales_invoice_id = None
        elif unit.status == "sold" and unit.qty_on_hand > 0:
            unit.status = "available"
    session.add(unit)


def mark_unit_sold_from_sale(
    session: Session,
    auth: AuthContext,
    *,
    stock_unit_id: str | None,
    serial_no: str | None,
    invoice_id: str,
) -> SurgicalStockUnit | None:
    unit = None
    if stock_unit_id:
        unit = session.exec(
            for_update(session, select(SurgicalStockUnit).where(SurgicalStockUnit.id == stock_unit_id))
        ).first()
    elif serial_no:
        unit = session.exec(
            for_update(
                session,
                select(SurgicalStockUnit).where(
                    SurgicalStockUnit.company_id == auth.company_id,
                    SurgicalStockUnit.serial_no == serial_no,
                ),
            )
        ).first()
    if unit and unit.company_id == auth.company_id and unit.serial_no:
        if unit.status != "available":
            raise ValueError(f"Surgical unit already sold or unavailable: {unit.serial_no}")
        # Status only — qty is applied by inventory ledger sync after this
        unit.status = "sold"
        unit.sales_invoice_id = invoice_id
        session.add(unit)
    return unit


def validate_surgical_sale_lines(session: Session, auth: AuthContext, lines: list) -> None:
    now = _utc_now()
    for line in lines:
        meta = getattr(line, "meta", None) or {}
        if isinstance(meta, str):
            meta = json.loads(meta) if meta else {}
        product_id = getattr(line, "product_id", None) or meta.get("product_id") or meta.get("productId")
        product = session.get(Product, product_id) if product_id else None
        if product and not product.is_active:
            raise ValueError(f"Inactive product cannot be sold: {product.sku}")
        if not product or product.industry_pack != "surgical-shop":
            continue
        profile = get_profile(session, auth.company_id, product.id)
        stock_unit_id = meta.get("stock_unit_id") or meta.get("batch_id")
        serial = str(meta.get("serial") or meta.get("serial_no") or "").strip() or None
        udi = str(meta.get("udi") or meta.get("udi_code") or "").strip() or None

        if profile and profile.serial_tracked and not stock_unit_id and not serial:
            raise ValueError("Serial number required for serial-tracked surgical product")
        if profile and (profile.batch_tracked or profile.lot_tracked) and not stock_unit_id:
            raise ValueError("Batch/lot stock unit required for tracked surgical product")
        if profile and profile.udi_required and not udi and not stock_unit_id:
            raise ValueError("UDI required for this surgical product")

        unit: SurgicalStockUnit | None = None
        if stock_unit_id:
            unit = session.get(SurgicalStockUnit, stock_unit_id)
        elif serial:
            unit = session.exec(
                select(SurgicalStockUnit).where(
                    SurgicalStockUnit.company_id == auth.company_id,
                    SurgicalStockUnit.serial_no == serial,
                )
            ).first()

        if not unit or unit.company_id != auth.company_id:
            raise ValueError("Selected surgical stock unit not found")
        if unit.product_id != product.id:
            raise ValueError("Selected stock does not belong to this product")
        store_id = meta.get("store_id")
        if store_id and unit.store_id and unit.store_id != store_id:
            raise ValueError("Selected stock is for a different store")

        _refresh_expiry_status(unit)
        if unit.status == "expired" or (unit.expiry_date and _as_utc(unit.expiry_date) <= now):
            raise ValueError("Selected batch is expired and cannot be sold.")
        if unit.status == "quarantined":
            raise ValueError("Selected stock is currently quarantined.")
        if unit.status == "recalled":
            raise ValueError("Selected stock is under recall and cannot be sold.")
        if unit.status == "damaged":
            raise ValueError("Selected stock is damaged and cannot be sold.")
        if unit.status == "retired":
            raise ValueError("Selected stock is retired and cannot be sold.")
        if unit.status == "sold":
            raise ValueError("Selected serial number has already been sold.")
        if unit.status not in SELLABLE_STATUSES:
            raise ValueError(f"Selected stock status '{unit.status}' cannot be sold.")
        qty = float(getattr(line, "qty", 0) or 0)
        if (unit.qty_on_hand or 0) < qty:
            raise ValueError("Insufficient quantity on selected surgical stock unit")
        if profile and profile.udi_required:
            if not (unit.udi_code or udi):
                raise ValueError("UDI required for this surgical product")


def quarantine_unit(session: Session, auth: AuthContext, unit_id: str, body: dict[str, Any]) -> dict[str, Any]:
    reason = (body.get("reason") or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Quarantine reason required")
    unit = session.get(SurgicalStockUnit, unit_id)
    if not unit or unit.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Stock unit not found")
    if unit.status in {"sold", "retired"}:
        raise HTTPException(status_code=400, detail=f"Cannot quarantine stock in status '{unit.status}'")
    unit.status = "quarantined"
    unit.quarantine_reason = reason
    session.add(unit)
    write_audit(
        session,
        auth,
        "surgical.quarantine",
        "surgical_stock_unit",
        unit.id,
        {"reason": reason, "batch_no": unit.batch_no, "serial_no": unit.serial_no},
    )
    product = session.get(Product, unit.product_id)
    return _unit_out(unit, product, get_profile(session, auth.company_id, unit.product_id))


def release_unit(session: Session, auth: AuthContext, unit_id: str, body: dict[str, Any]) -> dict[str, Any]:
    note = (body.get("note") or body.get("reason") or "").strip()
    unit = session.get(SurgicalStockUnit, unit_id)
    if not unit or unit.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Stock unit not found")
    if unit.status != "quarantined":
        raise HTTPException(status_code=400, detail="Only quarantined stock can be released")
    _refresh_expiry_status(unit)
    if unit.status == "expired" or (unit.expiry_date and _as_utc(unit.expiry_date) <= _utc_now()):
        raise HTTPException(status_code=400, detail="Expired stock cannot be released to available")
    if unit.recall_reference:
        raise HTTPException(status_code=400, detail="Recalled stock cannot be released to available")
    unit.status = "available"
    unit.quarantine_reason = None
    session.add(unit)
    write_audit(
        session,
        auth,
        "surgical.release",
        "surgical_stock_unit",
        unit.id,
        {"note": note, "batch_no": unit.batch_no, "serial_no": unit.serial_no},
    )
    product = session.get(Product, unit.product_id)
    return _unit_out(unit, product, get_profile(session, auth.company_id, unit.product_id))


def _recall_out(r: SurgicalRecall) -> dict[str, Any]:
    return {
        "id": r.id,
        "recall_no": r.recall_no,
        "product_id": r.product_id,
        "batch_no": r.batch_no,
        "lot_no": r.lot_no,
        "serial_no": r.serial_no,
        "udi_code": r.udi_code,
        "manufacturer_name": r.manufacturer_name,
        "recall_date": r.recall_date.isoformat() if r.recall_date else None,
        "reason": r.reason,
        "severity": r.severity,
        "status": r.status,
        "created_by": r.created_by,
        "closed_by": r.closed_by,
        "closed_at": r.closed_at.isoformat() if r.closed_at else None,
        "notes": r.notes,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def create_recall(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    reason = (body.get("reason") or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Recall reason required")
    product_id = body.get("product_id")
    batch_no = (body.get("batch_no") or "").strip() or None
    lot_no = (body.get("lot_no") or "").strip() or None
    serial_no = (body.get("serial_no") or "").strip() or None
    udi_code = (body.get("udi_code") or "").strip() or None
    if not any([product_id, batch_no, lot_no, serial_no, udi_code]):
        raise HTTPException(status_code=400, detail="Recall must target product, batch/lot, serial, or UDI")

    if product_id:
        product = session.get(Product, product_id)
        if not product or product.company_id != auth.company_id:
            raise HTTPException(status_code=404, detail="Product not found")

    recall = SurgicalRecall(
        company_id=auth.company_id,
        recall_no=_next_no(session, auth.company_id, "SREC", SurgicalRecall, "recall_no"),
        product_id=product_id,
        batch_no=batch_no,
        lot_no=lot_no,
        serial_no=serial_no,
        udi_code=udi_code,
        manufacturer_name=body.get("manufacturer_name"),
        recall_date=_parse_dt(body.get("recall_date")) or _utc_now(),
        reason=reason,
        severity=str(body.get("severity") or "standard"),
        status="stock_blocked",
        created_by=auth.user_id or auth.email,
        notes=body.get("notes"),
    )
    session.add(recall)
    session.flush()

    stmt = select(SurgicalStockUnit).where(
        SurgicalStockUnit.company_id == auth.company_id,
        SurgicalStockUnit.status.notin_(["sold", "retired"]),
    )
    if product_id:
        stmt = stmt.where(SurgicalStockUnit.product_id == product_id)
    if batch_no:
        stmt = stmt.where(SurgicalStockUnit.batch_no == batch_no)
    if lot_no:
        stmt = stmt.where(SurgicalStockUnit.lot_no == lot_no)
    if serial_no:
        stmt = stmt.where(SurgicalStockUnit.serial_no == serial_no)
    if udi_code:
        stmt = stmt.where(SurgicalStockUnit.udi_code == udi_code)

    blocked = 0
    for unit in session.exec(stmt).all():
        if (unit.qty_on_hand or 0) <= 0 and unit.status == "sold":
            continue
        unit.status = "recalled"
        unit.recall_reference = recall.recall_no
        session.add(unit)
        blocked += 1

    write_audit(
        session,
        auth,
        "surgical.recall",
        "surgical_recall",
        recall.id,
        {"recall_no": recall.recall_no, "blocked_units": blocked, "reason": reason},
    )
    out = _recall_out(recall)
    out["blocked_units"] = blocked
    out["notification_available"] = False
    out["notification_disabled_reason"] = "Customer messaging integration is not configured"
    return out


def list_recalls(session: Session, company_id: str, *, status: str | None = None) -> list[dict[str, Any]]:
    stmt = select(SurgicalRecall).where(SurgicalRecall.company_id == company_id)
    if status:
        stmt = stmt.where(SurgicalRecall.status == status)
    rows = session.exec(stmt.order_by(SurgicalRecall.created_at.desc())).all()
    return [_recall_out(r) for r in rows]


def get_recall(session: Session, auth: AuthContext, recall_id: str) -> dict[str, Any]:
    recall = session.get(SurgicalRecall, recall_id)
    if not recall or recall.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Recall not found")
    out = _recall_out(recall)
    affected_stock = list_stock_units(
        session,
        auth.company_id,
        product_id=recall.product_id,
        batch_no=recall.batch_no,
        lot_no=recall.lot_no,
        serial_no=recall.serial_no,
        status="recalled",
    )
    # Historic sales with matching tracking
    sales: list[dict[str, Any]] = []
    ext_stmt = select(SurgicalSalesLineExtension, SalesInvoiceLine, SalesInvoice).join(
        SalesInvoiceLine, SurgicalSalesLineExtension.line_id == SalesInvoiceLine.id
    ).join(SalesInvoice, SalesInvoiceLine.invoice_id == SalesInvoice.id).where(
        SalesInvoice.company_id == auth.company_id
    )
    for ext, line, inv in session.exec(ext_stmt).all():
        match = True
        if recall.product_id and line.product_id != recall.product_id:
            match = False
        if recall.batch_no and ext.batch_no != recall.batch_no:
            match = False
        if recall.lot_no and ext.lot_no != recall.lot_no:
            match = False
        if recall.serial_no and ext.serial_no != recall.serial_no:
            match = False
        if recall.udi_code and ext.udi_code != recall.udi_code:
            match = False
        if match:
            sales.append({
                "invoice_id": inv.id,
                "invoice_number": inv.invoice_number,
                "customer_id": inv.customer_id,
                "line_id": line.id,
                "product_id": line.product_id,
                "qty": line.qty,
                "batch_no": ext.batch_no,
                "serial_no": ext.serial_no,
                "udi_code": ext.udi_code,
            })
    out["affected_stock"] = affected_stock
    out["affected_sales"] = sales
    out["notification_available"] = False
    out["notification_disabled_reason"] = "Customer messaging integration is not configured"
    return out


def close_recall(session: Session, auth: AuthContext, recall_id: str, body: dict[str, Any]) -> dict[str, Any]:
    recall = session.get(SurgicalRecall, recall_id)
    if not recall or recall.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Recall not found")
    if recall.status == "closed":
        raise HTTPException(status_code=400, detail="Recall already closed")
    recall.status = "closed"
    recall.closed_by = auth.user_id or auth.email
    recall.closed_at = _utc_now()
    if body.get("notes"):
        recall.notes = (recall.notes or "") + f"\n{body['notes']}"
    session.add(recall)
    write_audit(session, auth, "surgical.recall_close", "surgical_recall", recall.id, {"recall_no": recall.recall_no})
    return _recall_out(recall)


def validate_surgical_return_lines(session: Session, auth: AuthContext, inv, lines_in: list) -> None:
    for item in lines_in:
        line_id = item.get("line_id") or item.get("sales_line_id")
        if not line_id:
            continue
        line = session.get(SalesInvoiceLine, line_id)
        if not line or line.invoice_id != inv.id:
            raise HTTPException(status_code=400, detail="Invalid return line")
        meta = {}
        if line.meta_json:
            try:
                meta = json.loads(line.meta_json)
            except json.JSONDecodeError:
                meta = {}
        stock_unit_id = meta.get("stock_unit_id") or meta.get("batch_id")
        if not stock_unit_id and not meta.get("serial") and not meta.get("serial_no"):
            # Allow if extension exists
            ext = session.exec(
                select(SurgicalSalesLineExtension).where(SurgicalSalesLineExtension.line_id == line.id)
            ).first()
            if not ext or not ext.stock_unit_id:
                raise HTTPException(status_code=400, detail="Surgical return requires original stock unit tracking")


def apply_surgical_return(
    session: Session,
    auth: AuthContext,
    inv_line: SalesInvoiceLine,
    qty: float,
    meta: dict[str, Any],
    condition: str,
) -> None:
    stock_unit_id = meta.get("stock_unit_id") or meta.get("batch_id")
    serial = meta.get("serial") or meta.get("serial_no")
    if not stock_unit_id:
        ext = session.exec(
            select(SurgicalSalesLineExtension).where(SurgicalSalesLineExtension.line_id == inv_line.id)
        ).first()
        if ext:
            stock_unit_id = ext.stock_unit_id
            serial = serial or ext.serial_no
    if inv_line.meta_json and not stock_unit_id:
        try:
            inv_meta = json.loads(inv_line.meta_json)
            stock_unit_id = inv_meta.get("stock_unit_id") or inv_meta.get("batch_id")
            serial = serial or inv_meta.get("serial") or inv_meta.get("serial_no")
        except json.JSONDecodeError:
            pass

    # Stock qty already restored via record_stock_movement + sync; enforce quarantine policy
    unit = None
    if stock_unit_id:
        unit = session.get(SurgicalStockUnit, stock_unit_id)
    elif serial:
        unit = session.exec(
            select(SurgicalStockUnit).where(
                SurgicalStockUnit.company_id == auth.company_id,
                SurgicalStockUnit.serial_no == serial,
            )
        ).first()
    if not unit or unit.company_id != auth.company_id:
        return

    if unit.status == "recalled":
        return
    if unit.expiry_date and _as_utc(unit.expiry_date) <= _utc_now():
        unit.status = "expired"
        session.add(unit)
        return
    if condition != "saleable" or unit.serial_no:
        unit.status = "quarantined"
        unit.quarantine_reason = unit.quarantine_reason or "Returned — pending QC release"
        session.add(unit)
        write_audit(
            session,
            auth,
            "surgical.return_quarantine",
            "surgical_stock_unit",
            unit.id,
            {"qty": qty, "condition": condition},
        )
