from typing import Any, Optional

from pydantic import BaseModel, Field


class ProductOut(BaseModel):
    id: str
    sku: str
    barcode: Optional[str]
    name: str
    industry_pack: str
    base_price: float
    wholesale_price: Optional[float]
    cost_price: Optional[float] = None
    is_active: bool
    category_id: Optional[str] = None
    brand_id: Optional[str] = None
    unit_id: Optional[str] = None
    meta: dict[str, Any] = {}


class ProductDetailOut(ProductOut):
    stock_qty: float = 0
    stock_available: float = 0
    variant_count: int = 0
    barcode_count: int = 0


class ProductCreate(BaseModel):
    sku: str
    barcode: Optional[str] = None
    name: str
    industry_pack: str
    base_price: float = 0
    wholesale_price: Optional[float] = None
    category_id: Optional[str] = None
    brand_id: Optional[str] = None
    unit_id: Optional[str] = None
    meta: dict[str, Any] = {}


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    barcode: Optional[str] = None
    base_price: Optional[float] = None
    wholesale_price: Optional[float] = None
    cost_price: Optional[float] = None
    is_active: Optional[bool] = None
    category_id: Optional[str] = None
    brand_id: Optional[str] = None
    unit_id: Optional[str] = None
    meta: Optional[dict[str, Any]] = None


class ProductVariantOut(BaseModel):
    id: str
    product_id: str
    variant_code: str
    size: Optional[str] = None
    color: Optional[str] = None
    style: Optional[str] = None
    model: Optional[str] = None
    attributes: dict[str, Any] = {}
    barcode: Optional[str] = None
    is_active: bool


class ProductVariantCreate(BaseModel):
    variant_code: str
    size: Optional[str] = None
    color: Optional[str] = None
    style: Optional[str] = None
    model: Optional[str] = None
    attributes: dict[str, Any] = Field(default_factory=dict)
    barcode: Optional[str] = None
    is_active: bool = True


class ProductVariantUpdate(BaseModel):
    variant_code: Optional[str] = None
    size: Optional[str] = None
    color: Optional[str] = None
    style: Optional[str] = None
    model: Optional[str] = None
    attributes: Optional[dict[str, Any]] = None
    barcode: Optional[str] = None
    is_active: Optional[bool] = None


class ProductBarcodeOut(BaseModel):
    id: str
    product_id: str
    variant_id: Optional[str] = None
    barcode: str
    barcode_type: str
    is_primary: bool
    is_active: bool


class ProductBarcodeCreate(BaseModel):
    barcode: str
    variant_id: Optional[str] = None
    barcode_type: str = "EAN13"
    is_primary: bool = False
    is_active: bool = True


class ProductBarcodeUpdate(BaseModel):
    barcode: Optional[str] = None
    barcode_type: Optional[str] = None
    is_primary: Optional[bool] = None
    is_active: Optional[bool] = None
    variant_id: Optional[str] = None


class FashionVariantMatrixIn(BaseModel):
    sizes: list[str] = Field(min_length=1)
    colors: list[str] = Field(min_length=1)
    fit: Optional[str] = None
    pattern: Optional[str] = None
    generate_barcodes: bool = True
    skip_existing: bool = True


class FashionVariantMatrixOut(BaseModel):
    product_id: str
    requested: int
    created_count: int
    skipped_count: int
    error_count: int
    created: list[ProductVariantOut] = Field(default_factory=list)
    skipped: list[dict[str, str]] = Field(default_factory=list)
    errors: list[dict[str, str]] = Field(default_factory=list)


class BarcodeLookupOut(ProductOut):
    matched_barcode_id: Optional[str] = None
    matched_variant_id: Optional[str] = None
    matched_variant: Optional[ProductVariantOut] = None


class ReorderIn(BaseModel):
    product_id: str
    store_id: Optional[str] = None
    supplier_id: Optional[str] = None
    qty: float
    unit_cost: Optional[float] = None
    expected_date: Optional[str] = None
    remarks: Optional[str] = None
