"""Phase 6B-3 — Electronics vertical wiring tests."""

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.audit import AuditLog
from app.models.industry import ElectronicsSerialStock, ElectronicsWarranty
from tests.test_operations import _create_purchase, _get_supplier, _store_id, get_product_by_sku, login


def _approve(client, headers, purchase_id: str):
    res = client.post(f"/api/v1/purchases/{purchase_id}/approve", headers=headers)
    assert res.status_code == 200
    return res.json()


def test_grn_with_serials_creates_stock(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "ELEC-001")
    supplier = _get_supplier(client, auth_headers)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=2, unit_cost=20000)
    assert purchase.get("industry_pack") == "electronics"
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
                    {"serial_no": "ELEC-SN-A001", "imei_no": "111111111111111"},
                    {"serial_no": "ELEC-SN-A002", "imei_no": "222222222222222"},
                ],
            }],
        },
    )
    assert receive.status_code == 200, receive.text
    serials = session.exec(
        select(ElectronicsSerialStock).where(
            ElectronicsSerialStock.serial_imei.in_(["ELEC-SN-A001", "ELEC-SN-A002"])
        )
    ).all()
    assert len(serials) == 2
    assert all(s.status == "available" for s in serials)


def test_serial_count_mismatch_rejected(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "ELEC-001")
    supplier = _get_supplier(client, auth_headers)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=2, unit_cost=20000)
    _approve(client, auth_headers, purchase["id"])
    res = client.post(
        f"/api/v1/purchases/{purchase['id']}/receive",
        headers=auth_headers,
        json={
            "lines": [{
                "purchase_line_id": purchase["lines"][0]["id"],
                "qty": 2,
                "serials": [{"serial_no": "ELEC-SN-ONLY-ONE"}],
            }],
        },
    )
    assert res.status_code == 400
    assert "match" in res.json()["detail"].lower() or "serial" in res.json()["detail"].lower()


def test_duplicate_serial_rejected(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "ELEC-001")
    supplier = _get_supplier(client, auth_headers)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=1, unit_cost=20000)
    _approve(client, auth_headers, purchase["id"])
    existing = session.exec(select(ElectronicsSerialStock).limit(1)).first()
    assert existing is not None
    res = client.post(
        f"/api/v1/purchases/{purchase['id']}/receive",
        headers=auth_headers,
        json={
            "lines": [{
                "purchase_line_id": purchase["lines"][0]["id"],
                "qty": 1,
                "serials": [{"serial_no": existing.serial_imei}],
            }],
        },
    )
    assert res.status_code == 409


def test_serial_sale_and_warranty(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "ELEC-001")
    serial = session.exec(
        select(ElectronicsSerialStock).where(ElectronicsSerialStock.status == "available")
    ).first()
    assert serial is not None
    sn = serial.serial_imei
    price = product["base_price"]
    sale = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json={
            "client_transaction_id": "elec-sale-serial-001",
            "industry_pack": "electronics",
            "store_id": _store_id(client, auth_headers),
            "lines": [{
                "product_id": product["id"],
                "sku": product["sku"],
                "name": product["name"],
                "qty": 1,
                "unit_price": price,
                "meta": {"serial": sn, "serial_imei": sn, "warrantyMonths": 12},
            }],
            "subtotal": price,
            "tax": round(price * 0.05, 2),
            "total": round(price * 1.05, 2),
            "tender": "cash",
        },
    )
    assert sale.status_code == 200, sale.text
    session.refresh(serial)
    assert serial.status in {"sold", "warranty"}
    assert serial.sales_invoice_id
    warranties = session.exec(
        select(ElectronicsWarranty).where(ElectronicsWarranty.serial_imei == sn)
    ).all()
    assert len(warranties) >= 1
    audit = session.exec(
        select(AuditLog).where(AuditLog.entity_type == "electronics_warranty")
    ).all()
    assert len(audit) >= 1


def test_sale_without_required_serial_rejected(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "ELEC-001")
    price = product["base_price"]
    res = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json={
            "client_transaction_id": "elec-sale-no-serial-001",
            "industry_pack": "electronics",
            "lines": [{
                "product_id": product["id"],
                "sku": product["sku"],
                "name": product["name"],
                "qty": 1,
                "unit_price": price,
                "meta": {},
            }],
            "subtotal": price,
            "tax": round(price * 0.05, 2),
            "total": round(price * 1.05, 2),
            "tender": "cash",
        },
    )
    assert res.status_code in (400, 409)
    assert "serial" in res.json()["detail"].lower()


