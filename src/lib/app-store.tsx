import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { resolveCompanyLogo } from "./company-branding";
import { toast } from "sonner";
import { type Role, type Permission, roleHasWithOverrides, migrateRole } from "./permissions";
import { migrateDynamicFields, filterDynamicFields } from "./dynamic-fields";
import type { FieldVisibilityContext } from "./dynamic-fields";
import {
  type IndustryPackId,
  type PosMode,
  type PackScopeConfig,
  type PackMenuConfig,
  type DynamicFieldDef,
  defaultPackConfigs,
  defaultPackConfig,
  defaultPackMenus,
  mergePackMenus,
  defaultFeatureFlags,
  DEFAULT_DYNAMIC_FIELDS,
  isPackEnabled,
  enabledPackIds,
  availablePosModes,
  POS_MODES,
} from "./industry-registry";

export type CartLine = {
  id?: string;
  sku: string;
  name: string;
  meta?: string;
  price: number;
  qty: number;
  flags?: string[];
  industry?: PosMode;
  discountPct?: number;
  discountFixed?: number;
  originalPrice?: number;
  priceOverrideReason?: string;
  extras?: Record<string, string | number | boolean | undefined>;
};

type HeldSale = { id: string; lines: CartLine[]; customer?: string; ts: number; industry?: PosMode };

export type QueuedSale = {
  id: string;
  total: number;
  tender: string;
  lines: CartLine[];
  payments?: Array<{ method: string; amount: number }>;
  reservationIds?: string[];
  customer?: string;
  ts: number;
  status: "queued" | "syncing" | "synced" | "conflict";
  conflictReason?: string;
  resolution?: "accept-server" | "keep-local" | "merged";
  industry?: PosMode;
  discountPct?: number;
  discountFixed?: number;
  extraDiscount?: number;
};

export type SyncResult = {
  synced: number;
  conflicts: number;
  total: number;
  details: Array<{ id: string; status: "synced" | "conflict"; reason?: string }>;
};

export type Theme = "light" | "dark";
/** @deprecated use IndustryPackId from industry-registry */
export type Pack = IndustryPackId;

export type Language = "en" | "bn" | "both";

export type ReceiptBrand = {
  brandName: string;
  brandNameBn?: string;
  tagline?: string;
  taglineBn?: string;
  addressLines: string[];
  addressLinesBn?: string[];
  vatBin?: string;
  phone?: string;
  website?: string;
  footerNotes: string;
  footerNotesBn?: string;
  language: Language;
  paperWidthMm: 58 | 80;
  logoDataUrl?: string;
  showLogo: boolean;
  showQr: boolean;
};

/**
 * Neutral receipt fallback.
 *
 * This used to be hardcoded to one real tenant — name, address, phone and their
 * BIN (VAT registration). Every company without a configured receipt template
 * printed that identity on its customer receipts, which on a tax document is a
 * serious mis-attribution, not a cosmetic default. Blank fields are omitted by
 * the renderer, so an unconfigured tenant now shows its own company profile
 * (see `companyToReceiptBrand`) rather than somebody else's.
 */
export const defaultReceiptBrand: ReceiptBrand = {
  brandName: "",
  brandNameBn: "",
  tagline: "",
  taglineBn: "",
  addressLines: [],
  addressLinesBn: [],
  vatBin: "",
  phone: "",
  website: "",
  footerNotes: "",
  footerNotesBn: "",
  language: "both",
  paperWidthMm: 80,
  logoDataUrl: "",
  showLogo: false,
  showQr: true,
};

/**
 * Build a receipt identity from the authenticated company's own profile.
 *
 * `/org/company/profile` is scoped to `auth.company_id`, so this can never carry
 * another tenant's details. Anything the company has not filled in stays blank
 * rather than being borrowed from a default.
 */
