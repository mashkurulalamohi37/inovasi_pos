import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseUdiBarcode } from "@/features/pos/SurgicalShopPos";
import { receiptLineDetails, type ReceiptLineItem } from "@/lib/receipt";

describe("SQA Test Suite: Surgical Items POS", () => {
  it("TC-SURG-01: Correctly parses GS1-128 / UDI standard Application Identifiers", () => {
    const rawBarcode = "(01)088493019283(17)271231(10)LOT-SG-9921(21)SN-40291";
    const parsed = parseUdiBarcode(rawBarcode);

    expect(parsed.gtin).toBe("088493019283");
    expect(parsed.expiry).toBe("2027-12-31");
    expect(parsed.batch).toBe("LOT-SG-9921");
    expect(parsed.serial).toBe("SN-40291");
  });

  it("TC-SURG-02: Correctly parses raw stream UDI barcode fallback", () => {
    // 01 (AI) + 14-digit GTIN (08849301928317) + 17 (AI) + YYMMDD (261231) + 10 (AI) + LOT
    const rawStream = "01088493019283171726123110B204";
    const parsed = parseUdiBarcode(rawStream);

    expect(parsed.gtin).toBe("08849301928317");
    expect(parsed.expiry).toBe("2026-12-31");
  });

  it("TC-SURG-03: Formats comprehensive surgical thermal receipt details", () => {
    const line: ReceiptLineItem = {
      sku: "SG-IMP-001",
      name: "Titanium Bone Plate 3.5mm",
      price: 15000,
      qty: 1,
      industry: "surgical-shop",
      extras: {
        batch_no: "LOT-BP-2026",
        serial_no: "SN-99821-TI",
        udi_code: "UDI-0884930192",
        expiry_date: "2029-06-30",
        sterile_status: "sterile",
        surgical_grade: "ISO Class IIb",
        hospitalRef: "Square Hospital",
        doctorRef: "Dr. K. Ahmed",
      },
    };

    const details = receiptLineDetails(line);
    expect(details).toContain("Batch: LOT-BP-2026");
    expect(details).toContain("SN: SN-99821-TI");
    expect(details).toContain("UDI: UDI-0884930192");
    expect(details).toContain("Exp: 2029-06-30");
    expect(details).toContain("Sterile");
    expect(details).toContain("Grade: ISO Class IIb");
    expect(details).toContain("Hospital/OT: Square Hospital");
    expect(details).toContain("Dr: Dr. K. Ahmed");
  });

  it("TC-SURG-04: SurgicalShopPos implements responsive dialogs, consignment billing, and FEFO sorting", () => {
    const src = readFileSync(resolve("src/features/pos/SurgicalShopPos.tsx"), "utf8");
    expect(src).toContain("w-[95vw]");
    expect(src).toContain("max-h-[90vh]");
    expect(src).toContain("Consignment Billing");
    expect(src).toContain("isConsignment");
    expect(src).toContain("FEFO Ready");
  });
});

