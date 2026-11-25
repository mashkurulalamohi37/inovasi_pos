from __future__ import annotations

"""Industry-specific pack models."""

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel

from app.models.base import TimestampMixin, new_uuid, utcnow


# --- Beef Shop ---
class BeefCutType(TimestampMixin, table=True):
    __tablename__ = "beef_cut_type"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    code: str
    name: str


class ButcherMaster(TimestampMixin, table=True):
    __tablename__ = "butcher_master"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    code: str
    name: str


class BeefBatch(TimestampMixin, table=True):
    __tablename__ = "beef_batch"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    batch_code: str = Field(index=True)
    meat_type: str
    slaughter_date: Optional[datetime] = None
    expiry_date: Optional[datetime] = None


class BeefBatchStock(TimestampMixin, table=True):
    __tablename__ = "beef_batch_stock"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    batch_id: str = Field(foreign_key="beef_batch.id", index=True)
    store_id: str = Field(foreign_key="store.id", index=True)
    qty_kg: float = 0


class BeefColdStorage(TimestampMixin, table=True):
    __tablename__ = "beef_cold_storage"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    batch_id: str = Field(foreign_key="beef_batch.id", index=True)
    location: str
    qty_kg: float = 0
    temp_c: Optional[float] = None


class BeefWastage(TimestampMixin, table=True):
    __tablename__ = "beef_wastage"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    product_id: Optional[str] = Field(default=None, foreign_key="product.id")
    batch_id: Optional[str] = Field(default=None, foreign_key="beef_batch.id")
    cut_type: Optional[str] = None
    wastage_type: str
    wastage_kg: float = 0
    reason: Optional[str] = None
    responsible_person: Optional[str] = None
    recorded_at: datetime = Field(default_factory=utcnow)


class BeefProductProfile(TimestampMixin, table=True):
    __tablename__ = "beef_product_profile"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    product_id: str = Field(foreign_key="product.id", unique=True)
    price_per_kg: float = 0
    default_cut: Optional[str] = None


class BeefSalesLineExtension(SQLModel, table=True):
    __tablename__ = "beef_sales_line_extension"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    line_id: str = Field(foreign_key="sales_invoice_line.id", index=True)
    weight_kg: float = 0
    cut_type: Optional[str] = None
    batch_id: Optional[str] = None
    butcher_id: Optional[str] = None


# --- Fashion ---
class FashionSeason(TimestampMixin, table=True):
    __tablename__ = "fashion_season"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    code: str
    name: str


class FashionOffer(TimestampMixin, table=True):
    __tablename__ = "fashion_offer"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    name: str
    season: Optional[str] = None
    department: Optional[str] = None
    discount_pct: float = 0
    is_active: bool = True
    # "percent" (flat % off, existing behavior) | "bygo" (buy_qty, get get_qty at get_discount_pct)
    offer_type: str = "percent"
    buy_qty: Optional[int] = None
    get_qty: Optional[int] = None
    get_discount_pct: Optional[float] = None
    # Stackable offers may combine with other stackable offers; a non-stackable
    # offer is exclusive of everything else applied on the same sale.
    stackable: bool = False


class FashionOfferItem(SQLModel, table=True):
    __tablename__ = "fashion_offer_item"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    offer_id: str = Field(foreign_key="fashion_offer.id", index=True)
    product_id: str = Field(foreign_key="product.id", index=True)


class FashionProductVariant(TimestampMixin, table=True):
    __tablename__ = "fashion_product_variant"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    size: str
    color: str
    sku: str
    barcode: Optional[str] = None
    stock_qty: float = 0


class FashionSalesLineExtension(SQLModel, table=True):
    __tablename__ = "fashion_sales_line_extension"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    line_id: str = Field(foreign_key="sales_invoice_line.id", index=True)
    variant_id: Optional[str] = None
    campaign_name: Optional[str] = None


class FashionAlterationRequest(TimestampMixin, table=True):
    __tablename__ = "fashion_alteration_request"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    job_no: Optional[str] = Field(default=None, index=True)
    customer_id: Optional[str] = Field(default=None, foreign_key="customer.id")
    customer_name: str
    product_id: Optional[str] = Field(default=None, foreign_key="product.id")
    product_sku: str
    variant_id: Optional[str] = None
    invoice_id: Optional[str] = Field(default=None, foreign_key="sales_invoice.id")
    instruction: Optional[str] = None
    measurement_note: Optional[str] = None
    notes: Optional[str] = None
    charge_amount: float = 0
    paid_amount: float = 0
    delivery_date: Optional[datetime] = None
    status: str = "new"


# --- Pharmacy ---
class PharmaBatch(TimestampMixin, table=True):
    __tablename__ = "pharma_batch"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    batch_no: str
    expiry_date: datetime
    qty_on_hand: float = 0


class PharmaProductProfile(TimestampMixin, table=True):
    __tablename__ = "pharma_product_profile"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    product_id: str = Field(foreign_key="product.id", unique=True)
    generic_name: Optional[str] = None
    manufacturer: Optional[str] = None
    strength: Optional[str] = None
    dosage_form: Optional[str] = None
    is_restricted: bool = False
    rx_required: bool = False


class PharmaPrescriptionRecord(TimestampMixin, table=True):
    __tablename__ = "pharma_prescription_record"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    customer_id: Optional[str] = Field(default=None, foreign_key="customer.id")
    patient_name: str
    doctor_name: Optional[str] = None
    rx_ref: Optional[str] = None
    prescription_date: Optional[datetime] = None
    notes: Optional[str] = None
    invoice_id: Optional[str] = None
    status: str = "captured"


class PharmaRestrictedMedicineLog(TimestampMixin, table=True):
    __tablename__ = "pharma_restricted_medicine_log"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    product_id: str = Field(foreign_key="product.id")
    approved_by: str
    invoice_id: Optional[str] = None


class PharmaSalesLineExtension(SQLModel, table=True):
    __tablename__ = "pharma_sales_line_extension"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    line_id: str = Field(foreign_key="sales_invoice_line.id", index=True)
    batch_id: Optional[str] = None
    fefo_applied: bool = False


# --- Restaurant ---
class RestaurantTable(TimestampMixin, table=True):
    __tablename__ = "restaurant_table"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    store_id: str = Field(foreign_key="store.id", index=True)
    table_no: str  # table_code
    table_name: Optional[str] = None
    floor_or_zone: Optional[str] = Field(default=None, index=True)
    capacity: int = 4
    status: str = Field(default="available", index=True)  # available|occupied|reserved|cleaning|disabled
    current_order_id: Optional[str] = Field(default=None, index=True)
    current_guest_count: Optional[int] = None
    occupied_since: Optional[datetime] = None
    assigned_waiter_id: Optional[str] = None
    is_active: bool = True


class RestaurantCombo(TimestampMixin, table=True):
    __tablename__ = "restaurant_combo"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    name: str
    combo_price: float = 0


class RestaurantComboItem(SQLModel, table=True):
    __tablename__ = "restaurant_combo_item"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    combo_id: str = Field(foreign_key="restaurant_combo.id", index=True)
    product_id: str = Field(foreign_key="product.id")
    item_role: str  # main, side, drink, addon


class RestaurantOrder(TimestampMixin, table=True):
    """Operational dining order — financial truth lives on SalesInvoice after bill/pay."""

    __tablename__ = "restaurant_order"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    store_id: str = Field(foreign_key="store.id", index=True)
    order_no: str = Field(index=True)
    service_mode: str = Field(default="dine_in", index=True)  # dine_in|takeaway|delivery
    table_id: Optional[str] = Field(default=None, foreign_key="restaurant_table.id", index=True)
    customer_id: Optional[str] = Field(default=None, foreign_key="customer.id")
    guest_count: int = 1
    waiter_id: Optional[str] = None
    waiter_name: Optional[str] = None
    delivery_address: Optional[str] = None
    delivery_phone: Optional[str] = None
    special_instruction: Optional[str] = None
    status: str = Field(default="open", index=True)
    # draft|open|sent_to_kitchen|partially_ready|ready|served|billed|paid|cancelled
    subtotal: float = 0
    discount: float = 0
    service_charge: float = 0
    tax: float = 0
    total: float = 0
    sales_invoice_id: Optional[str] = Field(default=None, index=True)
    created_by: Optional[str] = None
    cancelled_reason: Optional[str] = None


