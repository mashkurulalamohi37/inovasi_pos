"""Add customer_advance: advance payments received from customers ahead of invoicing"""

from alembic import op
import sqlalchemy as sa

revision = "045_customer_advance"
down_revision = "044_promo_code"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    # 001_initial creates every table currently registered on SQLModel.metadata
    # on a fresh database, so guard against re-creating this on a from-scratch
    # migrate (see 032/036/.../044 for the same pattern).
    if "customer_advance" in inspector.get_table_names():
        return
    op.create_table(
        "customer_advance",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("company_id", sa.String(length=36), sa.ForeignKey("company.id"), nullable=False),
        sa.Column("customer_id", sa.String(length=36), sa.ForeignKey("customer.id"), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False, server_default="0"),
        sa.Column("applied_amount", sa.Float(), nullable=False, server_default="0"),
        sa.Column("advance_date", sa.DateTime(), nullable=False),
        sa.Column("note", sa.String(), nullable=True),
        sa.Column("created_by", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_customer_advance_company_id", "customer_advance", ["company_id"])
    op.create_index("ix_customer_advance_customer_id", "customer_advance", ["customer_id"])


def downgrade() -> None:
    op.drop_index("ix_customer_advance_customer_id", table_name="customer_advance")
    op.drop_index("ix_customer_advance_company_id", table_name="customer_advance")
    op.drop_table("customer_advance")
