"""Hardware vertical — profiles, UOM conversion, customer/bulk pricing, sale validation."""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException
from sqlmodel import Session, select

from app.dependencies import AuthContext, write_audit
from app.models.industry import (
    BuildingMaterialProfile,
    HardwareBulkPriceTier,
    HardwareCustomerPrice,
    HardwareProductProfile,
    HardwareSalesLineExtension,
    StationeryProductProfile,
)
from app.models.product import BrandMaster, Customer, Product, ProductBarcode, ProductUomConversion, Unit
from app.rbac import role_has_permission

MEASUREMENT_MODES = {"quantity", "length", "area", "weight", "volume"}
PRICE_SOURCES = {
    "STANDARD",
    "CUSTOMER_PRICE",
    "PRICE_LIST",
    "CONTRACTOR_TIER",
    "BULK_TIER",
    "MANUAL_OVERRIDE",
}

# Precedence (highest first): MANUAL_OVERRIDE (permission) → CUSTOMER_PRICE → BULK_TIER → STANDARD
# CONTRACTOR_TIER / PRICE_LIST: contractor customers use CUSTOMER_PRICE rows; dedicated group
# price-lists beyond customer_group-scoped bulk tiers are deferred.


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _require(auth: AuthContext, code: str) -> None:
    if auth.is_platform_admin or auth.role_code in {"Admin", "Super Admin"}:
        return
    if code in (auth.permissions or set()) or role_has_permission(auth.role_code, code):
        return
    raise HTTPException(status_code=403, detail=f"Missing permission: {code}")


def _parse_json(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def _effective(row: Any, now: datetime | None = None) -> bool:
    now = now or _utc_now()
    if getattr(row, "is_active", True) is False:
        return False
    ef = getattr(row, "effective_from", None)
    et = getattr(row, "effective_to", None)
    if ef and ef.tzinfo is None:
        ef = ef.replace(tzinfo=timezone.utc)
    if et and et.tzinfo is None:
        et = et.replace(tzinfo=timezone.utc)
    if ef and now < ef:
        return False
    if et and now > et:
        return False
    return True


def _unit_out(u: Unit | None) -> dict[str, Any] | None:
    if not u:
        return None
    return {"id": u.id, "code": u.code, "name": u.name}


def _profile_out(session: Session, p: HardwareProductProfile) -> dict[str, Any]:
    product = session.get(Product, p.product_id)
    brand = session.get(BrandMaster, p.brand_id) if p.brand_id else None
    base = session.get(Unit, p.base_uom_id) if p.base_uom_id else None
    sales = session.get(Unit, p.default_sales_uom_id) if p.default_sales_uom_id else None
    purchase = session.get(Unit, p.default_purchase_uom_id) if p.default_purchase_uom_id else None
    return {
        "id": p.id,
        "product_id": p.product_id,
        "sku": product.sku if product else None,
        "name": product.name if product else None,
        "base_price": product.base_price if product else None,
        "brand_id": p.brand_id,
        "brand_name": brand.name if brand else None,
        "manufacturer_name": p.manufacturer_name,
        "model_no": p.model_no,
        "material": p.material,
        "grade": p.grade,
        "specification": _parse_json(p.specification_json),
        "measurement_mode": p.measurement_mode,
        "base_uom_id": p.base_uom_id,
        "base_uom": _unit_out(base),
        "default_sales_uom_id": p.default_sales_uom_id,
        "default_sales_uom": _unit_out(sales),
        "default_purchase_uom_id": p.default_purchase_uom_id,
        "default_purchase_uom": _unit_out(purchase),
        "fractional_qty_allowed": p.fractional_qty_allowed,
        "cut_to_length_allowed": p.cut_to_length_allowed,
        "minimum_sale_qty": p.minimum_sale_qty,
        "sale_increment": p.sale_increment,
        "warranty_months": p.warranty_months,
        "serial_tracking_optional": p.serial_tracking_optional,
        "contractor_pricing_enabled": p.contractor_pricing_enabled,
        "bulk_pricing_enabled": p.bulk_pricing_enabled,
        "attributes": _parse_json(p.attributes_json),
        "is_active": p.is_active,
    }


def _conversion_out(c: ProductUomConversion, session: Session | None = None) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": c.id,
        "product_id": c.product_id,
        "variant_id": c.variant_id,
        "from_uom_id": c.from_uom_id,
        "to_uom_id": c.to_uom_id,
        "conversion_factor": c.conversion_factor,
        "barcode_id": c.barcode_id,
        "purchase_enabled": c.purchase_enabled,
        "sales_enabled": c.sales_enabled,
        "is_default": c.is_default,
        "is_active": c.is_active,
    }
    if session:
        fu = session.get(Unit, c.from_uom_id)
        tu = session.get(Unit, c.to_uom_id)
        out["from_uom"] = _unit_out(fu)
        out["to_uom"] = _unit_out(tu)
    return out


