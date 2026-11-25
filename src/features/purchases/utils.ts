import type { ApiPurchase } from "@/hooks/use-api-config";

export function normPurchaseStatus(status: string): string {
  return status.toLowerCase().replace(/_/g, "-");
}

/** UI label for list badges — drafts awaiting approval show as Pending. */
export function displayPurchaseStatus(status: string): string {
  const s = normPurchaseStatus(status);
  if (s === "draft") return "pending";
  if (s === "partially-received") return "partial";
  return s;
}

export function lineSubtotal(qty: number, rate: number): number {
  return Math.round(qty * rate * 100) / 100;
}

export function purchaseTotals(
  lines: Array<{ qty: number; unit_cost: number; discount_amount?: number; tax_amount?: number }>,
  discount = 0,
  tax = 0,
) {
  // Mirrors backend _line_totals: line total = qty * cost − line discount + line tax.
  const subtotal = lines.reduce(
    (s, l) => s + lineSubtotal(l.qty, l.unit_cost) - (l.discount_amount ?? 0) + (l.tax_amount ?? 0),
    0,
  );
  const lineDiscount = lines.reduce((s, l) => s + (l.discount_amount ?? 0), 0);
  const lineTax = lines.reduce((s, l) => s + (l.tax_amount ?? 0), 0);
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    lineDiscount: Math.round(lineDiscount * 100) / 100,
    lineTax: Math.round(lineTax * 100) / 100,
    total: Math.round((subtotal - discount + tax) * 100) / 100,
  };
}

export function validateReceiveQty(receiveQty: number, openQty: number): string | null {
  if (!Number.isFinite(receiveQty) || receiveQty < 0) return "Quantity cannot be negative";
  if (receiveQty === 0) return null; // skip line — partial GRN
  if (receiveQty > openQty) return `Cannot receive more than balance (${openQty})`;
  return null;
}

export function validateReturnQty(returnQty: number, returnableQty: number): string | null {
  if (!Number.isFinite(returnQty) || returnQty <= 0) return "Quantity must be greater than zero";
  if (returnQty > returnableQty) return `Cannot return more than received balance (${returnableQty})`;
  return null;
}

export function validatePaymentAmount(amount: number, due: number): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return "Payment amount must be greater than zero";
  if (amount > due + 0.01) return "Payment cannot exceed invoice due";
  return null;
}

export function canEditPurchase(status: string): boolean {
  return normPurchaseStatus(status) === "draft";
}

export function canApprovePurchase(status: string): boolean {
  return normPurchaseStatus(status) === "draft";
}

export function canReceivePurchase(status: string): boolean {
  const s = normPurchaseStatus(status);
  return s === "approved" || s === "partial" || s === "partially-received";
}

export function returnableQty(line: ApiPurchase["lines"][number]): number {
  if (line.returnable_qty != null) return line.returnable_qty;
  return Math.max(0, line.received_qty - (line.returned_qty ?? 0));
}

export function canReturnPurchase(purchase: ApiPurchase): boolean {
  return purchase.lines.some((l) => returnableQty(l) > 0);
}

export function canInvoicePurchase(purchase: ApiPurchase): boolean {
  return purchase.lines.some((l) => l.received_qty > 0);
}

export function totalQty(purchase: ApiPurchase): number {
  return purchase.lines.reduce((s, l) => s + l.qty, 0);
}

export function receivedLabel(purchase: ApiPurchase): string {
  const ordered = totalQty(purchase);
  const received = purchase.lines.reduce((s, l) => s + l.received_qty, 0);
  if (received <= 0) return "Not received";
  if (received >= ordered) return "Fully received";
  return `Partial (${received}/${ordered})`;
}
