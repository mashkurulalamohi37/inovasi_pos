"""Bookstore vertical — publishers, authors, ISBN profiles, academic lists."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException
from sqlmodel import Session, select

from app.dependencies import AuthContext, write_audit
from app.models.industry import (
    BookAcademicList,
    BookAcademicListItem,
    BookAuthor,
    BookProductAuthor,
    BookProductProfile,
    BookPublisher,
)
from app.models.inventory import StockBalance
from app.models.product import Product, ProductBarcode
from app.rbac import role_has_permission

AUTHOR_ROLES = {"author", "editor", "translator", "compiler", "illustrator", "other"}
LIST_STATUSES = {"draft", "active", "archived"}
LOW_STOCK_THRESHOLD = 1.0


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _require(auth: AuthContext, code: str) -> None:
    if auth.is_platform_admin or auth.role_code in {"Admin", "Super Admin"}:
        return
    if code in (auth.permissions or set()) or role_has_permission(auth.role_code, code):
        return
    raise HTTPException(status_code=403, detail=f"Missing permission: {code}")


def _parse_json(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def _parse_dt(raw: Any) -> Optional[datetime]:
    if not raw:
        return None
    if isinstance(raw, datetime):
        return raw
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return None


# --- ISBN helpers (check-digit only; not registration authenticity) ---


def normalize_isbn(value: str | None) -> str:
    if not value:
        return ""
    cleaned = re.sub(r"[\s\-]", "", str(value).strip())
    return cleaned.upper()


def validate_isbn_10(value: str | None) -> bool:
    isbn = normalize_isbn(value)
    if len(isbn) != 10 or not re.fullmatch(r"[0-9]{9}[0-9X]", isbn):
        return False
    total = 0
    for i, ch in enumerate(isbn):
        digit = 10 if ch == "X" else int(ch)
        total += digit * (10 - i)
    return total % 11 == 0


def validate_isbn_13(value: str | None) -> bool:
    isbn = normalize_isbn(value)
    if len(isbn) != 13 or not isbn.isdigit():
        return False
    total = sum(int(d) * (1 if i % 2 == 0 else 3) for i, d in enumerate(isbn[:12]))
    check = (10 - (total % 10)) % 10
    return check == int(isbn[12])


def _assert_isbn_fields(isbn_10: str | None, isbn_13: str | None) -> tuple[str | None, str | None]:
    n10 = normalize_isbn(isbn_10) or None
    n13 = normalize_isbn(isbn_13) or None
    if n10 is not None and not validate_isbn_10(n10):
        raise HTTPException(status_code=400, detail="Invalid ISBN-10 check digit")
    if n13 is not None and not validate_isbn_13(n13):
        raise HTTPException(status_code=400, detail="Invalid ISBN-13 check digit")
    return n10, n13


def _ensure_unique_isbn(
    session: Session,
    company_id: str,
    *,
    isbn_10: str | None,
    isbn_13: str | None,
    exclude_product_id: str | None = None,
) -> None:
    rows = session.exec(
        select(BookProductProfile).where(BookProductProfile.company_id == company_id)
    ).all()
    for row in rows:
        if exclude_product_id and row.product_id == exclude_product_id:
            continue
        if isbn_10 and row.isbn_10 and row.isbn_10 == isbn_10:
            raise HTTPException(status_code=409, detail="ISBN-10 already in use for this company")
        if isbn_13 and row.isbn_13 and row.isbn_13 == isbn_13:
            raise HTTPException(status_code=409, detail="ISBN-13 already in use for this company")


def _sync_isbn_barcodes(
    session: Session,
    auth: AuthContext,
    product_id: str,
    *,
    isbn_10: str | None,
    isbn_13: str | None,
) -> None:
    """Map ISBN values onto ProductBarcode; reject ambiguous cross-product mappings."""
    for code, btype in ((isbn_13, "ISBN13"), (isbn_10, "ISBN10")):
        if not code:
            continue
        existing = session.exec(
            select(ProductBarcode).where(
                ProductBarcode.company_id == auth.company_id,
                ProductBarcode.barcode == code,
                ProductBarcode.is_active == True,  # noqa: E712
            )
        ).all()
        other_products = {b.product_id for b in existing if b.product_id != product_id}
        if other_products:
            raise HTTPException(
                status_code=409,
                detail=f"Barcode {code} already mapped to another product",
            )
        if any(b.product_id == product_id for b in existing):
            continue
        session.add(
            ProductBarcode(
                company_id=auth.company_id,
                product_id=product_id,
                barcode=code,
                barcode_type=btype,
                is_primary=False,
                is_active=True,
                created_by=auth.user_id,
            )
        )


def _stock_qty(session: Session, company_id: str, product_id: str, store_id: str | None) -> float:
    stmt = select(StockBalance).where(
        StockBalance.company_id == company_id,
        StockBalance.product_id == product_id,
    )
    if store_id:
        stmt = stmt.where(StockBalance.store_id == store_id)
    rows = session.exec(stmt).all()
    return sum(max(0.0, (b.qty_on_hand or 0) - (b.qty_reserved or 0)) for b in rows)


def _availability_status(stock_qty: float, required_qty: float) -> str:
    if stock_qty <= 0:
        return "out_of_stock"
    if stock_qty < max(required_qty, LOW_STOCK_THRESHOLD):
        return "low_stock"
    return "available"


# --- Publishers ---


def _publisher_out(session: Session, row: BookPublisher) -> dict[str, Any]:
    book_count = len(
        session.exec(
            select(BookProductProfile).where(
                BookProductProfile.company_id == row.company_id,
                BookProductProfile.publisher_id == row.id,
                BookProductProfile.is_active == True,  # noqa: E712
            )
        ).all()
    )
    return {
        "id": row.id,
        "publisher_code": row.publisher_code,
        "publisher_name": row.publisher_name,
        "contact_person": row.contact_person,
        "phone": row.phone,
        "email": row.email,
        "address": row.address,
        "website": row.website,
        "is_active": row.is_active,
        "book_count": book_count,
    }


def list_publishers(
    session: Session,
    company_id: str,
    *,
    q: str | None = None,
    active_only: bool = True,
) -> list[dict[str, Any]]:
    rows = session.exec(select(BookPublisher).where(BookPublisher.company_id == company_id)).all()
    qn = (q or "").strip().lower()
    out: list[dict[str, Any]] = []
    for row in rows:
        if active_only and not row.is_active:
            continue
        if qn:
            hay = " ".join(
                [row.publisher_code or "", row.publisher_name or "", row.contact_person or ""]
            ).lower()
            if qn not in hay:
                continue
        out.append(_publisher_out(session, row))
    return out


def upsert_publisher(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    _require(auth, "bookstore.publisher_manage")
    pub_id = body.get("id")
    code = (body.get("publisher_code") or "").strip()
    name = (body.get("publisher_name") or "").strip()
    if not code or not name:
        raise HTTPException(status_code=400, detail="publisher_code and publisher_name required")

    row: BookPublisher | None = None
    if pub_id:
        row = session.get(BookPublisher, pub_id)
        if not row or row.company_id != auth.company_id:
            raise HTTPException(status_code=404, detail="Publisher not found")
    else:
        existing = session.exec(
            select(BookPublisher).where(
                BookPublisher.company_id == auth.company_id,
                BookPublisher.publisher_code == code,
            )
        ).first()
        if existing:
            row = existing

    created = row is None
    if not row:
        row = BookPublisher(company_id=auth.company_id, publisher_code=code, publisher_name=name)
        session.add(row)

    row.publisher_code = code
    row.publisher_name = name
    row.contact_person = body.get("contact_person", row.contact_person)
    row.phone = body.get("phone", row.phone)
    row.email = body.get("email", row.email)
    row.address = body.get("address", row.address)
    row.website = body.get("website", row.website)
    if "is_active" in body:
        row.is_active = bool(body["is_active"])
    row.updated_at = _utc_now()
    session.flush()
    write_audit(
        session,
        auth,
        "bookstore.publisher.create" if created else "bookstore.publisher.update",
        "book_publisher",
        row.id,
        detail={"publisher_code": row.publisher_code},
    )
    return _publisher_out(session, row)


# --- Authors ---


def _author_out(row: BookAuthor) -> dict[str, Any]:
    return {
        "id": row.id,
        "author_name": row.author_name,
        "sort_name": row.sort_name,
        "biography_short": row.biography_short,
        "country": row.country,
        "is_active": row.is_active,
    }


def list_authors(
    session: Session,
    company_id: str,
    *,
    q: str | None = None,
    active_only: bool = True,
) -> list[dict[str, Any]]:
    rows = session.exec(select(BookAuthor).where(BookAuthor.company_id == company_id)).all()
    qn = (q or "").strip().lower()
    out: list[dict[str, Any]] = []
    for row in rows:
        if active_only and not row.is_active:
            continue
        if qn:
            hay = " ".join([row.author_name or "", row.sort_name or "", row.country or ""]).lower()
            if qn not in hay:
                continue
        out.append(_author_out(row))
    return out


def upsert_author(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    _require(auth, "bookstore.author_manage")
    author_id = body.get("id")
    name = (body.get("author_name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="author_name required")

    row: BookAuthor | None = None
    if author_id:
        row = session.get(BookAuthor, author_id)
        if not row or row.company_id != auth.company_id:
            raise HTTPException(status_code=404, detail="Author not found")

    created = row is None
    if not row:
        row = BookAuthor(company_id=auth.company_id, author_name=name)
        session.add(row)

    row.author_name = name
    row.sort_name = body.get("sort_name", row.sort_name)
    row.biography_short = body.get("biography_short", row.biography_short)
    row.country = body.get("country", row.country)
    if "is_active" in body:
        row.is_active = bool(body["is_active"])
    row.updated_at = _utc_now()
    session.flush()
    write_audit(
        session,
        auth,
        "bookstore.author.create" if created else "bookstore.author.update",
        "book_author",
        row.id,
        detail={"author_name": row.author_name},
    )
    return _author_out(row)


# --- Profiles ---


def _profile_authors(session: Session, company_id: str, product_id: str) -> list[dict[str, Any]]:
    links = session.exec(
        select(BookProductAuthor).where(
            BookProductAuthor.company_id == company_id,
            BookProductAuthor.product_id == product_id,
        )
    ).all()
    links = sorted(links, key=lambda x: (x.author_order or 1, x.author_id))
    out: list[dict[str, Any]] = []
    for link in links:
        author = session.get(BookAuthor, link.author_id)
        out.append(
            {
                "author_id": link.author_id,
                "author_name": author.author_name if author else None,
                "author_order": link.author_order,
                "role": link.role,
            }
        )
    return out


def _profile_out(session: Session, row: BookProductProfile) -> dict[str, Any]:
    product = session.get(Product, row.product_id)
    publisher = session.get(BookPublisher, row.publisher_id) if row.publisher_id else None
    return {
        "id": row.id,
        "product_id": row.product_id,
        "sku": product.sku if product else None,
        "name": product.name if product else None,
        "base_price": product.base_price if product else None,
        "isbn_10": row.isbn_10,
        "isbn_13": row.isbn_13,
        "title": row.title,
        "subtitle": row.subtitle,
        "publisher_id": row.publisher_id,
        "publisher_name": publisher.publisher_name if publisher else None,
        "edition": row.edition,
        "publication_year": row.publication_year,
        "language": row.language,
        "binding_type": row.binding_type,
        "page_count": row.page_count,
        "subject": row.subject,
        "series_name": row.series_name,
        "volume_no": row.volume_no,
        "academic_level": row.academic_level,
        "curriculum_code": row.curriculum_code,
        "country_of_origin": row.country_of_origin,
        "attributes": _parse_json(row.attributes_json),
        "is_active": row.is_active,
        "authors": _profile_authors(session, row.company_id, row.product_id),
    }


def get_profile(session: Session, company_id: str, product_id: str) -> BookProductProfile | None:
    return session.exec(
        select(BookProductProfile).where(
            BookProductProfile.company_id == company_id,
            BookProductProfile.product_id == product_id,
        )
    ).first()


def get_profile_detail(session: Session, auth: AuthContext, product_id: str) -> dict[str, Any]:
    row = get_profile(session, auth.company_id, product_id)
    if not row:
        raise HTTPException(status_code=404, detail="Book profile not found")
    return _profile_out(session, row)


def list_profiles(
    session: Session,
    company_id: str,
    *,
    q: str | None = None,
    isbn: str | None = None,
    author_id: str | None = None,
    publisher_id: str | None = None,
    language: str | None = None,
    academic_level: str | None = None,
    subject: str | None = None,
    board: str | None = None,
    curriculum: str | None = None,
    active_only: bool = True,
) -> list[dict[str, Any]]:
    rows = session.exec(
        select(BookProductProfile).where(BookProductProfile.company_id == company_id)
    ).all()
    qn = (q or "").strip().lower()
    isbn_n = normalize_isbn(isbn) if isbn else ""
    out: list[dict[str, Any]] = []

    for row in rows:
        if active_only and not row.is_active:
            continue
        if publisher_id and row.publisher_id != publisher_id:
            continue
        if language and (row.language or "").lower() != language.lower():
            continue
        if academic_level and (row.academic_level or "").lower() != academic_level.lower():
            continue
        if subject and (row.subject or "").lower() != subject.lower():
            continue
        if curriculum and (row.curriculum_code or "").lower() != curriculum.lower():
            continue
        if board:
            # board often lives on academic lists; also check attributes
            attrs = _parse_json(row.attributes_json)
            board_hay = " ".join(
                [row.curriculum_code or "", str(attrs.get("board") or ""), str(attrs.get("curriculum") or "")]
            ).lower()
            if board.lower() not in board_hay:
                continue

        product = session.get(Product, row.product_id)
        if not product or product.company_id != company_id:
            continue

        authors = _profile_authors(session, company_id, row.product_id)
        if author_id and not any(a["author_id"] == author_id for a in authors):
            continue

        if isbn_n:
            codes = {normalize_isbn(row.isbn_10), normalize_isbn(row.isbn_13)}
            if isbn_n not in codes:
                continue

        if qn:
            publisher = session.get(BookPublisher, row.publisher_id) if row.publisher_id else None
            author_names = " ".join(a.get("author_name") or "" for a in authors)
            hay = " ".join(
                [
                    row.title or "",
                    row.subtitle or "",
                    row.isbn_10 or "",
                    row.isbn_13 or "",
                    product.sku or "",
                    product.name or "",
                    publisher.publisher_name if publisher else "",
                    author_names,
                    row.subject or "",
                    row.language or "",
                ]
            ).lower()
            if qn not in hay:
                continue

        out.append(_profile_out(session, row))
    return out


def _replace_authors(
    session: Session,
    auth: AuthContext,
    product_id: str,
    authors: list[dict[str, Any]] | None,
) -> None:
    if authors is None:
        return
    existing = session.exec(
        select(BookProductAuthor).where(
            BookProductAuthor.company_id == auth.company_id,
            BookProductAuthor.product_id == product_id,
        )
    ).all()
    for link in existing:
        session.delete(link)
    session.flush()

    seen: set[str] = set()
    for i, item in enumerate(authors):
        aid = item.get("author_id")
        if not aid:
            raise HTTPException(status_code=400, detail="authors[].author_id required")
        if aid in seen:
            raise HTTPException(status_code=409, detail="Duplicate author on book")
        seen.add(aid)
        author = session.get(BookAuthor, aid)
        if not author or author.company_id != auth.company_id:
            raise HTTPException(status_code=400, detail="Invalid author_id")
        role = (item.get("role") or "author").strip().lower()
        if role not in AUTHOR_ROLES:
            raise HTTPException(status_code=400, detail=f"Invalid author role: {role}")
        session.add(
            BookProductAuthor(
                company_id=auth.company_id,
                product_id=product_id,
                author_id=aid,
                author_order=int(item.get("author_order") or (i + 1)),
                role=role,
            )
        )


def upsert_profile(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    _require(auth, "bookstore.book_manage")
    product_id = body.get("product_id")
    if not product_id:
        raise HTTPException(status_code=400, detail="product_id required")
    product = session.get(Product, product_id)
    if not product or product.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.industry_pack != "bookstore":
        raise HTTPException(status_code=400, detail="Product is not a bookstore pack item")

    row = get_profile(session, auth.company_id, product_id)
    if "isbn_10" in body:
        isbn_10, _ = _assert_isbn_fields(body.get("isbn_10"), None)
    else:
        isbn_10 = row.isbn_10 if row else None
    if "isbn_13" in body:
        _, isbn_13 = _assert_isbn_fields(None, body.get("isbn_13"))
    else:
        isbn_13 = row.isbn_13 if row else None

    _ensure_unique_isbn(
        session,
        auth.company_id,
        isbn_10=isbn_10,
        isbn_13=isbn_13,
        exclude_product_id=product_id,
    )

    publisher_id = body.get("publisher_id", row.publisher_id if row else None)
    if publisher_id:
        pub = session.get(BookPublisher, publisher_id)
        if not pub or pub.company_id != auth.company_id:
            raise HTTPException(status_code=400, detail="Invalid publisher_id")

    title = (body.get("title") or "").strip() or (product.name or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title required")

    created = row is None
    if not row:
        row = BookProductProfile(
            company_id=auth.company_id,
            product_id=product_id,
            title=title,
        )
        session.add(row)

    row.title = title
    if "subtitle" in body:
        row.subtitle = body.get("subtitle")
    row.isbn_10 = isbn_10
    row.isbn_13 = isbn_13
    row.publisher_id = publisher_id
    if "edition" in body:
        row.edition = body.get("edition")
    if "publication_year" in body:
        row.publication_year = body.get("publication_year")
    if "language" in body:
        row.language = body.get("language")
    if "binding_type" in body:
        row.binding_type = body.get("binding_type")
    if "page_count" in body:
        row.page_count = body.get("page_count")
    if "subject" in body:
        row.subject = body.get("subject")
    if "series_name" in body:
        row.series_name = body.get("series_name")
    if "volume_no" in body:
        row.volume_no = body.get("volume_no")
    if "academic_level" in body:
        row.academic_level = body.get("academic_level")
    if "curriculum_code" in body:
        row.curriculum_code = body.get("curriculum_code")
    if "country_of_origin" in body:
        row.country_of_origin = body.get("country_of_origin")
    if "attributes" in body or "attributes_json" in body:
        attrs = body.get("attributes") if "attributes" in body else body.get("attributes_json")
        row.attributes_json = json.dumps(attrs) if isinstance(attrs, dict) else (
            attrs if isinstance(attrs, str) else None
        )
    if "is_active" in body:
        row.is_active = bool(body["is_active"])
    row.updated_at = _utc_now()
    session.flush()

    _sync_isbn_barcodes(session, auth, product_id, isbn_10=isbn_10, isbn_13=isbn_13)
    if "authors" in body:
        _replace_authors(session, auth, product_id, body.get("authors") or [])

    write_audit(
        session,
        auth,
        "bookstore.profile.create" if created else "bookstore.profile.update",
        "book_product_profile",
        row.id,
        detail={"product_id": product_id, "isbn_13": isbn_13, "title": row.title},
    )
    return _profile_out(session, row)


def lookup_by_code(session: Session, auth: AuthContext, code: str) -> dict[str, Any]:
    raw = (code or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="code required")
    normalized = normalize_isbn(raw)
    product_ids: set[str] = set()

    barcodes = session.exec(
        select(ProductBarcode).where(
            ProductBarcode.company_id == auth.company_id,
            ProductBarcode.is_active == True,  # noqa: E712
        )
    ).all()
    for bc in barcodes:
        if bc.barcode == raw or normalize_isbn(bc.barcode) == normalized:
            product_ids.add(bc.product_id)

    profiles = session.exec(
        select(BookProductProfile).where(BookProductProfile.company_id == auth.company_id)
    ).all()
    for p in profiles:
        if normalized and (
            normalize_isbn(p.isbn_13) == normalized or normalize_isbn(p.isbn_10) == normalized
        ):
            product_ids.add(p.product_id)

    products = session.exec(select(Product).where(Product.company_id == auth.company_id)).all()
    for p in products:
        if p.sku == raw or p.barcode == raw or normalize_isbn(p.barcode or "") == normalized:
            product_ids.add(p.id)

    if not product_ids:
        raise HTTPException(status_code=404, detail="No product found for code")
    if len(product_ids) > 1:
        raise HTTPException(status_code=409, detail="Ambiguous code matches multiple products")

    product_id = next(iter(product_ids))
    profile = get_profile(session, auth.company_id, product_id)
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if profile:
        return _profile_out(session, profile)
    return {
        "product_id": product.id,
        "sku": product.sku,
        "name": product.name,
        "base_price": product.base_price,
        "isbn_10": None,
        "isbn_13": None,
        "title": product.name,
        "authors": [],
    }


# --- Academic lists ---


def _list_item_out(
    session: Session,
    company_id: str,
    item: BookAcademicListItem,
    *,
    store_id: str | None = None,
) -> dict[str, Any]:
    product = session.get(Product, item.product_id)
    profile = get_profile(session, company_id, item.product_id)
    stock_qty = _stock_qty(session, company_id, item.product_id, store_id) if store_id else None
    required = float(item.recommended_qty or 1)
    status = _availability_status(stock_qty or 0, required) if store_id is not None else None
    return {
        "id": item.id,
        "list_id": item.list_id,
        "product_id": item.product_id,
        "sku": product.sku if product else None,
        "name": product.name if product else None,
        "title": profile.title if profile else (product.name if product else None),
        "isbn_13": profile.isbn_13 if profile else None,
        "isbn_10": profile.isbn_10 if profile else None,
        "unit_price": product.base_price if product else None,
        "sequence_no": item.sequence_no,
        "required_flag": item.required_flag,
        "recommended_qty": item.recommended_qty,
        "notes": item.notes,
        "alternative_group": item.alternative_group,
        "stock_qty": stock_qty,
        "availability_status": status,
    }


def _list_out(
    session: Session,
    row: BookAcademicList,
    *,
    include_items: bool = False,
    store_id: str | None = None,
) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": row.id,
        "list_code": row.list_code,
        "list_name": row.list_name,
        "institution_name": row.institution_name,
        "school_name": row.school_name,
        "curriculum": row.curriculum,
        "board": row.board,
        "class_or_grade": row.class_or_grade,
        "academic_year": row.academic_year,
        "language_version": row.language_version,
        "valid_from": row.valid_from.isoformat() if row.valid_from else None,
        "valid_to": row.valid_to.isoformat() if row.valid_to else None,
        "status": row.status,
        "notes": row.notes,
        "created_by": row.created_by,
    }
    if include_items:
        items = session.exec(
            select(BookAcademicListItem).where(BookAcademicListItem.list_id == row.id)
        ).all()
        items = sorted(items, key=lambda x: (x.sequence_no or 0, x.id))
        data["items"] = [
            _list_item_out(session, row.company_id, it, store_id=store_id) for it in items
        ]
    return data


def list_academic_lists(
    session: Session,
    company_id: str,
    *,
    q: str | None = None,
    status: str | None = None,
    class_or_grade: str | None = None,
    academic_year: str | None = None,
    board: str | None = None,
    school_name: str | None = None,
) -> list[dict[str, Any]]:
    rows = session.exec(
        select(BookAcademicList).where(BookAcademicList.company_id == company_id)
    ).all()
    qn = (q or "").strip().lower()
    out: list[dict[str, Any]] = []
    for row in rows:
        if status and row.status != status:
            continue
        if class_or_grade and row.class_or_grade != class_or_grade:
            continue
        if academic_year and row.academic_year != academic_year:
            continue
        if board and (row.board or "").lower() != board.lower():
            continue
        if school_name and (row.school_name or "").lower() != school_name.lower():
            continue
        if qn:
            hay = " ".join(
                [
                    row.list_code or "",
                    row.list_name or "",
                    row.school_name or "",
                    row.institution_name or "",
                    row.board or "",
                ]
            ).lower()
            if qn not in hay:
                continue
        out.append(_list_out(session, row))
    return out


def get_academic_list(
    session: Session,
    auth: AuthContext,
    list_id: str,
    *,
    store_id: str | None = None,
) -> dict[str, Any]:
    row = session.get(BookAcademicList, list_id)
    if not row or row.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Academic list not found")
    return _list_out(session, row, include_items=True, store_id=store_id)


def upsert_academic_list(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    _require(auth, "bookstore.academic_list_manage")
    list_id = body.get("id")
    code = (body.get("list_code") or "").strip()
    name = (body.get("list_name") or "").strip()
    if not code or not name:
        raise HTTPException(status_code=400, detail="list_code and list_name required")

    row: BookAcademicList | None = None
    if list_id:
        row = session.get(BookAcademicList, list_id)
        if not row or row.company_id != auth.company_id:
            raise HTTPException(status_code=404, detail="Academic list not found")
    else:
        existing = session.exec(
            select(BookAcademicList).where(
                BookAcademicList.company_id == auth.company_id,
                BookAcademicList.list_code == code,
            )
        ).first()
        if existing:
            row = existing

    created = row is None
    if not row:
        row = BookAcademicList(
            company_id=auth.company_id,
            list_code=code,
            list_name=name,
            created_by=auth.user_id,
        )
        session.add(row)

    row.list_code = code
    row.list_name = name
    for field in (
        "institution_name",
        "school_name",
        "curriculum",
        "board",
        "class_or_grade",
        "academic_year",
        "language_version",
        "notes",
    ):
        if field in body:
            setattr(row, field, body.get(field))
    if "valid_from" in body:
        row.valid_from = _parse_dt(body.get("valid_from"))
    if "valid_to" in body:
        row.valid_to = _parse_dt(body.get("valid_to"))
    if "status" in body:
        st = str(body["status"]).strip().lower()
        if st not in LIST_STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid status: {st}")
        row.status = st
    row.updated_at = _utc_now()
    session.flush()

    if "items" in body and isinstance(body["items"], list):
        for item_body in body["items"]:
            upsert_list_item(session, auth, row.id, item_body, _skip_perm=True)

    write_audit(
        session,
        auth,
        "bookstore.academic_list.create" if created else "bookstore.academic_list.update",
        "book_academic_list",
        row.id,
        detail={"list_code": row.list_code, "status": row.status},
    )
    return _list_out(session, row, include_items=True)


def set_list_status(session: Session, auth: AuthContext, list_id: str, status: str) -> dict[str, Any]:
    _require(auth, "bookstore.academic_list_manage")
    row = session.get(BookAcademicList, list_id)
    if not row or row.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Academic list not found")
    st = (status or "").strip().lower()
    if st not in LIST_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status: {st}")
    row.status = st
    row.updated_at = _utc_now()
    session.flush()
    write_audit(
        session,
        auth,
        "bookstore.academic_list.status",
        "book_academic_list",
        row.id,
        detail={"status": st},
    )
    return _list_out(session, row, include_items=True)


def upsert_list_item(
    session: Session,
    auth: AuthContext,
    list_id: str,
    body: dict[str, Any],
    *,
    _skip_perm: bool = False,
) -> dict[str, Any]:
    if not _skip_perm:
        _require(auth, "bookstore.academic_list_manage")
    lst = session.get(BookAcademicList, list_id)
    if not lst or lst.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Academic list not found")

    product_id = body.get("product_id")
    if not product_id:
        raise HTTPException(status_code=400, detail="product_id required")
    product = session.get(Product, product_id)
    if not product or product.company_id != auth.company_id:
        raise HTTPException(status_code=400, detail="Product not found or cross-tenant")

    item_id = body.get("id")
    row: BookAcademicListItem | None = None
    if item_id:
        row = session.get(BookAcademicListItem, item_id)
        if not row or row.list_id != list_id:
            raise HTTPException(status_code=404, detail="List item not found")
    else:
        existing = session.exec(
            select(BookAcademicListItem).where(
                BookAcademicListItem.list_id == list_id,
                BookAcademicListItem.product_id == product_id,
            )
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail="Product already on this academic list")

    created = row is None
    if not row:
        row = BookAcademicListItem(list_id=list_id, product_id=product_id)
        session.add(row)

    row.product_id = product_id
    if "sequence_no" in body:
        row.sequence_no = int(body.get("sequence_no") or 0)
    if "required_flag" in body:
        row.required_flag = bool(body["required_flag"])
    if "recommended_qty" in body:
        row.recommended_qty = float(body.get("recommended_qty") or 1)
    if "notes" in body:
        row.notes = body.get("notes")
    if "alternative_group" in body:
        row.alternative_group = body.get("alternative_group")
    row.updated_at = _utc_now()
    session.flush()
    write_audit(
        session,
        auth,
        "bookstore.academic_list_item.create" if created else "bookstore.academic_list_item.update",
        "book_academic_list_item",
        row.id,
        detail={"list_id": list_id, "product_id": product_id},
    )
    return _list_item_out(session, auth.company_id, row)


def remove_list_item(session: Session, auth: AuthContext, list_id: str, item_id: str) -> dict[str, Any]:
    _require(auth, "bookstore.academic_list_manage")
    lst = session.get(BookAcademicList, list_id)
    if not lst or lst.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Academic list not found")
    row = session.get(BookAcademicListItem, item_id)
    if not row or row.list_id != list_id:
        raise HTTPException(status_code=404, detail="List item not found")
    session.delete(row)
    session.flush()
    write_audit(
        session,
        auth,
        "bookstore.academic_list_item.delete",
        "book_academic_list_item",
        item_id,
        detail={"list_id": list_id},
    )
    return {"ok": True, "id": item_id}


def list_availability(
    session: Session,
    auth: AuthContext,
    list_id: str,
    store_id: str,
) -> list[dict[str, Any]]:
    if not store_id:
        raise HTTPException(status_code=400, detail="store_id required")
    lst = session.get(BookAcademicList, list_id)
    if not lst or lst.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Academic list not found")
    items = session.exec(
        select(BookAcademicListItem).where(BookAcademicListItem.list_id == list_id)
    ).all()
    out: list[dict[str, Any]] = []
    for item in items:
        required_qty = float(item.recommended_qty or 1)
        stock_qty = _stock_qty(session, auth.company_id, item.product_id, store_id)
        product = session.get(Product, item.product_id)
        profile = get_profile(session, auth.company_id, item.product_id)
        out.append(
            {
                "item_id": item.id,
                "product_id": item.product_id,
                "sku": product.sku if product else None,
                "name": product.name if product else None,
                "title": profile.title if profile else None,
                "isbn_13": profile.isbn_13 if profile else None,
                "required_qty": required_qty,
                "stock_qty": stock_qty,
                "status": _availability_status(stock_qty, required_qty),
                "required_flag": item.required_flag,
            }
        )
    return out


def resolve_list_for_cart(
    session: Session,
    auth: AuthContext,
    list_id: str,
    body: dict[str, Any],
) -> dict[str, Any]:
    store_id = body.get("store_id")
    if not store_id:
        raise HTTPException(status_code=400, detail="store_id required")
    lst = session.get(BookAcademicList, list_id)
    if not lst or lst.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Academic list not found")

    filter_ids = body.get("product_ids")
    filter_set = set(filter_ids) if filter_ids else None

    items = session.exec(
        select(BookAcademicListItem).where(BookAcademicListItem.list_id == list_id)
    ).all()
    available: list[dict[str, Any]] = []
    unavailable: list[dict[str, Any]] = []
    for item in items:
        if filter_set is not None and item.product_id not in filter_set:
            continue
        qty = float(item.recommended_qty or 1)
        stock = _stock_qty(session, auth.company_id, item.product_id, store_id)
        product = session.get(Product, item.product_id)
        profile = get_profile(session, auth.company_id, item.product_id)
        entry = {
            "product_id": item.product_id,
            "qty": qty,
            "name": (profile.title if profile else None) or (product.name if product else None),
            "isbn": (profile.isbn_13 if profile else None) or (profile.isbn_10 if profile else None),
            "unit_price": product.base_price if product else None,
            "stock_qty": stock,
            "status": _availability_status(stock, qty),
        }
        if stock >= qty:
            available.append(entry)
        else:
            unavailable.append(entry)
    return {
        "list_id": list_id,
        "store_id": store_id,
        "available": available,
        "unavailable": unavailable,
        "all_available": len(unavailable) == 0 and len(available) > 0,
    }
