from __future__ import annotations

"""Sales, payment, receipt models."""

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel

from app.models.base import TimestampMixin, new_uuid, utcnow


class CashierShift(TimestampMixin, table=True):
    """POS cashier drawer session — open/close with cash variance."""

    __tablename__ = "cashier_shift"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    store_id: str = Field(foreign_key="store.id", index=True)
    counter_id: Optional[str] = Field(default=None, foreign_key="counter.id")
    cashier_id: str = Field(foreign_key="user_account.id", index=True)
    status: str = "open"  # open, closed
    opened_at: datetime = Field(default_factory=utcnow)
    opening_float: float = 0
    closed_at: Optional[datetime] = None
    closing_counted: Optional[float] = None
    expected_cash: Optional[float] = None
    variance: Optional[float] = None
    notes: Optional[str] = None
    closed_by: Optional[str] = Field(default=None, foreign_key="user_account.id")


class SalesInvoice(TimestampMixin, table=True):
    __tablename__ = "sales_invoice"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    store_id: str = Field(foreign_key="store.id", index=True)
    counter_id: Optional[str] = Field(default=None, foreign_key="counter.id")
    invoice_number: str = Field(index=True)
    client_transaction_id: Optional[str] = Field(default=None, index=True, unique=True)
    customer_id: Optional[str] = Field(default=None, foreign_key="customer.id")
    industry_pack: str = Field(index=True)
    status: str = "completed"  # held, completed, returned, voided
    subtotal: float = 0
    discount: float = 0
    tax: float = 0
    total: float = 0
    paid_amount: float = 0
    due_amount: float = 0
    tender: str = "cash"
    price_mode: Optional[str] = None
    campaign_name: Optional[str] = None
    cashier_id: Optional[str] = Field(default=None, foreign_key="user_account.id")
    shift_id: Optional[str] = Field(default=None, foreign_key="cashier_shift.id", index=True)
    completed_at: Optional[datetime] = None
    meta_json: Optional[str] = None


class SalesInvoiceLine(TimestampMixin, table=True):
    __tablename__ = "sales_invoice_line"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    invoice_id: str = Field(foreign_key="sales_invoice.id", index=True)
    product_id: Optional[str] = Field(default=None, foreign_key="product.id")
    sku: str
    name: str
    qty: float = 1
    unit_price: float = 0
    line_total: float = 0
    meta_json: Optional[str] = None


class Payment(TimestampMixin, table=True):
    __tablename__ = "payment"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    invoice_id: Optional[str] = Field(default=None, foreign_key="sales_invoice.id", index=True)
    payment_type: str = "sale"  # sale, refund, supplier
    direction: str = "in"  # in, out
    supplier_id: Optional[str] = Field(default=None, foreign_key="supplier.id")
    customer_id: Optional[str] = Field(default=None, foreign_key="customer.id")
    return_id: Optional[str] = None
    store_id: Optional[str] = Field(default=None, foreign_key="store.id")
    counter_id: Optional[str] = Field(default=None, foreign_key="counter.id")
    cashier_id: Optional[str] = Field(default=None, foreign_key="user_account.id")
    method: str = "cash"
    amount: float = 0
    reference: Optional[str] = None
    status: str = "completed"


class Receipt(TimestampMixin, table=True):
    __tablename__ = "receipt"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    invoice_id: str = Field(foreign_key="sales_invoice.id", index=True)
    template_id: Optional[str] = Field(default=None, foreign_key="receipt_template.id")
    content_json: Optional[str] = None


class PurchaseInvoice(TimestampMixin, table=True):
    __tablename__ = "purchase_invoice"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    store_id: Optional[str] = Field(default=None, foreign_key="store.id")
    warehouse_id: Optional[str] = Field(default=None, foreign_key="warehouse.id")
    supplier_id: Optional[str] = Field(default=None, foreign_key="supplier.id")
    invoice_number: str = Field(index=True)
    purchase_date: datetime = Field(default_factory=utcnow)
    expected_date: Optional[datetime] = None
    reference_no: Optional[str] = None
    status: str = "DRAFT"  # DRAFT, APPROVED, PARTIALLY_RECEIVED, RECEIVED, CANCELLED
    subtotal: float = 0
    discount_amount: float = 0
    tax_amount: float = 0
    total: float = 0
    paid_amount: float = 0
    due_amount: float = 0
    remarks: Optional[str] = None
    created_by: Optional[str] = Field(default=None, foreign_key="user_account.id")


class PurchaseInvoiceLine(TimestampMixin, table=True):
    __tablename__ = "purchase_invoice_line"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    purchase_id: str = Field(foreign_key="purchase_invoice.id", index=True)
    product_id: str = Field(foreign_key="product.id")
    variant_id: Optional[str] = None
    batch_id: Optional[str] = None
    batch_no: Optional[str] = None
    expiry_date: Optional[datetime] = None
    serial_no: Optional[str] = None
    qty: float = 1
    received_qty: float = 0
    unit_cost: float = 0
    discount_amount: float = 0
    tax_amount: float = 0
    line_total: float = 0


class SyncLog(SQLModel, table=True):
    __tablename__ = "sync_log"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    client_transaction_id: str = Field(index=True)
    invoice_id: Optional[str] = None
    status: str = "synced"
    detail_json: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)
