"""Restaurant vertical — tables, orders, KOT/KDS, billing via sales engine."""

from __future__ import annotations

import json
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import update
from sqlmodel import Session, select

from app.inventory.locking import for_update as with_row_lock
from app.dependencies import AuthContext, write_audit
from app.models.base import new_uuid
from app.models.config_engine import NumberSeries
from app.models.industry import (
    RestaurantCombo,
    RestaurantComboItem,
    RestaurantKot,
    RestaurantKotLine,
    RestaurantOrder,
    RestaurantOrderLine,
    RestaurantTable,
)
from app.models.core import UserAccount
from app.models.product import Product
from app.rbac import role_has_permission
from app.schemas.commerce import PaymentLineIn, SaleCreate, SaleLineIn

ACTIVE_ORDER_STATUSES = {
    "draft",
    "open",
    "sent_to_kitchen",
    "partially_ready",
    "ready",
    "served",
    "billed",
}
CLOSED_ORDER_STATUSES = {"paid", "cancelled"}
KOT_TRANSITIONS: dict[str, set[str]] = {
    "sent": {"accepted", "preparing", "cancelled"},
    "accepted": {"preparing", "cancelled"},
    "preparing": {"ready", "cancelled"},
    "ready": {"served", "cancelled"},
    "served": set(),
    "cancelled": set(),
    "pending": {"sent", "accepted", "preparing", "cancelled"},  # legacy seed
}
SERVICE_MODES = {"dine_in", "takeaway", "delivery"}
TABLE_STATUSES = {"available", "occupied", "reserved", "cleaning", "disabled"}
MIN_TABLE_CAPACITY = 1
MAX_TABLE_CAPACITY = 50


def _parse_capacity(raw: Any, *, default: int = 4) -> int:
    """Validate seat count. The endpoints take raw dicts, so nothing else does.

    Without this, ``int("four")`` surfaced as an unhandled 500 and a negative
    capacity was stored verbatim.
    """
    if raw is None or raw == "":
        return default
    try:
        capacity = int(raw)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="capacity must be a whole number")
    if not MIN_TABLE_CAPACITY <= capacity <= MAX_TABLE_CAPACITY:
        raise HTTPException(
            status_code=400,
            detail=f"capacity must be between {MIN_TABLE_CAPACITY} and {MAX_TABLE_CAPACITY}",
        )
    return capacity


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _configured_rate(
    session: Session,
    auth: AuthContext,
    store_id: Optional[str],
    policy_key: str,
    default: float,
) -> float:
    """Read a billing rate from store configuration rather than the request body."""
    from app.services.sales_policy_service import _get_store_policy

    raw = _get_store_policy(session, auth.company_id, store_id, policy_key, str(default))
    try:
        return float(raw)
    except (TypeError, ValueError):
        return default


def _require(auth: AuthContext, code: str) -> None:
    if not role_has_permission(auth.role_code, code):
        raise HTTPException(status_code=403, detail=f"Missing permission: {code}")


def _next_no(session: Session, company_id: str, prefix: str, series_code: str) -> str:
    """Allocate the next restaurant document number atomically.

    This used to be ``f"{prefix}-{len(rows) + 1:06d}"`` over every row for the
    company, which had three faults: two tills opening an order at the same moment
    both read the same count and were issued the SAME order number; deleting an
    old row made the next allocation reuse a number; and it loaded the entire
    table into memory on every single order and KOT.

    A single UPDATE ... SET next_number = next_number + 1 takes an exclusive row
    lock for the life of the transaction, so concurrent callers serialise on it.
    Mirrors sales_service._next_invoice_number.
    """
    ns = session.exec(
        select(NumberSeries).where(
            NumberSeries.company_id == company_id,
            NumberSeries.series_code == series_code,
        )
    ).first()
    if not ns:
        ns = NumberSeries(company_id=company_id, series_code=series_code, prefix=prefix, next_number=1)
        session.add(ns)
        session.flush()

    resolved_prefix = ns.prefix or prefix
    session.execute(
        update(NumberSeries)
        .where(
            NumberSeries.company_id == company_id,
            NumberSeries.series_code == series_code,
        )
        .values(next_number=NumberSeries.next_number + 1)
    )
    # Re-read our own uncommitted increment; the row lock above guarantees no
    # other transaction can be between the update and this read.
    session.refresh(ns)
    return f"{resolved_prefix}-{ns.next_number - 1:06d}"


def _table_or_404(
    session: Session,
    company_id: str,
    table_id: str,
    *,
    for_update: bool = False,
) -> RestaurantTable:
    stmt = select(RestaurantTable).where(RestaurantTable.id == table_id)
    if for_update:
        stmt = with_row_lock(session, stmt)
    row = session.exec(stmt).first()
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Table not found")
    return row


