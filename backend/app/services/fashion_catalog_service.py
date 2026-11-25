"""Fashion catalog helpers: meta contract, size×color matrix generation, uniqueness."""

from __future__ import annotations

import re
from typing import Any

from fastapi import HTTPException
from sqlmodel import Session, select

from app.dependencies import AuthContext, write_audit
from app.models.product import Product, ProductVariant
from app.services.product_service import _get_product_or_404, _variant_out, barcode_exists, create_variant

# Canonical fashion product.meta keys (stored in meta_json — no schema duplication).
FASHION_META_KEYS = (
    "style_code",
    "style_number",
    "product_type",
    "short_description",
    "full_description",
    "subcategory",
    "department",
    "collection",
    "season",
    "year",
    "gender",
    "age_group",
    "fabric",
    "fabric_composition",
    "material_composition",
    "material_code",
    "fit",
    "pattern",
    "sleeve_type",
    "country_of_origin",
    "tax_category",
    "min_selling_price",
    "max_discount_pct",
    "reorder_level",
    "min_stock",
    "max_stock",
    "returnable",
    "exchangeable",
    "allow_negative_stock",
)

FASHION_SEASONS = {"SS", "FW", "All season", "Summer", "Winter", "Spring", "Autumn"}
FASHION_GENDERS = {"Men", "Women", "Unisex", "Boys", "Girls", "Kids"}
FASHION_FITS = {"Slim", "Regular", "Relaxed", "Oversized", "Tailored"}

_SIZE_COLOR_SEP = re.compile(r"[,;/|]+")


def _split_list(raw: str | list[str] | None) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        items = [str(x).strip() for x in raw]
    else:
        items = [p.strip() for p in _SIZE_COLOR_SEP.split(str(raw))]
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        if not item:
            continue
        key = item.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def normalize_fashion_meta(meta: dict[str, Any] | None) -> dict[str, Any]:
    """Keep known fashion keys; coerce types; map style_number → style_code."""
    src = dict(meta or {})
    if src.get("style_number") and not src.get("style_code"):
        src["style_code"] = src["style_number"]
    out: dict[str, Any] = {}
    for key in FASHION_META_KEYS:
        if key not in src or src[key] is None or src[key] == "":
            continue
        val = src[key]
        if key in {"min_selling_price", "max_discount_pct", "reorder_level", "min_stock", "max_stock", "year"}:
            try:
                out[key] = float(val) if key != "year" else int(val)
            except (TypeError, ValueError) as exc:
                raise HTTPException(status_code=400, detail=f"Invalid numeric value for {key}") from exc
        elif key in {"returnable", "exchangeable", "allow_negative_stock"}:
            out[key] = bool(val) if not isinstance(val, str) else val.strip().lower() in {"1", "true", "yes", "y"}
        else:
            out[key] = str(val).strip()
    # Preserve unknown keys for forward compatibility (do not drop custom dynamic fields).
    for k, v in src.items():
        if k not in out and k not in FASHION_META_KEYS:
            out[k] = v
    return out


def validate_fashion_meta(meta: dict[str, Any] | None, *, require_style: bool = False) -> dict[str, Any]:
    cleaned = normalize_fashion_meta(meta)
    # style_code and fabric are optional
    season = cleaned.get("season")
    if season and season not in FASHION_SEASONS:
        # Allow free-text seasons but warn via soft accept — keep value
        pass
    gender = cleaned.get("gender")
    if gender and gender not in FASHION_GENDERS:
        pass
    fit = cleaned.get("fit")
    if fit and fit not in FASHION_FITS:
        pass
    msp = cleaned.get("min_selling_price")
    if msp is not None and float(msp) < 0:
        raise HTTPException(status_code=400, detail="min_selling_price cannot be negative")
    max_disc = cleaned.get("max_discount_pct")
    if max_disc is not None and (float(max_disc) < 0 or float(max_disc) > 100):
        raise HTTPException(status_code=400, detail="max_discount_pct must be between 0 and 100")
    return cleaned


def _slug(part: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]+", "", part.upper())
    return cleaned[:12] or "X"


def build_variant_code(product_sku: str, size: str, color: str) -> str:
    return f"{product_sku}-{_slug(size)}-{_slug(color)}"


def build_variant_barcode(product_sku: str, size: str, color: str) -> str:
    """Deterministic tenant-local barcode string (not GS1); unique per size×color."""
    return f"{_slug(product_sku)}{_slug(size)}{_slug(color)}"[:32]


