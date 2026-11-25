"""Revert/clear opening stock for a specific store and company."""

import argparse
from sqlmodel import Session, select
from sqlalchemy import func

from app.database import engine
from app.models.core import Company, Store
from app.models.inventory import (
    StockBalance,
    StockLedger,
    OpeningStockDocument,
    OpeningStockDocumentLine,
    StockAdjustment,
)
from app.models.accounting import JournalEntry, JournalLine
from app.models.industry import FashionProductVariant, PharmaBatch, ElectronicsSerialStock


def clear_store_opening_stock(
    company_id: str = "3397de13-082e-4547-9db2-6a5405ebb085",
    store_name_or_id: str = "Main Store",
    dry_run: bool = False,
):
    with Session(engine) as session:
        # Resolve company
        company = session.get(Company, company_id)
        if not company:
            # Try searching by id
            company = session.exec(select(Company).where(Company.id == company_id)).first()
        company_name = company.name if company else company_id
        print(f"--- Clearing Opening Stock ---")
        print(f"Company: {company_name} ({company_id})")

        # Resolve store
        store = session.get(Store, store_name_or_id)
        if not store:
            store = session.exec(
                select(Store).where(
                    Store.company_id == company_id,
                    func.lower(Store.name) == store_name_or_id.strip().lower(),
                )
            ).first()
        if not store:
            # Fallback: partial match or any store for this company
            store = session.exec(
                select(Store).where(
                    Store.company_id == company_id,
                    Store.name.ilike(f"%{store_name_or_id.strip()}%"),
                )
            ).first()

        if not store:
            stores = session.exec(select(Store).where(Store.company_id == company_id)).all()
            store_names = [f"'{s.name}' ({s.id})" for s in stores]
            print(f"ERROR: Store '{store_name_or_id}' not found for company {company_id}.")
            print(f"Available stores: {', '.join(store_names)}")
            return

        store_id = store.id
        print(f"Store:   {store.name} ({store_id})\n")

        # 1. Find all Opening Stock Documents for this company & store
        docs = session.exec(
            select(OpeningStockDocument).where(
                OpeningStockDocument.company_id == company_id,
                OpeningStockDocument.store_id == store_id,
            )
        ).all()
        print(f"[1] Opening Stock Documents: found {len(docs)} documents.")

        # 2. Find Stock Ledger rows for Opening Stock screen entries only (OS-* documents or OPENING transaction type)
        sl_stmt = select(StockLedger).where(
            StockLedger.company_id == company_id,
            StockLedger.store_id == store_id,
            (
                StockLedger.transaction_type.in_(["opening", "OPENING"])
                | (StockLedger.transaction_ref.like("OS-%"))
            ),
        )
        ledger_entries = session.exec(sl_stmt).all()
        print(f"[2] Stock Ledger Opening Entries: found {len(ledger_entries)} entries.")

        # Calculate quantities to revert per product / variant
        revert_map: dict[str, float] = {}  # product_id -> total qty
        variant_revert_map: dict[str, float] = {}  # variant_id -> total qty

        for sl in ledger_entries:
            qty = sl.in_qty if sl.in_qty > 0 else sl.qty_delta
            if qty > 0:
                revert_map[sl.product_id] = revert_map.get(sl.product_id, 0.0) + qty
                if sl.variant_id:
                    variant_revert_map[sl.variant_id] = variant_revert_map.get(sl.variant_id, 0.0) + qty

        print(f"[3] Products affected: {len(revert_map)} products.")
        for pid, qty in revert_map.items():
            print(f"    - Product {pid}: reverting {qty} units")

        if dry_run:
            print("\n[DRY RUN] No changes were written to database.")
            return

        # 4. Revert StockBalance
        for pid, qty in revert_map.items():
            bal = session.exec(
                select(StockBalance).where(
                    StockBalance.company_id == company_id,
                    StockBalance.store_id == store_id,
                    StockBalance.product_id == pid,
                )
            ).first()
            if bal:
                old_qty = bal.qty_on_hand or 0.0
                new_qty = max(0.0, old_qty - qty)
                bal.qty_on_hand = new_qty
                session.add(bal)
                print(f"    Updated balance for {pid}: {old_qty} -> {new_qty}")

        # Revert variants
        for vid, qty in variant_revert_map.items():
            fpv = session.get(FashionProductVariant, vid)
            if fpv:
                fpv.stock_qty = max(0.0, (fpv.stock_qty or 0.0) - qty)
                session.add(fpv)

        # 5. Delete or Cancel OpeningStockDocuments
        for doc in docs:
            lines = session.exec(
                select(OpeningStockDocumentLine).where(OpeningStockDocumentLine.document_id == doc.id)
            ).all()
            for ln in lines:
                session.delete(ln)
            session.delete(doc)

        # 6. Delete Stock Ledger opening entries (only from opening stock screen)
        for sl in ledger_entries:
            session.delete(sl)

        # 8. Clean up Journal Entries for opening_stock in this store/company
        je_stmt = select(JournalEntry).where(
            JournalEntry.company_id == company_id,
            JournalEntry.source_type == "opening_stock",
        )
        for je in session.exec(je_stmt).all():
            jlines = session.exec(select(JournalLine).where(JournalLine.entry_id == je.id)).all()
            # If jline has store_id, only delete if matching, or if entire entry is for this store
            store_match = any(jl.store_id == store_id for jl in jlines) if jlines else True
            if store_match:
                for jl in jlines:
                    session.delete(jl)
                session.delete(je)

        session.commit()
        print(f"\nSUCCESS: Opening stock for '{store.name}' has been completely cleared and reverted!")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Revert opening stock for a single store")
    parser.add_argument("--company-id", type=str, default="3397de13-082e-4547-9db2-6a5405ebb085")
    parser.add_argument("--store", type=str, default="Main Store", help="Store name or store UUID")
    parser.add_argument("--dry-run", action="store_true", help="Inspect without modifying DB")
    args = parser.parse_args()

    clear_store_opening_stock(
        company_id=args.company_id,
        store_name_or_id=args.store,
        dry_run=args.dry_run,
    )
