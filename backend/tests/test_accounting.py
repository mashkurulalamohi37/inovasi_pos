"""Phase 1-2 accounting core: chart of accounts, journal posting engine, expenses."""

from fastapi.testclient import TestClient
from sqlmodel import Session, select


def login(client: TestClient, email: str, password: str, company_code: str | None = None) -> dict[str, str]:
    code = company_code or ("PULSE-PLATFORM" if email == "super@pulse.pos" else "PULSE-DEMO")
    res = client.post("/api/v1/auth/login", json={"email": email, "password": password, "company_code": code})
    assert res.status_code == 200
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _create_account(client: TestClient, headers: dict[str, str], *, code: str, name: str, account_type: str) -> dict:
    res = client.post(
        "/api/v1/accounts",
        headers=headers,
        json={"code": code, "name": name, "account_type": account_type},
    )
    assert res.status_code == 200, res.text
    return res.json()


def test_create_account_and_list(auth_headers, client: TestClient):
    account = _create_account(client, auth_headers, code="TEST-1000", name="Test Asset", account_type="asset")
    assert account["code"] == "TEST-1000"
    assert account["is_system"] is False

    res = client.get("/api/v1/accounts", headers=auth_headers)
    assert res.status_code == 200
    assert any(a["id"] == account["id"] for a in res.json())


def test_manual_journal_entry_balanced_and_account_balances(auth_headers, client: TestClient):
    cash = _create_account(client, auth_headers, code="TEST-1010", name="Test Cash", account_type="asset")
    equity = _create_account(client, auth_headers, code="TEST-3100", name="Test Opening Equity", account_type="equity")

    res = client.post(
        "/api/v1/accounts/journal-entries",
        headers=auth_headers,
        json={
            "entry_date": "2026-01-01T00:00:00",
            "memo": "Owner capital injection",
            "lines": [
                {"account_id": cash["id"], "debit": 5000, "credit": 0},
                {"account_id": equity["id"], "debit": 0, "credit": 5000},
            ],
        },
    )
    assert res.status_code == 200, res.text
    entry = res.json()
    assert entry["entry_no"].startswith("JE-")
    assert entry["source_type"] == "manual"

    cash_balance = client.get(f"/api/v1/accounts/{cash['id']}/balance", headers=auth_headers).json()["balance"]
    equity_balance = client.get(f"/api/v1/accounts/{equity['id']}/balance", headers=auth_headers).json()["balance"]
    assert cash_balance == 5000.0
    assert equity_balance == 5000.0

    detail = client.get(f"/api/v1/accounts/journal-entries/{entry['id']}", headers=auth_headers).json()
    assert len(detail["lines"]) == 2
    assert {ln["debit"] for ln in detail["lines"]} == {5000, 0}


def test_manual_journal_entry_unbalanced_rejected(auth_headers, client: TestClient):
    cash = _create_account(client, auth_headers, code="TEST-1011", name="Test Cash 2", account_type="asset")
    equity = _create_account(client, auth_headers, code="TEST-3101", name="Test Equity 2", account_type="equity")

    res = client.post(
        "/api/v1/accounts/journal-entries",
        headers=auth_headers,
        json={
            "entry_date": "2026-01-01T00:00:00",
            "lines": [
                {"account_id": cash["id"], "debit": 100, "credit": 0},
                {"account_id": equity["id"], "debit": 0, "credit": 50},
            ],
        },
    )
    assert res.status_code == 400
    assert "not balanced" in res.json()["detail"].lower()


def test_create_expense_posts_balanced_journal_entry(auth_headers, client: TestClient):
    cash = _create_account(client, auth_headers, code="TEST-1012", name="Test Cash 3", account_type="asset")
    expense_account = _create_account(client, auth_headers, code="TEST-5200", name="Test Office Expense", account_type="expense")

    cat_res = client.post(
        "/api/v1/accounts/expense-categories",
        headers=auth_headers,
        json={"name": "Office Rent", "default_expense_account_id": expense_account["id"]},
    )
    assert cat_res.status_code == 200, cat_res.text
    category = cat_res.json()

    exp_res = client.post(
        "/api/v1/accounts/expenses",
        headers=auth_headers,
        json={
            "category_id": category["id"],
            "amount": 1200,
            "paid_from_account_id": cash["id"],
            "expense_date": "2026-01-05T00:00:00",
            "payee": "Landlord",
        },
    )
    assert exp_res.status_code == 200, exp_res.text

    expense_balance = client.get(f"/api/v1/accounts/{expense_account['id']}/balance", headers=auth_headers).json()["balance"]
    cash_balance = client.get(f"/api/v1/accounts/{cash['id']}/balance", headers=auth_headers).json()["balance"]
    assert expense_balance == 1200.0  # debit-normal, expense increased
    assert cash_balance == -1200.0  # debit-normal, cash decreased (paid out)


