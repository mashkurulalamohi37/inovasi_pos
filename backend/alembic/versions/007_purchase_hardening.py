"""Phase 2 purchase hardening — query indexes for PO list, GRN, supplier ledger."""

from alembic import op

revision = "007_purchase_hardening"
down_revision = "006_report_exports"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_purchase_invoice_company_status", "purchase_invoice", ["company_id", "status"], unique=False)
    op.create_index("ix_purchase_invoice_company_supplier", "purchase_invoice", ["company_id", "supplier_id"], unique=False)
    op.create_index("ix_purchase_invoice_company_created", "purchase_invoice", ["company_id", "created_at"], unique=False)
    op.create_index("ix_supplier_payment_company_supplier", "supplier_payment", ["company_id", "supplier_id"], unique=False)
    op.create_index("ix_supplier_invoice_company_supplier", "supplier_invoice", ["company_id", "supplier_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_supplier_invoice_company_supplier", table_name="supplier_invoice")
    op.drop_index("ix_supplier_payment_company_supplier", table_name="supplier_payment")
    op.drop_index("ix_purchase_invoice_company_created", table_name="purchase_invoice")
    op.drop_index("ix_purchase_invoice_company_supplier", table_name="purchase_invoice")
    op.drop_index("ix_purchase_invoice_company_status", table_name="purchase_invoice")
