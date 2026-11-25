from __future__ import annotations

"""Inventory models."""

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel

from app.models.base import TimestampMixin, new_uuid, utcnow


class StockLedger(TimestampMixin, table=True):
    __tablename__ = "stock_ledger"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    store_id: Optional[str] = Field(default=None, foreign_key="store.id")
    warehouse_id: Optional[str] = Field(default=None, foreign_key="warehouse.id")
    variant_id: Optional[str] = None
    batch_id: Optional[str] = None
    serial_id: Optional[str] = None
    transaction_type: str = "adjustment"
    transaction_ref: Optional[str] = None
    in_qty: float = 0
    out_qty: float = 0
    qty_delta: float = 0
    balance_after: float = 0
    unit_cost: float = 0
    total_cost: float = 0
    reference_type: str = "adjustment"
    reference_id: Optional[str] = None
    note: Optional[str] = None
    created_by: Optional[str] = None


class StockAdjustment(TimestampMixin, table=True):
    __tablename__ = "stock_adjustment"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    store_id: Optional[str] = Field(default=None, foreign_key="store.id")
    warehouse_id: Optional[str] = Field(default=None, foreign_key="warehouse.id")
    qty_before: float = 0
    qty_after: float = 0
    reason: str
    adjusted_by: Optional[str] = None


class StockTransfer(TimestampMixin, table=True):
    __tablename__ = "stock_transfer"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    from_store_id: Optional[str] = Field(default=None, foreign_key="store.id")
    to_store_id: Optional[str] = Field(default=None, foreign_key="store.id")
    from_warehouse_id: Optional[str] = Field(default=None, foreign_key="warehouse.id")
    to_warehouse_id: Optional[str] = Field(default=None, foreign_key="warehouse.id")
    qty: float = 0
    reason: str = "transfer"
    transferred_by: Optional[str] = None
    # "completed" (default — matches the original atomic transfer_stock behavior,
    # both legs post immediately) | "in_transit" (dispatched via dispatch_transfer,
    # sits in the destination's qty_in_transit bucket until receive_transfer runs)
    status: str = "completed"
    received_at: Optional[datetime] = None
    received_by: Optional[str] = None


class StockBalance(SQLModel, table=True):
    __tablename__ = "stock_balance"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    store_id: Optional[str] = Field(default=None, foreign_key="store.id")
    warehouse_id: Optional[str] = Field(default=None, foreign_key="warehouse.id")
    qty_on_hand: float = 0
    qty_reserved: float = 0
    unit_cost_avg: float = 0
    # Physically present but not sellable — pending inspection/write-off.
    qty_damaged: float = 0
    # Dispatched from another location via dispatch_transfer but not yet
    # receive_transfer'd — not sellable here yet, but visible as "incoming".
    qty_in_transit: float = 0


class StockReservation(TimestampMixin, table=True):
    __tablename__ = "stock_reservation"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    store_id: Optional[str] = Field(default=None, foreign_key="store.id")
    warehouse_id: Optional[str] = Field(default=None, foreign_key="warehouse.id")
    variant_id: Optional[str] = None
    batch_id: Optional[str] = None
    serial_id: Optional[str] = None
    qty: float = 0
    status: str = "active"  # active, released, consumed, expired
    reference_type: str = "cart"
    reference_id: Optional[str] = None
    expires_at: Optional[datetime] = None
    created_by: Optional[str] = None


class OpeningStockDocument(TimestampMixin, table=True):
    __tablename__ = "opening_stock_document"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    store_id: Optional[str] = Field(default=None, foreign_key="store.id")
    warehouse_id: Optional[str] = Field(default=None, foreign_key="warehouse.id")
    os_number: str = Field(index=True)
    status: str = Field(default="DRAFT", index=True)  # DRAFT, POSTED, CANCELLED
    total_amount: float = 0
    note: Optional[str] = None
    created_by: Optional[str] = None
    posted_by: Optional[str] = None
    posted_at: Optional[datetime] = None


class OpeningStockDocumentLine(TimestampMixin, table=True):
    __tablename__ = "opening_stock_document_line"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    document_id: str = Field(foreign_key="opening_stock_document.id", index=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    variant_id: Optional[str] = None
    qty: float = 0
    unit_cost: float = 0
    line_total: float = 0
    batch_no: Optional[str] = None
    lot_no: Optional[str] = None
    expiry_date: Optional[datetime] = None
    manufacture_date: Optional[datetime] = None
    serials_json: Optional[str] = None  # json.dumps(list[str]) when serial-tracked
