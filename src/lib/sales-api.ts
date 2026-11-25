import { api } from "./api";
import type { CartLine } from "./app-store";
import { cartTotals } from "./app-store";
import type { PosMode } from "./industry-registry";

export type SalePayload = {
  client_transaction_id: string;
  industry_pack: string;
  lines: Array<{
    sku: string;
    name: string;
    qty: number;
    unit_price: number;
    product_id?: string;
    meta?: Record<string, unknown>;
    reservation_id?: string;
  }>;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  tender: string;
  payments?: Array<{ method: string; amount: number; reference?: string }>;
  reservation_ids?: string[];
  price_mode?: string;
  campaign_name?: string;
  store_id?: string;
  counter_id?: string;
  customer_id?: string;
  status?: string;
  loyalty_redeem_points?: number;
};

export type SplitPaymentInput = {
  cash?: number;
  card?: number;
  mobile?: number;
};

export function buildSplitPayments(total: number, split: SplitPaymentInput): Array<{ method: string; amount: number }> {
  const rows: Array<{ method: string; amount: number }> = [];
  if (split.cash && split.cash > 0) rows.push({ method: "cash", amount: split.cash });
  if (split.card && split.card > 0) rows.push({ method: "card", amount: split.card });
  if (split.mobile && split.mobile > 0) rows.push({ method: "mobile", amount: split.mobile });
  if (rows.length === 0) return [{ method: "cash", amount: total }];
  const paid = rows.reduce((s, r) => s + r.amount, 0);
  if (Math.abs(paid - total) > 0.02) {
    throw new Error(`Split payment total ${paid} must equal ${total}`);
  }
  return rows;
}

export function buildSalePayload(
  cart: CartLine[],
  industry: PosMode,
  tender: string,
  opts?: {
    clientId?: string;
    discountPct?: number;
    discountFixed?: number;
    extraDiscount?: number;
    taxRate?: number;
    priceMode?: string;
    campaignName?: string;
    storeId?: string;
    counterId?: string;
    customerId?: string;
    status?: string;
    payments?: Array<{ method: string; amount: number; reference?: string }>;
    reservationIds?: string[];
    loyaltyRedeemPoints?: number;
    totals?: {
      subtotal?: number;
      discount?: number;
      tax?: number;
      total?: number;
    };
  },
): SalePayload {
  const calculatedTotals = cartTotals(
    cart,
    opts?.discountPct ?? 0,
    opts?.taxRate ?? 0.05,
    opts?.extraDiscount ?? 0,
    opts?.discountFixed ?? 0,
  );
  const subtotal = opts?.totals?.subtotal != null ? opts.totals.subtotal : calculatedTotals.subtotal;
  const discount = opts?.totals?.discount != null ? opts.totals.discount : calculatedTotals.discount;
  const tax = opts?.totals?.tax != null ? opts.totals.tax : calculatedTotals.tax;
  const total = opts?.totals?.total != null ? opts.totals.total : calculatedTotals.total;

  const reservationIds = opts?.reservationIds ?? [];
  let resIdx = 0;
  return {
    client_transaction_id: opts?.clientId ?? `TX-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    industry_pack: industry,
    lines: cart.map(l => {
      const hasProduct = !!(l.extras?.productId as string | undefined);
      const reservation_id = hasProduct ? reservationIds[resIdx++] : undefined;
      const meta: Record<string, unknown> = {
        ...(l.extras || {}),
        ...(l.discountPct != null ? { discount_pct: l.discountPct } : {}),
        ...(l.discountFixed != null ? { discount_fixed: l.discountFixed } : {}),
        ...(l.originalPrice != null ? { original_price: l.originalPrice } : {}),
        ...(l.priceOverrideReason ? { price_override_reason: l.priceOverrideReason } : {}),
      };
      return {
        sku: l.sku,
        name: l.name,
        qty: l.qty,
        unit_price: l.price,
        product_id: l.extras?.productId as string | undefined,
        meta,
        reservation_id,
      };
    }),
    subtotal,
    discount,
    tax,
    total,
    tender: tender.toLowerCase(),
    payments: opts?.payments,
    reservation_ids: reservationIds.length ? reservationIds : undefined,
    price_mode: opts?.priceMode,
    campaign_name: opts?.campaignName,
    store_id: opts?.storeId,
    counter_id: opts?.counterId,
    customer_id: opts?.customerId,
    status: opts?.status,
    loyalty_redeem_points: opts?.loyaltyRedeemPoints,
  };
}

export async function postSale(payload: SalePayload) {
  return api.post<{ id: string; invoice_number: string; duplicate: boolean; total: number }>("/sales", payload);
}