def test_journal_manage_permission_denied_for_inventory_user(client: TestClient):
    headers = login(client, "inventory@pulse.pos", "inventory123")
    res = client.post(
        "/api/v1/accounts/journal-entries",
        headers=headers,
        json={"entry_date": "2026-01-01T00:00:00", "lines": [{"account_id": "x", "debit": 1, "credit": 0}]},
    )
    assert res.status_code == 403


def test_expense_manage_permission_denied_for_inventory_user(client: TestClient):
    headers = login(client, "inventory@pulse.pos", "inventory123")
    res = client.post(
        "/api/v1/accounts/expenses",
        headers=headers,
        json={
            "category_id": "x",
            "amount": 100,
            "paid_from_account_id": "x",
            "expense_date": "2026-01-01T00:00:00",
        },
    )
    assert res.status_code == 403


# —— Phase 2: default chart-of-accounts seeding ——

def onboard_payload(**overrides) -> dict:
    base = {
        "company_code": "ACCT-PILOT-001",
        "company_name": "Accounting Pilot",
        "admin_email": "acct-pilot@example.com",
        "admin_password": "pilot123",
        "industry_packs": ["grocery"],
        "plan_code": "starter",
    }
    base.update(overrides)
    return base


def approve_company(client: TestClient, company_id: str, plan_code: str | None = None) -> dict:
    super_res = client.post(
        "/api/v1/auth/login",
        json={"email": "super@pulse.pos", "password": "super123", "company_code": "PULSE-PLATFORM"},
    )
    assert super_res.status_code == 200, super_res.text
    headers = {"Authorization": f"Bearer {super_res.json()['access_token']}"}
    body = {"billing_cycle": "monthly", "billing_months": 1}
    if plan_code:
        body["plan_code"] = plan_code
    res = client.post(f"/api/v1/super-admin/tenants/{company_id}/approve", headers=headers, json=body)
    assert res.status_code == 200, res.text
    return res.json()


def test_onboarding_seeds_default_chart_of_accounts_and_links_payment_methods(client: TestClient):
    res = client.post("/api/v1/onboarding/tenant/public", json=onboard_payload())
    assert res.status_code == 200, res.text
    data = res.json()
    approve_company(client, data["company_id"], "starter")
    headers = login(client, "acct-pilot@example.com", "pilot123", "ACCT-PILOT-001")

    accounts = client.get("/api/v1/accounts", headers=headers).json()
    codes = {a["code"] for a in accounts}
    assert {"1000", "1010", "1011", "1012", "1200", "1300", "1400", "2000", "2100", "2200", "3000", "3100", "3200", "4000", "4100", "4200", "5000", "5100", "5200"}.issubset(codes)

    cash_1011 = next(a for a in accounts if a["code"] == "1011")
    bank_1012 = next(a for a in accounts if a["code"] == "1012")

    methods = {m["code"]: m for m in client.get("/api/v1/payments/payment-methods", headers=headers).json()}
    assert methods["cash"]["linked_account_id"] == cash_1011["id"]
    assert methods["card"]["linked_account_id"] == bank_1012["id"]
    assert methods["mobile"]["linked_account_id"] == bank_1012["id"]


def test_seed_default_chart_of_accounts_is_idempotent(auth_headers, client: TestClient, session: Session):
    from app.services.accounting_service import seed_default_chart_of_accounts

    me = client.get("/api/v1/auth/me", headers=auth_headers)
    company_id = me.json()["company_id"]

    first = seed_default_chart_of_accounts(session, company_id)
    session.commit()
    second = seed_default_chart_of_accounts(session, company_id)
    session.commit()

    assert set(first.keys()) == set(second.keys())
    for code in first:
        assert first[code].id == second[code].id  # no duplicates created on re-seed


