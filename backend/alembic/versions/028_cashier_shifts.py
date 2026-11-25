"""Phase 4 Fashion — cashier shifts + sales_invoice.shift_id."""

from alembic import op
import sqlalchemy as sa

revision = "028_cashier_shifts"
down_revision = "027_fashion_catalog_hardening"
branch_labels = None
depends_on = None


def _has_table(inspector, name: str) -> bool:
    return name in inspector.get_table_names()


def _has_column(inspector, table: str, column: str) -> bool:
    return column in {c["name"] for c in inspector.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _has_table(inspector, "cashier_shift"):
        op.create_table(
            "cashier_shift",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), sa.ForeignKey("company.id"), nullable=False, index=True),
            sa.Column("store_id", sa.String(), sa.ForeignKey("store.id"), nullable=False, index=True),
            sa.Column("counter_id", sa.String(), sa.ForeignKey("counter.id"), nullable=True),
            sa.Column("cashier_id", sa.String(), sa.ForeignKey("user_account.id"), nullable=False, index=True),
            sa.Column("status", sa.String(), nullable=False, server_default="open"),
            sa.Column("opened_at", sa.DateTime(), nullable=False),
            sa.Column("opening_float", sa.Float(), nullable=False, server_default="0"),
            sa.Column("closed_at", sa.DateTime(), nullable=True),
            sa.Column("closing_counted", sa.Float(), nullable=True),
            sa.Column("expected_cash", sa.Float(), nullable=True),
            sa.Column("variance", sa.Float(), nullable=True),
            sa.Column("notes", sa.String(), nullable=True),
            sa.Column("closed_by", sa.String(), sa.ForeignKey("user_account.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )

    inspector = sa.inspect(bind)
    if _has_table(inspector, "sales_invoice") and not _has_column(inspector, "sales_invoice", "shift_id"):
        op.add_column(
            "sales_invoice",
            sa.Column("shift_id", sa.String(), sa.ForeignKey("cashier_shift.id"), nullable=True),
        )
        op.create_index("ix_sales_invoice_shift_id", "sales_invoice", ["shift_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if _has_table(inspector, "sales_invoice") and _has_column(inspector, "sales_invoice", "shift_id"):
        op.drop_index("ix_sales_invoice_shift_id", table_name="sales_invoice")
        op.drop_column("sales_invoice", "shift_id")
    if _has_table(inspector, "cashier_shift"):
        op.drop_table("cashier_shift")