class RestaurantOrderLine(TimestampMixin, table=True):
    __tablename__ = "restaurant_order_line"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    order_id: str = Field(foreign_key="restaurant_order.id", index=True)
    product_id: Optional[str] = Field(default=None, foreign_key="product.id")
    sku: str = ""
    product_name: str
    qty: float = 1
    unit_price: float = 0
    modifier_price: float = 0
    line_total: float = 0
    modifiers_json: Optional[str] = None
    notes: Optional[str] = None
    kitchen_station: Optional[str] = None
    ordered_qty: float = 1
    sent_to_kitchen_qty: float = 0
    prepared_qty: float = 0
    served_qty: float = 0
    cancelled_qty: float = 0
    status: str = Field(default="pending", index=True)  # pending|sent|preparing|ready|served|cancelled
    void_reason: Optional[str] = None
    # Captured when the line is priced below list/MSP at order entry. Replayed into
    # the sale line at settlement so the pricing guard does not re-challenge a bill
    # for food that has already been cooked and served.
    price_override_reason: Optional[str] = None
    # A combo is stored as one line per component rather than a single bundled
    # line, because each component may cook at a different station and the KOT
    # router groups by line.kitchen_station. These two fields tie the components
    # back together for pricing, display and voiding.
    combo_group_id: Optional[str] = Field(default=None, index=True)
    combo_name: Optional[str] = None


class RestaurantKot(TimestampMixin, table=True):
    __tablename__ = "restaurant_kot"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    store_id: str = Field(foreign_key="store.id", index=True)
    order_id: Optional[str] = Field(default=None, foreign_key="restaurant_order.id", index=True)
    table_id: Optional[str] = Field(default=None, foreign_key="restaurant_table.id")
    service_mode: Optional[str] = None
    kitchen_station: Optional[str] = Field(default=None, index=True)
    kot_number: str
    sent_by: Optional[str] = None
    status: str = Field(default="sent", index=True)  # sent|accepted|preparing|ready|served|cancelled


class RestaurantKotLine(SQLModel, table=True):
    __tablename__ = "restaurant_kot_line"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    kot_id: str = Field(foreign_key="restaurant_kot.id", index=True)
    order_line_id: Optional[str] = Field(default=None, index=True)
    product_id: Optional[str] = None
    product_name: str
    qty: float = 1
    modifiers_json: Optional[str] = None
    notes: Optional[str] = None
    kitchen_station: Optional[str] = None
    status: str = "sent"


class RestaurantSalesLineExtension(SQLModel, table=True):
    __tablename__ = "restaurant_sales_line_extension"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    line_id: str = Field(foreign_key="sales_invoice_line.id", index=True)
    table_id: Optional[str] = None
    order_id: Optional[str] = None
    comboReady: bool = False
    combo_children_json: Optional[str] = None


# --- Jewelry ---
class JewelryGoldRate(TimestampMixin, table=True):
    __tablename__ = "jewelry_gold_rate"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    metal_type: str = Field(default="Gold", index=True)
    karat: str = Field(default="22K", index=True)
    purity: Optional[str] = None
    rate_per_gram: float = 9850  # selling rate (compat)
    buying_rate: Optional[float] = None
    selling_rate: Optional[float] = None
    currency: str = "BDT"
    unit_basis: str = "gram"
    status: str = Field(default="active", index=True)
    effective_date: datetime = Field(default_factory=utcnow, index=True)
    created_by: Optional[str] = None
    approved_by: Optional[str] = None
    override_reason: Optional[str] = None
    previous_rate: Optional[float] = None


class JewelryProductProfile(TimestampMixin, table=True):
    __tablename__ = "jewelry_product_profile"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    metal_type: str = "Gold"
    purity: str = "22K"
    karat: str = "22K"
    gross_weight: float = 0
    stone_weight: float = 0
    other_non_metal_weight: float = 0
    net_metal_weight: float = 0
    fine_weight: Optional[float] = None
    making_charge_type: str = "per_gram"  # fixed | per_gram | percent
    making_charge_rate: float = 0
    making_charge_amount: float = 0
    wastage_percentage: float = 0
    default_stone_value: float = 0
    certificate_required: bool = False
    tag_no: Optional[str] = Field(default=None, index=True)
    barcode: Optional[str] = Field(default=None, index=True)
    attributes_json: Optional[str] = None
    is_active: bool = True


class JewelryCertificate(TimestampMixin, table=True):
    __tablename__ = "jewelry_certificate"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    cert_no: str = Field(index=True)
    certificate_no: Optional[str] = Field(default=None, index=True)
    tag_no: Optional[str] = Field(default=None, index=True)
    barcode: Optional[str] = Field(default=None, index=True)
    metal_type: str = "Gold"
    purity: str = "22K"
    weight_gram: float = 0
    gross_weight: float = 0
    stone_weight: float = 0
    net_metal_weight: float = 0
    stone_details_json: Optional[str] = None
    issue_date: Optional[datetime] = None
    status: str = Field(default="active", index=True)
    sales_invoice_id: Optional[str] = Field(default=None, index=True)
    customer_id: Optional[str] = Field(default=None, index=True)
    created_by: Optional[str] = None


class JewelryBuyback(TimestampMixin, table=True):
    __tablename__ = "jewelry_buyback"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    buyback_no: str = Field(index=True)
    store_id: Optional[str] = Field(default=None, index=True)
    customer_id: Optional[str] = None
    customer_name: str = ""
    original_invoice_id: Optional[str] = None
    original_certificate_id: Optional[str] = None
    metal_type: str = "Gold"
    purity: str = "22K"
    gross_weight: float = 0
    net_metal_weight: float = 0
    assessed_purity: Optional[str] = None
    assessed_weight: Optional[float] = None
    applicable_buy_rate: float = 0
    deductions: float = 0
    stone_deduction: float = 0
    service_deduction: float = 0
    final_buyback_value: float = 0
    settlement_method: Optional[str] = None
    status: str = Field(default="draft", index=True)
    override_reason: Optional[str] = None
    assessed_by: Optional[str] = None
    approved_by: Optional[str] = None
    notes: Optional[str] = None


class JewelryRepairOrder(TimestampMixin, table=True):
    __tablename__ = "jewelry_repair_order"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    customer_name: str
    item_desc: str
    status: str = "open"


class JewelrySalesLineExtension(SQLModel, table=True):
    __tablename__ = "jewelry_sales_line_extension"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    line_id: str = Field(foreign_key="sales_invoice_line.id", index=True)
    weight_gram: float = 0
    gold_rate: float = 0
    making_charge: float = 0
    metal_type: Optional[str] = None
    purity: Optional[str] = None
    gross_weight: Optional[float] = None
    stone_weight: Optional[float] = None
    net_metal_weight: Optional[float] = None
    metal_value: Optional[float] = None
    wastage_value: Optional[float] = None
    stone_value: Optional[float] = None
    certificate_id: Optional[str] = None
    certificate_no: Optional[str] = None
    rate_override_reason: Optional[str] = None
    snapshot_json: Optional[str] = None


class JewelryKarigar(TimestampMixin, table=True):
    __tablename__ = "jewelry_karigar"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    code: str = Field(index=True)
    name: str
    phone: Optional[str] = None
    artisan_type: str = "external"  # internal | external
    specialty: Optional[str] = None  # casting | setting | filigree | plain_gold
    default_making_rate: float = 0
    default_rate_type: str = "per_gram"  # per_gram | per_piece
    fine_gold_balance: float = 0.0  # current fine gold liability held in grams
    status: str = Field(default="active", index=True)
    nid_no: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None


class JewelryWorkOrder(TimestampMixin, table=True):
    __tablename__ = "jewelry_work_order"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    work_order_no: str = Field(index=True)
    order_type: str = "custom_order"  # custom_order | replenishment | repair | sample
    custom_order_id: Optional[str] = Field(default=None, index=True)
    product_id: Optional[str] = Field(default=None, foreign_key="product.id")
    design_name: str = ""
    item_category: Optional[str] = None  # Ring, Bangle, Necklace, Chain, Earring
    metal_type: str = "Gold"
    karat: str = "22K"
    purity: str = "22K"
    target_gross_weight: float = 0.0
    target_net_weight: float = 0.0
    allowed_loss_percentage: float = 2.0  # max allowable recovery/production loss %
    karigar_id: Optional[str] = Field(default=None, foreign_key="jewelry_karigar.id", index=True)
    status: str = Field(default="draft", index=True)  # draft | issued | in_progress | qc | completed | closed | cancelled
    stage: str = Field(default="melting", index=True)  # melting | casting | forming | setting | polishing | finishing | hallmarking | qc
    due_date: Optional[datetime] = None
    # Fine-Gold Accounting Reconciliation Fields
    issued_fine_weight: float = 0.0
    returned_fine_weight: float = 0.0
    recovered_fine_weight: float = 0.0
    finished_gross_weight: float = 0.0
    finished_net_weight: float = 0.0
    finished_fine_weight: float = 0.0
    actual_loss_weight: float = 0.0  # issued - (finished + returned + recovered)
    variance_weight: float = 0.0     # actual_loss - allowed_loss
    is_reconciled: bool = False
    reconciled_at: Optional[datetime] = None
    reconciled_by: Optional[str] = None
    making_charge_amount: float = 0.0
    tag_no: Optional[str] = Field(default=None, index=True)
    created_by: Optional[str] = None
    approved_by: Optional[str] = None
    notes: Optional[str] = None


