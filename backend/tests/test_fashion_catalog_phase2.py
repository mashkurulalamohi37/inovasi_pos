"""Phase 2 — Fashion catalog: meta validation, matrix generator, uniqueness."""

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.audit import AuditLog
from tests.test_operations import get_product_by_sku


def test_fashion_product_does_not_require_style_code(auth_headers, client: TestClient):
    res = client.post(
        "/api/v1/products",
        headers=auth_headers,
        json={
            "sku": "FASH-P2-NOSTLYE",
            "name": "No Style Polo",
            "industry_pack": "fashion",
            "base_price": 999,
            "meta": {"season": "SS"},
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["sku"] == "FASH-P2-NOSTLYE"


def test_fashion_product_meta_normalized(auth_headers, client: TestClient):
    res = client.post(
        "/api/v1/products",
        headers=auth_headers,
        json={
            "sku": "FASH-P2-META",
            "name": "Meta Polo",
            "industry_pack": "fashion",
            "base_price": 1100,
            "meta": {
                "style_number": "ST-P2-01",
                "season": "SS",
                "max_discount_pct": 25,
                "returnable": "yes",
            },
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["meta"]["style_code"] == "ST-P2-01"
    assert body["meta"]["returnable"] is True


def test_fashion_meta_invalid_discount(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "FASH-001")
    res = client.patch(
        f"/api/v1/products/{product['id']}",
        headers=auth_headers,
        json={"meta": {"style_code": "PL-SS26-001", "max_discount_pct": 150}},
    )
    assert res.status_code == 400


def test_fashion_variant_size_color_required(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "FASH-001")
    res = client.post(
        f"/api/v1/products/{product['id']}/variants",
        headers=auth_headers,
        json={"variant_code": "FASH-001-XX", "size": "XL"},
    )
    assert res.status_code == 400


def test_fashion_variant_duplicate_size_color(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "FASH-001")
    res = client.post(
        f"/api/v1/products/{product['id']}/variants",
        headers=auth_headers,
        json={
            "variant_code": "FASH-001-M-BLU-DUP",
            "size": "M",
            "color": "Blue",
            "barcode": "FASH001MBLUDUP",
        },
    )
    assert res.status_code == 409


def test_fashion_generate_matrix(auth_headers, client: TestClient, session: Session):
    created = client.post(
        "/api/v1/products",
        headers=auth_headers,
        json={
            "sku": "FASH-P2-MX",
            "name": "Matrix Tee",
            "industry_pack": "fashion",
            "base_price": 800,
            "meta": {"style_code": "MX-01"},
        },
    )
    assert created.status_code == 200
    product = created.json()

    res = client.post(
        f"/api/v1/products/{product['id']}/variants/generate-matrix",
        headers=auth_headers,
        json={"sizes": ["S", "M"], "colors": ["Red", "Green"], "generate_barcodes": True},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["requested"] == 4
    assert body["created_count"] == 4
    assert body["error_count"] == 0
    listed = client.get(f"/api/v1/products/{product['id']}/variants", headers=auth_headers)
    assert len(listed.json()) == 4

    # Idempotent skip
    again = client.post(
        f"/api/v1/products/{product['id']}/variants/generate-matrix",
        headers=auth_headers,
        json={"sizes": ["S", "M"], "colors": ["Red", "Green"], "skip_existing": True},
    )
    assert again.status_code == 200
    assert again.json()["created_count"] == 0
    assert again.json()["skipped_count"] == 4

    audit = session.exec(
        select(AuditLog).where(
            AuditLog.action == "fashion_variant_matrix",
            AuditLog.entity_id == product["id"],
        )
    ).all()
    assert len(audit) >= 1


def test_fashion_matrix_rejects_non_fashion(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    res = client.post(
        f"/api/v1/products/{product['id']}/variants/generate-matrix",
        headers=auth_headers,
        json={"sizes": ["S"], "colors": ["Blue"]},
    )
    assert res.status_code == 400


def test_seed_fashion_multi_variant(auth_headers, client: TestClient):
    rows = client.get("/api/v1/industry/fashion/variants", headers=auth_headers).json()
    codes = {r["variant_code"] for r in rows if r.get("variant_code")}
    assert "FASH-001-M-BLU" in codes
    assert "FASH-001-M-BLK" in codes
    assert "FASH-002-32-KHK" in codes
    assert "FASH-003-M-GRY" in codes
    assert len([r for r in rows if r.get("source") == "generic"]) >= 10


def test_update_product_retains_own_barcode_and_variants(auth_headers, client: TestClient):
    # 1. Create a product with barcode
    created = client.post(
        "/api/v1/products",
        headers=auth_headers,
        json={
            "sku": "FASH-EDIT-TEST",
            "name": "Edit Test Polo",
            "industry_pack": "fashion",
            "base_price": 1200,
            "barcode": "BAR-EDIT-12345",
            "meta": {"fabric": "Cotton", "style_code": "ST-EDIT-01"},
        },
    )
    assert created.status_code == 200
    prod = created.json()

    # 2. Add a barcode record in ProductBarcode table
    bc_res = client.post(
        f"/api/v1/products/{prod['id']}/barcodes",
        headers=auth_headers,
        json={"barcode": "BAR-EDIT-12345", "is_primary": True},
    )
    assert bc_res.status_code == 200

    # 3. Generate variants matrix with barcodes
    mat_res = client.post(
        f"/api/v1/products/{prod['id']}/variants/generate-matrix",
        headers=auth_headers,
        json={"sizes": ["M", "L"], "colors": ["Blue"], "generate_barcodes": True},
    )
    assert mat_res.status_code == 200

    # 4. Edit product and save with the same barcode (must NOT fail with 409)
    patch_res = client.patch(
        f"/api/v1/products/{prod['id']}",
        headers=auth_headers,
        json={
            "name": "Edit Test Polo Updated",
            "barcode": "BAR-EDIT-12345",
            "base_price": 1350,
            "meta": {"fabric": "MIXT", "style_code": "ST-EDIT-01"},
        },
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["name"] == "Edit Test Polo Updated"
    assert patch_res.json()["barcode"] == "BAR-EDIT-12345"

    # 5. Using another product's barcode MUST still fail with 409
    another = client.post(
        "/api/v1/products",
        headers=auth_headers,
        json={
            "sku": "FASH-ANOTHER-01",
            "name": "Another Product",
            "industry_pack": "fashion",
            "base_price": 500,
            "barcode": "BAR-OTHER-99999",
        },
    )
    assert another.status_code == 200
    collision_res = client.patch(
        f"/api/v1/products/{prod['id']}",
        headers=auth_headers,
        json={"barcode": "BAR-OTHER-99999"},
    )
    assert collision_res.status_code == 409
    assert "Barcode already exists for another product" in collision_res.json()["detail"]

