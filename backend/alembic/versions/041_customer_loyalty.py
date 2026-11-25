"""Add customer loyalty points: Customer.preferred_size/loyalty_points + customer_loyalty_ledger"""

from alembic import op
import sqlalchemy as sa

revision = "041_customer_loyalty"
down_revision = "040_fashion_offer_bygo_stacking"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    # 001_initial creates every column/table currently on SQLModel.metadata on a
    # fresh database, so guard against re-adding these on a from-scratch migrate
    # (see 032/036/037/038/039/040 for the same pattern and why it's needed).
    cols = {c["name"] for c in inspector.get_columns("customer")}
    if "preferred_size" not in cols:
        op.add_column("customer", sa.Column("preferred_size", sa.String(), nullable=True))
    if "loyalty_points" not in cols:
        op.add_column(
            "customer",
            sa.Column("loyalty_points", sa.Float(), nullable=False, server_default="0"),
        )

    if "customer_loyalty_ledger" not in inspector.get_table_names():
        op.create_table(
            "customer_loyalty_ledger",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("company_id", sa.String(length=36), sa.ForeignKey("company.id"), nullable=False),
            sa.Column("customer_id", sa.String(length=36), sa.ForeignKey("customer.id"), nullable=False),
            sa.Column("delta", sa.Float(), nullable=False),
            sa.Column("reason", sa.String(), nullable=False),
            sa.Column("reference_type", sa.String(), nullable=True),
            sa.Column("reference_id", sa.String(), nullable=True),
            sa.Column("created_by", sa.String(length=36), sa.ForeignKey("user_account.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_customer_loyalty_ledger_company_id", "customer_loyalty_ledger", ["company_id"])
        op.create_index("ix_customer_loyalty_ledger_customer_id", "customer_loyalty_ledger", ["customer_id"])


def downgrade() -> None:
    op.drop_index("ix_customer_loyalty_ledger_customer_id", table_name="customer_loyalty_ledger")
    op.drop_index("ix_customer_loyalty_ledger_company_id", table_name="customer_loyalty_ledger")
    op.drop_table("customer_loyalty_ledger")
    op.drop_column("customer", "loyalty_points")
    op.drop_column("customer", "preferred_size")
