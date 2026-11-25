import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Phase 6B-9 salon vertical wiring", () => {
  it("services route uses backend hooks not pack stub", () => {
    const src = readFileSync(resolve("src/routes/app.salon.services.tsx"), "utf8");
    expect(src).toContain("useSalonServices");
    expect(src).toContain("useUpsertSalonService");
    expect(src).toContain("EntityFormDrawer");
    expect(src).toContain("PermissionGate");
    expect(src).not.toContain("createPackBackOfficeRoute");
    expect(src).not.toContain("pack-stub-data");
  });

  it("stylists route uses backend staff hooks", () => {
    const src = readFileSync(resolve("src/routes/app.salon.stylists.tsx"), "utf8");
    expect(src).toContain("useSalonStaff");
    expect(src).toContain("useUpsertSalonStaff");
    expect(src).toContain("useSetSalonStaffServices");
    expect(src).not.toContain("createPackBackOfficeRoute");
    expect(src).not.toContain("salonStylists");
  });

  it("appointments page uses real mutations", () => {
    const src = readFileSync(resolve("src/routes/app.salon.appointments.tsx"), "utf8");
    expect(src).toContain("useSalonAppointments");
    expect(src).toContain("useCreateSalonAppointment");
    expect(src).toContain("useCreateSalonWalkIn");
    expect(src).toContain("useCheckoutSalonVisit");
    expect(src).toContain("ConfirmActionDialog");
    expect(src).not.toContain("createPackBackOfficeRoute");
    expect(src).not.toContain('toast.success("Appointment synced")');
  });

  it("SalonPos uses backend catalog and staff", () => {
    const src = readFileSync(resolve("src/features/pos/SalonPos.tsx"), "utf8");
    expect(src).toContain("usePosCatalog");
    expect(src).toContain("useSalonStaff");
    expect(src).toContain('industry: "salon"');
    expect(src).not.toContain("writeStorage");
  });

  it("PosModeView wires dedicated SalonPos", () => {
    const src = readFileSync(resolve("src/features/pos/PosModeView.tsx"), "utf8");
    expect(src).toContain('from "./SalonPos"');
    expect(src).toContain("salon: SalonPos");
  });
});