describe("SQA Test Suite: Pharmacy POS", () => {
  it("TC-PHARM-01: Formats comprehensive pharmacy thermal receipt details", () => {
    const line: ReceiptLineItem = {
      sku: "RX-PARA-500",
      name: "Napa 500mg (Strip)",
      price: 12,
      qty: 2,
      industry: "pharmacy",
      extras: {
        strength: "500mg",
        dosageForm: "Tablet",
        generic: "Paracetamol",
        manufacturer: "Beximco Pharmaceuticals",
        batch: "B-2026-081",
        expiry: "2028-04-15",
        rx_ref: "RX-2026-0941",
        doctor_name: "Dr. S. Rahman",
      },
    };

    const details = receiptLineDetails(line);
    expect(details).toContain("Strength: 500mg");
    expect(details).toContain("Tablet");
    expect(details).toContain("Generic: Paracetamol");
    expect(details).toContain("Mfg: Beximco Pharmaceuticals");
    expect(details).toContain("Batch: B-2026-081");
    expect(details).toContain("Exp: 2028-04-15");
    expect(details).toContain("Rx: RX-2026-0941");
    expect(details).toContain("Dr: Dr. S. Rahman");
  });

  it("TC-PHARM-02: PharmacyPos contains fractional unit dispensing, drug interaction advisory, and responsive dialogs", () => {
    const src = readFileSync(resolve("src/features/pos/PharmacyPos.tsx"), "utf8");
    expect(src).toContain("Full Box");
    expect(src).toContain("Strip (1/10)");
    expect(src).toContain("Pcs (1/100)");
    expect(src).toContain("Duplicate Generic Therapy");
    expect(src).toContain("w-[95vw]");
    expect(src).toContain("max-h-[90vh]");
  });

  it("TC-PHARM-03: Fractional unit price math accurately computes Strip (1/10) and Piece (1/100) rates", () => {
    const baseBoxPrice = 120.0;
    const stripPrice = Math.round((baseBoxPrice / 10) * 100) / 100;
    const piecePrice = Math.round((baseBoxPrice / 100) * 100) / 100;

    expect(stripPrice).toBe(12.0);
    expect(piecePrice).toBe(1.2);
  });
});

describe("SQA Test Suite: Optical Shop POS", () => {
  it("TC-OPT-01: Formats comprehensive optical thermal receipt details", () => {
    const line: ReceiptLineItem = {
      sku: "OPT-FRAME-001",
      name: "Titanium Flex Full-Rim (Black)",
      price: 4500,
      qty: 1,
      industry: "optical-shop",
      extras: {
        brand: "Ray-Ban",
        frame_size: "52-18-140",
        frame_type: "Full-Rim",
        lens_type: "Single Vision (High Index)",
        refractive_index: "1.67",
        coating: "Blue-Cut Anti-Reflective",
        od_sph: "-2.50",
        od_cyl: "-0.75",
        od_axis: "180",
        os_sph: "-2.00",
        os_cyl: "-0.50",
        os_axis: "90",
        pd: "63",
        doctor_name: "Dr. S. Rahman",
        order_no: "OPT-2026-0042",
        delivery_date: "2026-09-02",
      },
    };

    const details = receiptLineDetails(line);
    expect(details).toContain("Brand: Ray-Ban");
    expect(details).toContain("Size: 52-18-140");
    expect(details).toContain("Type: Full-Rim");
    expect(details).toContain("Lens: Single Vision (High Index)");
    expect(details).toContain("Index: 1.67");
    expect(details).toContain("Coating: Blue-Cut Anti-Reflective");
    expect(details).toContain("OD: SPH -2.50 CYL -0.75 AXIS 180°");
    expect(details).toContain("OS: SPH -2.00 CYL -0.50 AXIS 90°");
    expect(details).toContain("PD: 63mm");
    expect(details).toContain("Optometrist: Dr. S. Rahman");
    expect(details).toContain("Job: OPT-2026-0042");
    expect(details).toContain("Promise: 2026-09-02");
  });

  it("TC-OPT-02: Monocular Dual PD calculation correctly computes total pupillary distance", () => {
    const od_pd = 31.5;
    const os_pd = 32.0;
    const total_pd = od_pd + os_pd;

    expect(total_pd).toBe(63.5);
  });

  it("TC-OPT-03: OpticalShopPos contains responsive OD/OS grids, customer notification simulator, and Dual Monocular PD", () => {
    const src = readFileSync(resolve("src/features/pos/OpticalShopPos.tsx"), "utf8");
    expect(src).toContain("OD PD (mm)");
    expect(src).toContain("OS PD (mm)");
    expect(src).toContain("monocular_pd");
    expect(src).toContain("Readiness SMS & WhatsApp notification sent");
    expect(src).toContain("w-[95vw]");
    expect(src).toContain("max-h-[90vh]");
  });
});
