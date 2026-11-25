"""Phase 6A — product update, variants, barcodes, reorder PO, search."""

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.audit import AuditLog
from app.models.product import Product, ProductVariant
from tests.test_operations import get_product_by_sku, login, _store_id


def test_product_update_with_barcode_and_masters(auth_headers, client: TestClient):
    p = get_product_by_sku(client, auth_headers, "GROC-001")
    cat = client.post("/api/v1/categories", headers=auth_headers, json={"code": "CAT-P6", "name": "Phase6 Cat"}).json()
    res = client.patch(
        f"/api/v1/products/{p['id']}",
        headers=auth_headers,
        json={"name": "Updated Groc", "barcode": "8901234567890", "category_id": cat["id"], "is_active": True},
    )
    assert res.status_code == 200
    assert res.json()["barcode"] == "8901234567890"
    assert res.json()["category_id"] == cat["id"]


def test_product_barcode_duplicate_on_update(auth_headers, client: TestClient):
    p1 = get_product_by_sku(client, auth_headers, "GROC-001")
    p2 = client.post(
        "/api/v1/products",
        headers=auth_headers,
        json={"sku": "GROC-P6-DUP", "name": "Dup test", "industry_pack": "grocery", "barcode": "9998887776665"},
    ).json()
    res = client.patch(
        f"/api/v1/products/{p2['id']}",
        headers=auth_headers,
        json={"barcode": p1.get("barcode") or "8901234567890"},
    )
    if p1.get("barcode"):
        assert res.status_code == 409


