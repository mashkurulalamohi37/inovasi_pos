"""Stationery vertical — profiles, school lists, UOM/pricing via hardware helpers."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException
from sqlmodel import Session, select

from app.dependencies import AuthContext, write_audit
from app.models.industry import (
    HardwareBulkPriceTier,
    HardwareCustomerPrice,
    StationeryProductProfile,
    StationerySalesLineExtension,
    StationerySchoolList,
    StationerySchoolListItem,
)
from app.models.inventory import StockBalance
from app.models.product import BrandMaster, Customer, Product, ProductVariant, Unit
from app.rbac import role_has_permission
from app.services import hardware_service as hw

LIST_STATUSES = {"draft", "active", "archived"}


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


def _parse_dt(raw: Any) -> Optional[datetime]:
    if not raw:
        return None
    if isinstance(raw, datetime):
        return raw
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return None


def _unit_out(u: Unit | None) -> dict[str, Any] | None:
    if not u:
        return None
    return {"id": u.id, "code": u.code, "name": u.name}


def _stock_qty(session: Session, company_id: str, product_id: str, store_id: str | None) -> float:
    stmt = select(StockBalance).where(
        StockBalance.company_id == company_id,
        StockBalance.product_id == product_id,
    )
    if store_id:
        stmt = stmt.where(StockBalance.store_id == store_id)
    rows = session.exec(stmt).all()
    return sum(max(0.0, (b.qty_on_hand or 0) - (b.qty_reserved or 0)) for b in rows)


def _availability_status(stock_base_qty: float, base_qty_required: float) -> str:
    if stock_base_qty <= 0:
        return "out_of_stock"
    if stock_base_qty + 1e-9 < base_qty_required:
        return "partial"
    return "available"


def _is_stationery_product(session: Session, company_id: str, product_id: str) -> bool:
    product = session.get(Product, product_id)
    if not product or product.company_id != company_id:
        return False
    if product.industry_pack == "stationery":
        return True
    return hw.get_stationery_profile(session, company_id, product_id) is not None


def _assert_stationery_product(session: Session, company_id: str, product_id: str) -> Product:
    product = session.get(Product, product_id)
    if not product or product.company_id != company_id:
        raise HTTPException(status_code=404, detail="Product not found")
    if not _is_stationery_product(session, company_id, product_id):
        raise HTTPException(status_code=400, detail="Product is not a stationery pack item")
    return product


def get_profile(session: Session, company_id: str, product_id: str) -> StationeryProductProfile | None:
    return hw.get_stationery_profile(session, company_id, product_id)


def _profile_out(
    session: Session,
    p: StationeryProductProfile,
    *,
    store_id: str | None = None,
) -> dict[str, Any]:
    product = session.get(Product, p.product_id)
    brand = session.get(BrandMaster, p.brand_id) if p.brand_id else None
    base = session.get(Unit, p.base_uom_id) if p.base_uom_id else None
    sales = session.get(Unit, p.default_sales_uom_id) if p.default_sales_uom_id else None
    purchase = session.get(Unit, p.default_purchase_uom_id) if p.default_purchase_uom_id else None
    stock = _stock_qty(session, p.company_id, p.product_id, store_id) if store_id else None
    return {
        "id": p.id,
        "product_id": p.product_id,
        "sku": product.sku if product else None,
        "name": product.name if product else None,
        "base_price": product.base_price if product else None,
        "stationery_type": p.stationery_type,
        "brand_id": p.brand_id,
        "brand_name": brand.name if brand else None,
        "manufacturer_name": p.manufacturer_name,
        "model_no": p.model_no,
        "color": p.color,
        "size": p.size,
        "paper_size": p.paper_size,
        "page_count": p.page_count,
        "paper_gsm": p.paper_gsm,
        "ruling_type": p.ruling_type,
        "tip_size": p.tip_size,
        "ink_color": p.ink_color,
        "material": p.material,
        "base_uom_id": p.base_uom_id,
        "base_uom": _unit_out(base),
        "default_sales_uom_id": p.default_sales_uom_id,
        "default_sales_uom": _unit_out(sales),
        "default_purchase_uom_id": p.default_purchase_uom_id,
        "default_purchase_uom": _unit_out(purchase),
        "fractional_qty_allowed": p.fractional_qty_allowed,
        "school_list_eligible": p.school_list_eligible,
        "wholesale_enabled": p.wholesale_enabled,
        "attributes": _parse_json(p.attributes_json),
        "is_active": p.is_active,
        "stock_qty": stock,
    }


def list_profiles(
    session: Session,
    company_id: str,
    *,
    q: str | None = None,
    brand_id: str | None = None,
    stationery_type: str | None = None,
    color: str | None = None,
    active_only: bool = True,
    store_id: str | None = None,
) -> list[dict[str, Any]]:
    rows = session.exec(
        select(StationeryProductProfile).where(StationeryProductProfile.company_id == company_id)
    ).all()
    out: list[dict[str, Any]] = []
    qn = (q or "").strip().lower()
    for row in rows:
        if active_only and not row.is_active:
            continue
        if brand_id and row.brand_id != brand_id:
            continue
        if stationery_type and (row.stationery_type or "").lower() != stationery_type.lower():
            continue
        if color and (row.color or "").lower() != color.lower():
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
                    row.stationery_type or "",
                    row.color or "",
                    row.ink_color or "",
                    row.manufacturer_name or "",
                ]
            ).lower()
            if qn not in hay:
                continue
        out.append(_profile_out(session, row, store_id=store_id))
    return out


def upsert_profile(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    _require(auth, "stationery.product_manage")
    product_id = body.get("product_id")
    if not product_id:
        raise HTTPException(status_code=400, detail="product_id required")
    product = session.get(Product, product_id)
    if not product or product.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.industry_pack != "stationery":
        raise HTTPException(status_code=400, detail="Product is not a stationery pack item")

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
        row = StationeryProductProfile(company_id=auth.company_id, product_id=product_id)
        session.add(row)

    for field in (
        "stationery_type",
        "brand_id",
        "manufacturer_name",
        "model_no",
        "color",
        "size",
        "paper_size",
        "ruling_type",
        "tip_size",
        "ink_color",
        "material",
    ):
        if field in body:
            setattr(row, field, body.get(field))
    if "page_count" in body:
        row.page_count = int(body["page_count"]) if body.get("page_count") is not None else None
    if "paper_gsm" in body:
        row.paper_gsm = float(body["paper_gsm"]) if body.get("paper_gsm") is not None else None
    if base_uom_id is not None:
        row.base_uom_id = base_uom_id
    if "default_sales_uom_id" in body:
        row.default_sales_uom_id = body.get("default_sales_uom_id")
    if "default_purchase_uom_id" in body:
        row.default_purchase_uom_id = body.get("default_purchase_uom_id")
    if "fractional_qty_allowed" in body:
        row.fractional_qty_allowed = bool(body["fractional_qty_allowed"])
    if "school_list_eligible" in body:
        row.school_list_eligible = bool(body["school_list_eligible"])
    if "wholesale_enabled" in body:
        row.wholesale_enabled = bool(body["wholesale_enabled"])
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
    write_audit(
        session,
        auth,
        "stationery.profile.create" if created else "stationery.profile.update",
        "stationery_product_profile",
        row.id,
        detail={"product_id": product_id, "stationery_type": row.stationery_type},
    )
    return _profile_out(session, row)


def quote(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    """Wrap hardware convert + quote_price for stationery products."""
    product_id = str(body.get("product_id") or "")
    if not product_id:
        raise HTTPException(status_code=400, detail="product_id required")
    _assert_stationery_product(session, auth.company_id, product_id)
    entered_qty = float(body.get("entered_qty") or body.get("qty") or 0)
    store_id = body.get("store_id")
    result = hw.quote_price(
        session,
        auth,
        product_id=product_id,
        entered_qty=entered_qty,
        sales_uom_id=body.get("sales_uom_id") or body.get("from_uom_id"),
        customer_id=body.get("customer_id"),
        variant_id=body.get("variant_id"),
        manual_unit_price=body.get("manual_unit_price"),
        override_reason=body.get("override_reason") or body.get("price_override_reason"),
        override_permission="stationery.price_override",
        override_audit_action="stationery.price_override",
    )
    stock_base = _stock_qty(session, auth.company_id, product_id, store_id) if store_id else _stock_qty(
        session, auth.company_id, product_id, None
    )
    return {
        **result,
        "from_uom_id": result.get("from_uom_id"),
        "stock_base_qty": stock_base,
    }


def resolve_barcode(session: Session, company_id: str, code: str) -> dict[str, Any]:
    data = hw.resolve_barcode(session, company_id, code)
    product_id = data.get("product_id")
    if not product_id or not _is_stationery_product(session, company_id, str(product_id)):
        raise HTTPException(status_code=404, detail="Barcode not found for stationery product")
    profile = get_profile(session, company_id, str(product_id))
    data["profile"] = _profile_out(session, profile) if profile else None
    return data


def list_customer_prices(
    session: Session,
    company_id: str,
    *,
    product_id: str | None = None,
    customer_id: str | None = None,
) -> list[dict[str, Any]]:
    rows = hw.list_customer_prices(session, company_id, product_id=product_id, customer_id=customer_id)
    return [r for r in rows if _is_stationery_product(session, company_id, r["product_id"])]


def upsert_customer_price(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    _require(auth, "stationery.pricing_manage")
    product_id = body.get("product_id")
    customer_id = body.get("customer_id")
    unit_price = float(body.get("unit_price") or 0)
    if not customer_id or not product_id:
        raise HTTPException(status_code=400, detail="customer_id and product_id required")
    if unit_price < 0:
        raise HTTPException(status_code=400, detail="unit_price must be >= 0")
    _assert_stationery_product(session, auth.company_id, product_id)
    cust = session.get(Customer, customer_id)
    if not cust or cust.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Customer not found")

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
    write_audit(
        session,
        auth,
        "stationery.customer_price.create" if created else "stationery.customer_price.update",
        "hardware_customer_price",
        row.id,
        detail={"customer_id": customer_id, "product_id": product_id, "unit_price": unit_price},
    )
    return list_customer_prices(session, auth.company_id, product_id=product_id, customer_id=customer_id)[0]


def list_bulk_tiers(
    session: Session,
    company_id: str,
    *,
    product_id: str | None = None,
) -> list[dict[str, Any]]:
    rows = hw.list_bulk_tiers(session, company_id, product_id=product_id)
    return [r for r in rows if _is_stationery_product(session, company_id, r["product_id"])]


def upsert_bulk_tier(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    _require(auth, "stationery.pricing_manage")
    product_id = body.get("product_id")
    if not product_id:
        raise HTTPException(status_code=400, detail="product_id required")
    _assert_stationery_product(session, auth.company_id, product_id)
    # Reuse hardware upsert logic but with stationery permission already checked —
    # temporarily elevate by calling after clearing hardware perm check via direct write.
    min_qty = float(body.get("min_qty") or 0)
    max_qty = body.get("max_qty")
    max_qty_f = float(max_qty) if max_qty is not None else None
    unit_price = float(body.get("unit_price") or 0)
    if min_qty <= 0:
        raise HTTPException(status_code=400, detail="min_qty must be > 0")
    if max_qty_f is not None and max_qty_f < min_qty:
        raise HTTPException(status_code=400, detail="max_qty must be >= min_qty")
    if unit_price < 0:
        raise HTTPException(status_code=400, detail="unit_price must be >= 0")

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
        if hw._tiers_overlap(min_qty, max_qty_f, float(ex.min_qty), float(ex.max_qty) if ex.max_qty is not None else None):
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
    write_audit(
        session,
        auth,
        "stationery.bulk_tier.create" if created else "stationery.bulk_tier.update",
        "hardware_bulk_price_tier",
        row.id,
        detail={"product_id": product_id, "min_qty": min_qty, "unit_price": unit_price},
    )
    return list_bulk_tiers(session, auth.company_id, product_id=product_id)[-1]


# --- School lists ---


def _variant_key(variant_id: str | None) -> str:
    return variant_id or ""


def _list_item_out(
    session: Session,
    company_id: str,
    item: StationerySchoolListItem,
    *,
    store_id: str | None = None,
) -> dict[str, Any]:
    product = session.get(Product, item.product_id)
    profile = get_profile(session, company_id, item.product_id)
    brand = session.get(BrandMaster, item.preferred_brand_id) if item.preferred_brand_id else None
    sales_uom = session.get(Unit, item.sales_uom_id) if item.sales_uom_id else None
    required_qty = float(item.recommended_qty or 1)
    base_qty_required = required_qty
    if item.sales_uom_id:
        try:
            conv = hw.convert_to_base(
                session,
                company_id,
                item.product_id,
                required_qty,
                item.sales_uom_id,
                for_sales=True,
                variant_id=item.variant_id,
            )
            base_qty_required = float(conv["base_qty"])
        except HTTPException:
            base_qty_required = required_qty
    stock_base = _stock_qty(session, company_id, item.product_id, store_id) if store_id else None
    status = (
        _availability_status(stock_base or 0, base_qty_required) if store_id is not None else None
    )
    return {
        "id": item.id,
        "list_id": item.list_id,
        "product_id": item.product_id,
        "variant_id": item.variant_id,
        "sku": product.sku if product else None,
        "name": product.name if product else None,
        "sequence_no": item.sequence_no,
        "required_flag": item.required_flag,
        "recommended_qty": item.recommended_qty,
        "required_qty": required_qty,
        "sales_uom_id": item.sales_uom_id,
        "sales_uom": _unit_out(sales_uom),
        "preferred_brand_id": item.preferred_brand_id,
        "preferred_brand_name": brand.name if brand else None,
        "notes": item.notes,
        "alternative_group": item.alternative_group,
        "base_qty_required": base_qty_required,
        "stock_base_qty": stock_base,
        "availability": status,
        "brand_name": (session.get(BrandMaster, profile.brand_id).name if profile and profile.brand_id and session.get(BrandMaster, profile.brand_id) else None),
        "stationery_type": profile.stationery_type if profile else None,
        "color": profile.color if profile else None,
    }


def _list_out(
    session: Session,
    row: StationerySchoolList,
    *,
    include_items: bool = False,
    store_id: str | None = None,
) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": row.id,
        "list_code": row.list_code,
        "list_name": row.list_name,
        "institution_name": row.institution_name,
        "school_name": row.school_name,
        "curriculum": row.curriculum,
        "board": row.board,
        "class_or_grade": row.class_or_grade,
        "section": row.section,
        "academic_year": row.academic_year,
        "language_version": row.language_version,
        "valid_from": row.valid_from.isoformat() if row.valid_from else None,
        "valid_to": row.valid_to.isoformat() if row.valid_to else None,
        "status": row.status,
        "notes": row.notes,
        "created_by": row.created_by,
    }
    if include_items:
        items = session.exec(
            select(StationerySchoolListItem).where(StationerySchoolListItem.list_id == row.id)
        ).all()
        items = sorted(items, key=lambda x: (x.sequence_no or 0, x.id))
        data["items"] = [
            _list_item_out(session, row.company_id, it, store_id=store_id) for it in items
        ]
    return data


def list_school_lists(
    session: Session,
    company_id: str,
    *,
    q: str | None = None,
    status: str | None = None,
    class_or_grade: str | None = None,
    academic_year: str | None = None,
    board: str | None = None,
    school_name: str | None = None,
) -> list[dict[str, Any]]:
    rows = session.exec(
        select(StationerySchoolList).where(StationerySchoolList.company_id == company_id)
    ).all()
    qn = (q or "").strip().lower()
    out: list[dict[str, Any]] = []
    for row in rows:
        if status and row.status != status:
            continue
        if class_or_grade and row.class_or_grade != class_or_grade:
            continue
        if academic_year and row.academic_year != academic_year:
            continue
        if board and (row.board or "").lower() != board.lower():
            continue
        if school_name and (row.school_name or "").lower() != school_name.lower():
            continue
        if qn:
            hay = " ".join(
                [
                    row.list_code or "",
                    row.list_name or "",
                    row.school_name or "",
                    row.institution_name or "",
                    row.board or "",
                ]
            ).lower()
            if qn not in hay:
                continue
        out.append(_list_out(session, row))
    return out


def get_school_list(
    session: Session,
    auth: AuthContext,
    list_id: str,
    *,
    store_id: str | None = None,
) -> dict[str, Any]:
    row = session.get(StationerySchoolList, list_id)
    if not row or row.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="School list not found")
    return _list_out(session, row, include_items=True, store_id=store_id)


def upsert_school_list(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    _require(auth, "stationery.school_list_manage")
    list_id = body.get("id")
    code = (body.get("list_code") or "").strip()
    name = (body.get("list_name") or "").strip()
    if not code or not name:
        raise HTTPException(status_code=400, detail="list_code and list_name required")

    row: StationerySchoolList | None = None
    if list_id:
        row = session.get(StationerySchoolList, list_id)
        if not row or row.company_id != auth.company_id:
            raise HTTPException(status_code=404, detail="School list not found")
    else:
        existing = session.exec(
            select(StationerySchoolList).where(
                StationerySchoolList.company_id == auth.company_id,
                StationerySchoolList.list_code == code,
            )
        ).first()
        if existing:
            row = existing

    created = row is None
    if not row:
        row = StationerySchoolList(
            company_id=auth.company_id,
            list_code=code,
            list_name=name,
            created_by=auth.user_id,
        )
        session.add(row)

    row.list_code = code
    row.list_name = name
    for field in (
        "institution_name",
        "school_name",
        "curriculum",
        "board",
        "class_or_grade",
        "section",
        "academic_year",
        "language_version",
        "notes",
    ):
        if field in body:
            setattr(row, field, body.get(field))
    if "valid_from" in body:
        row.valid_from = _parse_dt(body.get("valid_from"))
    if "valid_to" in body:
        row.valid_to = _parse_dt(body.get("valid_to"))
    if "status" in body:
        st = str(body["status"]).strip().lower()
        if st not in LIST_STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid status: {st}")
        row.status = st
    row.updated_at = _utc_now()
    session.flush()

    if "items" in body and isinstance(body["items"], list):
        for item_body in body["items"]:
            upsert_item(session, auth, row.id, item_body, _skip_perm=True)

    write_audit(
        session,
        auth,
        "stationery.school_list.create" if created else "stationery.school_list.update",
        "stationery_school_list",
        row.id,
        detail={"list_code": row.list_code, "status": row.status},
    )
    return _list_out(session, row, include_items=True)


def set_status(session: Session, auth: AuthContext, list_id: str, status: str) -> dict[str, Any]:
    _require(auth, "stationery.school_list_manage")
    row = session.get(StationerySchoolList, list_id)
    if not row or row.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="School list not found")
    st = (status or "").strip().lower()
    if st not in LIST_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status: {st}")
    row.status = st
    row.updated_at = _utc_now()
    session.flush()
    write_audit(
        session,
        auth,
        "stationery.school_list.status",
        "stationery_school_list",
        row.id,
        detail={"status": st},
    )
    return _list_out(session, row, include_items=True)


def upsert_item(
    session: Session,
    auth: AuthContext,
    list_id: str,
    body: dict[str, Any],
    *,
    _skip_perm: bool = False,
) -> dict[str, Any]:
    if not _skip_perm:
        _require(auth, "stationery.school_list_manage")
    lst = session.get(StationerySchoolList, list_id)
    if not lst or lst.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="School list not found")

    product_id = body.get("product_id")
    if not product_id:
        raise HTTPException(status_code=400, detail="product_id required")
    product = session.get(Product, product_id)
    if not product or product.company_id != auth.company_id:
        raise HTTPException(status_code=400, detail="Product not found or cross-tenant")

    variant_id = body.get("variant_id")
    if variant_id:
        variant = session.get(ProductVariant, variant_id)
        if not variant or variant.company_id != auth.company_id:
            raise HTTPException(status_code=400, detail="Variant not found or cross-tenant")
        if variant.product_id != product_id:
            raise HTTPException(status_code=400, detail="Variant does not belong to product")

    if body.get("preferred_brand_id"):
        b = session.get(BrandMaster, body["preferred_brand_id"])
        if not b or b.company_id != auth.company_id:
            raise HTTPException(status_code=400, detail="Invalid preferred_brand_id")
    if body.get("sales_uom_id"):
        u = session.get(Unit, body["sales_uom_id"])
        if not u or u.company_id != auth.company_id:
            raise HTTPException(status_code=400, detail="Invalid sales_uom_id")

    item_id = body.get("id")
    row: StationerySchoolListItem | None = None
    if item_id:
        row = session.get(StationerySchoolListItem, item_id)
        if not row or row.list_id != list_id:
            raise HTTPException(status_code=404, detail="List item not found")
    else:
        existing_rows = session.exec(
            select(StationerySchoolListItem).where(
                StationerySchoolListItem.list_id == list_id,
                StationerySchoolListItem.product_id == product_id,
            )
        ).all()
        for ex in existing_rows:
            if _variant_key(ex.variant_id) == _variant_key(variant_id):
                raise HTTPException(status_code=409, detail="Product/variant already on this school list")

    created = row is None
    if not row:
        row = StationerySchoolListItem(list_id=list_id, product_id=product_id)
        session.add(row)

    row.product_id = product_id
    row.variant_id = variant_id
    if "sequence_no" in body:
        row.sequence_no = int(body.get("sequence_no") or 0)
    if "required_flag" in body:
        row.required_flag = bool(body["required_flag"])
    if "recommended_qty" in body:
        row.recommended_qty = float(body.get("recommended_qty") or 1)
    if "sales_uom_id" in body:
        row.sales_uom_id = body.get("sales_uom_id")
    if "preferred_brand_id" in body:
        row.preferred_brand_id = body.get("preferred_brand_id")
    if "notes" in body:
        row.notes = body.get("notes")
    if "alternative_group" in body:
        row.alternative_group = body.get("alternative_group")
    row.updated_at = _utc_now()
    session.flush()
    write_audit(
        session,
        auth,
        "stationery.school_list_item.create" if created else "stationery.school_list_item.update",
        "stationery_school_list_item",
        row.id,
        detail={"list_id": list_id, "product_id": product_id},
    )
    return _list_item_out(session, auth.company_id, row)


def remove_item(session: Session, auth: AuthContext, list_id: str, item_id: str) -> dict[str, Any]:
    _require(auth, "stationery.school_list_manage")
    lst = session.get(StationerySchoolList, list_id)
    if not lst or lst.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="School list not found")
    row = session.get(StationerySchoolListItem, item_id)
    if not row or row.list_id != list_id:
        raise HTTPException(status_code=404, detail="List item not found")
    session.delete(row)
    session.flush()
    write_audit(
        session,
        auth,
        "stationery.school_list_item.delete",
        "stationery_school_list_item",
        item_id,
        detail={"list_id": list_id},
    )
    return {"ok": True, "id": item_id}


def availability(session: Session, auth: AuthContext, list_id: str, store_id: str) -> list[dict[str, Any]]:
    if not store_id:
        raise HTTPException(status_code=400, detail="store_id required")
    lst = session.get(StationerySchoolList, list_id)
    if not lst or lst.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="School list not found")
    items = session.exec(
        select(StationerySchoolListItem).where(StationerySchoolListItem.list_id == list_id)
    ).all()
    return [
        _list_item_out(session, auth.company_id, item, store_id=store_id) for item in items
    ]


def cart_resolve(session: Session, auth: AuthContext, list_id: str, body: dict[str, Any]) -> dict[str, Any]:
    """Resolve school list into cart buckets. Never claims full success when any item is OOS/partial."""
    store_id = body.get("store_id")
    if not store_id:
        raise HTTPException(status_code=400, detail="store_id required")
    lst = session.get(StationerySchoolList, list_id)
    if not lst or lst.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="School list not found")

    filter_ids = body.get("product_ids")
    filter_set = set(filter_ids) if filter_ids else None

    items = session.exec(
        select(StationerySchoolListItem).where(StationerySchoolListItem.list_id == list_id)
    ).all()
    available_items: list[dict[str, Any]] = []
    partial_items: list[dict[str, Any]] = []
    unavailable_items: list[dict[str, Any]] = []

    for item in items:
        if filter_set is not None and item.product_id not in filter_set:
            continue
        row = _list_item_out(session, auth.company_id, item, store_id=store_id)
        status = row["availability"]
        required_qty = float(row["required_qty"])
        stock_base = float(row["stock_base_qty"] or 0)
        base_required = float(row["base_qty_required"] or required_qty)
        factor = (base_required / required_qty) if required_qty else 1.0
        max_available_qty = round(stock_base / factor, 6) if factor else stock_base
        entry = {
            **row,
            "qty": required_qty,
            "max_available_qty": max(0.0, max_available_qty),
            "unit_price": (session.get(Product, item.product_id).base_price if session.get(Product, item.product_id) else None),
        }
        if status == "available":
            available_items.append(entry)
        elif status == "partial":
            # Offer max available in selling UOM; never claim full list success
            entry["qty"] = max_available_qty
            partial_items.append(entry)
        else:
            unavailable_items.append(entry)

    all_available = len(partial_items) == 0 and len(unavailable_items) == 0 and len(available_items) > 0
    return {
        "list_id": list_id,
        "store_id": store_id,
        "available_items": available_items,
        "partial_items": partial_items,
        "unavailable_items": unavailable_items,
        "all_available": all_available,
    }


def prepare_sale_line_meta(
    session: Session,
    auth: AuthContext,
    line: Any,
    customer_id: str | None = None,
) -> dict[str, Any]:
    meta = dict(getattr(line, "meta", None) or {})
    product_id = getattr(line, "product_id", None) or meta.get("product_id")
    if not product_id:
        raise ValueError("product_id required for stationery sale line")
    entered_qty = float(meta.get("entered_qty") or getattr(line, "qty", 0) or 0)
    sales_uom_id = meta.get("sales_uom_id") or meta.get("uom_id")
    manual = meta.get("manual_unit_price")
    if manual is None and meta.get("price_source") == "MANUAL_OVERRIDE":
        manual = getattr(line, "unit_price", None)
    quote_result = hw.quote_price(
        session,
        auth,
        product_id=str(product_id),
        entered_qty=entered_qty,
        sales_uom_id=sales_uom_id,
        customer_id=customer_id or meta.get("customer_id"),
        variant_id=meta.get("variant_id"),
        manual_unit_price=float(manual) if manual is not None else None,
        override_reason=meta.get("price_override_reason") or meta.get("override_reason"),
        override_permission="stationery.price_override",
        override_audit_action="stationery.price_override",
    )
    meta.update(
        {
            "entered_qty": quote_result["entered_qty"],
            "sales_uom_id": quote_result["from_uom_id"],
            "conversion_factor": quote_result["conversion_factor"],
            "base_qty": quote_result["base_qty"],
            "base_uom_id": quote_result["base_uom_id"],
            "price_source": quote_result["price_source"],
            "unit_price": quote_result["unit_price"],
            "price_override_reason": quote_result.get("override_reason"),
        }
    )
    if hasattr(line, "qty"):
        line.qty = quote_result["entered_qty"]
    if hasattr(line, "unit_price"):
        line.unit_price = quote_result["unit_price"]
    if hasattr(line, "meta"):
        line.meta = meta
    return meta


def validate_stationery_sale_lines(
    session: Session,
    auth: AuthContext,
    lines: list,
    customer_id: str | None = None,
) -> None:
    for line in lines:
        prepare_sale_line_meta(session, auth, line, customer_id=customer_id)


def save_stationery_line_extension(session: Session, line_id: str, meta: dict[str, Any]) -> None:
    session.add(
        StationerySalesLineExtension(
            line_id=line_id,
            sales_uom_id=meta.get("sales_uom_id"),
            entered_qty=float(meta.get("entered_qty") or 0),
            conversion_factor=float(meta.get("conversion_factor") or 1),
            base_qty=float(meta.get("base_qty") or 0),
            base_uom_id=meta.get("base_uom_id"),
            price_source=str(meta.get("price_source") or "STANDARD"),
            unit_price=float(meta.get("unit_price") or 0),
            price_override_reason=meta.get("price_override_reason"),
        )
    )
