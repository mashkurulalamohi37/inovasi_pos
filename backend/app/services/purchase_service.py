"""Purchase order lifecycle: create, approve, receive, return."""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone

from app.models.base import parse_iso_dt

from fastapi import HTTPException
from sqlalchemy import or_
from sqlmodel import Session, select

from app.dependencies import AuthContext, write_audit
from app.inventory.locking import for_update
from app.models.config_engine import NumberSeries
from app.models.core import Store
from app.models.operations import (
    PurchaseReceive,
    PurchaseReceiveLine,
    PurchaseReturn,
    PurchaseReturnLine,
    SupplierBalance,
    SupplierInvoice,
    SupplierPayment,
)
from app.models.product import Product, ProductVariant, Supplier
from app.models.sales import PurchaseInvoice, PurchaseInvoiceLine
from app.inventory.constants import PURCHASE_RECEIVE, PURCHASE_RETURN
from app.services.inventory_service import apply_industry_receive_stock, record_stock_movement


def _next_number(session: Session, company_id: str, series_code: str, prefix: str) -> str:
    ns = session.exec(
        select(NumberSeries).where(NumberSeries.company_id == company_id, NumberSeries.series_code == series_code)
    ).first()
    if not ns:
        ns = NumberSeries(company_id=company_id, series_code=series_code, prefix=prefix, next_number=1001)
        session.add(ns)
        session.flush()
    num = f"{ns.prefix}-{ns.next_number:04d}"
    ns.next_number += 1
    session.add(ns)
    return num


def _ensure_supplier_balance(session: Session, company_id: str, supplier_id: str) -> SupplierBalance:
    bal = session.exec(
        select(SupplierBalance).where(
            SupplierBalance.company_id == company_id,
            SupplierBalance.supplier_id == supplier_id,
        )
    ).first()
    if not bal:
        bal = SupplierBalance(company_id=company_id, supplier_id=supplier_id, outstanding=0)
        session.add(bal)
        session.flush()
    return bal


def _validate_supplier(session: Session, company_id: str, supplier_id: str | None) -> Supplier | None:
    if not supplier_id:
        return None
    supplier = session.get(Supplier, supplier_id)
    if not supplier or supplier.company_id != company_id:
        raise HTTPException(status_code=400, detail="Supplier not found for this tenant")
    return supplier


def _validate_store(session: Session, company_id: str, store_id: str | None) -> str | None:
    if not store_id:
        return None
    store = session.get(Store, store_id)
    if not store or store.company_id != company_id:
        raise HTTPException(status_code=400, detail="Store not found for this tenant")
    return store_id


def _validate_product(session: Session, company_id: str, product_id: str) -> Product:
    product = session.get(Product, product_id)
    if not product or product.company_id != company_id:
        raise HTTPException(status_code=400, detail=f"Product not found: {product_id}")
    if not product.is_active:
        raise HTTPException(status_code=400, detail=f"Product is inactive: {product.sku}")
    return product


def _validate_fashion_variant(
    session: Session,
    company_id: str,
    product: Product,
    variant_id: str | None,
) -> ProductVariant | None:
    """Fashion PO/GRN lines must reference an active ProductVariant for the parent SKU."""
    if product.industry_pack != "fashion":
        return None
    if not variant_id:
        raise HTTPException(
            status_code=400,
            detail=f"Fashion product {product.sku} requires variant_id (size/color)",
        )
    variant = session.get(ProductVariant, variant_id)
    if (
        not variant
        or variant.company_id != company_id
        or variant.product_id != product.id
    ):
        raise HTTPException(status_code=400, detail=f"Invalid variant for fashion product {product.sku}")
    if not variant.is_active:
        raise HTTPException(status_code=400, detail=f"Variant is inactive: {variant.variant_code}")
    return variant


def _line_totals(lines_in: list[dict]) -> tuple[float, float, float, float]:
    subtotal = 0.0
    line_discount = 0.0
    line_tax = 0.0
    for ln in lines_in:
        qty = float(ln.get("qty") or 0)
        if qty <= 0:
            raise HTTPException(status_code=400, detail="Line quantity must be greater than zero")
        unit_cost = float(ln.get("unit_cost") or 0)
        if unit_cost < 0:
            raise HTTPException(status_code=400, detail="Unit cost cannot be negative")
        disc = float(ln.get("discount_amount") or 0)
        tax = float(ln.get("tax_amount") or 0)
        line_total = float(ln.get("line_total") or (qty * unit_cost - disc + tax))
        subtotal += line_total
        line_discount += disc
        line_tax += tax
    return subtotal, line_discount, line_tax, subtotal


def _parse_expiry_dt(val) -> datetime | None:
    if not val:
        return None
    if isinstance(val, datetime):
        return val
    try:
        raw = str(val).strip()
        if len(raw) == 10 and raw[4] == "-" and raw[7] == "-":
            return datetime.fromisoformat(f"{raw}T00:00:00").replace(tzinfo=timezone.utc)
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except Exception:
        return None


def _persist_lines(session: Session, company_id: str, purchase_id: str, lines_in: list[dict]) -> None:
    for ln in lines_in:
        product = _validate_product(session, company_id, ln["product_id"])
        _validate_fashion_variant(session, company_id, product, ln.get("variant_id"))
        qty = float(ln.get("qty") or 0)
        unit_cost = float(ln.get("unit_cost") or 0)
        disc = float(ln.get("discount_amount") or 0)
        tax = float(ln.get("tax_amount") or 0)
        line_total = float(ln.get("line_total") or qty * unit_cost - disc + tax)
        session.add(
            PurchaseInvoiceLine(
                purchase_id=purchase_id,
                product_id=ln["product_id"],
                variant_id=ln.get("variant_id"),
                batch_id=ln.get("batch_id"),
                batch_no=ln.get("batch_no"),
                expiry_date=_parse_expiry_dt(ln.get("expiry_date")),
                serial_no=ln.get("serial_no"),
                qty=qty,
                unit_cost=unit_cost,
                discount_amount=disc,
                tax_amount=tax,
                line_total=line_total,
            )
        )


