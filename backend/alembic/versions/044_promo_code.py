"""Add promo_code: company-defined discount codes redeemable in POS"""

from alembic import op
import sqlalchemy as sa

revision = "044_promo_code"
down_revision = "043_damaged_in_transit_buckets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    # 001_initial creates every table currently registered on SQLModel.metadata
    # on a fresh database, so guard against re-creating this on a from-scratch
    # migrate (see 032/036/.../042 for the same pattern).
    if "promo_code" in inspector.get_table_names():
        return
    op.create_table(
        "promo_code",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("company_id", sa.String(length=36), sa.ForeignKey("company.id"), nullable=False),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("discount_type", sa.String(), nullable=False, server_default="percent"),
        sa.Column("value", sa.Float(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("min_subtotal", sa.Float(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_promo_code_company_id", "promo_code", ["company_id"])
    op.create_index("ix_promo_code_code", "promo_code", ["code"])


def downgrade() -> None:
    op.drop_index("ix_promo_code_code", table_name="promo_code")
    op.drop_index("ix_promo_code_company_id", table_name="promo_code")
    op.drop_table("promo_code")
