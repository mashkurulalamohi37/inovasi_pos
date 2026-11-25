"""Add tenant-unique barcode index on product.

product SKU was already made tenant-unique in 027_fashion_catalog_hardening
(uq_product_company_sku), but barcode uniqueness was only ever enforced on
product_variant, not on the base product table itself — closing that gap
here. Mirrors 027's idempotent, dialect-aware pattern.
"""

from alembic import op
import sqlalchemy as sa

revision = "033_product_sku_barcode_unique"
down_revision = "032_tailoring_advancements"
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

    if _has_table(inspector, "product") and not _has_index(inspector, "product", "uq_product_company_barcode"):
        if dialect == "postgresql":
            op.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_product_company_barcode
                ON product (company_id, barcode)
                WHERE barcode IS NOT NULL AND barcode <> ''
                """
            )
        else:
            op.create_index(
                "uq_product_company_barcode",
                "product",
                ["company_id", "barcode"],
                unique=True,
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if _has_table(inspector, "product") and _has_index(inspector, "product", "uq_product_company_barcode"):
        op.drop_index("uq_product_company_barcode", table_name="product")
