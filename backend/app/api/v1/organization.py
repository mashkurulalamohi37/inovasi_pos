from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
from app.dependencies import AuthContext, get_current_user, require_permission, write_audit
from app.models.core import Company, Counter, Region, Store, Warehouse
from app.schemas.master_data import CompanyProfileUpdate, StoreCreate, StoreUpdate

router = APIRouter(prefix="/org", tags=["organization"])


def _company_profile(company: Company) -> dict:
    return {
        "id": company.id,
        "code": company.code,
        "name": company.name,
        "legal_name": company.legal_name,
        "tax_id": company.tax_id,
        "address": company.address,
        "phone": company.phone,
        "email": company.email,
        "currency": company.currency or "BDT",
        "timezone": company.timezone or "Asia/Dhaka",
    }


@router.get("/companies")
def list_companies(auth: Annotated[AuthContext, Depends(get_current_user)], session: Annotated[Session, Depends(get_session)]):
    company = session.get(Company, auth.company_id)
    return [_company_profile(company)] if company else []


@router.get("/company/profile")
def get_company_profile(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    company = session.get(Company, auth.company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return _company_profile(company)


@router.patch("/company/profile")
def update_company_profile(
    body: CompanyProfileUpdate,
    auth: Annotated[AuthContext, Depends(require_permission("config.flags"))],
    session: Annotated[Session, Depends(get_session)],
):
    company = session.get(Company, auth.company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    data = body.model_dump(exclude_unset=True)
    for key, val in data.items():
        setattr(company, key, val)
    session.add(company)
    write_audit(session, auth, "company_profile_update", "company", company.id, data)
    session.commit()
    session.refresh(company)
    return _company_profile(company)


@router.get("/stores")
def list_stores(auth: Annotated[AuthContext, Depends(get_current_user)], session: Annotated[Session, Depends(get_session)]):
    stores = session.exec(select(Store).where(Store.company_id == auth.company_id)).all()
    return [
        {"id": s.id, "code": s.code, "name": s.name, "address": s.address, "is_active": s.is_active}
        for s in stores
    ]


@router.post("/stores")
def create_store(
    body: StoreCreate,
    auth: Annotated[AuthContext, Depends(require_permission("config.flags"))],
    session: Annotated[Session, Depends(get_session)],
):
    existing = session.exec(
        select(Store).where(Store.company_id == auth.company_id, Store.code == body.code)
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Store code already exists")
    store = Store(
        company_id=auth.company_id,
        code=body.code.strip(),
        name=body.name.strip(),
        address=body.address,
        is_active=True,
    )
    session.add(store)
    session.flush()
    write_audit(session, auth, "store_create", "store", store.id)
    session.commit()
    session.refresh(store)
    return {"id": store.id, "code": store.code, "name": store.name, "address": store.address, "is_active": store.is_active}


@router.patch("/stores/{store_id}")
def update_store(
    store_id: str,
    body: StoreUpdate,
    auth: Annotated[AuthContext, Depends(require_permission("config.flags"))],
    session: Annotated[Session, Depends(get_session)],
):
    store = session.get(Store, store_id)
    if not store or store.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Store not found")
    if body.name is not None:
        store.name = body.name
    if body.address is not None:
        store.address = body.address
    if body.is_active is not None:
        store.is_active = body.is_active
    session.add(store)
    write_audit(session, auth, "store_update", "store", store.id)
    session.commit()
    return {"id": store.id, "code": store.code, "name": store.name, "address": store.address, "is_active": store.is_active}


@router.get("/warehouses")
def list_warehouses(auth: Annotated[AuthContext, Depends(get_current_user)], session: Annotated[Session, Depends(get_session)]):
    wh = session.exec(select(Warehouse).where(Warehouse.company_id == auth.company_id)).all()
    return [{"id": w.id, "code": w.code, "name": w.name, "store_id": w.store_id} for w in wh]


@router.get("/counters")
def list_counters(auth: Annotated[AuthContext, Depends(get_current_user)], session: Annotated[Session, Depends(get_session)]):
    counters = session.exec(select(Counter).where(Counter.company_id == auth.company_id)).all()
    return [{"id": c.id, "code": c.code, "name": c.name, "store_id": c.store_id, "is_active": c.is_active} for c in counters]


@router.get("/brands")
def list_org_brands(auth: Annotated[AuthContext, Depends(get_current_user)], session: Annotated[Session, Depends(get_session)]):
    from app.models.core import Brand
    brands = session.exec(select(Brand).where(Brand.company_id == auth.company_id)).all()
    return [{"id": b.id, "code": b.code, "name": b.name} for b in brands]


@router.get("/regions")
def list_regions(auth: Annotated[AuthContext, Depends(get_current_user)], session: Annotated[Session, Depends(get_session)]):
    regions = session.exec(select(Region).where(Region.company_id == auth.company_id)).all()
    return [{"id": r.id, "code": r.code, "name": r.name} for r in regions]
