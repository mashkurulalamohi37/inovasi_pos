"""Add accounting_settings — company-level books lock date"""

from alembic import op
import sqlalchemy as sa

revision = "039_accounting_settings"
down_revision = "038_payment_method_linked_account"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    # 001_initial creates every table currently registered on SQLModel.metadata
    # on a fresh database, so guard against re-creating this on a from-scratch
    # migrate (see the same pattern in 026/028/etc.).
    if "accounting_settings" in inspector.get_table_names():
        return
    op.create_table(
        "accounting_settings",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("company_id", sa.String(length=36), sa.ForeignKey("company.id"), nullable=False),
        sa.Column("books_locked_before", sa.DateTime(), nullable=True),
        sa.Column("updated_by", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_id"),
    )
    op.create_index("ix_accounting_settings_company_id", "accounting_settings", ["company_id"])


def downgrade() -> None:
    op.drop_index("ix_accounting_settings_company_id", table_name="accounting_settings")
    op.drop_table("accounting_settings")
