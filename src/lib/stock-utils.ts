export type ApiStockRow = {
  product_id: string;
  sku: string;
  name: string;
  store_id?: string | null;
  warehouse_id?: string | null;
  qty_on_hand: number;
  qty_reserved?: number;
  qty_available?: number;
  qty_damaged?: number;
  qty_in_transit?: number;
  unit_cost_avg?: number;
};

/** Sum on-hand / reserved / available across warehouse buckets for each product. */
export function aggregateStockByProduct(rows: ApiStockRow[]): ApiStockRow[] {
  const map = new Map<string, ApiStockRow>();
  for (const row of rows) {
    const existing = map.get(row.product_id);
    if (!existing) {
      map.set(row.product_id, {
        ...row,
        qty_reserved: row.qty_reserved ?? 0,
        qty_available: row.qty_available ?? row.qty_on_hand - (row.qty_reserved ?? 0),
        qty_damaged: row.qty_damaged ?? 0,
        qty_in_transit: row.qty_in_transit ?? 0,
      });
      continue;
    }
    existing.qty_on_hand += row.qty_on_hand;
    existing.qty_reserved = (existing.qty_reserved ?? 0) + (row.qty_reserved ?? 0);
    existing.qty_available = (existing.qty_available ?? 0) + (row.qty_available ?? row.qty_on_hand - (row.qty_reserved ?? 0));
    existing.qty_damaged = (existing.qty_damaged ?? 0) + (row.qty_damaged ?? 0);
    existing.qty_in_transit = (existing.qty_in_transit ?? 0) + (row.qty_in_transit ?? 0);
  }
  return Array.from(map.values());
}

export function stockQtyMap(rows: ApiStockRow[]): Map<string, number> {
  return new Map(aggregateStockByProduct(rows).map(s => [s.product_id, s.qty_available ?? s.qty_on_hand]));
}

export const DEFAULT_LOW_STOCK_THRESHOLD = 20;
export const LOW_STOCK_THRESHOLD_STORAGE_KEY = "pulse.inventory.lowStockThreshold";
export const LOW_STOCK_THRESHOLD_EVENT = "pulse:lowStockThresholdChanged";

export function getStoredLowStockThreshold(): number {
  if (typeof window === "undefined" || !window.localStorage) {
    return DEFAULT_LOW_STOCK_THRESHOLD;
  }
  try {
    const raw = localStorage.getItem(LOW_STOCK_THRESHOLD_STORAGE_KEY);
    if (raw) {
      const val = Number(raw);
      if (!Number.isNaN(val) && val > 0) return val;
    }
  } catch {}
  return DEFAULT_LOW_STOCK_THRESHOLD;
}

export function setStoredLowStockThreshold(val: number): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    if (val > 0) {
      localStorage.setItem(LOW_STOCK_THRESHOLD_STORAGE_KEY, String(val));
    } else {
      localStorage.removeItem(LOW_STOCK_THRESHOLD_STORAGE_KEY);
    }
    window.dispatchEvent(new CustomEvent(LOW_STOCK_THRESHOLD_EVENT, { detail: val }));
  } catch {}
}
