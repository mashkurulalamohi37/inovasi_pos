import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Phase 6B-14 cosmetics vertical wiring", () => {
  it("brands route uses cosmetics brands hook not pack stub", () => {
    const src = readFileSync(resolve("src/routes/app.cosmetics.brands.tsx"), "utf8");
    expect(src).toContain("useCosmeticsBrands");
    expect(src).toContain("EntityFormDrawer");
    expect(src).toContain("PermissionGate");
    expect(src).toContain("cosmetics.manage");
    expect(src).not.toContain("createPackBackOfficeRoute");
    expect(src).not.toContain("pack-stub-data");
  });

  it("expiry route uses live batches with quarantine", () => {
    const src = readFileSync(resolve("src/routes/app.cosmetics.expiry.tsx"), "utf8");
    expect(src).toContain("useCosmeticsBatches");
    expect(src).toContain("useQuarantineCosmeticsBatch");
    expect(src).toContain("ConfirmActionDialog");
    expect(src).toContain("PermissionGate");
    expect(src).not.toContain("createPackBackOfficeRoute");
    expect(src).not.toContain("pack-stub-data");
    expect(src).not.toContain("cosmeticsCatalog");
  });

  it("CosmeticsPos uses live hooks, FEFO/batch, no tester as sellable", () => {
    const src = readFileSync(resolve("src/features/pos/CosmeticsPos.tsx"), "utf8");
    expect(src).toContain('usePosCatalog("cosmetics"');
    expect(src).toContain("useCosmeticsProfiles");
    expect(src).toContain("useCosmeticsQuote");
    expect(src).toContain("useCosmeticsFefo");
    expect(src).toContain("useCosmeticsBatches");
    expect(src).toContain("useCosmeticsBarcodeLookup");
    expect(src).toContain("CustomerPicker");
    expect(src).toContain("sellable");
    expect(src).toContain("is_tester");
    expect(src).toContain("cosmeticsCatalog");
    expect(src).not.toContain("writeStorage");
    expect(src).not.toContain("localStorage");
  });

  it("PosModeView wires dedicated CosmeticsPos", () => {
    const src = readFileSync(resolve("src/features/pos/PosModeView.tsx"), "utf8");
    expect(src).toContain('from "./CosmeticsPos"');
    expect(src).toContain("cosmetics: CosmeticsPos");
  });

  it("BdMarketPos no longer exports CosmeticsPos stub", () => {
    const src = readFileSync(resolve("src/features/pos/BdMarketPos.tsx"), "utf8");
    expect(src).not.toContain("export function CosmeticsPos");
  });

  it("permissions include cosmetics.manage", () => {
    const src = readFileSync(resolve("src/lib/permissions.ts"), "utf8");
    expect(src).toContain('"cosmetics.manage"');
    expect(src).toContain('prefix: "/app/cosmetics", perm: "cosmetics.manage"');
  });

  it("production-route-guard passes for cosmetics files", () => {
    const files = [
      "src/routes/app.cosmetics.brands.tsx",
      "src/routes/app.cosmetics.expiry.tsx",
      "src/routes/app.cosmetics.testers.tsx",
      "src/features/pos/CosmeticsPos.tsx",
    ];
    const forbidden = ["coming soon", "demo only", "not implemented", "placeholder action", "fake success"];
    for (const file of files) {
      const src = readFileSync(resolve(file), "utf8").toLowerCase();
      for (const phrase of forbidden) {
        expect(src, `${file} must not contain "${phrase}"`).not.toContain(phrase);
      }
      expect(src).not.toMatch(/toast\.[a-z]+\([^)]*\((?:demo|mock)\)/i);
    }
  });
});
