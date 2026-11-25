import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Phase 6B-6 optical vertical wiring", () => {
  it("frames page uses backend hooks and Phase 1 components", () => {
    const src = readFileSync(resolve("src/routes/app.optical-shop.frames.tsx"), "utf8");
    expect(src).toContain("useOpticalFrames");
    expect(src).toContain("useUpsertOpticalFrame");
    expect(src).toContain("EntityFormDrawer");
    expect(src).toContain("LoadingState");
    expect(src).toContain("PermissionGate");
    expect(src).not.toContain("createPackBackOfficeRoute");
    expect(src).not.toContain("pack-stub-data");
  });

  it("lenses page uses backend hooks and Phase 1 components", () => {
    const src = readFileSync(resolve("src/routes/app.optical-shop.lenses.tsx"), "utf8");
    expect(src).toContain("useOpticalLenses");
    expect(src).toContain("useUpsertOpticalLens");
    expect(src).toContain("EntityFormDrawer");
    expect(src).toContain("EmptyState");
    expect(src).not.toContain("createPackBackOfficeRoute");
  });

  it("orders page uses lab status mutations and honest repair disable", () => {
    const src = readFileSync(resolve("src/routes/app.optical-shop.orders.tsx"), "utf8");
    expect(src).toContain("useOpticalOrders");
    expect(src).toContain("useUpdateOpticalOrderStatus");
    expect(src).toContain("useFinalizeOpticalOrder");
    expect(src).toContain("ConfirmActionDialog");
    expect(src).toContain("DisabledReasonButton");
    expect(src).toContain("after-sales service phase");
  });

  it("OpticalShopPos uses order wizard and real prescription mutation", () => {
    const src = readFileSync(resolve("src/features/pos/OpticalShopPos.tsx"), "utf8");
    expect(src).toContain("useCreateOpticalOrder");
    expect(src).toContain("useCreateOpticalPrescription");
    expect(src).toContain("useFinalizeOpticalOrder");
    expect(src).toContain("usePosBarcodeScan");
    expect(src).toContain("shouldUseBackend");
    expect(src).toContain("DisabledReasonButton");
    expect(src).not.toContain('toast.success("Prescription saved")');
    expect(src).not.toContain("fake");
  });

  it("PosModeView uses dedicated OpticalShopPos module", () => {
    const src = readFileSync(resolve("src/features/pos/PosModeView.tsx"), "utf8");
    expect(src).toContain('from "./OpticalShopPos"');
    expect(src).not.toMatch(/OpticalShopPos.*BdMarketPos/);
  });
});
