"""Bulk import helpers — products, suppliers, customers, opening stock."""

from __future__ import annotations

import json
from typing import Any

from fastapi import HTTPException
from sqlmodel import Session, select

from app.dependencies import AuthContext, write_audit
from app.models.core import Store, Warehouse
from app.models.product import Customer, Product, ProductCategory, ProductVariant, Supplier
from app.services.customer_service import create_customer, update_customer
from app.services.inventory_service import post_opening_stock


def _row_data(row: Any) -> dict[str, Any]:
    if isinstance(row, dict):
        if "data" in row and isinstance(row["data"], dict):
            return dict(row["data"])
        return dict(row)
    data = getattr(row, "data", None)
    return dict(data) if isinstance(data, dict) else {}


def _truthy(value: Any, default: bool = True) -> bool:
    if value is None or value == "":
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "y", "active"}


def _resolve_store(session: Session, company_id: str, data: dict[str, Any], fallback_store_id: str | None) -> str | None:
    store_id = data.get("store_id")
    if store_id:
        store = session.get(Store, store_id)
        if store and store.company_id == company_id:
            return store.id
        raise HTTPException(status_code=400, detail=f"Unknown store_id: {store_id}")
    code = data.get("store_code") or data.get("store")
    if code:
        store = session.exec(
            select(Store).where(Store.company_id == company_id, Store.code == str(code).strip())
        ).first()
        if not store:
            raise HTTPException(status_code=400, detail=f"Unknown store_code: {code}")
        return store.id
    return fallback_store_id


def _resolve_warehouse(session: Session, company_id: str, data: dict[str, Any], store_id: str | None) -> str | None:
    warehouse_id = data.get("warehouse_id")
    if warehouse_id:
        wh = session.get(Warehouse, warehouse_id)
        if wh and wh.company_id == company_id:
            return wh.id
        raise HTTPException(status_code=400, detail=f"Unknown warehouse_id: {warehouse_id}")
    code = data.get("warehouse_code") or data.get("warehouse")
    if not code:
        return None
    stmt = select(Warehouse).where(Warehouse.company_id == company_id, Warehouse.code == str(code).strip())
    if store_id:
        stmt = stmt.where(Warehouse.store_id == store_id)
    wh = session.exec(stmt).first()
    if not wh:
        raise HTTPException(status_code=400, detail=f"Unknown warehouse_code: {code}")
    return wh.id


def _resolve_product(session: Session, company_id: str, data: dict[str, Any]) -> Product:
    product_id = data.get("product_id")
    if product_id:
        product = session.get(Product, product_id)
        if product and product.company_id == company_id:
            return product
        raise HTTPException(status_code=400, detail=f"Unknown product_id: {product_id}")
    sku = data.get("sku") or data.get("parent_sku")
    if not sku:
        raise HTTPException(status_code=400, detail="sku is required")
    product = session.exec(
        select(Product).where(Product.company_id == company_id, Product.sku == str(sku).strip())
    ).first()
    if not product:
        raise HTTPException(status_code=400, detail=f"Unknown sku: {sku}")
    return product


def _resolve_variant(
    session: Session,
    company_id: str,
    product: Product,
    data: dict[str, Any],
) -> str | None:
    variant_id = data.get("variant_id")
    if variant_id:
        vv = session.get(ProductVariant, variant_id)
        if vv and vv.company_id == company_id and vv.product_id == product.id:
            return vv.id
        raise HTTPException(status_code=400, detail=f"Unknown variant_id: {variant_id}")

    variant_sku = data.get("variant_sku") or data.get("variant_code")
    barcode = data.get("variant_barcode") or data.get("barcode")
    size = data.get("size")
    color = data.get("color")

    if variant_sku:
        vv = session.exec(
            select(ProductVariant).where(
                ProductVariant.company_id == company_id,
                ProductVariant.product_id == product.id,
                ProductVariant.variant_code == str(variant_sku).strip(),
            )
        ).first()
        if vv:
            return vv.id
        raise HTTPException(status_code=400, detail=f"Unknown variant_sku: {variant_sku}")

    if barcode:
        vv = session.exec(
            select(ProductVariant).where(
                ProductVariant.company_id == company_id,
                ProductVariant.product_id == product.id,
                ProductVariant.barcode == str(barcode).strip(),
            )
        ).first()
        if vv:
            return vv.id

    if size and color:
        vv = session.exec(
            select(ProductVariant).where(
                ProductVariant.company_id == company_id,
                ProductVariant.product_id == product.id,
                ProductVariant.size == str(size).strip(),
                ProductVariant.color == str(color).strip(),
            )
        ).first()
        if vv:
            return vv.id
        raise HTTPException(status_code=400, detail=f"Unknown size/color: {size}/{color}")

    return None


