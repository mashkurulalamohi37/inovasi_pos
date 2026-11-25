from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class AccountIn(BaseModel):
    code: str
    name: str
    account_type: str  # asset, liability, equity, income, expense
    account_subtype: Optional[str] = None
    parent_id: Optional[str] = None


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    account_subtype: Optional[str] = None
    parent_id: Optional[str] = None
    is_active: Optional[bool] = None


class JournalLineIn(BaseModel):
    account_id: str
    debit: float = Field(default=0, ge=0)
    credit: float = Field(default=0, ge=0)
    store_id: Optional[str] = None
    memo: Optional[str] = None


class ManualJournalEntryIn(BaseModel):
    entry_date: datetime
    memo: Optional[str] = None
    lines: list[JournalLineIn]


class ExpenseCategoryIn(BaseModel):
    name: str
    default_expense_account_id: str


class ExpenseIn(BaseModel):
    category_id: str
    store_id: Optional[str] = None
    amount: float
    paid_from_account_id: str
    expense_date: datetime
    payee: Optional[str] = None
    note: Optional[str] = None
