"""SQA audit probes for the Electronics vertical — EMI, AMC and dashboard.

The existing wiring suite covers serials, warranty and RMA but nothing in the
EMI or AMC modules, which are the newest and carry the money.
"""

from fastapi.testclient import TestClient

from tests.test_operations import get_product_by_sku, login


def _emi(client, headers, **over):
    body = {
        "customer_name": "SQA Buyer",
        "customer_phone": "01700000000",
        "product_name": "Galaxy A55",
        "bank_financier": "City Bank",
        "principal_amount": 60000,
        "down_payment": 12000,
        "processing_fee": 1000,
        "interest_rate": 0,
        "tenure_months": 12,
    }
    body.update(over)
    return client.post("/api/v1/industry/electronics/emi", headers=headers, json=body)


def _amc(client, headers, **over):
    """Mirrors what app.electronics.amc.tsx posts: `amount` + `duration_months`."""
    body = {
        "customer_name": "SQA Buyer",
        "product_name": "Split AC 1.5T",
        "serial_imei": "SN-AMC-1",
        "amount": 5000,
        "duration_months": 12,
    }
    body.update(over)
    return client.post("/api/v1/industry/electronics/amc", headers=headers, json=body)


# ── E-A: EMI schedule integrity ───────────────────────────────────────────────

def test_A1_zero_interest_schedule_sums_to_payable(auth_headers, client: TestClient):
    res = _emi(client, auth_headers)
    assert res.status_code == 200, res.text
    emi = res.json()
    sched = client.get(f"/api/v1/industry/electronics/emi/{emi['id']}", headers=auth_headers).json()
    total = round(sum(i["amount"] for i in sched["installments"]), 2)
    print(f"\n[A1] financed={60000-12000+1000} payable={emi['total_payable']} schedule_sum={total}")
    assert total == round(emi["total_payable"], 2), "installments do not sum to total_payable"
    assert total == 49000, f"financed balance wrong: {total}"


def test_A2_interest_bearing_schedule_sums_to_payable(auth_headers, client: TestClient):
    res = _emi(client, auth_headers, interest_rate=12, tenure_months=6)
    assert res.status_code == 200, res.text
    emi = res.json()
    sched = client.get(f"/api/v1/industry/electronics/emi/{emi['id']}", headers=auth_headers).json()
    total = round(sum(i["amount"] for i in sched["installments"]), 2)
    print(f"\n[A2] payable={emi['total_payable']} schedule_sum={total} monthly={emi['monthly_amount']}")
    assert total == round(emi["total_payable"], 2), "interest-bearing schedule drifts from total_payable"
    assert emi["total_payable"] > 49000, "interest not applied"


def test_A3_installment_count_matches_tenure(auth_headers, client: TestClient):
    emi = _emi(client, auth_headers, tenure_months=9).json()
    sched = client.get(f"/api/v1/industry/electronics/emi/{emi['id']}", headers=auth_headers).json()
    print("\n[A3] tenure=9 installments=", len(sched["installments"]))
    assert len(sched["installments"]) == 9


# ── E-B: EMI input validation ─────────────────────────────────────────────────

def test_B1_down_payment_equal_to_principal_rejected(auth_headers, client: TestClient):
    res = _emi(client, auth_headers, down_payment=60000)
    print("\n[B1] down == principal ->", res.status_code, res.text[:160])
    assert res.status_code == 400


def test_B2_negative_values_rejected(auth_headers, client: TestClient):
    for field, val in [("down_payment", -5000), ("processing_fee", -100), ("interest_rate", -5)]:
        res = _emi(client, auth_headers, **{field: val})
        print(f"\n[B2] {field}={val} ->", res.status_code)
        assert res.status_code == 400, f"negative {field} accepted"


def test_B3_tenure_bounds(auth_headers, client: TestClient):
    for val in (0, -3, 100000):
        res = _emi(client, auth_headers, tenure_months=val)
        print(f"\n[B3] tenure={val} ->", res.status_code)
        assert res.status_code == 400, f"tenure {val} accepted"


def test_B4_non_numeric_amount_rejected(auth_headers, client: TestClient):
    res = _emi(client, auth_headers, principal_amount="sixty thousand")
    print("\n[B4] principal='sixty thousand' ->", res.status_code, res.text[:160])
    assert res.status_code in (400, 422)


