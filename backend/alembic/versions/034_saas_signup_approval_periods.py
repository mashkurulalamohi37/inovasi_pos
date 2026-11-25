"""Tenant signup approval + subscription billing period fields."""

from alembic import op
import sqlalchemy as sa

revision = "034_saas_signup_approval_periods"
down_revision = "033_product_sku_barcode_unique"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("company")}
    if "approval_status" not in cols:
        op.add_column(
            "company",
            sa.Column("approval_status", sa.String(), server_default="approved", nullable=False),
        )
    if "approved_at" not in cols:
        op.add_column("company", sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True))
    if "approved_by" not in cols:
        op.add_column("company", sa.Column("approved_by", sa.String(), nullable=True))
    if "rejection_reason" not in cols:
        op.add_column("company", sa.Column("rejection_reason", sa.String(), nullable=True))

    sub_cols = {c["name"] for c in inspector.get_columns("tenant_subscription")}
    if "billing_cycle" not in sub_cols:
        op.add_column(
            "tenant_subscription",
            sa.Column("billing_cycle", sa.String(), server_default="monthly", nullable=False),
        )

    # Existing tenants remain approved
    op.execute("UPDATE company SET approval_status = 'approved' WHERE approval_status IS NULL OR approval_status = ''")


def downgrade() -> None:
    op.drop_column("tenant_subscription", "billing_cycle")
    op.drop_column("company", "rejection_reason")
    op.drop_column("company", "approved_by")
    op.drop_column("company", "approved_at")
    op.drop_column("company", "approval_status")