export function companyToReceiptBrand(
  profile:
    | {
        code?: string | null;
        name?: string | null;
        legal_name?: string | null;
        tax_id?: string | null;
        address?: string | null;
        phone?: string | null;
        email?: string | null;
        logo_url?: string | null;
      }
    | undefined,
  base: ReceiptBrand = defaultReceiptBrand,
): ReceiptBrand {
  if (!profile) return base;
  const logo = resolveCompanyLogo(profile);
  const address = (profile.address ?? "")
    .split(/\r?\n|,\s*/)
    .map(part => part.trim())
    .filter(Boolean);

  // Check if base has brand details matching this company. If base came from localStorage
  // for a different tenant (e.g. OUTFIT / Fashion), strip out stale taglines, notes, and names.
  const isBaseSameCompany = Boolean(
    base.brandName &&
    (
      (profile.name && base.brandName.toLowerCase().includes(profile.name.toLowerCase())) ||
      (profile.legal_name && base.brandName.toLowerCase().includes(profile.legal_name.toLowerCase()))
    )
  );

  const isOutfitCompany = Boolean(
    (profile.code && profile.code.toUpperCase().includes("OUTFIT")) ||
    (profile.name && /OUTFIT/i.test(profile.name)) ||
    (profile.legal_name && /OUTFIT/i.test(profile.legal_name))
  );

  const containsStaleOutfitText = (text?: string) =>
    Boolean(text && /OUTFIT|outfit|আউটফিট|Art of the complete look|Noakhali|নোয়াখালী|Exchange within|0325@gmail\.com/i.test(text));

  const containsStaleOutfitList = (lines?: string[]) =>
    Boolean(lines?.some(l => containsStaleOutfitText(l)));

  const cleanBrandNameBn = !isOutfitCompany && containsStaleOutfitText(base.brandNameBn) ? "" : (isBaseSameCompany ? (base.brandNameBn ?? "") : "");
  const cleanTagline = !isOutfitCompany && containsStaleOutfitText(base.tagline) ? "" : (isBaseSameCompany ? (base.tagline ?? "") : "");
  const cleanTaglineBn = !isOutfitCompany && containsStaleOutfitText(base.taglineBn) ? "" : (isBaseSameCompany ? (base.taglineBn ?? "") : "");
  const cleanAddressLinesBn = !isOutfitCompany && containsStaleOutfitList(base.addressLinesBn) ? [] : (isBaseSameCompany ? (base.addressLinesBn ?? []) : []);
  const cleanFooterNotes = !isOutfitCompany && containsStaleOutfitText(base.footerNotes) ? "" : (isBaseSameCompany ? (base.footerNotes ?? "") : "");
  const cleanFooterNotesBn = !isOutfitCompany && containsStaleOutfitText(base.footerNotesBn) ? "" : (isBaseSameCompany ? (base.footerNotesBn ?? "") : "");
  const cleanWebsite = !isOutfitCompany && containsStaleOutfitText(profile.email || base.website) ? "" : (profile.email || (isBaseSameCompany ? base.website : ""));

  return {
    ...base,
    brandName: profile.legal_name || profile.name || (isOutfitCompany ? base.brandName : ""),
    brandNameBn: cleanBrandNameBn,
    tagline: cleanTagline,
    taglineBn: cleanTaglineBn,
    addressLines: address.length ? address : (isBaseSameCompany ? base.addressLines : []),
    addressLinesBn: cleanAddressLinesBn,
    vatBin: profile.tax_id ? `BIN: ${profile.tax_id}` : (isBaseSameCompany ? base.vatBin : ""),
    phone: profile.phone || (isBaseSameCompany ? base.phone : ""),
    website: cleanWebsite,
    footerNotes: cleanFooterNotes || (isOutfitCompany ? base.footerNotes : ""),
    footerNotesBn: cleanFooterNotesBn,
    logoDataUrl: logo || (isBaseSameCompany ? base.logoDataUrl : ""),
    showLogo: Boolean(logo) || (isBaseSameCompany ? base.showLogo : false),
  };
}

export type Transaction = {
  id: string;
  total: number;
  tender: string;
  ts: number;
  lines: number;
  industry: PosMode;
  campaignName?: string;
  priceMode?: "retail" | "wholesale";
  rmaId?: string;
};

