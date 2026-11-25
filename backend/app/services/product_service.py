"""Product catalog — search, variants, barcodes, reorder PO."""

from __future__ import annotations

import json
from typing import Any, Optional

from fastapi import HTTPException
from sqlmodel import Session, select, func

from app.dependencies import AuthContext, write_audit
from app.models.product import (
    BrandMaster,
    Product,
    ProductBarcode,
    ProductCategory,
    ProductVariant,
    Supplier,
    Unit,
)
from app.models.industry import FashionProductVariant
from app.services.inventory_service import get_stock_balances
from app.services.purchase_service import create_purchase


def _product_out(p: Product, session: Session | None = None) -> dict[str, Any]:
    meta = json.loads(p.meta_json or "{}")
    if session is not None:
        from app.services.pharma_service import enrich_pharma_meta
        meta = enrich_pharma_meta(session, p, meta)
    return {
        "id": p.id,
        "sku": p.sku,
        "barcode": p.barcode,
        "name": p.name,
        "industry_pack": p.industry_pack,
        "base_price": p.base_price,
        "wholesale_price": p.wholesale_price,
        "cost_price": p.cost_price,
        "is_active": p.is_active,
        "category_id": p.category_id,
        "brand_id": p.brand_id,
        "unit_id": p.unit_id,
        "meta": meta,
    }


def _validate_master(
    session: Session,
    company_id: str,
    model: type,
    ref_id: Optional[str],
    label: str,
) -> None:
    if not ref_id:
        return
    row = session.get(model, ref_id)
    if not row or getattr(row, "company_id", None) != company_id:
        raise HTTPException(status_code=400, detail=f"Invalid {label}")
    if hasattr(row, "is_active") and not row.is_active:
        raise HTTPException(status_code=400, detail=f"{label} is inactive")


def barcode_exists(
    session: Session,
    company_id: str,
    barcode: str,
    *,
    exclude_product_id: Optional[str] = None,
    exclude_variant_id: Optional[str] = None,
    exclude_barcode_id: Optional[str] = None,
) -> bool:
    if not barcode:
        return False
    prod_stmt = select(Product).where(
        Product.company_id == company_id,
        Product.barcode == barcode,
    )
    if exclude_product_id:
        prod_stmt = prod_stmt.where(Product.id != exclude_product_id)
    prod = session.exec(prod_stmt).first()
    if prod:
        return True

    var_stmt = select(ProductVariant).where(
        ProductVariant.company_id == company_id,
        ProductVariant.barcode == barcode,
    )
    if exclude_product_id:
        var_stmt = var_stmt.where(ProductVariant.product_id != exclude_product_id)
    if exclude_variant_id:
        var_stmt = var_stmt.where(ProductVariant.id != exclude_variant_id)
    var = session.exec(var_stmt).first()
    if var:
        return True

    bc_stmt = select(ProductBarcode).where(
        ProductBarcode.company_id == company_id,
        ProductBarcode.barcode == barcode,
        ProductBarcode.is_active == True,  # noqa: E712
    )
    if exclude_product_id:
        bc_stmt = bc_stmt.where(ProductBarcode.product_id != exclude_product_id)
    if exclude_barcode_id:
        bc_stmt = bc_stmt.where(ProductBarcode.id != exclude_barcode_id)
    if exclude_variant_id:
        bc_stmt = bc_stmt.where(ProductBarcode.variant_id != exclude_variant_id)
    bc = session.exec(bc_stmt).first()
    if bc:
        return True

    return False


