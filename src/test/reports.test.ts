import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildNavigation } from "@/lib/nav-config";
import { allPacksEnabledConfigs } from "@/lib/industry-registry";

describe("Phase 4 reports", () => {
  it("catalog page does not use demo CSV toast fallback", () => {
    const src = readFileSync(resolve("src/routes/app.reports.index.tsx"), "utf8");
    expect(src).not.toContain('toast.success("CSV downloaded")');
    expect(src).toContain("Report catalog");
  });

  it("report layouts render Outlet so child routes are not masked", () => {
    const layout = readFileSync(resolve("src/routes/app.reports.tsx"), "utf8");
    const customLayout = readFileSync(resolve("src/routes/app.reports.custom.tsx"), "utf8");
    expect(layout).toContain("Outlet");
    expect(customLayout).toContain("Outlet");
    expect(layout).not.toContain("Report catalog");
    expect(customLayout).not.toContain("Custom Reports");
  });

  it("custom reports page uses Custom Reports branding", () => {
    const src = readFileSync(resolve("src/routes/app.reports.custom.index.tsx"), "utf8");
    expect(src).toContain("Custom Reports");
    expect(src).not.toContain("My Reports");
  });

  it("nav labels Custom Reports and omits Devices / System Status", () => {
    const nav = buildNavigation(allPacksEnabledConfigs(), "Admin", {}, {} as any, "/app/reports", {
      fullMenuAccess: true,
      isPlatformAdmin: true,
      roleCode: "Admin",
    });
    const items = nav.groups.flatMap((g) => g.items);
    const sectionItems = nav.groups.flatMap((g) => (g.sections ?? []).flatMap((s) => s.items));
    const allNavItems = [...items, ...sectionItems];
    expect(allNavItems.some((i) => i.to.startsWith("/app/reports"))).toBe(true);
    expect(items.some((i) => i.to === "/app/reports/custom" && i.label === "Custom Reports")).toBe(true);
    expect(allNavItems.some((i) => i.to === "/app/settings/devices")).toBe(false);
    expect(allNavItems.some((i) => i.to === "/app/system/status")).toBe(false);
    expect(nav.platformSections.some((s) => s.id === "saas-control-center")).toBe(true);
    expect(
      nav.platformSections
        .find((s) => s.id === "saas-control-center")
        ?.items.some((i) => i.to === "/super-admin/subscriptions"),
    ).toBe(true);
    expect(items.some((i) => i.to.startsWith("/super-admin"))).toBe(false);
  });

  it("overview uses dashboard KPI hook in backend mode", () => {
    const src = readFileSync(resolve("src/routes/app.overview.tsx"), "utf8");
    expect(src).toContain("useDashboardKpi");
    expect(src).not.toMatch(/chartData\s*=\s*useApi\s*\?\s*\[\]/);
  });

  it("ReportRunner uses ExportButton and pdf export", () => {
    const src = readFileSync(resolve("src/features/reports/ReportRunner.tsx"), "utf8");
    expect(src).toContain("ExportButton");
    expect(src).toContain("exportRowsToPdf");
    expect(src).not.toContain('toast.success("CSV');
  });

  it("ReportRunner hydrates drill-down search params", () => {
    const src = readFileSync(resolve("src/features/reports/ReportRunner.tsx"), "utf8");
    expect(src).toContain("initialSearch");
    expect(src).toContain("item-ledger");
  });
});
