import { useMemo, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Search, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { useApp, type CartLine } from "@/lib/app-store";
import { fmtBDT } from "@/lib/pos-data";
import type { IndustryPackId } from "@/lib/industry-registry";
import { PosShell, ProductGrid, PosProductCard } from "./PosShell";
import { usePosCatalog, catalogToCartExtras, type PosCatalogItem } from "@/hooks/use-pos-catalog";

/** Config for a new industry POS with only catalog search + cart checkout. */
export type MinimalPosConfig = {
  industry: IndustryPackId;
  title: string;
  subtitle?: string;
  receiptNote?: string;
  /** Demo catalog used when backend is off or empty. */
  demoCatalog: PosCatalogItem[];
  /** Optional badges in POS header (feature flags, mode toggles, etc.). */
  headerBadges?: ReactNode;
  /** Extra line detail under each cart item. */
  cartLineExtra?: (line: CartLine) => ReactNode;
  /** Badge text on product card (defaults to industry id). */
  cardBadge?: (item: PosCatalogItem) => string | undefined;
  /** Subtitle under product name on card. */
  cardSubtitle?: (item: PosCatalogItem) => string | undefined;
  /** Footer under price on card. */
  cardFooter?: (item: PosCatalogItem) => ReactNode;
  /** Merge into cart line extras when adding (e.g. industry-specific meta). */
  mapCartExtras?: (item: PosCatalogItem) => Record<string, unknown>;
  /** Block checkout until industry rules pass (return false to show toast yourself). */
  onBeforeComplete?: () => boolean;
  taxRate?: number;
  qtyStep?: number;
};

/**
 * Minimum viable POS: product grid, search, cart, payment, receipt.
 * Wrap industry-specific widgets around this via headerBadges / cartLineExtra.
 */
export function MinimalPos({
  industry,
  title,
  subtitle,
  receiptNote,
  demoCatalog,
  headerBadges,
  cartLineExtra,
  cardBadge,
  cardSubtitle,
  cardFooter,
  mapCartExtras,
  onBeforeComplete,
  taxRate,
  qtyStep,
}: MinimalPosConfig) {
  const app = useApp();
  const [search, setSearch] = useState("");
  const catalog = usePosCatalog(industry, demoCatalog);

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog.items;
    return catalog.items.filter(
      i => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q) || i.barcode?.includes(q),
    );
  }, [catalog.items, search]);

  const addItem = (item: PosCatalogItem) => {
    app.addToCart({
      sku: item.sku,
      name: item.name,
      price: item.price,
      qty: 1,
      industry,
      extras: { ...catalogToCartExtras(item), ...(mapCartExtras?.(item) ?? {}) },
    });
    toast.success(item.name);
  };

  return (
    <PosShell
      industry={industry}
      title={title}
      subtitle={subtitle}
      receiptNote={receiptNote}
      headerBadges={headerBadges}
      cartLineExtra={cartLineExtra}
      onBeforeComplete={onBeforeComplete}
      taxRate={taxRate}
      qtyStep={qtyStep}
      catalog={
        <>
          <div className="border-b border-border px-4 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search SKU, name, or barcode…"
                className="h-11 pl-9"
              />
            </div>
          </div>
          {items.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center py-16 text-center text-sm text-muted-foreground">
              <ShoppingBag className="mb-2 h-8 w-8 opacity-40" />
              No products · add items in Product Master or enable demo catalog
            </div>
          ) : (
            <ProductGrid
              items={items}
              onAdd={item => addItem(item as PosCatalogItem)}
              renderCard={item => {
                const p = item as PosCatalogItem;
                return (
                  <PosProductCard
                    badge={p.isMarkdownActive ? p.markdownBadge || "⚡ 50% Fresh Clearance" : (cardBadge?.(p) ?? industry)}
                    isMarkdown={p.isMarkdownActive}
                    originalPrice={p.originalPrice ? fmtBDT(p.originalPrice) : undefined}
                    title={p.name}
                    subtitle={cardSubtitle?.(p)}
                    price={fmtBDT(p.price)}
                    footer={
                      <>
                        {p.isMarkdownActive && p.originalPrice && (
                          <span className="text-[10px] line-through text-amber-600 dark:text-amber-400 font-semibold">Orig. {fmtBDT(p.originalPrice)}</span>
                        )}
                        {cardFooter?.(p)}
                        {catalog.fromBackend && (
                          <span className="mt-1 block text-[10px] text-muted-foreground">Stock {p.stock}</span>
                        )}
                      </>
                    }
                  />
                );
              }}
            />
          )}
        </>
      }
    />
  );
}

/** Map demo catalog rows from industry-mock shapes into PosCatalogItem[]. */
export function toPosCatalogItems<T extends { sku: string; name: string; price?: number; ratePerKg?: number }>(
  rows: T[],
  mapMeta: (row: T) => { price: number; meta?: Record<string, unknown>; barcode?: string; wholesalePrice?: number },
): PosCatalogItem[] {
  return rows.map(row => ({
    id: row.sku,
    sku: row.sku,
    name: row.name,
    price: mapMeta(row).price,
    wholesalePrice: mapMeta(row).wholesalePrice,
    barcode: mapMeta(row).barcode,
    stock: 0,
    meta: mapMeta(row).meta,
  }));
}