def test_product_get_detail_includes_stock(auth_headers, client: TestClient):
    p = get_product_by_sku(client, auth_headers, "GROC-001")
    res = client.get(f"/api/v1/products/{p['id']}", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert "stock_qty" in body
    assert "stock_available" in body


def test_product_search_by_barcode(auth_headers, client: TestClient):
    p = get_product_by_sku(client, auth_headers, "GROC-001")
    client.patch(
        f"/api/v1/products/{p['id']}",
        headers=auth_headers,
        json={"barcode": "SEARCH-BC-P6"},
    )
    listed = client.get("/api/v1/products?q=SEARCH-BC-P6", headers=auth_headers)
    assert any(i["id"] == p["id"] for i in listed.json()["items"])


def test_variant_create_and_list(auth_headers, client: TestClient):
    p = get_product_by_sku(client, auth_headers, "GROC-001")
    created = client.post(
        f"/api/v1/products/{p['id']}/variants",
        headers=auth_headers,
        json={"variant_code": "V1", "size": "L", "color": "Red"},
    )
    assert created.status_code == 200
    listed = client.get(f"/api/v1/products/{p['id']}/variants", headers=auth_headers)
    assert any(v["variant_code"] == "V1" for v in listed.json())


def test_variant_barcode_duplicate_blocked(auth_headers, client: TestClient):
    p = get_product_by_sku(client, auth_headers, "GROC-001")
    client.post(
        f"/api/v1/products/{p['id']}/variants",
        headers=auth_headers,
        json={"variant_code": "V-BC1", "barcode": "VAR-BC-001"},
    )
    p2 = client.post(
        "/api/v1/products",
        headers=auth_headers,
        json={"sku": "GROC-VAR2", "name": "Var2", "industry_pack": "grocery"},
    ).json()
    res = client.post(
        f"/api/v1/products/{p2['id']}/variants",
        headers=auth_headers,
        json={"variant_code": "V-BC2", "barcode": "VAR-BC-001"},
    )
    assert res.status_code == 409


def test_reorder_creates_draft_po(auth_headers, client: TestClient):
    p = get_product_by_sku(client, auth_headers, "GROC-001")
    store_id = _store_id(client, auth_headers)
    res = client.post(
        "/api/v1/inventory/reorder",
        headers=auth_headers,
        json={"product_id": p["id"], "store_id": store_id, "qty": 10, "unit_cost": 50},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "DRAFT"
    assert len(body["lines"]) == 1
    assert body["lines"][0]["product_id"] == p["id"]


def test_reorder_permission_denied(client: TestClient):
    headers = login(client, "cashier@pulse.pos", "cashier123")
    p_list = client.get("/api/v1/products", headers=headers).json()["items"]
    if not p_list:
        return
    store_id = _store_id(client, headers)
    res = client.post(
        "/api/v1/inventory/reorder",
        headers=headers,
        json={"product_id": p_list[0]["id"], "store_id": store_id, "qty": 5},
    )
    assert res.status_code == 403


def test_reorder_tenant_isolation(auth_headers, client: TestClient, session: Session):
    from app.models.core import Company
    other = session.exec(select(Company).where(Company.code != "PULSE-DEMO")).first()
    if not other:
        return
    other_product = session.exec(select(Product).where(Product.company_id == other.id)).first()
    if not other_product:
        return
    res = client.post(
        "/api/v1/inventory/reorder",
        headers=auth_headers,
        json={"product_id": other_product.id, "qty": 5},
    )
    assert res.status_code in (400, 404)


def test_product_update_audit_log(auth_headers, client: TestClient, session: Session):
    p = get_product_by_sku(client, auth_headers, "GROC-001")
    client.patch(f"/api/v1/products/{p['id']}", headers=auth_headers, json={"name": "Audit Name P6"})
    logs = session.exec(
        select(AuditLog).where(AuditLog.entity_type == "product", AuditLog.action == "product_update")
    ).all()
    assert any(l.entity_id == p["id"] for l in logs)


def test_multi_barcode_create_and_lookup(auth_headers, client: TestClient):
    p = get_product_by_sku(client, auth_headers, "GROC-001")
    bc = client.post(
        f"/api/v1/products/{p['id']}/barcodes",
        headers=auth_headers,
        json={"barcode": "ALT-BC-P6-001", "is_primary": False},
    )
    assert bc.status_code == 200
    lookup = client.get("/api/v1/products/barcode/ALT-BC-P6-001", headers=auth_headers)
    assert lookup.status_code == 200
    assert lookup.json()["id"] == p["id"]
    assert lookup.json()["matched_barcode_id"] == bc.json()["id"]


def test_barcode_lookup_from_variant(auth_headers, client: TestClient):
    p = get_product_by_sku(client, auth_headers, "GROC-001")
    variant = client.post(
        f"/api/v1/products/{p['id']}/variants",
        headers=auth_headers,
        json={"variant_code": "LK-V1", "barcode": "VAR-LK-001", "size": "M"},
    ).json()
    res = client.get("/api/v1/products/barcode/VAR-LK-001", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["matched_variant_id"] == variant["id"]
    assert body["matched_variant"]["size"] == "M"


def test_inactive_barcode_not_found(auth_headers, client: TestClient):
    p = get_product_by_sku(client, auth_headers, "GROC-001")
    bc = client.post(
        f"/api/v1/products/{p['id']}/barcodes",
        headers=auth_headers,
        json={"barcode": "INACT-BC-001"},
    ).json()
    client.patch(
        f"/api/v1/products/{p['id']}/barcodes/{bc['id']}",
        headers=auth_headers,
        json={"is_active": False},
    )
    res = client.get("/api/v1/products/barcode/INACT-BC-001", headers=auth_headers)
    assert res.status_code == 404


def test_inactive_variant_barcode_not_found(auth_headers, client: TestClient):
    p = get_product_by_sku(client, auth_headers, "GROC-001")
    variant = client.post(
        f"/api/v1/products/{p['id']}/variants",
        headers=auth_headers,
        json={"variant_code": "IN-V1", "barcode": "VAR-IN-001"},
    ).json()
    client.patch(
        f"/api/v1/products/{p['id']}/variants/{variant['id']}",
        headers=auth_headers,
        json={"is_active": False},
    )
    res = client.get("/api/v1/products/barcode/VAR-IN-001", headers=auth_headers)
    assert res.status_code == 404


def test_barcode_update_set_primary(auth_headers, client: TestClient):
    p = get_product_by_sku(client, auth_headers, "GROC-001")
    bc = client.post(
        f"/api/v1/products/{p['id']}/barcodes",
        headers=auth_headers,
        json={"barcode": "PRIMARY-BC-001", "is_primary": True},
    )
    assert bc.status_code == 200
    detail = client.get(f"/api/v1/products/{p['id']}", headers=auth_headers).json()
    assert detail["barcode"] == "PRIMARY-BC-001"


def test_product_update_sku_manual_and_collision(auth_headers, client: TestClient):
    import uuid
    sku1 = f"SKU-TEST-{uuid.uuid4().hex[:6].upper()}"
    sku2 = f"SKU-TEST-{uuid.uuid4().hex[:6].upper()}"
    p1 = client.post(
        "/api/v1/products",
        headers=auth_headers,
        json={"sku": sku1, "name": "Product SKU Test 1", "industry_pack": "universal", "base_price": 100},
    ).json()
    p2 = client.post(
        "/api/v1/products",
        headers=auth_headers,
        json={"sku": sku2, "name": "Product SKU Test 2", "industry_pack": "universal", "base_price": 200},
    ).json()

    # Update p1 with a new unique manual SKU
    new_sku = f"SKU-UPDATED-{uuid.uuid4().hex[:6].upper()}"
    res = client.patch(f"/api/v1/products/{p1['id']}", headers=auth_headers, json={"sku": new_sku})
    assert res.status_code == 200
    assert res.json()["sku"] == new_sku

    # Attempt to update p1 with p2's SKU -> must 409
    res_conflict = client.patch(f"/api/v1/products/{p1['id']}", headers=auth_headers, json={"sku": sku2})
    assert res_conflict.status_code == 409


def test_lookup_by_barcode_with_sku_and_case_insensitive(auth_headers, client: TestClient):
    import uuid
    unique_sku = f"SKULOOKUP-{uuid.uuid4().hex[:6].upper()}"
    p = client.post(
        "/api/v1/products",
        headers=auth_headers,
        json={"sku": unique_sku, "name": "SKU Lookup Target", "industry_pack": "universal", "base_price": 350},
    ).json()

    # Lookup using SKU exact match via barcode lookup endpoint
    res = client.get(f"/api/v1/products/barcode/{unique_sku}", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["id"] == p["id"]

    # Lookup using lowercase SKU
    res_lower = client.get(f"/api/v1/products/barcode/{unique_sku.lower()}", headers=auth_headers)
    assert res_lower.status_code == 200
    assert res_lower.json()["id"] == p["id"]


def test_product_delete_success_and_protection(auth_headers, client: TestClient):
    import uuid
    sku = f"DEL-TEST-{uuid.uuid4().hex[:6].upper()}"
    p = client.post(
        "/api/v1/products",
        headers=auth_headers,
        json={"sku": sku, "name": "Disposable Test Item", "industry_pack": "universal", "base_price": 50},
    ).json()

    # 1. Product exists
    get_res = client.get(f"/api/v1/products/{p['id']}", headers=auth_headers)
    assert get_res.status_code == 200

    # 2. Deleting without admin password fails with 400
    del_no_pw = client.delete(f"/api/v1/products/{p['id']}", headers=auth_headers)
    assert del_no_pw.status_code == 400
    assert "Admin password is required" in del_no_pw.json()["detail"]

    # 3. Deleting with wrong admin password fails with 400
    del_bad_pw = client.request(
        "DELETE",
        f"/api/v1/products/{p['id']}",
        headers=auth_headers,
        json={"password": "wrongpassword999"},
    )
    assert del_bad_pw.status_code == 400
    assert "Incorrect admin password" in del_bad_pw.json()["detail"]

    # 4. Deleting with valid admin password succeeds
    del_ok = client.request(
        "DELETE",
        f"/api/v1/products/{p['id']}",
        headers=auth_headers,
        json={"password": "admin123"},
    )
    assert del_ok.status_code == 200
    assert del_ok.json()["ok"] is True

    # 5. Product is now gone (404)
    get_after = client.get(f"/api/v1/products/{p['id']}", headers=auth_headers)
    assert get_after.status_code == 404

    # 6. Deleting already non-existent product returns 404
    del_again = client.request(
        "DELETE",
        f"/api/v1/products/{p['id']}",
        headers=auth_headers,
        json={"password": "admin123"},
    )
    assert del_again.status_code == 404



