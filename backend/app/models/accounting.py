"""Double-entry accounting core — chart of accounts, journal entries, expenses."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import Field

from app.models.base import TimestampMixin, new_uuid


class Account(TimestampMixin, table=True):
    __tablename__ = "account"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    code: str = Field(index=True)
    name: str
    account_type: str = Field(index=True)  # asset, liability, equity, income, expense
    account_subtype: Optional[str] = None
    # cash, bank, accounts_receivable, inventory, tax_receivable,
    # accounts_payable, tax_payable, equity, revenue, cogs, expense
    parent_id: Optional[str] = Field(default=None, foreign_key="account.id", index=True)
    is_active: bool = True
    is_system: bool = False


class JournalEntry(TimestampMixin, table=True):
    __tablename__ = "journal_entry"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    entry_no: str = Field(index=True)
    entry_date: datetime = Field(index=True)
    source_type: str = Field(index=True)
    # sale, refund, purchase, supplier_payment, due_collection, opening_stock, expense, manual
    source_id: Optional[str] = Field(default=None, index=True)
    memo: Optional[str] = None
    created_by: Optional[str] = None
    posted_at: Optional[datetime] = None


class JournalLine(TimestampMixin, table=True):
    __tablename__ = "journal_line"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    entry_id: str = Field(foreign_key="journal_entry.id", index=True)
    account_id: str = Field(foreign_key="account.id", index=True)
    debit: float = 0
    credit: float = 0
    store_id: Optional[str] = Field(default=None, foreign_key="store.id", index=True)
    memo: Optional[str] = None


class ExpenseCategory(TimestampMixin, table=True):
    __tablename__ = "expense_category"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    name: str
    default_expense_account_id: str = Field(foreign_key="account.id")
    is_active: bool = True


class Expense(TimestampMixin, table=True):
    __tablename__ = "expense"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    category_id: str = Field(foreign_key="expense_category.id", index=True)
    store_id: Optional[str] = Field(default=None, foreign_key="store.id")
    amount: float = 0
    paid_from_account_id: str = Field(foreign_key="account.id")
    expense_date: datetime
    payee: Optional[str] = None
    note: Optional[str] = None
    created_by: Optional[str] = None


class AccountingSettings(TimestampMixin, table=True):
    """One row per company. books_locked_before blocks new/edited postings dated earlier than it."""
    __tablename__ = "accounting_settings"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True, unique=True)
    books_locked_before: Optional[datetime] = None
    updated_by: Optional[str] = None