type AppState = {
  theme: Theme;
  toggleTheme: () => void;
  cart: CartLine[];
  addToCart: (line: CartLine) => void;
  updateQty: (id: string, delta: number) => void;
  updateLine: (id: string, patch: Partial<CartLine>) => void;
  removeLine: (id: string) => void;
  clearCart: () => void;
  setCart: (lines: CartLine[]) => void;
  discountPct: number;
  setDiscountPct: (n: number) => void;
  /** Manual cart discount as percent or fixed BDT amount. */
  discountMode: "percent" | "fixed";
  setDiscountMode: (m: "percent" | "fixed") => void;
  discountFixed: number;
  setDiscountFixed: (n: number) => void;
  customer?: string;
  setCustomer: (c?: string) => void;
  held: HeldSale[];
  holdSale: (industry?: PosMode) => void;
  resumeSale: (id: string) => void;
  /** Legacy boolean map — derived from packConfigs.company */
  packs: Record<IndustryPackId, boolean>;
  packConfigs: Record<IndustryPackId, PackScopeConfig>;
  setPackScope: (pack: IndustryPackId, scope: "company" | "store" | "counter", enabled: boolean) => void;
  togglePack: (p: IndustryPackId) => void;
  isPackEnabled: (p: IndustryPackId) => boolean;
  packMenus: Record<IndustryPackId, PackMenuConfig>;
  setPackMenuRoute: (pack: IndustryPackId, path: string, enabled: boolean) => void;
  enabledPacks: IndustryPackId[];
  posMode: PosMode;
  setPosMode: (m: PosMode) => void;
  availablePosModes: PosMode[];
  flags: Record<string, boolean>;
  toggleFlag: (k: string) => void;
  setFlag: (k: string, v: boolean) => void;
  isFeatureEnabled: (key: string) => boolean;
  dynamicFields: DynamicFieldDef[];
  addDynamicField: (field: Omit<DynamicFieldDef, "id" | "order">) => void;
  updateDynamicField: (id: string, patch: Partial<DynamicFieldDef>) => void;
  removeDynamicField: (id: string) => void;
  reorderDynamicField: (id: string, direction: "up" | "down") => void;
  setDynamicFieldOrder: (orderedIds: string[]) => void;
  getVisibleFields: (ctx: FieldVisibilityContext) => DynamicFieldDef[];
  store: string;
  setStore: (s: string) => void;
  counter: string;
  setCounter: (c: string) => void;
  groceryPriceMode: "retail" | "wholesale";
  setGroceryPriceMode: (m: "retail" | "wholesale") => void;
  appliedCampaign?: { id: string; name: string; discountPct: number; discountAmt?: number; loyaltyRedeemPoints?: number };
  setAppliedCampaign: (c?: { id: string; name: string; discountPct: number; discountAmt?: number; loyaltyRedeemPoints?: number }) => void;
  campaignDiscountAmt: number;
  transactions: Transaction[];
  recordTransaction: (t: { total: number; tender: string; lines: number; industry?: PosMode }) => string;
  offline: boolean;
  setOffline: (v: boolean) => void;
  queuedSales: QueuedSale[];
  queueSale: (s: Omit<QueuedSale, "id" | "ts" | "status">) => string;
  syncQueue: () => Promise<SyncResult>;
  resolveConflict: (id: string, resolution: "accept-server" | "keep-local") => void;
  bulkResolveConflicts: (group: ConflictGroupKey, resolution: "accept-server" | "keep-local") => void;
  receiptBrand: ReceiptBrand;
  setReceiptBrand: (b: Partial<ReceiptBrand>) => void;
  resetReceiptBrand: () => void;
  role: Role;
  setRole: (r: Role) => void;
  roleOverrides: Record<string, boolean>;
  setRoleOverride: (role: Role, perm: Permission, allowed: boolean) => void;
  can: (p: Permission) => boolean;
  canForRole: (role: Role, p: Permission) => boolean;
  goldRatePerGram: number;
  setGoldRatePerGram: (n: number) => void;
  hydratePackConfigs: (configs: Record<IndustryPackId, PackScopeConfig>) => void;
  hydratePackMenus: (menus: Record<IndustryPackId, PackMenuConfig>) => void;
  hydrateFlags: (flags: Record<string, boolean>) => void;
  hydrateDynamicFields: (fields: DynamicFieldDef[]) => void;
};

