"""Phase 3 sales hardening — due amounts, customer balance, query indexes."""

from alembic import op
import sqlalchemy as sa

revision = "008_sales_hardening"
down_revision = "007_purchase_hardening"
branch_labels = None
depends_on = None


def _has_column(inspector, table: str, column: str) -> bool:
    return column in {c["name"] for c in inspector.get_columns(table)}


def _has_table(inspector, table: str) -> bool:
    return table in inspector.get_table_names()


def _has_index(inspector, table: str, name: str) -> bool:
    return name in {i["name"] for i in inspector.get_indexes(table)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _has_column(inspector, "sales_invoice", "paid_amount"):
        op.add_column("sales_invoice", sa.Column("paid_amount", sa.Float(), server_default="0", nullable=False))
    if not _has_column(inspector, "sales_invoice", "due_amount"):
        op.add_column("sales_invoice", sa.Column("due_amount", sa.Float(), server_default="0", nullable=False))

    if not _has_column(inspector, "payment", "customer_id"):
        op.add_column("payment", sa.Column("customer_id", sa.String(), nullable=True))
        op.create_foreign_key("fk_payment_customer", "payment", "customer", ["customer_id"], ["id"])

    if not _has_column(inspector, "customer", "credit_limit"):
        op.add_column("customer", sa.Column("credit_limit", sa.Float(), nullable=True))
    if not _has_column(inspector, "customer", "is_active"):
        op.add_column("customer", sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False))

    if not _has_table(inspector, "customer_balance"):
        op.create_table(
            "customer_balance",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("customer_id", sa.String(), nullable=False),
            sa.Column("outstanding", sa.Float(), server_default="0", nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["company_id"], ["company.id"]),
            sa.ForeignKeyConstraint(["customer_id"], ["customer.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    inspector = sa.inspect(bind)
    if _has_table(inspector, "customer_balance") and not _has_index(inspector, "customer_balance", "ix_customer_balance_company_customer"):
        op.create_index("ix_customer_balance_company_customer", "customer_balance", ["company_id", "customer_id"], unique=False)
    if not _has_index(inspector, "sales_invoice", "ix_sales_invoice_company_status"):
        op.create_index("ix_sales_invoice_company_status", "sales_invoice", ["company_id", "status"], unique=False)
    if not _has_index(inspector, "sales_invoice", "ix_sales_invoice_company_customer"):
        op.create_index("ix_sales_invoice_company_customer", "sales_invoice", ["company_id", "customer_id"], unique=False)
    if not _has_index(inspector, "sales_invoice", "ix_sales_invoice_company_created"):
        op.create_index("ix_sales_invoice_company_created", "sales_invoice", ["company_id", "created_at"], unique=False)

    # Backfill paid/due for existing completed sales
    op.execute(
        sa.text(
            "UPDATE sales_invoice SET paid_amount = total, due_amount = 0 "
            "WHERE status = 'completed' AND (paid_amount IS NULL OR paid_amount = 0) AND due_amount = 0"
        )
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if _has_index(inspector, "sales_invoice", "ix_sales_invoice_company_created"):
        op.drop_index("ix_sales_invoice_company_created", table_name="sales_invoice")
    if _has_index(inspector, "sales_invoice", "ix_sales_invoice_company_customer"):
        op.drop_index("ix_sales_invoice_company_customer", table_name="sales_invoice")
    if _has_index(inspector, "sales_invoice", "ix_sales_invoice_company_status"):
        op.drop_index("ix_sales_invoice_company_status", table_name="sales_invoice")
    if _has_index(inspector, "customer_balance", "ix_customer_balance_company_customer"):
        op.drop_index("ix_customer_balance_company_customer", table_name="customer_balance")
    if _has_table(inspector, "customer_balance"):
        op.drop_table("customer_balance")
    if _has_column(inspector, "customer", "is_active"):
        op.drop_column("customer", "is_active")
    if _has_column(inspector, "customer", "credit_limit"):
        op.drop_column("customer", "credit_limit")
    if _has_column(inspector, "payment", "customer_id"):
        op.drop_constraint("fk_payment_customer", "payment", type_="foreignkey")
        op.drop_column("payment", "customer_id")
    if _has_column(inspector, "sales_invoice", "due_amount"):
        op.drop_column("sales_invoice", "due_amount")
    if _has_column(inspector, "sales_invoice", "paid_amount"):
        op.drop_column("sales_invoice", "paid_amount")
