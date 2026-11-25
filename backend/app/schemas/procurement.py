from typing import Optional

from pydantic import BaseModel


class SupplierInvoiceLineIn(BaseModel):
    purchase_line_id: str
    qty: float
    unit_cost: float


class SupplierInvoiceCreate(BaseModel):
    invoice_no: str
    receive_id: Optional[str] = None
    tax_amount: float = 0
    remarks: Optional[str] = None
    lines: list[SupplierInvoiceLineIn]


class SupplierInvoiceOut(BaseModel):
    id: str
    invoice_no: str
    purchase_id: str
    supplier_id: str
    receive_id: Optional[str]
    status: str
    match_status: str
    subtotal: float
    tax_amount: float
    total: float
    paid_amount: float
    due_amount: float
    remarks: Optional[str] = None