def search_products(
    session: Session,
    company_id: str,
    *,
    industry_pack: Optional[str] = None,
    q: Optional[str] = None,
    status: Optional[str] = None,
    category_id: Optional[str] = None,
    brand_id: Optional[str] = None,
) -> list[Product]:
    stmt = select(Product).where(Product.company_id == company_id)
    if industry_pack:
        stmt = stmt.where(Product.industry_pack == industry_pack)
    if status == "active":
        stmt = stmt.where(Product.is_active == True)  # noqa: E712
    elif status == "inactive":
        stmt = stmt.where(Product.is_active == False)  # noqa: E712
    if category_id:
        stmt = stmt.where(Product.category_id == category_id)
    if brand_id:
        stmt = stmt.where(Product.brand_id == brand_id)
    stmt = stmt.order_by(Product.name.asc())
    products = list(session.exec(stmt).all())
    if not q:
        return products
    ql = q.lower().strip()
    cat_map = {c.id: c.name.lower() for c in session.exec(select(ProductCategory).where(ProductCategory.company_id == company_id)).all()}
    brand_map = {b.id: b.name.lower() for b in session.exec(select(BrandMaster).where(BrandMaster.company_id == company_id)).all()}
    variant_rows = session.exec(
        select(ProductVariant).where(ProductVariant.company_id == company_id)
    ).all()
    variant_product_ids: set[str] = set()
    for v in variant_rows:
        hay = " ".join(
            filter(None, [v.variant_code, v.size, v.color, v.style, v.model, v.barcode])
        ).lower()
        if ql in hay:
            variant_product_ids.add(v.product_id)
    barcode_rows = session.exec(
        select(ProductBarcode).where(
            ProductBarcode.company_id == company_id,
            ProductBarcode.is_active == True,  # noqa: E712
        )
    ).all()
    barcode_product_ids = {b.product_id for b in barcode_rows if ql in b.barcode.lower()}

    def matches(p: Product) -> bool:
        if ql in p.name.lower() or ql in p.sku.lower():
            return True
        if p.barcode and ql in p.barcode.lower():
            return True
        if p.category_id and ql in cat_map.get(p.category_id, ""):
            return True
        if p.brand_id and ql in brand_map.get(p.brand_id, ""):
            return True
        if p.id in variant_product_ids or p.id in barcode_product_ids:
            return True
        return False

    return [p for p in products if matches(p)]


def get_product_detail(session: Session, company_id: str, product_id: str) -> dict[str, Any]:
    product = session.get(Product, product_id)
    if not product or product.company_id != company_id:
        raise HTTPException(status_code=404, detail="Product not found")
    out = _product_out(product, session)
    balances = get_stock_balances(session, company_id, store_id=None)
    stock_on_hand = sum(b["qty_on_hand"] for b in balances if b["product_id"] == product_id)
    stock_avail = sum(b["qty_available"] for b in balances if b["product_id"] == product_id)
    variant_count = session.exec(
        select(ProductVariant).where(
            ProductVariant.company_id == company_id,
            ProductVariant.product_id == product_id,
        )
    ).all()
    barcode_count = session.exec(
        select(ProductBarcode).where(
            ProductBarcode.company_id == company_id,
            ProductBarcode.product_id == product_id,
        )
    ).all()
    out["stock_qty"] = stock_on_hand
    out["stock_available"] = stock_avail
    out["variant_count"] = len(variant_count)
    out["barcode_count"] = len(barcode_count)
    return out


