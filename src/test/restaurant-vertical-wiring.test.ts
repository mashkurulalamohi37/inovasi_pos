/**
 * Restaurant vertical — behavioural tests.
 *
 * These used to be `readFileSync` + `expect(src).toContain("usePayRestaurantOrder")`
 * string matches. They never imported the module, so all four passed against a
 * RestaurantPos.tsx that contained a duplicated JSX block and could not be parsed
 * by either tsc or vite. Importing the code under test is the point.
 */

import { describe, expect, it } from "vitest";
import {
  VAT_RATE,
  computeRestaurantBill,
  effectiveCartTaxRate,
  splitBillEqually,
} from "@/features/pos/restaurant-billing";

describe("restaurant bill arithmetic", () => {
  it("applies VAT to the service charge, not just the subtotal", () => {
    const bill = computeRestaurantBill({ subtotal: 1000, servicePct: 10 });

    expect(bill.serviceCharge).toBe(100);
    // 5% of (1000 + 100), not 5% of 1000.
    expect(bill.tax).toBe(55);
    expect(bill.total).toBe(1155);
  });

  it("quotes VAT on an open order whose tax field is still zero", () => {
    // The regression: the dialog read order.tax (0 until settlement) and quoted
    // the subtotal as the amount due, so the cashier under-collected every time.
    const bill = computeRestaurantBill({ subtotal: 1000, servicePct: 0 });

    expect(bill.tax).toBe(50);
    expect(bill.total).toBe(1050);
    expect(bill.total).not.toBe(bill.subtotal);
  });

  it("charges no service when the feature flag is off", () => {
    const bill = computeRestaurantBill({ subtotal: 500 });
    expect(bill.serviceCharge).toBe(0);
    expect(bill.total).toBe(525);
  });

  it("takes the discount off before tax and never goes negative", () => {
    const bill = computeRestaurantBill({ subtotal: 200, discount: 500 });
    expect(bill.tax).toBe(0);
    expect(bill.total).toBe(0);
  });

  it("survives a missing subtotal instead of producing NaN", () => {
    // order?.subtotal ?? app.subtotal used to resolve to undefined -> NaN, which
    // rendered as "৳NaN" in the settle dialog.
    const bill = computeRestaurantBill({ subtotal: Number.NaN });
    expect(bill.total).toBe(0);
    expect(Number.isNaN(bill.total)).toBe(false);
  });

  it("rounds to two decimals rather than accumulating float error", () => {
    const bill = computeRestaurantBill({ subtotal: 333.33, servicePct: 10 });
    expect(bill.total).toBe(round2ish(bill.total));
  });
});

describe("cart tax rate shown in PosShell", () => {
  it("compounds service and VAT so the cart total matches the invoice", () => {
    // The bug: servicePct/100 + VAT_RATE = 0.15, but the backend charges 0.155.
    expect(effectiveCartTaxRate(10)).toBeCloseTo(0.155, 10);
    expect(effectiveCartTaxRate(10)).not.toBeCloseTo(0.1 + VAT_RATE, 10);
  });

  it("falls back to plain VAT when no service charge applies", () => {
    expect(effectiveCartTaxRate(0)).toBeCloseTo(VAT_RATE, 10);
  });

  it("agrees with the settle dialog for the same order", () => {
    const subtotal = 1000;
    const servicePct = 10;
    const cartTotal = subtotal + Math.round(subtotal * effectiveCartTaxRate(servicePct));

    expect(cartTotal).toBe(computeRestaurantBill({ subtotal, servicePct }).total);
  });
});

describe("split bill shares", () => {
  const sum = (xs: number[]) => round2ish(xs.reduce((a, b) => a + b, 0));

  it("sums to the bill exactly on a total that does not divide cleanly", () => {
    // 1000 / 3 = 333.333…; three shares of 333.33 collect 999.99 and the server
    // rejects the settlement ("Payment total must equal bill").
    const shares = splitBillEqually(1000, 3);

    expect(shares).toHaveLength(3);
    expect(sum(shares)).toBe(1000);
    // The odd paisa goes to one guest, not three paisa to the last one.
    expect(shares).toEqual([333.34, 333.33, 333.33]);
  });

  it("keeps the remainder to a single paisa across guest counts", () => {
    for (const guests of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const shares = splitBillEqually(1155.55, guests);
      const spread = Math.max(...shares) - Math.min(...shares);

      expect(sum(shares)).toBe(1155.55);
      expect(spread).toBeLessThanOrEqual(0.01 + 1e-9);
      expect(shares.every((s) => s >= 0)).toBe(true);
    }
  });

  it("hands the whole bill to a single payer", () => {
    expect(splitBillEqually(1155, 1)).toEqual([1155]);
  });

  it("never produces NaN or negative shares from a junk total", () => {
    expect(sum(splitBillEqually(Number.NaN, 3))).toBe(0);
    expect(splitBillEqually(-50, 2)).toEqual([0, 0]);
  });
});

function round2ish(n: number) {
  return Math.round(n * 100) / 100;
}
