"""Phase 7B operations: purchases, returns, payments, receipts, system."""

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.industry import ElectronicsRma, FashionProductVariant, PharmaBatch
from app.models.product import ProductVariant
from app.models.sales import PurchaseInvoice, SalesInvoice, SalesInvoiceLine


def login(client: TestClient, email: str, password: str, company_code: str | None = None) -> dict[str, str]:
    code = company_code or ("PULSE-PLATFORM" if email == "super@pulse.pos" else "PULSE-DEMO")
    res = client.post("/api/v1/auth/login", json={"email": email, "password": password, "company_code": code})
    assert res.status_code == 200
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def get_product_by_sku(client: TestClient, headers: dict[str, str], sku: str) -> dict:
    res = client.get("/api/v1/products", headers=headers, params={"q": sku})
    assert res.status_code == 200
    items = res.json()["items"]
    match = next((p for p in items if p["sku"] == sku), None)
    assert match is not None, f"Product {sku} not found"
    return match


def _store_id(client: TestClient, headers: dict[str, str]) -> str:
    me = client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200
    return me.json()["store_id"]


def _stock_qty(client: TestClient, headers: dict[str, str], product_id: str, store_id: str | None = None) -> float:
    params = {"store_id": store_id} if store_id else {}
    res = client.get("/api/v1/inventory/stock", headers=headers, params=params)
    assert res.status_code == 200
    rows = [s for s in res.json() if s["product_id"] == product_id]
    assert rows, f"No stock row for product {product_id}"
    return sum(r["qty_on_hand"] for r in rows)


def _get_supplier(client: TestClient, headers: dict[str, str]) -> dict:
    res = client.get("/api/v1/suppliers", headers=headers)
    assert res.status_code == 200
    assert len(res.json()) >= 1
    return res.json()[0]


def _create_purchase(
    client: TestClient,
    headers: dict[str, str],
    product: dict,
    supplier_id: str,
    qty: float = 10,
    unit_cost: float = 500,
) -> dict:
    res = client.post(
        "/api/v1/purchases",
        headers=headers,
        json={
            "supplier_id": supplier_id,
            "store_id": _store_id(client, headers),
            "lines": [{"product_id": product["id"], "qty": qty, "unit_cost": unit_cost}],
        },
    )
    assert res.status_code == 200
    return res.json()


def _approve_and_receive(
    client: TestClient,
    headers: dict[str, str],
    purchase: dict,
    qty: float | None = None,
) -> dict:
    pid = purchase["id"]
    approve = client.post(f"/api/v1/purchases/{pid}/approve", headers=headers)
    assert approve.status_code == 200
    assert approve.json()["status"] == "APPROVED"

    lines = purchase["lines"]
    receive_lines = [{"purchase_line_id": lines[0]["id"], "qty": qty or lines[0]["qty"]}]
    receive = client.post(
        f"/api/v1/purchases/{pid}/receive",
        headers=headers,
        json={"lines": receive_lines},
    )
    assert receive.status_code == 200
    return receive.json()


def _grocery_sale(client: TestClient, headers: dict[str, str], tx_id: str, qty: float = 1) -> dict:
    product = get_product_by_sku(client, headers, "GROC-001")
    subtotal = product["base_price"] * qty
    tax = round(subtotal * 0.05, 2)
    total = round(subtotal + tax, 2)
    res = client.post(
        "/api/v1/sales",
        headers=headers,
        json={
            "client_transaction_id": tx_id,
            "industry_pack": "grocery",
            "lines": [
                {
                    "product_id": product["id"],
                    "sku": product["sku"],
                    "name": product["name"],
                    "qty": qty,
                    "unit_price": product["base_price"],
                }
            ],
            "subtotal": subtotal,
            "tax": tax,
            "total": total,
            "tender": "cash",
        },
    )
    assert res.status_code == 200
    return res.json()


def test_purchase_create(auth_headers, client):
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    supplier = _get_supplier(client, auth_headers)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=5, unit_cost=400)
    assert purchase["status"] == "DRAFT"
    assert purchase["supplier_id"] == supplier["id"]
    assert len(purchase["lines"]) == 1
    assert purchase["lines"][0]["qty"] == 5
    assert purchase["total"] == 2000


def test_purchase_approve(auth_headers, client):
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    supplier = _get_supplier(client, auth_headers)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"])
    res = client.post(f"/api/v1/purchases/{purchase['id']}/approve", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["status"] == "APPROVED"


def test_purchase_receive_increases_stock(auth_headers, client):
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    supplier = _get_supplier(client, auth_headers)
    store_id = _store_id(client, auth_headers)
    before = _stock_qty(client, auth_headers, product["id"], store_id)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=7)
    _approve_and_receive(client, auth_headers, purchase, qty=7)
    after = _stock_qty(client, auth_headers, product["id"], store_id)
    assert after == before + 7