def get_profile(session: Session, company_id: str, product_id: str) -> HardwareProductProfile | None:
    return session.exec(
        select(HardwareProductProfile).where(
            HardwareProductProfile.company_id == company_id,
            HardwareProductProfile.product_id == product_id,
        )
    ).first()


def get_building_profile(session: Session, company_id: str, product_id: str) -> BuildingMaterialProfile | None:
    return session.exec(
        select(BuildingMaterialProfile).where(
            BuildingMaterialProfile.company_id == company_id,
            BuildingMaterialProfile.product_id == product_id,
        )
    ).first()


def get_stationery_profile(session: Session, company_id: str, product_id: str) -> StationeryProductProfile | None:
    return session.exec(
        select(StationeryProductProfile).where(
            StationeryProductProfile.company_id == company_id,
            StationeryProductProfile.product_id == product_id,
        )
    ).first()


def _material_profile(
    session: Session, company_id: str, product_id: str
) -> HardwareProductProfile | BuildingMaterialProfile | StationeryProductProfile | None:
    return (
        get_profile(session, company_id, product_id)
        or get_building_profile(session, company_id, product_id)
        or get_stationery_profile(session, company_id, product_id)
    )


def list_profiles(
    session: Session,
    company_id: str,
    *,
    q: str | None = None,
    brand_id: str | None = None,
    active_only: bool = True,
) -> list[dict[str, Any]]:
    rows = session.exec(
        select(HardwareProductProfile).where(HardwareProductProfile.company_id == company_id)
    ).all()
    out: list[dict[str, Any]] = []
    qn = (q or "").strip().lower()
    for row in rows:
        if active_only and not row.is_active:
            continue
        if brand_id and row.brand_id != brand_id:
            continue
        product = session.get(Product, row.product_id)
        if product and product.company_id != company_id:
            continue
        if qn and product:
            hay = " ".join(
                [
                    product.sku or "",
                    product.name or "",
                    row.model_no or "",
                    row.material or "",
                    row.grade or "",
                    row.manufacturer_name or "",
                    row.specification_json or "",
                ]
            ).lower()
            if qn not in hay:
                continue
        out.append(_profile_out(session, row))
    return out