def lookup_by_barcode(session: Session, company_id: str, barcode: str) -> dict[str, Any]:
    barcode_clean = (barcode or "").strip()
    if not barcode_clean:
        raise HTTPException(status_code=404, detail="Product not found")

    # 1. ProductBarcode match (exact or case-insensitive)
    bc = session.exec(
        select(ProductBarcode).where(
            ProductBarcode.company_id == company_id,
            ProductBarcode.barcode == barcode_clean,
            ProductBarcode.is_active == True,  # noqa: E712
        )
    ).first()
    if not bc:
        bc = session.exec(
            select(ProductBarcode).where(
                ProductBarcode.company_id == company_id,
                func.lower(ProductBarcode.barcode) == barcode_clean.lower(),
                ProductBarcode.is_active == True,  # noqa: E712
            )
        ).first()
    if bc:
        product = session.get(Product, bc.product_id)
        if not product or product.company_id != company_id or not product.is_active:
            raise HTTPException(status_code=404, detail="Product not found")
        if bc.variant_id:
            variant = session.get(ProductVariant, bc.variant_id)
            if not variant or not variant.is_active:
                raise HTTPException(status_code=404, detail="Product not found")
            return _lookup_out(session, product, matched_barcode_id=bc.id, variant=variant)
        return _lookup_out(session, product, matched_barcode_id=bc.id)

    # 2. Product.barcode match (exact or case-insensitive)
    product = session.exec(
        select(Product).where(Product.company_id == company_id, Product.barcode == barcode_clean)
    ).first()
    if not product:
        product = session.exec(
            select(Product).where(Product.company_id == company_id, func.lower(Product.barcode) == barcode_clean.lower())
        ).first()
    if product:
        if not product.is_active:
            raise HTTPException(status_code=404, detail="Product not found")
        return _lookup_out(session, product)

    # 3. ProductVariant.barcode match (exact or case-insensitive)
    variant = session.exec(
        select(ProductVariant).where(
            ProductVariant.company_id == company_id,
            ProductVariant.barcode == barcode_clean,
            ProductVariant.is_active == True,  # noqa: E712
        )
    ).first()
    if not variant:
        variant = session.exec(
            select(ProductVariant).where(
                ProductVariant.company_id == company_id,
                func.lower(ProductVariant.barcode) == barcode_clean.lower(),
                ProductVariant.is_active == True,  # noqa: E712
            )
        ).first()
    if variant:
        product = session.get(Product, variant.product_id)
        if not product or product.company_id != company_id or not product.is_active:
            raise HTTPException(status_code=404, detail="Product not found")
        return _lookup_out(session, product, variant=variant)

    # 4. Product.sku match (fallback for product code lookup)
    product_by_sku = session.exec(
        select(Product).where(Product.company_id == company_id, Product.sku == barcode_clean)
    ).first()
    if not product_by_sku:
        product_by_sku = session.exec(
            select(Product).where(Product.company_id == company_id, func.lower(Product.sku) == barcode_clean.lower())
        ).first()
    if product_by_sku:
        if not product_by_sku.is_active:
            raise HTTPException(status_code=404, detail="Product not found")
        return _lookup_out(session, product_by_sku)

    # 5. ProductVariant.variant_code match (fallback for variant code lookup)
    variant_by_code = session.exec(
        select(ProductVariant).where(
            ProductVariant.company_id == company_id,
            ProductVariant.variant_code == barcode_clean,
            ProductVariant.is_active == True,  # noqa: E712
        )
    ).first()
    if not variant_by_code:
        variant_by_code = session.exec(
            select(ProductVariant).where(
                ProductVariant.company_id == company_id,
                func.lower(ProductVariant.variant_code) == barcode_clean.lower(),
                ProductVariant.is_active == True,  # noqa: E712
            )
        ).first()
    if variant_by_code:
        product = session.get(Product, variant_by_code.product_id)
        if not product or product.company_id != company_id or not product.is_active:
            raise HTTPException(status_code=404, detail="Product not found")
        return _lookup_out(session, product, variant=variant_by_code)

    raise HTTPException(status_code=404, detail="Product not found")


def _lookup_out(
    session: Session,
    product: Product,
    *,
    matched_barcode_id: Optional[str] = None,
    variant: Optional[ProductVariant] = None,
) -> dict[str, Any]:
    out = _product_out(product, session)
    out["matched_barcode_id"] = matched_barcode_id
    if variant:
        out["matched_variant_id"] = variant.id
        out["matched_variant"] = _variant_out(variant)
    return out


def update_product_extended(
    session: Session,
    auth: AuthContext,
    product_id: str,
    body: dict[str, Any],
) -> dict[str, Any]:
    product = session.get(Product, product_id)
    if not product or product.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Product not found")
    if body.get("is_active") is False and product.is_active:
        write_audit(session, auth, "product_deactivate", "product", product.id, {"sku": product.sku})
    if body.get("sku") is not None:
        new_sku = str(body["sku"]).strip()
        if not new_sku:
            raise HTTPException(status_code=400, detail="SKU cannot be empty")
        if new_sku.lower() != product.sku.lower():
            from sqlmodel import func

            existing_sku = session.exec(
                select(Product).where(
                    Product.company_id == auth.company_id,
                    func.lower(Product.sku) == new_sku.lower(),
                    Product.id != product.id,
                )
            ).first()
            if existing_sku:
                raise HTTPException(status_code=409, detail="SKU already exists for another product")
        product.sku = new_sku
    if body.get("barcode") is not None:
        bc = body["barcode"] or None
        if bc and barcode_exists(session, auth.company_id, bc, exclude_product_id=product.id):
            raise HTTPException(status_code=409, detail="Barcode already exists for another product")
        product.barcode = bc
    for field in ("name", "base_price", "wholesale_price", "cost_price", "is_active"):
        if body.get(field) is not None:
            setattr(product, field, body[field])
    for ref_field, model, label in [
        ("category_id", ProductCategory, "category"),
        ("brand_id", BrandMaster, "brand"),
        ("unit_id", Unit, "unit"),
    ]:
        if ref_field in body:
            _validate_master(session, auth.company_id, model, body[ref_field], label)
            setattr(product, ref_field, body[ref_field])
    if body.get("meta") is not None:
        meta = body["meta"]
        if product.industry_pack == "fashion":
            from app.services.fashion_catalog_service import validate_fashion_meta

            meta = validate_fashion_meta(meta, require_style=False)
        product.meta_json = json.dumps(meta)
    session.add(product)
    write_audit(session, auth, "product_update", "product", product.id, {"sku": product.sku})
    session.flush()
    if product.industry_pack == "jewelry" and body.get("meta") is not None:
        _sync_jewelry_profile_from_meta(session, auth, product, body["meta"])
    if product.industry_pack == "cosmetics" and body.get("meta") is not None:
        from app.services.cosmetics_service import sync_cosmetics_batch_from_meta
        sync_cosmetics_batch_from_meta(session, auth.company_id, product, body["meta"])
    return _product_out(product, session)


