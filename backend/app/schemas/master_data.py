"""Master data schemas — categories, brands, units, tax, company profile."""

from typing import Optional

from pydantic import BaseModel, Field


class CategoryCreate(BaseModel):
    code: str
    name: str
    parent_id: Optional[str] = None
    industry_pack: Optional[str] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[str] = None
    is_active: Optional[bool] = None
    industry_pack: Optional[str] = None


class BrandCreate(BaseModel):
    code: str
    name: str
    industry_pack: Optional[str] = None


class BrandUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None
    industry_pack: Optional[str] = None


class UnitCreate(BaseModel):
    code: str
    name: str


class UnitUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None


class PackAttributeCreate(BaseModel):
    pack_code: str
    attr_type: str
    code: str
    name: str
    parent_id: Optional[str] = None
    sort_order: int = 0
    is_active: bool = True


class PackAttributeUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    parent_id: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class TaxRuleCreate(BaseModel):
    name: str
    rate: float = Field(ge=0, le=1)
    is_active: bool = True
    is_default: bool = False


class TaxRuleUpdate(BaseModel):
    name: Optional[str] = None
    rate: Optional[float] = Field(default=None, ge=0, le=1)
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None


class CompanyProfileUpdate(BaseModel):
    name: Optional[str] = None
    legal_name: Optional[str] = None
    tax_id: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    currency: Optional[str] = None
    timezone: Optional[str] = None


class StoreCreate(BaseModel):
    code: str
    name: str
    address: Optional[str] = None


class StoreUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    is_active: Optional[bool] = None