def _parse_list_date_bound(value: str, *, end_of_day: bool) -> datetime | None:
    """Parse list filter dates. Date-only values use start/end of that calendar day (UTC)."""
    raw = value.strip().replace("Z", "+00:00")
    try:
        if len(raw) == 10 and raw[4] == "-" and raw[7] == "-":
            day = datetime.fromisoformat(raw).replace(tzinfo=timezone.utc)
            if end_of_day:
                return day.replace(hour=23, minute=59, second=59, microsecond=999999)
            return day.replace(hour=0, minute=0, second=0, microsecond=0)
        parsed = datetime.fromisoformat(raw)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed
    except ValueError:
        return None


def list_purchases(
    session: Session,
    company_id: str,
    status: str | None = None,
    supplier_id: str | None = None,
    store_id: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
):
    stmt = select(PurchaseInvoice).where(PurchaseInvoice.company_id == company_id)
    if status:
        stmt = stmt.where(PurchaseInvoice.status == status)
    if supplier_id:
        stmt = stmt.where(PurchaseInvoice.supplier_id == supplier_id)
    if store_id:
        stmt = stmt.where(PurchaseInvoice.store_id == store_id)
    if from_date:
        start = _parse_list_date_bound(from_date, end_of_day=False)
        if start is not None:
            stmt = stmt.where(PurchaseInvoice.purchase_date >= start)
    if to_date:
        end = _parse_list_date_bound(to_date, end_of_day=True)
        if end is not None:
            stmt = stmt.where(PurchaseInvoice.purchase_date <= end)
    purchases = session.exec(stmt.order_by(PurchaseInvoice.created_at.desc())).all()  # type: ignore
    result = []
    for p in purchases:
        supplier = session.get(Supplier, p.supplier_id) if p.supplier_id else None
        lines = session.exec(select(PurchaseInvoiceLine).where(PurchaseInvoiceLine.purchase_id == p.id)).all()
        result.append(_purchase_out(session, p, supplier, lines))
    return result


def get_purchase(session: Session, company_id: str, purchase_id: str):
    p = session.get(PurchaseInvoice, purchase_id)
    if not p or p.company_id != company_id:
        raise HTTPException(status_code=404, detail="Purchase not found")
    supplier = session.get(Supplier, p.supplier_id) if p.supplier_id else None
    lines = session.exec(select(PurchaseInvoiceLine).where(PurchaseInvoiceLine.purchase_id == p.id)).all()
    return _purchase_out(session, p, supplier, lines)


def _returned_qty_map(session: Session, purchase_id: str) -> dict[str, float]:
    out: dict[str, float] = {}
    returns = session.exec(select(PurchaseReturn).where(PurchaseReturn.purchase_id == purchase_id)).all()
    for ret in returns:
        ret_lines = session.exec(
            select(PurchaseReturnLine).where(PurchaseReturnLine.return_id == ret.id)
        ).all()
        for rl in ret_lines:
            if rl.purchase_line_id:
                out[rl.purchase_line_id] = out.get(rl.purchase_line_id, 0) + rl.qty
    return out


def _safe_float(val: float | int | None) -> float:
    if val is None:
        return 0.0
    try:
        f = float(val)
        if math.isinf(f) or math.isnan(f) or abs(f) > 1e12:
            return 0.0
        return f
    except (ValueError, TypeError):
        return 0.0


