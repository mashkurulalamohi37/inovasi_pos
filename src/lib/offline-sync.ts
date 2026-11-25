import { api } from "./api";
import type { QueuedSale, SyncResult } from "./app-store";
import { cartTotals } from "./app-store";

export type OfflineSalePayload = {
  client_transaction_id: string;
  industry_pack: string;
  lines: Array<{
    sku: string;
    name: string;
    qty: number;
    unit_price: number;
    product_id?: string;
    meta?: Record<string, unknown>;
  }>;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  tender: string;
  payments?: Array<{ method: string; amount: number }>;
  reservation_ids?: string[];
  price_mode?: string;
  campaign_name?: string;
  store_id?: string;
  counter_id?: string;
};

export function queuedSaleToPayload(sale: QueuedSale, industry: string): OfflineSalePayload {
  const totals = cartTotals(
    sale.lines,
    sale.discountPct ?? 0,
    0.05,
    sale.extraDiscount ?? 0,
    sale.discountFixed ?? 0,
  );
  return {
    client_transaction_id: sale.id,
    industry_pack: industry,
    lines: sale.lines.map((l, i) => ({
      sku: l.sku,
      name: l.name,
      qty: l.qty,
      unit_price: l.price,
      product_id: l.extras?.productId as string | undefined,
      meta: l.extras as Record<string, unknown> | undefined,
      reservation_id: sale.reservationIds?.[i],
    })),
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    total: sale.total,
    tender: sale.tender,
    payments: sale.payments,
    reservation_ids: sale.reservationIds,
  };
}

export async function syncSaleToBackend(payload: OfflineSalePayload): Promise<{ ok: boolean; duplicate?: boolean; invoice_number?: string; error?: string }> {
  try {
    const res = await api.post<{ duplicate: boolean; invoice_number: string }>("/sales", payload);
    return { ok: true, duplicate: res.duplicate, invoice_number: res.invoice_number };
  } catch (e: unknown) {
    const err = e as { detail?: string; status?: number };
    if (err.status === 409) {
      const sync = await api.get<{ status: string; invoice_number?: string }>(
        `/sales/sync/${encodeURIComponent(payload.client_transaction_id)}`,
      ).catch(() => null);
      if (sync?.status === "duplicate" || sync?.status === "synced") {
        return { ok: true, duplicate: true, invoice_number: sync.invoice_number };
      }
      return { ok: false, error: "conflict" };
    }
    return { ok: false, error: err.detail ?? "Sync failed" };
  }
}

export async function syncQueuedSales(
  sales: QueuedSale[],
  industry: string,
): Promise<SyncResult> {
  const pending = sales.filter(q => q.status === "queued" || q.status === "conflict");
  const details: SyncResult["details"] = [];
  let synced = 0;
  let conflicts = 0;

  for (const q of pending) {
    const payload = queuedSaleToPayload(q, q.industry ?? industry);
    const result = await syncSaleToBackend(payload);
    if (result.ok) {
      synced++;
      details.push({ id: q.id, status: "synced" });
    } else if (result.error === "conflict") {
      conflicts++;
      details.push({ id: q.id, status: "conflict", reason: "Server rejected sale — stock or price conflict" });
    } else {
      conflicts++;
      details.push({ id: q.id, status: "conflict", reason: result.error });
    }
  }

  return { synced, conflicts, total: pending.length, details };
}

export type SyncStatus = "online" | "offline" | "sync_pending" | "synced" | "sync_failed";

export function computeSyncStatus(offline: boolean, queuedCount: number, lastSyncFailed: boolean): SyncStatus {
  if (offline) return "offline";
  if (lastSyncFailed) return "sync_failed";
  if (queuedCount > 0) return "sync_pending";
  return "online";
}
