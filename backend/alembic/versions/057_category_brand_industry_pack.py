"""Add industry_pack column to product_category and brand_master tables."""

from alembic import op
import sqlalchemy as sa

revision = "057_category_brand_industry_pack"
down_revision = "056_screen_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    cat_cols = [c["name"] for c in inspector.get_columns("product_category")]
    if "industry_pack" not in cat_cols:
        op.add_column("product_category", sa.Column("industry_pack", sa.String(length=50), nullable=True, index=True))

    brand_cols = [c["name"] for c in inspector.get_columns("brand_master")]
    if "industry_pack" not in brand_cols:
        op.add_column("brand_master", sa.Column("industry_pack", sa.String(length=50), nullable=True, index=True))


def downgrade() -> None:
    op.drop_column("brand_master", "industry_pack")
    op.drop_column("product_category", "industry_pack")

