"""Phase 6B-12 — Bookstore vertical wiring tests."""

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.core import Company
from app.models.inventory import StockBalance
from app.models.product import Product
from tests.test_operations import (
    _stock_qty,
    _store_id,
    get_product_by_sku,
    login,
)


def _publishers(client: TestClient, headers: dict) -> list[dict]:
    res = client.get("/api/v1/industry/bookstore/publishers", headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


def _authors(client: TestClient, headers: dict) -> list[dict]:
    res = client.get("/api/v1/industry/bookstore/authors", headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


def _academic_lists(client: TestClient, headers: dict) -> list[dict]:
    res = client.get("/api/v1/industry/bookstore/academic-lists", headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


def test_bookstore_profile_create_update_and_isbn_validation(auth_headers, client: TestClient):
    product = get_product_by_sku(client, auth_headers, "BK-PHY10")
    pubs = _publishers(client, auth_headers)
    nctb = next(p for p in pubs if p["publisher_code"] == "NCTB")
    authors = _authors(client, auth_headers)
    nctb_author = next(a for a in authors if a["author_name"] == "NCTB Author")
    humayun = next(a for a in authors if "হুমায়ূন" in a["author_name"])

    bad = client.post(
        "/api/v1/industry/bookstore/profiles",
        headers=auth_headers,
        json={
            "product_id": product["id"],
            "isbn_13": "9780306406150",  # bad check digit
            "title": "Physics",
        },
    )
    assert bad.status_code == 400, bad.text

    bad10 = client.post(
        "/api/v1/industry/bookstore/profiles",
        headers=auth_headers,
        json={
            "product_id": product["id"],
            "isbn_10": "0306406150",
            "title": "Physics",
        },
    )
    assert bad10.status_code == 400, bad10.text

    ok = client.post(
        "/api/v1/industry/bookstore/profiles",
        headers=auth_headers,
        json={
            "product_id": product["id"],
            "isbn_13": "9780306406157",
            "isbn_10": "0306406152",
            "title": "Physics Class 10 Updated",
            "publisher_id": nctb["id"],
            "subject": "Physics",
            "academic_level": "Class 10",
            "authors": [
                {"author_id": nctb_author["id"], "author_order": 1, "role": "author"},
                {"author_id": humayun["id"], "author_order": 2, "role": "editor"},
            ],
        },
    )
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["title"] == "Physics Class 10 Updated"
    assert len(body["authors"]) == 2

    got = client.get(f"/api/v1/industry/bookstore/profiles/{product['id']}", headers=auth_headers)
    assert got.status_code == 200
    assert got.json()["isbn_13"] == "9780306406157"


def test_bookstore_duplicate_isbn_blocked(auth_headers, client: TestClient):
    phy = get_product_by_sku(client, auth_headers, "BK-PHY10")
    novel = get_product_by_sku(client, auth_headers, "BK-NOVEL")
    dup = client.post(
        "/api/v1/industry/bookstore/profiles",
        headers=auth_headers,
        json={
            "product_id": novel["id"],
            "isbn_13": "9780306406157",  # already on BK-PHY10
            "title": "Clash",
        },
    )
    assert dup.status_code == 409, dup.text
    assert phy["id"]


def test_bookstore_publisher_book_count(auth_headers, client: TestClient):
    pubs = _publishers(client, auth_headers)
    nctb = next(p for p in pubs if p["publisher_code"] == "NCTB")
    assert nctb["book_count"] >= 2
    other = next(p for p in pubs if p["publisher_code"] == "OTHER-PUB")
    assert other["book_count"] >= 1


def test_bookstore_search_filters(auth_headers, client: TestClient):
    by_isbn = client.get(
        "/api/v1/industry/bookstore/profiles",
        headers=auth_headers,
        params={"isbn": "978-0-306-40615-7"},
    )
    assert by_isbn.status_code == 200
    assert any(p["sku"] == "BK-PHY10" for p in by_isbn.json())

    by_title = client.get(
        "/api/v1/industry/bookstore/profiles",
        headers=auth_headers,
        params={"q": "দোজখের"},
    )
    assert by_title.status_code == 200
    assert any(p["sku"] == "BK-NOVEL" for p in by_title.json())

    authors = _authors(client, auth_headers)
    humayun = next(a for a in authors if "হুমায়ূন" in a["author_name"])
    by_author = client.get(
        "/api/v1/industry/bookstore/profiles",
        headers=auth_headers,
        params={"author_id": humayun["id"]},
    )
    assert by_author.status_code == 200
    assert any(p["sku"] == "BK-NOVEL" for p in by_author.json())

    pubs = _publishers(client, auth_headers)
    nctb = next(p for p in pubs if p["publisher_code"] == "NCTB")
    by_pub = client.get(
        "/api/v1/industry/bookstore/profiles",
        headers=auth_headers,
        params={"publisher_id": nctb["id"]},
    )
    assert by_pub.status_code == 200
    assert len(by_pub.json()) >= 2


def test_bookstore_lookup_by_isbn(auth_headers, client: TestClient):
    res = client.get(
        "/api/v1/industry/bookstore/lookup",
        headers=auth_headers,
        params={"code": "978-0306406157"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["sku"] == "BK-PHY10"

    missing = client.get(
        "/api/v1/industry/bookstore/lookup",
        headers=auth_headers,
        params={"code": "9780000000002"},
    )
    assert missing.status_code == 404


def test_bookstore_academic_list_and_availability(auth_headers, client: TestClient, session: Session):
    store_id = _store_id(client, auth_headers)
    lists = _academic_lists(client, auth_headers)
    seed_list = next(x for x in lists if x["list_code"] == "NCTB-C10-2026")
    detail = client.get(
        f"/api/v1/industry/bookstore/academic-lists/{seed_list['id']}",
        headers=auth_headers,
        params={"store_id": store_id},
    )
    assert detail.status_code == 200, detail.text
    assert len(detail.json()["items"]) >= 2

    novel = get_product_by_sku(client, auth_headers, "BK-NOVEL")
    added = client.post(
        f"/api/v1/industry/bookstore/academic-lists/{seed_list['id']}/items",
        headers=auth_headers,
        json={"product_id": novel["id"], "sequence_no": 3, "recommended_qty": 1},
    )
    assert added.status_code == 200, added.text

    dup = client.post(
        f"/api/v1/industry/bookstore/academic-lists/{seed_list['id']}/items",
        headers=auth_headers,
        json={"product_id": novel["id"]},
    )
    assert dup.status_code == 409

    # Cross-tenant product blocked
    other_co = session.exec(select(Company).where(Company.code != "PULSE-DEMO")).first()
    assert other_co is not None
    foreign = Product(
        company_id=other_co.id,
        sku="FK-BOOK-X",
        name="Foreign Book",
        industry_pack="bookstore",
        base_price=10,
    )
    session.add(foreign)
    session.commit()

    blocked = client.post(
        f"/api/v1/industry/bookstore/academic-lists/{seed_list['id']}/items",
        headers=auth_headers,
        json={"product_id": foreign.id},
    )
    assert blocked.status_code == 400, blocked.text

    avail = client.get(
        f"/api/v1/industry/bookstore/academic-lists/{seed_list['id']}/availability",
        headers=auth_headers,
        params={"store_id": store_id},
    )
    assert avail.status_code == 200, avail.text
    assert all("status" in row for row in avail.json())
    assert all(row["stock_qty"] is not None for row in avail.json())

    cart = client.post(
        f"/api/v1/industry/bookstore/academic-lists/{seed_list['id']}/cart-resolve",
        headers=auth_headers,
        json={"store_id": store_id, "product_ids": [novel["id"]]},
    )
    assert cart.status_code == 200, cart.text
    body = cart.json()
    assert "available" in body and "unavailable" in body
    assert body["all_available"] is True or len(body["unavailable"]) == 0


def test_bookstore_sale_decrements_stock_once_and_return_restores(
    auth_headers, client: TestClient, session: Session
):
    product = get_product_by_sku(client, auth_headers, "BK-PHY10")
    store_id = _store_id(client, auth_headers)
    before = _stock_qty(client, auth_headers, product["id"], store_id)

    sale = client.post(
        "/api/v1/sales",
        headers=auth_headers,
        json={
            "client_transaction_id": f"BK-SALE-{product['id'][:8]}",
            "industry_pack": "bookstore",
            "store_id": store_id,
            "status": "completed",
            "subtotal": product["base_price"],
            "discount": 0,
            "tax": 0,
            "total": product["base_price"],
            "tender": "cash",
            "payments": [{"method": "cash", "amount": product["base_price"]}],
            "lines": [
                {
                    "product_id": product["id"],
                    "sku": product["sku"],
                    "name": product["name"],
                    "qty": 1,
                    "unit_price": product["base_price"],
                }
            ],
        },
    )
    assert sale.status_code == 200, sale.text
    inv = sale.json()
    inv_id = inv.get("id") or inv.get("invoice_id")

    session.expire_all()
    mid = _stock_qty(client, auth_headers, product["id"], store_id)
    assert mid == before - 1

    # Ensure single ledger decrement (qty_on_hand only dropped once)
    bal = session.exec(
        select(StockBalance).where(
            StockBalance.product_id == product["id"], StockBalance.store_id == store_id
        )
    ).first()
    assert float(bal.qty_on_hand) == before - 1

    detail = client.get(f"/api/v1/sales/{inv_id}", headers=auth_headers)
    assert detail.status_code == 200
    line = detail.json()["lines"][0]

    ret = client.post(
        f"/api/v1/sales/{inv_id}/return",
        headers=auth_headers,
        json={
            "reason": "Damaged cover",
            "condition": "saleable",
            "lines": [{"invoice_line_id": line["id"], "qty": 1}],
        },
    )
    assert ret.status_code == 200, ret.text
    session.expire_all()
    after = _stock_qty(client, auth_headers, product["id"], store_id)
    assert after == before


def test_bookstore_cashier_denied_publisher_manage(client: TestClient):
    cashier = login(client, "cashier@pulse.pos", "cashier123")
    view = client.get("/api/v1/industry/bookstore/publishers", headers=cashier)
    assert view.status_code == 200, view.text

    denied = client.post(
        "/api/v1/industry/bookstore/publishers",
        headers=cashier,
        json={"publisher_code": "X", "publisher_name": "Denied Pub"},
    )
    assert denied.status_code == 403


def test_bookstore_tenant_isolation_profiles(auth_headers, client: TestClient, session: Session):
    other_co = session.exec(select(Company).where(Company.code != "PULSE-DEMO")).first()
    foreign = Product(
        company_id=other_co.id,
        sku="FK-ISO-BK",
        name="Isolated Book",
        industry_pack="bookstore",
        base_price=1,
    )
    session.add(foreign)
    session.commit()

    denied = client.post(
        "/api/v1/industry/bookstore/profiles",
        headers=auth_headers,
        json={"product_id": foreign.id, "title": "Nope", "isbn_13": "9780141439518"},
    )
    assert denied.status_code == 404, denied.text
