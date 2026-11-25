"""Add custom_discount_pct to customer table for customer-wise customized discounts."""

from alembic import op
import sqlalchemy as sa

revision = "054_customer_custom_discount"
down_revision = "053_customer_type"
branch_labels = None
depends_on = None


def _has_table(inspector: sa.engine.reflection.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _has_column(inspector: sa.engine.reflection.Inspector, table_name: str, col_name: str) -> bool:
    return any(c["name"] == col_name for c in inspector.get_columns(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_table(inspector, "customer") and not _has_column(inspector, "customer", "custom_discount_pct"):
        op.add_column("customer", sa.Column("custom_discount_pct", sa.Float(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_table(inspector, "customer") and _has_column(inspector, "customer", "custom_discount_pct"):
        op.drop_column("customer", "custom_discount_pct")
