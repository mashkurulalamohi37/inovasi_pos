import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Phase 6A product + inventory foundation", () => {
  it("inventory reorder uses ReorderDrawer not fake toast", () => {
    const invPath = resolve("src/routes/app.inventory.index.tsx");
    const inv = readFileSync(invPath, "utf8");
    const drawer = readFileSync(resolve("src/features/inventory/ReorderDrawer.tsx"), "utf8");
    expect(inv).toContain("ReorderDrawer");
    expect(drawer).toContain("useReorderPurchase");
    expect(inv).not.toContain('toast.success("Reorder added to draft PO")');
  });

  it("inventory demo adjustment uses disabled reason not fake toast", () => {
    const src = readFileSync(resolve("src/routes/app.inventory.index.tsx"), "utf8");
    expect(src).toContain("DisabledReasonButton");
    expect(src).not.toContain('toast.success("Adjustment recorded")');
    expect(src).not.toContain('toast.success("Transfer created")');
  });

  it("products edit uses category brand unit hooks", () => {
    const src = readFileSync(resolve("src/routes/app.products.tsx"), "utf8");
    expect(src).toContain("useCategories");
    expect(src).toContain("useBrands");
    expect(src).toContain("useUnits");
    expect(src).toContain("useProduct");
  });

  it("products update sends barcode and is_active", () => {
    const src = readFileSync(resolve("src/routes/app.products.tsx"), "utf8");
    expect(src).toContain("barcode: form.barcode");
    expect(src).toContain("is_active: form.is_active");
  });

  it("reorder drawer calls inventory reorder API", () => {
    const src = readFileSync(resolve("src/features/inventory/ReorderDrawer.tsx"), "utf8");
    expect(src).toContain("useReorderPurchase");
    expect(src).not.toContain("toast.success");
  });
});
