/**
 * Fresh Food Markdown & Time-Based Dynamic Pricing Policy Engine
 * Supports automatic price cuts (e.g. 50% off / half price or custom markdown)
 * for perishable foods like pastries, cakes, deli, and cooked items after specific hours.
 */

export type MarkdownDiscountType = "half_price" | "percent" | "fixed_discount" | "override_price";

export type TimePricingRule = {
  id: string;
  name: string;
  enabled: boolean;
  discountType: MarkdownDiscountType;
  discountValue: number; // e.g. 50 for 50%, 40 for 40% off, 100 for fixed price
  startTime: string; // "HH:MM" 24h format, e.g. "20:00"
  endTime: string; // "HH:MM" 24h format, e.g. "23:59"
  daysOfWeek: number[]; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  categoryIds: string[]; // specific category IDs or category names
  productIds?: string[]; // specific product IDs
  industryPack?: string; // e.g. "restaurant", "grocery", "bakery", "all"
  badgeLabel: string; // e.g. "50% Fresh Clearance", "Evening Markdown"
  description?: string;
};

export const DEFAULT_MARKDOWN_RULES: TimePricingRule[] = [
  {
    id: "rule-evening-pastry-50",
    name: "Evening Pastry & Cake Half Price Clearance",
    enabled: true,
    discountType: "half_price",
    discountValue: 50,
    startTime: "20:00",
    endTime: "23:59",
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    categoryIds: ["Pastry", "Cakes", "Bakery", "Desserts", "Bread"],
    industryPack: "all",
    badgeLabel: "⚡ 50% Fresh Clearance",
    description: "Cuts pastry and fresh cake prices in half daily from 8:00 PM to store closing to prevent spoilage.",
  },
  {
    id: "rule-afternoon-deli-30",
    name: "Afternoon Cooked Food Markdown",
    enabled: false,
    discountType: "percent",
    discountValue: 30,
    startTime: "15:00",
    endTime: "18:00",
    daysOfWeek: [1, 2, 3, 4, 5],
    categoryIds: ["Cooked Food", "Deli", "Snacks"],
    industryPack: "all",
    badgeLabel: "🏷️ 30% Afternoon Saver",
    description: "30% off hot deli and prepared food items during afternoon off-peak hours.",
  },
];

const STORAGE_KEY = "pulse.fresh_markdown_rules";

export function loadMarkdownRules(): TimePricingRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // fallback
  }
  return DEFAULT_MARKDOWN_RULES;
}