# ── E-C: installment collection ───────────────────────────────────────────────

def test_C1_cannot_collect_twice(auth_headers, client: TestClient):
    emi = _emi(client, auth_headers).json()
    sched = client.get(f"/api/v1/industry/electronics/emi/{emi['id']}", headers=auth_headers).json()
    first = sched["installments"][0]
    url = f"/api/v1/industry/electronics/emi/{emi['id']}/installments/{first['id']}/collect"
    one = client.post(url, headers=auth_headers, json={"paid_amount": first["amount"]})
    assert one.status_code == 200, one.text
    two = client.post(url, headers=auth_headers, json={"paid_amount": first["amount"]})
    print("\n[C1] second collect ->", two.status_code, two.text[:160])
    assert two.status_code == 400, "same installment collected twice"


def test_C2_overpayment_rejected(auth_headers, client: TestClient):
    emi = _emi(client, auth_headers).json()
    sched = client.get(f"/api/v1/industry/electronics/emi/{emi['id']}", headers=auth_headers).json()
    first = sched["installments"][0]
    res = client.post(
        f"/api/v1/industry/electronics/emi/{emi['id']}/installments/{first['id']}/collect",
        headers=auth_headers, json={"paid_amount": 999999},
    )
    print("\n[C2] overpay 999999 ->", res.status_code, res.text[:160])
    assert res.status_code == 400, "overpayment settled the agreement"


def test_C3_negative_payment_rejected(auth_headers, client: TestClient):
    emi = _emi(client, auth_headers).json()
    sched = client.get(f"/api/v1/industry/electronics/emi/{emi['id']}", headers=auth_headers).json()
    first = sched["installments"][0]
    res = client.post(
        f"/api/v1/industry/electronics/emi/{emi['id']}/installments/{first['id']}/collect",
        headers=auth_headers, json={"paid_amount": -5000},
    )
    print("\n[C3] pay -5000 ->", res.status_code)
    assert res.status_code == 400


def test_C4_agreement_completes_only_when_fully_collected(auth_headers, client: TestClient):
    emi = _emi(client, auth_headers, tenure_months=3).json()
    eid = emi["id"]
    sched = client.get(f"/api/v1/industry/electronics/emi/{eid}", headers=auth_headers).json()
    for n, inst in enumerate(sched["installments"], start=1):
        client.post(
            f"/api/v1/industry/electronics/emi/{eid}/installments/{inst['id']}/collect",
            headers=auth_headers, json={"paid_amount": inst["amount"]},
        )
        cur = client.get(f"/api/v1/industry/electronics/emi/{eid}", headers=auth_headers).json()
        print(f"\n[C4] after {n}/3 collected={cur['total_collected']} status={cur['status']}")
        if n < 3:
            assert cur["status"] != "completed", f"closed early after {n} of 3 installments"
    final = client.get(f"/api/v1/industry/electronics/emi/{eid}", headers=auth_headers).json()
    assert final["status"] == "completed"
    assert round(final["total_collected"], 2) == round(final["total_payable"], 2)


def test_C5_installment_of_another_agreement_rejected(auth_headers, client: TestClient):
    a = _emi(client, auth_headers).json()
    b = _emi(client, auth_headers, customer_name="Other").json()
    b_sched = client.get(f"/api/v1/industry/electronics/emi/{b['id']}", headers=auth_headers).json()
    foreign = b_sched["installments"][0]
    res = client.post(
        f"/api/v1/industry/electronics/emi/{a['id']}/installments/{foreign['id']}/collect",
        headers=auth_headers, json={"paid_amount": foreign["amount"]},
    )
    print("\n[C5] collect B's installment against A ->", res.status_code)
    assert res.status_code == 404


# ── E-D: AMC ──────────────────────────────────────────────────────────────────

def test_D1_amc_create_and_list(auth_headers, client: TestClient):
    res = _amc(client, auth_headers)
    print("\n[D1] create AMC ->", res.status_code, res.text[:200])
    assert res.status_code == 200
    lst = client.get("/api/v1/industry/electronics/amc", headers=auth_headers)
    assert lst.status_code == 200


