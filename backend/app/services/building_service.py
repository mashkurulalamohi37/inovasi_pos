"""Building Materials vertical — profiles, sites, orders, deliveries, challan."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException
from sqlmodel import Session, select

from app.dependencies import AuthContext, write_audit
from app.inventory.exceptions import InsufficientStockError
from app.inventory.locking import for_update as with_row_lock
from app.models.industry import (
    BuildingDelivery,
    BuildingDeliveryLine,
    BuildingMaterialProfile,
    BuildingProjectSite,
    BuildingSalesOrder,
    BuildingSalesOrderLine,
)
from app.models.product import BrandMaster, Customer, Product, Unit
from app.rbac import role_has_permission
from app.schemas.commerce import PaymentLineIn, SaleCreate, SaleLineIn

CONTRACTOR_GROUPS = {"contractor", "dealer", "wholesale", "corporate"}
ORDER_STATUSES = {"draft", "confirmed", "partially_dispatched", "partially_delivered", "delivered", "cancelled"}
DELIVERY_STATUSES = {"planned", "dispatched", "delivered", "failed", "returned", "cancelled"}


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


def _next_no(session: Session, company_id: str, prefix: str, model) -> str:
    rows = session.exec(select(model).where(model.company_id == company_id)).all()
    return f"{prefix}-{len(rows) + 1:06d}"


def _unit_out(u: Unit | None) -> dict[str, Any] | None:
    if not u:
        return None
    return {"id": u.id, "code": u.code, "name": u.name}


def _profile_out(session: Session, p: BuildingMaterialProfile) -> dict[str, Any]:
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
        "material_type": p.material_type,
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
        "minimum_sale_qty": p.minimum_sale_qty,
        "sale_increment": p.sale_increment,
        "contractor_pricing_enabled": p.contractor_pricing_enabled,
        "bulk_pricing_enabled": p.bulk_pricing_enabled,
        "attributes": _parse_json(p.attributes_json),
        "is_active": p.is_active,
    }


def get_profile(session: Session, company_id: str, product_id: str) -> BuildingMaterialProfile | None:
    return session.exec(
        select(BuildingMaterialProfile).where(
            BuildingMaterialProfile.company_id == company_id,
            BuildingMaterialProfile.product_id == product_id,
        )
    ).first()


def list_profiles(
    session: Session,
    company_id: str,
    *,
    q: str | None = None,
    material_type: str | None = None,
    active_only: bool = True,
) -> list[dict[str, Any]]:
    rows = session.exec(
        select(BuildingMaterialProfile).where(BuildingMaterialProfile.company_id == company_id)
    ).all()
    out: list[dict[str, Any]] = []
    qn = (q or "").strip().lower()
    for row in rows:
        if active_only and not row.is_active:
            continue
        if material_type and row.material_type != material_type:
            continue
        product = session.get(Product, row.product_id)
        if product and product.company_id != company_id:
            continue
        if qn and product:
            hay = " ".join(
                [
                    product.sku or "",
                    product.name or "",
                    row.material_type or "",
                    row.grade or "",
                    row.specification_json or "",
                ]
            ).lower()
            if qn not in hay:
                continue
        out.append(_profile_out(session, row))
    return out


def upsert_profile(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    _require(auth, "building.manage")
    product_id = body.get("product_id")
    if not product_id:
        raise HTTPException(status_code=400, detail="product_id required")
    product = session.get(Product, product_id)
    if not product or product.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.industry_pack != "building-materials":
        raise HTTPException(status_code=400, detail="Product is not a building-materials pack item")

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
        row = BuildingMaterialProfile(company_id=auth.company_id, product_id=product_id)
        session.add(row)

    row.brand_id = body.get("brand_id", row.brand_id)
    row.material_type = body.get("material_type", row.material_type)
    row.grade = body.get("grade", row.grade)
    if "specification" in body or "specification_json" in body:
        spec = body.get("specification") if "specification" in body else body.get("specification_json")
        row.specification_json = json.dumps(spec) if isinstance(spec, dict) else (spec if isinstance(spec, str) else None)
    if "measurement_mode" in body:
        row.measurement_mode = str(body["measurement_mode"])
    row.base_uom_id = base_uom_id if base_uom_id is not None else row.base_uom_id
    if "default_sales_uom_id" in body:
        row.default_sales_uom_id = body.get("default_sales_uom_id")
    if "default_purchase_uom_id" in body:
        row.default_purchase_uom_id = body.get("default_purchase_uom_id")
    if "fractional_qty_allowed" in body:
        row.fractional_qty_allowed = bool(body["fractional_qty_allowed"])
    if "minimum_sale_qty" in body:
        row.minimum_sale_qty = float(body["minimum_sale_qty"] or 0) or 1.0
    if "sale_increment" in body:
        row.sale_increment = float(body["sale_increment"] or 0) or 1.0
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
    write_audit(
        session,
        auth,
        "building.profile.create" if created else "building.profile.update",
        "building_material_profile",
        row.id,
        detail={"product_id": product_id, "material_type": row.material_type},
    )
    return _profile_out(session, row)


def _site_out(session: Session, site: BuildingProjectSite) -> dict[str, Any]:
    customer = session.get(Customer, site.customer_id)
    return {
        "id": site.id,
        "customer_id": site.customer_id,
        "customer_name": customer.name if customer else None,
        "customer_code": customer.code if customer else None,
        "site_code": site.site_code,
        "site_name": site.site_name,
        "address": site.address,
        "contact_phone": site.contact_phone,
        "district": site.district,
        "thana": site.thana,
        "is_active": site.is_active,
    }


def list_sites(
    session: Session,
    company_id: str,
    *,
    customer_id: str | None = None,
    active_only: bool = True,
) -> list[dict[str, Any]]:
    q = select(BuildingProjectSite).where(BuildingProjectSite.company_id == company_id)
    if customer_id:
        q = q.where(BuildingProjectSite.customer_id == customer_id)
    rows = session.exec(q).all()
    out = []
    for row in rows:
        if active_only and not row.is_active:
            continue
        out.append(_site_out(session, row))
    return out


def upsert_site(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    _require(auth, "building.manage")
    customer_id = body.get("customer_id")
    site_code = (body.get("site_code") or "").strip()
    site_name = (body.get("site_name") or "").strip()
    address = (body.get("address") or "").strip()
    if not customer_id or not site_code or not site_name or not address:
        raise HTTPException(status_code=400, detail="customer_id, site_code, site_name, address required")
    cust = session.get(Customer, customer_id)
    if not cust or cust.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Customer not found")

    row: BuildingProjectSite | None = None
    if body.get("id"):
        row = session.get(BuildingProjectSite, body["id"])
        if not row or row.company_id != auth.company_id:
            raise HTTPException(status_code=404, detail="Site not found")
    else:
        dup = session.exec(
            select(BuildingProjectSite).where(
                BuildingProjectSite.company_id == auth.company_id,
                BuildingProjectSite.customer_id == customer_id,
                BuildingProjectSite.site_code == site_code,
            )
        ).first()
        if dup:
            row = dup

    created = row is None
    if not row:
        row = BuildingProjectSite(company_id=auth.company_id, customer_id=customer_id, site_code=site_code)
        session.add(row)

    row.customer_id = customer_id
    row.site_code = site_code
    row.site_name = site_name
    row.address = address
    row.contact_phone = body.get("contact_phone")
    row.district = body.get("district")
    row.thana = body.get("thana")
    if "is_active" in body:
        row.is_active = bool(body["is_active"])
    session.add(row)
    session.flush()
    write_audit(
        session,
        auth,
        "building.site.create" if created else "building.site.update",
        "building_project_site",
        row.id,
        detail={"site_code": site_code, "customer_id": customer_id},
    )
    return _site_out(session, row)


def pending_base_qty(line: BuildingSalesOrderLine) -> float:
    return max(0.0, float(line.base_qty) - float(line.delivered_base_qty) - float(line.cancelled_base_qty))


def _order_or_404(session: Session, company_id: str, order_id: str) -> BuildingSalesOrder:
    order = session.get(BuildingSalesOrder, order_id)
    if not order or order.company_id != company_id:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


def _delivery_or_404(
    session: Session,
    company_id: str,
    delivery_id: str,
    *,
    for_update: bool = False,
) -> BuildingDelivery:
    stmt = select(BuildingDelivery).where(BuildingDelivery.id == delivery_id)
    if for_update:
        stmt = with_row_lock(session, stmt)
    delivery = session.exec(stmt).first()
    if not delivery or delivery.company_id != company_id:
        raise HTTPException(status_code=404, detail="Delivery not found")
    return delivery


def _serialize_line(session: Session, line: BuildingSalesOrderLine) -> dict[str, Any]:
    sales_uom = session.get(Unit, line.sales_uom_id) if line.sales_uom_id else None
    base_uom = session.get(Unit, line.base_uom_id) if line.base_uom_id else None
    return {
        "id": line.id,
        "product_id": line.product_id,
        "variant_id": line.variant_id,
        "sku": line.sku,
        "product_name": line.product_name,
        "sales_uom_id": line.sales_uom_id,
        "sales_uom": _unit_out(sales_uom),
        "entered_qty": line.entered_qty,
        "conversion_factor": line.conversion_factor,
        "base_qty": line.base_qty,
        "base_uom_id": line.base_uom_id,
        "base_uom": _unit_out(base_uom),
        "unit_price": line.unit_price,
        "discount": line.discount,
        "line_total": line.line_total,
        "price_source": line.price_source,
        "dispatched_base_qty": line.dispatched_base_qty,
        "delivered_base_qty": line.delivered_base_qty,
        "cancelled_base_qty": line.cancelled_base_qty,
        "returned_base_qty": line.returned_base_qty,
        "pending_base_qty": pending_base_qty(line),
        "price_override_reason": line.price_override_reason,
    }


def _recalc_order(session: Session, order: BuildingSalesOrder, *, tax_rate: float = 0.0) -> None:
    lines = session.exec(select(BuildingSalesOrderLine).where(BuildingSalesOrderLine.order_id == order.id)).all()
    gross = round(sum(float(l.line_total) for l in lines), 2)
    order.subtotal = gross
    taxable = max(0.0, gross - float(order.discount or 0))
    order.tax = round(taxable * tax_rate, 2)
    order.total = round(taxable + order.tax, 2)


def _refresh_order_status(session: Session, order: BuildingSalesOrder) -> None:
    if order.status == "cancelled":
        return
    lines = session.exec(select(BuildingSalesOrderLine).where(BuildingSalesOrderLine.order_id == order.id)).all()
    if not lines:
        return
    total_base = sum(float(l.base_qty) for l in lines)
    delivered = sum(float(l.delivered_base_qty) for l in lines)
    dispatched = sum(float(l.dispatched_base_qty) for l in lines)
    cancelled = sum(float(l.cancelled_base_qty) for l in lines)
    if delivered + cancelled >= total_base - 1e-6:
        order.status = "delivered" if delivered > 0 else "cancelled"
    elif delivered > 0:
        order.status = "partially_delivered"
    elif dispatched > 0:
        order.status = "partially_dispatched"
    elif order.sales_invoice_id:
        order.status = "confirmed"


def _serialize_order(session: Session, order: BuildingSalesOrder) -> dict[str, Any]:
    lines = session.exec(select(BuildingSalesOrderLine).where(BuildingSalesOrderLine.order_id == order.id)).all()
    customer_name = None
    if order.customer_id:
        c = session.get(Customer, order.customer_id)
        customer_name = c.name if c else None
    site_name = None
    site_address = None
    if order.site_id:
        site = session.get(BuildingProjectSite, order.site_id)
        if site:
            site_name = site.site_name
            site_address = site.address
    return {
        "id": order.id,
        "order_no": order.order_no,
        "store_id": order.store_id,
        "customer_id": order.customer_id,
        "customer_name": customer_name,
        "site_id": order.site_id,
        "site_name": site_name,
        "site_address": site_address,
        "status": order.status,
        "order_date": order.order_date.isoformat() if order.order_date else None,
        "promised_delivery_date": order.promised_delivery_date.isoformat() if order.promised_delivery_date else None,
        "sales_invoice_id": order.sales_invoice_id,
        "subtotal": order.subtotal,
        "discount": order.discount,
        "tax": order.tax,
        "total": order.total,
        "notes": order.notes,
        "cancel_reason": order.cancel_reason,
        "lines": [_serialize_line(session, l) for l in lines],
        "created_at": order.created_at.isoformat() if order.created_at else None,
    }


def _serialize_delivery(session: Session, delivery: BuildingDelivery) -> dict[str, Any]:
    lines = session.exec(select(BuildingDeliveryLine).where(BuildingDeliveryLine.delivery_id == delivery.id)).all()
    site_name = None
    site_address = None
    if delivery.site_id:
        site = session.get(BuildingProjectSite, delivery.site_id)
        if site:
            site_name = site.site_name
            site_address = site.address
    order = session.get(BuildingSalesOrder, delivery.order_id)
    return {
        "id": delivery.id,
        "delivery_no": delivery.delivery_no,
        "order_id": delivery.order_id,
        "order_no": order.order_no if order else None,
        "store_id": delivery.store_id,
        "site_id": delivery.site_id,
        "site_name": site_name,
        "site_address": site_address,
        "status": delivery.status,
        "stock_posted": delivery.stock_posted,
        "scheduled_date": delivery.scheduled_date.isoformat() if delivery.scheduled_date else None,
        "dispatched_at": delivery.dispatched_at.isoformat() if delivery.dispatched_at else None,
        "delivered_at": delivery.delivered_at.isoformat() if delivery.delivered_at else None,
        "driver_name": delivery.driver_name,
        "vehicle_no": delivery.vehicle_no,
        "challan_no": delivery.challan_no,
        "notes": delivery.notes,
        "fail_reason": delivery.fail_reason,
        "lines": [
            {
                "id": ln.id,
                "order_line_id": ln.order_line_id,
                "product_id": ln.product_id,
                "planned_sales_uom_id": ln.planned_sales_uom_id,
                "planned_qty": ln.planned_qty,
                "planned_base_qty": ln.planned_base_qty,
                "dispatched_base_qty": ln.dispatched_base_qty,
                "delivered_base_qty": ln.delivered_base_qty,
                "returned_base_qty": ln.returned_base_qty,
            }
            for ln in lines
        ],
    }


def _quote_line(
    session: Session,
    auth: AuthContext,
    raw: dict[str, Any],
    *,
    customer_id: str | None,
) -> dict[str, Any]:
    from app.services.hardware_service import quote_price

    product_id = raw.get("product_id")
    if not product_id:
        raise HTTPException(status_code=400, detail="product_id required on line")
    entered_qty = float(raw.get("entered_qty") or raw.get("qty") or 0)
    quote = quote_price(
        session,
        auth,
        product_id=str(product_id),
        entered_qty=entered_qty,
        sales_uom_id=raw.get("sales_uom_id") or raw.get("uom_id"),
        customer_id=customer_id or raw.get("customer_id"),
        variant_id=raw.get("variant_id"),
        manual_unit_price=float(raw["manual_unit_price"]) if raw.get("manual_unit_price") is not None else None,
        override_reason=raw.get("price_override_reason") or raw.get("override_reason"),
    )
    discount = float(raw.get("discount") or 0)
    line_total = round(max(0.0, quote["line_total"] - discount), 2)
    product = session.get(Product, product_id)
    return {
        **quote,
        "product_id": product_id,
        "variant_id": raw.get("variant_id"),
        "sku": product.sku if product else raw.get("sku", ""),
        "product_name": product.name if product else raw.get("product_name", ""),
        "discount": discount,
        "line_total": line_total,
    }


def _add_order_line(
    session: Session,
    auth: AuthContext,
    order: BuildingSalesOrder,
    raw: dict[str, Any],
) -> BuildingSalesOrderLine:
    quote = _quote_line(session, auth, raw, customer_id=order.customer_id)
    line = BuildingSalesOrderLine(
        order_id=order.id,
        product_id=str(quote["product_id"]),
        variant_id=quote.get("variant_id"),
        sku=quote.get("sku") or "",
        product_name=quote.get("product_name") or "",
        sales_uom_id=quote.get("from_uom_id"),
        entered_qty=float(quote["entered_qty"]),
        conversion_factor=float(quote["conversion_factor"]),
        base_qty=float(quote["base_qty"]),
        base_uom_id=quote.get("base_uom_id"),
        unit_price=float(quote["unit_price"]),
        discount=float(quote.get("discount") or 0),
        line_total=float(quote["line_total"]),
        price_source=str(quote.get("price_source") or "STANDARD"),
        price_override_reason=quote.get("override_reason"),
    )
    session.add(line)
    return line


def list_orders(
    session: Session,
    company_id: str,
    *,
    status: str | None = None,
    customer_id: str | None = None,
) -> list[dict[str, Any]]:
    q = select(BuildingSalesOrder).where(BuildingSalesOrder.company_id == company_id)
    if status:
        q = q.where(BuildingSalesOrder.status == status)
    if customer_id:
        q = q.where(BuildingSalesOrder.customer_id == customer_id)
    rows = session.exec(q).all()
    rows = sorted(rows, key=lambda r: r.created_at or datetime.min, reverse=True)
    return [_serialize_order(session, r) for r in rows]


def get_order(session: Session, auth: AuthContext, order_id: str) -> dict[str, Any]:
    return _serialize_order(session, _order_or_404(session, auth.company_id, order_id))


def create_order(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    _require(auth, "building.order_manage")
    store_id = body.get("store_id") or auth.store_id
    if not store_id:
        raise HTTPException(status_code=400, detail="store_id required")
    customer_id = body.get("customer_id")
    if customer_id:
        cust = session.get(Customer, customer_id)
        if not cust or cust.company_id != auth.company_id:
            raise HTTPException(status_code=404, detail="Customer not found")
    site_id = body.get("site_id")
    if site_id:
        site = session.get(BuildingProjectSite, site_id)
        if not site or site.company_id != auth.company_id:
            raise HTTPException(status_code=404, detail="Site not found")
        if customer_id and site.customer_id != customer_id:
            raise HTTPException(status_code=400, detail="Site does not belong to customer")

    order = BuildingSalesOrder(
        company_id=auth.company_id,
        store_id=store_id,
        order_no=_next_no(session, auth.company_id, "BM", BuildingSalesOrder),
        customer_id=customer_id,
        site_id=site_id,
        status="draft",
        order_date=_utc_now(),
        promised_delivery_date=_parse_dt(body.get("promised_delivery_date")),
        discount=float(body.get("discount") or 0),
        notes=body.get("notes"),
        created_by=auth.user_id,
    )
    session.add(order)
    session.flush()
    for raw in body.get("lines") or []:
        _add_order_line(session, auth, order, raw)
    _recalc_order(session, order, tax_rate=float(body.get("tax_rate") or 0))
    session.add(order)
    write_audit(session, auth, "building.order.create", "building_sales_order", order.id, detail={"order_no": order.order_no})
    return _serialize_order(session, order)


def update_order(session: Session, auth: AuthContext, order_id: str, body: dict[str, Any]) -> dict[str, Any]:
    _require(auth, "building.order_manage")
    order = _order_or_404(session, auth.company_id, order_id)
    if order.status != "draft":
        raise HTTPException(status_code=400, detail="Only draft orders can be updated")

    if "customer_id" in body:
        customer_id = body.get("customer_id")
        if customer_id:
            cust = session.get(Customer, customer_id)
            if not cust or cust.company_id != auth.company_id:
                raise HTTPException(status_code=404, detail="Customer not found")
        order.customer_id = customer_id
    if "site_id" in body:
        site_id = body.get("site_id")
        if site_id:
            site = session.get(BuildingProjectSite, site_id)
            if not site or site.company_id != auth.company_id:
                raise HTTPException(status_code=404, detail="Site not found")
        order.site_id = site_id
    if "promised_delivery_date" in body:
        order.promised_delivery_date = _parse_dt(body.get("promised_delivery_date"))
    if "notes" in body:
        order.notes = body.get("notes")
    if "discount" in body:
        order.discount = float(body.get("discount") or 0)

    if body.get("lines") is not None:
        existing = session.exec(
            select(BuildingSalesOrderLine).where(BuildingSalesOrderLine.order_id == order.id)
        ).all()
        for ln in existing:
            session.delete(ln)
        session.flush()
        for raw in body.get("lines") or []:
            _add_order_line(session, auth, order, raw)

    _recalc_order(session, order, tax_rate=float(body.get("tax_rate") or 0))
    session.add(order)
    write_audit(session, auth, "building.order.update", "building_sales_order", order.id, detail={"order_no": order.order_no})
    return _serialize_order(session, order)


def confirm_order(session: Session, auth: AuthContext, order_id: str, body: dict | None = None) -> dict[str, Any]:
    _require(auth, "building.order_manage")
    order = _order_or_404(session, auth.company_id, order_id)
    if order.status != "draft":
        raise HTTPException(status_code=400, detail="Only draft orders can be confirmed")
    if order.sales_invoice_id:
        raise HTTPException(status_code=400, detail="Order already invoiced")
    body = body or {}
    lines = session.exec(select(BuildingSalesOrderLine).where(BuildingSalesOrderLine.order_id == order.id)).all()
    if not lines:
        raise HTTPException(status_code=400, detail="Add at least one line before confirming")

    if body.get("discount") is not None:
        discount = float(body["discount"])
        if discount > order.subtotal:
            raise HTTPException(status_code=400, detail="Discount exceeds subtotal")
        if discount > order.subtotal * 0.1:
            _require(auth, "building.price_override")
            if not body.get("price_override_reason"):
                raise HTTPException(status_code=400, detail="price_override_reason required")
        order.discount = discount
    _recalc_order(session, order, tax_rate=float(body.get("tax_rate") or 0))

    site = session.get(BuildingProjectSite, order.site_id) if order.site_id else None
    sale_lines: list[SaleLineIn] = []
    for line in lines:
        sale_lines.append(
            SaleLineIn(
                product_id=line.product_id,
                sku=line.sku or "BM",
                name=line.product_name,
                qty=line.entered_qty,
                unit_price=line.unit_price,
                meta={
                    "fulfillment": "delivery",
                    "building_order_id": order.id,
                    "building_order_line_id": line.id,
                    "entered_qty": line.entered_qty,
                    "sales_uom_id": line.sales_uom_id,
                    "conversion_factor": line.conversion_factor,
                    "base_qty": line.base_qty,
                    "base_uom_id": line.base_uom_id,
                    "price_source": line.price_source,
                    "site_id": order.site_id,
                    "site_name": site.site_name if site else None,
                    "site_address": site.address if site else None,
                    "variant_id": line.variant_id,
                },
            )
        )

    payments_in = body.get("payments") or []
    if not payments_in and not body.get("allow_due"):
        payments_in = [{"method": body.get("tender") or "cash", "amount": order.total}]
    sale_payments = [PaymentLineIn(method=p["method"], amount=float(p["amount"]), reference=p.get("reference")) for p in payments_in]

    from app.services.sales_service import create_sale_idempotent

    sale_body = SaleCreate(
        client_transaction_id=body.get("client_transaction_id") or f"bm-{order.id}-{int(_utc_now().timestamp())}",
        industry_pack="building-materials",
        store_id=order.store_id,
        customer_id=order.customer_id,
        status="completed",
        lines=sale_lines,
        subtotal=order.subtotal,
        discount=order.discount,
        tax=order.tax,
        total=order.total,
        tender=sale_payments[-1].method if sale_payments else "cash",
        payments=sale_payments if sale_payments else None,
        industry_meta={
            "building_order_id": order.id,
            "order_no": order.order_no,
            "site_id": order.site_id,
            "fulfillment": "delivery",
        },
    )
    sale_out = create_sale_idempotent(session, auth, sale_body)
    order.sales_invoice_id = sale_out.id
    order.status = "confirmed"
    if body.get("promised_delivery_date"):
        order.promised_delivery_date = _parse_dt(body["promised_delivery_date"])
    session.add(order)
    write_audit(
        session,
        auth,
        "building.order.confirm",
        "building_sales_order",
        order.id,
        detail={"invoice_id": sale_out.id, "total": order.total},
    )
    return _serialize_order(session, order)


def cancel_order(session: Session, auth: AuthContext, order_id: str, body: dict | None = None) -> dict[str, Any]:
    _require(auth, "building.cancel")
    order = _order_or_404(session, auth.company_id, order_id)
    if order.status in {"cancelled", "delivered"}:
        raise HTTPException(status_code=400, detail="Order cannot be cancelled")
    body = body or {}
    reason = (body.get("reason") or body.get("cancel_reason") or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="cancel reason required")

    lines = session.exec(select(BuildingSalesOrderLine).where(BuildingSalesOrderLine.order_id == order.id)).all()
    any_dispatched = any(float(l.dispatched_base_qty) > 0 for l in lines)
    if not any_dispatched:
        for line in lines:
            line.cancelled_base_qty = float(line.base_qty)
            session.add(line)
        order.status = "cancelled"
    else:
        for line in lines:
            cancellable = max(0.0, float(line.base_qty) - float(line.dispatched_base_qty) - float(line.cancelled_base_qty))
            if cancellable > 0:
                line.cancelled_base_qty = float(line.cancelled_base_qty) + cancellable
                session.add(line)
        _refresh_order_status(session, order)

    order.cancel_reason = reason
    session.add(order)
    write_audit(session, auth, "building.order.cancel", "building_sales_order", order.id, detail={"reason": reason})
    return _serialize_order(session, order)


def list_deliveries(
    session: Session,
    company_id: str,
    *,
    order_id: str | None = None,
    status: str | None = None,
) -> list[dict[str, Any]]:
    q = select(BuildingDelivery).where(BuildingDelivery.company_id == company_id)
    if order_id:
        q = q.where(BuildingDelivery.order_id == order_id)
    if status:
        q = q.where(BuildingDelivery.status == status)
    rows = session.exec(q).all()
    rows = sorted(rows, key=lambda r: r.created_at or datetime.min, reverse=True)
    return [_serialize_delivery(session, r) for r in rows]


def get_delivery(session: Session, auth: AuthContext, delivery_id: str) -> dict[str, Any]:
    return _serialize_delivery(session, _delivery_or_404(session, auth.company_id, delivery_id))


def create_delivery(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    _require(auth, "building.delivery_manage")
    order_id = body.get("order_id")
    if not order_id:
        raise HTTPException(status_code=400, detail="order_id required")
    order = _order_or_404(session, auth.company_id, order_id)
    if order.status in {"draft", "cancelled"}:
        raise HTTPException(status_code=400, detail="Confirm order before creating delivery")
    if order.status == "delivered":
        raise HTTPException(status_code=400, detail="Order fully delivered")

    store_id = body.get("store_id") or order.store_id
    site_id = body.get("site_id") or order.site_id
    delivery = BuildingDelivery(
        company_id=auth.company_id,
        store_id=store_id,
        order_id=order.id,
        delivery_no=_next_no(session, auth.company_id, "CH", BuildingDelivery),
        site_id=site_id,
        status="planned",
        scheduled_date=_parse_dt(body.get("scheduled_date")),
        driver_name=body.get("driver_name"),
        vehicle_no=body.get("vehicle_no"),
        challan_no=body.get("challan_no"),
        notes=body.get("notes"),
    )
    session.add(delivery)
    session.flush()

    line_rows = body.get("lines") or []
    if not line_rows:
        raise HTTPException(status_code=400, detail="At least one delivery line required")

    for raw in line_rows:
        order_line_id = raw.get("order_line_id")
        if not order_line_id:
            raise HTTPException(status_code=400, detail="order_line_id required on delivery line")
        order_line = session.get(BuildingSalesOrderLine, order_line_id)
        if not order_line or order_line.order_id != order.id:
            raise HTTPException(status_code=400, detail="Invalid order line")

        entered_qty = float(raw.get("planned_qty") or raw.get("qty") or 0)
        if entered_qty <= 0:
            raise HTTPException(status_code=400, detail="planned_qty must be > 0")

        from app.services.hardware_service import convert_to_base

        conv = convert_to_base(
            session,
            auth.company_id,
            order_line.product_id,
            entered_qty,
            raw.get("planned_sales_uom_id") or raw.get("sales_uom_id") or order_line.sales_uom_id,
            for_sales=True,
            variant_id=order_line.variant_id,
        )
        planned_base = float(conv["base_qty"])
        if planned_base - pending_base_qty(order_line) > 1e-6:
            raise HTTPException(status_code=400, detail="Planned qty exceeds pending base qty for order line")

        session.add(
            BuildingDeliveryLine(
                delivery_id=delivery.id,
                order_line_id=order_line.id,
                product_id=order_line.product_id,
                planned_sales_uom_id=conv["from_uom_id"],
                planned_qty=entered_qty,
                planned_base_qty=planned_base,
            )
        )

    session.add(delivery)
    write_audit(
        session,
        auth,
        "building.delivery.create",
        "building_delivery",
        delivery.id,
        detail={"delivery_no": delivery.delivery_no, "order_id": order.id},
    )
    return _serialize_delivery(session, delivery)


def dispatch_delivery(session: Session, auth: AuthContext, delivery_id: str, body: dict | None = None) -> dict[str, Any]:
    _require(auth, "building.dispatch")
    delivery = _delivery_or_404(session, auth.company_id, delivery_id, for_update=True)
    if delivery.stock_posted:
        return _serialize_delivery(session, delivery)
    if delivery.status not in {"planned", "dispatched"}:
        raise HTTPException(status_code=400, detail="Delivery cannot be dispatched")

    # Claim posting flag under row lock before stock movements to prevent double-post.
    delivery.stock_posted = True
    session.add(delivery)
    session.flush()

    from app.services.inventory_service import record_stock_movement

    lines = session.exec(select(BuildingDeliveryLine).where(BuildingDeliveryLine.delivery_id == delivery.id)).all()
    if not lines:
        raise HTTPException(status_code=400, detail="Delivery has no lines")

    for ln in lines:
        order_line = session.get(BuildingSalesOrderLine, ln.order_line_id)
        if not order_line:
            continue
        qty = float(ln.planned_base_qty)
        remaining_dispatch = max(
            0.0,
            float(order_line.base_qty) - float(order_line.dispatched_base_qty) - float(order_line.cancelled_base_qty),
        )
        if qty - remaining_dispatch > 1e-6:
            raise HTTPException(status_code=400, detail="Dispatch qty exceeds remaining on order line")
        try:
            record_stock_movement(
                session,
                company_id=auth.company_id,
                product_id=ln.product_id,
                store_id=delivery.store_id,
                warehouse_id=None,
                out_qty=qty,
                transaction_type="building_dispatch",
                transaction_ref=delivery.delivery_no,
                reference_id=delivery.id,
                note=f"Building delivery dispatch {delivery.delivery_no}",
                created_by=auth.user_id,
                variant_id=order_line.variant_id,
            )
        except InsufficientStockError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

        ln.dispatched_base_qty = qty
        order_line.dispatched_base_qty = float(order_line.dispatched_base_qty) + qty
        session.add(ln)
        session.add(order_line)
    delivery.status = "dispatched"
    delivery.dispatched_at = _utc_now()
    if body:
        if body.get("driver_name"):
            delivery.driver_name = body["driver_name"]
        if body.get("vehicle_no"):
            delivery.vehicle_no = body["vehicle_no"]
        if body.get("challan_no"):
            delivery.challan_no = body["challan_no"]
    session.add(delivery)

    order = session.get(BuildingSalesOrder, delivery.order_id)
    if order:
        _refresh_order_status(session, order)
        session.add(order)

    write_audit(
        session,
        auth,
        "building.delivery.dispatch",
        "building_delivery",
        delivery.id,
        detail={"delivery_no": delivery.delivery_no},
    )
    return _serialize_delivery(session, delivery)


def confirm_delivery(session: Session, auth: AuthContext, delivery_id: str, body: dict | None = None) -> dict[str, Any]:
    _require(auth, "building.delivery_confirm")
    delivery = _delivery_or_404(session, auth.company_id, delivery_id)
    if delivery.status != "dispatched":
        raise HTTPException(status_code=400, detail="Only dispatched deliveries can be confirmed delivered")
    body = body or {}

    lines = session.exec(select(BuildingDeliveryLine).where(BuildingDeliveryLine.delivery_id == delivery.id)).all()
    line_overrides: dict[str, dict[str, Any]] = {}
    for item in body.get("lines") or []:
        dl_id = item.get("delivery_line_id")
        if dl_id:
            line_overrides[str(dl_id)] = item

    for ln in lines:
        override = line_overrides.get(ln.id, {})
        delivered_qty = float(
            override.get("delivered_base_qty", ln.dispatched_base_qty or ln.planned_base_qty)
        )
        if delivered_qty <= 0:
            delivered_qty = float(ln.dispatched_base_qty or ln.planned_base_qty)
        ln.delivered_base_qty = delivered_qty
        order_line = session.get(BuildingSalesOrderLine, ln.order_line_id)
        if order_line:
            order_line.delivered_base_qty = float(order_line.delivered_base_qty) + delivered_qty
            session.add(order_line)
        session.add(ln)

    delivery.status = "delivered"
    delivery.delivered_at = _utc_now()
    session.add(delivery)

    order = session.get(BuildingSalesOrder, delivery.order_id)
    if order:
        _refresh_order_status(session, order)
        session.add(order)

    write_audit(
        session,
        auth,
        "building.delivery.confirm",
        "building_delivery",
        delivery.id,
        detail={"delivery_no": delivery.delivery_no},
    )
    return _serialize_delivery(session, delivery)


def fail_or_return_delivery(session: Session, auth: AuthContext, delivery_id: str, body: dict[str, Any]) -> dict[str, Any]:
    _require(auth, "building.delivery_manage")
    delivery = _delivery_or_404(session, auth.company_id, delivery_id)
    if delivery.status not in {"dispatched", "delivered"}:
        raise HTTPException(status_code=400, detail="Only dispatched or delivered deliveries can be failed/returned")

    from app.services.inventory_service import record_stock_movement

    reason = (body.get("reason") or body.get("fail_reason") or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="reason required")

    return_lines = body.get("lines") or []
    if not return_lines:
        return_lines = [
            {
                "delivery_line_id": ln.id,
                "returned_base_qty": float(ln.dispatched_base_qty or ln.planned_base_qty) - float(ln.returned_base_qty),
            }
            for ln in session.exec(
                select(BuildingDeliveryLine).where(BuildingDeliveryLine.delivery_id == delivery.id)
            ).all()
        ]

    for raw in return_lines:
        dl_id = raw.get("delivery_line_id")
        returned = float(raw.get("returned_base_qty") or 0)
        if returned <= 0:
            continue
        ln = session.get(BuildingDeliveryLine, dl_id)
        if not ln or ln.delivery_id != delivery.id:
            raise HTTPException(status_code=400, detail="Invalid delivery line")
        max_return = float(ln.dispatched_base_qty or ln.planned_base_qty) - float(ln.returned_base_qty)
        if returned - max_return > 1e-6:
            raise HTTPException(status_code=400, detail="Returned qty exceeds dispatched qty")

        if delivery.stock_posted:
            record_stock_movement(
                session,
                company_id=auth.company_id,
                product_id=ln.product_id,
                store_id=delivery.store_id,
                warehouse_id=None,
                in_qty=returned,
                transaction_type="building_return",
                transaction_ref=delivery.delivery_no,
                reference_id=delivery.id,
                note=f"Building delivery return {delivery.delivery_no}",
                created_by=auth.user_id,
            )

        ln.returned_base_qty = float(ln.returned_base_qty) + returned
        order_line = session.get(BuildingSalesOrderLine, ln.order_line_id)
        if order_line:
            order_line.returned_base_qty = float(order_line.returned_base_qty) + returned
            session.add(order_line)
        session.add(ln)

    delivery.status = "returned" if body.get("as_return", True) else "failed"
    delivery.fail_reason = reason
    session.add(delivery)
    write_audit(
        session,
        auth,
        "building.delivery.return",
        "building_delivery",
        delivery.id,
        detail={"delivery_no": delivery.delivery_no, "reason": reason},
    )
    return _serialize_delivery(session, delivery)


def challan_html(session: Session, auth: AuthContext, delivery_id: str) -> str:
    _require(auth, "building.view")
    delivery = _delivery_or_404(session, auth.company_id, delivery_id)
    order = session.get(BuildingSalesOrder, delivery.order_id)
    customer = session.get(Customer, order.customer_id) if order and order.customer_id else None
    site = session.get(BuildingProjectSite, delivery.site_id or (order.site_id if order else None))
    lines = session.exec(select(BuildingDeliveryLine).where(BuildingDeliveryLine.delivery_id == delivery.id)).all()

    rows_html = ""
    for i, ln in enumerate(lines, 1):
        order_line = session.get(BuildingSalesOrderLine, ln.order_line_id)
        product_name = order_line.product_name if order_line else ""
        sku = order_line.sku if order_line else ""
        uom = session.get(Unit, ln.planned_sales_uom_id) if ln.planned_sales_uom_id else None
        rows_html += f"""
        <tr>
          <td>{i}</td>
          <td>{sku}</td>
          <td>{product_name}</td>
          <td style="text-align:right">{ln.planned_qty:.2f}</td>
          <td>{uom.code if uom else ''}</td>
          <td style="text-align:right">{ln.planned_base_qty:.2f}</td>
        </tr>"""

    site_block = ""
    if site:
        site_block = f"""
        <p><strong>Site:</strong> {site.site_name} ({site.site_code})<br/>
        {site.address}<br/>
        {site.contact_phone or ''}</p>"""

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Delivery Challan {delivery.delivery_no}</title>
<style>
body {{ font-family: Arial, sans-serif; margin: 24px; color: #222; }}
h1 {{ margin-bottom: 4px; }}
table {{ width: 100%; border-collapse: collapse; margin-top: 16px; }}
th, td {{ border: 1px solid #ccc; padding: 8px; }}
th {{ background: #f5f5f5; text-align: left; }}
.meta {{ margin: 12px 0; }}
</style></head><body>
<h1>Delivery Challan</h1>
<p class="meta"><strong>Challan No:</strong> {delivery.challan_no or delivery.delivery_no}<br/>
<strong>Order:</strong> {order.order_no if order else ''}<br/>
<strong>Date:</strong> {(delivery.dispatched_at or delivery.scheduled_date or _utc_now()).strftime('%Y-%m-%d %H:%M')}<br/>
<strong>Driver:</strong> {delivery.driver_name or '—'} · <strong>Vehicle:</strong> {delivery.vehicle_no or '—'}</p>
<p><strong>Customer:</strong> {customer.name if customer else 'Walk-in'}<br/>
{customer.phone if customer and customer.phone else ''}</p>
{site_block}
<table>
<thead><tr><th>#</th><th>SKU</th><th>Material</th><th>Qty</th><th>UOM</th><th>Base Qty</th></tr></thead>
<tbody>{rows_html}</tbody>
</table>
<p style="margin-top:32px">Received by: _________________________ &nbsp;&nbsp; Date: __________</p>
</body></html>"""


