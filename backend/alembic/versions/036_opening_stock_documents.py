"""Add opening_stock_document and opening_stock_document_line tables"""

from alembic import op
import sqlalchemy as sa

revision = "036_opening_stock_documents"
down_revision = "035_pack_attribute_master"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    # 001_initial creates every table currently registered on SQLModel.metadata
    # on a fresh database, so guard against re-creating these on a from-scratch
    # migrate (see the same pattern in 026/028/etc.).
    if "opening_stock_document" not in tables:
        op.create_table(
            "opening_stock_document",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("company_id", sa.String(length=36), sa.ForeignKey("company.id"), nullable=False),
            sa.Column("store_id", sa.String(length=36), sa.ForeignKey("store.id"), nullable=True),
            sa.Column("warehouse_id", sa.String(length=36), sa.ForeignKey("warehouse.id"), nullable=True),
            sa.Column("os_number", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False, server_default="DRAFT"),
            sa.Column("total_amount", sa.Float(), nullable=False, server_default="0.0"),
            sa.Column("note", sa.String(), nullable=True),
            sa.Column("created_by", sa.String(), nullable=True),
            sa.Column("posted_by", sa.String(), nullable=True),
            sa.Column("posted_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_opening_stock_document_company_id", "opening_stock_document", ["company_id"])
        op.create_index("ix_opening_stock_document_os_number", "opening_stock_document", ["os_number"])
        op.create_index("ix_opening_stock_document_status", "opening_stock_document", ["status"])

    if "opening_stock_document_line" not in tables:
        op.create_table(
            "opening_stock_document_line",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("document_id", sa.String(length=36), sa.ForeignKey("opening_stock_document.id"), nullable=False),
            sa.Column("product_id", sa.String(length=36), sa.ForeignKey("product.id"), nullable=False),
            sa.Column("variant_id", sa.String(length=36), nullable=True),
            sa.Column("qty", sa.Float(), nullable=False, server_default="0.0"),
            sa.Column("unit_cost", sa.Float(), nullable=False, server_default="0.0"),
            sa.Column("line_total", sa.Float(), nullable=False, server_default="0.0"),
            sa.Column("batch_no", sa.String(), nullable=True),
            sa.Column("lot_no", sa.String(), nullable=True),
            sa.Column("expiry_date", sa.DateTime(), nullable=True),
            sa.Column("manufacture_date", sa.DateTime(), nullable=True),
            sa.Column("serials_json", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_opening_stock_document_line_document_id", "opening_stock_document_line", ["document_id"])
        op.create_index("ix_opening_stock_document_line_product_id", "opening_stock_document_line", ["product_id"])


def downgrade() -> None:
    op.drop_index("ix_opening_stock_document_line_product_id", table_name="opening_stock_document_line")
    op.drop_index("ix_opening_stock_document_line_document_id", table_name="opening_stock_document_line")
    op.drop_table("opening_stock_document_line")

    op.drop_index("ix_opening_stock_document_status", table_name="opening_stock_document")
    op.drop_index("ix_opening_stock_document_os_number", table_name="opening_stock_document")
    op.drop_index("ix_opening_stock_document_company_id", table_name="opening_stock_document")
    op.drop_table("opening_stock_document")
