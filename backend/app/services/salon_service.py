"""Salon / Parlor vertical — services, staff, appointments, visits, checkout."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import HTTPException
from sqlmodel import Session, select

from app.dependencies import AuthContext, write_audit
from app.inventory.locking import for_update
from app.models.industry import (
    SalonAppointment,
    SalonAppointmentLine,
    SalonCommission,
    SalonResource,
    SalonService,
    SalonStaffProfile,
    SalonStaffService,
    SalonTip,
    SalonVisit,
    SalonVisitLine,
)
from app.models.product import Product
from app.rbac import role_has_permission
from app.schemas.commerce import PaymentLineIn, SaleCreate, SaleLineIn

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

APPOINTMENT_STATUSES = {
    "draft", "booked", "confirmed", "checked_in", "in_service", "completed", "cancelled", "no_show"
}
ACTIVE_BOOKING_STATUSES = {"booked", "confirmed", "checked_in", "in_service"}
VISIT_STATUSES = {
    "open", "checked_in", "in_service", "service_complete", "ready_to_pay", "paid", "closed", "cancelled"
}
LINE_STATUSES = {"pending", "started", "completed", "cancelled"}

APPOINTMENT_TRANSITIONS: dict[str, set[str]] = {
    "draft":      {"booked", "confirmed", "cancelled"},
    "booked":     {"confirmed", "checked_in", "cancelled", "no_show"},
    "confirmed":  {"checked_in", "cancelled", "no_show", "in_service"},
    "checked_in": {"in_service", "cancelled"},
    "in_service": {"completed", "cancelled"},
    "completed":  set(),
    "cancelled":  set(),
    "no_show":    set(),
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _next_no(session: Session, company_id: str, prefix: str, model: Any) -> str:
    rows = session.exec(select(model).where(model.company_id == company_id)).all()
    return f"{prefix}-{len(rows) + 1:06d}"


def _require(auth: AuthContext, code: str) -> None:
    if auth.is_platform_admin or auth.role_code in {"Admin", "Super Admin"}:
        return
    if code in (auth.permissions or set()) or role_has_permission(auth.role_code, code):
        return
    raise HTTPException(status_code=403, detail=f"Missing permission: {code}")


def _parse_dt(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S.%f"):
            try:
                dt = datetime.strptime(value.rstrip("Z"), fmt.rstrip("Z"))
                return dt.replace(tzinfo=timezone.utc)
            except ValueError:
                continue
        # ISO with offset — let fromisoformat handle it
        try:
            dt = datetime.fromisoformat(value)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            pass
    raise HTTPException(status_code=400, detail=f"Invalid datetime value: {value!r}")


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _overlaps(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    a_start, a_end = _as_utc(a_start), _as_utc(a_end)  # type: ignore[assignment]
    b_start, b_end = _as_utc(b_start), _as_utc(b_end)  # type: ignore[assignment]
    return a_start < b_end and b_start < a_end


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------

def _service_out(s: SalonService) -> dict[str, Any]:
    return {
        "id": s.id,
        "service_code": s.service_code,
        "service_name": s.service_name,
        "category": s.category,
        "description": s.description,
        "default_duration_minutes": s.default_duration_minutes,
        "cleanup_buffer_minutes": s.cleanup_buffer_minutes,
        "base_price": s.base_price,
        "requires_resource": s.requires_resource,
        "requires_staff": s.requires_staff,
        "commission_type": s.commission_type,
        "commission_rate": s.commission_rate,
        "service_color": s.service_color,
        "product_id": s.product_id,
        "is_active": s.is_active,
    }


def _staff_out(sp: SalonStaffProfile) -> dict[str, Any]:
    return {
        "id": sp.id,
        "user_id": sp.user_id,
        "display_name": sp.display_name,
        "staff_code": sp.staff_code,
        "appointment_enabled": sp.appointment_enabled,
        "commission_enabled": sp.commission_enabled,
        "default_commission_type": sp.default_commission_type,
        "default_commission_rate": sp.default_commission_rate,
        "calendar_color": sp.calendar_color,
        "is_active": sp.is_active,
    }


def _appt_line_out(ln: SalonAppointmentLine) -> dict[str, Any]:
    return {
        "id": ln.id,
        "service_id": ln.service_id,
        "staff_id": ln.staff_id,
        "resource_id": ln.resource_id,
        "scheduled_start": ln.scheduled_start.isoformat() if ln.scheduled_start else None,
        "scheduled_end": ln.scheduled_end.isoformat() if ln.scheduled_end else None,
        "unit_price": ln.unit_price,
        "discount": ln.discount,
        "status": ln.status,
        "notes": ln.notes,
    }


def _appt_out(session: Session, appt: SalonAppointment) -> dict[str, Any]:
    lines = session.exec(
        select(SalonAppointmentLine).where(SalonAppointmentLine.appointment_id == appt.id)
    ).all()
    return {
        "id": appt.id,
        "appointment_no": appt.appointment_no,
        "company_id": appt.company_id,
        "store_id": appt.store_id,
        "customer_id": appt.customer_id,
        "customer_name": appt.customer_name,
        "phone": appt.phone,
        "appointment_date": appt.appointment_date.isoformat() if appt.appointment_date else None,
        "start_time": appt.start_time.isoformat() if appt.start_time else None,
        "expected_end_time": appt.expected_end_time.isoformat() if appt.expected_end_time else None,
        "status": appt.status,
        "source": appt.source,
        "notes": appt.notes,
        "cancel_reason": appt.cancel_reason,
        "visit_id": appt.visit_id,
        "created_at": appt.created_at.isoformat() if appt.created_at else None,
        "lines": [_appt_line_out(ln) for ln in lines],
    }


def _visit_line_out(ln: SalonVisitLine) -> dict[str, Any]:
    return {
        "id": ln.id,
        "line_type": ln.line_type,
        "service_id": ln.service_id,
        "product_id": ln.product_id,
        "staff_id": ln.staff_id,
        "resource_id": ln.resource_id,
        "sku": ln.sku,
        "name": ln.name,
        "qty": ln.qty,
        "unit_price": ln.unit_price,
        "discount": ln.discount,
        "line_total": ln.line_total,
        "status": ln.status,
        "started_at": ln.started_at.isoformat() if ln.started_at else None,
        "completed_at": ln.completed_at.isoformat() if ln.completed_at else None,
        "notes": ln.notes,
        "price_override_reason": ln.price_override_reason,
    }


def _tip_out(t: SalonTip) -> dict[str, Any]:
    return {
        "id": t.id,
        "staff_id": t.staff_id,
        "amount": t.amount,
        "distribution_method": t.distribution_method,
        "notes": t.notes,
    }


def _visit_out(session: Session, visit: SalonVisit, *, include_lines: bool = False) -> dict[str, Any]:
    result: dict[str, Any] = {
        "id": visit.id,
        "visit_no": visit.visit_no,
        "appointment_id": visit.appointment_id,
        "company_id": visit.company_id,
        "store_id": visit.store_id,
        "customer_id": visit.customer_id,
        "customer_name": visit.customer_name,
        "phone": visit.phone,
        "status": visit.status,
        "checked_in_at": visit.checked_in_at.isoformat() if visit.checked_in_at else None,
        "started_at": visit.started_at.isoformat() if visit.started_at else None,
        "completed_at": visit.completed_at.isoformat() if visit.completed_at else None,
        "gross_amount": visit.gross_amount,
        "discount_amount": visit.discount_amount,
        "tax_amount": visit.tax_amount,
        "tips_amount": visit.tips_amount,
        "net_amount": visit.net_amount,
        "paid_amount": visit.paid_amount,
        "due_amount": visit.due_amount,
        "sales_invoice_id": visit.sales_invoice_id,
        "notes": visit.notes,
        "created_at": visit.created_at.isoformat() if visit.created_at else None,
    }
    if include_lines:
        lines = session.exec(select(SalonVisitLine).where(SalonVisitLine.visit_id == visit.id)).all()
        tips = session.exec(select(SalonTip).where(SalonTip.visit_id == visit.id)).all()
        result["lines"] = [_visit_line_out(ln) for ln in lines]
        result["tips"] = [_tip_out(t) for t in tips]
    return result


# ---------------------------------------------------------------------------
# 1. Services CRUD
# ---------------------------------------------------------------------------

def list_services(
    session: Session,
    company_id: str,
    *,
    q: Optional[str] = None,
    category: Optional[str] = None,
    active_only: bool = True,
) -> list[dict[str, Any]]:
    stmt = select(SalonService).where(SalonService.company_id == company_id)
    if category:
        stmt = stmt.where(SalonService.category == category)
    if active_only:
        stmt = stmt.where(SalonService.is_active == True)  # noqa: E712
    rows = session.exec(stmt.order_by(SalonService.service_name)).all()
    if q:
        q_lower = q.strip().lower()
        rows = [r for r in rows if q_lower in f"{r.service_code} {r.service_name} {r.category or ''}".lower()]
    return [_service_out(r) for r in rows]


def upsert_service(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    _require(auth, "salon.service_manage")
    service_id = body.get("id")
    row: Optional[SalonService] = None
    if service_id:
        row = session.get(SalonService, service_id)
        if row and row.company_id != auth.company_id:
            raise HTTPException(status_code=404, detail="Service not found")
    if not row:
        code = str(body.get("service_code") or "").strip()
        if not code:
            raise HTTPException(status_code=400, detail="service_code required")
        name = str(body.get("service_name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="service_name required")
        existing = session.exec(
            select(SalonService).where(
                SalonService.company_id == auth.company_id,
                SalonService.service_code == code,
            )
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="service_code already exists")
        row = SalonService(company_id=auth.company_id, service_code=code, service_name=name)
        session.add(row)

    for field in ("service_name", "category", "description", "service_color", "product_id"):
        if field in body:
            setattr(row, field, body[field])
    for bool_field in ("requires_resource", "requires_staff", "is_active"):
        if bool_field in body:
            setattr(row, bool_field, bool(body[bool_field]))
    for int_field in ("default_duration_minutes", "cleanup_buffer_minutes"):
        if int_field in body and body[int_field] is not None:
            setattr(row, int_field, int(body[int_field]))
    for float_field in ("base_price", "commission_rate"):
        if float_field in body and body[float_field] is not None:
            setattr(row, float_field, float(body[float_field]))
    if "commission_type" in body and body["commission_type"] in ("percentage", "flat"):
        row.commission_type = body["commission_type"]

    session.add(row)
    session.flush()
    write_audit(session, auth, "salon.service_upsert", "salon_service", row.id, {"service_code": row.service_code})
    return _service_out(row)


# ---------------------------------------------------------------------------
# 2. Staff
# ---------------------------------------------------------------------------

def list_staff(
    session: Session,
    company_id: str,
    *,
    active_only: bool = True,
) -> list[dict[str, Any]]:
    stmt = select(SalonStaffProfile).where(SalonStaffProfile.company_id == company_id)
    if active_only:
        stmt = stmt.where(SalonStaffProfile.is_active == True)  # noqa: E712
    rows = session.exec(stmt.order_by(SalonStaffProfile.display_name)).all()
    return [_staff_out(r) for r in rows]


def upsert_staff(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    _require(auth, "salon.staff_manage")
    staff_id = body.get("id")
    row: Optional[SalonStaffProfile] = None
    if staff_id:
        row = session.get(SalonStaffProfile, staff_id)
        if row and row.company_id != auth.company_id:
            raise HTTPException(status_code=404, detail="Staff not found")
    if not row:
        display_name = str(body.get("display_name") or "").strip()
        if not display_name:
            raise HTTPException(status_code=400, detail="display_name required")
        row = SalonStaffProfile(company_id=auth.company_id, display_name=display_name)
        session.add(row)

    for field in ("display_name", "staff_code", "calendar_color", "user_id"):
        if field in body:
            setattr(row, field, body[field])
    for bool_field in ("appointment_enabled", "commission_enabled", "is_active"):
        if bool_field in body:
            setattr(row, bool_field, bool(body[bool_field]))
    for float_field in ("default_commission_rate",):
        if float_field in body and body[float_field] is not None:
            setattr(row, float_field, float(body[float_field]))
    if "default_commission_type" in body and body["default_commission_type"] in ("percentage", "flat"):
        row.default_commission_type = body["default_commission_type"]

    session.add(row)
    session.flush()
    write_audit(session, auth, "salon.staff_upsert", "salon_staff_profile", row.id, {"display_name": row.display_name})
    return _staff_out(row)


def set_staff_services(
    session: Session,
    auth: AuthContext,
    staff_id: str,
    service_ids: list[str],
) -> list[dict[str, Any]]:
    """Replace the full eligibility list for a staff member."""
    _require(auth, "salon.staff_manage")
    staff = session.get(SalonStaffProfile, staff_id)
    if not staff or staff.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Staff not found")

    # Deactivate existing
    existing = session.exec(
        select(SalonStaffService).where(
            SalonStaffService.company_id == auth.company_id,
            SalonStaffService.staff_id == staff_id,
        )
    ).all()
    existing_map = {r.service_id: r for r in existing}

    new_ids = set(service_ids)
    # Validate all service_ids belong to company
    for sid in new_ids:
        svc = session.get(SalonService, sid)
        if not svc or svc.company_id != auth.company_id:
            raise HTTPException(status_code=404, detail=f"Service {sid} not found")

    # Deactivate removed
    for svc_id, row in existing_map.items():
        if svc_id not in new_ids:
            row.is_active = False
            session.add(row)

    # Add new / reactivate existing
    for svc_id in new_ids:
        if svc_id in existing_map:
            existing_map[svc_id].is_active = True
            session.add(existing_map[svc_id])
        else:
            session.add(SalonStaffService(
                company_id=auth.company_id,
                staff_id=staff_id,
                service_id=svc_id,
            ))

    session.flush()
    write_audit(session, auth, "salon.staff_services_set", "salon_staff_profile", staff_id, {"service_ids": list(new_ids)})
    return list_staff_services(session, auth.company_id, staff_id)


def list_staff_services(
    session: Session,
    company_id: str,
    staff_id: str,
) -> list[dict[str, Any]]:
    rows = session.exec(
        select(SalonStaffService, SalonService)
        .join(SalonService, SalonStaffService.service_id == SalonService.id)
        .where(
            SalonStaffService.company_id == company_id,
            SalonStaffService.staff_id == staff_id,
            SalonStaffService.is_active == True,  # noqa: E712
        )
    ).all()
    return [
        {
            "id": ss.id,
            "staff_id": ss.staff_id,
            "service_id": ss.service_id,
            "service_name": svc.service_name,
            "service_code": svc.service_code,
            "custom_duration_minutes": ss.custom_duration_minutes,
            "custom_price": ss.custom_price,
            "custom_commission_rate": ss.custom_commission_rate,
        }
        for ss, svc in rows
    ]


# ---------------------------------------------------------------------------
# 3. Resources
# ---------------------------------------------------------------------------

def list_resources(
    session: Session,
    company_id: str,
    *,
    store_id: Optional[str] = None,
) -> list[dict[str, Any]]:
    stmt = select(SalonResource).where(
        SalonResource.company_id == company_id,
        SalonResource.is_active == True,  # noqa: E712
    )
    if store_id:
        stmt = stmt.where(SalonResource.store_id == store_id)
    rows = session.exec(stmt.order_by(SalonResource.resource_name)).all()
    return [
        {
            "id": r.id,
            "resource_code": r.resource_code,
            "resource_name": r.resource_name,
            "resource_type": r.resource_type,
            "store_id": r.store_id,
            "capacity": r.capacity,
            "status": r.status,
            "is_active": r.is_active,
        }
        for r in rows
    ]


def upsert_resource(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    _require(auth, "salon.resource_manage")
    resource_id = body.get("id")
    row: Optional[SalonResource] = None
    if resource_id:
        row = session.get(SalonResource, resource_id)
        if row and row.company_id != auth.company_id:
            raise HTTPException(status_code=404, detail="Resource not found")
    if not row:
        code = str(body.get("resource_code") or "").strip()
        name = str(body.get("resource_name") or "").strip()
        if not code or not name:
            raise HTTPException(status_code=400, detail="resource_code and resource_name required")
        row = SalonResource(
            company_id=auth.company_id,
            resource_code=code,
            resource_name=name,
            store_id=body.get("store_id") or auth.store_id,
        )
        session.add(row)

    for field in ("resource_name", "resource_type", "status", "store_id"):
        if field in body:
            setattr(row, field, body[field])
    if "capacity" in body and body["capacity"] is not None:
        row.capacity = int(body["capacity"])
    if "is_active" in body:
        row.is_active = bool(body["is_active"])

    session.add(row)
    session.flush()
    write_audit(session, auth, "salon.resource_upsert", "salon_resource", row.id, {"resource_code": row.resource_code})
    return {
        "id": row.id,
        "resource_code": row.resource_code,
        "resource_name": row.resource_name,
        "resource_type": row.resource_type,
        "store_id": row.store_id,
        "capacity": row.capacity,
        "status": row.status,
        "is_active": row.is_active,
    }


# ---------------------------------------------------------------------------
# 4. Conflict engine
# ---------------------------------------------------------------------------

def assert_no_staff_conflict(
    session: Session,
    company_id: str,
    staff_id: str,
    start: datetime,
    end: datetime,
    *,
    exclude_line_id: Optional[str] = None,
) -> None:
    lines = session.exec(
        select(SalonAppointmentLine, SalonAppointment)
        .join(SalonAppointment, SalonAppointmentLine.appointment_id == SalonAppointment.id)
        .where(
            SalonAppointment.company_id == company_id,
            SalonAppointmentLine.staff_id == staff_id,
            SalonAppointment.status.in_(list(ACTIVE_BOOKING_STATUSES)),  # type: ignore[attr-defined]
        )
    ).all()
    for ln, appt in lines:
        if exclude_line_id and ln.id == exclude_line_id:
            continue
        b_start = ln.scheduled_start or appt.start_time
        b_end = ln.scheduled_end or appt.expected_end_time
        if b_start and b_end and _overlaps(start, end, b_start, b_end):
            raise HTTPException(
                status_code=409,
                detail=f"Staff conflict with appointment {appt.appointment_no} ({b_start.isoformat()} – {b_end.isoformat()})",
            )


def assert_no_resource_conflict(
    session: Session,
    company_id: str,
    resource_id: str,
    start: datetime,
    end: datetime,
    *,
    exclude_line_id: Optional[str] = None,
) -> None:
    lines = session.exec(
        select(SalonAppointmentLine, SalonAppointment)
        .join(SalonAppointment, SalonAppointmentLine.appointment_id == SalonAppointment.id)
        .where(
            SalonAppointment.company_id == company_id,
            SalonAppointmentLine.resource_id == resource_id,
            SalonAppointment.status.in_(list(ACTIVE_BOOKING_STATUSES)),  # type: ignore[attr-defined]
        )
    ).all()
    for ln, appt in lines:
        if exclude_line_id and ln.id == exclude_line_id:
            continue
        b_start = ln.scheduled_start or appt.start_time
        b_end = ln.scheduled_end or appt.expected_end_time
        if b_start and b_end and _overlaps(start, end, b_start, b_end):
            raise HTTPException(
                status_code=409,
                detail=f"Resource conflict with appointment {appt.appointment_no} ({b_start.isoformat()} – {b_end.isoformat()})",
            )


# ---------------------------------------------------------------------------
# 5. Appointments
# ---------------------------------------------------------------------------

def list_appointments(
    session: Session,
    company_id: str,
    *,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    status: Optional[str] = None,
    staff_id: Optional[str] = None,
    store_id: Optional[str] = None,
) -> list[dict[str, Any]]:
    stmt = select(SalonAppointment).where(SalonAppointment.company_id == company_id)
    if date_from:
        stmt = stmt.where(SalonAppointment.start_time >= date_from)
    if date_to:
        stmt = stmt.where(SalonAppointment.start_time <= date_to)
    if status:
        stmt = stmt.where(SalonAppointment.status == status)
    if store_id:
        stmt = stmt.where(SalonAppointment.store_id == store_id)
    appts = session.exec(stmt.order_by(SalonAppointment.start_time)).all()

    if staff_id:
        # Filter appointments that have a line for this staff
        staff_appt_ids = {
            ln.appointment_id
            for ln in session.exec(
                select(SalonAppointmentLine).where(SalonAppointmentLine.staff_id == staff_id)
            ).all()
        }
        appts = [a for a in appts if a.id in staff_appt_ids]

    result = []
    for appt in appts:
        result.append(_appt_out(session, appt))
    return result


def get_appointment(session: Session, auth: AuthContext, appointment_id: str) -> dict[str, Any]:
    appt = session.get(SalonAppointment, appointment_id)
    if not appt or appt.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return _appt_out(session, appt)


def create_appointment(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    _require(auth, "salon.appointment_manage")
    customer_id = body.get("customer_id")
    customer_name = str(body.get("customer_name") or "").strip()
    if not customer_id and not customer_name:
        raise HTTPException(status_code=400, detail="customer_name or customer_id required")

    start_raw = body.get("start_time")
    if not start_raw:
        raise HTTPException(status_code=400, detail="start_time required")
    start = _parse_dt(start_raw)

    store_id = body.get("store_id") or auth.store_id
    lines_data: list[dict[str, Any]] = body.get("lines") or []
    if not lines_data:
        raise HTTPException(status_code=400, detail="At least one service line required")

    # Compute overall end time from service durations
    total_minutes = 0
    resolved_lines: list[dict[str, Any]] = []
    for ld in lines_data:
        svc_id = ld.get("service_id")
        if not svc_id:
            raise HTTPException(status_code=400, detail="service_id required on each line")
        svc = session.get(SalonService, svc_id)
        if not svc or svc.company_id != auth.company_id:
            raise HTTPException(status_code=404, detail=f"Service {svc_id} not found")
        staff_id = ld.get("staff_id")
        duration = svc.default_duration_minutes
        unit_price = float(ld.get("unit_price") if ld.get("unit_price") is not None else svc.base_price)

        if staff_id:
            staff = session.get(SalonStaffProfile, staff_id)
            if not staff or staff.company_id != auth.company_id:
                raise HTTPException(status_code=404, detail=f"Staff {staff_id} not found")
            # Check eligibility — only enforce if the staff has ANY eligibility rows
            eligibility_rows = session.exec(
                select(SalonStaffService).where(
                    SalonStaffService.company_id == auth.company_id,
                    SalonStaffService.staff_id == staff_id,
                    SalonStaffService.is_active == True,  # noqa: E712
                )
            ).all()
            if eligibility_rows:
                eligible_ids = {r.service_id for r in eligibility_rows}
                if svc_id not in eligible_ids:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Staff {staff.display_name} is not eligible for service {svc.service_name}",
                    )
                # Use custom duration/price if defined
                ss_row = next((r for r in eligibility_rows if r.service_id == svc_id), None)
                if ss_row:
                    if ss_row.custom_duration_minutes is not None:
                        duration = ss_row.custom_duration_minutes
                    if ss_row.custom_price is not None and ld.get("unit_price") is None:
                        unit_price = ss_row.custom_price

        resource_id = ld.get("resource_id")
        if resource_id:
            res = session.get(SalonResource, resource_id)
            if not res or res.company_id != auth.company_id:
                raise HTTPException(status_code=404, detail=f"Resource {resource_id} not found")

        line_start = start + timedelta(minutes=total_minutes)
        line_end = line_start + timedelta(minutes=duration + svc.cleanup_buffer_minutes)
        total_minutes += duration + svc.cleanup_buffer_minutes

        resolved_lines.append({
            "service_id": svc_id,
            "staff_id": staff_id,
            "resource_id": resource_id,
            "scheduled_start": line_start,
            "scheduled_end": line_end,
            "unit_price": unit_price,
            "duration": duration,
        })

    end = start + timedelta(minutes=total_minutes)

    # Conflict checks
    for rl in resolved_lines:
        if rl["staff_id"]:
            assert_no_staff_conflict(session, auth.company_id, rl["staff_id"], rl["scheduled_start"], rl["scheduled_end"])
        if rl["resource_id"]:
            assert_no_resource_conflict(session, auth.company_id, rl["resource_id"], rl["scheduled_start"], rl["scheduled_end"])

    appt = SalonAppointment(
        company_id=auth.company_id,
        appointment_no=_next_no(session, auth.company_id, "APPT", SalonAppointment),
        store_id=store_id,
        customer_id=customer_id,
        customer_name=customer_name,
        phone=body.get("phone"),
        appointment_date=start.replace(hour=0, minute=0, second=0, microsecond=0),
        start_time=start,
        expected_end_time=end,
        status=str(body.get("status") or "booked"),
        source=str(body.get("source") or "front_desk"),
        notes=body.get("notes"),
        created_by=auth.user_id,
    )
    session.add(appt)
    session.flush()

    for rl in resolved_lines:
        session.add(SalonAppointmentLine(
            appointment_id=appt.id,
            service_id=rl["service_id"],
            staff_id=rl["staff_id"],
            resource_id=rl["resource_id"],
            scheduled_start=rl["scheduled_start"],
            scheduled_end=rl["scheduled_end"],
            unit_price=rl["unit_price"],
            status="booked",
            notes=None,
        ))

    session.flush()
    write_audit(session, auth, "salon.appointment_create", "salon_appointment", appt.id, {"appointment_no": appt.appointment_no})
    return _appt_out(session, appt)


def update_appointment_status(
    session: Session,
    auth: AuthContext,
    appointment_id: str,
    body: dict[str, Any],
) -> dict[str, Any]:
    _require(auth, "salon.appointment_manage")
    appt = session.get(SalonAppointment, appointment_id)
    if not appt or appt.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Appointment not found")

    new_status = str(body.get("status") or "").strip().lower()
    if new_status not in APPOINTMENT_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status: {new_status}")

    allowed = APPOINTMENT_TRANSITIONS.get(appt.status, set())
    if new_status != appt.status and new_status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot transition appointment from {appt.status} to {new_status}",
        )

    if new_status == "cancelled":
        reason = str(body.get("cancel_reason") or "").strip()
        if not reason:
            raise HTTPException(status_code=400, detail="cancel_reason required when cancelling")
        appt.cancel_reason = reason

    before = appt.status
    appt.status = new_status
    session.add(appt)
    write_audit(
        session, auth, "salon.appointment_status",
        "salon_appointment", appt.id,
        {"before": before, "after": new_status},
    )
    return _appt_out(session, appt)


# ---------------------------------------------------------------------------
# 6. Visits
# ---------------------------------------------------------------------------

def list_visits(
    session: Session,
    company_id: str,
    *,
    status: Optional[str] = None,
    store_id: Optional[str] = None,
) -> list[dict[str, Any]]:
    stmt = select(SalonVisit).where(SalonVisit.company_id == company_id)
    if status:
        stmt = stmt.where(SalonVisit.status == status)
    if store_id:
        stmt = stmt.where(SalonVisit.store_id == store_id)
    rows = session.exec(stmt.order_by(SalonVisit.created_at.desc())).all()  # type: ignore[attr-defined]
    return [_visit_out(session, r) for r in rows]


def get_visit(session: Session, auth: AuthContext, visit_id: str) -> dict[str, Any]:
    visit = session.get(SalonVisit, visit_id)
    if not visit or visit.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Visit not found")
    return _visit_out(session, visit, include_lines=True)


def _build_visit_lines_from_appt(
    session: Session,
    auth: AuthContext,
    appt: SalonAppointment,
    visit_id: str,
) -> None:
    lines = session.exec(
        select(SalonAppointmentLine).where(SalonAppointmentLine.appointment_id == appt.id)
    ).all()
    for ln in lines:
        svc = session.get(SalonService, ln.service_id)
        session.add(SalonVisitLine(
            visit_id=visit_id,
            line_type="service",
            service_id=ln.service_id,
            staff_id=ln.staff_id,
            resource_id=ln.resource_id,
            sku=svc.service_code if svc else "",
            name=svc.service_name if svc else "",
            qty=1.0,
            unit_price=ln.unit_price,
            discount=ln.discount,
            line_total=round(ln.unit_price - ln.discount, 2),
            status="pending",
        ))


def create_walk_in(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    _require(auth, "salon.visit_manage")
    customer_name = str(body.get("customer_name") or "").strip()
    customer_id = body.get("customer_id")
    if not customer_name and not customer_id:
        raise HTTPException(status_code=400, detail="customer_name or customer_id required")
    store_id = body.get("store_id") or auth.store_id
    if not store_id:
        raise HTTPException(status_code=400, detail="store_id required")

    now = _utc_now()
    visit = SalonVisit(
        company_id=auth.company_id,
        visit_no=_next_no(session, auth.company_id, "VIS", SalonVisit),
        store_id=store_id,
        customer_id=customer_id,
        customer_name=customer_name,
        phone=body.get("phone"),
        status="checked_in",
        checked_in_at=now,
        notes=body.get("notes"),
        created_by=auth.user_id,
    )
    session.add(visit)
    session.flush()

    lines_data: list[dict[str, Any]] = body.get("lines") or []
    for ld in lines_data:
        svc_id = ld.get("service_id")
        if not svc_id:
            raise HTTPException(status_code=400, detail="service_id required on each line")
        svc = session.get(SalonService, svc_id)
        if not svc or svc.company_id != auth.company_id:
            raise HTTPException(status_code=404, detail=f"Service {svc_id} not found")
        staff_id = ld.get("staff_id")
        unit_price = float(ld.get("unit_price") if ld.get("unit_price") is not None else svc.base_price)
        session.add(SalonVisitLine(
            visit_id=visit.id,
            line_type="service",
            service_id=svc_id,
            staff_id=staff_id,
            resource_id=ld.get("resource_id"),
            sku=svc.service_code,
            name=svc.service_name,
            qty=float(ld.get("qty") or 1),
            unit_price=unit_price,
            discount=float(ld.get("discount") or 0),
            line_total=round(unit_price * float(ld.get("qty") or 1) - float(ld.get("discount") or 0), 2),
            status="pending",
        ))

    session.flush()
    recalculate_visit_totals(session, visit)
    session.add(visit)
    write_audit(session, auth, "salon.walk_in_create", "salon_visit", visit.id, {"visit_no": visit.visit_no})
    return _visit_out(session, visit, include_lines=True)


def check_in_appointment(session: Session, auth: AuthContext, appointment_id: str) -> dict[str, Any]:
    _require(auth, "salon.visit_manage")
    appt = session.get(SalonAppointment, appointment_id)
    if not appt or appt.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Appointment not found")
    if appt.status not in ("booked", "confirmed"):
        raise HTTPException(status_code=400, detail=f"Cannot check in appointment with status {appt.status}")
    if appt.visit_id:
        existing = session.get(SalonVisit, appt.visit_id)
        if existing:
            return _visit_out(session, existing, include_lines=True)

    now = _utc_now()
    visit = SalonVisit(
        company_id=auth.company_id,
        visit_no=_next_no(session, auth.company_id, "VIS", SalonVisit),
        appointment_id=appt.id,
        store_id=appt.store_id,
        customer_id=appt.customer_id,
        customer_name=appt.customer_name,
        phone=appt.phone,
        status="checked_in",
        checked_in_at=now,
        created_by=auth.user_id,
    )
    session.add(visit)
    session.flush()

    _build_visit_lines_from_appt(session, auth, appt, visit.id)

    appt.visit_id = visit.id
    appt.status = "checked_in"
    session.add(appt)
    session.flush()
    recalculate_visit_totals(session, visit)
    session.add(visit)
    write_audit(
        session, auth, "salon.check_in_appointment",
        "salon_visit", visit.id,
        {"appointment_id": appt.id, "appointment_no": appt.appointment_no},
    )
    return _visit_out(session, visit, include_lines=True)


def add_visit_line(session: Session, auth: AuthContext, visit_id: str, body: dict[str, Any]) -> dict[str, Any]:
    _require(auth, "salon.visit_manage")
    visit = session.get(SalonVisit, visit_id)
    if not visit or visit.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Visit not found")
    if visit.status in ("paid", "closed", "cancelled"):
        raise HTTPException(status_code=400, detail="Cannot add lines to a closed/paid visit")

    line_type = str(body.get("line_type") or "service").lower()
    qty = float(body.get("qty") or 1)
    if qty <= 0:
        raise HTTPException(status_code=400, detail="qty must be > 0")

    staff_id = body.get("staff_id")
    discount = float(body.get("discount") or 0)

    if line_type == "service":
        svc_id = body.get("service_id")
        if not svc_id:
            raise HTTPException(status_code=400, detail="service_id required for service line")
        svc = session.get(SalonService, svc_id)
        if not svc or svc.company_id != auth.company_id:
            raise HTTPException(status_code=404, detail="Service not found")
        base = svc.base_price
        unit_price = float(body.get("unit_price") if body.get("unit_price") is not None else base)
        # Price override check
        if unit_price < base:
            if not role_has_permission(auth.role_code, "salon.price_override"):
                raise HTTPException(status_code=403, detail="Price override permission required")
            reason = str(body.get("price_override_reason") or "").strip()
            if not reason:
                raise HTTPException(status_code=400, detail="price_override_reason required for price below base")
        else:
            reason = body.get("price_override_reason")
        line = SalonVisitLine(
            visit_id=visit_id,
            line_type="service",
            service_id=svc_id,
            staff_id=staff_id,
            resource_id=body.get("resource_id"),
            sku=svc.service_code,
            name=svc.service_name,
            qty=qty,
            unit_price=unit_price,
            discount=discount,
            line_total=round(qty * unit_price - discount, 2),
            status="pending",
            notes=body.get("notes"),
            price_override_reason=reason if unit_price < base else None,
        )

    elif line_type == "retail":
        product_id = body.get("product_id")
        if not product_id:
            raise HTTPException(status_code=400, detail="product_id required for retail line")
        product = session.get(Product, product_id)
        if not product or product.company_id != auth.company_id:
            raise HTTPException(status_code=404, detail="Product not found")
        base = product.base_price
        unit_price = float(body.get("unit_price") if body.get("unit_price") is not None else base)
        if unit_price < base:
            if not role_has_permission(auth.role_code, "salon.price_override"):
                raise HTTPException(status_code=403, detail="Price override permission required")
            reason = str(body.get("price_override_reason") or "").strip()
            if not reason:
                raise HTTPException(status_code=400, detail="price_override_reason required for price below base")
        else:
            reason = body.get("price_override_reason")
        line = SalonVisitLine(
            visit_id=visit_id,
            line_type="retail",
            product_id=product_id,
            staff_id=staff_id,
            sku=product.sku,
            name=product.name,
            qty=qty,
            unit_price=unit_price,
            discount=discount,
            line_total=round(qty * unit_price - discount, 2),
            status="pending",
            notes=body.get("notes"),
            price_override_reason=reason if unit_price < base else None,
        )
    else:
        raise HTTPException(status_code=400, detail=f"Invalid line_type: {line_type}")

    session.add(line)
    session.flush()
    recalculate_visit_totals(session, visit)
    session.add(visit)
    write_audit(session, auth, "salon.add_visit_line", "salon_visit", visit_id, {"line_type": line_type})
    return _visit_out(session, visit, include_lines=True)


def start_visit_line(session: Session, auth: AuthContext, visit_id: str, line_id: str) -> dict[str, Any]:
    _require(auth, "salon.visit_manage")
    visit = session.get(SalonVisit, visit_id)
    if not visit or visit.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Visit not found")
    line = session.get(SalonVisitLine, line_id)
    if not line or line.visit_id != visit_id:
        raise HTTPException(status_code=404, detail="Visit line not found")
    if line.status != "pending":
        raise HTTPException(status_code=400, detail=f"Line is already {line.status}")

    now = _utc_now()
    line.status = "started"
    line.started_at = now
    session.add(line)

    if visit.status in ("checked_in", "open"):
        visit.status = "in_service"
        if not visit.started_at:
            visit.started_at = now
        session.add(visit)

    write_audit(session, auth, "salon.start_visit_line", "salon_visit_line", line_id, {})
    return _visit_out(session, visit, include_lines=True)


def complete_visit_line(session: Session, auth: AuthContext, visit_id: str, line_id: str) -> dict[str, Any]:
    _require(auth, "salon.visit_manage")
    visit = session.get(SalonVisit, visit_id)
    if not visit or visit.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Visit not found")
    line = session.get(SalonVisitLine, line_id)
    if not line or line.visit_id != visit_id:
        raise HTTPException(status_code=404, detail="Visit line not found")
    if line.status not in ("pending", "started"):
        raise HTTPException(status_code=400, detail=f"Line cannot be completed from status {line.status}")

    now = _utc_now()
    line.status = "completed"
    line.completed_at = now
    session.add(line)

    # Check if all non-cancelled lines are complete
    all_lines = session.exec(select(SalonVisitLine).where(SalonVisitLine.visit_id == visit_id)).all()
    active = [l for l in all_lines if l.status != "cancelled"]
    if active and all(l.status == "completed" for l in active):
        visit.status = "service_complete"
        visit.completed_at = now
        session.add(visit)

    write_audit(session, auth, "salon.complete_visit_line", "salon_visit_line", line_id, {})
    return _visit_out(session, visit, include_lines=True)


def add_tip(session: Session, auth: AuthContext, visit_id: str, body: dict[str, Any]) -> dict[str, Any]:
    _require(auth, "salon.visit_manage")
    visit = session.get(SalonVisit, visit_id)
    if not visit or visit.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Visit not found")
    if visit.status in ("paid", "closed", "cancelled"):
        raise HTTPException(status_code=400, detail="Cannot add tip to closed/paid visit")

    amount = float(body.get("amount") or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Tip amount must be > 0")

    staff_id = body.get("staff_id")
    if staff_id:
        staff = session.get(SalonStaffProfile, staff_id)
        if not staff or staff.company_id != auth.company_id:
            raise HTTPException(status_code=404, detail="Staff not found")

    tip = SalonTip(
        company_id=auth.company_id,
        visit_id=visit_id,
        staff_id=staff_id,
        amount=amount,
        distribution_method=str(body.get("distribution_method") or "direct"),
        notes=body.get("notes"),
    )
    session.add(tip)
    session.flush()
    recalculate_visit_totals(session, visit)
    session.add(visit)
    write_audit(session, auth, "salon.add_tip", "salon_visit", visit_id, {"amount": amount, "staff_id": staff_id})
    return _visit_out(session, visit, include_lines=True)


def recalculate_visit_totals(session: Session, visit: SalonVisit) -> None:
    lines = session.exec(
        select(SalonVisitLine).where(
            SalonVisitLine.visit_id == visit.id,
            SalonVisitLine.status != "cancelled",
        )
    ).all()
    gross = sum(round(ln.qty * ln.unit_price, 2) for ln in lines)
    discount = sum(float(ln.discount or 0) for ln in lines)
    tips = sum(
        float(t.amount)
        for t in session.exec(select(SalonTip).where(SalonTip.visit_id == visit.id)).all()
    )
    taxable = max(0.0, gross - discount)
    visit.gross_amount = round(gross, 2)
    visit.discount_amount = round(discount, 2)
    visit.tax_amount = round(visit.tax_amount, 2)  # preserve externally set tax
    visit.tips_amount = round(tips, 2)
    visit.net_amount = round(taxable + visit.tax_amount + tips, 2)
    visit.due_amount = round(visit.net_amount - float(visit.paid_amount or 0), 2)


def checkout_visit(session: Session, auth: AuthContext, visit_id: str, body: dict[str, Any]) -> dict[str, Any]:
    """Checkout a salon visit — idempotent; creates SalesInvoice + SalonCommission rows."""
    _require(auth, "salon.visit_manage")
    if not (
        auth.is_platform_admin
        or auth.role_code in {"Admin", "Super Admin"}
        or "sales.create" in (auth.permissions or set())
        or role_has_permission(auth.role_code, "sales.create")
    ):
        raise HTTPException(status_code=403, detail="Missing permission: sales.create")

    visit = session.exec(
        for_update(session, select(SalonVisit).where(SalonVisit.id == visit_id))
    ).first()
    if not visit or visit.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Visit not found")

    # Idempotent guard
    if visit.sales_invoice_id:
        return {
            "visit": _visit_out(session, visit, include_lines=True),
            "invoice": {"id": visit.sales_invoice_id, "duplicate": True},
            "commissions": [],
        }

    lines = session.exec(select(SalonVisitLine).where(SalonVisitLine.visit_id == visit_id)).all()
    active_lines = [ln for ln in lines if ln.status != "cancelled"]

    allow_incomplete = bool(body.get("allow_incomplete", False))
    if not allow_incomplete:
        blocked = [ln for ln in active_lines if ln.status in ("pending", "started")]
        if blocked:
            raise HTTPException(
                status_code=400,
                detail=f"{len(blocked)} service line(s) not yet completed. Pass allow_incomplete=true to override.",
            )

    billable = [ln for ln in active_lines]
    if not billable:
        raise HTTPException(status_code=400, detail="No billable lines on visit")

    recalculate_visit_totals(session, visit)

    sale_lines: list[SaleLineIn] = []
    for ln in billable:
        effective_price = round(ln.unit_price - float(ln.discount or 0) / max(1.0, ln.qty), 2)
        svc_product_id: Optional[str] = None
        if ln.line_type == "service" and ln.service_id:
            _svc = session.get(SalonService, ln.service_id)
            svc_product_id = _svc.product_id if _svc else None
        sale_lines.append(SaleLineIn(
            product_id=ln.product_id if ln.line_type == "retail" else svc_product_id,
            sku=ln.sku or ln.line_type.upper(),
            name=ln.name,
            qty=ln.qty,
            unit_price=effective_price,
            meta={
                "visit_id": visit_id,
                "visit_line_id": ln.id,
                "line_type": ln.line_type,
                "staff_id": ln.staff_id,
            },
        ))

    # Tips as a separate line if any
    if visit.tips_amount and visit.tips_amount > 0:
        sale_lines.append(SaleLineIn(
            product_id=None,
            sku="TIP",
            name="Tip",
            qty=1,
            unit_price=visit.tips_amount,
            meta={"visit_id": visit_id, "line_type": "tip"},
        ))

    subtotal = round(sum(sl.qty * sl.unit_price for sl in sale_lines), 2)
    discount_total = round(visit.discount_amount, 2)
    tax = round(float(body.get("tax") or visit.tax_amount or 0), 2)
    total = round(max(0.0, subtotal - discount_total) + tax, 2)

    payments_in = body.get("payments") or []
    if not payments_in:
        tender = body.get("tender") or "cash"
        payments_in = [{"method": tender, "amount": total}]
    sale_payments = [
        PaymentLineIn(method=p["method"], amount=float(p["amount"]), reference=p.get("reference"))
        for p in payments_in
    ]
    paid = round(sum(p.amount for p in sale_payments), 2)
    if abs(paid - total) > 0.01 and not body.get("allow_due"):
        raise HTTPException(status_code=400, detail=f"Payment total {paid} must equal bill {total}")

    from app.services.sales_service import create_sale_idempotent

    sale_body = SaleCreate(
        client_transaction_id=body.get("client_transaction_id") or f"salon-{visit_id}-{int(_utc_now().timestamp())}",
        industry_pack="salon",
        store_id=visit.store_id,
        customer_id=visit.customer_id or body.get("customer_id"),
        status="completed",
        lines=sale_lines,
        subtotal=subtotal,
        discount=discount_total,
        tax=tax,
        total=total,
        tender=sale_payments[0].method if sale_payments else "cash",
        payments=sale_payments,
        industry_meta={
            "salon_visit_id": visit.id,
            "visit_no": visit.visit_no,
            "appointment_id": visit.appointment_id,
            "tips_amount": visit.tips_amount,
        },
    )
    sale_out = create_sale_idempotent(session, auth, sale_body)

    visit.sales_invoice_id = sale_out.id
    visit.status = "paid"
    visit.paid_amount = paid
    visit.due_amount = round(total - paid, 2)
    session.add(visit)
    session.flush()

    # Generate commissions for completed service lines with staff
    for ln in billable:
        if ln.line_type != "service" or not ln.staff_id or ln.status not in ("completed", "started", "pending"):
            continue
        staff = session.get(SalonStaffProfile, ln.staff_id)
        if not staff or not staff.commission_enabled:
            continue
        svc = session.get(SalonService, ln.service_id) if ln.service_id else None

        # Rate resolution hierarchy: staff-service custom > service default > staff default
        comm_type = staff.default_commission_type
        comm_rate = staff.default_commission_rate
        if svc:
            comm_type = svc.commission_type
            comm_rate = svc.commission_rate

        if ln.service_id and ln.staff_id:
            ss_row = session.exec(
                select(SalonStaffService).where(
                    SalonStaffService.company_id == auth.company_id,
                    SalonStaffService.staff_id == ln.staff_id,
                    SalonStaffService.service_id == ln.service_id,
                    SalonStaffService.is_active == True,  # noqa: E712
                )
            ).first()
            if ss_row and ss_row.custom_commission_rate is not None:
                comm_rate = ss_row.custom_commission_rate

        base_amount = round(ln.qty * ln.unit_price - float(ln.discount or 0), 2)
        if comm_type == "percentage":
            comm_amount = round(base_amount * comm_rate / 100.0, 2)
        else:
            comm_amount = round(comm_rate * ln.qty, 2)

        session.add(SalonCommission(
            company_id=auth.company_id,
            visit_id=visit_id,
            visit_line_id=ln.id,
            staff_id=ln.staff_id,
            service_id=ln.service_id,
            commission_type=comm_type,
            commission_rate=comm_rate,
            commission_base_amount=base_amount,
            commission_amount=comm_amount,
            status="pending",
        ))

    write_audit(
        session, auth, "salon.checkout",
        "salon_visit", visit_id,
        {"invoice_id": sale_out.id, "total": total, "payments": len(sale_payments)},
    )
    return {
        "visit": _visit_out(session, visit, include_lines=True),
        "invoice": sale_out.model_dump() if hasattr(sale_out, "model_dump") else dict(sale_out),
    }


# ---------------------------------------------------------------------------
# 7. Commissions
# ---------------------------------------------------------------------------

def list_commissions(
    session: Session,
    company_id: str,
    *,
    staff_id: Optional[str] = None,
    status: Optional[str] = None,
) -> list[dict[str, Any]]:
    stmt = select(SalonCommission).where(SalonCommission.company_id == company_id)
    if staff_id:
        stmt = stmt.where(SalonCommission.staff_id == staff_id)
    if status:
        stmt = stmt.where(SalonCommission.status == status)
    rows = session.exec(stmt.order_by(SalonCommission.created_at.desc())).all()  # type: ignore[attr-defined]
    return [
        {
            "id": r.id,
            "visit_id": r.visit_id,
            "visit_line_id": r.visit_line_id,
            "staff_id": r.staff_id,
            "service_id": r.service_id,
            "commission_type": r.commission_type,
            "commission_rate": r.commission_rate,
            "commission_base_amount": r.commission_base_amount,
            "commission_amount": r.commission_amount,
            "status": r.status,
            "override_reason": r.override_reason,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
