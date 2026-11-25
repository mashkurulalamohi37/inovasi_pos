import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  defaultPackConfigs,
  INDUSTRY_PACK_IDS,
  POS_MODES,
  ALL_FEATURE_FLAGS,
  DEFAULT_DYNAMIC_FIELDS,
  getPackDef,
} from "@/lib/industry-registry";
import { crockeryCatalog } from "@/lib/industry-mock";

describe("Crockery & Kitchenware Vertical Wiring & Zero-Impact Isolation", () => {
  it("industry-registry registers crockery pack disabled by default (Rule I-4)", () => {
    expect(INDUSTRY_PACK_IDS).toContain("crockery");
    expect(POS_MODES.some((m) => m.id === "crockery")).toBe(true);

    const configs = defaultPackConfigs();
    expect(configs["crockery"]).toBeDefined();
    expect(configs["crockery"].company).toBe(false);
    expect(configs["crockery"].store).toBe(false);
    expect(configs["crockery"].counter).toBe(false);
  });

  it("registers crockery feature flags with proper namespace", () => {
    const crockeryFlags = ALL_FEATURE_FLAGS.filter((f) => f.pack === "crockery");
    expect(crockeryFlags.length).toBeGreaterThanOrEqual(5);
    expect(crockeryFlags.every((f) => f.key.startsWith("crockery."))).toBe(true);
    expect(crockeryFlags.some((f) => f.key === "crockery.set_breakdown")).toBe(true);
    expect(crockeryFlags.some((f) => f.key === "crockery.breakage_log")).toBe(true);
  });

  it("registers crockery dynamic fields for material, piece count and heat compatibility", () => {
    const fields = DEFAULT_DYNAMIC_FIELDS.filter((f) => f.pack === "crockery");
    expect(fields.length).toBeGreaterThanOrEqual(3);
    expect(fields.some((f) => f.name === "Material")).toBe(true);
    expect(fields.some((f) => f.name === "Heat / Stovetop compatibility")).toBe(true);
  });

  it("provides rich mock catalog with dinner sets, cookware, spares and fragile items", () => {
    expect(crockeryCatalog.length).toBeGreaterThanOrEqual(10);
    expect(crockeryCatalog.some((i) => i.category === "Dinnerware" && i.piecesInSet === 32)).toBe(true);
    expect(crockeryCatalog.some((i) => i.category === "Cookware" && i.name.includes("Pressure Cooker"))).toBe(true);
    expect(crockeryCatalog.some((i) => i.category === "Spares")).toBe(true);
    expect(crockeryCatalog.some((i) => i.isDecantable)).toBe(true);
    expect(crockeryCatalog.some((i) => i.isFragile)).toBe(true);
  });

  it("PosModeView wires dedicated CrockeryPos component", () => {
    const src = readFileSync(resolve("src/features/pos/PosModeView.tsx"), "utf8");
    expect(src).toContain('from "./CrockeryPos"');
    expect(src).toContain("crockery: CrockeryPos");
  });

  it("CrockeryPos implements decanting, breakage log, and gift packaging", () => {
    const src = readFileSync(resolve("src/features/pos/CrockeryPos.tsx"), "utf8");
    expect(src).toContain('industry="crockery"');
    expect(src).toContain("usePosCatalog");
    expect(src).toContain("Decant Set to Pieces");
    expect(src).toContain("In-Store Breakage / Damage Write-Off");
    expect(src).toContain("Gift & Protective Packaging");
    expect(src).toContain("Cooker in Cart! Recommended Spares:");
  });

  it("nav-config includes crockery icon UtensilsCrossed", () => {
    const src = readFileSync(resolve("src/lib/nav-config.ts"), "utf8");
    expect(src).toContain("crockery: UtensilsCrossed");
  });

  it("product-form-registry defines crockery form attributes", () => {
    const src = readFileSync(resolve("src/lib/product-form-registry.ts"), "utf8");
    expect(src).toContain('packId: "crockery"');
    expect(src).toContain('key: "heat_compatibility"');
    expect(src).toContain('key: "material"');
  });

  it("app.pos.crockery route exists and renders PosModeView mode=crockery", () => {
    const src = readFileSync(resolve("src/routes/app.pos.crockery.tsx"), "utf8");
    expect(src).toContain('createFileRoute("/app/pos/crockery")');
    expect(src).toContain('mode="crockery"');
  });

  it("getPackDef retrieves pack definition with 4 dedicated back-office routes", () => {
    const def = getPackDef("crockery");
    expect(def).toBeDefined();
    expect(def.name).toBe("Crockery & Kitchenware POS");
    expect(def.posRoute).toBe("/app/pos/crockery");
    expect(def.backOfficeRoutes.length).toBe(4);
    expect(def.backOfficeRoutes.some((r) => r.path === "/app/crockery/breakage-log")).toBe(true);
    expect(def.backOfficeRoutes.some((r) => r.path === "/app/crockery/decanting")).toBe(true);
    expect(def.backOfficeRoutes.some((r) => r.path === "/app/crockery/warranty-spares")).toBe(true);
    expect(def.backOfficeRoutes.some((r) => r.path === "/app/crockery/packaging")).toBe(true);
  });

  it("crockery master attributes register category, material, and heat_compatibility", async () => {
    const { getPackMasterAttributes } = await import("@/lib/pack-master-attributes");
    const attrs = getPackMasterAttributes("crockery");
    expect(attrs.map(a => a.key)).toEqual(["category", "material", "heat_compatibility"]);
  });
});
