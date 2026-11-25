import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Phase 6B-7 surgical vertical wiring", () => {
  it("sterile-stock route uses backend hooks and Phase 1 components", () => {
    const src = readFileSync(resolve("src/routes/app.surgical-shop.sterile-stock.tsx"), "utf8");
    expect(src).toContain("useSurgicalStock");
    expect(src).toContain("useQuarantineSurgicalStock");
    expect(src).toContain("useReleaseSurgicalStock");
    expect(src).toContain("ConfirmActionDialog");
    expect(src).toContain("PermissionGate");
    expect(src).toContain("LoadingState");
    expect(src).not.toContain("createPackBackOfficeRoute");
    expect(src).not.toContain("pack-stub-data");
    expect(src).not.toContain('toast.success("Saved")');
  });

  it("expiry route uses backend hooks", () => {
    const src = readFileSync(resolve("src/routes/app.surgical-shop.expiry.tsx"), "utf8");
    expect(src).toContain("useSurgicalExpiry");
    expect(src).toContain("EmptyState");
    expect(src).toContain("shouldUseBackend");
    expect(src).not.toContain("createPackBackOfficeRoute");
    expect(src).not.toContain("pack-stub-data");
  });

  it("recalls pages use real mutations", () => {
    const list = readFileSync(resolve("src/routes/app.surgical-shop.recalls.tsx"), "utf8");
    const detail = readFileSync(resolve("src/routes/app.surgical-shop.recalls.$recallId.tsx"), "utf8");
    expect(list).toContain("useSurgicalRecalls");
    expect(list).toContain("useCreateSurgicalRecall");
    expect(list).toContain("EntityFormDrawer");
    expect(list).toContain("DisabledReasonButton");
    expect(detail).toContain("useSurgicalRecall");
    expect(detail).toContain("useCloseSurgicalRecall");
    expect(detail).toContain("ConfirmActionDialog");
    expect(detail).toContain("AuditTrailPanel");
  });

  it("SurgicalShopPos uses backend barcode and stock unit selection", () => {
    const src = readFileSync(resolve("src/features/pos/SurgicalShopPos.tsx"), "utf8");
    expect(src).toContain("useSurgicalProductStock");
    expect(src).toContain("usePosBarcodeScan");
    expect(src).toContain("stock_unit_id");
    expect(src).toContain("usePosCatalog");
    expect(src).toContain("DisabledReasonButton");
    expect(src).not.toContain('toast.success("Prescription saved")');
  });

  it("PosModeView uses dedicated SurgicalShopPos module", () => {
    const src = readFileSync(resolve("src/features/pos/PosModeView.tsx"), "utf8");
    expect(src).toContain('from "./SurgicalShopPos"');
    expect(src).not.toMatch(/SurgicalShopPos.*BdMarketPos/);
  });
});
