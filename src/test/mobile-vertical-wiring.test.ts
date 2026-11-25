import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Phase 6B-8 mobile vertical wiring", () => {
  it("stock page uses backend hooks not pack stub", () => {
    const src = readFileSync(resolve("src/routes/app.mobile-shop.stock.tsx"), "utf8");
    expect(src).toContain("useMobileDevices");
    expect(src).toContain("shouldUseBackend");
    expect(src).toContain("LoadingState");
    expect(src).toContain("EmptyState");
    expect(src).not.toContain("createPackBackOfficeRoute");
    expect(src).not.toContain("pack-stub-data");
    expect(src).not.toContain('toast.success("Saved")');
  });

  it("trade-ins page uses real mutations and Phase 1 components", () => {
    const src = readFileSync(resolve("src/routes/app.mobile-shop.trade-ins.tsx"), "utf8");
    expect(src).toContain("useMobileTradeIns");
    expect(src).toContain("useCreateMobileTradeIn");
    expect(src).toContain("useUpdateMobileTradeInStatus");
    expect(src).toContain("EntityFormDrawer");
    expect(src).toContain("ConfirmActionDialog");
    expect(src).toContain("PermissionGate");
    expect(src).toContain("AuditTrailPanel");
    expect(src).not.toContain("createPackBackOfficeRoute");
    expect(src).not.toContain("pack-stub-data");
    expect(src).not.toContain('toast.success("Trade-in synced")');
  });

  it("MobileShopPos validates IMEI and uses backend device stock", () => {
    const src = readFileSync(resolve("src/features/pos/MobileShopPos.tsx"), "utf8");
    expect(src).toContain("usePosBarcodeScan");
    expect(src).toContain("validateMobileDevice");
    expect(src).toContain("useMobileDevices");
    expect(src).toContain("usePosCatalog");
    expect(src).toContain('industry: "mobile-shop"');
    expect(src).not.toContain('toast.success("Warranty registered');
    expect(src).not.toContain("writeStorage");
  });

  it("PosModeView wires dedicated MobileShopPos", () => {
    const src = readFileSync(resolve("src/features/pos/PosModeView.tsx"), "utf8");
    expect(src).toContain('from "./MobileShopPos"');
    expect(src).toContain('"mobile-shop": MobileShopPos');
  });

  it("GRN form captures mobile IMEI grid", () => {
    const src = readFileSync(resolve("src/features/purchases/PurchaseForms.tsx"), "utf8");
    expect(src).toContain('purchase.industry_pack === "mobile-shop"');
    expect(src).toContain("IMEI-1|IMEI-2");
  });
});
