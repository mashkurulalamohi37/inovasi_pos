"""Master data API — categories, brands, units."""

from typing import Annotated, Optional

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.database import get_session
from app.dependencies import AuthContext, get_current_user, require_permission
from app.schemas.master_data import (
    BrandCreate,
    BrandUpdate,
    CategoryCreate,
    CategoryUpdate,
    PackAttributeCreate,
    PackAttributeUpdate,
    UnitCreate,
    UnitUpdate,
)
from app.services.master_data_service import (
    create_brand,
    create_category,
    create_unit,
    delete_brand,
    delete_category,
    delete_unit,
    list_brands,
    list_categories,
    list_units,
    update_brand,
    update_category,
    update_unit,
)
from app.services.pack_attribute_service import (
    create_pack_attribute,
    delete_pack_attribute,
    list_pack_attributes,
    update_pack_attribute,
)

router = APIRouter(tags=["master-data"])


@router.get("/categories")
def categories_list(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    q: Optional[str] = None,
    industry: Optional[str] = None,
):
    return list_categories(session, auth.company_id, q, industry=industry)


@router.post("/categories")
def category_create(
    body: CategoryCreate,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.edit"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = create_category(session, auth, body.model_dump())
    session.commit()
    return result


@router.patch("/categories/{category_id}")
def category_update(
    category_id: str,
    body: CategoryUpdate,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.edit"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = update_category(session, auth, category_id, body.model_dump(exclude_unset=True))
    session.commit()
    return result


@router.delete("/categories/{category_id}")
def category_delete(
    category_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.edit"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = delete_category(session, auth, category_id)
    session.commit()
    return result


@router.get("/brands")
def brands_list(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    q: Optional[str] = None,
    industry: Optional[str] = None,
):
    return list_brands(session, auth.company_id, q, industry=industry)


@router.post("/brands")
def brand_create(
    body: BrandCreate,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.edit"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = create_brand(session, auth, body.model_dump())
    session.commit()
    return result


@router.patch("/brands/{brand_id}")
def brand_update(
    brand_id: str,
    body: BrandUpdate,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.edit"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = update_brand(session, auth, brand_id, body.model_dump(exclude_unset=True))
    session.commit()
    return result


@router.delete("/brands/{brand_id}")
def brand_delete(
    brand_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.edit"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = delete_brand(session, auth, brand_id)
    session.commit()
    return result


@router.get("/units")
def units_list(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    q: Optional[str] = None,
):
    return list_units(session, auth.company_id, q)


@router.post("/units")
def unit_create(
    body: UnitCreate,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.edit"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = create_unit(session, auth, body.model_dump())
    session.commit()
    return result


@router.patch("/units/{unit_id}")
def unit_update(
    unit_id: str,
    body: UnitUpdate,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.edit"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = update_unit(session, auth, unit_id, body.model_dump(exclude_unset=True))
    session.commit()
    return result


@router.delete("/units/{unit_id}")
def unit_delete(
    unit_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.edit"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = delete_unit(session, auth, unit_id)
    session.commit()
    return result


@router.get("/pack-attributes")
def pack_attributes_list(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    pack_code: str,
    attr_type: Optional[str] = None,
    parent_id: Optional[str] = None,
    include_inactive: bool = False,
):
    rows = list_pack_attributes(
        session,
        auth.company_id,
        pack_code=pack_code,
        attr_type=attr_type,
        parent_id=parent_id,
        active_only=not include_inactive,
    )
    session.commit()  # persist auto-seed if any
    return rows


@router.post("/pack-attributes")
def pack_attribute_create(
    body: PackAttributeCreate,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.edit"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = create_pack_attribute(session, auth, body.model_dump())
    session.commit()
    return result


@router.patch("/pack-attributes/{attr_id}")
def pack_attribute_update(
    attr_id: str,
    body: PackAttributeUpdate,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.edit"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = update_pack_attribute(session, auth, attr_id, body.model_dump(exclude_unset=True))
    session.commit()
    return result


@router.delete("/pack-attributes/{attr_id}")
def pack_attribute_delete(
    attr_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.edit"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = delete_pack_attribute(session, auth, attr_id)
    session.commit()
    return result
