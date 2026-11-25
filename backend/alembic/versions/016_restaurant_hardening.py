"""Phase 6B-5 — restaurant table / order / KOT hardening."""

from alembic import op
import sqlalchemy as sa

revision = "016_restaurant_hardening"
down_revision = "015_jewelry_hardening"
branch_labels = None
depends_on = None


def _has_column(inspector, table: str, column: str) -> bool:
    return column in {c["name"] for c in inspector.get_columns(table)}


def _has_index(inspector, table: str, name: str) -> bool:
    return name in {i["name"] for i in inspector.get_indexes(table)}


def _has_table(inspector, name: str) -> bool:
    return name in inspector.get_table_names()


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(128)")
    inspector = sa.inspect(bind)

    if _has_table(inspector, "restaurant_table"):
        for name, col in [
            ("table_name", sa.String()),
            ("floor_or_zone", sa.String()),
            ("current_order_id", sa.String()),
            ("current_guest_count", sa.Integer()),
            ("occupied_since", sa.DateTime()),
            ("assigned_waiter_id", sa.String()),
            ("is_active", sa.Boolean()),
        ]:
            if not _has_column(inspector, "restaurant_table", name):
                op.add_column("restaurant_table", sa.Column(name, col, nullable=True))
        if bind.dialect.name == "postgresql":
            op.execute("UPDATE restaurant_table SET is_active = TRUE WHERE is_active IS NULL")
        if not _has_index(inspector, "restaurant_table", "ix_restaurant_table_company_status"):
            op.create_index(
                "ix_restaurant_table_company_status",
                "restaurant_table",
                ["company_id", "status"],
                unique=False,
            )
        if not _has_index(inspector, "restaurant_table", "ix_restaurant_table_company_zone"):
            op.create_index(
                "ix_restaurant_table_company_zone",
                "restaurant_table",
                ["company_id", "floor_or_zone"],
                unique=False,
            )
        if not _has_index(inspector, "restaurant_table", "ix_restaurant_table_current_order"):
            op.create_index(
                "ix_restaurant_table_current_order",
                "restaurant_table",
                ["current_order_id"],
                unique=False,
            )

    if not _has_table(inspector, "restaurant_order"):
        op.create_table(
            "restaurant_order",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("store_id", sa.String(), nullable=False),
            sa.Column("order_no", sa.String(), nullable=False),
            sa.Column("service_mode", sa.String(), nullable=False, server_default="dine_in"),
            sa.Column("table_id", sa.String(), nullable=True),
            sa.Column("customer_id", sa.String(), nullable=True),
            sa.Column("guest_count", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("waiter_id", sa.String(), nullable=True),
            sa.Column("waiter_name", sa.String(), nullable=True),
            sa.Column("delivery_address", sa.String(), nullable=True),
            sa.Column("delivery_phone", sa.String(), nullable=True),
            sa.Column("special_instruction", sa.String(), nullable=True),
            sa.Column("status", sa.String(), nullable=False, server_default="open"),
            sa.Column("subtotal", sa.Float(), nullable=False, server_default="0"),
            sa.Column("discount", sa.Float(), nullable=False, server_default="0"),
            sa.Column("service_charge", sa.Float(), nullable=False, server_default="0"),
            sa.Column("tax", sa.Float(), nullable=False, server_default="0"),
            sa.Column("total", sa.Float(), nullable=False, server_default="0"),
            sa.Column("sales_invoice_id", sa.String(), nullable=True),
            sa.Column("created_by", sa.String(), nullable=True),
            sa.Column("cancelled_reason", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_restaurant_order_company_status", "restaurant_order", ["company_id", "status"])
        op.create_index("ix_restaurant_order_company_table", "restaurant_order", ["company_id", "table_id"])
        op.create_index("ix_restaurant_order_order_no", "restaurant_order", ["order_no"])
        op.create_index("ix_restaurant_order_invoice", "restaurant_order", ["sales_invoice_id"])

    if not _has_table(inspector, "restaurant_order_line"):
        op.create_table(
            "restaurant_order_line",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("order_id", sa.String(), nullable=False),
            sa.Column("product_id", sa.String(), nullable=True),
            sa.Column("sku", sa.String(), nullable=False, server_default=""),
            sa.Column("product_name", sa.String(), nullable=False),
            sa.Column("qty", sa.Float(), nullable=False, server_default="1"),
            sa.Column("unit_price", sa.Float(), nullable=False, server_default="0"),
            sa.Column("modifier_price", sa.Float(), nullable=False, server_default="0"),
            sa.Column("line_total", sa.Float(), nullable=False, server_default="0"),
            sa.Column("modifiers_json", sa.String(), nullable=True),
            sa.Column("notes", sa.String(), nullable=True),
            sa.Column("kitchen_station", sa.String(), nullable=True),
            sa.Column("ordered_qty", sa.Float(), nullable=False, server_default="1"),
            sa.Column("sent_to_kitchen_qty", sa.Float(), nullable=False, server_default="0"),
            sa.Column("prepared_qty", sa.Float(), nullable=False, server_default="0"),
            sa.Column("served_qty", sa.Float(), nullable=False, server_default="0"),
            sa.Column("cancelled_qty", sa.Float(), nullable=False, server_default="0"),
            sa.Column("status", sa.String(), nullable=False, server_default="pending"),
            sa.Column("void_reason", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_restaurant_order_line_order", "restaurant_order_line", ["order_id"])
        op.create_index("ix_restaurant_order_line_status", "restaurant_order_line", ["status"])

    if _has_table(inspector, "restaurant_kot"):
        for name, col in [
            ("order_id", sa.String()),
            ("service_mode", sa.String()),
            ("kitchen_station", sa.String()),
            ("sent_by", sa.String()),
        ]:
            if not _has_column(inspector, "restaurant_kot", name):
                op.add_column("restaurant_kot", sa.Column(name, col, nullable=True))
        if bind.dialect.name == "postgresql":
            op.execute(
                "UPDATE restaurant_kot SET status = 'sent' WHERE status IS NULL OR status = 'pending'"
            )
        if not _has_index(inspector, "restaurant_kot", "ix_restaurant_kot_company_status"):
            op.create_index(
                "ix_restaurant_kot_company_status",
                "restaurant_kot",
                ["company_id", "status"],
                unique=False,
            )
        if not _has_index(inspector, "restaurant_kot", "ix_restaurant_kot_order"):
            op.create_index("ix_restaurant_kot_order", "restaurant_kot", ["order_id"], unique=False)
        if not _has_index(inspector, "restaurant_kot", "ix_restaurant_kot_station"):
            op.create_index(
                "ix_restaurant_kot_station",
                "restaurant_kot",
                ["kitchen_station"],
                unique=False,
            )

    if _has_table(inspector, "restaurant_kot_line"):
        for name, col in [
            ("order_line_id", sa.String()),
            ("product_id", sa.String()),
            ("modifiers_json", sa.String()),
            ("kitchen_station", sa.String()),
            ("status", sa.String()),
        ]:
            if not _has_column(inspector, "restaurant_kot_line", name):
                op.add_column("restaurant_kot_line", sa.Column(name, col, nullable=True))
        if bind.dialect.name == "postgresql":
            op.execute(
                "UPDATE restaurant_kot_line SET status = 'sent' WHERE status IS NULL"
            )

    if _has_table(inspector, "restaurant_sales_line_extension"):
        if not _has_column(inspector, "restaurant_sales_line_extension", "order_id"):
            op.add_column(
                "restaurant_sales_line_extension",
                sa.Column("order_id", sa.String(), nullable=True),
            )


def downgrade() -> None:
    pass
