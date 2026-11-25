"""Phase 6B-3 — electronics serial / warranty / RMA hardening."""

from alembic import op
import sqlalchemy as sa

revision = "014_electronics_hardening"
down_revision = "013_pharmacy_prescription_hardening"
branch_labels = None
depends_on = None


def _has_column(inspector, table: str, column: str) -> bool:
    return column in {c["name"] for c in inspector.get_columns(table)}


def _has_index(inspector, table: str, name: str) -> bool:
    return name in {i["name"] for i in inspector.get_indexes(table)}


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(128)")
    inspector = sa.inspect(bind)

    if "electronics_serial_stock" in inspector.get_table_names():
        serial_cols = [
            ("variant_id", sa.String()),
            ("store_id", sa.String()),
            ("imei_no", sa.String()),
            ("purchase_id", sa.String()),
            ("receive_id", sa.String()),
            ("cost_price", sa.Float()),
            ("supplier_id", sa.String()),
            ("customer_id", sa.String()),
            ("sales_invoice_id", sa.String()),
            ("warranty_id", sa.String()),
        ]
        for name, col_type in serial_cols:
            if not _has_column(inspector, "electronics_serial_stock", name):
                op.add_column("electronics_serial_stock", sa.Column(name, col_type, nullable=True))
        if not _has_index(inspector, "electronics_serial_stock", "uq_electronics_serial_company_serial"):
            op.create_index(
                "uq_electronics_serial_company_serial",
                "electronics_serial_stock",
                ["company_id", "serial_imei"],
                unique=True,
            )
        if not _has_index(inspector, "electronics_serial_stock", "ix_electronics_serial_company_status"):
            op.create_index(
                "ix_electronics_serial_company_status",
                "electronics_serial_stock",
                ["company_id", "status"],
                unique=False,
            )
        if not _has_index(inspector, "electronics_serial_stock", "ix_electronics_serial_company_imei"):
            op.create_index(
                "ix_electronics_serial_company_imei",
                "electronics_serial_stock",
                ["company_id", "imei_no"],
                unique=False,
            )

    if "electronics_warranty" in inspector.get_table_names():
        warranty_cols = [
            ("warranty_no", sa.String()),
            ("serial_id", sa.String()),
            ("sales_invoice_id", sa.String()),
            ("sales_line_id", sa.String()),
            ("product_id", sa.String()),
            ("customer_id", sa.String()),
            ("warranty_start_date", sa.DateTime()),
            ("warranty_end_date", sa.DateTime()),
            ("warranty_terms", sa.String()),
            ("status", sa.String()),
        ]
        for name, col_type in warranty_cols:
            if not _has_column(inspector, "electronics_warranty", name):
                op.add_column("electronics_warranty", sa.Column(name, col_type, nullable=True))
        if bind.dialect.name == "postgresql":
            op.execute(
                "UPDATE electronics_warranty SET status = 'active' WHERE status IS NULL"
            )
            op.execute(
                "UPDATE electronics_warranty SET warranty_end_date = expires_at "
                "WHERE warranty_end_date IS NULL AND expires_at IS NOT NULL"
            )
            op.execute(
                "UPDATE electronics_warranty SET sales_invoice_id = invoice_id "
                "WHERE sales_invoice_id IS NULL AND invoice_id IS NOT NULL"
            )
        if not _has_index(inspector, "electronics_warranty", "ix_electronics_warranty_company_status"):
            op.create_index(
                "ix_electronics_warranty_company_status",
                "electronics_warranty",
                ["company_id", "status"],
                unique=False,
            )
        if not _has_index(inspector, "electronics_warranty", "ix_electronics_warranty_company_serial"):
            op.create_index(
                "ix_electronics_warranty_company_serial",
                "electronics_warranty",
                ["company_id", "serial_imei"],
                unique=False,
            )

    if "electronics_rma" in inspector.get_table_names():
        rma_cols = [
            ("rma_no", sa.String()),
            ("customer_id", sa.String()),
            ("product_id", sa.String()),
            ("serial_id", sa.String()),
            ("warranty_id", sa.String()),
            ("problem_description", sa.String()),
            ("resolution_note", sa.String()),
            ("cost_amount", sa.Float()),
            ("received_date", sa.DateTime()),
            ("status", sa.String()),
            ("replacement_serial_id", sa.String()),
        ]
        for name, col_type in rma_cols:
            if not _has_column(inspector, "electronics_rma", name):
                op.add_column("electronics_rma", sa.Column(name, col_type, nullable=True))
        if bind.dialect.name == "postgresql":
            op.execute(
                "UPDATE electronics_rma SET status = CASE "
                "WHEN approval_status = 'approved' THEN 'closed' "
                "WHEN approval_status = 'rejected' THEN 'rejected' "
                "ELSE 'received' END "
                "WHERE status IS NULL"
            )
            op.execute(
                "UPDATE electronics_rma SET problem_description = return_reason "
                "WHERE problem_description IS NULL"
            )
        if not _has_index(inspector, "electronics_rma", "ix_electronics_rma_company_status"):
            op.create_index(
                "ix_electronics_rma_company_status",
                "electronics_rma",
                ["company_id", "status"],
                unique=False,
            )

    if "electronics_sales_line_extension" in inspector.get_table_names():
        if not _has_column(inspector, "electronics_sales_line_extension", "serial_id"):
            op.add_column(
                "electronics_sales_line_extension",
                sa.Column("serial_id", sa.String(), nullable=True),
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for table, idx in [
        ("electronics_rma", "ix_electronics_rma_company_status"),
        ("electronics_warranty", "ix_electronics_warranty_company_serial"),
        ("electronics_warranty", "ix_electronics_warranty_company_status"),
        ("electronics_serial_stock", "ix_electronics_serial_company_imei"),
        ("electronics_serial_stock", "ix_electronics_serial_company_status"),
        ("electronics_serial_stock", "uq_electronics_serial_company_serial"),
    ]:
        if table in inspector.get_table_names() and _has_index(inspector, table, idx):
            op.drop_index(idx, table_name=table)
