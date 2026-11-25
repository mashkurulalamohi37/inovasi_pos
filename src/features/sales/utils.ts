import type { ApiSale } from "@/hooks/use-api-config";

export function normSaleStatus(status: string): string {
  return status.toLowerCase().replace(/_/g, "-");
}

export function returnableQty(line: ApiSale["lines"][number]): number {
  if (line.returnable_qty != null) return Math.max(0, line.returnable_qty);
  const returned = line.returned_qty ?? 0;
  const qty = line.qty ?? 0;
  return Math.max(0, qty - returned);
}

export function validateReturnQty(returnQty: number, maxQty: number): string | null {
  if (!Number.isFinite(returnQty) || returnQty <= 0) return "Quantity must be greater than zero";
  if (returnQty > maxQty) return `Cannot return more than sold balance (${maxQty})`;
  return null;
}

export function validateRefundAmount(amount: number, maxRefundable: number): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return "Refund amount must be greater than zero";
  if (amount > maxRefundable + 0.01) return `Refund cannot exceed ${maxRefundable.toFixed(2)}`;
  return null;
}

export function validateCollectionAmount(amount: number, due: number): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return "Collection amount must be greater than zero";
  if (amount > due + 0.01) return "Collection cannot exceed due amount";
  return null;
}

export function canReturnSale(sale: ApiSale): boolean {
  return normSaleStatus(sale.status) === "completed" && sale.lines.some((l) => returnableQty(l) > 0);
}

export function canRefundSale(sale: ApiSale): boolean {
  return normSaleStatus(sale.status) === "completed" && (sale.paid_amount ?? 0) > 0;
}

export function maxRefundable(sale: ApiSale): number {
  return Math.max(0, sale.paid_amount ?? 0);
}

export function canCollectDue(sale: ApiSale): boolean {
  return (sale.due_amount ?? 0) > 0 && !!sale.customer_id;
}
