"""Phase 6B-11 — building materials profiles, project sites, orders, deliveries."""

from alembic import op
import sqlalchemy as sa

revision = "022_building_materials_hardening"
down_revision = "021_hardware_hardening"
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
        "building_material_profile": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("product_id", sa.String(), nullable=False),
            sa.Column("brand_id", sa.String(), nullable=True),
            sa.Column("material_type", sa.String(), nullable=True),
            sa.Column("grade", sa.String(), nullable=True),
            sa.Column("specification_json", sa.String(), nullable=True),
            sa.Column("measurement_mode", sa.String(), nullable=True),
            sa.Column("base_uom_id", sa.String(), nullable=True),
            sa.Column("default_sales_uom_id", sa.String(), nullable=True),
            sa.Column("default_purchase_uom_id", sa.String(), nullable=True),
            sa.Column("fractional_qty_allowed", sa.Boolean(), nullable=True),
            sa.Column("minimum_sale_qty", sa.Float(), nullable=True),
            sa.Column("sale_increment", sa.Float(), nullable=True),
            sa.Column("contractor_pricing_enabled", sa.Boolean(), nullable=True),
            sa.Column("bulk_pricing_enabled", sa.Boolean(), nullable=True),
            sa.Column("attributes_json", sa.String(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        ],
        "building_project_site": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("customer_id", sa.String(), nullable=False),
            sa.Column("site_code", sa.String(), nullable=False),
            sa.Column("site_name", sa.String(), nullable=False),
            sa.Column("address", sa.String(), nullable=False),
            sa.Column("contact_phone", sa.String(), nullable=True),
            sa.Column("district", sa.String(), nullable=True),
            sa.Column("thana", sa.String(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        ],
        "building_sales_order": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("store_id", sa.String(), nullable=False),
            sa.Column("order_no", sa.String(), nullable=False),
            sa.Column("customer_id", sa.String(), nullable=True),
            sa.Column("site_id", sa.String(), nullable=True),
            sa.Column("status", sa.String(), nullable=True),
            sa.Column("order_date", sa.DateTime(), nullable=True),
            sa.Column("promised_delivery_date", sa.DateTime(), nullable=True),
            sa.Column("sales_invoice_id", sa.String(), nullable=True),
            sa.Column("subtotal", sa.Float(), nullable=True),
            sa.Column("discount", sa.Float(), nullable=True),
            sa.Column("tax", sa.Float(), nullable=True),
            sa.Column("total", sa.Float(), nullable=True),
            sa.Column("notes", sa.String(), nullable=True),
            sa.Column("cancel_reason", sa.String(), nullable=True),
            sa.Column("created_by", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        ],
        "building_sales_order_line": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("order_id", sa.String(), nullable=False),
            sa.Column("product_id", sa.String(), nullable=False),
            sa.Column("variant_id", sa.String(), nullable=True),
            sa.Column("sku", sa.String(), nullable=True),
            sa.Column("product_name", sa.String(), nullable=True),
            sa.Column("sales_uom_id", sa.String(), nullable=True),
            sa.Column("entered_qty", sa.Float(), nullable=True),
            sa.Column("conversion_factor", sa.Float(), nullable=True),
            sa.Column("base_qty", sa.Float(), nullable=True),
            sa.Column("base_uom_id", sa.String(), nullable=True),
            sa.Column("unit_price", sa.Float(), nullable=True),
            sa.Column("discount", sa.Float(), nullable=True),
            sa.Column("line_total", sa.Float(), nullable=True),
            sa.Column("price_source", sa.String(), nullable=True),
            sa.Column("dispatched_base_qty", sa.Float(), nullable=True),
            sa.Column("delivered_base_qty", sa.Float(), nullable=True),
            sa.Column("cancelled_base_qty", sa.Float(), nullable=True),
            sa.Column("returned_base_qty", sa.Float(), nullable=True),
            sa.Column("price_override_reason", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        ],
        "building_delivery": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("store_id", sa.String(), nullable=False),
            sa.Column("order_id", sa.String(), nullable=False),
            sa.Column("delivery_no", sa.String(), nullable=False),
            sa.Column("site_id", sa.String(), nullable=True),
            sa.Column("status", sa.String(), nullable=True),
            sa.Column("stock_posted", sa.Boolean(), nullable=True),
            sa.Column("scheduled_date", sa.DateTime(), nullable=True),
            sa.Column("dispatched_at", sa.DateTime(), nullable=True),
            sa.Column("delivered_at", sa.DateTime(), nullable=True),
            sa.Column("driver_name", sa.String(), nullable=True),
            sa.Column("vehicle_no", sa.String(), nullable=True),
            sa.Column("challan_no", sa.String(), nullable=True),
            sa.Column("notes", sa.String(), nullable=True),
            sa.Column("fail_reason", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        ],
        "building_delivery_line": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("delivery_id", sa.String(), nullable=False),
            sa.Column("order_line_id", sa.String(), nullable=False),
            sa.Column("product_id", sa.String(), nullable=False),
            sa.Column("planned_sales_uom_id", sa.String(), nullable=True),
            sa.Column("planned_qty", sa.Float(), nullable=True),
            sa.Column("planned_base_qty", sa.Float(), nullable=True),
            sa.Column("dispatched_base_qty", sa.Float(), nullable=True),
            sa.Column("delivered_base_qty", sa.Float(), nullable=True),
            sa.Column("returned_base_qty", sa.Float(), nullable=True),
        ],
    }

    for name, cols in tables.items():
        if not _has_table(inspector, name):
            op.create_table(name, *cols)

    inspector = sa.inspect(bind)
    indexes = [
        ("building_material_profile", "ix_building_material_profile_company_id", ["company_id"]),
        ("building_material_profile", "ix_building_material_profile_product_id", ["product_id"]),
        ("building_material_profile", "ix_building_material_profile_brand_id", ["brand_id"]),
        ("building_material_profile", "ix_building_material_profile_material_type", ["material_type"]),
        ("building_material_profile", "ix_building_material_profile_measurement_mode", ["measurement_mode"]),
        ("building_material_profile", "ix_building_material_profile_base_uom_id", ["base_uom_id"]),
        ("building_project_site", "ix_building_project_site_company_id", ["company_id"]),
        ("building_project_site", "ix_building_project_site_customer_id", ["customer_id"]),
        ("building_project_site", "ix_building_project_site_site_code", ["site_code"]),
        ("building_sales_order", "ix_building_sales_order_company_id", ["company_id"]),
        ("building_sales_order", "ix_building_sales_order_store_id", ["store_id"]),
        ("building_sales_order", "ix_building_sales_order_order_no", ["order_no"]),
        ("building_sales_order", "ix_building_sales_order_customer_id", ["customer_id"]),
        ("building_sales_order", "ix_building_sales_order_site_id", ["site_id"]),
        ("building_sales_order", "ix_building_sales_order_status", ["status"]),
        ("building_sales_order", "ix_building_sales_order_order_date", ["order_date"]),
        ("building_sales_order", "ix_building_sales_order_sales_invoice_id", ["sales_invoice_id"]),
        ("building_sales_order_line", "ix_building_sales_order_line_order_id", ["order_id"]),
        ("building_sales_order_line", "ix_building_sales_order_line_product_id", ["product_id"]),
        ("building_delivery", "ix_building_delivery_company_id", ["company_id"]),
        ("building_delivery", "ix_building_delivery_store_id", ["store_id"]),
        ("building_delivery", "ix_building_delivery_order_id", ["order_id"]),
        ("building_delivery", "ix_building_delivery_delivery_no", ["delivery_no"]),
        ("building_delivery", "ix_building_delivery_site_id", ["site_id"]),
        ("building_delivery", "ix_building_delivery_status", ["status"]),
        ("building_delivery_line", "ix_building_delivery_line_delivery_id", ["delivery_id"]),
        ("building_delivery_line", "ix_building_delivery_line_order_line_id", ["order_line_id"]),
        ("building_delivery_line", "ix_building_delivery_line_product_id", ["product_id"]),
    ]
    for table, idx_name, cols in indexes:
        if _has_table(inspector, table) and not _has_index(inspector, table, idx_name):
            op.create_index(idx_name, table, cols)


def downgrade() -> None:
    for table in (
        "building_delivery_line",
        "building_delivery",
        "building_sales_order_line",
        "building_sales_order",
        "building_project_site",
        "building_material_profile",
    ):
        op.drop_table(table)
