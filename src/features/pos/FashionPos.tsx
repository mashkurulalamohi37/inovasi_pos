import { loadCustomerDiscountPolicy } from "@/lib/customer-discount-policy";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, resolveImageUrl } from "@/lib/utils";
import { Barcode, DoorOpen, Lock, Plus, Repeat, Star, Tag, Baby, Grid, ShoppingBag, User, Users, LayoutGrid, TableProperties, Search} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useApp } from "@/lib/app-store";
import { fashionStyles, fmtBDT } from "@/lib/pos-data";
import { trialRoom, offers } from "@/lib/mock-extra";
import { shouldUseBackend } from "@/lib/demo-mode";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PosShell } from "./PosShell";
import { usePosCatalog, catalogToCartExtras, type PosCatalogItem } from "@/hooks/use-pos-catalog";
import { useFashionVariants } from "@/hooks/use-industry-data";
import { useFashionOffers, useFashionOfferPreview, useCustomerLoyalty, useLoyaltyRedeemPreview, useCategories } from "@/hooks/use-api-config";
import { usePosBarcodeScan } from "@/hooks/use-pos-barcode";
import type { CustomerSelection } from "@/features/sales/CustomerPicker";

function getCategoryColor(category: string): string {
  const cat = category.toLowerCase();
  if (cat.includes("pants") || cat.includes("trousers") || cat.includes("bottoms")) {
    return "#EF4444"; // Red
  }
  if (cat.includes("shirt") || cat.includes("polo") || cat.includes("tee") || cat.includes("tops")) {
    if (cat.includes("women") || cat.includes("female") || cat.includes("lady") || cat.includes("ethnic")) {
      return "#000000"; // Black
    }
    return "#F97316"; // Orange
  }
  if (cat.includes("women") || cat.includes("female") || cat.includes("kurta") || cat.includes("blouse")) {
    return "#000000"; // Black
  }
  return "#71717A"; // Grey
}

function VisualProductCard({
  style,
  onClick,
}: {
  style: FashionStyleCard;
  onClick: () => void;
}) {
  const accentColor = getCategoryColor(style.category);
  const isOut = style.totalStock <= 0;
  
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-w-0 flex-col rounded-xl border border-border bg-card shadow-sm transition-all duration-200 hover:border-primary/40 hover:shadow-md overflow-hidden relative group text-left h-full",
        isOut && "opacity-75 bg-muted/10 border-dashed",
      )}
    >
      {/* Top Accent Line */}
      <div 
        className="h-1 w-full shrink-0" 
        style={{ backgroundColor: isOut ? "#94a3b8" : accentColor }}
      />
      
      {/* Image Area */}
      <div className="flex-1 w-full bg-white p-4 flex items-center justify-center min-h-[140px] max-h-[160px] overflow-hidden relative">
        {/* Availability Badge */}
        <div className="absolute top-2 right-2 z-10">
          {isOut ? (
            <span className="rounded bg-destructive/90 text-destructive-foreground px-2 py-0.5 text-[9px] font-bold tracking-wide uppercase shadow-sm">
              Out of stock
            </span>
          ) : (
            <span className="rounded bg-emerald-600/90 text-white px-2 py-0.5 text-[9px] font-semibold tracking-wide shadow-sm">
              {style.totalStock} in stock
            </span>
          )}
        </div>

        {style.image ? (
          <img
            src={resolveImageUrl(style.image)}
            alt={style.name}
            className={cn(
              "max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105",
              isOut && "grayscale-[40%]",
            )}
            onError={(e) => {
              // Fallback to a styled visual if the image link fails
              e.currentTarget.style.display = "none";
              const parent = e.currentTarget.parentElement;
              if (parent) {
                const fallback = parent.querySelector(".image-fallback");
                if (fallback) fallback.classList.remove("hidden");
              }
            }}
          />
        ) : null}
        <div className={cn(
          "image-fallback absolute inset-0 flex items-center justify-center bg-muted/20 font-mono text-[9px] text-muted-foreground p-2 text-center uppercase tracking-wide font-medium",
          style.image ? "hidden" : "",
        )}>
          {style.category}
        </div>
      </div>

      {/* Footer Info Area */}
      <div className="border-t border-border bg-muted/10 p-2 shrink-0 w-full">
        <div className="line-clamp-1 text-xs font-semibold text-foreground leading-snug">
          {style.name}
        </div>
        <div className="mt-1 flex items-center justify-between gap-1">
          <span className="text-[10px] text-muted-foreground font-mono">{style.styleCode}</span>
          <span className="text-xs font-bold text-primary font-display">{fmtBDT(style.price)}</span>
        </div>
      </div>
    </button>
  );
}

type FashionPosItem = PosCatalogItem & {
  styleName: string;
  styleCode: string;
  season: string;
  category: string;
  size: string;
  color: string;
  barcode: string;
  variantId?: string;
  productId: string;
  image?: string;
};

type FashionStyleCard = {
  key: string;
  productId: string;
  name: string;
  styleCode: string;
  category: string;
  season: string;
  price: number;
  sizes: string[];
  colors: string[];
  variants: FashionPosItem[];
  totalStock: number;
  image?: string;
};

const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "Free"];

function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a.toUpperCase());
    const ib = SIZE_ORDER.indexOf(b.toUpperCase());
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

/** Map fashion color names → swatch hex for POS chips. */
export function fashionColorHex(color: string): string {
  const n = color.trim().toLowerCase();
  const exact: Record<string, string> = {
    white: "#f4f4f5",
    black: "#18181b",
    charcoal: "#3f3f46",
    grey: "#a1a1aa",
    gray: "#a1a1aa",
    silver: "#d4d4d8",
    navy: "#1e3a5f",
    indigo: "#4338ca",
    blue: "#2563eb",
    sky: "#38bdf8",
    teal: "#0d9488",
    green: "#16a34a",
    olive: "#6b8e23",
    red: "#dc2626",
    madder: "#b91c1c",
    maroon: "#7f1d1d",
    pink: "#ec4899",
    rose: "#f43f5e",
    purple: "#7c3aed",
    violet: "#8b5cf6",
    yellow: "#eab308",
    gold: "#ca8a04",
    orange: "#ea580c",
    brown: "#92400e",
    beige: "#d6c6a8",
    cream: "#f5f0e6",
    khaki: "#c3b091",
  };
  if (exact[n]) return exact[n];
  for (const [key, hex] of Object.entries(exact)) {
    if (n.includes(key)) return hex;
  }
  // Stable hash fallback so unknown colors still get a distinct swatch
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return `hsl(${hue} 42% 48%)`;
}