def _sync_jewelry_profile_from_meta(session: Session, auth: AuthContext, product: Product, meta: dict[str, Any]) -> None:
    """Best-effort profile sync from product meta — skips if weights incomplete."""
    from app.services.jewelry_service import upsert_product_profile

    gross = float(meta.get("gross_weight") or meta.get("gross_weight_g") or meta.get("grossWeight") or 0)
    if gross <= 0:
        return
    stone = float(meta.get("stone_weight") or meta.get("stoneWeight") or 0)
    other = float(meta.get("other_non_metal_weight") or 0)
    net = meta.get("net_metal_weight") or meta.get("netWeight") or meta.get("net_weight")
    purity = meta.get("purity") or meta.get("karat") or "22K"
    if isinstance(purity, (int, float)):
        purity = f"{int(purity)}K"
    try:
        upsert_product_profile(
            session,
            auth,
            product.id,
            {
                "metal_type": meta.get("metal") or meta.get("metal_type") or "Gold",
                "purity": purity,
                "karat": purity,
                "gross_weight": gross,
                "stone_weight": stone,
                "other_non_metal_weight": other,
                "net_metal_weight": float(net) if net is not None else None,
                "making_charge_type": meta.get("making_charge_type") or "per_gram",
                "making_charge_rate": float(
                    meta.get("making_charge_rate") or meta.get("makingChargePerGram") or meta.get("making_charge") or 0
                ),
                "making_charge_amount": float(meta.get("making_charge_amount") or 0),
                "wastage_percentage": float(meta.get("wastage_percentage") or 0),
                "default_stone_value": float(meta.get("default_stone_value") or meta.get("stoneValue") or 0),
                "certificate_required": bool(meta.get("certificate_required") or meta.get("certificate_no")),
                "tag_no": meta.get("tag_no") or meta.get("certificate") or None,
                "barcode": meta.get("barcode") or product.barcode,
            },
        )
    except HTTPException:
        # Incomplete/invalid jewelry meta should not block product save
        pass


def list_variants(session: Session, company_id: str, product_id: str) -> list[dict[str, Any]]:
    _get_product_or_404(session, company_id, product_id)
    rows = session.exec(
        select(ProductVariant).where(
            ProductVariant.company_id == company_id,
            ProductVariant.product_id == product_id,
        )
    ).all()
    return [_variant_out(v) for v in rows]


