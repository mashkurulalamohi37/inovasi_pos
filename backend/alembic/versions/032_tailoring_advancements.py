"""Add tailoring advancements tables: tailor_commission_ledger and customer_fabric_intake"""

from alembic import op
import sqlalchemy as sa

revision = "032_tailoring_advancements"
down_revision = "031_subscription_plan_crud_hardening"
branch_labels = None
depends_on = None


def _has_table(inspector, name: str) -> bool:
    return name in inspector.get_table_names()


def _has_index(inspector, table: str, name: str) -> bool:
    return name in {i["name"] for i in inspector.get_indexes(table)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # 001_initial creates every table currently registered on SQLModel.metadata
    # (including these two, added in the same commit as this migration) on a
    # fresh database, so guard every create here the same way every other
    # "new table" migration in this history does.
    if not _has_table(inspector, "tailor_commission_ledger"):
        op.create_table(
            "tailor_commission_ledger",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("company_id", sa.String(length=36), sa.ForeignKey("company.id"), nullable=False),
            sa.Column("tailor_name", sa.String(), nullable=False),
            sa.Column("job_id", sa.String(length=36), sa.ForeignKey("tailoring_alteration_job.id"), nullable=False),
            sa.Column("job_amount", sa.Float(), nullable=False, server_default="0.0"),
            sa.Column("commission_pct", sa.Float(), nullable=False, server_default="15.0"),
            sa.Column("payout_amount", sa.Float(), nullable=False, server_default="0.0"),
            sa.Column("status", sa.String(), nullable=False, server_default="unpaid"),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        inspector = sa.inspect(bind)
    if not _has_index(inspector, "tailor_commission_ledger", "ix_tailor_commission_ledger_company_id"):
        op.create_index("ix_tailor_commission_ledger_company_id", "tailor_commission_ledger", ["company_id"])
    if not _has_index(inspector, "tailor_commission_ledger", "ix_tailor_commission_ledger_tailor_name"):
        op.create_index("ix_tailor_commission_ledger_tailor_name", "tailor_commission_ledger", ["tailor_name"])
    if not _has_index(inspector, "tailor_commission_ledger", "ix_tailor_commission_ledger_job_id"):
        op.create_index("ix_tailor_commission_ledger_job_id", "tailor_commission_ledger", ["job_id"])

    if not _has_table(inspector, "customer_fabric_intake"):
        op.create_table(
            "customer_fabric_intake",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("company_id", sa.String(length=36), sa.ForeignKey("company.id"), nullable=False),
            sa.Column("customer_name", sa.String(), nullable=False),
            sa.Column("customer_phone", sa.String(), nullable=False),
            sa.Column("description", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False, server_default="received"),
            sa.Column("job_id", sa.String(length=36), sa.ForeignKey("tailoring_alteration_job.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        inspector = sa.inspect(bind)
    if not _has_index(inspector, "customer_fabric_intake", "ix_customer_fabric_intake_company_id"):
        op.create_index("ix_customer_fabric_intake_company_id", "customer_fabric_intake", ["company_id"])
    if not _has_index(inspector, "customer_fabric_intake", "ix_customer_fabric_intake_job_id"):
        op.create_index("ix_customer_fabric_intake_job_id", "customer_fabric_intake", ["job_id"])


def downgrade() -> None:
    op.drop_index("ix_customer_fabric_intake_job_id", table_name="customer_fabric_intake")
    op.drop_index("ix_customer_fabric_intake_company_id", table_name="customer_fabric_intake")
    op.drop_table("customer_fabric_intake")

    op.drop_index("ix_tailor_commission_ledger_job_id", table_name="tailor_commission_ledger")
    op.drop_index("ix_tailor_commission_ledger_tailor_name", table_name="tailor_commission_ledger")
    op.drop_index("ix_tailor_commission_ledger_company_id", table_name="tailor_commission_ledger")
    op.drop_table("tailor_commission_ledger")
