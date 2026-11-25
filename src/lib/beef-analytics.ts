import { beefCatalog, butchers, cutTypes, beefWastageLog } from "./industry-mock";
import type { Transaction } from "./app-store";
import type { BeefWastageRecord } from "./pulse-storage";
import { readStorage, STORAGE_KEYS } from "./pulse-storage";

export type BeefTxRow = {
  id: string;
  ts: number;
  product: string;
  category: string;
  cutType: string;
  butcher: string;
  batch: string;
  kg: number;
  value: number;
};

export function loadWastage(): BeefWastageRecord[] {
  const stored = readStorage<BeefWastageRecord[]>(STORAGE_KEYS.beefWastage, []);
  const seed: BeefWastageRecord[] = beefWastageLog.map(w => ({
    id: w.id,
    product: w.sku,
    batch: "CS-2026-0612",
    cutType: "Regular cut",
    wastageType: w.reason,
    kg: w.qty,
    reason: w.reason,
    responsible: w.butcher,
    ts: new Date(w.date).getTime(),
  }));
  return [...stored, ...seed];
}

export function beefTransactionsFromTx(transactions: Transaction[]): BeefTxRow[] {
  return transactions
    .filter(t => t.industry === "beef-shop")
    .flatMap(t => {
      const item = beefCatalog[t.ts % beefCatalog.length];
      const cut = cutTypes[t.ts % cutTypes.length];
      const butcher = butchers[t.ts % butchers.length];
      const kg = 1 + (t.ts % 30) / 10;
      return [{
        id: t.id,
        ts: t.ts,
        product: item.name,
        category: item.category,
        cutType: cut,
        butcher,
        batch: item.batchNo,
        kg,
        value: t.total,
      }];
    });
}

export function beefDashboardStats(transactions: Transaction[], wastage: BeefWastageRecord[]) {
  const today = new Date().toDateString();
  const beefTx = beefTransactionsFromTx(transactions);
  const todayTx = beefTx.filter(t => new Date(t.ts).toDateString() === today);
  const todayKg = todayTx.reduce((s, t) => s + t.kg, 0);
  const todayValue = todayTx.reduce((s, t) => s + t.value, 0);
  const todayWastage = wastage.filter(w => new Date(w.ts).toDateString() === today).reduce((s, w) => s + w.kg, 0);

  const cutCounts: Record<string, number> = {};
  beefTx.forEach(t => { cutCounts[t.cutType] = (cutCounts[t.cutType] ?? 0) + 1; });
  const topCut = Object.entries(cutCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Steak";

  const butcherSales: Record<string, number> = {};
  beefTx.forEach(t => { butcherSales[t.butcher] = (butcherSales[t.butcher] ?? 0) + t.value; });

  const coldStock = beefCatalog.reduce((s, b) => s + 12, 0);
  const nearExpiry = beefCatalog.filter(b => new Date(b.expiryDate) <= new Date(Date.now() + 3 * 86400000));

  return { todayKg, todayValue, todayWastage, topCut, butcherSales, coldStock, nearExpiry, beefTx };
}
