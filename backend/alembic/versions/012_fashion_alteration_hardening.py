"""Phase 6B-1 — fashion alteration order fields."""

from alembic import op
import sqlalchemy as sa

revision = "012_fashion_alteration_hardening"
down_revision = "011_product_variant_barcode"
branch_labels = None
depends_on = None


def _has_column(inspector, table: str, column: str) -> bool:
    return column in {c["name"] for c in inspector.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "fashion_alteration_request" not in inspector.get_table_names():
        return
    cols = [
        ("job_no", sa.String(), None),
        ("customer_id", sa.String(), sa.ForeignKey("customer.id")),
        ("invoice_id", sa.String(), sa.ForeignKey("sales_invoice.id")),
        ("product_id", sa.String(), sa.ForeignKey("product.id")),
        ("variant_id", sa.String(), None),
        ("instruction", sa.String(), None),
        ("measurement_note", sa.String(), None),
        ("charge_amount", sa.Float(), 0),
        ("paid_amount", sa.Float(), 0),
        ("delivery_date", sa.DateTime(), None),
    ]
    for name, col_type, default in cols:
        if not _has_column(inspector, "fashion_alteration_request", name):
            op.add_column("fashion_alteration_request", sa.Column(name, col_type, nullable=True))
    if not _has_column(inspector, "fashion_alteration_request", "charge_amount"):
        pass
    op.execute(
        "UPDATE fashion_alteration_request SET charge_amount = 0 WHERE charge_amount IS NULL"
    )
    op.execute(
        "UPDATE fashion_alteration_request SET paid_amount = 0 WHERE paid_amount IS NULL"
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "fashion_alteration_request" not in inspector.get_table_names():
        return
    for name in (
        "job_no", "customer_id", "invoice_id", "product_id", "variant_id",
        "instruction", "measurement_note", "charge_amount", "paid_amount", "delivery_date",
    ):
        if _has_column(inspector, "fashion_alteration_request", name):
            op.drop_column("fashion_alteration_request", name)
