"""Mobile Shop vertical — profiles, device stock (via electronics serial), trade-in."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException
from sqlmodel import Session, select

from app.dependencies import AuthContext, write_audit
from app.models.industry import ElectronicsSerialStock, MobileProductProfile, MobileTradeIn
from app.models.product import Product, ProductVariant
from app.rbac import role_has_permission

TRADE_IN_STATUSES = {
    "draft",
    "inspected",
    "assessed",
    "approved",
    "accepted",
    "settled",
    "rejected",
    "cancelled",
}

TRADE_IN_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"inspected", "assessed", "cancelled"},
    "inspected": {"assessed", "cancelled"},
    "assessed": {"approved", "rejected", "cancelled"},
    "approved": {"accepted", "settled", "cancelled"},
    "accepted": {"settled", "cancelled"},
    "settled": set(),
    "rejected": set(),
    "cancelled": set(),
}

CONDITIONS = {"new", "like_new", "good", "fair", "poor", "damaged", "refurbishment_required"}
ACTIVATION = {"not_activated", "activated", "unknown"}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _next_no(session: Session, company_id: str, prefix: str, model) -> str:
    rows = session.exec(select(model).where(model.company_id == company_id)).all()
    return f"{prefix}-{len(rows) + 1:06d}"


def get_profile(session: Session, company_id: str, product_id: str) -> MobileProductProfile | None:
    return session.exec(
        select(MobileProductProfile).where(
            MobileProductProfile.company_id == company_id,
            MobileProductProfile.product_id == product_id,
        )
    ).first()


def _profile_out(p: MobileProductProfile, product: Product | None = None) -> dict[str, Any]:
    return {
        "id": p.id,
        "product_id": p.product_id,
        "sku": product.sku if product else None,
        "product_name": product.name if product else None,
        "brand": p.brand,
        "model_name": p.model_name,
        "model_code": p.model_code,
        "device_type": p.device_type,
        "operating_system": p.operating_system,
        "network_type": p.network_type,
        "sim_type": p.sim_type,
        "dual_sim": p.dual_sim,
        "esim_supported": p.esim_supported,
        "warranty_months": p.warranty_months,
        "activation_tracking": p.activation_tracking,
        "imei_required": p.imei_required,
        "dual_imei": p.dual_imei,
        "serial_required": p.serial_required,
        "condition_policy": p.condition_policy,
        "is_active": p.is_active,
    }


def list_profiles(session: Session, company_id: str, *, q: str | None = None) -> list[dict[str, Any]]:
    rows = session.exec(
        select(MobileProductProfile, Product)
        .join(Product, MobileProductProfile.product_id == Product.id)
        .where(MobileProductProfile.company_id == company_id)
        .order_by(Product.sku)
    ).all()
    out: list[dict[str, Any]] = []
    q_lower = (q or "").strip().lower()
    for profile, product in rows:
        if q_lower:
            hay = f"{product.sku} {product.name} {profile.brand or ''} {profile.model_name or ''}".lower()
            if q_lower not in hay:
                continue
        out.append(_profile_out(profile, product))
    return out


def upsert_profile(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    product_id = body.get("product_id")
    if not product_id:
        raise HTTPException(status_code=400, detail="product_id required")
    product = session.get(Product, product_id)
    if not product or product.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.industry_pack != "mobile-shop":
        raise HTTPException(status_code=400, detail="Product is not a mobile-shop item")

    row = get_profile(session, auth.company_id, product_id)
    if not row:
        row = MobileProductProfile(company_id=auth.company_id, product_id=product_id)
        session.add(row)

    for field in (
        "brand", "model_name", "model_code", "device_type", "operating_system",
        "network_type", "sim_type", "condition_policy", "attributes_json",
    ):
        if field in body:
            setattr(row, field, body.get(field))
    for field in ("dual_sim", "esim_supported", "activation_tracking", "imei_required", "dual_imei", "serial_required", "is_active"):
        if field in body:
            setattr(row, field, bool(body.get(field)))
    if "warranty_months" in body and body["warranty_months"] is not None:
        row.warranty_months = int(body["warranty_months"])
    session.add(row)
    session.flush()
    write_audit(session, auth, "mobile.profile_upsert", "mobile_product_profile", row.id, {"product_id": product_id})
    return _profile_out(row, product)


def product_requires_imei(session: Session, product: Product | None) -> bool:
    if not product or product.industry_pack != "mobile-shop":
        return False
    profile = get_profile(session, product.company_id, product.id)
    if profile:
        return bool(profile.imei_required)
    meta: dict[str, Any] = {}
    if product.meta_json:
        try:
            meta = json.loads(product.meta_json)
        except json.JSONDecodeError:
            meta = {}
    for key in (
        "serialized",
        "has_serial",
        "hasSerial",
        "serial_imei_required",
        "imei_required",
        "is_serialized",
        "serial_tracked",
        "track_serial",
        "track_serials",
    ):
        if key in meta:
            val = meta.get(key)
            if isinstance(val, str):
                return val.lower() in ("true", "1", "yes")
            return bool(val)
    category = str(meta.get("category") or "").lower()
    if category in {"accessories", "charger", "cable", "case", "cover", "screen protector"}:
        return False
    return True


def _variant_attrs(session: Session, variant_id: str | None) -> dict[str, Any]:
    if not variant_id:
        return {}
    variant = session.get(ProductVariant, variant_id)
    if not variant:
        return {}
    attrs: dict[str, Any] = {
        "variant_id": variant.id,
        "variant_code": variant.variant_code,
        "color": variant.color,
        "model": variant.model,
        "size": variant.size,
    }
    if variant.attributes_json:
        try:
            parsed = json.loads(variant.attributes_json)
            if isinstance(parsed, dict):
                attrs.update(parsed)
        except json.JSONDecodeError:
            pass
    return attrs


def list_devices(
    session: Session,
    company_id: str,
    *,
    product_id: str | None = None,
    store_id: str | None = None,
    status: str | None = None,
    condition: str | None = None,
    brand: str | None = None,
    q: str | None = None,
    sellable_only: bool = False,
) -> list[dict[str, Any]]:
    stmt = (
        select(ElectronicsSerialStock, Product)
        .join(Product, ElectronicsSerialStock.product_id == Product.id)
        .where(
            ElectronicsSerialStock.company_id == company_id,
            Product.industry_pack == "mobile-shop",
        )
    )
    if product_id:
        stmt = stmt.where(ElectronicsSerialStock.product_id == product_id)
    if store_id:
        stmt = stmt.where(ElectronicsSerialStock.store_id == store_id)
    if status:
        stmt = stmt.where(ElectronicsSerialStock.status == status)
    if condition:
        stmt = stmt.where(ElectronicsSerialStock.condition == condition)
    if sellable_only:
        stmt = stmt.where(ElectronicsSerialStock.status == "available")
    rows = session.exec(stmt.order_by(ElectronicsSerialStock.created_at.desc())).all()  # type: ignore[attr-defined]
    out: list[dict[str, Any]] = []
    q_lower = (q or "").strip().lower()
    brand_lower = (brand or "").strip().lower()
    for row, product in rows:
        profile = get_profile(session, company_id, product.id)
        attrs = _variant_attrs(session, row.variant_id)
        item = {
            "id": row.id,
            "device_stock_id": row.id,
            "product_id": row.product_id,
            "sku": product.sku,
            "product_name": product.name,
            "brand": (profile.brand if profile else None) or attrs.get("brand") or product.name.split(" ")[0],
            "model_name": (profile.model_name if profile else None) or attrs.get("model"),
            "variant_id": row.variant_id,
            "ram": attrs.get("ram"),
            "storage": attrs.get("storage"),
            "color": attrs.get("color") or getattr(row, "color", None),
            "imei_1": row.imei_no or row.serial_imei,
            "imei_2": row.imei_2,
            "serial_no": row.serial_imei,
            "serial_imei": row.serial_imei,
            "store_id": row.store_id,
            "condition": row.condition or "new",
            "activation_status": row.activation_status or "unknown",
            "activation_date": row.activation_date.isoformat() if row.activation_date else None,
            "status": row.status,
            "cost_price": row.cost_price,
            "selling_price": product.base_price,
            "received_at": row.created_at.isoformat() if row.created_at else None,
            "sold_at": row.sold_at.isoformat() if row.sold_at else None,
            "warranty_months": profile.warranty_months if profile else 12,
            "customer_id": row.customer_id,
            "sales_invoice_id": row.sales_invoice_id,
            "warranty_id": row.warranty_id,
        }
        if brand_lower and brand_lower not in str(item["brand"] or "").lower():
            continue
        if q_lower:
            hay = f"{item['sku']} {item['product_name']} {item['imei_1']} {item['imei_2'] or ''} {item['serial_no']} {item['brand']}".lower()
            if q_lower not in hay:
                continue
        out.append(item)
    return out


def _trade_in_out(t: MobileTradeIn) -> dict[str, Any]:
    return {
        "id": t.id,
        "trade_in_no": t.trade_in_no,
        "customer_id": t.customer_id,
        "store_id": t.store_id,
        "brand": t.brand,
        "model_name": t.model_name,
        "variant_description": t.variant_description,
        "imei_1": t.imei_1,
        "imei_2": t.imei_2,
        "serial_no": t.serial_no,
        "condition_grade": t.condition_grade,
        "cosmetic_condition": t.cosmetic_condition,
        "battery_health": t.battery_health,
        "storage": t.storage,
        "assessed_value": t.assessed_value,
        "approved_value": t.approved_value,
        "valuation_reason": t.valuation_reason,
        "override_reason": t.override_reason,
        "status": t.status,
        "assessed_by": t.assessed_by,
        "approved_by": t.approved_by,
        "settlement_type": t.settlement_type,
        "linked_sales_invoice_id": t.linked_sales_invoice_id,
        "device_stock_id": t.device_stock_id,
        "notes": t.notes,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


def list_trade_ins(session: Session, company_id: str, *, status: str | None = None) -> list[dict[str, Any]]:
    stmt = select(MobileTradeIn).where(MobileTradeIn.company_id == company_id)
    if status:
        stmt = stmt.where(MobileTradeIn.status == status)
    rows = session.exec(stmt.order_by(MobileTradeIn.created_at.desc())).all()  # type: ignore[attr-defined]
    return [_trade_in_out(r) for r in rows]


def get_trade_in(session: Session, auth: AuthContext, trade_in_id: str) -> dict[str, Any]:
    row = session.get(MobileTradeIn, trade_in_id)
    if not row or row.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Trade-in not found")
    return _trade_in_out(row)


def create_trade_in(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    imei_1 = (body.get("imei_1") or "").strip() or None
    imei_2 = (body.get("imei_2") or "").strip() or None
    if imei_1 and imei_2 and imei_1 == imei_2:
        raise HTTPException(status_code=400, detail="IMEI-1 and IMEI-2 cannot be the same")
    grade = str(body.get("condition_grade") or "good")
    if grade not in CONDITIONS:
        raise HTTPException(status_code=400, detail=f"Invalid condition_grade: {grade}")
    assessed = float(body.get("assessed_value") or 0)
    row = MobileTradeIn(
        company_id=auth.company_id,
        trade_in_no=_next_no(session, auth.company_id, "MTI", MobileTradeIn),
        customer_id=body.get("customer_id"),
        store_id=body.get("store_id") or auth.store_id,
        brand=body.get("brand"),
        model_name=body.get("model_name"),
        variant_description=body.get("variant_description"),
        imei_1=imei_1,
        imei_2=imei_2,
        serial_no=(body.get("serial_no") or "").strip() or None,
        condition_grade=grade,
        cosmetic_condition=body.get("cosmetic_condition"),
        battery_health=body.get("battery_health"),
        storage=body.get("storage"),
        assessed_value=assessed,
        valuation_reason=body.get("valuation_reason"),
        status="assessed" if assessed > 0 else "draft",
        assessed_by=auth.user_id or auth.email,
        settlement_type=body.get("settlement_type"),
        notes=body.get("notes"),
    )
    session.add(row)
    session.flush()
    write_audit(session, auth, "mobile.trade_in_create", "mobile_trade_in", row.id, {"trade_in_no": row.trade_in_no})
    return _trade_in_out(row)


def update_trade_in_status(session: Session, auth: AuthContext, trade_in_id: str, body: dict[str, Any]) -> dict[str, Any]:
    row = session.get(MobileTradeIn, trade_in_id)
    if not row or row.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Trade-in not found")
    new_status = str(body.get("status") or "").strip()
    if new_status not in TRADE_IN_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status: {new_status}")
    allowed = TRADE_IN_TRANSITIONS.get(row.status, set())
    if new_status != row.status and new_status not in allowed:
        raise HTTPException(status_code=400, detail=f"Cannot transition from {row.status} to {new_status}")

    if new_status in {"approved", "accepted", "settled"}:
        if not role_has_permission(auth.role_code, "mobile.trade_in_approve"):
            raise HTTPException(status_code=403, detail="Trade-in approval permission required")

    if "approved_value" in body and body["approved_value"] is not None:
        approved_val = float(body["approved_value"])
        if abs(approved_val - float(row.assessed_value or 0)) > 0.01:
            if not role_has_permission(auth.role_code, "mobile.trade_in_override"):
                raise HTTPException(status_code=403, detail="Trade-in valuation override permission required")
            reason = (body.get("override_reason") or "").strip()
            if not reason:
                raise HTTPException(status_code=400, detail="override_reason required when changing assessed value")
            row.override_reason = reason
            write_audit(
                session, auth, "mobile.trade_in_override", "mobile_trade_in", row.id,
                {"from": row.assessed_value, "to": approved_val, "reason": reason},
            )
        row.approved_value = approved_val

    if body.get("settlement_type"):
        row.settlement_type = body["settlement_type"]
    if body.get("linked_sales_invoice_id"):
        row.linked_sales_invoice_id = body["linked_sales_invoice_id"]
    if body.get("notes"):
        row.notes = body["notes"]

    row.status = new_status
    if new_status in {"approved", "accepted", "settled"}:
        row.approved_by = auth.user_id or auth.email
        if row.approved_value is None:
            row.approved_value = row.assessed_value

    # Intake device stock when accepted/settled
    if new_status in {"accepted", "settled"} and not row.device_stock_id and (row.imei_1 or row.serial_no):
        from app.services.electronics_service import create_serial_stock, find_serial

        identity = row.imei_1 or row.serial_no
        existing = find_serial(session, auth.company_id, identity or "")
        if existing:
            raise HTTPException(status_code=409, detail=f"Device already in stock: {identity}")
        # Use a placeholder product if not provided — require product_id in body for intake
        product_id = body.get("product_id")
        if not product_id:
            # Find any mobile-shop product as intake carrier is not ideal — require explicit product
            raise HTTPException(status_code=400, detail="product_id required to intake trade-in device into stock")
        product = session.get(Product, product_id)
        if not product or product.company_id != auth.company_id or product.industry_pack != "mobile-shop":
            raise HTTPException(status_code=400, detail="Invalid mobile product for trade-in intake")
        device = create_serial_stock(
            session,
            company_id=auth.company_id,
            product_id=product_id,
            serial_no=identity or row.serial_no or "",
            store_id=row.store_id,
            imei_no=row.imei_1,
            imei_2=row.imei_2,
            condition=row.condition_grade if row.condition_grade in CONDITIONS else "fair",
            status="trade_in_received",
            cost_price=float(row.approved_value or row.assessed_value or 0),
        )
        row.device_stock_id = device.id
        write_audit(
            session, auth, "mobile.trade_in_intake", "electronics_serial_stock", device.id,
            {"trade_in_no": row.trade_in_no, "status": "trade_in_received"},
        )

    session.add(row)
    write_audit(session, auth, "mobile.trade_in_status", "mobile_trade_in", row.id, {"status": new_status})
    return _trade_in_out(row)
