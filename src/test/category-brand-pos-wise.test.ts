import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Category and Brand per POS vertical", () => {
  it("useCategories and useBrands in use-api-config support industry filtering and master typing", () => {
    const src = readFileSync(resolve("src/hooks/use-api-config.ts"), "utf8");
    expect(src).toContain("industry_pack?: string | null");
    expect(src).toContain("industry_packs?: string[]");
    expect(src).toContain("useCategories(params?: string | { q?: string; industry?: string }");
    expect(src).toContain("useBrands(params?: string | { q?: string; industry?: string }");
    expect(src).toContain('sp.set("industry", industry)');
  });

  it("Product Master scopes categories and brands per active POS vertical with full toggle affordance", () => {
    const src = readFileSync(resolve("src/routes/app.products.tsx"), "utf8");
    expect(src).toContain("useCategories({ industry: activeProductPack }, useApi)");
    expect(src).toContain("useBrands({ industry: activeProductPack }, useApi)");
    expect(src).toContain("showAllMasters");
    expect(src).toContain("QuickAddMaster");
    expect(src).toContain("industryPack={form.industry_pack}");
    expect(src).toContain("availableBrands");
    expect(src).toContain("orderedCategories");
  });

  it("Master Data management route supports filtering categories and brands per POS vertical", () => {
    const src = readFileSync(resolve("src/routes/app.categories.tsx"), "utf8");
    expect(src).toContain("industryFilter");
    expect(src).toContain("INDUSTRY_PACKS");
    expect(src).toContain("CategoryPanel industry={selectedIndustry}");
    expect(src).toContain("BrandPanel industry={selectedIndustry}");
    expect(src).toContain("industry_pack: industry || undefined");
  });

  it("Backend models and services support industry_pack on ProductCategory and BrandMaster", () => {
    const modelSrc = readFileSync(resolve("backend/app/models/product.py"), "utf8");
    expect(modelSrc).toContain("industry_pack: Optional[str]");

    const serviceSrc = readFileSync(resolve("backend/app/services/master_data_service.py"), "utf8");
    expect(serviceSrc).toContain("DEFAULT_INDUSTRY_CATEGORIES");
    expect(serviceSrc).toContain("DEFAULT_INDUSTRY_BRANDS");
    expect(serviceSrc).toContain("_ensure_industry_master_data");
    expect(serviceSrc).toContain("_category_industry_packs_map");
    expect(serviceSrc).toContain("_brand_industry_packs_map");
  });
});

