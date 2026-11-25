"""Phase custom reports — company-scoped report builder definitions."""

from alembic import op
import sqlalchemy as sa

revision = "029_custom_reports"
down_revision = "028_cashier_shifts"
branch_labels = None
depends_on = None


def _has_table(inspector, name: str) -> bool:
    return name in inspector.get_table_names()


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if _has_table(inspector, "custom_report"):
        return
    op.create_table(
        "custom_report",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("company_id", sa.String(), sa.ForeignKey("company.id"), nullable=False, index=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("source_key", sa.String(), nullable=False, index=True),
        sa.Column("columns_json", sa.String(), nullable=False, server_default="[]"),
        sa.Column("column_labels_json", sa.String(), nullable=True),
        sa.Column("default_filters_json", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("created_by", sa.String(), sa.ForeignKey("user_account.id"), nullable=True),
        sa.Column("updated_by", sa.String(), sa.ForeignKey("user_account.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if _has_table(inspector, "custom_report"):
        op.drop_table("custom_report")
