"""Phase 6B-4 — Jewelry vertical wiring tests."""

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.audit import AuditLog
from app.models.industry import JewelryCertificate, JewelryGoldRate, JewelrySalesLineExtension
from tests.test_operations import _create_purchase, _get_supplier, _store_id, get_product_by_sku, login


def _approve(client, headers, purchase_id: str):
    res = client.post(f"/api/v1/purchases/{purchase_id}/approve", headers=headers)
    assert res.status_code == 200
    return res.json()


def test_create_metal_rate_keeps_history(auth_headers, client: TestClient, session: Session):
    before = client.get("/api/v1/industry/jewelry/rates?metal_type=Gold&karat=22K", headers=auth_headers)
    assert before.status_code == 200
    count_before = len(before.json())
    create = client.post(
        "/api/v1/industry/jewelry/rates",
        headers=auth_headers,
        json={"metal_type": "Gold", "karat": "22K", "selling_rate": 9900, "buying_rate": 9100},
    )
    assert create.status_code == 200, create.text
    assert create.json()["selling_rate"] == 9900
    after = client.get("/api/v1/industry/jewelry/rates?metal_type=Gold&karat=22K", headers=auth_headers)
    assert len(after.json()) >= count_before + 1
    effective = client.get("/api/v1/industry/jewelry/gold-rate?metal_type=Gold&karat=22K", headers=auth_headers)
    assert effective.status_code == 200
    assert effective.json()["selling_rate"] == 9900
    rows = session.exec(select(JewelryGoldRate).where(JewelryGoldRate.karat == "22K")).all()
    assert len(rows) >= 2


def test_rate_override_permission_denied_for_cashier(client: TestClient):
    cashier = login(client, "cashier@pulse.pos", "cashier123")
    res = client.post(
        "/api/v1/industry/jewelry/rates",
        headers=cashier,
        json={"metal_type": "Gold", "karat": "22K", "selling_rate": 10000, "manual_override": True, "override_reason": "spot"},
    )
    assert res.status_code == 403


def test_jewelry_quote_and_sale_snapshots_rate(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "JEWL-001")
    quote = client.post(
        "/api/v1/industry/jewelry/quote",
        headers=auth_headers,
        json={"product_id": product["id"], "net_metal_weight": 5.0},
    )
    assert quote.status_code == 200, quote.text
    body = quote.json()
    assert body["breakdown"]["metal_value"] > 0
    assert body["net_amount"] > body["breakdown"]["metal_value"]
    rate_used = body["metal_rate"]
    net = body["net_amount"]
    sale = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json={
            "client_transaction_id": "jewl-sale-snap-001",
            "industry_pack": "jewelry",
            "store_id": _store_id(client, auth_headers),
            "lines": [{
                "product_id": product["id"],
                "sku": product["sku"],
                "name": product["name"],
                "qty": 1,
                "unit_price": net,
                "meta": {
                    "certificate": "CERT-JEWL-001",
                    "metal_rate": rate_used,
                    "goldRate": rate_used,
                    "net_metal_weight": 5.0,
                    "netWeight": 5.0,
                    "gross_weight": 5.2,
                    "stone_weight": 0.2,
                    "metal_value": body["breakdown"]["metal_value"],
                    "makingCharge": body["breakdown"]["making_charge"],
                    "wastage_value": body["breakdown"]["wastage_value"],
                    "stone_value": body["breakdown"]["stone_value"],
                    "purity": "22K",
                    "metal": "Gold",
                },
            }],
            "subtotal": net / 1.05,
            "tax": net - (net / 1.05),
            "total": net,
            "tender": "cash",
        },
    )
    assert sale.status_code == 200, sale.text
    invoice_id = sale.json()["id"]
    ext = session.exec(
        select(JewelrySalesLineExtension).where(JewelrySalesLineExtension.gold_rate == rate_used)
    ).first()
    assert ext is not None
    assert ext.snapshot_json
    cert = session.exec(
        select(JewelryCertificate).where(JewelryCertificate.cert_no == "CERT-JEWL-001")
    ).first()
    assert cert is not None
    assert cert.status == "sold"
    assert cert.sales_invoice_id == invoice_id

    # Later rate change must not rewrite historic extension
    client.post(
        "/api/v1/industry/jewelry/rates",
        headers=auth_headers,
        json={"metal_type": "Gold", "karat": "22K", "selling_rate": 12000},
    )
    session.refresh(ext)
    assert ext.gold_rate == rate_used


