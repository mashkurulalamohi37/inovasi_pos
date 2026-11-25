"""Phase 6B-12 — bookstore publishers, authors, profiles, academic lists."""

from alembic import op
import sqlalchemy as sa

revision = "023_bookstore_hardening"
down_revision = "022_building_materials_hardening"
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
        "book_publisher": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("publisher_code", sa.String(), nullable=False),
            sa.Column("publisher_name", sa.String(), nullable=False),
            sa.Column("contact_person", sa.String(), nullable=True),
            sa.Column("phone", sa.String(), nullable=True),
            sa.Column("email", sa.String(), nullable=True),
            sa.Column("address", sa.String(), nullable=True),
            sa.Column("website", sa.String(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        ],
        "book_author": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("author_name", sa.String(), nullable=False),
            sa.Column("sort_name", sa.String(), nullable=True),
            sa.Column("biography_short", sa.String(), nullable=True),
            sa.Column("country", sa.String(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        ],
        "book_product_profile": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("product_id", sa.String(), nullable=False),
            sa.Column("isbn_10", sa.String(), nullable=True),
            sa.Column("isbn_13", sa.String(), nullable=True),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("subtitle", sa.String(), nullable=True),
            sa.Column("publisher_id", sa.String(), nullable=True),
            sa.Column("edition", sa.String(), nullable=True),
            sa.Column("publication_year", sa.Integer(), nullable=True),
            sa.Column("language", sa.String(), nullable=True),
            sa.Column("binding_type", sa.String(), nullable=True),
            sa.Column("page_count", sa.Integer(), nullable=True),
            sa.Column("subject", sa.String(), nullable=True),
            sa.Column("series_name", sa.String(), nullable=True),
            sa.Column("volume_no", sa.String(), nullable=True),
            sa.Column("academic_level", sa.String(), nullable=True),
            sa.Column("curriculum_code", sa.String(), nullable=True),
            sa.Column("country_of_origin", sa.String(), nullable=True),
            sa.Column("attributes_json", sa.String(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        ],
        "book_product_author": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("product_id", sa.String(), nullable=False),
            sa.Column("author_id", sa.String(), nullable=False),
            sa.Column("author_order", sa.Integer(), nullable=True),
            sa.Column("role", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        ],
        "book_academic_list": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("list_code", sa.String(), nullable=False),
            sa.Column("list_name", sa.String(), nullable=False),
            sa.Column("institution_name", sa.String(), nullable=True),
            sa.Column("school_name", sa.String(), nullable=True),
            sa.Column("curriculum", sa.String(), nullable=True),
            sa.Column("board", sa.String(), nullable=True),
            sa.Column("class_or_grade", sa.String(), nullable=True),
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
        "book_academic_list_item": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("list_id", sa.String(), nullable=False),
            sa.Column("product_id", sa.String(), nullable=False),
            sa.Column("sequence_no", sa.Integer(), nullable=True),
            sa.Column("required_flag", sa.Boolean(), nullable=True),
            sa.Column("recommended_qty", sa.Float(), nullable=True),
            sa.Column("notes", sa.String(), nullable=True),
            sa.Column("alternative_group", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        ],
    }

    for name, cols in tables.items():
        if not _has_table(inspector, name):
            op.create_table(name, *cols)

    inspector = sa.inspect(bind)
    indexes = [
        ("book_publisher", "ix_book_publisher_company_id", ["company_id"]),
        ("book_publisher", "ix_book_publisher_publisher_code", ["publisher_code"]),
        ("book_publisher", "ix_book_publisher_publisher_name", ["publisher_name"]),
        ("book_author", "ix_book_author_company_id", ["company_id"]),
        ("book_author", "ix_book_author_author_name", ["author_name"]),
        ("book_product_profile", "ix_book_product_profile_company_id", ["company_id"]),
        ("book_product_profile", "ix_book_product_profile_product_id", ["product_id"]),
        ("book_product_profile", "ix_book_product_profile_isbn_10", ["isbn_10"]),
        ("book_product_profile", "ix_book_product_profile_isbn_13", ["isbn_13"]),
        ("book_product_profile", "ix_book_product_profile_title", ["title"]),
        ("book_product_profile", "ix_book_product_profile_publisher_id", ["publisher_id"]),
        ("book_product_profile", "ix_book_product_profile_language", ["language"]),
        ("book_product_profile", "ix_book_product_profile_academic_level", ["academic_level"]),
        ("book_product_profile", "ix_book_product_profile_subject", ["subject"]),
        ("book_product_author", "ix_book_product_author_company_id", ["company_id"]),
        ("book_product_author", "ix_book_product_author_product_id", ["product_id"]),
        ("book_product_author", "ix_book_product_author_author_id", ["author_id"]),
        ("book_academic_list", "ix_book_academic_list_company_id", ["company_id"]),
        ("book_academic_list", "ix_book_academic_list_list_code", ["list_code"]),
        ("book_academic_list", "ix_book_academic_list_class_or_grade", ["class_or_grade"]),
        ("book_academic_list", "ix_book_academic_list_academic_year", ["academic_year"]),
        ("book_academic_list", "ix_book_academic_list_status", ["status"]),
        ("book_academic_list", "ix_book_academic_list_board", ["board"]),
        ("book_academic_list", "ix_book_academic_list_school_name", ["school_name"]),
        ("book_academic_list_item", "ix_book_academic_list_item_list_id", ["list_id"]),
        ("book_academic_list_item", "ix_book_academic_list_item_product_id", ["product_id"]),
    ]
    for table, idx_name, cols in indexes:
        if _has_table(inspector, table) and not _has_index(inspector, table, idx_name):
            op.create_index(idx_name, table, cols)


def downgrade() -> None:
    for table in (
        "book_academic_list_item",
        "book_academic_list",
        "book_product_author",
        "book_product_profile",
        "book_author",
        "book_publisher",
    ):
        op.drop_table(table)