def _purchase_out(
    session: Session,
    p: PurchaseInvoice,
    supplier: Supplier | None,
    lines: list[PurchaseInvoiceLine],
) -> dict:
    returned_map = _returned_qty_map(session, p.id)
    product_names: dict[str, tuple[str, str, str, bool]] = {}
    product_meta_map: dict[str, dict[str, Any]] = {}
    variant_info: dict[str, dict[str, str | None]] = {}
    for ln in lines:
        if ln.product_id not in product_names:
            prod = session.get(Product, ln.product_id)
            is_serialized = False
            prod_meta: dict[str, Any] = {}
            if prod:
                if prod.meta_json:
                    try:
                        prod_meta = json.loads(prod.meta_json)
                    except json.JSONDecodeError:
                        prod_meta = {}
                if prod.industry_pack in {"electronics", "mobile-shop"}:
                    from app.services.electronics_service import product_requires_serial
                    is_serialized = product_requires_serial(prod)
            product_names[ln.product_id] = (
                prod.name if prod else "—",
                prod.sku if prod else "—",
                prod.industry_pack if prod else "",
                is_serialized,
            )
            product_meta_map[ln.product_id] = prod_meta
        if ln.variant_id and ln.variant_id not in variant_info:
            vv = session.get(ProductVariant, ln.variant_id)
            variant_info[ln.variant_id] = {
                "variant_code": vv.variant_code if vv else None,
                "size": vv.size if vv else None,
                "color": vv.color if vv else None,
                "barcode": vv.barcode if vv else None,
            }
    packs = [product_names[ln.product_id][2] for ln in lines if ln.product_id in product_names]
    industry_pack = packs[0] if packs else None
    return {
        "id": p.id,
        "invoice_number": p.invoice_number,
        "supplier_id": p.supplier_id,
        "supplier_name": supplier.name if supplier else None,
        "store_id": p.store_id,
        "warehouse_id": p.warehouse_id,
        "purchase_date": p.purchase_date.isoformat() if p.purchase_date else None,
        "expected_date": p.expected_date.isoformat() if p.expected_date else None,
        "reference_no": p.reference_no,
        "status": p.status,
        "industry_pack": industry_pack,
        "subtotal": _safe_float(p.subtotal),
        "discount_amount": _safe_float(p.discount_amount),
        "tax_amount": _safe_float(p.tax_amount),
        "total": _safe_float(p.total),
        "paid_amount": _safe_float(p.paid_amount),
        "due_amount": _safe_float(p.due_amount),
        "remarks": p.remarks,
        "created_by": p.created_by,
        "lines": [
            {
                "id": ln.id,
                "product_id": ln.product_id,
                "product_name": product_names.get(ln.product_id, ("—", "—", "", False))[0],
                "sku": product_names.get(ln.product_id, ("—", "—", "", False))[1],
                "industry_pack": product_names.get(ln.product_id, ("—", "—", "", False))[2] or None,
                "is_serialized": product_names.get(ln.product_id, ("—", "—", "", False))[3],
                "requires_serial": product_names.get(ln.product_id, ("—", "—", "", False))[3],
                "meta": product_meta_map.get(ln.product_id, {}),
                "variant_id": ln.variant_id,
                "variant_code": variant_info.get(ln.variant_id or "", {}).get("variant_code"),
                "size": variant_info.get(ln.variant_id or "", {}).get("size"),
                "color": variant_info.get(ln.variant_id or "", {}).get("color"),
                "batch_id": ln.batch_id,
                "batch_no": getattr(ln, "batch_no", None),
                "expiry_date": ln.expiry_date.isoformat() if getattr(ln, "expiry_date", None) else None,
                "serial_no": ln.serial_no,
                "qty": _safe_float(ln.qty),
                "received_qty": _safe_float(ln.received_qty),
                "returned_qty": _safe_float(returned_map.get(ln.id, 0)),
                "open_qty": _safe_float(max(0, ln.qty - ln.received_qty)),
                "returnable_qty": _safe_float(max(0, ln.received_qty - returned_map.get(ln.id, 0))),
                "unit_cost": _safe_float(ln.unit_cost),
                "discount_amount": _safe_float(ln.discount_amount),
                "tax_amount": _safe_float(ln.tax_amount),
                "line_total": _safe_float(ln.line_total),
            }
            for ln in lines
        ],
    }


def create_purchase(session: Session, auth: AuthContext, body: dict) -> dict:
    lines_in = body.get("lines") or []
    if not lines_in:
        raise HTTPException(status_code=400, detail="At least one line required")
    supplier_id = body.get("supplier_id")
    _validate_supplier(session, auth.company_id, supplier_id)
    store_id = _validate_store(session, auth.company_id, body.get("store_id") or auth.store_id)
    for ln in lines_in:
        _validate_product(session, auth.company_id, ln["product_id"])
    subtotal, _, _, _ = _line_totals(lines_in)
    discount = float(body.get("discount_amount") or 0)
    tax = float(body.get("tax_amount") or 0)
    total = round(subtotal - discount + tax, 2)
    purchase = PurchaseInvoice(
        company_id=auth.company_id,
        store_id=store_id,
        warehouse_id=body.get("warehouse_id"),
        supplier_id=supplier_id,
        invoice_number=_next_number(session, auth.company_id, "PURCHASE", "PO"),
        purchase_date=datetime.now(timezone.utc),
        expected_date=parse_iso_dt(body.get("expected_date")) if body.get("expected_date") else None,
        reference_no=(body.get("reference_no") or "").strip() or None,
        status="DRAFT",
        subtotal=subtotal,
        discount_amount=discount,
        tax_amount=tax,
        total=total,
        due_amount=total,
        remarks=body.get("remarks"),
        created_by=auth.user_id,
    )
    session.add(purchase)
    session.flush()
    _persist_lines(session, auth.company_id, purchase.id, lines_in)
    write_audit(session, auth, "purchase_create", "purchase_invoice", purchase.id, {"total": total})
    session.flush()
    return get_purchase(session, auth.company_id, purchase.id)