function findVariant(
  variants: FashionPosItem[],
  size?: string,
  color?: string,
): FashionPosItem | undefined {
  if (!variants || variants.length === 0) return undefined;
  if (variants.length === 1) return variants[0];

  if (size && color) {
    const exact = variants.find((v) => v.size === size && v.color === color);
    if (exact) return exact;
  }
  if (size) {
    const bySize = variants.find((v) => v.size === size && (!color || v.color === color || !v.color));
    if (bySize) return bySize;
    const anySize = variants.find((v) => v.size === size);
    if (anySize) return anySize;
  }
  if (color) {
    const byColor = variants.find((v) => v.color === color && (!size || v.size === size || !v.size));
    if (byColor) return byColor;
    const anyColor = variants.find((v) => v.color === color);
    if (anyColor) return anyColor;
  }
  return variants[0];
}

function FashionProductCard({
  style,
  selection,
  onSelectSize,
  onSelectColor,
  onAdd,
  showStock,
}: {
  style: FashionStyleCard;
  selection: { size: string; color: string };
  onSelectSize: (size: string) => void;
  onSelectColor: (color: string) => void;
  onAdd: () => void;
  showStock: boolean;
}) {
  const selected = findVariant(style.variants, selection.size, selection.color);
  const stock = selected?.stock ?? style.totalStock ?? 0;
  const out = !selected ? (style.totalStock <= 0) : (stock <= 0);

  const sizeHasColor = (size: string) =>
    !selection.color || style.variants.some((v) => v.size === size && (!v.color || v.color === selection.color) && v.stock > 0);
  const colorHasSize = (color: string) =>
    !selection.size || style.variants.some((v) => v.color === color && (!v.size || v.size === selection.size) && v.stock > 0);

  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-border bg-card p-2.5 shadow-sm transition-all duration-200 hover:border-primary/30 hover:shadow-md">
      <div
        className="mb-1.5 flex h-10 items-center justify-between rounded-lg px-2.5 py-1"
        style={{
          background: selection.color
            ? `linear-gradient(145deg, ${fashionColorHex(selection.color)}33, hsl(var(--muted)) 70%)`
            : undefined,
        }}
      >
        <Badge variant="secondary" className="text-[10px] font-normal px-2 py-0.5">
          {style.category || "Fashion"}
        </Badge>
        {showStock && (
          <Badge
            variant="outline"
            className={cn(
              "bg-background/90 text-[10px] px-2 py-0.5",
              out ? "border-destructive/40 text-destructive" : "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
            )}
          >
            {selected ? `${stock} available` : style.totalStock > 0 ? `${style.totalStock} in stock` : "Out of stock"}
          </Badge>
        )}
      </div>

      <div className="mb-0.5 line-clamp-1 text-xs font-semibold leading-snug">{style.name}</div>
      <div className="mb-2 font-mono text-[9px] text-muted-foreground">{style.styleCode}</div>

      {style.sizes.length > 0 && (
        <>
          <div className="mb-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Size</div>
          <div className="mb-2 flex flex-wrap gap-1">
            {style.sizes.map((size) => {
              const active = selection.size === size;
              const hasAnyStock = style.variants.some((v) => v.size === size && v.stock > 0);
              const available = sizeHasColor(size) && hasAnyStock;
              return (
                <button
                  key={size}
                  type="button"
                  disabled={!style.variants.some((v) => v.size === size)}
                  onClick={() => onSelectSize(size)}
                  className={cn(
                    "grid h-[26px] min-w-[26px] place-items-center rounded border px-1 text-[10px] font-medium transition-all relative overflow-hidden cursor-pointer",
                    active
                      ? "border-primary bg-primary text-primary-foreground font-semibold"
                      : !hasAnyStock
                      ? "border-dashed border-destructive/20 bg-destructive/5 text-muted-foreground line-through opacity-50 cursor-not-allowed"
                      : "border-border bg-background hover:border-primary hover:bg-primary/5",
                    !available && hasAnyStock && !active && "opacity-60 border-dashed",
                  )}
                >
                  {size}
                  {!hasAnyStock && (
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-destructive/10 to-transparent pointer-events-none" />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {style.colors.length > 0 && (
        <>
          <div className="mb-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Color</div>
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {style.colors.map((color) => {
              const active = selection.color === color;
              const hex = fashionColorHex(color);
              const hasAnyStock = style.variants.some((v) => v.color === color && v.stock > 0);
              const available = colorHasSize(color) && hasAnyStock;
              return (
                <button
                  key={color}
                  type="button"
                  title={`${color}${!hasAnyStock ? " (Out of stock)" : ""}`}
                  onClick={() => onSelectColor(color)}
                  className={cn(
                    "relative h-[22px] w-[22px] rounded-full border transition-all cursor-pointer hover:scale-110 hover:ring-1 hover:ring-primary/40",
                    active ? "scale-110 border-foreground ring-1 ring-primary/30" : "border-background shadow-sm",
                    !hasAnyStock ? "opacity-30 border-dashed border-destructive cursor-not-allowed" : !available && !active ? "opacity-60 border-dashed border-muted-foreground" : "",
                  )}
                  style={{ backgroundColor: hex }}
                >
                  <span className="sr-only">{color}</span>
                  {!hasAnyStock && (
                    <span className="absolute inset-0 flex items-center justify-center text-[11px] text-destructive/80 font-bold leading-none">×</span>
                  )}
                </button>
              );
            })}
            <span className="text-[9px] text-muted-foreground">{selection.color}</span>
          </div>
        </>
      )}

      <div className="mt-auto flex items-end justify-between gap-2">
        <div className="font-display text-base font-semibold tabular">{fmtBDT(selected?.price ?? style.price)}</div>
        <Button size="sm" className="h-8 gap-1 text-xs" disabled={out} onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" />
          Add to cart
        </Button>
      </div>
    </div>
  );
}

export function FashionPos() {
  const app = useApp();
  const useApi = shouldUseBackend();
  const categoriesQuery = useCategories(undefined, useApi);
  const [tab, setTab] = useState("All");
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectionByStyle, setSelectionByStyle] = useState<Record<string, { size: string; color: string }>>({});
  const [trialRooms, setTrialRooms] = useState(trialRoom);
  const [layoutMode, setLayoutMode] = useState<"matrix" | "grid">("grid");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [variantModalOpen, setVariantModalOpen] = useState(false);
  const [modalSelectedStyle, setModalSelectedStyle] = useState<FashionStyleCard | null>(null);
  const [modalSize, setModalSize] = useState("");
  const [modalColor, setModalColor] = useState("");
  const [roomActionOpen, setRoomActionOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<typeof trialRoom[0] | null>(null);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkStyleId, setBulkStyleId] = useState("");
  const [bulkQuantities, setBulkQuantities] = useState<Record<string, string>>({});

  const offersQuery = useFashionOffers();
  const offerPreview = useFashionOfferPreview();
  const demoOffers = offers.filter((o) => o.active);
  const activeOffers = useApi
    ? (offersQuery.data ?? []).map((o) => ({
        id: o.id,
        name: o.name,
        type: o.offer_type,
        value: o.offer_type === "bygo" ? o.get_discount_pct ?? 0 : o.discount_pct,
        scope: o.department ?? o.season ?? "All",
        active: o.is_active,
        stackable: o.stackable,
        buyQty: o.buy_qty,
        getQty: o.get_qty,
      }))
    : demoOffers.map((o) => ({ ...o, stackable: false, buyQty: null, getQty: null }));

  const [selectedOfferIds, setSelectedOfferIds] = useState<string[]>([]);
  const [customPct, setCustomPct] = useState("");
  const [customManagerAuthOpen, setCustomManagerAuthOpen] = useState(false);
  const [customManagerPasscode, setCustomManagerPasscode] = useState("");
  const [pendingCustomPct, setPendingCustomPct] = useState<number | null>(null);

  const [activeCustomer, setActiveCustomer] = useState<CustomerSelection | undefined>();
  const [loyaltyOpen, setLoyaltyOpen] = useState(false);
  const [redeemPoints, setRedeemPoints] = useState("");
  const loyaltyQuery = useCustomerLoyalty(activeCustomer?.id);
  const loyaltyRedeemPreview = useLoyaltyRedeemPreview();

  const demoItems = useMemo((): FashionPosItem[] => fashionStyles.flatMap((s) =>
    s.variants.map((v) => ({
      id: v.sku,
      sku: v.sku,
      name: s.name,
      price: v.price,
      stock: Object.values(v.stock).reduce((a, b) => a + b, 0),
      meta: { size: v.size, color: v.color, barcode: v.barcode, productId: s.id },
      styleName: s.name,
      styleCode: s.styleCode,
      season: s.season,
      category: s.category,
      size: v.size,
      color: v.color,
      barcode: v.barcode,
      variantId: v.sku,
      productId: s.id,
      image: s.image,
    })),
  ), []);

  const catalog = usePosCatalog("fashion", demoItems);
  const variantsQuery = useFashionVariants();

  const items = useMemo((): FashionPosItem[] => {
    if (useApi) {
      if (!variantsQuery.data?.length && !catalog.items?.length) return [];
      const productMap = new Map(catalog.items.map((p) => [p.id, p]));
      const categoryMap = new Map((categoriesQuery.data ?? []).map((c) => [c.id, c.name]));
      const variantItems: FashionPosItem[] = (variantsQuery.data ?? [])
        .filter((v) => v.is_active !== false)
        .map((v) => {
          const p = productMap.get(v.product_id);
          const meta = p?.meta ?? {};
          const catName = p?.meta?.category_id ? categoryMap.get(String(p.meta.category_id)) : "";
          return {
            id: v.id,
            sku: v.sku ?? v.variant_code,
            name: p?.name ?? v.product_name ?? v.sku,
            price: p?.price ?? 0,
            stock: typeof v.stock_qty === "number" ? v.stock_qty : (p?.stock ?? 0),
            meta: {
              ...meta,
              size: v.size || "",
              color: v.color || "",
              style: v.style,
              barcode: v.barcode ?? "",
              productId: v.product_id,
              variantId: v.id,
            },
            styleName: p?.name ?? v.product_name ?? v.sku,
            styleCode: p?.sku ?? v.product_sku ?? "",
            season: String(meta.season ?? ""),
            category: String(catName || meta.category || meta.gender || meta.department || ""),
            size: v.size || "",
            color: v.color || "",
            barcode: v.barcode ?? "",
            variantId: v.id,
            productId: v.product_id,
            image: typeof meta.image === "string" ? resolveImageUrl(meta.image) : undefined,
          };
        });

      const variantProductIds = new Set((variantsQuery.data ?? []).map((v) => v.product_id));
      const standaloneItems: FashionPosItem[] = catalog.items
        .filter((p) => !variantProductIds.has(p.id))
        .map((p) => {
          const meta = p.meta ?? {};
          const catName = meta.category_id ? categoryMap.get(String(meta.category_id)) : "";
          return {
            id: p.id,
            sku: p.sku,
            name: p.name,
            price: p.price ?? 0,
            stock: p.stock ?? 0,
            meta: {
              ...meta,
              productId: p.id,
              barcode: p.barcode ?? "",
            },
            styleName: p.name,
            styleCode: p.sku,
            season: String(meta.season ?? ""),
            category: String(catName || meta.category || meta.gender || meta.department || ""),
            size: (meta.size as string) || "",
            color: (meta.color as string) || "",
            barcode: p.barcode ?? "",
            variantId: undefined,
            productId: p.id,
            image: typeof meta.image === "string" ? resolveImageUrl(meta.image) : undefined,
          };
        });

      return [...variantItems, ...standaloneItems];
    }
    return catalog.items as FashionPosItem[];
  }, [useApi, catalog.items, variantsQuery.data, categoriesQuery.data]);

  const styles = useMemo((): FashionStyleCard[] => {
    const map = new Map<string, FashionPosItem[]>();
    for (const item of items) {
      const key = item.productId || item.styleCode || item.styleName;
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return Array.from(map.entries()).map(([key, variants]) => {
      const first = variants[0];
      const sizes = sortSizes([...new Set(variants.map((v) => v.size).filter(Boolean))]);
      const colors = [...new Set(variants.map((v) => v.color).filter(Boolean))];
      return {
        key,
        productId: first.productId,
        name: first.styleName,
        styleCode: first.styleCode,
        category: first.category,
        season: first.season,
        price: Math.min(...variants.map((v) => v.price)),
        sizes,
        colors,
        variants,
        totalStock: variants.reduce((s, v) => s + (v.stock || 0), 0),
        image: first.image,
      };
    });
  }, [items]);

  const getSelection = (style: FashionStyleCard) => {
    const existing = selectionByStyle[style.key];
    if (existing) return existing;
    // Prefer first in-stock size×color
    const inStock = style.variants.find((v) => v.stock > 0) ?? style.variants[0];
    return { size: inStock?.size ?? style.sizes[0] ?? "", color: inStock?.color ?? style.colors[0] ?? "" };
  };

  const setSelection = (styleKey: string, patch: Partial<{ size: string; color: string }>, style: FashionStyleCard) => {
    const cur = getSelection(style);
    const next = { ...cur, ...patch };
    // If size×color pair missing, auto-pick a valid partner
    if (!findVariant(style.variants, next.size, next.color)) {
      if (patch.size) {
        const match = style.variants.find((v) => v.size === patch.size && v.stock > 0)
          ?? style.variants.find((v) => v.size === patch.size);
        if (match) next.color = match.color;
      } else if (patch.color) {
        const match = style.variants.find((v) => v.color === patch.color && v.stock > 0)
          ?? style.variants.find((v) => v.color === patch.color);
        if (match) next.size = match.size;
      }
    }
    setSelectionByStyle((prev) => ({ ...prev, [styleKey]: next }));
  };

  const addVariant = (item: FashionPosItem) => {
    if (useApi && !item.variantId && !item.productId) {
      toast.error("Select an item to add");
      return;
    }
    if (item.stock === 0) {
      toast.error("Out of stock");
      return;
    }
    app.addToCart({
      sku: item.sku,
      name: item.styleName,
      meta: [item.styleCode, item.size, item.color].filter(Boolean).join(" · "),
      price: item.price,
      qty: 1,
      industry: "fashion",
      extras: {
        ...catalogToCartExtras(item),
        productId: item.productId || (item.meta?.productId as string) || (item.meta?.product_id as string) || "",
        variant_id: item.variantId,
        size: item.size || "",
        color: item.color || "",
        style: item.styleCode,
        season: item.season,
        barcode: item.barcode,
        ...(app.appliedCampaign?.name ? { campaignName: app.appliedCampaign.name } : {}),
      },
    });
    const label = [item.size, item.color].filter(Boolean).join(" / ");
    toast.success(label ? `Added · ${label}` : `Added ${item.styleName}`);
  };

  const addFromStyle = (style: FashionStyleCard) => {
    const sel = getSelection(style);
    const variant = findVariant(style.variants, sel.size, sel.color);
    if (!variant) {
      toast.error("That size × color is not available");
      return;
    }
    addVariant(variant);
  };

  const openVariantModal = (style: FashionStyleCard) => {
    setModalSelectedStyle(style);
    const firstInStock = style.variants.find((v) => v.stock > 0) ?? style.variants[0];
    setModalSize(firstInStock?.size ?? style.sizes[0] ?? "");
    setModalColor(firstInStock?.color ?? style.colors[0] ?? "");
    setVariantModalOpen(true);
  };

  const handleModalAdd = () => {
    if (!modalSelectedStyle) return;
    const variant = findVariant(modalSelectedStyle.variants, modalSize, modalColor);
    if (!variant) {
      toast.error("That size × color is not available");
      return;
    }
    addVariant(variant);
    setVariantModalOpen(false);
  };

  const addFromCatalogItem = (item: PosCatalogItem, qty: number) => {
    const meta = item.meta ?? {};
    const variantId = String(meta.variantId ?? meta.variant_id ?? "");
    if (useApi && !variantId) {
      toast.error("Fashion POS requires a size × color variant — wait for variants to load");
      return;
    }
    const fashionItem: FashionPosItem = {
      ...item,
      styleName: String(meta.styleName ?? item.name.split(" · ")[0] ?? item.name),
      styleCode: String(meta.style ?? item.sku),
      season: String(meta.season ?? ""),
      category: String(meta.category ?? meta.gender ?? meta.department ?? ""),
      size: String(meta.size ?? ""),
      color: String(meta.color ?? ""),
      barcode: item.barcode ?? String(meta.barcode ?? ""),
      variantId,
      productId: String(meta.productId ?? meta.product_id ?? ""),
    };
    // Prefer matching live variant row (stock + ids)
    const live = items.find((i) => i.variantId === variantId || i.sku === item.sku || i.barcode === item.barcode);
    const target = live ?? fashionItem;
    if (qty !== 1) {
      for (let i = 0; i < qty; i++) addVariant(target);
      return;
    }
    addVariant(target);
  };

  const { barcode, setBarcode, handleScan, isPending } = usePosBarcodeScan({
    fromBackend: catalog.fromBackend,
    catalogItems: items.length ? items : catalog.items,
    onAdd: addFromCatalogItem,
  });

  const handleFashionScan = async () => {
    const code = (barcode || search).trim();
    if (!code) return;
    setBarcode(code);
    await handleScan();
    setBarcode("");
    setSearch("");
  };

  const depts = ["All", "Men", "Women", "Unisex", "Kids", "Accessories"];
  const getDeptIcon = (d: string) => {
    switch (d) {
      case "All": return <Grid className="h-3.5 w-3.5 shrink-0" />;
      case "Men": return <User className="h-3.5 w-3.5 shrink-0" />;
      case "Women": return <User className="h-3.5 w-3.5 shrink-0 text-pink-500/90 dark:text-pink-400" />;
      case "Unisex": return <Users className="h-3.5 w-3.5 shrink-0" />;
      case "Kids": return <Baby className="h-3.5 w-3.5 shrink-0" />;
      case "Accessories": return <ShoppingBag className="h-3.5 w-3.5 shrink-0" />;
      default: return null;
    }
  };
  const q = search.trim().toLowerCase();
  const filtered = styles.filter((s) => {
    const firstVar = s.variants[0];
    const itemMeta = firstVar?.meta ?? {};
    const gender = String(itemMeta.gender || "").toLowerCase();
    const dept = String(itemMeta.department || "").toLowerCase();
    const cat = `${s.category} ${gender} ${dept}`.toLowerCase();
    if (tab === "All") {
      // keep
    } else if (tab === "Men") {
      const isMen = /(^|[·\s/])(men|male|gents|man|gent)($|[·\s/])/.test(cat);
      const isWomen = cat.includes("women") || cat.includes("female") || cat.includes("ladies");
      if (!isMen || isWomen) return false;
    } else if (tab === "Women") {
      const isWomen = /(^|[·\s/])(women|female|ladies|woman|lady)($|[·\s/])/.test(cat);
      if (!isWomen) return false;
    } else if (tab === "Unisex") {
      const isUnisex = cat.includes("unisex") || cat.includes("genderneutral") || cat.includes("unisexual");
      if (!isUnisex) return false;
    } else if (!cat.includes(tab.toLowerCase())) {
      return false;
    }
    if (inStockOnly && s.totalStock <= 0) {
      return false;
    }
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q)
      || s.styleCode.toLowerCase().includes(q)
      || s.variants.some((v) => v.barcode.includes(q) || v.sku.toLowerCase().includes(q))
    );
  });

  const applyCustomDiscount = (pct: number) => {
    app.setAppliedCampaign({ id: "custom", name: `Custom discount (${pct}%)`, discountPct: pct });
    toast.success(`Custom discount applied: ${pct}% off`);
    setCampaignOpen(false);
    setCustomPct("");
    setSelectedOfferIds([]);
  };

  const handleApplyCustom = () => {
    const policy = loadCustomerDiscountPolicy();
    const maxWithoutPin = policy.allowCashierOverride
      ? (typeof policy.maxDiscountWithoutPin === "number" ? policy.maxDiscountWithoutPin : 20)
      : 0;

    const pct = Math.min(100, Math.max(0, Number(customPct) || 0));
    if (pct <= 0) {
      toast.error("Enter a discount percentage greater than 0");
      return;
    }
    if (pct > maxWithoutPin && !app.can("pos.manager_discount")) {
      setPendingCustomPct(pct);
      setCustomManagerAuthOpen(true);
      return;
    }
    applyCustomDiscount(pct);
  };

  const showStock = app.isFeatureEnabled("fashion.stock_variant") || useApi;

  return (
    <>
      <PosShell
        industry="fashion"
        title="Fashion POS"
        subtitle="Pick size × color · live available stock · barcode scan"
        receiptNote="Exchange within 14 days with tag intact"
        onCustomerChange={setActiveCustomer}
        headerBadges={<></>}
        catalog={
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 space-y-2 border-b border-border px-4 py-2">
              <div className="flex items-center justify-between gap-2 overflow-x-auto pb-0.5">
                <div className="flex gap-1">
                  {depts.map((d) => (
                    <Button
                      key={d}
                      size="sm"
                      className="shrink-0 gap-1.5"
                      variant={tab === d ? "default" : "outline"}
                      onClick={() => setTab(d)}
                    >
                      {getDeptIcon(d)}
                      <span>{d === "All" ? "All Product" : d}</span>
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 border-l border-border pl-2 shrink-0">
                  <Button
                    size="sm"
                    variant={inStockOnly ? "default" : "outline"}
                    className="h-8 text-xs px-2.5 gap-1.5 font-medium"
                    title={inStockOnly ? "Showing in-stock items only" : "Showing all items"}
                    onClick={() => setInStockOnly(!inStockOnly)}
                  >
                    <span className={cn("h-2 w-2 rounded-full", inStockOnly ? "bg-white" : "bg-emerald-500")} />
                    <span>In-stock only</span>
                  </Button>
                  <Button
                    size="sm"
                    variant={layoutMode === "grid" ? "default" : "outline"}
                    className="h-8 w-8 p-0"
                    title="Visual Grid View"
                    onClick={() => setLayoutMode("grid")}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={layoutMode === "matrix" ? "default" : "outline"}
                    className="h-8 w-8 p-0"
                    title="Detailed Matrix View"
                    onClick={() => setLayoutMode("matrix")}
                  >
                    <TableProperties className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleFashionScan();
                }}
              >
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setBarcode(e.target.value);
                    }}
                    placeholder="Search style, SKU, color, or scan barcode (Enter to add)…"
                    className="h-9 pl-9 pr-9 text-sm"
                    autoFocus
                  />
                  <Barcode className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
                </div>
                <Button type="submit" size="sm" className="shrink-0 h-9" disabled={isPending}>
                  Scan
                </Button>
              </form>
            </div>
            {useApi && variantsQuery.isLoading ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading size × color variants…</div>
            ) : useApi && items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No fashion variants loaded. Create a size×color matrix on the Variants page, then refresh POS.
              </div>
            ) : null}
            {app.isFeatureEnabled("fashion.trial_room") && !useApi && (
              <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-border px-4 py-2 bg-secondary/10">
                {trialRooms.map((t) => {
                  const isBusy = t.status === "busy";
                  const isCleaning = t.status === "cleaning";
                  return (
                    <Badge
                      key={t.id}
                      variant="outline"
                      onClick={() => {
                        setSelectedRoom(t);
                        setRoomActionOpen(true);
                      }}
                      className={cn(
                        "gap-1.5 px-2 py-0.5 text-[10px] font-medium border transition-colors cursor-pointer hover:bg-secondary/40",
                        isBusy ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400" :
                        isCleaning ? "border-zinc-500/30 bg-zinc-500/10 text-zinc-500" :
                        "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      )}
                    >
                      <span className={cn(
                        "h-1.5 w-1.5 rounded-full shrink-0",
                        isBusy ? "bg-amber-500 animate-pulse" :
                        isCleaning ? "bg-zinc-400" :
                        "bg-emerald-500 animate-ping"
                      )} />
                      <span>{t.room}</span>
                      <span className="opacity-70">({t.status})</span>
                    </Badge>
                  );
                })}
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {layoutMode === "grid" ? (
                <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 xl:grid-cols-4 lg:p-4">
                  {filtered.map((style) => (
                    <VisualProductCard
                      key={style.key}
                      style={style}
                      onClick={() => openVariantModal(style)}
                    />
                  ))}
                  {filtered.length === 0 && !variantsQuery.isLoading && (
                    <div className="col-span-full py-12 text-center text-sm text-muted-foreground">
                      No products match this filter.
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3 lg:p-4">
                  {filtered.map((style) => {
                    const sel = getSelection(style);
                    return (
                      <FashionProductCard
                        key={style.key}
                        style={style}
                        selection={sel}
                        showStock={showStock}
                        onSelectSize={(size) => setSelection(style.key, { size }, style)}
                        onSelectColor={(color) => setSelection(style.key, { color }, style)}
                        onAdd={() => addFromStyle(style)}
                      />
                    );
                  })}
                  {filtered.length === 0 && !variantsQuery.isLoading && (
                    <div className="col-span-full py-12 text-center text-sm text-muted-foreground">
                      No products match this filter.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        }
      />
      {app.isFeatureEnabled("fashion.offer_campaign") && (
        <div
          className={campaignOpen ? "fixed inset-0 z-50 flex items-center justify-center bg-black/40" : "hidden"}
          onClick={() => setCampaignOpen(false)}
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-background p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 font-semibold">Apply campaign discount</h3>
            {useApi && (
              <p className="mb-3 text-xs text-muted-foreground">
                Select one exclusive offer, or any number of stackable offers together.
              </p>
            )}
            <div className="space-y-2">
              {activeOffers.map((o) => {
                const selected = selectedOfferIds.includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors",
                      selected ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
                    )}
                    onClick={() => {
                      if (!useApi) {
                        // Demo mode: keep the simple single-select-and-apply behavior.
                        const pct = o.type === "percent" ? o.value : 0;
                        app.setAppliedCampaign({ id: o.id, name: o.name, discountPct: pct });
                        toast.success(`Campaign applied: ${o.name}`);
                        setCampaignOpen(false);
                        return;
                      }
                      setSelectedOfferIds((prev) => {
                        if (prev.includes(o.id)) return prev.filter((id) => id !== o.id);
                        if (!o.stackable) return [o.id];
                        const prevOffers = activeOffers.filter((a) => prev.includes(a.id));
                        if (prevOffers.some((a) => !a.stackable)) return [o.id];
                        return [...prev, o.id];
                      });
                    }}
                  >
                    <div>
                      <div className="text-sm font-medium">{o.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {o.scope}
                        {o.stackable ? " · stackable" : ""}
                      </div>
                    </div>
                    <Badge variant={o.type === "bygo" ? "secondary" : "default"}>
                      {o.type === "bygo" ? `Buy ${o.buyQty} get ${o.getQty} @ ${o.value}% off` : `${o.value}% off`}
                    </Badge>
                  </button>
                );
              })}
              {activeOffers.length === 0 && (
                <div className="py-6 text-center text-xs text-muted-foreground">No active offers</div>
              )}
            </div>
            {useApi && (
              <Button
                className="mt-3 w-full"
                disabled={selectedOfferIds.length === 0 || offerPreview.isPending}
                onClick={async () => {
                  const lines = app.cart.map((l) => ({ qty: l.qty, unit_price: l.price }));
                  const lines_by_offer: Record<string, { qty: number; unit_price: number }[]> = {};
                  selectedOfferIds.forEach((id) => {
                    lines_by_offer[id] = lines;
                  });
                  try {
                    const result = await offerPreview.mutateAsync({ offer_ids: selectedOfferIds, lines_by_offer });
                    if (result.total_discount <= 0) {
                      toast.error("Offer condition not met by the current cart");
                      return;
                    }
                    app.setAppliedCampaign({
                      id: "combo",
                      name: result.combined_name,
                      discountPct: 0,
                      discountAmt: result.total_discount,
                    });
                    toast.success(`Campaign applied: ${result.combined_name} (− ${fmtBDT(result.total_discount)})`);
                    setCampaignOpen(false);
                    setSelectedOfferIds([]);
                  } catch {
                    // useFashionOfferPreview's onMutationError already surfaces a toast
                  }
                }}
              >
                {offerPreview.isPending ? "Calculating…" : "Apply selected"}
              </Button>
            )}
            {app.appliedCampaign && (
              <Button
                variant="outline"
                className="mt-2 w-full"
                onClick={() => {
                  app.setAppliedCampaign(undefined);
                  setSelectedOfferIds([]);
                  toast.info("Campaign removed");
                  setCampaignOpen(false);
                }}
              >
                Remove campaign
              </Button>
            )}
            <div className="mt-3 border-t border-border pt-3">
              <Label className="text-xs text-muted-foreground">Or apply a custom discount</Label>
              <div className="mt-1.5 flex gap-2">
                <Input
                  type="number"
                  min={0}
                  max={50}
                  value={customPct}
                  onChange={(e) => setCustomPct(e.target.value)}
                  placeholder="Discount %"
                  className="h-9"
                />
                <Button variant="outline" className="shrink-0" onClick={handleApplyCustom}>
                  Apply custom
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manager approval for custom campaign discount */}
      <Dialog open={customManagerAuthOpen} onOpenChange={setCustomManagerAuthOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-warning">
              <Lock className="h-5 w-5" /> Manager Approval Required
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground leading-normal">
              Enter manager passcode or supervisor PIN to authorize a custom discount of{" "}
              <strong className="text-foreground">{pendingCustomPct}%</strong>.
            </p>
            <Input
              type="password"
              placeholder="Enter PIN / Passcode"
              value={customManagerPasscode}
              onChange={(e) => setCustomManagerPasscode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (["manager123", "admin123", "1234", "0000"].includes(customManagerPasscode.trim()) && pendingCustomPct !== null) {
                    applyCustomDiscount(pendingCustomPct);
                    setCustomManagerPasscode("");
                    setCustomManagerAuthOpen(false);
                    toast.success("Manager discount authorized!");
                  } else {
                    toast.error("Invalid passcode");
                  }
                }
              }}
              className="h-10 text-center font-mono text-lg tracking-widest"
              autoFocus
            />
            <div className="text-[10px] text-muted-foreground text-center">
              Hint: Enter <code className="bg-secondary px-1 rounded font-mono">manager123</code> or <code className="bg-secondary px-1 rounded font-mono">admin123</code>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCustomManagerPasscode(""); setCustomManagerAuthOpen(false); }}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (["manager123", "admin123", "1234", "0000"].includes(customManagerPasscode.trim()) && pendingCustomPct !== null) {
                  applyCustomDiscount(pendingCustomPct);
                  setCustomManagerPasscode("");
                  setCustomManagerAuthOpen(false);
                  toast.success("Manager discount authorized!");
                } else {
                  toast.error("Invalid passcode");
                }
              }}
            >
              Authorize
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Loyalty Points Redemption Modal */}
      <Dialog open={loyaltyOpen} onOpenChange={setLoyaltyOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-5 w-5" /> Redeem Loyalty Points
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-border bg-secondary/20 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer</span>
                <span className="font-medium">{activeCustomer?.name ?? "—"}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-muted-foreground">Points balance</span>
                <span className="font-semibold tabular">{loyaltyQuery.data?.points_balance ?? 0}</span>
              </div>
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>Point value</span>
                <span className="tabular">{fmtBDT(loyaltyQuery.data?.point_value ?? 0)} / pt</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Points to redeem</Label>
              <Input
                type="number"
                min={0}
                max={loyaltyQuery.data?.points_balance ?? 0}
                value={redeemPoints}
                onChange={(e) => setRedeemPoints(e.target.value)}
                placeholder="e.g. 50"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLoyaltyOpen(false)}>Cancel</Button>
            <Button
              disabled={loyaltyRedeemPreview.isPending || !Number(redeemPoints) || Number(redeemPoints) <= 0}
              onClick={async () => {
                if (!activeCustomer?.id) return;
                const points = Number(redeemPoints);
                try {
                  const result = await loyaltyRedeemPreview.mutateAsync({ customerId: activeCustomer.id, points });
                  app.setAppliedCampaign({
                    id: "loyalty",
                    name: `Loyalty redemption (${points} pts)`,
                    discountPct: 0,
                    discountAmt: result.discount_amount,
                    loyaltyRedeemPoints: points,
                  });
                  toast.success(`Redeeming ${points} points (− ${fmtBDT(result.discount_amount)})`);
                  setLoyaltyOpen(false);
                } catch {
                  // useLoyaltyRedeemPreview's onMutationError already surfaces a toast
                }
              }}
            >
              {loyaltyRedeemPreview.isPending ? "Calculating…" : "Redeem"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Trial Room Management Modal */}
      <Dialog open={roomActionOpen} onOpenChange={setRoomActionOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{selectedRoom?.room} Management</DialogTitle>
          </DialogHeader>
          <div className="py-3">
            {selectedRoom?.status === "busy" ? (
              <div className="space-y-3">
                <div className="text-xs rounded border border-border p-3 space-y-1 bg-secondary/20">
                  <div><strong>Customer:</strong> {selectedRoom.customer}</div>
                  <div><strong>Items inside:</strong> {selectedRoom.items} items</div>
                  <div><strong>Duration:</strong> {selectedRoom.since}</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => {
                    setTrialRooms(prev => prev.map(r => r.id === selectedRoom.id ? { ...r, status: "cleaning", customer: "—", items: 0, since: "—" } : r));
                    toast.info(`${selectedRoom.room} status set to cleaning`);
                    setRoomActionOpen(false);
                  }}>Clean room</Button>
                  <Button className="flex-1" onClick={() => {
                    setTrialRooms(prev => prev.map(r => r.id === selectedRoom.id ? { ...r, status: "free", customer: "—", items: 0, since: "—" } : r));
                    toast.success(`${selectedRoom.room} released`);
                    setRoomActionOpen(false);
                  }}>Release room</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground leading-normal">
                  Check the current customer and their selected garments into this trial room.
                </p>
                <div className="flex gap-2">
                  {selectedRoom?.status === "cleaning" && (
                    <Button variant="outline" className="flex-1" onClick={() => {
                      setTrialRooms(prev => prev.map(r => r.id === selectedRoom.id ? { ...r, status: "free" } : r));
                      setRoomActionOpen(false);
                    }}>Mark Clean</Button>
                  )}
                  <Button className="flex-1" onClick={() => {
                    if (!selectedRoom) return;
                    const cName = app.customer || "Walk-in Guest";
                    const totalItems = app.cart.reduce((s, l) => s + l.qty, 0);
                    setTrialRooms(prev => prev.map(r => r.id === selectedRoom.id ? { ...r, status: "busy", customer: cName, items: totalItems, since: "1 min" } : r));
                    toast.success(`${selectedRoom.room} assigned to ${cName}`);
                    setRoomActionOpen(false);
                  }}>Send to Room</Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Matrix Variant Grid Adder Modal */}
      <Dialog open={bulkModalOpen} onOpenChange={setBulkModalOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" /> Bulk Matrix Adder
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1 min-h-0">
            <div className="space-y-1">
              <Label className="text-xs">Select Product Style</Label>
              <Select value={bulkStyleId} onValueChange={(v) => { setBulkStyleId(v); setBulkQuantities({}); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {styles.map((s) => (
                    <SelectItem key={s.key} value={s.key}>{s.name} ({s.styleCode})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {styles.find(s => s.key === bulkStyleId) && (() => {
              const style = styles.find(s => s.key === bulkStyleId)!;
              return (
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-muted-foreground border-b pb-1">Matrix quantities grid</div>
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-secondary/40 border-b">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold">Size \ Color</th>
                          {style.colors.map(color => (
                            <th key={color} className="px-3 py-2 text-center font-semibold whitespace-nowrap min-w-[90px]">
                              <div className="flex items-center justify-center gap-1.5">
                                <span className="h-2 w-2 rounded-full border border-border shrink-0" style={{ backgroundColor: fashionColorHex(color) }} />
                                <span>{color}</span>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {style.sizes.map(size => (
                          <tr key={size} className="hover:bg-secondary/15">
                            <td className="px-3 py-2 font-bold">{size}</td>
                            {style.colors.map(color => {
                              const variant = findVariant(style.variants, size, color);
                              const key = `${size}-${color}`;
                              const val = bulkQuantities[key] ?? "";
                              if (!variant) return <td key={color} className="px-3 py-2 text-center text-muted-foreground/30 bg-secondary/5">—</td>;
                              const isOut = variant.stock <= 0;
                              return (
                                <td key={color} className="px-3 py-1 text-center min-w-[90px]">
                                  <div className="space-y-0.5">
                                    <Input
                                      type="number"
                                      min={0}
                                      max={variant.stock}
                                      value={val}
                                      onChange={(e) => setBulkQuantities(prev => ({ ...prev, [key]: e.target.value }))}
                                      placeholder="0"
                                      disabled={isOut}
                                      className="h-8 text-center text-xs font-semibold"
                                    />
                                    <div className={`text-[9px] font-mono ${isOut ? "text-destructive" : "text-muted-foreground"}`}>
                                      {isOut ? "Out of stock" : `${variant.stock} left`}
                                    </div>
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </div>
          <DialogFooter className="shrink-0 border-t pt-3 mt-1">
            <Button variant="outline" onClick={() => setBulkModalOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              const style = styles.find(s => s.key === bulkStyleId);
              if (!style) return;
              let count = 0;
              style.variants.forEach(v => {
                const qty = Number(bulkQuantities[`${v.size}-${v.color}`] || 0);
                if (qty > 0) {
                  app.addToCart({
                    sku: v.sku,
                    name: style.name,
                    meta: style.styleCode,
                    price: v.price,
                    qty,
                    industry: "fashion",
                    extras: {
                      ...catalogToCartExtras(v),
                      productId: style.productId,
                      variant_id: v.variantId,
                      size: v.size,
                      color: v.color,
                      style: style.styleCode,
                      season: style.season,
                      barcode: v.barcode,
                    },
                  });
                  count += qty;
                }
              });
              if (count > 0) {
                toast.success(`Bulk added ${count} items to cart!`);
                setBulkModalOpen(false);
              } else {
                toast.error("Please enter quantities first");
              }
            }}>
              Add selected to cart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Quick Variant Selection Modal for Visual Grid Mode */}
      <Dialog open={variantModalOpen} onOpenChange={setVariantModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Variant</DialogTitle>
          </DialogHeader>
          {modalSelectedStyle && (
            <div className="space-y-4 py-2">
              <div className="flex gap-4 items-center border-b pb-3">
                <div className="h-20 w-20 bg-white rounded border border-border p-1 flex items-center justify-center overflow-hidden shrink-0">
                  {modalSelectedStyle.image ? (
                    <img
                      src={resolveImageUrl(modalSelectedStyle.image)}
                      alt={modalSelectedStyle.name}
                      className="max-h-full max-w-full object-contain"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                  ) : (
                    <span className="font-mono text-[8px] text-muted-foreground uppercase tracking-wide text-center">
                      {modalSelectedStyle.category}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-semibold text-sm leading-tight text-foreground truncate">{modalSelectedStyle.name}</h4>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{modalSelectedStyle.styleCode} · {modalSelectedStyle.category}</p>
                  <p className="text-base font-bold text-primary mt-1 font-display">
                    {fmtBDT(findVariant(modalSelectedStyle.variants, modalSize, modalColor)?.price ?? modalSelectedStyle.price)}
                  </p>
                </div>
              </div>

              {/* Sizes Selection */}
              {modalSelectedStyle.sizes.length > 0 && (
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Size</Label>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {modalSelectedStyle.sizes.map((size) => {
                      const active = modalSize === size;
                      const hasAnyStock = modalSelectedStyle.variants.some((v) => v.size === size && v.stock > 0);
                      const available = modalSelectedStyle.variants.some((v) => v.size === size && (!modalColor || v.color === modalColor) && v.stock > 0);
                      
                      return (
                        <button
                          key={size}
                          type="button"
                          onClick={() => {
                            setModalSize(size);
                            const match = modalSelectedStyle.variants.find((v) => v.size === size && v.stock > 0)
                              ?? modalSelectedStyle.variants.find((v) => v.size === size);
                            if (match && modalColor && !modalSelectedStyle.variants.some((v) => v.size === size && v.color === modalColor)) {
                              setModalColor(match.color);
                            }
                          }}
                          className={cn(
                            "grid h-9 min-w-[36px] place-items-center rounded border px-2 text-xs font-semibold transition-all relative overflow-hidden cursor-pointer",
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : !hasAnyStock
                              ? "border-dashed border-destructive/20 bg-destructive/5 text-muted-foreground line-through opacity-50 cursor-not-allowed"
                              : "border-border bg-background hover:border-primary hover:bg-primary/5",
                            !available && hasAnyStock && !active && "opacity-60 border-dashed",
                          )}
                        >
                          {size}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Colors Selection */}
              {modalSelectedStyle.colors.length > 0 && (
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Color ({modalColor})</Label>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {modalSelectedStyle.colors.map((color) => {
                      const active = modalColor === color;
                      const hex = fashionColorHex(color);
                      const hasAnyStock = modalSelectedStyle.variants.some((v) => v.color === color && v.stock > 0);
                      const available = modalSelectedStyle.variants.some((v) => v.color === color && (!modalSize || v.size === modalSize) && v.stock > 0);

                      return (
                        <button
                          key={color}
                          type="button"
                          title={color}
                          onClick={() => {
                            setModalColor(color);
                            const match = modalSelectedStyle.variants.find((v) => v.color === color && v.stock > 0)
                              ?? modalSelectedStyle.variants.find((v) => v.color === color);
                            if (match && modalSize && !modalSelectedStyle.variants.some((v) => v.color === color && v.size === modalSize)) {
                              setModalSize(match.size);
                            }
                          }}
                          className={cn(
                            "relative h-8 w-8 rounded-full border transition-all cursor-pointer hover:scale-110 hover:ring-2 hover:ring-primary/40 flex items-center justify-center",
                            active ? "scale-110 border-foreground ring-2 ring-primary" : "border-background shadow-sm",
                            !hasAnyStock ? "opacity-30 border-dashed border-destructive cursor-not-allowed" : !available && !active ? "opacity-60 border-dashed border-muted-foreground" : "",
                          )}
                          style={{ backgroundColor: hex }}
                        >
                          {active && (
                            <span className="h-2 w-2 rounded-full bg-white shadow-sm" style={{ mixBlendMode: 'difference' }} />
                          )}
                          {!hasAnyStock && (
                            <span className="absolute inset-0 flex items-center justify-center text-xs text-destructive/80 font-bold">×</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Stock display */}
              {(() => {
                const variant = findVariant(modalSelectedStyle.variants, modalSize, modalColor);
                const stock = variant?.stock ?? 0;
                const isOut = !variant || stock <= 0;

                return (
                  <div className={cn(
                    "flex items-center justify-between rounded-lg p-2.5 text-xs border font-medium",
                    isOut 
                      ? "bg-destructive/5 border-destructive/20 text-destructive" 
                      : "bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                  )}>
                    <span>Availability Status:</span>
                    <span className="font-semibold">
                      {isOut ? "Out of Stock" : `${stock} units available`}
                    </span>
                  </div>
                );
              })()}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setVariantModalOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleModalAdd} 
              disabled={
                !modalSelectedStyle || 
                (findVariant(modalSelectedStyle.variants, modalSize, modalColor)?.stock ?? 0) <= 0
              }
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" /> Add to cart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
