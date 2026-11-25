"""Phase 6B-2 — pharmacy prescription record fields."""

from alembic import op
import sqlalchemy as sa

revision = "013_pharmacy_prescription_hardening"
down_revision = "012_fashion_alteration_hardening"
branch_labels = None
depends_on = None


def _has_column(inspector, table: str, column: str) -> bool:
    return column in {c["name"] for c in inspector.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    # Revision id length exceeds default alembic_version VARCHAR(32).
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(128)")
    inspector = sa.inspect(bind)
    if "pharma_prescription_record" not in inspector.get_table_names():
        return
    cols = [
        ("customer_id", sa.String(), sa.ForeignKey("customer.id")),
        ("prescription_date", sa.DateTime(), None),
        ("rx_ref", sa.String(), None),
        ("notes", sa.String(), None),
        ("status", sa.String(), "captured"),
    ]
    for name, col_type, _default in cols:
        if not _has_column(inspector, "pharma_prescription_record", name):
            op.add_column("pharma_prescription_record", sa.Column(name, col_type, nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "pharma_prescription_record" not in inspector.get_table_names():
        return
    for name in ("customer_id", "prescription_date", "rx_ref", "notes", "status"):
        if _has_column(inspector, "pharma_prescription_record", name):
            op.drop_column("pharma_prescription_record", name)
