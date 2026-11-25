import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Phase 6B-3 electronics vertical wiring", () => {
  it("warranty page uses backend hooks not mock-only registry", () => {
    const src = readFileSync(resolve("src/routes/app.electronics.warranty.tsx"), "utf8");
    expect(src).toContain("useElectronicsWarranties");
    expect(src).toContain("useCreateElectronicsWarranty");
    expect(src).toContain("useCreateElectronicsRma");
    expect(src).toContain("useUpdateElectronicsRma");
    expect(src).toContain("ConfirmActionDialog");
    expect(src).toContain("EntityFormDrawer");
    expect(src).not.toContain('toast.success("RMA report exported")');
    expect(src).not.toContain("Warranty registry sync coming");
  });

  it("serials page uses backend serial list in API mode", () => {
    const src = readFileSync(resolve("src/routes/app.electronics.serials.tsx"), "utf8");
    expect(src).toContain("useElectronicsSerials");
    expect(src).toContain("shouldUseBackend");
  });

  it("ElectronicsPos validates serials and submits RMA via API", () => {
    const src = readFileSync(resolve("src/features/pos/ElectronicsPos.tsx"), "utf8");
    expect(src).toContain("usePosBarcodeScan");
    expect(src).toContain("validateElectronicsSerial");
    expect(src).toContain("useCreateElectronicsRma");
    expect(src).toContain("useElectronicsSerials");
    expect(src).not.toContain('toast.success("Warranty registered');
    expect(src).not.toContain('toast.success("Job card SVC-');
    expect(src).not.toContain("writeStorage(STORAGE_KEYS.rma");
  });

  it("GRN form captures electronics serial grid", () => {
    const src = readFileSync(resolve("src/features/purchases/PurchaseForms.tsx"), "utf8");
    expect(src).toContain('purchase.industry_pack === "electronics"');
    expect(src).toContain("serials");
    expect(src).toContain("Serial count");
  });

  it("export disabled reason shown when not using report runner", () => {
    const src = readFileSync(resolve("src/routes/app.electronics.warranty.tsx"), "utf8");
    expect(src).toContain("DisabledReasonButton");
    expect(src).toContain("Reports → Electronics RMA");
  });

  it("electronics warranty removed from action-wiring backlog", () => {
    const backlog = readFileSync(resolve("src/lib/action-wiring-backlog.ts"), "utf8");
    expect(backlog).not.toContain("app.electronics.warranty.tsx");
  });
});
