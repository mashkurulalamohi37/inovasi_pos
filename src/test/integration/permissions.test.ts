import { beforeEach, describe, expect, it } from "vitest";
import { login, logout, userHasPermission } from "@/lib/auth";
import { setTokens } from "@/lib/api";
import { backendHasPermission } from "@/lib/backend-permissions";

describe("permissions integration", () => {
  beforeEach(() => {
    setTokens(null, null);
  });

  it("backendHasPermission maps frontend permissions to backend codes", () => {
    const backendPerms = ["sales.create", "inventory.adjust", "purchase.create", "reports.export"];
    expect(backendHasPermission(backendPerms, "pos.sell")).toBe(true);
    expect(backendHasPermission(backendPerms, "purchases.view")).toBe(true);
    expect(backendHasPermission(backendPerms, "inventory.view")).toBe(true);
    expect(backendHasPermission(backendPerms, "config.packs")).toBe(false);
    expect(backendHasPermission(["crockery.manage"], "crockery.manage")).toBe(true);
    expect(backendHasPermission(["sales.create"], "crockery.manage")).toBe(true);
    // inventory.adjust alone must not grant purchases.view
    expect(backendHasPermission(["inventory.adjust"], "purchases.view")).toBe(false);
  });

  it("userHasPermission reflects permissions from mocked /auth/me", async () => {
    const user = await login("admin@pulse.pos", "admin123", "PULSE-DEMO");

    expect(userHasPermission(user, "sales.create")).toBe(true);
    expect(user.permissions).toContain("sales.create");

    await logout();
  });
});
