"""Phase 3 — Fashion purchase/GRN with variant_id + opening stock import."""

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.industry import FashionProductVariant
from app.models.inventory import StockLedger
from app.models.product import ProductVariant
from tests.test_operations import _get_supplier, _store_id, get_product_by_sku


def _fashion_variant(session: Session, code: str = "FASH-001-M-BLU") -> ProductVariant:
    row = session.exec(select(ProductVariant).where(ProductVariant.variant_code == code)).first()
    assert row is not None, f"Missing seed variant {code}"
    return row


def test_fashion_po_requires_variant_id(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "FASH-001")
    supplier = _get_supplier(client, auth_headers)
    res = client.post(
        "/api/v1/purchases",
        headers=auth_headers,
        json={
            "supplier_id": supplier["id"],
            "store_id": _store_id(client, auth_headers),
            "lines": [{"product_id": product["id"], "qty": 2, "unit_cost": 1000}],
        },
    )
    assert res.status_code == 400
    assert "variant" in res.json()["detail"].lower()


def test_fashion_po_approve_grn_posts_variant_ledger(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "FASH-001")
    variant = _fashion_variant(session, "FASH-001-L-BLK")
    legacy = session.exec(
        select(FashionProductVariant).where(
            FashionProductVariant.product_id == product["id"],
            FashionProductVariant.size == "L",
            FashionProductVariant.color == "Black",
        )
    ).first()
    assert legacy is not None
    legacy_before = legacy.stock_qty or 0

    supplier = _get_supplier(client, auth_headers)
    store_id = _store_id(client, auth_headers)
    created = client.post(
        "/api/v1/purchases",
        headers=auth_headers,
        json={
            "supplier_id": supplier["id"],
            "store_id": store_id,
            "lines": [
                {
                    "product_id": product["id"],
                    "variant_id": variant.id,
                    "qty": 3,
                    "unit_cost": 1290,
                }
            ],
            "remarks": "Phase 3 fashion GRN",
        },
    )
    assert created.status_code == 200, created.text
    purchase = created.json()
    assert purchase["lines"][0]["variant_id"] == variant.id
    assert purchase["lines"][0]["size"] == "L"
    assert purchase["lines"][0]["color"] == "Black"

    approve = client.post(f"/api/v1/purchases/{purchase['id']}/approve", headers=auth_headers)
    assert approve.status_code == 200

    receive = client.post(
        f"/api/v1/purchases/{purchase['id']}/receive",
        headers=auth_headers,
        json={"lines": [{"purchase_line_id": purchase["lines"][0]["id"], "qty": 3}]},
    )
    assert receive.status_code == 200, receive.text
    assert receive.json()["purchase"]["status"] == "RECEIVED"

    session.expire_all()
    ledger = session.exec(
        select(StockLedger).where(
            StockLedger.product_id == product["id"],
            StockLedger.variant_id == variant.id,
            StockLedger.transaction_type == "purchase_receive",
        )
    ).all()
    assert any(row.in_qty == 3 for row in ledger)

    legacy_after = session.get(FashionProductVariant, legacy.id)
    assert legacy_after is not None
    assert (legacy_after.stock_qty or 0) == legacy_before + 3


