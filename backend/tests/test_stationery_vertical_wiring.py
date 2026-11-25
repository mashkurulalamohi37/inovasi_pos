"""Phase 6B-13 — Stationery vertical wiring tests."""

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.core import Company
from app.models.inventory import StockBalance
from app.models.product import Product
from tests.test_operations import (
    _create_purchase,
    _get_supplier,
    _store_id,
    get_product_by_sku,
    login,
)


def _units(client: TestClient, headers: dict) -> dict[str, str]:
    res = client.get("/api/v1/units", headers=headers)
    assert res.status_code == 200, res.text
    return {u["code"]: u["id"] for u in res.json()}


def _dealer(client: TestClient, headers: dict) -> dict:
    res = client.get("/api/v1/customers", headers=headers, params={"q": "Karim"})
    assert res.status_code == 200
    rows = res.json()
    if isinstance(rows, dict):
        rows = rows.get("items") or rows.get("data") or []
    hit = next((c for c in rows if c.get("code") == "CUS-003"), None)
    if hit:
        return hit
    created = client.post(
        "/api/v1/customers",
        headers=headers,
        json={"code": "ST-DEAL-1", "name": "Stationery Dealer", "customer_group": "dealer"},
    )
    assert created.status_code == 200, created.text
    return created.json()


def test_stationery_profile_create_update_and_tenant_isolation(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "ST-PEN")
    ok = client.post(
        "/api/v1/industry/stationery/profiles",
        headers=auth_headers,
        json={"product_id": product["id"], "color": "Navy", "tip_size": "0.5mm"},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["color"] == "Navy"

    got = client.get(f"/api/v1/industry/stationery/profiles/{product['id']}", headers=auth_headers)
    assert got.status_code == 200
    assert got.json()["tip_size"] == "0.5mm"

    other_co = session.exec(select(Company).where(Company.code != "PULSE-DEMO")).first()
    assert other_co is not None
    foreign = Product(
        company_id=other_co.id,
        sku="FK-ST-X",
        name="Foreign Pen",
        industry_pack="stationery",
        base_price=10,
    )
    session.add(foreign)
    session.commit()
    blocked = client.post(
        "/api/v1/industry/stationery/profiles",
        headers=auth_headers,
        json={"product_id": foreign.id, "color": "Red"},
    )
    assert blocked.status_code in {400, 404}


def test_uom_dozen_box_conversion_and_invalid_blocked(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "ST-PEN")
    units = _units(client, auth_headers)

    doz = client.post(
        "/api/v1/industry/stationery/quote",
        headers=auth_headers,
        json={"product_id": product["id"], "entered_qty": 2, "sales_uom_id": units["DOZ"]},
    )
    assert doz.status_code == 200, doz.text
    assert doz.json()["base_qty"] == 24
    assert doz.json()["conversion_factor"] == 12

    box = client.post(
        "/api/v1/industry/stationery/quote",
        headers=auth_headers,
        json={"product_id": product["id"], "entered_qty": 1, "sales_uom_id": units["BOX"]},
    )
    assert box.status_code == 200, box.text
    assert box.json()["base_qty"] == 50

    # Fractional piece blocked
    bad = client.post(
        "/api/v1/industry/stationery/quote",
        headers=auth_headers,
        json={"product_id": product["id"], "entered_qty": 1.5, "sales_uom_id": units["PCS"]},
    )
    assert bad.status_code == 400

    # Unknown UOM conversion blocked
    bad_uom = client.post(
        "/api/v1/industry/stationery/quote",
        headers=auth_headers,
        json={"product_id": product["id"], "entered_qty": 1, "sales_uom_id": units.get("CTN") or units["M"]},
    )
    assert bad_uom.status_code == 400


def test_package_barcode_resolves_selling_uom(auth_headers, client: TestClient):
    res = client.get(
        "/api/v1/industry/stationery/lookup/barcode",
        headers=auth_headers,
        params={"code": "STPENBOX"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["sku"] == "ST-PEN"
    assert body["conversion_factor"] == 50
    units = _units(client, auth_headers)
    assert body["sales_uom_id"] == units["BOX"]


def test_purchase_grn_box_converts_to_base(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "ST-PEN")
    units = _units(client, auth_headers)
    store_id = _store_id(client, auth_headers)
    supplier = _get_supplier(client, auth_headers)
    bal_before = session.exec(
        select(StockBalance).where(StockBalance.product_id == product["id"], StockBalance.store_id == store_id)
    ).first()
    qty_before = float(bal_before.qty_on_hand) if bal_before else 0

    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=2, unit_cost=500)
    appr = client.post(f"/api/v1/purchases/{purchase['id']}/approve", headers=auth_headers)
    assert appr.status_code == 200, appr.text
    recv = client.post(
        f"/api/v1/purchases/{purchase['id']}/receive",
        headers=auth_headers,
        json={
            "lines": [
                {
                    "purchase_line_id": purchase["lines"][0]["id"],
                    "qty": 2,
                    "purchase_uom_id": units["BOX"],
                }
            ]
        },
    )
    assert recv.status_code == 200, recv.text
    session.expire_all()
    bal_after = session.exec(
        select(StockBalance).where(StockBalance.product_id == product["id"], StockBalance.store_id == store_id)
    ).first()
    assert float(bal_after.qty_on_hand) == qty_before + 100  # 2 boxes * 50 pcs


def test_school_list_crud_duplicate_cross_tenant_activate(auth_headers, client: TestClient, session: Session):
    created = client.post(
        "/api/v1/industry/stationery/school-lists",
        headers=auth_headers,
        json={
            "list_code": "ST-TEST-LIST",
            "list_name": "Test Class List",
            "class_or_grade": "7",
            "academic_year": "2026",
            "status": "draft",
        },
    )
    assert created.status_code == 200, created.text
    list_id = created.json()["id"]

    pen = get_product_by_sku(client, auth_headers, "ST-PEN")
    a4 = get_product_by_sku(client, auth_headers, "ST-A4")
    added = client.post(
        f"/api/v1/industry/stationery/school-lists/{list_id}/items",
        headers=auth_headers,
        json={"product_id": pen["id"], "recommended_qty": 6, "sequence_no": 1},
    )
    assert added.status_code == 200, added.text

    dup = client.post(
        f"/api/v1/industry/stationery/school-lists/{list_id}/items",
        headers=auth_headers,
        json={"product_id": pen["id"]},
    )
    assert dup.status_code == 409

    other_co = session.exec(select(Company).where(Company.code != "PULSE-DEMO")).first()
    foreign = Product(
        company_id=other_co.id,
        sku="FK-ST-LIST",
        name="Foreign Khata",
        industry_pack="stationery",
        base_price=10,
    )
    session.add(foreign)
    session.commit()
    blocked = client.post(
        f"/api/v1/industry/stationery/school-lists/{list_id}/items",
        headers=auth_headers,
        json={"product_id": foreign.id},
    )
    assert blocked.status_code == 400

    client.post(
        f"/api/v1/industry/stationery/school-lists/{list_id}/items",
        headers=auth_headers,
        json={"product_id": a4["id"], "recommended_qty": 1},
    )
    activated = client.post(
        f"/api/v1/industry/stationery/school-lists/{list_id}/status",
        headers=auth_headers,
        json={"status": "active"},
    )
    assert activated.status_code == 200, activated.text
    assert activated.json()["status"] == "active"


def test_availability_and_cart_resolve_honesty(auth_headers, client: TestClient, session: Session):
    store_id = _store_id(client, auth_headers)
    lists = client.get("/api/v1/industry/stationery/school-lists", headers=auth_headers)
    assert lists.status_code == 200
    seed_list = next(x for x in lists.json() if x["list_code"] == "CLASS6-SUPPLY-2026")
    list_id = seed_list["id"]

    # Force khata low stock for partial
    khata = get_product_by_sku(client, auth_headers, "ST-KHATA")
    bal = session.exec(
        select(StockBalance).where(StockBalance.product_id == khata["id"], StockBalance.store_id == store_id)
    ).first()
    assert bal is not None
    bal.qty_on_hand = 2  # required is 5
    session.add(bal)
    # Force a4-like out: create temp item with zero stock product — use ST-A4 zeroed temporarily
    a4 = get_product_by_sku(client, auth_headers, "ST-A4")
    a4_bal = session.exec(
        select(StockBalance).where(StockBalance.product_id == a4["id"], StockBalance.store_id == store_id)
    ).first()
    prev_a4 = float(a4_bal.qty_on_hand) if a4_bal else 0
    if a4_bal:
        a4_bal.qty_on_hand = 0
        session.add(a4_bal)
    session.commit()

    # Add A4 to seed list for OOS case
    client.post(
        f"/api/v1/industry/stationery/school-lists/{list_id}/items",
        headers=auth_headers,
        json={"product_id": a4["id"], "recommended_qty": 1, "sequence_no": 9},
    )

    avail = client.get(
        f"/api/v1/industry/stationery/school-lists/{list_id}/availability",
        headers=auth_headers,
        params={"store_id": store_id},
    )
    assert avail.status_code == 200, avail.text
    by_sku = {r["sku"]: r for r in avail.json()}
    assert by_sku["ST-PEN"]["availability"] == "available"
    assert by_sku["ST-KHATA"]["availability"] == "partial"
    assert by_sku["ST-A4"]["availability"] == "out_of_stock"

    cart = client.post(
        f"/api/v1/industry/stationery/school-lists/{list_id}/cart-resolve",
        headers=auth_headers,
        json={"store_id": store_id},
    )
    assert cart.status_code == 200, cart.text
    body = cart.json()
    assert body["all_available"] is False
    assert any(i["sku"] == "ST-PEN" for i in body["available_items"])
    assert any(i["sku"] == "ST-KHATA" for i in body["partial_items"])
    assert any(i["sku"] == "ST-A4" for i in body["unavailable_items"])
    partial = next(i for i in body["partial_items"] if i["sku"] == "ST-KHATA")
    assert partial["max_available_qty"] == 2
    assert partial["qty"] == 2

    # restore stock for other tests
    bal.qty_on_hand = 500
    session.add(bal)
    if a4_bal:
        a4_bal.qty_on_hand = prev_a4 or 3000
        session.add(a4_bal)
    session.commit()


def test_dealer_and_bulk_price_precedence(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "ST-PEN")
    units = _units(client, auth_headers)
    dealer = _dealer(client, auth_headers)

    bulk = client.post(
        "/api/v1/industry/stationery/quote",
        headers=auth_headers,
        json={"product_id": product["id"], "entered_qty": 24, "sales_uom_id": units["PCS"]},
    )
    assert bulk.status_code == 200, bulk.text
    assert bulk.json()["price_source"] == "BULK_TIER"
    assert bulk.json()["unit_price"] == 12.5

    cust = client.post(
        "/api/v1/industry/stationery/quote",
        headers=auth_headers,
        json={
            "product_id": product["id"],
            "entered_qty": 1,
            "sales_uom_id": units["BOX"],
            "customer_id": dealer["id"],
        },
    )
    assert cust.status_code == 200, cust.text
    assert cust.json()["price_source"] in {"CUSTOMER_PRICE", "CONTRACTOR_TIER"}
    assert cust.json()["unit_price"] == 550


def test_sale_decrements_base_once_and_return_restores(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "ST-PEN")
    units = _units(client, auth_headers)
    store_id = _store_id(client, auth_headers)
    bal_before = session.exec(
        select(StockBalance).where(StockBalance.product_id == product["id"], StockBalance.store_id == store_id)
    ).first()
    qty_before = float(bal_before.qty_on_hand) if bal_before else 0

    sale = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json={
            "client_transaction_id": f"ST-BOX-{product['id'][:8]}",
            "industry_pack": "stationery",
            "store_id": store_id,
            "status": "completed",
            "subtotal": 550,
            "discount": 0,
            "tax": 0,
            "total": 550,
            "tender": "cash",
            "payments": [{"method": "cash", "amount": 550}],
            "lines": [
                {
                    "product_id": product["id"],
                    "sku": product["sku"],
                    "name": product["name"],
                    "qty": 1,
                    "unit_price": 550,
                    "meta": {"entered_qty": 1, "sales_uom_id": units["BOX"]},
                }
            ],
        },
    )
    assert sale.status_code == 200, sale.text
    session.expire_all()
    bal_mid = session.exec(
        select(StockBalance).where(StockBalance.product_id == product["id"], StockBalance.store_id == store_id)
    ).first()
    assert float(bal_mid.qty_on_hand) == qty_before - 50

    inv = sale.json()
    inv_id = inv.get("id") or inv.get("invoice_id")
    detail = client.get(f"/api/v1/sales/{inv_id}", headers=auth_headers)
    line = detail.json()["lines"][0]

    ret = client.post(
        f"/api/v1/sales/{inv_id}/return",
        headers=auth_headers,
        json={
            "reason": "Wrong pack",
            "condition": "saleable",
            "lines": [
                {
                    "invoice_line_id": line["id"],
                    "qty": 1,
                    "meta": {"entered_qty": 1, "base_qty": 50},
                }
            ],
        },
    )
    assert ret.status_code == 200, ret.text
    session.expire_all()
    bal_after = session.exec(
        select(StockBalance).where(StockBalance.product_id == product["id"], StockBalance.store_id == store_id)
    ).first()
    assert float(bal_after.qty_on_hand) == qty_before


def test_cashier_denied_pricing_and_school_list_manage(auth_headers, client: TestClient):
    cashier = login(client, "cashier@pulse.pos", "cashier123")
    product = get_product_by_sku(client, auth_headers, "ST-PEN")
    units = _units(client, auth_headers)

    denied_price = client.post(
        "/api/v1/industry/stationery/bulk-tiers",
        headers=cashier,
        json={"product_id": product["id"], "uom_id": units["PCS"], "min_qty": 100, "unit_price": 10},
    )
    assert denied_price.status_code == 403

    denied_list = client.post(
        "/api/v1/industry/stationery/school-lists",
        headers=cashier,
        json={"list_code": "NOPE", "list_name": "Nope"},
    )
    assert denied_list.status_code == 403

    # view still allowed
    ok = client.get("/api/v1/industry/stationery/profiles", headers=cashier)
    assert ok.status_code == 200