def test_purchase_return_decreases_stock(auth_headers, client):
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    supplier = _get_supplier(client, auth_headers)
    store_id = _store_id(client, auth_headers)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=10)
    _approve_and_receive(client, auth_headers, purchase, qty=10)
    before = _stock_qty(client, auth_headers, product["id"], store_id)
    line_id = purchase["lines"][0]["id"]
    ret = client.post(
        f"/api/v1/purchases/{purchase['id']}/return",
        headers=auth_headers,
        json={
            "reason": "Damaged goods",
            "lines": [{"product_id": product["id"], "purchase_line_id": line_id, "qty": 3, "unit_cost": 500}],
        },
    )
    assert ret.status_code == 200
    assert ret.json()["total_amount"] == 1500
    after = _stock_qty(client, auth_headers, product["id"], store_id)
    assert after == before - 3


def test_supplier_create(auth_headers, client):
    res = client.post(
        "/api/v1/suppliers",
        headers=auth_headers,
        json={"code": "SUP-TEST", "name": "Test Supplier Ltd", "phone": "01711111111"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["code"] == "SUP-TEST"
    assert data["name"] == "Test Supplier Ltd"

    listed = client.get("/api/v1/suppliers", headers=auth_headers)
    assert any(s["code"] == "SUP-TEST" for s in listed.json())


def test_supplier_payment(auth_headers, client):
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    supplier = _get_supplier(client, auth_headers)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=2, unit_cost=1000)
    client.post(f"/api/v1/purchases/{purchase['id']}/approve", headers=auth_headers)
    pay = client.post(
        "/api/v1/supplier-payments",
        headers=auth_headers,
        json={
            "supplier_id": supplier["id"],
            "purchase_id": purchase["id"],
            "amount": 500,
            "method": "bank",
            "reference": "PAY-001",
        },
    )
    assert pay.status_code == 200
    assert pay.json()["amount"] == 500
    assert pay.json()["outstanding"] >= 0

    listed = client.get("/api/v1/supplier-payments", headers=auth_headers)
    assert listed.status_code == 200
    assert any(p["reference"] == "PAY-001" for p in listed.json())


def test_sales_return_restores_stock(auth_headers, client, session: Session):
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    store_id = _store_id(client, auth_headers)
    before = _stock_qty(client, auth_headers, product["id"], store_id)
    sale = _grocery_sale(client, auth_headers, "ops-groc-return-001", qty=2)
    after_sale = _stock_qty(client, auth_headers, product["id"], store_id)
    assert after_sale == before - 2

    inv_line = session.exec(
        select(SalesInvoiceLine).where(SalesInvoiceLine.invoice_id == sale["id"])
    ).first()
    assert inv_line is not None

    ret = client.post(
        f"/api/v1/sales/{sale['id']}/return",
        headers=auth_headers,
        json={
            "reason": "Customer changed mind",
            "lines": [{"invoice_line_id": inv_line.id, "qty": 1}],
        },
    )
    assert ret.status_code == 200
    assert ret.json()["total_amount"] == inv_line.unit_price
    restored = _stock_qty(client, auth_headers, product["id"], store_id)
    assert restored == after_sale + 1


def test_fashion_exchange(auth_headers, client, session: Session):
    product = get_product_by_sku(client, auth_headers, "FASH-001")
    # ProductVariant is the canonical id for POS/sales/exchange (FASHION_STOCK_AUTHORITY.md);
    # FashionProductVariant is a stock_qty compatibility mirror only, matched by size/color.
    variant = session.exec(
        select(ProductVariant).where(ProductVariant.product_id == product["id"])
    ).first()
    assert variant is not None
    legacy = session.exec(
        select(FashionProductVariant).where(
            FashionProductVariant.product_id == product["id"],
            FashionProductVariant.size == variant.size,
            FashionProductVariant.color == variant.color,
        )
    ).first()
    assert legacy is not None
    variant_before = legacy.stock_qty or 0

    sale = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json={
            "client_transaction_id": "ops-fashion-exchange-001",
            "industry_pack": "fashion",
            "lines": [
                {
                    "product_id": product["id"],
                    "sku": product["sku"],
                    "name": product["name"],
                    "qty": 1,
                    "unit_price": product["base_price"],
                    "meta": {"variant_id": variant.id},
                }
            ],
            "subtotal": product["base_price"],
            "tax": round(product["base_price"] * 0.05, 2),
            "total": round(product["base_price"] * 1.05, 2),
            "tender": "cash",
        },
    )
    assert sale.status_code == 200
    invoice_id = sale.json()["id"]
    inv_line = session.exec(
        select(SalesInvoiceLine).where(SalesInvoiceLine.invoice_id == invoice_id)
    ).first()
    assert inv_line is not None

    exchange = client.post(
        f"/api/v1/sales/{invoice_id}/exchange",
        headers=auth_headers,
        json={
            "return_lines": [{"invoice_line_id": inv_line.id, "qty": 1, "meta": {"variant_id": variant.id}}],
            "new_lines": [
                {
                    "product_id": product["id"],
                    "sku": product["sku"],
                    "name": product["name"],
                    "qty": 1,
                    "unit_price": product["base_price"],
                    "variant_id": variant.id,
                }
            ],
            "reason": "Size exchange",
        },
    )
    assert exchange.status_code == 200
    data = exchange.json()
    assert data["exchange_no"].startswith("EX-")
    assert data["return_id"]

    session.expire_all()
    legacy2 = session.get(FashionProductVariant, legacy.id)
    assert legacy2 is not None
    assert (legacy2.stock_qty or 0) == variant_before - 1