def list_fashion_variants(session: Session, company_id: str) -> list[dict[str, Any]]:
    """List fashion variants — generic product_variant primary, legacy fashion_product_variant read-only."""
    products = session.exec(
        select(Product).where(Product.company_id == company_id, Product.industry_pack == "fashion")
    ).all()
    if not products:
        return []
    product_map = {p.id: p for p in products}
    product_ids = list(product_map.keys())
    balances = get_stock_balances(session, company_id, store_id=None)
    stock_map: dict[str, float] = {}
    for b in balances:
        stock_map[b["product_id"]] = stock_map.get(b["product_id"], 0) + b["qty_on_hand"]

    # Option B mirror qty by size×color (preferred display for fashion variants)
    legacy_all = session.exec(
        select(FashionProductVariant).where(FashionProductVariant.product_id.in_(product_ids))  # type: ignore
    ).all()
    mirror_qty: dict[tuple[str, str, str], float] = {}
    for r in legacy_all:
        mirror_qty[(r.product_id, r.size or "", r.color or "")] = float(r.stock_qty or 0)

    generic_rows = session.exec(
        select(ProductVariant).where(
            ProductVariant.company_id == company_id,
            ProductVariant.product_id.in_(product_ids),  # type: ignore
        )
    ).all()
    out: list[dict[str, Any]] = []
    generic_product_ids: set[str] = set()
    for v in generic_rows:
        generic_product_ids.add(v.product_id)
        p = product_map[v.product_id]
        size = v.size or ""
        color = v.color or ""
        total_p_stock = stock_map.get(v.product_id, 0)
        qty = mirror_qty.get((v.product_id, size, color))
        if qty is None or qty > total_p_stock:
            qty = total_p_stock
        out.append({
            "id": v.id,
            "product_id": v.product_id,
            "product_name": p.name,
            "product_sku": p.sku,
            "variant_code": v.variant_code,
            "sku": v.variant_code,
            "size": size,
            "color": color,
            "style": v.style,
            "model": v.model,
            "barcode": v.barcode,
            "stock_qty": qty,
            "is_active": v.is_active,
            "source": "generic",
            "editable": True,
        })

    for r in legacy_all:
        if r.product_id in generic_product_ids:
            # Prefer generic ProductVariant id; still expose mirror qty above
            continue
        p = product_map.get(r.product_id)
        total_p_stock = stock_map.get(r.product_id, 0)
        legacy_qty = min(float(r.stock_qty or 0), total_p_stock)
        out.append({
            "id": r.id,
            "product_id": r.product_id,
            "product_name": p.name if p else "",
            "product_sku": p.sku if p else "",
            "variant_code": r.sku,
            "sku": r.sku,
            "size": r.size,
            "color": r.color,
            "barcode": r.barcode,
            "stock_qty": legacy_qty,
            "is_active": True,
            "source": "legacy",
            "editable": False,
        })
    return out


def create_variant(session: Session, auth: AuthContext, product_id: str, body: dict[str, Any]) -> dict[str, Any]:
    product = _get_product_or_404(session, auth.company_id, product_id)
    if not product.is_active:
        raise HTTPException(status_code=400, detail="Product is inactive")
    code = body["variant_code"].strip()
    dup = session.exec(
        select(ProductVariant).where(
            ProductVariant.company_id == auth.company_id,
            ProductVariant.product_id == product_id,
            ProductVariant.variant_code == code,
        )
    ).first()
    if dup:
        raise HTTPException(status_code=409, detail="Variant code already exists for this product")
    bc = body.get("barcode")
    if bc and barcode_exists(session, auth.company_id, bc):
        raise HTTPException(status_code=409, detail="Barcode already exists")
    variant = ProductVariant(
        company_id=auth.company_id,
        product_id=product_id,
        variant_code=code,
        size=body.get("size"),
        color=body.get("color"),
        style=body.get("style"),
        model=body.get("model"),
        attributes_json=json.dumps(body.get("attributes") or {}),
        barcode=bc,
        is_active=body.get("is_active", True),
    )
    session.add(variant)
    write_audit(session, auth, "product_variant_create", "product_variant", variant.id, {"product_id": product_id})
    session.flush()
    return _variant_out(variant)


def update_variant(
    session: Session,
    auth: AuthContext,
    product_id: str,
    variant_id: str,
    body: dict[str, Any],
) -> dict[str, Any]:
    _get_product_or_404(session, auth.company_id, product_id)
    variant = session.get(ProductVariant, variant_id)
    if not variant or variant.company_id != auth.company_id or variant.product_id != product_id:
        raise HTTPException(status_code=404, detail="Variant not found")
    if body.get("barcode") is not None:
        bc = body["barcode"] or None
        if bc and barcode_exists(session, auth.company_id, bc, exclude_variant_id=variant.id, exclude_product_id=product_id):
            raise HTTPException(status_code=409, detail="Barcode already exists")
        variant.barcode = bc
    for field in ("variant_code", "size", "color", "style", "model", "is_active"):
        if body.get(field) is not None:
            setattr(variant, field, body[field])
    if body.get("attributes") is not None:
        variant.attributes_json = json.dumps(body["attributes"])
    session.add(variant)
    write_audit(session, auth, "product_variant_update", "product_variant", variant.id, {"product_id": product_id})
    session.flush()
    return _variant_out(variant)


