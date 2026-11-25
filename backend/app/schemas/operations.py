from typing import Any, Optional

from pydantic import BaseModel


class PurchaseLineIn(BaseModel):
    product_id: str
    variant_id: Optional[str] = None
    batch_id: Optional[str] = None
    serial_no: Optional[str] = None
    batch_no: Optional[str] = None
    expiry_date: Optional[str] = None
    qty: float = 1
    unit_cost: float = 0
    discount_amount: float = 0
    tax_amount: float = 0
    line_total: Optional[float] = None


class PurchaseCreate(BaseModel):
    supplier_id: Optional[str] = None
    store_id: Optional[str] = None
    warehouse_id: Optional[str] = None
    remarks: Optional[str] = None
    expected_date: Optional[str] = None
    reference_no: Optional[str] = None
    discount_amount: float = 0
    tax_amount: float = 0
    lines: list[PurchaseLineIn]


class PurchaseUpdate(BaseModel):
    supplier_id: Optional[str] = None
    store_id: Optional[str] = None
    warehouse_id: Optional[str] = None
    remarks: Optional[str] = None
    expected_date: Optional[str] = None
    reference_no: Optional[str] = None
    discount_amount: Optional[float] = None
    tax_amount: Optional[float] = None
    lines: Optional[list[PurchaseLineIn]] = None


class ReceiveSerialIn(BaseModel):
    serial_no: str
    imei_no: Optional[str] = None
    imei_1: Optional[str] = None
    imei_2: Optional[str] = None
    condition: Optional[str] = None
    variant_id: Optional[str] = None
    udi_code: Optional[str] = None
    batch_no: Optional[str] = None
    lot_no: Optional[str] = None
    expiry_date: Optional[str] = None
    manufacture_date: Optional[str] = None
    sterile_status: Optional[str] = None


class ReceiveJewelryItemIn(BaseModel):
    certificate_no: Optional[str] = None
    cert_no: Optional[str] = None
    tag_no: Optional[str] = None
    barcode: Optional[str] = None
    gross_weight: Optional[float] = None
    stone_weight: Optional[float] = None
    net_metal_weight: Optional[float] = None
    purity: Optional[str] = None
    metal_type: Optional[str] = None


class ReceiveLineIn(BaseModel):
    purchase_line_id: Optional[str] = None
    line_id: Optional[str] = None
    qty: float
    purchase_uom_id: Optional[str] = None
    uom_id: Optional[str] = None
    batch_no: Optional[str] = None
    expiry_date: Optional[str] = None
    variant_id: Optional[str] = None
    batch_id: Optional[str] = None
    serial_no: Optional[str] = None
    serials: Optional[list[ReceiveSerialIn]] = None
    certificate_no: Optional[str] = None
    tag_no: Optional[str] = None
    barcode: Optional[str] = None
    gross_weight: Optional[float] = None
    stone_weight: Optional[float] = None
    net_metal_weight: Optional[float] = None
    purity: Optional[str] = None
    metal_type: Optional[str] = None
    jewelry_items: Optional[list[ReceiveJewelryItemIn]] = None
    lot_no: Optional[str] = None
    udi_code: Optional[str] = None
    manufacture_date: Optional[str] = None
    sterile_status: Optional[str] = None
    sterilization_method: Optional[str] = None
    manufacturer_name: Optional[str] = None


class PurchaseReceiveIn(BaseModel):
    store_id: Optional[str] = None
    warehouse_id: Optional[str] = None
    remarks: Optional[str] = None
    lines: Optional[list[ReceiveLineIn]] = None
    # Optional at-GRN payment: records a partial/full payment against the supplier payable
    payment_amount: Optional[float] = None
    payment_method: Optional[str] = None  # e.g. "cash", "bank", "mobile"
    payment_reference: Optional[str] = None


class DirectPurchaseLineIn(BaseModel):
    """One-step purchase line: creates the PO line and posts the same qty on GRN."""

    product_id: str
    variant_id: Optional[str] = None
    batch_id: Optional[str] = None
    serial_no: Optional[str] = None
    qty: float = 1
    unit_cost: float = 0
    discount_amount: float = 0
    tax_amount: float = 0
    line_total: Optional[float] = None
    # Receive / GRN metadata (applied immediately)
    batch_no: Optional[str] = None
    expiry_date: Optional[str] = None
    serials: Optional[list[ReceiveSerialIn]] = None
    certificate_no: Optional[str] = None
    tag_no: Optional[str] = None
    barcode: Optional[str] = None
    gross_weight: Optional[float] = None
    stone_weight: Optional[float] = None
    net_metal_weight: Optional[float] = None
    purity: Optional[str] = None
    metal_type: Optional[str] = None
    jewelry_items: Optional[list[ReceiveJewelryItemIn]] = None
    lot_no: Optional[str] = None
    udi_code: Optional[str] = None
    manufacture_date: Optional[str] = None
    sterile_status: Optional[str] = None
    sterilization_method: Optional[str] = None
    manufacturer_name: Optional[str] = None
    purchase_uom_id: Optional[str] = None
    uom_id: Optional[str] = None