def test_sold_serial_cannot_resell(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "ELEC-001")
    company_id = session.exec(select(ElectronicsSerialStock).limit(1)).first().company_id
    row = ElectronicsSerialStock(
        company_id=company_id,
        product_id=product["id"],
        serial_imei="ELEC-RESELL-BLOCK-001",
        status="available",
    )
    session.add(row)
    session.commit()
    price = product["base_price"]
    first = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json={
            "client_transaction_id": "elec-resell-1",
            "industry_pack": "electronics",
            "lines": [{
                "product_id": product["id"],
                "sku": product["sku"],
                "name": product["name"],
                "qty": 1,
                "unit_price": price,
                "meta": {"serial": row.serial_imei},
            }],
            "subtotal": price,
            "tax": round(price * 0.05, 2),
            "total": round(price * 1.05, 2),
            "tender": "cash",
        },
    )
    assert first.status_code == 200
    second = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json={
            "client_transaction_id": "elec-resell-2",
            "industry_pack": "electronics",
            "lines": [{
                "product_id": product["id"],
                "sku": product["sku"],
                "name": product["name"],
                "qty": 1,
                "unit_price": price,
                "meta": {"serial": row.serial_imei},
            }],
            "subtotal": price,
            "tax": round(price * 0.05, 2),
            "total": round(price * 1.05, 2),
            "tender": "cash",
        },
    )
    assert second.status_code in (400, 409)


def test_warranty_unsold_serial_rejected(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "ELEC-001")
    company_id = session.exec(select(ElectronicsSerialStock).limit(1)).first().company_id
    row = ElectronicsSerialStock(
        company_id=company_id,
        product_id=product["id"],
        serial_imei="ELEC-UNSOLD-WR-001",
        status="available",
    )
    session.add(row)
    session.commit()
    res = client.post(
        "/api/v1/industry/electronics/warranties",
        headers=auth_headers,
        json={"serial_no": row.serial_imei, "warranty_months": 12},
    )
    assert res.status_code == 400


def test_rma_create_and_status_transition(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "ELEC-001")
    company_id = session.exec(select(ElectronicsSerialStock).limit(1)).first().company_id
    row = ElectronicsSerialStock(
        company_id=company_id,
        product_id=product["id"],
        serial_imei="ELEC-RMA-FLOW-001",
        status="sold",
    )
    session.add(row)
    session.commit()
    created = client.post(
        "/api/v1/industry/electronics/rma",
        headers=auth_headers,
        json={
            "serial_imei": row.serial_imei,
            "customer_name": "RMA Customer",
            "product_name": product["name"],
            "product_id": product["id"],
            "problem_description": "No power",
            "action_type": "repair",
        },
    )
    assert created.status_code == 200, created.text
    rma_id = created.json()["id"]
    assert created.json()["status"] == "received"
    session.refresh(row)
    assert row.status == "rma"
    updated = client.patch(
        f"/api/v1/industry/electronics/rma/{rma_id}",
        headers=auth_headers,
        json={"status": "inspecting"},
    )
    assert updated.status_code == 200
    assert updated.json()["status"] == "inspecting"
    audit = session.exec(
        select(AuditLog).where(AuditLog.entity_type == "electronics_rma", AuditLog.entity_id == rma_id)
    ).all()
    assert len(audit) >= 2


def test_electronics_tenant_isolation(auth_headers, client: TestClient, session: Session):
    other = ElectronicsSerialStock(
        company_id="other-company-id",
        product_id="other-product",
        serial_imei="OTHER-TENANT-SN-001",
        status="available",
    )
    session.add(other)
    session.commit()
    res = client.get(
        f"/api/v1/industry/electronics/serials/validate/{other.serial_imei}",
        headers=auth_headers,
    )
    assert res.status_code == 200
    assert res.json()["valid"] is False


def test_electronics_permission_denied(client: TestClient):
    cashier = login(client, "cashier@pulse.pos", "cashier123")
    res = client.get("/api/v1/industry/electronics/warranties", headers=cashier)
    assert res.status_code == 403


def test_list_serials_and_warranties(auth_headers, client: TestClient):
    serials = client.get("/api/v1/industry/electronics/serials", headers=auth_headers)
    assert serials.status_code == 200
    assert isinstance(serials.json(), list)
    warranties = client.get("/api/v1/industry/electronics/warranties", headers=auth_headers)
    assert warranties.status_code == 200
    assert isinstance(warranties.json(), list)
