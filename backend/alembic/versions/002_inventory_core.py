"""Inventory core normalization — reservations, balance extensions, policies."""

from alembic import op
import sqlalchemy as sa

revision = "002_inventory_core"
down_revision = "001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("stock_balance")}
    if "qty_reserved" not in cols:
        op.add_column("stock_balance", sa.Column("qty_reserved", sa.Float(), server_default="0", nullable=False))
    if "unit_cost_avg" not in cols:
        op.add_column("stock_balance", sa.Column("unit_cost_avg", sa.Float(), server_default="0", nullable=False))

    if "stock_reservation" not in inspector.get_table_names():
        op.create_table(
            "stock_reservation",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), sa.ForeignKey("company.id"), nullable=False),
            sa.Column("product_id", sa.String(), sa.ForeignKey("product.id"), nullable=False),
            sa.Column("store_id", sa.String(), sa.ForeignKey("store.id"), nullable=True),
            sa.Column("warehouse_id", sa.String(), sa.ForeignKey("warehouse.id"), nullable=True),
            sa.Column("variant_id", sa.String(), nullable=True),
            sa.Column("batch_id", sa.String(), nullable=True),
            sa.Column("serial_id", sa.String(), nullable=True),
            sa.Column("qty", sa.Float(), server_default="0", nullable=False),
            sa.Column("status", sa.String(), server_default="active", nullable=False),
            sa.Column("reference_type", sa.String(), server_default="cart", nullable=False),
            sa.Column("reference_id", sa.String(), nullable=True),
            sa.Column("expires_at", sa.DateTime(), nullable=True),
            sa.Column("created_by", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_stock_reservation_company_id", "stock_reservation", ["company_id"])
        op.create_index("ix_stock_reservation_product_id", "stock_reservation", ["product_id"])


def downgrade() -> None:
    op.drop_table("stock_reservation")
    op.drop_column("stock_balance", "unit_cost_avg")
    op.drop_column("stock_balance", "qty_reserved")