export function saveMarkdownRules(rules: TimePricingRule[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch {
    // ignore
  }
}

/**
 * Checks whether a given rule is active at the specified time.
 * Correctly handles time ranges that cross midnight (e.g., 21:00 to 02:00).
 */
export function isRuleActiveNow(rule: TimePricingRule, currentTime: Date = new Date()): boolean {
  if (!rule.enabled) return false;

  const currentDay = currentTime.getDay();
  if (rule.daysOfWeek.length > 0 && !rule.daysOfWeek.includes(currentDay)) {
    return false;
  }

  const [startHour, startMin] = (rule.startTime || "00:00").split(":").map(Number);
  const [endHour, endMin] = (rule.endTime || "23:59").split(":").map(Number);

  const currentTotalMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
  const startTotalMinutes = (isNaN(startHour) ? 0 : startHour) * 60 + (isNaN(startMin) ? 0 : startMin);
  const endTotalMinutes = (isNaN(endHour) ? 23 : endHour) * 60 + (isNaN(endMin) ? 59 : endMin);

  if (startTotalMinutes <= endTotalMinutes) {
    // Standard daytime / same-day range (e.g. 20:00 -> 23:59)
    return currentTotalMinutes >= startTotalMinutes && currentTotalMinutes <= endTotalMinutes;
  } else {
    // Overnight range spanning midnight (e.g. 22:00 -> 04:00)
    return currentTotalMinutes >= startTotalMinutes || currentTotalMinutes <= endTotalMinutes;
  }
}

export type ResolvedProductMarkdown = {
  isMarkdownActive: boolean;
  originalPrice: number;
  effectivePrice: number;
  discountAmount: number;
  discountPct: number;
  badgeLabel: string;
  ruleName: string;
  ruleId?: string;
};

/**
 * Resolves markdown pricing for a product against all currently active rules.
 */
export function resolveProductMarkdown(
  product: {
    id?: string;
    sku?: string;
    name?: string;
    price?: number;
    base_price?: number;
    category_id?: string | null;
    category?: string | null;
    industry_pack?: string | null;
    meta?: Record<string, unknown> | null;
  },
  rules: TimePricingRule[] = loadMarkdownRules(),
  currentTime: Date = new Date()
): ResolvedProductMarkdown {
  const basePrice = Number(product.base_price ?? product.price ?? 0);
  const defaultRes: ResolvedProductMarkdown = {
    isMarkdownActive: false,
    originalPrice: basePrice,
    effectivePrice: basePrice,
    discountAmount: 0,
    discountPct: 0,
    badgeLabel: "",
    ruleName: "",
  };

  if (basePrice <= 0) return defaultRes;

  const prodName = (product.name || "").toLowerCase();
  const prodCatId = (product.category_id || "").toLowerCase();
  const prodCatName = (product.category || (product.meta?.category as string) || "").toLowerCase();
  const prodPack = (product.industry_pack || (product.meta?.packId as string) || "").toLowerCase();
  const prodId = product.id || "";
  const prodSku = (product.sku || "").toLowerCase();

  // Find the first active rule that matches this product
  for (const rule of rules) {
    if (!isRuleActiveNow(rule, currentTime)) continue;

    // Check industry pack restriction
    if (rule.industryPack && rule.industryPack !== "all" && prodPack && rule.industryPack !== prodPack) {
      continue;
    }

    // Check specific product ID match
    const matchesProduct = rule.productIds?.some(
      id => id === prodId || (prodSku && id.toLowerCase() === prodSku)
    );

    // Check category match (by ID, category name, or keywords in name/category)
    const matchesCategory = rule.categoryIds.some(cat => {
      const c = cat.toLowerCase().trim();
      if (!c) return false;
      return (
        prodCatId === c ||
        prodCatName.includes(c) ||
        prodName.includes(c)
      );
    });

    // If rule has neither product nor category specified, it matches all products in pack
    const isGlobal = (!rule.categoryIds || rule.categoryIds.length === 0) && (!rule.productIds || rule.productIds.length === 0);

    if (matchesProduct || matchesCategory || isGlobal) {
      let effectivePrice = basePrice;
      let discountAmount = 0;
      let discountPct = 0;

      switch (rule.discountType) {
        case "half_price":
          discountPct = 50;
          discountAmount = Math.round(basePrice * 0.5);
          effectivePrice = Math.max(0, basePrice - discountAmount);
          break;
        case "percent":
          discountPct = Math.min(100, Math.max(0, rule.discountValue));
          discountAmount = Math.round(basePrice * (discountPct / 100));
          effectivePrice = Math.max(0, basePrice - discountAmount);
          break;
        case "fixed_discount":
          discountAmount = Math.min(basePrice, Math.max(0, rule.discountValue));
          discountPct = basePrice > 0 ? Math.round((discountAmount / basePrice) * 100) : 0;
          effectivePrice = Math.max(0, basePrice - discountAmount);
          break;
        case "override_price":
          effectivePrice = Math.max(0, rule.discountValue);
          discountAmount = Math.max(0, basePrice - effectivePrice);
          discountPct = basePrice > 0 ? Math.round((discountAmount / basePrice) * 100) : 0;
          break;
      }

      if (discountAmount > 0) {
        return {
          isMarkdownActive: true,
          originalPrice: basePrice,
          effectivePrice,
          discountAmount,
          discountPct,
          badgeLabel: rule.badgeLabel || `${discountPct}% Off Clearance`,
          ruleName: rule.name,
          ruleId: rule.id,
        };
      }
    }
  }

  return defaultRes;
}

/**
 * Formats time from 24h string ("20:00") to human-readable 12h string ("08:00 PM")
 */
export function formatTime12h(time24: string): string {
  if (!time24) return "";
  const [hStr, mStr] = time24.split(":");
  let h = parseInt(hStr, 10);
  const m = mStr || "00";
  if (isNaN(h)) return time24;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h.toString().padStart(2, "0")}:${m} ${ampm}`;
}

export const DAYS_OF_WEEK_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