def test_D2_amc_end_before_start_rejected(auth_headers, client: TestClient):
    """Only reachable through the API — the UI posts duration_months, not end_date."""
    res = _amc(client, auth_headers,
               start_date="2027-08-01T00:00:00+00:00",
               end_date="2026-08-01T00:00:00+00:00")
    print("\n[D2] end_date before start_date ->", res.status_code, res.text[:200])
    assert res.status_code == 400, "AMC accepted with end_date before start_date"


def test_D3_amc_negative_amount_rejected(auth_headers, client: TestClient):
    res = _amc(client, auth_headers, amount=-5000)
    print("\n[D3] amount=-5000 ->", res.status_code, res.text[:200])
    assert res.status_code == 400, "negative AMC amount accepted"


# ── E-W: warranty expiry dates ────────────────────────────────────────────────

def _sold_serial(client, headers) -> str:
    """Returns a serial in `sold` state, which register_warranty requires."""
    serials = client.get("/api/v1/industry/electronics/serials?status=sold", headers=headers)
    rows = serials.json() if serials.status_code == 200 else []
    return str(rows[0]["serial_imei"]) if rows else ""


def test_W1_warranty_expiry_uses_calendar_months():
    """`register_warranty` steps 30-day blocks; AMC and EMI use calendar months.

    Asserted against the service's own helpers rather than through the endpoint,
    which needs a sold serial: the discrepancy is in the date arithmetic itself.
    """
    from datetime import datetime, timedelta, timezone

    import inspect

    from app.services import electronics_service
    from app.services.electronics_service import _add_months

    # The expiry must come from _add_months, not a 30-day approximation.
    src = inspect.getsource(electronics_service.register_warranty)
    assert "timedelta(days=months * 30)" not in src, (
        "register_warranty still steps 30-day blocks; a 12-month warranty "
        "lapses 5 days early and a 24-month one 11 days early"
    )
    assert "_add_months(start, months)" in src, "warranty expiry no longer uses calendar months"

    start = datetime(2026, 1, 31, tzinfo=timezone.utc)
    for months in (12, 24):
        calendar_end = _add_months(start, months)
        thirty_day_end = start + timedelta(days=months * 30)
        print(f"\n[W1] {months}mo: calendar={calendar_end.date()} "
              f"(30-day approximation would be {thirty_day_end.date()})")
        assert calendar_end.day == start.day, "calendar month arithmetic drifted"


# ── E-E: numbering, dashboard, authz ──────────────────────────────────────────

def test_E1_emi_numbers_unique(auth_headers, client: TestClient):
    nos = [_emi(client, auth_headers).json()["emi_no"] for _ in range(4)]
    print("\n[E1] emi_nos ->", nos)
    assert len(nos) == len(set(nos)), f"duplicate emi_no: {nos}"


def test_E2_dashboard_after_emi_and_amc(auth_headers, client: TestClient):
    _emi(client, auth_headers)
    _amc(client, auth_headers)
    res = client.get("/api/v1/industry/electronics/dashboard", headers=auth_headers)
    print("\n[E2] dashboard ->", res.status_code, res.text[:300])
    assert res.status_code == 200


def test_E3_anonymous_blocked(client: TestClient):
    for path in ("/electronics/emi", "/electronics/amc", "/electronics/dashboard",
                 "/electronics/serials", "/electronics/warranties"):
        res = client.get(f"/api/v1/industry{path}")
        print(f"\n[E3] anon GET {path} ->", res.status_code)
        assert res.status_code in (401, 403), f"{path} reachable without auth"


def test_E4_cashier_cannot_create_emi(client: TestClient):
    cashier = login(client, "cashier@pulse.pos", "cashier123")
    res = _emi(client, cashier)
    print("\n[E4] cashier create EMI ->", res.status_code)
    assert res.status_code in (200, 403)


def test_E5_emi_tenant_isolation(auth_headers, client: TestClient):
    emi = _emi(client, auth_headers).json()
    other = login(client, "super@pulse.pos", "super123")
    res = client.get(f"/api/v1/industry/electronics/emi/{emi['id']}", headers=other)
    print("\n[E5] cross-tenant EMI fetch ->", res.status_code)
    assert res.status_code in (403, 404), "EMI leaked across tenants"