def list_barcodes(session: Session, company_id: str, product_id: str) -> list[dict[str, Any]]:
    _get_product_or_404(session, company_id, product_id)
    rows = session.exec(
        select(ProductBarcode).where(
            ProductBarcode.company_id == company_id,
            ProductBarcode.product_id == product_id,
        )
    ).all()
    return [_barcode_out(b) for b in rows]


def create_barcode(session: Session, auth: AuthContext, product_id: str, body: dict[str, Any]) -> dict[str, Any]:
    product = _get_product_or_404(session, auth.company_id, product_id)
    if not product.is_active:
        raise HTTPException(status_code=400, detail="Product is inactive")
    bc = body["barcode"].strip()
    if barcode_exists(session, auth.company_id, bc, exclude_product_id=product_id):
        raise HTTPException(status_code=409, detail="Barcode already exists")
    if body.get("variant_id"):
        var = session.get(ProductVariant, body["variant_id"])
        if not var or var.company_id != auth.company_id or var.product_id != product_id:
            raise HTTPException(status_code=400, detail="Invalid variant")
    if body.get("is_primary"):
        existing = session.exec(
            select(ProductBarcode).where(
                ProductBarcode.company_id == auth.company_id,
                ProductBarcode.product_id == product_id,
                ProductBarcode.is_primary == True,  # noqa: E712
            )
        ).all()
        for row in existing:
            row.is_primary = False
            session.add(row)
        product.barcode = bc
        session.add(product)
    row = ProductBarcode(
        company_id=auth.company_id,
        product_id=product_id,
        variant_id=body.get("variant_id"),
        barcode=bc,
        barcode_type=body.get("barcode_type") or "EAN13",
        is_primary=bool(body.get("is_primary")),
        is_active=body.get("is_active", True),
        created_by=auth.user_id,
    )
    session.add(row)
    write_audit(session, auth, "product_barcode_create", "product_barcode", row.id, {"product_id": product_id, "barcode": bc})
    session.flush()
    return _barcode_out(row)


def update_barcode(
    session: Session,
    auth: AuthContext,
    product_id: str,
    barcode_id: str,
    body: dict[str, Any],
) -> dict[str, Any]:
    _get_product_or_404(session, auth.company_id, product_id)
    row = session.get(ProductBarcode, barcode_id)
    if not row or row.company_id != auth.company_id or row.product_id != product_id:
        raise HTTPException(status_code=404, detail="Barcode not found")
    if body.get("barcode") is not None:
        bc = body["barcode"].strip()
        if bc and barcode_exists(session, auth.company_id, bc, exclude_barcode_id=row.id, exclude_product_id=product_id):
            raise HTTPException(status_code=409, detail="Barcode already exists")
        row.barcode = bc
    if body.get("barcode_type") is not None:
        row.barcode_type = body["barcode_type"]
    if body.get("is_active") is not None:
        row.is_active = body["is_active"]
    if body.get("is_primary") is True:
        existing = session.exec(
            select(ProductBarcode).where(
                ProductBarcode.company_id == auth.company_id,
                ProductBarcode.product_id == product_id,
                ProductBarcode.is_primary == True,  # noqa: E712
            )
        ).all()
        for other in existing:
            if other.id != row.id:
                other.is_primary = False
                session.add(other)
        row.is_primary = True
        product = session.get(Product, product_id)
        if product:
            product.barcode = row.barcode
            session.add(product)
    elif body.get("is_primary") is False:
        row.is_primary = False
    session.add(row)
    write_audit(session, auth, "product_barcode_update", "product_barcode", row.id, {"product_id": product_id})
    session.flush()
    return _barcode_out(row)