class DirectPurchaseReceiveIn(BaseModel):
    """Atomic create → approve → full GRN receive (auto PO)."""

    supplier_id: Optional[str] = None
    store_id: Optional[str] = None
    warehouse_id: Optional[str] = None
    remarks: Optional[str] = None
    expected_date: Optional[str] = None
    reference_no: Optional[str] = None
    discount_amount: float = 0
    tax_amount: float = 0
    lines: list[DirectPurchaseLineIn]


class PurchaseReturnLineIn(BaseModel):
    product_id: str
    purchase_line_id: Optional[str] = None
    qty: float
    unit_cost: float = 0


class PurchaseReturnIn(BaseModel):
    reason: Optional[str] = None
    lines: list[PurchaseReturnLineIn]


class SupplierCreate(BaseModel):
    code: str
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    contact_person: Optional[str] = None
    address: Optional[str] = None


class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    contact_person: Optional[str] = None
    address: Optional[str] = None
    is_active: Optional[bool] = None


class SupplierPaymentIn(BaseModel):
    supplier_id: str
    purchase_id: Optional[str] = None
    supplier_invoice_id: Optional[str] = None
    amount: float
    method: str = "bank"
    reference: Optional[str] = None


class ReturnLineIn(BaseModel):
    invoice_line_id: Optional[str] = None
    line_id: Optional[str] = None
    qty: float
    condition: Optional[str] = None
    meta: dict[str, Any] = {}


class SalesReturnIn(BaseModel):
    reason: Optional[str] = None
    condition: str = "saleable"
    lines: list[ReturnLineIn]
    meta: dict[str, Any] = {}


class RefundIn(BaseModel):
    amount: float
    method: str = "cash"
    reference: Optional[str] = None
    return_id: Optional[str] = None


class VoidIn(BaseModel):
    reason: str


class ExchangeIn(BaseModel):
    return_lines: list[ReturnLineIn] = []
    lines: list[ReturnLineIn] = []
    new_lines: list[dict[str, Any]] = []
    reason: Optional[str] = None
    condition: str = "saleable"
    price_difference: float = 0
    meta: dict[str, Any] = {}


class StockTransferIn(BaseModel):
    product_id: str
    from_store_id: Optional[str] = None
    to_store_id: Optional[str] = None
    from_warehouse_id: Optional[str] = None
    to_warehouse_id: Optional[str] = None
    qty: float
    reason: str = "transfer"


class StockDamageIn(BaseModel):
    product_id: str
    store_id: Optional[str] = None
    warehouse_id: Optional[str] = None
    qty: float
    reason: str
    variant_id: Optional[str] = None
    batch_id: Optional[str] = None
    serial_no: Optional[str] = None


class StockDamageRestoreIn(BaseModel):
    product_id: str
    store_id: Optional[str] = None
    warehouse_id: Optional[str] = None
    qty: float
    variant_id: Optional[str] = None


class StockDamageWriteoffIn(BaseModel):
    product_id: str
    store_id: Optional[str] = None
    warehouse_id: Optional[str] = None
    qty: float
    reason: str


class StockTransferDispatchIn(BaseModel):
    product_id: str
    from_store_id: Optional[str] = None
    to_store_id: Optional[str] = None
    from_warehouse_id: Optional[str] = None
    to_warehouse_id: Optional[str] = None
    qty: float
    reason: str = "transfer"


class PaymentMethodIn(BaseModel):
    code: str
    name: str
    is_active: bool = True
    linked_account_id: Optional[str] = None


class PromoCodeIn(BaseModel):
    code: str
    discount_type: str = "percent"
    value: float = 0
    is_active: bool = True
    min_subtotal: Optional[float] = None
    expires_at: Optional[str] = None


class PromoCodeValidateIn(BaseModel):
    code: str
    subtotal: float = 0


class CustomerAdvanceIn(BaseModel):
    customer_id: str
    amount: float
    advance_date: Optional[str] = None
    note: Optional[str] = None


class CustomerAdvanceApplyIn(BaseModel):
    amount: float