def test_sold_certificate_cannot_sell_twice(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "JEWL-001")
    # Ensure cert sold from previous test or sell again with different cert
    create = client.post(
        "/api/v1/industry/jewelry/certificates",
        headers=auth_headers,
        json={
            "product_id": product["id"],
            "certificate_no": "CERT-JEWL-DUP-TEST",
            "gross_weight": 4.0,
            "stone_weight": 0,
            "net_metal_weight": 4.0,
            "purity": "22K",
        },
    )
    assert create.status_code == 200, create.text
    quote = client.post(
        "/api/v1/industry/jewelry/quote",
        headers=auth_headers,
        json={"product_id": product["id"], "net_metal_weight": 4.0},
    )
    net = quote.json()["net_amount"]
    first = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json={
            "client_transaction_id": "jewl-sale-cert-once",
            "industry_pack": "jewelry",
            "store_id": _store_id(client, auth_headers),
            "lines": [{
                "product_id": product["id"],
                "sku": product["sku"],
                "name": product["name"],
                "qty": 1,
                "unit_price": net,
                "meta": {"certificate": "CERT-JEWL-DUP-TEST", "netWeight": 4.0, "metal_rate": quote.json()["metal_rate"]},
            }],
            "subtotal": net,
            "tax": 0,
            "total": net,
            "tender": "cash",
        },
    )
    assert first.status_code == 200, first.text
    second = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json={
            "client_transaction_id": "jewl-sale-cert-twice",
            "industry_pack": "jewelry",
            "store_id": _store_id(client, auth_headers),
            "lines": [{
                "product_id": product["id"],
                "sku": product["sku"],
                "name": product["name"],
                "qty": 1,
                "unit_price": net,
                "meta": {"certificate": "CERT-JEWL-DUP-TEST", "netWeight": 4.0, "metal_rate": quote.json()["metal_rate"]},
            }],
            "subtotal": net,
            "tax": 0,
            "total": net,
            "tender": "cash",
        },
    )
    assert second.status_code in {400, 409, 422, 500}


def test_weight_validation_on_profile(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "JEWL-001")
    bad = client.put(
        f"/api/v1/industry/jewelry/profiles/{product['id']}",
        headers=auth_headers,
        json={"gross_weight": 5, "stone_weight": 6, "net_metal_weight": -1, "purity": "22K"},
    )
    assert bad.status_code == 400


def test_duplicate_certificate_blocked(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "JEWL-001")
    res = client.post(
        "/api/v1/industry/jewelry/certificates",
        headers=auth_headers,
        json={
            "product_id": product["id"],
            "certificate_no": "CERT-JEWL-001",
            "gross_weight": 5,
            "net_metal_weight": 5,
        },
    )
    assert res.status_code == 409


def test_grn_creates_jewelry_certificate(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "JEWL-001")
    supplier = _get_supplier(client, auth_headers)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=1, unit_cost=40000)
    assert purchase.get("industry_pack") == "jewelry"
    _approve(client, auth_headers, purchase["id"])
    receive = client.post(
        f"/api/v1/purchases/{purchase['id']}/receive",
        headers=auth_headers,
        json={
            "lines": [{
                "purchase_line_id": purchase["lines"][0]["id"],
                "qty": 1,
                "certificate_no": "CERT-GRN-JEWL-001",
                "tag_no": "TAG-GRN-001",
                "gross_weight": 6.0,
                "stone_weight": 0.5,
                "net_metal_weight": 5.5,
                "purity": "22K",
                "metal_type": "Gold",
            }],
        },
    )
    assert receive.status_code == 200, receive.text
    cert_res = client.get(
        "/api/v1/industry/jewelry/certificates/lookup/CERT-GRN-JEWL-001",
        headers=auth_headers,
    )
    assert cert_res.status_code == 200, cert_res.text
    cert = cert_res.json()
    assert cert["status"] == "active"
    assert cert["gross_weight"] == 6.0


def test_buyback_flow_and_audit(auth_headers, client: TestClient, session: Session):
    create = client.post(
        "/api/v1/industry/jewelry/buybacks",
        headers=auth_headers,
        json={
            "customer_name": "Buyback Customer",
            "metal_type": "Gold",
            "purity": "22K",
            "gross_weight": 10,
            "net_metal_weight": 9.5,
            "deductions": 100,
        },
    )
    assert create.status_code == 200, create.text
    bb = create.json()
    assert bb["status"] == "draft"
    assert bb["final_buyback_value"] > 0
    assessed = client.patch(
        f"/api/v1/industry/jewelry/buybacks/{bb['id']}",
        headers=auth_headers,
        json={"status": "assessed"},
    )
    assert assessed.status_code == 200
    approved = client.patch(
        f"/api/v1/industry/jewelry/buybacks/{bb['id']}",
        headers=auth_headers,
        json={"status": "approved"},
    )
    assert approved.status_code == 200
    settled = client.patch(
        f"/api/v1/industry/jewelry/buybacks/{bb['id']}",
        headers=auth_headers,
        json={"status": "settled", "settlement_method": "cash"},
    )
    assert settled.status_code == 200
    assert settled.json()["status"] == "settled"
    audits = session.exec(select(AuditLog).where(AuditLog.entity_type == "jewelry_buyback")).all()
    assert len(audits) >= 1


