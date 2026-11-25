"""Pharmacy vertical — batches, FEFO, prescriptions, sale validation."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import HTTPException
from sqlmodel import Session, select

from app.dependencies import AuthContext, write_audit
from app.models.industry import (
    PharmaBatch,
    PharmaPrescriptionRecord,
    PharmaProductProfile,
    PharmaRestrictedMedicineLog,
)
from app.models.product import Customer, Product


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def batch_status(expiry_date: datetime, *, near_days: int = 90) -> str:
    days = (_as_utc(expiry_date) - _utc_now()).days
    if days <= 0:
        return "expired"
    if days <= near_days:
        return "near-expiry"
    return "active"


def _batch_out(b: PharmaBatch, product: Product | None = None, *, near_days: int = 90) -> dict[str, Any]:
    return {
        "id": b.id,
        "product_id": b.product_id,
        "product_name": product.name if product else None,
        "product_sku": product.sku if product else None,
        "batch_no": b.batch_no,
        "expiry_date": b.expiry_date.isoformat(),
        "qty_on_hand": b.qty_on_hand,
        "status": batch_status(b.expiry_date, near_days=near_days),
        "days_to_expiry": (_as_utc(b.expiry_date) - _utc_now()).days,
    }


def list_batches(
    session: Session,
    company_id: str,
    *,
    product_id: Optional[str] = None,
    q: Optional[str] = None,
    status_filter: Optional[str] = None,
    near_days: int = 90,
) -> list[dict[str, Any]]:
    stmt = (
        select(PharmaBatch, Product)
        .join(Product, PharmaBatch.product_id == Product.id)
        .where(PharmaBatch.company_id == company_id)
    )
    if product_id:
        stmt = stmt.where(PharmaBatch.product_id == product_id)
    if q:
        q_lower = q.strip().lower()
        rows = session.exec(stmt.order_by(PharmaBatch.expiry_date)).all()
        out: list[dict[str, Any]] = []
        for b, p in rows:
            hay = f"{b.batch_no} {p.name} {p.sku}".lower()
            if q_lower not in hay:
                continue
            row = _batch_out(b, p, near_days=near_days)
            if status_filter == "expired" and row["status"] != "expired":
                continue
            if status_filter == "near-expiry" and row["status"] != "near-expiry":
                continue
            if status_filter == "valid" and row["status"] == "expired":
                continue
            out.append(row)
        return out
    rows = session.exec(stmt.order_by(PharmaBatch.expiry_date)).all()
    out: list[dict[str, Any]] = []
    for b, p in rows:
        row = _batch_out(b, p, near_days=near_days)
        if status_filter == "expired" and row["status"] != "expired":
            continue
        if status_filter == "near-expiry" and row["status"] != "near-expiry":
            continue
        if status_filter == "valid" and row["status"] == "expired":
            continue
        out.append(row)
    return out


def list_product_batches(
    session: Session,
    company_id: str,
    product_id: str,
    *,
    sellable_only: bool = False,
) -> list[dict[str, Any]]:
    product = session.get(Product, product_id)
    if not product or product.company_id != company_id:
        raise HTTPException(status_code=404, detail="Product not found")
    rows = session.exec(
        select(PharmaBatch)
        .where(PharmaBatch.company_id == company_id, PharmaBatch.product_id == product_id)
        .order_by(PharmaBatch.expiry_date)
    ).all()
    out: list[dict[str, Any]] = []
    now = _utc_now()
    for b in rows:
        if sellable_only and (b.qty_on_hand or 0) <= 0:
            continue
        if sellable_only and _as_utc(b.expiry_date) <= now:
            continue
        out.append({
            "id": b.id,
            "batch_no": b.batch_no,
            "expiry_date": b.expiry_date.isoformat(),
            "qty_on_hand": b.qty_on_hand,
            "status": batch_status(b.expiry_date),
        })
    return out


def get_fefo_batch(session: Session, company_id: str, product_id: str) -> dict[str, Any]:
    now = _utc_now()
    batch = session.exec(
        select(PharmaBatch)
        .where(
            PharmaBatch.company_id == company_id,
            PharmaBatch.product_id == product_id,
            PharmaBatch.qty_on_hand > 0,
            PharmaBatch.expiry_date > now,
        )
        .order_by(PharmaBatch.expiry_date)
    ).first()
    if not batch:
        raise HTTPException(status_code=404, detail="No valid batch available")
    return {
        "id": batch.id,
        "batch_no": batch.batch_no,
        "expiry_date": batch.expiry_date.isoformat(),
        "qty_on_hand": batch.qty_on_hand,
        "status": batch_status(batch.expiry_date),
    }


def enrich_pharma_meta(session: Session, product: Product, meta: dict[str, Any]) -> dict[str, Any]:
    if product.industry_pack != "pharmacy":
        return meta
    profile = session.exec(
        select(PharmaProductProfile).where(PharmaProductProfile.product_id == product.id)
    ).first()
    if not profile:
        return meta
    return {
        **meta,
        "generic": profile.generic_name,
        "manufacturer": profile.manufacturer,
        "strength": profile.strength,
        "dosageForm": profile.dosage_form,
        "prescriptionRequired": profile.rx_required,
        "restricted": profile.is_restricted,
    }


def validate_pharma_sale_lines(session: Session, auth: AuthContext, lines: list) -> None:
    from app.rbac import role_has_permission

    now = _utc_now()
    for line in lines:
        meta = getattr(line, "meta", None) or {}
        if isinstance(meta, str):
            import json
            meta = json.loads(meta) if meta else {}
        batch_id = meta.get("batch_id")
        if not batch_id:
            raise ValueError("Pharmacy sale requires batch_id in line meta")
        batch = session.get(PharmaBatch, batch_id)
        if not batch or batch.company_id != auth.company_id:
            raise ValueError("Invalid batch for pharmacy sale")
        product_id = getattr(line, "product_id", None) or meta.get("productId")
        if product_id and batch.product_id != product_id:
            raise ValueError("Batch does not belong to product")
        if _as_utc(batch.expiry_date) <= now:
            raise ValueError("Expired batch cannot be sold")
        qty = float(getattr(line, "qty", 0) or 0)
        if (batch.qty_on_hand or 0) < qty:
            raise ValueError(f"Insufficient batch stock for {batch.batch_no}")
        if product_id:
            profile = session.exec(
                select(PharmaProductProfile).where(PharmaProductProfile.product_id == product_id)
            ).first()
            if profile:
                if profile.rx_required and not (meta.get("rx_ref") or meta.get("prescription_id")):
                    raise ValueError("Prescription reference required for this medicine")
                if profile.is_restricted and not role_has_permission(auth.role_code, "pharmacy.restricted_sell"):
                    raise ValueError("Restricted medicine requires pharmacy.restricted_sell permission")


def resolve_purchase_line_batch(
    session: Session,
    company_id: str,
    purchase_line_id: str,
) -> str | None:
    from app.models.operations import PurchaseReceiveLine

    rows = session.exec(
        select(PurchaseReceiveLine)
        .where(PurchaseReceiveLine.purchase_line_id == purchase_line_id)
        .order_by(PurchaseReceiveLine.created_at.desc())  # type: ignore
    ).all()
    for row in rows:
        if row.batch_id:
            batch = session.get(PharmaBatch, row.batch_id)
            if batch and batch.company_id == company_id:
                return row.batch_id
    return None


def validate_pharma_return_lines(
    session: Session,
    auth: AuthContext,
    invoice,
    lines_in: list,
) -> None:
    import json

    from app.models.sales import SalesInvoiceLine

    for ln in lines_in:
        inv_line_id = ln.get("invoice_line_id") or ln.get("line_id")
        inv_line = session.get(SalesInvoiceLine, inv_line_id)
        if not inv_line or inv_line.invoice_id != invoice.id:
            raise ValueError("Invalid invoice line for pharmacy return")
        line_meta = ln.get("meta") or {}
        if inv_line.meta_json:
            try:
                line_meta = {**json.loads(inv_line.meta_json), **line_meta}
            except json.JSONDecodeError:
                pass
        batch_id = line_meta.get("batch_id")
        if not batch_id:
            raise ValueError("Pharmacy return requires batch_id from original sale line")
        batch = session.get(PharmaBatch, batch_id)
        if not batch or batch.company_id != auth.company_id:
            raise ValueError("Invalid batch for pharmacy return")
        if batch.product_id != inv_line.product_id:
            raise ValueError("Batch does not belong to returned product")


PRESCRIPTION_STATUSES = {"captured", "reviewed", "linked_to_sale", "cancelled"}


def list_prescriptions(session: Session, company_id: str, *, status: Optional[str] = None) -> list[dict[str, Any]]:
    q = select(PharmaPrescriptionRecord).where(PharmaPrescriptionRecord.company_id == company_id)
    if status:
        q = q.where(PharmaPrescriptionRecord.status == status)
    rows = session.exec(q.order_by(PharmaPrescriptionRecord.created_at.desc())).all()  # type: ignore
    return [
        {
            "id": r.id,
            "customer_id": r.customer_id,
            "patient_name": r.patient_name,
            "doctor_name": r.doctor_name,
            "rx_ref": r.rx_ref,
            "prescription_date": r.prescription_date.isoformat() if r.prescription_date else None,
            "notes": r.notes,
            "invoice_id": r.invoice_id,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


def create_prescription(session: Session, auth: AuthContext, body: dict[str, Any]) -> dict[str, Any]:
    if not body.get("patient_name", "").strip():
        raise HTTPException(status_code=400, detail="Patient name is required")
    customer_id = body.get("customer_id")
    if customer_id:
        cust = session.get(Customer, customer_id)
        if not cust or cust.company_id != auth.company_id:
            raise HTTPException(status_code=400, detail="Invalid customer")
    rx_date = body.get("prescription_date")
    row = PharmaPrescriptionRecord(
        company_id=auth.company_id,
        customer_id=customer_id,
        patient_name=body["patient_name"].strip(),
        doctor_name=body.get("doctor_name"),
        rx_ref=body.get("rx_ref"),
        prescription_date=datetime.fromisoformat(rx_date) if rx_date else _utc_now(),
        notes=body.get("notes"),
        invoice_id=body.get("invoice_id"),
        status=body.get("status", "captured"),
    )
    session.add(row)
    write_audit(session, auth, "pharma_prescription_create", "pharma_prescription_record", row.id)
    session.flush()
    return list_prescriptions(session, auth.company_id)[0]


def update_prescription(
    session: Session,
    auth: AuthContext,
    prescription_id: str,
    body: dict[str, Any],
) -> dict[str, Any]:
    row = session.get(PharmaPrescriptionRecord, prescription_id)
    if not row or row.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Prescription not found")
    if row.status == "cancelled" and body.get("status") != "cancelled":
        raise HTTPException(status_code=400, detail="Cancelled prescriptions cannot be edited")
    if "status" in body:
        status = body["status"]
        if status not in PRESCRIPTION_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        row.status = status
    for field in ("patient_name", "doctor_name", "rx_ref", "notes", "invoice_id"):
        if field in body:
            setattr(row, field, body[field])
    if "prescription_date" in body:
        pd = body["prescription_date"]
        row.prescription_date = datetime.fromisoformat(pd) if pd else None
    session.add(row)
    write_audit(session, auth, "pharma_prescription_update", "pharma_prescription_record", row.id)
    session.flush()
    return next(r for r in list_prescriptions(session, auth.company_id) if r["id"] == row.id)


def list_restricted_log(session: Session, company_id: str, limit: int = 50) -> list[dict[str, Any]]:
    rows = session.exec(
        select(PharmaRestrictedMedicineLog, Product)
        .join(Product, PharmaRestrictedMedicineLog.product_id == Product.id)
        .where(PharmaRestrictedMedicineLog.company_id == company_id)
        .order_by(PharmaRestrictedMedicineLog.created_at.desc())  # type: ignore
        .limit(limit)
    ).all()
    return [
        {
            "id": r.id,
            "product_id": r.product_id,
            "product_name": p.name,
            "approved_by": r.approved_by,
            "invoice_id": r.invoice_id,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r, p in rows
    ]
