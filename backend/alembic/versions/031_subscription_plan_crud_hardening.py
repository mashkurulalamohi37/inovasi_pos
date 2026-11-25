"""Harden subscription plan CRUD: indexes, status checks, usage uniqueness."""

from alembic import op
import sqlalchemy as sa

revision = "031_subscription_plan_crud_hardening"
down_revision = "030_purchase_order_meta"
branch_labels = None
depends_on = None


def _has_index(inspector, table: str, name: str) -> bool:
    return any(ix["name"] == name for ix in inspector.get_indexes(table))


def _has_constraint(inspector, table: str, name: str) -> bool:
    return any(c["name"] == name for c in inspector.get_check_constraints(table))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    dialect = bind.dialect.name

    if not _has_index(inspector, "tenant_subscription", "ix_tenant_subscription_plan_id"):
        # plan_id already indexed via Field(index=True) on some DBs; create if missing
        try:
            op.create_index("ix_tenant_subscription_plan_id", "tenant_subscription", ["plan_id"])
        except Exception:
            pass

    if not _has_index(inspector, "subscription_usage", "uq_subscription_usage_company_metric"):
        # Unique (company_id, metric) — drop dupes first if any
        if dialect == "postgresql":
            op.execute(
                """
                DELETE FROM subscription_usage a
                USING subscription_usage b
                WHERE a.id < b.id
                  AND a.company_id = b.company_id
                  AND a.metric = b.metric
                """
            )
            op.create_index(
                "uq_subscription_usage_company_metric",
                "subscription_usage",
                ["company_id", "metric"],
                unique=True,
            )
        else:
            op.execute(
                """
                DELETE FROM subscription_usage
                WHERE id NOT IN (
                  SELECT MAX(id) FROM subscription_usage GROUP BY company_id, metric
                )
                """
            )
            try:
                op.create_index(
                    "uq_subscription_usage_company_metric",
                    "subscription_usage",
                    ["company_id", "metric"],
                    unique=True,
                )
            except Exception:
                pass

    if dialect == "postgresql":
        if not _has_constraint(inspector, "subscription_plan", "ck_subscription_plan_nonneg_limits"):
            op.create_check_constraint(
                "ck_subscription_plan_nonneg_limits",
                "subscription_plan",
                "max_stores >= 0 AND max_counters >= 0 AND max_users >= 0 "
                "AND max_industry_packs >= 0 AND price_monthly >= 0",
            )
        if not _has_constraint(inspector, "tenant_subscription", "ck_tenant_subscription_status"):
            op.create_check_constraint(
                "ck_tenant_subscription_status",
                "tenant_subscription",
                "status IN ('active', 'suspended', 'cancelled', 'pending_approval')",
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    dialect = bind.dialect.name
    if dialect == "postgresql":
        if _has_constraint(inspector, "tenant_subscription", "ck_tenant_subscription_status"):
            op.drop_constraint("ck_tenant_subscription_status", "tenant_subscription", type_="check")
        if _has_constraint(inspector, "subscription_plan", "ck_subscription_plan_nonneg_limits"):
            op.drop_constraint("ck_subscription_plan_nonneg_limits", "subscription_plan", type_="check")
    if _has_index(inspector, "subscription_usage", "uq_subscription_usage_company_metric"):
        op.drop_index("uq_subscription_usage_company_metric", table_name="subscription_usage")
