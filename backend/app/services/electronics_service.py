"""Electronics vertical — serial/IMEI stock, warranty, RMA."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import func, or_
from sqlmodel import Session, select

from app.inventory.locking import for_update
from app.dependencies import AuthContext, write_audit
from app.models.industry import ElectronicsRma, ElectronicsSerialStock, ElectronicsWarranty
from app.models.product import Customer, Product
from app.models.sales import SalesInvoice, SalesInvoiceLine

SERIAL_STATUSES = {
    "available",
    "sold",
    "reserved",
    "returned",
    "trade_in_received",
    "damaged",
    "warranty",
    "rma",
    "blocked",
    "retired",
}

WARRANTY_STATUSES = {"active", "expired", "void", "claimed"}

RMA_STATUSES = {
    "received",
    "inspecting",
    "repairing",
    "replacement_approved",
    "refunded",
    "returned_to_customer",
    "rejected",
    "closed",
}

RMA_TRANSITIONS: dict[str, set[str]] = {
    "received": {"inspecting", "rejected", "closed"},
    "inspecting": {"repairing", "replacement_approved", "refunded", "rejected", "returned_to_customer"},
    "repairing": {"returned_to_customer", "replacement_approved", "refunded", "closed"},
    "replacement_approved": {"closed"},
    "refunded": {"closed"},
    "returned_to_customer": {"closed"},
    "rejected": {"closed"},
    "closed": set(),
}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


# Registry listings are paginated. These used to load every row a company owned
# and filter in Python, so each listing got slower for the rest of the tenant's
# life and a large tenant could not open the page at all.
DEFAULT_PAGE_LIMIT = 200
MAX_PAGE_LIMIT = 500


def _paginate(stmt, limit: int, offset: int):
    """Apply a clamped LIMIT/OFFSET, matching the convention used elsewhere."""
    return stmt.offset(max(0, offset)).limit(max(1, min(limit, MAX_PAGE_LIMIT)))


def _search(term: str, *cols):
    """Case-insensitive "contains" across columns, as a SQL predicate.

    Filtering has to happen in SQL, not after the fact: applying LIMIT to an
    unfiltered query and then dropping rows in Python would silently return a
    partial page — or an empty one — whenever a search matched nothing early on.

    LIKE metacharacters in the user's term are escaped so a search for "50%" is
    a literal search rather than a wildcard.
    """
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    pattern = f"%{escaped.lower()}%"
    return or_(*[func.lower(col).like(pattern, escape="\\") for col in cols])


def _num(value: Any, field: str, *, default: float = 0.0) -> float:
    """Coerce a request field to a float, rejecting junk with 400 rather than 500.

    These endpoints take a raw dict, so `float("abc")` would otherwise surface as
    an unhandled ValueError and a 500.
    """
    if value is None or value == "":
        return default
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"{field} must be a number") from None
    if parsed != parsed or parsed in (float("inf"), float("-inf")):
        raise HTTPException(status_code=400, detail=f"{field} must be a finite number")
    return parsed


def _add_months(dt: datetime, months: int) -> datetime:
    """Advance a date by whole calendar months, clamping to the month end.

    Schedules previously stepped in 30-day blocks, which drifts about five days
    off the calendar by month 12 and eleven by month 24, so a "monthly"
    installment slowly stopped landing on its due day.
    """
    total = dt.month - 1 + months
    year = dt.year + total // 12
    month = total % 12 + 1
    if month == 12:
        next_month_start = datetime(year + 1, 1, 1, tzinfo=dt.tzinfo)
    else:
        next_month_start = datetime(year, month + 1, 1, tzinfo=dt.tzinfo)
    last_day = (next_month_start - timedelta(days=1)).day
    return dt.replace(year=year, month=month, day=min(dt.day, last_day))


def _next_no(session: Session, company_id: str, prefix: str, model, field: str) -> str:
    """Next document number for a company, e.g. EMI-000004.

    Derived from the highest number already issued, via a single aggregate.
    The previous implementation loaded every row for the company and used
    `len(rows) + 1`, which cost a full table read per insert and — worse —
    reissued a number that was already in use as soon as any row was deleted.

    Numbers are zero-padded to a fixed width, so a lexicographic MAX matches the
    numeric one. There is no unique constraint on these columns, so two
    concurrent inserts can still land on the same number; that needs a DB
    constraint or sequence to close properly.
    """
    col = getattr(model, field)
    last = session.exec(
        select(func.max(col)).where(
            model.company_id == company_id,
            col.like(f"{prefix}-%"),  # type: ignore[attr-defined]
        )
    ).one()
    # session.exec on a scalar aggregate may hand back a 1-tuple depending on the
    # driver; normalise both shapes.
    if isinstance(last, tuple):
        last = last[0]
    n = 1
    if last:
        suffix = str(last).rsplit("-", 1)[-1]
        if suffix.isdigit():
            n = int(suffix) + 1
    return f"{prefix}-{n:06d}"


def product_requires_serial(product: Product | None, *, feature_serial: bool = True) -> bool:
    if not product or product.industry_pack not in {"electronics", "mobile-shop"}:
        return False
    if not feature_serial:
        return False
    meta: dict[str, Any] = {}
    if product.meta_json:
        try:
            meta = json.loads(product.meta_json)
        except json.JSONDecodeError:
            meta = {}
    for key in (
        "serialized",
        "has_serial",
        "hasSerial",
        "serial_imei_required",
        "imei_required",
        "is_serialized",
        "serial_tracked",
        "track_serial",
        "track_serials",
    ):
        if key in meta:
            val = meta.get(key)
            if isinstance(val, str):
                return val.lower() in ("true", "1", "yes")
            return bool(val)
    category = str(meta.get("category") or "").lower()
    if category in {"accessories", "charger", "cable", "case", "cover", "screen protector", "cooker", "appliance"}:
        return False
    return True


def find_serial(
    session: Session,
    company_id: str,
    serial: str,
    *,
    imei: str | None = None,
) -> ElectronicsSerialStock | None:
    serial = (serial or "").strip()
    candidates = [c for c in (serial, (imei or "").strip()) if c]
    for value in candidates:
        row = session.exec(
            select(ElectronicsSerialStock).where(
                ElectronicsSerialStock.company_id == company_id,
                ElectronicsSerialStock.serial_imei == value,
            )
        ).first()
        if row:
            return row
        row = session.exec(
            select(ElectronicsSerialStock).where(
                ElectronicsSerialStock.company_id == company_id,
                ElectronicsSerialStock.imei_no == value,
            )
        ).first()
        if row:
            return row
        row = session.exec(
            select(ElectronicsSerialStock).where(
                ElectronicsSerialStock.company_id == company_id,
                ElectronicsSerialStock.imei_2 == value,
            )
        ).first()
        if row:
            return row
    return None


def assert_serial_unique(
    session: Session,
    company_id: str,
    serial_no: str,
    *,
    imei_no: str | None = None,
    imei_2: str | None = None,
    exclude_id: str | None = None,
) -> None:
    serial_no = serial_no.strip()
    if not serial_no:
        raise HTTPException(status_code=400, detail="Serial number required")
    existing = find_serial(session, company_id, serial_no)
    if existing and existing.id != exclude_id:
        raise HTTPException(status_code=409, detail=f"Duplicate serial/IMEI: {serial_no}")
    if imei_no and imei_no.strip():
        by_imei = session.exec(
            select(ElectronicsSerialStock).where(
                ElectronicsSerialStock.company_id == company_id,
                ElectronicsSerialStock.imei_no == imei_no.strip(),
            )
        ).first()
        if by_imei and by_imei.id != exclude_id:
            raise HTTPException(status_code=409, detail=f"Duplicate IMEI: {imei_no}")
        # Also block if another unit uses this as serial_imei
        by_serial = find_serial(session, company_id, imei_no.strip())
        if by_serial and by_serial.id != exclude_id and by_serial.serial_imei != serial_no:
            raise HTTPException(status_code=409, detail=f"Duplicate IMEI: {imei_no}")
    if imei_2 and imei_2.strip():
        if imei_no and imei_2.strip() == imei_no.strip():
            raise HTTPException(status_code=400, detail="IMEI-1 and IMEI-2 cannot be the same")
        if imei_2.strip() == serial_no:
            raise HTTPException(status_code=400, detail="IMEI-2 cannot equal primary serial/IMEI")
        by_imei2 = session.exec(
            select(ElectronicsSerialStock).where(
                ElectronicsSerialStock.company_id == company_id,
                ElectronicsSerialStock.imei_2 == imei_2.strip(),
            )
        ).first()
        if by_imei2 and by_imei2.id != exclude_id:
            raise HTTPException(status_code=409, detail=f"Duplicate IMEI-2: {imei_2}")
        by_imei1 = session.exec(
            select(ElectronicsSerialStock).where(
                ElectronicsSerialStock.company_id == company_id,
                ElectronicsSerialStock.imei_no == imei_2.strip(),
            )
        ).first()
        if by_imei1 and by_imei1.id != exclude_id:
            raise HTTPException(status_code=409, detail=f"Duplicate IMEI-2: {imei_2}")
        by_serial2 = find_serial(session, company_id, imei_2.strip())
        if by_serial2 and by_serial2.id != exclude_id:
            raise HTTPException(status_code=409, detail=f"Duplicate IMEI-2: {imei_2}")


def create_serial_stock(
    session: Session,
    *,
    company_id: str,
    product_id: str,
    serial_no: str,
    store_id: str | None = None,
    variant_id: str | None = None,
    imei_no: str | None = None,
    imei_2: str | None = None,
    purchase_id: str | None = None,
    receive_id: str | None = None,
    cost_price: float | None = None,
    supplier_id: str | None = None,
    status: str = "available",
    condition: str = "new",
    activation_status: str = "unknown",
) -> ElectronicsSerialStock:
    assert_serial_unique(session, company_id, serial_no, imei_no=imei_no, imei_2=imei_2)
    row = ElectronicsSerialStock(
        company_id=company_id,
        product_id=product_id,
        variant_id=variant_id,
        store_id=store_id,
        serial_imei=serial_no.strip(),
        imei_no=(imei_no or "").strip() or None,
        imei_2=(imei_2 or "").strip() or None,
        condition=condition if condition else "new",
        activation_status=activation_status if activation_status else "unknown",
        purchase_id=purchase_id,
        receive_id=receive_id,
        status=status if status in SERIAL_STATUSES else "available",
        cost_price=cost_price,
        supplier_id=supplier_id,
    )
    session.add(row)
    session.flush()
    return row


def receive_serials_for_line(
    session: Session,
    *,
    company_id: str,
    product: Product,
    qty: float,
    serials: list[dict[str, Any]] | None,
    serial_no: str | None,
    store_id: str | None,
    variant_id: str | None,
    purchase_id: str | None,
    receive_id: str | None,
    cost_price: float | None,
    supplier_id: str | None,
    require_serial: bool,
) -> list[ElectronicsSerialStock]:
    entries: list[dict[str, Any]] = []
    if serials:
        entries = serials
    elif serial_no:
        entries = [{"serial_no": serial_no}]
    if require_serial:
        if not entries:
            raise HTTPException(status_code=400, detail="Serial/IMEI required for electronics receive")
        if int(qty) != len(entries):
            raise HTTPException(
                status_code=400,
                detail=f"Serial count ({len(entries)}) must match receive qty ({int(qty)})",
            )
    elif not entries:
        return []
    created: list[ElectronicsSerialStock] = []
    seen: set[str] = set()
    for entry in entries:
        sn = str(entry.get("serial_no") or entry.get("serial_imei") or entry.get("imei_1") or "").strip()
        imei = str(entry.get("imei_no") or entry.get("imei_1") or "").strip() or None
        imei_2 = str(entry.get("imei_2") or "").strip() or None
        condition = str(entry.get("condition") or "new").strip() or "new"
        if not sn:
            raise HTTPException(status_code=400, detail="Each serial entry requires serial_no")
        key = sn.lower()
        if key in seen:
            raise HTTPException(status_code=400, detail=f"Duplicate serial in receive payload: {sn}")
        seen.add(key)
        created.append(
            create_serial_stock(
                session,
                company_id=company_id,
                product_id=product.id,
                serial_no=sn,
                store_id=store_id,
                variant_id=variant_id or entry.get("variant_id"),
                imei_no=imei or sn,
                imei_2=imei_2,
                purchase_id=purchase_id,
                receive_id=receive_id,
                cost_price=cost_price,
                supplier_id=supplier_id,
                condition=condition,
            )
        )
    return created


def _serial_out(
    row: ElectronicsSerialStock,
    product: Product | None = None,
    warranty: ElectronicsWarranty | None = None,
) -> dict[str, Any]:
    warranty_end = None
    if warranty is not None:
        end = warranty.warranty_end_date or warranty.expires_at
        warranty_end = end.isoformat() if end else None
    return {
        "id": row.id,
        # Surfaced so the serial registry can show a warranty-until column; it
        # only had warranty_id before, which is not renderable.
        "warranty_end_date": warranty_end,
        "warranty_no": warranty.warranty_no if warranty is not None else None,
        "product_id": row.product_id,
        "product_name": product.name if product else None,
        "product_sku": product.sku if product else None,
        "industry_pack": product.industry_pack if product else None,
        "variant_id": row.variant_id,
        "store_id": row.store_id,
        "serial_no": row.serial_imei,
        "serial_imei": row.serial_imei,
        "imei_no": row.imei_no,
        "imei_1": row.imei_no or row.serial_imei,
        "imei_2": row.imei_2,
        "condition": row.condition or "new",
        "activation_status": row.activation_status or "unknown",
        "activation_date": row.activation_date.isoformat() if row.activation_date else None,
        "sold_at": row.sold_at.isoformat() if row.sold_at else None,
        "status": row.status,
        "cost_price": row.cost_price,
        "supplier_id": row.supplier_id,
        "customer_id": row.customer_id,
        "sales_invoice_id": row.sales_invoice_id,
        "warranty_id": row.warranty_id,
        "purchase_id": row.purchase_id,
        "receive_id": row.receive_id,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def list_serials(
    session: Session,
    company_id: str,
    *,
    product_id: str | None = None,
    status: str | None = None,
    q: str | None = None,
    store_id: str | None = None,
    industry_pack: str | None = None,
    limit: int = DEFAULT_PAGE_LIMIT,
    offset: int = 0,
) -> list[dict[str, Any]]:
    stmt = (
        select(ElectronicsSerialStock, Product, ElectronicsWarranty)
        .join(Product, ElectronicsSerialStock.product_id == Product.id)
        # Outer: most serials carry no warranty until they are sold.
        .outerjoin(ElectronicsWarranty, ElectronicsSerialStock.warranty_id == ElectronicsWarranty.id)
        .where(ElectronicsSerialStock.company_id == company_id)
    )
    if product_id:
        stmt = stmt.where(ElectronicsSerialStock.product_id == product_id)
    if status:
        stmt = stmt.where(ElectronicsSerialStock.status == status)
    if store_id:
        stmt = stmt.where(ElectronicsSerialStock.store_id == store_id)
    if industry_pack:
        stmt = stmt.where(Product.industry_pack == industry_pack)
    q_term = (q or "").strip()
    if q_term:
        stmt = stmt.where(
            _search(
                q_term,
                ElectronicsSerialStock.serial_imei,
                ElectronicsSerialStock.imei_no,
                ElectronicsSerialStock.imei_2,
                Product.sku,
                Product.name,
            )
        )
    stmt = _paginate(stmt.order_by(ElectronicsSerialStock.created_at.desc()), limit, offset)  # type: ignore[attr-defined]
    rows = session.exec(stmt).all()
    return [_serial_out(row, product, warranty) for row, product, warranty in rows]


def validate_serial_for_sale(
    session: Session,
    auth: AuthContext,
    *,
    serial: str,
    product_id: str | None = None,
    store_id: str | None = None,
) -> dict[str, Any]:
    row = find_serial(session, auth.company_id, serial)
    if not row:
        return {"valid": False, "available": False, "status": None, "detail": "Serial/IMEI not found"}
    if product_id and row.product_id != product_id:
        return {"valid": True, "available": False, "status": row.status, "detail": "Serial belongs to another product"}
    if store_id and row.store_id and row.store_id != store_id:
        return {"valid": True, "available": False, "status": row.status, "detail": "Serial belongs to another store"}
    available = row.status == "available"
    return {
        "valid": True,
        "available": available,
        "status": row.status,
        "serial_id": row.id,
        "serial_no": row.serial_imei,
        "imei_no": row.imei_no,
        "imei_1": row.imei_no or row.serial_imei,
        "imei_2": row.imei_2,
        "product_id": row.product_id,
        "detail": None if available else f"Serial status is {row.status}",
    }


def mark_serial_sold(
    session: Session,
    auth: AuthContext,
    *,
    serial: str,
    invoice_id: str,
    customer_id: str | None,
    product_id: str | None = None,
) -> ElectronicsSerialStock:
    serial = (serial or "").strip()
    row = None
    for col in (
        ElectronicsSerialStock.serial_imei,
        ElectronicsSerialStock.imei_no,
        ElectronicsSerialStock.imei_2,
    ):
        row = session.exec(
            for_update(
                session,
                select(ElectronicsSerialStock).where(
                    ElectronicsSerialStock.company_id == auth.company_id,
                    col == serial,
                ),
            )
        ).first()
        if row:
            break
    if not row:
        raise ValueError(f"Serial/IMEI not found: {serial}")
    if row.status != "available":
        raise ValueError(f"Serial/IMEI already sold or unavailable: {serial}")
    if product_id and row.product_id != product_id:
        raise ValueError(f"Serial/IMEI product mismatch: {serial}")
    row.status = "sold"
    row.sales_invoice_id = invoice_id
    row.customer_id = customer_id
    row.sold_at = _utc_now()
    session.add(row)
    return row


def _warranty_out(w: ElectronicsWarranty, product: Product | None = None) -> dict[str, Any]:
    end = w.warranty_end_date or w.expires_at
    return {
        "id": w.id,
        "warranty_no": w.warranty_no,
        "serial_imei": w.serial_imei,
        "serial_no": w.serial_imei,
        "serial_id": w.serial_id,
        "invoice_id": w.invoice_id or w.sales_invoice_id,
        "sales_invoice_id": w.sales_invoice_id or w.invoice_id,
        "sales_line_id": w.sales_line_id,
        "product_id": w.product_id,
        "product_name": product.name if product else None,
        "customer_id": w.customer_id,
        "warranty_months": w.warranty_months,
        "warranty_start_date": w.warranty_start_date.isoformat() if w.warranty_start_date else None,
        "warranty_end_date": end.isoformat() if end else None,
        "expires_at": end.isoformat() if end else None,
        "warranty_terms": w.warranty_terms,
        "status": w.status or "active",
        "created_at": w.created_at.isoformat() if w.created_at else None,
    }


def list_warranties(
    session: Session,
    company_id: str,
    *,
    status: str | None = None,
    q: str | None = None,
    limit: int = DEFAULT_PAGE_LIMIT,
    offset: int = 0,
) -> list[dict[str, Any]]:
    # Product is joined rather than fetched per row: this previously issued one
    # SELECT per warranty just to read the product name.
    stmt = (
        select(ElectronicsWarranty, Product)
        .outerjoin(Product, ElectronicsWarranty.product_id == Product.id)
        .where(ElectronicsWarranty.company_id == company_id)
    )
    if status:
        stmt = stmt.where(ElectronicsWarranty.status == status)
    q_term = (q or "").strip()
    if q_term:
        stmt = stmt.where(
            _search(
                q_term,
                ElectronicsWarranty.warranty_no,
                ElectronicsWarranty.serial_imei,
                Product.name,
            )
        )
    stmt = _paginate(stmt.order_by(ElectronicsWarranty.created_at.desc()), limit, offset)  # type: ignore[attr-defined]
    return [_warranty_out(w, product) for w, product in session.exec(stmt).all()]


def register_warranty(
    session: Session,
    auth: AuthContext,
    body: dict[str, Any],
) -> dict[str, Any]:
    serial = str(body.get("serial_no") or body.get("serial_imei") or "").strip()
    serial_id = body.get("serial_id")
    invoice_id = body.get("sales_invoice_id") or body.get("invoice_id")
    sales_line_id = body.get("sales_line_id")
    if not serial and serial_id:
        stock = session.get(ElectronicsSerialStock, serial_id)
        if stock and stock.company_id == auth.company_id:
            serial = stock.serial_imei
    if not serial:
        raise HTTPException(status_code=400, detail="Serial/IMEI required")
    stock = find_serial(session, auth.company_id, serial)
    if not stock:
        raise HTTPException(status_code=404, detail="Serial/IMEI not found")
    if stock.status not in {"sold", "warranty", "rma"}:
        raise HTTPException(status_code=400, detail="Warranty requires a sold serial")
    if invoice_id:
        inv = session.get(SalesInvoice, invoice_id)
        if not inv or inv.company_id != auth.company_id:
            raise HTTPException(status_code=404, detail="Sales invoice not found")
    months = int(body.get("warranty_months") or 12)
    if months <= 0:
        raise HTTPException(status_code=400, detail="warranty_months must be > 0")
    start = _utc_now()
    if body.get("warranty_start_date"):
        try:
            start = datetime.fromisoformat(str(body["warranty_start_date"]).replace("Z", "+00:00"))
        except ValueError:
            pass
    # Calendar months, matching AMC and the EMI schedule. Stepping 30-day blocks
    # expired a 12-month warranty five days early and a 24-month one eleven days
    # early, refusing claims the customer had actually paid to be covered for.
    end = _add_months(start, months)
    if body.get("warranty_end_date"):
        try:
            end = datetime.fromisoformat(str(body["warranty_end_date"]).replace("Z", "+00:00"))
        except ValueError:
            pass
    if end <= start:
        raise HTTPException(
            status_code=400,
            detail="warranty_end_date must be after warranty_start_date",
        )
    existing = session.exec(
        select(ElectronicsWarranty).where(
            ElectronicsWarranty.company_id == auth.company_id,
            ElectronicsWarranty.serial_imei == serial,
            ElectronicsWarranty.status == "active",
        )
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Active warranty already exists for this serial")
    warranty_no = body.get("warranty_no") or _next_no(
        session, auth.company_id, "WR", ElectronicsWarranty, "warranty_no"
    )
    row = ElectronicsWarranty(
        company_id=auth.company_id,
        warranty_no=warranty_no,
        serial_imei=serial,
        serial_id=stock.id,
        invoice_id=invoice_id,
        sales_invoice_id=invoice_id,
        sales_line_id=sales_line_id,
        product_id=body.get("product_id") or stock.product_id,
        customer_id=body.get("customer_id") or stock.customer_id,
        warranty_months=months,
        warranty_start_date=start,
        warranty_end_date=end,
        warranty_terms=body.get("warranty_terms"),
        status="active",
        expires_at=end,
    )
    session.add(row)
    session.flush()
    stock.warranty_id = row.id
    if stock.status == "sold":
        stock.status = "warranty"
    session.add(stock)
    write_audit(session, auth, "warranty_create", "electronics_warranty", row.id, {"serial": serial})
    session.flush()
    product = session.get(Product, row.product_id) if row.product_id else None
    return _warranty_out(row, product)


def auto_register_warranty_from_sale(
    session: Session,
    auth: AuthContext,
    *,
    invoice: SalesInvoice,
    line: SalesInvoiceLine,
    serial_row: ElectronicsSerialStock,
    warranty_months: int,
) -> ElectronicsWarranty | None:
    existing = session.exec(
        select(ElectronicsWarranty).where(
            ElectronicsWarranty.company_id == auth.company_id,
            ElectronicsWarranty.serial_imei == serial_row.serial_imei,
            ElectronicsWarranty.status == "active",
        )
    ).first()
    if existing:
        return existing
    start = _utc_now()
    end = start + timedelta(days=max(1, warranty_months) * 30)
    row = ElectronicsWarranty(
        company_id=auth.company_id,
        warranty_no=_next_no(session, auth.company_id, "WR", ElectronicsWarranty, "warranty_no"),
        serial_imei=serial_row.serial_imei,
        serial_id=serial_row.id,
        invoice_id=invoice.id,
        sales_invoice_id=invoice.id,
        sales_line_id=line.id,
        product_id=serial_row.product_id,
        customer_id=invoice.customer_id or serial_row.customer_id,
        warranty_months=warranty_months,
        warranty_start_date=start,
        warranty_end_date=end,
        status="active",
        expires_at=end,
    )
    session.add(row)
    session.flush()
    serial_row.warranty_id = row.id
    serial_row.status = "warranty"
    session.add(serial_row)
    write_audit(session, auth, "warranty_auto_create", "electronics_warranty", row.id)
    return row


def _rma_out(r: ElectronicsRma) -> dict[str, Any]:
    return {
        "id": r.id,
        "rma_no": r.rma_no,
        "invoice_number": r.invoice_number,
        "customer_id": r.customer_id,
        "customer_name": r.customer_name,
        "product_id": r.product_id,
        "product_name": r.product_name,
        "serial_id": r.serial_id,
        "serial_imei": r.serial_imei,
        "serial_no": r.serial_imei,
        "warranty_id": r.warranty_id,
        "warranty_status": r.warranty_status,
        "return_reason": r.return_reason,
        "problem_description": r.problem_description or r.return_reason,
        "action_type": r.action_type,
        "condition_note": r.condition_note,
        "resolution_note": r.resolution_note,
        "cost_amount": r.cost_amount,
        "received_date": r.received_date.isoformat() if r.received_date else None,
        "approval_status": r.approval_status,
        "status": r.status or "received",
        "replacement_serial_id": r.replacement_serial_id,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def list_rma(
    session: Session,
    company_id: str,
    *,
    status: str | None = None,
    q: str | None = None,
    limit: int = DEFAULT_PAGE_LIMIT,
    offset: int = 0,
) -> list[dict[str, Any]]:
    stmt = select(ElectronicsRma).where(ElectronicsRma.company_id == company_id)
    if status:
        stmt = stmt.where(ElectronicsRma.status == status)
    q_term = (q or "").strip()
    if q_term:
        stmt = stmt.where(
            _search(
                q_term,
                ElectronicsRma.rma_no,
                ElectronicsRma.serial_imei,
                ElectronicsRma.customer_name,
                ElectronicsRma.product_name,
            )
        )
    stmt = _paginate(stmt.order_by(ElectronicsRma.created_at.desc()), limit, offset)  # type: ignore[attr-defined]
    return [_rma_out(r) for r in session.exec(stmt).all()]


def create_rma(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    serial = str(body.get("serial_imei") or body.get("serial_no") or "").strip()
    if len(serial) < 5:
        raise HTTPException(status_code=400, detail="Invalid serial/IMEI")
    stock = find_serial(session, auth.company_id, serial)
    if stock and stock.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Serial not found")
    customer_name = body.get("customer_name") or ""
    customer_id = body.get("customer_id")
    if customer_id and not customer_name:
        cust = session.get(Customer, customer_id)
        if cust and cust.company_id == auth.company_id:
            customer_name = cust.name
    product_name = body.get("product_name") or ""
    product_id = body.get("product_id") or (stock.product_id if stock else None)
    if product_id and not product_name:
        product = session.get(Product, product_id)
        if product:
            product_name = product.name
    problem = str(body.get("problem_description") or body.get("return_reason") or "").strip()
    if not problem:
        raise HTTPException(status_code=400, detail="Problem description required")
    warranty_id = body.get("warranty_id")
    warranty_status = body.get("warranty_status", "unknown")
    if stock and stock.warranty_id and not warranty_id:
        warranty_id = stock.warranty_id
        warranty_status = "in_warranty"
    row = ElectronicsRma(
        company_id=auth.company_id,
        rma_no=_next_no(session, auth.company_id, "RMA", ElectronicsRma, "rma_no"),
        invoice_number=body.get("invoice_number") or (stock.sales_invoice_id if stock else None),
        customer_id=customer_id or (stock.customer_id if stock else None),
        customer_name=customer_name,
        product_id=product_id,
        product_name=product_name,
        serial_id=stock.id if stock else body.get("serial_id"),
        serial_imei=serial,
        warranty_id=warranty_id,
        warranty_status=warranty_status,
        return_reason=problem,
        problem_description=problem,
        action_type=body.get("action_type", "return"),
        condition_note=body.get("condition_note"),
        resolution_note=body.get("resolution_note"),
        cost_amount=float(body["cost_amount"]) if body.get("cost_amount") is not None else None,
        received_date=_utc_now(),
        approval_status="pending",
        status="received",
    )
    session.add(row)
    session.flush()
    if stock:
        stock.status = "rma"
        session.add(stock)
    write_audit(session, auth, "rma_create", "electronics_rma", row.id, {"serial": serial})
    session.flush()
    return _rma_out(row)


def update_rma_status(
    session: Session,
    auth: AuthContext,
    rma_id: str,
    body: dict[str, Any],
) -> dict[str, Any]:
    row = session.get(ElectronicsRma, rma_id)
    if not row or row.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="RMA not found")
    new_status = str(body.get("status") or "").strip()
    if not new_status:
        raise HTTPException(status_code=400, detail="status required")
    if new_status not in RMA_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid RMA status: {new_status}")
    current = row.status or "received"
    allowed = RMA_TRANSITIONS.get(current, set())
    if new_status != current and new_status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot transition RMA from {current} to {new_status}",
        )
    row.status = new_status
    if body.get("resolution_note") is not None:
        row.resolution_note = body.get("resolution_note")
    if body.get("condition_note") is not None:
        row.condition_note = body.get("condition_note")
    if body.get("cost_amount") is not None:
        row.cost_amount = float(body["cost_amount"])
    if body.get("action_type"):
        row.action_type = body["action_type"]
    if new_status in {"rejected", "closed"} and row.approval_status == "pending":
        row.approval_status = "rejected" if new_status == "rejected" else "approved"
    if new_status == "replacement_approved":
        row.approval_status = "approved"
        _handle_replacement(session, auth, row, body)
    if new_status == "refunded":
        row.approval_status = "approved"
        stock = find_serial(session, auth.company_id, row.serial_imei)
        if stock:
            stock.status = "retired"
            session.add(stock)
    if new_status == "returned_to_customer":
        stock = find_serial(session, auth.company_id, row.serial_imei)
        if stock:
            # Repaired unit returns to customer — not available stock
            stock.status = "sold" if stock.sales_invoice_id else "retired"
            session.add(stock)
    session.add(row)
    write_audit(
        session,
        auth,
        "rma_status_update",
        "electronics_rma",
        row.id,
        {"from": current, "to": new_status},
    )
    session.flush()
    return _rma_out(row)


def _handle_replacement(session: Session, auth: AuthContext, rma: ElectronicsRma, body: dict[str, Any]) -> None:
    old = find_serial(session, auth.company_id, rma.serial_imei)
    if old:
        old.status = body.get("old_serial_status") or "retired"
        session.add(old)
    new_serial = str(body.get("replacement_serial_no") or body.get("replacement_serial_imei") or "").strip()
    if not new_serial:
        return
    replacement = find_serial(session, auth.company_id, new_serial)
    if not replacement:
        raise HTTPException(status_code=404, detail="Replacement serial not found")
    if replacement.status != "available":
        raise HTTPException(status_code=400, detail="Replacement serial must be available")
    if rma.product_id and replacement.product_id != rma.product_id:
        raise HTTPException(status_code=400, detail="Replacement serial product mismatch")
    replacement.status = "sold"
    replacement.customer_id = rma.customer_id or (old.customer_id if old else None)
    replacement.sales_invoice_id = old.sales_invoice_id if old else rma.invoice_number
    session.add(replacement)
    rma.replacement_serial_id = replacement.id
    # Stock issue for replacement unit
    from app.inventory.constants import SALE
    from app.services.inventory_service import record_stock_movement

    record_stock_movement(
        session,
        company_id=auth.company_id,
        product_id=replacement.product_id,
        store_id=replacement.store_id or auth.store_id,
        warehouse_id=None,
        out_qty=1,
        transaction_type=SALE,
        transaction_ref=rma.rma_no,
        reference_id=rma.id,
        note=f"RMA replacement {rma.rma_no}",
        created_by=auth.user_id,
        serial_no=replacement.serial_imei,
    )


# ── Electronics Dashboard ─────────────────────────────────────────────────────

def get_dashboard_stats(
    session: Session,
    company_id: str,
    store_id: str | None = None,
) -> dict[str, Any]:
    """Return KPI counts for the Electronics dashboard (electronics-only)."""
    from sqlmodel import func
    from app.models.industry import ElectronicsAmc, ElectronicsEmi, ElectronicsEmiInstallment

    # Serial counts
    serial_base = select(ElectronicsSerialStock).where(ElectronicsSerialStock.company_id == company_id)
    if store_id:
        serial_base = serial_base.where(ElectronicsSerialStock.store_id == store_id)
    all_serials = session.exec(serial_base).all()
    status_counts: dict[str, int] = {}
    for s in all_serials:
        status_counts[s.status] = status_counts.get(s.status, 0) + 1

    # Warranties
    warranty_stmt = select(ElectronicsWarranty).where(
        ElectronicsWarranty.company_id == company_id,
        ElectronicsWarranty.status == "active",
    )
    active_warranties = len(session.exec(warranty_stmt).all())

    # Expiring soon (next 30 days)
    now = _utc_now()
    in_30 = now + timedelta(days=30)
    expiring_stmt = select(ElectronicsWarranty).where(
        ElectronicsWarranty.company_id == company_id,
        ElectronicsWarranty.status == "active",
        ElectronicsWarranty.warranty_end_date >= now,
        ElectronicsWarranty.warranty_end_date <= in_30,
    )
    expiring_soon = len(session.exec(expiring_stmt).all())

    # RMA
    open_rma_stmt = select(ElectronicsRma).where(
        ElectronicsRma.company_id == company_id,
        ElectronicsRma.status.not_in(["closed", "rejected"]),  # type: ignore[attr-defined]
    )
    open_rma = len(session.exec(open_rma_stmt).all())

    # EMI totals
    emi_stmt = select(ElectronicsEmi).where(
        ElectronicsEmi.company_id == company_id,
        ElectronicsEmi.status == "active",
    )
    active_emis = session.exec(emi_stmt).all()
    emi_outstanding = sum(e.total_payable - e.total_collected for e in active_emis)

    # Overdue installments
    overdue_stmt = select(ElectronicsEmiInstallment).where(
        ElectronicsEmiInstallment.company_id == company_id,
        ElectronicsEmiInstallment.status == "overdue",
    )
    overdue_count = len(session.exec(overdue_stmt).all())

    return {
        "total_serials": len(all_serials),
        "serial_status": status_counts,
        "active_warranties": active_warranties,
        "expiring_warranty_30d": expiring_soon,
        "open_rma": open_rma,
        "emi_outstanding": emi_outstanding,
        "emi_overdue_count": overdue_count,
        "active_emi_count": len(active_emis),
    }


# ── AMC (Annual Maintenance Contract) ────────────────────────────────────────

AMC_STATUSES = {"active", "expired", "pending_renewal", "cancelled"}

# 10 years. Bounds the contract end date so a bad duration cannot overflow it.
MAX_AMC_DURATION_MONTHS = 120


def _amc_out(a: "ElectronicsAmc") -> dict[str, Any]:
    from app.models.industry import ElectronicsAmc  # noqa: F811
    return {
        "id": a.id,
        "amc_no": a.amc_no,
        "serial_imei": a.serial_imei,
        "customer_name": a.customer_name,
        "customer_id": a.customer_id,
        "product_name": a.product_name,
        "product_id": a.product_id,
        "start_date": a.start_date.isoformat() if a.start_date else None,
        "end_date": a.end_date.isoformat() if a.end_date else None,
        "amount": a.amount,
        "status": a.status,
        "terms": a.terms,
        "notes": a.notes,
        "invoice_id": a.invoice_id,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


def list_amc(
    session: Session,
    company_id: str,
    *,
    status: str | None = None,
    q: str | None = None,
    limit: int = DEFAULT_PAGE_LIMIT,
    offset: int = 0,
) -> list[dict[str, Any]]:
    from app.models.industry import ElectronicsAmc
    stmt = select(ElectronicsAmc).where(ElectronicsAmc.company_id == company_id)
    if status:
        stmt = stmt.where(ElectronicsAmc.status == status)
    q_term = (q or "").strip()
    if q_term:
        stmt = stmt.where(
            _search(
                q_term,
                ElectronicsAmc.amc_no,
                ElectronicsAmc.serial_imei,
                ElectronicsAmc.customer_name,
                ElectronicsAmc.product_name,
            )
        )
    stmt = _paginate(stmt.order_by(ElectronicsAmc.end_date), limit, offset)  # type: ignore[attr-defined]
    return [_amc_out(a) for a in session.exec(stmt).all()]


def create_amc(
    session: Session,
    auth: AuthContext,
    body: dict[str, Any],
) -> dict[str, Any]:
    from app.models.industry import ElectronicsAmc
    serial = str(body.get("serial_imei") or "").strip()
    if not serial:
        raise HTTPException(status_code=400, detail="serial_imei required")
    months = int(_num(body.get("duration_months"), "duration_months", default=12))
    if months <= 0:
        raise HTTPException(status_code=400, detail="duration_months must be > 0")
    if months > MAX_AMC_DURATION_MONTHS:
        raise HTTPException(
            status_code=400,
            detail=f"duration_months must not exceed {MAX_AMC_DURATION_MONTHS}",
        )
    amount = _num(body.get("amount"), "amount")
    if amount < 0:
        raise HTTPException(status_code=400, detail="amount cannot be negative")
    start = _utc_now()
    if body.get("start_date"):
        try:
            start = datetime.fromisoformat(str(body["start_date"]).replace("Z", "+00:00"))
        except ValueError:
            pass
    end = _add_months(start, months)
    if body.get("end_date"):
        try:
            end = datetime.fromisoformat(str(body["end_date"]).replace("Z", "+00:00"))
        except ValueError:
            pass
    # An explicit end_date overrides the duration entirely, so it has to be
    # checked: without this a contract could be stored already expired, and every
    # "days remaining" figure derived from it came out negative.
    if end <= start:
        raise HTTPException(status_code=400, detail="end_date must be after start_date")
    serial_row = find_serial(session, auth.company_id, serial)
    row = ElectronicsAmc(
        company_id=auth.company_id,
        store_id=auth.store_id,
        amc_no=_next_no(session, auth.company_id, "AMC", ElectronicsAmc, "amc_no"),
        serial_imei=serial,
        serial_id=serial_row.id if serial_row else None,
        customer_name=str(body.get("customer_name") or ""),
        customer_id=body.get("customer_id"),
        product_name=str(body.get("product_name") or ""),
        product_id=body.get("product_id") or (serial_row.product_id if serial_row else None),
        start_date=start,
        end_date=end,
        amount=amount,
        status="active",
        terms=body.get("terms"),
        notes=body.get("notes"),
        invoice_id=body.get("invoice_id"),
    )
    session.add(row)
    session.flush()
    write_audit(session, auth, "amc_create", "electronics_amc", row.id, {"serial": serial})
    session.flush()
    return _amc_out(row)


def update_amc(
    session: Session,
    auth: AuthContext,
    amc_id: str,
    body: dict[str, Any],
) -> dict[str, Any]:
    from app.models.industry import ElectronicsAmc
    row = session.get(ElectronicsAmc, amc_id)
    if not row or row.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="AMC not found")
    new_status = body.get("status")
    if new_status:
        if new_status not in AMC_STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid AMC status: {new_status}")
        row.status = new_status
    if body.get("notes") is not None:
        row.notes = body["notes"]
    if body.get("terms") is not None:
        row.terms = body["terms"]
    session.add(row)
    write_audit(session, auth, "amc_update", "electronics_amc", row.id)
    session.flush()
    return _amc_out(row)


# ── EMI (Installment Payments) ────────────────────────────────────────────────

EMI_STATUSES = {"active", "completed", "overdue", "defaulted", "cancelled"}
EMI_INSTALLMENT_STATUSES = {"pending", "paid", "overdue", "waived"}

# 10 years. Consumer-electronics financing never runs longer, and the cap bounds
# how many installment rows one request can create.
MAX_EMI_TENURE_MONTHS = 120


def _emi_out(e: "ElectronicsEmi", installments: list | None = None) -> dict[str, Any]:
    d: dict[str, Any] = {
        "id": e.id,
        "emi_no": e.emi_no,
        "sale_id": e.sale_id,
        "invoice_number": e.invoice_number,
        "customer_id": e.customer_id,
        "customer_name": e.customer_name,
        "customer_phone": e.customer_phone,
        "product_name": e.product_name,
        "serial_imei": e.serial_imei,
        "bank_financier": e.bank_financier,
        "tenure_months": e.tenure_months,
        "principal_amount": e.principal_amount,
        "down_payment": e.down_payment,
        "processing_fee": e.processing_fee,
        "interest_rate": e.interest_rate,
        "monthly_amount": e.monthly_amount,
        "total_payable": e.total_payable,
        "total_collected": e.total_collected,
        "status": e.status,
        "first_due_date": e.first_due_date.isoformat() if e.first_due_date else None,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }
    if installments is not None:
        d["installments"] = installments
    return d


def _installment_out(inst: "ElectronicsEmiInstallment") -> dict[str, Any]:
    return {
        "id": inst.id,
        "emi_id": inst.emi_id,
        "installment_no": inst.installment_no,
        "due_date": inst.due_date.isoformat() if inst.due_date else None,
        "amount": inst.amount,
        "paid_date": inst.paid_date.isoformat() if inst.paid_date else None,
        "paid_amount": inst.paid_amount,
        "status": inst.status,
        "collected_by": inst.collected_by,
        "payment_method": inst.payment_method,
        "reference_no": inst.reference_no,
    }


def list_emi(
    session: Session,
    company_id: str,
    *,
    status: str | None = None,
    q: str | None = None,
    limit: int = DEFAULT_PAGE_LIMIT,
    offset: int = 0,
) -> list[dict[str, Any]]:
    from app.models.industry import ElectronicsEmi, ElectronicsEmiInstallment
    stmt = select(ElectronicsEmi).where(ElectronicsEmi.company_id == company_id)
    if status:
        stmt = stmt.where(ElectronicsEmi.status == status)
    q_term = (q or "").strip()
    if q_term:
        stmt = stmt.where(
            _search(
                q_term,
                ElectronicsEmi.emi_no,
                ElectronicsEmi.customer_name,
                ElectronicsEmi.serial_imei,
                ElectronicsEmi.invoice_number,
            )
        )
    stmt = _paginate(stmt.order_by(ElectronicsEmi.created_at.desc()), limit, offset)  # type: ignore[attr-defined]
    matched = list(session.exec(stmt).all())

    # Per-status installment counts in one grouped query. The list deliberately
    # does not carry the installment rows themselves — callers that need the
    # schedule fetch it per agreement via get_emi_schedule — but the registry
    # needs these counts to report overdue/paid progress without an N+1.
    counts: dict[str, dict[str, int]] = {}
    if matched:
        ids = [e.id for e in matched]
        count_rows = session.exec(
            select(
                ElectronicsEmiInstallment.emi_id,
                ElectronicsEmiInstallment.status,
                func.count(),
            )
            .where(ElectronicsEmiInstallment.emi_id.in_(ids))  # type: ignore[attr-defined]
            .group_by(ElectronicsEmiInstallment.emi_id, ElectronicsEmiInstallment.status)  # type: ignore[attr-defined]
        ).all()
        for emi_id, inst_status, n in count_rows:
            counts.setdefault(emi_id, {})[inst_status] = n

    out = []
    for e in matched:
        by_status = counts.get(e.id, {})
        d = _emi_out(e)
        d["installment_counts"] = by_status
        d["installment_total"] = sum(by_status.values())
        d["installment_paid"] = by_status.get("paid", 0)
        d["installment_overdue"] = by_status.get("overdue", 0)
        d["installment_pending"] = by_status.get("pending", 0)
        out.append(d)
    return out


def create_emi(
    session: Session,
    auth: AuthContext,
    body: dict[str, Any],
) -> dict[str, Any]:
    from app.models.industry import ElectronicsEmi, ElectronicsEmiInstallment
    principal = _num(body.get("principal_amount"), "principal_amount")
    down = _num(body.get("down_payment"), "down_payment")
    fee = _num(body.get("processing_fee"), "processing_fee")
    rate = _num(body.get("interest_rate"), "interest_rate")
    tenure = int(_num(body.get("tenure_months"), "tenure_months", default=12))
    if tenure <= 0:
        raise HTTPException(status_code=400, detail="tenure_months must be > 0")
    # Each month materialises an installment row, so an unbounded tenure lets a
    # single request write millions of rows.
    if tenure > MAX_EMI_TENURE_MONTHS:
        raise HTTPException(
            status_code=400,
            detail=f"tenure_months must not exceed {MAX_EMI_TENURE_MONTHS}",
        )
    if principal <= 0:
        raise HTTPException(status_code=400, detail="principal_amount required")
    if down < 0:
        raise HTTPException(status_code=400, detail="down_payment cannot be negative")
    # Without this the financed balance goes negative and every installment is
    # billed as a negative amount.
    if down >= principal:
        raise HTTPException(status_code=400, detail="down_payment must be less than principal_amount")
    if fee < 0:
        raise HTTPException(status_code=400, detail="processing_fee cannot be negative")
    if rate < 0:
        raise HTTPException(status_code=400, detail="interest_rate cannot be negative")
    # Financed balance, then the level installment against it.
    financed = principal - down + fee
    if rate > 0:
        monthly_rate = rate / 100 / 12
        monthly = financed * (monthly_rate * (1 + monthly_rate) ** tenure) / ((1 + monthly_rate) ** tenure - 1)
    else:
        monthly = financed / tenure
    monthly = round(monthly, 2)

    # total_payable is what the customer actually repays across the schedule.
    # It previously stored the financed balance even on interest-bearing plans,
    # where the installments sum to financed + interest — so the
    # `total_collected >= total_payable` completion check closed the agreement
    # with real installments still outstanding, the same write-off as the
    # double-counted down payment.
    payable = round(monthly * tenure, 2) if rate > 0 else round(financed, 2)
    # The final installment absorbs the rounding residue so the schedule sums to
    # `payable` exactly rather than drifting a few paisa off it.
    final_monthly = round(payable - monthly * (tenure - 1), 2)

    first_due = _add_months(_utc_now(), 1)
    if body.get("first_due_date"):
        try:
            first_due = datetime.fromisoformat(str(body["first_due_date"]).replace("Z", "+00:00"))
        except ValueError:
            pass

    row = ElectronicsEmi(
        company_id=auth.company_id,
        store_id=auth.store_id,
        emi_no=_next_no(session, auth.company_id, "EMI", ElectronicsEmi, "emi_no"),
        sale_id=body.get("sale_id"),
        invoice_number=body.get("invoice_number"),
        customer_id=body.get("customer_id"),
        customer_name=str(body.get("customer_name") or ""),
        customer_phone=body.get("customer_phone"),
        product_name=str(body.get("product_name") or ""),
        serial_imei=body.get("serial_imei"),
        bank_financier=str(body.get("bank_financier") or ""),
        tenure_months=tenure,
        principal_amount=principal,
        down_payment=down,
        processing_fee=fee,
        interest_rate=rate,
        monthly_amount=monthly,
        total_payable=payable,
        # Collection starts at zero. Seeding this with the down payment counted it
        # twice — the down payment is captured on the sale, not on the schedule —
        # and tripped the `collected >= payable` completion check several
        # installments early, closing agreements while money was still owed.
        total_collected=0.0,
        status="active",
        first_due_date=first_due,
    )
    session.add(row)
    session.flush()

    # Generate installment schedule
    for i in range(1, tenure + 1):
        due = _add_months(first_due, i - 1)
        inst = ElectronicsEmiInstallment(
            emi_id=row.id,
            company_id=auth.company_id,
            installment_no=i,
            due_date=due,
            amount=final_monthly if i == tenure else monthly,
            status="pending",
        )
        session.add(inst)

    write_audit(session, auth, "emi_create", "electronics_emi", row.id)
    session.flush()
    return _emi_out(row)


def get_emi_schedule(
    session: Session,
    auth: AuthContext,
    emi_id: str,
) -> dict[str, Any]:
    from app.models.industry import ElectronicsEmi, ElectronicsEmiInstallment
    emi = session.get(ElectronicsEmi, emi_id)
    if not emi or emi.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="EMI not found")
    inst_stmt = select(ElectronicsEmiInstallment).where(
        ElectronicsEmiInstallment.emi_id == emi_id
    ).order_by(ElectronicsEmiInstallment.installment_no)  # type: ignore[attr-defined]
    insts = session.exec(inst_stmt).all()
    return _emi_out(emi, installments=[_installment_out(i) for i in insts])


def update_emi_status(
    session: Session,
    auth: AuthContext,
    emi_id: str,
    body: dict[str, Any],
) -> dict[str, Any]:
    from app.models.industry import ElectronicsEmi
    emi = session.get(ElectronicsEmi, emi_id)
    if not emi or emi.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="EMI not found")
    new_status = str(body.get("status") or "").strip()
    if new_status and new_status not in EMI_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid EMI status: {new_status}")
    if new_status:
        emi.status = new_status
    session.add(emi)
    write_audit(session, auth, "emi_status_update", "electronics_emi", emi_id)
    session.flush()
    return _emi_out(emi)


def collect_installment(
    session: Session,
    auth: AuthContext,
    emi_id: str,
    installment_id: str,
    body: dict[str, Any],
) -> dict[str, Any]:
    from app.models.industry import ElectronicsEmi, ElectronicsEmiInstallment
    emi = session.get(ElectronicsEmi, emi_id)
    if not emi or emi.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="EMI not found")
    inst = session.get(ElectronicsEmiInstallment, installment_id)
    if not inst or inst.emi_id != emi_id:
        raise HTTPException(status_code=404, detail="Installment not found")
    if inst.status == "paid":
        raise HTTPException(status_code=400, detail="Installment already paid")
    paid_amount = _num(body.get("paid_amount"), "paid_amount", default=inst.amount)
    # Previously any amount was accepted, so a single crafted call could settle a
    # whole agreement (or bank a negative payment) from one installment.
    if paid_amount <= 0:
        raise HTTPException(status_code=400, detail="paid_amount must be greater than 0")
    # The installment status enum has no "partial" state, so a short payment could
    # only ever be recorded as fully paid — silently writing off the remainder.
    # Until partial settlement is modelled, collection is all-or-nothing.
    if round(paid_amount, 2) != round(inst.amount, 2):
        raise HTTPException(
            status_code=400,
            detail=f"paid_amount must equal the installment amount ({round(inst.amount, 2)})",
        )
    inst.status = "paid"
    inst.paid_date = _utc_now()
    inst.paid_amount = paid_amount
    inst.collected_by = body.get("collected_by") or auth.user_id
    inst.payment_method = body.get("payment_method", "cash")
    inst.reference_no = body.get("reference_no")
    session.add(inst)
    # Update running total
    emi.total_collected = round(emi.total_collected + paid_amount, 2)
    if emi.total_collected >= emi.total_payable:
        emi.status = "completed"
    session.add(emi)
    write_audit(session, auth, "emi_installment_collect", "electronics_emi", emi_id,
                {"installment_no": inst.installment_no, "paid_amount": paid_amount})
    session.flush()
    return _installment_out(inst)
