"""Add price_list_entry: effective-dated product price overrides"""

from alembic import op
import sqlalchemy as sa

revision = "042_price_list_entry"
down_revision = "041_customer_loyalty"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    # 001_initial creates every table currently registered on SQLModel.metadata
    # on a fresh database, so guard against re-creating this on a from-scratch
    # migrate (see 032/036/037/038/039/040/041 for the same pattern).
    if "price_list_entry" in inspector.get_table_names():
        return
    op.create_table(
        "price_list_entry",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("company_id", sa.String(length=36), sa.ForeignKey("company.id"), nullable=False),
        sa.Column("store_id", sa.String(length=36), sa.ForeignKey("store.id"), nullable=True),
        sa.Column("product_id", sa.String(length=36), sa.ForeignKey("product.id"), nullable=False),
        sa.Column("price", sa.Float(), nullable=False),
        sa.Column("starts_at", sa.DateTime(), nullable=False),
        sa.Column("ends_at", sa.DateTime(), nullable=True),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("created_by", sa.String(length=36), sa.ForeignKey("user_account.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_price_list_entry_company_id", "price_list_entry", ["company_id"])
    op.create_index("ix_price_list_entry_store_id", "price_list_entry", ["store_id"])
    op.create_index("ix_price_list_entry_product_id", "price_list_entry", ["product_id"])


def downgrade() -> None:
    op.drop_index("ix_price_list_entry_product_id", table_name="price_list_entry")
    op.drop_index("ix_price_list_entry_store_id", table_name="price_list_entry")
    op.drop_index("ix_price_list_entry_company_id", table_name="price_list_entry")
    op.drop_table("price_list_entry")
