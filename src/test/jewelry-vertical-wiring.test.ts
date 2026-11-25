import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Phase 6B-4 jewelry vertical wiring", () => {
  it("gold-rate page uses backend hooks and does not synthesize fake karat board math", () => {
    const src = readFileSync(resolve("src/routes/app.jewelry.gold-rate.tsx"), "utf8");
    expect(src).toContain("useGoldRate");
    expect(src).toContain("useJewelryRates");
    expect(src).toContain("useCreateJewelryRate");
    expect(src).toContain("EntityFormDrawer");
    expect(src).toContain("manual_override");
    expect(src).not.toContain("24 / 22");
    expect(src).not.toContain("18 / 22");
  });

  it("certificate page uses backend hooks and profile upsert", () => {
    const src = readFileSync(resolve("src/routes/app.jewelry.certificate.tsx"), "utf8");
    expect(src).toContain("useJewelryCertificates");
    expect(src).toContain("useCreateJewelryCertificate");
    expect(src).toContain("useJewelryProfiles");
    expect(src).toContain("useUpsertJewelryProfile");
    expect(src).toContain("DisabledReasonButton");
    expect(src).toContain("PDF certificate print deferred");
    expect(src).not.toContain('toast.success("Certificate');
  });

  it("buyback page is backend-wired with certificate link and no mock tickets", () => {
    const src = readFileSync(resolve("src/routes/app.jewelry.buyback.tsx"), "utf8");
    expect(src).toContain("useJewelryBuybacks");
    expect(src).toContain("useCreateJewelryBuyback");
    expect(src).toContain("useUpdateJewelryBuyback");
    expect(src).toContain("certificate_no");
    expect(src).toContain("ConfirmActionDialog");
    expect(src).toContain("no local mock tickets");
  });

  it("JewelryPos uses quote, certificate lookup, and transparent breakdown", () => {
    const src = readFileSync(resolve("src/features/pos/JewelryPos.tsx"), "utf8");
    expect(src).toContain("useJewelryQuote");
    expect(src).toContain("lookupJewelryCertificate");
    expect(src).toContain("useGoldRate");
    expect(src).toContain("Price breakdown");
    expect(src).toContain("Metal value");
    expect(src).toContain("Net payable");
    expect(src).not.toContain('toast.success("Rate updated');
    expect(src).not.toContain('toast.success("Certificate');
  });

  it("GRN form requires jewelry certificate and weights", () => {
    const src = readFileSync(resolve("src/features/purchases/PurchaseForms.tsx"), "utf8");
    expect(src).toContain('purchase.industry_pack === "jewelry"');
    expect(src).toContain("Certificate no. required for jewelry GRN");
    expect(src).toContain("Gross weight required for jewelry GRN");
  });

  it("jewelry product form captures weight and making charge fields", () => {
    const src = readFileSync(resolve("src/lib/product-form-registry.ts"), "utf8");
    expect(src).toContain("net_metal_weight");
    expect(src).toContain("making_charge_type");
    expect(src).toContain("wastage_percentage");
    expect(src).toContain("certificate_required");
  });
});
