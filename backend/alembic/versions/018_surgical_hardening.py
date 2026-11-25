"""Phase 6B-7 — surgical product profile, stock units, recall hardening."""

from alembic import op
import sqlalchemy as sa

revision = "018_surgical_hardening"
down_revision = "017_optical_hardening"
branch_labels = None
depends_on = None


def _has_table(inspector, name: str) -> bool:
    return name in inspector.get_table_names()


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(128)")
    inspector = sa.inspect(bind)

    if not _has_table(inspector, "surgical_product_profile"):
        op.create_table(
            "surgical_product_profile",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("product_id", sa.String(), nullable=False),
            sa.Column("device_type", sa.String(), nullable=True),
            sa.Column("device_class", sa.String(), nullable=True),
            sa.Column("manufacturer_name", sa.String(), nullable=True),
            sa.Column("model_no", sa.String(), nullable=True),
            sa.Column("reference_code", sa.String(), nullable=True),
            sa.Column("catalog_no", sa.String(), nullable=True),
            sa.Column("tracking_mode", sa.String(), nullable=True),
            sa.Column("lot_tracked", sa.Boolean(), nullable=True),
            sa.Column("batch_tracked", sa.Boolean(), nullable=True),
            sa.Column("serial_tracked", sa.Boolean(), nullable=True),
            sa.Column("expiry_tracked", sa.Boolean(), nullable=True),
            sa.Column("udi_required", sa.Boolean(), nullable=True),
            sa.Column("sterile_required", sa.Boolean(), nullable=True),
            sa.Column("sterilization_method", sa.String(), nullable=True),
            sa.Column("reusable", sa.Boolean(), nullable=True),
            sa.Column("single_use", sa.Boolean(), nullable=True),
            sa.Column("warranty_months", sa.Integer(), nullable=True),
            sa.Column("storage_instruction", sa.String(), nullable=True),
            sa.Column("regulatory_notes", sa.String(), nullable=True),
            sa.Column("attributes_json", sa.String(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_surgical_profile_company_product", "surgical_product_profile", ["company_id", "product_id"])
        op.create_index("ix_surgical_profile_ref", "surgical_product_profile", ["company_id", "reference_code"])
        op.create_index("ix_surgical_profile_catalog", "surgical_product_profile", ["company_id", "catalog_no"])

    if not _has_table(inspector, "surgical_stock_unit"):
        op.create_table(
            "surgical_stock_unit",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("product_id", sa.String(), nullable=False),
            sa.Column("variant_id", sa.String(), nullable=True),
            sa.Column("store_id", sa.String(), nullable=True),
            sa.Column("supplier_id", sa.String(), nullable=True),
            sa.Column("manufacturer_name", sa.String(), nullable=True),
            sa.Column("batch_no", sa.String(), nullable=True),
            sa.Column("lot_no", sa.String(), nullable=True),
            sa.Column("serial_no", sa.String(), nullable=True),
            sa.Column("udi_code", sa.String(), nullable=True),
            sa.Column("manufacture_date", sa.DateTime(), nullable=True),
            sa.Column("expiry_date", sa.DateTime(), nullable=True),
            sa.Column("received_date", sa.DateTime(), nullable=True),
            sa.Column("purchase_id", sa.String(), nullable=True),
            sa.Column("receive_id", sa.String(), nullable=True),
            sa.Column("qty_on_hand", sa.Float(), nullable=True),
            sa.Column("status", sa.String(), nullable=True),
            sa.Column("sterile_status", sa.String(), nullable=True),
            sa.Column("sterilization_method", sa.String(), nullable=True),
            sa.Column("quarantine_reason", sa.String(), nullable=True),
            sa.Column("recall_reference", sa.String(), nullable=True),
            sa.Column("sales_invoice_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_surgical_unit_company_product", "surgical_stock_unit", ["company_id", "product_id"])
        op.create_index("ix_surgical_unit_company_status", "surgical_stock_unit", ["company_id", "status"])
        op.create_index("ix_surgical_unit_company_expiry", "surgical_stock_unit", ["company_id", "expiry_date"])
        op.create_index("ix_surgical_unit_company_batch", "surgical_stock_unit", ["company_id", "batch_no"])
        op.create_index("ix_surgical_unit_company_lot", "surgical_stock_unit", ["company_id", "lot_no"])
        op.create_index("ix_surgical_unit_company_serial", "surgical_stock_unit", ["company_id", "serial_no"])
        op.create_index("ix_surgical_unit_company_udi", "surgical_stock_unit", ["company_id", "udi_code"])
        op.create_index("ix_surgical_unit_company_sterile", "surgical_stock_unit", ["company_id", "sterile_status"])

    if not _has_table(inspector, "surgical_recall"):
        op.create_table(
            "surgical_recall",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("recall_no", sa.String(), nullable=False),
            sa.Column("product_id", sa.String(), nullable=True),
            sa.Column("batch_no", sa.String(), nullable=True),
            sa.Column("lot_no", sa.String(), nullable=True),
            sa.Column("serial_no", sa.String(), nullable=True),
            sa.Column("udi_code", sa.String(), nullable=True),
            sa.Column("manufacturer_name", sa.String(), nullable=True),
            sa.Column("recall_date", sa.DateTime(), nullable=True),
            sa.Column("reason", sa.String(), nullable=True),
            sa.Column("severity", sa.String(), nullable=True),
            sa.Column("status", sa.String(), nullable=True),
            sa.Column("created_by", sa.String(), nullable=True),
            sa.Column("closed_by", sa.String(), nullable=True),
            sa.Column("closed_at", sa.DateTime(), nullable=True),
            sa.Column("notes", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_surgical_recall_company_status", "surgical_recall", ["company_id", "status"])
        op.create_index("ix_surgical_recall_company_product", "surgical_recall", ["company_id", "product_id"])

    if not _has_table(inspector, "surgical_sales_line_extension"):
        op.create_table(
            "surgical_sales_line_extension",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("line_id", sa.String(), nullable=False),
            sa.Column("stock_unit_id", sa.String(), nullable=True),
            sa.Column("batch_no", sa.String(), nullable=True),
            sa.Column("lot_no", sa.String(), nullable=True),
            sa.Column("serial_no", sa.String(), nullable=True),
            sa.Column("udi_code", sa.String(), nullable=True),
            sa.Column("expiry_date", sa.DateTime(), nullable=True),
            sa.Column("sterile_status", sa.String(), nullable=True),
        )
        op.create_index("ix_surgical_sale_ext_line", "surgical_sales_line_extension", ["line_id"])
        op.create_index("ix_surgical_sale_ext_unit", "surgical_sales_line_extension", ["stock_unit_id"])


def downgrade() -> None:
    for table in (
        "surgical_sales_line_extension",
        "surgical_recall",
        "surgical_stock_unit",
        "surgical_product_profile",
    ):
        op.drop_table(table)
