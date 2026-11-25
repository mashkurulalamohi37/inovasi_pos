from datetime import datetime, timezone
import json
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
from app.dependencies import AuthContext, get_current_user, require_permission, write_audit
from app.models.industry import (
    BeefBatch,
    BeefBatchStock,
    BeefColdStorage,
    BeefCutType,
    BeefWastage,
    ButcherMaster,
    FashionAlterationRequest,
    FashionOffer,
    FashionProductVariant,
    PharmaBatch,
    FurnitureDeliveryOrder,
    RiceMillVarietyStock,
    TailoringAlterationJob,
    TailorCommissionLedger,
    CustomerFabricIntake,
)
from app.models.product import Customer, Product
from app.services.product_service import list_fashion_variants

router = APIRouter(prefix="/industry", tags=["industry"])


@router.get("/beef/cuts")
def beef_cuts(auth: Annotated[AuthContext, Depends(get_current_user)], session: Annotated[Session, Depends(get_session)]):
    rows = session.exec(select(BeefCutType).where(BeefCutType.company_id == auth.company_id)).all()
    return [{"id": r.id, "code": r.code, "name": r.name} for r in rows]


@router.get("/beef/batches")
def beef_batches(auth: Annotated[AuthContext, Depends(get_current_user)], session: Annotated[Session, Depends(get_session)]):
    rows = session.exec(select(BeefBatch).where(BeefBatch.company_id == auth.company_id)).all()
    return [
        {
            "id": r.id,
            "batch_code": r.batch_code,
            "meat_type": r.meat_type,
            "expiry_date": r.expiry_date.isoformat() if r.expiry_date else None,
        }
        for r in rows
    ]


@router.get("/beef/butchers")
def beef_butchers(auth: Annotated[AuthContext, Depends(get_current_user)], session: Annotated[Session, Depends(get_session)]):
    rows = session.exec(select(ButcherMaster).where(ButcherMaster.company_id == auth.company_id)).all()
    return [{"id": r.id, "code": r.code, "name": r.name} for r in rows]


@router.get("/beef/cold-storage")
def beef_cold_storage(auth: Annotated[AuthContext, Depends(get_current_user)], session: Annotated[Session, Depends(get_session)]):
    rows = session.exec(select(BeefColdStorage).where(BeefColdStorage.company_id == auth.company_id)).all()
    return [{"id": r.id, "batch_id": r.batch_id, "location": r.location, "qty_kg": r.qty_kg} for r in rows]


@router.get("/beef/wastage")
def list_beef_wastage(auth: Annotated[AuthContext, Depends(get_current_user)], session: Annotated[Session, Depends(get_session)]):
    rows = session.exec(select(BeefWastage).where(BeefWastage.company_id == auth.company_id)).all()
    return [
        {
            "id": r.id,
            "wastage_kg": r.wastage_kg,
            "wastage_type": r.wastage_type,
            "reason": r.reason,
            "recorded_at": r.recorded_at.isoformat() if r.recorded_at else None,
        }
        for r in rows
    ]


