"""Fashion dual-stock authority (SQLite unit coverage for Option B)."""

from sqlmodel import select

from app.models.industry import FashionProductVariant
from app.models.product import Product
from app.services.inventory_service import apply_industry_receive_stock


def test_apply_industry_receive_does_not_bump_fashion_stock_qty(session, auth_headers, client):
    fashion = session.exec(select(Product).where(Product.sku == "FASH-001")).one()
    legacy = session.exec(
        select(FashionProductVariant).where(
            FashionProductVariant.product_id == fashion.id,
            FashionProductVariant.size == "M",
            FashionProductVariant.color == "Blue",
        )
    ).first()
    assert legacy is not None
    before = float(legacy.stock_qty or 0)
    apply_industry_receive_stock(
        session,
        fashion.company_id,
        fashion,
        7.0,
        variant_id=legacy.id,
    )
    session.flush()
    session.refresh(legacy)
    assert float(legacy.stock_qty or 0) == before