def size_color_exists(
    session: Session,
    company_id: str,
    product_id: str,
    size: str,
    color: str,
    *,
    exclude_variant_id: str | None = None,
) -> bool:
    rows = session.exec(
        select(ProductVariant).where(
            ProductVariant.company_id == company_id,
            ProductVariant.product_id == product_id,
            ProductVariant.size == size,
            ProductVariant.color == color,
        )
    ).all()
    for row in rows:
        if exclude_variant_id and row.id == exclude_variant_id:
            continue
        return True
    return False


def generate_variant_matrix(
    session: Session,
    auth: AuthContext,
    product_id: str,
    *,
    sizes: list[str] | str,
    colors: list[str] | str,
    fit: str | None = None,
    pattern: str | None = None,
    generate_barcodes: bool = True,
    skip_existing: bool = True,
) -> dict[str, Any]:
    """Create ProductVariant rows for every size×color combination."""
    product = _get_product_or_404(session, auth.company_id, product_id)
    if product.industry_pack != "fashion":
        raise HTTPException(status_code=400, detail="Variant matrix is only for fashion products")
    if not product.is_active:
        raise HTTPException(status_code=400, detail="Product is inactive")

    size_list = _split_list(sizes)
    color_list = _split_list(colors)
    if not size_list:
        raise HTTPException(status_code=400, detail="At least one size is required")
    if not color_list:
        raise HTTPException(status_code=400, detail="At least one color is required")
    if len(size_list) * len(color_list) > 200:
        raise HTTPException(status_code=400, detail="Matrix too large (max 200 combinations)")

    created: list[dict[str, Any]] = []
    skipped: list[dict[str, str]] = []
    errors: list[dict[str, str]] = []

    for size in size_list:
        for color in color_list:
            code = build_variant_code(product.sku, size, color)
            barcode = build_variant_barcode(product.sku, size, color) if generate_barcodes else None
            if size_color_exists(session, auth.company_id, product_id, size, color):
                if skip_existing:
                    skipped.append({"size": size, "color": color, "reason": "size_color_exists"})
                    continue
                errors.append({"size": size, "color": color, "reason": "Duplicate size/color"})
                continue
            dup_code = session.exec(
                select(ProductVariant).where(
                    ProductVariant.company_id == auth.company_id,
                    ProductVariant.product_id == product_id,
                    ProductVariant.variant_code == code,
                )
            ).first()
            if dup_code:
                if skip_existing:
                    skipped.append({"size": size, "color": color, "reason": "variant_code_exists"})
                    continue
                errors.append({"size": size, "color": color, "reason": "Variant code exists"})
                continue
            if barcode and barcode_exists(session, auth.company_id, barcode, exclude_product_id=product_id):
                # Make barcode unique by appending short hash of size+color
                barcode = f"{barcode}{abs(hash(f'{size}:{color}')) % 1000:03d}"[:32]
                if barcode_exists(session, auth.company_id, barcode, exclude_product_id=product_id):
                    errors.append({"size": size, "color": color, "reason": "Barcode collision"})
                    continue
            attrs: dict[str, Any] = {}
            if fit:
                attrs["fit"] = fit
            if pattern:
                attrs["pattern"] = pattern
            try:
                row = create_variant(
                    session,
                    auth,
                    product_id,
                    {
                        "variant_code": code,
                        "size": size,
                        "color": color,
                        "style": product.sku,
                        "attributes": attrs,
                        "barcode": barcode,
                        "is_active": True,
                    },
                )
                created.append(row)
            except HTTPException as exc:
                errors.append({"size": size, "color": color, "reason": str(exc.detail)})

    write_audit(
        session,
        auth,
        "fashion_variant_matrix",
        "product",
        product_id,
        {"created": len(created), "skipped": len(skipped), "errors": len(errors)},
    )
    session.flush()
    return {
        "product_id": product_id,
        "requested": len(size_list) * len(color_list),
        "created_count": len(created),
        "skipped_count": len(skipped),
        "error_count": len(errors),
        "created": created,
        "skipped": skipped,
        "errors": errors,
    }


def assert_fashion_variant_unique(
    session: Session,
    auth: AuthContext,
    product_id: str,
    body: dict[str, Any],
    *,
    exclude_variant_id: str | None = None,
) -> None:
    """Call before create/update for fashion size+color uniqueness."""
    product = session.get(Product, product_id)
    if not product or product.company_id != auth.company_id:
        return
    if product.industry_pack != "fashion":
        return
    size = (body.get("size") or "").strip()
    color = (body.get("color") or "").strip()
    if not size or not color:
        raise HTTPException(status_code=400, detail="Fashion variants require size and color")
    if size_color_exists(session, auth.company_id, product_id, size, color, exclude_variant_id=exclude_variant_id):
        raise HTTPException(status_code=409, detail="Size/color combination already exists for this product")
