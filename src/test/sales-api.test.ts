import { describe, expect, it } from "vitest";
import { buildSplitPayments } from "@/lib/sales-api";

describe("buildSplitPayments", () => {
  it("builds rows that sum to total", () => {
    const rows = buildSplitPayments(1000, { cash: 600, card: 400 });
    expect(rows).toHaveLength(2);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(1000);
  });

  it("rejects mismatch", () => {
    expect(() => buildSplitPayments(1000, { cash: 500, card: 400 })).toThrow();
  });
});
