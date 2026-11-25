"""Persist industry-specific sales line extensions after invoice lines are created."""

from __future__ import annotations

import json
from typing import Any

from sqlmodel import Session, select

from app.dependencies import AuthContext
from app.models.industry import (
    BeefSalesLineExtension,
    ElectronicsSalesLineExtension,
    FashionSalesLineExtension,
    JewelrySalesLineExtension,
    MobileSalesLineExtension,
    OpticalSalesLineExtension,
    PharmaRestrictedMedicineLog,
    PharmaSalesLineExtension,
    RestaurantSalesLineExtension,
    SurgicalSalesLineExtension,
)
from app.models.product import Product


def _meta(meta: dict[str, Any] | None) -> dict[str, Any]:
    return meta or {}


def validate_electronics_serial(
    session: Session,
    auth: AuthContext,
    meta: dict[str, Any],
    *,
    product_id: str | None = None,
    require: bool = False,
) -> None:
    serial = str(meta.get("serial") or meta.get("serial_imei") or meta.get("serial_no") or "").strip()
    if not serial or serial == "N/A":
        if require:
            raise ValueError("Serial/IMEI required for serialized electronics product")
        return
    from app.services.electronics_service import validate_serial_for_sale

    result = validate_serial_for_sale(
        session,
        auth,
        serial=serial,
        product_id=product_id or meta.get("product_id") or meta.get("productId"),
        store_id=meta.get("store_id"),
    )
    if not result["valid"]:
        raise ValueError(result.get("detail") or f"Serial/IMEI not found: {serial}")
    if not result["available"]:
        raise ValueError(result.get("detail") or f"Serial/IMEI already sold or unavailable: {serial}")


