import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Phase 6B-1 fashion vertical wiring", () => {
  it("fashion variants page uses backend hooks not mock-only save", () => {
    const src = readFileSync(resolve("src/routes/app.fashion.variants.tsx"), "utf8");
    expect(src).toContain("useFashionVariants");
    expect(src).toContain("useCreateProductVariant");
    expect(src).toContain("EntityFormDrawer");
    expect(src).not.toContain('toast.success("');
  });

  it("fashion exchange uses real sales exchange mutation", () => {
    const src = readFileSync(resolve("src/routes/app.fashion.exchange.tsx"), "utf8");
    expect(src).toContain("useSalesExchange");
    expect(src).toContain("useSalesExchanges");
    expect(src).toContain("ConfirmActionDialog");
    expect(src).not.toContain('toast.success("Exchange started")');
  });

  it("fashion alteration uses real API mutations", () => {
    const src = readFileSync(resolve("src/routes/app.fashion.alteration.tsx"), "utf8");
    expect(src).toContain("useFashionAlterations");
    expect(src).toContain("useCreateFashionAlteration");
    expect(src).not.toContain('toast.success("Alteration job created")');
  });

  it("FashionPos uses shared barcode scan in backend mode", () => {
    const src = readFileSync(resolve("src/features/pos/FashionPos.tsx"), "utf8");
    expect(src).toContain("usePosBarcodeScan");
    expect(src).not.toContain('toast.success("Exchange started")');
    expect(src).not.toContain('toast.success("Alteration order');
  });

  it("shared POS barcode hook exists for reuse", () => {
    const src = readFileSync(resolve("src/hooks/use-pos-barcode.ts"), "utf8");
    expect(src).toContain("usePosBarcodeScan");
    expect(src).toContain("barcodeLookupToCatalogItem");
  });

  it("fashion pages removed from action-wiring backlog", () => {
    const backlog = readFileSync(resolve("src/lib/action-wiring-backlog.ts"), "utf8");
    expect(backlog).not.toContain("app.fashion.exchange.tsx");
    expect(backlog).not.toContain("app.fashion.alteration.tsx");
  });
});
