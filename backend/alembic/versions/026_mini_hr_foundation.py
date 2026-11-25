"""Phase 28A — Mini HR foundation: departments, designations, employees, store assignments."""

from alembic import op
import sqlalchemy as sa

revision = "026_mini_hr_foundation"
down_revision = "025_cosmetics_hardening"
branch_labels = None
depends_on = None


def _has_table(inspector, name: str) -> bool:
    return name in inspector.get_table_names()


def _has_column(inspector, table: str, column: str) -> bool:
    return column in {c["name"] for c in inspector.get_columns(table)}


def _has_index(inspector, table: str, name: str) -> bool:
    return name in {i["name"] for i in inspector.get_indexes(table)}


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(128)")
    inspector = sa.inspect(bind)

    if not _has_column(inspector, "user_account", "must_change_password"):
        op.add_column(
            "user_account",
            sa.Column("must_change_password", sa.Boolean(), nullable=True, server_default=sa.false()),
        )

    tables = {
        "mini_hr_department": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("department_code", sa.String(), nullable=False),
            sa.Column("department_name", sa.String(), nullable=False),
            sa.Column("description", sa.String(), nullable=True),
            sa.Column("manager_employee_id", sa.String(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        ],
        "mini_hr_designation": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("designation_code", sa.String(), nullable=False),
            sa.Column("designation_name", sa.String(), nullable=False),
            sa.Column("description", sa.String(), nullable=True),
            sa.Column("level", sa.Integer(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        ],
        "mini_hr_employee": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("employee_code", sa.String(), nullable=False),
            sa.Column("first_name", sa.String(), nullable=False),
            sa.Column("last_name", sa.String(), nullable=True),
            sa.Column("full_name", sa.String(), nullable=False),
            sa.Column("display_name", sa.String(), nullable=True),
            sa.Column("mobile", sa.String(), nullable=True),
            sa.Column("email", sa.String(), nullable=True),
            sa.Column("gender", sa.String(), nullable=True),
            sa.Column("date_of_birth", sa.Date(), nullable=True),
            sa.Column("joining_date", sa.Date(), nullable=True),
            sa.Column("department_id", sa.String(), nullable=True),
            sa.Column("designation_id", sa.String(), nullable=True),
            sa.Column("reporting_manager_employee_id", sa.String(), nullable=True),
            sa.Column("primary_store_id", sa.String(), nullable=True),
            sa.Column("employment_type", sa.String(), nullable=True),
            sa.Column("employee_status", sa.String(), nullable=True),
            sa.Column("user_account_id", sa.String(), nullable=True),
            sa.Column("photo_url", sa.String(), nullable=True),
            sa.Column("address", sa.String(), nullable=True),
            sa.Column("emergency_contact", sa.String(), nullable=True),
            sa.Column("notes", sa.String(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True),
            sa.Column("external_employee_id", sa.String(), nullable=True),
            sa.Column("external_source", sa.String(), nullable=True),
            sa.Column("external_sync_at", sa.DateTime(), nullable=True),
            sa.Column("created_by", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        ],
        "mini_hr_employee_store_assignment": [
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("employee_id", sa.String(), nullable=False),
            sa.Column("store_id", sa.String(), nullable=False),
            sa.Column("assignment_type", sa.String(), nullable=True),
            sa.Column("effective_from", sa.Date(), nullable=True),
            sa.Column("effective_to", sa.Date(), nullable=True),
            sa.Column("is_primary", sa.Boolean(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True),
            sa.Column("created_by", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        ],
    }

    for name, cols in tables.items():
        if not _has_table(inspector, name):
            op.create_table(name, *cols)

    inspector = sa.inspect(bind)
    indexes = [
        ("ix_mini_hr_department_company", "mini_hr_department", ["company_id"]),
        ("ix_mini_hr_designation_company", "mini_hr_designation", ["company_id"]),
        ("ix_mini_hr_employee_company", "mini_hr_employee", ["company_id"]),
        ("ix_mini_hr_employee_code", "mini_hr_employee", ["company_id", "employee_code"]),
        ("ix_mini_hr_employee_user", "mini_hr_employee", ["user_account_id"]),
        ("ix_mini_hr_assign_employee", "mini_hr_employee_store_assignment", ["employee_id"]),
        ("ix_mini_hr_assign_store", "mini_hr_employee_store_assignment", ["store_id"]),
    ]
    for ix_name, table, cols in indexes:
        if _has_table(inspector, table) and not _has_index(inspector, table, ix_name):
            op.create_index(ix_name, table, cols)


def downgrade() -> None:
    for table in (
        "mini_hr_employee_store_assignment",
        "mini_hr_employee",
        "mini_hr_designation",
        "mini_hr_department",
    ):
        op.drop_table(table)
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if _has_column(inspector, "user_account", "must_change_password"):
        op.drop_column("user_account", "must_change_password")