def test_pharmacy_return_with_batch(auth_headers, client, session: Session):
    product = get_product_by_sku(client, auth_headers, "PHRM-001")
    batch = session.exec(select(PharmaBatch).where(PharmaBatch.product_id == product["id"])).first()
    assert batch is not None
    batch_before = batch.qty_on_hand

    sale = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json={
            "client_transaction_id": "ops-pharma-return-001",
            "industry_pack": "pharmacy",
            "lines": [
                {
                    "product_id": product["id"],
                    "sku": product["sku"],
                    "name": product["name"],
                    "qty": 2,
                    "unit_price": product["base_price"],
                    "meta": {"batch_id": batch.id},
                }
            ],
            "subtotal": product["base_price"] * 2,
            "tax": round(product["base_price"] * 2 * 0.05, 2),
            "total": round(product["base_price"] * 2 * 1.05, 2),
            "tender": "cash",
        },
    )
    assert sale.status_code == 200
    inv_line = session.exec(
        select(SalesInvoiceLine).where(SalesInvoiceLine.invoice_id == sale.json()["id"])
    ).first()
    assert inv_line is not None

    ret = client.post(
        f"/api/v1/sales/{sale.json()['id']}/return",
        headers=auth_headers,
        json={
            "reason": "Unopened pack return",
            "lines": [{"invoice_line_id": inv_line.id, "qty": 1, "meta": {"batch_id": batch.id}}],
        },
    )
    assert ret.status_code == 200
    session.refresh(batch)
    assert batch.qty_on_hand == batch_before - 1


def test_electronics_return_creates_rma(auth_headers, client, session: Session):
    from app.models.industry import ElectronicsSerialStock

    product = get_product_by_sku(client, auth_headers, "ELEC-001")
    serial = "SN98765432109876"
    seed_inv = session.exec(select(SalesInvoice)).first()
    session.add(
        ElectronicsSerialStock(
            company_id=seed_inv.company_id,
            product_id=product["id"],
            serial_imei=serial,
            status="available",
        )
    )
    session.commit()

    sale = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json={
            "client_transaction_id": "ops-elec-return-001",
            "industry_pack": "electronics",
            "lines": [
                {
                    "product_id": product["id"],
                    "sku": product["sku"],
                    "name": product["name"],
                    "qty": 1,
                    "unit_price": product["base_price"],
                    "meta": {"serial": serial},
                }
            ],
            "subtotal": product["base_price"],
            "tax": round(product["base_price"] * 0.05, 2),
            "total": round(product["base_price"] * 1.05, 2),
            "tender": "cash",
        },
    )
    assert sale.status_code == 200
    inv_line = session.exec(
        select(SalesInvoiceLine).where(SalesInvoiceLine.invoice_id == sale.json()["id"])
    ).first()
    assert inv_line is not None

    before_rma = len(
        session.exec(select(ElectronicsRma).where(ElectronicsRma.serial_imei == serial)).all()
    )
    ret = client.post(
        f"/api/v1/sales/{sale.json()['id']}/return",
        headers=auth_headers,
        json={
            "reason": "Dead on arrival",
            "condition": "defective",
            "lines": [
                {
                    "invoice_line_id": inv_line.id,
                    "qty": 1,
                    "meta": {"serial": serial, "reason": "Dead on arrival"},
                }
            ],
        },
    )
    assert ret.status_code == 200
    after_rma = session.exec(select(ElectronicsRma).where(ElectronicsRma.serial_imei == serial)).all()
    assert len(after_rma) == before_rma + 1
    assert any(r.serial_imei == serial and r.approval_status == "pending" for r in after_rma)


