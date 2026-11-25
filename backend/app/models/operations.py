"""Purchase receive/return, sales return/refund/exchange, supplier payments."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel

from app.models.base import TimestampMixin, new_uuid, utcnow


class PurchaseReceive(TimestampMixin, table=True):
    __tablename__ = "purchase_receive"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    purchase_id: str = Field(foreign_key="purchase_invoice.id", index=True)
    receive_no: str = Field(index=True)
    store_id: Optional[str] = Field(default=None, foreign_key="store.id")
    warehouse_id: Optional[str] = Field(default=None, foreign_key="warehouse.id")
    received_at: datetime = Field(default_factory=utcnow)
    received_by: Optional[str] = None
    remarks: Optional[str] = None


class PurchaseReceiveLine(TimestampMixin, table=True):
    __tablename__ = "purchase_receive_line"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    receive_id: str = Field(foreign_key="purchase_receive.id", index=True)
    purchase_line_id: str = Field(foreign_key="purchase_invoice_line.id", index=True)
    product_id: str = Field(foreign_key="product.id")
    variant_id: Optional[str] = None
    batch_id: Optional[str] = None
    serial_no: Optional[str] = None
    qty: float = 0
    unit_cost: float = 0


class PurchaseReturn(TimestampMixin, table=True):
    __tablename__ = "purchase_return"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    purchase_id: str = Field(foreign_key="purchase_invoice.id", index=True)
    return_no: str = Field(index=True)
    supplier_id: Optional[str] = Field(default=None, foreign_key="supplier.id")
    store_id: Optional[str] = Field(default=None, foreign_key="store.id")
    warehouse_id: Optional[str] = Field(default=None, foreign_key="warehouse.id")
    total_amount: float = 0
    reason: Optional[str] = None
    returned_at: datetime = Field(default_factory=utcnow)
    returned_by: Optional[str] = None


class PurchaseReturnLine(TimestampMixin, table=True):
    __tablename__ = "purchase_return_line"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    return_id: str = Field(foreign_key="purchase_return.id", index=True)
    purchase_line_id: Optional[str] = Field(default=None, foreign_key="purchase_invoice_line.id")
    product_id: str = Field(foreign_key="product.id")
    qty: float = 0
    unit_cost: float = 0
    line_total: float = 0


class SupplierBalance(SQLModel, table=True):
    __tablename__ = "supplier_balance"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    supplier_id: str = Field(foreign_key="supplier.id", index=True)
    outstanding: float = 0
    updated_at: datetime = Field(default_factory=utcnow)


class SupplierPayment(TimestampMixin, table=True):
    __tablename__ = "supplier_payment"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    supplier_id: str = Field(foreign_key="supplier.id", index=True)
    purchase_id: Optional[str] = Field(default=None, foreign_key="purchase_invoice.id")
    supplier_invoice_id: Optional[str] = Field(default=None, foreign_key="supplier_invoice.id")
    amount: float = 0
    method: str = "bank"
    reference: Optional[str] = None
    paid_at: datetime = Field(default_factory=utcnow)
    paid_by: Optional[str] = None


class SupplierInvoice(TimestampMixin, table=True):
    __tablename__ = "supplier_invoice"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    supplier_id: str = Field(foreign_key="supplier.id", index=True)
    purchase_id: str = Field(foreign_key="purchase_invoice.id", index=True)
    receive_id: Optional[str] = Field(default=None, foreign_key="purchase_receive.id")
    invoice_no: str = Field(index=True)
    invoice_date: datetime = Field(default_factory=utcnow)
    status: str = "DRAFT"  # DRAFT, APPROVED, PAID, CANCELLED
    match_status: str = "pending"  # pending, po_matched, grn_matched, variance
    subtotal: float = 0
    tax_amount: float = 0
    total: float = 0
    paid_amount: float = 0
    due_amount: float = 0
    remarks: Optional[str] = None
    created_by: Optional[str] = None


class SupplierInvoiceLine(TimestampMixin, table=True):
    __tablename__ = "supplier_invoice_line"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    supplier_invoice_id: str = Field(foreign_key="supplier_invoice.id", index=True)
    purchase_line_id: str = Field(foreign_key="purchase_invoice_line.id", index=True)
    product_id: str = Field(foreign_key="product.id")
    qty: float = 0
    unit_cost: float = 0
    line_total: float = 0


class SalesReturn(TimestampMixin, table=True):
    __tablename__ = "sales_return"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    invoice_id: str = Field(foreign_key="sales_invoice.id", index=True)
    return_no: str = Field(index=True)
    industry_pack: str
    reason: Optional[str] = None
    condition: str = "saleable"
    total_amount: float = 0
    status: str = "completed"
    returned_at: datetime = Field(default_factory=utcnow)
    returned_by: Optional[str] = None
    meta_json: Optional[str] = None


class SalesReturnLine(TimestampMixin, table=True):
    __tablename__ = "sales_return_line"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    return_id: str = Field(foreign_key="sales_return.id", index=True)
    invoice_line_id: str = Field(foreign_key="sales_invoice_line.id", index=True)
    product_id: Optional[str] = Field(default=None, foreign_key="product.id")
    sku: str
    name: str
    qty: float = 0
    unit_price: float = 0
    line_total: float = 0
    condition: str = "saleable"
    meta_json: Optional[str] = None


class Refund(TimestampMixin, table=True):
    __tablename__ = "refund"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    invoice_id: str = Field(foreign_key="sales_invoice.id", index=True)
    return_id: Optional[str] = Field(default=None, foreign_key="sales_return.id")
    refund_no: str = Field(index=True)
    amount: float = 0
    method: str = "cash"
    reference: Optional[str] = None
    status: str = "completed"
    refunded_at: datetime = Field(default_factory=utcnow)
    refunded_by: Optional[str] = None


class Exchange(TimestampMixin, table=True):
    __tablename__ = "exchange"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    invoice_id: str = Field(foreign_key="sales_invoice.id", index=True)
    return_id: Optional[str] = Field(default=None, foreign_key="sales_return.id")
    exchange_no: str = Field(index=True)
    industry_pack: str = "fashion"
    price_difference: float = 0
    status: str = "completed"
    exchanged_at: datetime = Field(default_factory=utcnow)
    exchanged_by: Optional[str] = None
    meta_json: Optional[str] = None


class ExchangeLine(TimestampMixin, table=True):
    __tablename__ = "exchange_line"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    exchange_id: str = Field(foreign_key="exchange.id", index=True)
    direction: str = "out"  # out = returned item, in = new item
    product_id: Optional[str] = Field(default=None, foreign_key="product.id")
    sku: str
    name: str
    qty: float = 1
    unit_price: float = 0
    variant_id: Optional[str] = None
    meta_json: Optional[str] = None


class PaymentMethod(TimestampMixin, table=True):
    __tablename__ = "payment_method"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    code: str
    name: str
    is_active: bool = True
    linked_account_id: Optional[str] = Field(default=None, foreign_key="account.id")


class PromoCode(TimestampMixin, table=True):
    __tablename__ = "promo_code"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    code: str = Field(index=True)
    discount_type: str = "percent"  # "percent" | "fixed"
    value: float = 0
    is_active: bool = True
    min_subtotal: Optional[float] = None
    expires_at: Optional[datetime] = None


class CustomerAdvance(TimestampMixin, table=True):
    __tablename__ = "customer_advance"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    customer_id: str = Field(foreign_key="customer.id", index=True)
    amount: float = 0
    applied_amount: float = 0
    advance_date: datetime
    note: Optional[str] = None
    created_by: Optional[str] = None
