"""Database and admin CLI for Pulse POS."""

from __future__ import annotations

import argparse
import sys
import time

from sqlmodel import Session, select, text

from app.config import settings
from app.database import engine
from app.models.core import Company, UserAccount, UserRole, Role, Store
from app.security import hash_password
from app.seed import seed_demo_data


def run_migrations(revision: str = "head") -> None:
    from alembic import command
    from alembic.config import Config

    from app.config import settings

    cfg = Config("alembic.ini")
    # Always bind to runtime settings (tests/CI), not the sample URL in alembic.ini.
    cfg.set_main_option("sqlalchemy.url", settings.database_url)
    command.upgrade(cfg, revision)
    print(f"Migrations applied: {revision}")


def rollback_migration(steps: str = "-1") -> None:
    from alembic import command
    from alembic.config import Config

    from app.config import settings

    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", settings.database_url)
    command.downgrade(cfg, steps)
    print(f"Migrations rolled back: {steps}")


def run_seed(force: bool = False) -> None:
    seed_demo_data(force=force)
    print("Seed completed.")


def reset_demo_tenant() -> None:
    with Session(engine) as session:
        company = session.exec(select(Company).where(Company.code == "PULSE-DEMO")).first()
        if company:
            cid = company.id
            tables = [
                "audit_log",
                "notification",
                "approval_action",
                "approval_request",
                "pos_device",
                "device_session",
                "support_impersonation",
                "subscription_usage",
                "tenant_subscription",
                "subscription_invoice",
                "subscription_payment",
                "sync_log",
                "payment",
                "receipt",
                "sales_invoice_line",
                "sales_invoice",
                "sales_return_line",
                "sales_return",
                "refund",
                "exchange_line",
                "exchange",
                "purchase_invoice_line",
                "purchase_invoice",
                "stock_ledger",
                "stock_balance",
                "product",
                "supplier",
                "customer",
                "payment_method",
                "store_policy",
                "receipt_template",
                "number_series",
                "tax_rule",
                "tenant_feature",
                "feature_flag",
                "industry_pack",
                "dynamic_field_definition",
                "user_role",
                "user_account",
                "role_permission",
                "role",
                "counter",
                "warehouse",
                "store",
                "brand",
                "company",
            ]
            for table in tables:
                try:
                    session.execute(text(f"DELETE FROM {table} WHERE company_id = :cid"), {"cid": cid})
                except Exception:
                    pass
            session.delete(company)
            session.commit()
            print("Removed PULSE-DEMO tenant data.")
    seed_demo_data(force=True)
    print("Demo tenant re-seeded.")


# Child rows are deleted before their parents. Every statement is scoped to one
# company; tables without a company_id are reached through their parent's ids.
_SALES_PURGE_PLAN: list[tuple[str, str]] = [
    # --- restaurant floor state ---
    ("restaurant_kot_line", "DELETE FROM restaurant_kot_line WHERE kot_id IN (SELECT id FROM restaurant_kot WHERE company_id = :cid)"),
    ("restaurant_kot", "DELETE FROM restaurant_kot WHERE company_id = :cid"),
    ("restaurant_order_line", "DELETE FROM restaurant_order_line WHERE order_id IN (SELECT id FROM restaurant_order WHERE company_id = :cid)"),
    ("restaurant_order", "DELETE FROM restaurant_order WHERE company_id = :cid"),
    # --- returns / refunds / exchanges (reference invoices, so go first) ---
    ("sales_return_line", "DELETE FROM sales_return_line WHERE return_id IN (SELECT id FROM sales_return WHERE company_id = :cid)"),
    ("refund", "DELETE FROM refund WHERE company_id = :cid"),
    ("sales_return", "DELETE FROM sales_return WHERE company_id = :cid"),
    ("exchange_line", "DELETE FROM exchange_line WHERE exchange_id IN (SELECT id FROM exchange WHERE company_id = :cid)"),
    ("exchange", "DELETE FROM exchange WHERE company_id = :cid"),
    # --- invoices, tenders, receipts ---
    ("receipt", "DELETE FROM receipt WHERE company_id = :cid"),
    ("payment", "DELETE FROM payment WHERE company_id = :cid"),
    # No company_id of its own — reached through the invoice line it extends.
    ("restaurant_sales_line_extension", "DELETE FROM restaurant_sales_line_extension WHERE line_id IN (SELECT id FROM sales_invoice_line WHERE invoice_id IN (SELECT id FROM sales_invoice WHERE company_id = :cid))"),
    ("sales_invoice_line", "DELETE FROM sales_invoice_line WHERE invoice_id IN (SELECT id FROM sales_invoice WHERE company_id = :cid)"),
    ("sales_invoice", "DELETE FROM sales_invoice WHERE company_id = :cid"),
    # --- accounting entries these transactions posted ---
    ("journal_line", "DELETE FROM journal_line WHERE entry_id IN (SELECT id FROM journal_entry WHERE company_id = :cid AND source_type IN ('sale', 'refund', 'sales_return', 'due_collection'))"),
    ("journal_entry", "DELETE FROM journal_entry WHERE company_id = :cid AND source_type IN ('sale', 'refund', 'sales_return', 'due_collection')"),
    # --- stock consumed by those sales (opening stock is preserved) ---
    ("stock_ledger", "DELETE FROM stock_ledger WHERE company_id = :cid AND transaction_type IN ('sale', 'sales_return')"),
    # --- shift takings that counted the deleted sales ---
    ("cashier_shift", "DELETE FROM cashier_shift WHERE company_id = :cid"),
]


