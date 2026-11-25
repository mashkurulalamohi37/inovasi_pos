import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEFAULT_BARCODE_DESIGNER_CONFIG,
  loadBarcodeDesignerConfig,
  saveBarcodeDesignerConfig,
  resetBarcodeDesignerConfig,
  BARCODE_DESIGNER_STORAGE_KEY,
} from "@/components/products/BarcodeLabelPrintDialog";

describe("Phase 6B-0 barcode polish", () => {
  it("Grocery POS uses backend barcode lookup in api mode", () => {
    const src = readFileSync(resolve("src/features/pos/GroceryPos.tsx"), "utf8");
    expect(src).toContain("usePosBarcodeScan");
    const hook = readFileSync(resolve("src/hooks/use-pos-barcode.ts"), "utf8");
    expect(hook).toContain("useBarcodeLookup");
    expect(hook).toContain("lookupBarcodeLocal");
  });

  it("product page has barcode and variant panels and displays cost price column", () => {
    const src = readFileSync(resolve("src/routes/app.products.tsx"), "utf8");
    expect(src).toContain("ProductBarcodePanel");
    expect(src).toContain("ProductVariantPanel");
    expect(src).toContain('TabsTrigger value="barcodes"');
    expect(src).toContain("Cost Price");
    expect(src).toContain("r.cost_price");
  });

  it("barcode panel uses real mutations", () => {
    const src = readFileSync(resolve("src/features/products/ProductCatalogPanels.tsx"), "utf8");
    expect(src).toContain("useCreateProductBarcode");
    expect(src).toContain("useUpdateProductBarcode");
    expect(src).toContain("useUpdateProductVariant");
    expect(src).not.toContain('toast.success("Barcode added")');
  });

  it("barcode-pos helper maps api lookup to catalog item", () => {
    const src = readFileSync(resolve("src/lib/barcode-pos.ts"), "utf8");
    expect(src).toContain("lookupBarcodeFromApi");
    expect(src).toContain("barcodeLookupToCatalogItem");
  });

  describe("barcode label designer configuration persistence", () => {
    beforeEach(() => {
      localStorage.removeItem(BARCODE_DESIGNER_STORAGE_KEY);
    });

    it("returns default 40x25 config when no saved preferences exist", () => {
      const cfg = loadBarcodeDesignerConfig();
      expect(cfg.preset).toBe("40x25");
      expect(cfg.columns).toBe(1);
      expect(cfg.currencySymbol).toBe("TK");
    });

    it("saves and loads custom choices including customStoreName", () => {
      saveBarcodeDesignerConfig({
        preset: "50x30",
        columns: 2,
        currencySymbol: "BDT",
        showStoreName: true,
        customStoreName: "KONOK FASHION STORE",
        priceSize: 10,
      });

      const loaded = loadBarcodeDesignerConfig();
      expect(loaded.preset).toBe("50x30");
      expect(loaded.columns).toBe(2);
      expect(loaded.currencySymbol).toBe("BDT");
      expect(loaded.showStoreName).toBe(true);
      expect(loaded.customStoreName).toBe("KONOK FASHION STORE");
      expect(loaded.priceSize).toBe(10);
    });

    it("sanitizes obsolete hardcoded Banani Flagship defaults", () => {
      // Simulate legacy stale storage
      localStorage.setItem(
        BARCODE_DESIGNER_STORAGE_KEY,
        JSON.stringify({ customStoreName: "Banani Flagship", preset: "40x25" })
      );
      const loaded = loadBarcodeDesignerConfig();
      expect(loaded.customStoreName).toBe("");
    });

    it("resets preferences to defaults including customStoreName", () => {
      saveBarcodeDesignerConfig({ preset: "custom", customWidth: 60, customStoreName: "MY STORE" });
      resetBarcodeDesignerConfig();
      expect(loadBarcodeDesignerConfig().preset).toBe(DEFAULT_BARCODE_DESIGNER_CONFIG.preset);
      expect(loadBarcodeDesignerConfig().customStoreName).toBe(DEFAULT_BARCODE_DESIGNER_CONFIG.customStoreName);
    });

    it("BarcodeLabelPrintDialog contains Save Choices button, editable mark name, and auto-save indicators", () => {
      const dialogSrc = readFileSync(resolve("src/components/products/BarcodeLabelPrintDialog.tsx"), "utf8");
      expect(dialogSrc).toContain("Save Choices");
      expect(dialogSrc).toContain("saveBarcodeDesignerConfig");
      expect(dialogSrc).toContain("loadBarcodeDesignerConfig");
      expect(dialogSrc).toContain("Mark Name (Store Header)");
      expect(dialogSrc).toContain("customStoreName");
    });

    it("BarcodeLabelPrintDialog supports online cloud sync persistence", () => {
      const dialogSrc = readFileSync(resolve("src/components/products/BarcodeLabelPrintDialog.tsx"), "utf8");
      expect(dialogSrc).toContain("BARCODE_DESIGNER_SCREEN_KEY");
      expect(dialogSrc).toContain("useScreenConfig");
      expect(dialogSrc).toContain("useSaveScreenConfig");
      expect(dialogSrc).toContain("Cloud Synced");

      const hooksSrc = readFileSync(resolve("src/hooks/use-api-config.ts"), "utf8");
      expect(hooksSrc).toContain("export function useScreenConfig");
      expect(hooksSrc).toContain("export function useSaveScreenConfig");

      const queryKeysSrc = readFileSync(resolve("src/lib/queryKeys.ts"), "utf8");
      expect(queryKeysSrc).toContain("screenConfig:");
    });
  });
});