# —— Phase 3: auto-posting into existing transaction flows ——

def test_opening_stock_posts_inventory_vs_opening_equity_journal_entry(auth_headers, client: TestClient):
    product = client.get("/api/v1/products", headers=auth_headers, params={"q": "GROC-001"}).json()["items"][0]
    me = client.get("/api/v1/auth/me", headers=auth_headers)
    store_id = me.json()["store_id"]

    accounts = {a["code"]: a for a in client.get("/api/v1/accounts", headers=auth_headers).json()}
    inv_balance_before = client.get(f"/api/v1/accounts/{accounts['1300']['id']}/balance", headers=auth_headers).json()["balance"]
    equity_balance_before = client.get(f"/api/v1/accounts/{accounts['3100']['id']}/balance", headers=auth_headers).json()["balance"]

    res = client.post(
        "/api/v1/inventory/opening-stock",
        headers=auth_headers,
        json={"product_id": product["id"], "store_id": store_id, "qty": 7, "unit_cost": 250},
    )
    assert res.status_code == 200, res.text

    inv_balance_after = client.get(f"/api/v1/accounts/{accounts['1300']['id']}/balance", headers=auth_headers).json()["balance"]
    equity_balance_after = client.get(f"/api/v1/accounts/{accounts['3100']['id']}/balance", headers=auth_headers).json()["balance"]
    assert inv_balance_after == inv_balance_before + 1750  # 7 * 250, debit-normal asset increases
    assert equity_balance_after == equity_balance_before + 1750  # credit-normal equity increases

    entries = client.get("/api/v1/accounts/journal-entries?limit=5", headers=auth_headers).json()
    assert any(e["source_type"] == "opening_stock" for e in entries)


def test_due_collection_posts_cash_vs_receivable_journal_entry(auth_headers, client: TestClient, session: Session):
    from app.models.product import Customer, CustomerBalance

    customer = session.exec(select(Customer)).first()
    assert customer is not None
    bal = session.exec(
        select(CustomerBalance).where(
            CustomerBalance.company_id == customer.company_id, CustomerBalance.customer_id == customer.id,
        )
    ).first()
    if not bal:
        bal = CustomerBalance(company_id=customer.company_id, customer_id=customer.id, outstanding=0)
        session.add(bal)
    bal.outstanding = 500
    session.add(bal)
    session.commit()

    accounts = {a["code"]: a for a in client.get("/api/v1/accounts", headers=auth_headers).json()}
    cash_before = client.get(f"/api/v1/accounts/{accounts['1011']['id']}/balance", headers=auth_headers).json()["balance"]
    ar_before = client.get(f"/api/v1/accounts/{accounts['1200']['id']}/balance", headers=auth_headers).json()["balance"]

    res = client.post(
        "/api/v1/customer-payments",
        headers=auth_headers,
        json={"customer_id": customer.id, "amount": 200, "method": "cash"},
    )
    assert res.status_code == 200, res.text

    cash_after = client.get(f"/api/v1/accounts/{accounts['1011']['id']}/balance", headers=auth_headers).json()["balance"]
    ar_after = client.get(f"/api/v1/accounts/{accounts['1200']['id']}/balance", headers=auth_headers).json()["balance"]
    assert cash_after == cash_before + 200  # debit-normal asset: cash increases
    assert ar_after == ar_before - 200  # debit-normal asset: receivable decreases

    entries = client.get("/api/v1/accounts/journal-entries?limit=5", headers=auth_headers).json()
    assert any(e["source_type"] == "due_collection" for e in entries)


def test_purchase_receive_posts_inventory_vs_payable_journal_entry(auth_headers, client: TestClient):
    from test_operations import _approve_and_receive, _create_purchase, _get_supplier, get_product_by_sku

    product = get_product_by_sku(client, auth_headers, "GROC-001")
    supplier = _get_supplier(client, auth_headers)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=6, unit_cost=300)

    accounts = {a["code"]: a for a in client.get("/api/v1/accounts", headers=auth_headers).json()}
    inv_before = client.get(f"/api/v1/accounts/{accounts['1300']['id']}/balance", headers=auth_headers).json()["balance"]
    ap_before = client.get(f"/api/v1/accounts/{accounts['2100']['id']}/balance", headers=auth_headers).json()["balance"]

    _approve_and_receive(client, auth_headers, purchase, qty=6)

    inv_after = client.get(f"/api/v1/accounts/{accounts['1300']['id']}/balance", headers=auth_headers).json()["balance"]
    ap_after = client.get(f"/api/v1/accounts/{accounts['2100']['id']}/balance", headers=auth_headers).json()["balance"]
    assert inv_after == inv_before + 1800  # 6 * 300, debit-normal asset increases
    assert ap_after == ap_before + 1800  # credit-normal liability increases

    entries = client.get("/api/v1/accounts/journal-entries?limit=5", headers=auth_headers).json()
    assert any(e["source_type"] == "purchase" for e in entries)


