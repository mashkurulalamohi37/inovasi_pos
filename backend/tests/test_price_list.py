"""Effective-dated price lists — scheduled unit-price overrides."""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session

from tests.test_operations import _store_id, get_product_by_sku


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def test_price_list_create_requires_valid_dates(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    now = datetime.utcnow()

    missing_start = client.post(
        "/api/v1/pricing/price-list",
        headers=auth_headers,
        json={"product_id": product["id"], "price": 100},
    )
    assert missing_start.status_code == 400

    bad_range = client.post(
        "/api/v1/pricing/price-list",
        headers=auth_headers,
        json={
            "product_id": product["id"],
            "price": 100,
            "starts_at": _iso(now),
            "ends_at": _iso(now - timedelta(days=1)),
        },
    )
    assert bad_range.status_code == 400
    assert "ends_at" in bad_range.json()["detail"]

    zero_price = client.post(
        "/api/v1/pricing/price-list",
        headers=auth_headers,
        json={"product_id": product["id"], "price": 0, "starts_at": _iso(now)},
    )
    assert zero_price.status_code == 400


def test_price_list_future_entry_not_yet_active(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    base_price = product["base_price"]
    store_id = _store_id(client, auth_headers)
    future = datetime.utcnow() + timedelta(days=30)

    created = client.post(
        "/api/v1/pricing/price-list",
        headers=auth_headers,
        json={"product_id": product["id"], "price": base_price + 500, "starts_at": _iso(future), "name": "Future hike"},
    )
    assert created.status_code == 200, created.text

    from app.services.sales_policy_service import resolve_list_price
    from app.models.product import Product as ProductModel

    row = session.get(ProductModel, product["id"])
    resolved = resolve_list_price(session, row.company_id, store_id, row)
    assert resolved == base_price  # future entry hasn't started yet


def test_price_list_active_entry_applies_and_expired_falls_back(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    base_price = product["base_price"]
    store_id = _store_id(client, auth_headers)
    now = datetime.utcnow()

    active = client.post(
        "/api/v1/pricing/price-list",
        headers=auth_headers,
        json={
            "product_id": product["id"],
            "store_id": store_id,
            "price": base_price + 100,
            "starts_at": _iso(now - timedelta(days=1)),
            "ends_at": _iso(now + timedelta(days=1)),
            "name": "Active markup",
        },
    )
    assert active.status_code == 200, active.text

    from app.services.sales_policy_service import resolve_list_price
    from app.models.product import Product as ProductModel

    row = session.get(ProductModel, product["id"])
    resolved = resolve_list_price(session, row.company_id, store_id, row)
    assert resolved == base_price + 100

    expired = client.post(
        "/api/v1/pricing/price-list",
        headers=auth_headers,
        json={
            "product_id": product["id"],
            "store_id": store_id,
            "price": base_price + 999,
            "starts_at": _iso(now - timedelta(days=10)),
            "ends_at": _iso(now - timedelta(days=5)),
            "name": "Expired promo",
        },
    )
    assert expired.status_code == 200

    # Delete the still-active entry; only the expired one remains -> falls back to base_price.
    del_res = client.delete(f"/api/v1/pricing/price-list/{active.json()['id']}", headers=auth_headers)
    assert del_res.status_code == 200

    session.expire_all()
    row2 = session.get(ProductModel, product["id"])
    resolved2 = resolve_list_price(session, row2.company_id, store_id, row2)
    assert resolved2 == base_price


def test_price_list_store_specific_beats_company_wide(auth_headers, client: TestClient, session: Session):
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    base_price = product["base_price"]
    store_id = _store_id(client, auth_headers)
    now = datetime.utcnow()

    client.post(
        "/api/v1/pricing/price-list",
        headers=auth_headers,
        json={
            "product_id": product["id"],
            "price": base_price + 50,
            "starts_at": _iso(now - timedelta(hours=1)),
            "name": "Company-wide",
        },
    )
    client.post(
        "/api/v1/pricing/price-list",
        headers=auth_headers,
        json={
            "product_id": product["id"],
            "store_id": store_id,
            "price": base_price + 250,
            "starts_at": _iso(now - timedelta(hours=1)),
            "name": "This store only",
        },
    )

    from app.services.sales_policy_service import resolve_list_price
    from app.models.product import Product as ProductModel

    row = session.get(ProductModel, product["id"])
    resolved = resolve_list_price(session, row.company_id, store_id, row)
    assert resolved == base_price + 250


def test_price_list_index_filters(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "GROC-001")
    now = datetime.utcnow()
    client.post(
        "/api/v1/pricing/price-list",
        headers=auth_headers,
        json={"product_id": product["id"], "price": 999, "starts_at": _iso(now)},
    )
    listed = client.get("/api/v1/pricing/price-list", headers=auth_headers, params={"product_id": product["id"]})
    assert listed.status_code == 200
    assert any(e["product_id"] == product["id"] for e in listed.json())