def save_line_extension(
    session: Session,
    auth: AuthContext,
    industry_pack: str,
    line_id: str,
    invoice_id: str,
    meta: dict[str, Any] | None,
) -> None:
    m = _meta(meta)
    if industry_pack == "beef-shop":
        session.add(
            BeefSalesLineExtension(
                line_id=line_id,
                weight_kg=float(m.get("netWeight") or m.get("net_weight") or m.get("qty") or 0),
                cut_type=str(m.get("cutType") or m.get("cut_type") or ""),
                batch_id=m.get("batch_id"),
                butcher_id=m.get("butcher_id"),
            )
        )
    elif industry_pack == "fashion":
        session.add(
            FashionSalesLineExtension(
                line_id=line_id,
                variant_id=m.get("variant_id"),
                campaign_name=m.get("campaignName") or m.get("campaign_name"),
            )
        )
    elif industry_pack == "pharmacy":
        session.add(
            PharmaSalesLineExtension(
                line_id=line_id,
                batch_id=m.get("batch_id"),
                fefo_applied=bool(m.get("fefo") or m.get("fefo_applied")),
            )
        )
        if m.get("restricted"):
            from app.models.sales import SalesInvoiceLine

            line_row = session.get(SalesInvoiceLine, line_id)
            product_id = line_row.product_id if line_row else m.get("productId")
            session.add(
                PharmaRestrictedMedicineLog(
                    company_id=auth.company_id,
                    product_id=str(product_id or ""),
                    approved_by=auth.email,
                    invoice_id=invoice_id,
                )
            )
    elif industry_pack == "restaurant":
        children = m.get("comboChildren") or m.get("combo_children")
        session.add(
            RestaurantSalesLineExtension(
                line_id=line_id,
                table_id=m.get("table_id"),
                order_id=m.get("order_id"),
                comboReady=bool(m.get("combo")),
                combo_children_json=json.dumps(children) if children else None,
            )
        )
    elif industry_pack == "optical-shop":
        cfg = m.get("configuration") or m.get("configuration_json")
        session.add(
            OpticalSalesLineExtension(
                line_id=line_id,
                order_id=m.get("order_id"),
                prescription_id=m.get("prescription_id"),
                line_type=m.get("line_type"),
                configuration_json=json.dumps(cfg) if isinstance(cfg, dict) else cfg,
            )
        )
    elif industry_pack == "jewelry":
        import json as _json

        from app.services.jewelry_service import mark_certificate_sold

        weight = float(m.get("netWeight") or m.get("net_weight") or m.get("net_metal_weight") or 0)
        gold_rate = float(m.get("goldRate") or m.get("gold_rate") or m.get("metal_rate") or 0)
        making = float(m.get("makingCharge") or m.get("making_charge") or 0)
        snapshot = {
            "metal_type": m.get("metal") or m.get("metal_type"),
            "purity": m.get("purity") or m.get("karat"),
            "gross_weight": m.get("grossWeight") or m.get("gross_weight"),
            "stone_weight": m.get("stoneWeight") or m.get("stone_weight"),
            "net_metal_weight": weight,
            "metal_rate": gold_rate,
            "metal_value": m.get("metal_value") or m.get("metalValue"),
            "making_charge": making,
            "wastage_value": m.get("wastage_value") or m.get("wastageValue"),
            "stone_value": m.get("stone_value") or m.get("stoneValue"),
            "gross_amount": m.get("gross_amount") or m.get("amount"),
            "rate_override_reason": m.get("rate_override_reason"),
        }
        session.add(
            JewelrySalesLineExtension(
                line_id=line_id,
                weight_gram=weight,
                gold_rate=gold_rate,
                making_charge=making,
                metal_type=str(snapshot["metal_type"] or "Gold"),
                purity=str(snapshot["purity"] or "22K"),
                gross_weight=float(snapshot["gross_weight"] or 0) if snapshot["gross_weight"] is not None else None,
                stone_weight=float(snapshot["stone_weight"] or 0) if snapshot["stone_weight"] is not None else None,
                net_metal_weight=weight,
                metal_value=float(snapshot["metal_value"] or 0) if snapshot["metal_value"] is not None else None,
                wastage_value=float(snapshot["wastage_value"] or 0) if snapshot["wastage_value"] is not None else None,
                stone_value=float(snapshot["stone_value"] or 0) if snapshot["stone_value"] is not None else None,
                certificate_id=m.get("certificate_id"),
                certificate_no=str(m.get("certificate") or m.get("certificate_no") or "") or None,
                rate_override_reason=m.get("rate_override_reason"),
                snapshot_json=_json.dumps(snapshot),
            )
        )
        cert_no = m.get("certificate") or m.get("certificate_no")
        if cert_no or m.get("certificate_id"):
            from app.models.sales import SalesInvoice

            invoice = session.get(SalesInvoice, invoice_id)
            mark_certificate_sold(
                session,
                auth,
                certificate_id=m.get("certificate_id"),
                certificate_no=str(cert_no) if cert_no else None,
                invoice_id=invoice_id,
                customer_id=invoice.customer_id if invoice else None,
            )
    elif industry_pack in {"electronics", "mobile-shop"}:
        from app.models.sales import SalesInvoice, SalesInvoiceLine
        from app.services.electronics_service import (
            auto_register_warranty_from_sale,
            mark_serial_sold,
            product_requires_serial,
        )

        serial = str(
            m.get("serial") or m.get("serial_imei") or m.get("serial_no") or m.get("imei") or m.get("imei_1") or ""
        )
        warranty_months = int(m.get("warrantyMonths") or m.get("warranty_months") or 12)
        serial_id = m.get("serial_id") or m.get("device_stock_id")
        if industry_pack == "electronics":
            session.add(
                ElectronicsSalesLineExtension(
                    line_id=line_id,
                    serial_imei=serial or None,
                    serial_id=serial_id,
                    warranty_months=warranty_months,
                )
            )
        else:
            session.add(
                MobileSalesLineExtension(
                    line_id=line_id,
                    device_stock_id=serial_id,
                    serial_imei=serial or None,
                    imei_1=str(m.get("imei_1") or m.get("imei") or serial or "") or None,
                    imei_2=str(m.get("imei_2") or "") or None,
                    warranty_months=warranty_months,
                    condition=str(m.get("condition") or "") or None,
                    activation_status=str(m.get("activation_status") or "") or None,
                    price_override_reason=m.get("price_override_reason") or m.get("rate_override_reason"),
                )
            )
        if serial and serial != "N/A":
            invoice = session.get(SalesInvoice, invoice_id)
            line_row = session.get(SalesInvoiceLine, line_id)
            product = session.get(Product, line_row.product_id) if line_row and line_row.product_id else None
            row = mark_serial_sold(
                session,
                auth,
                serial=serial,
                invoice_id=invoice_id,
                customer_id=invoice.customer_id if invoice else None,
                product_id=line_row.product_id if line_row else None,
            )
            serial_id = row.id
            if product and product_requires_serial(product) and invoice and line_row and warranty_months > 0:
                auto_register_warranty_from_sale(
                    session,
                    auth,
                    invoice=invoice,
                    line=line_row,
                    serial_row=row,
                    warranty_months=warranty_months,
                )
    elif industry_pack == "surgical-shop":
        from app.models.base import parse_iso_dt
        from app.services.surgical_service import mark_unit_sold_from_sale

        stock_unit_id = m.get("stock_unit_id") or m.get("batch_id")
        serial = str(m.get("serial") or m.get("serial_no") or "") or None
        udi = str(m.get("udi") or m.get("udi_code") or "") or None
        exp = m.get("expiry") or m.get("expiry_date")
        if isinstance(exp, str):
            exp_dt = parse_iso_dt(exp)
        elif hasattr(exp, "isoformat"):
            exp_dt = exp
        else:
            exp_dt = None
        session.add(
            SurgicalSalesLineExtension(
                line_id=line_id,
                stock_unit_id=stock_unit_id,
                batch_no=str(m.get("batch") or m.get("batch_no") or "") or None,
                lot_no=str(m.get("lot") or m.get("lot_no") or "") or None,
                serial_no=serial,
                udi_code=udi,
                expiry_date=exp_dt,
                sterile_status=str(m.get("sterile_status") or m.get("sterile") or "") or None,
            )
        )
        mark_unit_sold_from_sale(
            session,
            auth,
            stock_unit_id=stock_unit_id,
            serial_no=serial,
            invoice_id=invoice_id,
        )
    elif industry_pack == "hardware":
        from app.services.hardware_service import save_hardware_line_extension

        save_hardware_line_extension(session, line_id, m)
    elif industry_pack == "stationery":
        from app.services.stationery_service import save_stationery_line_extension

        save_stationery_line_extension(session, line_id, m)
    elif industry_pack == "cosmetics":
        from app.services.cosmetics_service import save_cosmetics_line_extension

        save_cosmetics_line_extension(session, line_id, m)


