from typing import Annotated, Optional

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.database import get_session
from app.dependencies import AuthContext, get_current_user, require_permission
from app.schemas.accounting import (
    AccountIn,
    AccountUpdate,
    ExpenseCategoryIn,
    ExpenseIn,
    ManualJournalEntryIn,
)
from app.services.accounting_service import (
    create_account,
    create_expense,
    create_expense_category,
    create_manual_journal_entry,
    get_account_balance,
    get_account_ledger,
    get_balance_sheet,
    get_books_lock_date,
    get_profit_and_loss,
    get_trial_balance,
    list_chart_of_accounts,
    list_expense_categories,
    list_expenses,
    list_journal_entries,
    set_books_lock_date,
    update_account,
)

router = APIRouter(prefix="/accounts", tags=["accounting"])


@router.get("")
def accounts_list(
    auth: Annotated[AuthContext, Depends(require_permission("accounts.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    return list_chart_of_accounts(session, auth.company_id)


@router.post("")
def accounts_create(
    body: AccountIn,
    auth: Annotated[AuthContext, Depends(require_permission("accounts.manage_chart"))],
    session: Annotated[Session, Depends(get_session)],
):
    account = create_account(session, auth, body.model_dump())
    session.commit()
    return account


# NOTE: static-path routes below (settings, trial-balance, profit-loss, balance-sheet) must be
# registered before the dynamic "/{account_id}" routes further down — otherwise Starlette would
# match e.g. PATCH /accounts/settings against the "/{account_id}" handler with account_id="settings".

@router.get("/settings")
def accounting_settings_get(
    auth: Annotated[AuthContext, Depends(require_permission("accounts.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    return get_books_lock_date(session, auth.company_id)


@router.patch("/settings")
def accounting_settings_update(
    auth: Annotated[AuthContext, Depends(require_permission("accounts.period_close"))],
    session: Annotated[Session, Depends(get_session)],
    books_locked_before: Optional[str] = None,
):
    from app.models.base import parse_iso_dt

    result = set_books_lock_date(session, auth, parse_iso_dt(books_locked_before) if books_locked_before else None)
    session.commit()
    return result


@router.get("/trial-balance")
def trial_balance(
    auth: Annotated[AuthContext, Depends(require_permission("accounts.view"))],
    session: Annotated[Session, Depends(get_session)],
    as_of: Optional[str] = None,
):
    from app.models.base import parse_iso_dt

    return get_trial_balance(session, auth.company_id, parse_iso_dt(as_of) if as_of else None)


@router.get("/profit-loss")
def profit_and_loss(
    auth: Annotated[AuthContext, Depends(require_permission("accounts.view"))],
    session: Annotated[Session, Depends(get_session)],
    date_from: str,
    date_to: str,
):
    from fastapi import HTTPException
    from app.models.base import parse_iso_dt

    parsed_from = parse_iso_dt(date_from)
    parsed_to = parse_iso_dt(date_to)
    if not parsed_from or not parsed_to:
        raise HTTPException(status_code=400, detail="date_from and date_to are required ISO dates")
    return get_profit_and_loss(session, auth.company_id, parsed_from, parsed_to)


@router.get("/balance-sheet")
def balance_sheet(
    auth: Annotated[AuthContext, Depends(require_permission("accounts.view"))],
    session: Annotated[Session, Depends(get_session)],
    as_of: str,
):
    from fastapi import HTTPException
    from app.models.base import parse_iso_dt

    parsed = parse_iso_dt(as_of)
    if not parsed:
        raise HTTPException(status_code=400, detail="as_of is a required ISO date")
    return get_balance_sheet(session, auth.company_id, parsed)


@router.get("/{account_id}/ledger")
def account_ledger(
    account_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("accounts.view"))],
    session: Annotated[Session, Depends(get_session)],
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    from app.models.base import parse_iso_dt

    return get_account_ledger(
        session, auth.company_id, account_id,
        from_date=parse_iso_dt(date_from) if date_from else None,
        to_date=parse_iso_dt(date_to) if date_to else None,
    )


@router.patch("/{account_id}")
def accounts_update(
    account_id: str,
    body: AccountUpdate,
    auth: Annotated[AuthContext, Depends(require_permission("accounts.manage_chart"))],
    session: Annotated[Session, Depends(get_session)],
):
    account = update_account(session, auth, account_id, body.model_dump(exclude_unset=True))
    session.commit()
    return account


@router.get("/{account_id}/balance")
def account_balance(
    account_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("accounts.view"))],
    session: Annotated[Session, Depends(get_session)],
    as_of: Optional[str] = None,
):
    from app.models.base import parse_iso_dt

    balance = get_account_balance(session, auth.company_id, account_id, parse_iso_dt(as_of) if as_of else None)
    return {"account_id": account_id, "balance": balance}


@router.get("/journal-entries")
def journal_entries_list(
    auth: Annotated[AuthContext, Depends(require_permission("accounts.view"))],
    session: Annotated[Session, Depends(get_session)],
    limit: int = 100,
):
    return list_journal_entries(session, auth.company_id, limit=limit)


@router.get("/journal-entries/{entry_id}")
def journal_entry_detail(
    entry_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("accounts.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from fastapi import HTTPException
    from sqlmodel import select

    from app.models.accounting import Account, JournalEntry, JournalLine

    entry = session.get(JournalEntry, entry_id)
    if not entry or entry.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    lines = session.exec(select(JournalLine).where(JournalLine.entry_id == entry.id)).all()
    accounts = {a.id: a for a in session.exec(select(Account).where(Account.company_id == auth.company_id)).all()}
    return {
        "id": entry.id,
        "entry_no": entry.entry_no,
        "entry_date": entry.entry_date.isoformat() if entry.entry_date else None,
        "source_type": entry.source_type,
        "source_id": entry.source_id,
        "memo": entry.memo,
        "created_by": entry.created_by,
        "posted_at": entry.posted_at.isoformat() if entry.posted_at else None,
        "lines": [
            {
                "id": ln.id,
                "account_id": ln.account_id,
                "account_code": accounts[ln.account_id].code if ln.account_id in accounts else None,
                "account_name": accounts[ln.account_id].name if ln.account_id in accounts else None,
                "debit": ln.debit,
                "credit": ln.credit,
                "store_id": ln.store_id,
                "memo": ln.memo,
            }
            for ln in lines
        ],
    }


@router.post("/journal-entries")
def journal_entry_create(
    body: ManualJournalEntryIn,
    auth: Annotated[AuthContext, Depends(require_permission("accounts.journal_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    entry = create_manual_journal_entry(
        session, auth,
        entry_date=body.entry_date,
        memo=body.memo,
        lines=[ln.model_dump() for ln in body.lines],
    )
    session.commit()
    return entry


@router.get("/expense-categories")
def expense_categories_list(
    auth: Annotated[AuthContext, Depends(require_permission("accounts.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    return list_expense_categories(session, auth.company_id)


@router.post("/expense-categories")
def expense_categories_create(
    body: ExpenseCategoryIn,
    auth: Annotated[AuthContext, Depends(require_permission("accounts.manage_chart"))],
    session: Annotated[Session, Depends(get_session)],
):
    category = create_expense_category(session, auth, body.model_dump())
    session.commit()
    return category


@router.get("/expenses")
def expenses_list(
    auth: Annotated[AuthContext, Depends(require_permission("accounts.view"))],
    session: Annotated[Session, Depends(get_session)],
    limit: int = 100,
):
    return list_expenses(session, auth.company_id, limit=limit)


@router.post("/expenses")
def expenses_create(
    body: ExpenseIn,
    auth: Annotated[AuthContext, Depends(require_permission("accounts.expense_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    expense = create_expense(session, auth, body.model_dump())
    session.commit()
    return expense
