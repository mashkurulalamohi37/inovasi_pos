"""POS device registration and validation."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlmodel import Session, select

from app.dependencies import AuthContext, write_audit
from app.models.saas import PosDevice


def register_device(session: Session, auth: AuthContext, body: dict) -> dict:
    device_id = body["device_id"]
    existing = session.exec(
        select(PosDevice).where(
            PosDevice.company_id == auth.company_id,
            PosDevice.device_id == device_id,
        )
    ).first()
    if existing:
        existing.last_seen_at = datetime.now(timezone.utc)
        existing.device_name = body.get("device_name") or existing.device_name
        session.add(existing)
        session.flush()
        return _device_out(existing)
    device = PosDevice(
        device_id=device_id,
        device_name=body.get("device_name") or "POS Terminal",
        company_id=auth.company_id,
        store_id=body.get("store_id") or auth.store_id,
        counter_id=body.get("counter_id"),
        device_type=body.get("device_type") or "browser",
        browser_fingerprint=body.get("browser_fingerprint"),
        status="pending",
        registered_by=auth.user_id,
        last_seen_at=datetime.now(timezone.utc),
    )
    session.add(device)
    write_audit(session, auth, "device_register", "pos_device", device.id)
    session.flush()
    return _device_out(device)


def list_devices(session: Session, company_id: str) -> list[dict]:
    rows = session.exec(select(PosDevice).where(PosDevice.company_id == company_id)).all()
    return [_device_out(d) for d in rows]


def approve_device(session: Session, auth: AuthContext, device_pk: str) -> dict:
    device = _get_device(session, auth.company_id, device_pk)
    device.status = "approved"
    session.add(device)
    write_audit(session, auth, "device_approve", "pos_device", device.id)
    session.flush()
    return _device_out(device)


def block_device(session: Session, auth: AuthContext, device_pk: str) -> dict:
    device = _get_device(session, auth.company_id, device_pk)
    device.status = "blocked"
    session.add(device)
    write_audit(session, auth, "device_block", "pos_device", device.id)
    session.flush()
    return _device_out(device)


def assign_counter(session: Session, auth: AuthContext, device_pk: str, counter_id: str, store_id: str | None) -> dict:
    device = _get_device(session, auth.company_id, device_pk)
    device.counter_id = counter_id
    if store_id:
        device.store_id = store_id
    session.add(device)
    write_audit(session, auth, "device_assign", "pos_device", device.id, {"counter_id": counter_id})
    session.flush()
    return _device_out(device)


def heartbeat(session: Session, auth: AuthContext, device_id: str) -> dict:
    device = session.exec(
        select(PosDevice).where(PosDevice.company_id == auth.company_id, PosDevice.device_id == device_id)
    ).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not registered")
    device.last_seen_at = datetime.now(timezone.utc)
    session.add(device)
    session.flush()
    return _device_out(device)


def validate_device_for_sale(session: Session, company_id: str, device_id: str | None, device_control: bool) -> None:
    if not device_control or not device_id:
        return
    device = session.exec(
        select(PosDevice).where(PosDevice.company_id == company_id, PosDevice.device_id == device_id)
    ).first()
    if not device:
        raise HTTPException(status_code=403, detail="Device not registered")
    if device.status == "blocked":
        raise HTTPException(status_code=403, detail="Device blocked")
    if device.status != "approved":
        raise HTTPException(status_code=403, detail="Device pending approval")


def _get_device(session: Session, company_id: str, device_pk: str) -> PosDevice:
    device = session.get(PosDevice, device_pk)
    if not device or device.company_id != company_id:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


def _device_out(d: PosDevice) -> dict:
    return {
        "id": d.id,
        "device_id": d.device_id,
        "device_name": d.device_name,
        "store_id": d.store_id,
        "counter_id": d.counter_id,
        "device_type": d.device_type,
        "status": d.status,
        "last_seen_at": d.last_seen_at.isoformat() if d.last_seen_at else None,
    }