def update_purchase(session: Session, auth: AuthContext, purchase_id: str, body: dict) -> dict:
    purchase = session.get(PurchaseInvoice, purchase_id)
    if not purchase or purchase.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Purchase not found")
    if purchase.status != "DRAFT":
        raise HTTPException(status_code=409, detail="Only DRAFT purchases can be edited")
    if body.get("remarks") is not None:
        purchase.remarks = body["remarks"]
    if "expected_date" in body:
        purchase.expected_date = parse_iso_dt(body["expected_date"]) if body["expected_date"] else None
    if "reference_no" in body:
        purchase.reference_no = (body["reference_no"] or "").strip() or None
    if body.get("supplier_id") is not None:
        _validate_supplier(session, auth.company_id, body["supplier_id"])
        purchase.supplier_id = body["supplier_id"]
    if body.get("store_id") is not None:
        purchase.store_id = _validate_store(session, auth.company_id, body["store_id"])
    if body.get("warehouse_id") is not None:
        purchase.warehouse_id = body["warehouse_id"]
    lines_in = body.get("lines")
    if lines_in is not None:
        existing = session.exec(
            select(PurchaseInvoiceLine).where(PurchaseInvoiceLine.purchase_id == purchase.id)
        ).all()
        if any(ln.received_qty > 0 for ln in existing):
            raise HTTPException(status_code=409, detail="Cannot replace lines after goods have been received")
        for ln in existing:
            session.delete(ln)
        session.flush()
        _line_totals(lines_in)
        for ln in lines_in:
            _validate_product(session, auth.company_id, ln["product_id"])
        _persist_lines(session, auth.company_id, purchase.id, lines_in)
        subtotal, _, _, _ = _line_totals(lines_in)
        purchase.subtotal = subtotal
        purchase.total = round(
            subtotal - float(body.get("discount_amount", purchase.discount_amount) or 0)
            + float(body.get("tax_amount", purchase.tax_amount) or 0),
            2,
        )
        purchase.due_amount = purchase.total
    if body.get("discount_amount") is not None:
        purchase.discount_amount = float(body["discount_amount"])
        purchase.total = round(purchase.subtotal - purchase.discount_amount + purchase.tax_amount, 2)
        purchase.due_amount = purchase.total
    if body.get("tax_amount") is not None:
        purchase.tax_amount = float(body["tax_amount"])
        purchase.total = round(purchase.subtotal - purchase.discount_amount + purchase.tax_amount, 2)
        purchase.due_amount = purchase.total
    session.add(purchase)
    write_audit(session, auth, "purchase_update", "purchase_invoice", purchase.id)
    session.flush()
    return get_purchase(session, auth.company_id, purchase.id)


def approve_purchase(session: Session, auth: AuthContext, purchase_id: str) -> dict:
    purchase = session.get(PurchaseInvoice, purchase_id)
    if not purchase or purchase.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Purchase not found")
    if purchase.status != "DRAFT":
        raise HTTPException(status_code=409, detail="Purchase already approved")
    purchase.status = "APPROVED"
    session.add(purchase)
    write_audit(session, auth, "purchase_approve", "purchase_invoice", purchase.id)
    session.flush()
    return get_purchase(session, auth.company_id, purchase.id)