class JewelryWorkOperation(TimestampMixin, table=True):
    __tablename__ = "jewelry_work_operation"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    work_order_id: str = Field(foreign_key="jewelry_work_order.id", index=True)
    stage: str  # melting | casting | forming | setting | polishing | finishing | hallmarking | qc
    status: str = "completed"  # pending | in_progress | completed
    operator_name: Optional[str] = None
    notes: Optional[str] = None
    performed_at: datetime = Field(default_factory=utcnow)


class JewelryMaterialIssue(TimestampMixin, table=True):
    __tablename__ = "jewelry_material_issue"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    issue_no: str = Field(index=True)
    work_order_id: str = Field(foreign_key="jewelry_work_order.id", index=True)
    karigar_id: str = Field(foreign_key="jewelry_karigar.id", index=True)
    item_type: str = "raw_gold"  # raw_gold | gold_bar | kacha_gold | alloy | stone | scrap
    metal_type: str = "Gold"
    karat: str = "22K"
    gross_weight: float = 0.0
    purity_factor: float = 0.916667  # 22/24 or tested
    fine_gold_weight: float = 0.0
    stone_pieces: int = 0
    stone_carat: float = 0.0
    stone_desc: Optional[str] = None
    issue_date: datetime = Field(default_factory=utcnow)
    issued_by: Optional[str] = None
    notes: Optional[str] = None


class JewelryMaterialReturn(TimestampMixin, table=True):
    __tablename__ = "jewelry_material_return"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    return_no: str = Field(index=True)
    work_order_id: str = Field(foreign_key="jewelry_work_order.id", index=True)
    karigar_id: str = Field(foreign_key="jewelry_karigar.id", index=True)
    return_type: str = "unused_metal"  # unused_metal | scrap | sample
    metal_type: str = "Gold"
    karat: str = "22K"
    gross_weight: float = 0.0
    purity_factor: float = 0.916667
    fine_gold_weight: float = 0.0
    return_date: datetime = Field(default_factory=utcnow)
    received_by: Optional[str] = None
    notes: Optional[str] = None


class JewelryProductionRecovery(TimestampMixin, table=True):
    __tablename__ = "jewelry_production_recovery"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    recovery_no: str = Field(index=True)
    work_order_id: str = Field(foreign_key="jewelry_work_order.id", index=True)
    karigar_id: str = Field(foreign_key="jewelry_karigar.id", index=True)
    recovery_type: str = "polish_dust"  # polish_dust | filing_dust | acid_recovery | bench_scrap
    gross_weight: float = 0.0
    tested_purity: float = 0.85  # recovery assay purity
    fine_gold_weight: float = 0.0
    recovery_date: datetime = Field(default_factory=utcnow)
    recorded_by: Optional[str] = None
    notes: Optional[str] = None


class JewelryKarigarBill(TimestampMixin, table=True):
    __tablename__ = "jewelry_karigar_bill"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    bill_no: str = Field(index=True)
    karigar_id: str = Field(foreign_key="jewelry_karigar.id", index=True)
    work_order_id: Optional[str] = Field(default=None, foreign_key="jewelry_work_order.id", index=True)
    total_weight_gram: float = 0.0
    rate_per_gram: float = 0.0
    piece_count: int = 1
    making_charge_gross: float = 0.0
    deductions: float = 0.0
    net_payable: float = 0.0
    payment_status: str = Field(default="unpaid", index=True)  # unpaid | partially_paid | paid
    paid_amount: float = 0.0
    payment_ref: Optional[str] = None
    bill_date: datetime = Field(default_factory=utcnow)
    approved_by: Optional[str] = None
    notes: Optional[str] = None


class JewelryCustomOrder(TimestampMixin, table=True):
    __tablename__ = "jewelry_custom_order"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    order_no: str = Field(index=True)
    customer_id: Optional[str] = Field(default=None, foreign_key="customer.id", index=True)
    customer_name: str
    customer_phone: Optional[str] = None
    design_name: str
    design_image_url: Optional[str] = None
    item_category: Optional[str] = None
    metal_type: str = "Gold"
    karat: str = "22K"
    purity: str = "22K"
    target_gross_weight: float = 0.0
    target_net_weight: float = 0.0
    weight_tolerance_gram: float = 0.5
    estimated_rate_per_gram: float = 0.0
    rate_lock_policy: str = "locked"  # locked | market_on_delivery
    making_charge_type: str = "per_gram"  # fixed | per_gram | percent
    making_charge_rate: float = 0.0
    wastage_percentage: float = 0.0
    estimated_stone_value: float = 0.0
    estimated_total: float = 0.0
    advance_paid: float = 0.0
    delivery_date: Optional[datetime] = None
    status: str = Field(default="draft", index=True)  # draft | quoted | confirmed | in_production | qc | ready | delivered | cancelled
    # Final delivery calculation
    final_gross_weight: Optional[float] = None
    final_net_weight: Optional[float] = None
    final_metal_rate: Optional[float] = None
    final_making_charge: Optional[float] = None
    final_wastage_value: Optional[float] = None
    final_stone_value: Optional[float] = None
    final_tax_amount: Optional[float] = None
    final_total_amount: Optional[float] = None
    final_balance_paid: Optional[float] = None
    sales_invoice_id: Optional[str] = Field(default=None, index=True)
    work_order_id: Optional[str] = Field(default=None, index=True)
    tag_no: Optional[str] = Field(default=None, index=True)
    created_by: Optional[str] = None
    notes: Optional[str] = None


class JewelryOrderAdvance(TimestampMixin, table=True):
    __tablename__ = "jewelry_order_advance"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    advance_no: str = Field(index=True)
    custom_order_id: str = Field(foreign_key="jewelry_custom_order.id", index=True)
    customer_id: Optional[str] = None
    amount: float = 0.0
    payment_mode: str = "cash"  # cash | bank | mfs | exchange_credit
    transaction_ref: Optional[str] = None
    advance_date: datetime = Field(default_factory=utcnow)
    received_by: Optional[str] = None
    notes: Optional[str] = None


class JewelryMeltingLot(TimestampMixin, table=True):
    __tablename__ = "jewelry_melting_lot"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    lot_no: str = Field(index=True)
    store_id: Optional[str] = Field(default=None, index=True)
    total_intake_pieces: int = 0
    initial_gross_weight: float = 0.0
    estimated_fine_weight: float = 0.0
    post_melt_gross_weight: float = 0.0
    tested_purity: float = 0.0  # tested karat or fineness factor e.g. 0.916
    recovered_fine_weight: float = 0.0
    melting_loss_weight: float = 0.0  # estimated_fine - recovered_fine
    residue_scrap_weight: float = 0.0
    melting_date: datetime = Field(default_factory=utcnow)
    melted_by: Optional[str] = None
    approved_by: Optional[str] = None
    status: str = Field(default="draft", index=True)  # draft | in_process | completed | cancelled
    notes: Optional[str] = None


class JewelryExchangeCredit(TimestampMixin, table=True):
    __tablename__ = "jewelry_exchange_credit"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    credit_code: str = Field(index=True)
    customer_id: Optional[str] = Field(default=None, index=True)
    customer_name: str = ""
    customer_phone: Optional[str] = None
    buyback_id: Optional[str] = Field(default=None, index=True)
    initial_credit_amount: float = 0.0
    remaining_balance: float = 0.0
    issue_date: datetime = Field(default_factory=utcnow)
    expiry_date: Optional[datetime] = None
    status: str = Field(default="active", index=True)  # active | partially_used | fully_redeemed | expired | cancelled
    notes: Optional[str] = None


# --- Electronics ---
class ElectronicsSerialStock(TimestampMixin, table=True):
    __tablename__ = "electronics_serial_stock"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    variant_id: Optional[str] = Field(default=None, foreign_key="product_variant.id", index=True)
    store_id: Optional[str] = Field(default=None, index=True)
    serial_imei: str = Field(index=True)  # canonical serial_no / IMEI-1 identity
    imei_no: Optional[str] = Field(default=None, index=True)  # IMEI-1 when distinct from serial
    imei_2: Optional[str] = Field(default=None, index=True)
    condition: str = Field(default="new", index=True)  # new|like_new|good|fair|poor|damaged|refurbishment_required
    activation_status: str = Field(default="unknown", index=True)  # not_activated|activated|unknown
    activation_date: Optional[datetime] = None
    sold_at: Optional[datetime] = None
    purchase_id: Optional[str] = Field(default=None, index=True)
    receive_id: Optional[str] = Field(default=None, index=True)
    status: str = Field(default="available", index=True)
    cost_price: Optional[float] = None
    supplier_id: Optional[str] = Field(default=None, index=True)
    customer_id: Optional[str] = Field(default=None, index=True)
    sales_invoice_id: Optional[str] = Field(default=None, index=True)
    warranty_id: Optional[str] = Field(default=None, index=True)