def _order_or_404(session: Session, company_id: str, order_id: str) -> RestaurantOrder:
    row = session.get(RestaurantOrder, order_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Order not found")
    return row


def _kot_or_404(session: Session, company_id: str, kot_id: str) -> RestaurantKot:
    row = session.get(RestaurantKot, kot_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="KOT not found")
    return row


def _recalc_order_totals(session: Session, order: RestaurantOrder) -> None:
    lines = session.exec(
        select(RestaurantOrderLine).where(RestaurantOrderLine.order_id == order.id)
    ).all()
    subtotal = 0.0
    active_lines_count = 0
    for line in lines:
        active_qty = max(0.0, float(line.qty) - float(line.cancelled_qty or 0))
        line.line_total = round(active_qty * (float(line.unit_price) + float(line.modifier_price)), 2)
        subtotal += line.line_total
        if active_qty > 0:
            active_lines_count += 1
    order.subtotal = round(subtotal, 2)
    taxable = max(0.0, order.subtotal - float(order.discount or 0) + float(order.service_charge or 0))
    # tax already stored if set by bill; keep proportional default 5% when zero and billed later
    if order.tax and order.status in CLOSED_ORDER_STATUSES | {"billed", "paid"}:
        pass
    order.total = round(taxable + float(order.tax or 0), 2)

    # When all items in an order are deleted/voided, release table and mark order cancelled
    if len(lines) > 0 and active_lines_count == 0:
        if order.status not in CLOSED_ORDER_STATUSES:
            order.status = "cancelled"
        if order.table_id:
            table = session.get(RestaurantTable, order.table_id)
            if table and table.company_id == order.company_id:
                _release_table(table)
                session.add(table)


def _serialize_line(line: RestaurantOrderLine) -> dict[str, Any]:
    mods = []
    if line.modifiers_json:
        try:
            mods = json.loads(line.modifiers_json)
        except json.JSONDecodeError:
            mods = [line.modifiers_json]
    unsent = max(0.0, float(line.ordered_qty) - float(line.sent_to_kitchen_qty) - float(line.cancelled_qty or 0))
    return {
        "id": line.id,
        "order_id": line.order_id,
        "product_id": line.product_id,
        "sku": line.sku,
        "product_name": line.product_name,
        "qty": line.qty,
        "unit_price": line.unit_price,
        "modifier_price": line.modifier_price,
        "line_total": line.line_total,
        "modifiers": mods,
        "notes": line.notes,
        "kitchen_station": line.kitchen_station,
        "ordered_qty": line.ordered_qty,
        "sent_to_kitchen_qty": line.sent_to_kitchen_qty,
        "prepared_qty": line.prepared_qty,
        "served_qty": line.served_qty,
        "cancelled_qty": line.cancelled_qty,
        "unsent_qty": unsent,
        "status": line.status,
        "void_reason": line.void_reason,
        # Set on every component of a combo so the cart can show one bundle
        # rather than loose discounted dishes the cashier cannot explain.
        "combo_group_id": line.combo_group_id,
        "combo_name": line.combo_name,
    }


def _serialize_order(session: Session, order: RestaurantOrder) -> dict[str, Any]:
    lines = session.exec(
        select(RestaurantOrderLine).where(RestaurantOrderLine.order_id == order.id)
    ).all()
    table_no = None
    if order.table_id:
        table = session.get(RestaurantTable, order.table_id)
        table_no = table.table_no if table else None
    return {
        "id": order.id,
        "order_no": order.order_no,
        "company_id": order.company_id,
        "store_id": order.store_id,
        "service_mode": order.service_mode,
        "table_id": order.table_id,
        "table_no": table_no,
        "customer_id": order.customer_id,
        "guest_count": order.guest_count,
        "waiter_id": order.waiter_id,
        "waiter_name": order.waiter_name,
        "delivery_address": order.delivery_address,
        "delivery_phone": order.delivery_phone,
        "special_instruction": order.special_instruction,
        "status": order.status,
        "subtotal": order.subtotal,
        "discount": order.discount,
        "service_charge": order.service_charge,
        "tax": order.tax,
        "total": order.total,
        "sales_invoice_id": order.sales_invoice_id,
        "cancelled_reason": order.cancelled_reason,
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "updated_at": order.updated_at.isoformat() if order.updated_at else None,
        "lines": [_serialize_line(l) for l in lines],
    }


def _serialize_table(session: Session, table: RestaurantTable) -> dict[str, Any]:
    if _reconcile_stale_table(session, table):
        session.add(table)
    order_total = None
    order_no = None
    if table.current_order_id:
        order = session.get(RestaurantOrder, table.current_order_id)
        if order and order.company_id == table.company_id and order.status not in CLOSED_ORDER_STATUSES:
            order_total = order.total
            order_no = order.order_no
    occupied_mins = None
    if table.occupied_since:
        ts = table.occupied_since
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        occupied_mins = int((_utc_now() - ts).total_seconds() // 60)
    return {
        "id": table.id,
        "table_no": table.table_no,
        "table_name": table.table_name or table.table_no,
        "floor_or_zone": table.floor_or_zone,
        "capacity": table.capacity,
        "status": table.status,
        "current_order_id": table.current_order_id,
        "current_order_no": order_no,
        "current_order_total": order_total,
        "current_guest_count": table.current_guest_count,
        "occupied_since": table.occupied_since.isoformat() if table.occupied_since else None,
        "occupied_minutes": occupied_mins,
        "assigned_waiter_id": table.assigned_waiter_id,
        "is_active": table.is_active if table.is_active is not None else True,
        "store_id": table.store_id,
    }


def _serialize_kot(session: Session, kot: RestaurantKot) -> dict[str, Any]:
    lines = session.exec(select(RestaurantKotLine).where(RestaurantKotLine.kot_id == kot.id)).all()
    table_no = None
    if kot.table_id:
        table = session.get(RestaurantTable, kot.table_id)
        table_no = table.table_no if table else None
    order_no = None
    if kot.order_id:
        order = session.get(RestaurantOrder, kot.order_id)
        order_no = order.order_no if order else None
    elapsed = None
    if kot.created_at:
        ts = kot.created_at
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        elapsed = int((_utc_now() - ts).total_seconds() // 60)
    # The KDS shows who fired the ticket. sent_by is a user id, so resolve it to a
    # name here; session.get serves repeat waiters from the identity map, so a
    # board full of tickets from one waiter costs a single query.
    sent_by_name = None
    if kot.sent_by:
        user = session.get(UserAccount, kot.sent_by)
        if user:
            sent_by_name = user.full_name or user.username
    return {
        "id": kot.id,
        "kot_number": kot.kot_number,
        "order_id": kot.order_id,
        "order_no": order_no,
        "table_id": kot.table_id,
        "table_no": table_no,
        "service_mode": kot.service_mode,
        "kitchen_station": kot.kitchen_station,
        "status": kot.status,
        "sent_by": kot.sent_by,
        "sent_by_name": sent_by_name,
        "store_id": kot.store_id,
        "created_at": kot.created_at.isoformat() if kot.created_at else None,
        "elapsed_minutes": elapsed,
        "lines": [
            {
                "id": ln.id,
                "order_line_id": ln.order_line_id,
                "product_id": ln.product_id,
                "product_name": ln.product_name,
                "qty": ln.qty,
                "modifiers": json.loads(ln.modifiers_json) if ln.modifiers_json else [],
                "notes": ln.notes,
                "kitchen_station": ln.kitchen_station,
                "status": ln.status or kot.status,
            }
            for ln in lines
        ],
    }


def _occupy_table(table: RestaurantTable, order: RestaurantOrder) -> None:
    table.status = "occupied"
    table.current_order_id = order.id
    table.current_guest_count = order.guest_count
    table.occupied_since = _utc_now()
    if order.waiter_id:
        table.assigned_waiter_id = order.waiter_id


def _release_table(table: RestaurantTable, *, to_status: str = "available") -> None:
    table.status = to_status
    table.current_order_id = None
    table.current_guest_count = None
    table.occupied_since = None
    table.assigned_waiter_id = None


def _reconcile_stale_table(session: Session, table: RestaurantTable) -> bool:
    """Release a table whose status is occupied without an active non-empty order."""
    if not table.current_order_id:
        if table.status == "occupied":
            _release_table(table)
            return True
        return False
    order = session.get(RestaurantOrder, table.current_order_id)
    if not order or order.company_id != table.company_id or order.status in CLOSED_ORDER_STATUSES:
        _release_table(table)
        return True

    lines = session.exec(
        select(RestaurantOrderLine).where(RestaurantOrderLine.order_id == order.id)
    ).all()
    active_lines = [
        l for l in lines
        if float(l.qty or 0) > float(l.cancelled_qty or 0) and str(l.status) != "cancelled"
    ]

    # If order HAD lines and all lines were cancelled/voided:
    if len(lines) > 0 and not active_lines:
        if order.status not in CLOSED_ORDER_STATUSES:
            order.status = "cancelled"
            session.add(order)
        _release_table(table)
        return True

    # If order has 0 lines and is older than 10 minutes (abandoned draft order from a past session):
    if len(lines) == 0:
        order_age_mins = 0
        if order.created_at:
            ts = order.created_at
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            order_age_mins = int((_utc_now() - ts).total_seconds() // 60)
        if order_age_mins > 10:
            if order.status not in CLOSED_ORDER_STATUSES:
                order.status = "cancelled"
                session.add(order)
            _release_table(table)
            return True

    return False


def _refresh_order_kitchen_status(session: Session, order: RestaurantOrder) -> None:
    if order.status in CLOSED_ORDER_STATUSES | {"billed"}:
        return
    lines = [
        l
        for l in session.exec(select(RestaurantOrderLine).where(RestaurantOrderLine.order_id == order.id)).all()
        if float(l.cancelled_qty or 0) < float(l.ordered_qty)
    ]
    if not lines:
        return
    all_sent = all(float(l.sent_to_kitchen_qty) >= float(l.ordered_qty) - float(l.cancelled_qty or 0) for l in lines)
    any_sent = any(float(l.sent_to_kitchen_qty) > 0 for l in lines)
    all_ready = all(float(l.prepared_qty) >= float(l.sent_to_kitchen_qty) and float(l.sent_to_kitchen_qty) > 0 for l in lines if float(l.sent_to_kitchen_qty) > 0)
    any_ready = any(float(l.prepared_qty) > 0 for l in lines)
    all_served = all(float(l.served_qty) >= float(l.sent_to_kitchen_qty) and float(l.sent_to_kitchen_qty) > 0 for l in lines if float(l.sent_to_kitchen_qty) > 0)
    if all_served and any_sent:
        order.status = "served"
    elif all_ready and any_sent:
        order.status = "ready"
    elif any_ready and any_sent:
        order.status = "partially_ready"
    elif all_sent:
        order.status = "sent_to_kitchen"
    elif any_sent:
        order.status = "sent_to_kitchen"
    elif order.status == "draft":
        order.status = "open"


# --- Tables ---

def list_tables(
    session: Session,
    auth: AuthContext,
    *,
    store_id: Optional[str] = None,
    zone: Optional[str] = None,
    status: Optional[str] = None,
) -> list[dict[str, Any]]:
    q = select(RestaurantTable).where(RestaurantTable.company_id == auth.company_id)
    if store_id:
        q = q.where(RestaurantTable.store_id == store_id)
    if zone:
        q = q.where(RestaurantTable.floor_or_zone == zone)
    rows = session.exec(q).all()
    # Self-heal before filtering: a stale pointer would otherwise keep the table
    # in "occupied" forever and hide it from a status="available" query.
    healed = False
    for row in rows:
        if _reconcile_stale_table(session, row):
            session.add(row)
            healed = True
    if healed:
        session.commit()
    if status:
        rows = [r for r in rows if r.status == status]
    return [_serialize_table(session, r) for r in rows if r.is_active is not False]


def create_table(session: Session, auth: AuthContext, body: dict) -> dict[str, Any]:
    _require(auth, "restaurant.table_manage")
    store_id = body.get("store_id") or auth.store_id
    if not store_id:
        raise HTTPException(status_code=400, detail="store_id required")
    table_no = str(body.get("table_no") or body.get("table_code") or "").strip()
    if not table_no:
        raise HTTPException(status_code=400, detail="table_no required")
    existing = session.exec(
        select(RestaurantTable).where(
            RestaurantTable.company_id == auth.company_id,
            RestaurantTable.store_id == store_id,
            RestaurantTable.table_no == table_no,
        )
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Table code already exists in this store")
    row = RestaurantTable(
        company_id=auth.company_id,
        store_id=store_id,
        table_no=table_no,
        table_name=body.get("table_name") or table_no,
        floor_or_zone=body.get("floor_or_zone") or body.get("zone"),
        capacity=_parse_capacity(body.get("capacity")),
        status="available",
        is_active=True,
    )
    session.add(row)
    write_audit(session, auth, "restaurant_table_create", "restaurant_table", row.id, detail={"table_no": table_no})
    session.commit()
    session.refresh(row)
    return _serialize_table(session, row)


def update_table(session: Session, auth: AuthContext, table_id: str, body: dict) -> dict[str, Any]:
    _require(auth, "restaurant.table_manage")
    row = _table_or_404(session, auth.company_id, table_id)
    before = {"status": row.status, "capacity": row.capacity}
    if "table_name" in body:
        row.table_name = body["table_name"]
    if "floor_or_zone" in body or "zone" in body:
        row.floor_or_zone = body.get("floor_or_zone") or body.get("zone")
    if "capacity" in body:
        row.capacity = _parse_capacity(body["capacity"], default=row.capacity)
    if "is_active" in body:
        row.is_active = bool(body["is_active"])
    if "status" in body:
        status = str(body["status"])
        if status not in TABLE_STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid table status: {status}")
        if status == "occupied" and not row.current_order_id:
            raise HTTPException(status_code=400, detail="Cannot mark occupied without an active order")
        if status == "available" and row.current_order_id:
            raise HTTPException(status_code=400, detail="Close or move the active order before freeing the table")
        if status == "disabled" and row.current_order_id:
            raise HTTPException(status_code=400, detail="Cannot disable a table with an active order")
        row.status = status
    write_audit(
        session,
        auth,
        "restaurant_table_update",
        "restaurant_table",
        row.id,
        detail={"before": before, "after": {"status": row.status, "capacity": row.capacity}},
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _serialize_table(session, row)


def delete_table(session: Session, auth: AuthContext, table_id: str) -> dict[str, Any]:
    _require(auth, "restaurant.table_manage")
    row = _table_or_404(session, auth.company_id, table_id)
    if row.current_order_id:
        raise HTTPException(status_code=400, detail="Cannot delete a table with an active order")
    table_name = row.table_name or row.table_no
    write_audit(
        session,
        auth,
        "restaurant_table_delete",
        "restaurant_table",
        row.id,
        detail={"table_no": row.table_no, "table_name": row.table_name},
    )
    session.delete(row)
    session.commit()
    return {"message": f"Table {table_name} deleted successfully"}


# --- Orders ---

def list_orders(
    session: Session,
    auth: AuthContext,
    *,
    status: Optional[str] = None,
    active_only: bool = False,
    table_id: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
) -> list[dict[str, Any]]:
    q = select(RestaurantOrder).where(RestaurantOrder.company_id == auth.company_id)
    if status:
        q = q.where(RestaurantOrder.status == status)
    if table_id:
        q = q.where(RestaurantOrder.table_id == table_id)
    # active_only used to load every order the company had ever taken and filter in
    # Python, so the endpoint got slower every service.
    if active_only:
        q = q.where(RestaurantOrder.status.in_(tuple(ACTIVE_ORDER_STATUSES)))
    q = q.order_by(RestaurantOrder.created_at.desc()).offset(max(0, offset)).limit(max(1, min(limit, 500)))
    return [_serialize_order(session, r) for r in session.exec(q).all()]


def get_order(session: Session, auth: AuthContext, order_id: str) -> dict[str, Any]:
    return _serialize_order(session, _order_or_404(session, auth.company_id, order_id))


def create_order(session: Session, auth: AuthContext, body: dict) -> dict[str, Any]:
    _require(auth, "restaurant.order_manage")
    service_mode = str(body.get("service_mode") or "dine_in").lower().replace("-", "_").replace(" ", "_")
    if service_mode not in SERVICE_MODES:
        raise HTTPException(status_code=400, detail=f"Invalid service_mode: {service_mode}")
    store_id = body.get("store_id") or auth.store_id
    if not store_id:
        raise HTTPException(status_code=400, detail="store_id required")
    table_id = body.get("table_id")
    table: Optional[RestaurantTable] = None
    if service_mode == "dine_in":
        if not table_id:
            raise HTTPException(status_code=400, detail="table_id required for dine-in")
        table = _table_or_404(session, auth.company_id, table_id, for_update=True)
        if table.store_id != store_id:
            raise HTTPException(status_code=400, detail="Table belongs to a different store")
        if table.status == "disabled" or table.is_active is False:
            raise HTTPException(status_code=400, detail="Table is disabled")
        if table.current_order_id:
            raise HTTPException(status_code=409, detail="Table already has an active order")
        if table.status == "occupied":
            raise HTTPException(status_code=409, detail="Table is occupied")
    elif table_id:
        table = _table_or_404(session, auth.company_id, table_id)

    if service_mode == "delivery":
        if not (body.get("delivery_address") and body.get("delivery_phone")):
            raise HTTPException(status_code=400, detail="delivery_address and delivery_phone required for delivery")

    guest_count = int(body.get("guest_count") or 1)
    if guest_count < 1:
        raise HTTPException(status_code=400, detail="guest_count must be >= 1")

    order = RestaurantOrder(
        company_id=auth.company_id,
        store_id=store_id,
        order_no=_next_no(session, auth.company_id, "RO", "RESTAURANT_ORDER"),
        service_mode=service_mode,
        table_id=table.id if table else None,
        customer_id=body.get("customer_id"),
        guest_count=guest_count,
        waiter_id=body.get("waiter_id"),
        waiter_name=body.get("waiter_name"),
        delivery_address=body.get("delivery_address"),
        delivery_phone=body.get("delivery_phone"),
        special_instruction=body.get("special_instruction"),
        status="open",
        created_by=auth.user_id,
    )
    session.add(order)
    session.flush()
    if table and service_mode == "dine_in":
        _occupy_table(table, order)
        session.add(table)
    write_audit(
        session,
        auth,
        "restaurant_order_create",
        "restaurant_order",
        order.id,
        detail={"order_no": order.order_no, "service_mode": service_mode, "table_id": order.table_id},
    )
    session.commit()
    session.refresh(order)
    return _serialize_order(session, order)


def add_order_line(session: Session, auth: AuthContext, order_id: str, body: dict) -> dict[str, Any]:
    _require(auth, "restaurant.order_manage")
    order = _order_or_404(session, auth.company_id, order_id)
    if order.status in CLOSED_ORDER_STATUSES | {"billed"}:
        raise HTTPException(status_code=400, detail="Cannot add items to a closed/billed order")
    product_id = body.get("product_id")
    product = None
    if product_id:
        product = session.get(Product, product_id)
        if not product or product.company_id != auth.company_id:
            raise HTTPException(status_code=404, detail="Product not found")
    name = body.get("product_name") or (product.name if product else None)
    sku = body.get("sku") or (product.sku if product else "")
    if not name:
        raise HTTPException(status_code=400, detail="product_name or product_id required")
    qty = float(body.get("qty") or 1)
    if qty <= 0:
        raise HTTPException(status_code=400, detail="qty must be > 0")
    unit_price = float(body.get("unit_price") if body.get("unit_price") is not None else (product.base_price if product else 0))
    modifiers = body.get("modifiers") or []
    if isinstance(modifiers, str):
        modifiers = [m.strip() for m in modifiers.split(",") if m.strip()]
    modifier_price = float(body.get("modifier_price") or 0)
    # Prefer explicit modifier_price; else sum numeric prices if dict options
    if not modifier_price and modifiers and isinstance(modifiers[0], dict):
        modifier_price = sum(float(m.get("additional_price") or m.get("price") or 0) for m in modifiers)
    station = body.get("kitchen_station")
    if not station and product and product.meta_json:
        try:
            meta = json.loads(product.meta_json)
            station = meta.get("kitchen_station") or meta.get("station")
        except json.JSONDecodeError:
            pass

    # Pricing authority runs here, at order entry, rather than at settlement. A
    # cashier can still act on a rejection while the guest is ordering; once the
    # kitchen has cooked and the guest has eaten there is no honest way to refuse
    # the bill. The approved reason is stored on the line and replayed by
    # bill_and_pay_order so the guard is not asked the same question twice.
    override_reason = str(body.get("price_override_reason") or "").strip() or None
    if product is not None:
        from app.services.sales_policy_service import enforce_line_pricing

        enforce_line_pricing(
            session,
            auth,
            product=product,
            unit_price=unit_price + modifier_price,
            qty=qty,
            meta={"price_override_reason": override_reason} if override_reason else {},
            store_id=order.store_id,
            industry_pack="restaurant",
        )

    line = RestaurantOrderLine(
        order_id=order.id,
        product_id=product.id if product else product_id,
        sku=sku or "",
        product_name=name,
        qty=qty,
        unit_price=unit_price,
        modifier_price=modifier_price,
        line_total=round(qty * (unit_price + modifier_price), 2),
        modifiers_json=json.dumps(modifiers) if modifiers else None,
        notes=body.get("notes"),
        kitchen_station=station,
        ordered_qty=qty,
        sent_to_kitchen_qty=0,
        status="pending",
        price_override_reason=override_reason,
    )
    session.add(line)
    session.flush()
    _recalc_order_totals(session, order)
    if order.status == "draft":
        order.status = "open"
    session.add(order)
    write_audit(session, auth, "restaurant_order_add_line", "restaurant_order", order.id, detail={"line_id": line.id})
    session.commit()
    return _serialize_order(session, order)


def update_order_line(session: Session, auth: AuthContext, order_id: str, line_id: str, body: dict) -> dict[str, Any]:
    _require(auth, "restaurant.order_manage")
    order = _order_or_404(session, auth.company_id, order_id)
    line = session.get(RestaurantOrderLine, line_id)
    if not line or line.order_id != order.id:
        raise HTTPException(status_code=404, detail="Order line not found")
    if float(line.sent_to_kitchen_qty) > 0 and "qty" in body:
        new_qty = float(body["qty"])
        if new_qty < float(line.sent_to_kitchen_qty):
            raise HTTPException(status_code=400, detail="Cannot reduce below already-sent kitchen qty; void instead")
        line.qty = new_qty
        line.ordered_qty = new_qty
    elif "qty" in body and float(line.sent_to_kitchen_qty) == 0:
        qty = float(body["qty"])
        if qty <= 0:
            raise HTTPException(status_code=400, detail="qty must be > 0")
        line.qty = qty
        line.ordered_qty = qty
    if "notes" in body:
        line.notes = body["notes"]
    if "modifiers" in body:
        mods = body["modifiers"] or []
        line.modifiers_json = json.dumps(mods)
        if body.get("modifier_price") is not None:
            line.modifier_price = float(body["modifier_price"])
    _recalc_order_totals(session, order)
    session.add(line)
    session.add(order)
    session.commit()
    return _serialize_order(session, order)


def void_order_line(session: Session, auth: AuthContext, order_id: str, line_id: str, body: dict) -> dict[str, Any]:
    order = _order_or_404(session, auth.company_id, order_id)
    line = session.get(RestaurantOrderLine, line_id)
    if not line or line.order_id != order.id:
        raise HTTPException(status_code=404, detail="Order line not found")
    if order.status in CLOSED_ORDER_STATUSES | {"billed", "paid"}:
        raise HTTPException(status_code=400, detail="Use sales return/refund after payment")
    reason = str(body.get("reason") or "").strip()
    sent = float(line.sent_to_kitchen_qty)
    if sent > 0:
        _require(auth, "restaurant.void_item")
        if not reason:
            raise HTTPException(status_code=400, detail="reason required after kitchen send")
    else:
        _require(auth, "restaurant.order_manage")
    cancel_qty = float(body.get("qty") or line.ordered_qty)
    cancel_qty = min(cancel_qty, float(line.ordered_qty) - float(line.cancelled_qty or 0))
    line.cancelled_qty = float(line.cancelled_qty or 0) + cancel_qty
    line.void_reason = reason or line.void_reason
    if line.cancelled_qty >= line.ordered_qty:
        line.status = "cancelled"
    _recalc_order_totals(session, order)
    session.add(line)
    session.add(order)
    write_audit(
        session,
        auth,
        "restaurant_void_item",
        "restaurant_order_line",
        line.id,
        detail={"qty": cancel_qty, "reason": reason, "sent_to_kitchen": sent > 0},
    )
    session.commit()
    return _serialize_order(session, order)


def cancel_order(session: Session, auth: AuthContext, order_id: str, body: dict) -> dict[str, Any]:
    _require(auth, "restaurant.cancel_order")
    order = _order_or_404(session, auth.company_id, order_id)
    if order.status in CLOSED_ORDER_STATUSES:
        raise HTTPException(status_code=400, detail="Order already closed")
    if order.sales_invoice_id and order.status == "paid":
        raise HTTPException(status_code=400, detail="Paid orders cannot be cancelled; use returns")
    reason = str(body.get("reason") or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="reason required")
    # If any lines sent to kitchen, void permission also implied by cancel_order
    order.status = "cancelled"
    order.cancelled_reason = reason
    if order.table_id:
        table = _table_or_404(session, auth.company_id, order.table_id)
        if table.current_order_id == order.id:
            _release_table(table)
            session.add(table)
    write_audit(
        session,
        auth,
        "restaurant_order_cancel",
        "restaurant_order",
        order.id,
        detail={"reason": reason},
    )
    session.add(order)
    session.commit()
    return _serialize_order(session, order)


def send_to_kitchen(session: Session, auth: AuthContext, order_id: str, body: dict | None = None) -> dict[str, Any]:
    _require(auth, "restaurant.kot_manage")
    order = _order_or_404(session, auth.company_id, order_id)
    if order.status in CLOSED_ORDER_STATUSES | {"billed"}:
        raise HTTPException(status_code=400, detail="Cannot send kitchen tickets for closed order")
    body = body or {}
    line_ids = body.get("line_ids")  # optional filter
    lines = session.exec(
        select(RestaurantOrderLine).where(RestaurantOrderLine.order_id == order.id)
    ).all()
    to_send: list[tuple[RestaurantOrderLine, float]] = []
    for line in lines:
        if line_ids and line.id not in line_ids:
            continue
        unsent = max(0.0, float(line.ordered_qty) - float(line.sent_to_kitchen_qty) - float(line.cancelled_qty or 0))
        if unsent > 0:
            to_send.append((line, unsent))
    if not to_send:
        raise HTTPException(status_code=400, detail="No unsent items to send to kitchen")

    # Group by kitchen station for separate KOTs when stations differ
    by_station: dict[str, list[tuple[RestaurantOrderLine, float]]] = {}
    for line, qty in to_send:
        station = line.kitchen_station or "main"
        by_station.setdefault(station, []).append((line, qty))

    created_kots = []
    for station, items in by_station.items():
        kot = RestaurantKot(
            company_id=auth.company_id,
            store_id=order.store_id,
            order_id=order.id,
            table_id=order.table_id,
            service_mode=order.service_mode,
            kitchen_station=station,
            kot_number=_next_no(session, auth.company_id, "KOT", "RESTAURANT_KOT"),
            sent_by=auth.user_id,
            status="sent",
        )
        session.add(kot)
        session.flush()
        for line, qty in items:
            session.add(
                RestaurantKotLine(
                    kot_id=kot.id,
                    order_line_id=line.id,
                    product_id=line.product_id,
                    product_name=line.product_name,
                    qty=qty,
                    modifiers_json=line.modifiers_json,
                    notes=line.notes,
                    kitchen_station=station,
                    status="sent",
                )
            )
            line.sent_to_kitchen_qty = float(line.sent_to_kitchen_qty) + qty
            line.status = "sent"
            session.add(line)
        created_kots.append(kot.id)
        write_audit(
            session,
            auth,
            "restaurant_kot_create",
            "restaurant_kot",
            kot.id,
            detail={"kot_number": kot.kot_number, "order_id": order.id, "station": station},
        )

    _refresh_order_kitchen_status(session, order)
    session.add(order)
    session.commit()
    return {
        "order": _serialize_order(session, order),
        "kot_ids": created_kots,
        "kots": [get_kot(session, auth, kid) for kid in created_kots],
    }


def move_table(session: Session, auth: AuthContext, order_id: str, body: dict) -> dict[str, Any]:
    _require(auth, "restaurant.table_manage")
    order = _order_or_404(session, auth.company_id, order_id)
    if order.service_mode != "dine_in":
        raise HTTPException(status_code=400, detail="Only dine-in orders can move tables")
    if order.status in CLOSED_ORDER_STATUSES:
        raise HTTPException(status_code=400, detail="Cannot move a closed order")
    dest_id = body.get("destination_table_id") or body.get("table_id")
    if not dest_id:
        raise HTTPException(status_code=400, detail="destination_table_id required")
    # Lock the destination for the rest of the transaction: without it two waiters
    # moving different orders onto the same free table both passed the
    # availability check below and the second silently overwrote the first.
    dest = _table_or_404(session, auth.company_id, dest_id, for_update=True)
    if dest.store_id != order.store_id:
        raise HTTPException(status_code=400, detail="Destination table must be in the same store")
    if dest.status == "disabled" or dest.is_active is False:
        raise HTTPException(status_code=400, detail="Destination table is disabled")
    if dest.current_order_id or dest.status == "occupied":
        raise HTTPException(status_code=409, detail="Destination table is not available")
    source_id = order.table_id
    source = _table_or_404(session, auth.company_id, source_id) if source_id else None
    if source:
        _release_table(source)
        session.add(source)
    order.table_id = dest.id
    _occupy_table(dest, order)
    session.add(dest)
    session.add(order)
    write_audit(
        session,
        auth,
        "restaurant_move_table",
        "restaurant_order",
        order.id,
        detail={"before": {"table_id": source_id}, "after": {"table_id": dest.id}},
    )
    session.commit()
    return _serialize_order(session, order)


# --- KOT / KDS ---

def list_kots(
    session: Session,
    auth: AuthContext,
    *,
    status: Optional[str] = None,
    station: Optional[str] = None,
    order_id: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
) -> list[dict[str, Any]]:
    q = select(RestaurantKot).where(RestaurantKot.company_id == auth.company_id)
    if status:
        q = q.where(RestaurantKot.status == status)
    if station:
        q = q.where(RestaurantKot.kitchen_station == station)
    if order_id:
        q = q.where(RestaurantKot.order_id == order_id)
    elif not status:
        # Exclude tickets older than 24h from active KDS unless specifically filtered
        cutoff = _utc_now() - timedelta(hours=24)
        q = q.where(RestaurantKot.created_at >= cutoff)

    q = q.order_by(RestaurantKot.created_at.desc()).offset(max(0, offset)).limit(max(1, min(limit, 500)))
    raw_kots = session.exec(q).all()

    # Exclude tickets whose underlying order has been paid or cancelled
    valid_kots = []
    for kot in raw_kots:
        if kot.order_id:
            order = session.get(RestaurantOrder, kot.order_id)
            if order and order.status in CLOSED_ORDER_STATUSES:
                continue
        valid_kots.append(kot)

    return [_serialize_kot(session, r) for r in valid_kots]


def get_kot(session: Session, auth: AuthContext, kot_id: str) -> dict[str, Any]:
    return _serialize_kot(session, _kot_or_404(session, auth.company_id, kot_id))


def update_kot_status(session: Session, auth: AuthContext, kot_id: str, body: dict) -> dict[str, Any]:
    _require(auth, "restaurant.kitchen_manage")
    kot = _kot_or_404(session, auth.company_id, kot_id)
    new_status = str(body.get("status") or "").strip().lower()
    if new_status not in KOT_TRANSITIONS:
        raise HTTPException(status_code=400, detail=f"Invalid KOT status: {new_status}")
    current = kot.status or "sent"
    allowed = KOT_TRANSITIONS.get(current, set())
    if new_status not in allowed and new_status != current:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot transition KOT from {current} to {new_status}",
        )
    if new_status == "cancelled":
        _require(auth, "restaurant.void_item")
        if not body.get("reason"):
            raise HTTPException(status_code=400, detail="reason required to cancel KOT")
    before = kot.status
    kot.status = new_status
    lines = session.exec(select(RestaurantKotLine).where(RestaurantKotLine.kot_id == kot.id)).all()
    for ln in lines:
        ln.status = new_status
        session.add(ln)
        if kot.order_id and ln.order_line_id:
            ol = session.get(RestaurantOrderLine, ln.order_line_id)
            if ol:
                if new_status in {"preparing", "accepted"}:
                    ol.status = "preparing"
                elif new_status == "ready":
                    ol.prepared_qty = max(float(ol.prepared_qty or 0), float(ol.sent_to_kitchen_qty))
                    ol.status = "ready"
                elif new_status == "served":
                    ol.served_qty = max(float(ol.served_qty or 0), float(ol.sent_to_kitchen_qty))
                    ol.status = "served"
                session.add(ol)
    session.add(kot)
    if kot.order_id:
        order = session.get(RestaurantOrder, kot.order_id)
        if order and order.company_id == auth.company_id:
            _refresh_order_kitchen_status(session, order)
            session.add(order)
    write_audit(
        session,
        auth,
        "restaurant_kot_status",
        "restaurant_kot",
        kot.id,
        detail={"before": {"status": before}, "after": {"status": new_status, "reason": body.get("reason")}},
    )
    session.commit()
    return _serialize_kot(session, kot)


# --- Billing / payment (via sales engine) ---

def bill_and_pay_order(session: Session, auth: AuthContext, order_id: str, body: dict) -> dict[str, Any]:
    """Finalize restaurant order into canonical SalesInvoice + payments; release table on paid."""
    _require(auth, "restaurant.order_manage")
    if not role_has_permission(auth.role_code, "sales.create"):
        raise HTTPException(status_code=403, detail="Missing permission: sales.create")
    order = _order_or_404(session, auth.company_id, order_id)
    if order.status in CLOSED_ORDER_STATUSES:
        raise HTTPException(status_code=400, detail="Order already closed")
    if order.sales_invoice_id:
        raise HTTPException(status_code=400, detail="Order already billed")

    lines = session.exec(
        select(RestaurantOrderLine).where(RestaurantOrderLine.order_id == order.id)
    ).all()
    sale_lines: list[SaleLineIn] = []
    for line in lines:
        active_qty = max(0.0, float(line.qty) - float(line.cancelled_qty or 0))
        if active_qty <= 0:
            continue
        unit = float(line.unit_price) + float(line.modifier_price)
        mods = []
        if line.modifiers_json:
            try:
                mods = json.loads(line.modifiers_json)
            except json.JSONDecodeError:
                mods = [line.modifiers_json]
        sale_lines.append(
            SaleLineIn(
                product_id=line.product_id,
                sku=line.sku or "REST",
                name=line.product_name,
                qty=active_qty,
                unit_price=unit,
                meta={
                    "table_id": order.table_id,
                    "order_id": order.id,
                    "modifiers": mods,
                    "notes": line.notes,
                    "kitchen_station": line.kitchen_station,
                    "restaurant_line_id": line.id,
                    # Approved at order entry by add_order_line. Replaying it here
                    # keeps the audit trail intact without re-challenging a bill
                    # for food that has already been served.
                    "price_override_reason": line.price_override_reason,
                },
            )
        )
    if not sale_lines:
        raise HTTPException(status_code=400, detail="No billable lines on order")

    discount = float(body.get("discount") if body.get("discount") is not None else order.discount or 0)
    if discount > 0 and discount > order.subtotal:
        raise HTTPException(status_code=400, detail="Discount exceeds subtotal")
    if discount > 0 and not role_has_permission(auth.role_code, "restaurant.discount_override"):
        # allow small discounts without override; large ones need permission
        if discount > order.subtotal * 0.1 and not role_has_permission(auth.role_code, "pos.manager_discount"):
            raise HTTPException(status_code=403, detail="Discount override permission required")

    subtotal = round(sum(l.qty * l.unit_price for l in sale_lines), 2)

    # tax_rate, service_charge, tax and allow_due were all read straight off the
    # request body with no ceiling and no permission check, so any authenticated
    # cashier could post tax_rate 0 (or a zero payment with allow_due) and close a
    # bill having collected nothing. Rates now come from store configuration;
    # undercutting them needs an explicit override permission.
    can_override_charges = role_has_permission(
        auth.role_code, "restaurant.discount_override"
    ) or role_has_permission(auth.role_code, "pos.manager_discount")

    configured_tax_rate = _configured_rate(session, auth, order.store_id, "restaurant.vat_rate", 0.05)
    tax_rate = configured_tax_rate
    if body.get("tax_rate") is not None:
        requested = float(body["tax_rate"])
        if requested < 0:
            raise HTTPException(status_code=400, detail="tax_rate cannot be negative")
        if requested + 1e-9 < configured_tax_rate and not can_override_charges:
            raise HTTPException(
                status_code=403,
                detail="Reducing the tax rate requires a manager override permission",
            )
        tax_rate = requested

    configured_service_pct = _configured_rate(
        session, auth, order.store_id, "restaurant.service_charge_pct", 0.0
    )
    service_charge = float(
        body.get("service_charge") if body.get("service_charge") is not None else order.service_charge or 0
    )
    if service_charge < 0:
        raise HTTPException(status_code=400, detail="service_charge cannot be negative")
    max_service_charge = round(subtotal * configured_service_pct, 2) if configured_service_pct > 0 else 0.0
    if service_charge - max_service_charge > 0.01 and not can_override_charges:
        raise HTTPException(
            status_code=403,
            detail=f"service_charge exceeds the configured maximum of {max_service_charge}",
        )

    taxable = max(0.0, subtotal - discount + service_charge)
    if body.get("tax") is not None and not can_override_charges:
        raise HTTPException(
            status_code=403,
            detail="Setting an explicit tax amount requires a manager override permission",
        )
    tax = round(float(body.get("tax") if body.get("tax") is not None else taxable * tax_rate))
    total = round(taxable + tax)

    payments_in = body.get("payments") or []
    if not payments_in:
        tender = body.get("tender") or "cash"
        payments_in = [{"method": tender, "amount": total}]
    # Equal split helper: split_count N → N equal cash payments
    if body.get("split_count"):
        n = int(body["split_count"])
        if n < 2:
            raise HTTPException(status_code=400, detail="split_count must be >= 2")
        each = round(total / n, 2)
        payments_in = [{"method": body.get("tender") or "cash", "amount": each} for _ in range(n - 1)]
        payments_in.append({"method": body.get("tender") or "cash", "amount": round(total - each * (n - 1), 2)})

    sale_payments = [PaymentLineIn(method=p["method"], amount=float(p["amount"]), reference=p.get("reference")) for p in payments_in]
    paid = round(sum(p.amount for p in sale_payments), 2)
    if abs(paid - total) > 0.01:
        # allow_due was an ungated client flag: posting a zero payment alongside it
        # closed the order as paid having collected nothing.
        if not body.get("allow_due"):
            raise HTTPException(status_code=400, detail=f"Payment total {paid} must equal bill {total}")
        if not role_has_permission(auth.role_code, "restaurant.allow_due"):
            raise HTTPException(
                status_code=403,
                detail="Closing an order with an outstanding balance requires the restaurant.allow_due permission",
            )
        write_audit(
            session,
            auth,
            "restaurant_order_due",
            "restaurant_order",
            order.id,
            detail={"billed": total, "collected": paid, "outstanding": round(total - paid, 2)},
        )

    order.discount = discount
    order.service_charge = service_charge
    order.tax = tax
    order.subtotal = subtotal
    order.total = total
    order.status = "billed"
    session.add(order)
    session.flush()

    from app.services.sales_service import create_sale_idempotent

    sale_body = SaleCreate(
        client_transaction_id=body.get("client_transaction_id") or f"rest-{order.id}-{int(_utc_now().timestamp())}",
        industry_pack="restaurant",
        store_id=order.store_id,
        customer_id=order.customer_id or body.get("customer_id"),
        status="completed",
        lines=sale_lines,
        subtotal=subtotal,
        discount=discount,
        tax=tax,
        total=total,
        tender=sale_payments[0].method if sale_payments else "cash",
        payments=sale_payments,
        industry_meta={
            "restaurant_order_id": order.id,
            "order_no": order.order_no,
            "service_mode": order.service_mode,
            "table_id": order.table_id,
            "guest_count": order.guest_count,
            "service_charge": service_charge,
            "waiter_name": order.waiter_name,
        },
    )
    sale_out = create_sale_idempotent(session, auth, sale_body)
    order.sales_invoice_id = sale_out.id
    order.status = "paid"
    session.add(order)
    if order.table_id:
        table = session.get(RestaurantTable, order.table_id)
        if table and table.company_id == auth.company_id:
            _release_table(table)
            session.add(table)
    tables_to_release = session.exec(
        select(RestaurantTable).where(
            RestaurantTable.company_id == auth.company_id,
            RestaurantTable.current_order_id == order.id,
        )
    ).all()
    for t in tables_to_release:
        _release_table(t)
        session.add(t)
    write_audit(
        session,
        auth,
        "restaurant_order_pay",
        "restaurant_order",
        order.id,
        detail={"invoice_id": sale_out.id, "total": total, "payments": len(sale_payments)},
    )
    session.commit()
    return {
        "order": _serialize_order(session, order),
        "invoice": sale_out.model_dump() if hasattr(sale_out, "model_dump") else dict(sale_out),
    }


# --- Combos ---

COMBO_ITEM_ROLES = {"main", "side", "drink", "addon"}


def _combo_or_404(session: Session, company_id: str, combo_id: str) -> RestaurantCombo:
    combo = session.get(RestaurantCombo, combo_id)
    if not combo or combo.company_id != company_id:
        raise HTTPException(status_code=404, detail="Combo not found")
    return combo


def _product_station(product: Optional[Product]) -> Optional[str]:
    if product is None or not product.meta_json:
        return None
    try:
        meta = json.loads(product.meta_json)
    except json.JSONDecodeError:
        return None
    return meta.get("kitchen_station") or meta.get("station")


def _serialize_combo(session: Session, combo: RestaurantCombo) -> dict[str, Any]:
    items = session.exec(
        select(RestaurantComboItem).where(RestaurantComboItem.combo_id == combo.id)
    ).all()
    out_items = []
    components_total = 0.0
    for i in items:
        product = session.get(Product, i.product_id)
        price = float(product.base_price) if product else 0.0
        components_total += price
        out_items.append(
            {
                "id": i.id,
                "product_id": i.product_id,
                "item_role": i.item_role,
                "product_name": product.name if product else "(deleted product)",
                "sku": product.sku if product else None,
                "base_price": price,
                "kitchen_station": _product_station(product),
                "is_active": bool(product.is_active) if product else False,
            }
        )
    components_total = round(components_total, 2)
    return {
        "id": combo.id,
        "name": combo.name,
        "combo_price": combo.combo_price,
        # What the guest saves versus buying the components separately. Shown on
        # the combo tile, and negative if the combo has been priced above its
        # parts, which is worth surfacing rather than hiding.
        "components_total": components_total,
        "savings": round(components_total - float(combo.combo_price), 2),
        "items": out_items,
    }


def list_combos(session: Session, auth: AuthContext) -> list[dict[str, Any]]:
    combos = session.exec(
        select(RestaurantCombo).where(RestaurantCombo.company_id == auth.company_id)
    ).all()
    return [_serialize_combo(session, c) for c in sorted(combos, key=lambda c: c.name.lower())]


def _read_combo_body(session: Session, auth: AuthContext, body: dict) -> tuple[str, float, list[dict]]:
    name = str(body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Combo name required")
    if body.get("combo_price") is None:
        raise HTTPException(status_code=400, detail="combo_price required")
    try:
        combo_price = float(body["combo_price"])
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="combo_price must be a number")
    if combo_price <= 0:
        raise HTTPException(status_code=400, detail="combo_price must be greater than 0")

    raw_items = body.get("items") or []
    if len(raw_items) < 2:
        raise HTTPException(status_code=400, detail="A combo needs at least 2 items")
    items: list[dict] = []
    seen: set[str] = set()
    for entry in raw_items:
        product_id = str(entry.get("product_id") or "").strip()
        if not product_id:
            raise HTTPException(status_code=400, detail="Each combo item needs a product_id")
        if product_id in seen:
            raise HTTPException(
                status_code=400,
                detail="The same product is listed twice — raise its quantity instead",
            )
        seen.add(product_id)
        product = session.get(Product, product_id)
        if not product or product.company_id != auth.company_id:
            raise HTTPException(status_code=404, detail=f"Product not found: {product_id}")
        if product.is_active is False:
            raise HTTPException(
                status_code=400, detail=f"'{product.name}' is inactive and cannot go in a combo"
            )
        role = str(entry.get("item_role") or "main").strip().lower()
        if role not in COMBO_ITEM_ROLES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid item_role '{role}' — use one of {sorted(COMBO_ITEM_ROLES)}",
            )
        items.append({"product_id": product_id, "item_role": role})
    return name, round(combo_price, 2), items


def create_combo(session: Session, auth: AuthContext, body: dict) -> dict[str, Any]:
    _require(auth, "restaurant.combo_manage")
    name, combo_price, items = _read_combo_body(session, auth, body)
    clash = session.exec(
        select(RestaurantCombo).where(
            RestaurantCombo.company_id == auth.company_id,
            RestaurantCombo.name == name,
        )
    ).first()
    if clash:
        raise HTTPException(status_code=400, detail="A combo with that name already exists")
    combo = RestaurantCombo(company_id=auth.company_id, name=name, combo_price=combo_price)
    session.add(combo)
    session.flush()
    for entry in items:
        session.add(
            RestaurantComboItem(
                combo_id=combo.id,
                product_id=entry["product_id"],
                item_role=entry["item_role"],
            )
        )
    write_audit(
        session,
        auth,
        "restaurant_combo_create",
        "restaurant_combo",
        combo.id,
        detail={"name": name, "combo_price": combo_price, "items": len(items)},
    )
    session.commit()
    session.refresh(combo)
    return _serialize_combo(session, combo)


def update_combo(session: Session, auth: AuthContext, combo_id: str, body: dict) -> dict[str, Any]:
    _require(auth, "restaurant.combo_manage")
    combo = _combo_or_404(session, auth.company_id, combo_id)
    before = {"name": combo.name, "combo_price": combo.combo_price}
    name, combo_price, items = _read_combo_body(session, auth, body)
    clash = session.exec(
        select(RestaurantCombo).where(
            RestaurantCombo.company_id == auth.company_id,
            RestaurantCombo.name == name,
            RestaurantCombo.id != combo.id,
        )
    ).first()
    if clash:
        raise HTTPException(status_code=400, detail="A combo with that name already exists")
    combo.name = name
    combo.combo_price = combo_price
    session.add(combo)
    # Components are replaced wholesale: the edit dialog always submits the full
    # list, and diffing rows would leave orphans when a component is swapped.
    for old in session.exec(
        select(RestaurantComboItem).where(RestaurantComboItem.combo_id == combo.id)
    ).all():
        session.delete(old)
    session.flush()
    for entry in items:
        session.add(
            RestaurantComboItem(
                combo_id=combo.id,
                product_id=entry["product_id"],
                item_role=entry["item_role"],
            )
        )
    write_audit(
        session,
        auth,
        "restaurant_combo_update",
        "restaurant_combo",
        combo.id,
        detail={"before": before, "after": {"name": name, "combo_price": combo_price}},
    )
    session.commit()
    session.refresh(combo)
    return _serialize_combo(session, combo)


def delete_combo(session: Session, auth: AuthContext, combo_id: str) -> dict[str, Any]:
    _require(auth, "restaurant.combo_manage")
    combo = _combo_or_404(session, auth.company_id, combo_id)
    name = combo.name
    for old in session.exec(
        select(RestaurantComboItem).where(RestaurantComboItem.combo_id == combo.id)
    ).all():
        session.delete(old)
    session.delete(combo)
    # Lines already rung up keep their combo_name and prices: deleting the recipe
    # must not rewrite bills that were taken while it existed.
    write_audit(
        session, auth, "restaurant_combo_delete", "restaurant_combo", combo_id, detail={"name": name}
    )
    session.commit()
    return {"message": f"Combo '{name}' deleted"}


def _split_combo_price(total: float, weights: list[float]) -> list[float]:
    """Spread the combo price across components, in proportion to menu price.

    Every component carries a share rather than parking the whole amount on the
    first line, so per-dish revenue reporting stays meaningful. Rounding
    remainder lands on the largest component, which keeps the line total exactly
    equal to the combo price — a penny of drift here becomes a bill that does
    not foot.
    """
    n = len(weights)
    if n == 0:
        return []
    basis = sum(weights)
    if basis <= 0:
        # No menu prices to weight by (all components are free items): split flat.
        share = round(total / n, 2)
        parts = [share] * n
    else:
        parts = [round(total * (w / basis), 2) for w in weights]
    drift = round(total - sum(parts), 2)
    if drift:
        biggest = max(range(n), key=lambda i: weights[i] if basis > 0 else 0)
        parts[biggest] = round(parts[biggest] + drift, 2)
    return parts


def add_combo_to_order(session: Session, auth: AuthContext, order_id: str, body: dict) -> dict[str, Any]:
    """Ring up a combo as one priced line per component."""
    _require(auth, "restaurant.order_manage")
    order = _order_or_404(session, auth.company_id, order_id)
    if order.status in CLOSED_ORDER_STATUSES | {"billed"}:
        raise HTTPException(status_code=400, detail="Cannot add items to a closed/billed order")

    combo_id = str(body.get("combo_id") or "").strip()
    if not combo_id:
        raise HTTPException(status_code=400, detail="combo_id required")
    combo = _combo_or_404(session, auth.company_id, combo_id)
    qty = float(body.get("qty") or 1)
    if qty <= 0:
        raise HTTPException(status_code=400, detail="qty must be > 0")

    items = session.exec(
        select(RestaurantComboItem).where(RestaurantComboItem.combo_id == combo.id)
    ).all()
    if not items:
        raise HTTPException(status_code=400, detail="This combo has no items configured")

    products: list[tuple[RestaurantComboItem, Product]] = []
    for item in items:
        product = session.get(Product, item.product_id)
        if not product or product.company_id != auth.company_id:
            raise HTTPException(
                status_code=400,
                detail=f"Combo '{combo.name}' refers to a product that no longer exists",
            )
        if product.is_active is False:
            raise HTTPException(
                status_code=400,
                detail=f"'{product.name}' is inactive — edit the combo before selling it",
            )
        products.append((item, product))

    unit_shares = _split_combo_price(
        float(combo.combo_price), [float(p.base_price or 0) for _i, p in products]
    )
    group_id = new_uuid()
    # Components are deliberately priced below their menu price — that is what a
    # combo is. enforce_line_pricing would otherwise challenge every one, so the
    # discount is declared up front as the override reason and replayed at
    # settlement by bill_and_pay_order.
    reason = f"Combo: {combo.name}"

    for (item, product), share in zip(products, unit_shares):
        session.add(
            RestaurantOrderLine(
                order_id=order.id,
                product_id=product.id,
                sku=product.sku or "",
                product_name=product.name,
                qty=qty,
                unit_price=share,
                modifier_price=0,
                line_total=round(qty * share, 2),
                modifiers_json=json.dumps([f"{item.item_role}: {combo.name}"]),
                notes=body.get("notes"),
                kitchen_station=_product_station(product),
                ordered_qty=qty,
                sent_to_kitchen_qty=0,
                status="pending",
                price_override_reason=reason,
                combo_group_id=group_id,
                combo_name=combo.name,
            )
        )
    session.flush()
    _recalc_order_totals(session, order)
    if order.status == "draft":
        order.status = "open"
    session.add(order)
    write_audit(
        session,
        auth,
        "restaurant_order_add_combo",
        "restaurant_order",
        order.id,
        detail={
            "combo_id": combo.id,
            "combo_name": combo.name,
            "qty": qty,
            "combo_price": combo.combo_price,
            "lines": len(products),
            "combo_group_id": group_id,
        },
    )
    session.commit()
    return _serialize_order(session, order)


def void_combo_group(session: Session, auth: AuthContext, order_id: str, group_id: str, body: dict) -> dict[str, Any]:
    """Void every component of one combo together.

    Removing a combo one line at a time would leave a half-priced bundle on the
    bill, so the group is cancelled as a unit and permission is judged on the
    strictest component — if any part has reached the kitchen, this is a void.
    """
    order = _order_or_404(session, auth.company_id, order_id)
    if order.status in CLOSED_ORDER_STATUSES | {"billed", "paid"}:
        raise HTTPException(status_code=400, detail="Use sales return/refund after payment")
    lines = session.exec(
        select(RestaurantOrderLine).where(
            RestaurantOrderLine.order_id == order.id,
            RestaurantOrderLine.combo_group_id == group_id,
        )
    ).all()
    if not lines:
        raise HTTPException(status_code=404, detail="Combo not found on this order")
    reason = str(body.get("reason") or "").strip()
    any_sent = any(float(l.sent_to_kitchen_qty) > 0 for l in lines)
    if any_sent:
        _require(auth, "restaurant.void_item")
        if not reason:
            raise HTTPException(status_code=400, detail="reason required after kitchen send")
    else:
        _require(auth, "restaurant.order_manage")
    for line in lines:
        line.cancelled_qty = float(line.ordered_qty)
        line.status = "cancelled"
        line.void_reason = reason or line.void_reason
        session.add(line)
    _recalc_order_totals(session, order)
    session.add(order)
    write_audit(
        session,
        auth,
        "restaurant_void_combo",
        "restaurant_order",
        order.id,
        detail={
            "combo_group_id": group_id,
            "combo_name": lines[0].combo_name,
            "lines": len(lines),
            "reason": reason,
            "sent_to_kitchen": any_sent,
        },
    )
    session.commit()
    return _serialize_order(session, order)
