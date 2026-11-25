"""Add damaged + in-transit stock buckets: StockBalance.qty_damaged/qty_in_transit,
StockTransfer.status/received_at/received_by (two-phase dispatch/receive transfers)"""

from alembic import op
import sqlalchemy as sa

revision = "043_damaged_in_transit_buckets"
down_revision = "042_price_list_entry"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    # 001_initial creates every column currently on SQLModel.metadata on a
    # fresh database, so guard against re-adding these on a from-scratch
    # migrate (see 032/036/.../042 for the same pattern).
    balance_cols = {c["name"] for c in inspector.get_columns("stock_balance")}
    if "qty_damaged" not in balance_cols:
        op.add_column("stock_balance", sa.Column("qty_damaged", sa.Float(), nullable=False, server_default="0"))
    if "qty_in_transit" not in balance_cols:
        op.add_column("stock_balance", sa.Column("qty_in_transit", sa.Float(), nullable=False, server_default="0"))

    transfer_cols = {c["name"] for c in inspector.get_columns("stock_transfer")}
    if "status" not in transfer_cols:
        op.add_column("stock_transfer", sa.Column("status", sa.String(), nullable=False, server_default="completed"))
    if "received_at" not in transfer_cols:
        op.add_column("stock_transfer", sa.Column("received_at", sa.DateTime(), nullable=True))
    if "received_by" not in transfer_cols:
        op.add_column("stock_transfer", sa.Column("received_by", sa.String(length=36), nullable=True))


def downgrade() -> None:
    op.drop_column("stock_transfer", "received_by")
    op.drop_column("stock_transfer", "received_at")
    op.drop_column("stock_transfer", "status")
    op.drop_column("stock_balance", "qty_in_transit")
    op.drop_column("stock_balance", "qty_damaged")
