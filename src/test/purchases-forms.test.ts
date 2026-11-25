import { describe, expect, it } from "vitest";
import {
  canApprovePurchase,
  canEditPurchase,
  canReceivePurchase,
  displayPurchaseStatus,
  purchaseTotals,
  validatePaymentAmount,
  validateReceiveQty,
  validateReturnQty,
} from "@/features/purchases/utils";

describe("purchase form validation", () => {
  it("allows zero receive qty as skip-line for partial GRN", () => {
    expect(validateReceiveQty(0, 5)).toBeNull();
    expect(validateReceiveQty(-1, 5)).toMatch(/negative/);
  });

  it("rejects over-receive", () => {
    expect(validateReceiveQty(6, 5)).toMatch(/balance/);
  });

  it("rejects over-return", () => {
    expect(validateReturnQty(4, 3)).toMatch(/received balance/);
  });

  it("rejects payment over due", () => {
    expect(validatePaymentAmount(500, 100)).toMatch(/exceed/);
  });

  it("computes header totals", () => {
    const { total } = purchaseTotals(
      [{ qty: 2, unit_cost: 100 }, { qty: 1, unit_cost: 50 }],
      10,
      5,
    );
    expect(total).toBe(245);
  });

  it("computes per-line discount and tax into totals", () => {
    const { subtotal, lineDiscount, lineTax, total } = purchaseTotals(
      [
        { qty: 2, unit_cost: 100, discount_amount: 20, tax_amount: 10 },
        { qty: 1, unit_cost: 50 },
      ],
      5,
      0,
    );
    expect(subtotal).toBe(240); // 200 − 20 + 10 + 50
    expect(lineDiscount).toBe(20);
    expect(lineTax).toBe(10);
    expect(total).toBe(235);
  });

  it("gates actions by status", () => {
    expect(canEditPurchase("DRAFT")).toBe(true);
    expect(canApprovePurchase("DRAFT")).toBe(true);
    expect(canApprovePurchase("APPROVED")).toBe(false);
    expect(canReceivePurchase("PARTIALLY_RECEIVED")).toBe(true);
  });

  it("shows draft purchases as pending in the UI", () => {
    expect(displayPurchaseStatus("DRAFT")).toBe("pending");
    expect(displayPurchaseStatus("APPROVED")).toBe("approved");
  });
});

describe("purchase list date bounds", () => {
  it("includes end-of-day so same-day POs are not cut off at midnight", async () => {
    const { dateInputRangeForApi } = await import("@/lib/dates");
    const range = dateInputRangeForApi("2026-07-22", "2026-07-22");
    expect(range.from_date).toBe("2026-07-22T00:00:00");
    expect(range.to_date).toBe("2026-07-22T23:59:59.999");
  });
});

describe("purchase routing", () => {
  it("$purchaseId layout renders Outlet so edit/receive/return/invoice are not masked", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const layout = readFileSync(resolve("src/routes/app.purchases.$purchaseId.tsx"), "utf8");
    // Without an Outlet the URL changes but the detail page stays on screen.
    expect(layout).toContain("Outlet");
    expect(layout).not.toContain("PurchaseDetailDrawer");

    const index = readFileSync(resolve("src/routes/app.purchases.$purchaseId.index.tsx"), "utf8");
    expect(index).toContain("PurchaseDetailDrawer");
    expect(index).toContain('createFileRoute("/app/purchases/$purchaseId/")');
  });
});
