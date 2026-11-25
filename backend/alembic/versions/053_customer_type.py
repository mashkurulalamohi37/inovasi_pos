"""Add customer_type: Employee, Friends, Family, General categorization for customers."""

from alembic import op
import sqlalchemy as sa

revision = "053_customer_type"
down_revision = "052_electronics_emi_status_override_perm"
branch_labels = None
depends_on = None


def _has_table(inspector: sa.engine.reflection.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _has_column(inspector: sa.engine.reflection.Inspector, table_name: str, col_name: str) -> bool:
    return any(c["name"] == col_name for c in inspector.get_columns(table_name))


def _has_index(inspector: sa.engine.reflection.Inspector, table_name: str, index_name: str) -> bool:
    return any(i["name"] == index_name for i in inspector.get_indexes(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_table(inspector, "customer") and not _has_column(inspector, "customer", "customer_type"):
        op.add_column("customer", sa.Column("customer_type", sa.String(), nullable=True, server_default="general"))
        if not _has_index(inspector, "customer", "ix_customer_customer_type"):
            op.create_index("ix_customer_customer_type", "customer", ["customer_type"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_table(inspector, "customer"):
        if _has_index(inspector, "customer", "ix_customer_customer_type"):
            op.drop_index("ix_customer_customer_type", table_name="customer")
        if _has_column(inspector, "customer", "customer_type"):
            op.drop_column("customer", "customer_type")
