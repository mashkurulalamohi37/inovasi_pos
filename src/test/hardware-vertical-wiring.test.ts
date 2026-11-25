import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Phase 6B-10 hardware vertical wiring", () => {
  it("brands route uses BrandMaster hooks not pack stub", () => {
    const src = readFileSync(resolve("src/routes/app.hardware.brands.tsx"), "utf8");
    expect(src).toContain("useBrands");
    expect(src).toContain("useHardwareProfiles");
    expect(src).toContain("EntityFormDrawer");
    expect(src).toContain("PermissionGate");
    expect(src).not.toContain("createPackBackOfficeRoute");
    expect(src).not.toContain("pack-stub-data");
  });

  it("HardwarePos uses live backend catalog and server quote", () => {
    const src = readFileSync(resolve("src/features/pos/HardwarePos.tsx"), "utf8");
    expect(src).toContain("usePosCatalog");
    expect(src).toContain("useHardwareQuote");
    expect(src).toContain("useHardwareConversions");
    expect(src).toContain("conversion_factor");
    expect(src).toContain("price_source");
    expect(src).toContain('industry: "hardware"');
    expect(src).not.toContain("writeStorage");
    expect(src).not.toContain('toast.success("Brand synced")');
  });

  it("PosModeView wires dedicated HardwarePos", () => {
    const src = readFileSync(resolve("src/features/pos/PosModeView.tsx"), "utf8");
    expect(src).toContain('from "./HardwarePos"');
    expect(src).toContain("hardware: HardwarePos");
  });

  it("BdMarketPos no longer exports HardwarePos stub", () => {
    const src = readFileSync(resolve("src/features/pos/BdMarketPos.tsx"), "utf8");
    expect(src).not.toContain("export function HardwarePos");
  });
});