def list_contractors(
    session: Session,
    company_id: str,
    *,
    q: str | None = None,
    group: str | None = None,
    contractors_only: bool = True,
) -> list[dict[str, Any]]:
    rows = session.exec(select(Customer).where(Customer.company_id == company_id)).all()
    out: list[dict[str, Any]] = []
    qn = (q or "").strip().lower()
    for c in rows:
        grp = (c.customer_group or "").lower()
        if group:
            if grp != group.lower():
                continue
        elif contractors_only and grp not in CONTRACTOR_GROUPS:
            continue
        if qn:
            hay = " ".join([c.code or "", c.name or "", c.phone or "", grp]).lower()
            if qn not in hay:
                continue
        out.append(
            {
                "id": c.id,
                "code": c.code,
                "name": c.name,
                "phone": c.phone,
                "email": c.email,
                "customer_group": c.customer_group,
                "credit_limit": c.credit_limit,
            }
        )
    return out


def quote(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    _require(auth, "building.view")
    from app.services.hardware_service import quote_price

    return quote_price(
        session,
        auth,
        product_id=str(body.get("product_id") or ""),
        entered_qty=float(body.get("entered_qty") or body.get("qty") or 0),
        sales_uom_id=body.get("sales_uom_id") or body.get("from_uom_id"),
        customer_id=body.get("customer_id"),
        variant_id=body.get("variant_id"),
        manual_unit_price=body.get("manual_unit_price"),
        override_reason=body.get("override_reason") or body.get("price_override_reason"),
    )