def test_supplier_payment_posts_payable_vs_cash_journal_entry(auth_headers, client: TestClient):
    from test_operations import _approve_and_receive, _create_purchase, _get_supplier, get_product_by_sku

    product = get_product_by_sku(client, auth_headers, "GROC-001")
    supplier = _get_supplier(client, auth_headers)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=2, unit_cost=100)
    _approve_and_receive(client, auth_headers, purchase, qty=2)

    accounts = {a["code"]: a for a in client.get("/api/v1/accounts", headers=auth_headers).json()}
    ap_before = client.get(f"/api/v1/accounts/{accounts['2100']['id']}/balance", headers=auth_headers).json()["balance"]
    bank_before = client.get(f"/api/v1/accounts/{accounts['1012']['id']}/balance", headers=auth_headers).json()["balance"]

    res = client.post(
        "/api/v1/supplier-payments",
        headers=auth_headers,
        json={"supplier_id": supplier["id"], "amount": 150, "method": "bank", "reference": "ACCT-PAY-001"},
    )
    assert res.status_code == 200, res.text

    ap_after = client.get(f"/api/v1/accounts/{accounts['2100']['id']}/balance", headers=auth_headers).json()["balance"]
    bank_after = client.get(f"/api/v1/accounts/{accounts['1012']['id']}/balance", headers=auth_headers).json()["balance"]
    assert ap_after == ap_before - 150  # credit-normal liability decreases
    assert bank_after == bank_before - 150  # debit-normal asset decreases — cash paid out to the supplier

    entries = client.get("/api/v1/accounts/journal-entries?limit=5", headers=auth_headers).json()
    assert any(e["source_type"] == "supplier_payment" for e in entries)


def test_sale_posts_revenue_tax_and_cogs_journal_entries(auth_headers, client: TestClient, session: Session):
    from test_operations import _approve_and_receive, _create_purchase, _get_supplier, get_product_by_sku

    from app.models.inventory import StockBalance

    product = get_product_by_sku(client, auth_headers, "GROC-001")
    supplier = _get_supplier(client, auth_headers)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=50, unit_cost=200)
    _approve_and_receive(client, auth_headers, purchase, qty=50)  # nudges unit_cost_avg towards 200

    me = client.get("/api/v1/auth/me", headers=auth_headers).json()
    cost_row = session.exec(
        select(StockBalance).where(
            StockBalance.company_id == me["company_id"],
            StockBalance.product_id == product["id"],
            StockBalance.store_id == me["store_id"],
        )
    ).first()
    unit_cost_avg = cost_row.unit_cost_avg  # the moving average the sale's COGS hook will actually read

    accounts = {a["code"]: a for a in client.get("/api/v1/accounts", headers=auth_headers).json()}
    cash_before = client.get(f"/api/v1/accounts/{accounts['1011']['id']}/balance", headers=auth_headers).json()["balance"]
    revenue_before = client.get(f"/api/v1/accounts/{accounts['4100']['id']}/balance", headers=auth_headers).json()["balance"]
    tax_before = client.get(f"/api/v1/accounts/{accounts['2200']['id']}/balance", headers=auth_headers).json()["balance"]
    cogs_before = client.get(f"/api/v1/accounts/{accounts['5100']['id']}/balance", headers=auth_headers).json()["balance"]
    inv_before = client.get(f"/api/v1/accounts/{accounts['1300']['id']}/balance", headers=auth_headers).json()["balance"]

    subtotal = product["base_price"] * 2
    tax = round(subtotal * 0.05, 2)
    total = round(subtotal + tax, 2)
    res = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json={
            "client_transaction_id": "acct-sale-001",
            "industry_pack": "grocery",
            "lines": [{
                "product_id": product["id"], "sku": product["sku"], "name": product["name"],
                "qty": 2, "unit_price": product["base_price"],
            }],
            "subtotal": subtotal, "tax": tax, "total": total, "tender": "cash",
        },
    )
    assert res.status_code == 200, res.text

    cash_after = client.get(f"/api/v1/accounts/{accounts['1011']['id']}/balance", headers=auth_headers).json()["balance"]
    revenue_after = client.get(f"/api/v1/accounts/{accounts['4100']['id']}/balance", headers=auth_headers).json()["balance"]
    tax_after = client.get(f"/api/v1/accounts/{accounts['2200']['id']}/balance", headers=auth_headers).json()["balance"]
    cogs_after = client.get(f"/api/v1/accounts/{accounts['5100']['id']}/balance", headers=auth_headers).json()["balance"]
    inv_after = client.get(f"/api/v1/accounts/{accounts['1300']['id']}/balance", headers=auth_headers).json()["balance"]

    assert cash_after == round(cash_before + total, 2)
    assert revenue_after == round(revenue_before + subtotal, 2)
    assert tax_after == round(tax_before + tax, 2)
    assert cogs_after == round(cogs_before + 2 * unit_cost_avg, 2)
    assert inv_after == round(inv_before - 2 * unit_cost_avg, 2)

    entries = client.get("/api/v1/accounts/journal-entries?limit=5", headers=auth_headers).json()
    assert any(e["source_type"] == "sale" for e in entries)