def release_tables(company_code: str, force: bool = False, dry_run: bool = False) -> None:
    """Free dining tables that are showing as booked.

    By default only tables that cannot be settled from the POS are released:
    the order behind them is closed, missing, or has no lines (an order with no
    lines can never be paid — bill_and_pay_order rejects it with "No billable
    lines" — and update_table refuses to free a table while current_order_id is
    set, so the table is stuck for good).

    A table holding an order that has food on it is left alone; --force
    cancels those orders too, and should only be used outside service hours.
    """
    from app.models.industry import RestaurantOrder, RestaurantOrderLine, RestaurantTable

    with Session(engine) as session:
        company = session.exec(select(Company).where(Company.code == company_code)).first()
        if not company:
            raise SystemExit(f"Company not found: {company_code}")
        cid = company.id

        tables = session.exec(
            select(RestaurantTable).where(RestaurantTable.company_id == cid)
        ).all()
        print(f"Target: {company.name} ({company_code}) — {len(tables)} table(s)")
        print("Mode:  ", "DRY RUN" if dry_run else ("FORCE" if force else "stuck tables only"))
        print("-" * 68)

        released = kept = 0
        for tbl in sorted(tables, key=lambda t: t.table_no):
            if tbl.status == "available" and not tbl.current_order_id:
                continue

            order = (
                session.get(RestaurantOrder, tbl.current_order_id)
                if tbl.current_order_id
                else None
            )
            if order is not None and order.company_id != cid:
                order = None

            if order is None:
                why = "no order" if tbl.current_order_id else f"status={tbl.status}, no order"
            elif order.status in {"paid", "cancelled"}:
                why = f"order {order.order_no} is {order.status}"
            else:
                line_count = len(
                    session.exec(
                        select(RestaurantOrderLine).where(
                            RestaurantOrderLine.order_id == order.id
                        )
                    ).all()
                )
                if line_count == 0:
                    why = f"order {order.order_no} is empty"
                elif force:
                    why = f"order {order.order_no} has {line_count} item(s) — CANCELLED by --force"
                else:
                    print(f"  {tbl.table_no:<10} KEPT      order {order.order_no}, {line_count} item(s)")
                    kept += 1
                    continue

            if not dry_run:
                if order is not None and order.status not in {"paid", "cancelled"}:
                    order.status = "cancelled"
                    order.cancelled_reason = "Released via manage.py release-tables"
                    session.add(order)
                tbl.status = "available"
                tbl.current_order_id = None
                tbl.current_guest_count = None
                tbl.occupied_since = None
                tbl.assigned_waiter_id = None
                session.add(tbl)
            print(f"  {tbl.table_no:<10} RELEASED  {why}")
            released += 1

        if dry_run:
            session.rollback()
        else:
            session.commit()
        print("-" * 68)
        verb = "would be released" if dry_run else "released"
        print(f"{released} table(s) {verb}, {kept} left alone.")
        if kept and not force:
            print("Tables with food on them were kept. Re-run with --force to clear those too.")