class ElectronicsWarranty(TimestampMixin, table=True):
    __tablename__ = "electronics_warranty"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    warranty_no: Optional[str] = Field(default=None, index=True)
    serial_imei: str = Field(index=True)
    serial_id: Optional[str] = Field(default=None, foreign_key="electronics_serial_stock.id", index=True)
    invoice_id: Optional[str] = Field(default=None, index=True)
    sales_invoice_id: Optional[str] = Field(default=None, index=True)
    sales_line_id: Optional[str] = Field(default=None, index=True)
    product_id: Optional[str] = Field(default=None, foreign_key="product.id", index=True)
    customer_id: Optional[str] = Field(default=None, index=True)
    warranty_months: int = 12
    warranty_start_date: Optional[datetime] = None
    warranty_end_date: Optional[datetime] = None
    warranty_terms: Optional[str] = None
    status: str = Field(default="active", index=True)
    expires_at: Optional[datetime] = None


class ElectronicsRma(TimestampMixin, table=True):
    __tablename__ = "electronics_rma"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    rma_no: Optional[str] = Field(default=None, index=True)
    invoice_number: Optional[str] = None
    customer_id: Optional[str] = Field(default=None, index=True)
    customer_name: str = ""
    product_id: Optional[str] = Field(default=None, foreign_key="product.id", index=True)
    product_name: str = ""
    serial_id: Optional[str] = Field(default=None, foreign_key="electronics_serial_stock.id", index=True)
    serial_imei: str
    warranty_id: Optional[str] = Field(default=None, foreign_key="electronics_warranty.id", index=True)
    warranty_status: str = "unknown"
    return_reason: str = ""
    problem_description: Optional[str] = None
    action_type: str = "return"
    condition_note: Optional[str] = None
    resolution_note: Optional[str] = None
    cost_amount: Optional[float] = None
    received_date: Optional[datetime] = None
    approval_status: str = "pending"
    status: str = Field(default="received", index=True)
    replacement_serial_id: Optional[str] = None


class ElectronicsServiceJob(TimestampMixin, table=True):
    __tablename__ = "electronics_service_job"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    rma_id: Optional[str] = Field(default=None, foreign_key="electronics_rma.id")
    status: str = "open"


class ElectronicsSalesLineExtension(SQLModel, table=True):
    __tablename__ = "electronics_sales_line_extension"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    line_id: str = Field(foreign_key="sales_invoice_line.id", index=True)
    serial_imei: Optional[str] = None
    serial_id: Optional[str] = None
    warranty_months: int = 12

class ElectronicsAmc(TimestampMixin, table=True):
    """Annual Maintenance Contract — electronics only."""
    __tablename__ = "electronics_amc"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    store_id: Optional[str] = Field(default=None, index=True)
    amc_no: Optional[str] = Field(default=None, index=True)
    serial_imei: str = Field(index=True)
    serial_id: Optional[str] = Field(default=None, foreign_key="electronics_serial_stock.id", index=True)
    customer_name: str = ""
    customer_id: Optional[str] = Field(default=None, index=True)
    product_name: str = ""
    product_id: Optional[str] = Field(default=None, foreign_key="product.id", index=True)
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    amount: float = 0.0
    status: str = Field(default="active", index=True)  # active|expired|pending_renewal|cancelled
    terms: Optional[str] = None
    notes: Optional[str] = None
    invoice_id: Optional[str] = Field(default=None, index=True)


class ElectronicsEmi(TimestampMixin, table=True):
    """EMI agreement — electronics only. One per sale paid by installment."""
    __tablename__ = "electronics_emi"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    store_id: Optional[str] = Field(default=None, index=True)
    emi_no: Optional[str] = Field(default=None, index=True)
    sale_id: Optional[str] = Field(default=None, index=True)  # SalesInvoice.id
    invoice_number: Optional[str] = Field(default=None, index=True)
    customer_id: Optional[str] = Field(default=None, index=True)
    customer_name: str = ""
    customer_phone: Optional[str] = None
    product_name: str = ""
    serial_imei: Optional[str] = Field(default=None, index=True)
    bank_financier: str = ""  # e.g. "bKash EMI", "City Bank", "DBBL Nexus"
    tenure_months: int = 12   # 3 | 6 | 12 | 18 | 24
    principal_amount: float = 0.0   # full sale total
    down_payment: float = 0.0
    processing_fee: float = 0.0
    interest_rate: float = 0.0      # % p.a.; 0 for 0% EMI scheme
    monthly_amount: float = 0.0     # computed installment amount
    total_payable: float = 0.0      # principal - down_payment + processing_fee
    total_collected: float = 0.0    # running tally
    status: str = Field(default="active", index=True)  # active|completed|overdue|defaulted|cancelled
    first_due_date: Optional[datetime] = None


