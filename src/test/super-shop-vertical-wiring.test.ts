import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defaultPackConfigs, INDUSTRY_PACK_IDS, POS_MODES } from "@/lib/industry-registry";

describe("Super Shop Vertical Wiring & Zero-Impact Isolation", () => {
  it("industry-registry registers super-shop pack disabled by default (Rule I-6)", () => {
    expect(INDUSTRY_PACK_IDS).toContain("super-shop");
    expect(POS_MODES.some((m) => m.id === "super-shop")).toBe(true);

    const configs = defaultPackConfigs();
    expect(configs["super-shop"]).toBeDefined();
    expect(configs["super-shop"].company).toBe(false);
    expect(configs["super-shop"].store).toBe(false);
    expect(configs["super-shop"].counter).toBe(false);
  });

  it("PosModeView wires dedicated SuperShopPos module", () => {
    const src = readFileSync(resolve("src/features/pos/PosModeView.tsx"), "utf8");
    expect(src).toContain('from "./SuperShopPos"');
    expect(src).toContain('"super-shop": SuperShopPos');
  });

  it("SuperShopPos implements multi-department filter, fast keys, scale, variants, serials and in-cart editing", () => {
    const src = readFileSync(resolve("src/features/pos/SuperShopPos.tsx"), "utf8");
    expect(src).toContain('industry="super-shop"');
    expect(src).toContain("usePosCatalog");
    expect(src).toContain("cartLineExtra");
    expect(src).toContain("DEFAULT_FAST_KEYS");
    expect(src).toContain("Weigh & Price Calculation");
    expect(src).toContain("Select Size & Color Variant");
    expect(src).toContain("Serial / IMEI Registration");
    expect(src).toContain("Edit Cart Item");
  });

  it("nav-config includes super-shop icon", () => {
    const src = readFileSync(resolve("src/lib/nav-config.ts"), "utf8");
    expect(src).toContain('"super-shop": ShoppingBag');
  });

  it("product-form-registry defines super-shop department and attributes", () => {
    const src = readFileSync(resolve("src/lib/product-form-registry.ts"), "utf8");
    expect(src).toContain('"super-shop": {');
    expect(src).toContain('key: "department"');
  });

  it("permissions include super-shop.manage and manual weight", () => {
    const src = readFileSync(resolve("src/lib/permissions.ts"), "utf8");
    expect(src).toContain('"super-shop.manage"');
    expect(src).toContain('"super-shop.manual_weight"');
    expect(src).toContain('prefix: "/app/super-shop", perm: "super-shop.manage"');
  });

  it("app.pos.super-shop route exists and renders PosModeView mode=super-shop", () => {
    const src = readFileSync(resolve("src/routes/app.pos.super-shop.tsx"), "utf8");
    expect(src).toContain('createFileRoute("/app/pos/super-shop")');
    expect(src).toContain('mode="super-shop"');
  });

  it("back-office routes exist with PermissionGate super-shop.manage", () => {
    const depts = readFileSync(resolve("src/routes/app.super-shop.departments.tsx"), "utf8");
    const lanes = readFileSync(resolve("src/routes/app.super-shop.lanes.tsx"), "utf8");
    const scale = readFileSync(resolve("src/routes/app.super-shop.scale-station.tsx"), "utf8");
    const expiry = readFileSync(resolve("src/routes/app.super-shop.expiry-markdown.tsx"), "utf8");
    const inv = readFileSync(resolve("src/routes/app.super-shop.inventory.tsx"), "utf8");
    const loss = readFileSync(resolve("src/routes/app.super-shop.loss-prevention.tsx"), "utf8");

    for (const src of [depts, lanes, scale, expiry, inv, loss]) {
      expect(src).toContain('perm="super-shop.manage"');
    }
  });

  it("production-route-guard passes with no prohibited placeholder phrases", () => {
    const files = [
      "src/features/pos/SuperShopPos.tsx",
      "src/routes/app.super-shop.departments.tsx",
      "src/routes/app.super-shop.lanes.tsx",
      "src/routes/app.super-shop.scale-station.tsx",
      "src/routes/app.super-shop.expiry-markdown.tsx",
      "src/routes/app.super-shop.inventory.tsx",
      "src/routes/app.super-shop.loss-prevention.tsx",
    ];
    const forbidden = ["coming soon", "demo only", "not implemented", "placeholder action", "fake success"];
    for (const file of files) {
      const src = readFileSync(resolve(file), "utf8").toLowerCase();
      for (const phrase of forbidden) {
        expect(src, `${file} must not contain "${phrase}"`).not.toContain(phrase);
      }
    }
  });
});
