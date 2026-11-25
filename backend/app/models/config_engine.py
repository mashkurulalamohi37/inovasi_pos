from __future__ import annotations

"""Configuration engine models."""

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel

from app.models.base import TimestampMixin, new_uuid, utcnow


class IndustryMaster(SQLModel, table=True):
    __tablename__ = "industry_master"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    code: str = Field(unique=True, index=True)
    name: str
    description: Optional[str] = None


class IndustryPack(TimestampMixin, table=True):
    __tablename__ = "industry_pack"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    industry_code: str = Field(index=True)
    enabled_company: bool = True
    enabled_store: bool = True
    enabled_counter: bool = True
    updated_by: Optional[str] = None


class IndustryPackModule(SQLModel, table=True):
    __tablename__ = "industry_pack_module"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    pack_id: str = Field(foreign_key="industry_pack.id", index=True)
    module_code: str
    enabled: bool = True


class FeatureFlag(SQLModel, table=True):
    __tablename__ = "feature_flag"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    key: str = Field(unique=True, index=True)
    pack_code: str = Field(index=True)
    label: str
    description: Optional[str] = None
    default_enabled: bool = False


class TenantFeature(TimestampMixin, table=True):
    __tablename__ = "tenant_feature"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    flag_key: str = Field(index=True)
    enabled: bool = False
    updated_by: Optional[str] = None


class DynamicFieldDefinition(TimestampMixin, table=True):
    __tablename__ = "dynamic_field_definition"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    pack_code: str = Field(index=True)
    entity: str = "product"
    name: str
    field_type: str = "text"
    required: bool = False
    visible_in_pos: bool = True
    visible_in_product: bool = True
    visible_in_receipt: bool = False
    visible_in_report: bool = False
    sort_order: int = 0
    enabled: bool = True
    all_stores: bool = True
    all_counters: bool = True
    store_codes: Optional[str] = None  # JSON array
    counter_codes: Optional[str] = None
    options: Optional[str] = None


class DynamicFieldValue(TimestampMixin, table=True):
    __tablename__ = "dynamic_field_value"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    field_id: str = Field(foreign_key="dynamic_field_definition.id", index=True)
    entity_type: str
    entity_id: str = Field(index=True)
    value: Optional[str] = None


class ReceiptTemplate(TimestampMixin, table=True):
    __tablename__ = "receipt_template"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    pack_code: Optional[str] = None
    name: str
    brand_name: str
    tagline: Optional[str] = None
    address_lines: Optional[str] = None
    footer_notes: Optional[str] = None
    paper_width_mm: int = 80
    is_default: bool = False


class NumberSeries(SQLModel, table=True):
    __tablename__ = "number_series"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    series_code: str
    prefix: str = "INV"
    next_number: int = 1


class StorePolicy(TimestampMixin, table=True):
    __tablename__ = "store_policy"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    store_id: str = Field(foreign_key="store.id", index=True)
    policy_key: str
    policy_value: str


class PriceListEntry(TimestampMixin, table=True):
    """A scheduled unit-price override for a product, active only between
    starts_at and ends_at. Takes precedence over StorePolicy's immediate
    `unit_price:{id|sku}` override when currently active; falls back to it
    (then to Product.base_price) otherwise. store_id=None applies company-wide."""

    __tablename__ = "price_list_entry"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    store_id: Optional[str] = Field(default=None, foreign_key="store.id", index=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    price: float
    starts_at: datetime
    ends_at: Optional[datetime] = None
    name: Optional[str] = None  # e.g. "SS26 launch price", optional label for the list UI
    created_by: Optional[str] = Field(default=None, foreign_key="user_account.id")


class TaxRule(TimestampMixin, table=True):
    __tablename__ = "tax_rule"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    name: str
    rate: float = 0.05
    is_active: bool = True
    is_default: bool = False


class PriceRule(TimestampMixin, table=True):
    __tablename__ = "price_rule"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    name: str
    rule_type: str
    config_json: Optional[str] = None


class DiscountRule(TimestampMixin, table=True):
    __tablename__ = "discount_rule"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    name: str
    discount_pct: float = 0
    is_active: bool = True


class MenuConfig(TimestampMixin, table=True):
    __tablename__ = "menu_config"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    menu_key: str
    config_json: Optional[str] = None


class ScreenConfig(TimestampMixin, table=True):
    __tablename__ = "screen_config"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    screen_key: str
    config_json: Optional[str] = None


class ScreenFieldConfig(TimestampMixin, table=True):
    __tablename__ = "screen_field_config"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    screen_config_id: str = Field(foreign_key="screen_config.id", index=True)
    field_key: str
    visible: bool = True


class WorkflowDefinition(TimestampMixin, table=True):
    __tablename__ = "workflow_definition"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    code: str
    name: str


class WorkflowStep(TimestampMixin, table=True):
    __tablename__ = "workflow_step"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    workflow_id: str = Field(foreign_key="workflow_definition.id", index=True)
    step_order: int
    name: str
    role_code: Optional[str] = None


class ApprovalMatrix(TimestampMixin, table=True):
    __tablename__ = "approval_matrix"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    action_code: str
    role_code: str
    required: bool = True


class ReportConfig(TimestampMixin, table=True):
    __tablename__ = "report_config"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    report_key: str
    config_json: Optional[str] = None


class IntegrationConfig(TimestampMixin, table=True):
    __tablename__ = "integration_config"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    integration_key: str
    config_json: Optional[str] = None


class ConfigurationAuditLog(SQLModel, table=True):
    __tablename__ = "configuration_audit_log"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    user_id: Optional[str] = None
    action: str
    entity_type: str
    entity_id: Optional[str] = None
    detail_json: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)


class QaChecklistItem(TimestampMixin, table=True):
    __tablename__ = "qa_checklist_item"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    test_id: str = Field(index=True)
    status: str = "pending"
    notes: Optional[str] = None


class PackAttribute(TimestampMixin, table=True):
    """Industry-pack attribute master (season, fabric, color, dosage form, …)."""

    __tablename__ = "pack_attribute"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    pack_code: str = Field(index=True)
    attr_type: str = Field(index=True)
    code: str
    name: str
    parent_id: Optional[str] = Field(default=None, foreign_key="pack_attribute.id", index=True)
    sort_order: int = 0
    is_active: bool = True
