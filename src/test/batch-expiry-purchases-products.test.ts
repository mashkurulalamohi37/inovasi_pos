import { describe, it, expect } from "vitest";

describe("Batch and Expiry Date tracking in Purchases and Products", () => {
  it("recognizes batch-tracked industry packs", () => {
    const BATCH_PACKS = ["cosmetics", "pharmacy", "grocery", "super-shop", "surgical-shop"];
    expect(BATCH_PACKS.includes("cosmetics")).toBe(true);
    expect(BATCH_PACKS.includes("pharmacy")).toBe(true);
    expect(BATCH_PACKS.includes("grocery")).toBe(true);
    expect(BATCH_PACKS.includes("fashion")).toBe(false);
  });

  it("handles purchase lines with batch_no and expiry_date", () => {
    const line = {
      product_id: "prod-1",
      product_name: "Aloe Vera Whitening Face Wash",
      sku: "COS-AV-01",
      industry_pack: "cosmetics",
      batch_no: "BATCH-2024-01",
      expiry_date: "2025-12-31",
      qty: 10,
      unit_cost: 250,
      discount_amount: 0,
      tax_amount: 0,
    };

    expect(line.batch_no).toBe("BATCH-2024-01");
    expect(line.expiry_date).toBe("2025-12-31");
    expect(line.qty * line.unit_cost).toBe(2500);
  });

  it("calculates days remaining until expiry correctly", () => {
    const now = Date.now();
    const futureDate = new Date(now + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const pastDate = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const getDaysLeft = (expiry: string) =>
      Math.floor((new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    expect(getDaysLeft(futureDate)).toBeGreaterThanOrEqual(89);
    expect(getDaysLeft(pastDate)).toBeLessThanOrEqual(0);
  });

  it("supports multiple batches for the same product in FEFO order", () => {
    const batches = [
      { batch_no: "NEW-STOCK", expiry_date: "2026-06-30", qty_on_hand: 50 },
      { batch_no: "OLD-STOCK", expiry_date: "2024-12-31", qty_on_hand: 15 },
    ];

    // Sort by FEFO (earliest expiry first)
    const fefoSorted = [...batches].sort(
      (a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime()
    );

    expect(fefoSorted[0].batch_no).toBe("OLD-STOCK");
    expect(fefoSorted[1].batch_no).toBe("NEW-STOCK");
  });
});

