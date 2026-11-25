"""Phase 3 procurement — supplier invoices, AP on invoice, payment link."""

from alembic import op
import sqlalchemy as sa

revision = "003_procurement_engine"
down_revision = "002_inventory_core"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "supplier_invoice" not in tables:
        op.create_table(
            "supplier_invoice",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), sa.ForeignKey("company.id"), nullable=False),
            sa.Column("supplier_id", sa.String(), sa.ForeignKey("supplier.id"), nullable=False),
            sa.Column("purchase_id", sa.String(), sa.ForeignKey("purchase_invoice.id"), nullable=False),
            sa.Column("receive_id", sa.String(), sa.ForeignKey("purchase_receive.id"), nullable=True),
            sa.Column("invoice_no", sa.String(), nullable=False),
            sa.Column("invoice_date", sa.DateTime(), nullable=True),
            sa.Column("status", sa.String(), server_default="DRAFT", nullable=False),
            sa.Column("match_status", sa.String(), server_default="pending", nullable=False),
            sa.Column("subtotal", sa.Float(), server_default="0", nullable=False),
            sa.Column("tax_amount", sa.Float(), server_default="0", nullable=False),
            sa.Column("total", sa.Float(), server_default="0", nullable=False),
            sa.Column("paid_amount", sa.Float(), server_default="0", nullable=False),
            sa.Column("due_amount", sa.Float(), server_default="0", nullable=False),
            sa.Column("remarks", sa.String(), nullable=True),
            sa.Column("created_by", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_supplier_invoice_company_id", "supplier_invoice", ["company_id"])
        op.create_index("ix_supplier_invoice_purchase_id", "supplier_invoice", ["purchase_id"])

    if "supplier_invoice_line" not in tables:
        op.create_table(
            "supplier_invoice_line",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("supplier_invoice_id", sa.String(), sa.ForeignKey("supplier_invoice.id"), nullable=False),
            sa.Column("purchase_line_id", sa.String(), sa.ForeignKey("purchase_invoice_line.id"), nullable=False),
            sa.Column("product_id", sa.String(), sa.ForeignKey("product.id"), nullable=False),
            sa.Column("qty", sa.Float(), server_default="0", nullable=False),
            sa.Column("unit_cost", sa.Float(), server_default="0", nullable=False),
            sa.Column("line_total", sa.Float(), server_default="0", nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_supplier_invoice_line_invoice_id", "supplier_invoice_line", ["supplier_invoice_id"])

    pay_cols = {c["name"] for c in inspector.get_columns("supplier_payment")}
    if "supplier_invoice_id" not in pay_cols:
        op.add_column("supplier_payment", sa.Column("supplier_invoice_id", sa.String(), nullable=True))
        op.create_foreign_key(
            "fk_supplier_payment_supplier_invoice",
            "supplier_payment",
            "supplier_invoice",
            ["supplier_invoice_id"],
            ["id"],
        )


def downgrade() -> None:
    op.drop_constraint("fk_supplier_payment_supplier_invoice", "supplier_payment", type_="foreignkey")
    op.drop_column("supplier_payment", "supplier_invoice_id")
    op.drop_table("supplier_invoice_line")
    op.drop_table("supplier_invoice")