@router.post("/beef/wastage")
def create_beef_wastage(
    body: dict,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    row = BeefWastage(
        company_id=auth.company_id,
        product_id=body.get("product_id"),
        batch_id=body.get("batch_id"),
        cut_type=body.get("cut_type"),
        wastage_type=body.get("wastage_type", "trim"),
        wastage_kg=float(body.get("wastage_kg", 0)),
        reason=body.get("reason"),
        responsible_person=body.get("responsible_person"),
        recorded_at=datetime.fromisoformat(body["recorded_at"]) if body.get("recorded_at") else datetime.now(timezone.utc),
    )
    session.add(row)
    write_audit(session, auth, "beef_wastage", "beef_wastage", row.id)
    session.commit()
    session.refresh(row)
    return row


@router.get("/fashion/variants")
def fashion_variants(
    auth: Annotated[AuthContext, Depends(require_permission("fashion.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    return list_fashion_variants(session, auth.company_id)


FASHION_ALTERATION_STATUSES = {"new", "in_progress", "ready", "delivered", "cancelled"}


@router.get("/fashion/alterations")
def list_fashion_alterations(
    auth: Annotated[AuthContext, Depends(require_permission("fashion.view"))],
    session: Annotated[Session, Depends(get_session)],
    status: Optional[str] = None,
):
    q = select(FashionAlterationRequest).where(FashionAlterationRequest.company_id == auth.company_id)
    if status:
        q = q.where(FashionAlterationRequest.status == status)
    rows = session.exec(q.order_by(FashionAlterationRequest.created_at.desc())).all()  # type: ignore
    return [
        {
            "id": r.id,
            "job_no": r.job_no,
            "customer_id": r.customer_id,
            "customer_name": r.customer_name,
            "product_id": r.product_id,
            "product_sku": r.product_sku,
            "variant_id": r.variant_id,
            "invoice_id": r.invoice_id,
            "instruction": r.instruction,
            "measurement_note": r.measurement_note,
            "notes": r.notes,
            "charge_amount": r.charge_amount,
            "paid_amount": r.paid_amount,
            "delivery_date": r.delivery_date.isoformat() if r.delivery_date else None,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.post("/fashion/alterations")
def create_fashion_alteration(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("fashion.manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    charge = float(body.get("charge_amount") or 0)
    if charge < 0:
        raise HTTPException(status_code=400, detail="Charge cannot be negative")
    delivery = body.get("delivery_date")
    delivery_dt = datetime.fromisoformat(delivery) if delivery else None
    if delivery_dt and delivery_dt.date() < datetime.now(timezone.utc).date():
        raise HTTPException(status_code=400, detail="Delivery date cannot be before order date")
    customer_id = body.get("customer_id")
    if customer_id:
        cust = session.get(Customer, customer_id)
        if not cust or cust.company_id != auth.company_id:
            raise HTTPException(status_code=400, detail="Invalid customer")
    product_id = body.get("product_id")
    if product_id:
        prod = session.get(Product, product_id)
        if not prod or prod.company_id != auth.company_id:
            raise HTTPException(status_code=400, detail="Invalid product")
    invoice_id = body.get("invoice_id")
    if invoice_id:
        from app.models.sales import SalesInvoice
        inv = session.get(SalesInvoice, invoice_id)
        if not inv or inv.company_id != auth.company_id:
            raise HTTPException(status_code=400, detail="Invalid invoice")
    job_no = body.get("job_no") or f"FALT-{datetime.now().strftime('%y%m%d%H%M')}"
    row = FashionAlterationRequest(
        company_id=auth.company_id,
        job_no=job_no,
        customer_id=customer_id,
        customer_name=body.get("customer_name", "Walk-in"),
        product_id=product_id,
        product_sku=body.get("product_sku", ""),
        variant_id=body.get("variant_id"),
        invoice_id=invoice_id,
        instruction=body.get("instruction"),
        measurement_note=body.get("measurement_note"),
        notes=body.get("notes"),
        charge_amount=charge,
        paid_amount=float(body.get("paid_amount") or 0),
        delivery_date=delivery_dt,
        status=body.get("status", "new"),
    )
    session.add(row)
    write_audit(session, auth, "fashion_alteration_create", "fashion_alteration_request", row.id)
    session.commit()
    session.refresh(row)
    return row


@router.patch("/fashion/alterations/{alteration_id}")
def update_fashion_alteration(
    alteration_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("fashion.manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    row = session.get(FashionAlterationRequest, alteration_id)
    if not row or row.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Alteration order not found")
    if row.status in ("delivered", "cancelled") and body.get("status") not in (None, row.status):
        allowed = row.status == "delivered" and body.get("status") == "cancelled"
        if not allowed:
            raise HTTPException(status_code=400, detail="Delivered or cancelled orders cannot be edited")
    if "charge_amount" in body:
        charge = float(body["charge_amount"])
        if charge < 0:
            raise HTTPException(status_code=400, detail="Charge cannot be negative")
        row.charge_amount = charge
    if "paid_amount" in body:
        row.paid_amount = float(body["paid_amount"])
    if "status" in body:
        status = body["status"]
        if status not in FASHION_ALTERATION_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        row.status = status
    for field in ("customer_name", "instruction", "measurement_note", "notes", "product_sku", "variant_id"):
        if field in body:
            setattr(row, field, body[field])
    if "delivery_date" in body:
        delivery = body["delivery_date"]
        row.delivery_date = datetime.fromisoformat(delivery) if delivery else None
        if row.delivery_date and row.created_at and row.delivery_date.date() < row.created_at.date():
            raise HTTPException(status_code=400, detail="Delivery date cannot be before order date")
    session.add(row)
    write_audit(session, auth, "fashion_alteration_update", "fashion_alteration_request", row.id)
    session.commit()
    session.refresh(row)
    return row


OFFER_TYPES = frozenset({"percent", "bygo"})


def _offer_out(r: FashionOffer) -> dict:
    return {
        "id": r.id,
        "name": r.name,
        "season": r.season,
        "department": r.department,
        "discount_pct": r.discount_pct,
        "is_active": r.is_active,
        "offer_type": r.offer_type,
        "buy_qty": r.buy_qty,
        "get_qty": r.get_qty,
        "get_discount_pct": r.get_discount_pct,
        "stackable": r.stackable,
    }


def _validate_offer_fields(row: FashionOffer) -> None:
    if row.offer_type not in OFFER_TYPES:
        raise HTTPException(status_code=400, detail=f"offer_type must be one of {sorted(OFFER_TYPES)}")
    if row.offer_type == "bygo":
        if not row.buy_qty or row.buy_qty < 1:
            raise HTTPException(status_code=400, detail="buy_qty must be >= 1 for a bygo offer")
        if not row.get_qty or row.get_qty < 1:
            raise HTTPException(status_code=400, detail="get_qty must be >= 1 for a bygo offer")
        if row.get_discount_pct is None or row.get_discount_pct < 0 or row.get_discount_pct > 100:
            raise HTTPException(status_code=400, detail="get_discount_pct must be between 0 and 100 for a bygo offer")


@router.get("/fashion/offers")
def list_offers(
    auth: Annotated[AuthContext, Depends(require_permission("fashion.view"))],
    session: Annotated[Session, Depends(get_session)],
    include_inactive: bool = False,
):
    q = select(FashionOffer).where(FashionOffer.company_id == auth.company_id)
    if not include_inactive:
        q = q.where(FashionOffer.is_active == True)  # noqa: E712
    rows = session.exec(q.order_by(FashionOffer.name)).all()  # type: ignore
    return [_offer_out(r) for r in rows]


@router.post("/fashion/offers")
def create_offer(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("fashion.manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    name = str(body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    discount_pct = float(body.get("discount_pct") or 0)
    if discount_pct < 0 or discount_pct > 100:
        raise HTTPException(status_code=400, detail="discount_pct must be between 0 and 100")
    row = FashionOffer(
        company_id=auth.company_id,
        name=name,
        season=(str(body.get("season")).strip() if body.get("season") else None),
        department=(str(body.get("department")).strip() if body.get("department") else None),
        discount_pct=discount_pct,
        is_active=bool(body.get("is_active", True)),
        offer_type=str(body.get("offer_type") or "percent").strip().lower(),
        buy_qty=int(body["buy_qty"]) if body.get("buy_qty") not in (None, "") else None,
        get_qty=int(body["get_qty"]) if body.get("get_qty") not in (None, "") else None,
        get_discount_pct=float(body["get_discount_pct"]) if body.get("get_discount_pct") not in (None, "") else None,
        stackable=bool(body.get("stackable", False)),
    )
    _validate_offer_fields(row)
    session.add(row)
    write_audit(session, auth, "fashion_offer_create", "fashion_offer", row.id, {"name": name})
    session.commit()
    session.refresh(row)
    return _offer_out(row)


@router.patch("/fashion/offers/{offer_id}")
def update_offer(
    offer_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("fashion.manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    row = session.get(FashionOffer, offer_id)
    if not row or row.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Offer not found")
    if "name" in body:
        name = str(body.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="name is required")
        row.name = name
    if "season" in body:
        row.season = str(body["season"]).strip() if body.get("season") else None
    if "department" in body:
        row.department = str(body["department"]).strip() if body.get("department") else None
    if "discount_pct" in body:
        discount_pct = float(body.get("discount_pct") or 0)
        if discount_pct < 0 or discount_pct > 100:
            raise HTTPException(status_code=400, detail="discount_pct must be between 0 and 100")
        row.discount_pct = discount_pct
    if "is_active" in body:
        row.is_active = bool(body["is_active"])
    if "offer_type" in body:
        row.offer_type = str(body.get("offer_type") or "percent").strip().lower()
    if "buy_qty" in body:
        row.buy_qty = int(body["buy_qty"]) if body.get("buy_qty") not in (None, "") else None
    if "get_qty" in body:
        row.get_qty = int(body["get_qty"]) if body.get("get_qty") not in (None, "") else None
    if "get_discount_pct" in body:
        row.get_discount_pct = float(body["get_discount_pct"]) if body.get("get_discount_pct") not in (None, "") else None
    if "stackable" in body:
        row.stackable = bool(body["stackable"])
    _validate_offer_fields(row)
    session.add(row)
    write_audit(session, auth, "fashion_offer_update", "fashion_offer", row.id)
    session.commit()
    session.refresh(row)
    return _offer_out(row)


def _compute_offer_discount(offer: FashionOffer, lines: list[dict]) -> float:
    """Compute the discount amount `offer` contributes given the cart lines the
    caller has already scoped to this offer (season/department match is done
    client-side today, same trust boundary as the pre-existing flat % campaign)."""
    if offer.offer_type == "percent":
        subtotal = sum(float(l.get("qty") or 0) * float(l.get("unit_price") or 0) for l in lines)
        return round(subtotal * (offer.discount_pct / 100), 2)

    if offer.offer_type == "bygo":
        buy_qty = offer.buy_qty or 0
        get_qty = offer.get_qty or 0
        get_pct = offer.get_discount_pct or 0
        group_size = buy_qty + get_qty
        if group_size <= 0:
            return 0.0
        # Flatten to one entry per unit so the discount lands on the cheapest
        # qualifying units within each complete buy+get group — standard BYGO behavior.
        unit_prices: list[float] = []
        for l in lines:
            qty = int(float(l.get("qty") or 0))
            price = float(l.get("unit_price") or 0)
            unit_prices.extend([price] * qty)
        if len(unit_prices) < group_size:
            return 0.0
        unit_prices.sort()
        groups = len(unit_prices) // group_size
        discounted_units = groups * get_qty
        # Cheapest `discounted_units` units get the discount.
        cheapest = unit_prices[:discounted_units]
        return round(sum(p * (get_pct / 100) for p in cheapest), 2)

    return 0.0


@router.post("/fashion/offers/preview")
def preview_offers(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("fashion.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    """Compute the combined discount for a set of offers the POS wants to apply,
    enforcing stacking rules: any number of stackable offers may combine, but a
    non-stackable offer must be applied alone."""
    offer_ids = [str(i) for i in (body.get("offer_ids") or []) if i]
    if not offer_ids:
        raise HTTPException(status_code=400, detail="offer_ids required")
    lines_by_offer = body.get("lines_by_offer") or {}

    rows = session.exec(
        select(FashionOffer).where(
            FashionOffer.company_id == auth.company_id,
            FashionOffer.id.in_(offer_ids),  # type: ignore
        )
    ).all()
    found_ids = {r.id for r in rows}
    missing = [i for i in offer_ids if i not in found_ids]
    if missing:
        raise HTTPException(status_code=404, detail=f"Offer(s) not found: {', '.join(missing)}")
    inactive = [r.name for r in rows if not r.is_active]
    if inactive:
        raise HTTPException(status_code=400, detail=f"Offer(s) inactive: {', '.join(inactive)}")

    if len(rows) > 1:
        non_stackable = [r.name for r in rows if not r.stackable]
        if non_stackable:
            raise HTTPException(
                status_code=400,
                detail=f"Non-stackable offer(s) cannot combine with others: {', '.join(non_stackable)}",
            )

    breakdown = []
    total = 0.0
    for r in rows:
        lines = lines_by_offer.get(r.id) or lines_by_offer.get(str(r.id)) or []
        amount = _compute_offer_discount(r, lines)
        total += amount
        breakdown.append({"offer_id": r.id, "name": r.name, "offer_type": r.offer_type, "discount_amount": amount})

    return {
        "combined_name": " + ".join(r.name for r in rows),
        "total_discount": round(total, 2),
        "offers": breakdown,
    }


@router.get("/pharmacy/batches")
def all_pharma_batches(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    product_id: Optional[str] = None,
    q: Optional[str] = None,
    status: Optional[str] = None,
    near_days: int = 90,
):
    from app.services.pharma_service import list_batches
    return list_batches(
        session,
        auth.company_id,
        product_id=product_id,
        q=q,
        status_filter=status,
        near_days=near_days,
    )


@router.get("/pharmacy/batches/{product_id}")
def pharma_batches(
    product_id: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    sellable_only: bool = False,
):
    from app.services.pharma_service import list_product_batches
    return list_product_batches(session, auth.company_id, product_id, sellable_only=sellable_only)


@router.get("/pharmacy/fefo/{product_id}")
def pharma_fefo(
    product_id: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.pharma_service import get_fefo_batch
    return get_fefo_batch(session, auth.company_id, product_id)


@router.get("/pharmacy/prescriptions")
def list_pharma_prescriptions(
    auth: Annotated[AuthContext, Depends(require_permission("pharmacy.prescription_manage"))],
    session: Annotated[Session, Depends(get_session)],
    status: Optional[str] = None,
):
    from app.services.pharma_service import list_prescriptions
    return list_prescriptions(session, auth.company_id, status=status)


@router.post("/pharmacy/prescriptions")
def create_pharma_prescription(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("pharmacy.prescription_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.pharma_service import create_prescription
    result = create_prescription(session, auth, body)
    session.commit()
    return result


@router.patch("/pharmacy/prescriptions/{prescription_id}")
def update_pharma_prescription(
    prescription_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("pharmacy.prescription_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.pharma_service import update_prescription
    result = update_prescription(session, auth, prescription_id, body)
    session.commit()
    return result


@router.get("/pharmacy/restricted-log")
def pharma_restricted_log(
    auth: Annotated[AuthContext, Depends(require_permission("pharmacy.prescription_manage"))],
    session: Annotated[Session, Depends(get_session)],
    limit: int = 50,
):
    from app.services.pharma_service import list_restricted_log
    return list_restricted_log(session, auth.company_id, limit=limit)


@router.get("/restaurant/tables")
def list_tables(
    auth: Annotated[AuthContext, Depends(require_permission("restaurant.view"))],
    session: Annotated[Session, Depends(get_session)],
    store_id: Optional[str] = None,
    zone: Optional[str] = None,
    status: Optional[str] = None,
):
    from app.services.restaurant_service import list_tables as svc

    return svc(session, auth, store_id=store_id, zone=zone, status=status)


@router.post("/restaurant/tables")
def create_table(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("restaurant.table_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.restaurant_service import create_table as svc

    return svc(session, auth, body)


@router.patch("/restaurant/tables/{table_id}")
def update_table(
    table_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("restaurant.table_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.restaurant_service import update_table as svc

    return svc(session, auth, table_id, body)


@router.delete("/restaurant/tables/{table_id}")
def delete_table(
    table_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("restaurant.table_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.restaurant_service import delete_table as svc

    return svc(session, auth, table_id)


@router.get("/restaurant/combos")
def list_combos(
    auth: Annotated[AuthContext, Depends(require_permission("restaurant.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.restaurant_service import list_combos as svc

    return svc(session, auth)


@router.post("/restaurant/combos")
def create_combo(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("restaurant.combo_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.restaurant_service import create_combo as svc

    return svc(session, auth, body)


@router.patch("/restaurant/combos/{combo_id}")
def update_combo(
    combo_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("restaurant.combo_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.restaurant_service import update_combo as svc

    return svc(session, auth, combo_id, body)


@router.delete("/restaurant/combos/{combo_id}")
def delete_combo(
    combo_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("restaurant.combo_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.restaurant_service import delete_combo as svc

    return svc(session, auth, combo_id)


@router.get("/restaurant/orders")
def list_orders(
    auth: Annotated[AuthContext, Depends(require_permission("restaurant.view"))],
    session: Annotated[Session, Depends(get_session)],
    status: Optional[str] = None,
    active_only: bool = False,
    table_id: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
):
    from app.services.restaurant_service import list_orders as svc

    return svc(
        session,
        auth,
        status=status,
        active_only=active_only,
        table_id=table_id,
        limit=limit,
        offset=offset,
    )


@router.post("/restaurant/orders")
def create_order(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("restaurant.order_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.restaurant_service import create_order as svc

    return svc(session, auth, body)


@router.get("/restaurant/orders/{order_id}")
def get_order(
    order_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("restaurant.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.restaurant_service import get_order as svc

    return svc(session, auth, order_id)


@router.post("/restaurant/orders/{order_id}/lines")
def add_order_line(
    order_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("restaurant.order_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.restaurant_service import add_order_line as svc

    return svc(session, auth, order_id, body)


@router.patch("/restaurant/orders/{order_id}/lines/{line_id}")
def update_order_line(
    order_id: str,
    line_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("restaurant.order_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.restaurant_service import update_order_line as svc

    return svc(session, auth, order_id, line_id, body)


@router.post("/restaurant/orders/{order_id}/lines/{line_id}/void")
def void_order_line(
    order_id: str,
    line_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.restaurant_service import void_order_line as svc

    return svc(session, auth, order_id, line_id, body)


@router.post("/restaurant/orders/{order_id}/combo")
def add_combo_to_order(
    order_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("restaurant.order_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.restaurant_service import add_combo_to_order as svc

    return svc(session, auth, order_id, body)


@router.post("/restaurant/orders/{order_id}/combo/{group_id}/void")
def void_combo_group(
    order_id: str,
    group_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.restaurant_service import void_combo_group as svc

    return svc(session, auth, order_id, group_id, body or {})


@router.post("/restaurant/orders/{order_id}/send-kot")
def send_kot(
    order_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("restaurant.kot_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.restaurant_service import send_to_kitchen as svc

    return svc(session, auth, order_id, body or {})


@router.post("/restaurant/orders/{order_id}/move-table")
def move_order_table(
    order_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("restaurant.table_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.restaurant_service import move_table as svc

    return svc(session, auth, order_id, body)


@router.post("/restaurant/orders/{order_id}/cancel")
def cancel_order(
    order_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("restaurant.cancel_order"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.restaurant_service import cancel_order as svc

    return svc(session, auth, order_id, body)


@router.post("/restaurant/orders/{order_id}/pay")
def pay_order(
    order_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("restaurant.order_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.restaurant_service import bill_and_pay_order as svc

    return svc(session, auth, order_id, body or {})


@router.post("/restaurant/kot")
def create_kot_legacy(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("restaurant.kot_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    """Legacy header-only KOT create — prefer POST .../orders/{id}/send-kot."""
    if body.get("order_id"):
        from app.services.restaurant_service import send_to_kitchen as svc

        return svc(session, auth, body["order_id"], body)
    raise HTTPException(
        status_code=400,
        detail="Use POST /restaurant/orders/{order_id}/send-kot with an active order",
    )


@router.get("/restaurant/kots")
def list_kots(
    auth: Annotated[AuthContext, Depends(require_permission("restaurant.view"))],
    session: Annotated[Session, Depends(get_session)],
    status: Optional[str] = None,
    station: Optional[str] = None,
    order_id: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
):
    from app.services.restaurant_service import list_kots as svc

    return svc(
        session,
        auth,
        status=status,
        station=station,
        order_id=order_id,
        limit=limit,
        offset=offset,
    )


@router.get("/restaurant/kots/{kot_id}")
def get_kot(
    kot_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("restaurant.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.restaurant_service import get_kot as svc

    return svc(session, auth, kot_id)


@router.patch("/restaurant/kots/{kot_id}")
def update_kot(
    kot_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("restaurant.kitchen_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.restaurant_service import update_kot_status as svc

    return svc(session, auth, kot_id, body)


# --- Optical Shop ---

@router.get("/optical/frames")
def optical_frames(
    auth: Annotated[AuthContext, Depends(require_permission("optical.view"))],
    session: Annotated[Session, Depends(get_session)],
    q: Optional[str] = None,
):
    from app.services.optical_service import list_frames

    return list_frames(session, auth, q=q)


@router.post("/optical/frames")
def optical_frame_upsert(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("optical.manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.optical_service import upsert_frame_profile

    return upsert_frame_profile(session, auth, body)


@router.get("/optical/lenses")
def optical_lenses(
    auth: Annotated[AuthContext, Depends(require_permission("optical.view"))],
    session: Annotated[Session, Depends(get_session)],
    q: Optional[str] = None,
):
    from app.services.optical_service import list_lenses

    return list_lenses(session, auth, q=q)


@router.post("/optical/lenses")
def optical_lens_upsert(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("optical.manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.optical_service import upsert_lens_profile

    return upsert_lens_profile(session, auth, body)


@router.get("/optical/prescriptions")
def optical_prescriptions(
    auth: Annotated[AuthContext, Depends(require_permission("optical.prescription_view"))],
    session: Annotated[Session, Depends(get_session)],
    customer_id: Optional[str] = None,
):
    from app.services.optical_service import list_prescriptions

    return list_prescriptions(session, auth, customer_id=customer_id)


@router.post("/optical/prescriptions")
def optical_prescription_create(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("optical.prescription_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.optical_service import create_prescription

    return create_prescription(session, auth, body)


@router.get("/optical/prescriptions/{rx_id}")
def optical_prescription_get(
    rx_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("optical.prescription_view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.optical_service import get_prescription

    return get_prescription(session, auth, rx_id)


@router.get("/optical/orders")
def optical_orders(
    auth: Annotated[AuthContext, Depends(require_permission("optical.view"))],
    session: Annotated[Session, Depends(get_session)],
    status: Optional[str] = None,
    customer_id: Optional[str] = None,
):
    from app.services.optical_service import list_orders

    return list_orders(session, auth, status=status, customer_id=customer_id)


@router.post("/optical/orders")
def optical_order_create(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("optical.order_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.optical_service import create_order

    return create_order(session, auth, body)


@router.get("/optical/orders/{order_id}")
def optical_order_get(
    order_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("optical.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.optical_service import get_order

    return get_order(session, auth, order_id)


@router.post("/optical/orders/{order_id}/lines")
def optical_order_add_line(
    order_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("optical.order_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.optical_service import add_order_line

    return add_order_line(session, auth, order_id, body)


@router.post("/optical/orders/{order_id}/confirm")
def optical_order_confirm(
    order_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("optical.order_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.optical_service import confirm_order

    return confirm_order(session, auth, order_id, body or {})


@router.patch("/optical/orders/{order_id}/status")
def optical_order_status(
    order_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.optical_service import update_order_status

    return update_order_status(session, auth, order_id, body)


@router.post("/optical/orders/{order_id}/advance")
def optical_order_advance(
    order_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("optical.order_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.optical_service import record_advance

    return record_advance(session, auth, order_id, body)


@router.post("/optical/orders/{order_id}/finalize")
def optical_order_finalize(
    order_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("optical.order_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.optical_service import finalize_order

    return finalize_order(session, auth, order_id, body or {})


# --- Surgical Shop ---
@router.get("/surgical/profiles")
def surgical_profiles(
    auth: Annotated[AuthContext, Depends(require_permission("surgical.view"))],
    session: Annotated[Session, Depends(get_session)],
    q: Optional[str] = None,
):
    from app.services.surgical_service import list_profiles

    return list_profiles(session, auth.company_id, q=q)


@router.post("/surgical/profiles")
def surgical_profile_upsert(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("surgical.manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.surgical_service import upsert_profile

    result = upsert_profile(session, auth, body or {})
    session.commit()
    return result


@router.get("/surgical/stock")
def surgical_stock(
    auth: Annotated[AuthContext, Depends(require_permission("surgical.view"))],
    session: Annotated[Session, Depends(get_session)],
    product_id: Optional[str] = None,
    store_id: Optional[str] = None,
    status: Optional[str] = None,
    sterile_status: Optional[str] = None,
    batch_no: Optional[str] = None,
    lot_no: Optional[str] = None,
    serial_no: Optional[str] = None,
    manufacturer: Optional[str] = None,
    q: Optional[str] = None,
    sellable_only: bool = False,
):
    from app.services.surgical_service import list_stock_units

    return list_stock_units(
        session,
        auth.company_id,
        product_id=product_id,
        store_id=store_id,
        status=status,
        sterile_status=sterile_status,
        batch_no=batch_no,
        lot_no=lot_no,
        serial_no=serial_no,
        manufacturer=manufacturer,
        q=q,
        sellable_only=sellable_only,
    )


@router.get("/surgical/stock/{product_id}")
def surgical_stock_for_product(
    product_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("surgical.view"))],
    session: Annotated[Session, Depends(get_session)],
    sellable_only: bool = False,
):
    from app.services.surgical_service import list_stock_units

    return list_stock_units(
        session,
        auth.company_id,
        product_id=product_id,
        sellable_only=sellable_only,
    )


@router.get("/surgical/expiry")
def surgical_expiry(
    auth: Annotated[AuthContext, Depends(require_permission("surgical.view"))],
    session: Annotated[Session, Depends(get_session)],
    near_days: int = 90,
    expired_only: bool = False,
    product_id: Optional[str] = None,
    store_id: Optional[str] = None,
    manufacturer: Optional[str] = None,
    q: Optional[str] = None,
):
    from app.services.surgical_service import list_stock_units

    return list_stock_units(
        session,
        auth.company_id,
        product_id=product_id,
        store_id=store_id,
        manufacturer=manufacturer,
        q=q,
        near_days=None if expired_only else near_days,
        expired_only=expired_only,
    )


@router.post("/surgical/stock/{unit_id}/quarantine")
def surgical_quarantine(
    unit_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("surgical.quarantine"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.surgical_service import quarantine_unit

    result = quarantine_unit(session, auth, unit_id, body or {})
    session.commit()
    return result


@router.post("/surgical/stock/{unit_id}/release")
def surgical_release(
    unit_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("surgical.release"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.surgical_service import release_unit

    result = release_unit(session, auth, unit_id, body or {})
    session.commit()
    return result


@router.get("/surgical/recalls")
def surgical_recalls(
    auth: Annotated[AuthContext, Depends(require_permission("surgical.view"))],
    session: Annotated[Session, Depends(get_session)],
    status: Optional[str] = None,
):
    from app.services.surgical_service import list_recalls

    return list_recalls(session, auth.company_id, status=status)


@router.post("/surgical/recalls")
def surgical_recall_create(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("surgical.recall"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.surgical_service import create_recall

    result = create_recall(session, auth, body or {})
    session.commit()
    return result


@router.get("/surgical/recalls/{recall_id}")
def surgical_recall_get(
    recall_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("surgical.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.surgical_service import get_recall

    return get_recall(session, auth, recall_id)


@router.post("/surgical/recalls/{recall_id}/close")
def surgical_recall_close(
    recall_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("surgical.recall_close"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.surgical_service import close_recall

    result = close_recall(session, auth, recall_id, body or {})
    session.commit()
    return result


@router.get("/jewelry/gold-rate")
def gold_rate(
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.rate_view"))],
    session: Annotated[Session, Depends(get_session)],
    metal_type: str = "Gold",
    karat: str = "22K",
):
    from app.services.jewelry_service import get_effective_rate

    return get_effective_rate(session, auth.company_id, metal_type=metal_type, karat=karat)


@router.get("/jewelry/rates")
def list_jewelry_rates(
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.rate_view"))],
    session: Annotated[Session, Depends(get_session)],
    metal_type: Optional[str] = None,
    karat: Optional[str] = None,
    limit: int = 50,
):
    from app.services.jewelry_service import list_metal_rates

    return list_metal_rates(
        session, auth.company_id,
        metal_type=metal_type, karat=karat, limit=max(1, min(limit, 500)),
    )


@router.post("/jewelry/rates")
def create_jewelry_rate(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.rate_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.jewelry_service import create_metal_rate

    result = create_metal_rate(session, auth, body)
    session.commit()
    return result


@router.get("/jewelry/profiles")
def list_jewelry_profiles(
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.view"))],
    session: Annotated[Session, Depends(get_session)],
    karat: Optional[str] = None,
    q: Optional[str] = None,
):
    from app.services.jewelry_service import list_profiles

    return list_profiles(session, auth.company_id, karat=karat, q=q)


@router.get("/jewelry/profiles/{product_id}")
def get_jewelry_profile(
    product_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.jewelry_service import get_product_profile

    row = get_product_profile(session, auth.company_id, product_id)
    if not row:
        raise HTTPException(status_code=404, detail="Jewelry profile not found")
    return row


@router.put("/jewelry/profiles/{product_id}")
def upsert_jewelry_profile(
    product_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.jewelry_service import upsert_product_profile

    result = upsert_product_profile(session, auth, product_id, body)
    session.commit()
    return result


@router.get("/jewelry/certificates")
def list_jewelry_certificates(
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.certificate_manage"))],
    session: Annotated[Session, Depends(get_session)],
    status: Optional[str] = None,
    q: Optional[str] = None,
):
    from app.services.jewelry_service import list_certificates

    return list_certificates(session, auth.company_id, status=status, q=q)


@router.post("/jewelry/certificates")
def create_jewelry_certificate(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.certificate_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.jewelry_service import create_certificate

    result = create_certificate(session, auth, body)
    session.commit()
    return result


@router.get("/jewelry/certificates/lookup/{code}")
def lookup_jewelry_certificate(
    code: str,
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.jewelry_service import _cert_out, find_certificate

    row = find_certificate(session, auth.company_id, code)
    if not row:
        raise HTTPException(status_code=404, detail="Certificate not found")
    from app.models.product import Product

    product = session.get(Product, row.product_id)
    return _cert_out(row, product)


@router.post("/jewelry/quote")
def jewelry_quote(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.jewelry_service import quote_sale_line

    return quote_sale_line(session, auth, body)


@router.get("/jewelry/buybacks")
def list_jewelry_buybacks(
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.buyback"))],
    session: Annotated[Session, Depends(get_session)],
    status: Optional[str] = None,
):
    from app.services.jewelry_service import list_buybacks

    return list_buybacks(session, auth.company_id, status=status)


@router.post("/jewelry/buybacks")
def create_jewelry_buyback(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.buyback"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.jewelry_service import create_buyback

    result = create_buyback(session, auth, body)
    session.commit()
    return result


@router.patch("/jewelry/buybacks/{buyback_id}")
def update_jewelry_buyback(
    buyback_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.buyback"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.jewelry_service import update_buyback_status

    result = update_buyback_status(session, auth, buyback_id, body)
    session.commit()
    return result


@router.get("/jewelry/dashboard")
def jewelry_dashboard(
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.jewelry_service import get_jewelry_dashboard_stats
    return get_jewelry_dashboard_stats(session, auth.company_id, store_id=auth.store_id)


# ── Karigars (Artisans) Endpoints ─────────────────────────────────────────────

@router.get("/jewelry/karigars")
def list_jewelry_karigars(
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.view"))],
    session: Annotated[Session, Depends(get_session)],
    status: Optional[str] = None,
    q: Optional[str] = None,
):
    from app.services.jewelry_service import list_karigars
    return list_karigars(session, auth.company_id, status=status, q=q)


@router.post("/jewelry/karigars")
def create_jewelry_karigar(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.jewelry_service import create_karigar
    res = create_karigar(session, auth, body)
    session.commit()
    return res


@router.get("/jewelry/karigars/{karigar_id}")
def get_jewelry_karigar(
    karigar_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.jewelry_service import get_karigar
    return get_karigar(session, auth.company_id, karigar_id)


@router.patch("/jewelry/karigars/{karigar_id}")
def update_jewelry_karigar(
    karigar_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.jewelry_service import update_karigar
    res = update_karigar(session, auth, karigar_id, body)
    session.commit()
    return res


@router.get("/jewelry/karigars/{karigar_id}/ledger")
def get_jewelry_karigar_ledger(
    karigar_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.jewelry_service import get_karigar_ledger
    return get_karigar_ledger(session, auth.company_id, karigar_id)


# ── Production Work Orders Endpoints ──────────────────────────────────────────

@router.get("/jewelry/work-orders")
def list_jewelry_work_orders(
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.view"))],
    session: Annotated[Session, Depends(get_session)],
    status: Optional[str] = None,
    stage: Optional[str] = None,
    karigar_id: Optional[str] = None,
    q: Optional[str] = None,
):
    from app.services.jewelry_service import list_work_orders
    return list_work_orders(session, auth.company_id, status=status, stage=stage, karigar_id=karigar_id, q=q)


@router.post("/jewelry/work-orders")
def create_jewelry_work_order(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.jewelry_service import create_work_order
    res = create_work_order(session, auth, body)
    session.commit()
    return res


@router.get("/jewelry/work-orders/{work_order_id}")
def get_jewelry_work_order(
    work_order_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.jewelry_service import get_work_order
    return get_work_order(session, auth.company_id, work_order_id)


@router.patch("/jewelry/work-orders/{work_order_id}/stage")
def update_jewelry_work_order_stage(
    work_order_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.jewelry_service import update_work_order_stage
    res = update_work_order_stage(session, auth, work_order_id, body)
    session.commit()
    return res


@router.post("/jewelry/work-orders/{work_order_id}/issue-material")
def issue_material_to_jewelry_work_order(
    work_order_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.jewelry_service import issue_material_to_work_order
    res = issue_material_to_work_order(session, auth, work_order_id, body)
    session.commit()
    return res


@router.post("/jewelry/work-orders/{work_order_id}/return-material")
def return_material_from_jewelry_work_order(
    work_order_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.jewelry_service import return_material_from_work_order
    res = return_material_from_work_order(session, auth, work_order_id, body)
    session.commit()
    return res


@router.post("/jewelry/work-orders/{work_order_id}/record-recovery")
def record_recovery_for_jewelry_work_order(
    work_order_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.jewelry_service import record_production_recovery
    res = record_production_recovery(session, auth, work_order_id, body)
    session.commit()
    return res


@router.post("/jewelry/work-orders/{work_order_id}/reconcile")
def reconcile_jewelry_work_order(
    work_order_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.jewelry_service import reconcile_work_order
    res = reconcile_work_order(session, auth, work_order_id, body)
    session.commit()
    return res


@router.post("/jewelry/work-orders/{work_order_id}/complete-and-tag")
def complete_and_tag_jewelry_work_order(
    work_order_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.jewelry_service import complete_and_tag_work_order
    res = complete_and_tag_work_order(session, auth, work_order_id, body)
    session.commit()
    return res


# ── Karigar Billing Endpoints ─────────────────────────────────────────────────

@router.get("/jewelry/karigar-bills")
def list_jewelry_karigar_bills(
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.view"))],
    session: Annotated[Session, Depends(get_session)],
    karigar_id: Optional[str] = None,
    payment_status: Optional[str] = None,
):
    from app.services.jewelry_service import list_karigar_bills
    return list_karigar_bills(session, auth.company_id, karigar_id=karigar_id, payment_status=payment_status)


@router.post("/jewelry/karigar-bills")
def create_jewelry_karigar_bill(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.jewelry_service import create_karigar_bill
    res = create_karigar_bill(session, auth, body)
    session.commit()
    return res


@router.post("/jewelry/karigar-bills/{bill_id}/pay")
def pay_jewelry_karigar_bill(
    bill_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.jewelry_service import pay_karigar_bill
    res = pay_karigar_bill(session, auth, bill_id, body)
    session.commit()
    return res


# ── Custom Customer Orders & Advances Endpoints ───────────────────────────────

@router.get("/jewelry/custom-orders")
def list_jewelry_custom_orders(
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.view"))],
    session: Annotated[Session, Depends(get_session)],
    status: Optional[str] = None,
    q: Optional[str] = None,
):
    from app.services.jewelry_service import list_custom_orders
    return list_custom_orders(session, auth.company_id, status=status, q=q)


@router.post("/jewelry/custom-orders")
def create_jewelry_custom_order(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.jewelry_service import create_custom_order
    res = create_custom_order(session, auth, body)
    session.commit()
    return res


@router.get("/jewelry/custom-orders/{order_id}")
def get_jewelry_custom_order(
    order_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.jewelry_service import get_custom_order
    return get_custom_order(session, auth.company_id, order_id)


@router.post("/jewelry/custom-orders/{order_id}/advances")
def record_jewelry_order_advance(
    order_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.jewelry_service import record_order_advance
    res = record_order_advance(session, auth, order_id, body)
    session.commit()
    return res


@router.post("/jewelry/custom-orders/{order_id}/deliver")
def deliver_jewelry_custom_order(
    order_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.jewelry_service import deliver_custom_order
    res = deliver_custom_order(session, auth, order_id, body)
    session.commit()
    return res


# ── Melting Lots Endpoints ───────────────────────────────────────────────────

@router.get("/jewelry/melting-lots")
def list_jewelry_melting_lots(
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.view"))],
    session: Annotated[Session, Depends(get_session)],
    status: Optional[str] = None,
):
    from app.services.jewelry_service import list_melting_lots
    return list_melting_lots(session, auth.company_id, status=status)


@router.post("/jewelry/melting-lots")
def create_jewelry_melting_lot(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.jewelry_service import create_melting_lot
    res = create_melting_lot(session, auth, body)
    session.commit()
    return res


@router.post("/jewelry/melting-lots/{lot_id}/process-melt")
def process_jewelry_melting_lot(
    lot_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.jewelry_service import process_melting_lot
    res = process_melting_lot(session, auth, lot_id, body)
    session.commit()
    return res


# ── Exchange Credits Endpoints ────────────────────────────────────────────────

@router.get("/jewelry/exchange-credits")
def list_jewelry_exchange_credits(
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.view"))],
    session: Annotated[Session, Depends(get_session)],
    status: Optional[str] = None,
    q: Optional[str] = None,
):
    from app.services.jewelry_service import list_exchange_credits
    return list_exchange_credits(session, auth.company_id, status=status, q=q)


@router.post("/jewelry/exchange-credits")
def create_jewelry_exchange_credit(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.buyback"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.jewelry_service import create_exchange_credit
    res = create_exchange_credit(session, auth, body)
    session.commit()
    return res


@router.get("/jewelry/exchange-credits/{credit_code}/balance")
def get_jewelry_exchange_credit_balance(
    credit_code: str,
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.jewelry_service import get_exchange_credit_balance
    return get_exchange_credit_balance(session, auth.company_id, credit_code)


@router.post("/jewelry/exchange-credits/{credit_code}/redeem")
def redeem_jewelry_exchange_credit(
    credit_code: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.sell"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.jewelry_service import redeem_exchange_credit
    amount = float(body.get("amount") or 0)
    res = redeem_exchange_credit(session, auth, credit_code, amount)
    session.commit()
    return res


# ── Fine Gold Stock Position & Units Endpoints ────────────────────────────────

@router.get("/jewelry/fine-gold-position")
def get_jewelry_fine_gold_position(
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.jewelry_service import get_fine_gold_position_report
    return get_fine_gold_position_report(session, auth.company_id)


@router.get("/jewelry/units/grams-to-bhori")
def convert_grams_to_bhori(
    grams: float,
    auth: Annotated[AuthContext, Depends(require_permission("jewelry.view"))],
):
    from app.services.jewelry_service import grams_to_bhori
    return grams_to_bhori(grams)



@router.get("/electronics/serials/validate/{serial}")
def validate_serial(
    serial: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    product_id: Optional[str] = None,
):
    from app.services.electronics_service import validate_serial_for_sale

    return validate_serial_for_sale(session, auth, serial=serial, product_id=product_id, store_id=auth.store_id)


@router.get("/electronics/serials")
def list_electronics_serials(
    auth: Annotated[AuthContext, Depends(require_permission("electronics.manage"))],
    session: Annotated[Session, Depends(get_session)],
    product_id: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
    store_id: Optional[str] = None,
    industry_pack: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
):
    from app.services.electronics_service import list_serials

    return list_serials(
        session,
        auth.company_id,
        product_id=product_id,
        status=status,
        q=q,
        store_id=store_id or auth.store_id,
        industry_pack=industry_pack,
        limit=limit,
        offset=offset,
    )


@router.get("/electronics/warranties")
def list_electronics_warranties(
    auth: Annotated[AuthContext, Depends(require_permission("electronics.warranty_manage"))],
    session: Annotated[Session, Depends(get_session)],
    status: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
):
    from app.services.electronics_service import list_warranties

    return list_warranties(
        session, auth.company_id, status=status, q=q, limit=limit, offset=offset
    )


@router.post("/electronics/warranties")
def create_electronics_warranty(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("electronics.warranty_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.electronics_service import register_warranty

    result = register_warranty(session, auth, body)
    session.commit()
    return result


@router.get("/electronics/rma")
def list_rma(
    auth: Annotated[AuthContext, Depends(require_permission("electronics.rma_manage"))],
    session: Annotated[Session, Depends(get_session)],
    status: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
):
    from app.services.electronics_service import list_rma as list_rma_svc

    return list_rma_svc(
        session, auth.company_id, status=status, q=q, limit=limit, offset=offset
    )


@router.post("/electronics/rma")
def create_rma(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("electronics.rma_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.electronics_service import create_rma as create_rma_svc

    result = create_rma_svc(session, auth, body)
    session.commit()
    return result


@router.patch("/electronics/rma/{rma_id}")
def update_rma(
    rma_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("electronics.rma_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.electronics_service import update_rma_status

    result = update_rma_status(session, auth, rma_id, body)
    session.commit()
    return result


# --- Electronics Dashboard (electronics-only) ---
@router.get("/electronics/dashboard")
def electronics_dashboard(
    auth: Annotated[AuthContext, Depends(require_permission("electronics.manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.electronics_service import get_dashboard_stats
    return get_dashboard_stats(session, auth.company_id, store_id=auth.store_id)


# --- Electronics AMC (electronics-only) ---
@router.get("/electronics/amc")
def list_electronics_amc(
    auth: Annotated[AuthContext, Depends(require_permission("electronics.warranty_manage"))],
    session: Annotated[Session, Depends(get_session)],
    status: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
):
    from app.services.electronics_service import list_amc
    return list_amc(session, auth.company_id, status=status, q=q, limit=limit, offset=offset)


@router.post("/electronics/amc")
def create_electronics_amc(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("electronics.warranty_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.electronics_service import create_amc
    result = create_amc(session, auth, body)
    session.commit()
    return result


@router.patch("/electronics/amc/{amc_id}")
def update_electronics_amc(
    amc_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("electronics.warranty_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.electronics_service import update_amc
    result = update_amc(session, auth, amc_id, body)
    session.commit()
    return result


# --- Electronics EMI (electronics-only) ---
@router.get("/electronics/emi")
def list_electronics_emi(
    auth: Annotated[AuthContext, Depends(require_permission("electronics.emi_manage"))],
    session: Annotated[Session, Depends(get_session)],
    status: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
):
    from app.services.electronics_service import list_emi
    return list_emi(session, auth.company_id, status=status, q=q, limit=limit, offset=offset)


@router.post("/electronics/emi")
def create_electronics_emi(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("electronics.emi_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.electronics_service import create_emi
    result = create_emi(session, auth, body)
    session.commit()
    return result


@router.get("/electronics/emi/{emi_id}")
def get_electronics_emi(
    emi_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("electronics.emi_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.electronics_service import get_emi_schedule
    return get_emi_schedule(session, auth, emi_id)


@router.get("/electronics/emi/{emi_id}/schedule")
def get_electronics_emi_schedule(
    emi_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("electronics.emi_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.electronics_service import get_emi_schedule
    return get_emi_schedule(session, auth, emi_id)


@router.patch("/electronics/emi/{emi_id}")
def update_electronics_emi(
    emi_id: str,
    body: dict,
    # Status override writes off a receivable — supervisor-only, unlike the rest
    # of the EMI surface which a cashier needs to serve customers.
    auth: Annotated[AuthContext, Depends(require_permission("electronics.emi_status_override"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.electronics_service import update_emi_status
    result = update_emi_status(session, auth, emi_id, body)
    session.commit()
    return result


@router.post("/electronics/emi/{emi_id}/installments/{installment_id}/collect")
def collect_emi_installment(
    emi_id: str,
    installment_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("electronics.emi_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.electronics_service import collect_installment
    result = collect_installment(session, auth, emi_id, installment_id, body)
    session.commit()
    return result


# --- Tailoring ---
@router.get("/tailoring/alterations")
def list_tailoring_alterations(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    status: Optional[str] = None,
):
    q = select(TailoringAlterationJob).where(TailoringAlterationJob.company_id == auth.company_id)
    if status:
        q = q.where(TailoringAlterationJob.status == status)
    rows = session.exec(q.order_by(TailoringAlterationJob.due_date)).all()
    return [
        {
            "id": r.id,
            "job_no": r.job_no,
            "customer_name": r.customer_name,
            "customer_phone": r.customer_phone,
            "garment_type": r.garment_type,
            "alteration_task": r.alteration_task,
            "master_name": r.master_name,
            "status": r.status,
            "due_date": r.due_date.isoformat() if r.due_date else None,
            "measurement_note": r.measurement_note,
            "invoice_number": r.invoice_number,
            "amount": r.amount,
        }
        for r in rows
    ]


@router.post("/tailoring/alterations")
def create_tailoring_alteration(
    body: dict,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    job_no = body.get("job_no") or f"ALT-{datetime.now().strftime('%y%m%d%H%M')}"
    due = body.get("due_date")
    row = TailoringAlterationJob(
        company_id=auth.company_id,
        job_no=job_no,
        customer_name=body.get("customer_name", "Walk-in"),
        customer_phone=body.get("customer_phone"),
        garment_type=body.get("garment_type", "Shirt"),
        alteration_task=body.get("alteration_task", "Hem"),
        master_name=body.get("master_name", "Walk-in"),
        status=body.get("status", "pending"),
        due_date=datetime.fromisoformat(due) if due else None,
        measurement_note=body.get("measurement_note"),
        invoice_number=body.get("invoice_number"),
        amount=float(body.get("amount", 0)),
    )
    session.add(row)
    write_audit(session, auth, "tailoring_alteration_create", "tailoring_alteration_job", row.id)
    session.commit()
    session.refresh(row)
    return row


@router.patch("/tailoring/alterations/{job_id}")
def update_tailoring_alteration(
    job_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    row = session.get(TailoringAlterationJob, job_id)
    if not row or row.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Job not found")
    old_status = row.status
    if "status" in body:
        row.status = body["status"]
    if "master_name" in body:
        row.master_name = body["master_name"]
    if "measurement_note" in body:
        row.measurement_note = body["measurement_note"]
    if "due_date" in body:
        row.due_date = datetime.fromisoformat(body["due_date"]) if body["due_date"] else None
    
    session.add(row)
    
    # Automatically record commission when job status transitions to collected
    if "status" in body and body["status"] == "collected" and old_status != "collected":
        existing = session.exec(
            select(TailorCommissionLedger).where(
                TailorCommissionLedger.company_id == auth.company_id,
                TailorCommissionLedger.job_id == row.id
            )
        ).first()
        if not existing and row.amount > 0 and row.master_name:
            pct = 15.0  # 15% standard commission
            payout = round(row.amount * (pct / 100.0), 2)
            commission = TailorCommissionLedger(
                company_id=auth.company_id,
                tailor_name=row.master_name,
                job_id=row.id,
                job_amount=row.amount,
                commission_pct=pct,
                payout_amount=payout,
                status="unpaid"
            )
            session.add(commission)
            write_audit(session, auth, "tailor_commission_create", "tailor_commission_ledger", commission.id)
            
    write_audit(session, auth, "tailoring_alteration_update", "tailoring_alteration_job", row.id)
    session.commit()
    session.refresh(row)
    return row


# --- Tailoring Commissions & Fabrics endpoints ---
@router.get("/tailoring/commissions")
def list_tailor_commissions(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    status: Optional[str] = None,
):
    q = select(TailorCommissionLedger).where(TailorCommissionLedger.company_id == auth.company_id)
    if status:
        q = q.where(TailorCommissionLedger.status == status)
    rows = session.exec(q.order_by(TailorCommissionLedger.created_at.desc())).all()  # type: ignore
    return [
        {
            "id": r.id,
            "tailor_name": r.tailor_name,
            "job_id": r.job_id,
            "job_amount": r.job_amount,
            "commission_pct": r.commission_pct,
            "payout_amount": r.payout_amount,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.post("/tailoring/commissions/{id}/pay")
def pay_tailor_commission(
    id: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    method: str = "cash",
):
    row = session.get(TailorCommissionLedger, id)
    if not row or row.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Commission record not found")
    if row.status == "paid":
        raise HTTPException(status_code=400, detail="Commission already paid")

    pay_code = "1011" if method.lower() == "cash" else "1012"
    from app.models.accounting import Account
    from app.services.accounting_service import post_journal_entry
    from datetime import datetime, timezone

    credit_acc = session.exec(
        select(Account).where(Account.company_id == auth.company_id, Account.code == pay_code)
    ).first()
    if not credit_acc:
        raise HTTPException(status_code=400, detail=f"Payout account code {pay_code} not found")

    debit_acc = session.exec(
        select(Account).where(Account.company_id == auth.company_id, Account.code == "5200")
    ).first()
    if not debit_acc:
        raise HTTPException(status_code=400, detail="Operating Expenses account 5200 not found")

    # Post balanced journal entry
    entry = post_journal_entry(
        session,
        company_id=auth.company_id,
        created_by=auth.user_id,
        entry_date=datetime.now(timezone.utc),
        source_type="expense",
        source_id=row.id,
        memo=f"Tailor commission payout to {row.tailor_name} for job {row.job_id}",
        lines=[
            {"account_id": debit_acc.id, "debit": row.payout_amount, "credit": 0.0},
            {"account_id": credit_acc.id, "debit": 0.0, "credit": row.payout_amount},
        ]
    )

    row.status = "paid"
    session.add(row)
    write_audit(session, auth, "tailor_commission_pay", "tailor_commission_ledger", row.id)
    session.commit()
    return {"id": row.id, "status": "paid", "journal_entry_id": entry.id}



@router.get("/tailoring/fabrics")
def list_customer_fabrics(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    status: Optional[str] = None,
):
    q = select(CustomerFabricIntake).where(CustomerFabricIntake.company_id == auth.company_id)
    if status:
        q = q.where(CustomerFabricIntake.status == status)
    rows = session.exec(q.order_by(CustomerFabricIntake.created_at.desc())).all()  # type: ignore
    return [
        {
            "id": r.id,
            "customer_name": r.customer_name,
            "customer_phone": r.customer_phone,
            "description": r.description,
            "status": r.status,
            "job_id": r.job_id,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.post("/tailoring/fabrics")
def create_customer_fabric(
    body: dict,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    desc = str(body.get("description") or "").strip()
    if not desc:
        raise HTTPException(status_code=400, detail="description is required")
    row = CustomerFabricIntake(
        company_id=auth.company_id,
        customer_name=body.get("customer_name", "Walk-in"),
        customer_phone=body.get("customer_phone", ""),
        description=desc,
        status=body.get("status", "received"),
        job_id=body.get("job_id"),
    )
    session.add(row)
    write_audit(session, auth, "customer_fabric_create", "customer_fabric_intake", row.id)
    session.commit()
    session.refresh(row)
    return row


@router.patch("/tailoring/fabrics/{id}")
def update_customer_fabric(
    id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    row = session.get(CustomerFabricIntake, id)
    if not row or row.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Fabric record not found")
    if "status" in body:
        row.status = body["status"]
    if "description" in body:
        row.description = body["description"]
    if "customer_name" in body:
        row.customer_name = body["customer_name"]
    if "customer_phone" in body:
        row.customer_phone = body["customer_phone"]
    if "job_id" in body:
        row.job_id = body["job_id"]
    session.add(row)
    write_audit(session, auth, "customer_fabric_update", "customer_fabric_intake", row.id)
    session.commit()
    session.refresh(row)
    return row




# --- Rice mill ---
@router.get("/rice-mill/variety-stock")
def list_rice_variety_stock(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    rows = session.exec(
        select(RiceMillVarietyStock).where(RiceMillVarietyStock.company_id == auth.company_id)
    ).all()
    return [
        {
            "id": r.id,
            "variety": r.variety,
            "grade": r.grade,
            "rate_per_kg": r.rate_per_kg,
            "qty_kg": r.qty_kg,
            "bag_count": r.bag_count,
            "reorder_kg": r.reorder_kg,
            "low_stock": r.qty_kg <= r.reorder_kg,
        }
        for r in rows
    ]


@router.post("/rice-mill/variety-stock")
def upsert_rice_variety_stock(
    body: dict,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    row_id = body.get("id")
    if row_id:
        row = session.get(RiceMillVarietyStock, row_id)
        if not row or row.company_id != auth.company_id:
            raise HTTPException(status_code=404, detail="Variety stock not found")
    else:
        row = RiceMillVarietyStock(company_id=auth.company_id, store_id=auth.store_id)
    row.variety = body.get("variety", row.variety or "Miniket")
    row.grade = body.get("grade", row.grade or "Standard")
    row.rate_per_kg = float(body.get("rate_per_kg", row.rate_per_kg or 0))
    row.qty_kg = float(body.get("qty_kg", row.qty_kg or 0))
    row.bag_count = int(body.get("bag_count", row.bag_count or 0))
    row.reorder_kg = float(body.get("reorder_kg", row.reorder_kg or 100))
    session.add(row)
    write_audit(session, auth, "rice_variety_upsert", "rice_mill_variety_stock", row.id)
    session.commit()
    session.refresh(row)
    return row


# --- Furniture ---
@router.get("/furniture/deliveries")
def list_furniture_deliveries(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    status: Optional[str] = None,
):
    q = select(FurnitureDeliveryOrder).where(FurnitureDeliveryOrder.company_id == auth.company_id)
    if status:
        q = q.where(FurnitureDeliveryOrder.status == status)
    rows = session.exec(q.order_by(FurnitureDeliveryOrder.scheduled_date)).all()
    return [
        {
            "id": r.id,
            "delivery_no": r.delivery_no,
            "customer_name": r.customer_name,
            "customer_phone": r.customer_phone,
            "delivery_address": r.delivery_address,
            "items_summary": r.items_summary,
            "assembly_required": r.assembly_required,
            "assembly_fee": r.assembly_fee,
            "scheduled_date": r.scheduled_date.isoformat() if r.scheduled_date else None,
            "status": r.status,
            "driver_note": r.driver_note,
        }
        for r in rows
    ]


@router.post("/furniture/deliveries")
def create_furniture_delivery(
    body: dict,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    delivery_no = body.get("delivery_no") or f"DLV-{datetime.now().strftime('%y%m%d%H%M')}"
    sched = body.get("scheduled_date")
    row = FurnitureDeliveryOrder(
        company_id=auth.company_id,
        delivery_no=delivery_no,
        customer_name=body.get("customer_name", "Walk-in"),
        customer_phone=body.get("customer_phone"),
        delivery_address=body.get("delivery_address", ""),
        items_summary=body.get("items_summary", ""),
        assembly_required=bool(body.get("assembly_required", False)),
        assembly_fee=float(body.get("assembly_fee", 0)),
        scheduled_date=datetime.fromisoformat(sched) if sched else None,
        status=body.get("status", "scheduled"),
        driver_note=body.get("driver_note"),
    )
    session.add(row)
    write_audit(session, auth, "furniture_delivery_create", "furniture_delivery_order", row.id)
    session.commit()
    session.refresh(row)
    return row


@router.patch("/furniture/deliveries/{delivery_id}")
def update_furniture_delivery(
    delivery_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    row = session.get(FurnitureDeliveryOrder, delivery_id)
    if not row or row.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Delivery not found")
    if "status" in body:
        row.status = body["status"]
    if "driver_note" in body:
        row.driver_note = body["driver_note"]
    if "scheduled_date" in body:
        row.scheduled_date = datetime.fromisoformat(body["scheduled_date"]) if body["scheduled_date"] else None
    session.add(row)
    write_audit(session, auth, "furniture_delivery_update", "furniture_delivery_order", row.id)
    session.commit()
    session.refresh(row)
    return row


# --- Mobile Shop ---
@router.get("/mobile/profiles")
def mobile_profiles(
    auth: Annotated[AuthContext, Depends(require_permission("mobile.view"))],
    session: Annotated[Session, Depends(get_session)],
    q: Optional[str] = None,
):
    from app.services.mobile_service import list_profiles

    return list_profiles(session, auth.company_id, q=q)


@router.post("/mobile/profiles")
def mobile_profile_upsert(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("mobile.manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.mobile_service import upsert_profile

    result = upsert_profile(session, auth, body or {})
    session.commit()
    return result


@router.get("/mobile/devices")
def mobile_devices(
    auth: Annotated[AuthContext, Depends(require_permission("mobile.view"))],
    session: Annotated[Session, Depends(get_session)],
    product_id: Optional[str] = None,
    store_id: Optional[str] = None,
    status: Optional[str] = None,
    condition: Optional[str] = None,
    brand: Optional[str] = None,
    q: Optional[str] = None,
    sellable_only: bool = False,
):
    from app.services.mobile_service import list_devices

    return list_devices(
        session,
        auth.company_id,
        product_id=product_id,
        store_id=store_id or auth.store_id,
        status=status,
        condition=condition,
        brand=brand,
        q=q,
        sellable_only=sellable_only,
    )


@router.get("/mobile/devices/validate/{serial}")
def mobile_device_validate(
    serial: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    product_id: Optional[str] = None,
):
    from app.services.electronics_service import validate_serial_for_sale

    return validate_serial_for_sale(session, auth, serial=serial, product_id=product_id, store_id=auth.store_id)


@router.get("/mobile/trade-ins")
def mobile_trade_ins(
    auth: Annotated[AuthContext, Depends(require_permission("mobile.view"))],
    session: Annotated[Session, Depends(get_session)],
    status: Optional[str] = None,
):
    from app.services.mobile_service import list_trade_ins

    return list_trade_ins(session, auth.company_id, status=status)


@router.post("/mobile/trade-ins")
def mobile_trade_in_create(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("mobile.trade_in"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.mobile_service import create_trade_in

    result = create_trade_in(session, auth, body or {})
    session.commit()
    return result


@router.get("/mobile/trade-ins/{trade_in_id}")
def mobile_trade_in_get(
    trade_in_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("mobile.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.mobile_service import get_trade_in

    return get_trade_in(session, auth, trade_in_id)


@router.post("/mobile/trade-ins/{trade_in_id}/status")
def mobile_trade_in_status(
    trade_in_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("mobile.trade_in"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.mobile_service import update_trade_in_status

    result = update_trade_in_status(session, auth, trade_in_id, body or {})
    session.commit()
    return result


# --- Salon ---
@router.get("/salon/services")
def salon_services(
    auth: Annotated[AuthContext, Depends(require_permission("salon.view"))],
    session: Annotated[Session, Depends(get_session)],
    q: Optional[str] = None,
    category: Optional[str] = None,
    active_only: bool = False,
):
    from app.services.salon_service import list_services

    return list_services(session, auth.company_id, q=q, category=category, active_only=active_only)


@router.post("/salon/services")
def salon_service_upsert(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("salon.service_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.salon_service import upsert_service

    result = upsert_service(session, auth, body or {})
    session.commit()
    return result


@router.get("/salon/staff")
def salon_staff(
    auth: Annotated[AuthContext, Depends(require_permission("salon.view"))],
    session: Annotated[Session, Depends(get_session)],
    active_only: bool = False,
):
    from app.services.salon_service import list_staff

    return list_staff(session, auth.company_id, active_only=active_only)


@router.post("/salon/staff")
def salon_staff_upsert(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("salon.staff_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.salon_service import upsert_staff

    result = upsert_staff(session, auth, body or {})
    session.commit()
    return result


@router.post("/salon/staff/{staff_id}/services")
def salon_staff_set_services(
    staff_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("salon.staff_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.salon_service import set_staff_services

    result = set_staff_services(session, auth, staff_id, body.get("service_ids") or [])
    session.commit()
    return result


@router.get("/salon/staff/{staff_id}/services")
def salon_staff_services(
    staff_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("salon.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.salon_service import list_staff_services

    return list_staff_services(session, auth.company_id, staff_id)


@router.get("/salon/resources")
def salon_resources(
    auth: Annotated[AuthContext, Depends(require_permission("salon.view"))],
    session: Annotated[Session, Depends(get_session)],
    store_id: Optional[str] = None,
):
    from app.services.salon_service import list_resources

    return list_resources(session, auth.company_id, store_id=store_id or auth.store_id)


@router.post("/salon/resources")
def salon_resource_upsert(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("salon.resource_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.salon_service import upsert_resource

    result = upsert_resource(session, auth, body or {})
    session.commit()
    return result


@router.get("/salon/appointments")
def salon_appointments(
    auth: Annotated[AuthContext, Depends(require_permission("salon.view"))],
    session: Annotated[Session, Depends(get_session)],
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    status: Optional[str] = None,
    staff_id: Optional[str] = None,
    store_id: Optional[str] = None,
):
    from app.services.salon_service import list_appointments

    return list_appointments(
        session,
        auth.company_id,
        date_from=date_from,
        date_to=date_to,
        status=status,
        staff_id=staff_id,
        store_id=store_id or auth.store_id,
    )


@router.post("/salon/appointments")
def salon_appointment_create(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("salon.appointment_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.salon_service import create_appointment

    result = create_appointment(session, auth, body or {})
    session.commit()
    return result


@router.get("/salon/appointments/{appointment_id}")
def salon_appointment_get(
    appointment_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("salon.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.salon_service import get_appointment

    return get_appointment(session, auth, appointment_id)


@router.post("/salon/appointments/{appointment_id}/status")
def salon_appointment_status(
    appointment_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("salon.appointment_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.salon_service import update_appointment_status

    result = update_appointment_status(session, auth, appointment_id, body or {})
    session.commit()
    return result


@router.post("/salon/appointments/{appointment_id}/check-in")
def salon_appointment_check_in(
    appointment_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("salon.visit_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.salon_service import check_in_appointment

    result = check_in_appointment(session, auth, appointment_id)
    session.commit()
    return result


@router.get("/salon/visits")
def salon_visits(
    auth: Annotated[AuthContext, Depends(require_permission("salon.view"))],
    session: Annotated[Session, Depends(get_session)],
    status: Optional[str] = None,
    store_id: Optional[str] = None,
):
    from app.services.salon_service import list_visits

    return list_visits(session, auth.company_id, status=status, store_id=store_id or auth.store_id)


@router.post("/salon/visits/walk-in")
def salon_walk_in(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("salon.visit_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.salon_service import create_walk_in

    result = create_walk_in(session, auth, body or {})
    session.commit()
    return result


@router.get("/salon/visits/{visit_id}")
def salon_visit_get(
    visit_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("salon.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.salon_service import get_visit

    return get_visit(session, auth, visit_id)


@router.post("/salon/visits/{visit_id}/lines")
def salon_visit_add_line(
    visit_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("salon.visit_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.salon_service import add_visit_line

    result = add_visit_line(session, auth, visit_id, body or {})
    session.commit()
    return result


@router.post("/salon/visits/{visit_id}/lines/{line_id}/start")
def salon_visit_line_start(
    visit_id: str,
    line_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("salon.visit_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.salon_service import start_visit_line

    result = start_visit_line(session, auth, visit_id, line_id)
    session.commit()
    return result


@router.post("/salon/visits/{visit_id}/lines/{line_id}/complete")
def salon_visit_line_complete(
    visit_id: str,
    line_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("salon.visit_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.salon_service import complete_visit_line

    result = complete_visit_line(session, auth, visit_id, line_id)
    session.commit()
    return result


@router.post("/salon/visits/{visit_id}/tips")
def salon_visit_tip(
    visit_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("salon.visit_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.salon_service import add_tip

    result = add_tip(session, auth, visit_id, body or {})
    session.commit()
    return result


@router.post("/salon/visits/{visit_id}/checkout")
def salon_visit_checkout(
    visit_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("salon.visit_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.salon_service import checkout_visit

    result = checkout_visit(session, auth, visit_id, body or {})
    session.commit()
    return result


@router.get("/salon/commissions")
def salon_commissions(
    auth: Annotated[AuthContext, Depends(require_permission("salon.commission_view"))],
    session: Annotated[Session, Depends(get_session)],
    staff_id: Optional[str] = None,
    status: Optional[str] = None,
):
    from app.services.salon_service import list_commissions

    return list_commissions(session, auth.company_id, staff_id=staff_id, status=status)


# --- Hardware ---
@router.get("/hardware/profiles")
def hardware_profiles(
    auth: Annotated[AuthContext, Depends(require_permission("hardware.view"))],
    session: Annotated[Session, Depends(get_session)],
    q: Optional[str] = None,
    brand_id: Optional[str] = None,
    active_only: bool = True,
):
    from app.services.hardware_service import list_profiles

    return list_profiles(session, auth.company_id, q=q, brand_id=brand_id, active_only=active_only)


@router.post("/hardware/profiles")
def hardware_profile_upsert(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("hardware.manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.hardware_service import upsert_profile

    result = upsert_profile(session, auth, body or {})
    session.commit()
    return result


@router.get("/hardware/products/{product_id}/conversions")
def hardware_conversions(
    product_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("hardware.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.hardware_service import list_conversions

    return list_conversions(session, auth.company_id, product_id)


@router.post("/hardware/conversions")
def hardware_conversion_upsert(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("hardware.uom_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.hardware_service import upsert_conversion

    result = upsert_conversion(session, auth, body or {})
    session.commit()
    return result


@router.post("/hardware/convert")
def hardware_convert(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("hardware.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.hardware_service import convert_to_base

    return convert_to_base(
        session,
        auth.company_id,
        str(body.get("product_id") or ""),
        float(body.get("entered_qty") or body.get("qty") or 0),
        body.get("from_uom_id") or body.get("sales_uom_id"),
        for_sales=bool(body.get("for_sales", True)),
        for_purchase=bool(body.get("for_purchase", False)),
        variant_id=body.get("variant_id"),
    )


@router.post("/hardware/quote")
def hardware_quote(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("hardware.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.hardware_service import quote_price

    return quote_price(
        session,
        auth,
        product_id=str(body.get("product_id") or ""),
        entered_qty=float(body.get("entered_qty") or body.get("qty") or 0),
        sales_uom_id=body.get("sales_uom_id") or body.get("from_uom_id"),
        customer_id=body.get("customer_id"),
        variant_id=body.get("variant_id"),
        manual_unit_price=body.get("manual_unit_price"),
        override_reason=body.get("override_reason") or body.get("price_override_reason"),
    )


@router.get("/hardware/barcode/{barcode}")
def hardware_barcode(
    barcode: str,
    auth: Annotated[AuthContext, Depends(require_permission("hardware.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.hardware_service import resolve_barcode

    return resolve_barcode(session, auth.company_id, barcode)


@router.get("/hardware/customer-prices")
def hardware_customer_prices(
    auth: Annotated[AuthContext, Depends(require_permission("hardware.view"))],
    session: Annotated[Session, Depends(get_session)],
    product_id: Optional[str] = None,
    customer_id: Optional[str] = None,
):
    from app.services.hardware_service import list_customer_prices

    return list_customer_prices(session, auth.company_id, product_id=product_id, customer_id=customer_id)


@router.post("/hardware/customer-prices")
def hardware_customer_price_upsert(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("hardware.contractor_price_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.hardware_service import upsert_customer_price

    result = upsert_customer_price(session, auth, body or {})
    session.commit()
    return result


@router.get("/hardware/bulk-tiers")
def hardware_bulk_tiers(
    auth: Annotated[AuthContext, Depends(require_permission("hardware.view"))],
    session: Annotated[Session, Depends(get_session)],
    product_id: Optional[str] = None,
):
    from app.services.hardware_service import list_bulk_tiers

    return list_bulk_tiers(session, auth.company_id, product_id=product_id)


@router.post("/hardware/bulk-tiers")
def hardware_bulk_tier_upsert(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("hardware.pricing_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.hardware_service import upsert_bulk_tier

    result = upsert_bulk_tier(session, auth, body or {})
    session.commit()
    return result


# --- Building Materials ---
@router.get("/building/profiles")
def building_profiles(
    auth: Annotated[AuthContext, Depends(require_permission("building.view"))],
    session: Annotated[Session, Depends(get_session)],
    q: Optional[str] = None,
    material_type: Optional[str] = None,
    active_only: bool = True,
):
    from app.services.building_service import list_profiles

    return list_profiles(session, auth.company_id, q=q, material_type=material_type, active_only=active_only)


@router.post("/building/profiles")
def building_profile_upsert(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("building.manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.building_service import upsert_profile

    result = upsert_profile(session, auth, body or {})
    session.commit()
    return result


@router.get("/building/sites")
def building_sites(
    auth: Annotated[AuthContext, Depends(require_permission("building.view"))],
    session: Annotated[Session, Depends(get_session)],
    customer_id: Optional[str] = None,
    active_only: bool = True,
):
    from app.services.building_service import list_sites

    return list_sites(session, auth.company_id, customer_id=customer_id, active_only=active_only)


@router.post("/building/sites")
def building_site_upsert(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("building.manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.building_service import upsert_site

    result = upsert_site(session, auth, body or {})
    session.commit()
    return result


@router.get("/building/orders")
def building_orders(
    auth: Annotated[AuthContext, Depends(require_permission("building.view"))],
    session: Annotated[Session, Depends(get_session)],
    status: Optional[str] = None,
    customer_id: Optional[str] = None,
):
    from app.services.building_service import list_orders

    return list_orders(session, auth.company_id, status=status, customer_id=customer_id)


@router.post("/building/orders")
def building_order_create(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("building.order_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.building_service import create_order

    result = create_order(session, auth, body or {})
    session.commit()
    return result


@router.get("/building/orders/{order_id}")
def building_order_get(
    order_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("building.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.building_service import get_order

    return get_order(session, auth, order_id)


@router.put("/building/orders/{order_id}")
def building_order_update(
    order_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("building.order_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.building_service import update_order

    result = update_order(session, auth, order_id, body or {})
    session.commit()
    return result


@router.post("/building/orders/{order_id}/confirm")
def building_order_confirm(
    order_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("building.order_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.building_service import confirm_order

    result = confirm_order(session, auth, order_id, body or {})
    session.commit()
    return result


@router.post("/building/orders/{order_id}/cancel")
def building_order_cancel(
    order_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("building.cancel"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.building_service import cancel_order

    result = cancel_order(session, auth, order_id, body or {})
    session.commit()
    return result


@router.get("/building/deliveries")
def building_deliveries(
    auth: Annotated[AuthContext, Depends(require_permission("building.view"))],
    session: Annotated[Session, Depends(get_session)],
    order_id: Optional[str] = None,
    status: Optional[str] = None,
):
    from app.services.building_service import list_deliveries

    return list_deliveries(session, auth.company_id, order_id=order_id, status=status)


@router.post("/building/deliveries")
def building_delivery_create(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("building.delivery_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.building_service import create_delivery

    result = create_delivery(session, auth, body or {})
    session.commit()
    return result


@router.get("/building/deliveries/{delivery_id}")
def building_delivery_get(
    delivery_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("building.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.building_service import get_delivery

    return get_delivery(session, auth, delivery_id)


@router.post("/building/deliveries/{delivery_id}/dispatch")
def building_delivery_dispatch(
    delivery_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("building.dispatch"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.building_service import dispatch_delivery

    result = dispatch_delivery(session, auth, delivery_id, body or {})
    session.commit()
    return result


@router.post("/building/deliveries/{delivery_id}/confirm")
def building_delivery_confirm(
    delivery_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("building.delivery_confirm"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.building_service import confirm_delivery

    result = confirm_delivery(session, auth, delivery_id, body or {})
    session.commit()
    return result


@router.post("/building/deliveries/{delivery_id}/fail-or-return")
def building_delivery_fail_or_return(
    delivery_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("building.delivery_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.building_service import fail_or_return_delivery

    result = fail_or_return_delivery(session, auth, delivery_id, body or {})
    session.commit()
    return result


@router.get("/building/deliveries/{delivery_id}/challan")
def building_delivery_challan(
    delivery_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("building.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from fastapi.responses import HTMLResponse
    from app.services.building_service import challan_html

    html = challan_html(session, auth, delivery_id)
    return HTMLResponse(content=html)


@router.post("/building/quote")
def building_quote(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("building.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.building_service import quote

    return quote(session, auth, body or {})


@router.get("/building/contractors")
def building_contractors(
    auth: Annotated[AuthContext, Depends(require_permission("building.view"))],
    session: Annotated[Session, Depends(get_session)],
    q: Optional[str] = None,
    group: Optional[str] = None,
    contractors_only: bool = True,
):
    from app.services.building_service import list_contractors

    return list_contractors(session, auth.company_id, q=q, group=group, contractors_only=contractors_only)


@router.get("/building/customer-prices")
def building_customer_prices(
    auth: Annotated[AuthContext, Depends(require_permission("building.view"))],
    session: Annotated[Session, Depends(get_session)],
    product_id: Optional[str] = None,
    customer_id: Optional[str] = None,
):
    from app.services.hardware_service import list_customer_prices

    return list_customer_prices(session, auth.company_id, product_id=product_id, customer_id=customer_id)


@router.post("/building/customer-prices")
def building_customer_price_upsert(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("building.contractor_price_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.hardware_service import upsert_customer_price

    result = upsert_customer_price(session, auth, body or {})
    session.commit()
    return result


# --- Bookstore ---


@router.get("/bookstore/publishers")
def bookstore_publishers(
    auth: Annotated[AuthContext, Depends(require_permission("bookstore.view"))],
    session: Annotated[Session, Depends(get_session)],
    q: Optional[str] = None,
    active_only: bool = True,
):
    from app.services.bookstore_service import list_publishers

    return list_publishers(session, auth.company_id, q=q, active_only=active_only)


@router.post("/bookstore/publishers")
def bookstore_publisher_upsert(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("bookstore.publisher_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.bookstore_service import upsert_publisher

    result = upsert_publisher(session, auth, body or {})
    session.commit()
    return result


@router.get("/bookstore/authors")
def bookstore_authors(
    auth: Annotated[AuthContext, Depends(require_permission("bookstore.view"))],
    session: Annotated[Session, Depends(get_session)],
    q: Optional[str] = None,
    active_only: bool = True,
):
    from app.services.bookstore_service import list_authors

    return list_authors(session, auth.company_id, q=q, active_only=active_only)


@router.post("/bookstore/authors")
def bookstore_author_upsert(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("bookstore.author_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.bookstore_service import upsert_author

    result = upsert_author(session, auth, body or {})
    session.commit()
    return result


@router.get("/bookstore/profiles")
def bookstore_profiles(
    auth: Annotated[AuthContext, Depends(require_permission("bookstore.view"))],
    session: Annotated[Session, Depends(get_session)],
    q: Optional[str] = None,
    isbn: Optional[str] = None,
    author_id: Optional[str] = None,
    publisher_id: Optional[str] = None,
    language: Optional[str] = None,
    academic_level: Optional[str] = None,
    subject: Optional[str] = None,
    board: Optional[str] = None,
    curriculum: Optional[str] = None,
    active_only: bool = True,
):
    from app.services.bookstore_service import list_profiles

    return list_profiles(
        session,
        auth.company_id,
        q=q,
        isbn=isbn,
        author_id=author_id,
        publisher_id=publisher_id,
        language=language,
        academic_level=academic_level,
        subject=subject,
        board=board,
        curriculum=curriculum,
        active_only=active_only,
    )


@router.post("/bookstore/profiles")
def bookstore_profile_upsert(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("bookstore.book_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.bookstore_service import upsert_profile

    result = upsert_profile(session, auth, body or {})
    session.commit()
    return result


@router.get("/bookstore/profiles/{product_id}")
def bookstore_profile_get(
    product_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("bookstore.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.bookstore_service import get_profile_detail

    return get_profile_detail(session, auth, product_id)


@router.get("/bookstore/lookup")
def bookstore_lookup(
    auth: Annotated[AuthContext, Depends(require_permission("bookstore.view"))],
    session: Annotated[Session, Depends(get_session)],
    code: str,
):
    from app.services.bookstore_service import lookup_by_code

    return lookup_by_code(session, auth, code)


@router.get("/bookstore/academic-lists")
def bookstore_academic_lists(
    auth: Annotated[AuthContext, Depends(require_permission("bookstore.view"))],
    session: Annotated[Session, Depends(get_session)],
    q: Optional[str] = None,
    status: Optional[str] = None,
    class_or_grade: Optional[str] = None,
    academic_year: Optional[str] = None,
    board: Optional[str] = None,
    school_name: Optional[str] = None,
):
    from app.services.bookstore_service import list_academic_lists

    return list_academic_lists(
        session,
        auth.company_id,
        q=q,
        status=status,
        class_or_grade=class_or_grade,
        academic_year=academic_year,
        board=board,
        school_name=school_name,
    )


@router.post("/bookstore/academic-lists")
def bookstore_academic_list_upsert(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("bookstore.academic_list_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.bookstore_service import upsert_academic_list

    result = upsert_academic_list(session, auth, body or {})
    session.commit()
    return result


@router.get("/bookstore/academic-lists/{list_id}")
def bookstore_academic_list_get(
    list_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("bookstore.view"))],
    session: Annotated[Session, Depends(get_session)],
    store_id: Optional[str] = None,
):
    from app.services.bookstore_service import get_academic_list

    return get_academic_list(session, auth, list_id, store_id=store_id)


@router.post("/bookstore/academic-lists/{list_id}/status")
def bookstore_academic_list_status(
    list_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("bookstore.academic_list_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.bookstore_service import set_list_status

    result = set_list_status(session, auth, list_id, (body or {}).get("status", ""))
    session.commit()
    return result


@router.post("/bookstore/academic-lists/{list_id}/items")
def bookstore_academic_list_item_upsert(
    list_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("bookstore.academic_list_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.bookstore_service import upsert_list_item

    result = upsert_list_item(session, auth, list_id, body or {})
    session.commit()
    return result


@router.delete("/bookstore/academic-lists/{list_id}/items/{item_id}")
def bookstore_academic_list_item_delete(
    list_id: str,
    item_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("bookstore.academic_list_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.bookstore_service import remove_list_item

    result = remove_list_item(session, auth, list_id, item_id)
    session.commit()
    return result


@router.get("/bookstore/academic-lists/{list_id}/availability")
def bookstore_academic_list_availability(
    list_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("bookstore.view"))],
    session: Annotated[Session, Depends(get_session)],
    store_id: str,
):
    from app.services.bookstore_service import list_availability

    return list_availability(session, auth, list_id, store_id)


@router.post("/bookstore/academic-lists/{list_id}/cart-resolve")
def bookstore_academic_list_cart_resolve(
    list_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("bookstore.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.bookstore_service import resolve_list_for_cart

    return resolve_list_for_cart(session, auth, list_id, body or {})


# --- Stationery ---
@router.get("/stationery/profiles")
def stationery_profiles(
    auth: Annotated[AuthContext, Depends(require_permission("stationery.view"))],
    session: Annotated[Session, Depends(get_session)],
    q: Optional[str] = None,
    brand_id: Optional[str] = None,
    stationery_type: Optional[str] = None,
    color: Optional[str] = None,
    active_only: bool = True,
    store_id: Optional[str] = None,
):
    from app.services.stationery_service import list_profiles

    return list_profiles(
        session,
        auth.company_id,
        q=q,
        brand_id=brand_id,
        stationery_type=stationery_type,
        color=color,
        active_only=active_only,
        store_id=store_id,
    )


@router.post("/stationery/profiles")
def stationery_profile_upsert(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("stationery.product_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.stationery_service import upsert_profile

    result = upsert_profile(session, auth, body or {})
    session.commit()
    return result


@router.get("/stationery/profiles/{product_id}")
def stationery_profile_get(
    product_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("stationery.view"))],
    session: Annotated[Session, Depends(get_session)],
    store_id: Optional[str] = None,
):
    from app.services.stationery_service import get_profile, _profile_out

    row = get_profile(session, auth.company_id, product_id)
    if not row:
        raise HTTPException(status_code=404, detail="Stationery profile not found")
    return _profile_out(session, row, store_id=store_id)


@router.post("/stationery/quote")
def stationery_quote(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("stationery.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.stationery_service import quote

    return quote(session, auth, body or {})


@router.get("/stationery/lookup/barcode")
def stationery_barcode_lookup(
    auth: Annotated[AuthContext, Depends(require_permission("stationery.view"))],
    session: Annotated[Session, Depends(get_session)],
    code: str,
):
    from app.services.stationery_service import resolve_barcode

    return resolve_barcode(session, auth.company_id, code)


@router.get("/stationery/customer-prices")
def stationery_customer_prices(
    auth: Annotated[AuthContext, Depends(require_permission("stationery.view"))],
    session: Annotated[Session, Depends(get_session)],
    product_id: Optional[str] = None,
    customer_id: Optional[str] = None,
):
    from app.services.stationery_service import list_customer_prices

    return list_customer_prices(session, auth.company_id, product_id=product_id, customer_id=customer_id)


@router.post("/stationery/customer-prices")
def stationery_customer_price_upsert(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("stationery.pricing_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.stationery_service import upsert_customer_price

    result = upsert_customer_price(session, auth, body or {})
    session.commit()
    return result


@router.get("/stationery/bulk-tiers")
def stationery_bulk_tiers(
    auth: Annotated[AuthContext, Depends(require_permission("stationery.view"))],
    session: Annotated[Session, Depends(get_session)],
    product_id: Optional[str] = None,
):
    from app.services.stationery_service import list_bulk_tiers

    return list_bulk_tiers(session, auth.company_id, product_id=product_id)


@router.post("/stationery/bulk-tiers")
def stationery_bulk_tier_upsert(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("stationery.pricing_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.stationery_service import upsert_bulk_tier

    result = upsert_bulk_tier(session, auth, body or {})
    session.commit()
    return result


@router.get("/stationery/school-lists")
def stationery_school_lists(
    auth: Annotated[AuthContext, Depends(require_permission("stationery.view"))],
    session: Annotated[Session, Depends(get_session)],
    q: Optional[str] = None,
    status: Optional[str] = None,
    class_or_grade: Optional[str] = None,
    academic_year: Optional[str] = None,
    board: Optional[str] = None,
    school_name: Optional[str] = None,
):
    from app.services.stationery_service import list_school_lists

    return list_school_lists(
        session,
        auth.company_id,
        q=q,
        status=status,
        class_or_grade=class_or_grade,
        academic_year=academic_year,
        board=board,
        school_name=school_name,
    )


@router.post("/stationery/school-lists")
def stationery_school_list_upsert(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("stationery.school_list_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.stationery_service import upsert_school_list

    result = upsert_school_list(session, auth, body or {})
    session.commit()
    return result


@router.get("/stationery/school-lists/{list_id}")
def stationery_school_list_get(
    list_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("stationery.view"))],
    session: Annotated[Session, Depends(get_session)],
    store_id: Optional[str] = None,
):
    from app.services.stationery_service import get_school_list

    return get_school_list(session, auth, list_id, store_id=store_id)


@router.post("/stationery/school-lists/{list_id}/status")
def stationery_school_list_status(
    list_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("stationery.school_list_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.stationery_service import set_status

    result = set_status(session, auth, list_id, str((body or {}).get("status") or ""))
    session.commit()
    return result


@router.post("/stationery/school-lists/{list_id}/items")
def stationery_school_list_item_upsert(
    list_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("stationery.school_list_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.stationery_service import upsert_item

    result = upsert_item(session, auth, list_id, body or {})
    session.commit()
    return result


@router.delete("/stationery/school-lists/{list_id}/items/{item_id}")
def stationery_school_list_item_delete(
    list_id: str,
    item_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("stationery.school_list_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.stationery_service import remove_item

    result = remove_item(session, auth, list_id, item_id)
    session.commit()
    return result


@router.get("/stationery/school-lists/{list_id}/availability")
def stationery_school_list_availability(
    list_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("stationery.view"))],
    session: Annotated[Session, Depends(get_session)],
    store_id: str,
):
    from app.services.stationery_service import availability

    return availability(session, auth, list_id, store_id)


@router.post("/stationery/school-lists/{list_id}/cart-resolve")
def stationery_school_list_cart_resolve(
    list_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("stationery.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.stationery_service import cart_resolve

    return cart_resolve(session, auth, list_id, body or {})


# --- Cosmetics ---


@router.get("/cosmetics/profiles")
def cosmetics_profiles(
    auth: Annotated[AuthContext, Depends(require_permission("cosmetics.view"))],
    session: Annotated[Session, Depends(get_session)],
    q: Optional[str] = None,
    product_type: Optional[str] = None,
    brand_id: Optional[str] = None,
):
    from app.services.cosmetics_service import list_profiles

    return list_profiles(session, auth.company_id, q=q, product_type=product_type, brand_id=brand_id)


@router.post("/cosmetics/profiles")
def cosmetics_profile_upsert(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("cosmetics.profile_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.cosmetics_service import upsert_profile

    result = upsert_profile(session, auth, body or {})
    session.commit()
    return result


@router.get("/cosmetics/profiles/{product_id}")
def cosmetics_profile_get(
    product_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("cosmetics.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.cosmetics_service import _profile_out, get_profile
    from app.models.product import BrandMaster, Product

    profile = get_profile(session, auth.company_id, product_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    product = session.get(Product, product_id)
    brand = session.get(BrandMaster, profile.brand_id) if profile.brand_id else None
    return _profile_out(profile, product, brand)


@router.get("/cosmetics/brands")
def cosmetics_brands(
    auth: Annotated[AuthContext, Depends(require_permission("cosmetics.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.cosmetics_service import brand_shelf_summary

    return brand_shelf_summary(session, auth.company_id)


@router.get("/cosmetics/batches")
def cosmetics_batches(
    auth: Annotated[AuthContext, Depends(require_permission("cosmetics.view"))],
    session: Annotated[Session, Depends(get_session)],
    brand_id: Optional[str] = None,
    product_id: Optional[str] = None,
    product_type: Optional[str] = None,
    variant_id: Optional[str] = None,
    store_id: Optional[str] = None,
    status: Optional[str] = None,
    near_days: Optional[int] = None,
):
    from app.services.cosmetics_service import list_batches

    result = list_batches(
        session,
        auth.company_id,
        brand_id=brand_id,
        product_id=product_id,
        product_type=product_type,
        variant_id=variant_id,
        store_id=store_id,
        status=status,
        near_days=near_days,
    )
    session.commit()
    return result


@router.post("/cosmetics/batches")
def cosmetics_batch_create(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("cosmetics.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.cosmetics_service import create_batch

    result = create_batch(session, auth, body or {})
    session.commit()
    return result


@router.get("/cosmetics/batches/fefo")
def cosmetics_fefo(
    auth: Annotated[AuthContext, Depends(require_permission("cosmetics.view"))],
    session: Annotated[Session, Depends(get_session)],
    product_id: str,
    variant_id: Optional[str] = None,
    store_id: Optional[str] = None,
):
    from app.services.cosmetics_service import _batch_out, get_fefo_batch, get_profile
    from app.models.product import Product

    batch = get_fefo_batch(
        session, auth.company_id, product_id, variant_id=variant_id, store_id=store_id
    )
    if not batch:
        raise HTTPException(status_code=404, detail="No FEFO batch available")
    product = session.get(Product, product_id)
    profile = get_profile(session, auth.company_id, product_id)
    result = _batch_out(batch, product, profile)
    session.commit()
    return result


@router.post("/cosmetics/batches/{batch_id}/quarantine")
def cosmetics_quarantine(
    batch_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("cosmetics.quarantine"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.cosmetics_service import quarantine_batch

    result = quarantine_batch(session, auth, batch_id, body or {})
    session.commit()
    return result


@router.post("/cosmetics/quote")
def cosmetics_quote(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("cosmetics.view"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.cosmetics_service import quote

    result = quote(session, auth, body or {})
    session.commit()
    return result


@router.get("/cosmetics/lookup/barcode")
def cosmetics_barcode_lookup(
    auth: Annotated[AuthContext, Depends(require_permission("cosmetics.view"))],
    session: Annotated[Session, Depends(get_session)],
    code: str,
):
    from app.services.cosmetics_service import resolve_barcode

    return resolve_barcode(session, auth.company_id, code)


@router.get("/cosmetics/testers")
def cosmetics_testers(
    auth: Annotated[AuthContext, Depends(require_permission("cosmetics.view"))],
    session: Annotated[Session, Depends(get_session)],
    product_id: Optional[str] = None,
    store_id: Optional[str] = None,
    status: Optional[str] = None,
):
    from app.services.cosmetics_service import list_testers

    return list_testers(session, auth.company_id, product_id=product_id, store_id=store_id, status=status)


@router.post("/cosmetics/testers/convert")
def cosmetics_tester_convert(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("cosmetics.tester_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.cosmetics_service import convert_to_tester

    result = convert_to_tester(session, auth, body or {})
    session.commit()
    return result


@router.post("/cosmetics/testers/{tester_id}/status")
def cosmetics_tester_status(
    tester_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("cosmetics.tester_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.cosmetics_service import update_tester_status

    result = update_tester_status(session, auth, tester_id, body or {})
    session.commit()
    return result


# --- Cycle & Toys ("Pedal & Play") ---
@router.get("/cycle-toys/assembly-orders")
def cycle_toys_list_assembly_orders(
    auth: Annotated[AuthContext, Depends(require_permission("cycle_toys.view"))],
    session: Annotated[Session, Depends(get_session)],
    status: Optional[str] = None,
    search: Optional[str] = None,
):
    from app.services.cycle_toys_service import list_assembly_orders

    return list_assembly_orders(session, auth.company_id, status=status, search=search)


@router.post("/cycle-toys/assembly-orders")
def cycle_toys_create_assembly_order(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("cycle_toys.assembly_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.cycle_toys_service import create_assembly_order

    result = create_assembly_order(session, auth, body or {})
    session.commit()
    return result


@router.patch("/cycle-toys/assembly-orders/{order_id}")
def cycle_toys_update_assembly_order(
    order_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("cycle_toys.assembly_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.cycle_toys_service import update_assembly_order

    result = update_assembly_order(session, auth, order_id, body or {})
    session.commit()
    return result


@router.get("/cycle-toys/service-jobs")
def cycle_toys_list_service_jobs(
    auth: Annotated[AuthContext, Depends(require_permission("cycle_toys.view"))],
    session: Annotated[Session, Depends(get_session)],
    status: Optional[str] = None,
    search: Optional[str] = None,
):
    from app.services.cycle_toys_service import list_service_jobs

    return list_service_jobs(session, auth.company_id, status=status, search=search)


@router.post("/cycle-toys/service-jobs")
def cycle_toys_create_service_job(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("cycle_toys.service_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.cycle_toys_service import create_service_job

    result = create_service_job(session, auth, body or {})
    session.commit()
    return result


@router.patch("/cycle-toys/service-jobs/{job_id}")
def cycle_toys_update_service_job(
    job_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("cycle_toys.service_manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.cycle_toys_service import update_service_job

    result = update_service_job(session, auth, job_id, body or {})
    session.commit()
    return result


@router.get("/cycle-toys/battery-logs")
def cycle_toys_list_battery_logs(
    auth: Annotated[AuthContext, Depends(require_permission("cycle_toys.view"))],
    session: Annotated[Session, Depends(get_session)],
    voltage_rating: Optional[str] = None,
    search: Optional[str] = None,
):
    from app.services.cycle_toys_service import list_battery_logs

    return list_battery_logs(session, auth.company_id, voltage_rating=voltage_rating, search=search)


@router.post("/cycle-toys/battery-logs")
def cycle_toys_create_battery_log(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("cycle_toys.manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.cycle_toys_service import create_battery_log

    result = create_battery_log(session, auth, body or {})
    session.commit()
    return result


@router.patch("/cycle-toys/battery-logs/{log_id}")
def cycle_toys_update_battery_log(
    log_id: str,
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("cycle_toys.manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.cycle_toys_service import update_battery_log

    result = update_battery_log(session, auth, log_id, body or {})
    session.commit()
    return result


@router.get("/cycle-toys/inspections")
def cycle_toys_list_inspections(
    auth: Annotated[AuthContext, Depends(require_permission("cycle_toys.view"))],
    session: Annotated[Session, Depends(get_session)],
    log_type: Optional[str] = None,
    frame_serial: Optional[str] = None,
):
    from app.services.cycle_toys_service import list_inspection_logs

    return list_inspection_logs(session, auth.company_id, log_type=log_type, frame_serial=frame_serial)


@router.post("/cycle-toys/inspections")
def cycle_toys_create_inspection(
    body: dict,
    auth: Annotated[AuthContext, Depends(require_permission("cycle_toys.manage"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.services.cycle_toys_service import create_inspection_log

    result = create_inspection_log(session, auth, body or {})
    session.commit()
    return result
