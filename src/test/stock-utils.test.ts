import { describe, expect, it, beforeEach } from "vitest";
import {
  aggregateStockByProduct,
  stockQtyMap,
  DEFAULT_LOW_STOCK_THRESHOLD,
  getStoredLowStockThreshold,
  setStoredLowStockThreshold,
  LOW_STOCK_THRESHOLD_STORAGE_KEY,
} from "@/lib/stock-utils";

describe("aggregateStockByProduct", () => {
  it("sums quantities across warehouse buckets", () => {
    const rows = aggregateStockByProduct([
      { product_id: "p1", sku: "A", name: "Item A", qty_on_hand: 10, qty_reserved: 2, qty_available: 8 },
      { product_id: "p1", sku: "A", name: "Item A", qty_on_hand: 5, qty_reserved: 1, qty_available: 4 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].qty_on_hand).toBe(15);
    expect(rows[0].qty_reserved).toBe(3);
    expect(rows[0].qty_available).toBe(12);
  });

  it("builds available qty map for POS", () => {
    const map = stockQtyMap([
      { product_id: "p1", sku: "A", name: "Item A", qty_on_hand: 10, qty_reserved: 2, qty_available: 8 },
    ]);
    expect(map.get("p1")).toBe(8);
  });
});

describe("low stock threshold storage", () => {
  beforeEach(() => {
    localStorage.removeItem(LOW_STOCK_THRESHOLD_STORAGE_KEY);
  });

  it("defaults to 20 when nothing is stored", () => {
    expect(getStoredLowStockThreshold()).toBe(DEFAULT_LOW_STOCK_THRESHOLD);
  });

  it("persists and reads back custom threshold", () => {
    setStoredLowStockThreshold(45);
    expect(getStoredLowStockThreshold()).toBe(45);
  });

  it("clears storage when set to 0 or negative", () => {
    setStoredLowStockThreshold(50);
    setStoredLowStockThreshold(0);
    expect(getStoredLowStockThreshold()).toBe(DEFAULT_LOW_STOCK_THRESHOLD);
  });
});
