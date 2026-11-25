"""Phase 6B-8 — Mobile Shop vertical wiring tests."""

from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.audit import AuditLog
from app.models.industry import ElectronicsSerialStock, ElectronicsWarranty
from app.models.inventory import StockBalance
from tests.test_operations import _create_purchase, _get_supplier, _store_id, get_product_by_sku, login


def _approve(client, headers, purchase_id: str):
    res = client.post(f"/api/v1/purchases/{purchase_id}/approve", headers=headers)
    assert res.status_code == 200
    return res.json()


def _sale_payload(product, store_id, meta, qty=1):
    price = product["base_price"]
    return {
        "client_transaction_id": f"mob-{product['sku']}-{datetime.now(timezone.utc).timestamp()}",
        "industry_pack": "mobile-shop",
        "store_id": store_id,
        "lines": [{
            "product_id": product["id"],
            "sku": product["sku"],
            "name": product["name"],
            "qty": qty,
            "unit_price": price,
            "meta": meta,
        }],
        "subtotal": price * qty,
        "tax": 0,
        "total": price * qty,
        "tender": "cash",
    }


def test_mobile_profiles_and_devices(auth_headers, client: TestClient):
    profiles = client.get("/api/v1/industry/mobile/profiles", headers=auth_headers)
    assert profiles.status_code == 200
    assert any(p.get("sku") == "MOB-001" for p in profiles.json())

    devices = client.get("/api/v1/industry/mobile/devices", headers=auth_headers)
    assert devices.status_code == 200
    rows = devices.json()
    assert len(rows) >= 1
    assert "imei_1" in rows[0]


def test_profile_upsert_and_permission(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "MOB-001")
    ok = client.post(
        "/api/v1/industry/mobile/profiles",
        headers=auth_headers,
        json={
            "product_id": product["id"],
            "brand": "Samsung",
            "model_name": "Galaxy A15 Updated",
            "dual_imei": True,
            "imei_required": True,
            "warranty_months": 18,
        },
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["model_name"] == "Galaxy A15 Updated"
    assert ok.json()["warranty_months"] == 18
    cashier = login(client, "cashier@pulse.pos", "cashier123")
    denied = client.post(
        "/api/v1/industry/mobile/profiles",
        headers=cashier,
        json={"product_id": product["id"], "brand": "X"},
    )
    assert denied.status_code == 403


def test_grn_dual_imei_and_duplicate_rejected(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "MOB-001")
    supplier = _get_supplier(client, auth_headers)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=2, unit_cost=20000)
    assert purchase.get("industry_pack") == "mobile-shop"
    _approve(client, auth_headers, purchase["id"])
    line_id = purchase["lines"][0]["id"]
    receive = client.post(
        f"/api/v1/purchases/{purchase['id']}/receive",
        headers=auth_headers,
        json={
            "lines": [{
                "purchase_line_id": line_id,
                "qty": 2,
                "serials": [
                    {"serial_no": "870111111111111", "imei_1": "870111111111111", "imei_2": "870111111111112"},
                    {"serial_no": "870222222222222", "imei_1": "870222222222222", "imei_2": "870222222222223"},
                ],
            }],
        },
    )
    assert receive.status_code == 200, receive.text
    rows = session.exec(
        select(ElectronicsSerialStock).where(ElectronicsSerialStock.serial_imei == "870111111111111")
    ).all()
    assert len(rows) == 1
    assert rows[0].imei_2 == "870111111111112"

    purchase2 = _create_purchase(client, auth_headers, product, supplier["id"], qty=1, unit_cost=20000)
    _approve(client, auth_headers, purchase2["id"])
    dup = client.post(
        f"/api/v1/purchases/{purchase2['id']}/receive",
        headers=auth_headers,
        json={
            "lines": [{
                "purchase_line_id": purchase2["lines"][0]["id"],
                "qty": 1,
                "serials": [{"serial_no": "870111111111111", "imei_1": "870111111111111"}],
            }],
        },
    )
    assert dup.status_code in {400, 409}, dup.text


def test_grn_serial_count_mismatch(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "MOB-001")
    supplier = _get_supplier(client, auth_headers)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=2, unit_cost=20000)
    _approve(client, auth_headers, purchase["id"])
    bad = client.post(
        f"/api/v1/purchases/{purchase['id']}/receive",
        headers=auth_headers,
        json={
            "lines": [{
                "purchase_line_id": purchase["lines"][0]["id"],
                "qty": 2,
                "serials": [{"serial_no": "870333333333333", "imei_1": "870333333333333"}],
            }],
        },
    )
    assert bad.status_code == 400


def test_imei_sale_warranty_and_double_sell_blocked(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "MOB-001")
    store_id = _store_id(client, auth_headers)
    imei = "860123456789012"
    validate = client.get(
        f"/api/v1/industry/mobile/devices/validate/{imei}",
        headers=auth_headers,
        params={"product_id": product["id"]},
    )
    assert validate.status_code == 200
    assert validate.json()["available"] is True
    serial_id = validate.json()["serial_id"]

    sale = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json=_sale_payload(product, store_id, {
            "serial": imei,
            "imei_1": imei,
            "serial_id": serial_id,
            "device_stock_id": serial_id,
            "warranty_months": 12,
            "product_id": product["id"],
            "store_id": store_id,
        }),
    )
    assert sale.status_code == 200, sale.text
    invoice_id = sale.json()["id"]

    row = session.get(ElectronicsSerialStock, serial_id)
    assert row is not None
    assert row.status in {"sold", "warranty"}
    assert row.sold_at is not None
    assert row.sales_invoice_id == invoice_id

    warranties = session.exec(
        select(ElectronicsWarranty).where(ElectronicsWarranty.serial_id == serial_id)
    ).all()
    assert len(warranties) >= 1

    again = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json=_sale_payload(product, store_id, {
            "serial": imei,
            "imei_1": imei,
            "serial_id": serial_id,
            "warranty_months": 12,
            "product_id": product["id"],
            "store_id": store_id,
        }),
    )
    assert again.status_code in {400, 409, 422}, again.text
    assert invoice_id


