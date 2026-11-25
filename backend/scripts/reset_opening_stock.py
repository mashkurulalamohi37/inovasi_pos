"""Utility script to clear wrong opening stocks and optionally reset stock balances to zero."""

import argparse
import sys
from sqlmodel import Session, select

from app.database import engine
from app.models.inventory import (
    StockBalance,
    StockLedger,
    OpeningStockDocument,
    OpeningStockDocumentLine,
    StockAdjustment,
)
from app.models.accounting import JournalEntry, JournalLine
from app.models.industry import FashionProductVariant, PharmaBatch, ElectronicsSerialStock


def clear_opening_stock(reset_all_stock: bool = True, store_id: str | None = None, company_id: str | None = None):
    with Session(engine) as session:
        print("[1/5] Removing Opening Stock documents...")
        doc_stmt = select(OpeningStockDocument)
        if company_id:
            doc_stmt = doc_stmt.where(OpeningStockDocument.company_id == company_id)
        if store_id:
            doc_stmt = doc_stmt.where(OpeningStockDocument.store_id == store_id)
        docs = session.exec(doc_stmt).all()
        doc_count = len(docs)
        for doc in docs:
            lines = session.exec(select(OpeningStockDocumentLine).where(OpeningStockDocumentLine.document_id == doc.id)).all()
            for ln in lines:
                session.delete(ln)
            session.delete(doc)
        print(f"      Removed {doc_count} opening stock documents.")

        print("[2/5] Cleaning up opening stock journal entries...")
        je_stmt = select(JournalEntry).where(JournalEntry.source_type == "opening_stock")
        if company_id:
            je_stmt = je_stmt.where(JournalEntry.company_id == company_id)
        entries = session.exec(je_stmt).all()
        for je in entries:
            jlines = session.exec(select(JournalLine).where(JournalLine.entry_id == je.id)).all()
            for jl in jlines:
                session.delete(jl)
            session.delete(je)
        print(f"      Removed {len(entries)} opening stock journal entries.")

        print("[3/5] Cleaning up stock ledger entries...")
        ledger_types = ["OPENING", "opening"]
        if reset_all_stock:
            ledger_types.extend(["adjustment", "adjustment_plus", "adjustment_minus", "initial"])
        
        sl_stmt = select(StockLedger).where(StockLedger.transaction_type.in_(ledger_types))
        if company_id:
            sl_stmt = sl_stmt.where(StockLedger.company_id == company_id)
        if store_id:
            sl_stmt = sl_stmt.where(StockLedger.store_id == store_id)
        sl_rows = session.exec(sl_stmt).all()
        for sl in sl_rows:
            session.delete(sl)
        print(f"      Removed {len(sl_rows)} stock ledger entries.")

        if reset_all_stock:
            adj_stmt = select(StockAdjustment)
            if company_id:
                adj_stmt = adj_stmt.where(StockAdjustment.company_id == company_id)
            if store_id:
                adj_stmt = adj_stmt.where(StockAdjustment.store_id == store_id)
            for adj in session.exec(adj_stmt).all():
                session.delete(adj)

        print("[4/5] Resetting stock balances to 0...")
        bal_stmt = select(StockBalance)
        if company_id:
            bal_stmt = bal_stmt.where(StockBalance.company_id == company_id)
        if store_id:
            bal_stmt = bal_stmt.where(StockBalance.store_id == store_id)
        balances = session.exec(bal_stmt).all()
        for bal in balances:
            bal.qty_on_hand = 0.0
            bal.qty_reserved = 0.0
            bal.unit_cost_avg = 0.0
            session.add(bal)
        print(f"      Reset {len(balances)} stock balance rows to 0.")

        print("[5/5] Resetting industry satellite stock...")
        for fpv in session.exec(select(FashionProductVariant)).all():
            fpv.stock_qty = 0.0
            session.add(fpv)
        for pb in session.exec(select(PharmaBatch)).all():
            pb.qty_on_hand = 0.0
            session.add(pb)
        for es in session.exec(select(ElectronicsSerialStock)).all():
            session.delete(es)

        session.commit()
        print("\nAll wrong opening stock entries and balances have been successfully cleared!")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Clear opening stocks and reset inventory")
    parser.add_argument("--store-id", type=str, default=None, help="Specific store ID to reset")
    parser.add_argument("--company-id", type=str, default=None, help="Specific company ID to reset")
    parser.add_argument("--only-docs", action="store_true", help="Only clear opening stock docs, do not zero all balances")
    args = parser.parse_args()

    clear_opening_stock(
        reset_all_stock=not args.only_docs,
        store_id=args.store_id,
        company_id=args.company_id,
    )
