from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class PackConfigOut(BaseModel):
    industry_code: str
    enabled_company: bool
    enabled_store: bool
    enabled_counter: bool


class PackConfigUpdate(BaseModel):
    enabled_company: Optional[bool] = None
    enabled_store: Optional[bool] = None
    enabled_counter: Optional[bool] = None


class PackActivationRequestIn(BaseModel):
    note: Optional[str] = None


class PackActivationResolveIn(BaseModel):
    action: str  # approve | reject
    comment: Optional[str] = None


class PackActivationRequestOut(BaseModel):
    id: str
    company_id: str
    company_code: Optional[str] = None
    company_name: Optional[str] = None
    industry_code: str
    pack_name: Optional[str] = None
    status: str
    requested_by: str
    requested_by_name: Optional[str] = None
    created_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None
    comment: Optional[str] = None
    note: Optional[str] = None
    plan_name: Optional[str] = None


class FeatureFlagOut(BaseModel):
    key: str
    pack_code: str
    label: str
    description: Optional[str] = None
    enabled: bool


class FeatureFlagUpdate(BaseModel):
    enabled: bool


class DynamicFieldOut(BaseModel):
    id: str
    pack_code: str
    entity: str
    name: str
    field_type: str
    required: bool
    visible_in_pos: bool
    visible_in_product: bool
    visible_in_receipt: bool
    visible_in_report: bool
    sort_order: int
    enabled: bool
    all_stores: bool
    all_counters: bool
    store_codes: list[str] = []
    counter_codes: list[str] = []
    options: list[str] = []


class DynamicFieldCreate(BaseModel):
    pack_code: str
    entity: str = "product"
    name: str
    field_type: str = "text"
    required: bool = False
    visible_in_pos: bool = True
    visible_in_product: bool = True
    visible_in_receipt: bool = False
    visible_in_report: bool = False
    enabled: bool = True
    all_stores: bool = True
    all_counters: bool = True
    store_codes: list[str] = []
    counter_codes: list[str] = []
    options: list[str] = []


class RolePermissionOut(BaseModel):
    role_code: str
    permission_code: str
    allowed: bool


class RolePermissionUpdate(BaseModel):
    role_code: str
    permission_code: str
    allowed: bool


class ReceiptTemplateOut(BaseModel):
    id: str
    pack_code: Optional[str]
    name: str
    brand_name: str
    tagline: Optional[str]
    address_lines: Optional[str]
    footer_notes: Optional[str]
    paper_width_mm: int
    is_default: bool


class ReceiptTemplateCreate(BaseModel):
    pack_code: Optional[str] = None
    name: str
    brand_name: str
    tagline: Optional[str] = None
    address_lines: Optional[str] = None
    footer_notes: Optional[str] = None
    paper_width_mm: int = 80
    is_default: bool = False


class ReceiptTemplateUpdate(BaseModel):
    name: Optional[str] = None
    brand_name: Optional[str] = None
    tagline: Optional[str] = None
    address_lines: Optional[str] = None
    footer_notes: Optional[str] = None
    paper_width_mm: Optional[int] = None
    is_default: Optional[bool] = None


class HealthCheckItem(BaseModel):
    id: str
    title: str
    status: str
    message: str
    fix_link: Optional[str] = None


class QaItemOut(BaseModel):
    test_id: str
    status: str
    notes: Optional[str] = None


class QaItemUpdate(BaseModel):
    status: str
    notes: Optional[str] = None


class MenuConfigOut(BaseModel):
    menus: dict[str, dict[str, bool]]


class MenuConfigPatch(BaseModel):
    pack_code: str
    route_path: str
    enabled: bool


class ScreenConfigOut(BaseModel):
    screen_key: str
    config: dict[str, Any] = {}


class ScreenConfigUpdate(BaseModel):
    config: dict[str, Any] = {}
