import { describe, it, expect } from "vitest";
import {
  isRuleActiveNow,
  resolveProductMarkdown,
  formatTime12h,
  type TimePricingRule,
} from "@/lib/fresh-markdown-policy";

describe("fresh-markdown-policy", () => {
  const pastryRule: TimePricingRule = {
    id: "rule-pastry-50",
    name: "Evening Pastry 50% Off",
    enabled: true,
    discountType: "half_price",
    discountValue: 50,
    startTime: "20:00",
    endTime: "23:59",
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6], // All days
    categoryIds: ["Pastry", "Cakes"],
    badgeLabel: "⚡ 50% Fresh Clearance",
  };

  const overnightRule: TimePricingRule = {
    id: "rule-overnight",
    name: "Night Owl Markdown",
    enabled: true,
    discountType: "percent",
    discountValue: 40,
    startTime: "22:00",
    endTime: "04:00",
    daysOfWeek: [1, 2, 3, 4, 5], // Weekdays
    categoryIds: ["Bakery"],
    badgeLabel: "🌙 40% Late Night",
  };

  it("evaluates time ranges within the same day", () => {
    // 8:30 PM (20:30) on a Wednesday (day 3) -> should be active
    const activeTime = new Date(2026, 8, 16, 20, 30, 0);
    expect(isRuleActiveNow(pastryRule, activeTime)).toBe(true);

    // 2:00 PM (14:00) -> should NOT be active
    const inactiveTime = new Date(2026, 8, 16, 14, 0, 0);
    expect(isRuleActiveNow(pastryRule, inactiveTime)).toBe(false);
  });

  it("evaluates overnight time ranges crossing midnight", () => {
    // 11:30 PM (23:30) on a Tuesday (day 2) -> active
    const lateNight = new Date(2026, 8, 15, 23, 30, 0);
    expect(isRuleActiveNow(overnightRule, lateNight)).toBe(true);

    // 2:30 AM (02:30) on a Wednesday (day 3) -> active
    const earlyMorning = new Date(2026, 8, 16, 2, 30, 0);
    expect(isRuleActiveNow(overnightRule, earlyMorning)).toBe(true);

    // 5:00 AM (05:00) on a Wednesday -> inactive
    const morning = new Date(2026, 8, 16, 5, 0, 0);
    expect(isRuleActiveNow(overnightRule, morning)).toBe(false);
  });

  it("calculates half_price markdown correctly", () => {
    const activeTime = new Date(2026, 8, 16, 20, 30, 0);
    const product = {
      id: "prod-1",
      name: "Black Forest Pastry Slice",
      base_price: 200,
      category_id: "Pastry",
    };

    const res = resolveProductMarkdown(product, [pastryRule], activeTime);
    expect(res.isMarkdownActive).toBe(true);
    expect(res.originalPrice).toBe(200);
    expect(res.effectivePrice).toBe(100);
    expect(res.discountAmount).toBe(100);
    expect(res.discountPct).toBe(50);
    expect(res.badgeLabel).toBe("⚡ 50% Fresh Clearance");
  });

  it("calculates fixed discount and price override", () => {
    const fixedDiscountRule: TimePricingRule = {
      id: "rule-fixed",
      name: "৳ 40 Off Fresh Bread",
      enabled: true,
      discountType: "fixed_discount",
      discountValue: 40,
      startTime: "18:00",
      endTime: "22:00",
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      categoryIds: ["Bread"],
      badgeLabel: "৳40 Off",
    };

    const activeTime = new Date(2026, 8, 16, 19, 0, 0);
    const product = {
      id: "prod-2",
      name: "Artisan Sourdough Bread",
      base_price: 150,
      category: "Bread",
    };

    const res = resolveProductMarkdown(product, [fixedDiscountRule], activeTime);
    expect(res.isMarkdownActive).toBe(true);
    expect(res.effectivePrice).toBe(110);
    expect(res.discountAmount).toBe(40);
  });

  it("formats 24h time to 12h AM/PM nicely", () => {
    expect(formatTime12h("20:00")).toBe("08:00 PM");
    expect(formatTime12h("08:30")).toBe("08:30 AM");
    expect(formatTime12h("00:00")).toBe("12:00 AM");
    expect(formatTime12h("12:00")).toBe("12:00 PM");
    expect(formatTime12h("23:59")).toBe("11:59 PM");
  });
});
