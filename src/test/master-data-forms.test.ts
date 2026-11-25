import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Phase 5 master data", () => {
  it("customers page uses EntityFormDrawer not toast-only add", () => {
    const src = readFileSync(resolve("src/routes/app.customers.index.tsx"), "utf8");
    expect(src).toContain("EntityFormDrawer");
    expect(src).toContain("useCreateCustomer");
    expect(src).not.toContain('toast.success("Customer added")');
  });

  it("categories page uses backend hooks not mock-extra", () => {
    const src = readFileSync(resolve("src/routes/app.categories.tsx"), "utf8");
    expect(src).toContain("useCategories");
    expect(src).not.toContain("mock-extra");
  });

  it("settings save calls company profile API", () => {
    const src = readFileSync(resolve("src/routes/app.settings.tsx"), "utf8");
    expect(src).toContain("useUpdateCompanyProfile");
    expect(src).not.toContain('toast.success("Company profile saved")');
  });

  it("payment methods master page uses payment method mutations", () => {
    const src = readFileSync(resolve("src/routes/app.master-data.payment-methods.tsx"), "utf8");
    expect(src).toContain("useUpdatePaymentMethod");
    expect(src).toContain("useCreatePaymentMethod");
    expect(src).not.toContain('toast.success("Payment method updated")');
  });

  it("payments page lists transactions without method config", () => {
    const src = readFileSync(resolve("src/routes/app.payments.tsx"), "utf8");
    expect(src).toContain("usePayments");
    expect(src).not.toContain("useUpdatePaymentMethod");
    expect(src).toContain("ListPagination");
  });

  it("workflows page is honestly disabled", () => {
    const src = readFileSync(resolve("src/routes/app.configuration.workflows.tsx"), "utf8");
    expect(src).toContain("Workflow builder will be completed");
    expect(src).not.toContain("mock-extra");
  });
});
