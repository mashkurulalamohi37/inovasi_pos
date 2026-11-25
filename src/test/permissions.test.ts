import { describe, expect, it } from "vitest";
import {
  migrateRole,
  roleHas,
  roleHasWithOverrides,
  routeAllowed,
  hasFullMenuAccess,
  hasSaasConsoleAccess,
} from "@/lib/permissions";

describe("permissions", () => {
  it("roleHas grants Admin full POS access", () => {
    expect(roleHas("Admin", "pos.sell")).toBe(true);
    expect(roleHas("Admin", "pos.refund")).toBe(true);
  });

  it("roleHas denies Cashier config access", () => {
    expect(roleHas("Cashier", "pos.sell")).toBe(true);
    expect(roleHas("Cashier", "config.edit")).toBe(false);
  });

  it("migrateRole maps Super Admin to Admin", () => {
    expect(migrateRole("Super Admin")).toBe("Admin");
  });

  it("hasFullMenuAccess requires the real platform operator flag, not role name", () => {
    // A tenant's own Admin/Super Admin must NOT bypass subscription-based pack
    // visibility just by role name — only the true platform operator flag can.
    expect(hasFullMenuAccess("Admin")).toBe(false);
    expect(hasFullMenuAccess("Super Admin")).toBe(false);
    expect(hasFullMenuAccess("Cashier")).toBe(false);
    expect(hasFullMenuAccess("Cashier", true)).toBe(true);
  });

  it("hasSaasConsoleAccess requires the real platform operator flag, not role name", () => {
    // A tenant's own Admin/Super Admin must NOT see the SaaS control center —
    // that's cross-tenant platform surface, gated solely by isPlatformAdmin.
    expect(hasSaasConsoleAccess("Admin")).toBe(false);
    expect(hasSaasConsoleAccess("Super Admin")).toBe(false);
    expect(hasSaasConsoleAccess("Store Manager")).toBe(false);
    expect(hasSaasConsoleAccess("Cashier", true)).toBe(true);
  });

  it("roleHasWithOverrides respects explicit overrides", () => {
    const overrides = { "Cashier:pos.refund": true };
    expect(roleHasWithOverrides("Cashier", "pos.refund", overrides)).toBe(true);
    expect(roleHasWithOverrides("Cashier", "config.edit", overrides)).toBe(false);
  });

  it("routeAllowed checks route prefix permissions", () => {
    expect(routeAllowed("Cashier", "/app/pos")).toBe(true);
    expect(routeAllowed("Cashier", "/app/reports")).toBe(false);
    expect(routeAllowed("Auditor", "/app/reports/summary")).toBe(true);
    expect(routeAllowed("Cashier", "/app/unknown")).toBe(true);
  });

  it("routeAllowed blocks purchases for Cashier", () => {
    expect(routeAllowed("Cashier", "/app/purchases")).toBe(false);
    expect(routeAllowed("Inventory User", "/app/purchases")).toBe(true);
  });
});
