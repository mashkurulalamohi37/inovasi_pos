from typing import Annotated, Optional

from fastapi import APIRouter, Depends
from sqlmodel import Session, select, func

from app.database import get_session
from app.dependencies import AuthContext, get_current_user, require_permission, write_audit
from app.models.operations import PaymentMethod
from app.models.sales import Payment
from app.schemas.commerce import ClearOpeningStockIn, OpeningStockDocumentIn, OpeningStockIn, StockAdjustmentIn
from app.services.opening_stock_service import (
    cancel_opening_stock_document,
    create_opening_stock_document,
    delete_opening_stock_document,
    get_opening_stock_document,
    list_opening_stock_documents,
    post_opening_stock_document,
    revert_opening_stock_document,
    revert_store_opening_stock,
)
from app.schemas.operations import (
    PaymentMethodIn,
    StockDamageIn,
    StockDamageRestoreIn,
    StockDamageWriteoffIn,
    StockTransferDispatchIn,
    StockTransferIn,
)
from app.services.inventory_service import (
    adjust_stock,
    consume_reservation,
    create_reservation,
    dispatch_transfer,
    get_inventory_policies,
    get_low_stock,
    get_stock_balances,
    get_stock_ledger,
    get_stock_summary,
    list_pending_transfers,
    list_reservations,
    mark_stock_damaged,
    post_opening_stock,
    receive_transfer,
    release_reservation,
    resolve_store_id,
    restore_damaged_stock,
    transfer_stock,
    upsert_inventory_policy,
    write_off_damaged_stock,
)
from app.schemas.inventory import ReservationCreate, StockPolicyOut, StockPolicyUpdate
from app.schemas.product_catalog import ReorderIn
from app.services.product_service import create_reorder_po

router = APIRouter(prefix="/inventory", tags=["inventory"])


@router.get("/stock")
def stock_list(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    store_id: Optional[str] = None,
):
    target_store = None if store_id == "all" else (store_id or auth.store_id)
    return get_stock_balances(session, auth.company_id, target_store)


@router.get("/stock-ledger")
def stock_ledger_list(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    product_id: Optional[str] = None,
    store_id: Optional[str] = None,
    transaction_type: Optional[str] = None,
    limit: int = 100,
):
    return get_stock_ledger(
        session, auth.company_id, product_id=product_id, store_id=store_id,
        transaction_type=transaction_type, limit=limit,
    )


@router.get("/stock-ledger/{product_id}")
def stock_ledger_product(
    product_id: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    limit: int = 100,
):
    return get_stock_ledger(session, auth.company_id, product_id=product_id, limit=limit)


