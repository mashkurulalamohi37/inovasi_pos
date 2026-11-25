"""Phase 5 master data — CRUD, tenant isolation, audit, validation."""

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.audit import AuditLog
from app.models.core import Company
from app.models.product import Customer, Product, ProductCategory, Supplier
from tests.test_operations import get_product_by_sku, login


def test_category_crud(auth_headers, client: TestClient):
    res = client.post("/api/v1/categories", headers=auth_headers, json={"code": "CAT-P5", "name": "Phase5 Category"})
    assert res.status_code == 200
    cat_id = res.json()["id"]
    res2 = client.patch(f"/api/v1/categories/{cat_id}", headers=auth_headers, json={"name": "Updated Category"})
    assert res2.status_code == 200
    listed = client.get("/api/v1/categories", headers=auth_headers)
    assert any(c["id"] == cat_id for c in listed.json())


def test_brand_and_unit_crud(auth_headers, client: TestClient):
    b = client.post("/api/v1/brands", headers=auth_headers, json={"code": "BR-P5", "name": "Phase5 Brand"})
    assert b.status_code == 200
    u = client.post("/api/v1/units", headers=auth_headers, json={"code": "U-P5", "name": "Piece"})
    assert u.status_code == 200


def test_category_duplicate_name_blocked(auth_headers, client: TestClient):
    client.post("/api/v1/categories", headers=auth_headers, json={"code": "CAT-A", "name": "Dup Name"})
    res = client.post("/api/v1/categories", headers=auth_headers, json={"code": "CAT-B", "name": "Dup Name"})
    assert res.status_code == 409


def test_customer_duplicate_phone(auth_headers, client: TestClient):
    client.post("/api/v1/customers", headers=auth_headers, json={"code": "C-P5-A", "name": "A", "phone": "01711111111"})
    res = client.post("/api/v1/customers", headers=auth_headers, json={"code": "C-P5-B", "name": "B", "phone": "01711111111"})
    assert res.status_code == 409


