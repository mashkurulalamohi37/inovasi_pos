"""Phase 4 reporting indexes for stock balance, ledger, and sales/purchase queries."""

from alembic import op
import sqlalchemy as sa

revision = "009_reporting_indexes"
down_revision = "008_sales_hardening"
branch_labels = None
depends_on = None


def _has_index(inspector, table: str, name: str) -> bool:
    return name in {i["name"] for i in inspector.get_indexes(table)}


def _has_table(inspector, table: str) -> bool:
    return table in inspector.get_table_names()


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _has_index(inspector, "stock_ledger", "ix_stock_ledger_company_store_product_date"):
        op.create_index(
            "ix_stock_ledger_company_store_product_date",
            "stock_ledger",
            ["company_id", "store_id", "product_id", "created_at"],
            unique=False,
        )
    if not _has_index(inspector, "purchase_invoice", "ix_purchase_invoice_company_date"):
        op.create_index(
            "ix_purchase_invoice_company_date",
            "purchase_invoice",
            ["company_id", "purchase_date"],
            unique=False,
        )
    if not _has_index(inspector, "purchase_receive", "ix_purchase_receive_company_date"):
        op.create_index(
            "ix_purchase_receive_company_date",
            "purchase_receive",
            ["company_id", "received_at"],
            unique=False,
        )
    if not _has_index(inspector, "sales_return", "ix_sales_return_company_date"):
        op.create_index(
            "ix_sales_return_company_date",
            "sales_return",
            ["company_id", "returned_at"],
            unique=False,
        )

    # Backfill customer_balance from outstanding sales dues (existing deployments)
    if _has_table(inspector, "customer_balance") and _has_table(inspector, "sales_invoice"):
        conn = op.get_bind()
        agg = conn.execute(
            sa.text(
                """
                SELECT company_id, customer_id, SUM(due_amount) AS outstanding
                FROM sales_invoice
                WHERE customer_id IS NOT NULL
                  AND status = 'completed'
                  AND due_amount > 0
                GROUP BY company_id, customer_id
                """
            )
        ).fetchall()
        import uuid

        for company_id, customer_id, outstanding in agg:
            exists = conn.execute(
                sa.text(
                    "SELECT 1 FROM customer_balance WHERE company_id = :c AND customer_id = :u LIMIT 1"
                ),
                {"c": company_id, "u": customer_id},
            ).first()
            if exists:
                continue
            conn.execute(
                sa.text(
                    """
                    INSERT INTO customer_balance (id, company_id, customer_id, outstanding, created_at)
                    VALUES (:id, :c, :u, :o, CURRENT_TIMESTAMP)
                    """
                ),
                {"id": str(uuid.uuid4()), "c": company_id, "u": customer_id, "o": outstanding},
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for table, idx in [
        ("sales_return", "ix_sales_return_company_date"),
        ("purchase_receive", "ix_purchase_receive_company_date"),
        ("purchase_invoice", "ix_purchase_invoice_company_date"),
        ("stock_ledger", "ix_stock_ledger_company_store_product_date"),
    ]:
        if _has_index(inspector, table, idx):
            op.drop_index(idx, table_name=table)
