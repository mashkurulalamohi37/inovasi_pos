from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
from app.dependencies import AuthContext, get_current_user, require_permission, require_permissions, write_audit
from app.models.product import Supplier
from app.schemas.operations import (
    DirectPurchaseReceiveIn,
    PurchaseCreate,
    PurchaseReceiveIn,
    PurchaseReturnIn,
    PurchaseUpdate,
    SupplierCreate,
    SupplierPaymentIn,
    SupplierUpdate,
)
from app.schemas.procurement import SupplierInvoiceCreate
from app.services.procurement_service import (
    approve_supplier_invoice,
    create_supplier_invoice,
    get_purchase_match_summary,
    get_receive,
    list_receives,
    list_supplier_invoices,
)
from app.services.purchase_service import (
    approve_purchase,
    create_purchase,
    create_supplier_payment,
    direct_receive_purchase,
    get_purchase,
    get_supplier_ledger,
    list_purchases,
    receive_purchase,
    return_purchase,
    update_purchase,
)

router = APIRouter(prefix="/purchases", tags=["purchases"])


@router.get("")
def purchases_list(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    status: Optional[str] = None,
    supplier_id: Optional[str] = None,
    store_id: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
):
    return list_purchases(session, auth.company_id, status, supplier_id, store_id, from_date, to_date)


@router.get("/receives")
def purchase_receives_list(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    purchase_id: Optional[str] = None,
    limit: int = 100,
):
    return list_receives(session, auth.company_id, purchase_id=purchase_id, limit=limit)


@router.post("/direct-receive")
def purchase_direct_receive(
    body: DirectPurchaseReceiveIn,
    auth: Annotated[
        AuthContext,
        Depends(require_permissions("purchase.create", "purchase.approve", "purchase.receive")),
    ],
    session: Annotated[Session, Depends(get_session)],
):
    """One-step purchase: create PO, auto-approve, post full GRN and increase stock."""
    result = direct_receive_purchase(session, auth, body.model_dump())
    session.commit()
    return result


