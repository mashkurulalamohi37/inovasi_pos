"""Opening stock document lifecycle: create draft, approve (posts stock), cancel."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlmodel import Session, select

from app.dependencies import AuthContext, write_audit
from app.models.core import Store
from app.models.inventory import OpeningStockDocument, OpeningStockDocumentLine
from app.models.product import Product
from app.services.inventory_service import ensure_fashion_variant, post_opening_stock
from app.services.purchase_service import _next_number


def _validate_product(session: Session, company_id: str, product_id: str) -> Product:
    product = session.get(Product, product_id)
    if not product or product.company_id != company_id:
        raise HTTPException(status_code=400, detail=f"Unknown product_id: {product_id}")
    return product


def _validate_store(session: Session, company_id: str, store_id: str | None) -> str | None:
    if not store_id:
        return None
    from app.services.inventory_service import resolve_store_id
    resolved = resolve_store_id(session, company_id, store_id, allow_default_fallback=False)
    if not resolved:
        raise HTTPException(status_code=400, detail=f"Unknown store_id: {store_id}")
    return resolved


def _document_out(session: Session, doc: OpeningStockDocument, include_lines: bool = False) -> dict[str, Any]:
    lines = session.exec(
        select(OpeningStockDocumentLine).where(OpeningStockDocumentLine.document_id == doc.id)
    ).all()

    product_names: list[str] = []
    product_skus: list[str] = []
    industry_packs: list[str] = []
    line_out = [] if include_lines else None
    from app.models.product import ProductVariant

    for ln in lines:
        product = session.get(Product, ln.product_id)
        variant = session.get(ProductVariant, ln.variant_id) if ln.variant_id else None
        p_name = product.name if product else "Unknown Product"
        p_sku = product.sku if product else ""
        if product and getattr(product, "industry_pack", None) and product.industry_pack not in industry_packs:
            industry_packs.append(product.industry_pack)
        if p_name and p_name not in product_names:
            product_names.append(p_name)
        if p_sku and p_sku not in product_skus:
            product_skus.append(p_sku)

        if include_lines:
            variant_desc = None
            if variant:
                parts = [p for p in [variant.size, variant.color] if p]
                variant_desc = " · ".join(parts) if parts else variant.variant_code
            line_out.append({
                "id": ln.id,
                "product_id": ln.product_id,
                "sku": p_sku,
                "name": p_name,
                "variant_id": ln.variant_id,
                "variant_code": variant.variant_code if variant else None,
                "variant_name": variant_desc,
                "size": variant.size if variant else None,
                "color": variant.color if variant else None,
                "qty": ln.qty,
                "unit_cost": ln.unit_cost,
                "line_total": ln.line_total,
                "batch_no": ln.batch_no,
                "lot_no": ln.lot_no,
                "expiry_date": ln.expiry_date.isoformat() if ln.expiry_date else None,
                "manufacture_date": ln.manufacture_date.isoformat() if ln.manufacture_date else None,
                "serials": json.loads(ln.serials_json) if ln.serials_json else None,
            })

    out: dict[str, Any] = {
        "id": doc.id,
        "os_number": doc.os_number,
        "store_id": doc.store_id,
        "warehouse_id": doc.warehouse_id,
        "status": doc.status,
        "total_amount": doc.total_amount,
        "note": doc.note,
        "created_by": doc.created_by,
        "posted_by": doc.posted_by,
        "posted_at": doc.posted_at.isoformat() if doc.posted_at else None,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
        "product_names": product_names,
        "product_skus": product_skus,
        "industry_packs": industry_packs,
        "primary_pack": industry_packs[0] if industry_packs else None,
        "items_summary": ", ".join(product_names) if product_names else "—",
        "total_items": len(lines),
    }
    if include_lines:
        out["lines"] = line_out
    return out


def create_opening_stock_document(
    session: Session,
    auth: AuthContext,
    *,
    store_id: str | None,
    warehouse_id: str | None,
    note: str | None,
    lines: list[dict[str, Any]],
) -> dict[str, Any]:
    if not lines:
        raise HTTPException(status_code=400, detail="At least one line required")
    resolved_store_id = _validate_store(session, auth.company_id, store_id or auth.store_id)

    doc = OpeningStockDocument(
        company_id=auth.company_id,
        store_id=resolved_store_id,
        warehouse_id=warehouse_id,
        os_number=_next_number(session, auth.company_id, "OPENING_STOCK", "OS"),
        status="DRAFT",
        note=note,
        created_by=auth.user_id,
    )
    session.add(doc)
    session.flush()

    total = 0.0
    for ln in lines:
        product = _validate_product(session, auth.company_id, ln["product_id"])
        qty = float(ln["qty"])
        if qty <= 0:
            raise HTTPException(status_code=400, detail="Line qty must be greater than zero")
        unit_cost = float(ln.get("unit_cost") or 0)
        line_total = round(qty * unit_cost, 2)
        total += line_total
        serials = ln.get("serials")
        variant_id = ln.get("variant_id")
        if product.industry_pack == "fashion":
            variant_id = ensure_fashion_variant(session, auth.company_id, product, variant_id)
        session.add(
            OpeningStockDocumentLine(
                document_id=doc.id,
                product_id=ln["product_id"],
                variant_id=variant_id,
                qty=qty,
                unit_cost=unit_cost,
                line_total=line_total,
                batch_no=ln.get("batch_no"),
                lot_no=ln.get("lot_no"),
                expiry_date=ln.get("expiry_date"),
                manufacture_date=ln.get("manufacture_date"),
                serials_json=json.dumps(serials) if serials else None,
            )
        )

    doc.total_amount = round(total, 2)
    session.add(doc)
    session.flush()
    write_audit(session, auth, "opening_stock_document_create", "opening_stock_document", doc.id, {"lines": len(lines)})
    return _document_out(session, doc, include_lines=True)


def list_opening_stock_documents(
    session: Session,
    company_id: str,
    *,
    store_id: str | None = None,
    status: str | None = None,
    industry: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    stmt = select(OpeningStockDocument).where(OpeningStockDocument.company_id == company_id)
    if store_id:
        stmt = stmt.where(OpeningStockDocument.store_id == store_id)
    if status:
        stmt = stmt.where(OpeningStockDocument.status == status)
    stmt = stmt.order_by(OpeningStockDocument.created_at.desc()).limit(limit)  # type: ignore
    docs = session.exec(stmt).all()
    results = [_document_out(session, d) for d in docs]
    if industry and industry != "all":
        results = [d for d in results if industry in (d.get("industry_packs") or [])]
    return results


def get_opening_stock_document(session: Session, company_id: str, document_id: str) -> dict[str, Any]:
    doc = session.get(OpeningStockDocument, document_id)
    if not doc or doc.company_id != company_id:
        raise HTTPException(status_code=404, detail="Opening stock document not found")
    return _document_out(session, doc, include_lines=True)


def post_opening_stock_document(session: Session, auth: AuthContext, document_id: str) -> dict[str, Any]:
    doc = session.get(OpeningStockDocument, document_id)
    if not doc or doc.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Opening stock document not found")
    if doc.status != "DRAFT":
        raise HTTPException(status_code=409, detail=f"Document is {doc.status}, only DRAFT documents can be posted")

    lines = session.exec(
        select(OpeningStockDocumentLine).where(OpeningStockDocumentLine.document_id == doc.id)
    ).all()
    for ln in lines:
        product = _validate_product(session, auth.company_id, ln.product_id)
        variant_id = ln.variant_id
        if product.industry_pack == "fashion":
            variant_id = ensure_fashion_variant(session, auth.company_id, product, variant_id)
            if ln.variant_id != variant_id:
                ln.variant_id = variant_id
                session.add(ln)
        post_opening_stock(
            session,
            company_id=auth.company_id,
            product_id=ln.product_id,
            store_id=doc.store_id,
            warehouse_id=doc.warehouse_id,
            qty=ln.qty,
            unit_cost=ln.unit_cost,
            variant_id=variant_id,
            note=doc.note,
            created_by=auth.user_id,
            transaction_ref=doc.os_number,
            batch_no=ln.batch_no,
            lot_no=ln.lot_no,
            expiry_date=ln.expiry_date,
            manufacture_date=ln.manufacture_date,
            serials=json.loads(ln.serials_json) if ln.serials_json else None,
        )

    doc.status = "POSTED"
    doc.posted_by = auth.user_id
    doc.posted_at = datetime.now(timezone.utc)
    session.add(doc)
    write_audit(session, auth, "opening_stock_document_post", "opening_stock_document", doc.id, {"lines": len(lines)})
    return _document_out(session, doc, include_lines=True)


def cancel_opening_stock_document(session: Session, auth: AuthContext, document_id: str) -> dict[str, Any]:
    doc = session.get(OpeningStockDocument, document_id)
    if not doc or doc.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Opening stock document not found")
    if doc.status != "DRAFT":
        raise HTTPException(status_code=409, detail=f"Only DRAFT documents can be cancelled (current: {doc.status})")
    doc.status = "CANCELLED"
    session.add(doc)
    write_audit(session, auth, "opening_stock_document_cancel", "opening_stock_document", doc.id, {})
    return _document_out(session, doc, include_lines=True)


def revert_opening_stock_document(session: Session, auth: AuthContext, document_id: str) -> dict[str, Any]:
    doc = session.get(OpeningStockDocument, document_id)
    if not doc or doc.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Opening stock document not found")
    if doc.status != "POSTED":
        raise HTTPException(status_code=400, detail=f"Only POSTED documents can be reverted (current status: {doc.status})")

    lines = session.exec(
        select(OpeningStockDocumentLine).where(OpeningStockDocumentLine.document_id == doc.id)
    ).all()

    from app.models.inventory import StockBalance, StockLedger
    from app.models.accounting import JournalEntry, JournalLine
    from app.services.inventory_service import sync_industry_stock_on_movement

    for ln in lines:
        bal = session.exec(
            select(StockBalance).where(
                StockBalance.company_id == auth.company_id,
                StockBalance.store_id == doc.store_id,
                StockBalance.product_id == ln.product_id,
            )
        ).first()
        if bal:
            bal.qty_on_hand = max(0.0, (bal.qty_on_hand or 0.0) - ln.qty)
            session.add(bal)

        # Mirror reversal to variants/satellites
        product = session.get(Product, ln.product_id)
        sync_industry_stock_on_movement(
            session,
            auth.company_id,
            product,
            qty_delta=-ln.qty,
            variant_id=ln.variant_id,
        )

        # Explicitly ensure FashionProductVariant stock is reduced and capped to remaining balance
        if product and product.industry_pack == "fashion":
            from app.models.industry import FashionProductVariant
            fpvs = session.exec(
                select(FashionProductVariant).where(FashionProductVariant.product_id == ln.product_id)
            ).all()
            rem = bal.qty_on_hand if bal else 0.0
            for v in fpvs:
                v.stock_qty = max(0.0, min(rem, (v.stock_qty or 0.0) - ln.qty))
                session.add(v)

        # Record reversing stock movement ledger entry
        session.add(
            StockLedger(
                company_id=auth.company_id,
                product_id=ln.product_id,
                store_id=doc.store_id,
                warehouse_id=doc.warehouse_id,
                variant_id=ln.variant_id,
                transaction_type="adjustment_minus",
                transaction_ref=doc.os_number,
                in_qty=0,
                out_qty=ln.qty,
                qty_delta=-ln.qty,
                balance_after=bal.qty_on_hand if bal else 0.0,
                unit_cost=ln.unit_cost,
                total_cost=ln.qty * ln.unit_cost,
                reference_type="opening_reversal",
                reference_id=doc.id,
                note=f"Reversal of {doc.os_number}",
                created_by=auth.user_id,
            )
        )

    # Revert accounting journal entry for this document
    jes = session.exec(
        select(JournalEntry).where(
            JournalEntry.company_id == auth.company_id,
            JournalEntry.source_type == "opening_stock",
            (JournalEntry.source_id == doc.id) | (JournalEntry.memo.like(f"%{doc.os_number}%")),
        )
    ).all()
    for je in jes:
        for jl in session.exec(select(JournalLine).where(JournalLine.entry_id == je.id)).all():
            session.delete(jl)
        session.delete(je)

    doc.status = "REVERTED"
    session.add(doc)
    write_audit(session, auth, "opening_stock_document_revert", "opening_stock_document", doc.id, {"lines": len(lines)})
    return _document_out(session, doc, include_lines=True)


def delete_opening_stock_document(session: Session, auth: AuthContext, document_id: str) -> dict[str, Any]:
    from app.models.inventory import OpeningStockDocument, OpeningStockDocumentLine, StockLedger
    from app.models.accounting import JournalEntry, JournalLine
    from sqlalchemy import delete as sa_delete

    doc = session.get(OpeningStockDocument, document_id)
    if not doc or doc.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Opening stock document not found")
    if doc.status not in ("CANCELLED", "REVERTED", "DRAFT"):
        raise HTTPException(status_code=400, detail="Cannot delete a POSTED document. Please revert it first.")

    os_number = doc.os_number

    with session.no_autoflush:
        # 1. Clean up any related journal entries first
        jes = session.exec(
            select(JournalEntry).where(
                JournalEntry.company_id == auth.company_id,
                JournalEntry.source_type == "opening_stock",
                (JournalEntry.source_id == doc.id) | (JournalEntry.memo.like(f"%{os_number}%")),
            )
        ).all()
        for je in jes:
            session.execute(sa_delete(JournalLine).where(JournalLine.entry_id == je.id))
            session.flush()
            session.execute(sa_delete(JournalEntry).where(JournalEntry.id == je.id))
            session.flush()

        # 2. Clean up any stock ledger reversal entries for this document
        session.execute(
            sa_delete(StockLedger).where(
                StockLedger.company_id == auth.company_id,
                (StockLedger.reference_id == doc.id) | (StockLedger.transaction_ref == os_number),
            )
        )
        session.flush()

        # 3. Clean up document lines and flush immediately to satisfy FK constraint
        session.execute(
            sa_delete(OpeningStockDocumentLine).where(OpeningStockDocumentLine.document_id == doc.id)
        )
        session.flush()

        # 4. Safe to delete parent document
        session.execute(
            sa_delete(OpeningStockDocument).where(OpeningStockDocument.id == doc.id)
        )
        session.flush()

    write_audit(session, auth, "opening_stock_document_delete", "opening_stock_document", document_id, {"os_number": os_number})
    return {"ok": True, "id": document_id}


def revert_store_opening_stock(session: Session, auth: AuthContext, store_id: str | None) -> dict[str, Any]:
    from app.models.inventory import StockBalance, StockLedger, StockAdjustment
    from app.models.accounting import JournalEntry, JournalLine
    from app.models.industry import FashionProductVariant
    from sqlalchemy import delete as sa_delete

    resolved_store_id = store_id or auth.store_id
    if not resolved_store_id:
        raise HTTPException(status_code=400, detail="Store ID is required to clear opening stock")

    # 1. Find opening stock documents and affected products
    doc_stmt = select(OpeningStockDocument).where(
        OpeningStockDocument.company_id == auth.company_id,
        OpeningStockDocument.store_id == resolved_store_id,
    )
    docs = list(session.exec(doc_stmt).all())
    doc_ids = [d.id for d in docs]
    doc_product_ids: set[str] = set()
    if doc_ids:
        lines = session.exec(
            select(OpeningStockDocumentLine).where(OpeningStockDocumentLine.document_id.in_(doc_ids))
        ).all()
        for ln in lines:
            if ln.product_id:
                doc_product_ids.add(ln.product_id)

    # 2. Stock Ledger rows for all Opening Stock entries (OS-* documents, OPENING type, and Initial Opening Stock adjustments)
    sl_stmt = select(StockLedger).where(
        StockLedger.company_id == auth.company_id,
        StockLedger.store_id == resolved_store_id,
        (
            StockLedger.transaction_type.in_(["opening", "OPENING"])
            | (StockLedger.transaction_ref.like("OS-%"))
            | (StockLedger.note.ilike("%Opening Stock%"))
            | (StockLedger.note.ilike("%Opening balance%"))
        ),
    )
    ledger_entries = list(session.exec(sl_stmt).all())

    # Also include Initial Opening Stock adjustments recorded from Product Master creation
    adj_stmt = select(StockAdjustment).where(
        StockAdjustment.company_id == auth.company_id,
        StockAdjustment.store_id == resolved_store_id,
        StockAdjustment.reason.ilike("%Opening Stock%"),
    )
    adj_entries = list(session.exec(adj_stmt).all())

    revert_map: dict[str, float] = {}

    for sl in ledger_entries:
        in_qty = sl.in_qty or 0.0
        delta = sl.qty_delta or 0.0
        qty = in_qty if in_qty > 0 else delta
        if qty > 0 and sl.product_id:
            revert_map[sl.product_id] = revert_map.get(sl.product_id, 0.0) + qty

    for adj in adj_entries:
        adj_delta = (adj.qty_after or 0.0) - (adj.qty_before or 0.0)
        if adj_delta > 0 and adj.product_id and adj.product_id not in revert_map:
            revert_map[adj.product_id] = revert_map.get(adj.product_id, 0.0) + adj_delta

    # 3. Update stock balances
    for pid, qty in revert_map.items():
        bal = session.exec(
            select(StockBalance).where(
                StockBalance.company_id == auth.company_id,
                StockBalance.store_id == resolved_store_id,
                StockBalance.product_id == pid,
            )
        ).first()
        if bal:
            bal.qty_on_hand = max(0.0, (bal.qty_on_hand or 0.0) - qty)
            session.add(bal)

    # 4. Synchronize and clamp Fashion variants to remaining stock balance
    all_affected_pids = set(revert_map.keys()) | doc_product_ids | {a.product_id for a in adj_entries}
    for pid in all_affected_pids:
        bal = session.exec(
            select(StockBalance).where(
                StockBalance.company_id == auth.company_id,
                StockBalance.store_id == resolved_store_id,
                StockBalance.product_id == pid,
            )
        ).first()
        rem_stock = bal.qty_on_hand if bal else 0.0
        fpvs = session.exec(
            select(FashionProductVariant).where(FashionProductVariant.product_id == pid)
        ).all()
        for v in fpvs:
            v.stock_qty = max(0.0, min(v.stock_qty or 0.0, rem_stock))
            session.add(v)

    with session.no_autoflush:
        # 5. Delete opening stock ledger entries and initial adjustments
        for sl in ledger_entries:
            session.delete(sl)
        for adj in adj_entries:
            session.delete(adj)
        session.flush()

        # 6. Delete child lines FIRST using direct SQL delete to avoid FK violations
        if doc_ids:
            session.execute(
                sa_delete(OpeningStockDocumentLine).where(OpeningStockDocumentLine.document_id.in_(doc_ids))
            )
            session.flush()
            session.execute(
                sa_delete(OpeningStockDocument).where(OpeningStockDocument.id.in_(doc_ids))
            )
            session.flush()

        # 7. Delete opening stock journal entries
        je_stmt = select(JournalEntry).where(
            JournalEntry.company_id == auth.company_id,
            JournalEntry.source_type == "opening_stock",
        )
        for je in session.exec(je_stmt).all():
            session.execute(sa_delete(JournalLine).where(JournalLine.entry_id == je.id))
            session.flush()
            session.execute(sa_delete(JournalEntry).where(JournalEntry.id == je.id))
            session.flush()

    write_audit(session, auth, "opening_stock_clear", "store", resolved_store_id, {
        "reverted_products": len(revert_map),
        "cleared_documents": len(docs),
    })

    return {
        "ok": True,
        "store_id": resolved_store_id,
        "reverted_products": len(revert_map),
        "cleared_documents": len(docs),
    }