def _resolve_category_id(session: Session, company_id: str, data: dict[str, Any]) -> str | None:
    if data.get("category_id"):
        cat = session.get(ProductCategory, data["category_id"])
        if cat and cat.company_id == company_id:
            return cat.id
        raise HTTPException(status_code=400, detail=f"Unknown category_id: {data['category_id']}")
    name = data.get("category") or data.get("category_name")
    if not name:
        return None
    cat = session.exec(
        select(ProductCategory).where(
            ProductCategory.company_id == company_id,
            ProductCategory.name == str(name).strip(),
        )
    ).first()
    return cat.id if cat else None


def _import_result(
    *,
    module: str,
    rows: list[Any],
    validated: list[dict[str, Any]],
    imported: int,
    updated: int,
    errors: list[dict[str, Any]],
    dry_run: bool,
    message_ok: str,
) -> dict[str, Any]:
    status = "accepted" if not errors else ("validated_with_errors" if dry_run else "partial")
    if dry_run and errors and imported == 0 and updated == 0 and not validated:
        status = "rejected"
    if not validated and not dry_run and errors:
        status = "rejected"
    return {
        "status": status if (validated or dry_run or not errors) else "rejected",
        "module": module,
        "rows_received": len(rows),
        "rows_imported": 0 if dry_run else imported,
        "rows_updated": 0 if dry_run else updated,
        "rows_valid": len(validated),
        "dry_run": dry_run,
        "errors": errors,
        "message": (
            f"Dry run validated {len(validated)} row(s)"
            if dry_run
            else message_ok.format(imported=imported, updated=updated)
        ),
    }