def create_reorder_po(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    product = session.get(Product, body["product_id"])
    if not product or product.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Product not found")
    if not product.is_active:
        raise HTTPException(status_code=400, detail="Product is inactive")
    qty = float(body["qty"])
    if qty <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero")
    supplier_id = body.get("supplier_id")
    if supplier_id:
        sup = session.get(Supplier, supplier_id)
        if not sup or sup.company_id != auth.company_id:
            raise HTTPException(status_code=400, detail="Invalid supplier")
        if not sup.is_active:
            raise HTTPException(status_code=400, detail="Supplier is inactive")
    unit_cost = body.get("unit_cost")
    if unit_cost is None:
        unit_cost = product.cost_price or product.base_price or 0
    remarks = body.get("remarks") or f"Reorder: {product.sku} — {product.name}"
    if body.get("expected_date"):
        remarks = f"{remarks} (expected: {body['expected_date']})"
    po_body = {
        "supplier_id": supplier_id,
        "store_id": body.get("store_id") or auth.store_id,
        "remarks": remarks,
        "lines": [{"product_id": product.id, "qty": qty, "unit_cost": float(unit_cost)}],
    }
    result = create_purchase(session, auth, po_body)
    write_audit(
        session,
        auth,
        "inventory_reorder",
        "purchase_invoice",
        result["id"],
        {"product_id": product.id, "qty": qty, "supplier_id": supplier_id},
    )
    return result


def _get_product_or_404(session: Session, company_id: str, product_id: str) -> Product:
    product = session.get(Product, product_id)
    if not product or product.company_id != company_id:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


def _variant_out(v: ProductVariant) -> dict[str, Any]:
    return {
        "id": v.id,
        "product_id": v.product_id,
        "variant_code": v.variant_code,
        "size": v.size,
        "color": v.color,
        "style": v.style,
        "model": v.model,
        "attributes": json.loads(v.attributes_json or "{}"),
        "barcode": v.barcode,
        "is_active": v.is_active,
    }


def _barcode_out(b: ProductBarcode) -> dict[str, Any]:
    return {
        "id": b.id,
        "product_id": b.product_id,
        "variant_id": b.variant_id,
        "barcode": b.barcode,
        "barcode_type": b.barcode_type,
        "is_primary": b.is_primary,
        "is_active": b.is_active,
    }


def delete_product(session: Session, auth: AuthContext, product_id: str) -> dict[str, Any]:
    product = session.get(Product, product_id)
    if not product or product.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Product not found")

    from app.models.sales import SalesInvoiceLine, PurchaseInvoiceLine
    from app.models.inventory import StockLedger, OpeningStockDocumentLine, StockBalance

    # 1. Check if the product has sales history
    has_sales = session.exec(
        select(SalesInvoiceLine).where(SalesInvoiceLine.product_id == product_id)
    ).first()
    if has_sales:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete product '{product.name}' ({product.sku}): it has existing sales invoice records. You can mark it inactive instead."
        )

    # 2. Check if product has purchase history
    has_purchases = session.exec(
        select(PurchaseInvoiceLine).where(PurchaseInvoiceLine.product_id == product_id)
    ).first()
    if has_purchases:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete product '{product.name}' ({product.sku}): it has existing purchase invoice records. You can mark it inactive instead."
        )

    # 3. Check if product has recorded stock ledger movements
    has_ledger = session.exec(
        select(StockLedger).where(
            StockLedger.company_id == auth.company_id,
            StockLedger.product_id == product_id,
        )
    ).first()
    if has_ledger:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete product '{product.name}' ({product.sku}): it has recorded inventory movements. You can mark it inactive instead."
        )

    # 4. Clean up any draft/pending opening stock document lines
    draft_os_lines = session.exec(
        select(OpeningStockDocumentLine).where(OpeningStockDocumentLine.product_id == product_id)
    ).all()
    for osl in draft_os_lines:
        session.delete(osl)

    # 5. Clean up any zero stock balances
    balances = session.exec(
        select(StockBalance).where(
            StockBalance.company_id == auth.company_id,
            StockBalance.product_id == product_id,
        )
    ).all()
    for b in balances:
        session.delete(b)

    # 6. Clean up barcodes
    barcodes = session.exec(
        select(ProductBarcode).where(
            ProductBarcode.company_id == auth.company_id,
            ProductBarcode.product_id == product_id,
        )
    ).all()
    for bc in barcodes:
        session.delete(bc)

    # 7. Clean up variants
    variants = session.exec(
        select(ProductVariant).where(
            ProductVariant.company_id == auth.company_id,
            ProductVariant.product_id == product_id,
        )
    ).all()
    for v in variants:
        session.delete(v)

    # 8. Delete the product
    prod_sku = product.sku
    prod_name = product.name
    session.delete(product)

    write_audit(session, auth, "delete", "product", product_id, {"sku": prod_sku, "name": prod_name})
    return {"ok": True, "success": True, "message": f"Product '{prod_name}' ({prod_sku}) deleted successfully."}

