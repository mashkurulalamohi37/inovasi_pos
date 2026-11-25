from typing import Optional

from pydantic import BaseModel, Field


class StockPolicyOut(BaseModel):
    store_id: str
    allow_negative_stock: bool = False
    cost_method: str = "moving_average"


class StockPolicyUpdate(BaseModel):
    store_id: str
    allow_negative_stock: Optional[bool] = None
    cost_method: Optional[str] = None


class ReservationCreate(BaseModel):
    product_id: str
    qty: float = Field(gt=0)
    store_id: Optional[str] = None
    warehouse_id: Optional[str] = None
    variant_id: Optional[str] = None
    batch_id: Optional[str] = None
    serial_id: Optional[str] = None
    reference_type: str = "cart"
    reference_id: Optional[str] = None
    expires_minutes: int = 30


class ReservationOut(BaseModel):
    id: str
    product_id: str
    store_id: Optional[str]
    warehouse_id: Optional[str]
    qty: float
    status: str
    reference_type: str
    reference_id: Optional[str]
    expires_at: Optional[str] = None


class StockBalanceOut(BaseModel):
    product_id: str
    sku: str
    name: str
    store_id: Optional[str]
    warehouse_id: Optional[str]
    qty_on_hand: float
    qty_reserved: float
    qty_available: float
    unit_cost_avg: float = 0
