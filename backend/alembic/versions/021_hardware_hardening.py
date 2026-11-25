"""Phase 6B-10 — hardware product profile, UOM conversion, customer/bulk pricing."""

from alembic import op
import sqlalchemy as sa

revision = "021_hardware_hardening"
down_revision = "020_salon_hardening"
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

    if _has_table(inspector, "product_barcode") and not _has_column(inspector, "product_barcode", "uom_id"):
        op.add_column("product_barcode", sa.Column("uom_id", sa.String(), nullable=True))
        op.add_column("product_barcode", sa.Column("packaging_qty", sa.Float(), nullable=True))
        if not _has_index(inspector, "product_barcode", "ix_product_barcode_uom_id"):
            op.create_index("ix_product_barcode_uom_id", "product_barcode", ["uom_id"])

    if _has_table(inspector, "customer") and not _has_column(inspector, "customer", "customer_group"):
        op.add_column("customer", sa.Column("customer_group", sa.String(), nullable=True))
        if not _has_index(inspector, "customer", "ix_customer_customer_group"):
            op.create_index("ix_customer_customer_group", "customer", ["customer_group"])

    tables = {
        "product_uom_conversion": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("product_id", sa.String(), nullable=False),
            sa.Column("variant_id", sa.String(), nullable=True),
            sa.Column("from_uom_id", sa.String(), nullable=False),
            sa.Column("to_uom_id", sa.String(), nullable=False),
            sa.Column("conversion_factor", sa.Float(), nullable=True),
            sa.Column("barcode_id", sa.String(), nullable=True),
            sa.Column("purchase_enabled", sa.Boolean(), nullable=True),
            sa.Column("sales_enabled", sa.Boolean(), nullable=True),
            sa.Column("is_default", sa.Boolean(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        ],
        "hardware_product_profile": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("product_id", sa.String(), nullable=False),
            sa.Column("brand_id", sa.String(), nullable=True),
            sa.Column("manufacturer_name", sa.String(), nullable=True),
            sa.Column("model_no", sa.String(), nullable=True),
            sa.Column("material", sa.String(), nullable=True),
            sa.Column("grade", sa.String(), nullable=True),
            sa.Column("specification_json", sa.String(), nullable=True),
            sa.Column("measurement_mode", sa.String(), nullable=True),
            sa.Column("base_uom_id", sa.String(), nullable=True),
            sa.Column("default_sales_uom_id", sa.String(), nullable=True),
            sa.Column("default_purchase_uom_id", sa.String(), nullable=True),
            sa.Column("fractional_qty_allowed", sa.Boolean(), nullable=True),
            sa.Column("cut_to_length_allowed", sa.Boolean(), nullable=True),
            sa.Column("minimum_sale_qty", sa.Float(), nullable=True),
            sa.Column("sale_increment", sa.Float(), nullable=True),
            sa.Column("warranty_months", sa.Integer(), nullable=True),
            sa.Column("serial_tracking_optional", sa.Boolean(), nullable=True),
            sa.Column("contractor_pricing_enabled", sa.Boolean(), nullable=True),
            sa.Column("bulk_pricing_enabled", sa.Boolean(), nullable=True),
            sa.Column("attributes_json", sa.String(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        ],
        "hardware_customer_price": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("customer_id", sa.String(), nullable=False),
            sa.Column("product_id", sa.String(), nullable=False),
            sa.Column("variant_id", sa.String(), nullable=True),
            sa.Column("uom_id", sa.String(), nullable=True),
            sa.Column("unit_price", sa.Float(), nullable=True),
            sa.Column("minimum_qty", sa.Float(), nullable=True),
            sa.Column("effective_from", sa.DateTime(), nullable=True),
            sa.Column("effective_to", sa.DateTime(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        ],
        "hardware_bulk_price_tier": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("product_id", sa.String(), nullable=False),
            sa.Column("variant_id", sa.String(), nullable=True),
            sa.Column("uom_id", sa.String(), nullable=True),
            sa.Column("customer_group", sa.String(), nullable=True),
            sa.Column("min_qty", sa.Float(), nullable=True),
            sa.Column("max_qty", sa.Float(), nullable=True),
            sa.Column("unit_price", sa.Float(), nullable=True),
            sa.Column("effective_from", sa.DateTime(), nullable=True),
            sa.Column("effective_to", sa.DateTime(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        ],
        "hardware_sales_line_extension": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("line_id", sa.String(), nullable=False),
            sa.Column("sales_uom_id", sa.String(), nullable=True),
            sa.Column("entered_qty", sa.Float(), nullable=True),
            sa.Column("conversion_factor", sa.Float(), nullable=True),
            sa.Column("base_qty", sa.Float(), nullable=True),
            sa.Column("base_uom_id", sa.String(), nullable=True),
            sa.Column("price_source", sa.String(), nullable=True),
            sa.Column("unit_price", sa.Float(), nullable=True),
            sa.Column("measurement_mode", sa.String(), nullable=True),
            sa.Column("measurement_meta_json", sa.String(), nullable=True),
            sa.Column("price_override_reason", sa.String(), nullable=True),
        ],
    }

    for name, cols in tables.items():
        if not _has_table(inspector, name):
            op.create_table(name, *cols)

    inspector = sa.inspect(bind)
    indexes = [
        ("product_uom_conversion", "ix_product_uom_conversion_company_id", ["company_id"]),
        ("product_uom_conversion", "ix_product_uom_conversion_product_id", ["product_id"]),
        ("product_uom_conversion", "ix_product_uom_conversion_from_uom_id", ["from_uom_id"]),
        ("product_uom_conversion", "ix_product_uom_conversion_to_uom_id", ["to_uom_id"]),
        ("hardware_product_profile", "ix_hardware_product_profile_company_id", ["company_id"]),
        ("hardware_product_profile", "ix_hardware_product_profile_product_id", ["product_id"]),
        ("hardware_product_profile", "ix_hardware_product_profile_brand_id", ["brand_id"]),
        ("hardware_product_profile", "ix_hardware_product_profile_measurement_mode", ["measurement_mode"]),
        ("hardware_customer_price", "ix_hardware_customer_price_company_id", ["company_id"]),
        ("hardware_customer_price", "ix_hardware_customer_price_customer_id", ["customer_id"]),
        ("hardware_customer_price", "ix_hardware_customer_price_product_id", ["product_id"]),
        ("hardware_bulk_price_tier", "ix_hardware_bulk_price_tier_company_id", ["company_id"]),
        ("hardware_bulk_price_tier", "ix_hardware_bulk_price_tier_product_id", ["product_id"]),
        ("hardware_bulk_price_tier", "ix_hardware_bulk_price_tier_customer_group", ["customer_group"]),
        ("hardware_sales_line_extension", "ix_hardware_sales_line_extension_line_id", ["line_id"]),
    ]
    for table, idx_name, cols in indexes:
        if _has_table(inspector, table) and not _has_index(inspector, table, idx_name):
            op.create_index(idx_name, table, cols)


def downgrade() -> None:
    for table in (
        "hardware_sales_line_extension",
        "hardware_bulk_price_tier",
        "hardware_customer_price",
        "hardware_product_profile",
        "product_uom_conversion",
    ):
        op.drop_table(table)
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if _has_table(inspector, "customer") and _has_column(inspector, "customer", "customer_group"):
        op.drop_index("ix_customer_customer_group", table_name="customer")
        op.drop_column("customer", "customer_group")
    if _has_table(inspector, "product_barcode") and _has_column(inspector, "product_barcode", "uom_id"):
        if _has_index(inspector, "product_barcode", "ix_product_barcode_uom_id"):
            op.drop_index("ix_product_barcode_uom_id", table_name="product_barcode")
        op.drop_column("product_barcode", "packaging_qty")
        op.drop_column("product_barcode", "uom_id")