def test_refund_posts_sales_returns_vs_cash_journal_entry(auth_headers, client: TestClient):
    product = client.get("/api/v1/products", headers=auth_headers, params={"q": "GROC-001"}).json()["items"][0]
    subtotal = product["base_price"]
    tax = round(subtotal * 0.05, 2)
    total = round(subtotal + tax, 2)
    sale = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json={
            "client_transaction_id": "acct-refund-sale-001",
            "industry_pack": "grocery",
            "lines": [{
                "product_id": product["id"], "sku": product["sku"], "name": product["name"],
                "qty": 1, "unit_price": product["base_price"],
            }],
            "subtotal": subtotal, "tax": tax, "total": total, "tender": "cash",
        },
    ).json()

    accounts = {a["code"]: a for a in client.get("/api/v1/accounts", headers=auth_headers).json()}
    cash_before = client.get(f"/api/v1/accounts/{accounts['1011']['id']}/balance", headers=auth_headers).json()["balance"]
    returns_before = client.get(f"/api/v1/accounts/{accounts['4200']['id']}/balance", headers=auth_headers).json()["balance"]

    refund = client.post(
        f"/api/v1/sales/{sale['id']}/refund",
        headers=auth_headers,
        json={"amount": total, "method": "cash", "reference": "ACCT-REF-001"},
    )
    assert refund.status_code == 200, refund.text

    cash_after = client.get(f"/api/v1/accounts/{accounts['1011']['id']}/balance", headers=auth_headers).json()["balance"]
    returns_after = client.get(f"/api/v1/accounts/{accounts['4200']['id']}/balance", headers=auth_headers).json()["balance"]
    assert cash_after == round(cash_before - total, 2)  # cash paid out
    # 4200 is credit-normal (income type); debiting it for the refund moves its balance negative —
    # standard for a contra-revenue account shown as a reduction within the Income section.
    assert returns_after == round(returns_before - total, 2)

    entries = client.get("/api/v1/accounts/journal-entries?limit=5", headers=auth_headers).json()
    assert any(e["source_type"] == "refund" for e in entries)


# —— Phase 4: financial statement reports + period lock ——

def test_trial_balance_always_balances(auth_headers, client: TestClient):
    accounts = {a["code"]: a for a in client.get("/api/v1/accounts", headers=auth_headers).json()}
    res = client.post(
        "/api/v1/accounts/journal-entries",
        headers=auth_headers,
        json={
            "entry_date": "2026-02-01T00:00:00",
            "memo": "TB test entry",
            "lines": [
                {"account_id": accounts["1011"]["id"], "debit": 777, "credit": 0},
                {"account_id": accounts["3100"]["id"], "debit": 0, "credit": 777},
            ],
        },
    )
    assert res.status_code == 200, res.text

    tb = client.get("/api/v1/accounts/trial-balance", headers=auth_headers).json()
    assert tb["balanced"] is True
    assert tb["total_debit"] == tb["total_credit"]
    row = next(r for r in tb["rows"] if r["code"] == "1011")
    assert row["debit"] > 0
    assert row["credit"] == 0


