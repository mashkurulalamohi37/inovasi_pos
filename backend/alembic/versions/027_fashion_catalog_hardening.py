"""Phase 2 Fashion — unique SKU / variant barcode / size×color indexes."""

from alembic import op
import sqlalchemy as sa

revision = "027_fashion_catalog_hardening"
down_revision = "026_mini_hr_foundation"
branch_labels = None
depends_on = None


def _has_table(inspector, name: str) -> bool:
    return name in inspector.get_table_names()


def _has_index(inspector, table: str, name: str) -> bool:
    return name in {i["name"] for i in inspector.get_indexes(table)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    dialect = bind.dialect.name

    # Tenant-unique product SKU (was non-unique index only).
    if _has_table(inspector, "product") and not _has_index(inspector, "product", "uq_product_company_sku"):
        # Drop non-unique if present to avoid duplicate index noise on some DBs.
        if _has_index(inspector, "product", "ix_product_company_sku"):
            try:
                op.drop_index("ix_product_company_sku", table_name="product")
            except Exception:
                pass
        op.create_index("uq_product_company_sku", "product", ["company_id", "sku"], unique=True)

    # Variant barcode unique per tenant when present (NULLs allowed multiple times on PG).
    if _has_table(inspector, "product_variant") and not _has_index(
        inspector, "product_variant", "uq_product_variant_company_barcode"
    ):
        if dialect == "postgresql":
            op.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_product_variant_company_barcode
                ON product_variant (company_id, barcode)
                WHERE barcode IS NOT NULL AND barcode <> ''
                """
            )
        else:
            op.create_index(
                "uq_product_variant_company_barcode",
                "product_variant",
                ["company_id", "barcode"],
                unique=True,
            )

    # Size×color unique per product (fashion matrix).
    if _has_table(inspector, "product_variant") and not _has_index(
        inspector, "product_variant", "uq_product_variant_product_size_color"
    ):
        if dialect == "postgresql":
            op.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_product_variant_product_size_color
                ON product_variant (company_id, product_id, size, color)
                WHERE size IS NOT NULL AND color IS NOT NULL
                  AND size <> '' AND color <> ''
                """
            )
        else:
            op.create_index(
                "uq_product_variant_product_size_color",
                "product_variant",
                ["company_id", "product_id", "size", "color"],
                unique=True,
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for idx, table in [
        ("uq_product_variant_product_size_color", "product_variant"),
        ("uq_product_variant_company_barcode", "product_variant"),
        ("uq_product_company_sku", "product"),
    ]:
        if _has_table(inspector, table) and _has_index(inspector, table, idx):
            op.drop_index(idx, table_name=table)
