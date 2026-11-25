import { describe, expect, it } from "vitest";
import { catalogToCartExtras, type PosCatalogItem } from "@/hooks/use-pos-catalog";
import { resolveImageUrl } from "@/lib/utils";

describe("catalogToCartExtras", () => {
  it("maps catalog item id to productId", () => {
    const item: PosCatalogItem = {
      id: "prod-42",
      sku: "SKU-42",
      name: "Widget",
      price: 9.99,
      stock: 5,
    };

    expect(catalogToCartExtras(item)).toEqual({ productId: "prod-42" });
  });

  it("merges meta fields into cart extras", () => {
    const item: PosCatalogItem = {
      id: "prod-99",
      sku: "SKU-99",
      name: "Gadget",
      price: 25,
      stock: 1,
      meta: { batch: "B-2024", requiresRx: true },
    };

    expect(catalogToCartExtras(item)).toEqual({
      productId: "prod-99",
      batch: "B-2024",
      requiresRx: true,
    });
  });

  it("supports catalog item with imageUrl property", () => {
    const item: PosCatalogItem = {
      id: "prod-cos-1",
      sku: "COS-001",
      name: "Rice Water Cleanser",
      price: 325,
      stock: 10,
      imageUrl: "/uploads/products/prod_rice_water.jpg",
      meta: {
        image: "/uploads/products/prod_rice_water.jpg",
      },
    };

    expect(item.imageUrl).toBe("/uploads/products/prod_rice_water.jpg");
    const resolved = resolveImageUrl(item.imageUrl);
    expect(resolved).toContain("/uploads/products/prod_rice_water.jpg");
  });
});

describe("resolveImageUrl", () => {
  it("resolves uploaded product paths to backend media url", () => {
    const uploadPath = "/uploads/products/prod_17300000_photo.jpg";
    const resolved = resolveImageUrl(uploadPath);
    expect(resolved).toContain("/uploads/products/prod_17300000_photo.jpg");
    expect(resolved.startsWith("http://") || resolved.startsWith("https://") || resolved.startsWith("/")).toBe(true);
  });

  it("preserves external http/https image URLs", () => {
    const external = "https://example.com/photo.png";
    expect(resolveImageUrl(external)).toBe(external);
  });

  it("preserves bundled static /products/ and /food-images/ assets", () => {
    expect(resolveImageUrl("/products/lipstick.jpg")).toBe("/products/lipstick.jpg");
    expect(resolveImageUrl("products/lipstick.jpg")).toBe("/products/lipstick.jpg");
    expect(resolveImageUrl("/food-images/burger.jpg")).toBe("/food-images/burger.jpg");
  });

  it("returns empty string for null, undefined, or empty path", () => {
    expect(resolveImageUrl(null)).toBe("");
    expect(resolveImageUrl(undefined)).toBe("");
    expect(resolveImageUrl("")).toBe("");
    expect(resolveImageUrl("   ")).toBe("");
    expect(resolveImageUrl("undefined")).toBe("");
  });
});
