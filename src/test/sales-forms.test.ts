import { describe, expect, it } from "vitest";
import {
  canReturnSale,
  canRefundSale,
  canCollectDue,
  validateReturnQty,
  validateRefundAmount,
  validateCollectionAmount,
  returnableQty,
} from "@/features/sales/utils";
import type { ApiSale } from "@/hooks/use-api-config";

const baseSale: ApiSale = {
  id: "s1",
  invoice_number: "INV-1",
  customer_id: "c1",
  customer_name: "Test",
  store_id: null,
  store_name: null,
  cashier_id: null,
  cashier_name: null,
  industry_pack: "grocery",
  status: "completed",
  subtotal: 100,
  discount: 0,
  tax: 0,
  total: 100,
  paid_amount: 60,
  due_amount: 40,
  tender: "cash",
  completed_at: null,
  created_at: null,
  lines: [{
    id: "l1",
    product_id: "p1",
    sku: "SKU1",
    name: "Item",
    qty: 2,
    returned_qty: 0,
    returnable_qty: 2,
    unit_price: 50,
    line_total: 100,
  }],
  payments: [],
};

describe("sales form validation", () => {
  it("rejects zero return qty", () => {
    expect(validateReturnQty(0, 5)).toMatch(/greater than zero/);
  });

  it("rejects over-return", () => {
    expect(validateReturnQty(4, 3)).toMatch(/sold balance/);
  });

  it("rejects refund over paid", () => {
    expect(validateRefundAmount(200, 60)).toMatch(/cannot exceed/);
  });

  it("rejects collection over due", () => {
    expect(validateCollectionAmount(50, 40)).toMatch(/exceed/);
  });

  it("computes returnable qty from line", () => {
    expect(returnableQty(baseSale.lines[0])).toBe(2);
  });

  it("gates return/refund/collect actions", () => {
    expect(canReturnSale(baseSale)).toBe(true);
    expect(canRefundSale(baseSale)).toBe(true);
    expect(canCollectDue(baseSale)).toBe(true);
    expect(canReturnSale({ ...baseSale, status: "held" })).toBe(false);
  });
});
