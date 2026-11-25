"""Phase 6B-13 — stationery profiles, school lists, sales line extensions."""

from alembic import op
import sqlalchemy as sa

revision = "024_stationery_hardening"
down_revision = "023_bookstore_hardening"
branch_labels = None
depends_on = None


def _has_table(inspector, name: str) -> bool:
    return name in inspector.get_table_names()


def _has_index(inspector, table: str, name: str) -> bool:
    return name in {i["name"] for i in inspector.get_indexes(table)}


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(128)")
    inspector = sa.inspect(bind)

    tables = {
        "stationery_product_profile": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("product_id", sa.String(), nullable=False),
            sa.Column("stationery_type", sa.String(), nullable=True),
            sa.Column("brand_id", sa.String(), nullable=True),
            sa.Column("manufacturer_name", sa.String(), nullable=True),
            sa.Column("model_no", sa.String(), nullable=True),
            sa.Column("color", sa.String(), nullable=True),
            sa.Column("size", sa.String(), nullable=True),
            sa.Column("paper_size", sa.String(), nullable=True),
            sa.Column("page_count", sa.Integer(), nullable=True),
            sa.Column("paper_gsm", sa.Float(), nullable=True),
            sa.Column("ruling_type", sa.String(), nullable=True),
            sa.Column("tip_size", sa.String(), nullable=True),
            sa.Column("ink_color", sa.String(), nullable=True),
            sa.Column("material", sa.String(), nullable=True),
            sa.Column("base_uom_id", sa.String(), nullable=True),
            sa.Column("default_sales_uom_id", sa.String(), nullable=True),
            sa.Column("default_purchase_uom_id", sa.String(), nullable=True),
            sa.Column("fractional_qty_allowed", sa.Boolean(), nullable=True),
            sa.Column("school_list_eligible", sa.Boolean(), nullable=True),
            sa.Column("wholesale_enabled", sa.Boolean(), nullable=True),
            sa.Column("attributes_json", sa.String(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        ],
        "stationery_school_list": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("list_code", sa.String(), nullable=False),
            sa.Column("list_name", sa.String(), nullable=False),
            sa.Column("institution_name", sa.String(), nullable=True),
            sa.Column("school_name", sa.String(), nullable=True),
            sa.Column("curriculum", sa.String(), nullable=True),
            sa.Column("board", sa.String(), nullable=True),
            sa.Column("class_or_grade", sa.String(), nullable=True),
            sa.Column("section", sa.String(), nullable=True),
            sa.Column("academic_year", sa.String(), nullable=True),
            sa.Column("language_version", sa.String(), nullable=True),
            sa.Column("valid_from", sa.DateTime(), nullable=True),
            sa.Column("valid_to", sa.DateTime(), nullable=True),
            sa.Column("status", sa.String(), nullable=True),
            sa.Column("notes", sa.String(), nullable=True),
            sa.Column("created_by", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        ],
        "stationery_school_list_item": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("list_id", sa.String(), nullable=False),
            sa.Column("product_id", sa.String(), nullable=False),
            sa.Column("variant_id", sa.String(), nullable=True),
            sa.Column("sequence_no", sa.Integer(), nullable=True),
            sa.Column("required_flag", sa.Boolean(), nullable=True),
            sa.Column("recommended_qty", sa.Float(), nullable=True),
            sa.Column("sales_uom_id", sa.String(), nullable=True),
            sa.Column("preferred_brand_id", sa.String(), nullable=True),
            sa.Column("notes", sa.String(), nullable=True),
            sa.Column("alternative_group", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        ],
        "stationery_sales_line_extension": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("line_id", sa.String(), nullable=False),
            sa.Column("sales_uom_id", sa.String(), nullable=True),
            sa.Column("entered_qty", sa.Float(), nullable=True),
            sa.Column("conversion_factor", sa.Float(), nullable=True),
            sa.Column("base_qty", sa.Float(), nullable=True),
            sa.Column("base_uom_id", sa.String(), nullable=True),
            sa.Column("price_source", sa.String(), nullable=True),
            sa.Column("unit_price", sa.Float(), nullable=True),
            sa.Column("price_override_reason", sa.String(), nullable=True),
        ],
    }

    for name, cols in tables.items():
        if not _has_table(inspector, name):
            op.create_table(name, *cols)

    inspector = sa.inspect(bind)
    indexes = [
        ("stationery_product_profile", "ix_stationery_product_profile_company_id", ["company_id"]),
        ("stationery_product_profile", "ix_stationery_product_profile_product_id", ["product_id"]),
        ("stationery_product_profile", "ix_stationery_product_profile_brand_id", ["brand_id"]),
        ("stationery_product_profile", "ix_stationery_product_profile_stationery_type", ["stationery_type"]),
        ("stationery_product_profile", "ix_stationery_product_profile_color", ["color"]),
        ("stationery_product_profile", "ix_stationery_product_profile_size", ["size"]),
        ("stationery_product_profile", "ix_stationery_product_profile_paper_size", ["paper_size"]),
        ("stationery_product_profile", "ix_stationery_product_profile_tip_size", ["tip_size"]),
        ("stationery_product_profile", "ix_stationery_product_profile_ink_color", ["ink_color"]),
        ("stationery_school_list", "ix_stationery_school_list_company_id", ["company_id"]),
        ("stationery_school_list", "ix_stationery_school_list_list_code", ["list_code"]),
        ("stationery_school_list", "ix_stationery_school_list_class_or_grade", ["class_or_grade"]),
        ("stationery_school_list", "ix_stationery_school_list_academic_year", ["academic_year"]),
        ("stationery_school_list", "ix_stationery_school_list_status", ["status"]),
        ("stationery_school_list", "ix_stationery_school_list_school_name", ["school_name"]),
        ("stationery_school_list", "ix_stationery_school_list_board", ["board"]),
        ("stationery_school_list_item", "ix_stationery_school_list_item_list_id", ["list_id"]),
        ("stationery_school_list_item", "ix_stationery_school_list_item_product_id", ["product_id"]),
        ("stationery_school_list_item", "ix_stationery_school_list_item_variant_id", ["variant_id"]),
        ("stationery_sales_line_extension", "ix_stationery_sales_line_extension_line_id", ["line_id"]),
    ]
    for table, idx_name, cols in indexes:
        if _has_table(inspector, table) and not _has_index(inspector, table, idx_name):
            op.create_index(idx_name, table, cols)

    # Unique (list_id, product_id, coalesce(variant_id,'')) — SQLite-safe via expression index when supported
    if _has_table(inspector, "stationery_school_list_item"):
        existing = {i["name"] for i in sa.inspect(bind).get_indexes("stationery_school_list_item")}
        if "uq_stationery_school_list_item_list_product_variant" not in existing:
            try:
                op.create_index(
                    "uq_stationery_school_list_item_list_product_variant",
                    "stationery_school_list_item",
                    ["list_id", "product_id", "variant_id"],
                    unique=True,
                )
            except Exception:
                # SQLite NULL uniqueness: enforce in service layer when DB rejects unique on nullable
                pass


def downgrade() -> None:
    for table in (
        "stationery_sales_line_extension",
        "stationery_school_list_item",
        "stationery_school_list",
        "stationery_product_profile",
    ):
        op.drop_table(table)