@router.get("/receives/{receive_id}")
def purchase_receive_detail(
    receive_id: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    return get_receive(session, auth.company_id, receive_id)


@router.get("/supplier-invoices")
def supplier_invoices_list(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    purchase_id: Optional[str] = None,
    supplier_id: Optional[str] = None,
):
    return list_supplier_invoices(session, auth.company_id, purchase_id=purchase_id, supplier_id=supplier_id)


@router.get("/{purchase_id}/match-summary")
def purchase_match_summary(
    purchase_id: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    return get_purchase_match_summary(session, auth.company_id, purchase_id)


@router.post("/{purchase_id}/supplier-invoice")
def supplier_invoice_create(
    purchase_id: str,
    body: SupplierInvoiceCreate,
    auth: Annotated[AuthContext, Depends(require_permission("purchase.approve"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = create_supplier_invoice(session, auth, purchase_id, body.model_dump())
    session.commit()
    return result


@router.post("/supplier-invoices/{invoice_id}/approve")
def supplier_invoice_approve(
    invoice_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("purchase.approve"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = approve_supplier_invoice(session, auth, invoice_id)
    session.commit()
    return result


@router.get("/{purchase_id}")
def purchase_detail(
    purchase_id: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    return get_purchase(session, auth.company_id, purchase_id)


@router.post("")
def purchase_create(
    body: PurchaseCreate,
    auth: Annotated[AuthContext, Depends(require_permission("purchase.create"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = create_purchase(session, auth, body.model_dump())
    session.commit()
    return result


@router.put("/{purchase_id}")
def purchase_update(
    purchase_id: str,
    body: PurchaseUpdate,
    auth: Annotated[AuthContext, Depends(require_permission("purchase.create"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = update_purchase(session, auth, purchase_id, body.model_dump(exclude_unset=True))
    session.commit()
    return result


@router.post("/{purchase_id}/approve")
def purchase_approve(
    purchase_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("purchase.approve"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = approve_purchase(session, auth, purchase_id)
    session.commit()
    return result


@router.post("/{purchase_id}/receive")
def purchase_receive(
    purchase_id: str,
    body: PurchaseReceiveIn,
    auth: Annotated[AuthContext, Depends(require_permission("purchase.receive"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = receive_purchase(session, auth, purchase_id, body.model_dump())
    session.commit()
    return result


@router.post("/{purchase_id}/return")
def purchase_return(
    purchase_id: str,
    body: PurchaseReturnIn,
    auth: Annotated[AuthContext, Depends(require_permission("purchase.receive"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = return_purchase(session, auth, purchase_id, body.model_dump())
    session.commit()
    return result


suppliers_router = APIRouter(tags=["suppliers"])


@suppliers_router.get("/suppliers")
def list_suppliers(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    from app.models.operations import SupplierBalance

    rows = session.exec(select(Supplier).where(Supplier.company_id == auth.company_id)).all()
    out = []
    for s in rows:
        bal = session.exec(
            select(SupplierBalance).where(
                SupplierBalance.company_id == auth.company_id,
                SupplierBalance.supplier_id == s.id,
            )
        ).first()
        raw_bal = float(bal.outstanding) if bal and bal.outstanding else 0.0
        clean_outstanding = round(raw_bal) if raw_bal >= 1.0 else 0
        out.append({
            "id": s.id,
            "code": s.code,
            "name": s.name,
            "phone": s.phone,
            "email": s.email,
            "contact_person": s.contact_person,
            "address": s.address,
            "is_active": s.is_active,
            "outstanding": clean_outstanding,
        })
    return out


@suppliers_router.post("/suppliers")
def create_supplier(
    body: SupplierCreate,
    auth: Annotated[AuthContext, Depends(require_permission("purchase.create"))],
    session: Annotated[Session, Depends(get_session)],
):
    existing = session.exec(
        select(Supplier).where(Supplier.company_id == auth.company_id, Supplier.code == body.code)
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Supplier code exists")
    s = Supplier(
        company_id=auth.company_id,
        code=body.code,
        name=body.name,
        phone=body.phone,
        email=body.email,
        contact_person=body.contact_person,
        address=body.address,
        is_active=True,
    )
    session.add(s)
    write_audit(session, auth, "supplier_create", "supplier", s.id)
    session.commit()
    session.refresh(s)
    return {"id": s.id, "code": s.code, "name": s.name, "phone": s.phone, "email": s.email, "contact_person": s.contact_person, "address": s.address, "is_active": s.is_active}


@suppliers_router.get("/suppliers/{supplier_id}")
def get_supplier_detail(
    supplier_id: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    from app.models.operations import SupplierBalance
    s = session.get(Supplier, supplier_id)
    if not s or s.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Supplier not found")
    bal = session.exec(
        select(SupplierBalance).where(
            SupplierBalance.company_id == auth.company_id,
            SupplierBalance.supplier_id == s.id,
        )
    ).first()
    return {
        "id": s.id,
        "code": s.code,
        "name": s.name,
        "phone": s.phone,
        "email": s.email,
        "contact_person": s.contact_person,
        "address": s.address,
        "is_active": s.is_active,
        "outstanding": bal.outstanding if bal else 0,
    }


@suppliers_router.put("/suppliers/{supplier_id}")
def update_supplier(
    supplier_id: str,
    body: SupplierUpdate,
    auth: Annotated[AuthContext, Depends(require_permission("purchase.create"))],
    session: Annotated[Session, Depends(get_session)],
):
    s = session.get(Supplier, supplier_id)
    if not s or s.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Supplier not found")
    if body.name is not None:
        s.name = body.name
    if body.phone is not None:
        s.phone = body.phone
    if body.email is not None:
        s.email = body.email
    if body.contact_person is not None:
        s.contact_person = body.contact_person
    if body.address is not None:
        s.address = body.address
    if body.is_active is not None:
        s.is_active = body.is_active
    session.add(s)
    write_audit(session, auth, "supplier_update", "supplier", s.id)
    session.commit()
    return {"id": s.id, "code": s.code, "name": s.name, "phone": s.phone, "email": s.email, "contact_person": s.contact_person, "address": s.address, "is_active": s.is_active}


@suppliers_router.get("/suppliers/{supplier_id}/ledger")
def supplier_ledger(
    supplier_id: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
):
    return get_supplier_ledger(session, auth.company_id, supplier_id, from_date, to_date)


payments_router = APIRouter(prefix="/supplier-payments", tags=["supplier-payments"])


@payments_router.get("")
def supplier_payments_list(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    from app.models.operations import SupplierPayment
    rows = session.exec(select(SupplierPayment).where(SupplierPayment.company_id == auth.company_id)).all()
    return [
        {"id": r.id, "supplier_id": r.supplier_id, "amount": r.amount, "method": r.method, "reference": r.reference,
         "paid_at": r.paid_at.isoformat() if r.paid_at else None}
        for r in rows
    ]


@payments_router.post("")
def supplier_payment_create(
    body: SupplierPaymentIn,
    auth: Annotated[AuthContext, Depends(require_permission("purchase.approve"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = create_supplier_payment(session, auth, body.model_dump())
    session.commit()
    return result
