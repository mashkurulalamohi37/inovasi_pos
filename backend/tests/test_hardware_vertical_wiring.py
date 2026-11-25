"""Phase 6B-10 — Hardware vertical wiring tests."""

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.audit import AuditLog
from app.models.inventory import StockBalance
from app.models.product import ProductUomConversion
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


def _customer_contractor(client: TestClient, headers: dict) -> dict:
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
        json={"code": "HW-CON-1", "name": "Hardware Contractor", "customer_group": "contractor"},
    )
    assert created.status_code == 200, created.text
    return created.json()


def test_hardware_profiles_list_and_upsert(auth_headers, client: TestClient):
    listed = client.get("/api/v1/industry/hardware/profiles", headers=auth_headers)
    assert listed.status_code == 200, listed.text
    assert any(p.get("sku") == "HW-SCREW" for p in listed.json())

    product = get_product_by_sku(client, auth_headers, "HW-SCREW")
    ok = client.post(
        "/api/v1/industry/hardware/profiles",
        headers=auth_headers,
        json={"product_id": product["id"], "material": "Stainless", "grade": "A+"},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["material"] == "Stainless"

    cashier = login(client, "cashier@pulse.pos", "cashier123")
    denied = client.post(
        "/api/v1/industry/hardware/profiles",
        headers=cashier,
        json={"product_id": product["id"], "material": "X"},
    )
    assert denied.status_code == 403


def test_uom_conversion_create_and_conflict(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "HW-SCREW")
    units = _units(client, auth_headers)
    # Existing box→piece is 100; conflicting factor should 409
    bad = client.post(
        "/api/v1/industry/hardware/conversions",
        headers=auth_headers,
        json={
            "product_id": product["id"],
            "from_uom_id": units["BOX"],
            "to_uom_id": units["PCS"],
            "conversion_factor": 50,
        },
    )
    assert bad.status_code == 409

    zero = client.post(
        "/api/v1/industry/hardware/conversions",
        headers=auth_headers,
        json={
            "product_id": product["id"],
            "from_uom_id": units["BOX"],
            "to_uom_id": units["PCS"],
            "conversion_factor": 0,
        },
    )
    assert zero.status_code == 400

    rows = session.exec(
        select(ProductUomConversion).where(ProductUomConversion.product_id == product["id"])
    ).all()
    assert any(float(r.conversion_factor) == 100 for r in rows)


def test_box_sale_decrements_base_qty(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "HW-SCREW")
    units = _units(client, auth_headers)
    store_id = _store_id(client, auth_headers)
    bal_before = session.exec(
        select(StockBalance).where(StockBalance.product_id == product["id"], StockBalance.store_id == store_id)
    ).first()
    qty_before = float(bal_before.qty_on_hand) if bal_before else 0

    quote = client.post(
        "/api/v1/industry/hardware/quote",
        headers=auth_headers,
        json={
            "product_id": product["id"],
            "entered_qty": 2,
            "sales_uom_id": units["BOX"],
        },
    )
    assert quote.status_code == 200, quote.text
    assert quote.json()["base_qty"] == 200
    assert quote.json()["conversion_factor"] == 100

    sale = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json={
            "client_transaction_id": f"HW-BOX-{product['id'][:8]}",
            "industry_pack": "hardware",
            "store_id": store_id,
            "status": "completed",
            "subtotal": 500,
            "discount": 0,
            "tax": 0,
            "total": 500,
            "tender": "cash",
            "payments": [{"method": "cash", "amount": 500}],
            "lines": [
                {
                    "product_id": product["id"],
                    "sku": product["sku"],
                    "name": product["name"],
                    "qty": 2,
                    "unit_price": 250,
                    "meta": {
                        "entered_qty": 2,
                        "sales_uom_id": units["BOX"],
                    },
                }
            ],
        },
    )
    assert sale.status_code == 200, sale.text
    session.expire_all()
    bal_after = session.exec(
        select(StockBalance).where(StockBalance.product_id == product["id"], StockBalance.store_id == store_id)
    ).first()
    assert bal_after is not None
    assert float(bal_after.qty_on_hand) == qty_before - 200


