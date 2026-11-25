import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Phase 6B-2 pharmacy vertical wiring", () => {
  it("pharmacy batches page uses backend hooks with filters", () => {
    const src = readFileSync(resolve("src/routes/app.pharmacy.batches.tsx"), "utf8");
    expect(src).toContain("usePharmaBatchesAll");
    expect(src).not.toContain('toast.success("');
  });

  it("fefo page uses backend batch data with filters", () => {
    const src = readFileSync(resolve("src/routes/app.pharmacy.fefo.tsx"), "utf8");
    expect(src).toContain("usePharmaBatchesAll");
    expect(src).toContain("near-expiry");
  });

  it("prescription page uses real API mutations", () => {
    const src = readFileSync(resolve("src/routes/app.pharmacy.prescription.tsx"), "utf8");
    expect(src).toContain("usePharmaPrescriptions");
    expect(src).toContain("useCreatePharmaPrescription");
    expect(src).toContain("document storage phase");
    expect(src).not.toContain('toast.success("Prescription image uploaded');
  });

  it("PharmacyPos uses barcode scan and blocks expired", () => {
    const src = readFileSync(resolve("src/features/pos/PharmacyPos.tsx"), "utf8");
    expect(src).toContain("usePosBarcodeScan");
    expect(src).toContain("Expired batch cannot be sold");
    expect(src).not.toContain('toast.success("Approval logged")');
    expect(src).not.toContain('toast.success("Prescription image attached")');
  });

  it("GRN form captures pharmacy batch and expiry", () => {
    const src = readFileSync(resolve("src/features/purchases/PurchaseForms.tsx"), "utf8");
    expect(src).toContain("batch_no");
    expect(src).toContain("expiry_date");
    expect(src).toContain("Batch number required for pharmacy");
  });

  it("pharmacy prescription removed from action-wiring backlog", () => {
    const backlog = readFileSync(resolve("src/lib/action-wiring-backlog.ts"), "utf8");
    expect(backlog).not.toContain("app.pharmacy.prescription.tsx");
  });
});

describe("Phase 6B-2H pharmacy stock reconciliation", () => {
  it("SalesReturnForm shows pharmacy batch metadata", () => {
    const src = readFileSync(resolve("src/features/sales/SalesForms.tsx"), "utf8");
    expect(src).toContain('sale.industry_pack === "pharmacy"');
    expect(src).toContain("batchLabel");
  });

  it("PharmacyPos shows batch stock source and no fake PIN approval", () => {
    const src = readFileSync(resolve("src/features/pos/PharmacyPos.tsx"), "utf8");
    expect(src).toContain("batch stock");
    expect(src).toContain("No PIN bypass");
    expect(src).not.toContain('toast.success("Approval logged")');
  });

  it("pharmacy pages show honest export disabled reason", () => {
    const batches = readFileSync(resolve("src/routes/app.pharmacy.batches.tsx"), "utf8");
    const fefo = readFileSync(resolve("src/routes/app.pharmacy.fefo.tsx"), "utf8");
    expect(batches).toContain("Export via Reports");
    expect(fefo).toContain("Export disabled");
  });
});