export type ConflictGroupKey = "price" | "stock" | "duplicate" | "other";
export function classifyConflict(reason?: string): ConflictGroupKey {
  const r = (reason ?? "").toLowerCase();
  if (r.includes("price")) return "price";
  if (r.includes("stock")) return "stock";
  if (r.includes("duplicate") || r.includes("invoice")) return "duplicate";
  return "other";
}
export const conflictGroupMeta: Record<ConflictGroupKey, { label: string; description: string }> = {
  price: { label: "Price drift", description: "Catalog price moved while the sale was offline. Server price will overwrite local total." },
  stock: { label: "Stock drift", description: "On-hand count changed since the sale was queued. Confirm the inventory move is still valid." },
  duplicate: { label: "Duplicate invoice", description: "An invoice with this number already exists on the server. A new id will be assigned on accept." },
  other: { label: "Other", description: "Manual review required." },
};

const Ctx = createContext<AppState | null>(null);

function useLocal<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setV(JSON.parse(raw));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {}
  }, [key, v]);
  return [v, setV];
}

function migratePackConfigs(raw: unknown): Record<IndustryPackId, PackScopeConfig> {
  const defaults = defaultPackConfigs();
  if (raw && typeof raw === "object" && raw !== null && "beef-shop" in (raw as object)) {
    return { ...defaults, ...(raw as Record<IndustryPackId, PackScopeConfig>) };
  }
  if (raw && typeof raw === "object") {
    const legacy = raw as Record<string, boolean>;
    const next = { ...defaults };
    (Object.keys(next) as IndustryPackId[]).forEach(id => {
      if (typeof legacy[id] === "boolean") {
        next[id] = { ...next[id], company: legacy[id], store: legacy[id], counter: legacy[id] };
      }
    });
    return next;
  }
  return defaults;
}

