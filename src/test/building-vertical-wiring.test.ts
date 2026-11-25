import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Phase 6B-11 building vertical wiring", () => {
  it("contractors route uses building contractors hook not pack stub", () => {
    const src = readFileSync(resolve("src/routes/app.building-materials.contractors.tsx"), "utf8");
    expect(src).toContain("useBuildingContractors");
    expect(src).toContain("EntityFormDrawer");
    expect(src).toContain("PermissionGate");
    expect(src).toContain("building.manage");
    expect(src).not.toContain("createPackBackOfficeRoute");
    expect(src).not.toContain("pack-stub-data");
  });

  it("delivery route uses live deliveries and dispatch mutations", () => {
    const src = readFileSync(resolve("src/routes/app.building-materials.delivery.tsx"), "utf8");
    expect(src).toContain("useBuildingDeliveries");
    expect(src).toContain("useCreateBuildingDelivery");
    expect(src).toContain("useDispatchBuildingDelivery");
    expect(src).toContain("ConfirmActionDialog");
    expect(src).toContain("/challan");
    expect(src).not.toContain("createPackBackOfficeRoute");
    expect(src).not.toContain("furnitureDeliveriesDemo");
  });

  it("orders route uses building order hooks", () => {
    const src = readFileSync(resolve("src/routes/app.building-materials.orders.tsx"), "utf8");
    expect(src).toContain("useBuildingOrders");
    expect(src).toContain("useConfirmBuildingOrder");
    expect(src).not.toContain("createPackBackOfficeRoute");
  });

  it("BuildingMaterialsPos uses live backend catalog and server quote", () => {
    const src = readFileSync(resolve("src/features/pos/BuildingMaterialsPos.tsx"), "utf8");
    expect(src).toContain('usePosCatalog("building-materials"');
    expect(src).toContain("useBuildingQuote");
    expect(src).toContain("useBuildingProfiles");
    expect(src).toContain("useBuildingSites");
    expect(src).toContain("conversion_factor");
    expect(src).toContain("useCreateBuildingOrder");
    expect(src).toContain("useConfirmBuildingOrder");
    expect(src).not.toContain("writeStorage");
  });

  it("PosModeView wires dedicated BuildingMaterialsPos", () => {
    const src = readFileSync(resolve("src/features/pos/PosModeView.tsx"), "utf8");
    expect(src).toContain('from "./BuildingMaterialsPos"');
    expect(src).toContain('"building-materials": BuildingMaterialsPos');
  });

  it("BdMarketPos no longer exports BuildingMaterialsPos stub", () => {
    const src = readFileSync(resolve("src/features/pos/BdMarketPos.tsx"), "utf8");
    expect(src).not.toContain("export function BuildingMaterialsPos");
  });

  it("permissions include building.manage", () => {
    const src = readFileSync(resolve("src/lib/permissions.ts"), "utf8");
    expect(src).toContain('"building.manage"');
    expect(src).toContain('prefix: "/app/building-materials", perm: "building.manage"');
  });
});
