"""Create time_pricing_rule table for time-based fresh food markdown and happy hour pricing."""

from alembic import op
import sqlalchemy as sa

revision = "055_time_pricing_rules"
down_revision = "054_customer_custom_discount"
branch_labels = None
depends_on = None


def _has_table(inspector: sa.engine.reflection.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _has_table(inspector, "time_pricing_rule"):
        op.create_table(
            "time_pricing_rule",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("company_id", sa.String(length=36), sa.ForeignKey("company.id"), nullable=False, index=True),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("discount_type", sa.String(length=50), nullable=False, server_default="half_price"),
            sa.Column("discount_value", sa.Float(), nullable=False, server_default="50.0"),
            sa.Column("start_time", sa.String(length=10), nullable=False, server_default="20:00"),
            sa.Column("end_time", sa.String(length=10), nullable=False, server_default="23:59"),
            sa.Column("days_of_week_json", sa.Text(), nullable=True, server_default="[0,1,2,3,4,5,6]"),
            sa.Column("category_ids_json", sa.Text(), nullable=True, server_default="[]"),
            sa.Column("product_ids_json", sa.Text(), nullable=True, server_default="[]"),
            sa.Column("industry_pack", sa.String(length=50), nullable=True, server_default="all"),
            sa.Column("badge_label", sa.String(length=100), nullable=True, server_default="⚡ 50% Fresh Clearance"),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_table(inspector, "time_pricing_rule"):
        op.drop_table("time_pricing_rule")
