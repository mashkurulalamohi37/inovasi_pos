"""Add accounting core tables: account, journal_entry, journal_line, expense_category, expense"""

from alembic import op
import sqlalchemy as sa

revision = "037_accounting_core"
down_revision = "036_opening_stock_documents"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    # 001_initial creates every table currently registered on SQLModel.metadata
    # on a fresh database, so guard against re-creating these on a from-scratch
    # migrate (see the same pattern in 026/028/etc.).
    if "account" not in tables:
        op.create_table(
            "account",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("company_id", sa.String(length=36), sa.ForeignKey("company.id"), nullable=False),
            sa.Column("code", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("account_type", sa.String(), nullable=False),
            sa.Column("account_subtype", sa.String(), nullable=True),
            sa.Column("parent_id", sa.String(length=36), sa.ForeignKey("account.id"), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_account_company_id", "account", ["company_id"])
        op.create_index("ix_account_code", "account", ["code"])
        op.create_index("ix_account_account_type", "account", ["account_type"])
        op.create_index("ix_account_parent_id", "account", ["parent_id"])

    if "journal_entry" not in tables:
        op.create_table(
            "journal_entry",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("company_id", sa.String(length=36), sa.ForeignKey("company.id"), nullable=False),
            sa.Column("entry_no", sa.String(), nullable=False),
            sa.Column("entry_date", sa.DateTime(), nullable=False),
            sa.Column("source_type", sa.String(), nullable=False),
            sa.Column("source_id", sa.String(length=36), nullable=True),
            sa.Column("memo", sa.String(), nullable=True),
            sa.Column("created_by", sa.String(length=36), nullable=True),
            sa.Column("posted_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_journal_entry_company_id", "journal_entry", ["company_id"])
        op.create_index("ix_journal_entry_entry_no", "journal_entry", ["entry_no"])
        op.create_index("ix_journal_entry_entry_date", "journal_entry", ["entry_date"])
        op.create_index("ix_journal_entry_source_type", "journal_entry", ["source_type"])
        op.create_index("ix_journal_entry_source_id", "journal_entry", ["source_id"])

    if "journal_line" not in tables:
        op.create_table(
            "journal_line",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("entry_id", sa.String(length=36), sa.ForeignKey("journal_entry.id"), nullable=False),
            sa.Column("account_id", sa.String(length=36), sa.ForeignKey("account.id"), nullable=False),
            sa.Column("debit", sa.Float(), nullable=False, server_default="0.0"),
            sa.Column("credit", sa.Float(), nullable=False, server_default="0.0"),
            sa.Column("store_id", sa.String(length=36), sa.ForeignKey("store.id"), nullable=True),
            sa.Column("memo", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_journal_line_entry_id", "journal_line", ["entry_id"])
        op.create_index("ix_journal_line_account_id", "journal_line", ["account_id"])
        op.create_index("ix_journal_line_store_id", "journal_line", ["store_id"])

    if "expense_category" not in tables:
        op.create_table(
            "expense_category",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("company_id", sa.String(length=36), sa.ForeignKey("company.id"), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("default_expense_account_id", sa.String(length=36), sa.ForeignKey("account.id"), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_expense_category_company_id", "expense_category", ["company_id"])

    if "expense" not in tables:
        op.create_table(
            "expense",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("company_id", sa.String(length=36), sa.ForeignKey("company.id"), nullable=False),
            sa.Column("category_id", sa.String(length=36), sa.ForeignKey("expense_category.id"), nullable=False),
            sa.Column("store_id", sa.String(length=36), sa.ForeignKey("store.id"), nullable=True),
            sa.Column("amount", sa.Float(), nullable=False, server_default="0.0"),
            sa.Column("paid_from_account_id", sa.String(length=36), sa.ForeignKey("account.id"), nullable=False),
            sa.Column("expense_date", sa.DateTime(), nullable=False),
            sa.Column("payee", sa.String(), nullable=True),
            sa.Column("note", sa.String(), nullable=True),
            sa.Column("created_by", sa.String(length=36), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_expense_company_id", "expense", ["company_id"])
        op.create_index("ix_expense_category_id", "expense", ["category_id"])


def downgrade() -> None:
    op.drop_index("ix_expense_category_id", table_name="expense")
    op.drop_index("ix_expense_company_id", table_name="expense")
    op.drop_table("expense")

    op.drop_index("ix_expense_category_company_id", table_name="expense_category")
    op.drop_table("expense_category")

    op.drop_index("ix_journal_line_store_id", table_name="journal_line")
    op.drop_index("ix_journal_line_account_id", table_name="journal_line")
    op.drop_index("ix_journal_line_entry_id", table_name="journal_line")
    op.drop_table("journal_line")

    op.drop_index("ix_journal_entry_source_id", table_name="journal_entry")
    op.drop_index("ix_journal_entry_source_type", table_name="journal_entry")
    op.drop_index("ix_journal_entry_entry_date", table_name="journal_entry")
    op.drop_index("ix_journal_entry_entry_no", table_name="journal_entry")
    op.drop_index("ix_journal_entry_company_id", table_name="journal_entry")
    op.drop_table("journal_entry")

    op.drop_index("ix_account_parent_id", table_name="account")
    op.drop_index("ix_account_account_type", table_name="account")
    op.drop_index("ix_account_code", table_name="account")
    op.drop_index("ix_account_company_id", table_name="account")
    op.drop_table("account")
