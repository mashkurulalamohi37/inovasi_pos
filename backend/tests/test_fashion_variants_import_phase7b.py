"""Phase 7B — Fashion variant CSV import."""

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.inventory import StockLedger
from app.models.product import ProductVariant


def test_import_fashion_variants_create_and_skip_duplicate(auth_headers, client: TestClient, session: Session):
    size = f"XX{uuid.uuid4().hex[:2].upper()}"
    color = f"Teal{uuid.uuid4().hex[:3].upper()}"
    code = f"FASH-001-{size}-{color}"
    create = client.post(
        "/api/v1/import/fashion-variants",
        headers=auth_headers,
        json={
            "rows": [
                {
                    "data": {
                        "parent_sku": "FASH-001",
                        "sku": code,
                        "size": size,
                        "color": color,
                        "qty_on_hand": 4,
                        "store_code": "DHK-01",
                        "unit_cost": 800,
                    }
                }
            ],
        },
    )
    assert create.status_code == 200, create.text
    body = create.json()
    assert body["rows_imported"] == 1
    assert not body["errors"]

    variant = session.exec(
        select(ProductVariant).where(
            ProductVariant.variant_code == code,
        )
    ).first()
    assert variant is not None
    assert variant.size == size
    assert variant.color == color

    ledger = [
        r
        for r in session.exec(select(StockLedger).where(StockLedger.variant_id == variant.id)).all()
        if (r.in_qty or 0) > 0
    ]
    assert sum(r.in_qty for r in ledger) >= 4

    dup = client.post(
        "/api/v1/import/fashion-variants",
        headers=auth_headers,
        json={
            "rows": [
                {
                    "data": {
                        "parent_sku": "FASH-001",
                        "sku": code,
                        "size": size,
                        "color": color,
                    }
                }
            ],
        },
    )
    assert dup.status_code == 200, dup.text
    assert dup.json()["rows_updated"] == 1
    assert dup.json()["rows_imported"] == 0


def test_import_fashion_variants_dry_run(auth_headers, client: TestClient, session: Session):
    size = f"DR{uuid.uuid4().hex[:2].upper()}"
    color = "Mint"
    code = f"FASH-001-{size}-{color}"
    res = client.post(
        "/api/v1/import/fashion-variants",
        headers=auth_headers,
        json={
            "dry_run": True,
            "rows": [{"data": {"parent_sku": "FASH-001", "sku": code, "size": size, "color": color}}],
        },
    )
    assert res.status_code == 200
    assert res.json()["rows_imported"] == 0
    assert res.json()["rows_valid"] == 1
    assert session.exec(select(ProductVariant).where(ProductVariant.variant_code == code)).first() is None


def test_import_status_includes_fashion_variants(auth_headers, client: TestClient):
    res = client.get("/api/v1/import/status", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert "fashion_variants" in body["live_modules"]
    assert "fashion_variants" not in body.get("planned_modules", [])
