"""Phase 6B-9 — salon service catalog, staff, appointments, visits, commission."""

from alembic import op
import sqlalchemy as sa

revision = "020_salon_hardening"
down_revision = "019_mobile_shop_hardening"
branch_labels = None
depends_on = None


def _has_table(inspector, name: str) -> bool:
    return name in inspector.get_table_names()


def _has_index(inspector, table: str, name: str) -> bool:
    return name in {i["name"] for i in inspector.get_indexes(table)}


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(128)")
    inspector = sa.inspect(bind)

    tables = {
        "salon_service": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("service_code", sa.String(), nullable=False),
            sa.Column("service_name", sa.String(), nullable=False),
            sa.Column("category", sa.String(), nullable=True),
            sa.Column("description", sa.String(), nullable=True),
            sa.Column("default_duration_minutes", sa.Integer(), nullable=True),
            sa.Column("cleanup_buffer_minutes", sa.Integer(), nullable=True),
            sa.Column("base_price", sa.Float(), nullable=True),
            sa.Column("requires_resource", sa.Boolean(), nullable=True),
            sa.Column("requires_staff", sa.Boolean(), nullable=True),
            sa.Column("commission_type", sa.String(), nullable=True),
            sa.Column("commission_rate", sa.Float(), nullable=True),
            sa.Column("service_color", sa.String(), nullable=True),
            sa.Column("product_id", sa.String(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        ],
        "salon_staff_profile": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=True),
            sa.Column("display_name", sa.String(), nullable=False),
            sa.Column("staff_code", sa.String(), nullable=True),
            sa.Column("specialties_json", sa.String(), nullable=True),
            sa.Column("appointment_enabled", sa.Boolean(), nullable=True),
            sa.Column("commission_enabled", sa.Boolean(), nullable=True),
            sa.Column("default_commission_type", sa.String(), nullable=True),
            sa.Column("default_commission_rate", sa.Float(), nullable=True),
            sa.Column("calendar_color", sa.String(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        ],
        "salon_staff_service": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("staff_id", sa.String(), nullable=False),
            sa.Column("service_id", sa.String(), nullable=False),
            sa.Column("custom_duration_minutes", sa.Integer(), nullable=True),
            sa.Column("custom_price", sa.Float(), nullable=True),
            sa.Column("custom_commission_rate", sa.Float(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        ],
        "salon_resource": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("store_id", sa.String(), nullable=True),
            sa.Column("resource_code", sa.String(), nullable=False),
            sa.Column("resource_name", sa.String(), nullable=False),
            sa.Column("resource_type", sa.String(), nullable=True),
            sa.Column("capacity", sa.Integer(), nullable=True),
            sa.Column("status", sa.String(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        ],
        "salon_appointment": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("appointment_no", sa.String(), nullable=False),
            sa.Column("store_id", sa.String(), nullable=True),
            sa.Column("customer_id", sa.String(), nullable=True),
            sa.Column("customer_name", sa.String(), nullable=True),
            sa.Column("phone", sa.String(), nullable=True),
            sa.Column("appointment_date", sa.DateTime(), nullable=False),
            sa.Column("start_time", sa.DateTime(), nullable=False),
            sa.Column("expected_end_time", sa.DateTime(), nullable=True),
            sa.Column("status", sa.String(), nullable=True),
            sa.Column("source", sa.String(), nullable=True),
            sa.Column("notes", sa.String(), nullable=True),
            sa.Column("cancel_reason", sa.String(), nullable=True),
            sa.Column("created_by", sa.String(), nullable=True),
            sa.Column("visit_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        ],
        "salon_appointment_line": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("appointment_id", sa.String(), nullable=False),
            sa.Column("service_id", sa.String(), nullable=False),
            sa.Column("staff_id", sa.String(), nullable=True),
            sa.Column("resource_id", sa.String(), nullable=True),
            sa.Column("scheduled_start", sa.DateTime(), nullable=True),
            sa.Column("scheduled_end", sa.DateTime(), nullable=True),
            sa.Column("unit_price", sa.Float(), nullable=True),
            sa.Column("discount", sa.Float(), nullable=True),
            sa.Column("status", sa.String(), nullable=True),
            sa.Column("notes", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        ],
        "salon_visit": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("visit_no", sa.String(), nullable=False),
            sa.Column("appointment_id", sa.String(), nullable=True),
            sa.Column("store_id", sa.String(), nullable=True),
            sa.Column("customer_id", sa.String(), nullable=True),
            sa.Column("customer_name", sa.String(), nullable=True),
            sa.Column("phone", sa.String(), nullable=True),
            sa.Column("status", sa.String(), nullable=True),
            sa.Column("checked_in_at", sa.DateTime(), nullable=True),
            sa.Column("started_at", sa.DateTime(), nullable=True),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
            sa.Column("sales_invoice_id", sa.String(), nullable=True),
            sa.Column("gross_amount", sa.Float(), nullable=True),
            sa.Column("discount_amount", sa.Float(), nullable=True),
            sa.Column("tax_amount", sa.Float(), nullable=True),
            sa.Column("tips_amount", sa.Float(), nullable=True),
            sa.Column("net_amount", sa.Float(), nullable=True),
            sa.Column("paid_amount", sa.Float(), nullable=True),
            sa.Column("due_amount", sa.Float(), nullable=True),
            sa.Column("notes", sa.String(), nullable=True),
            sa.Column("created_by", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        ],
        "salon_visit_line": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("visit_id", sa.String(), nullable=False),
            sa.Column("line_type", sa.String(), nullable=True),
            sa.Column("service_id", sa.String(), nullable=True),
            sa.Column("product_id", sa.String(), nullable=True),
            sa.Column("staff_id", sa.String(), nullable=True),
            sa.Column("resource_id", sa.String(), nullable=True),
            sa.Column("sku", sa.String(), nullable=True),
            sa.Column("name", sa.String(), nullable=True),
            sa.Column("qty", sa.Float(), nullable=True),
            sa.Column("unit_price", sa.Float(), nullable=True),
            sa.Column("discount", sa.Float(), nullable=True),
            sa.Column("line_total", sa.Float(), nullable=True),
            sa.Column("status", sa.String(), nullable=True),
            sa.Column("started_at", sa.DateTime(), nullable=True),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
            sa.Column("notes", sa.String(), nullable=True),
            sa.Column("price_override_reason", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        ],
        "salon_tip": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("visit_id", sa.String(), nullable=False),
            sa.Column("staff_id", sa.String(), nullable=True),
            sa.Column("amount", sa.Float(), nullable=True),
            sa.Column("distribution_method", sa.String(), nullable=True),
            sa.Column("notes", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        ],
        "salon_commission": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("visit_id", sa.String(), nullable=False),
            sa.Column("visit_line_id", sa.String(), nullable=True),
            sa.Column("staff_id", sa.String(), nullable=False),
            sa.Column("service_id", sa.String(), nullable=True),
            sa.Column("commission_type", sa.String(), nullable=True),
            sa.Column("commission_rate", sa.Float(), nullable=True),
            sa.Column("commission_base_amount", sa.Float(), nullable=True),
            sa.Column("commission_amount", sa.Float(), nullable=True),
            sa.Column("status", sa.String(), nullable=True),
            sa.Column("override_reason", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        ],
    }

    indexes = [
        ("salon_service", "ix_salon_service_company_code", ["company_id", "service_code"]),
        ("salon_service", "ix_salon_service_category", ["company_id", "category"]),
        ("salon_staff_profile", "ix_salon_staff_company", ["company_id", "is_active"]),
        ("salon_staff_service", "ix_salon_staff_service_pair", ["company_id", "staff_id", "service_id"]),
        ("salon_resource", "ix_salon_resource_store", ["company_id", "store_id"]),
        ("salon_appointment", "ix_salon_appt_date", ["company_id", "appointment_date"]),
        ("salon_appointment", "ix_salon_appt_status", ["company_id", "status"]),
        ("salon_appointment_line", "ix_salon_appt_line_staff", ["staff_id", "scheduled_start"]),
        ("salon_appointment_line", "ix_salon_appt_line_resource", ["resource_id", "scheduled_start"]),
        ("salon_visit", "ix_salon_visit_status", ["company_id", "status"]),
        ("salon_visit_line", "ix_salon_visit_line_visit", ["visit_id", "status"]),
        ("salon_commission", "ix_salon_commission_staff", ["company_id", "staff_id", "status"]),
    ]

    for name, cols in tables.items():
        if not _has_table(inspector, name):
            op.create_table(name, *cols)

    inspector = sa.inspect(bind)
    for table, idx_name, cols in indexes:
        if _has_table(inspector, table) and not _has_index(inspector, table, idx_name):
            op.create_index(idx_name, table, cols)


def downgrade() -> None:
    for table in (
        "salon_commission",
        "salon_tip",
        "salon_visit_line",
        "salon_visit",
        "salon_appointment_line",
        "salon_appointment",
        "salon_resource",
        "salon_staff_service",
        "salon_staff_profile",
        "salon_service",
    ):
        op.drop_table(table)
