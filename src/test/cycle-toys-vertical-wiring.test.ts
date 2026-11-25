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
import { cycleToysCatalog } from "@/lib/industry-mock";

describe("Cycle & Toys ('Pedal & Play') Vertical Wiring & Zero-Impact Isolation", () => {
  it("industry-registry registers cycle-toys pack disabled by default (Rule I-4)", () => {
    expect(INDUSTRY_PACK_IDS).toContain("cycle-toys");
    expect(POS_MODES.some((m) => m.id === "cycle-toys")).toBe(true);

    const configs = defaultPackConfigs();
    expect(configs["cycle-toys"]).toBeDefined();
    expect(configs["cycle-toys"].company).toBe(false);
    expect(configs["cycle-toys"].store).toBe(false);
    expect(configs["cycle-toys"].counter).toBe(false);
  });

  it("registers cycle-toys feature flags with proper namespace", () => {
    const flags = ALL_FEATURE_FLAGS.filter((f) => f.pack === "cycle-toys");
    expect(flags.length).toBeGreaterThanOrEqual(5);
    expect(flags.every((f) => f.key.startsWith("cycle_toys."))).toBe(true);
    expect(flags.some((f) => f.key === "cycle_toys.assembly_service")).toBe(true);
    expect(flags.some((f) => f.key === "cycle_toys.workshop_service")).toBe(true);
    expect(flags.some((f) => f.key === "cycle_toys.battery_rideon")).toBe(true);
  });

  it("registers cycle-toys dynamic fields for wheel size, age group, and assembly", () => {
    const fields = DEFAULT_DYNAMIC_FIELDS.filter((f) => f.pack === "cycle-toys");
    expect(fields.length).toBeGreaterThanOrEqual(3);
    expect(fields.some((f) => f.name === "Wheel Size")).toBe(true);
    expect(fields.some((f) => f.name === "Age Group")).toBe(true);
    expect(fields.some((f) => f.name === "Assembly Condition")).toBe(true);
  });

  it("provides rich mock catalog with kids bikes, geared MTBs, electric ride-ons, and workshop services", () => {
    expect(cycleToysCatalog.length).toBeGreaterThanOrEqual(10);
    expect(cycleToysCatalog.some((i) => i.category === "Kids Cycles" && i.wheelSize === '16"')).toBe(true);
    expect(cycleToysCatalog.some((i) => i.category === "Geared MTBs" && i.brand === "Veloce")).toBe(true);
    expect(cycleToysCatalog.some((i) => i.category === "Electric Ride-ons" && i.isElectric)).toBe(true);
    expect(cycleToysCatalog.some((i) => i.category === "Workshop Service")).toBe(true);
    expect(cycleToysCatalog.some((i) => i.isBoxed)).toBe(true);
  });

  it("PosModeView wires dedicated CycleToysPos component", () => {
    const src = readFileSync(resolve("src/features/pos/PosModeView.tsx"), "utf8");
    expect(src).toContain('from "./CycleToysPos"');
    expect(src).toContain('"cycle-toys": CycleToysPos');
  });

  it("CycleToysPos implements workshop jobs, gift wrap, and battery/PDI logs", () => {
    const src = readFileSync(resolve("src/features/pos/CycleToysPos.tsx"), "utf8");
    expect(src).toContain('industry: "cycle-toys"');
    expect(src).toContain("usePosCatalog");
    expect(src).toContain("Workshop Job");
    expect(src).toContain("Gift & Birthday Wrap");
    expect(src).toContain("Battery & PDI Log");
    expect(src).toContain("Frame Serial");
    expect(src).toContain("5-Point PDI");
    expect(src).toContain("Gift Receipt");
    expect(src).toContain("RC Bench Test");
    expect(src).toContain("Toy in Cart Requires Batteries!");
  });

  it("nav-config includes cycle-toys icon Bike", () => {
    const src = readFileSync(resolve("src/lib/nav-config.ts"), "utf8");
    expect(src).toContain('"cycle-toys": Bike');
  });

  it("product-form-registry defines cycle-toys form attributes", () => {
    const src = readFileSync(resolve("src/lib/product-form-registry.ts"), "utf8");
    expect(src).toContain('packId: "cycle-toys"');
    expect(src).toContain('key: "wheel_size"');
    expect(src).toContain('key: "age_group"');
    expect(src).toContain('key: "assembly_status"');
  });

  it("app.pos.cycle-toys route exists and renders PosModeView mode=cycle-toys", () => {
    const src = readFileSync(resolve("src/routes/app.pos.cycle-toys.tsx"), "utf8");
    expect(src).toContain('createFileRoute("/app/pos/cycle-toys")');
    expect(src).toContain('mode="cycle-toys"');
  });

  it("getPackDef retrieves pack definition with 3 dedicated back-office routes", () => {
    const def = getPackDef("cycle-toys");
    expect(def).toBeDefined();
    expect(def.name).toBe("Cycle & Toys POS");
    expect(def.posRoute).toBe("/app/pos/cycle-toys");
    expect(def.backOfficeRoutes.length).toBe(3);
    expect(def.backOfficeRoutes.some((r) => r.path === "/app/cycle-toys/assembly-queue")).toBe(true);
    expect(def.backOfficeRoutes.some((r) => r.path === "/app/cycle-toys/service-jobs")).toBe(true);
    expect(def.backOfficeRoutes.some((r) => r.path === "/app/cycle-toys/battery-warranty")).toBe(true);
  });

  it("cycle-toys master attributes register category, wheel_size, age_group, and assembly_status", async () => {
    const { getPackMasterAttributes } = await import("@/lib/pack-master-attributes");
    const attrs = getPackMasterAttributes("cycle-toys");
    expect(attrs.map((a) => a.key)).toEqual(["category", "wheel_size", "age_group", "assembly_status"]);
  });

  it("CycleToysPos wires search bar, Gift Wrap trigger, real attribute keys, images, stock guard, and backend hooks", () => {
    const src = readFileSync(resolve("src/features/pos/CycleToysPos.tsx"), "utf8");
    expect(src).toContain("setSearchQuery(");
    expect(src).toContain("setGiftOpen(true)");
    expect(src).toContain("meta.battery_type");
    expect(src).toContain("ready-to-ride");
    expect(src).toContain("imageUrl={it.imageUrl}");
    expect(src).toContain("count={cartQtyBySku.get(it.sku)}");
    expect(src).toContain("is out of stock");
    expect(src).toContain("useCreateCycleServiceJob");
    expect(src).toContain("useCreateCycleBatteryLog");
    expect(src).toContain("useCreateCycleInspection");
    expect(src).toContain("useCreateCycleAssemblyOrder");
    expect(src).toContain("window.print()");
    expect(src).toContain('wizardInterest === "Cycles"');
  });

  it("all 3 Cycle & Toys back-office routes use backend hooks and complete status flows", () => {
    const asm = readFileSync(resolve("src/routes/app.cycle-toys.assembly-queue.tsx"), "utf8");
    const jobs = readFileSync(resolve("src/routes/app.cycle-toys.service-jobs.tsx"), "utf8");
    const bat = readFileSync(resolve("src/routes/app.cycle-toys.battery-warranty.tsx"), "utf8");

    expect(asm).toContain("useCycleAssemblyOrders");
    expect(asm).toContain("Pass PDI");
    expect(jobs).toContain("useCycleServiceJobs");
    expect(bat).toContain("useCycleBatteryLogs");
    expect(bat).toContain("useUpdateCycleBatteryLog");
    expect(bat).toContain("Log Claim");
  });

  it("backend registers cycle-toys pack, flags, RBAC cashier permissions, and dedicated API routes", () => {
    const seed = readFileSync(resolve("backend/app/seed.py"), "utf8");
    const rbac = readFileSync(resolve("backend/app/rbac.py"), "utf8");
    const api = readFileSync(resolve("backend/app/api/v1/industry.py"), "utf8");

    expect(seed).toContain('"cycle-toys"');
    expect(seed).toContain('"cycle_toys.assembly_service"');
    expect(rbac).toContain('"cycle_toys.service_manage"');
    expect(api).toContain('/cycle-toys/assembly-orders');
    expect(api).toContain('/cycle-toys/service-jobs');
    expect(api).toContain('/cycle-toys/battery-logs');
    expect(api).toContain('/cycle-toys/inspections');
  });
});