def validate_sale_lines(
    session: Session,
    auth: AuthContext,
    industry_pack: str,
    lines: list,
    customer_id: str | None = None,
) -> None:
    if industry_pack in {"electronics", "mobile-shop"}:
        from app.models.product import Product
        from app.services.electronics_service import product_requires_serial

        for line in lines:
            meta = line.meta or {}
            product_id = getattr(line, "product_id", None) or meta.get("product_id") or meta.get("productId")
            product = session.get(Product, product_id) if product_id else None
            if product and not product.is_active:
                raise ValueError(f"Inactive product cannot be sold: {product.sku}")
            require = product_requires_serial(product) if product else False
            # Normalize IMEI aliases for shared validator
            if not meta.get("serial") and not meta.get("serial_imei") and not meta.get("serial_no"):
                if meta.get("imei") or meta.get("imei_1"):
                    meta = {**meta, "serial": meta.get("imei") or meta.get("imei_1")}
            validate_electronics_serial(session, auth, meta, product_id=product_id, require=require)
            if require and meta.get("store_id"):
                from app.services.electronics_service import find_serial
                serial = str(meta.get("serial") or meta.get("serial_imei") or meta.get("serial_no") or "").strip()
                row = find_serial(session, auth.company_id, serial) if serial else None
                if row and row.store_id and row.store_id != meta.get("store_id"):
                    raise ValueError("Selected device belongs to another store")
            if product and product.industry_pack == "mobile-shop" and require:
                from app.services.electronics_service import find_serial
                serial = str(meta.get("serial") or meta.get("serial_imei") or meta.get("serial_no") or meta.get("imei") or "").strip()
                row = find_serial(session, auth.company_id, serial) if serial else None
                if row and row.status in {"blocked", "damaged", "rma", "trade_in_received", "retired"}:
                    raise ValueError(f"Device status '{row.status}' cannot be sold")
    elif industry_pack == "pharmacy":
        from app.services.pharma_service import validate_pharma_sale_lines
        validate_pharma_sale_lines(session, auth, lines)
    elif industry_pack == "surgical-shop":
        from app.services.surgical_service import validate_surgical_sale_lines
        validate_surgical_sale_lines(session, auth, lines)
    elif industry_pack == "jewelry":
        from app.models.product import Product
        from app.services.jewelry_service import find_certificate, get_product_profile

        for line in lines:
            meta = line.meta or {}
            product_id = getattr(line, "product_id", None) or meta.get("product_id")
            product = session.get(Product, product_id) if product_id else None
            if product and not product.is_active:
                raise ValueError(f"Inactive product cannot be sold: {product.sku}")
            profile = get_product_profile(session, auth.company_id, product.id) if product else None
            cert_no = meta.get("certificate") or meta.get("certificate_no")
            if profile and profile.get("certificate_required") and not cert_no and not meta.get("certificate_id"):
                raise ValueError("certificate_no required for this jewelry product")
            if cert_no:
                cert = find_certificate(session, auth.company_id, str(cert_no))
                if not cert:
                    raise ValueError(f"Certificate not found: {cert_no}")
                if cert.status == "sold":
                    raise ValueError(f"Certificate already sold: {cert_no}")
                if cert.status not in {"active", "returned", "exchanged", None}:
                    raise ValueError(f"Certificate not sellable: {cert_no}")
            net = float(meta.get("netWeight") or meta.get("net_weight") or meta.get("net_metal_weight") or 0)
            if product and product.industry_pack == "jewelry" and net <= 0:
                # allow if profile has weight — POS should send it; soft check when meta empty
                pass
    elif industry_pack == "hardware":
        from fastapi import HTTPException

        from app.services.hardware_service import validate_hardware_sale_lines

        try:
            validate_hardware_sale_lines(session, auth, lines, customer_id=customer_id)
        except HTTPException as exc:
            raise ValueError(exc.detail) from exc
    elif industry_pack == "stationery":
        from fastapi import HTTPException

        from app.services.stationery_service import validate_stationery_sale_lines

        try:
            validate_stationery_sale_lines(session, auth, lines, customer_id=customer_id)
        except HTTPException as exc:
            raise ValueError(exc.detail) from exc
    elif industry_pack == "cosmetics":
        from app.services.cosmetics_service import validate_cosmetics_sale_lines

        validate_cosmetics_sale_lines(session, auth, lines)
    elif industry_pack == "fashion":
        from app.models.product import Product, ProductVariant

        for line in lines:
            meta = line.meta or {}
            product_id = getattr(line, "product_id", None) or meta.get("product_id") or meta.get("productId")
            product = session.get(Product, product_id) if product_id else None
            if product and not product.is_active:
                raise ValueError(f"Inactive product cannot be sold: {product.sku}")
            variant_id = meta.get("variant_id")
            if not variant_id:
                if product:
                    from app.services.inventory_service import ensure_fashion_variant
                    variant_id = ensure_fashion_variant(session, auth.company_id, product, None)
                    meta["variant_id"] = variant_id
                    if hasattr(line, "meta"):
                        line.meta = meta
                else:
                    raise ValueError("Fashion sale lines require a product or variant")
            else:
                variant = session.get(ProductVariant, str(variant_id))
                if not variant or variant.company_id != auth.company_id:
                    raise ValueError("Invalid fashion variant_id")
                if product_id and variant.product_id != product_id:
                    raise ValueError("Fashion variant does not belong to the sale line product")

