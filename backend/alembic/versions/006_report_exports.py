"""Phase 6 reporting — export job tracking."""

from alembic import op
import sqlalchemy as sa

revision = "006_report_exports"
down_revision = "005_integrations_platform"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "report_export" not in tables:
        op.create_table(
            "report_export",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), sa.ForeignKey("company.id"), nullable=False),
            sa.Column("report_key", sa.String(), nullable=False),
            sa.Column("format", sa.String(), server_default="csv", nullable=False),
            sa.Column("status", sa.String(), server_default="completed", nullable=False),
            sa.Column("row_count", sa.Integer(), server_default="0", nullable=False),
            sa.Column("filters_json", sa.String(), nullable=True),
            sa.Column("created_by", sa.String(), nullable=True),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
            sa.Column("error_message", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_report_export_company_id", "report_export", ["company_id"])
        op.create_index("ix_report_export_report_key", "report_export", ["report_key"])


def downgrade() -> None:
    op.drop_table("report_export")