def upsert_profile(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    _require(auth, "hardware.manage")
    product_id = body.get("product_id")
    if not product_id:
        raise HTTPException(status_code=400, detail="product_id required")
    product = session.get(Product, product_id)
    if not product or product.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.industry_pack != "hardware":
        raise HTTPException(status_code=400, detail="Product is not a hardware pack item")

    mode = str(body.get("measurement_mode") or "quantity")
    if mode not in MEASUREMENT_MODES:
        raise HTTPException(status_code=400, detail=f"Invalid measurement_mode: {mode}")

    base_uom_id = body.get("base_uom_id") or product.unit_id
    if base_uom_id:
        u = session.get(Unit, base_uom_id)
        if not u or u.company_id != auth.company_id:
            raise HTTPException(status_code=400, detail="Invalid base_uom_id")

    for key in ("default_sales_uom_id", "default_purchase_uom_id", "brand_id"):
        val = body.get(key)
        if not val:
            continue
        if key == "brand_id":
            b = session.get(BrandMaster, val)
            if not b or b.company_id != auth.company_id:
                raise HTTPException(status_code=400, detail="Invalid brand_id")
        else:
            u = session.get(Unit, val)
            if not u or u.company_id != auth.company_id:
                raise HTTPException(status_code=400, detail=f"Invalid {key}")

    row = get_profile(session, auth.company_id, product_id)
    created = row is None
    if not row:
        row = HardwareProductProfile(company_id=auth.company_id, product_id=product_id)
        session.add(row)

    row.brand_id = body.get("brand_id", row.brand_id)
    row.manufacturer_name = body.get("manufacturer_name", row.manufacturer_name)
    row.model_no = body.get("model_no", row.model_no)
    row.material = body.get("material", row.material)
    row.grade = body.get("grade", row.grade)
    if "specification" in body or "specification_json" in body:
        spec = body.get("specification") if "specification" in body else body.get("specification_json")
        row.specification_json = json.dumps(spec) if isinstance(spec, dict) else (spec if isinstance(spec, str) else None)
    row.measurement_mode = mode if "measurement_mode" in body else row.measurement_mode
    row.base_uom_id = base_uom_id if base_uom_id is not None else row.base_uom_id
    if "default_sales_uom_id" in body:
        row.default_sales_uom_id = body.get("default_sales_uom_id")
    if "default_purchase_uom_id" in body:
        row.default_purchase_uom_id = body.get("default_purchase_uom_id")
    if "fractional_qty_allowed" in body:
        row.fractional_qty_allowed = bool(body["fractional_qty_allowed"])
    if "cut_to_length_allowed" in body:
        row.cut_to_length_allowed = bool(body["cut_to_length_allowed"])
    if "minimum_sale_qty" in body:
        row.minimum_sale_qty = float(body["minimum_sale_qty"] or 0) or 1.0
    if "sale_increment" in body:
        row.sale_increment = float(body["sale_increment"] or 0) or 1.0
    if "warranty_months" in body:
        row.warranty_months = body.get("warranty_months")
    if "serial_tracking_optional" in body:
        row.serial_tracking_optional = bool(body["serial_tracking_optional"])
    if "contractor_pricing_enabled" in body:
        row.contractor_pricing_enabled = bool(body["contractor_pricing_enabled"])
    if "bulk_pricing_enabled" in body:
        row.bulk_pricing_enabled = bool(body["bulk_pricing_enabled"])
    if "attributes" in body or "attributes_json" in body:
        attrs = body.get("attributes") if "attributes" in body else body.get("attributes_json")
        row.attributes_json = json.dumps(attrs) if isinstance(attrs, dict) else (attrs if isinstance(attrs, str) else None)
    if "is_active" in body:
        row.is_active = bool(body["is_active"])

    if product.brand_id is None and row.brand_id:
        product.brand_id = row.brand_id
        session.add(product)
    if product.unit_id is None and row.base_uom_id:
        product.unit_id = row.base_uom_id
        session.add(product)

    session.add(row)
    session.flush()
    write_audit(session, auth, "hardware.profile.create" if created else "hardware.profile.update", "hardware_product_profile", row.id, detail={"product_id": product_id, "measurement_mode": row.measurement_mode},
    )
    return _profile_out(session, row)


def list_conversions(session: Session, company_id: str, product_id: str) -> list[dict[str, Any]]:
    rows = session.exec(
        select(ProductUomConversion).where(
            ProductUomConversion.company_id == company_id,
            ProductUomConversion.product_id == product_id,
        )
    ).all()
    return [_conversion_out(r, session) for r in rows]


def upsert_conversion(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    _require(auth, "hardware.uom_manage")
    product_id = body.get("product_id")
    from_uom_id = body.get("from_uom_id")
    to_uom_id = body.get("to_uom_id")
    factor = float(body.get("conversion_factor") or 0)
    if not product_id or not from_uom_id or not to_uom_id:
        raise HTTPException(status_code=400, detail="product_id, from_uom_id, to_uom_id required")
    if factor <= 0:
        raise HTTPException(status_code=400, detail="conversion_factor must be > 0")

    product = session.get(Product, product_id)
    if not product or product.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Product not found")
    for uid in (from_uom_id, to_uom_id):
        u = session.get(Unit, uid)
        if not u or u.company_id != auth.company_id:
            raise HTTPException(status_code=400, detail="Invalid UOM")

    profile = _material_profile(session, auth.company_id, product_id)
    base_uom = (profile.base_uom_id if profile else None) or product.unit_id
    if base_uom and to_uom_id != base_uom and from_uom_id != base_uom:
        # Prefer conversions that normalize to base; allow identity base→base
        if to_uom_id != base_uom:
            raise HTTPException(status_code=400, detail="to_uom_id must be the product base UOM")

    row_id = body.get("id")
    row: ProductUomConversion | None = None
    if row_id:
        row = session.get(ProductUomConversion, row_id)
        if not row or row.company_id != auth.company_id:
            raise HTTPException(status_code=404, detail="Conversion not found")

    # Duplicate active conversion check
    existing = session.exec(
        select(ProductUomConversion).where(
            ProductUomConversion.company_id == auth.company_id,
            ProductUomConversion.product_id == product_id,
            ProductUomConversion.from_uom_id == from_uom_id,
            ProductUomConversion.to_uom_id == to_uom_id,
            ProductUomConversion.is_active == True,  # noqa: E712
            ProductUomConversion.variant_id == body.get("variant_id"),
        )
    ).all()
    for ex in existing:
        if row and ex.id == row.id:
            continue
        if float(ex.conversion_factor) != factor:
            raise HTTPException(status_code=409, detail="Conflicting active conversion already exists")
        raise HTTPException(status_code=409, detail="Duplicate active conversion")

    created = row is None
    if not row:
        row = ProductUomConversion(company_id=auth.company_id, product_id=product_id)
        session.add(row)

    row.variant_id = body.get("variant_id")
    row.from_uom_id = from_uom_id
    row.to_uom_id = to_uom_id
    row.conversion_factor = factor
    row.barcode_id = body.get("barcode_id")
    if "purchase_enabled" in body:
        row.purchase_enabled = bool(body["purchase_enabled"])
    if "sales_enabled" in body:
        row.sales_enabled = bool(body["sales_enabled"])
    if "is_default" in body:
        row.is_default = bool(body["is_default"])
    if "is_active" in body:
        row.is_active = bool(body["is_active"])

    session.add(row)
    session.flush()
    write_audit(session, auth, "hardware.uom.create" if created else "hardware.uom.update", "product_uom_conversion", row.id, detail={"product_id": product_id, "from_uom_id": from_uom_id, "factor": factor},
    )
    return _conversion_out(row, session)


def resolve_conversion_factor(
    session: Session,
    company_id: str,
    product_id: str,
    from_uom_id: str | None,
    *,
    for_sales: bool = True,
    for_purchase: bool = False,
    variant_id: str | None = None,
) -> tuple[float, str | None, str | None]:
    """Return (factor, from_uom_id, base_uom_id). Factor converts entered → base."""
    product = session.get(Product, product_id)
    if not product or product.company_id != company_id:
        raise HTTPException(status_code=404, detail="Product not found")
    profile = _material_profile(session, company_id, product_id)
    base_uom_id = (profile.base_uom_id if profile else None) or product.unit_id
    sales_uom = from_uom_id or (profile.default_sales_uom_id if profile and for_sales else None) or base_uom_id

    if not sales_uom or not base_uom_id or sales_uom == base_uom_id:
        return 1.0, sales_uom or base_uom_id, base_uom_id

    rows = session.exec(
        select(ProductUomConversion).where(
            ProductUomConversion.company_id == company_id,
            ProductUomConversion.product_id == product_id,
            ProductUomConversion.from_uom_id == sales_uom,
            ProductUomConversion.to_uom_id == base_uom_id,
            ProductUomConversion.is_active == True,  # noqa: E712
        )
    ).all()
    if variant_id:
        preferred = [r for r in rows if r.variant_id == variant_id]
        rows = preferred or [r for r in rows if r.variant_id is None]
    else:
        rows = [r for r in rows if r.variant_id is None] or rows

    if for_sales:
        rows = [r for r in rows if r.sales_enabled]
    if for_purchase:
        rows = [r for r in rows if r.purchase_enabled]

    if not rows:
        raise HTTPException(
            status_code=400,
            detail=f"No active UOM conversion from {sales_uom} to base for product",
        )
    return float(rows[0].conversion_factor), sales_uom, base_uom_id


def convert_to_base(
    session: Session,
    company_id: str,
    product_id: str,
    entered_qty: float,
    from_uom_id: str | None,
    *,
    for_sales: bool = True,
    for_purchase: bool = False,
    variant_id: str | None = None,
) -> dict[str, Any]:
    if entered_qty <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be > 0")
    factor, resolved_from, base_uom = resolve_conversion_factor(
        session,
        company_id,
        product_id,
        from_uom_id,
        for_sales=for_sales,
        for_purchase=for_purchase,
        variant_id=variant_id,
    )
    base_qty = round(entered_qty * factor, 6)
    return {
        "entered_qty": entered_qty,
        "from_uom_id": resolved_from,
        "base_uom_id": base_uom,
        "conversion_factor": factor,
        "base_qty": base_qty,
    }


def validate_fractional_qty(
    profile: HardwareProductProfile | BuildingMaterialProfile | StationeryProductProfile | None,
    qty: float,
) -> None:
    if qty <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be > 0")
    if profile and not profile.fractional_qty_allowed:
        if not float(qty).is_integer() and abs(qty - round(qty)) > 1e-9:
            raise HTTPException(status_code=400, detail="Fractional quantity not allowed for this product")
    if profile:
        min_q = float(getattr(profile, "minimum_sale_qty", 0) or 0)
        if min_q > 0 and qty + 1e-9 < min_q:
            raise HTTPException(status_code=400, detail=f"Minimum sale qty is {min_q}")
        incr = float(getattr(profile, "sale_increment", 0) or 0)
        if incr > 0 and min_q >= 0:
            steps = (qty - min_q) / incr
            if abs(steps - round(steps)) > 1e-6 and qty != min_q:
                # allow exact multiples of increment from 0 when min is 1
                if abs((qty / incr) - round(qty / incr)) > 1e-6:
                    raise HTTPException(status_code=400, detail=f"Quantity must be in increments of {incr}")


def quote_price(
    session: Session,
    auth: AuthContext,
    *,
    product_id: str,
    entered_qty: float,
    sales_uom_id: str | None = None,
    customer_id: str | None = None,
    variant_id: str | None = None,
    manual_unit_price: float | None = None,
    override_reason: str | None = None,
    override_permission: str = "hardware.price_override",
    override_audit_action: str = "hardware.price_override",
) -> dict[str, Any]:
    """Quote unit price for entered selling-UOM qty.

    Bulk tier / customer minimum_qty are evaluated in **entered selling UOM qty**
    (not base pieces). Conversion to base is separate via convert_to_base.
    """
    product = session.get(Product, product_id)
    if not product or product.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Product not found")
    profile = _material_profile(session, auth.company_id, product_id)
    validate_fractional_qty(profile, entered_qty)

    conv = convert_to_base(
        session,
        auth.company_id,
        product_id,
        entered_qty,
        sales_uom_id,
        for_sales=True,
        variant_id=variant_id,
    )

    price_source = "STANDARD"
    unit_price = float(product.base_price or 0)
    customer_group: str | None = None
    if customer_id:
        cust = session.get(Customer, customer_id)
        if not cust or cust.company_id != auth.company_id:
            raise HTTPException(status_code=404, detail="Customer not found")
        customer_group = cust.customer_group

    contractor_ok = True
    bulk_ok = True
    if profile is not None:
        contractor_ok = bool(
            getattr(profile, "contractor_pricing_enabled", getattr(profile, "wholesale_enabled", True))
        )
        bulk_ok = bool(
            getattr(profile, "bulk_pricing_enabled", getattr(profile, "wholesale_enabled", True))
        )

    # 1) Explicit customer-product price
    if customer_id and contractor_ok:
        now = _utc_now()
        prices = session.exec(
            select(HardwareCustomerPrice).where(
                HardwareCustomerPrice.company_id == auth.company_id,
                HardwareCustomerPrice.customer_id == customer_id,
                HardwareCustomerPrice.product_id == product_id,
                HardwareCustomerPrice.is_active == True,  # noqa: E712
            )
        ).all()
        matched: HardwareCustomerPrice | None = None
        for p in prices:
            if not _effective(p, now):
                continue
            if p.variant_id and p.variant_id != variant_id:
                continue
            if p.uom_id and p.uom_id != conv["from_uom_id"]:
                continue
            # minimum_qty is in entered selling UOM
            if p.minimum_qty is not None and entered_qty + 1e-9 < float(p.minimum_qty):
                continue
            matched = p
            break
        if matched:
            unit_price = float(matched.unit_price)
            price_source = "CUSTOMER_PRICE"
            if customer_group and customer_group.lower() in {"contractor", "dealer", "wholesale"}:
                price_source = "CONTRACTOR_TIER"

    # 2) Bulk tier (only if no customer price) — min/max qty in entered selling UOM
    if price_source == "STANDARD" and bulk_ok:
        now = _utc_now()
        tiers = session.exec(
            select(HardwareBulkPriceTier).where(
                HardwareBulkPriceTier.company_id == auth.company_id,
                HardwareBulkPriceTier.product_id == product_id,
                HardwareBulkPriceTier.is_active == True,  # noqa: E712
            )
        ).all()
        best: HardwareBulkPriceTier | None = None
        for t in tiers:
            if not _effective(t, now):
                continue
            if t.variant_id and t.variant_id != variant_id:
                continue
            if t.uom_id and t.uom_id != conv["from_uom_id"]:
                continue
            if t.customer_group and customer_group and t.customer_group != customer_group:
                continue
            if t.customer_group and not customer_group:
                continue
            if entered_qty + 1e-9 < float(t.min_qty):
                continue
            if t.max_qty is not None and entered_qty - 1e-9 > float(t.max_qty):
                continue
            if best is None or float(t.min_qty) > float(best.min_qty):
                best = t
        if best:
            unit_price = float(best.unit_price)
            price_source = "BULK_TIER"

    # 3) Manual override
    if manual_unit_price is not None:
        _require(auth, override_permission)
        if abs(float(manual_unit_price) - unit_price) > 1e-6 and not (override_reason or "").strip():
            raise HTTPException(status_code=400, detail="override_reason required for price override")
        unit_price = float(manual_unit_price)
        price_source = "MANUAL_OVERRIDE"
        write_audit(
            session,
            auth,
            override_audit_action,
            "product",
            product_id,
            detail={"unit_price": unit_price, "reason": override_reason, "preview": True},
        )

    line_total = round(unit_price * entered_qty, 2)
    return {
        **conv,
        "product_id": product_id,
        "variant_id": variant_id,
        "customer_id": customer_id,
        "unit_price": unit_price,
        "line_total": line_total,
        "price_source": price_source,
        "measurement_mode": getattr(profile, "measurement_mode", "quantity") if profile else "quantity",
        "fractional_qty_allowed": bool(profile.fractional_qty_allowed) if profile else False,
        "cut_to_length_allowed": bool(getattr(profile, "cut_to_length_allowed", False)) if profile else False,
        "standard_price": float(product.base_price or 0),
        "override_reason": override_reason if price_source == "MANUAL_OVERRIDE" else None,
    }


def list_customer_prices(session: Session, company_id: str, product_id: str | None = None, customer_id: str | None = None) -> list[dict[str, Any]]:
    q = select(HardwareCustomerPrice).where(HardwareCustomerPrice.company_id == company_id)
    if product_id:
        q = q.where(HardwareCustomerPrice.product_id == product_id)
    if customer_id:
        q = q.where(HardwareCustomerPrice.customer_id == customer_id)
    rows = session.exec(q).all()
    return [
        {
            "id": r.id,
            "customer_id": r.customer_id,
            "product_id": r.product_id,
            "variant_id": r.variant_id,
            "uom_id": r.uom_id,
            "unit_price": r.unit_price,
            "minimum_qty": r.minimum_qty,
            "effective_from": r.effective_from.isoformat() if r.effective_from else None,
            "effective_to": r.effective_to.isoformat() if r.effective_to else None,
            "is_active": r.is_active,
        }
        for r in rows
    ]


def upsert_customer_price(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    _require(auth, "hardware.contractor_price_manage")
    customer_id = body.get("customer_id")
    product_id = body.get("product_id")
    unit_price = float(body.get("unit_price") or 0)
    if not customer_id or not product_id:
        raise HTTPException(status_code=400, detail="customer_id and product_id required")
    if unit_price < 0:
        raise HTTPException(status_code=400, detail="unit_price must be >= 0")
    cust = session.get(Customer, customer_id)
    product = session.get(Product, product_id)
    if not cust or cust.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Customer not found")
    if not product or product.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Product not found")

    row: HardwareCustomerPrice | None = None
    if body.get("id"):
        row = session.get(HardwareCustomerPrice, body["id"])
        if not row or row.company_id != auth.company_id:
            raise HTTPException(status_code=404, detail="Price not found")
    created = row is None
    if not row:
        row = HardwareCustomerPrice(company_id=auth.company_id, customer_id=customer_id, product_id=product_id)
        session.add(row)
    row.customer_id = customer_id
    row.product_id = product_id
    row.variant_id = body.get("variant_id")
    row.uom_id = body.get("uom_id")
    row.unit_price = unit_price
    row.minimum_qty = body.get("minimum_qty")
    if "is_active" in body:
        row.is_active = bool(body["is_active"])
    session.add(row)
    session.flush()
    write_audit(session, auth, "hardware.customer_price.create" if created else "hardware.customer_price.update", "hardware_customer_price", row.id, detail={"customer_id": customer_id, "product_id": product_id, "unit_price": unit_price},
    )
    return list_customer_prices(session, auth.company_id, product_id=product_id, customer_id=customer_id)[0]


def list_bulk_tiers(session: Session, company_id: str, product_id: str | None = None) -> list[dict[str, Any]]:
    q = select(HardwareBulkPriceTier).where(HardwareBulkPriceTier.company_id == company_id)
    if product_id:
        q = q.where(HardwareBulkPriceTier.product_id == product_id)
    rows = session.exec(q).all()
    return [
        {
            "id": r.id,
            "product_id": r.product_id,
            "variant_id": r.variant_id,
            "uom_id": r.uom_id,
            "customer_group": r.customer_group,
            "min_qty": r.min_qty,
            "max_qty": r.max_qty,
            "unit_price": r.unit_price,
            "effective_from": r.effective_from.isoformat() if r.effective_from else None,
            "effective_to": r.effective_to.isoformat() if r.effective_to else None,
            "is_active": r.is_active,
        }
        for r in rows
    ]


def _tiers_overlap(a_min: float, a_max: float | None, b_min: float, b_max: float | None) -> bool:
    a_hi = a_max if a_max is not None else math.inf
    b_hi = b_max if b_max is not None else math.inf
    return a_min <= b_hi and b_min <= a_hi


def upsert_bulk_tier(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    _require(auth, "hardware.pricing_manage")
    product_id = body.get("product_id")
    min_qty = float(body.get("min_qty") or 0)
    max_qty = body.get("max_qty")
    max_qty_f = float(max_qty) if max_qty is not None else None
    unit_price = float(body.get("unit_price") or 0)
    if not product_id:
        raise HTTPException(status_code=400, detail="product_id required")
    if min_qty <= 0:
        raise HTTPException(status_code=400, detail="min_qty must be > 0")
    if max_qty_f is not None and max_qty_f < min_qty:
        raise HTTPException(status_code=400, detail="max_qty must be >= min_qty")
    if unit_price < 0:
        raise HTTPException(status_code=400, detail="unit_price must be >= 0")
    product = session.get(Product, product_id)
    if not product or product.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Product not found")

    uom_id = body.get("uom_id")
    customer_group = body.get("customer_group")
    variant_id = body.get("variant_id")

    existing = session.exec(
        select(HardwareBulkPriceTier).where(
            HardwareBulkPriceTier.company_id == auth.company_id,
            HardwareBulkPriceTier.product_id == product_id,
            HardwareBulkPriceTier.is_active == True,  # noqa: E712
        )
    ).all()

    row: HardwareBulkPriceTier | None = None
    if body.get("id"):
        row = session.get(HardwareBulkPriceTier, body["id"])
        if not row or row.company_id != auth.company_id:
            raise HTTPException(status_code=404, detail="Tier not found")

    for ex in existing:
        if row and ex.id == row.id:
            continue
        if (ex.uom_id or None) != (uom_id or None):
            continue
        if (ex.customer_group or None) != (customer_group or None):
            continue
        if (ex.variant_id or None) != (variant_id or None):
            continue
        if _tiers_overlap(min_qty, max_qty_f, float(ex.min_qty), float(ex.max_qty) if ex.max_qty is not None else None):
            raise HTTPException(status_code=409, detail="Overlapping bulk price tier for same scope")

    created = row is None
    if not row:
        row = HardwareBulkPriceTier(company_id=auth.company_id, product_id=product_id)
        session.add(row)
    row.product_id = product_id
    row.variant_id = variant_id
    row.uom_id = uom_id
    row.customer_group = customer_group
    row.min_qty = min_qty
    row.max_qty = max_qty_f
    row.unit_price = unit_price
    if "is_active" in body:
        row.is_active = bool(body["is_active"])
    session.add(row)
    session.flush()
    write_audit(session, auth, "hardware.bulk_tier.create" if created else "hardware.bulk_tier.update", "hardware_bulk_price_tier", row.id, detail={"product_id": product_id, "min_qty": min_qty, "unit_price": unit_price},
    )
    return list_bulk_tiers(session, auth.company_id, product_id=product_id)[-1]


def resolve_barcode(session: Session, company_id: str, barcode: str) -> dict[str, Any]:
    code = (barcode or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="barcode required")
    row = session.exec(
        select(ProductBarcode).where(
            ProductBarcode.company_id == company_id,
            ProductBarcode.barcode == code,
            ProductBarcode.is_active == True,  # noqa: E712
        )
    ).first()
    product: Product | None = None
    if row:
        product = session.get(Product, row.product_id)
    if not product:
        product = session.exec(
            select(Product).where(Product.company_id == company_id, Product.barcode == code)
        ).first()
    if not product or product.company_id != company_id:
        raise HTTPException(status_code=404, detail="Barcode not found")
    profile = _material_profile(session, company_id, product.id)
    sales_uom = (row.uom_id if row and row.uom_id else None) or (
        profile.default_sales_uom_id if profile else None
    ) or product.unit_id
    packaging_qty = row.packaging_qty if row and row.packaging_qty else None
    factor = 1.0
    base_uom = (profile.base_uom_id if profile else None) or product.unit_id
    if sales_uom and base_uom and sales_uom != base_uom:
        try:
            factor, _, _ = resolve_conversion_factor(
                session, company_id, product.id, sales_uom, for_sales=True, variant_id=row.variant_id if row else None
            )
        except HTTPException:
            factor = float(packaging_qty or 1)
    hw_profile = get_profile(session, company_id, product.id)
    return {
        "product_id": product.id,
        "sku": product.sku,
        "name": product.name,
        "variant_id": row.variant_id if row else None,
        "barcode": code,
        "sales_uom_id": sales_uom,
        "packaging_qty": packaging_qty,
        "conversion_factor": factor,
        "base_uom_id": base_uom,
        "profile": _profile_out(session, hw_profile) if hw_profile else None,
    }


def prepare_sale_line_meta(
    session: Session,
    auth: AuthContext,
    line: Any,
    customer_id: str | None = None,
) -> dict[str, Any]:
    """Validate and enrich hardware sale line meta; returns authoritative meta."""
    meta = dict(getattr(line, "meta", None) or {})
    product_id = getattr(line, "product_id", None) or meta.get("product_id")
    if not product_id:
        raise ValueError("product_id required for hardware sale line")
    entered_qty = float(meta.get("entered_qty") or getattr(line, "qty", 0) or 0)
    sales_uom_id = meta.get("sales_uom_id") or meta.get("uom_id")
    manual = meta.get("manual_unit_price")
    if manual is None and meta.get("price_source") == "MANUAL_OVERRIDE":
        manual = getattr(line, "unit_price", None)
    quote = quote_price(
        session,
        auth,
        product_id=str(product_id),
        entered_qty=entered_qty,
        sales_uom_id=sales_uom_id,
        customer_id=customer_id or meta.get("customer_id"),
        variant_id=meta.get("variant_id"),
        manual_unit_price=float(manual) if manual is not None else None,
        override_reason=meta.get("price_override_reason") or meta.get("override_reason"),
    )
    # Never trust client base_qty / price blindly
    meta.update(
        {
            "entered_qty": quote["entered_qty"],
            "sales_uom_id": quote["from_uom_id"],
            "conversion_factor": quote["conversion_factor"],
            "base_qty": quote["base_qty"],
            "base_uom_id": quote["base_uom_id"],
            "price_source": quote["price_source"],
            "unit_price": quote["unit_price"],
            "measurement_mode": quote["measurement_mode"],
            "price_override_reason": quote.get("override_reason"),
        }
    )
    # Mutate line amounts to server quote
    if hasattr(line, "qty"):
        line.qty = quote["entered_qty"]
    if hasattr(line, "unit_price"):
        line.unit_price = quote["unit_price"]
    if hasattr(line, "meta"):
        line.meta = meta
    if quote["price_source"] == "MANUAL_OVERRIDE":
        write_audit(session, auth, "hardware.price_override", "product", str(product_id), detail={
                "unit_price": quote["unit_price"],
                "standard_price": quote.get("standard_price"),
                "reason": quote.get("override_reason"),
            },
        )
    return meta


def validate_hardware_sale_lines(
    session: Session,
    auth: AuthContext,
    lines: list,
    customer_id: str | None = None,
) -> None:
    for line in lines:
        prepare_sale_line_meta(session, auth, line, customer_id=customer_id)


def save_hardware_line_extension(
    session: Session,
    line_id: str,
    meta: dict[str, Any],
) -> None:
    session.add(
        HardwareSalesLineExtension(
            line_id=line_id,
            sales_uom_id=meta.get("sales_uom_id"),
            entered_qty=float(meta.get("entered_qty") or 0),
            conversion_factor=float(meta.get("conversion_factor") or 1),
            base_qty=float(meta.get("base_qty") or 0),
            base_uom_id=meta.get("base_uom_id"),
            price_source=str(meta.get("price_source") or "STANDARD"),
            unit_price=float(meta.get("unit_price") or 0),
            measurement_mode=meta.get("measurement_mode"),
            measurement_meta_json=json.dumps(meta.get("measurement")) if meta.get("measurement") else None,
            price_override_reason=meta.get("price_override_reason"),
        )
    )


def hardware_stock_qty_from_meta(meta: dict[str, Any] | None, fallback_qty: float) -> float:
    if not meta:
        return fallback_qty
    base = meta.get("base_qty")
    if base is None:
        return fallback_qty
    return float(base)


def validate_hardware_return_lines(session: Session, auth: AuthContext, inv: Any, lines_in: list) -> None:
    """Ensure return base qty does not exceed remaining sold base qty."""
    from app.models.operations import SalesReturn, SalesReturnLine
    from app.models.sales import SalesInvoiceLine

    for ln in lines_in:
        inv_line = session.get(SalesInvoiceLine, ln.get("invoice_line_id") or ln.get("line_id"))
        if not inv_line or inv_line.invoice_id != inv.id:
            raise HTTPException(status_code=400, detail="Invalid invoice line")
        inv_meta: dict[str, Any] = {}
        if inv_line.meta_json:
            try:
                inv_meta = json.loads(inv_line.meta_json)
            except json.JSONDecodeError:
                inv_meta = {}
        sold_base = float(inv_meta.get("base_qty") or inv_line.qty)
        factor = float(inv_meta.get("conversion_factor") or 1)
        ret_meta = ln.get("meta") or {}
        if ret_meta.get("base_qty") is not None:
            return_base = float(ret_meta["base_qty"])
        elif ret_meta.get("entered_qty") is not None:
            return_base = float(ret_meta["entered_qty"]) * factor
        else:
            # qty interpreted in original sales UOM
            return_base = float(ln.get("qty") or 0) * factor

        # Sum prior returned base
        prior = 0.0
        rets = session.exec(select(SalesReturn).where(SalesReturn.invoice_id == inv.id)).all()
        for r in rets:
            for rl in session.exec(select(SalesReturnLine).where(SalesReturnLine.return_id == r.id)).all():
                if rl.invoice_line_id != inv_line.id:
                    continue
                rm: dict[str, Any] = {}
                if rl.meta_json:
                    try:
                        rm = json.loads(rl.meta_json)
                    except json.JSONDecodeError:
                        rm = {}
                prior += float(rm.get("base_qty") or (float(rl.qty) * factor))

        if return_base <= 0:
            raise HTTPException(status_code=400, detail="Return qty must be > 0")
        if prior + return_base - sold_base > 1e-6:
            raise HTTPException(status_code=400, detail="Return base qty exceeds remaining sold base qty")
        # Enrich line meta for stock restore
        ln["meta"] = {
            **ret_meta,
            **{k: inv_meta.get(k) for k in ("sales_uom_id", "conversion_factor", "base_uom_id", "variant_id")},
            "base_qty": return_base,
            "entered_qty": ret_meta.get("entered_qty", ln.get("qty")),
        }