class ElectronicsEmiInstallment(TimestampMixin, table=True):
    """Individual monthly installment row — electronics EMI only."""
    __tablename__ = "electronics_emi_installment"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    emi_id: str = Field(foreign_key="electronics_emi.id", index=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    installment_no: int = 1          # 1-based sequence
    due_date: Optional[datetime] = None
    amount: float = 0.0
    paid_date: Optional[datetime] = None
    paid_amount: Optional[float] = None
    status: str = Field(default="pending", index=True)  # pending|paid|overdue|waived
    collected_by: Optional[str] = None
    payment_method: Optional[str] = None   # cash|card|mobile|bank_transfer
    reference_no: Optional[str] = None


# --- Tailoring (BD boutique / alteration) ---
class TailoringAlterationJob(TimestampMixin, table=True):
    __tablename__ = "tailoring_alteration_job"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    job_no: str = Field(index=True)
    customer_name: str
    customer_phone: Optional[str] = None
    garment_type: str
    alteration_task: str
    master_name: str
    status: str = "pending"
    due_date: Optional[datetime] = None
    measurement_note: Optional[str] = None
    invoice_number: Optional[str] = None
    amount: float = 0


class TailorCommissionLedger(TimestampMixin, table=True):
    __tablename__ = "tailor_commission_ledger"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    tailor_name: str = Field(index=True)
    job_id: str = Field(foreign_key="tailoring_alteration_job.id", index=True)
    job_amount: float = 0
    commission_pct: float = 15.0
    payout_amount: float = 0
    status: str = "unpaid"  # unpaid | paid


class CustomerFabricIntake(TimestampMixin, table=True):
    __tablename__ = "customer_fabric_intake"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    customer_name: str
    customer_phone: str
    description: str
    status: str = "received"  # received | cutting | completed | returned
    job_id: Optional[str] = Field(default=None, foreign_key="tailoring_alteration_job.id", index=True)


# --- Rice & atta mill ---
class RiceMillVarietyStock(TimestampMixin, table=True):
    __tablename__ = "rice_mill_variety_stock"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    store_id: Optional[str] = Field(default=None, foreign_key="store.id")
    variety: str = Field(index=True)
    grade: str = "Standard"
    rate_per_kg: float = 0
    qty_kg: float = 0
    bag_count: int = 0
    reorder_kg: float = 100


# --- Furniture ---
class FurnitureDeliveryOrder(TimestampMixin, table=True):
    __tablename__ = "furniture_delivery_order"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    delivery_no: str = Field(index=True)
    customer_name: str
    customer_phone: Optional[str] = None
    delivery_address: str
    items_summary: str
    assembly_required: bool = False
    assembly_fee: float = 0
    scheduled_date: Optional[datetime] = None
    status: str = "scheduled"
    driver_note: Optional[str] = None


# --- Optical Shop ---
class OpticalFrameProfile(TimestampMixin, table=True):
    __tablename__ = "optical_frame_profile"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    frame_code: Optional[str] = None
    model_no: Optional[str] = None
    frame_type: Optional[str] = None  # optical|sunglasses|reading|safety
    frame_shape: Optional[str] = None
    material: Optional[str] = None
    gender_category: Optional[str] = None
    size_eye: Optional[str] = None
    size_bridge: Optional[str] = None
    temple_length: Optional[str] = None
    color: Optional[str] = None
    rim_type: Optional[str] = None
    brand_name: Optional[str] = None
    is_active: bool = True


class OpticalLensProfile(TimestampMixin, table=True):
    __tablename__ = "optical_lens_profile"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    lens_type: Optional[str] = None  # single_vision|bifocal|progressive|office|reading|plano|contact
    lens_material: Optional[str] = None
    refractive_index: Optional[str] = None
    coating: Optional[str] = None
    tint: Optional[str] = None
    photochromic: bool = False
    blue_cut: bool = False
    anti_reflective: bool = False
    uv_protection: bool = False
    polarization: bool = False
    brand_name: Optional[str] = None
    supply_mode: str = "stocked"  # stocked|made_to_order|external_lab|service_only
    is_active: bool = True


class OpticalPrescription(TimestampMixin, table=True):
    """Customer eye measurement record — retail fulfillment only, not clinical diagnosis."""

    __tablename__ = "optical_prescription"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    customer_id: str = Field(foreign_key="customer.id", index=True)
    prescription_no: str = Field(index=True)
    prescription_date: Optional[datetime] = None
    prescribed_by: Optional[str] = None
    doctor_name: Optional[str] = None
    clinic_name: Optional[str] = None
    notes: Optional[str] = None
    status: str = Field(default="active", index=True)  # active|superseded|cancelled
    # Right eye (OD)
    od_sphere: Optional[float] = None
    od_cylinder: Optional[float] = None
    od_axis: Optional[float] = None
    od_add: Optional[float] = None
    od_prism: Optional[float] = None
    od_base: Optional[str] = None
    od_va: Optional[str] = None
    od_pd: Optional[float] = None
    # Left eye (OS)
    os_sphere: Optional[float] = None
    os_cylinder: Optional[float] = None
    os_axis: Optional[float] = None
    os_add: Optional[float] = None
    os_prism: Optional[float] = None
    os_base: Optional[str] = None
    os_va: Optional[str] = None
    os_pd: Optional[float] = None
    total_pd: Optional[float] = None
    fitting_height_right: Optional[float] = None
    fitting_height_left: Optional[float] = None
    created_by: Optional[str] = None


class OpticalOrder(TimestampMixin, table=True):
    """Operational optical fulfillment — financial truth on SalesInvoice after finalize."""

    __tablename__ = "optical_order"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    store_id: str = Field(foreign_key="store.id", index=True)
    order_no: str = Field(index=True)
    customer_id: Optional[str] = Field(default=None, foreign_key="customer.id", index=True)
    prescription_id: Optional[str] = Field(default=None, foreign_key="optical_prescription.id", index=True)
    order_date: Optional[datetime] = None
    promised_date: Optional[datetime] = None
    delivery_date: Optional[datetime] = None
    service_type: str = "eyewear"  # eyewear|accessories|repair
    status: str = Field(default="draft", index=True)
    lab_type: Optional[str] = None  # internal|external
    lab_name: Optional[str] = None
    lab_reference_no: Optional[str] = None
    sent_to_lab_at: Optional[datetime] = None
    expected_from_lab_at: Optional[datetime] = None
    received_from_lab_at: Optional[datetime] = None
    fitting_started_at: Optional[datetime] = None
    qc_completed_at: Optional[datetime] = None
    ready_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    delivered_by: Optional[str] = None
    gross_amount: float = 0
    discount_amount: float = 0
    tax_amount: float = 0
    net_amount: float = 0
    advance_amount: float = 0
    paid_amount: float = 0
    due_amount: float = 0
    sales_invoice_id: Optional[str] = Field(default=None, index=True)
    price_override_reason: Optional[str] = None
    cancelled_reason: Optional[str] = None
    notes: Optional[str] = None
    created_by: Optional[str] = None


class OpticalOrderLine(TimestampMixin, table=True):
    __tablename__ = "optical_order_line"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    order_id: str = Field(foreign_key="optical_order.id", index=True)
    line_type: str = "frame"  # frame|lens_right|lens_left|lens_pair|accessory|service
    product_id: Optional[str] = Field(default=None, foreign_key="product.id")
    sku: str = ""
    description: str = ""
    qty: float = 1
    unit_price: float = 0
    discount: float = 0
    tax: float = 0
    line_total: float = 0
    supply_mode: Optional[str] = None
    configuration_json: Optional[str] = None


class OpticalSalesLineExtension(SQLModel, table=True):
    __tablename__ = "optical_sales_line_extension"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    line_id: str = Field(foreign_key="sales_invoice_line.id", index=True)
    order_id: Optional[str] = None
    prescription_id: Optional[str] = None
    line_type: Optional[str] = None
    configuration_json: Optional[str] = None


# --- Surgical Shop ---
class SurgicalProductProfile(TimestampMixin, table=True):
    __tablename__ = "surgical_product_profile"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    product_id: str = Field(foreign_key="product.id", unique=True, index=True)
    device_type: Optional[str] = None
    device_class: Optional[str] = None
    manufacturer_name: Optional[str] = None
    model_no: Optional[str] = None
    reference_code: Optional[str] = None
    catalog_no: Optional[str] = None
    tracking_mode: str = Field(default="batch", index=True)  # none|batch|lot|serial|batch_and_serial
    lot_tracked: bool = False
    batch_tracked: bool = True
    serial_tracked: bool = False
    expiry_tracked: bool = True
    udi_required: bool = False
    sterile_required: bool = False
    sterilization_method: Optional[str] = None
    reusable: bool = False
    single_use: bool = True
    warranty_months: Optional[int] = None
    storage_instruction: Optional[str] = None
    regulatory_notes: Optional[str] = None
    attributes_json: Optional[str] = None
    is_active: bool = True


class SurgicalStockUnit(TimestampMixin, table=True):
    __tablename__ = "surgical_stock_unit"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    variant_id: Optional[str] = Field(default=None, foreign_key="product_variant.id", index=True)
    store_id: Optional[str] = Field(default=None, index=True)
    supplier_id: Optional[str] = Field(default=None, index=True)
    manufacturer_name: Optional[str] = None
    batch_no: Optional[str] = Field(default=None, index=True)
    lot_no: Optional[str] = Field(default=None, index=True)
    serial_no: Optional[str] = Field(default=None, index=True)
    udi_code: Optional[str] = Field(default=None, index=True)
    manufacture_date: Optional[datetime] = None
    expiry_date: Optional[datetime] = Field(default=None, index=True)
    received_date: Optional[datetime] = None
    purchase_id: Optional[str] = Field(default=None, index=True)
    receive_id: Optional[str] = Field(default=None, index=True)
    qty_on_hand: float = 0
    status: str = Field(default="available", index=True)
    # available|quarantined|released|expired|recalled|damaged|sold|returned|retired
    sterile_status: str = Field(default="unknown", index=True)  # sterile|non_sterile|unknown
    sterilization_method: Optional[str] = None
    quarantine_reason: Optional[str] = None
    recall_reference: Optional[str] = None
    sales_invoice_id: Optional[str] = Field(default=None, index=True)


class SurgicalRecall(TimestampMixin, table=True):
    __tablename__ = "surgical_recall"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    recall_no: str = Field(index=True)
    product_id: Optional[str] = Field(default=None, foreign_key="product.id", index=True)
    batch_no: Optional[str] = Field(default=None, index=True)
    lot_no: Optional[str] = Field(default=None, index=True)
    serial_no: Optional[str] = Field(default=None, index=True)
    udi_code: Optional[str] = Field(default=None, index=True)
    manufacturer_name: Optional[str] = None
    recall_date: Optional[datetime] = None
    reason: str = ""
    severity: str = Field(default="standard", index=True)
    status: str = Field(default="open", index=True)
    # open|investigating|stock_blocked|customer_contact|resolved|closed
    created_by: Optional[str] = None
    closed_by: Optional[str] = None
    closed_at: Optional[datetime] = None
    notes: Optional[str] = None


class SurgicalSalesLineExtension(SQLModel, table=True):
    __tablename__ = "surgical_sales_line_extension"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    line_id: str = Field(foreign_key="sales_invoice_line.id", index=True)
    stock_unit_id: Optional[str] = Field(default=None, index=True)
    batch_no: Optional[str] = None
    lot_no: Optional[str] = None
    serial_no: Optional[str] = None
    udi_code: Optional[str] = None
    expiry_date: Optional[datetime] = None
    sterile_status: Optional[str] = None


# --- Mobile Shop ---
class MobileProductProfile(TimestampMixin, table=True):
    __tablename__ = "mobile_product_profile"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    product_id: str = Field(foreign_key="product.id", unique=True, index=True)
    brand: Optional[str] = None
    model_name: Optional[str] = None
    model_code: Optional[str] = None
    device_type: str = Field(default="smartphone", index=True)
    operating_system: Optional[str] = None
    network_type: Optional[str] = None
    sim_type: Optional[str] = None
    dual_sim: bool = False
    esim_supported: bool = False
    warranty_months: int = 12
    activation_tracking: bool = False
    imei_required: bool = True
    dual_imei: bool = False
    serial_required: bool = False
    condition_policy: Optional[str] = None
    attributes_json: Optional[str] = None
    is_active: bool = True


class MobileTradeIn(TimestampMixin, table=True):
    __tablename__ = "mobile_trade_in"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    trade_in_no: str = Field(index=True)
    customer_id: Optional[str] = Field(default=None, foreign_key="customer.id", index=True)
    store_id: Optional[str] = Field(default=None, index=True)
    brand: Optional[str] = None
    model_name: Optional[str] = None
    variant_description: Optional[str] = None
    imei_1: Optional[str] = Field(default=None, index=True)
    imei_2: Optional[str] = Field(default=None, index=True)
    serial_no: Optional[str] = Field(default=None, index=True)
    condition_grade: str = Field(default="good", index=True)
    cosmetic_condition: Optional[str] = None
    battery_health: Optional[str] = None
    storage: Optional[str] = None
    assessed_value: float = 0
    approved_value: Optional[float] = None
    valuation_reason: Optional[str] = None
    override_reason: Optional[str] = None
    status: str = Field(default="draft", index=True)
    assessed_by: Optional[str] = None
    approved_by: Optional[str] = None
    settlement_type: Optional[str] = None
    linked_sales_invoice_id: Optional[str] = Field(default=None, index=True)
    device_stock_id: Optional[str] = Field(default=None, index=True)
    notes: Optional[str] = None


class MobileSalesLineExtension(SQLModel, table=True):
    __tablename__ = "mobile_sales_line_extension"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    line_id: str = Field(foreign_key="sales_invoice_line.id", index=True)
    device_stock_id: Optional[str] = Field(default=None, index=True)
    serial_imei: Optional[str] = None
    imei_1: Optional[str] = None
    imei_2: Optional[str] = None
    warranty_months: int = 12
    condition: Optional[str] = None
    activation_status: Optional[str] = None
    price_override_reason: Optional[str] = None


# --- Salon & Parlor ---
class SalonService(TimestampMixin, table=True):
    __tablename__ = "salon_service"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    service_code: str = Field(index=True)
    service_name: str
    category: Optional[str] = Field(default=None, index=True)
    description: Optional[str] = None
    default_duration_minutes: int = 30
    cleanup_buffer_minutes: int = 0
    base_price: float = 0
    requires_resource: bool = False
    requires_staff: bool = True
    commission_type: str = "percentage"  # percentage|flat
    commission_rate: float = 0
    service_color: Optional[str] = None
    product_id: Optional[str] = Field(default=None, foreign_key="product.id", index=True)
    is_active: bool = True


class SalonStaffProfile(TimestampMixin, table=True):
    __tablename__ = "salon_staff_profile"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    user_id: Optional[str] = Field(default=None, foreign_key="user_account.id", index=True)
    display_name: str
    staff_code: Optional[str] = Field(default=None, index=True)
    specialties_json: Optional[str] = None
    appointment_enabled: bool = True
    commission_enabled: bool = True
    default_commission_type: str = "percentage"
    default_commission_rate: float = 0
    calendar_color: Optional[str] = None
    is_active: bool = True


class SalonStaffService(TimestampMixin, table=True):
    __tablename__ = "salon_staff_service"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    staff_id: str = Field(foreign_key="salon_staff_profile.id", index=True)
    service_id: str = Field(foreign_key="salon_service.id", index=True)
    custom_duration_minutes: Optional[int] = None
    custom_price: Optional[float] = None
    custom_commission_rate: Optional[float] = None
    is_active: bool = True


class SalonResource(TimestampMixin, table=True):
    __tablename__ = "salon_resource"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    store_id: Optional[str] = Field(default=None, foreign_key="store.id", index=True)
    resource_code: str = Field(index=True)
    resource_name: str
    resource_type: str = Field(default="styling_chair", index=True)
    capacity: int = 1
    status: str = Field(default="available", index=True)
    is_active: bool = True


class SalonAppointment(TimestampMixin, table=True):
    __tablename__ = "salon_appointment"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    appointment_no: str = Field(index=True)
    store_id: Optional[str] = Field(default=None, foreign_key="store.id", index=True)
    customer_id: Optional[str] = Field(default=None, foreign_key="customer.id", index=True)
    customer_name: str = ""
    phone: Optional[str] = None
    appointment_date: datetime = Field(index=True)
    start_time: datetime = Field(index=True)
    expected_end_time: Optional[datetime] = None
    status: str = Field(default="booked", index=True)
    # draft|booked|confirmed|checked_in|in_service|completed|cancelled|no_show
    source: str = "front_desk"  # front_desk|phone|walk_in|online
    notes: Optional[str] = None
    cancel_reason: Optional[str] = None
    created_by: Optional[str] = None
    visit_id: Optional[str] = Field(default=None, index=True)


class SalonAppointmentLine(TimestampMixin, table=True):
    __tablename__ = "salon_appointment_line"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    appointment_id: str = Field(foreign_key="salon_appointment.id", index=True)
    service_id: str = Field(foreign_key="salon_service.id", index=True)
    staff_id: Optional[str] = Field(default=None, foreign_key="salon_staff_profile.id", index=True)
    resource_id: Optional[str] = Field(default=None, foreign_key="salon_resource.id", index=True)
    scheduled_start: Optional[datetime] = None
    scheduled_end: Optional[datetime] = None
    unit_price: float = 0
    discount: float = 0
    status: str = Field(default="booked", index=True)
    notes: Optional[str] = None


class SalonVisit(TimestampMixin, table=True):
    """Operational salon visit — financial truth is SalesInvoice after checkout."""

    __tablename__ = "salon_visit"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    visit_no: str = Field(index=True)
    appointment_id: Optional[str] = Field(default=None, foreign_key="salon_appointment.id", index=True)
    store_id: Optional[str] = Field(default=None, foreign_key="store.id", index=True)
    customer_id: Optional[str] = Field(default=None, foreign_key="customer.id", index=True)
    customer_name: str = ""
    phone: Optional[str] = None
    status: str = Field(default="open", index=True)
    # open|checked_in|in_service|service_complete|ready_to_pay|paid|closed|cancelled
    checked_in_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    sales_invoice_id: Optional[str] = Field(default=None, index=True)
    gross_amount: float = 0
    discount_amount: float = 0
    tax_amount: float = 0
    tips_amount: float = 0
    net_amount: float = 0
    paid_amount: float = 0
    due_amount: float = 0
    notes: Optional[str] = None
    created_by: Optional[str] = None


class SalonVisitLine(TimestampMixin, table=True):
    __tablename__ = "salon_visit_line"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    visit_id: str = Field(foreign_key="salon_visit.id", index=True)
    line_type: str = Field(default="service", index=True)  # service|retail
    service_id: Optional[str] = Field(default=None, foreign_key="salon_service.id", index=True)
    product_id: Optional[str] = Field(default=None, foreign_key="product.id", index=True)
    staff_id: Optional[str] = Field(default=None, foreign_key="salon_staff_profile.id", index=True)
    resource_id: Optional[str] = Field(default=None, foreign_key="salon_resource.id", index=True)
    sku: str = ""
    name: str = ""
    qty: float = 1
    unit_price: float = 0
    discount: float = 0
    line_total: float = 0
    status: str = Field(default="pending", index=True)  # pending|started|completed|cancelled
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    notes: Optional[str] = None
    price_override_reason: Optional[str] = None


class SalonTip(TimestampMixin, table=True):
    __tablename__ = "salon_tip"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    visit_id: str = Field(foreign_key="salon_visit.id", index=True)
    staff_id: Optional[str] = Field(default=None, foreign_key="salon_staff_profile.id", index=True)
    amount: float = 0
    distribution_method: str = "direct"  # direct|split|pool
    notes: Optional[str] = None


class SalonCommission(TimestampMixin, table=True):
    __tablename__ = "salon_commission"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    visit_id: str = Field(foreign_key="salon_visit.id", index=True)
    visit_line_id: Optional[str] = Field(default=None, foreign_key="salon_visit_line.id", index=True)
    staff_id: str = Field(foreign_key="salon_staff_profile.id", index=True)
    service_id: Optional[str] = Field(default=None, foreign_key="salon_service.id", index=True)
    commission_type: str = "percentage"
    commission_rate: float = 0
    commission_base_amount: float = 0
    commission_amount: float = 0
    status: str = Field(default="pending", index=True)  # pending|approved|paid|cancelled
    override_reason: Optional[str] = None


# --- Hardware ---
class HardwareProductProfile(TimestampMixin, table=True):
    __tablename__ = "hardware_product_profile"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    product_id: str = Field(foreign_key="product.id", unique=True, index=True)
    brand_id: Optional[str] = Field(default=None, foreign_key="brand_master.id", index=True)
    manufacturer_name: Optional[str] = None
    model_no: Optional[str] = None
    material: Optional[str] = None
    grade: Optional[str] = None
    specification_json: Optional[str] = None
    measurement_mode: str = Field(default="quantity", index=True)  # quantity|length|area|weight|volume
    base_uom_id: Optional[str] = Field(default=None, foreign_key="unit.id", index=True)
    default_sales_uom_id: Optional[str] = Field(default=None, foreign_key="unit.id")
    default_purchase_uom_id: Optional[str] = Field(default=None, foreign_key="unit.id")
    fractional_qty_allowed: bool = False
    cut_to_length_allowed: bool = False
    minimum_sale_qty: float = 1.0
    sale_increment: float = 1.0
    warranty_months: Optional[int] = None
    serial_tracking_optional: bool = False
    contractor_pricing_enabled: bool = True
    bulk_pricing_enabled: bool = True
    attributes_json: Optional[str] = None
    is_active: bool = True


class HardwareCustomerPrice(TimestampMixin, table=True):
    __tablename__ = "hardware_customer_price"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    customer_id: str = Field(foreign_key="customer.id", index=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    variant_id: Optional[str] = Field(default=None, foreign_key="product_variant.id")
    uom_id: Optional[str] = Field(default=None, foreign_key="unit.id")
    unit_price: float = 0
    minimum_qty: Optional[float] = None
    effective_from: Optional[datetime] = None
    effective_to: Optional[datetime] = None
    is_active: bool = True


class HardwareBulkPriceTier(TimestampMixin, table=True):
    __tablename__ = "hardware_bulk_price_tier"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    variant_id: Optional[str] = Field(default=None, foreign_key="product_variant.id")
    uom_id: Optional[str] = Field(default=None, foreign_key="unit.id")
    customer_group: Optional[str] = Field(default=None, index=True)
    min_qty: float = 1
    max_qty: Optional[float] = None
    unit_price: float = 0
    effective_from: Optional[datetime] = None
    effective_to: Optional[datetime] = None
    is_active: bool = True


class HardwareSalesLineExtension(SQLModel, table=True):
    __tablename__ = "hardware_sales_line_extension"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    line_id: str = Field(foreign_key="sales_invoice_line.id", index=True)
    sales_uom_id: Optional[str] = None
    entered_qty: float = 0
    conversion_factor: float = 1.0
    base_qty: float = 0
    base_uom_id: Optional[str] = None
    price_source: str = "STANDARD"  # STANDARD|CUSTOMER_PRICE|CONTRACTOR_TIER|BULK_TIER|MANUAL_OVERRIDE
    unit_price: float = 0
    measurement_mode: Optional[str] = None
    measurement_meta_json: Optional[str] = None
    price_override_reason: Optional[str] = None


# --- Building Materials ---
class BuildingMaterialProfile(TimestampMixin, table=True):
    __tablename__ = "building_material_profile"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    product_id: str = Field(foreign_key="product.id", unique=True, index=True)
    brand_id: Optional[str] = Field(default=None, foreign_key="brand_master.id", index=True)
    material_type: Optional[str] = Field(default=None, index=True)  # cement|rod|sand|brick|stone|tile|other
    grade: Optional[str] = None
    specification_json: Optional[str] = None
    measurement_mode: str = Field(default="quantity", index=True)  # quantity|weight|volume
    base_uom_id: Optional[str] = Field(default=None, foreign_key="unit.id", index=True)
    default_sales_uom_id: Optional[str] = Field(default=None, foreign_key="unit.id")
    default_purchase_uom_id: Optional[str] = Field(default=None, foreign_key="unit.id")
    fractional_qty_allowed: bool = True
    minimum_sale_qty: float = 1.0
    sale_increment: float = 1.0
    contractor_pricing_enabled: bool = True
    bulk_pricing_enabled: bool = True
    attributes_json: Optional[str] = None
    is_active: bool = True


class BuildingProjectSite(TimestampMixin, table=True):
    __tablename__ = "building_project_site"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    customer_id: str = Field(foreign_key="customer.id", index=True)
    site_code: str = Field(index=True)
    site_name: str
    address: str
    contact_phone: Optional[str] = None
    district: Optional[str] = None
    thana: Optional[str] = None
    is_active: bool = True


class BuildingSalesOrder(TimestampMixin, table=True):
    """Building materials sales order — invoice at confirm; stock-out on dispatch."""

    __tablename__ = "building_sales_order"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    store_id: str = Field(foreign_key="store.id", index=True)
    order_no: str = Field(index=True)
    customer_id: Optional[str] = Field(default=None, foreign_key="customer.id", index=True)
    site_id: Optional[str] = Field(default=None, foreign_key="building_project_site.id", index=True)
    status: str = Field(default="draft", index=True)
    # draft|confirmed|partially_dispatched|partially_delivered|delivered|cancelled
    order_date: datetime = Field(default_factory=utcnow, index=True)
    promised_delivery_date: Optional[datetime] = None
    sales_invoice_id: Optional[str] = Field(default=None, index=True)
    subtotal: float = 0
    discount: float = 0
    tax: float = 0
    total: float = 0
    notes: Optional[str] = None
    cancel_reason: Optional[str] = None
    created_by: Optional[str] = None


class BuildingSalesOrderLine(TimestampMixin, table=True):
    __tablename__ = "building_sales_order_line"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    order_id: str = Field(foreign_key="building_sales_order.id", index=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    variant_id: Optional[str] = Field(default=None, foreign_key="product_variant.id")
    sku: str = ""
    product_name: str = ""
    sales_uom_id: Optional[str] = Field(default=None, foreign_key="unit.id")
    entered_qty: float = 0
    conversion_factor: float = 1.0
    base_qty: float = 0
    base_uom_id: Optional[str] = Field(default=None, foreign_key="unit.id")
    unit_price: float = 0
    discount: float = 0
    line_total: float = 0
    price_source: str = "STANDARD"
    dispatched_base_qty: float = 0
    delivered_base_qty: float = 0
    cancelled_base_qty: float = 0
    returned_base_qty: float = 0
    price_override_reason: Optional[str] = None


class BuildingDelivery(TimestampMixin, table=True):
    __tablename__ = "building_delivery"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    store_id: str = Field(foreign_key="store.id", index=True)
    order_id: str = Field(foreign_key="building_sales_order.id", index=True)
    delivery_no: str = Field(index=True)
    site_id: Optional[str] = Field(default=None, foreign_key="building_project_site.id", index=True)
    status: str = Field(default="planned", index=True)  # planned|dispatched|delivered|failed|returned|cancelled
    stock_posted: bool = False
    scheduled_date: Optional[datetime] = None
    dispatched_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    driver_name: Optional[str] = None
    vehicle_no: Optional[str] = None
    challan_no: Optional[str] = None
    notes: Optional[str] = None
    fail_reason: Optional[str] = None


class BuildingDeliveryLine(SQLModel, table=True):
    __tablename__ = "building_delivery_line"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    delivery_id: str = Field(foreign_key="building_delivery.id", index=True)
    order_line_id: str = Field(foreign_key="building_sales_order_line.id", index=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    planned_sales_uom_id: Optional[str] = Field(default=None, foreign_key="unit.id")
    planned_qty: float = 0
    planned_base_qty: float = 0
    dispatched_base_qty: float = 0
    delivered_base_qty: float = 0
    returned_base_qty: float = 0


# --- Bookstore ---
class BookPublisher(TimestampMixin, table=True):
    __tablename__ = "book_publisher"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    publisher_code: str = Field(index=True)
    publisher_name: str = Field(index=True)
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None
    is_active: bool = True


class BookAuthor(TimestampMixin, table=True):
    __tablename__ = "book_author"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    author_name: str = Field(index=True)
    sort_name: Optional[str] = None
    biography_short: Optional[str] = None
    country: Optional[str] = None
    is_active: bool = True


class BookProductProfile(TimestampMixin, table=True):
    __tablename__ = "book_product_profile"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    product_id: str = Field(foreign_key="product.id", unique=True, index=True)
    isbn_10: Optional[str] = Field(default=None, index=True)
    isbn_13: Optional[str] = Field(default=None, index=True)
    title: str = Field(index=True)
    subtitle: Optional[str] = None
    publisher_id: Optional[str] = Field(default=None, foreign_key="book_publisher.id", index=True)
    edition: Optional[str] = None
    publication_year: Optional[int] = None
    language: Optional[str] = Field(default=None, index=True)
    binding_type: Optional[str] = None
    page_count: Optional[int] = None
    subject: Optional[str] = Field(default=None, index=True)
    series_name: Optional[str] = None
    volume_no: Optional[str] = None
    academic_level: Optional[str] = Field(default=None, index=True)
    curriculum_code: Optional[str] = None
    country_of_origin: Optional[str] = None
    attributes_json: Optional[str] = None
    is_active: bool = True


class BookProductAuthor(TimestampMixin, table=True):
    __tablename__ = "book_product_author"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    author_id: str = Field(foreign_key="book_author.id", index=True)
    author_order: int = 1
    role: str = "author"  # author|editor|translator|compiler|illustrator|other


class BookAcademicList(TimestampMixin, table=True):
    __tablename__ = "book_academic_list"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    list_code: str = Field(index=True)
    list_name: str
    institution_name: Optional[str] = None
    school_name: Optional[str] = Field(default=None, index=True)
    curriculum: Optional[str] = None
    board: Optional[str] = Field(default=None, index=True)
    class_or_grade: Optional[str] = Field(default=None, index=True)
    academic_year: Optional[str] = Field(default=None, index=True)
    language_version: Optional[str] = None
    valid_from: Optional[datetime] = None
    valid_to: Optional[datetime] = None
    status: str = Field(default="draft", index=True)  # draft|active|archived
    notes: Optional[str] = None
    created_by: Optional[str] = None


class BookAcademicListItem(TimestampMixin, table=True):
    __tablename__ = "book_academic_list_item"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    list_id: str = Field(foreign_key="book_academic_list.id", index=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    sequence_no: int = 0
    required_flag: bool = True
    recommended_qty: float = 1.0
    notes: Optional[str] = None
    alternative_group: Optional[str] = None


# --- Stationery ---
class StationeryProductProfile(TimestampMixin, table=True):
    __tablename__ = "stationery_product_profile"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    product_id: str = Field(foreign_key="product.id", unique=True, index=True)
    stationery_type: Optional[str] = Field(default=None, index=True)  # pen|khata|paper|other
    brand_id: Optional[str] = Field(default=None, foreign_key="brand_master.id", index=True)
    manufacturer_name: Optional[str] = None
    model_no: Optional[str] = None
    color: Optional[str] = Field(default=None, index=True)
    size: Optional[str] = Field(default=None, index=True)
    paper_size: Optional[str] = Field(default=None, index=True)
    page_count: Optional[int] = None
    paper_gsm: Optional[float] = None
    ruling_type: Optional[str] = None
    tip_size: Optional[str] = Field(default=None, index=True)
    ink_color: Optional[str] = Field(default=None, index=True)
    material: Optional[str] = None
    base_uom_id: Optional[str] = Field(default=None, foreign_key="unit.id")
    default_sales_uom_id: Optional[str] = Field(default=None, foreign_key="unit.id")
    default_purchase_uom_id: Optional[str] = Field(default=None, foreign_key="unit.id")
    fractional_qty_allowed: bool = False
    school_list_eligible: bool = True
    wholesale_enabled: bool = True
    attributes_json: Optional[str] = None
    is_active: bool = True


class StationerySchoolList(TimestampMixin, table=True):
    __tablename__ = "stationery_school_list"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    list_code: str = Field(index=True)
    list_name: str
    institution_name: Optional[str] = None
    school_name: Optional[str] = Field(default=None, index=True)
    curriculum: Optional[str] = None
    board: Optional[str] = Field(default=None, index=True)
    class_or_grade: Optional[str] = Field(default=None, index=True)
    section: Optional[str] = None
    academic_year: Optional[str] = Field(default=None, index=True)
    language_version: Optional[str] = None
    valid_from: Optional[datetime] = None
    valid_to: Optional[datetime] = None
    status: str = Field(default="draft", index=True)  # draft|active|archived
    notes: Optional[str] = None
    created_by: Optional[str] = None


class StationerySchoolListItem(TimestampMixin, table=True):
    __tablename__ = "stationery_school_list_item"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    list_id: str = Field(foreign_key="stationery_school_list.id", index=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    variant_id: Optional[str] = Field(default=None, foreign_key="product_variant.id", index=True)
    sequence_no: int = 0
    required_flag: bool = True
    recommended_qty: float = 1.0
    sales_uom_id: Optional[str] = Field(default=None, foreign_key="unit.id")
    preferred_brand_id: Optional[str] = Field(default=None, foreign_key="brand_master.id")
    notes: Optional[str] = None
    alternative_group: Optional[str] = None


class StationerySalesLineExtension(SQLModel, table=True):
    __tablename__ = "stationery_sales_line_extension"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    line_id: str = Field(foreign_key="sales_invoice_line.id", index=True)
    sales_uom_id: Optional[str] = None
    entered_qty: float = 0
    conversion_factor: float = 1.0
    base_qty: float = 0
    base_uom_id: Optional[str] = None
    price_source: str = "STANDARD"  # STANDARD|CUSTOMER_PRICE|CONTRACTOR_TIER|BULK_TIER|MANUAL_OVERRIDE
    unit_price: float = 0
    price_override_reason: Optional[str] = None


# --- Cosmetics ---
class CosmeticsProductProfile(TimestampMixin, table=True):
    __tablename__ = "cosmetics_product_profile"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    product_id: str = Field(foreign_key="product.id", unique=True, index=True)
    brand_id: Optional[str] = Field(default=None, foreign_key="brand_master.id", index=True)
    product_type: Optional[str] = Field(default=None, index=True)  # lipstick|foundation|skincare|...
    product_category: Optional[str] = None
    finish: Optional[str] = None
    shade_family: Optional[str] = Field(default=None, index=True)
    size_value: Optional[float] = None
    size_uom: Optional[str] = None
    batch_tracked: bool = True
    expiry_tracked: bool = True
    tester_allowed: bool = False
    sample_allowed: bool = False
    near_expiry_warning_days: int = 90
    period_after_opening_months: Optional[int] = None
    manufacturer_name: Optional[str] = None
    country_of_origin: Optional[str] = None
    attributes_json: Optional[str] = None
    is_active: bool = True


class CosmeticsBatch(TimestampMixin, table=True):
    __tablename__ = "cosmetics_batch"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    variant_id: Optional[str] = Field(default=None, foreign_key="product_variant.id", index=True)
    store_id: Optional[str] = Field(default=None, index=True)
    supplier_id: Optional[str] = Field(default=None, index=True)
    batch_no: str = Field(index=True)
    lot_no: Optional[str] = None
    manufacture_date: Optional[datetime] = None
    expiry_date: Optional[datetime] = Field(default=None, index=True)
    received_date: Optional[datetime] = None
    purchase_id: Optional[str] = Field(default=None, index=True)
    receive_id: Optional[str] = Field(default=None, index=True)
    qty_on_hand: float = 0  # synced ONLY via inventory_service
    status: str = Field(default="available", index=True)
    # available|near_expiry|expired|quarantined|recalled|damaged|depleted


class CosmeticsTesterBalance(TimestampMixin, table=True):
    __tablename__ = "cosmetics_tester_balance"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    variant_id: Optional[str] = Field(default=None, foreign_key="product_variant.id", index=True)
    store_id: Optional[str] = Field(default=None, index=True)
    batch_id: Optional[str] = Field(default=None, foreign_key="cosmetics_batch.id", index=True)
    qty: float = 0
    status: str = Field(default="active", index=True)  # active|depleted|damaged|disposed
    reason: Optional[str] = None
    converted_by: Optional[str] = None
    converted_at: Optional[datetime] = None


class CosmeticsSalesLineExtension(SQLModel, table=True):
    __tablename__ = "cosmetics_sales_line_extension"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    line_id: str = Field(foreign_key="sales_invoice_line.id", index=True)
    variant_id: Optional[str] = None
    batch_id: Optional[str] = None
    batch_no: Optional[str] = None
    expiry_date: Optional[datetime] = None
    shade: Optional[str] = None
    size: Optional[str] = None
    price_source: Optional[str] = None


# --- Cycle & Toys ("Pedal & Play") ---
class CycleAssemblyOrder(TimestampMixin, table=True):
    __tablename__ = "cycle_assembly_order"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    store_id: Optional[str] = Field(default=None, index=True)
    order_no: str = Field(index=True)
    customer_name: str
    customer_phone: str = ""
    bicycle_model: str
    wheel_size: str = '16"'
    technician: str = ""
    assembly_fee: float = 300.0
    status: str = Field(default="Queue", index=True)  # Queue|In Progress|PDI Completed|Ready for Delivery
    pdi_passed: bool = False
    pdi_checklist_json: Optional[str] = None
    notes: str = ""
    sale_invoice_id: Optional[str] = Field(default=None, index=True)
    created_by: Optional[str] = None


class CycleServiceJob(TimestampMixin, table=True):
    __tablename__ = "cycle_service_job"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    store_id: Optional[str] = Field(default=None, index=True)
    job_no: str = Field(index=True)
    customer_name: str
    customer_phone: str = ""
    bike_model: str
    service_type: str = "Complete Overhaul & Tuning"
    parts_replaced: str = ""
    labor_fee: float = 0.0
    parts_cost: float = 0.0
    total_cost: float = 0.0
    mechanic: str = ""
    status: str = Field(default="Intake", index=True)  # Intake|In Service|Completed|Delivered
    notes: str = ""
    sale_invoice_id: Optional[str] = Field(default=None, index=True)
    created_by: Optional[str] = None


class CycleBatteryWarrantyLog(TimestampMixin, table=True):
    __tablename__ = "cycle_battery_warranty_log"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    store_id: Optional[str] = Field(default=None, index=True)
    log_no: str = Field(index=True)
    vehicle_model: str
    customer_name: str = ""
    customer_phone: str = ""
    battery_serial: str = Field(index=True)
    voltage_rating: str = Field(default="12V", index=True)  # 6V|12V|24V
    measured_voltage: str = "12.6V"
    remote_paired: bool = True
    warranty_months: int = 12
    charger_serial: str = ""
    status: str = Field(default="Passed PDI", index=True)
    # Passed PDI|Charged 100%|Warranty Service|Replacement Issued
    notes: str = ""
    sale_invoice_id: Optional[str] = Field(default=None, index=True)
    created_by: Optional[str] = None


class CycleInspectionSerialLog(TimestampMixin, table=True):
    __tablename__ = "cycle_inspection_serial_log"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    store_id: Optional[str] = Field(default=None, index=True)
    log_type: str = Field(index=True)  # frame_serial|pdi_5point|rc_bench_test
    item_model: str = ""
    frame_serial: Optional[str] = Field(default=None, index=True)
    frame_color: Optional[str] = None
    customer_contact: Optional[str] = None
    inspector: Optional[str] = None
    passed: bool = True
    details_json: Optional[str] = None
    sale_invoice_id: Optional[str] = Field(default=None, index=True)
    created_by: Optional[str] = None
