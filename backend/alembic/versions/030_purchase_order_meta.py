"""Purchase order metadata — expected delivery date and supplier reference no."""

from alembic import op
import sqlalchemy as sa

revision = "030_purchase_order_meta"
down_revision = "029_custom_reports"
branch_labels = None
depends_on = None


def _has_column(inspector, table: str, column: str) -> bool:
    return any(c["name"] == column for c in inspector.get_columns(table))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not _has_column(inspector, "purchase_invoice", "expected_date"):
        op.add_column("purchase_invoice", sa.Column("expected_date", sa.DateTime(), nullable=True))
    if not _has_column(inspector, "purchase_invoice", "reference_no"):
        op.add_column("purchase_invoice", sa.Column("reference_no", sa.String(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if _has_column(inspector, "purchase_invoice", "reference_no"):
        op.drop_column("purchase_invoice", "reference_no")
    if _has_column(inspector, "purchase_invoice", "expected_date"):
        op.drop_column("purchase_invoice", "expected_date")
