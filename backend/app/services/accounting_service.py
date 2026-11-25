"""Double-entry accounting engine — chart of accounts, journal posting, expenses.

post_journal_entry is the single choke point every transaction-type hook
(sales, purchases, payments, opening stock, expenses, manual entries) calls
through. Entries are immutable once posted — corrections are reversing
entries, never edits/deletes.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlmodel import Session, select

from app.dependencies import AuthContext, write_audit
from app.models.accounting import Account, AccountingSettings, Expense, ExpenseCategory, JournalEntry, JournalLine
from app.models.audit import AuditLog
from app.models.base import as_utc
from app.services.purchase_service import _next_number

DEBIT_NORMAL_TYPES = {"asset", "expense"}
INCOME_TYPES = {"income"}
EXPENSE_TYPES = {"expense"}
BALANCE_SHEET_TYPES = {"asset", "liability", "equity"}


def _get_books_lock_date(session: Session, company_id: str) -> datetime | None:
    settings = session.exec(
        select(AccountingSettings).where(AccountingSettings.company_id == company_id)
    ).first()
    return settings.books_locked_before if settings else None


def _account_out(a: Account, balance: float | None = None) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": a.id,
        "code": a.code,
        "name": a.name,
        "account_type": a.account_type,
        "account_subtype": a.account_subtype,
        "parent_id": a.parent_id,
        "is_active": a.is_active,
        "is_system": a.is_system,
    }
    if balance is not None:
        out["balance"] = balance
    return out


def _entry_out(e: JournalEntry) -> dict[str, Any]:
    return {
        "id": e.id,
        "entry_no": e.entry_no,
        "entry_date": e.entry_date.isoformat() if e.entry_date else None,
        "source_type": e.source_type,
        "source_id": e.source_id,
        "memo": e.memo,
        "created_by": e.created_by,
        "posted_at": e.posted_at.isoformat() if e.posted_at else None,
    }


def _expense_category_out(c: ExpenseCategory) -> dict[str, Any]:
    return {
        "id": c.id,
        "name": c.name,
        "default_expense_account_id": c.default_expense_account_id,
        "is_active": c.is_active,
    }


def _expense_out(e: Expense) -> dict[str, Any]:
    return {
        "id": e.id,
        "category_id": e.category_id,
        "store_id": e.store_id,
        "amount": e.amount,
        "paid_from_account_id": e.paid_from_account_id,
        "expense_date": e.expense_date.isoformat() if e.expense_date else None,
        "payee": e.payee,
        "note": e.note,
        "created_by": e.created_by,
    }


def post_journal_entry(
    session: Session,
    *,
    company_id: str,
    created_by: str | None,
    entry_date: datetime,
    source_type: str,
    source_id: str | None,
    lines: list[dict[str, Any]],
    memo: str | None = None,
) -> JournalEntry:
    """The single choke point every transaction-type hook posts through.

    Takes company_id/created_by as primitives (not a full AuthContext) so it
    can be called from deep service functions (sales/purchase/inventory hooks)
    that don't carry a request-scoped auth object, as well as from routes that do.
    """
    if not lines or len(lines) < 2:
        raise HTTPException(status_code=400, detail="Journal entry requires at least two lines")
    if any(float(ln.get("debit") or 0) < 0 or float(ln.get("credit") or 0) < 0 for ln in lines):
        raise HTTPException(status_code=400, detail="Journal line debit/credit amounts cannot be negative")

    total_debit = round(sum(float(ln.get("debit") or 0) for ln in lines), 2)
    total_credit = round(sum(float(ln.get("credit") or 0) for ln in lines), 2)
    if total_debit != total_credit:
        raise HTTPException(
            status_code=400,
            detail=f"Journal entry not balanced: debit {total_debit} != credit {total_credit}",
        )
    if total_debit <= 0:
        raise HTTPException(status_code=400, detail="Journal entry must have a nonzero amount")

    lock_date = _get_books_lock_date(session, company_id)
    if lock_date and as_utc(entry_date) < as_utc(lock_date):
        raise HTTPException(
            status_code=400,
            detail=f"Books are locked before {lock_date.date().isoformat()} — cannot post an entry dated {entry_date.date().isoformat()}",
        )

    entry = JournalEntry(
        company_id=company_id,
        entry_no=_next_number(session, company_id, "JOURNAL", "JE"),
        entry_date=entry_date,
        source_type=source_type,
        source_id=source_id,
        memo=memo,
        created_by=created_by,
        posted_at=datetime.now(timezone.utc),
    )
    session.add(entry)
    session.flush()

    for ln in lines:
        account = session.get(Account, ln["account_id"])
        if not account or account.company_id != company_id:
            raise HTTPException(status_code=400, detail=f"Unknown account_id: {ln['account_id']}")
        session.add(
            JournalLine(
                entry_id=entry.id,
                account_id=ln["account_id"],
                debit=float(ln.get("debit") or 0),
                credit=float(ln.get("credit") or 0),
                store_id=ln.get("store_id"),
                memo=ln.get("memo"),
            )
        )
    session.flush()
    session.add(
        AuditLog(
            company_id=company_id,
            user_id=created_by,
            action="journal_entry_post",
            entity_type="journal_entry",
            entity_id=entry.id,
            detail_json=json.dumps({"source_type": source_type, "amount": total_debit}),
        )
    )
    return entry


def list_journal_entries(session: Session, company_id: str, *, limit: int = 100) -> list[dict[str, Any]]:
    entries = session.exec(
        select(JournalEntry)
        .where(JournalEntry.company_id == company_id)
        .order_by(JournalEntry.entry_date.desc())  # type: ignore
        .limit(limit)
    ).all()
    entry_ids = [e.id for e in entries]
    totals: dict[str, float] = {}
    if entry_ids:
        lines = session.exec(select(JournalLine).where(JournalLine.entry_id.in_(entry_ids))).all()
        for ln in lines:
            totals[ln.entry_id] = totals.get(ln.entry_id, 0) + ln.debit
    return [{**_entry_out(e), "total_debit": round(totals.get(e.id, 0), 2)} for e in entries]


def create_manual_journal_entry(
    session: Session,
    auth: AuthContext,
    *,
    entry_date: datetime,
    lines: list[dict[str, Any]],
    memo: str | None = None,
) -> dict[str, Any]:
    entry = post_journal_entry(
        session,
        company_id=auth.company_id,
        created_by=auth.user_id,
        entry_date=entry_date,
        source_type="manual",
        source_id=None,
        lines=lines,
        memo=memo,
    )
    return _entry_out(entry)


def get_account_by_code(session: Session, company_id: str, code: str) -> Account:
    account = session.exec(
        select(Account).where(Account.company_id == company_id, Account.code == code)
    ).first()
    if not account:
        raise HTTPException(status_code=400, detail=f"Chart of accounts missing expected account {code} — run backfill-chart-of-accounts")
    return account


def get_linked_account_id(session: Session, company_id: str, payment_method_code: str) -> str:
    from app.models.operations import PaymentMethod

    pm = session.exec(
        select(PaymentMethod).where(PaymentMethod.company_id == company_id, PaymentMethod.code == payment_method_code)
    ).first()
    if pm and pm.linked_account_id:
        return pm.linked_account_id
    # Fall back to the default clearing account rather than hard-failing a sale/payment
    # over an unmapped method — this can be fixed later without blocking operations.
    return get_account_by_code(session, company_id, "1012").id


def get_account_balance(
    session: Session,
    company_id: str,
    account_id: str,
    as_of_date: datetime | None = None,
) -> float:
    account = session.get(Account, account_id)
    if not account or account.company_id != company_id:
        raise HTTPException(status_code=404, detail="Account not found")

    stmt = (
        select(JournalLine)
        .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
        .where(JournalEntry.company_id == company_id, JournalLine.account_id == account_id)
    )
    if as_of_date:
        stmt = stmt.where(JournalEntry.entry_date <= as_of_date)
    lines = session.exec(stmt).all()
    total_debit = sum(ln.debit for ln in lines)
    total_credit = sum(ln.credit for ln in lines)
    if account.account_type in DEBIT_NORMAL_TYPES:
        return round(total_debit - total_credit, 2)
    return round(total_credit - total_debit, 2)


def list_chart_of_accounts(session: Session, company_id: str) -> list[dict[str, Any]]:
    accounts = session.exec(
        select(Account).where(Account.company_id == company_id).order_by(Account.code)  # type: ignore
    ).all()
    # Batch sum debits and credits across all accounts for this company
    stmt = (
        select(JournalLine.account_id, JournalLine.debit, JournalLine.credit)
        .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
        .where(JournalEntry.company_id == company_id)
    )
    lines = session.exec(stmt).all()
    debit_map: dict[str, float] = {}
    credit_map: dict[str, float] = {}
    for acc_id, deb, cred in lines:
        debit_map[acc_id] = debit_map.get(acc_id, 0.0) + (deb or 0.0)
        credit_map[acc_id] = credit_map.get(acc_id, 0.0) + (cred or 0.0)

    result: list[dict[str, Any]] = []
    for a in accounts:
        d = debit_map.get(a.id, 0.0)
        c = credit_map.get(a.id, 0.0)
        if a.account_type in DEBIT_NORMAL_TYPES:
            bal = round(d - c, 2)
        else:
            bal = round(c - d, 2)
        result.append(_account_out(a, balance=bal))
    return result


def create_account(session: Session, auth: AuthContext, data: dict[str, Any]) -> dict[str, Any]:
    if data.get("parent_id"):
        parent = session.get(Account, data["parent_id"])
        if not parent or parent.company_id != auth.company_id:
            raise HTTPException(status_code=400, detail="Unknown parent_id")
    existing = session.exec(
        select(Account).where(Account.company_id == auth.company_id, Account.code == data["code"])
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Account code already exists: {data['code']}")

    account = Account(
        company_id=auth.company_id,
        code=data["code"],
        name=data["name"],
        account_type=data["account_type"],
        account_subtype=data.get("account_subtype"),
        parent_id=data.get("parent_id"),
    )
    session.add(account)
    session.flush()
    write_audit(session, auth, "account_create", "account", account.id, {"code": account.code})
    return _account_out(account)


def update_account(session: Session, auth: AuthContext, account_id: str, data: dict[str, Any]) -> dict[str, Any]:
    account = session.get(Account, account_id)
    if not account or account.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Account not found")
    for field in ("name", "account_subtype", "parent_id", "is_active"):
        if data.get(field) is not None:
            setattr(account, field, data[field])
    session.add(account)
    write_audit(session, auth, "account_update", "account", account.id, {})
    return _account_out(account)


def list_expense_categories(session: Session, company_id: str) -> list[dict[str, Any]]:
    categories = session.exec(
        select(ExpenseCategory).where(ExpenseCategory.company_id == company_id, ExpenseCategory.is_active == True)  # noqa: E712
    ).all()
    return [_expense_category_out(c) for c in categories]


def create_expense_category(session: Session, auth: AuthContext, data: dict[str, Any]) -> dict[str, Any]:
    account = session.get(Account, data["default_expense_account_id"])
    if not account or account.company_id != auth.company_id:
        raise HTTPException(status_code=400, detail="Unknown default_expense_account_id")
    category = ExpenseCategory(
        company_id=auth.company_id,
        name=data["name"],
        default_expense_account_id=data["default_expense_account_id"],
    )
    session.add(category)
    session.flush()
    write_audit(session, auth, "expense_category_create", "expense_category", category.id, {"name": category.name})
    return _expense_category_out(category)


def list_expenses(session: Session, company_id: str, *, limit: int = 100) -> list[dict[str, Any]]:
    expenses = session.exec(
        select(Expense)
        .where(Expense.company_id == company_id)
        .order_by(Expense.expense_date.desc())  # type: ignore
        .limit(limit)
    ).all()
    return [_expense_out(e) for e in expenses]


def create_expense(session: Session, auth: AuthContext, data: dict[str, Any]) -> dict[str, Any]:
    category = session.get(ExpenseCategory, data["category_id"])
    if not category or category.company_id != auth.company_id:
        raise HTTPException(status_code=400, detail="Unknown category_id")
    paid_from = session.get(Account, data["paid_from_account_id"])
    if not paid_from or paid_from.company_id != auth.company_id:
        raise HTTPException(status_code=400, detail="Unknown paid_from_account_id")
    amount = float(data["amount"])
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Expense amount must be greater than zero")

    expense = Expense(
        company_id=auth.company_id,
        category_id=data["category_id"],
        store_id=data.get("store_id"),
        amount=amount,
        paid_from_account_id=data["paid_from_account_id"],
        expense_date=data["expense_date"],
        payee=data.get("payee"),
        note=data.get("note"),
        created_by=auth.user_id,
    )
    session.add(expense)
    session.flush()

    memo = f"Expense: {category.name}"
    if data.get("payee"):
        memo += f" — {data['payee']}"

    post_journal_entry(
        session,
        company_id=auth.company_id,
        created_by=auth.user_id,
        entry_date=expense.expense_date,
        source_type="expense",
        source_id=expense.id,
        lines=[
            {"account_id": category.default_expense_account_id, "debit": amount, "memo": data.get("note")},
            {"account_id": data["paid_from_account_id"], "credit": amount},
        ],
        memo=memo,
    )
    return _expense_out(expense)


# —— Default chart of accounts (seeded at company onboarding + backfillable) ——

DEFAULT_CHART_OF_ACCOUNTS: list[dict[str, Any]] = [
    {"code": "1000", "name": "Assets", "account_type": "asset", "parent_code": None},
    {"code": "1010", "name": "Cash & Bank", "account_type": "asset", "account_subtype": "bank", "parent_code": "1000"},
    {"code": "1011", "name": "Cash - Main", "account_type": "asset", "account_subtype": "cash", "parent_code": "1010", "is_system": False},
    {"code": "1012", "name": "Bank & Card Clearing", "account_type": "asset", "account_subtype": "bank", "parent_code": "1010", "is_system": False},
    {"code": "1200", "name": "Accounts Receivable", "account_type": "asset", "account_subtype": "accounts_receivable", "parent_code": "1000"},
    {"code": "1300", "name": "Inventory Asset", "account_type": "asset", "account_subtype": "inventory", "parent_code": "1000"},
    {"code": "1400", "name": "Input Tax / VAT Receivable", "account_type": "asset", "account_subtype": "tax_receivable", "parent_code": "1000"},
    {"code": "2000", "name": "Liabilities", "account_type": "liability", "parent_code": None},
    {"code": "2100", "name": "Accounts Payable", "account_type": "liability", "account_subtype": "accounts_payable", "parent_code": "2000"},
    {"code": "2200", "name": "Tax Payable / VAT Payable", "account_type": "liability", "account_subtype": "tax_payable", "parent_code": "2000"},
    {"code": "3000", "name": "Equity", "account_type": "equity", "parent_code": None},
    {"code": "3100", "name": "Opening Balance Equity", "account_type": "equity", "account_subtype": "equity", "parent_code": "3000"},
    {"code": "3200", "name": "Retained Earnings", "account_type": "equity", "account_subtype": "equity", "parent_code": "3000"},
    {"code": "4000", "name": "Income", "account_type": "income", "parent_code": None},
    {"code": "4100", "name": "Sales Revenue", "account_type": "income", "account_subtype": "revenue", "parent_code": "4000"},
    {"code": "4200", "name": "Sales Returns & Allowances", "account_type": "income", "account_subtype": "revenue", "parent_code": "4000"},
    {"code": "5000", "name": "Expenses", "account_type": "expense", "parent_code": None},
    {"code": "5100", "name": "Cost of Goods Sold", "account_type": "expense", "account_subtype": "cogs", "parent_code": "5000"},
    {"code": "5200", "name": "Operating Expenses", "account_type": "expense", "account_subtype": "expense", "parent_code": "5000"},
]


def seed_default_chart_of_accounts(session: Session, company_id: str) -> dict[str, Account]:
    """Idempotent — creates only the codes missing for this company. Returns code -> Account."""
    by_code: dict[str, Account] = {
        a.code: a for a in session.exec(select(Account).where(Account.company_id == company_id)).all()
    }
    for spec in DEFAULT_CHART_OF_ACCOUNTS:
        if spec["code"] in by_code:
            continue
        parent = by_code.get(spec["parent_code"]) if spec.get("parent_code") else None
        account = Account(
            company_id=company_id,
            code=spec["code"],
            name=spec["name"],
            account_type=spec["account_type"],
            account_subtype=spec.get("account_subtype"),
            parent_id=parent.id if parent else None,
            is_system=spec.get("is_system", True),
        )
        session.add(account)
        session.flush()
        by_code[spec["code"]] = account
    return by_code


# —— Books lock (simple period control) ——

def get_books_lock_date(session: Session, company_id: str) -> dict[str, Any]:
    lock_date = _get_books_lock_date(session, company_id)
    return {"books_locked_before": lock_date.isoformat() if lock_date else None}


def set_books_lock_date(session: Session, auth: AuthContext, lock_date: datetime | None) -> dict[str, Any]:
    settings = session.exec(
        select(AccountingSettings).where(AccountingSettings.company_id == auth.company_id)
    ).first()
    if not settings:
        settings = AccountingSettings(company_id=auth.company_id)
    settings.books_locked_before = lock_date
    settings.updated_by = auth.user_id
    session.add(settings)
    session.flush()
    write_audit(
        session, auth, "accounting_period_close", "accounting_settings", settings.id,
        {"books_locked_before": lock_date.isoformat() if lock_date else None},
    )
    return {"books_locked_before": settings.books_locked_before.isoformat() if settings.books_locked_before else None}


# —— Financial statements ——

_EPOCH = datetime(2000, 1, 1, tzinfo=timezone.utc)


def get_trial_balance(session: Session, company_id: str, as_of_date: datetime | None = None) -> dict[str, Any]:
    accounts = session.exec(
        select(Account).where(Account.company_id == company_id).order_by(Account.code)  # type: ignore
    ).all()
    rows: list[dict[str, Any]] = []
    total_debit = 0.0
    total_credit = 0.0
    for a in accounts:
        stmt = (
            select(JournalLine)
            .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
            .where(JournalEntry.company_id == company_id, JournalLine.account_id == a.id)
        )
        if as_of_date:
            stmt = stmt.where(JournalEntry.entry_date <= as_of_date)
        lines = session.exec(stmt).all()
        net = round(sum(ln.debit for ln in lines) - sum(ln.credit for ln in lines), 2)
        if net == 0:
            continue
        debit_col = net if net > 0 else 0.0
        credit_col = -net if net < 0 else 0.0
        rows.append({
            "account_id": a.id, "code": a.code, "name": a.name, "account_type": a.account_type,
            "debit": debit_col, "credit": credit_col,
        })
        total_debit += debit_col
        total_credit += credit_col
    total_debit = round(total_debit, 2)
    total_credit = round(total_credit, 2)
    return {
        "as_of": as_of_date.isoformat() if as_of_date else None,
        "currency_code": "BDT",
        "rows": rows,
        "total_debit": total_debit,
        "total_credit": total_credit,
        "balanced": total_debit == total_credit,
    }


def get_profit_and_loss(session: Session, company_id: str, from_date: datetime, to_date: datetime) -> dict[str, Any]:
    accounts = session.exec(
        select(Account).where(Account.company_id == company_id, Account.account_type.in_(["income", "expense"]))
    ).all()

    def _period_amount(account: Account) -> float:
        stmt = (
            select(JournalLine)
            .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
            .where(
                JournalEntry.company_id == company_id,
                JournalLine.account_id == account.id,
                JournalEntry.entry_date >= from_date,
                JournalEntry.entry_date <= to_date,
            )
        )
        lines = session.exec(stmt).all()
        debit_sum = sum(ln.debit for ln in lines)
        credit_sum = sum(ln.credit for ln in lines)
        if account.account_type == "income":
            return round(credit_sum - debit_sum, 2)
        return round(debit_sum - credit_sum, 2)

    revenue_rows, cogs_rows, opex_rows = [], [], []
    for a in accounts:
        amount = _period_amount(a)
        if amount == 0:
            continue
        row = {"account_id": a.id, "code": a.code, "name": a.name, "amount": amount}
        if a.account_type == "income":
            revenue_rows.append(row)
        elif a.account_subtype == "cogs":
            cogs_rows.append(row)
        else:
            opex_rows.append(row)

    total_revenue = round(sum(r["amount"] for r in revenue_rows), 2)
    total_cogs = round(sum(r["amount"] for r in cogs_rows), 2)
    gross_profit = round(total_revenue - total_cogs, 2)
    total_opex = round(sum(r["amount"] for r in opex_rows), 2)
    net_profit = round(gross_profit - total_opex, 2)

    return {
        "from": from_date.isoformat(), "to": to_date.isoformat(),
        "currency_code": "BDT",
        "revenue": revenue_rows, "total_revenue": total_revenue,
        "cogs": cogs_rows, "total_cogs": total_cogs,
        "gross_profit": gross_profit,
        "operating_expenses": opex_rows, "total_operating_expenses": total_opex,
        "net_profit": net_profit,
    }


def get_balance_sheet(session: Session, company_id: str, as_of_date: datetime) -> dict[str, Any]:
    accounts = session.exec(
        select(Account).where(Account.company_id == company_id, Account.account_type.in_(list(BALANCE_SHEET_TYPES)))
    ).all()

    def _balance(account: Account) -> float:
        stmt = (
            select(JournalLine)
            .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
            .where(
                JournalEntry.company_id == company_id,
                JournalLine.account_id == account.id,
                JournalEntry.entry_date <= as_of_date,
            )
        )
        lines = session.exec(stmt).all()
        debit_sum = sum(ln.debit for ln in lines)
        credit_sum = sum(ln.credit for ln in lines)
        if account.account_type == "asset":
            return round(debit_sum - credit_sum, 2)
        return round(credit_sum - debit_sum, 2)

    assets, liabilities, equity = [], [], []
    for a in accounts:
        bal = _balance(a)
        if bal == 0:
            continue
        row = {"account_id": a.id, "code": a.code, "name": a.name, "amount": bal}
        if a.account_type == "asset":
            assets.append(row)
        elif a.account_type == "liability":
            liabilities.append(row)
        else:
            equity.append(row)

    total_assets = round(sum(r["amount"] for r in assets), 2)
    total_liabilities = round(sum(r["amount"] for r in liabilities), 2)
    total_equity_posted = round(sum(r["amount"] for r in equity), 2)

    # Current-period net income hasn't been closed to Retained Earnings yet (no period-close
    # step exists) — fold it into Equity as a synthetic line so Assets == Liabilities + Equity.
    current_earnings = get_profit_and_loss(session, company_id, _EPOCH, as_of_date)["net_profit"]
    if current_earnings != 0:
        equity.append({
            "account_id": None, "code": None, "name": "Current Earnings (unposted)", "amount": current_earnings,
        })
    total_equity = round(total_equity_posted + current_earnings, 2)

    return {
        "as_of": as_of_date.isoformat(),
        "currency_code": "BDT",
        "assets": assets, "total_assets": total_assets,
        "liabilities": liabilities, "total_liabilities": total_liabilities,
        "equity": equity, "total_equity": total_equity,
        "balanced": round(total_assets, 2) == round(total_liabilities + total_equity, 2),
    }


def get_account_ledger(
    session: Session,
    company_id: str,
    account_id: str,
    *,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
) -> dict[str, Any]:
    account = session.get(Account, account_id)
    if not account or account.company_id != company_id:
        raise HTTPException(status_code=404, detail="Account not found")

    stmt = (
        select(JournalLine, JournalEntry)
        .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
        .where(JournalEntry.company_id == company_id, JournalLine.account_id == account_id)
    )
    if from_date:
        stmt = stmt.where(JournalEntry.entry_date >= from_date)
    if to_date:
        stmt = stmt.where(JournalEntry.entry_date <= to_date)
    stmt = stmt.order_by(JournalEntry.entry_date, JournalEntry.entry_no)  # type: ignore
    rows = session.exec(stmt).all()

    debit_normal = account.account_type in DEBIT_NORMAL_TYPES
    running = 0.0
    entries = []
    for ln, e in rows:
        delta = (ln.debit - ln.credit) if debit_normal else (ln.credit - ln.debit)
        running = round(running + delta, 2)
        entries.append({
            "entry_id": e.id,
            "entry_no": e.entry_no,
            "entry_date": e.entry_date.isoformat() if e.entry_date else None,
            "source_type": e.source_type,
            "memo": ln.memo or e.memo,
            "debit": ln.debit,
            "credit": ln.credit,
            "running_balance": running,
        })
    return {"account": _account_out(account), "entries": entries, "ending_balance": running}
