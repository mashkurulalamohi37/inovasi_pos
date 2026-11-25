"""Phase 6B-6 — optical frame/lens/prescription/order hardening."""

from alembic import op
import sqlalchemy as sa

revision = "017_optical_hardening"
down_revision = "016_restaurant_hardening"
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

    if not _has_table(inspector, "optical_frame_profile"):
        op.create_table(
            "optical_frame_profile",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("product_id", sa.String(), nullable=False),
            sa.Column("frame_code", sa.String(), nullable=True),
            sa.Column("model_no", sa.String(), nullable=True),
            sa.Column("frame_type", sa.String(), nullable=True),
            sa.Column("frame_shape", sa.String(), nullable=True),
            sa.Column("material", sa.String(), nullable=True),
            sa.Column("gender_category", sa.String(), nullable=True),
            sa.Column("size_eye", sa.String(), nullable=True),
            sa.Column("size_bridge", sa.String(), nullable=True),
            sa.Column("temple_length", sa.String(), nullable=True),
            sa.Column("color", sa.String(), nullable=True),
            sa.Column("rim_type", sa.String(), nullable=True),
            sa.Column("brand_name", sa.String(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_optical_frame_company_product", "optical_frame_profile", ["company_id", "product_id"])

    if not _has_table(inspector, "optical_lens_profile"):
        op.create_table(
            "optical_lens_profile",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("product_id", sa.String(), nullable=False),
            sa.Column("lens_type", sa.String(), nullable=True),
            sa.Column("lens_material", sa.String(), nullable=True),
            sa.Column("refractive_index", sa.String(), nullable=True),
            sa.Column("coating", sa.String(), nullable=True),
            sa.Column("tint", sa.String(), nullable=True),
            sa.Column("photochromic", sa.Boolean(), nullable=True),
            sa.Column("blue_cut", sa.Boolean(), nullable=True),
            sa.Column("anti_reflective", sa.Boolean(), nullable=True),
            sa.Column("uv_protection", sa.Boolean(), nullable=True),
            sa.Column("polarization", sa.Boolean(), nullable=True),
            sa.Column("brand_name", sa.String(), nullable=True),
            sa.Column("supply_mode", sa.String(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_optical_lens_company_product", "optical_lens_profile", ["company_id", "product_id"])

    if not _has_table(inspector, "optical_prescription"):
        op.create_table(
            "optical_prescription",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("customer_id", sa.String(), nullable=False),
            sa.Column("prescription_no", sa.String(), nullable=False),
            sa.Column("prescription_date", sa.DateTime(), nullable=True),
            sa.Column("prescribed_by", sa.String(), nullable=True),
            sa.Column("doctor_name", sa.String(), nullable=True),
            sa.Column("clinic_name", sa.String(), nullable=True),
            sa.Column("notes", sa.String(), nullable=True),
            sa.Column("status", sa.String(), nullable=False, server_default="active"),
            sa.Column("od_sphere", sa.Float(), nullable=True),
            sa.Column("od_cylinder", sa.Float(), nullable=True),
            sa.Column("od_axis", sa.Float(), nullable=True),
            sa.Column("od_add", sa.Float(), nullable=True),
            sa.Column("od_prism", sa.Float(), nullable=True),
            sa.Column("od_base", sa.String(), nullable=True),
            sa.Column("od_va", sa.String(), nullable=True),
            sa.Column("od_pd", sa.Float(), nullable=True),
            sa.Column("os_sphere", sa.Float(), nullable=True),
            sa.Column("os_cylinder", sa.Float(), nullable=True),
            sa.Column("os_axis", sa.Float(), nullable=True),
            sa.Column("os_add", sa.Float(), nullable=True),
            sa.Column("os_prism", sa.Float(), nullable=True),
            sa.Column("os_base", sa.String(), nullable=True),
            sa.Column("os_va", sa.String(), nullable=True),
            sa.Column("os_pd", sa.Float(), nullable=True),
            sa.Column("total_pd", sa.Float(), nullable=True),
            sa.Column("fitting_height_right", sa.Float(), nullable=True),
            sa.Column("fitting_height_left", sa.Float(), nullable=True),
            sa.Column("created_by", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_optical_rx_company_customer", "optical_prescription", ["company_id", "customer_id"])
        op.create_index("ix_optical_rx_company_status", "optical_prescription", ["company_id", "status"])

    if not _has_table(inspector, "optical_order"):
        op.create_table(
            "optical_order",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("store_id", sa.String(), nullable=False),
            sa.Column("order_no", sa.String(), nullable=False),
            sa.Column("customer_id", sa.String(), nullable=True),
            sa.Column("prescription_id", sa.String(), nullable=True),
            sa.Column("order_date", sa.DateTime(), nullable=True),
            sa.Column("promised_date", sa.DateTime(), nullable=True),
            sa.Column("delivery_date", sa.DateTime(), nullable=True),
            sa.Column("service_type", sa.String(), nullable=True),
            sa.Column("status", sa.String(), nullable=False, server_default="draft"),
            sa.Column("lab_type", sa.String(), nullable=True),
            sa.Column("lab_name", sa.String(), nullable=True),
            sa.Column("lab_reference_no", sa.String(), nullable=True),
            sa.Column("sent_to_lab_at", sa.DateTime(), nullable=True),
            sa.Column("expected_from_lab_at", sa.DateTime(), nullable=True),
            sa.Column("received_from_lab_at", sa.DateTime(), nullable=True),
            sa.Column("fitting_started_at", sa.DateTime(), nullable=True),
            sa.Column("qc_completed_at", sa.DateTime(), nullable=True),
            sa.Column("ready_at", sa.DateTime(), nullable=True),
            sa.Column("delivered_at", sa.DateTime(), nullable=True),
            sa.Column("delivered_by", sa.String(), nullable=True),
            sa.Column("gross_amount", sa.Float(), nullable=False, server_default="0"),
            sa.Column("discount_amount", sa.Float(), nullable=False, server_default="0"),
            sa.Column("tax_amount", sa.Float(), nullable=False, server_default="0"),
            sa.Column("net_amount", sa.Float(), nullable=False, server_default="0"),
            sa.Column("advance_amount", sa.Float(), nullable=False, server_default="0"),
            sa.Column("paid_amount", sa.Float(), nullable=False, server_default="0"),
            sa.Column("due_amount", sa.Float(), nullable=False, server_default="0"),
            sa.Column("sales_invoice_id", sa.String(), nullable=True),
            sa.Column("price_override_reason", sa.String(), nullable=True),
            sa.Column("cancelled_reason", sa.String(), nullable=True),
            sa.Column("notes", sa.String(), nullable=True),
            sa.Column("created_by", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_optical_order_company_status", "optical_order", ["company_id", "status"])
        op.create_index("ix_optical_order_company_customer", "optical_order", ["company_id", "customer_id"])
        op.create_index("ix_optical_order_invoice", "optical_order", ["sales_invoice_id"])

    if not _has_table(inspector, "optical_order_line"):
        op.create_table(
            "optical_order_line",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("order_id", sa.String(), nullable=False),
            sa.Column("line_type", sa.String(), nullable=False, server_default="frame"),
            sa.Column("product_id", sa.String(), nullable=True),
            sa.Column("sku", sa.String(), nullable=True),
            sa.Column("description", sa.String(), nullable=True),
            sa.Column("qty", sa.Float(), nullable=False, server_default="1"),
            sa.Column("unit_price", sa.Float(), nullable=False, server_default="0"),
            sa.Column("discount", sa.Float(), nullable=False, server_default="0"),
            sa.Column("tax", sa.Float(), nullable=False, server_default="0"),
            sa.Column("line_total", sa.Float(), nullable=False, server_default="0"),
            sa.Column("supply_mode", sa.String(), nullable=True),
            sa.Column("configuration_json", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_optical_order_line_order", "optical_order_line", ["order_id"])

    if not _has_table(inspector, "optical_sales_line_extension"):
        op.create_table(
            "optical_sales_line_extension",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("line_id", sa.String(), nullable=False),
            sa.Column("order_id", sa.String(), nullable=True),
            sa.Column("prescription_id", sa.String(), nullable=True),
            sa.Column("line_type", sa.String(), nullable=True),
            sa.Column("configuration_json", sa.String(), nullable=True),
        )
        op.create_index("ix_optical_sale_ext_line", "optical_sales_line_extension", ["line_id"])


def downgrade() -> None:
    pass
