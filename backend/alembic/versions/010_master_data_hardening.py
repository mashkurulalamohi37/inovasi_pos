"""Phase 5 master data — is_active flags, company profile, supplier fields, indexes."""

from alembic import op
import sqlalchemy as sa

revision = "010_master_data_hardening"
down_revision = "009_reporting_indexes"
branch_labels = None
depends_on = None


def _has_column(inspector, table: str, column: str) -> bool:
    return column in {c["name"] for c in inspector.get_columns(table)}


def _has_index(inspector, table: str, name: str) -> bool:
    return name in {i["name"] for i in inspector.get_indexes(table)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    for table in ("product_category", "brand_master", "unit"):
        if not _has_column(inspector, table, "is_active"):
            op.add_column(table, sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False))

    inspector = sa.inspect(bind)
    for col, table in [
        ("email", "supplier"),
        ("contact_person", "supplier"),
        ("address", "supplier"),
        ("is_active", "supplier"),
    ]:
        if not _has_column(inspector, table, col):
            if col == "is_active":
                op.add_column(table, sa.Column(col, sa.Boolean(), server_default="true", nullable=False))
            else:
                op.add_column(table, sa.Column(col, sa.String(), nullable=True))

    inspector = sa.inspect(bind)
    for col, default in [
        ("address", None),
        ("phone", None),
        ("email", None),
        ("currency", "BDT"),
        ("timezone", "Asia/Dhaka"),
    ]:
        if not _has_column(inspector, "company", col):
            op.add_column(
                "company",
                sa.Column(col, sa.String(), server_default=default, nullable=True) if default else sa.Column(col, sa.String(), nullable=True),
            )

    inspector = sa.inspect(bind)
    if not _has_column(inspector, "tax_rule", "is_default"):
        op.add_column("tax_rule", sa.Column("is_default", sa.Boolean(), server_default="false", nullable=False))

    inspector = sa.inspect(bind)
    if not _has_index(inspector, "product_category", "ix_product_category_company_name"):
        op.create_index("ix_product_category_company_name", "product_category", ["company_id", "name"], unique=False)
    if not _has_index(inspector, "brand_master", "ix_brand_master_company_name"):
        op.create_index("ix_brand_master_company_name", "brand_master", ["company_id", "name"], unique=False)
    if not _has_index(inspector, "customer", "ix_customer_company_phone"):
        op.create_index("ix_customer_company_phone", "customer", ["company_id", "phone"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for table, idx in [
        ("customer", "ix_customer_company_phone"),
        ("brand_master", "ix_brand_master_company_name"),
        ("product_category", "ix_product_category_company_name"),
    ]:
        if _has_index(inspector, table, idx):
            op.drop_index(idx, table_name=table)
    for table, col in [
        ("tax_rule", "is_default"),
        ("company", "timezone"),
        ("company", "currency"),
        ("company", "email"),
        ("company", "phone"),
        ("company", "address"),
        ("supplier", "is_active"),
        ("supplier", "address"),
        ("supplier", "contact_person"),
        ("supplier", "email"),
        ("unit", "is_active"),
        ("brand_master", "is_active"),
        ("product_category", "is_active"),
    ]:
        inspector = sa.inspect(bind)
        if _has_column(inspector, table, col):
            op.drop_column(table, col)
