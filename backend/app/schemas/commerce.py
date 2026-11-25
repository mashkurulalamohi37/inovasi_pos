from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator


def _parse_loose_datetime(v: Any) -> Optional[datetime]:
    if not v:
        return None
    if isinstance(v, datetime):
        return v
    import re
    from datetime import date, timezone
    text = str(v).strip()
    if not text:
        return None
    try:
        d = date.fromisoformat(text[:10])
        return datetime(d.year, d.month, d.day, 23, 59, 59, tzinfo=timezone.utc)
    except Exception:
        pass
    m = re.match(r"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$", text)
    if m:
        p1, p2, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= p2 <= 12:
            try:
                return datetime(year, p2, p1, 23, 59, 59, tzinfo=timezone.utc)
            except ValueError:
                pass
        if 1 <= p1 <= 12:
            try:
                return datetime(year, p1, p2, 23, 59, 59, tzinfo=timezone.utc)
            except ValueError:
                pass
    return None

from app.schemas.common import Money, OptionalMoney, PositiveQty


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


class ProductCreate(BaseModel):
    sku: Optional[str] = None
    barcode: Optional[str] = None
    name: str
    industry_pack: str
    base_price: Money = 0
    wholesale_price: OptionalMoney = None
    cost_price: OptionalMoney = None
    category_id: Optional[str] = None
    brand_id: Optional[str] = None
    unit_id: Optional[str] = None
    meta: dict[str, Any] = {}


class ProductUpdate(BaseModel):
    sku: Optional[str] = None
    name: Optional[str] = None
    barcode: Optional[str] = None
    base_price: OptionalMoney = None
    wholesale_price: OptionalMoney = None
    cost_price: OptionalMoney = None
    is_active: Optional[bool] = None
    category_id: Optional[str] = None
    brand_id: Optional[str] = None
    unit_id: Optional[str] = None
    meta: Optional[dict[str, Any]] = None


class ProductDeleteIn(BaseModel):
    password: str


class SaleLineIn(BaseModel):
    sku: str
    name: str
    # Strictly positive: a sale line is never a giveaway or a disguised refund.
    # Returns and refunds go through /sales/{id}/return and /sales/{id}/refund,
    # which enforce the approval workflow and link back to the original invoice.
    qty: PositiveQty = 1
    unit_price: Money
    product_id: Optional[str] = None
    meta: dict[str, Any] = {}
    reservation_id: Optional[str] = None


class PaymentLineIn(BaseModel):
    method: str
    amount: Money
    reference: Optional[str] = None


class SaleCreate(BaseModel):
    client_transaction_id: str
    industry_pack: str
    # At least one line: an empty sale used to mint a real invoice number and a
    # zero-value row in the ledger.
    lines: list[SaleLineIn] = Field(min_length=1)
    subtotal: Money
    discount: Money = 0
    tax: Money = 0
    total: Money
    tender: str = "cash"
    payments: Optional[list[PaymentLineIn]] = None
    reservation_ids: Optional[list[str]] = None
    price_mode: Optional[str] = None
    campaign_name: Optional[str] = None
    customer_name: Optional[str] = None
    customer_id: Optional[str] = None
    status: str = "completed"
    store_id: Optional[str] = None
    counter_id: Optional[str] = None
    device_id: Optional[str] = None
    industry_meta: Optional[dict[str, Any]] = None
    loyalty_redeem_points: OptionalMoney = None


class CustomerCreate(BaseModel):
    code: str
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    credit_limit: Optional[float] = None
    customer_group: Optional[str] = None
    customer_type: Optional[str] = "general"
    custom_discount_pct: Optional[float] = None
    preferred_size: Optional[str] = None


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    credit_limit: Optional[float] = None
    customer_group: Optional[str] = None
    customer_type: Optional[str] = None
    custom_discount_pct: Optional[float] = None
    is_active: Optional[bool] = None
    preferred_size: Optional[str] = None


class DueCollectionIn(BaseModel):
    customer_id: str
    amount: float
    invoice_id: Optional[str] = None
    method: str = "cash"
    reference: Optional[str] = None
    store_id: Optional[str] = None


class HeldSaleCompleteIn(BaseModel):
    payments: Optional[list[PaymentLineIn]] = None
    tender: str = "cash"


class SaleOut(BaseModel):
    id: str
    invoice_number: str
    client_transaction_id: Optional[str]
    total: float
    status: str
    industry_pack: str
    duplicate: bool = False


class StockOut(BaseModel):
    product_id: str
    sku: str
    name: str
    store_id: Optional[str]
    warehouse_id: Optional[str]
    qty_on_hand: float


class StockAdjustmentIn(BaseModel):
    product_id: str
    store_id: Optional[str] = None
    warehouse_id: Optional[str] = None
    qty_after: float
    reason: str


class OpeningStockLineIn(BaseModel):
    product_id: str
    variant_id: Optional[str] = None
    qty: float
    unit_cost: float = 0.0
    batch_no: Optional[str] = None
    lot_no: Optional[str] = None
    expiry_date: Optional[datetime] = None
    manufacture_date: Optional[datetime] = None
    serials: Optional[list[str]] = None

    @field_validator("expiry_date", "manufacture_date", mode="before")
    @classmethod
    def parse_optional_datetime(cls, v: Any) -> Optional[datetime]:
        return _parse_loose_datetime(v)


class OpeningStockDocumentIn(BaseModel):
    store_id: Optional[str] = None
    warehouse_id: Optional[str] = None
    note: Optional[str] = None
    lines: list[OpeningStockLineIn]


class ClearOpeningStockIn(BaseModel):
    store_id: Optional[str] = None
    password: str



class OpeningStockIn(BaseModel):
    product_id: str
    store_id: Optional[str] = None
    warehouse_id: Optional[str] = None
    qty: float
    unit_cost: float = 0.0
    variant_id: Optional[str] = None
    note: Optional[str] = None
    batch_no: Optional[str] = None
    lot_no: Optional[str] = None
    expiry_date: Optional[datetime] = None
    manufacture_date: Optional[datetime] = None
    serials: Optional[list[str]] = None

    @field_validator("expiry_date", "manufacture_date", mode="before")
    @classmethod
    def parse_optional_datetime(cls, v: Any) -> Optional[datetime]:
        return _parse_loose_datetime(v)


class TimePricingRuleOut(BaseModel):
    id: str
    name: str
    discount_type: str
    discount_value: float
    start_time: str
    end_time: str
    days_of_week: list[int] = []
    category_ids: list[str] = []
    product_ids: list[str] = []
    industry_pack: Optional[str] = "all"
    badge_label: Optional[str] = "⚡ 50% Fresh Clearance"
    description: Optional[str] = None
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class TimePricingRuleCreate(BaseModel):
    name: str
    discount_type: str = "half_price"
    discount_value: float = 50.0
    start_time: str = "20:00"
    end_time: str = "23:59"
    days_of_week: list[int] = [0, 1, 2, 3, 4, 5, 6]
    category_ids: list[str] = []
    product_ids: list[str] = []
    industry_pack: Optional[str] = "all"
    badge_label: Optional[str] = "⚡ 50% Fresh Clearance"
    description: Optional[str] = None
    is_active: bool = True


class TimePricingRuleUpdate(BaseModel):
    name: Optional[str] = None
    discount_type: Optional[str] = None
    discount_value: Optional[float] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    days_of_week: Optional[list[int]] = None
    category_ids: Optional[list[str]] = None
    product_ids: Optional[list[str]] = None
    industry_pack: Optional[str] = None
    badge_label: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