def test_fashion_purchase_return_passes_variant(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "FASH-001")
    variant = _fashion_variant(session, "FASH-001-M-BLK")
    legacy = session.exec(
        select(FashionProductVariant).where(
            FashionProductVariant.product_id == product["id"],
            FashionProductVariant.size == "M",
            FashionProductVariant.color == "Black",
        )
    ).first()
    assert legacy is not None
    before = legacy.stock_qty or 0

    supplier = _get_supplier(client, auth_headers)
    store_id = _store_id(client, auth_headers)
    created = client.post(
        "/api/v1/purchases",
        headers=auth_headers,
        json={
            "supplier_id": supplier["id"],
            "store_id": store_id,
            "lines": [{"product_id": product["id"], "variant_id": variant.id, "qty": 2, "unit_cost": 1200}],
        },
    ).json()
    client.post(f"/api/v1/purchases/{created['id']}/approve", headers=auth_headers)
    client.post(
        f"/api/v1/purchases/{created['id']}/receive",
        headers=auth_headers,
        json={"lines": [{"purchase_line_id": created["lines"][0]["id"], "qty": 2}]},
    )
    session.expire_all()
    mid = session.get(FashionProductVariant, legacy.id)
    assert mid is not None
    assert (mid.stock_qty or 0) == before + 2

    ret = client.post(
        f"/api/v1/purchases/{created['id']}/return",
        headers=auth_headers,
        json={
            "reason": "Wrong size shipment",
            "lines": [
                {
                    "purchase_line_id": created["lines"][0]["id"],
                    "product_id": product["id"],
                    "qty": 1,
                    "unit_cost": 1200,
                }
            ],
        },
    )
    assert ret.status_code == 200, ret.text
    session.expire_all()
    after = session.get(FashionProductVariant, legacy.id)
    assert after is not None
    assert (after.stock_qty or 0) == before + 1

    ledger_out = session.exec(
        select(StockLedger).where(
            StockLedger.product_id == product["id"],
            StockLedger.variant_id == variant.id,
            StockLedger.transaction_type == "purchase_return",
        )
    ).all()
    assert any(row.out_qty == 1 for row in ledger_out)


def test_opening_stock_import_fashion_variant(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "FASH-002")
    variant = _fashion_variant(session, "FASH-002-32-KHK")
    legacy = session.exec(
        select(FashionProductVariant).where(
            FashionProductVariant.product_id == product["id"],
            FashionProductVariant.sku == "FASH-002-32-KHK",
        )
    ).first()
    assert legacy is not None
    before = legacy.stock_qty or 0

    dry = client.post(
        "/api/v1/import/opening-stock",
        headers=auth_headers,
        json={
            "dry_run": True,
            "rows": [
                {
                    "data": {
                        "sku": "FASH-002",
                        "variant_sku": "FASH-002-32-KHK",
                        "store_code": "DHK-01",
                        "qty": 7,
                        "unit_cost": 900,
                    }
                }
            ],
        },
    )
    assert dry.status_code == 200
    assert dry.json()["rows_valid"] == 1
    assert dry.json()["rows_imported"] == 0

    live = client.post(
        "/api/v1/import/opening-stock",
        headers=auth_headers,
        json={
            "dry_run": False,
            "rows": [
                {
                    "data": {
                        "sku": "FASH-002",
                        "variant_sku": "FASH-002-32-KHK",
                        "store_code": "DHK-01",
                        "warehouse_code": "WH-DHK-01",
                        "qty": 7,
                        "unit_cost": 900,
                        "notes": "Phase 3 opening",
                    }
                }
            ],
        },
    )
    assert live.status_code == 200, live.text
    assert live.json()["rows_imported"] == 1

    session.expire_all()
    after = session.get(FashionProductVariant, legacy.id)
    assert after is not None
    assert (after.stock_qty or 0) == before + 7

    ledger = session.exec(
        select(StockLedger).where(
            StockLedger.product_id == product["id"],
            StockLedger.variant_id == variant.id,
            StockLedger.transaction_type == "opening",
        )
    ).all()
    assert any(row.in_qty == 7 for row in ledger)


def test_opening_stock_import_rejects_fashion_without_variant(auth_headers, client: TestClient):
    res = client.post(
        "/api/v1/import/opening-stock",
        headers=auth_headers,
        json={
            "dry_run": True,
            "rows": [{"data": {"sku": "FASH-001", "store_code": "DHK-01", "qty": 5}}],
        },
    )
    assert res.status_code == 200
    assert res.json()["rows_valid"] == 0
    assert len(res.json()["errors"]) >= 1


def test_import_status_live(auth_headers, client: TestClient):
    res = client.get("/api/v1/import/status", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["mode"] == "live"
    assert "opening_stock" in body["live_modules"]
    assert "products" in body["live_modules"]
    assert body.get("stub_modules") == []
