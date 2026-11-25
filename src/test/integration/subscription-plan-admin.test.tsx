import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("subscription plan admin UI", () => {
  const src = readFileSync(resolve("src/routes/super-admin.subscriptions.tsx"), "utf8");

  it("exposes Active / Inactive / All package sections", () => {
    expect(src).toContain('value="active"');
    expect(src).toContain('value="inactive"');
    expect(src).toContain('value="all"');
    expect(src).toContain("Active (");
    expect(src).toContain("Inactive (");
  });

  it("supports create, edit, activate, deactivate, and safe delete", () => {
    expect(src).toContain("Add package");
    expect(src).toContain("openEdit");
    expect(src).toContain("useSetSubscriptionPlanStatus");
    expect(src).toContain("useDeleteSubscriptionPlan");
    expect(src).toContain("Deactivate");
    expect(src).toContain("Activate");
    expect(src).toContain("Delete");
    expect(src).toContain("assignment_count");
  });

  it("provides tenant subscription lifecycle actions", () => {
    expect(src).toContain("useSetTenantSubscriptionStatus");
    expect(src).toContain("Suspend");
    expect(src).toContain("Resume");
    expect(src).toContain("Cancel");
    expect(src).toContain("Edit package");
  });
});

describe("public package preview", () => {
  const landing = readFileSync(resolve("src/routes/landing.tsx"), "utf8");

  it("renders live active packages from the public API", () => {
    expect(landing).toContain("usePublicSubscriptionPlans");
    expect(landing).toContain("<SubscriptionPlanCards");
    expect(landing).toContain("Choose a package");
    expect(landing).not.toContain('name: "Single store"');
    expect(landing).not.toContain('name: "Multi-store"');
  });

  it("makes package management discoverable in Super Admin", () => {
    const layout = readFileSync(resolve("src/lib/nav-config.ts"), "utf8");
    expect(layout).toContain("Packages");
    expect(layout).toContain("/super-admin/subscriptions");
  });
});
