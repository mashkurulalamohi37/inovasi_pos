import { describe, expect, it } from "vitest";
import { computeUsageWarnings, hasUsageWarnings } from "@/lib/subscription-usage";
import { fetchSubscriptionUsage } from "@/lib/phase8-api";
import { login, logout } from "@/lib/auth";

describe("subscription usage warnings", () => {
  it("flags metrics at 80% or above", () => {
    const warnings = computeUsageWarnings({
      stores: { current: 1, limit: 1 },
      users: { current: 1, limit: 2 },
      counters: { current: 8, limit: 10 },
    });
    expect(warnings.some(w => w.metric === "stores" && w.message === "Limit reached")).toBe(true);
    expect(warnings.some(w => w.metric === "counters" && w.message === "80% usage reached")).toBe(true);
    expect(warnings.some(w => w.metric === "users")).toBe(false);
  });

  it("detects warnings from subscription payload", () => {
    expect(
      hasUsageWarnings({
        plan_code: "starter",
        usage: { users: { current: 2, limit: 2 } },
      }),
    ).toBe(true);
  });

  it("fetches usage warnings from API mock", async () => {
    await login("admin@pulse.pos", "admin123", "PULSE-DEMO");
    const usage = await fetchSubscriptionUsage();
    expect(usage.plan_code).toBe("starter");
    expect(usage.warnings.length).toBeGreaterThan(0);
    expect(usage.warnings[0].message).toMatch(/Limit reached|80% usage reached/);
    await logout();
  });
});