def receive_purchase(session: Session, auth: AuthContext, purchase_id: str, body: dict) -> dict:
    purchase = session.exec(
        for_update(
            session,
            select(PurchaseInvoice).where(
                PurchaseInvoice.id == purchase_id,
                PurchaseInvoice.company_id == auth.company_id,
            ),
        )
    ).first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    if purchase.status not in ("APPROVED", "PARTIALLY_RECEIVED"):
        raise HTTPException(status_code=409, detail="Purchase must be approved before receive")
    receive_lines = body.get("lines") or []
    if not receive_lines:
        lines = session.exec(
            for_update(
                session,
                select(PurchaseInvoiceLine).where(PurchaseInvoiceLine.purchase_id == purchase.id),
            )
        ).all()
        receive_lines = [
            {"purchase_line_id": ln.id, "qty": ln.qty - ln.received_qty}
            for ln in lines
            if ln.qty > ln.received_qty
        ]
    # Pre-validate so we never create an empty GRN header.
    effective: list[dict] = []
    for rl in receive_lines:
        line_id = rl.get("purchase_line_id") or rl.get("line_id")
        qty = float(rl.get("qty") or 0)
        if not line_id:
            raise HTTPException(status_code=400, detail="purchase_line_id is required for each receive line")
        if qty <= 0:
            continue
        effective.append({**rl, "purchase_line_id": line_id, "qty": qty})
    if not effective:
        raise HTTPException(status_code=400, detail="Receive quantity required for at least one line")

    receive = PurchaseReceive(
        company_id=auth.company_id,
        purchase_id=purchase.id,
        receive_no=_next_number(session, auth.company_id, "GRN", "GRN"),
        store_id=body.get("store_id") or purchase.store_id or auth.store_id,
        warehouse_id=body.get("warehouse_id") or purchase.warehouse_id,
        received_by=auth.user_id,
        remarks=body.get("remarks"),
    )
    session.add(receive)
    session.flush()
    store_id = receive.store_id
    posted_any = False
    received_value_total = 0.0
    for rl in effective:
        line_id = rl["purchase_line_id"]
        pl = session.exec(
            for_update(
                session,
                select(PurchaseInvoiceLine).where(PurchaseInvoiceLine.id == line_id),
            )
        ).first()
        if not pl or pl.purchase_id != purchase.id:
            raise HTTPException(status_code=400, detail=f"Receive line does not belong to this purchase: {line_id}")
        qty = float(rl["qty"])
        remaining = pl.qty - pl.received_qty
        if qty > remaining:
            raise HTTPException(status_code=400, detail=f"Receive qty exceeds remaining for line {pl.id}")
        product = session.get(Product, pl.product_id)
        if not product or product.company_id != auth.company_id:
            raise HTTPException(status_code=400, detail=f"Product not found for purchase line {pl.id}")
        resolved_variant_id = pl.variant_id or rl.get("variant_id")
        if product.industry_pack == "fashion":
            _validate_fashion_variant(session, auth.company_id, product, resolved_variant_id)
            if not pl.variant_id and resolved_variant_id:
                pl.variant_id = resolved_variant_id
                session.add(pl)
        pl.received_qty += qty
        session.add(pl)
        serials_payload = rl.get("serials")
        serial_no = pl.serial_no or rl.get("serial_no")
        require_serial = False
        if product.industry_pack in {"electronics", "mobile-shop"}:
            from app.services.electronics_service import product_requires_serial

            require_serial = product_requires_serial(product)
        stock_qty = qty
        if product.industry_pack in {"hardware", "building-materials", "stationery"}:
            from app.services.hardware_service import convert_to_base, _material_profile

            profile = _material_profile(session, auth.company_id, product.id)
            purchase_uom = (
                rl.get("purchase_uom_id")
                or rl.get("uom_id")
                or (profile.default_purchase_uom_id if profile else None)
                or (profile.base_uom_id if profile else None)
                or product.unit_id
            )
            conv = convert_to_base(
                session,
                auth.company_id,
                product.id,
                qty,
                purchase_uom,
                for_sales=False,
                for_purchase=True,
                variant_id=resolved_variant_id,
            )
            stock_qty = float(conv["base_qty"])
        resolved_batch_id = apply_industry_receive_stock(
            session,
            auth.company_id,
            product,
            stock_qty,
            variant_id=resolved_variant_id,
            batch_id=pl.batch_id or rl.get("batch_id"),
            batch_no=rl.get("batch_no") or getattr(pl, "batch_no", None),
            expiry_date=rl.get("expiry_date") or (getattr(pl, "expiry_date", None).isoformat() if getattr(pl, "expiry_date", None) else None),
            serial_no=serial_no,
            serials=serials_payload,
            store_id=store_id,
            purchase_id=purchase.id,
            receive_id=receive.id,
            cost_price=pl.unit_cost,
            supplier_id=purchase.supplier_id,
            require_serial=require_serial,
            lot_no=rl.get("lot_no"),
            udi_code=rl.get("udi_code"),
            manufacture_date=rl.get("manufacture_date"),
            sterile_status=rl.get("sterile_status"),
            sterilization_method=rl.get("sterilization_method"),
            manufacturer_name=rl.get("manufacturer_name"),
        )
        line_batch_id = resolved_batch_id or pl.batch_id or rl.get("batch_id")
        if line_batch_id:
            pl.batch_id = line_batch_id
        first_serial = serial_no
        if isinstance(serials_payload, list) and serials_payload:
            first_serial = str(
                serials_payload[0].get("serial_no")
                or serials_payload[0].get("serial_imei")
                or serial_no
                or ""
            ) or None
        if first_serial:
            pl.serial_no = first_serial
        session.add(pl)
        if product.industry_pack == "jewelry":
            from app.services.jewelry_service import create_certificate

            jewelry_items = rl.get("jewelry_items") or []
            if not jewelry_items and (rl.get("certificate_no") or rl.get("tag_no") or rl.get("gross_weight")):
                jewelry_items = [{
                    "certificate_no": rl.get("certificate_no"),
                    "tag_no": rl.get("tag_no"),
                    "barcode": rl.get("barcode"),
                    "gross_weight": rl.get("gross_weight"),
                    "stone_weight": rl.get("stone_weight"),
                    "net_metal_weight": rl.get("net_metal_weight"),
                    "purity": rl.get("purity"),
                    "metal_type": rl.get("metal_type"),
                }]
            if qty > 0 and not jewelry_items:
                raise HTTPException(
                    status_code=400,
                    detail="Jewelry GRN requires certificate_no and gross_weight (or jewelry_items[])",
                )
            for item in jewelry_items:
                if not isinstance(item, dict):
                    continue
                cert_no = item.get("certificate_no") or item.get("cert_no")
                gross = float(item.get("gross_weight") or 0)
                if not cert_no:
                    raise HTTPException(status_code=400, detail="Jewelry GRN line requires certificate_no")
                if gross <= 0:
                    raise HTTPException(status_code=400, detail="Jewelry GRN line requires gross_weight > 0")
                create_certificate(
                    session,
                    auth,
                    {
                        "product_id": product.id,
                        "certificate_no": cert_no,
                        "tag_no": item.get("tag_no"),
                        "barcode": item.get("barcode"),
                        "gross_weight": gross,
                        "stone_weight": item.get("stone_weight") or 0,
                        "net_metal_weight": item.get("net_metal_weight"),
                        "purity": item.get("purity") or "22K",
                        "metal_type": item.get("metal_type") or "Gold",
                    },
                )
        session.add(
            PurchaseReceiveLine(
                receive_id=receive.id,
                purchase_line_id=pl.id,
                product_id=pl.product_id,
                variant_id=resolved_variant_id,
                batch_id=line_batch_id,
                serial_no=first_serial,
                qty=qty,
                unit_cost=pl.unit_cost,
            )
        )
        record_stock_movement(
            session,
            company_id=auth.company_id,
            product_id=pl.product_id,
            store_id=store_id,
            warehouse_id=receive.warehouse_id,
            in_qty=stock_qty,
            transaction_type=PURCHASE_RECEIVE,
            transaction_ref=receive.receive_no,
            reference_id=receive.id,
            unit_cost=pl.unit_cost,
            note=f"GRN {receive.receive_no}",
            created_by=auth.user_id,
            variant_id=resolved_variant_id,
            batch_id=line_batch_id,
            serial_no=first_serial,
        )
        received_value_total += stock_qty * (pl.unit_cost or 0)
        posted_any = True
    if not posted_any:
        raise HTTPException(status_code=400, detail="No stock was posted — check receive quantities")
    lines = session.exec(select(PurchaseInvoiceLine).where(PurchaseInvoiceLine.purchase_id == purchase.id)).all()
    if all(ln.received_qty >= ln.qty for ln in lines):
        purchase.status = "RECEIVED"
    else:
        purchase.status = "PARTIALLY_RECEIVED"
    session.add(purchase)
    write_audit(session, auth, "purchase_receive", "purchase_receive", receive.id, {"purchase_id": purchase.id})
    session.flush()

    if received_value_total > 0:
        from app.services.accounting_service import get_account_by_code, post_journal_entry

        inventory_account = get_account_by_code(session, auth.company_id, "1300")
        ap_account = get_account_by_code(session, auth.company_id, "2100")
        post_journal_entry(
            session,
            company_id=auth.company_id,
            created_by=auth.user_id,
            entry_date=datetime.now(timezone.utc),
            source_type="purchase",
            source_id=receive.id,
            lines=[
                {"account_id": inventory_account.id, "debit": round(received_value_total, 2), "store_id": store_id},
                {"account_id": ap_account.id, "credit": round(received_value_total, 2), "store_id": store_id},
            ],
            memo=f"GRN {receive.receive_no}",
        )

        # --- At-GRN partial / full payment ---
        payment_amount = float(body.get("payment_amount") or 0)
        if payment_amount > 0:
            payment_method = (body.get("payment_method") or "cash").lower()
            payment_reference = body.get("payment_reference")

            # Map method → account code: bank→1020, mobile→1030, cheque→1021, default→1010 (Cash)
            method_account_map = {
                "bank": "1020",
                "mobile": "1030",
                "cheque": "1021",
            }
            cash_code = method_account_map.get(payment_method, "1010")
            cash_account = get_account_by_code(session, auth.company_id, cash_code)
            if not cash_account:
                # Fallback to generic cash account if specific one not found
                cash_account = get_account_by_code(session, auth.company_id, "1010")

            if cash_account and ap_account:
                capped_payment = min(payment_amount, received_value_total)
                post_journal_entry(
                    session,
                    company_id=auth.company_id,
                    created_by=auth.user_id,
                    entry_date=datetime.now(timezone.utc),
                    source_type="purchase_payment",
                    source_id=receive.id,
                    lines=[
                        {"account_id": ap_account.id, "debit": round(capped_payment, 2), "store_id": store_id},
                        {"account_id": cash_account.id, "credit": round(capped_payment, 2), "store_id": store_id},
                    ],
                    memo=f"Payment at GRN {receive.receive_no}" + (f" | {payment_reference}" if payment_reference else ""),
                )
                # Update purchase invoice payment tracking
                purchase.amount_paid = round((purchase.amount_paid or 0) + capped_payment, 2)
                total_amount = purchase.total_amount or received_value_total
                purchase.amount_due = round(max(0, total_amount - purchase.amount_paid), 2)
                session.add(purchase)

                # Also record in supplier payment ledger for the supplier outstanding balance
                if purchase.supplier_id:
                    from app.services.purchase_service import _record_supplier_payment  # noqa: F811
                    try:
                        _record_supplier_payment(
                            session,
                            company_id=auth.company_id,
                            supplier_id=purchase.supplier_id,
                            amount=capped_payment,
                            method=payment_method,
                            reference=payment_reference,
                            created_by=auth.user_id,
                            purchase_id=purchase.id,
                        )
                    except Exception:
                        pass  # Non-fatal: journal entry already posted above

    return {"receive_id": receive.id, "receive_no": receive.receive_no, "purchase": get_purchase(session, auth.company_id, purchase.id)}


