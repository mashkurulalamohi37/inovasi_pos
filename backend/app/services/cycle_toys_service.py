"""Cycle & Toys ("Pedal & Play") back-office and POS counter operations service."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlmodel import Session, select

from app.dependencies import AuthContext, write_audit
from app.models.industry import (
    CycleAssemblyOrder,
    CycleBatteryWarrantyLog,
    CycleInspectionSerialLog,
    CycleServiceJob,
)

ASSEMBLY_STATUSES = {"Queue", "In Progress", "PDI Completed", "Ready for Delivery"}
SERVICE_JOB_STATUSES = {"Intake", "In Service", "Completed", "Delivered"}
BATTERY_STATUSES = {"Passed PDI", "Charged 100%", "Warranty Service", "Replacement Issued"}
VOLTAGE_RATINGS = {"6V", "12V", "24V"}
INSPECTION_TYPES = {"frame_serial", "pdi_5point", "rc_bench_test"}


def _fmt_dt(dt: Optional[datetime]) -> str:
    if not dt:
        return ""
    return dt.strftime("%Y-%m-%d %H:%M")


def _next_code(session: Session, model_cls, company_id: str, prefix: str) -> str:
    year = datetime.now(timezone.utc).year
    rows = session.exec(select(model_cls.id).where(model_cls.company_id == company_id)).all()
    seq = len(rows) + 1
    return f"{prefix}-{year}-{seq:04d}"


# ---------------------------------------------------------------------------
# 1. Bicycle Assembly Queue
# ---------------------------------------------------------------------------

def _assembly_out(row: CycleAssemblyOrder) -> dict:
    return {
        "id": row.id,
        "order_no": row.order_no,
        "store_id": row.store_id,
        "customer_name": row.customer_name,
        "customer_phone": row.customer_phone,
        "bicycle_model": row.bicycle_model,
        "wheel_size": row.wheel_size,
        "technician": row.technician,
        "assembly_fee": float(row.assembly_fee or 0),
        "status": row.status,
        "pdi_passed": bool(row.pdi_passed),
        "pdi_checklist": json.loads(row.pdi_checklist_json) if row.pdi_checklist_json else None,
        "notes": row.notes or "",
        "sale_invoice_id": row.sale_invoice_id,
        "created_at": _fmt_dt(row.created_at),
    }


def list_assembly_orders(
    session: Session,
    company_id: str,
    status: Optional[str] = None,
    search: Optional[str] = None,
) -> list[dict]:
    q = (
        select(CycleAssemblyOrder)
        .where(CycleAssemblyOrder.company_id == company_id)
        .order_by(CycleAssemblyOrder.created_at.desc())
    )
    if status and status != "All":
        q = q.where(CycleAssemblyOrder.status == status)
    rows = session.exec(q).all()
    if search and search.strip():
        needle = search.strip().lower()
        rows = [
            r
            for r in rows
            if needle in (r.customer_name or "").lower()
            or needle in (r.customer_phone or "").lower()
            or needle in (r.bicycle_model or "").lower()
            or needle in (r.order_no or "").lower()
        ]
    return [_assembly_out(r) for r in rows]


def create_assembly_order(session: Session, auth: AuthContext, body: dict) -> dict:
    customer_name = str(body.get("customer_name") or "").strip()
    bicycle_model = str(body.get("bicycle_model") or "").strip()
    if not customer_name or not bicycle_model:
        raise HTTPException(status_code=400, detail="customer_name and bicycle_model are required")

    status = str(body.get("status") or "Queue").strip()
    if status not in ASSEMBLY_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid assembly status: {status}")

    try:
        fee = float(body.get("assembly_fee", 300))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="assembly_fee must be a number") from exc
    if fee < 0:
        raise HTTPException(status_code=400, detail="assembly_fee cannot be negative")

    pdi_checklist = body.get("pdi_checklist")
    row = CycleAssemblyOrder(
        company_id=auth.company_id,
        store_id=body.get("store_id") or auth.store_id,
        order_no=str(body.get("order_no") or "").strip() or _next_code(session, CycleAssemblyOrder, auth.company_id, "ASM"),
        customer_name=customer_name,
        customer_phone=str(body.get("customer_phone") or "").strip(),
        bicycle_model=bicycle_model,
        wheel_size=str(body.get("wheel_size") or '16"').strip(),
        technician=str(body.get("technician") or "").strip(),
        assembly_fee=fee,
        status=status,
        pdi_passed=bool(body.get("pdi_passed", status in {"PDI Completed", "Ready for Delivery"})),
        pdi_checklist_json=json.dumps(pdi_checklist) if pdi_checklist is not None else None,
        notes=str(body.get("notes") or "").strip(),
        sale_invoice_id=body.get("sale_invoice_id"),
        created_by=auth.user_id,
    )
    session.add(row)
    session.flush()
    write_audit(session, auth, "cycle_assembly_create", "cycle_assembly_order", row.id, {"order_no": row.order_no})
    return _assembly_out(row)


def update_assembly_order(session: Session, auth: AuthContext, order_id: str, body: dict) -> dict:
    row = session.get(CycleAssemblyOrder, order_id)
    if not row or row.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Assembly order not found")

    if "status" in body and body["status"] is not None:
        status = str(body["status"]).strip()
        if status not in ASSEMBLY_STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid assembly status: {status}")
        row.status = status
        if status in {"PDI Completed", "Ready for Delivery"}:
            row.pdi_passed = True

    if "technician" in body and body["technician"] is not None:
        row.technician = str(body["technician"]).strip()
    if "notes" in body and body["notes"] is not None:
        row.notes = str(body["notes"]).strip()
    if "pdi_passed" in body and body["pdi_passed"] is not None:
        row.pdi_passed = bool(body["pdi_passed"])
    if "pdi_checklist" in body and body["pdi_checklist"] is not None:
        row.pdi_checklist_json = json.dumps(body["pdi_checklist"])
    if "assembly_fee" in body and body["assembly_fee"] is not None:
        fee = float(body["assembly_fee"])
        if fee < 0:
            raise HTTPException(status_code=400, detail="assembly_fee cannot be negative")
        row.assembly_fee = fee

    row.updated_at = datetime.now(timezone.utc)
    session.add(row)
    session.flush()
    write_audit(session, auth, "cycle_assembly_update", "cycle_assembly_order", row.id, {"status": row.status})
    return _assembly_out(row)


# ---------------------------------------------------------------------------
# 2. Bicycle Workshop Service & Repair Job Cards
# ---------------------------------------------------------------------------

def _service_job_out(row: CycleServiceJob) -> dict:
    return {
        "id": row.id,
        "job_no": row.job_no,
        "store_id": row.store_id,
        "customer_name": row.customer_name,
        "customer_phone": row.customer_phone,
        "bike_model": row.bike_model,
        "service_type": row.service_type,
        "parts_replaced": row.parts_replaced or "",
        "labor_fee": float(row.labor_fee or 0),
        "parts_cost": float(row.parts_cost or 0),
        "total_cost": float(row.total_cost or 0),
        "mechanic": row.mechanic or "",
        "status": row.status,
        "notes": row.notes or "",
        "sale_invoice_id": row.sale_invoice_id,
        "received_date": _fmt_dt(row.created_at),
    }


def list_service_jobs(
    session: Session,
    company_id: str,
    status: Optional[str] = None,
    search: Optional[str] = None,
) -> list[dict]:
    q = (
        select(CycleServiceJob)
        .where(CycleServiceJob.company_id == company_id)
        .order_by(CycleServiceJob.created_at.desc())
    )
    if status and status != "All":
        q = q.where(CycleServiceJob.status == status)
    rows = session.exec(q).all()
    if search and search.strip():
        needle = search.strip().lower()
        rows = [
            r
            for r in rows
            if needle in (r.customer_name or "").lower()
            or needle in (r.customer_phone or "").lower()
            or needle in (r.bike_model or "").lower()
            or needle in (r.job_no or "").lower()
        ]
    return [_service_job_out(r) for r in rows]


def create_service_job(session: Session, auth: AuthContext, body: dict) -> dict:
    customer_name = str(body.get("customer_name") or "").strip()
    bike_model = str(body.get("bike_model") or "").strip()
    if not customer_name or not bike_model:
        raise HTTPException(status_code=400, detail="customer_name and bike_model are required")

    status = str(body.get("status") or "Intake").strip()
    if status not in SERVICE_JOB_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid service job status: {status}")

    try:
        labor_fee = float(body.get("labor_fee", 0) or 0)
        parts_cost = float(body.get("parts_cost", 0) or 0)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="labor_fee and parts_cost must be numbers") from exc
    if labor_fee < 0 or parts_cost < 0:
        raise HTTPException(status_code=400, detail="Fees cannot be negative")

    total_cost = round(labor_fee + parts_cost, 2)
    row = CycleServiceJob(
        company_id=auth.company_id,
        store_id=body.get("store_id") or auth.store_id,
        job_no=str(body.get("job_no") or "").strip() or _next_code(session, CycleServiceJob, auth.company_id, "JOB"),
        customer_name=customer_name,
        customer_phone=str(body.get("customer_phone") or "").strip(),
        bike_model=bike_model,
        service_type=str(body.get("service_type") or "Complete Overhaul & Tuning").strip(),
        parts_replaced=str(body.get("parts_replaced") or "").strip(),
        labor_fee=labor_fee,
        parts_cost=parts_cost,
        total_cost=total_cost,
        mechanic=str(body.get("mechanic") or "").strip(),
        status=status,
        notes=str(body.get("notes") or "").strip(),
        sale_invoice_id=body.get("sale_invoice_id"),
        created_by=auth.user_id,
    )
    session.add(row)
    session.flush()
    write_audit(session, auth, "cycle_service_job_create", "cycle_service_job", row.id, {"job_no": row.job_no})
    return _service_job_out(row)


def update_service_job(session: Session, auth: AuthContext, job_id: str, body: dict) -> dict:
    row = session.get(CycleServiceJob, job_id)
    if not row or row.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Service job not found")

    if "status" in body and body["status"] is not None:
        status = str(body["status"]).strip()
        if status not in SERVICE_JOB_STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid service job status: {status}")
        row.status = status

    if "parts_replaced" in body and body["parts_replaced"] is not None:
        row.parts_replaced = str(body["parts_replaced"]).strip()
    if "mechanic" in body and body["mechanic"] is not None:
        row.mechanic = str(body["mechanic"]).strip()
    if "notes" in body and body["notes"] is not None:
        row.notes = str(body["notes"]).strip()
    if "labor_fee" in body and body["labor_fee"] is not None:
        val = float(body["labor_fee"])
        if val < 0:
            raise HTTPException(status_code=400, detail="labor_fee cannot be negative")
        row.labor_fee = val
    if "parts_cost" in body and body["parts_cost"] is not None:
        val = float(body["parts_cost"])
        if val < 0:
            raise HTTPException(status_code=400, detail="parts_cost cannot be negative")
        row.parts_cost = val
    row.total_cost = round(float(row.labor_fee or 0) + float(row.parts_cost or 0), 2)

    row.updated_at = datetime.now(timezone.utc)
    session.add(row)
    session.flush()
    write_audit(session, auth, "cycle_service_job_update", "cycle_service_job", row.id, {"status": row.status})
    return _service_job_out(row)


# ---------------------------------------------------------------------------
# 3. Electric Ride-on Battery & Warranty Logs
# ---------------------------------------------------------------------------

def _battery_log_out(row: CycleBatteryWarrantyLog) -> dict:
    return {
        "id": row.id,
        "log_no": row.log_no,
        "store_id": row.store_id,
        "vehicle_model": row.vehicle_model,
        "customer_name": row.customer_name or "",
        "customer_phone": row.customer_phone or "",
        "battery_serial": row.battery_serial,
        "voltage_rating": row.voltage_rating,
        "measured_voltage": row.measured_voltage,
        "remote_paired": bool(row.remote_paired),
        "warranty_months": int(row.warranty_months if row.warranty_months is not None else 6),
        "charger_serial": row.charger_serial or "",
        "status": row.status,
        "notes": row.notes or "",
        "sale_invoice_id": row.sale_invoice_id,
        "inspected_at": _fmt_dt(row.created_at),
    }


def list_battery_logs(
    session: Session,
    company_id: str,
    voltage_rating: Optional[str] = None,
    search: Optional[str] = None,
) -> list[dict]:
    q = (
        select(CycleBatteryWarrantyLog)
        .where(CycleBatteryWarrantyLog.company_id == company_id)
        .order_by(CycleBatteryWarrantyLog.created_at.desc())
    )
    if voltage_rating and voltage_rating != "All":
        q = q.where(CycleBatteryWarrantyLog.voltage_rating == voltage_rating)
    rows = session.exec(q).all()
    if search and search.strip():
        needle = search.strip().lower()
        rows = [
            r
            for r in rows
            if needle in (r.vehicle_model or "").lower()
            or needle in (r.customer_name or "").lower()
            or needle in (r.battery_serial or "").lower()
            or needle in (r.customer_phone or "").lower()
            or needle in (r.log_no or "").lower()
        ]
    return [_battery_log_out(r) for r in rows]


def create_battery_log(session: Session, auth: AuthContext, body: dict) -> dict:
    vehicle_model = str(body.get("vehicle_model") or "").strip()
    battery_serial = str(body.get("battery_serial") or "").strip()
    if not vehicle_model or not battery_serial:
        raise HTTPException(status_code=400, detail="vehicle_model and battery_serial are required")

    voltage_rating = str(body.get("voltage_rating") or "12V").strip()
    if voltage_rating not in VOLTAGE_RATINGS:
        raise HTTPException(status_code=400, detail=f"Invalid voltage_rating: {voltage_rating}")

    status = str(body.get("status") or "Passed PDI").strip()
    if status not in BATTERY_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid battery log status: {status}")

    try:
        raw_warranty = body.get("warranty_months")
        warranty_months = 12 if raw_warranty is None or raw_warranty == "" else int(raw_warranty)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="warranty_months must be an integer") from exc
    if warranty_months < 0:
        raise HTTPException(status_code=400, detail="warranty_months cannot be negative")

    row = CycleBatteryWarrantyLog(
        company_id=auth.company_id,
        store_id=body.get("store_id") or auth.store_id,
        log_no=str(body.get("log_no") or "").strip() or _next_code(session, CycleBatteryWarrantyLog, auth.company_id, "BAT"),
        vehicle_model=vehicle_model,
        customer_name=str(body.get("customer_name") or "").strip(),
        customer_phone=str(body.get("customer_phone") or "").strip(),
        battery_serial=battery_serial,
        voltage_rating=voltage_rating,
        measured_voltage=str(body.get("measured_voltage") or "12.6V").strip(),
        remote_paired=bool(body.get("remote_paired", True)),
        warranty_months=warranty_months,
        charger_serial=str(body.get("charger_serial") or "").strip(),
        status=status,
        notes=str(body.get("notes") or "").strip(),
        sale_invoice_id=body.get("sale_invoice_id"),
        created_by=auth.user_id,
    )
    session.add(row)
    session.flush()
    write_audit(session, auth, "cycle_battery_log_create", "cycle_battery_warranty_log", row.id, {"log_no": row.log_no})
    return _battery_log_out(row)


def update_battery_log(session: Session, auth: AuthContext, log_id: str, body: dict) -> dict:
    row = session.get(CycleBatteryWarrantyLog, log_id)
    if not row or row.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Battery warranty log not found")

    if "status" in body and body["status"] is not None:
        status = str(body["status"]).strip()
        if status not in BATTERY_STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid battery log status: {status}")
        row.status = status
    if "measured_voltage" in body and body["measured_voltage"] is not None:
        row.measured_voltage = str(body["measured_voltage"]).strip()
    if "remote_paired" in body and body["remote_paired"] is not None:
        row.remote_paired = bool(body["remote_paired"])
    if "notes" in body and body["notes"] is not None:
        row.notes = str(body["notes"]).strip()

    row.updated_at = datetime.now(timezone.utc)
    session.add(row)
    session.flush()
    write_audit(session, auth, "cycle_battery_log_update", "cycle_battery_warranty_log", row.id, {"status": row.status})
    return _battery_log_out(row)


# ---------------------------------------------------------------------------
# 4. POS Counter Inspection & Anti-Theft Frame Serial Logs
# ---------------------------------------------------------------------------

def _inspection_out(row: CycleInspectionSerialLog) -> dict:
    return {
        "id": row.id,
        "store_id": row.store_id,
        "log_type": row.log_type,
        "item_model": row.item_model,
        "frame_serial": row.frame_serial,
        "frame_color": row.frame_color,
        "customer_contact": row.customer_contact,
        "inspector": row.inspector,
        "passed": bool(row.passed),
        "details": json.loads(row.details_json) if row.details_json else None,
        "sale_invoice_id": row.sale_invoice_id,
        "created_at": _fmt_dt(row.created_at),
    }


def list_inspection_logs(
    session: Session,
    company_id: str,
    log_type: Optional[str] = None,
    frame_serial: Optional[str] = None,
) -> list[dict]:
    q = (
        select(CycleInspectionSerialLog)
        .where(CycleInspectionSerialLog.company_id == company_id)
        .order_by(CycleInspectionSerialLog.created_at.desc())
    )
    if log_type:
        q = q.where(CycleInspectionSerialLog.log_type == log_type)
    if frame_serial:
        q = q.where(CycleInspectionSerialLog.frame_serial == frame_serial.strip())
    rows = session.exec(q).all()
    return [_inspection_out(r) for r in rows]


def create_inspection_log(session: Session, auth: AuthContext, body: dict) -> dict:
    log_type = str(body.get("log_type") or "").strip()
    if log_type not in INSPECTION_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid log_type: {log_type}")

    frame_serial = str(body.get("frame_serial") or "").strip() or None
    if log_type == "frame_serial" and not frame_serial:
        raise HTTPException(status_code=400, detail="frame_serial is required for frame_serial registration")

    details = body.get("details")
    row = CycleInspectionSerialLog(
        company_id=auth.company_id,
        store_id=body.get("store_id") or auth.store_id,
        log_type=log_type,
        item_model=str(body.get("item_model") or "").strip(),
        frame_serial=frame_serial,
        frame_color=str(body.get("frame_color") or "").strip() or None,
        customer_contact=str(body.get("customer_contact") or "").strip() or None,
        inspector=str(body.get("inspector") or "").strip() or None,
        passed=bool(body.get("passed", True)),
        details_json=json.dumps(details) if details is not None else None,
        sale_invoice_id=body.get("sale_invoice_id"),
        created_by=auth.user_id,
    )
    session.add(row)
    session.flush()
    write_audit(
        session,
        auth,
        f"cycle_{log_type}_log",
        "cycle_inspection_serial_log",
        row.id,
        {"log_type": log_type, "frame_serial": frame_serial},
    )
    return _inspection_out(row)
