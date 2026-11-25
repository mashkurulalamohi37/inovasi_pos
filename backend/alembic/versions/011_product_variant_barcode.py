"""Phase 6A — product variant, barcode tables, search indexes."""

from alembic import op
import sqlalchemy as sa

revision = "011_product_variant_barcode"
down_revision = "010_master_data_hardening"
branch_labels = None
depends_on = None


def _has_table(inspector, name: str) -> bool:
    return name in inspector.get_table_names()


def _has_index(inspector, table: str, name: str) -> bool:
    return name in {i["name"] for i in inspector.get_indexes(table)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _has_table(inspector, "product_variant"):
        op.create_table(
            "product_variant",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), sa.ForeignKey("company.id"), nullable=False),
            sa.Column("product_id", sa.String(), sa.ForeignKey("product.id"), nullable=False),
            sa.Column("variant_code", sa.String(), nullable=False),
            sa.Column("size", sa.String(), nullable=True),
            sa.Column("color", sa.String(), nullable=True),
            sa.Column("style", sa.String(), nullable=True),
            sa.Column("model", sa.String(), nullable=True),
            sa.Column("attributes_json", sa.Text(), nullable=True),
            sa.Column("barcode", sa.String(), nullable=True),
            sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        )

    if not _has_table(inspector, "product_barcode"):
        op.create_table(
            "product_barcode",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), sa.ForeignKey("company.id"), nullable=False),
            sa.Column("product_id", sa.String(), sa.ForeignKey("product.id"), nullable=False),
            sa.Column("variant_id", sa.String(), sa.ForeignKey("product_variant.id"), nullable=True),
            sa.Column("barcode", sa.String(), nullable=False),
            sa.Column("barcode_type", sa.String(), server_default="EAN13", nullable=False),
            sa.Column("is_primary", sa.Boolean(), server_default="false", nullable=False),
            sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
            sa.Column("created_by", sa.String(), sa.ForeignKey("user_account.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        )

    inspector = sa.inspect(bind)
    for idx, table, cols in [
        ("ix_product_variant_company_product", "product_variant", ["company_id", "product_id"]),
        ("ix_product_variant_company_barcode", "product_variant", ["company_id", "barcode"]),
        ("ix_product_barcode_company_barcode", "product_barcode", ["company_id", "barcode"]),
        ("ix_product_barcode_company_product", "product_barcode", ["company_id", "product_id"]),
        ("ix_product_company_sku", "product", ["company_id", "sku"]),
        ("ix_product_company_name", "product", ["company_id", "name"]),
    ]:
        if _has_table(inspector, table) and not _has_index(inspector, table, idx):
            op.create_index(idx, table, cols, unique=False)

    if _has_table(inspector, "product_barcode") and not _has_index(inspector, "product_barcode", "uq_product_barcode_company_barcode"):
        op.create_index("uq_product_barcode_company_barcode", "product_barcode", ["company_id", "barcode"], unique=True)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for idx, table in [
        ("uq_product_barcode_company_barcode", "product_barcode"),
        ("ix_product_barcode_company_product", "product_barcode"),
        ("ix_product_barcode_company_barcode", "product_barcode"),
        ("ix_product_variant_company_barcode", "product_variant"),
        ("ix_product_variant_company_product", "product_variant"),
        ("ix_product_company_name", "product"),
        ("ix_product_company_sku", "product"),
    ]:
        if _has_table(inspector, table) and _has_index(inspector, table, idx):
            op.drop_index(idx, table_name=table)
    if _has_table(inspector, "product_barcode"):
        op.drop_table("product_barcode")
    if _has_table(inspector, "product_variant"):
        op.drop_table("product_variant")