def test_profit_and_loss_reflects_sale_and_expense(auth_headers, client: TestClient):
    product = client.get("/api/v1/products", headers=auth_headers, params={"q": "GROC-001"}).json()["items"][0]
    subtotal = product["base_price"]
    tax = round(subtotal * 0.05, 2)
    total = round(subtotal + tax, 2)
    sale = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json={
            "client_transaction_id": "pl-test-sale-001",
            "industry_pack": "grocery",
            "lines": [{
                "product_id": product["id"], "sku": product["sku"], "name": product["name"],
                "qty": 1, "unit_price": product["base_price"],
            }],
            "subtotal": subtotal, "tax": tax, "total": total, "tender": "cash",
        },
    )
    assert sale.status_code == 200, sale.text

    accounts = {a["code"]: a for a in client.get("/api/v1/accounts", headers=auth_headers).json()}
    cat_res = client.post(
        "/api/v1/accounts/expense-categories",
        headers=auth_headers,
        json={"name": "P&L Test Rent", "default_expense_account_id": accounts["5200"]["id"]},
    )
    assert cat_res.status_code == 200, cat_res.text
    exp_res = client.post(
        "/api/v1/accounts/expenses",
        headers=auth_headers,
        json={
            "category_id": cat_res.json()["id"],
            "amount": 300,
            "paid_from_account_id": accounts["1011"]["id"],
            "expense_date": "2026-02-01T00:00:00",
        },
    )
    assert exp_res.status_code == 200, exp_res.text

    pl = client.get(
        "/api/v1/accounts/profit-loss",
        headers=auth_headers,
        params={"date_from": "2000-01-01", "date_to": "2030-01-01"},
    ).json()
    assert pl["total_revenue"] > 0
    assert pl["total_operating_expenses"] >= 300
    assert round(pl["gross_profit"] - pl["total_operating_expenses"], 2) == pl["net_profit"]


def test_balance_sheet_balances(auth_headers, client: TestClient):
    accounts = {a["code"]: a for a in client.get("/api/v1/accounts", headers=auth_headers).json()}
    client.post(
        "/api/v1/accounts/journal-entries",
        headers=auth_headers,
        json={
            "entry_date": "2026-02-02T00:00:00",
            "memo": "BS test entry",
            "lines": [
                {"account_id": accounts["1011"]["id"], "debit": 555, "credit": 0},
                {"account_id": accounts["3100"]["id"], "debit": 0, "credit": 555},
            ],
        },
    )
    bs = client.get(
        "/api/v1/accounts/balance-sheet", headers=auth_headers, params={"as_of": "2030-01-01"},
    ).json()
    assert bs["balanced"] is True
    assert bs["total_assets"] == round(bs["total_liabilities"] + bs["total_equity"], 2)


def test_account_ledger_running_balance(auth_headers, client: TestClient):
    accounts = {a["code"]: a for a in client.get("/api/v1/accounts", headers=auth_headers).json()}
    cash_id = accounts["1011"]["id"]
    equity_id = accounts["3100"]["id"]

    for amount in (100, 50):
        res = client.post(
            "/api/v1/accounts/journal-entries",
            headers=auth_headers,
            json={
                "entry_date": "2026-02-03T00:00:00",
                "memo": "ledger test",
                "lines": [
                    {"account_id": cash_id, "debit": amount, "credit": 0},
                    {"account_id": equity_id, "debit": 0, "credit": amount},
                ],
            },
        )
        assert res.status_code == 200, res.text

    ledger = client.get(f"/api/v1/accounts/{cash_id}/ledger", headers=auth_headers).json()
    assert len(ledger["entries"]) >= 2
    assert ledger["ending_balance"] == ledger["entries"][-1]["running_balance"]
    # running balance strictly increases across our two same-signed debit postings
    last_two = ledger["entries"][-2:]
    assert last_two[1]["running_balance"] == round(last_two[0]["running_balance"] + 50, 2)


