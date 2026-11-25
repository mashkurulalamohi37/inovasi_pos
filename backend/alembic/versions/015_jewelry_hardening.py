"""Phase 6B-4 — jewelry metal rate, profile, certificate, buyback hardening."""

from alembic import op
import sqlalchemy as sa

revision = "015_jewelry_hardening"
down_revision = "014_electronics_hardening"
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

    if _has_table(inspector, "jewelry_gold_rate"):
        for name, col in [
            ("metal_type", sa.String()),
            ("purity", sa.String()),
            ("buying_rate", sa.Float()),
            ("selling_rate", sa.Float()),
            ("currency", sa.String()),
            ("unit_basis", sa.String()),
            ("status", sa.String()),
            ("created_by", sa.String()),
            ("approved_by", sa.String()),
            ("override_reason", sa.String()),
            ("previous_rate", sa.Float()),
        ]:
            if not _has_column(inspector, "jewelry_gold_rate", name):
                op.add_column("jewelry_gold_rate", sa.Column(name, col, nullable=True))
        if bind.dialect.name == "postgresql":
            op.execute("UPDATE jewelry_gold_rate SET metal_type = 'Gold' WHERE metal_type IS NULL")
            op.execute("UPDATE jewelry_gold_rate SET selling_rate = rate_per_gram WHERE selling_rate IS NULL")
            op.execute("UPDATE jewelry_gold_rate SET buying_rate = rate_per_gram * 0.92 WHERE buying_rate IS NULL")
            op.execute("UPDATE jewelry_gold_rate SET currency = 'BDT' WHERE currency IS NULL")
            op.execute("UPDATE jewelry_gold_rate SET unit_basis = 'gram' WHERE unit_basis IS NULL")
            op.execute("UPDATE jewelry_gold_rate SET status = 'active' WHERE status IS NULL")
        if not _has_index(inspector, "jewelry_gold_rate", "ix_jewelry_rate_company_metal_karat_date"):
            op.create_index(
                "ix_jewelry_rate_company_metal_karat_date",
                "jewelry_gold_rate",
                ["company_id", "metal_type", "karat", "effective_date"],
                unique=False,
            )

    if not _has_table(inspector, "jewelry_product_profile"):
        op.create_table(
            "jewelry_product_profile",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), sa.ForeignKey("company.id"), nullable=False),
            sa.Column("product_id", sa.String(), sa.ForeignKey("product.id"), nullable=False),
            sa.Column("metal_type", sa.String(), nullable=True),
            sa.Column("purity", sa.String(), nullable=True),
            sa.Column("karat", sa.String(), nullable=True),
            sa.Column("gross_weight", sa.Float(), nullable=True),
            sa.Column("stone_weight", sa.Float(), nullable=True),
            sa.Column("other_non_metal_weight", sa.Float(), nullable=True),
            sa.Column("net_metal_weight", sa.Float(), nullable=True),
            sa.Column("fine_weight", sa.Float(), nullable=True),
            sa.Column("making_charge_type", sa.String(), nullable=True),
            sa.Column("making_charge_rate", sa.Float(), nullable=True),
            sa.Column("making_charge_amount", sa.Float(), nullable=True),
            sa.Column("wastage_percentage", sa.Float(), nullable=True),
            sa.Column("default_stone_value", sa.Float(), nullable=True),
            sa.Column("certificate_required", sa.Boolean(), nullable=True),
            sa.Column("tag_no", sa.String(), nullable=True),
            sa.Column("barcode", sa.String(), nullable=True),
            sa.Column("attributes_json", sa.String(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_jewelry_profile_company_product", "jewelry_product_profile", ["company_id", "product_id"], unique=True)
        op.create_index("ix_jewelry_profile_tag", "jewelry_product_profile", ["company_id", "tag_no"], unique=False)

    if _has_table(inspector, "jewelry_certificate"):
        for name, col in [
            ("certificate_no", sa.String()),
            ("tag_no", sa.String()),
            ("barcode", sa.String()),
            ("metal_type", sa.String()),
            ("purity", sa.String()),
            ("gross_weight", sa.Float()),
            ("stone_weight", sa.Float()),
            ("net_metal_weight", sa.Float()),
            ("stone_details_json", sa.String()),
            ("issue_date", sa.DateTime()),
            ("status", sa.String()),
            ("sales_invoice_id", sa.String()),
            ("customer_id", sa.String()),
            ("created_by", sa.String()),
        ]:
            if not _has_column(inspector, "jewelry_certificate", name):
                op.add_column("jewelry_certificate", sa.Column(name, col, nullable=True))
        if bind.dialect.name == "postgresql":
            op.execute("UPDATE jewelry_certificate SET certificate_no = cert_no WHERE certificate_no IS NULL")
            op.execute("UPDATE jewelry_certificate SET gross_weight = weight_gram WHERE gross_weight IS NULL OR gross_weight = 0")
            op.execute("UPDATE jewelry_certificate SET net_metal_weight = weight_gram WHERE net_metal_weight IS NULL OR net_metal_weight = 0")
            op.execute("UPDATE jewelry_certificate SET status = 'active' WHERE status IS NULL")
            op.execute("UPDATE jewelry_certificate SET metal_type = 'Gold' WHERE metal_type IS NULL")
            op.execute("UPDATE jewelry_certificate SET purity = '22K' WHERE purity IS NULL")
        if not _has_index(inspector, "jewelry_certificate", "uq_jewelry_cert_company_no"):
            op.create_index("uq_jewelry_cert_company_no", "jewelry_certificate", ["company_id", "cert_no"], unique=True)
        if not _has_index(inspector, "jewelry_certificate", "ix_jewelry_cert_company_status"):
            op.create_index("ix_jewelry_cert_company_status", "jewelry_certificate", ["company_id", "status"], unique=False)

    if not _has_table(inspector, "jewelry_buyback"):
        op.create_table(
            "jewelry_buyback",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), sa.ForeignKey("company.id"), nullable=False),
            sa.Column("buyback_no", sa.String(), nullable=False),
            sa.Column("store_id", sa.String(), nullable=True),
            sa.Column("customer_id", sa.String(), nullable=True),
            sa.Column("customer_name", sa.String(), nullable=True),
            sa.Column("original_invoice_id", sa.String(), nullable=True),
            sa.Column("original_certificate_id", sa.String(), nullable=True),
            sa.Column("metal_type", sa.String(), nullable=True),
            sa.Column("purity", sa.String(), nullable=True),
            sa.Column("gross_weight", sa.Float(), nullable=True),
            sa.Column("net_metal_weight", sa.Float(), nullable=True),
            sa.Column("assessed_purity", sa.String(), nullable=True),
            sa.Column("assessed_weight", sa.Float(), nullable=True),
            sa.Column("applicable_buy_rate", sa.Float(), nullable=True),
            sa.Column("deductions", sa.Float(), nullable=True),
            sa.Column("stone_deduction", sa.Float(), nullable=True),
            sa.Column("service_deduction", sa.Float(), nullable=True),
            sa.Column("final_buyback_value", sa.Float(), nullable=True),
            sa.Column("settlement_method", sa.String(), nullable=True),
            sa.Column("status", sa.String(), nullable=True),
            sa.Column("override_reason", sa.String(), nullable=True),
            sa.Column("assessed_by", sa.String(), nullable=True),
            sa.Column("approved_by", sa.String(), nullable=True),
            sa.Column("notes", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_jewelry_buyback_company_status", "jewelry_buyback", ["company_id", "status"], unique=False)
        op.create_index("ix_jewelry_buyback_company_no", "jewelry_buyback", ["company_id", "buyback_no"], unique=True)

    if _has_table(inspector, "jewelry_sales_line_extension"):
        for name, col in [
            ("metal_type", sa.String()),
            ("purity", sa.String()),
            ("gross_weight", sa.Float()),
            ("stone_weight", sa.Float()),
            ("net_metal_weight", sa.Float()),
            ("metal_value", sa.Float()),
            ("wastage_value", sa.Float()),
            ("stone_value", sa.Float()),
            ("certificate_id", sa.String()),
            ("certificate_no", sa.String()),
            ("rate_override_reason", sa.String()),
            ("snapshot_json", sa.String()),
        ]:
            if not _has_column(inspector, "jewelry_sales_line_extension", name):
                op.add_column("jewelry_sales_line_extension", sa.Column(name, col, nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if _has_table(inspector, "jewelry_buyback"):
        op.drop_table("jewelry_buyback")
    if _has_table(inspector, "jewelry_product_profile"):
        op.drop_table("jewelry_product_profile")
