import { useMemo, useState, useEffect } from "react";
import { subscribeCatalogSync } from "@/lib/broadcast-sync";
import { useApiProducts, useApiStock, useTimePricingRules } from "@/hooks/use-api-config";
import { shouldUseBackend } from "@/lib/demo-mode";
import type { IndustryPackId } from "@/lib/industry-registry";
import { useAuth } from "@/lib/auth-provider";
import { loadMarkdownRules, resolveProductMarkdown, type TimePricingRule } from "@/lib/fresh-markdown-policy";

export type PosCatalogItem = {
  id: string;
  sku: string;
  name: string;
  price: number;
  originalPrice?: number;
  isMarkdownActive?: boolean;
  markdownBadge?: string;
  markdownDiscountPct?: number;
  markdownRuleName?: string;
  wholesalePrice?: number;
  barcode?: string;
  stock: number;
  imageUrl?: string;
  meta?: Record<string, unknown>;
};

/** Load POS catalog from backend when authenticated; demo fallback only without backend session. */
export function usePosCatalog(industry: IndustryPackId, demoItems: PosCatalogItem[], storeId?: string) {
  const useApi = shouldUseBackend();
  const { user } = useAuth();
  const activeStoreId = storeId || user?.store_id || undefined;
  const products = useApiProducts(
    { industry, status: "active", limit: 25000 },
    { refetchInterval: 25_000, staleTime: 10_000, refetchOnWindowFocus: true }
  );
  const stock = useApiStock(
    activeStoreId,
    { refetchInterval: 25_000, staleTime: 10_000, refetchOnWindowFocus: true }
  );

  // Cross-tab real-time sync: when another tab creates/updates products or stock,
  // immediately refetch catalog without waiting for polling interval
  useEffect(() => {
    return subscribeCatalogSync((type) => {
      if (type === "products" || type === "all") {
        products.refetch();
      }
      if (type === "stock" || type === "all") {
        stock.refetch();
      }
    });
  }, [products.refetch, stock.refetch]);

  // Live timer tick every 10s to dynamically trigger markdowns when time thresholds (e.g. 20:00) cross
  const [ticker, setTicker] = useState<number>(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setTicker(Date.now()), 10000);
    return () => clearInterval(interval);
  }, []);

  const { data: apiRules } = useTimePricingRules();

  const rules: TimePricingRule[] = useMemo(() => {
    if (useApi && apiRules) {
      return apiRules.map(r => ({
        id: r.id,
        name: r.name,
        enabled: r.is_active,
        discountType: r.discount_type as any,
        discountValue: r.discount_value,
        startTime: r.start_time,
        endTime: r.end_time,
        daysOfWeek: r.days_of_week || [0, 1, 2, 3, 4, 5, 6],
        categoryIds: r.category_ids || [],
        productIds: r.product_ids || [],
        industryPack: r.industry_pack || "all",
        badgeLabel: r.badge_label || "⚡ 50% Fresh Clearance",
        description: r.description,
      }));
    }
    return loadMarkdownRules();
  }, [useApi, apiRules]);

  const items = useMemo((): PosCatalogItem[] => {
    const now = new Date(ticker);

    if (!useApi) {
      return demoItems.map(item => {
        const category = String(item.meta?.category || item.meta?.category_id || "");
        const rawOriginal = (item as any).originalPrice ?? item.price;
        const md = resolveProductMarkdown(
          {
            id: item.id,
            name: item.name,
            base_price: rawOriginal,
            category_id: category,
            industry_pack: industry,
          },
          rules,
          now
        );
        const rawImg =
          item.imageUrl ||
          (item.meta?.image as string) ||
          (item.meta?.image_url as string) ||
          (item.meta?.imageUrl as string);
        if (md.isMarkdownActive) {
          return {
            ...item,
            imageUrl: rawImg || undefined,
            originalPrice: rawOriginal,
            price: md.effectivePrice,
            isMarkdownActive: true,
            markdownBadge: md.badgeLabel,
            markdownDiscountPct: md.discountPct,
            markdownRuleName: md.ruleName,
          };
        }
        return {
          ...item,
          imageUrl: rawImg || undefined,
          originalPrice: undefined,
          isMarkdownActive: false,
          markdownBadge: undefined,
          markdownDiscountPct: undefined,
          markdownRuleName: undefined,
        };
      });
    }

    if (products.isLoading || stock.isLoading) return [];
    if (!products.data?.items.length) return [];
    const stockMap = new Map((stock.data ?? []).map(s => [s.product_id, s.qty_available ?? s.qty_on_hand]));
    return products.data.items.map(p => {
      const md = resolveProductMarkdown(p, rules, now);
      const img =
        (p.meta?.image as string) ||
        (p.meta?.image_url as string) ||
        (p.meta?.imageUrl as string) ||
        (p as any).imageUrl ||
        (p as any).image;
      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        price: md.isMarkdownActive ? md.effectivePrice : p.base_price,
        originalPrice: md.isMarkdownActive ? p.base_price : undefined,
        isMarkdownActive: md.isMarkdownActive,
        markdownBadge: md.badgeLabel,
        markdownDiscountPct: md.discountPct,
        markdownRuleName: md.ruleName,
        wholesalePrice: p.wholesale_price ?? undefined,
        barcode: p.barcode ?? undefined,
        stock: stockMap.get(p.id) ?? 0,
        imageUrl: img || undefined,
        meta: {
          ...(p.meta ?? {}),
          image: img,
          image_url: img,
          category_id: p.category_id,
          brand_id: p.brand_id,
          unit_id: p.unit_id,
        },
      };
    });
  }, [useApi, products.data, products.isLoading, stock.data, stock.isLoading, demoItems, rules, ticker, industry]);

  return {
    items,
    isLoading: useApi && (products.isLoading || stock.isLoading),
    isRefetching: Boolean(useApi && (products.isRefetching || stock.isRefetching)),
    isError: useApi && (products.isError || stock.isError),
    refetch: () => { products.refetch(); stock.refetch(); },
    fromBackend: useApi && !!products.data?.items.length,
    isEmpty: useApi && !products.isLoading && !products.data?.items.length,
  };
}

export function catalogToCartExtras(item: PosCatalogItem) {
  return {
    productId: item.id,
    originalPrice: item.originalPrice,
    isMarkdownActive: item.isMarkdownActive,
    markdownBadge: item.markdownBadge,
    markdownDiscountPct: item.markdownDiscountPct,
    markdownRuleName: item.markdownRuleName,
    ...(item.meta ?? {}),
  };
}
