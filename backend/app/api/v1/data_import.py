"""Data import — products, suppliers, customers, opening stock, fashion variants are live."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session

from app.database import get_session
from app.dependencies import AuthContext, get_current_user, require_permission
from app.services.import_service import (
    import_customer_rows,
    import_fashion_variant_rows,
    import_opening_stock_rows,
    import_product_rows,
    import_supplier_rows,
)

router = APIRouter(prefix="/import", tags=["import"])


class ImportRow(BaseModel):
    data: dict[str, Any]


class ImportBatch(BaseModel):
    rows: list[ImportRow]
    dry_run: bool = False


@router.post("/products")
def import_products(
    body: ImportBatch,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.edit"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = import_product_rows(session, auth, body.rows, dry_run=body.dry_run)
    session.commit()
    return result


@router.post("/opening-stock")
def import_opening_stock(
    body: ImportBatch,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.adjust"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = import_opening_stock_rows(session, auth, body.rows, dry_run=body.dry_run)
    session.commit()
    return result


@router.post("/suppliers")
def import_suppliers(
    body: ImportBatch,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.edit"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = import_supplier_rows(session, auth, body.rows, dry_run=body.dry_run)
    session.commit()
    return result


@router.post("/customers")
def import_customers(
    body: ImportBatch,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.edit"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = import_customer_rows(session, auth, body.rows, dry_run=body.dry_run)
    session.commit()
    return result


@router.post("/fashion-variants")
def import_fashion_variants(
    body: ImportBatch,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.edit"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = import_fashion_variant_rows(session, auth, body.rows, dry_run=body.dry_run)
    session.commit()
    return result


@router.get("/status")
def import_status(auth: Annotated[AuthContext, Depends(get_current_user)]):
    return {
        "available": True,
        "modules": ["products", "opening_stock", "suppliers", "customers", "fashion_variants"],
        "mode": "live",
        "live_modules": [
            "products",
            "opening_stock",
            "suppliers",
            "customers",
            "fashion_variants",
        ],
        "stub_modules": [],
        "planned_modules": ["pharmacy_batches", "electronics_serials"],
        "documentation": "docs/DATA_IMPORT_PLAN.md",
    }
