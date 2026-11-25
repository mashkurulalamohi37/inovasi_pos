from typing import Annotated

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.database import get_session
from app.dependencies import AuthContext, get_current_user, require_permission
from app.schemas.product_catalog import (
    FashionVariantMatrixIn,
    FashionVariantMatrixOut,
    ProductBarcodeCreate,
    ProductBarcodeOut,
    ProductBarcodeUpdate,
    ProductVariantCreate,
    ProductVariantOut,
    ProductVariantUpdate,
)
from app.services.fashion_catalog_service import assert_fashion_variant_unique, generate_variant_matrix
from app.services.product_service import (
    create_barcode,
    create_variant,
    list_barcodes,
    list_variants,
    update_barcode,
    update_variant,
)

router = APIRouter(prefix="/products", tags=["product-catalog"])


@router.get("/{product_id}/variants", response_model=list[ProductVariantOut])
def product_variants_list(
    product_id: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    return list_variants(session, auth.company_id, product_id)


@router.post("/{product_id}/variants", response_model=ProductVariantOut)
def product_variant_create(
    product_id: str,
    body: ProductVariantCreate,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.edit"))],
    session: Annotated[Session, Depends(get_session)],
):
    payload = body.model_dump()
    assert_fashion_variant_unique(session, auth, product_id, payload)
    result = create_variant(session, auth, product_id, payload)
    session.commit()
    return result


@router.post("/{product_id}/variants/generate-matrix", response_model=FashionVariantMatrixOut)
def product_variant_generate_matrix(
    product_id: str,
    body: FashionVariantMatrixIn,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.edit"))],
    session: Annotated[Session, Depends(get_session)],
):
    """Generate size×color ProductVariant rows for a fashion parent product."""
    result = generate_variant_matrix(
        session,
        auth,
        product_id,
        sizes=body.sizes,
        colors=body.colors,
        fit=body.fit,
        pattern=body.pattern,
        generate_barcodes=body.generate_barcodes,
        skip_existing=body.skip_existing,
    )
    session.commit()
    return result


@router.patch("/{product_id}/variants/{variant_id}", response_model=ProductVariantOut)
def product_variant_update(
    product_id: str,
    variant_id: str,
    body: ProductVariantUpdate,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.edit"))],
    session: Annotated[Session, Depends(get_session)],
):
    payload = body.model_dump(exclude_unset=True)
    if "size" in payload or "color" in payload:
        # Merge with existing for uniqueness check
        from app.models.product import ProductVariant as PV

        existing = session.get(PV, variant_id)
        check = {
            "size": payload.get("size", existing.size if existing else None),
            "color": payload.get("color", existing.color if existing else None),
        }
        assert_fashion_variant_unique(session, auth, product_id, check, exclude_variant_id=variant_id)
    result = update_variant(session, auth, product_id, variant_id, payload)
    session.commit()
    return result


@router.get("/{product_id}/barcodes", response_model=list[ProductBarcodeOut])
def product_barcodes_list(
    product_id: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    return list_barcodes(session, auth.company_id, product_id)


@router.post("/{product_id}/barcodes", response_model=ProductBarcodeOut)
def product_barcode_create(
    product_id: str,
    body: ProductBarcodeCreate,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.edit"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = create_barcode(session, auth, product_id, body.model_dump())
    session.commit()
    return result


@router.patch("/{product_id}/barcodes/{barcode_id}", response_model=ProductBarcodeOut)
def product_barcode_update(
    product_id: str,
    barcode_id: str,
    body: ProductBarcodeUpdate,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.edit"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = update_barcode(session, auth, product_id, barcode_id, body.model_dump(exclude_unset=True))
    session.commit()
    return result
