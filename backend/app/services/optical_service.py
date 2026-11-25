"""Optical Shop vertical — frames, lenses, prescriptions, orders, lab, delivery."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException
from sqlmodel import Session, select

from app.dependencies import AuthContext, write_audit
from app.inventory.locking import for_update as with_row_lock
from app.models.industry import (
    OpticalFrameProfile,
    OpticalLensProfile,
    OpticalOrder,
    OpticalOrderLine,
    OpticalPrescription,
)
from app.models.inventory import StockBalance
from app.models.product import Customer, Product
from app.rbac import role_has_permission
from app.schemas.commerce import PaymentLineIn, SaleCreate, SaleLineIn

ORDER_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"confirmed", "cancelled"},
    "confirmed": {"sent_to_lab", "cancelled"},
    "sent_to_lab": {"lens_processing", "cancelled"},
    "lens_processing": {"lens_ready", "cancelled"},
    "lens_ready": {"fitting", "cancelled"},
    "fitting": {"qc", "cancelled"},
    "qc": {"ready", "fitting", "cancelled"},
    "ready": {"delivered", "partially_paid", "paid", "cancelled"},
    "partially_paid": {"paid", "delivered", "cancelled"},
    "paid": {"delivered"},
    "delivered": set(),
    "cancelled": set(),
}
LINE_TYPES = {"frame", "lens_right", "lens_left", "lens_pair", "accessory", "service"}
SUPPLY_MODES = {"stocked", "made_to_order", "external_lab", "service_only"}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _require(auth: AuthContext, code: str) -> None:
    if not role_has_permission(auth.role_code, code):
        raise HTTPException(status_code=403, detail=f"Missing permission: {code}")


def _next_no(session: Session, company_id: str, prefix: str, model) -> str:
    rows = session.exec(select(model).where(model.company_id == company_id)).all()
    return f"{prefix}-{len(rows) + 1:06d}"


def _parse_dt(raw: Any) -> Optional[datetime]:
    if not raw:
        return None
    if isinstance(raw, datetime):
        return raw
    return datetime.fromisoformat(str(raw).replace("Z", "+00:00"))


def _validate_axis(value: Any, label: str) -> Optional[float]:
    if value is None or value == "":
        return None
    axis = float(value)
    if axis < 0 or axis > 180:
        raise HTTPException(status_code=400, detail=f"{label} axis must be between 0 and 180")
    return axis


def _product_or_404(session: Session, company_id: str, product_id: str) -> Product:
    product = session.get(Product, product_id)
    if not product or product.company_id != company_id:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


def _customer_or_404(session: Session, company_id: str, customer_id: str) -> Customer:
    customer = session.get(Customer, customer_id)
    if not customer or customer.company_id != company_id:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


def _order_or_404(
    session: Session,
    company_id: str,
    order_id: str,
    *,
    for_update: bool = False,
) -> OpticalOrder:
    stmt = select(OpticalOrder).where(OpticalOrder.id == order_id)
    if for_update:
        stmt = with_row_lock(session, stmt)
    order = session.exec(stmt).first()
    if not order or order.company_id != company_id:
        raise HTTPException(status_code=404, detail="Optical order not found")
    return order


def _stock_qty(session: Session, company_id: str, product_id: str, store_id: Optional[str]) -> float:
    q = select(StockBalance).where(
        StockBalance.company_id == company_id,
        StockBalance.product_id == product_id,
    )
    if store_id:
        q = q.where(StockBalance.store_id == store_id)
    rows = session.exec(q).all()
    return float(sum(float(r.qty_on_hand or 0) for r in rows))


# --- Frame profiles ---

def _serialize_frame(session: Session, profile: OpticalFrameProfile, store_id: Optional[str] = None) -> dict[str, Any]:
    product = session.get(Product, profile.product_id)
    return {
        "id": profile.id,
        "product_id": profile.product_id,
        "sku": product.sku if product else None,
        "name": product.name if product else None,
        "barcode": product.barcode if product else None,
        "selling_price": product.base_price if product else 0,
        "cost_price": product.cost_price if product else None,
        "stock_qty": _stock_qty(session, profile.company_id, profile.product_id, store_id) if product else 0,
        "frame_code": profile.frame_code,
        "model_no": profile.model_no,
        "frame_type": profile.frame_type,
        "frame_shape": profile.frame_shape,
        "material": profile.material,
        "gender_category": profile.gender_category,
        "size_eye": profile.size_eye,
        "size_bridge": profile.size_bridge,
        "temple_length": profile.temple_length,
        "color": profile.color,
        "rim_type": profile.rim_type,
        "brand_name": profile.brand_name,
        "is_active": profile.is_active if profile.is_active is not None else True,
    }


def list_frames(session: Session, auth: AuthContext, *, q: Optional[str] = None, store_id: Optional[str] = None) -> list[dict]:
    rows = session.exec(
        select(OpticalFrameProfile).where(OpticalFrameProfile.company_id == auth.company_id)
    ).all()
    out = []
    for p in rows:
        row = _serialize_frame(session, p, store_id or auth.store_id)
        if q:
            blob = " ".join(str(v or "") for v in [row["sku"], row["name"], row["brand_name"], row["model_no"], row["barcode"]]).lower()
            if q.lower() not in blob:
                continue
        out.append(row)
    return out


def upsert_frame_profile(session: Session, auth: AuthContext, body: dict) -> dict:
    _require(auth, "optical.manage")
    product_id = body.get("product_id")
    if not product_id:
        raise HTTPException(status_code=400, detail="product_id required")
    product = _product_or_404(session, auth.company_id, product_id)
    existing = session.exec(
        select(OpticalFrameProfile).where(
            OpticalFrameProfile.company_id == auth.company_id,
            OpticalFrameProfile.product_id == product_id,
        )
    ).first()
    profile = existing or OpticalFrameProfile(company_id=auth.company_id, product_id=product_id)
    for field in (
        "frame_code", "model_no", "frame_type", "frame_shape", "material", "gender_category",
        "size_eye", "size_bridge", "temple_length", "color", "rim_type", "brand_name",
    ):
        if field in body:
            setattr(profile, field, body[field])
    if "is_active" in body:
        profile.is_active = bool(body["is_active"])
    if not profile.frame_code:
        profile.frame_code = product.sku
    session.add(profile)
    write_audit(session, auth, "optical_frame_upsert", "optical_frame_profile", profile.id, detail={"product_id": product_id})
    session.commit()
    session.refresh(profile)
    return _serialize_frame(session, profile, auth.store_id)


# --- Lens profiles ---

def _serialize_lens(session: Session, profile: OpticalLensProfile, store_id: Optional[str] = None) -> dict[str, Any]:
    product = session.get(Product, profile.product_id)
    return {
        "id": profile.id,
        "product_id": profile.product_id,
        "sku": product.sku if product else None,
        "name": product.name if product else None,
        "barcode": product.barcode if product else None,
        "selling_price": product.base_price if product else 0,
        "stock_qty": _stock_qty(session, profile.company_id, profile.product_id, store_id) if product else 0,
        "lens_type": profile.lens_type,
        "lens_material": profile.lens_material,
        "refractive_index": profile.refractive_index,
        "coating": profile.coating,
        "tint": profile.tint,
        "photochromic": bool(profile.photochromic),
        "blue_cut": bool(profile.blue_cut),
        "anti_reflective": bool(profile.anti_reflective),
        "uv_protection": bool(profile.uv_protection),
        "polarization": bool(profile.polarization),
        "brand_name": profile.brand_name,
        "supply_mode": profile.supply_mode or "stocked",
        "is_active": profile.is_active if profile.is_active is not None else True,
    }


def list_lenses(session: Session, auth: AuthContext, *, q: Optional[str] = None, store_id: Optional[str] = None) -> list[dict]:
    rows = session.exec(
        select(OpticalLensProfile).where(OpticalLensProfile.company_id == auth.company_id)
    ).all()
    out = []
    for p in rows:
        row = _serialize_lens(session, p, store_id or auth.store_id)
        if q:
            blob = " ".join(str(v or "") for v in [row["sku"], row["name"], row["lens_type"], row["coating"], row["brand_name"]]).lower()
            if q.lower() not in blob:
                continue
        out.append(row)
    return out


def upsert_lens_profile(session: Session, auth: AuthContext, body: dict) -> dict:
    _require(auth, "optical.manage")
    product_id = body.get("product_id")
    if not product_id:
        raise HTTPException(status_code=400, detail="product_id required")
    _product_or_404(session, auth.company_id, product_id)
    if body.get("supply_mode") and body["supply_mode"] not in SUPPLY_MODES:
        raise HTTPException(status_code=400, detail=f"Invalid supply_mode: {body['supply_mode']}")
    existing = session.exec(
        select(OpticalLensProfile).where(
            OpticalLensProfile.company_id == auth.company_id,
            OpticalLensProfile.product_id == product_id,
        )
    ).first()
    profile = existing or OpticalLensProfile(company_id=auth.company_id, product_id=product_id)
    for field in (
        "lens_type", "lens_material", "refractive_index", "coating", "tint", "brand_name", "supply_mode",
    ):
        if field in body:
            setattr(profile, field, body[field])
    for field in ("photochromic", "blue_cut", "anti_reflective", "uv_protection", "polarization", "is_active"):
        if field in body:
            setattr(profile, field, bool(body[field]))
    session.add(profile)
    write_audit(session, auth, "optical_lens_upsert", "optical_lens_profile", profile.id, detail={"product_id": product_id})
    session.commit()
    session.refresh(profile)
    return _serialize_lens(session, profile, auth.store_id)


# --- Prescriptions ---

def _serialize_rx(rx: OpticalPrescription) -> dict[str, Any]:
    return {
        "id": rx.id,
        "customer_id": rx.customer_id,
        "prescription_no": rx.prescription_no,
        "prescription_date": rx.prescription_date.isoformat() if rx.prescription_date else None,
        "prescribed_by": rx.prescribed_by,
        "doctor_name": rx.doctor_name,
        "clinic_name": rx.clinic_name,
        "notes": rx.notes,
        "status": rx.status,
        "od": {
            "sphere": rx.od_sphere,
            "cylinder": rx.od_cylinder,
            "axis": rx.od_axis,
            "add": rx.od_add,
            "prism": rx.od_prism,
            "base": rx.od_base,
            "va": rx.od_va,
            "pd": rx.od_pd,
        },
        "os": {
            "sphere": rx.os_sphere,
            "cylinder": rx.os_cylinder,
            "axis": rx.os_axis,
            "add": rx.os_add,
            "prism": rx.os_prism,
            "base": rx.os_base,
            "va": rx.os_va,
            "pd": rx.os_pd,
        },
        "total_pd": rx.total_pd,
        "fitting_height_right": rx.fitting_height_right,
        "fitting_height_left": rx.fitting_height_left,
        "created_at": rx.created_at.isoformat() if rx.created_at else None,
        "summary": {
            "od": f"SPH {rx.od_sphere or 0} CYL {rx.od_cylinder or 0} AXIS {rx.od_axis or '-'}",
            "os": f"SPH {rx.os_sphere or 0} CYL {rx.os_cylinder or 0} AXIS {rx.os_axis or '-'}",
        },
    }


def list_prescriptions(
    session: Session,
    auth: AuthContext,
    *,
    customer_id: Optional[str] = None,
) -> list[dict]:
    _require(auth, "optical.prescription_view")
    q = select(OpticalPrescription).where(OpticalPrescription.company_id == auth.company_id)
    if customer_id:
        q = q.where(OpticalPrescription.customer_id == customer_id)
    rows = session.exec(q).all()
    rows = sorted(rows, key=lambda r: r.created_at or datetime.min, reverse=True)
    return [_serialize_rx(r) for r in rows]


def get_prescription(session: Session, auth: AuthContext, rx_id: str) -> dict:
    _require(auth, "optical.prescription_view")
    rx = session.get(OpticalPrescription, rx_id)
    if not rx or rx.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Prescription not found")
    return _serialize_rx(rx)


def create_prescription(session: Session, auth: AuthContext, body: dict) -> dict:
    _require(auth, "optical.prescription_manage")
    customer_id = body.get("customer_id")
    if not customer_id:
        raise HTTPException(status_code=400, detail="customer_id required")
    _customer_or_404(session, auth.company_id, customer_id)
    od = body.get("od") or {}
    os_ = body.get("os") or {}
    rx = OpticalPrescription(
        company_id=auth.company_id,
        customer_id=customer_id,
        prescription_no=_next_no(session, auth.company_id, "RX", OpticalPrescription),
        prescription_date=_parse_dt(body.get("prescription_date")) or _utc_now(),
        prescribed_by=body.get("prescribed_by"),
        doctor_name=body.get("doctor_name"),
        clinic_name=body.get("clinic_name"),
        notes=body.get("notes"),
        status="active",
        od_sphere=float(od["sphere"]) if od.get("sphere") is not None else None,
        od_cylinder=float(od["cylinder"]) if od.get("cylinder") is not None else None,
        od_axis=_validate_axis(od.get("axis"), "OD"),
        od_add=float(od["add"]) if od.get("add") is not None else None,
        od_prism=float(od["prism"]) if od.get("prism") is not None else None,
        od_base=od.get("base"),
        od_va=od.get("va"),
        od_pd=float(od["pd"]) if od.get("pd") is not None else None,
        os_sphere=float(os_["sphere"]) if os_.get("sphere") is not None else None,
        os_cylinder=float(os_["cylinder"]) if os_.get("cylinder") is not None else None,
        os_axis=_validate_axis(os_.get("axis"), "OS"),
        os_add=float(os_["add"]) if os_.get("add") is not None else None,
        os_prism=float(os_["prism"]) if os_.get("prism") is not None else None,
        os_base=os_.get("base"),
        os_va=os_.get("va"),
        os_pd=float(os_["pd"]) if os_.get("pd") is not None else None,
        total_pd=float(body["total_pd"]) if body.get("total_pd") is not None else None,
        fitting_height_right=float(body["fitting_height_right"]) if body.get("fitting_height_right") is not None else None,
        fitting_height_left=float(body["fitting_height_left"]) if body.get("fitting_height_left") is not None else None,
        created_by=auth.user_id,
    )
    session.add(rx)
    write_audit(session, auth, "optical_prescription_create", "optical_prescription", rx.id, detail={"customer_id": customer_id})
    session.commit()
    session.refresh(rx)
    return _serialize_rx(rx)


# --- Orders ---

def _serialize_line(line: OpticalOrderLine) -> dict[str, Any]:
    cfg = {}
    if line.configuration_json:
        try:
            cfg = json.loads(line.configuration_json)
        except json.JSONDecodeError:
            cfg = {"raw": line.configuration_json}
    return {
        "id": line.id,
        "line_type": line.line_type,
        "product_id": line.product_id,
        "sku": line.sku,
        "description": line.description,
        "qty": line.qty,
        "unit_price": line.unit_price,
        "discount": line.discount,
        "tax": line.tax,
        "line_total": line.line_total,
        "supply_mode": line.supply_mode,
        "configuration": cfg,
    }


def _recalc(session: Session, order: OpticalOrder, *, tax_rate: float = 0.05) -> None:
    lines = session.exec(select(OpticalOrderLine).where(OpticalOrderLine.order_id == order.id)).all()
    gross = 0.0
    for line in lines:
        line.line_total = round(max(0.0, float(line.qty) * float(line.unit_price) - float(line.discount or 0)), 2)
        gross += line.line_total
        session.add(line)
    order.gross_amount = round(gross, 2)
    taxable = max(0.0, order.gross_amount - float(order.discount_amount or 0))
    if order.tax_amount is None or order.status == "draft":
        order.tax_amount = round(taxable * tax_rate, 2)
    order.net_amount = round(taxable + float(order.tax_amount or 0), 2)
    order.due_amount = round(max(0.0, order.net_amount - float(order.paid_amount or 0)), 2)


def _serialize_order(session: Session, order: OpticalOrder) -> dict[str, Any]:
    lines = session.exec(select(OpticalOrderLine).where(OpticalOrderLine.order_id == order.id)).all()
    customer_name = None
    if order.customer_id:
        c = session.get(Customer, order.customer_id)
        customer_name = c.name if c else None
    rx_no = None
    if order.prescription_id:
        rx = session.get(OpticalPrescription, order.prescription_id)
        rx_no = rx.prescription_no if rx else None
    return {
        "id": order.id,
        "order_no": order.order_no,
        "store_id": order.store_id,
        "customer_id": order.customer_id,
        "customer_name": customer_name,
        "prescription_id": order.prescription_id,
        "prescription_no": rx_no,
        "order_date": order.order_date.isoformat() if order.order_date else None,
        "promised_date": order.promised_date.isoformat() if order.promised_date else None,
        "delivery_date": order.delivery_date.isoformat() if order.delivery_date else None,
        "service_type": order.service_type,
        "status": order.status,
        "lab_type": order.lab_type,
        "lab_name": order.lab_name,
        "lab_reference_no": order.lab_reference_no,
        "sent_to_lab_at": order.sent_to_lab_at.isoformat() if order.sent_to_lab_at else None,
        "ready_at": order.ready_at.isoformat() if order.ready_at else None,
        "delivered_at": order.delivered_at.isoformat() if order.delivered_at else None,
        "gross_amount": order.gross_amount,
        "discount_amount": order.discount_amount,
        "tax_amount": order.tax_amount,
        "net_amount": order.net_amount,
        "advance_amount": order.advance_amount,
        "paid_amount": order.paid_amount,
        "due_amount": order.due_amount,
        "sales_invoice_id": order.sales_invoice_id,
        "notes": order.notes,
        "lines": [_serialize_line(l) for l in lines],
        "created_at": order.created_at.isoformat() if order.created_at else None,
    }


def list_orders(
    session: Session,
    auth: AuthContext,
    *,
    status: Optional[str] = None,
    customer_id: Optional[str] = None,
) -> list[dict]:
    q = select(OpticalOrder).where(OpticalOrder.company_id == auth.company_id)
    if status:
        q = q.where(OpticalOrder.status == status)
    if customer_id:
        q = q.where(OpticalOrder.customer_id == customer_id)
    rows = session.exec(q).all()
    rows = sorted(rows, key=lambda r: r.created_at or datetime.min, reverse=True)
    return [_serialize_order(session, r) for r in rows]


def get_order(session: Session, auth: AuthContext, order_id: str) -> dict:
    return _serialize_order(session, _order_or_404(session, auth.company_id, order_id))


def create_order(session: Session, auth: AuthContext, body: dict) -> dict:
    _require(auth, "optical.order_manage")
    store_id = body.get("store_id") or auth.store_id
    if not store_id:
        raise HTTPException(status_code=400, detail="store_id required")
    customer_id = body.get("customer_id")
    if customer_id:
        _customer_or_404(session, auth.company_id, customer_id)
    prescription_id = body.get("prescription_id")
    if prescription_id:
        rx = session.get(OpticalPrescription, prescription_id)
        if not rx or rx.company_id != auth.company_id:
            raise HTTPException(status_code=404, detail="Prescription not found")
        if customer_id and rx.customer_id != customer_id:
            raise HTTPException(status_code=400, detail="Prescription does not belong to customer")
        if not customer_id:
            customer_id = rx.customer_id
    order = OpticalOrder(
        company_id=auth.company_id,
        store_id=store_id,
        order_no=_next_no(session, auth.company_id, "OPT", OpticalOrder),
        customer_id=customer_id,
        prescription_id=prescription_id,
        order_date=_utc_now(),
        promised_date=_parse_dt(body.get("promised_date")),
        service_type=body.get("service_type") or "eyewear",
        status="draft",
        lab_type=body.get("lab_type") or "internal",
        lab_name=body.get("lab_name"),
        notes=body.get("notes"),
        discount_amount=float(body.get("discount_amount") or 0),
        created_by=auth.user_id,
    )
    session.add(order)
    session.flush()
    for raw in body.get("lines") or []:
        _add_line_internal(session, auth, order, raw)
    _recalc(session, order, tax_rate=float(body.get("tax_rate") or 0.05))
    session.add(order)
    write_audit(session, auth, "optical_order_create", "optical_order", order.id, detail={"order_no": order.order_no})
    session.commit()
    session.refresh(order)
    return _serialize_order(session, order)


def _add_line_internal(session: Session, auth: AuthContext, order: OpticalOrder, raw: dict) -> OpticalOrderLine:
    line_type = str(raw.get("line_type") or "frame")
    if line_type not in LINE_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid line_type: {line_type}")
    product = None
    product_id = raw.get("product_id")
    if product_id:
        product = _product_or_404(session, auth.company_id, product_id)
    unit_price = float(raw["unit_price"]) if raw.get("unit_price") is not None else (product.base_price if product else 0)
    qty = float(raw.get("qty") or 1)
    discount = float(raw.get("discount") or 0)
    supply_mode = raw.get("supply_mode")
    if line_type.startswith("lens") and product_id and not supply_mode:
        lens = session.exec(
            select(OpticalLensProfile).where(
                OpticalLensProfile.company_id == auth.company_id,
                OpticalLensProfile.product_id == product_id,
            )
        ).first()
        supply_mode = lens.supply_mode if lens else "stocked"
    cfg = raw.get("configuration") or {}
    line = OpticalOrderLine(
        order_id=order.id,
        line_type=line_type,
        product_id=product.id if product else product_id,
        sku=(product.sku if product else raw.get("sku")) or "",
        description=raw.get("description") or (product.name if product else line_type),
        qty=qty,
        unit_price=unit_price,
        discount=discount,
        line_total=round(max(0.0, qty * unit_price - discount), 2),
        supply_mode=supply_mode,
        configuration_json=json.dumps(cfg) if cfg else None,
    )
    session.add(line)
    return line


def add_order_line(session: Session, auth: AuthContext, order_id: str, body: dict) -> dict:
    _require(auth, "optical.order_manage")
    order = _order_or_404(session, auth.company_id, order_id)
    if order.status not in {"draft", "confirmed"}:
        raise HTTPException(status_code=400, detail="Cannot add lines after lab processing starts")
    _add_line_internal(session, auth, order, body)
    _recalc(session, order)
    session.add(order)
    session.commit()
    return _serialize_order(session, order)


def confirm_order(session: Session, auth: AuthContext, order_id: str, body: dict | None = None) -> dict:
    _require(auth, "optical.order_manage")
    order = _order_or_404(session, auth.company_id, order_id)
    if order.status != "draft":
        raise HTTPException(status_code=400, detail="Only draft orders can be confirmed")
    body = body or {}
    lines = session.exec(select(OpticalOrderLine).where(OpticalOrderLine.order_id == order.id)).all()
    if not lines:
        raise HTTPException(status_code=400, detail="Add at least one line before confirming")
    if body.get("discount_amount") is not None:
        discount = float(body["discount_amount"])
        if discount > 0 and discount > order.gross_amount:
            raise HTTPException(status_code=400, detail="Discount exceeds gross")
        if discount > order.gross_amount * 0.1:
            _require(auth, "optical.price_override")
            if not body.get("price_override_reason"):
                raise HTTPException(status_code=400, detail="price_override_reason required")
            order.price_override_reason = body["price_override_reason"]
        order.discount_amount = discount
    if body.get("promised_date"):
        order.promised_date = _parse_dt(body["promised_date"])
    if body.get("lab_type"):
        order.lab_type = body["lab_type"]
    if body.get("lab_name"):
        order.lab_name = body["lab_name"]
    _recalc(session, order, tax_rate=float(body.get("tax_rate") or 0.05))
    order.status = "confirmed"
    session.add(order)
    write_audit(session, auth, "optical_order_confirm", "optical_order", order.id, detail={"net_amount": order.net_amount})
    session.commit()
    return _serialize_order(session, order)


def update_order_status(session: Session, auth: AuthContext, order_id: str, body: dict) -> dict:
    order = _order_or_404(session, auth.company_id, order_id)
    new_status = str(body.get("status") or "").strip()
    if new_status not in ORDER_TRANSITIONS:
        raise HTTPException(status_code=400, detail=f"Invalid status: {new_status}")
    allowed = ORDER_TRANSITIONS.get(order.status, set())
    if new_status not in allowed:
        raise HTTPException(status_code=400, detail=f"Cannot transition from {order.status} to {new_status}")

    lab_statuses = {"sent_to_lab", "lens_processing", "lens_ready", "fitting", "qc", "ready"}
    if new_status in lab_statuses:
        _require(auth, "optical.lab_manage")
    elif new_status == "delivered":
        _require(auth, "optical.delivery")
    elif new_status == "cancelled":
        _require(auth, "optical.order_manage")
        if not body.get("reason"):
            raise HTTPException(status_code=400, detail="reason required to cancel")
        order.cancelled_reason = body["reason"]
    else:
        _require(auth, "optical.order_manage")

    if new_status == "delivered":
        if float(order.due_amount or 0) > 0.01 and not body.get("allow_due"):
            raise HTTPException(status_code=400, detail="Settle outstanding balance before delivery")
        if not order.sales_invoice_id:
            raise HTTPException(status_code=400, detail="Finalize payment/invoice before delivery")
        order.delivered_at = _utc_now()
        order.delivered_by = auth.user_id
        order.delivery_date = order.delivered_at

    before = order.status
    order.status = new_status
    now = _utc_now()
    if new_status == "sent_to_lab":
        order.sent_to_lab_at = now
        if body.get("lab_reference_no"):
            order.lab_reference_no = body["lab_reference_no"]
        if body.get("lab_name"):
            order.lab_name = body["lab_name"]
        if body.get("expected_from_lab_at"):
            order.expected_from_lab_at = _parse_dt(body["expected_from_lab_at"])
    elif new_status == "lens_ready":
        order.received_from_lab_at = now
    elif new_status == "fitting":
        order.fitting_started_at = now
    elif new_status == "qc":
        order.qc_completed_at = now
    elif new_status == "ready":
        order.ready_at = now
    session.add(order)
    write_audit(
        session,
        auth,
        "optical_order_status",
        "optical_order",
        order.id,
        detail={"before": before, "after": new_status, "reason": body.get("reason")},
    )
    session.commit()
    return _serialize_order(session, order)


def record_advance(session: Session, auth: AuthContext, order_id: str, body: dict) -> dict:
    _require(auth, "optical.order_manage")
    if not role_has_permission(auth.role_code, "sales.create"):
        raise HTTPException(status_code=403, detail="Missing permission: sales.create")
    order = _order_or_404(session, auth.company_id, order_id)
    if order.status in {"cancelled", "delivered"}:
        raise HTTPException(status_code=400, detail="Cannot take advance on closed order")
    if order.sales_invoice_id:
        raise HTTPException(status_code=400, detail="Order already invoiced")
    amount = float(body.get("amount") or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="amount must be > 0")
    if amount > order.due_amount + 0.01:
        raise HTTPException(status_code=400, detail="Advance exceeds due amount")
    order.advance_amount = float(order.advance_amount or 0) + amount
    order.paid_amount = float(order.paid_amount or 0) + amount
    order.due_amount = round(max(0.0, order.net_amount - order.paid_amount), 2)
    if order.due_amount <= 0.01 and order.status in {"confirmed", "ready", "partially_paid"}:
        order.status = "paid" if order.status != "confirmed" else order.status
    elif order.paid_amount > 0 and order.status in {"confirmed", "ready"}:
        order.status = "partially_paid" if order.status == "ready" else order.status
    session.add(order)
    write_audit(
        session,
        auth,
        "optical_order_advance",
        "optical_order",
        order.id,
        detail={"amount": amount, "method": body.get("method") or "cash"},
    )
    session.commit()
    return _serialize_order(session, order)


def finalize_order(session: Session, auth: AuthContext, order_id: str, body: dict | None = None) -> dict:
    """Create canonical SalesInvoice once, reduce stock once, settle remaining balance."""
    _require(auth, "optical.order_manage")
    if not role_has_permission(auth.role_code, "sales.create"):
        raise HTTPException(status_code=403, detail="Missing permission: sales.create")
    order = _order_or_404(session, auth.company_id, order_id, for_update=True)
    if order.sales_invoice_id:
        raise HTTPException(status_code=409, detail="Order already invoiced")
    if order.status in {"draft", "cancelled"}:
        raise HTTPException(status_code=400, detail="Confirm order before finalizing")
    body = body or {}
    lines = session.exec(select(OpticalOrderLine).where(OpticalOrderLine.order_id == order.id)).all()
    sale_lines: list[SaleLineIn] = []
    for line in lines:
        stocked = (line.supply_mode or "stocked") == "stocked" and line.product_id
        unit = max(0.0, float(line.unit_price) - (float(line.discount or 0) / max(float(line.qty), 1)))
        sale_lines.append(
            SaleLineIn(
                product_id=line.product_id if stocked else None,
                sku=line.sku or "OPT",
                name=line.description,
                qty=line.qty,
                unit_price=unit,
                meta={
                    "order_id": order.id,
                    "prescription_id": order.prescription_id,
                    "line_type": line.line_type,
                    "supply_mode": line.supply_mode or "stocked",
                    "configuration": json.loads(line.configuration_json) if line.configuration_json else {},
                    "optical_line_id": line.id,
                    "catalog_product_id": line.product_id,
                },
            )
        )

    remaining = round(max(0.0, order.net_amount - float(order.paid_amount or 0)), 2)
    payments_in = body.get("payments") or []
    if remaining > 0.01 and not payments_in:
        payments_in = [{"method": body.get("tender") or "cash", "amount": remaining}]
    # Include prior advances as a payment line for reconciliation on invoice
    sale_payments: list[PaymentLineIn] = []
    if float(order.paid_amount or 0) > 0:
        sale_payments.append(PaymentLineIn(method="advance", amount=float(order.paid_amount), reference=order.order_no))
    for p in payments_in:
        sale_payments.append(PaymentLineIn(method=p["method"], amount=float(p["amount"]), reference=p.get("reference")))
    paid_now = round(sum(float(p.get("amount") or 0) for p in payments_in), 2)
    if abs(paid_now - remaining) > 0.01 and not body.get("allow_due"):
        raise HTTPException(status_code=400, detail=f"Payment {paid_now} must equal remaining due {remaining}")

    from app.services.sales_service import create_sale_idempotent

    sale_body = SaleCreate(
        client_transaction_id=body.get("client_transaction_id") or f"opt-{order.id}-{int(_utc_now().timestamp())}",
        industry_pack="optical-shop",
        store_id=order.store_id,
        customer_id=order.customer_id or body.get("customer_id"),
        status="completed",
        lines=sale_lines,
        subtotal=order.gross_amount,
        discount=order.discount_amount,
        tax=order.tax_amount,
        total=order.net_amount,
        tender=sale_payments[-1].method if sale_payments else "cash",
        payments=sale_payments,
        industry_meta={
            "optical_order_id": order.id,
            "order_no": order.order_no,
            "prescription_id": order.prescription_id,
            "advance_amount": order.advance_amount,
        },
    )
    sale_out = create_sale_idempotent(session, auth, sale_body)
    order.sales_invoice_id = sale_out.id
    order.paid_amount = order.net_amount if not body.get("allow_due") else float(order.paid_amount or 0) + paid_now
    order.due_amount = round(max(0.0, order.net_amount - order.paid_amount), 2)
    order.status = "paid" if order.due_amount <= 0.01 else "partially_paid"
    session.add(order)
    write_audit(
        session,
        auth,
        "optical_order_finalize",
        "optical_order",
        order.id,
        detail={"invoice_id": sale_out.id, "total": order.net_amount},
    )
    session.commit()
    return {
        "order": _serialize_order(session, order),
        "invoice": sale_out.model_dump() if hasattr(sale_out, "model_dump") else dict(sale_out),
    }