def test_books_lock_rejects_backdated_entries(auth_headers, client: TestClient):
    accounts = {a["code"]: a for a in client.get("/api/v1/accounts", headers=auth_headers).json()}

    lock_res = client.patch(
        "/api/v1/accounts/settings",
        headers=auth_headers,
        params={"books_locked_before": "2026-06-01"},
    )
    assert lock_res.status_code == 200, lock_res.text
    assert lock_res.json()["books_locked_before"].startswith("2026-06-01")

    try:
        blocked = client.post(
            "/api/v1/accounts/journal-entries",
            headers=auth_headers,
            json={
                "entry_date": "2026-01-01T00:00:00",
                "lines": [
                    {"account_id": accounts["1011"]["id"], "debit": 10, "credit": 0},
                    {"account_id": accounts["3100"]["id"], "debit": 0, "credit": 10},
                ],
            },
        )
        assert blocked.status_code == 400
        assert "locked" in blocked.json()["detail"].lower()

        allowed = client.post(
            "/api/v1/accounts/journal-entries",
            headers=auth_headers,
            json={
                "entry_date": "2026-07-01T00:00:00",
                "lines": [
                    {"account_id": accounts["1011"]["id"], "debit": 10, "credit": 0},
                    {"account_id": accounts["3100"]["id"], "debit": 0, "credit": 10},
                ],
            },
        )
        assert allowed.status_code == 200, allowed.text
    finally:
        # Unlock so this test doesn't poison every other test in the file (shared demo company).
        client.patch("/api/v1/accounts/settings", headers=auth_headers, params={})


def test_period_close_permission_denied_for_inventory_user(client: TestClient):
    headers = login(client, "inventory@pulse.pos", "inventory123")
    res = client.patch("/api/v1/accounts/settings", headers=headers, params={"books_locked_before": "2026-01-01"})
    assert res.status_code == 403


# —— Regression tests: full-system audit findings ——

def test_books_lock_does_not_crash_auto_posted_hooks(auth_headers, client: TestClient):
    """Auto-posting hooks build entry_date as tz-aware datetime.now(utc); the lock date read
    back from the DB was naive, so comparing them used to raise an unhandled TypeError (500)
    instead of a clean pass/fail — for EVERY auto-posted transaction type, the instant any
    lock date was set. This posts opening stock (dated well after the lock) and asserts it
    succeeds cleanly rather than 500ing."""
    lock_res = client.patch(
        "/api/v1/accounts/settings", headers=auth_headers, params={"books_locked_before": "2020-01-01"},
    )
    assert lock_res.status_code == 200, lock_res.text
    try:
        product = client.get("/api/v1/products", headers=auth_headers, params={"q": "GROC-001"}).json()["items"][0]
        me = client.get("/api/v1/auth/me", headers=auth_headers).json()
        res = client.post(
            "/api/v1/inventory/opening-stock",
            headers=auth_headers,
            json={"product_id": product["id"], "store_id": me["store_id"], "qty": 1, "unit_cost": 50},
        )
        assert res.status_code == 200, res.text
    finally:
        client.patch("/api/v1/accounts/settings", headers=auth_headers, params={})


def test_sale_overpayment_within_tolerance_does_not_break_balance(auth_headers, client: TestClient):
    """_validate_payment_total allows cash tendered to exceed the sale total by up to 2 cents
    (change-giving tolerance). The GL hook used to book the full tendered amount as a debit,
    which doesn't balance against credit_lines (which sum to exactly total) — failing an
    otherwise-valid sale with 'Journal entry not balanced'. Change given must not appear on
    the debit side."""
    product = client.get("/api/v1/products", headers=auth_headers, params={"q": "GROC-001"}).json()["items"][0]
    subtotal = product["base_price"]
    tax = round(subtotal * 0.05, 2)
    total = round(subtotal + tax, 2)
    overpaid = round(total + 0.01, 2)  # within the 2-cent tolerance

    accounts = {a["code"]: a for a in client.get("/api/v1/accounts", headers=auth_headers).json()}
    cash_before = client.get(f"/api/v1/accounts/{accounts['1011']['id']}/balance", headers=auth_headers).json()["balance"]

    res = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json={
            "client_transaction_id": "acct-overpay-001",
            "industry_pack": "grocery",
            "lines": [{
                "product_id": product["id"], "sku": product["sku"], "name": product["name"],
                "qty": 1, "unit_price": product["base_price"],
            }],
            "subtotal": subtotal, "tax": tax, "total": total, "tender": "cash",
            "payments": [{"method": "cash", "amount": overpaid}],
        },
    )
    assert res.status_code == 200, res.text

    cash_after = client.get(f"/api/v1/accounts/{accounts['1011']['id']}/balance", headers=auth_headers).json()["balance"]
    assert cash_after == round(cash_before + total, 2)  # change given is dropped, not the overpaid amount