@router.get("/stock-summary")
def stock_summary(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    return get_stock_summary(session, auth.company_id)


@router.get("/low-stock")
def low_stock(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    threshold: float = 20,
):
    return get_low_stock(session, auth.company_id, threshold)


@router.post("/reorder")
def inventory_reorder(
    body: ReorderIn,
    auth: Annotated[AuthContext, Depends(require_permission("purchase.create"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = create_reorder_po(session, auth, body.model_dump())
    session.commit()
    return result


def _assert_store_override_allowed(auth: AuthContext, target_store_id: Optional[str]) -> None:
    if not target_store_id or target_store_id == auth.store_id:
        return
    if auth.is_platform_admin or auth.role_code in ("Admin", "Super Admin"):
        return
    if "inventory.adjust_any_store" not in auth.permissions:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Permission required: inventory.adjust_any_store")


@router.post("/adjustment")
def stock_adjustment(
    body: StockAdjustmentIn,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.adjust"))],
    session: Annotated[Session, Depends(get_session)],
):
    target_store_id = resolve_store_id(session, auth.company_id, body.store_id or auth.store_id)
    _assert_store_override_allowed(auth, target_store_id)
    adjust_stock(
        session, auth.company_id, body.product_id,
        target_store_id, body.qty_after, body.reason, auth.user_id,
    )
    write_audit(session, auth, "stock_adjustment", "stock_adjustment", body.product_id, {"qty_after": body.qty_after})
    session.commit()
    return {"ok": True}


@router.get("/product-batches")
def product_batches(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    product_id: str,
):
    from app.models.product import Product

    product = session.get(Product, product_id)
    if not product or product.company_id != auth.company_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Product not found")

    pack = product.industry_pack
    if pack == "pharmacy":
        from app.models.industry import PharmaBatch

        rows = session.exec(
            select(PharmaBatch).where(
                PharmaBatch.company_id == auth.company_id,
                PharmaBatch.product_id == product_id,
            )
        ).all()
        return [
            {
                "id": getattr(r, "id", None),
                "batch_no": r.batch_no,
                "lot_no": None,
                "expiry_date": r.expiry_date.isoformat() if r.expiry_date else None,
                "manufacture_date": None,
                "qty_on_hand": r.qty_on_hand,
                "status": getattr(r, "status", "available"),
            }
            for r in rows
        ]
    if pack == "cosmetics":
        from app.models.industry import CosmeticsBatch

        rows = session.exec(
            select(CosmeticsBatch).where(
                CosmeticsBatch.company_id == auth.company_id,
                CosmeticsBatch.product_id == product_id,
            )
        ).all()
        return [
            {
                "id": getattr(r, "id", None),
                "batch_no": r.batch_no,
                "lot_no": r.lot_no,
                "expiry_date": r.expiry_date.isoformat() if r.expiry_date else None,
                "manufacture_date": r.manufacture_date.isoformat() if r.manufacture_date else None,
                "qty_on_hand": r.qty_on_hand,
                "status": getattr(r, "status", "available"),
            }
            for r in rows
        ]
    if pack == "surgical-shop":
        from app.models.industry import SurgicalStockUnit

        rows = session.exec(
            select(SurgicalStockUnit).where(
                SurgicalStockUnit.company_id == auth.company_id,
                SurgicalStockUnit.product_id == product_id,
                SurgicalStockUnit.serial_no.is_(None),
            )
        ).all()
        return [
            {
                "id": getattr(r, "id", None),
                "batch_no": r.batch_no,
                "lot_no": r.lot_no,
                "expiry_date": r.expiry_date.isoformat() if r.expiry_date else None,
                "manufacture_date": r.manufacture_date.isoformat() if r.manufacture_date else None,
                "qty_on_hand": r.qty_on_hand,
                "status": getattr(r, "status", "available"),
            }
            for r in rows
            if r.batch_no
        ]
    return []


@router.post("/opening-stock")
def post_manual_opening_stock(
    body: OpeningStockIn,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.adjust"))],
    session: Annotated[Session, Depends(get_session)],
):
    target_store_id = resolve_store_id(session, auth.company_id, body.store_id or auth.store_id)
    _assert_store_override_allowed(auth, target_store_id)
    post_opening_stock(
        session,
        company_id=auth.company_id,
        product_id=body.product_id,
        store_id=target_store_id,
        warehouse_id=body.warehouse_id,
        qty=body.qty,
        unit_cost=body.unit_cost,
        variant_id=body.variant_id,
        note=body.note,
        created_by=auth.user_id,
        batch_no=body.batch_no,
        lot_no=body.lot_no,
        expiry_date=body.expiry_date,
        manufacture_date=body.manufacture_date,
        serials=body.serials,
    )
    write_audit(session, auth, "opening_stock", "opening_stock", body.product_id, {"qty": body.qty})
    session.commit()
    return {"ok": True}


@router.post("/opening-stock-documents")
def opening_stock_document_create(
    body: OpeningStockDocumentIn,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.adjust"))],
    session: Annotated[Session, Depends(get_session)],
):
    target_store_id = resolve_store_id(session, auth.company_id, body.store_id or auth.store_id)
    _assert_store_override_allowed(auth, target_store_id)
    result = create_opening_stock_document(
        session,
        auth,
        store_id=target_store_id,
        warehouse_id=body.warehouse_id,
        note=body.note,
        lines=[ln.model_dump() for ln in body.lines],
    )
    session.commit()
    return result


@router.get("/opening-stock-documents")
def opening_stock_document_list(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    store_id: Optional[str] = None,
    status: Optional[str] = None,
    industry: Optional[str] = None,
    limit: int = 100,
):
    return list_opening_stock_documents(session, auth.company_id, store_id=store_id, status=status, industry=industry, limit=limit)


@router.get("/opening-stock-documents/{document_id}")
def opening_stock_document_detail(
    document_id: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    return get_opening_stock_document(session, auth.company_id, document_id)


@router.post("/opening-stock-documents/{document_id}/approve")
def opening_stock_document_approve(
    document_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.approve_opening_stock"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = post_opening_stock_document(session, auth, document_id)
    session.commit()
    return result


@router.post("/opening-stock-documents/{document_id}/cancel")
def opening_stock_document_cancel(
    document_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.adjust"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = cancel_opening_stock_document(session, auth, document_id)
    session.commit()
    return result


@router.post("/opening-stock-documents/{document_id}/revert")
def opening_stock_document_revert(
    document_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.adjust"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = revert_opening_stock_document(session, auth, document_id)
    session.commit()
    return result


@router.delete("/opening-stock-documents/{document_id}")
def opening_stock_document_delete(
    document_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.adjust"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = delete_opening_stock_document(session, auth, document_id)
    session.commit()
    return result



@router.post("/opening-stock/clear")
def clear_store_opening_stock_api(
    body: ClearOpeningStockIn,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.adjust"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.models.core import UserAccount
    from app.security import verify_password

    if not body.password or not body.password.strip():
        raise HTTPException(status_code=400, detail="Admin password is required to clear store opening stock")

    current_user = session.get(UserAccount, auth.user_id)
    if not current_user or not current_user.password_hash or not verify_password(body.password, current_user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect admin password. Action aborted for safety.")

    target_store_id = resolve_store_id(session, auth.company_id, body.store_id or auth.store_id)
    _assert_store_override_allowed(auth, target_store_id)
    result = revert_store_opening_stock(session, auth, target_store_id)
    session.commit()
    return result



@router.post("/adjust")
def stock_adjust_legacy(
    body: StockAdjustmentIn,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.adjust"))],
    session: Annotated[Session, Depends(get_session)],
):
    return stock_adjustment(body, auth, session)


@router.get("/adjustments")
def list_stock_adjustments(
    auth: Annotated[AuthContext, Depends(require_permission("inventory.adjust"))],
    session: Annotated[Session, Depends(get_session)],
    limit: int = 100,
):
    from app.models.inventory import StockAdjustment
    from app.models.product import Product
    from app.models.core import Store, UserAccount

    stmt = (
        select(StockAdjustment, Product, Store, UserAccount)
        .join(Product, Product.id == StockAdjustment.product_id)
        .outerjoin(Store, Store.id == StockAdjustment.store_id)
        .outerjoin(UserAccount, UserAccount.id == StockAdjustment.adjusted_by)
        .where(StockAdjustment.company_id == auth.company_id)
        .order_by(StockAdjustment.created_at.desc())  # type: ignore
        .limit(limit)
    )
    rows = session.exec(stmt).all()
    return [
        {
            "id": adj.id,
            "product_id": adj.product_id,
            "sku": prod.sku,
            "name": prod.name,
            "store_id": adj.store_id,
            "store_name": store.name if store else "Unassigned",
            "qty_before": adj.qty_before,
            "qty_after": adj.qty_after,
            "qty_delta": adj.qty_after - adj.qty_before,
            "reason": adj.reason,
            "adjusted_by": usr.full_name or usr.username if usr else (adj.adjusted_by or "System"),
            "created_at": adj.created_at.isoformat() if adj.created_at else None,
        }
        for adj, prod, store, usr in rows
    ]



@router.post("/transfer")
def stock_transfer(
    body: StockTransferIn,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.adjust"))],
    session: Annotated[Session, Depends(get_session)],
):
    transfer_stock(
        session, auth.company_id, body.product_id,
        body.from_store_id, body.to_store_id, body.qty, body.reason, auth.user_id,
        body.from_warehouse_id, body.to_warehouse_id,
    )
    write_audit(session, auth, "stock_transfer", "stock_transfer", body.product_id, {"qty": body.qty})
    session.commit()
    return {"ok": True}


@router.post("/transfer/dispatch")
def stock_transfer_dispatch(
    body: StockTransferDispatchIn,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.adjust"))],
    session: Annotated[Session, Depends(get_session)],
):
    """Two-phase transfer, phase 1 — stock leaves the source now but sits in the
    destination's in-transit bucket until /transfer/{id}/receive confirms arrival."""
    from app.inventory.exceptions import InsufficientStockError
    from fastapi import HTTPException

    try:
        transfer = dispatch_transfer(
            session, auth.company_id, body.product_id,
            body.from_store_id, body.to_store_id, body.qty, body.reason, auth.user_id,
            body.from_warehouse_id, body.to_warehouse_id,
        )
    except InsufficientStockError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    write_audit(session, auth, "stock_transfer_dispatch", "stock_transfer", transfer.id, {"qty": body.qty})
    session.commit()
    return {"id": transfer.id, "status": transfer.status}


@router.post("/transfer/{transfer_id}/receive")
def stock_transfer_receive(
    transfer_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.adjust"))],
    session: Annotated[Session, Depends(get_session)],
):
    """Two-phase transfer, phase 2 — goods physically arrived; moves qty from the
    destination's in-transit bucket into sellable stock."""
    transfer = receive_transfer(session, auth.company_id, transfer_id, auth.user_id)
    write_audit(session, auth, "stock_transfer_receive", "stock_transfer", transfer.id, {"qty": transfer.qty})
    session.commit()
    return {"id": transfer.id, "status": transfer.status, "received_at": transfer.received_at.isoformat() if transfer.received_at else None}


@router.get("/transfer/pending")
def stock_transfer_pending(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    store_id: Optional[str] = None,
):
    return list_pending_transfers(session, auth.company_id, store_id)


@router.post("/damage")
def stock_damage(
    body: StockDamageIn,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.adjust"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.inventory.exceptions import InsufficientStockError
    from fastapi import HTTPException

    try:
        balance = mark_stock_damaged(
            session, auth.company_id, body.product_id, body.store_id, body.warehouse_id,
            body.qty, body.reason, auth.user_id,
            variant_id=body.variant_id, batch_id=body.batch_id, serial_no=body.serial_no,
        )
    except InsufficientStockError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    write_audit(session, auth, "stock_damage", "stock_balance", balance.id, {"qty": body.qty, "reason": body.reason})
    session.commit()
    return {"product_id": body.product_id, "qty_damaged": balance.qty_damaged, "qty_on_hand": balance.qty_on_hand}


@router.post("/damage/restore")
def stock_damage_restore(
    body: StockDamageRestoreIn,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.adjust"))],
    session: Annotated[Session, Depends(get_session)],
):
    balance = restore_damaged_stock(
        session, auth.company_id, body.product_id, body.store_id, body.warehouse_id,
        body.qty, auth.user_id, variant_id=body.variant_id,
    )
    write_audit(session, auth, "stock_damage_restore", "stock_balance", balance.id, {"qty": body.qty})
    session.commit()
    return {"product_id": body.product_id, "qty_damaged": balance.qty_damaged, "qty_on_hand": balance.qty_on_hand}


@router.post("/damage/writeoff")
def stock_damage_writeoff(
    body: StockDamageWriteoffIn,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.adjust"))],
    session: Annotated[Session, Depends(get_session)],
):
    balance = write_off_damaged_stock(
        session, auth.company_id, body.product_id, body.store_id, body.warehouse_id,
        body.qty, body.reason, auth.user_id,
    )
    write_audit(session, auth, "stock_damage_writeoff", "stock_balance", balance.id, {"qty": body.qty, "reason": body.reason})
    session.commit()
    return {"product_id": body.product_id, "qty_damaged": balance.qty_damaged}


@router.get("/policy", response_model=list[StockPolicyOut])
def inventory_policy_list(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
):
    return get_inventory_policies(session, auth.company_id)


@router.patch("/policy", response_model=StockPolicyOut)
def inventory_policy_update(
    body: StockPolicyUpdate,
    auth: Annotated[AuthContext, Depends(require_permission("config.flags"))],
    session: Annotated[Session, Depends(get_session)],
):
    result = upsert_inventory_policy(
        session,
        auth.company_id,
        body.store_id,
        allow_negative=body.allow_negative_stock,
        cost_method=body.cost_method,
        updated_by=auth.email,
    )
    write_audit(session, auth, "inventory_policy_update", "store_policy", body.store_id, result)
    session.commit()
    return result


@router.get("/reservations")
def reservation_list(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    status: Optional[str] = None,
):
    return list_reservations(session, auth.company_id, status=status)


@router.post("/reservations")
def reservation_create(
    body: ReservationCreate,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.adjust"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.inventory.exceptions import InsufficientStockError

    try:
        res = create_reservation(
            session,
            company_id=auth.company_id,
            product_id=body.product_id,
            store_id=body.store_id or auth.store_id,
            warehouse_id=body.warehouse_id,
            qty=body.qty,
            reference_type=body.reference_type,
            reference_id=body.reference_id,
            created_by=auth.user_id,
            variant_id=body.variant_id,
            batch_id=body.batch_id,
            serial_id=body.serial_id,
            expires_minutes=body.expires_minutes,
        )
    except InsufficientStockError as exc:
        from fastapi import HTTPException
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    write_audit(session, auth, "stock_reservation", "stock_reservation", res.id, {"qty": body.qty})
    session.commit()
    return {
        "id": res.id,
        "product_id": res.product_id,
        "qty": res.qty,
        "status": res.status,
        "expires_at": res.expires_at.isoformat() if res.expires_at else None,
    }


@router.post("/reservations/{reservation_id}/release")
def reservation_release(
    reservation_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.adjust"))],
    session: Annotated[Session, Depends(get_session)],
):
    res = release_reservation(session, auth.company_id, reservation_id)
    write_audit(session, auth, "stock_reservation_release", "stock_reservation", res.id, {})
    session.commit()
    return {"id": res.id, "status": res.status}


@router.post("/reservations/{reservation_id}/consume")
def reservation_consume(
    reservation_id: str,
    auth: Annotated[AuthContext, Depends(require_permission("inventory.adjust"))],
    session: Annotated[Session, Depends(get_session)],
):
    from app.inventory.exceptions import InsufficientStockError

    try:
        res = consume_reservation(
            session,
            auth.company_id,
            reservation_id,
            created_by=auth.user_id,
        )
    except InsufficientStockError as exc:
        from fastapi import HTTPException
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    write_audit(session, auth, "stock_reservation_consume", "stock_reservation", res.id, {})
    session.commit()
    return {"id": res.id, "status": res.status}