def direct_receive_purchase(session: Session, auth: AuthContext, body: dict) -> dict:
    """Atomic create → approve → full GRN receive. Returns linked PO + GRN."""
    lines_in = body.get("lines") or []
    if not lines_in:
        raise HTTPException(status_code=400, detail="At least one line is required")
    create_body = {
        "supplier_id": body.get("supplier_id"),
        "store_id": body.get("store_id"),
        "warehouse_id": body.get("warehouse_id"),
        "remarks": body.get("remarks"),
        "expected_date": body.get("expected_date"),
        "reference_no": body.get("reference_no"),
        "discount_amount": body.get("discount_amount") or 0,
        "tax_amount": body.get("tax_amount") or 0,
        "lines": [
            {
                "product_id": ln["product_id"],
                "variant_id": ln.get("variant_id"),
                "batch_id": ln.get("batch_id"),
                "batch_no": ln.get("batch_no"),
                "expiry_date": ln.get("expiry_date"),
                "serial_no": ln.get("serial_no"),
                "qty": ln.get("qty") or 1,
                "unit_cost": ln.get("unit_cost") or 0,
                "discount_amount": ln.get("discount_amount") or 0,
                "tax_amount": ln.get("tax_amount") or 0,
                "line_total": ln.get("line_total"),
            }
            for ln in lines_in
        ],
    }
    purchase = create_purchase(session, auth, create_body)
    purchase_id = purchase["id"]
    approve_purchase(session, auth, purchase_id)
    po_lines = purchase.get("lines") or []
    if len(po_lines) != len(lines_in):
        # Reload if create output omitted lines (should not happen).
        po_lines = [
            {"id": ln.id}
            for ln in session.exec(
                select(PurchaseInvoiceLine).where(PurchaseInvoiceLine.purchase_id == purchase_id)
            ).all()
        ]
    if len(po_lines) != len(lines_in):
        raise HTTPException(status_code=500, detail="Purchase lines mismatch after create")
    receive_meta_keys = (
        "batch_no",
        "expiry_date",
        "serial_no",
        "serials",
        "variant_id",
        "batch_id",
        "certificate_no",
        "tag_no",
        "barcode",
        "gross_weight",
        "stone_weight",
        "net_metal_weight",
        "purity",
        "metal_type",
        "jewelry_items",
        "lot_no",
        "udi_code",
        "manufacture_date",
        "sterile_status",
        "sterilization_method",
        "manufacturer_name",
        "purchase_uom_id",
        "uom_id",
    )
    receive_lines = []
    for pl, src in zip(po_lines, lines_in, strict=True):
        row: dict = {
            "purchase_line_id": pl["id"] if isinstance(pl, dict) else pl.id,
            "qty": float(src.get("qty") or (pl.get("qty") if isinstance(pl, dict) else 0) or 0),
        }
        for key in receive_meta_keys:
            if src.get(key) is not None:
                row[key] = src[key]
        receive_lines.append(row)
    result = receive_purchase(
        session,
        auth,
        purchase_id,
        {
            "store_id": body.get("store_id"),
            "warehouse_id": body.get("warehouse_id"),
            "remarks": body.get("remarks"),
            "lines": receive_lines,
        },
    )
    write_audit(
        session,
        auth,
        "purchase_direct_receive",
        "purchase_invoice",
        purchase_id,
        {"receive_id": result["receive_id"], "receive_no": result["receive_no"]},
    )
    session.flush()
    return result