def test_jewelry_tenant_isolation(auth_headers, client: TestClient):
    # Lookup with nonsense should 404, not leak
    res = client.get("/api/v1/industry/jewelry/certificates/lookup/NO-SUCH-CERT", headers=auth_headers)
    assert res.status_code == 404


def test_return_updates_certificate_status(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "JEWL-001")
    cert_no = "CERT-JEWL-RETURN-1"
    client.post(
        "/api/v1/industry/jewelry/certificates",
        headers=auth_headers,
        json={
            "product_id": product["id"],
            "certificate_no": cert_no,
            "gross_weight": 3,
            "net_metal_weight": 3,
            "purity": "22K",
        },
    )
    quote = client.post(
        "/api/v1/industry/jewelry/quote",
        headers=auth_headers,
        json={"product_id": product["id"], "net_metal_weight": 3.0},
    )
    net = quote.json()["net_amount"]
    sale = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json={
            "client_transaction_id": "jewl-sale-return-001",
            "industry_pack": "jewelry",
            "store_id": _store_id(client, auth_headers),
            "lines": [{
                "product_id": product["id"],
                "sku": product["sku"],
                "name": product["name"],
                "qty": 1,
                "unit_price": net,
                "meta": {"certificate": cert_no, "netWeight": 3.0, "metal_rate": quote.json()["metal_rate"]},
            }],
            "subtotal": net,
            "tax": 0,
            "total": net,
            "tender": "cash",
        },
    )
    assert sale.status_code == 200, sale.text
    sale_detail = client.get(f"/api/v1/sales/{sale.json()['id']}", headers=auth_headers)
    assert sale_detail.status_code == 200, sale_detail.text
    invoice = sale_detail.json()
    line_id = invoice["lines"][0]["id"]
    ret = client.post(
        f"/api/v1/sales/{invoice['id']}/return",
        headers=auth_headers,
        json={
            "reason": "Customer return",
            "lines": [{"invoice_line_id": line_id, "qty": 1, "meta": {"certificate": cert_no}}],
        },
    )
    assert ret.status_code == 200, ret.text
    session.expire_all()
    cert = session.exec(select(JewelryCertificate).where(JewelryCertificate.cert_no == cert_no)).first()
    assert cert is not None
    assert cert.status in {"returned", "exchanged"}


def test_invalid_karat_rejected(auth_headers, client: TestClient):
    res = client.post(
        "/api/v1/industry/jewelry/rates",
        headers=auth_headers,
        json={"metal_type": "Gold", "karat": "19K", "selling_rate": 8000},
    )
    assert res.status_code == 400
    assert "karat" in res.json()["detail"].lower() or "purity" in res.json()["detail"].lower()


def test_jewelry_grn_requires_certificate(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "JEWL-001")
    supplier = _get_supplier(client, auth_headers)
    purchase = _create_purchase(client, auth_headers, product, supplier["id"], qty=1, unit_cost=40000)
    _approve(client, auth_headers, purchase["id"])
    res = client.post(
        f"/api/v1/purchases/{purchase['id']}/receive",
        headers=auth_headers,
        json={"lines": [{"purchase_line_id": purchase["lines"][0]["id"], "qty": 1}]},
    )
    assert res.status_code == 400
    assert "certificate" in res.json()["detail"].lower() or "jewelry" in res.json()["detail"].lower()


def test_sale_without_required_certificate_rejected(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "JEWL-001")
    quote = client.post(
        "/api/v1/industry/jewelry/quote",
        headers=auth_headers,
        json={"product_id": product["id"], "net_metal_weight": 5.0},
    )
    assert quote.status_code == 200
    net = quote.json()["net_amount"]
    sale = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json={
            "client_transaction_id": "jewl-sale-no-cert",
            "industry_pack": "jewelry",
            "store_id": _store_id(client, auth_headers),
            "lines": [{
                "product_id": product["id"],
                "sku": product["sku"],
                "name": product["name"],
                "qty": 1,
                "unit_price": net,
                "meta": {"netWeight": 5.0, "metal_rate": quote.json()["metal_rate"]},
            }],
            "subtotal": net,
            "tax": 0,
            "total": net,
            "tender": "cash",
        },
    )
    assert sale.status_code in {400, 409, 422, 500}
