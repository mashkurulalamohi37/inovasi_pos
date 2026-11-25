"""Add batch_no and expiry_date columns to purchase_invoice_line table."""

from alembic import op
import sqlalchemy as sa

revision = "058_purchase_line_batch_expiry"
down_revision = "057_category_brand_industry_pack"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    line_cols = [c["name"] for c in inspector.get_columns("purchase_invoice_line")]
    if "batch_no" not in line_cols:
        op.add_column("purchase_invoice_line", sa.Column("batch_no", sa.String(length=100), nullable=True))
    if "expiry_date" not in line_cols:
        op.add_column("purchase_invoice_line", sa.Column("expiry_date", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("purchase_invoice_line", "expiry_date")
    op.drop_column("purchase_invoice_line", "batch_no")