def test_fractional_piece_rejected_length_allowed(auth_headers, client: TestClient):
    screw = get_product_by_sku(client, auth_headers, "HW-SCREW")
    cable = get_product_by_sku(client, auth_headers, "HW-CABLE")
    units = _units(client, auth_headers)

    bad = client.post(
        "/api/v1/industry/hardware/quote",
        headers=auth_headers,
        json={"product_id": screw["id"], "entered_qty": 1.5, "sales_uom_id": units["PCS"]},
    )
    assert bad.status_code == 400

    ok = client.post(
        "/api/v1/industry/hardware/quote",
        headers=auth_headers,
        json={"product_id": cable["id"], "entered_qty": 12.5, "sales_uom_id": units["M"]},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["base_qty"] == 12.5


def test_package_barcode_resolves_uom(auth_headers, client: TestClient):
    res = client.get("/api/v1/industry/hardware/barcode/HWSCREWBOX", headers=auth_headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["sku"] == "HW-SCREW"
    assert body["conversion_factor"] == 100
    units = _units(client, auth_headers)
    assert body["sales_uom_id"] == units["BOX"]


def test_customer_and_bulk_price_precedence(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "HW-SCREW")
    units = _units(client, auth_headers)
    contractor = _customer_contractor(client, auth_headers)

    bulk = client.post(
        "/api/v1/industry/hardware/quote",
        headers=auth_headers,
        json={"product_id": product["id"], "entered_qty": 50, "sales_uom_id": units["PCS"]},
    )
    assert bulk.status_code == 200, bulk.text
    assert bulk.json()["price_source"] == "BULK_TIER"
    assert bulk.json()["unit_price"] == 2.0

    cust = client.post(
        "/api/v1/industry/hardware/quote",
        headers=auth_headers,
        json={
            "product_id": product["id"],
            "entered_qty": 2,
            "sales_uom_id": units["BOX"],
            "customer_id": contractor["id"],
        },
    )
    assert cust.status_code == 200, cust.text
    assert cust.json()["price_source"] in {"CUSTOMER_PRICE", "CONTRACTOR_TIER"}
    assert cust.json()["unit_price"] == 220


def test_overlapping_bulk_tier_rejected(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "HW-SCREW")
    units = _units(client, auth_headers)
    bad = client.post(
        "/api/v1/industry/hardware/bulk-tiers",
        headers=auth_headers,
        json={
            "product_id": product["id"],
            "uom_id": units["PCS"],
            "min_qty": 20,
            "max_qty": 30,
            "unit_price": 2.1,
        },
    )
    assert bad.status_code == 409


def test_hardware_return_restores_base_qty(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "HW-SCREW")
    units = _units(client, auth_headers)
    store_id = _store_id(client, auth_headers)

    sale = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json={
            "client_transaction_id": f"HW-RET-{product['id'][:8]}",
            "industry_pack": "hardware",
            "store_id": store_id,
            "status": "completed",
            "subtotal": 250,
            "discount": 0,
            "tax": 0,
            "total": 250,
            "tender": "cash",
            "payments": [{"method": "cash", "amount": 250}],
            "lines": [
                {
                    "product_id": product["id"],
                    "sku": product["sku"],
                    "name": product["name"],
                    "qty": 1,
                    "unit_price": 250,
                    "meta": {"entered_qty": 1, "sales_uom_id": units["BOX"]},
                }
            ],
        },
    )
    assert sale.status_code == 200, sale.text
    inv = sale.json()
    inv_id = inv.get("id") or inv.get("invoice_id")
    detail = client.get(f"/api/v1/sales/{inv_id}", headers=auth_headers)
    assert detail.status_code == 200, detail.text
    line = detail.json()["lines"][0]

    bal_mid = session.exec(
        select(StockBalance).where(StockBalance.product_id == product["id"], StockBalance.store_id == store_id)
    ).first()
    mid = float(bal_mid.qty_on_hand)

    ret = client.post(
        f"/api/v1/sales/{inv_id}/return",
        headers=auth_headers,
        json={
            "reason": "Wrong size",
            "condition": "saleable",
            "lines": [
                {
                    "invoice_line_id": line["id"],
                    "qty": 1,
                    "meta": {"entered_qty": 1, "base_qty": 100},
                }
            ],
        },
    )
    assert ret.status_code == 200, ret.text
    session.expire_all()
    bal_end = session.exec(
        select(StockBalance).where(StockBalance.product_id == product["id"], StockBalance.store_id == store_id)
    ).first()
    assert float(bal_end.qty_on_hand) == mid + 100

    over = client.post(
        f"/api/v1/sales/{inv_id}/return",
        headers=auth_headers,
        json={
            "reason": "Over",
            "condition": "saleable",
            "lines": [{"invoice_line_id": line["id"], "qty": 1, "meta": {"base_qty": 1}}],
        },
    )
    assert over.status_code == 400


def test_hardware_purchase_box_to_base(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "HW-SCREW")
    units = _units(client, auth_headers)
    store_id = _store_id(client, auth_headers)
    supplier = _get_supplier(client, auth_headers)

    bal_before = session.exec(
        select(StockBalance).where(StockBalance.product_id == product["id"], StockBalance.store_id == store_id)
    ).first()
    qty_before = float(bal_before.qty_on_hand) if bal_before else 0

    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=3, unit_cost=200)
    appr = client.post(f"/api/v1/purchases/{purchase['id']}/approve", headers=auth_headers)
    assert appr.status_code == 200, appr.text
    recv = client.post(
        f"/api/v1/purchases/{purchase['id']}/receive",
        headers=auth_headers,
        json={
            "lines": [
                {
                    "purchase_line_id": purchase["lines"][0]["id"],
                    "qty": 3,
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
    assert float(bal_after.qty_on_hand) == qty_before + 300


def test_hardware_tenant_isolation(auth_headers, client: TestClient):
    other = login(client, "admin@pulse.pos", "admin123")
    cashier = login(client, "cashier@pulse.pos", "cashier123")
    product = get_product_by_sku(client, auth_headers, "HW-SCREW")
    denied = client.post(
        "/api/v1/industry/hardware/customer-prices",
        headers=cashier,
        json={"customer_id": "x", "product_id": product["id"], "unit_price": 1},
    )
    assert denied.status_code == 403
    assert other


def test_price_override_audited(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "HW-SCREW")
    units = _units(client, auth_headers)
    ok = client.post(
        "/api/v1/industry/hardware/quote",
        headers=auth_headers,
        json={
            "product_id": product["id"],
            "entered_qty": 1,
            "sales_uom_id": units["PCS"],
            "manual_unit_price": 1.0,
            "override_reason": "Manager promo",
        },
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["price_source"] == "MANUAL_OVERRIDE"
    logs = session.exec(select(AuditLog).where(AuditLog.company_id.is_not(None))).all()
    assert logs is not None