def import_opening_stock_rows(
    session: Session,
    auth: AuthContext,
    rows: list[Any],
    *,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Validate and optionally post opening stock rows via inventory_service."""
    imported = 0
    errors: list[dict[str, Any]] = []
    validated: list[dict[str, Any]] = []

    for idx, raw in enumerate(rows):
        data = _row_data(raw)
        try:
            product = _resolve_product(session, auth.company_id, data)
            store_id = _resolve_store(session, auth.company_id, data, auth.store_id)
            if not store_id:
                raise HTTPException(status_code=400, detail="store_id or store_code is required")
            warehouse_id = _resolve_warehouse(session, auth.company_id, data, store_id)
            variant_id = _resolve_variant(session, auth.company_id, product, data)
            qty = float(data.get("qty") or data.get("qty_on_hand") or 0)
            if qty <= 0:
                raise HTTPException(status_code=400, detail="qty must be greater than zero")
            unit_cost = float(data.get("unit_cost") or 0)
            note = data.get("notes") or data.get("note") or "Opening balance import"
            if product.industry_pack == "fashion" and not variant_id:
                raise HTTPException(
                    status_code=400,
                    detail="Fashion opening stock requires variant_sku, size+color, or variant_id",
                )
            batch_no = (data.get("batch_no") or "").strip() or None
            lot_no = (data.get("lot_no") or "").strip() or None
            expiry_date = data.get("expiry_date") or None
            manufacture_date = data.get("manufacture_date") or None
            serials_raw = data.get("serials")
            serials = (
                [s.strip() for s in str(serials_raw).replace("\n", ";").split(";") if s.strip()]
                if serials_raw
                else None
            )
            payload = {
                "row": idx,
                "sku": product.sku,
                "product_id": product.id,
                "store_id": store_id,
                "warehouse_id": warehouse_id,
                "variant_id": variant_id,
                "qty": qty,
                "unit_cost": unit_cost,
                "note": note,
                "batch_no": batch_no,
                "lot_no": lot_no,
                "expiry_date": expiry_date,
                "manufacture_date": manufacture_date,
                "serials": serials,
            }
            validated.append(payload)
            if not dry_run:
                post_opening_stock(
                    session,
                    company_id=auth.company_id,
                    product_id=product.id,
                    store_id=store_id,
                    warehouse_id=warehouse_id,
                    qty=qty,
                    unit_cost=unit_cost,
                    variant_id=variant_id,
                    note=note,
                    created_by=auth.user_id,
                    batch_no=batch_no,
                    lot_no=lot_no,
                    expiry_date=expiry_date,
                    manufacture_date=manufacture_date,
                    serials=serials,
                )
                imported += 1
        except HTTPException as exc:
            errors.append({"row": idx, "detail": exc.detail, "data": data})
        except (TypeError, ValueError) as exc:
            errors.append({"row": idx, "detail": str(exc), "data": data})

    write_audit(
        session,
        auth,
        "import_opening_stock",
        "import",
        None,
        {
            "rows_received": len(rows),
            "rows_imported": imported,
            "error_count": len(errors),
            "dry_run": dry_run,
        },
    )
    return _import_result(
        module="opening_stock",
        rows=rows,
        validated=validated,
        imported=imported,
        updated=0,
        errors=errors,
        dry_run=dry_run,
        message_ok="Imported {imported} opening stock row(s) via inventory ledger",
    )


def import_product_rows(
    session: Session,
    auth: AuthContext,
    rows: list[Any],
    *,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Create or update products by SKU (upsert). Fashion rows get default style_code=sku when missing."""
    from app.services.fashion_catalog_service import validate_fashion_meta
    from app.services.product_service import barcode_exists

    imported = 0
    updated = 0
    errors: list[dict[str, Any]] = []
    validated: list[dict[str, Any]] = []

    for idx, raw in enumerate(rows):
        data = _row_data(raw)
        try:
            sku = str(data.get("sku") or "").strip()
            name = str(data.get("name") or "").strip()
            industry_pack = str(data.get("industry_pack") or data.get("pack") or "").strip()
            if not sku or not name or not industry_pack:
                raise HTTPException(status_code=400, detail="sku, name, and industry_pack are required")
            base_price = float(data.get("base_price") or data.get("price") or 0)
            barcode = (str(data.get("barcode")).strip() if data.get("barcode") else None) or None
            wholesale = data.get("wholesale_price")
            wholesale_price = float(wholesale) if wholesale not in (None, "") else None
            category_id = _resolve_category_id(session, auth.company_id, data)
            is_active = _truthy(data.get("is_active"), True)
            meta = data.get("meta") if isinstance(data.get("meta"), dict) else {}
            if not meta:
                meta = {
                    k: data[k]
                    for k in ("style_code", "style_number", "department", "season", "gender", "fit", "fabric")
                    if data.get(k) not in (None, "")
                }
            if industry_pack == "fashion":
                meta = validate_fashion_meta(meta, require_style=False)

            existing = session.exec(
                select(Product).where(Product.company_id == auth.company_id, Product.sku == sku)
            ).first()
            if barcode and barcode_exists(
                session, auth.company_id, barcode, exclude_product_id=existing.id if existing else None
            ):
                raise HTTPException(status_code=409, detail="Barcode already exists for another product")

            payload = {
                "row": idx,
                "sku": sku,
                "name": name,
                "industry_pack": industry_pack,
                "base_price": base_price,
                "barcode": barcode,
                "category_id": category_id,
                "is_active": is_active,
                "action": "update" if existing else "create",
            }
            validated.append(payload)
            if dry_run:
                continue
            if existing:
                existing.name = name
                existing.industry_pack = industry_pack
                existing.base_price = base_price
                if barcode is not None:
                    existing.barcode = barcode
                if wholesale_price is not None:
                    existing.wholesale_price = wholesale_price
                if category_id is not None:
                    existing.category_id = category_id
                existing.is_active = is_active
                existing.meta_json = json.dumps(meta)
                session.add(existing)
                write_audit(session, auth, "product_import_update", "product", existing.id, {"sku": sku})
                updated += 1
            else:
                product = Product(
                    company_id=auth.company_id,
                    sku=sku,
                    barcode=barcode,
                    name=name,
                    industry_pack=industry_pack,
                    base_price=base_price,
                    wholesale_price=wholesale_price,
                    category_id=category_id,
                    meta_json=json.dumps(meta),
                    is_active=is_active,
                )
                session.add(product)
                session.flush()
                write_audit(session, auth, "product_import_create", "product", product.id, {"sku": sku})
                imported += 1
        except HTTPException as exc:
            errors.append({"row": idx, "detail": exc.detail, "data": data})
        except (TypeError, ValueError) as exc:
            errors.append({"row": idx, "detail": str(exc), "data": data})

    write_audit(
        session,
        auth,
        "import_products",
        "import",
        None,
        {
            "rows_received": len(rows),
            "rows_imported": imported,
            "rows_updated": updated,
            "error_count": len(errors),
            "dry_run": dry_run,
        },
    )
    return _import_result(
        module="products",
        rows=rows,
        validated=validated,
        imported=imported,
        updated=updated,
        errors=errors,
        dry_run=dry_run,
        message_ok="Imported {imported} product(s), updated {updated}",
    )


def import_supplier_rows(
    session: Session,
    auth: AuthContext,
    rows: list[Any],
    *,
    dry_run: bool = False,
) -> dict[str, Any]:
    imported = 0
    updated = 0
    errors: list[dict[str, Any]] = []
    validated: list[dict[str, Any]] = []

    for idx, raw in enumerate(rows):
        data = _row_data(raw)
        try:
            code = str(data.get("code") or "").strip()
            name = str(data.get("name") or "").strip()
            if not code or not name:
                raise HTTPException(status_code=400, detail="code and name are required")
            phone = str(data.get("phone") or data.get("contact_phone") or "").strip() or None
            email = str(data.get("email") or data.get("contact_email") or "").strip() or None
            contact_person = str(data.get("contact_person") or "").strip() or None
            address = str(data.get("address") or "").strip() or None
            is_active = _truthy(data.get("is_active"), True)
            existing = session.exec(
                select(Supplier).where(Supplier.company_id == auth.company_id, Supplier.code == code)
            ).first()
            payload = {"row": idx, "code": code, "name": name, "action": "update" if existing else "create"}
            validated.append(payload)
            if dry_run:
                continue
            if existing:
                existing.name = name
                existing.phone = phone
                existing.email = email
                existing.contact_person = contact_person
                existing.address = address
                existing.is_active = is_active
                session.add(existing)
                write_audit(session, auth, "supplier_import_update", "supplier", existing.id, {"code": code})
                updated += 1
            else:
                supplier = Supplier(
                    company_id=auth.company_id,
                    code=code,
                    name=name,
                    phone=phone,
                    email=email,
                    contact_person=contact_person,
                    address=address,
                    is_active=is_active,
                )
                session.add(supplier)
                session.flush()
                write_audit(session, auth, "supplier_import_create", "supplier", supplier.id, {"code": code})
                imported += 1
        except HTTPException as exc:
            errors.append({"row": idx, "detail": exc.detail, "data": data})
        except (TypeError, ValueError) as exc:
            errors.append({"row": idx, "detail": str(exc), "data": data})

    write_audit(
        session,
        auth,
        "import_suppliers",
        "import",
        None,
        {
            "rows_received": len(rows),
            "rows_imported": imported,
            "rows_updated": updated,
            "error_count": len(errors),
            "dry_run": dry_run,
        },
    )
    return _import_result(
        module="suppliers",
        rows=rows,
        validated=validated,
        imported=imported,
        updated=updated,
        errors=errors,
        dry_run=dry_run,
        message_ok="Imported {imported} supplier(s), updated {updated}",
    )


def import_customer_rows(
    session: Session,
    auth: AuthContext,
    rows: list[Any],
    *,
    dry_run: bool = False,
) -> dict[str, Any]:
    imported = 0
    updated = 0
    errors: list[dict[str, Any]] = []
    validated: list[dict[str, Any]] = []

    for idx, raw in enumerate(rows):
        data = _row_data(raw)
        try:
            code = str(data.get("code") or "").strip()
            name = str(data.get("name") or "").strip()
            if not code or not name:
                raise HTTPException(status_code=400, detail="code and name are required")
            phone = str(data.get("phone") or "").strip() or None
            email = (str(data.get("email") or "").strip() or None)
            group = data.get("customer_group") or data.get("loyalty_tier")
            credit_limit = data.get("credit_limit")
            body = {
                "code": code,
                "name": name,
                "phone": phone,
                "email": email,
                "customer_group": str(group).strip() if group not in (None, "") else None,
                "credit_limit": float(credit_limit) if credit_limit not in (None, "") else None,
            }
            existing = session.exec(
                select(Customer).where(Customer.company_id == auth.company_id, Customer.code == code)
            ).first()
            payload = {"row": idx, "code": code, "name": name, "action": "update" if existing else "create"}
            validated.append(payload)
            if dry_run:
                continue
            if existing:
                update_payload = {k: v for k, v in body.items() if k != "code"}
                if data.get("is_active") not in (None, ""):
                    update_payload["is_active"] = _truthy(data.get("is_active"), True)
                update_customer(session, auth, existing.id, update_payload)
                updated += 1
            else:
                create_customer(session, auth, body)
                imported += 1
        except HTTPException as exc:
            errors.append({"row": idx, "detail": exc.detail, "data": data})
        except (TypeError, ValueError) as exc:
            errors.append({"row": idx, "detail": str(exc), "data": data})

    write_audit(
        session,
        auth,
        "import_customers",
        "import",
        None,
        {
            "rows_received": len(rows),
            "rows_imported": imported,
            "rows_updated": updated,
            "error_count": len(errors),
            "dry_run": dry_run,
        },
    )
    return _import_result(
        module="customers",
        rows=rows,
        validated=validated,
        imported=imported,
        updated=updated,
        errors=errors,
        dry_run=dry_run,
        message_ok="Imported {imported} customer(s), updated {updated}",
    )


def import_fashion_variant_rows(
    session: Session,
    auth: AuthContext,
    rows: list[Any],
    *,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Create fashion ProductVariant rows by parent_sku + size×color (upsert/skip duplicates)."""
    from app.models.industry import FashionProductVariant
    from app.services.fashion_catalog_service import assert_fashion_variant_unique
    from app.services.product_service import create_variant

    imported = 0
    updated = 0
    errors: list[dict[str, Any]] = []
    validated: list[dict[str, Any]] = []

    for idx, raw in enumerate(rows):
        data = _row_data(raw)
        try:
            parent_data = {
                "sku": data.get("parent_sku") or data.get("product_sku") or data.get("parent"),
                "product_id": data.get("product_id"),
            }
            product = _resolve_product(session, auth.company_id, parent_data)
            if product.industry_pack != "fashion":
                raise HTTPException(status_code=400, detail=f"Product {product.sku} is not fashion pack")
            size = str(data.get("size") or "").strip()
            color = str(data.get("color") or "").strip()
            if not size or not color:
                raise HTTPException(status_code=400, detail="size and color are required")
            variant_code = str(
                data.get("variant_code") or data.get("sku") or data.get("variant_sku") or ""
            ).strip()
            if not variant_code:
                variant_code = f"{product.sku}-{size}-{color}".upper().replace(" ", "")
            barcode = (str(data.get("barcode") or data.get("variant_barcode") or "").strip() or None)
            qty = float(data.get("qty_on_hand") or data.get("qty") or 0)
            store_id = _resolve_store(session, auth.company_id, data, auth.store_id) if qty > 0 else None
            if qty > 0 and not store_id:
                raise HTTPException(status_code=400, detail="store_id or store_code required when qty_on_hand > 0")
            unit_cost = float(data.get("unit_cost") or 0)

            existing = session.exec(
                select(ProductVariant).where(
                    ProductVariant.company_id == auth.company_id,
                    ProductVariant.product_id == product.id,
                    ProductVariant.size == size,
                    ProductVariant.color == color,
                )
            ).first()
            if not existing:
                by_code = session.exec(
                    select(ProductVariant).where(
                        ProductVariant.company_id == auth.company_id,
                        ProductVariant.product_id == product.id,
                        ProductVariant.variant_code == variant_code,
                    )
                ).first()
                existing = by_code

            payload = {
                "row": idx,
                "parent_sku": product.sku,
                "variant_code": variant_code,
                "size": size,
                "color": color,
                "qty_on_hand": qty,
                "action": "update" if existing else "create",
            }
            validated.append(payload)
            if dry_run:
                continue

            if existing:
                if barcode and not existing.barcode:
                    existing.barcode = barcode
                existing.is_active = _truthy(data.get("is_active"), True)
                session.add(existing)
                variant_id = existing.id
                write_audit(
                    session,
                    auth,
                    "fashion_variant_import_update",
                    "product_variant",
                    variant_id,
                    {"parent_sku": product.sku, "size": size, "color": color},
                )
                updated += 1
            else:
                assert_fashion_variant_unique(
                    session,
                    auth,
                    product.id,
                    {"size": size, "color": color},
                )
                created = create_variant(
                    session,
                    auth,
                    product.id,
                    {
                        "variant_code": variant_code,
                        "size": size,
                        "color": color,
                        "style": product.sku,
                        "barcode": barcode,
                        "is_active": True,
                    },
                )
                variant_id = created["id"]
                # Option B compat mirror (stock_qty updated by opening stock / sales)
                legacy = session.exec(
                    select(FashionProductVariant).where(
                        FashionProductVariant.product_id == product.id,
                        FashionProductVariant.size == size,
                        FashionProductVariant.color == color,
                    )
                ).first()
                if not legacy:
                    session.add(
                        FashionProductVariant(
                            product_id=product.id,
                            size=size,
                            color=color,
                            sku=variant_code,
                            barcode=barcode,
                            stock_qty=0,
                        )
                    )
                    session.flush()
                imported += 1

            if qty > 0 and store_id:
                warehouse_id = _resolve_warehouse(session, auth.company_id, data, store_id)
                post_opening_stock(
                    session,
                    company_id=auth.company_id,
                    product_id=product.id,
                    store_id=store_id,
                    warehouse_id=warehouse_id,
                    qty=qty,
                    unit_cost=unit_cost,
                    variant_id=variant_id,
                    note=data.get("notes") or data.get("note") or "Fashion variant import opening",
                    created_by=auth.user_id,
                )
        except HTTPException as exc:
            errors.append({"row": idx, "detail": exc.detail, "data": data})
        except (TypeError, ValueError) as exc:
            errors.append({"row": idx, "detail": str(exc), "data": data})

    write_audit(
        session,
        auth,
        "import_fashion_variants",
        "import",
        None,
        {
            "rows_received": len(rows),
            "rows_imported": imported,
            "rows_updated": updated,
            "error_count": len(errors),
            "dry_run": dry_run,
        },
    )
    return _import_result(
        module="fashion_variants",
        rows=rows,
        validated=validated,
        imported=imported,
        updated=updated,
        errors=errors,
        dry_run=dry_run,
        message_ok="Imported {imported} fashion variant(s), updated {updated}",
    )
