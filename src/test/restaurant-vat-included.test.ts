import { describe, it, expect, beforeEach } from "vitest";
import { computeRestaurantBill, effectiveCartTaxRate } from "@/features/pos/restaurant-billing";

describe("Restaurant VAT Included vs Excluded Calculations", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("calculates bill with 0 extra tax when VAT is included with product price (vatRate = 0)", () => {
    const subtotal = 1000;
    const discount = 100;
    const servicePct = 10;
    const vatRate = 0; // VAT included in menu price

    const bill = computeRestaurantBill({
      subtotal,
      discount,
      servicePct,
      vatRate,
    });

    expect(bill.subtotal).toBe(1000);
    expect(bill.discount).toBe(100);
    expect(bill.serviceCharge).toBe(100); // 10% of 1000
    expect(bill.tax).toBe(0); // 0 additional VAT
    expect(bill.total).toBe(1000); // 1000 - 100 + 100 = 1000
  });

  it("calculates bill with additional VAT when VAT is excluded (e.g. 5%)", () => {
    const subtotal = 1000;
    const discount = 0;
    const servicePct = 10;
    const vatRate = 0.05; // 5% VAT

    const bill = computeRestaurantBill({
      subtotal,
      discount,
      servicePct,
      vatRate,
    });

    expect(bill.subtotal).toBe(1000);
    expect(bill.serviceCharge).toBe(100);
    expect(bill.tax).toBe(55); // 5% of (1000 + 100) = 55
    expect(bill.total).toBe(1155);
  });

  it("calculates effectiveCartTaxRate correctly when VAT is included (vatRate = 0)", () => {
    // With 10% service charge and 0% additional VAT, effective tax rate is exactly 0.10 (10%)
    const rateWithService = effectiveCartTaxRate(10, 0);
    expect(rateWithService).toBeCloseTo(0.10, 4);

    // With 0% service charge and 0% additional VAT, effective tax rate is 0
    const rateZero = effectiveCartTaxRate(0, 0);
    expect(rateZero).toBe(0);
  });

  it("persists pulse.vat_included in localStorage", () => {
    // Simulate enabling VAT included
    localStorage.setItem("pulse.vat_included", JSON.stringify(true));
    localStorage.setItem("pulse.vat_rate", JSON.stringify(5));
    localStorage.setItem("pulse.service_charge_pct", JSON.stringify(10));

    const isVatIncluded = JSON.parse(localStorage.getItem("pulse.vat_included") || "false");
    const configuredVatRate = JSON.parse(localStorage.getItem("pulse.vat_rate") || "5");
    const configuredServicePct = JSON.parse(localStorage.getItem("pulse.service_charge_pct") || "10");

    expect(isVatIncluded).toBe(true);

    const activeVatRate = isVatIncluded ? 0 : (configuredVatRate ?? 5) / 100;
    expect(activeVatRate).toBe(0);

    const bill = computeRestaurantBill({
      subtotal: 500,
      servicePct: configuredServicePct,
      vatRate: activeVatRate,
    });

    expect(bill.tax).toBe(0);
    expect(bill.total).toBe(550); // 500 + 50 service charge
  });
});