def test_accessory_sale_without_imei(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "MOB-ACC-001")
    store_id = _store_id(client, auth_headers)
    sale = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json=_sale_payload(product, store_id, {"product_id": product["id"]}),
    )
    assert sale.status_code == 200, sale.text


def test_mobile_return_preserves_device_identity(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "MOB-001")
    store_id = _store_id(client, auth_headers)
    supplier = _get_supplier(client, auth_headers)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=1, unit_cost=20000)
    _approve(client, auth_headers, purchase["id"])
    imei = "870444444444444"
    receive = client.post(
        f"/api/v1/purchases/{purchase['id']}/receive",
        headers=auth_headers,
        json={
            "lines": [{
                "purchase_line_id": purchase["lines"][0]["id"],
                "qty": 1,
                "serials": [{"serial_no": imei, "imei_1": imei, "imei_2": "870444444444445"}],
            }],
        },
    )
    assert receive.status_code == 200, receive.text
    device = session.exec(
        select(ElectronicsSerialStock).where(ElectronicsSerialStock.serial_imei == imei)
    ).first()
    assert device is not None

    sale = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json=_sale_payload(product, store_id, {
            "serial": imei,
            "imei_1": imei,
            "serial_id": device.id,
            "warranty_months": 12,
            "product_id": product["id"],
            "store_id": store_id,
        }),
    )
    assert sale.status_code == 200, sale.text
    invoice_id = sale.json()["id"]
    detail = client.get(f"/api/v1/sales/{invoice_id}", headers=auth_headers)
    assert detail.status_code == 200
    line_id = detail.json()["lines"][0]["id"]

    ret = client.post(
        f"/api/v1/sales/{invoice_id}/return",
        headers=auth_headers,
        json={
            "lines": [{"invoice_line_id": line_id, "qty": 1, "meta": {"serial": imei, "imei_1": imei}}],
            "reason": "Customer changed mind",
            "condition": "saleable",
        },
    )
    assert ret.status_code == 200, ret.text
    session.refresh(device)
    assert device.status == "returned"
    assert device.serial_imei == imei


def test_trade_in_workflow_and_intake(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "MOB-001")
    created = client.post(
        "/api/v1/industry/mobile/trade-ins",
        headers=auth_headers,
        json={
            "brand": "Xiaomi",
            "model_name": "Redmi Note",
            "imei_1": "880555555555555",
            "imei_2": "880555555555556",
            "condition_grade": "good",
            "assessed_value": 8000,
            "valuation_reason": "Manual shop assessment",
        },
    )
    assert created.status_code == 200, created.text
    trade_id = created.json()["id"]
    assert created.json()["status"] == "assessed"

    approved = client.post(
        f"/api/v1/industry/mobile/trade-ins/{trade_id}/status",
        headers=auth_headers,
        json={"status": "approved", "approved_value": 7500, "override_reason": "Battery wear"},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["approved_value"] == 7500

    accepted = client.post(
        f"/api/v1/industry/mobile/trade-ins/{trade_id}/status",
        headers=auth_headers,
        json={"status": "accepted", "product_id": product["id"]},
    )
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["device_stock_id"]

    device = session.get(ElectronicsSerialStock, accepted.json()["device_stock_id"])
    assert device is not None
    assert device.status == "trade_in_received"
    assert device.imei_no == "880555555555555"

    audits = session.exec(
        select(AuditLog).where(AuditLog.entity_id == trade_id)
    ).all()
    assert any("trade_in" in (a.action or "") for a in audits)

    cashier = login(client, "cashier@pulse.pos", "cashier123")
    denied = client.post(
        "/api/v1/industry/mobile/trade-ins",
        headers=cashier,
        json={"imei_1": "880666666666666", "assessed_value": 1000, "condition_grade": "fair"},
    )
    assert denied.status_code == 403


def test_mobile_tenant_isolation(auth_headers, client: TestClient, session: Session):
    other = ElectronicsSerialStock(
        company_id="other-company",
        product_id="x",
        serial_imei="999999999999999",
        imei_no="999999999999999",
        status="available",
    )
    session.add(other)
    session.commit()
    res = client.get(
        f"/api/v1/industry/mobile/devices/validate/{other.serial_imei}",
        headers=auth_headers,
    )
    assert res.status_code == 200
    assert res.json()["valid"] is False


def test_stock_balance_reconciles_after_receive(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "MOB-001")
    before = session.exec(
        select(StockBalance).where(StockBalance.product_id == product["id"])
    ).first()
    before_qty = before.qty_on_hand if before else 0
    supplier = _get_supplier(client, auth_headers)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=1, unit_cost=20000)
    _approve(client, auth_headers, purchase["id"])
    imei = "870777777777777"
    receive = client.post(
        f"/api/v1/purchases/{purchase['id']}/receive",
        headers=auth_headers,
        json={
            "lines": [{
                "purchase_line_id": purchase["lines"][0]["id"],
                "qty": 1,
                "serials": [{"serial_no": imei, "imei_1": imei}],
            }],
        },
    )
    assert receive.status_code == 200, receive.text
    session.expire_all()
    after = session.exec(
        select(StockBalance).where(StockBalance.product_id == product["id"])
    ).first()
    assert after is not None
    assert after.qty_on_hand >= before_qty + 1
