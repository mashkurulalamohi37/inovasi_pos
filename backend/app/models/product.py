from __future__ import annotations

"""Product master models."""

from typing import Optional

from sqlmodel import Field, SQLModel, UniqueConstraint

from app.models.base import TimestampMixin, new_uuid


class ProductCategory(TimestampMixin, table=True):
    __tablename__ = "product_category"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    code: str
    name: str
    parent_id: Optional[str] = None
    industry_pack: Optional[str] = Field(default=None, index=True)
    is_active: bool = True


class BrandMaster(TimestampMixin, table=True):
    __tablename__ = "brand_master"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    code: str
    name: str
    industry_pack: Optional[str] = Field(default=None, index=True)
    is_active: bool = True


class Unit(TimestampMixin, table=True):
    __tablename__ = "unit"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    code: str
    name: str
    is_active: bool = True


class Product(TimestampMixin, table=True):
    __tablename__ = "product"
    __table_args__ = (
        UniqueConstraint("company_id", "sku", name="uq_product_company_sku"),
        UniqueConstraint("company_id", "barcode", name="uq_product_company_barcode"),
    )
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    sku: str = Field(index=True)
    barcode: Optional[str] = Field(default=None, index=True)
    name: str
    category_id: Optional[str] = Field(default=None, foreign_key="product_category.id")
    brand_id: Optional[str] = Field(default=None, foreign_key="brand_master.id")
    unit_id: Optional[str] = Field(default=None, foreign_key="unit.id")
    industry_pack: str = Field(index=True)
    base_price: float = 0
    wholesale_price: Optional[float] = None
    cost_price: Optional[float] = None
    is_active: bool = True
    meta_json: Optional[str] = None


class ProductVariant(TimestampMixin, table=True):
    __tablename__ = "product_variant"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    variant_code: str
    size: Optional[str] = None
    color: Optional[str] = None
    style: Optional[str] = None
    model: Optional[str] = None
    attributes_json: Optional[str] = None
    barcode: Optional[str] = Field(default=None, index=True)
    is_active: bool = True


class ProductBarcode(TimestampMixin, table=True):
    __tablename__ = "product_barcode"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    variant_id: Optional[str] = Field(default=None, foreign_key="product_variant.id")
    uom_id: Optional[str] = Field(default=None, foreign_key="unit.id", index=True)
    packaging_qty: Optional[float] = None
    barcode: str = Field(index=True)
    barcode_type: str = "EAN13"
    is_primary: bool = False
    is_active: bool = True
    created_by: Optional[str] = Field(default=None, foreign_key="user_account.id")


class ProductUomConversion(TimestampMixin, table=True):
    """Product-specific alternate UOM → canonical base UOM conversion.

    base_qty = entered_qty × conversion_factor
    """

    __tablename__ = "product_uom_conversion"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    variant_id: Optional[str] = Field(default=None, foreign_key="product_variant.id", index=True)
    from_uom_id: str = Field(foreign_key="unit.id", index=True)
    to_uom_id: str = Field(foreign_key="unit.id", index=True)  # typically base UOM
    conversion_factor: float = 1.0
    barcode_id: Optional[str] = Field(default=None, foreign_key="product_barcode.id")
    purchase_enabled: bool = True
    sales_enabled: bool = True
    is_default: bool = False
    is_active: bool = True


class Customer(TimestampMixin, table=True):
    __tablename__ = "customer"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    code: str
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    customer_group: Optional[str] = Field(default=None, index=True)  # retail|contractor|dealer|wholesale
    customer_type: Optional[str] = Field(default="general", index=True)  # employee|friends|family|general
    credit_limit: Optional[float] = None
    is_active: bool = True
    preferred_size: Optional[str] = None
    loyalty_points: float = 0
    custom_discount_pct: Optional[float] = None


class CustomerBalance(TimestampMixin, table=True):
    __tablename__ = "customer_balance"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    customer_id: str = Field(foreign_key="customer.id", index=True)
    outstanding: float = 0


class CustomerLoyaltyLedger(TimestampMixin, table=True):
    """Audit trail for loyalty point earn/redeem — Customer.loyalty_points is the
    running balance; this is append-only history for support/dispute review."""

    __tablename__ = "customer_loyalty_ledger"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    customer_id: str = Field(foreign_key="customer.id", index=True)
    delta: float  # positive = earned, negative = redeemed
    reason: str  # "earn_sale" | "redeem" | "adjust"
    reference_type: Optional[str] = None
    reference_id: Optional[str] = None
    created_by: Optional[str] = Field(default=None, foreign_key="user_account.id")


class Supplier(TimestampMixin, table=True):
    __tablename__ = "supplier"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    code: str
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    contact_person: Optional[str] = None
    address: Optional[str] = None
    is_active: bool = True


class TimePricingRule(TimestampMixin, table=True):
    """Dynamic time-based markdown / happy hour pricing rules for perishable goods (pastry, bakery, deli)."""

    __tablename__ = "time_pricing_rule"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    name: str
    discount_type: str = "half_price"  # half_price | percent | fixed_discount | override_price
    discount_value: float = 50.0
    start_time: str = "20:00"  # "HH:MM"
    end_time: str = "23:59"  # "HH:MM"
    days_of_week_json: Optional[str] = "[0,1,2,3,4,5,6]"  # JSON list of days
    category_ids_json: Optional[str] = "[]"  # JSON list of category IDs or names
    product_ids_json: Optional[str] = "[]"  # JSON list of specific product IDs
    industry_pack: Optional[str] = "all"
    badge_label: Optional[str] = "⚡ 50% Fresh Clearance"
    description: Optional[str] = None
    is_active: bool = True

