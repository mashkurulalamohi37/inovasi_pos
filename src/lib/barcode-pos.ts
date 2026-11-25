import { api } from "@/lib/api";
import type { PosCatalogItem } from "@/hooks/use-pos-catalog";

export type BarcodeLookupResult = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  industry_pack: string;
  base_price: number;
  wholesale_price: number | null;
  is_active: boolean;
  meta: Record<string, unknown>;
  matched_variant_id?: string | null;
  matched_variant?: {
    id: string;
    variant_code: string;
    size?: string | null;
    color?: string | null;
    style?: string | null;
    barcode?: string | null;
    is_active: boolean;
  } | null;
};

export async function lookupBarcodeFromApi(code: string): Promise<BarcodeLookupResult> {
  return api.get<BarcodeLookupResult>(`/products/barcode/${encodeURIComponent(code.trim())}`);
}

/** Map API barcode lookup to a POS catalog row (merges variant label when present). */
export function barcodeLookupToCatalogItem(
  hit: BarcodeLookupResult,
  stock = 0,
): PosCatalogItem {
  const v = hit.matched_variant;
  const name = v
    ? `${hit.name} · ${[v.size, v.color, v.style].filter(Boolean).join(" · ") || v.variant_code}`
    : hit.name;
  return {
    id: hit.id,
    sku: hit.sku,
    name,
    price: hit.base_price,
    wholesalePrice: hit.wholesale_price ?? undefined,
    barcode: v?.barcode ?? hit.barcode ?? undefined,
    stock,
    meta: {
      ...hit.meta,
      ...(v ? { variantId: v.id, size: v.size, color: v.color, style: v.style } : {}),
    },
  };
}

/** Demo/offline: resolve from local catalog only. */
export function lookupBarcodeLocal(code: string, items: PosCatalogItem[]): PosCatalogItem | undefined {
  const q = code.trim();
  return items.find((i) => i.barcode === q || i.sku === q);
}
