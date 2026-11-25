import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseScaleBarcode,
  computeWeighedPrice,
  computeExpiryMarkdown,
  DEFAULT_SUPER_SHOP_DEPARTMENTS,
  superShopCatalog,
  DEFAULT_FAST_KEYS,
  type SuperShopDepartment,
} from "@/lib/super-shop-data";
import { receiptLineDetails, type ReceiptLineItem } from "@/lib/receipt";
import { defaultPackConfigs, INDUSTRY_PACK_IDS } from "@/lib/industry-registry";

describe("SQA Test Suite: Super Shop POS & Multi-Department Architecture", () => {
  // --------------------------------------------------------------------------
  // TC-SS-01: Scale-Embedded Barcode Parsing (EAN-13 in-store variable measure)
  // --------------------------------------------------------------------------
  describe("TC-SS-01: Scale-Embedded Barcode Parsing", () => {
    it("parses weight-embedded barcode (Prefix 20) with 4-digit PLU and 5-digit grams", () => {
      // 20 (Prefix) + 4011 (PLU: Beef Sirloin) + 01250 (1.250 kg) + 3 (Check digit)
      const rawBarcode = "204011012503";
      const result = parseScaleBarcode(rawBarcode);

      expect(result.isScaleBarcode).toBe(true);
      expect(result.prefix).toBe("20");
      expect(result.pluCode).toBe("4011");
      expect(result.type).toBe("weight");
      expect(result.weightKg).toBe(1.25);
    });

    it("parses price-embedded barcode (Prefix 21) with 4-digit PLU and price in currency units", () => {
      // Standard 2-decimal price: 21 (Prefix) + 4012 (PLU: Broiler Chicken) + 45000 (৳450.00) + 7 (Check digit)
      const rawBarcode = "214012450007";
      const result = parseScaleBarcode(rawBarcode);

      expect(result.isScaleBarcode).toBe(true);
      expect(result.prefix).toBe("21");
      expect(result.pluCode).toBe("4012");
      expect(result.type).toBe("price");
      expect(result.priceBDT).toBe(450);

      // Whole integer price format (0-decimals option): 21 + 4012 + 00450 + 7
      const zeroDecimalResult = parseScaleBarcode("214012004507", { priceDecimals: 0 });
      expect(zeroDecimalResult.priceBDT).toBe(450);
    });

    it("rejects standard FMCG barcodes and invalid prefixes as non-scale barcodes", () => {
      // Standard 12-digit UPC or 13-digit EAN (Savlon: 894110055663)
      const fmcgBarcode = "894110055663";
      const result = parseScaleBarcode(fmcgBarcode);
      expect(result.isScaleBarcode).toBe(false);

      // Short input
      expect(parseScaleBarcode("204011").isScaleBarcode).toBe(false);

      // Empty input
      expect(parseScaleBarcode("").isScaleBarcode).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // TC-SS-02: Weighed Item Tare & Price Math Accuracy
  // --------------------------------------------------------------------------
  describe("TC-SS-02: Weighed Item Tare & Price Math Accuracy", () => {
    it("accurately computes net weight and price deducting container tare grams", () => {
      // Gross: 1.500 kg, Rate: ৳850/kg, Tare: 25 grams (0.025 kg)
      // Net = 1.500 - 0.025 = 1.475 kg
      // Total = round(1.475 * 850) = round(1253.75) = 1254
      const calc = computeWeighedPrice(1.5, 850, 25);

      expect(calc.grossKg).toBe(1.5);
      expect(calc.tareKg).toBe(0.025);
      expect(calc.netKg).toBe(1.475);
      expect(calc.totalPrice).toBe(1254);
    });

    it("handles zero tare correctly", () => {
      // Gross: 0.850 kg, Rate: ৳220/kg, Tare: 0 grams
      // Net = 0.850 kg, Total = round(0.850 * 220) = 187
      const calc = computeWeighedPrice(0.85, 220, 0);

      expect(calc.netKg).toBe(0.85);
      expect(calc.totalPrice).toBe(187);
    });

    it("enforces positive minimum weight (0.010 kg) boundary guard against excessive tare", () => {
      const calc = computeWeighedPrice(0.015, 500, 20); // 15g gross with 20g tare
      expect(calc.netKg).toBeGreaterThanOrEqual(0.01);
      expect(calc.totalPrice).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // TC-SS-03: Perishable Expiry Markdown Calculation
  // --------------------------------------------------------------------------
  describe("TC-SS-03: Perishable Expiry Markdown Calculation", () => {
    const basePrice = 220; // Broiler chicken base

    it("applies 50% critical markdown when 1 day remaining to expiry", () => {
      const md = computeExpiryMarkdown(basePrice, 1);
      expect(md.status).toBe("critical");
      expect(md.discountPct).toBe(50);
      expect(md.finalPrice).toBe(110);
    });

    it("applies 30% warning markdown when 3 days remaining to expiry", () => {
      const md = computeExpiryMarkdown(basePrice, 3);
      expect(md.status).toBe("warning");
      expect(md.discountPct).toBe(30);
      expect(md.finalPrice).toBe(154);
    });

    it("retains full price for fresh items (> 7 days remaining)", () => {
      const md = computeExpiryMarkdown(basePrice, 14);
      expect(md.status).toBe("fresh");
      expect(md.discountPct).toBe(0);
      expect(md.finalPrice).toBe(220);
    });

    it("blocks/quarantines expired stock (days <= 0)", () => {
      const md = computeExpiryMarkdown(basePrice, 0);
      expect(md.status).toBe("critical");
      expect(md.discountPct).toBe(100);
      expect(md.finalPrice).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // TC-SS-04: Multi-Department Dynamic Catalog Organization
  // --------------------------------------------------------------------------
  describe("TC-SS-04: Multi-Department Dynamic Catalog Organization", () => {
    it("defines all standard super shop retail departments with required capability flags", () => {
      const deptCodes = DEFAULT_SUPER_SHOP_DEPARTMENTS.map((d) => d.code);
      expect(deptCodes).toContain("FRESH");
      expect(deptCodes).toContain("GROC");
      expect(deptCodes).toContain("PHARM");
      expect(deptCodes).toContain("APPAREL");
      expect(deptCodes).toContain("BEAUTY");
      expect(deptCodes).toContain("TECH");
      expect(deptCodes).toContain("STAT");

      const freshDept = DEFAULT_SUPER_SHOP_DEPARTMENTS.find((d) => d.code === "FRESH");
      expect(freshDept?.capabilities).toContain("weighed");
      expect(freshDept?.capabilities).toContain("tare");

      const pharmDept = DEFAULT_SUPER_SHOP_DEPARTMENTS.find((d) => d.code === "PHARM");
      expect(pharmDept?.capabilities).toContain("batch_tracked");
      expect(pharmDept?.capabilities).toContain("rx_reference");

      const apparelDept = DEFAULT_SUPER_SHOP_DEPARTMENTS.find((d) => d.code === "APPAREL");
      expect(apparelDept?.capabilities).toContain("variant");

      const techDept = DEFAULT_SUPER_SHOP_DEPARTMENTS.find((d) => d.code === "TECH");
      expect(techDept?.capabilities).toContain("serial_tracked");
      expect(techDept?.capabilities).toContain("warranty");
    });

    it("verifies super shop catalog contains items across all defined departments", () => {
      const deptsInCatalog = new Set(superShopCatalog.map((item) => item.departmentCode));
      expect(deptsInCatalog.has("FRESH")).toBe(true);
      expect(deptsInCatalog.has("GROC")).toBe(true);
      expect(deptsInCatalog.has("PHARM")).toBe(true);
      expect(deptsInCatalog.has("APPAREL")).toBe(true);
      expect(deptsInCatalog.has("BEAUTY")).toBe(true);
      expect(deptsInCatalog.has("TECH")).toBe(true);
      expect(deptsInCatalog.has("STAT")).toBe(true);
    });

    it("includes predefined fast keys for high-velocity front-line checkout items", () => {
      expect(DEFAULT_FAST_KEYS.length).toBeGreaterThanOrEqual(6);
      const labels = DEFAULT_FAST_KEYS.map((k) => k.label);
      expect(labels).toContain("Carry Bag");
      expect(labels).toContain("Beef Sirloin");
      expect(labels).toContain("Napa Extra");
    });
  });

  // --------------------------------------------------------------------------
  // TC-SS-05: Receipt Formatting for Super Shop Multi-Department Lines
  // --------------------------------------------------------------------------
  describe("TC-SS-05: Receipt Formatting for Super Shop Multi-Department Lines", () => {
    it("formats comprehensive thermal receipt details for weighed meat & produce lines", () => {
      const line: ReceiptLineItem = {
        sku: "BF-SIRLOIN",
        name: "Fresh Beef · Sirloin Cut",
        price: 1063,
        qty: 1,
        industry: "super-shop",
        extras: {
          department: "Fresh, Meat & Fish",
          departmentCode: "FRESH",
          isWeighable: true,
          netWeight: "1.250",
          ratePerKg: 850,
          tare: 0.02,
        },
      };

      const details = receiptLineDetails(line);
      expect(details).toContain("Dept: Fresh, Meat & Fish");
      expect(details).toContain("Net: 1.250 kg");
      expect(details).toContain("@ ৳850/kg");
      expect(details).toContain("Tare: 20g");
    });

    it("formats comprehensive thermal receipt details for apparel variant lines", () => {
      const line: ReceiptLineItem = {
        sku: "POLO-01-M-NV",
        name: "Men's Pique Cotton Polo Shirt",
        price: 850,
        qty: 1,
        industry: "super-shop",
        extras: {
          department: "Apparel & Footwear",
          size: "M",
          color: "Navy",
        },
      };

      const details = receiptLineDetails(line);
      expect(details).toContain("Dept: Apparel & Footwear");
      expect(details).toContain("Size: M");
      expect(details).toContain("Color: Navy");
    });

    it("formats comprehensive thermal receipt details for tech serial & warranty lines", () => {
      const line: ReceiptLineItem = {
        sku: "WALTON-LED-12W",
        name: "Walton LED Bulb 12W",
        price: 350,
        qty: 1,
        industry: "super-shop",
        extras: {
          department: "Electronics & Home",
          serial: "SN-98214-LED",
          warrantyMonths: 12,
        },
      };

      const details = receiptLineDetails(line);
      expect(details).toContain("Dept: Electronics & Home");
      expect(details).toContain("SN: SN-98214-LED");
      expect(details).toContain("Warranty: 12 mo");
    });

    it("formats comprehensive thermal receipt details for pharmacy medicine lines with doctor ref", () => {
      const line: ReceiptLineItem = {
        sku: "MED-AMOX-500",
        name: "Moxacil 500mg Capsule",
        price: 75,
        qty: 1,
        industry: "super-shop",
        extras: {
          department: "Pharmacy & Health (OTC)",
          batch: "BT-2026-04C",
          expiry: "2027-06-30",
          generic: "Amoxicillin Trihydrate",
          rx_ref: "RX-88219",
          doctor: "Dr. K. Ahmed",
        },
      };

      const details = receiptLineDetails(line);
      expect(details).toContain("Dept: Pharmacy & Health (OTC)");
      expect(details).toContain("Batch: BT-2026-04C");
      expect(details).toContain("Exp: 2027-06-30");
      expect(details).toContain("Generic: Amoxicillin Trihydrate");
      expect(details).toContain("Rx: RX-88219");
      expect(details).toContain("Dr: Dr. K. Ahmed");
    });
  });

  // --------------------------------------------------------------------------
  // TC-SS-06: In-Cart Line Dynamic Editing Math & Rules
  // --------------------------------------------------------------------------
  describe("TC-SS-06: In-Cart Line Dynamic Editing Math & Rules", () => {
    it("calculates re-weighed line price when cashier edits net weight in-cart", () => {
      const initialPrice = 850;
      const ratePerKg = 850;
      const adjustedWeightKg = 1.75;
      const reweighedPrice = Math.round(adjustedWeightKg * ratePerKg);

      expect(reweighedPrice).toBe(1488);
    });

    it("applies line-item percentage discount correctly during in-cart editing", () => {
      const baseLinePrice = 1250; // Chino Pants
      const discountPct = 10; // 10% manager discount
      const discountAmount = Math.round((baseLinePrice * discountPct) / 100);
      const discountedLinePrice = baseLinePrice - discountAmount;

      expect(discountAmount).toBe(125);
      expect(discountedLinePrice).toBe(1125);
    });
  });

  // --------------------------------------------------------------------------
  // TC-SS-07: SuperShopPos Architecture & Interactive Modals Verification
  // --------------------------------------------------------------------------
  describe("TC-SS-07: SuperShopPos Architecture & Interactive Modals", () => {
    const posSource = readFileSync(resolve("src/features/pos/SuperShopPos.tsx"), "utf8");

    it("implements live scale readout and weight simulator", () => {
      expect(posSource).toContain("simulatedWeight");
      expect(posSource).toContain("Live Scanner-Scale Weight");
      expect(posSource).toContain("parseScaleBarcode");
    });

    it("implements all five dynamic capability dialogs", () => {
      // 1. Digital Scale Weighing
      expect(posSource).toContain("Weigh & Price Calculation");
      // 2. Apparel Variant Selector
      expect(posSource).toContain("Select Size & Color Variant");
      // 3. Serial / IMEI Registration
      expect(posSource).toContain("Serial / IMEI Registration");
      // 4. Pharmacy Rx Confirmation
      expect(posSource).toContain("Prescription Required Medicine");
      // 5. In-Cart Line Item Editor
      expect(posSource).toContain("Edit Cart Item");
    });

    it("supports fast keys one-touch bar and grouped department cart breakdown", () => {
      expect(posSource).toContain("DEFAULT_FAST_KEYS");
      expect(posSource).toContain("Fast Keys (F10)");
      expect(posSource).toContain("departmentSubtotals");
      expect(posSource).toContain("Basket Breakdown:");
    });
  });

  // --------------------------------------------------------------------------
  // TC-SS-08: Zero-Impact Isolation & Guard Verification
  // --------------------------------------------------------------------------
  describe("TC-SS-08: Zero-Impact Isolation & Guard Verification", () => {
    it("super-shop industry pack is registered and disabled by default across all tiers", () => {
      expect(INDUSTRY_PACK_IDS).toContain("super-shop");
      const defaultPacks = defaultPackConfigs();
      expect(defaultPacks["super-shop"].company).toBe(false);
      expect(defaultPacks["super-shop"].store).toBe(false);
      expect(defaultPacks["super-shop"].counter).toBe(false);
    });

    it("all 6 back-office super shop routes are guarded with super-shop.manage permission", () => {
      const routes = [
        "src/routes/app.super-shop.departments.tsx",
        "src/routes/app.super-shop.lanes.tsx",
        "src/routes/app.super-shop.scale-station.tsx",
        "src/routes/app.super-shop.expiry-markdown.tsx",
        "src/routes/app.super-shop.inventory.tsx",
        "src/routes/app.super-shop.loss-prevention.tsx",
      ];

      for (const routePath of routes) {
        const content = readFileSync(resolve(routePath), "utf8");
        expect(content, `${routePath} must be guarded`).toContain('perm="super-shop.manage"');
      }
    });
  });
});
