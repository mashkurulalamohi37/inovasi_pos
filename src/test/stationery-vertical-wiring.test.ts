import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Phase 6B-13 stationery vertical wiring", () => {
  it("school-lists route uses backend hooks not pack stub", () => {
    const src = readFileSync(resolve("src/routes/app.stationery.school-lists.tsx"), "utf8");
    expect(src).toContain("useStationerySchoolLists");
    expect(src).toContain("useStationerySchoolList");
    expect(src).toContain("useUpsertStationerySchoolList");
    expect(src).toContain("useSetStationerySchoolListStatus");
    expect(src).toContain("useStationerySchoolListAvailability");
    expect(src).toContain("EntityFormDrawer");
    expect(src).toContain("ConfirmActionDialog");
    expect(src).toContain("PermissionGate");
    expect(src).toContain("stationery.manage");
    expect(src).not.toContain("createPackBackOfficeRoute");
    expect(src).not.toContain("pack-stub-data");
  });

  it("StationeryPos uses live hooks, quote conversion, cart-resolve", () => {
    const src = readFileSync(resolve("src/features/pos/StationeryPos.tsx"), "utf8");
    expect(src).toContain('usePosCatalog("stationery"');
    expect(src).toContain("useStationeryProfiles");
    expect(src).toContain("useStationeryQuote");
    expect(src).toContain("useStationerySchoolLists");
    expect(src).toContain("useStationeryCartResolve");
    expect(src).toContain("useStationeryBarcodeLookup");
    expect(src).toContain("conversion_factor");
    expect(src).toContain("base_qty");
    expect(src).toContain("CustomerPicker");
    expect(src).toContain("usePosBarcodeScan");
    expect(src).toContain("stationery_school_list_id");
    expect(src).not.toContain("writeStorage");
  });

  it("PosModeView wires dedicated StationeryPos", () => {
    const src = readFileSync(resolve("src/features/pos/PosModeView.tsx"), "utf8");
    expect(src).toContain('from "./StationeryPos"');
    expect(src).toContain("stationery: StationeryPos");
  });

  it("BdMarketPos no longer exports StationeryPos stub", () => {
    const src = readFileSync(resolve("src/features/pos/BdMarketPos.tsx"), "utf8");
    expect(src).not.toContain("export function StationeryPos");
  });

  it("permissions include stationery.manage", () => {
    const src = readFileSync(resolve("src/lib/permissions.ts"), "utf8");
    expect(src).toContain('"stationery.manage"');
    expect(src).toContain('prefix: "/app/stationery", perm: "stationery.manage"');
  });
});
