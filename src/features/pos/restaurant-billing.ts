/**
 * Restaurant bill arithmetic, mirroring backend `bill_and_pay_order`.
 *
 * The POS previously read `order.tax` and `order.service_charge` straight back
 * from an open order, but the backend only writes those at settlement, so the
 * settle dialog quoted a bill with no VAT and a total 15.5% under what the
 * invoice recorded. Keeping the formula here — in one place, tested — is what
 * stops the quoted figure and the charged figure drifting apart again.
 */

/** VAT rate the backend applies when the caller sends none. */
export const VAT_RATE = 0.05;

export const round2 = (n: number) => Math.round(n * 100) / 100;

export type RestaurantBill = {
  subtotal: number;
  discount: number;
  serviceCharge: number;
  tax: number;
  total: number;
};

/**
 * VAT applies to (subtotal - discount + service charge), not to the subtotal
 * alone — the service charge is itself taxable.
 */
export function computeRestaurantBill({
  subtotal,
  discount = 0,
  servicePct = 0,
  vatRate = VAT_RATE,
}: {
  subtotal: number;
  discount?: number;
  servicePct?: number;
  vatRate?: number;
}): RestaurantBill {
  const net = Math.round(Number.isFinite(subtotal) ? subtotal : 0);
  const off = Math.round(Number.isFinite(discount) ? discount : 0);
  const serviceCharge = servicePct > 0 ? Math.round(net * (servicePct / 100)) : 0;
  const taxable = Math.max(0, net - off + serviceCharge);
  const tax = Math.round(taxable * vatRate);
  return { subtotal: net, discount: off, serviceCharge, tax, total: Math.round(taxable + tax) };
}

/**
 * Equal guest shares that sum to `total` exactly.
 *
 * `bill_and_pay_order` rejects a payment set that misses the bill by more than a
 * paisa, so N naive `total / n` shares fail on any total that does not divide
 * cleanly. Working in whole paisa and handing the leftover out one at a time
 * keeps the sum exact *and* the shares within 0.01 of each other — piling the
 * whole remainder onto the last guest can overcharge them by several paisa.
 */
export function splitBillEqually(total: number, guests: number): number[] {
  const n = Math.max(1, Math.floor(guests));
  const paisa = Math.round(round2(Number.isFinite(total) ? Math.max(0, total) : 0) * 100);
  const base = Math.floor(paisa / n);
  const leftover = paisa - base * n;
  return Array.from({ length: n }, (_, i) => round2((base + (i < leftover ? 1 : 0)) / 100));
}

/**
 * The flat rate PosShell must use for its cart total to match the backend.
 *
 * Service charge and VAT compound rather than add: 10% service + 5% VAT is
 * 15.5%, not 15%. Passing `servicePct/100 + vatRate` understated every serviced
 * order by 0.5% of subtotal.
 */
export function effectiveCartTaxRate(servicePct: number, vatRate = VAT_RATE): number {
  return (1 + servicePct / 100) * (1 + vatRate) - 1;
}