def reset_company_sales(company_code: str, confirm: bool = False, dry_run: bool = False) -> None:
    """Erase transaction history for one tenant, keeping its catalogue and setup.

    Handover cleanup: the new owner gets their menu, tables, users, stores and
    opening stock intact, with no trace of demo trading. Products, categories,
    restaurant tables, customers, suppliers and settings are deliberately NOT
    touched.
    """
    from app.models.industry import RestaurantTable
    from app.models.inventory import StockBalance, StockLedger

    if not (confirm or dry_run):
        raise SystemExit(
            "Refusing to delete live data without --confirm (or use --dry-run to preview)."
        )

    with Session(engine) as session:
        company = session.exec(select(Company).where(Company.code == company_code)).first()
        if not company:
            raise SystemExit(f"Company not found: {company_code}")
        cid = company.id
        print(f"Target: {company.name} (code={company_code}, id={cid})")
        print("Mode:  ", "DRY RUN — nothing will be written" if dry_run else "DELETE")
        print("-" * 60)

        total = 0
        for label, stmt in _SALES_PURGE_PLAN:
            count_sql = "SELECT COUNT(*) FROM (" + stmt.replace("DELETE FROM", "SELECT 1 FROM", 1) + ") AS t"
            try:
                affected = session.execute(text(count_sql), {"cid": cid}).scalar() or 0
            except Exception as exc:  # table absent on older schemas
                print(f"  {label:<34} skipped ({type(exc).__name__})")
                session.rollback()
                continue
            if not dry_run and affected:
                session.execute(text(stmt), {"cid": cid})
            print(f"  {label:<34} {affected} row(s)")
            total += affected

        if not dry_run:
            # Free every table: their orders no longer exist.
            for tbl in session.exec(
                select(RestaurantTable).where(RestaurantTable.company_id == cid)
            ).all():
                tbl.status = "available"
                tbl.current_order_id = None
                tbl.current_guest_count = None
                tbl.occupied_since = None
                tbl.assigned_waiter_id = None
                session.add(tbl)

            # Rebuild on-hand quantities from the ledger rows that survived, so
            # stock reflects opening stock rather than post-demo balances.
            for bal in session.exec(
                select(StockBalance).where(StockBalance.company_id == cid)
            ).all():
                rows = session.exec(
                    select(StockLedger).where(
                        StockLedger.company_id == cid,
                        StockLedger.product_id == bal.product_id,
                    )
                ).all()
                rows = [r for r in rows if r.store_id == bal.store_id]
                bal.qty_on_hand = round(
                    sum(float(r.in_qty or 0) - float(r.out_qty or 0) for r in rows), 4
                )
                bal.qty_reserved = 0
                session.add(bal)

            session.commit()
            print("-" * 60)
            print(f"Deleted {total} row(s). Tables released, stock balances rebuilt.")
        else:
            session.rollback()
            print("-" * 60)
            print(f"Dry run complete — {total} row(s) would be deleted.")


def create_super_admin(
    email: str = "super@pulse.pos",
    password: str = "super123",
    full_name: str = "Platform Super Admin",
) -> None:
    from app.services.platform_iam_service import ensure_platform_super_admin

    with Session(engine) as session:
        user = ensure_platform_super_admin(
            session,
            email=email,
            password=password,
            full_name=full_name,
            reset_password=True,
        )
        session.commit()
        print(f"Ensured super admin: {user.email} (company PULSE-PLATFORM)")


SEED_DEMO_EMAILS = frozenset({
    "admin@pulse.pos",
    "manager@pulse.pos",
    "cashier@pulse.pos",
    "inventory@pulse.pos",
    "auditor@pulse.pos",
    "super@pulse.pos",
})