def test_refund_creates_payment_reversal(auth_headers, client):
    sale = _grocery_sale(client, auth_headers, "ops-refund-001")
    refund = client.post(
        f"/api/v1/sales/{sale['id']}/refund",
        headers=auth_headers,
        json={"amount": 200, "method": "cash", "reference": "REF-TEST"},
    )
    assert refund.status_code == 200
    assert refund.json()["amount"] == 200

    payments = client.get("/api/v1/payments", headers=auth_headers, params={"payment_type": "refund"})
    assert payments.status_code == 200
    match = next((p for p in payments.json() if p["invoice_id"] == sale["id"]), None)
    assert match is not None
    assert match["direction"] == "out"
    assert match["payment_type"] == "refund"
    assert match["amount"] == 200


def test_receipt_reprint_audit(auth_headers, client, session: Session):
    seed_inv = session.exec(select(SalesInvoice).where(SalesInvoice.invoice_number == "INV-001000")).first()
    assert seed_inv is not None

    res = client.post(f"/api/v1/sales/{seed_inv.id}/receipt/reprint", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["reprinted"] is True

    audit = client.get(
        "/api/v1/audit-logs",
        headers=auth_headers,
        params={"action": "receipt_reprint"},
    )
    assert audit.status_code == 200
    assert audit.json()["total"] >= 1
    assert any(a["entity_id"] == seed_inv.id for a in audit.json()["items"])


def test_receipt_template_create_update_default(auth_headers, client):
    create = client.post(
        "/api/v1/configuration/receipt-templates",
        headers=auth_headers,
        json={
            "pack_code": "grocery",
            "name": "Ops Test Receipt",
            "brand_name": "Ops Market",
            "tagline": "Thank you",
            "is_default": False,
        },
    )
    assert create.status_code == 200
    template_id = create.json()["id"]
    assert create.json()["name"] == "Ops Test Receipt"

    update = client.put(
        f"/api/v1/configuration/receipt-templates/{template_id}",
        headers=auth_headers,
        json={"footer_notes": "Visit again soon"},
    )
    assert update.status_code == 200
    assert update.json()["footer_notes"] == "Visit again soon"

    default = client.post(
        f"/api/v1/configuration/receipt-templates/{template_id}/set-default",
        headers=auth_headers,
    )
    assert default.status_code == 200
    assert default.json()["is_default"] is True


def test_stock_ledger_after_purchase_receive(auth_headers, client):
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    supplier = _get_supplier(client, auth_headers)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=4)
    _approve_and_receive(client, auth_headers, purchase, qty=4)

    ledger = client.get(
        "/api/v1/inventory/stock-ledger",
        headers=auth_headers,
        params={"product_id": product["id"], "transaction_type": "purchase_receive"},
    )
    assert ledger.status_code == 200
    entries = ledger.json()
    assert len(entries) >= 1
    assert entries[0]["transaction_type"] == "purchase_receive"
    assert entries[0]["in_qty"] == 4


def test_payments_summary(auth_headers, client):
    _grocery_sale(client, auth_headers, "ops-summary-001")
    res = client.get("/api/v1/payments/summary", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert "cash_collected" in data
    assert "refund_amount" in data
    assert "net_collection" in data
    assert "transaction_count" in data
    assert data["transaction_count"] >= 1


def test_tenant_isolation_purchases(auth_headers, client, session: Session):
    from app.models.core import Company

    other = Company(code="OTHER-PO", name="Other PO Co")
    session.add(other)
    session.flush()
    session.add(
        PurchaseInvoice(
            company_id=other.id,
            store_id="",
            invoice_number="PO-OTHER",
            status="APPROVED",
            subtotal=5000,
            total=5000,
            due_amount=5000,
        )
    )
    session.commit()

    res = client.get("/api/v1/purchases", headers=auth_headers)
    assert res.status_code == 200
    numbers = [p["invoice_number"] for p in res.json()]
    assert "PO-OTHER" not in numbers
    assert any(p.startswith("PO-") for p in numbers) or len(numbers) >= 0


def test_rbac_cashier_purchase_denied(client):
    headers = login(client, "cashier@pulse.pos", "cashier123")
    product = get_product_by_sku(client, headers, "GROC-001")
    supplier = _get_supplier(client, headers)
    res = client.post(
        "/api/v1/purchases",
        headers=headers,
        json={
            "supplier_id": supplier["id"],
            "lines": [{"product_id": product["id"], "qty": 1, "unit_cost": 100}],
        },
    )
    assert res.status_code == 403


def test_system_health(client):
    res = client.get("/api/v1/system/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["database"] == "connected"
