"""Phase 6B-14 — cosmetics profiles, batches, testers, sales line extensions."""

from alembic import op
import sqlalchemy as sa

revision = "025_cosmetics_hardening"
down_revision = "024_stationery_hardening"
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
        "cosmetics_product_profile": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("product_id", sa.String(), nullable=False),
            sa.Column("brand_id", sa.String(), nullable=True),
            sa.Column("product_type", sa.String(), nullable=True),
            sa.Column("product_category", sa.String(), nullable=True),
            sa.Column("finish", sa.String(), nullable=True),
            sa.Column("shade_family", sa.String(), nullable=True),
            sa.Column("size_value", sa.Float(), nullable=True),
            sa.Column("size_uom", sa.String(), nullable=True),
            sa.Column("batch_tracked", sa.Boolean(), nullable=True),
            sa.Column("expiry_tracked", sa.Boolean(), nullable=True),
            sa.Column("tester_allowed", sa.Boolean(), nullable=True),
            sa.Column("sample_allowed", sa.Boolean(), nullable=True),
            sa.Column("near_expiry_warning_days", sa.Integer(), nullable=True),
            sa.Column("period_after_opening_months", sa.Integer(), nullable=True),
            sa.Column("manufacturer_name", sa.String(), nullable=True),
            sa.Column("country_of_origin", sa.String(), nullable=True),
            sa.Column("attributes_json", sa.String(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        ],
        "cosmetics_batch": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("product_id", sa.String(), nullable=False),
            sa.Column("variant_id", sa.String(), nullable=True),
            sa.Column("store_id", sa.String(), nullable=True),
            sa.Column("supplier_id", sa.String(), nullable=True),
            sa.Column("batch_no", sa.String(), nullable=False),
            sa.Column("lot_no", sa.String(), nullable=True),
            sa.Column("manufacture_date", sa.DateTime(), nullable=True),
            sa.Column("expiry_date", sa.DateTime(), nullable=True),
            sa.Column("received_date", sa.DateTime(), nullable=True),
            sa.Column("purchase_id", sa.String(), nullable=True),
            sa.Column("receive_id", sa.String(), nullable=True),
            sa.Column("qty_on_hand", sa.Float(), nullable=True),
            sa.Column("status", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        ],
        "cosmetics_tester_balance": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("product_id", sa.String(), nullable=False),
            sa.Column("variant_id", sa.String(), nullable=True),
            sa.Column("store_id", sa.String(), nullable=True),
            sa.Column("batch_id", sa.String(), nullable=True),
            sa.Column("qty", sa.Float(), nullable=True),
            sa.Column("status", sa.String(), nullable=True),
            sa.Column("reason", sa.String(), nullable=True),
            sa.Column("converted_by", sa.String(), nullable=True),
            sa.Column("converted_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        ],
        "cosmetics_sales_line_extension": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("line_id", sa.String(), nullable=False),
            sa.Column("variant_id", sa.String(), nullable=True),
            sa.Column("batch_id", sa.String(), nullable=True),
            sa.Column("batch_no", sa.String(), nullable=True),
            sa.Column("expiry_date", sa.DateTime(), nullable=True),
            sa.Column("shade", sa.String(), nullable=True),
            sa.Column("size", sa.String(), nullable=True),
            sa.Column("price_source", sa.String(), nullable=True),
        ],
    }

    for name, cols in tables.items():
        if not _has_table(inspector, name):
            op.create_table(name, *cols)

    inspector = sa.inspect(bind)
    indexes = [
        ("cosmetics_product_profile", "ix_cosmetics_product_profile_company_id", ["company_id"]),
        ("cosmetics_product_profile", "ix_cosmetics_product_profile_product_id", ["product_id"]),
        ("cosmetics_product_profile", "ix_cosmetics_product_profile_brand_id", ["brand_id"]),
        ("cosmetics_product_profile", "ix_cosmetics_product_profile_product_type", ["product_type"]),
        ("cosmetics_product_profile", "ix_cosmetics_product_profile_shade_family", ["shade_family"]),
        ("cosmetics_batch", "ix_cosmetics_batch_company_id", ["company_id"]),
        ("cosmetics_batch", "ix_cosmetics_batch_product_id", ["product_id"]),
        ("cosmetics_batch", "ix_cosmetics_batch_variant_id", ["variant_id"]),
        ("cosmetics_batch", "ix_cosmetics_batch_store_id", ["store_id"]),
        ("cosmetics_batch", "ix_cosmetics_batch_batch_no", ["batch_no"]),
        ("cosmetics_batch", "ix_cosmetics_batch_expiry_date", ["expiry_date"]),
        ("cosmetics_batch", "ix_cosmetics_batch_status", ["status"]),
        ("cosmetics_tester_balance", "ix_cosmetics_tester_balance_company_id", ["company_id"]),
        ("cosmetics_tester_balance", "ix_cosmetics_tester_balance_product_id", ["product_id"]),
        ("cosmetics_tester_balance", "ix_cosmetics_tester_balance_store_id", ["store_id"]),
        ("cosmetics_tester_balance", "ix_cosmetics_tester_balance_status", ["status"]),
        ("cosmetics_sales_line_extension", "ix_cosmetics_sales_line_extension_line_id", ["line_id"]),
    ]
    for table, idx_name, cols in indexes:
        if _has_table(inspector, table) and not _has_index(inspector, table, idx_name):
            op.create_index(idx_name, table, cols)


def downgrade() -> None:
    for table in (
        "cosmetics_sales_line_extension",
        "cosmetics_tester_balance",
        "cosmetics_batch",
        "cosmetics_product_profile",
    ):
        op.drop_table(table)