def create_tenant_user(
    email: str,
    password: str,
    role_code: str,
    company_code: str = "PULSE-DEMO",
    full_name: str | None = None,
    store_code: str | None = None,
) -> None:
    with Session(engine) as session:
        company = session.exec(select(Company).where(Company.code == company_code)).first()
        if not company:
            raise SystemExit(f"Company not found: {company_code}")

        if store_code:
            store = session.exec(
                select(Store).where(Store.company_id == company.id, Store.code == store_code)
            ).first()
        else:
            store = session.exec(select(Store).where(Store.company_id == company.id)).first()
        if not store:
            raise SystemExit(f"No store found for company {company_code}")

        role = session.exec(
            select(Role).where(Role.company_id == company.id, Role.code == role_code)
        ).first()
        if not role:
            raise SystemExit(f"Role not found: {role_code}")

        user = session.exec(select(UserAccount).where(UserAccount.email == email)).first()
        if user:
            user.password_hash = hash_password(password)
            user.is_active = True
            user.store_id = store.id
            user.company_id = company.id
            session.add(user)
            print(f"Updated user: {email}")
        else:
            user = UserAccount(
                company_id=company.id,
                store_id=store.id,
                email=email,
                username=email.split("@")[0],
                full_name=full_name or role_code,
                password_hash=hash_password(password),
            )
            session.add(user)
            session.flush()
            session.add(UserRole(user_id=user.id, role_id=role.id))
            print(f"Created user: {email} ({role_code})")

        session.commit()


def disable_demo_users(dry_run: bool = False) -> None:
    with Session(engine) as session:
        users = session.exec(
            select(UserAccount).where(UserAccount.email.in_(SEED_DEMO_EMAILS))  # type: ignore[attr-defined]
        ).all()
        if not users:
            print("No seed demo users found.")
            return
        for user in users:
            if dry_run:
                print(f"Would disable: {user.email} (active={user.is_active})")
            else:
                user.is_active = False
                session.add(user)
                print(f"Disabled: {user.email}")
        if not dry_run:
            session.commit()
            print("Seed demo users disabled. Live users must use named accounts.")


def wait_for_db(max_attempts: int = 30, delay: float = 2.0) -> None:
    for attempt in range(1, max_attempts + 1):
        try:
            with Session(engine) as session:
                session.execute(text("SELECT 1"))
            print("Database is ready.")
            return
        except Exception as exc:
            print(f"Waiting for database ({attempt}/{max_attempts}): {exc}")
            time.sleep(delay)
    raise RuntimeError("Database not available after waiting.")


def cleanup_expired_tokens() -> None:
    from datetime import datetime, timezone

    from app.models.core import RefreshToken

    now = datetime.now(timezone.utc)
    with Session(engine) as session:
        expired = session.exec(
            select(RefreshToken).where(RefreshToken.revoked == False)  # noqa: E712
        ).all()
        count = 0
        for rt in expired:
            expires = rt.expires_at
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            if expires < now:
                rt.revoked = True
                session.add(rt)
                count += 1
        session.commit()
        print(f"Revoked {count} expired refresh token(s).")