def return_purchase(session: Session, auth: AuthContext, purchase_id: str, body: dict) -> dict:
    purchase = session.get(PurchaseInvoice, purchase_id)
    if not purchase or purchase.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Purchase not found")
    lines_in = body.get("lines") or []
    if not lines_in:
        raise HTTPException(status_code=400, detail="Return lines required")
    if not body.get("reason") or not str(body.get("reason")).strip():
        raise HTTPException(status_code=400, detail="Return reason is required")
    returned_map = _returned_qty_map(session, purchase.id)
    po_lines = {ln.id: ln for ln in session.exec(
        select(PurchaseInvoiceLine).where(PurchaseInvoiceLine.purchase_id == purchase.id)
    ).all()}
    total = 0.0
    ret = PurchaseReturn(
        company_id=auth.company_id,
        purchase_id=purchase.id,
        return_no=_next_number(session, auth.company_id, "PUR-RET", "PR"),
        supplier_id=purchase.supplier_id,
        store_id=purchase.store_id,
        warehouse_id=purchase.warehouse_id,
        reason=body.get("reason"),
        returned_by=auth.user_id,
    )
    session.add(ret)
    session.flush()
    for ln in lines_in:
        qty = float(ln.get("qty") or 0)
        if qty <= 0:
            raise HTTPException(status_code=400, detail="Return quantity must be greater than zero")
        unit_cost = float(ln.get("unit_cost") or 0)
        pl_id = ln.get("purchase_line_id")
        if pl_id:
            po_ln = po_lines.get(pl_id)
            if not po_ln:
                raise HTTPException(status_code=400, detail="Invalid purchase line for return")
            returnable = po_ln.received_qty - returned_map.get(pl_id, 0)
            if qty > returnable + 0.001:
                raise HTTPException(
                    status_code=400,
                    detail=f"Return qty {qty} exceeds returnable balance {returnable} for line",
                )
            unit_cost = unit_cost or po_ln.unit_cost
        _validate_product(session, auth.company_id, ln["product_id"])
        product = session.get(Product, ln["product_id"])
        batch_id: str | None = ln.get("batch_id")
        if product and product.industry_pack == "pharmacy":
            from app.services.pharma_service import resolve_purchase_line_batch

            if pl_id and pl_id in po_lines:
                batch_id = batch_id or po_lines[pl_id].batch_id
            if pl_id and not batch_id:
                batch_id = resolve_purchase_line_batch(session, auth.company_id, pl_id)
            if not batch_id:
                raise HTTPException(
                    status_code=400,
                    detail="Pharmacy purchase return requires batch from GRN receive",
                )
            from app.models.industry import PharmaBatch

            batch = session.get(PharmaBatch, batch_id)
            if not batch or batch.company_id != auth.company_id or batch.product_id != ln["product_id"]:
                raise HTTPException(status_code=400, detail="Invalid batch for pharmacy purchase return")
            if (batch.qty_on_hand or 0) < qty:
                raise HTTPException(
                    status_code=400,
                    detail=f"Return qty {qty} exceeds batch stock {batch.qty_on_hand} for {batch.batch_no}",
                )
        line_total = qty * unit_cost
        total += line_total
        return_variant_id = None
        if pl_id and pl_id in po_lines:
            return_variant_id = po_lines[pl_id].variant_id
        session.add(
            PurchaseReturnLine(
                return_id=ret.id,
                purchase_line_id=ln.get("purchase_line_id"),
                product_id=ln["product_id"],
                qty=qty,
                unit_cost=unit_cost,
                line_total=line_total,
            )
        )
        try:
            record_stock_movement(
                session,
                company_id=auth.company_id,
                product_id=ln["product_id"],
                store_id=purchase.store_id,
                warehouse_id=purchase.warehouse_id,
                out_qty=qty,
                transaction_type=PURCHASE_RETURN,
                transaction_ref=ret.return_no,
                reference_id=ret.id,
                unit_cost=unit_cost,
                note=body.get("reason"),
                created_by=auth.user_id,
                batch_id=batch_id,
                variant_id=return_variant_id,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    ret.total_amount = total
    session.add(ret)
    if purchase.supplier_id:
        bal = _ensure_supplier_balance(session, auth.company_id, purchase.supplier_id)
        bal.outstanding = max(0, bal.outstanding - total)
        session.add(bal)
    write_audit(session, auth, "purchase_return", "purchase_return", ret.id, {"total": total})
    session.flush()
    return {"return_id": ret.id, "return_no": ret.return_no, "total_amount": total}


def create_supplier_payment(session: Session, auth: AuthContext, body: dict) -> dict:
    supplier_id = body["supplier_id"]
    amount = float(body["amount"])
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero")
    _validate_supplier(session, auth.company_id, supplier_id)
    if body.get("supplier_invoice_id"):
        inv = session.get(SupplierInvoice, body["supplier_invoice_id"])
        if not inv or inv.company_id != auth.company_id or inv.supplier_id != supplier_id:
            raise HTTPException(status_code=400, detail="Invalid supplier invoice")
        if amount > inv.due_amount + 0.01:
            raise HTTPException(status_code=400, detail="Payment exceeds invoice due amount")
    payment = SupplierPayment(
        company_id=auth.company_id,
        supplier_id=supplier_id,
        purchase_id=body.get("purchase_id"),
        supplier_invoice_id=body.get("supplier_invoice_id"),
        amount=amount,
        method=body.get("method", "bank"),
        reference=body.get("reference"),
        paid_by=auth.user_id,
    )
    session.add(payment)
    bal = _ensure_supplier_balance(session, auth.company_id, supplier_id)
    bal.outstanding = max(0, bal.outstanding - amount)
    session.add(bal)
    if body.get("purchase_id"):
        purchase = session.get(PurchaseInvoice, body["purchase_id"])
        if purchase:
            purchase.paid_amount = (purchase.paid_amount or 0) + amount
            purchase.due_amount = max(0, (purchase.due_amount or purchase.total) - amount)
            session.add(purchase)
    if body.get("supplier_invoice_id"):
        inv = session.get(SupplierInvoice, body["supplier_invoice_id"])
        if inv and inv.company_id == auth.company_id:
            inv.paid_amount = (inv.paid_amount or 0) + amount
            inv.due_amount = max(0, inv.total - inv.paid_amount)
            if inv.due_amount <= 0:
                inv.status = "PAID"
            session.add(inv)
    write_audit(session, auth, "supplier_payment", "supplier_payment", payment.id, {"amount": amount})
    session.flush()

    from app.services.accounting_service import get_account_by_code, get_linked_account_id, post_journal_entry

    cash_account_id = get_linked_account_id(session, auth.company_id, payment.method)
    ap_account = get_account_by_code(session, auth.company_id, "2100")
    post_journal_entry(
        session,
        company_id=auth.company_id,
        created_by=auth.user_id,
        entry_date=datetime.now(timezone.utc),
        source_type="supplier_payment",
        source_id=payment.id,
        lines=[
            {"account_id": ap_account.id, "debit": amount},
            {"account_id": cash_account_id, "credit": amount},
        ],
        memo=f"Supplier payment: {supplier_id}",
    )

    return {"id": payment.id, "amount": amount, "outstanding": bal.outstanding}


def get_supplier_ledger(
    session: Session,
    company_id: str,
    supplier_id: str,
    from_date: str | None = None,
    to_date: str | None = None,
) -> dict:
    _validate_supplier(session, company_id, supplier_id)
    entries: list[dict] = []

    invoices = session.exec(
        select(SupplierInvoice).where(
            SupplierInvoice.company_id == company_id,
            SupplierInvoice.supplier_id == supplier_id,
            or_(SupplierInvoice.status == "APPROVED", SupplierInvoice.status == "PAID"),
        )
    ).all()
    for inv in invoices:
        entries.append({
            "at": inv.invoice_date.isoformat() if inv.invoice_date else inv.created_at.isoformat(),
            "type": "supplier_invoice",
            "ref": inv.invoice_no,
            "debit": inv.total,
            "credit": 0.0,
            "entity_id": inv.id,
        })

    payments = session.exec(
        select(SupplierPayment).where(
            SupplierPayment.company_id == company_id,
            SupplierPayment.supplier_id == supplier_id,
        )
    ).all()
    for pay in payments:
        entries.append({
            "at": pay.paid_at.isoformat() if pay.paid_at else pay.created_at.isoformat(),
            "type": "supplier_payment",
            "ref": pay.reference or pay.id[:8],
            "debit": 0.0,
            "credit": pay.amount,
            "entity_id": pay.id,
        })

    returns = session.exec(
        select(PurchaseReturn).where(
            PurchaseReturn.company_id == company_id,
            PurchaseReturn.supplier_id == supplier_id,
        )
    ).all()
    for ret in returns:
        entries.append({
            "at": ret.returned_at.isoformat() if ret.returned_at else ret.created_at.isoformat(),
            "type": "purchase_return",
            "ref": ret.return_no,
            "debit": 0.0,
            "credit": ret.total_amount,
            "entity_id": ret.id,
        })

    if from_date:
        start = parse_iso_dt(from_date)
        if start:
            entries = [
                e for e in entries
                if (parsed := parse_iso_dt(e["at"])) and parsed >= start
            ]
    if to_date:
        end = parse_iso_dt(to_date)
        if end:
            entries = [
                e for e in entries
                if (parsed := parse_iso_dt(e["at"])) and parsed <= end
            ]

    entries.sort(key=lambda e: e["at"])
    running = 0.0
    ledger_rows = []
    for e in entries:
        running += e["debit"] - e["credit"]
        ledger_rows.append({**e, "balance": round(running, 2)})

    bal = session.exec(
        select(SupplierBalance).where(
            SupplierBalance.company_id == company_id,
            SupplierBalance.supplier_id == supplier_id,
        )
    ).first()

    return {
        "supplier_id": supplier_id,
        "opening_balance": 0.0,
        "closing_balance": round(running, 2),
        "current_outstanding": bal.outstanding if bal else 0.0,
        "entries": ledger_rows,
    }