function areExtrasEqual(a?: Record<string, string | number | boolean | undefined>, b?: Record<string, string | number | boolean | undefined>): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i];
    if (keysB[i] !== key) return false;
    if (a[key] !== b[key]) return false;
  }
  return true;
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `line-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useLocal<Theme>("pulse.theme", "light");
  const [cart, setCart] = useLocal<CartLine[]>("pulse.cart", []);
  const [discountPct, setDiscountPct] = useLocal<number>("pulse.discount", 0);
  const [discountMode, setDiscountMode] = useLocal<"percent" | "fixed">("pulse.discountMode", "percent");
  const [discountFixed, setDiscountFixed] = useLocal<number>("pulse.discountFixed", 0);
  const [customer, setCustomer] = useLocal<string | undefined>("pulse.customer", undefined);
  const [held, setHeld] = useLocal<HeldSale[]>("pulse.held", []);
  const [packConfigsRaw, setPackConfigsRaw] = useLocal<Record<IndustryPackId, PackScopeConfig>>(
    "pulse.packConfigs",
    defaultPackConfigs(),
  );
  const [packMenusRaw, setPackMenusRaw] = useLocal<Record<IndustryPackId, PackMenuConfig>>(
    "pulse.packMenus",
    defaultPackMenus(),
  );
  const packConfigs = useMemo(() => migratePackConfigs(packConfigsRaw), [packConfigsRaw]);
  const packMenus = useMemo(() => mergePackMenus(packMenusRaw), [packMenusRaw]);
  const setPackConfigs = (v: Record<IndustryPackId, PackScopeConfig> | ((p: Record<IndustryPackId, PackScopeConfig>) => Record<IndustryPackId, PackScopeConfig>)) => {
    setPackConfigsRaw(prev => {
      const next = typeof v === "function" ? v(migratePackConfigs(prev)) : v;
      return migratePackConfigs(next);
    });
  };
  useEffect(() => {
    try {
      const legacy = localStorage.getItem("pulse.packs");
      if (legacy && !localStorage.getItem("pulse.packConfigs")) {
        setPackConfigsRaw(migratePackConfigs(JSON.parse(legacy)));
      }
    } catch {}
  }, [setPackConfigsRaw]);
  const [flags, setFlags] = useLocal<Record<string, boolean>>("pulse.flags", defaultFeatureFlags());
  const [posMode, setPosModeRaw] = useLocal<PosMode>("pulse.posMode", "restaurant");
  const [dynamicFieldsRaw, setDynamicFields] = useLocal<DynamicFieldDef[]>("pulse.dynamicFields", DEFAULT_DYNAMIC_FIELDS);
  const dynamicFields = useMemo(() => migrateDynamicFields(dynamicFieldsRaw), [dynamicFieldsRaw]);
  const [store, setStore] = useLocal<string>("pulse.store", "main");
  const [counter, setCounter] = useLocal<string>("pulse.counter", "CTR-01");
  const [groceryPriceMode, setGroceryPriceMode] = useLocal<"retail" | "wholesale">("pulse.groceryPriceMode", "retail");
  const [appliedCampaign, setAppliedCampaignRaw] = useLocal<{ id: string; name: string; discountPct: number; discountAmt?: number; loyaltyRedeemPoints?: number } | undefined>("pulse.campaign", undefined);
  const [roleRaw, setRoleRaw] = useLocal<string>("pulse.role", "Admin");
  const role = useMemo(() => migrateRole(roleRaw), [roleRaw]);
  const setRole = (r: Role) => setRoleRaw(r);
  const [roleOverrides, setRoleOverrides] = useLocal<Record<string, boolean>>("pulse.roleOverrides", {});
  const [transactions, setTx] = useLocal<Transaction[]>("pulse.tx", []);
  const [offline, setOfflineRaw] = useLocal<boolean>("pulse.offline", false);
  const [queuedSales, setQueued] = useLocal<QueuedSale[]>("pulse.queue", []);
  const [receiptBrand, setBrand] = useLocal<ReceiptBrand>("pulse.brand", defaultReceiptBrand);
  const [goldRatePerGram, setGoldRatePerGram] = useLocal<number>("pulse.goldRate", 9850);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    const handleOnline = () => {
      setOfflineRaw(false);
      toast.info("Network connection restored");
    };
    const handleOffline = () => {
      setOfflineRaw(true);
      toast.warning("Network offline — sales will queue locally");
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [setOfflineRaw]);

  const packs = useMemo(() => {
    const m = {} as Record<IndustryPackId, boolean>;
    (Object.keys(packConfigs) as IndustryPackId[]).forEach(id => {
      m[id] = isPackEnabled(id, packConfigs);
    });
    return m;
  }, [packConfigs]);

  const enabledPacks = useMemo(() => enabledPackIds(packConfigs), [packConfigs]);
  const posModes = useMemo(() => availablePosModes(packConfigs), [packConfigs]);

  useEffect(() => {
    if (enabledPacks.length > 0 && posMode !== "universal" && !enabledPacks.includes(posMode as any)) {
      if (POS_MODES.some(m => m.id === posMode)) {
        setPackConfigsRaw(prev => ({
          ...prev,
          [posMode]: {
            company: true,
            store: true,
            counter: true,
            updatedAt: Date.now(),
            updatedBy: "User",
          },
        }));
        return;
      }
      setPosModeRaw(enabledPacks[0] as PosMode);
    }
  }, [enabledPacks, posMode, setPosModeRaw, setPackConfigsRaw]);

  const campaignDiscountAmt = useMemo(() => {
    if (!appliedCampaign) return 0;
    // BYGO / stacked combos carry a precomputed amount from the offers/preview
    // endpoint (their discount isn't expressible as a flat % of the cart).
    if (typeof appliedCampaign.discountAmt === "number") return appliedCampaign.discountAmt;
    const sub = cart.reduce((s, l) => s + lineAmount(l), 0);
    return Math.round(sub * (appliedCampaign.discountPct / 100));
  }, [cart, appliedCampaign]);

  const setAppliedCampaign = (c?: { id: string; name: string; discountPct: number; discountAmt?: number; loyaltyRedeemPoints?: number }) => setAppliedCampaignRaw(c);

  const value = useMemo<AppState>(() => ({
    theme,
    toggleTheme: () => setTheme(t => (t === "light" ? "dark" : "light")),
    cart,
    addToCart: (line) =>
      setCart(c => {
        const i = c.findIndex(l => l.sku === line.sku && areExtrasEqual(l.extras, line.extras));
        if (i >= 0) {
          const next = [...c];
          next[i] = { ...next[i], qty: next[i].qty + line.qty };
          return next;
        }
        return [...c, { ...line, id: line.id || generateId() }];
      }),
    updateQty: (id, delta) =>
      setCart(c =>
        c
          .map(l => {
            if (l.id !== id && l.sku !== id) return l;
            const next = Number((l.qty + delta).toFixed(4));
            return { ...l, qty: next };
          })
          .filter(l => l.qty > 0),
      ),
    updateLine: (id, patch) =>
      setCart(c => c.map(l => (l.id === id || l.sku === id) ? { ...l, ...patch } : l)),
    removeLine: (id) => setCart(c => c.filter(l => l.id !== id && l.sku !== id)),
    clearCart: () => {
      setCart([]);
      setDiscountPct(0);
      setDiscountFixed(0);
      setCustomer(undefined);
      setAppliedCampaignRaw(undefined);
    },
    setCart: (lines) => setCart(lines),
    discountPct, setDiscountPct,
    discountMode, setDiscountMode,
    discountFixed, setDiscountFixed,
    customer, setCustomer,
    held,
    holdSale: (industry) => {
      if (cart.length === 0) return;
      const rand = Math.random().toString(36).slice(-3).toUpperCase();
      setHeld(h => [...h, { id: `H${Date.now().toString().slice(-5)}-${rand}`, lines: cart, customer, ts: Date.now(), industry: industry ?? posMode }]);
      setCart([]); setDiscountPct(0); setDiscountFixed(0); setCustomer(undefined);
    },
    resumeSale: (id) => {
      const s = held.find(h => h.id === id);
      if (!s) return;
      setCart(s.lines);
      setCustomer(s.customer);
      if (s.industry) setPosModeRaw(s.industry);
      setHeld(h => h.filter(x => x.id !== id));
    },
    packs,
    packConfigs,
    setPackScope: (pack, scope, enabled) => {
      setPackConfigs(prev => ({
        ...prev,
        [pack]: {
          ...defaultPackConfig(false),
          ...prev[pack],
          [scope]: enabled,
          updatedAt: Date.now(),
          updatedBy: "Mahin Ahmed",
        },
      }));
    },
    togglePack: (p) => {
      const on = isPackEnabled(p, packConfigs);
      setPackConfigs(prev => ({
        ...prev,
        [p]: {
          ...defaultPackConfig(false),
          ...prev[p],
          company: !on,
          store: !on,
          counter: !on,
          updatedAt: Date.now(),
          updatedBy: "Mahin Ahmed",
        },
      }));
    },
    packMenus,
    setPackMenuRoute: (pack, path, enabled) => {
      setPackMenusRaw(prev => {
        const merged = mergePackMenus(prev);
        return {
          ...merged,
          [pack]: { ...merged[pack], [path]: enabled },
        };
      });
    },
    isPackEnabled: (p) => isPackEnabled(p, packConfigs),
    enabledPacks,
    posMode,
    setPosMode: (m) => {
      if (m !== "universal" && !isPackEnabled(m, packConfigs)) {
        setPackConfigs(prev => ({
          ...prev,
          [m]: {
            company: true,
            store: true,
            counter: true,
            updatedAt: Date.now(),
            updatedBy: "User",
          },
        }));
      }
      setPosModeRaw(m);
    },
    availablePosModes: posModes,
    flags,
    toggleFlag: (k) => setFlags(prev => ({ ...prev, [k]: !prev[k] })),
    setFlag: (k, v) => setFlags(prev => ({ ...prev, [k]: v })),
    isFeatureEnabled: (key) => flags[key] ?? defaultFeatureFlags()[key] ?? false,
    dynamicFields,
    addDynamicField: (field) => {
      setDynamicFields(prev => [
        ...prev,
        { ...field, id: `df${Date.now()}`, order: prev.length + 1 },
      ]);
    },
    updateDynamicField: (id, patch) => {
      setDynamicFields(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
    },
    removeDynamicField: (id) => setDynamicFields(prev => prev.filter(f => f.id !== id)),
    reorderDynamicField: (id, direction) => {
      setDynamicFields(prev => {
        const sorted = [...migrateDynamicFields(prev)].sort((a, b) => a.order - b.order);
        const idx = sorted.findIndex(f => f.id === id);
        if (idx < 0) return prev;
        const swap = direction === "up" ? idx - 1 : idx + 1;
        if (swap < 0 || swap >= sorted.length) return prev;
        const a = sorted[idx];
        const b = sorted[swap];
        return prev.map(f => {
          if (f.id === a.id) return { ...f, order: b.order };
          if (f.id === b.id) return { ...f, order: a.order };
          return f;
        });
      });
    },
    setDynamicFieldOrder: (orderedIds) => {
      setDynamicFields(prev => prev.map(f => {
        const idx = orderedIds.indexOf(f.id);
        return idx >= 0 ? { ...f, order: idx + 1 } : f;
      }));
    },
    getVisibleFields: (ctx) => filterDynamicFields(dynamicFields, ctx),
    store, setStore,
    counter, setCounter,
    groceryPriceMode, setGroceryPriceMode,
    appliedCampaign,
    setAppliedCampaign,
    campaignDiscountAmt,
    transactions,
    recordTransaction: (t) => {
      const rand = Math.random().toString(36).slice(-3).toUpperCase();
      const id = `INV-${Date.now().toString().slice(-6)}-${rand}`;
      setTx(prev => [{
        id,
        ts: Date.now(),
        industry: t.industry ?? posMode,
        campaignName: appliedCampaign?.name,
        priceMode: groceryPriceMode,
        ...t,
      }, ...prev].slice(0, 100));
      return id;
    },
    offline,
    setOffline: (v) => {
      if (!v || flags["pos.offline_mode"] !== false) setOfflineRaw(v);
    },
    queuedSales,
    queueSale: (s) => {
      const rand = Math.random().toString(36).slice(-3).toUpperCase();
      const id = `OFF-${Date.now().toString().slice(-6)}-${rand}`;
      setQueued(prev => [{ ...s, id, ts: Date.now(), status: "queued", industry: s.industry ?? posMode }, ...prev]);
      return id;
    },
    syncQueue: async () => {
      const pending = queuedSales.filter(q => q.status === "queued" || q.status === "conflict");
      const { isAuthenticated } = await import("./auth");
      const { syncQueuedSales } = await import("./offline-sync");
      if (isAuthenticated() && pending.length > 0) {
        const result = await syncQueuedSales(pending, posMode);
        const next = queuedSales.map(q => {
          const detail = result.details.find(d => d.id === q.id);
          if (!detail) return q;
          if (detail.status === "synced") {
            setTx(prev => [{
              id: detail.id.replace("OFF-", "INV-"),
              ts: Date.now(),
              total: q.total,
              tender: q.tender,
              lines: q.lines.length,
              industry: q.industry ?? posMode,
            }, ...prev].slice(0, 100));
            return { ...q, status: "synced" as const, resolution: "merged" as const };
          }
          return { ...q, status: "conflict" as const, conflictReason: detail.reason };
        });
        setQueued(next);
        return result;
      }
      const details: SyncResult["details"] = [];
      let synced = 0, conflicts = 0;
      const reasons = [
        "Price changed on server since queue",
        "Stock count drifted — manager review",
        "Duplicate invoice number detected",
      ];
      const next = queuedSales.map(q => ({ ...q }));
      for (const q of next) {
        if (q.status !== "queued" && q.status !== "conflict") continue;
        const isConflict = (q.ts % 5 === 0) && q.status === "queued";
        await new Promise(r => setTimeout(r, 80));
        if (isConflict) {
          q.status = "conflict";
          q.conflictReason = reasons[q.ts % reasons.length];
          conflicts++;
          details.push({ id: q.id, status: "conflict", reason: q.conflictReason });
        } else {
          q.status = "synced";
          q.resolution = q.resolution ?? "merged";
          synced++;
          const rand = Math.random().toString(36).slice(-3).toUpperCase();
          const txId = `INV-${Date.now().toString().slice(-6)}-${rand}`;
          setTx(prev => [{ id: txId, ts: Date.now(), total: q.total, tender: q.tender, lines: q.lines.length, industry: q.industry ?? "universal" }, ...prev].slice(0, 100));
          details.push({ id: q.id, status: "synced" });
        }
      }
      setQueued(next);
      return { synced, conflicts, total: pending.length, details };
    },
    resolveConflict: (id, resolution) => {
      setQueued(prev => prev.map(q => {
        if (q.id !== id) return q;
        if (resolution === "accept-server") {
          return { ...q, status: "synced", resolution: "accept-server", conflictReason: undefined };
        }
        return { ...q, status: "queued", resolution: "keep-local", conflictReason: undefined };
      }));
    },
    bulkResolveConflicts: (group, resolution) => {
      setQueued(prev => prev.map(q => {
        if (q.status !== "conflict") return q;
        if (classifyConflict(q.conflictReason) !== group) return q;
        if (resolution === "accept-server") {
          return { ...q, status: "synced", resolution: "accept-server", conflictReason: undefined };
        }
        return { ...q, status: "queued", resolution: "keep-local", conflictReason: undefined };
      }));
    },
    receiptBrand,
    setReceiptBrand: (b) => setBrand(prev => ({ ...prev, ...b })),
    resetReceiptBrand: () => setBrand(defaultReceiptBrand),
    role,
    setRole,
    roleOverrides,
    setRoleOverride: (r, perm, allowed) => {
      setRoleOverrides(o => ({ ...o, [`${r}:${perm}`]: allowed }));
    },
    can: (p) => roleHasWithOverrides(role, p, roleOverrides),
    canForRole: (r, p) => roleHasWithOverrides(r, p, roleOverrides),
    goldRatePerGram,
    setGoldRatePerGram,
    hydratePackConfigs: (configs) => setPackConfigs(migratePackConfigs(configs)),
    hydratePackMenus: (menus) => setPackMenusRaw(mergePackMenus(menus)),
    hydrateFlags: (f) => setFlags(prev => ({ ...prev, ...f })),
    hydrateDynamicFields: (fields) => setDynamicFields(fields),
  }), [theme, cart, discountPct, discountMode, discountFixed, customer, held, packs, packConfigs, packMenus, enabledPacks, posMode, posModes, flags, dynamicFields, store, counter, groceryPriceMode, appliedCampaign, campaignDiscountAmt, transactions, offline, queuedSales, role, roleOverrides, receiptBrand, goldRatePerGram]); // eslint-disable-line

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error("AppProvider missing");
  return c;
}

export function lineDiscountAmount(line: CartLine): number {
  const gross = line.extras?.amount != null ? Number(line.extras.amount) : (line.price * line.qty);
  let disc = 0;
  if (line.discountPct && line.discountPct > 0) {
    disc += Math.round(gross * (line.discountPct / 100));
  }
  if (line.discountFixed && line.discountFixed > 0) {
    disc += Math.round(line.discountFixed);
  }
  return Math.min(gross, Math.max(0, disc));
}

export function lineAmount(line: CartLine): number {
  const gross = line.extras?.amount != null ? Number(line.extras.amount) : (line.price * line.qty);
  return Math.max(0, gross - lineDiscountAmount(line));
}

export function cartTotals(
  cart: CartLine[],
  discountPct = 0,
  taxRate = 0,
  extraDiscount = 0,
  discountFixed = 0,
) {
  const grossSubtotal = cart.reduce((s, l) => {
    const gross = l.extras?.amount != null ? Number(l.extras.amount) : (l.price * l.qty);
    return s + gross;
  }, 0);
  const lineDiscounts = cart.reduce((s, l) => s + lineDiscountAmount(l), 0);
  const subtotalAfterLineDiscounts = Math.max(0, grossSubtotal - lineDiscounts);

  const pctPart = Math.round(subtotalAfterLineDiscounts * (discountPct / 100));
  const fixedPart = Math.max(0, Math.round(discountFixed));
  const billDiscount = Math.min(subtotalAfterLineDiscounts, pctPart + fixedPart + extraDiscount);

  const discount = lineDiscounts + billDiscount;
  const taxable = Math.max(0, grossSubtotal - discount);
  const tax = Math.round(taxable * taxRate);
  const total = taxable + tax;
  return {
    subtotal: grossSubtotal,
    discount,
    lineDiscounts,
    billDiscount,
    tax,
    total,
    taxRate,
  };
}