def test_manual_journal_entry_rejects_negative_line_amounts(auth_headers, client: TestClient):
    accounts = {a["code"]: a for a in client.get("/api/v1/accounts", headers=auth_headers).json()}
    res = client.post(
        "/api/v1/accounts/journal-entries",
        headers=auth_headers,
        json={
            "entry_date": "2026-03-01T00:00:00",
            "lines": [
                {"account_id": accounts["1011"]["id"], "debit": 200, "credit": 0},
                {"account_id": accounts["3100"]["id"], "debit": -100, "credit": 100},
            ],
        },
    )
    assert res.status_code == 422


def test_opening_stock_zero_rounded_amount_does_not_abort(auth_headers, client: TestClient):
    """qty * unit_cost rounding to exactly 0.00 used to trip the post_journal_entry
    'must have a nonzero amount' guard, aborting the entire opening-stock call (including
    the stock movement that had already happened in the same request)."""
    product = client.get("/api/v1/products", headers=auth_headers, params={"q": "GROC-001"}).json()["items"][0]
    me = client.get("/api/v1/auth/me", headers=auth_headers).json()
    stock_before = client.get("/api/v1/inventory/stock", headers=auth_headers).json()
    qty_before = next((s["qty_on_hand"] for s in stock_before if s["product_id"] == product["id"]), 0)

    res = client.post(
        "/api/v1/inventory/opening-stock",
        headers=auth_headers,
        json={"product_id": product["id"], "store_id": me["store_id"], "qty": 1, "unit_cost": 0.001},
    )
    assert res.status_code == 200, res.text

    stock_after = client.get("/api/v1/inventory/stock", headers=auth_headers).json()
    qty_after = next(s["qty_on_hand"] for s in stock_after if s["product_id"] == product["id"])
    assert qty_after == qty_before + 1


def test_tailor_commission_payment_posts_journal_entry(auth_headers, client: TestClient, session: Session):
    from app.models.industry import TailoringAlterationJob, TailorCommissionLedger
    from app.models.accounting import Account

    me = client.get("/api/v1/auth/me", headers=auth_headers).json()
    company_id = me["company_id"]

    # 1. Create a parent tailoring job
    job = TailoringAlterationJob(
        company_id=company_id,
        job_no="JOB-TEST-123",
        customer_name="Test Customer",
        garment_type="Panjabi",
        alteration_task="Stitching",
        master_name="Test Master Karim",
        status="collected",
        amount=1000.0,
    )
    session.add(job)
    session.commit()
    session.refresh(job)

    # 2. Create the commission record referencing the job
    comm = TailorCommissionLedger(
        company_id=company_id,
        tailor_name="Test Master Karim",
        job_id=job.id,
        job_amount=1000.0,
        commission_pct=15.0,
        payout_amount=150.0,
        status="unpaid",
    )
    session.add(comm)
    session.commit()
    session.refresh(comm)

    # Check cash and bank balances
    accounts = {a["code"]: a for a in client.get("/api/v1/accounts", headers=auth_headers).json()}
    cash_id = accounts["1011"]["id"]
    cash_before = client.get(f"/api/v1/accounts/{cash_id}/balance", headers=auth_headers).json()["balance"]

    # 3. Pay tailor commission via cash
    res = client.post(
        f"/api/v1/industry/tailoring/commissions/{comm.id}/pay",
        headers=auth_headers,
        params={"method": "cash"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "paid"

    # Verify cash decreased and expense posted
    cash_after = client.get(f"/api/v1/accounts/{cash_id}/balance", headers=auth_headers).json()["balance"]
    assert cash_after == cash_before - 150.0

    # Verify journal entry exists in ledger
    entries = client.get("/api/v1/accounts/journal-entries?limit=5", headers=auth_headers).json()
    assert any(
        e["source_type"] == "expense" and e["source_id"] == comm.id and "Karim" in e["memo"]
        for e in entries
    )
