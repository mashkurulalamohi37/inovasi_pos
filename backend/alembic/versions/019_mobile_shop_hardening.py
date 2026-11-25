"""Phase 6B-8 — mobile shop device profile, dual IMEI, trade-in hardening."""

from alembic import op
import sqlalchemy as sa

revision = "019_mobile_shop_hardening"
down_revision = "018_surgical_hardening"
branch_labels = None
depends_on = None


def _has_table(inspector, name: str) -> bool:
    return name in inspector.get_table_names()


def _has_column(inspector, table: str, column: str) -> bool:
    return column in {c["name"] for c in inspector.get_columns(table)}


def _has_index(inspector, table: str, name: str) -> bool:
    return name in {i["name"] for i in inspector.get_indexes(table)}


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(128)")
    inspector = sa.inspect(bind)

    if _has_table(inspector, "electronics_serial_stock"):
        cols = {
            "imei_2": sa.Column("imei_2", sa.String(), nullable=True),
            "condition": sa.Column("condition", sa.String(), nullable=True),
            "activation_status": sa.Column("activation_status", sa.String(), nullable=True),
            "activation_date": sa.Column("activation_date", sa.DateTime(), nullable=True),
            "sold_at": sa.Column("sold_at", sa.DateTime(), nullable=True),
        }
        for name, col in cols.items():
            if not _has_column(inspector, "electronics_serial_stock", name):
                op.add_column("electronics_serial_stock", col)
        if not _has_index(inspector, "electronics_serial_stock", "ix_electronics_serial_imei2"):
            op.create_index("ix_electronics_serial_imei2", "electronics_serial_stock", ["company_id", "imei_2"])
        if not _has_index(inspector, "electronics_serial_stock", "ix_electronics_serial_condition"):
            op.create_index("ix_electronics_serial_condition", "electronics_serial_stock", ["company_id", "condition"])

    if not _has_table(inspector, "mobile_product_profile"):
        op.create_table(
            "mobile_product_profile",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("product_id", sa.String(), nullable=False),
            sa.Column("brand", sa.String(), nullable=True),
            sa.Column("model_name", sa.String(), nullable=True),
            sa.Column("model_code", sa.String(), nullable=True),
            sa.Column("device_type", sa.String(), nullable=True),
            sa.Column("operating_system", sa.String(), nullable=True),
            sa.Column("network_type", sa.String(), nullable=True),
            sa.Column("sim_type", sa.String(), nullable=True),
            sa.Column("dual_sim", sa.Boolean(), nullable=True),
            sa.Column("esim_supported", sa.Boolean(), nullable=True),
            sa.Column("warranty_months", sa.Integer(), nullable=True),
            sa.Column("activation_tracking", sa.Boolean(), nullable=True),
            sa.Column("imei_required", sa.Boolean(), nullable=True),
            sa.Column("dual_imei", sa.Boolean(), nullable=True),
            sa.Column("serial_required", sa.Boolean(), nullable=True),
            sa.Column("condition_policy", sa.String(), nullable=True),
            sa.Column("attributes_json", sa.String(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_mobile_profile_company_product", "mobile_product_profile", ["company_id", "product_id"])
        op.create_index("ix_mobile_profile_brand", "mobile_product_profile", ["company_id", "brand"])

    if not _has_table(inspector, "mobile_trade_in"):
        op.create_table(
            "mobile_trade_in",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("trade_in_no", sa.String(), nullable=False),
            sa.Column("customer_id", sa.String(), nullable=True),
            sa.Column("store_id", sa.String(), nullable=True),
            sa.Column("brand", sa.String(), nullable=True),
            sa.Column("model_name", sa.String(), nullable=True),
            sa.Column("variant_description", sa.String(), nullable=True),
            sa.Column("imei_1", sa.String(), nullable=True),
            sa.Column("imei_2", sa.String(), nullable=True),
            sa.Column("serial_no", sa.String(), nullable=True),
            sa.Column("condition_grade", sa.String(), nullable=True),
            sa.Column("cosmetic_condition", sa.String(), nullable=True),
            sa.Column("battery_health", sa.String(), nullable=True),
            sa.Column("storage", sa.String(), nullable=True),
            sa.Column("assessed_value", sa.Float(), nullable=True),
            sa.Column("approved_value", sa.Float(), nullable=True),
            sa.Column("valuation_reason", sa.String(), nullable=True),
            sa.Column("override_reason", sa.String(), nullable=True),
            sa.Column("status", sa.String(), nullable=True),
            sa.Column("assessed_by", sa.String(), nullable=True),
            sa.Column("approved_by", sa.String(), nullable=True),
            sa.Column("settlement_type", sa.String(), nullable=True),
            sa.Column("linked_sales_invoice_id", sa.String(), nullable=True),
            sa.Column("device_stock_id", sa.String(), nullable=True),
            sa.Column("notes", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_mobile_trade_in_company_status", "mobile_trade_in", ["company_id", "status"])
        op.create_index("ix_mobile_trade_in_imei", "mobile_trade_in", ["company_id", "imei_1"])

    if not _has_table(inspector, "mobile_sales_line_extension"):
        op.create_table(
            "mobile_sales_line_extension",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("line_id", sa.String(), nullable=False),
            sa.Column("device_stock_id", sa.String(), nullable=True),
            sa.Column("serial_imei", sa.String(), nullable=True),
            sa.Column("imei_1", sa.String(), nullable=True),
            sa.Column("imei_2", sa.String(), nullable=True),
            sa.Column("warranty_months", sa.Integer(), nullable=True),
            sa.Column("condition", sa.String(), nullable=True),
            sa.Column("activation_status", sa.String(), nullable=True),
            sa.Column("price_override_reason", sa.String(), nullable=True),
        )
        op.create_index("ix_mobile_sale_ext_line", "mobile_sales_line_extension", ["line_id"])
        op.create_index("ix_mobile_sale_ext_device", "mobile_sales_line_extension", ["device_stock_id"])


def downgrade() -> None:
    for table in ("mobile_sales_line_extension", "mobile_trade_in", "mobile_product_profile"):
        op.drop_table(table)