def backfill_chart_of_accounts() -> None:
    """Seed the default chart of accounts for every existing company that doesn't have one yet.

    New companies get this automatically at onboarding (onboarding_service.py); this
    command backfills companies created before the Accounts module existed.
    """
    from app.models.operations import PaymentMethod
    from app.services.accounting_service import seed_default_chart_of_accounts

    default_account_by_method = {"cash": "1011", "card": "1012", "mobile": "1012"}
    with Session(engine) as session:
        companies = session.exec(select(Company)).all()
        for company in companies:
            coa = seed_default_chart_of_accounts(session, company.id)
            methods = session.exec(
                select(PaymentMethod).where(PaymentMethod.company_id == company.id)
            ).all()
            for pm in methods:
                if pm.linked_account_id:
                    continue
                code = default_account_by_method.get(pm.code)
                if code and code in coa:
                    pm.linked_account_id = coa[code].id
                    session.add(pm)
            print(f"Seeded chart of accounts for {company.code} ({len(coa)} accounts)")
        session.commit()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Pulse POS management CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("migrate", help="Apply Alembic migrations (upgrade head)")
    sub.add_parser("migrate-down", help="Rollback one migration")
    sub.add_parser("seed", help="Load demo seed data (skips if PULSE-DEMO exists)")
    sub.add_parser("reset-demo", help="Reset PULSE-DEMO tenant and re-seed")
    sub.add_parser("wait-db", help="Wait until database accepts connections")
    sub.add_parser("cleanup-tokens", help="Revoke expired refresh tokens")
    sub.add_parser("readiness", help="Print go-live readiness checks")
    sub.add_parser("backfill-chart-of-accounts", help="Seed default chart of accounts for existing companies")

    admin = sub.add_parser("create-super-admin", help="Create or update platform super admin")
    admin.add_argument("--email", default="super@pulse.pos")
    admin.add_argument("--password", default="super123")
    admin.add_argument("--name", default="Platform Super Admin")

    user = sub.add_parser("create-tenant-user", help="Create or update a tenant user with role")
    user.add_argument("--email", required=True)
    user.add_argument("--password", required=True)
    user.add_argument("--role", required=True, help="Role code e.g. Admin, Cashier, Store Manager")
    user.add_argument("--company", default="PULSE-DEMO")
    user.add_argument("--name", default=None)
    user.add_argument("--store", default=None, help="Store code e.g. DHK-01")

    disable = sub.add_parser("disable-demo-users", help="Deactivate seed demo login accounts")
    disable.add_argument("--dry-run", action="store_true")

    free = sub.add_parser(
        "release-tables",
        help="Free dining tables stuck as booked (stuck ones only unless --force)",
    )
    free.add_argument("--company", required=True, help="Company code e.g. EIMAMA")
    free.add_argument(
        "--force",
        action="store_true",
        help="Also cancel orders that have items on them — outside service hours only",
    )
    free.add_argument("--dry-run", action="store_true", help="Preview only")

    purge = sub.add_parser(
        "reset-company-sales",
        help="Delete a tenant's sales/order history, keeping products, tables and users",
    )
    purge.add_argument("--company", required=True, help="Company code e.g. EIMAMA")
    purge.add_argument("--confirm", action="store_true", help="Required to actually delete")
    purge.add_argument("--dry-run", action="store_true", help="Preview row counts only")

    seed_acc = sub.add_parser(
        "seed-pos-account",
        help="Seed comprehensive demo products and images across all 19 POS shops for a specific client account",
    )
    seed_acc.add_argument("--company", help="Company code e.g. OUTFIT")
    seed_acc.add_argument("--email", help="Client user email e.g. outfit@pos.com")
    seed_acc.add_argument("--store", help="Optional store code (defaults to main store)")
    seed_acc.add_argument("--stock", type=int, default=100, help="Initial on-hand stock per product (default 100)")

    args = parser.parse_args(argv)

    if args.command == "wait-db":
        wait_for_db()
    elif args.command == "cleanup-tokens":
        cleanup_expired_tokens()
    elif args.command == "readiness":
        from app.services.readiness_service import build_readiness

        result = build_readiness(engine)
        for check in result["checks"]:
            status = "PASS" if check["ok"] else "FAIL"
            print(f"[{status}] {check['name']}: {check.get('detail', '')}")
        print(f"\nReady: {result['ready']} (environment={result['environment']})")
        return 0 if result["ready"] else 1
    elif args.command == "migrate":
        run_migrations("head")
    elif args.command == "migrate-down":
        rollback_migration("-1")
    elif args.command == "seed":
        run_seed(force=False)
    elif args.command == "reset-demo":
        reset_demo_tenant()
    elif args.command == "create-super-admin":
        create_super_admin(args.email, args.password, args.name)
    elif args.command == "create-tenant-user":
        create_tenant_user(
            args.email,
            args.password,
            args.role,
            company_code=args.company,
            full_name=args.name,
            store_code=args.store,
        )
    elif args.command == "disable-demo-users":
        disable_demo_users(dry_run=args.dry_run)
    elif args.command == "release-tables":
        release_tables(args.company, force=args.force, dry_run=args.dry_run)
    elif args.command == "reset-company-sales":
        reset_company_sales(args.company, confirm=args.confirm, dry_run=args.dry_run)
    elif args.command == "seed-pos-account":
        from app.seed_account_pos import seed_pos_account
        if not args.company and not args.email:
            print("Error: Provide --company <CODE> or --email <EMAIL>")
            return 1
        with Session(engine) as session:
            res = seed_pos_account(
                session,
                company_identifier=args.company,
                user_email=args.email,
                store_code=args.store,
                default_stock=args.stock,
            )
            print(f"Successfully seeded {res['total_products']} products across {res['packs_enabled']} POS shops for {res['company_name']} ({res['company_code']})!")
    elif args.command == "backfill-chart-of-accounts":
        backfill_chart_of_accounts()
    else:
        parser.print_help()
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
