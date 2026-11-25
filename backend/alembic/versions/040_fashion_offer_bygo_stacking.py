"""Add fashion_offer BYGO + stacking fields: offer_type, buy_qty, get_qty, get_discount_pct, stackable"""

from alembic import op
import sqlalchemy as sa

revision = "040_fashion_offer_bygo_stacking"
down_revision = "039_accounting_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    # 001_initial creates every column currently on SQLModel.metadata's FashionOffer
    # on a fresh database, so guard against re-adding these on a from-scratch migrate
    # (see 032/036/037/038/039 for the same pattern and why it's needed).
    cols = {c["name"] for c in inspector.get_columns("fashion_offer")}

    if "offer_type" not in cols:
        op.add_column(
            "fashion_offer",
            sa.Column("offer_type", sa.String(), nullable=False, server_default="percent"),
        )
    if "buy_qty" not in cols:
        op.add_column("fashion_offer", sa.Column("buy_qty", sa.Integer(), nullable=True))
    if "get_qty" not in cols:
        op.add_column("fashion_offer", sa.Column("get_qty", sa.Integer(), nullable=True))
    if "get_discount_pct" not in cols:
        op.add_column("fashion_offer", sa.Column("get_discount_pct", sa.Float(), nullable=True))
    if "stackable" not in cols:
        op.add_column(
            "fashion_offer",
            sa.Column("stackable", sa.Boolean(), nullable=False, server_default=sa.false()),
        )


def downgrade() -> None:
    op.drop_column("fashion_offer", "stackable")
    op.drop_column("fashion_offer", "get_discount_pct")
    op.drop_column("fashion_offer", "get_qty")
    op.drop_column("fashion_offer", "buy_qty")
    op.drop_column("fashion_offer", "offer_type")