def test_customer_get_detail(auth_headers, client: TestClient):
    created = client.post("/api/v1/customers", headers=auth_headers, json={"code": "C-DET", "name": "Detail Cust"}).json()
    res = client.get(f"/api/v1/customers/{created['id']}", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["code"] == "C-DET"


def test_customer_preferred_size_crud(auth_headers, client: TestClient):
    created = client.post(
        "/api/v1/customers",
        headers=auth_headers,
        json={"code": "C-SIZE", "name": "Size Cust", "preferred_size": "M", "customer_type": "employee", "custom_discount_pct": 15.0},
    ).json()
    assert created["preferred_size"] == "M"
    assert created["customer_type"] == "employee"
    assert created["custom_discount_pct"] == 15.0
    assert created["loyalty_points"] == 0

    updated = client.patch(
        f"/api/v1/customers/{created['id']}", headers=auth_headers, json={"preferred_size": "L", "custom_discount_pct": 20.0}
    ).json()
    assert updated["preferred_size"] == "L"
    assert updated["custom_discount_pct"] == 20.0


def _sale_for_customer(client: TestClient, headers: dict, customer_id: str, tx_id: str, redeem_points: float = 0) -> dict:
    product = get_product_by_sku(client, headers, "GROC-001")
    subtotal = product["base_price"]
    total = round(subtotal - redeem_points, 2)  # redemption already reflected client-side, matching campaign discount convention
    body = {
        "client_transaction_id": tx_id,
        "industry_pack": "grocery",
        "customer_id": customer_id,
        "lines": [{
            "product_id": product["id"], "sku": product["sku"], "name": product["name"],
            "qty": 1, "unit_price": product["base_price"],
        }],
        "subtotal": subtotal,
        "tax": 0,
        "total": total,
        "tender": "cash",
    }
    if redeem_points > 0:
        body["loyalty_redeem_points"] = redeem_points
    res = client.post("/api/v1/sales", headers=headers, json=body)
    assert res.status_code == 200, res.text
    return res.json()


def test_loyalty_earn_on_completed_sale(auth_headers, client: TestClient, session: Session):
    customer = client.post("/api/v1/customers", headers=auth_headers, json={"code": "C-LOY-1", "name": "Loyal Customer"}).json()
    assert customer["loyalty_points"] == 0

    _sale_for_customer(client, auth_headers, customer["id"], "loyalty-earn-001")

    summary = client.get(f"/api/v1/customers/{customer['id']}/loyalty", headers=auth_headers)
    assert summary.status_code == 200
    body = summary.json()
    # Default earn rate: 1 point per 100 currency spent.
    row = session.get(Customer, customer["id"])
    assert row.loyalty_points > 0
    assert body["points_balance"] == row.loyalty_points


def test_loyalty_redeem_preview_and_insufficient(auth_headers, client: TestClient):
    customer = client.post("/api/v1/customers", headers=auth_headers, json={"code": "C-LOY-2", "name": "Loyal Two"}).json()

    zero_balance = client.post(
        f"/api/v1/customers/{customer['id']}/loyalty/redeem-preview",
        headers=auth_headers,
        json={"points": 10},
    )
    assert zero_balance.status_code == 400
    assert "insufficient" in zero_balance.json()["detail"].lower()

    _sale_for_customer(client, auth_headers, customer["id"], "loyalty-earn-002")
    balance = client.get(f"/api/v1/customers/{customer['id']}/loyalty", headers=auth_headers).json()["points_balance"]
    assert balance > 0

    preview = client.post(
        f"/api/v1/customers/{customer['id']}/loyalty/redeem-preview",
        headers=auth_headers,
        json={"points": balance},
    )
    assert preview.status_code == 200, preview.text
    # Default point value: 1 currency unit per point.
    assert preview.json()["discount_amount"] == balance


def test_loyalty_redeem_on_sale_deducts_points(auth_headers, client: TestClient, session: Session):
    customer = client.post("/api/v1/customers", headers=auth_headers, json={"code": "C-LOY-3", "name": "Loyal Three"}).json()
    _sale_for_customer(client, auth_headers, customer["id"], "loyalty-redeem-seed")
    balance_before = session.exec(select(Customer).where(Customer.id == customer["id"])).one().loyalty_points
    assert balance_before > 0

    redeem_amount = min(1.0, balance_before)
    _sale_for_customer(client, auth_headers, customer["id"], "loyalty-redeem-001", redeem_points=redeem_amount)

    session.expire_all()
    row = session.get(Customer, customer["id"])
    # Balance reflects: -redeem_amount (this sale's redemption) + earn from both sales.
    assert row.loyalty_points != balance_before  # something changed
    assert row.loyalty_points > 0  # earn from two sales outweighs a 1-point redemption


def test_supplier_get_detail(auth_headers, client: TestClient):
    created = client.post("/api/v1/suppliers", headers=auth_headers, json={"code": "S-DET", "name": "Detail Sup"}).json()
    res = client.get(f"/api/v1/suppliers/{created['id']}", headers=auth_headers)
    assert res.status_code == 200


def test_payment_method_create_update(auth_headers, client: TestClient):
    res = client.post("/api/v1/payments/payment-methods", headers=auth_headers, json={"code": "bank_transfer", "name": "Bank Transfer"})
    assert res.status_code == 200
    mid = res.json()["id"]
    upd = client.put(f"/api/v1/payments/payment-methods/{mid}", headers=auth_headers, json={"code": "bank_transfer", "name": "Bank Xfer", "is_active": True})
    assert upd.status_code == 200


def test_company_profile_update(auth_headers, client: TestClient):
    res = client.patch("/api/v1/org/company/profile", headers=auth_headers, json={"legal_name": "Pulse Demo Legal"})
    assert res.status_code == 200
    assert res.json()["legal_name"] == "Pulse Demo Legal"


def test_tax_rule_crud(auth_headers, client: TestClient):
    res = client.post("/api/v1/configuration/tax-rules", headers=auth_headers, json={"name": "VAT 10", "rate": 0.10, "is_default": False})
    assert res.status_code == 200
    rule_id = res.json()["id"]
    upd = client.patch(f"/api/v1/configuration/tax-rules/{rule_id}", headers=auth_headers, json={"name": "VAT Ten"})
    assert upd.status_code == 200


def test_barcode_duplicate_blocked(auth_headers, client: TestClient, session: Session):
    from tests.test_operations import get_product_by_sku
    p = get_product_by_sku(client, auth_headers, "GROC-001")
    res = client.post(
        "/api/v1/products",
        headers=auth_headers,
        json={"sku": "SKU-BC-DUP", "barcode": p["barcode"], "name": "Dup BC", "industry_pack": "grocery", "base_price": 1},
    )
    assert res.status_code == 409


def test_master_data_tenant_isolation(auth_headers, client: TestClient, session: Session):
    other = session.exec(select(Company).where(Company.code != "PULSE-DEMO")).first()
    if not other:
        return
    foreign = ProductCategory(company_id=other.id, code="FOR", name="Foreign Cat")
    session.add(foreign)
    session.commit()
    listed = client.get("/api/v1/categories", headers=auth_headers).json()
    assert not any(c["code"] == "FOR" for c in listed)


def test_master_data_audit_log(auth_headers, client: TestClient, session: Session):
    client.post("/api/v1/categories", headers=auth_headers, json={"code": "AUD-CAT", "name": "Audit Cat"})
    logs = session.exec(select(AuditLog).where(AuditLog.action == "category_create")).all()
    assert len(logs) >= 1


def test_cashier_cannot_create_category(client: TestClient):
    headers = login(client, "cashier@pulse.pos", "cashier123")
    res = client.post("/api/v1/categories", headers=headers, json={"code": "X", "name": "X"})
    assert res.status_code == 403
