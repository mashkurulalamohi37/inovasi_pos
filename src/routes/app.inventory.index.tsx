import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader, PageBody, StatCard, SectionCard, StatusBadge, FilterBar } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Boxes, AlertTriangle, ArrowLeftRight, Plus, Warehouse, AlertCircle, RefreshCw, ChevronRight, ChevronDown, ChevronsUpDown, Check, Printer, ScrollText, Search, Upload, FileSpreadsheet, Download, Eye, CheckCircle2, XCircle, SlidersHorizontal, Settings2, Package, Loader2, Sparkles, Trash2, RotateCcw, Lock, Camera, X, Barcode, Calendar, Tag, TrendingUp, Edit3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { CameraBarcodeScannerDialog } from "@/components/scanner/CameraBarcodeScannerDialog";
import { stores, fmtBDT } from "@/lib/pos-data";
import { lowStock, demoProducts } from "@/lib/mock-extra";
import { shouldUseBackend } from "@/lib/demo-mode";
import { resolveLiveRows, EMPTY_LIVE_LABEL } from "@/lib/live-data";
import { ReorderDrawer, type ReorderItem } from "@/features/inventory/ReorderDrawer";
import { PermissionGate } from "@/components/pulse/gates";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";
import { useApiProducts, useApiStock, useRawStock, useStockAdjust, useStockTransfer, useApiStores, useLowStock, useStockAdjustments, usePostOpeningStock, useStockLedger, useProductVariants, useProductBatches, useImportOpeningStock, type ImportResult, useOpeningStockDocuments, useOpeningStockDocument, useCreateOpeningStockDocument, useApproveOpeningStockDocument, useCancelOpeningStockDocument, useRevertOpeningStockDocument, useDeleteOpeningStockDocument, useClearOpeningStock, type OpeningStockDocument, type OpeningStockDocumentLineIn, useCategories, type ApiProduct } from "@/hooks/use-api-config";
import { parseCsv, toCsv } from "@/lib/csv";
import { saveTextFile, timestampedFilename } from "@/lib/download";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-provider";
import { useApp } from "@/lib/app-store";
import { INDUSTRY_PACKS, type IndustryPackId } from "@/lib/industry-registry";
import {
  type ApiStockRow,
  DEFAULT_LOW_STOCK_THRESHOLD,
  getStoredLowStockThreshold,
  setStoredLowStockThreshold,
  LOW_STOCK_THRESHOLD_EVENT,
} from "@/lib/stock-utils";
import { getUnifiedProductFields } from "@/lib/product-field-utils";

export const Route = createFileRoute("/app/inventory/")({
  validateSearch: (search: Record<string, unknown>): { tab?: string } => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
  }),
  component: Inventory
});

type StockRow = {
  productId?: string;
  sku: string;
  name: string;
  barcode?: string;
  qty: number;
  reserved: number;
  available: number;
  price: number;
  industry?: string;
  meta?: Record<string, unknown>;
};

export type InventoryTab = "levels" | "adjustment" | "history" | "opening" | "opening-docs";

function InventoryBatchesDetail({ productId }: { productId: string }) {
  const { data: batches = [], isLoading } = useProductBatches(productId, true);

  if (isLoading) {
    return <div className="text-xs text-muted-foreground py-2">Loading active batches...</div>;
  }

  if (batches.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 bg-background/50 p-3 text-xs text-muted-foreground">
        Single lot inventory · No separate batches registered.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/40 rounded-lg border border-border/60 bg-background overflow-hidden text-xs">
      {batches.map((b, idx) => {
        const days = b.expiry_date
          ? Math.floor((new Date(b.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          : null;
        const isExpired = days != null && days <= 0;
        const isNear = days != null && days > 0 && days <= 90;
        return (
          <div key={b.id || idx} className="flex items-center justify-between p-2.5 hover:bg-secondary/20 transition-colors">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground font-mono">{b.batch_no}</span>
              {b.lot_no && <span className="text-muted-foreground text-[11px]">(Lot: {b.lot_no})</span>}
              {isExpired ? (
                <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-bold text-destructive">
                  Expired
                </span>
              ) : isNear ? (
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                  Near Expiry ({days}d)
                </span>
              ) : days != null ? (
                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                  {days}d remaining
                </span>
              ) : null}
              {b.expiry_date && (
                <span className="text-[11px] text-muted-foreground">
                  · Expiry: <strong className="text-foreground font-medium">{String(b.expiry_date).slice(0, 10)}</strong>
                </span>
              )}
            </div>
            <div className="text-right">
              <span className="font-bold tabular-nums text-foreground">{b.qty_on_hand}</span>
              <span className="text-[11px] text-muted-foreground ml-1">units</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Inventory() {
  const search = Route.useSearch();
  const defaultTab = (search.tab as InventoryTab) || "levels";
  return <InventoryPage key={defaultTab} defaultTab={defaultTab} />;
}

export function InventoryPage({ defaultTab }: { defaultTab: InventoryTab }) {
  const navigate = useNavigate();
  const app = useApp();
  const { store } = app;
  const { user, can } = useAuth();
  const canAdjustAnyStore = can("inventory.adjust_any_store");
  const useApi = shouldUseBackend();
  const fieldCtx = { store: app.store, counter: app.counter };

  const [packFilter, setPackFilterRaw] = useState<string>("all");
  const packFilterTouched = useRef(false);
  const setPackFilter = (v: string) => { packFilterTouched.current = true; setPackFilterRaw(v); };
  // Default the pack filter to whichever POS mode is currently active, so arriving
  // from e.g. Fashion POS shows fashion stock first; "All enabled packs" stays one click away.
  // posMode is restored from localStorage after mount, so this has to react to it rather
  // than read it in the initial useState — and stop once the user picks their own filter.
  useEffect(() => {
    if (packFilterTouched.current) return;
    setPackFilterRaw(app.posMode !== "universal" && app.isPackEnabled(app.posMode) ? app.posMode : "all");
  }, [app.posMode]); // eslint-disable-line react-hooks/exhaustive-deps
  const [stockSearch, setStockSearch] = useState<string>("");
  const [visibleCustomColumns, setVisibleCustomColumns] = useState<Set<string>>(new Set());
  const toggleColumnVisible = (key: string) => {
    setVisibleCustomColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const activePackFilter = packFilter !== "all" ? (packFilter as IndustryPackId) : undefined;
  const allDynamicColumns = useMemo(() => {
    if (!activePackFilter) return [];
    return getUnifiedProductFields(activePackFilter, app.dynamicFields, fieldCtx);
  }, [activePackFilter, app.dynamicFields, app.store, app.counter]);

  const dynamicColumns = useMemo(() => {
    return allDynamicColumns.filter(col => visibleCustomColumns.has(col.key));
  }, [allDynamicColumns, visibleCustomColumns]);

  const stockQuery = useApiStock();
  const rawStockQuery = useRawStock();
  const storesQuery = useApiStores();
  const [expandedSkus, setExpandedSkus] = useState<Set<string>>(new Set());
  const storeNameMap = useMemo(
    () => new Map((storesQuery.data ?? []).map(s => [s.id, s.name])),
    [storesQuery.data],
  );
  const branchStockByProduct = useMemo(() => {
    const map = new Map<string, ApiStockRow[]>();
    for (const row of rawStockQuery.data ?? []) {
      const list = map.get(row.product_id) ?? [];
      list.push(row);
      map.set(row.product_id, list);
    }
    return map;
  }, [rawStockQuery.data]);
  const toggleExpanded = (productId: string) => {
    setExpandedSkus(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };
  const productsQuery = useApiProducts({
    status: "active",
    industry: activePackFilter,
    limit: 25000,
  });

  // Dedicated Opening Stock catalog: not locked to single industry pack, preloads up to 25000 items
  const openingCatalogQuery = useApiProducts({
    status: "active",
    limit: 25000,
  });

  // Dynamic remote search for opening stock product lookup
  const [openingProductSearch, setOpeningProductSearch] = useState("");
  const [debouncedOpeningSearch, setDebouncedOpeningSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedOpeningSearch(openingProductSearch.trim()), 200);
    return () => clearTimeout(t);
  }, [openingProductSearch]);

  const openingSearchQuery = useApiProducts(
    debouncedOpeningSearch
      ? { q: debouncedOpeningSearch, status: "active", limit: 50 }
      : undefined
  );

  const [selectedProductCache, setSelectedProductCache] = useState<ApiProduct | null>(null);

  const openingAvailableProducts = useMemo(() => {
    const map = new Map<string, ApiProduct>();
    for (const p of openingCatalogQuery.data?.items ?? []) {
      map.set(p.id, p);
    }
    for (const p of productsQuery.data?.items ?? []) {
      map.set(p.id, p);
    }
    for (const p of openingSearchQuery.data?.items ?? []) {
      map.set(p.id, p);
    }
    if (selectedProductCache) {
      map.set(selectedProductCache.id, selectedProductCache);
    }
    return Array.from(map.values());
  }, [openingCatalogQuery.data, productsQuery.data, openingSearchQuery.data, selectedProductCache]);
  const adjustMut = useStockAdjust();

  const [threshold, setThreshold] = useState<number>(() => getStoredLowStockThreshold());
  const [thresholdInput, setThresholdInput] = useState<string>(() => String(getStoredLowStockThreshold()));

  useEffect(() => {
    const handleThresholdChange = () => {
      const stored = getStoredLowStockThreshold();
      setThreshold(stored);
      setThresholdInput(String(stored));
    };
    window.addEventListener(LOW_STOCK_THRESHOLD_EVENT, handleThresholdChange);
    return () => window.removeEventListener(LOW_STOCK_THRESHOLD_EVENT, handleThresholdChange);
  }, []);

  const lowStockQuery = useLowStock(threshold);
  const transferMut = useStockTransfer();

  const [activeTab, setActiveTab] = useState<InventoryTab>(defaultTab);
  const adjustmentsQuery = useStockAdjustments(100);
  const openingStockMut = usePostOpeningStock();
  const openingHistoryQuery = useStockLedger({ transaction_type: "opening", limit: 50 });

  const BATCH_PACKS = ["pharmacy", "cosmetics", "surgical-shop"];
  const SERIAL_PACKS = ["surgical-shop", "electronics", "mobile-shop"];

  const [openingForm, setOpeningForm] = useState({
    store_id: user?.store_id ?? "",
    warehouse_id: "",
    product_id: "",
    qty: 0,
    unit_cost: 0,
    variant_id: "",
    note: "",
    batch_no: "",
    lot_no: "",
    expiry_date: "",
    manufacture_date: "",
    serials_text: "",
  });
  const [openingProductPickerOpen, setOpeningProductPickerOpen] = useState(false);
  const openingProduct = useMemo(
    () => (productsQuery.data?.items ?? []).find(p => p.id === openingForm.product_id),
    [productsQuery.data, openingForm.product_id],
  );
  const openingPack = openingProduct?.industry_pack;
  const openingVariantsQuery = useProductVariants(openingPack === "fashion" ? openingForm.product_id : undefined);

  const EXPIRY_WARNING_DAYS = 30;
  const openingExpiryStatus = useMemo(() => {
    if (!BATCH_PACKS.includes(openingPack ?? "") || !openingForm.expiry_date) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const expiry = new Date(openingForm.expiry_date);
    if (Number.isNaN(expiry.getTime())) return null;
    const daysLeft = Math.round((expiry.getTime() - today.getTime()) / 86400000);
    if (daysLeft < 0) return { level: "expired" as const, daysLeft };
    if (daysLeft < EXPIRY_WARNING_DAYS) return { level: "warning" as const, daysLeft };
    return { level: "ok" as const, daysLeft };
  }, [openingPack, openingForm.expiry_date]);

  const openingProductIsSerialized = useMemo(() => {
    if (!SERIAL_PACKS.includes(openingPack ?? "")) return false;
    if (openingPack === "surgical-shop") return true;
    const meta = openingProduct?.meta as Record<string, unknown> | undefined;
    if (!meta) return false;
    for (const k of ["serialized", "has_serial", "hasSerial", "serial_imei_required", "imei_required", "serial_tracked"]) {
      if (k in meta) {
        const val = meta[k];
        if (typeof val === "string") return val.toLowerCase() === "true" || val === "1";
        return Boolean(val);
      }
    }
    return false;
  }, [openingPack, openingProduct]);

  const openingSerialsList = useMemo(
    () => openingForm.serials_text.split("\n").map(s => s.trim()).filter(Boolean),
    [openingForm.serials_text],
  );
  const openingSerialMismatch = openingProductIsSerialized
    && openingForm.qty > 0
    && openingSerialsList.length > 0
    && openingSerialsList.length !== openingForm.qty;

  const openingValuation = openingForm.qty * openingForm.unit_cost;

  const openingBatchesQuery = useProductBatches(openingForm.product_id, BATCH_PACKS.includes(openingPack ?? ""));
  const [openingBatchSuggestOpen, setOpeningBatchSuggestOpen] = useState(false);
  const openingBatchSuggestions = useMemo(() => {
    const q = openingForm.batch_no.trim().toLowerCase();
    const batches = openingBatchesQuery.data ?? [];
    if (!q) return batches;
    return batches.filter(b => b.batch_no.toLowerCase().includes(q));
  }, [openingBatchesQuery.data, openingForm.batch_no]);
  const openingExactBatchMatch = useMemo(
    () => (openingBatchesQuery.data ?? []).find(b => b.batch_no.toLowerCase() === openingForm.batch_no.trim().toLowerCase()),
    [openingBatchesQuery.data, openingForm.batch_no],
  );
  const applyBatchSuggestion = (b: { batch_no: string; lot_no?: string | null; expiry_date?: string | null; manufacture_date?: string | null }) => {
    setOpeningForm(f => ({
      ...f,
      batch_no: b.batch_no,
      lot_no: b.lot_no ?? f.lot_no,
      expiry_date: b.expiry_date ? b.expiry_date.slice(0, 10) : f.expiry_date,
      manufacture_date: b.manufacture_date ? b.manufacture_date.slice(0, 10) : f.manufacture_date,
    }));
    setOpeningBatchSuggestOpen(false);
  };

  const submitOpeningStock = async () => {
    if (!openingForm.store_id || !openingForm.product_id || openingForm.qty <= 0) {
      toast.error("Store, product, and quantity required");
      return;
    }
    const hasOpeningVariants = (openingVariantsQuery.data?.length ?? 0) > 0;
    if (openingPack === "fashion" && hasOpeningVariants && !openingForm.variant_id) {
      toast.error("Please select a variant for this fashion product");
      return;
    }
    if (openingExpiryStatus?.level === "expired") {
      toast.error("Expiry date is in the past — cannot initialize expired stock");
      return;
    }
    const serials = openingForm.serials_text
      .split("\n")
      .map(s => s.trim())
      .filter(Boolean);
    if (openingProductIsSerialized && serials.length !== openingForm.qty) {
      toast.error(`Serial count (${serials.length}) must match quantity (${openingForm.qty})`);
      return;
    }
    await openingStockMut.mutateAsync({
      product_id: openingForm.product_id,
      store_id: openingForm.store_id,
      warehouse_id: openingForm.warehouse_id || undefined,
      qty: openingForm.qty,
      unit_cost: openingForm.unit_cost,
      variant_id: openingForm.variant_id || undefined,
      note: openingForm.note || undefined,
      batch_no: openingForm.batch_no || undefined,
      lot_no: openingForm.lot_no || undefined,
      expiry_date: openingForm.expiry_date || undefined,
      manufacture_date: openingForm.manufacture_date || undefined,
      serials: serials.length > 0 ? serials : undefined,
    });
    setOpeningForm({
      store_id: user?.store_id ?? "",
      warehouse_id: "",
      product_id: "",
      qty: 0,
      unit_cost: 0,
      variant_id: "",
      note: "",
      batch_no: "",
      lot_no: "",
      expiry_date: "",
      manufacture_date: "",
      serials_text: "",
    });
  };

  const OPENING_CSV_COLUMNS = [
    "sku", "store_code", "warehouse_code", "qty", "unit_cost",
    "variant_sku", "size", "color",
    "batch_no", "lot_no", "expiry_date", "manufacture_date", "serials", "note",
  ];

  const importOpeningStockMut = useImportOpeningStock();
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkRows, setBulkRows] = useState<Record<string, string>[]>([]);
  const [bulkResult, setBulkResult] = useState<ImportResult | null>(null);
  const bulkFileInputRef = useRef<HTMLInputElement | null>(null);

  const downloadOpeningStockTemplate = () => {
    const sample = toCsv(OPENING_CSV_COLUMNS, [
      { sku: "GROC-001", store_code: "DHK-01", warehouse_code: "", qty: "100", unit_cost: "800", variant_sku: "", size: "", color: "", batch_no: "", lot_no: "", expiry_date: "", manufacture_date: "", serials: "", note: "Opening balance" },
      { sku: "PHRM-001", store_code: "DHK-01", warehouse_code: "", qty: "50", unit_cost: "10", variant_sku: "", size: "", color: "", batch_no: "BATCH-2027-01", lot_no: "", expiry_date: "2027-06-30", manufacture_date: "", serials: "", note: "" },
      { sku: "ELEC-001", store_code: "DHK-01", warehouse_code: "", qty: "2", unit_cost: "90", variant_sku: "", size: "", color: "", batch_no: "", lot_no: "", expiry_date: "", manufacture_date: "", serials: "IMEI001;IMEI002", note: "" },
    ]);
    saveTextFile(sample, "opening-stock-template.csv");
  };

  const handleBulkFile = async (file: File) => {
    const text = await file.text();
    const rows = parseCsv(text);
    setBulkFileName(file.name);
    setBulkRows(rows);
    setBulkResult(null);
  };

  const runBulkImport = async (dryRun: boolean) => {
    if (bulkRows.length === 0) {
      toast.error("Choose a CSV file first");
      return;
    }
    const res = await importOpeningStockMut.mutateAsync({
      rows: bulkRows.map(r => ({ data: r })),
      dry_run: dryRun,
    });
    setBulkResult(res);
    if (dryRun) {
      toast[res.errors.length > 0 ? "error" : "success"](res.message);
    } else {
      toast.success(res.message);
      if (res.errors.length === 0) {
        setBulkRows([]);
        setBulkFileName("");
        if (bulkFileInputRef.current) bulkFileInputRef.current.value = "";
      }
    }
  };

  // —— Opening stock batch builder (multi-row draft → approve workflow) ——
  const [rowForm, setRowForm] = useState<{
    product_id: string;
    variant_id: string;
    qty: number | string;
    unit_cost: number | string;
    batch_no: string;
    lot_no: string;
    expiry_date: string;
    manufacture_date: string;
    serials_text: string;
  }>({
    product_id: "", variant_id: "", qty: 1, unit_cost: "",
    batch_no: "", lot_no: "", expiry_date: "", manufacture_date: "", serials_text: "",
  });
  const [rowProductPickerOpen, setRowProductPickerOpen] = useState(false);
  const [rowCodeInput, setRowCodeInput] = useState("");
  const [cameraScannerOpen, setCameraScannerOpen] = useState(false);
  const [isResolvingCode, setIsResolvingCode] = useState(false);

  const rowProduct = useMemo(
    () => openingAvailableProducts.find(p => p.id === rowForm.product_id)
      || (productsQuery.data?.items ?? []).find(p => p.id === rowForm.product_id)
      || selectedProductCache,
    [openingAvailableProducts, productsQuery.data, rowForm.product_id, selectedProductCache],
  );

  useEffect(() => {
    if (rowProduct) {
      setRowCodeInput(rowProduct.sku);
    } else if (!rowForm.product_id) {
      setRowCodeInput("");
    }
  }, [rowProduct, rowForm.product_id]);

  const resolveProductByCode = async (codeToLookup: string) => {
    const raw = codeToLookup.trim();
    if (!raw) return;
    setIsResolvingCode(true);

    // 1. Check in available products list (exact SKU, barcode, or case-insensitive)
    const localHit = openingAvailableProducts.find(
      p => p.sku?.toLowerCase() === raw.toLowerCase()
        || (p.barcode && p.barcode.toLowerCase() === raw.toLowerCase())
    );
    if (localHit) {
      setSelectedProductCache(localHit);
      setRowForm(f => ({
        ...f,
        product_id: localHit.id,
        variant_id: "",
        qty: f.qty && Number(f.qty) > 0 ? f.qty : 1,
        unit_cost: localHit.base_price || (localHit as any).cost_price || 0,
      }));
      setRowCodeInput(localHit.sku);
      setRowProductPickerOpen(false);
      setIsResolvingCode(false);
      toast.success(`Selected: ${localHit.sku} · ${localHit.name}`);
      return;
    }

    // 2. Query remote search endpoint (/products?q=...)
    try {
      const qRes = await api.get<{ items: ApiProduct[] }>(`/products?q=${encodeURIComponent(raw)}&limit=10`);
      if (qRes.items && qRes.items.length > 0) {
        const exactMatch = qRes.items.find(
          p => p.sku?.toLowerCase() === raw.toLowerCase()
            || (p.barcode && p.barcode.toLowerCase() === raw.toLowerCase())
        ) || qRes.items[0];

        setSelectedProductCache(exactMatch);
        setRowForm(f => ({
          ...f,
          product_id: exactMatch.id,
          variant_id: "",
          qty: f.qty && Number(f.qty) > 0 ? f.qty : 1,
          unit_cost: exactMatch.base_price || (exactMatch as any).cost_price || 0,
        }));
        setRowCodeInput(exactMatch.sku);
        setRowProductPickerOpen(false);
        setIsResolvingCode(false);
        toast.success(`Found: ${exactMatch.sku} · ${exactMatch.name}`);
        return;
      }

      // 3. Try /products/barcode/{code}
      const bcRes = await api.get<any>(`/products/barcode/${encodeURIComponent(raw)}`);
      if (bcRes && bcRes.id) {
        setSelectedProductCache(bcRes);
        setRowForm(f => ({
          ...f,
          product_id: bcRes.id,
          variant_id: bcRes.matched_variant_id || "",
          qty: f.qty && Number(f.qty) > 0 ? f.qty : 1,
          unit_cost: bcRes.base_price || 0,
        }));
        setRowCodeInput(bcRes.sku);
        setRowProductPickerOpen(false);
        setIsResolvingCode(false);
        toast.success(`Found: ${bcRes.sku} · ${bcRes.name}`);
        return;
      }
    } catch {
      // not found
    }

    setIsResolvingCode(false);
    toast.error(`No product found with code "${raw}"`);
  };
  const rowPack = rowProduct?.industry_pack;
  const rowVariantsQuery = useProductVariants(rowPack === "fashion" ? rowForm.product_id : undefined);

  useEffect(() => {
    if (rowPack === "fashion" && (rowVariantsQuery.data ?? []).length === 1 && !rowForm.variant_id) {
      const v = rowVariantsQuery.data![0];
      setRowForm(f => ({
        ...f,
        variant_id: v.id,
        unit_cost: (v as any)?.additional_price ? (rowProduct?.base_price || 0) + (v as any).additional_price : f.unit_cost,
      }));
    }
  }, [rowPack, rowVariantsQuery.data, rowForm.variant_id, rowProduct]);

  const categoriesQuery = useCategories(undefined, useApi);
  const categoryMap = useMemo(
    () => new Map((categoriesQuery.data ?? []).map(c => [c.id, c.name])),
    [categoriesQuery.data],
  );
  const rowCategoryName = useMemo(() => {
    if (!rowProduct) return "—";
    if (rowProduct.category_id && categoryMap.has(rowProduct.category_id)) {
      return categoryMap.get(rowProduct.category_id)!;
    }
    const metaCat = (rowProduct.meta as any)?.category_name || (rowProduct.meta as any)?.category;
    if (metaCat) return String(metaCat);
    return "General";
  }, [rowProduct, categoryMap]);

  const [draftStoreId, setDraftStoreId] = useState(user?.store_id ?? "");
  const [draftNote, setDraftNote] = useState("");
  const [draftLines, setDraftLines] = useState<Array<OpeningStockDocumentLineIn & { sku: string; name: string; category_name: string }>>([]);
  const draftTotal = useMemo(
    () => draftLines.reduce((s, l) => s + l.qty * (l.unit_cost || 0), 0),
    [draftLines],
  );

  const rowCurrentStock = useMemo(() => {
    if (!rowForm.product_id || !draftStoreId) return null;
    if (rowForm.variant_id) {
      const vRow = (rawStockQuery.data ?? []).find(r => r.product_id === rowForm.product_id && (r as any).variant_id === rowForm.variant_id && r.store_id === draftStoreId);
      if (vRow) return vRow.qty_on_hand;
    }
    const row = (rawStockQuery.data ?? []).find(r => r.product_id === rowForm.product_id && (!(r as any).variant_id || (r as any).variant_id === null) && r.store_id === draftStoreId)
      || (rawStockQuery.data ?? []).find(r => r.product_id === rowForm.product_id && r.store_id === draftStoreId);
    return row?.qty_on_hand ?? 0;
  }, [rawStockQuery.data, rowForm.product_id, rowForm.variant_id, draftStoreId]);



  const rowExpiryStatus = useMemo(() => {
    if (!BATCH_PACKS.includes(rowPack ?? "") || !rowForm.expiry_date) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const expiry = new Date(rowForm.expiry_date);
    if (Number.isNaN(expiry.getTime())) return null;
    const daysLeft = Math.round((expiry.getTime() - today.getTime()) / 86400000);
    if (daysLeft < 0) return { level: "expired" as const, daysLeft };
    if (daysLeft < EXPIRY_WARNING_DAYS) return { level: "warning" as const, daysLeft };
    return { level: "ok" as const, daysLeft };
  }, [rowPack, rowForm.expiry_date]);

  const rowSerialsList = useMemo(
    () => rowForm.serials_text.split("\n").map(s => s.trim()).filter(Boolean),
    [rowForm.serials_text],
  );
  const rowSerialMismatch = SERIAL_PACKS.includes(rowPack ?? "")
    && (Number(rowForm.qty) || 0) > 0
    && rowSerialsList.length > 0
    && rowSerialsList.length !== Number(rowForm.qty);

  const rowValuation = (Number(rowForm.qty) || 0) * (Number(rowForm.unit_cost) || 0);

  const rowBatchesQuery = useProductBatches(rowForm.product_id, BATCH_PACKS.includes(rowPack ?? ""));
  const [rowBatchSuggestOpen, setRowBatchSuggestOpen] = useState(false);
  const rowBatchSuggestions = useMemo(() => {
    const q = rowForm.batch_no.trim().toLowerCase();
    const batches = rowBatchesQuery.data ?? [];
    if (!q) return batches;
    return batches.filter(b => b.batch_no.toLowerCase().includes(q));
  }, [rowBatchesQuery.data, rowForm.batch_no]);
  const rowExactBatchMatch = useMemo(
    () => (rowBatchesQuery.data ?? []).find(b => b.batch_no.toLowerCase() === rowForm.batch_no.trim().toLowerCase()),
    [rowBatchesQuery.data, rowForm.batch_no],
  );
  const applyRowBatchSuggestion = (b: { batch_no: string; lot_no?: string | null; expiry_date?: string | null; manufacture_date?: string | null }) => {
    setRowForm(f => ({
      ...f,
      batch_no: b.batch_no,
      lot_no: b.lot_no ?? f.lot_no,
      expiry_date: b.expiry_date ? b.expiry_date.slice(0, 10) : f.expiry_date,
      manufacture_date: b.manufacture_date ? b.manufacture_date.slice(0, 10) : f.manufacture_date,
    }));
    setRowBatchSuggestOpen(false);
  };

  const resetRowForm = () => {
    setRowForm({
      product_id: "", variant_id: "", qty: 1, unit_cost: "",
      batch_no: "", lot_no: "", expiry_date: "", manufacture_date: "", serials_text: "",
    });
    setRowCodeInput("");
  };

  const addRowToDraft = () => {
    if (!rowForm.product_id) {
      toast.error("Please select a product first");
      return;
    }
    const enteredQty = Number(rowForm.qty) || 0;
    if (enteredQty <= 0) {
      toast.error("Please enter a valid quantity greater than 0");
      return;
    }
    const unitCost = Number(rowForm.unit_cost) || 0;
    if (unitCost < 0) {
      toast.error("Unit cost cannot be negative");
      return;
    }
    const hasVariants = (rowVariantsQuery.data ?? []).length > 0;
    if (rowPack === "fashion" && rowVariantsQuery.isLoading) {
      toast.error("Variants are loading, please wait...");
      return;
    }
    if (rowPack === "fashion" && hasVariants && !rowForm.variant_id) {
      toast.error("Please select a variant (size / color) for this fashion product");
      return;
    }
    if (rowExpiryStatus?.level === "expired") {
      toast.error("Expiry date is in the past — cannot add expired stock");
      return;
    }
    if (SERIAL_PACKS.includes(rowPack ?? "") && rowSerialsList.length !== enteredQty) {
      toast.error(`Serial count (${rowSerialsList.length}) must match quantity (${enteredQty})`);
      return;
    }
    const selectedVariant = (rowVariantsQuery.data ?? []).find(v => v.id === rowForm.variant_id);
    const variantParts: string[] = [];
    if (selectedVariant?.size) variantParts.push(`Size: ${selectedVariant.size}`);
    if (selectedVariant?.color) variantParts.push(`Color: ${selectedVariant.color}`);
    const variantLabel = variantParts.join(" · ") || selectedVariant?.variant_code;

    setDraftLines(prev => [...prev, {
      product_id: rowForm.product_id,
      sku: selectedVariant?.variant_code || rowProduct!.sku,
      name: variantLabel ? `${rowProduct!.name} (${variantLabel})` : rowProduct!.name,
      category_name: rowCategoryName,
      variant_id: rowForm.variant_id || undefined,
      qty: enteredQty,
      unit_cost: unitCost,
      batch_no: rowForm.batch_no || undefined,
      lot_no: rowForm.lot_no || undefined,
      expiry_date: rowForm.expiry_date || undefined,
      manufacture_date: rowForm.manufacture_date || undefined,
      serials: rowSerialsList.length > 0 ? rowSerialsList : undefined,
    }]);
    resetRowForm();
  };

  const removeDraftLine = (idx: number) => setDraftLines(prev => prev.filter((_, i) => i !== idx));

  const createDocMut = useCreateOpeningStockDocument();
  const saveDraftBatch = async () => {
    if (draftLines.length === 0) {
      toast.error("Add at least one item to the batch");
      return;
    }
    await createDocMut.mutateAsync({
      store_id: draftStoreId || undefined,
      note: draftNote || undefined,
      lines: draftLines.map(({ sku, name, ...ln }) => ln),
    });
    setDraftLines([]);
    setDraftNote("");
  };

  // —— Opening stock documents (list / approve / cancel) ——
  const [docStatusFilter, setDocStatusFilter] = useState("all");
  const [docPackFilter, setDocPackFilterRaw] = useState<string>("all");
  const docPackFilterTouched = useRef(false);
  const setDocPackFilter = (v: string) => {
    docPackFilterTouched.current = true;
    setDocPackFilterRaw(v);
  };
  useEffect(() => {
    if (docPackFilterTouched.current) return;
    setDocPackFilterRaw(app.posMode !== "universal" && app.isPackEnabled(app.posMode) ? app.posMode : "all");
  }, [app.posMode]);

  const openingDocsQuery = useOpeningStockDocuments({
    status: docStatusFilter !== "all" ? docStatusFilter : undefined,
    industry: docPackFilter !== "all" ? docPackFilter : undefined,
    limit: 100,
  });

  const productPackMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of productsQuery.data?.items ?? []) {
      if (p.industry_pack) {
        if (p.id) map.set(p.id, p.industry_pack);
        if (p.sku) map.set(p.sku.toLowerCase(), p.industry_pack);
        if (p.name) map.set(p.name.toLowerCase(), p.industry_pack);
      }
    }
    return map;
  }, [productsQuery.data?.items]);

  const getDocPacks = (doc: OpeningStockDocument): string[] => {
    if (doc.industry_packs && doc.industry_packs.length > 0) {
      return doc.industry_packs;
    }
    const packs = new Set<string>();
    for (const sku of doc.product_skus ?? []) {
      const pack = productPackMap.get(sku.toLowerCase());
      if (pack) packs.add(pack);
    }
    for (const name of doc.product_names ?? []) {
      const pack = productPackMap.get(name.toLowerCase());
      if (pack) packs.add(pack);
    }
    return Array.from(packs);
  };
  const [viewDocId, setViewDocId] = useState<string | null>(null);
  const viewDocQuery = useOpeningStockDocument(viewDocId ?? undefined);
  const approveDocMut = useApproveOpeningStockDocument();
  const cancelDocMut = useCancelOpeningStockDocument();
  const revertDocMut = useRevertOpeningStockDocument();
  const deleteDocMut = useDeleteOpeningStockDocument();
  const clearOpeningStockMut = useClearOpeningStock();
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [clearAdminPassword, setClearAdminPassword] = useState("");
  const [revertConfirmDoc, setRevertConfirmDoc] = useState<{ id: string; os_number: string } | null>(null);
  const [deleteConfirmDoc, setDeleteConfirmDoc] = useState<{ id: string; os_number: string } | null>(null);

  const [reorderOpen, setReorderOpen] = useState(false);
  const [reorderItem, setReorderItem] = useState<ReorderItem | null>(null);

  const [adjOpen, setAdjOpen] = useState(false);
  const [adjProductPickerOpen, setAdjProductPickerOpen] = useState(false);
  const [xferOpen, setXferOpen] = useState(false);
  const [adjForm, setAdjForm] = useState({ store_id: user?.store_id ?? "", product_id: "", sku: "", qty_after: 0, reason: "" });

  const storeList = useMemo(() => {
    if (useApi && storesQuery.data && storesQuery.data.length > 0) {
      return storesQuery.data.filter(s => Boolean(s.id)).map(s => ({ id: String(s.id), name: s.name }));
    }
    return stores.map(s => ({ id: String(s.id || s.code), name: s.name }));
  }, [useApi, storesQuery.data]);

  const adjStoreStock = useMemo(() => {
    if (useApi) {
      const stockMap = new Map<string, number>();
      for (const r of rawStockQuery.data ?? []) {
        if (!r.product_id) continue;
        if (adjForm.store_id && r.store_id && r.store_id !== adjForm.store_id) continue;
        const cur = stockMap.get(r.product_id) ?? 0;
        stockMap.set(r.product_id, cur + (r.qty_on_hand ?? 0));
      }

      if (openingAvailableProducts.length > 0) {
        return openingAvailableProducts.map(p => ({
          product_id: String(p.id),
          sku: p.sku || "N/A",
          name: p.name || "Unnamed Product",
          barcode: p.barcode || "",
          qty_on_hand: stockMap.get(p.id) ?? 0,
        }));
      }

      if (rawStockQuery.data && rawStockQuery.data.length > 0) {
        return rawStockQuery.data
          .filter(r => Boolean(r.product_id) && (r.store_id === adjForm.store_id || !adjForm.store_id))
          .map(r => ({
            product_id: String(r.product_id),
            sku: r.sku || "N/A",
            name: r.name || "Unnamed Product",
            barcode: "",
            qty_on_hand: r.qty_on_hand ?? 0,
          }));
      }
    }
    return demoProducts.map(p => ({
      product_id: String((p as any).id || p.sku),
      sku: p.sku,
      name: p.name,
      barcode: String((p as any).barcode || ""),
      qty_on_hand: p.stock ?? 0,
    }));
  }, [useApi, rawStockQuery.data, adjForm.store_id, openingAvailableProducts]);

  const currentQty = useMemo(() => {
    if (!adjForm.product_id) return 0;
    const item = adjStoreStock.find(r => r.product_id === adjForm.product_id);
    return item?.qty_on_hand ?? 0;
  }, [adjStoreStock, adjForm.product_id]);

  const selectedAdjItem = useMemo(
    () => adjStoreStock.find(r => r.product_id === adjForm.product_id),
    [adjStoreStock, adjForm.product_id],
  );
  const [adjProductSearch, setAdjProductSearch] = useState("");
  const [adjProductOpen, setAdjProductOpen] = useState(false);
  const filteredAdjProducts = useMemo(() => {
    const q = adjProductSearch.trim().toLowerCase();
    if (!q) return adjStoreStock;
    return adjStoreStock.filter(
      r =>
        r.sku.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.barcode && r.barcode.toLowerCase().includes(q)) ||
        r.product_id.toLowerCase().includes(q),
    );
  }, [adjStoreStock, adjProductSearch]);

  const [historySearch, setHistorySearch] = useState("");
  const [historyStoreFilter, setHistoryStoreFilter] = useState("all");

  const filteredHistory = useMemo(() => {
    let list = adjustmentsQuery.data ?? [];
    if (historySearch.trim()) {
      const q = historySearch.toLowerCase();
      list = list.filter(h => h.sku.toLowerCase().includes(q) || h.name.toLowerCase().includes(q));
    }
    if (historyStoreFilter !== "all") {
      list = list.filter(h => h.store_id === historyStoreFilter);
    }
    return list;
  }, [adjustmentsQuery.data, historySearch, historyStoreFilter]);

  const [xferForm, setXferForm] = useState({
    from_store_id: user?.store_id ?? "",
    product_id: "",
    to_store_id: "",
    qty: 1,
    reason: "",
  });
  const [xferProductSearch, setXferProductSearch] = useState("");
  const [xferProductOpen, setXferProductOpen] = useState(false);
  const selectedXferItem = useMemo(
    () => adjStoreStock.find(r => r.product_id === xferForm.product_id),
    [adjStoreStock, xferForm.product_id],
  );
  const filteredXferProducts = useMemo(() => {
    const q = xferProductSearch.trim().toLowerCase();
    if (!q) return adjStoreStock;
    return adjStoreStock.filter(
      r =>
        r.sku.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.barcode && r.barcode.toLowerCase().includes(q)) ||
        r.product_id.toLowerCase().includes(q),
    );
  }, [adjStoreStock, xferProductSearch]);

  const xferSourceStock = useMemo(() => {
    if (!xferForm.product_id) return 0;
    const match = (rawStockQuery.data ?? []).find(
      r => r.product_id === xferForm.product_id && (r.store_id === xferForm.from_store_id || !xferForm.from_store_id)
    );
    return match?.qty_on_hand ?? 0;
  }, [rawStockQuery.data, xferForm.product_id, xferForm.from_store_id]);

  const isLoading = useApi && (stockQuery.isLoading || productsQuery.isLoading);
  const isError = useApi && (stockQuery.isError || productsQuery.isError);
  const refetch = () => { stockQuery.refetch(); productsQuery.refetch(); adjustmentsQuery.refetch(); };

  const apiStockRows: StockRow[] = useMemo(() => {
    if (!stockQuery.data) return [];
    const productMap = new Map((productsQuery.data?.items ?? []).map(p => [p.id, p]));
    return stockQuery.data
      .map(s => {
        const product = productMap.get(s.product_id);
        return {
          productId: s.product_id,
          sku: s.sku,
          name: s.name,
          barcode: product?.barcode ?? undefined,
          qty: s.qty_on_hand,
          reserved: s.qty_reserved ?? 0,
          available: s.qty_available ?? s.qty_on_hand - (s.qty_reserved ?? 0),
          price: product?.base_price ?? 0,
          industry: product?.industry_pack,
          meta: product?.meta ?? {},
        };
      })
      .filter(r => !activePackFilter || r.industry === activePackFilter);
  }, [stockQuery.data, productsQuery.data, activePackFilter]);

  const demoStockRows: StockRow[] = useMemo(
    () => demoProducts.map(p => ({
      sku: p.sku,
      name: p.name,
      qty: p.stock,
      reserved: 0,
      available: p.stock,
      price: p.price,
      industry: p.industry,
    })),
    [],
  );

  const { rows: stockRows, isEmpty: stockEmpty } = resolveLiveRows(useApi, apiStockRows, isLoading, demoStockRows);

  const filteredStockRows = useMemo(() => {
    const q = stockSearch.trim().toLowerCase();
    if (!q) return stockRows;
    return stockRows.filter(r => {
      if (r.sku && r.sku.toLowerCase().includes(q)) return true;
      if (r.name && r.name.toLowerCase().includes(q)) return true;
      if (r.barcode && r.barcode.toLowerCase().includes(q)) return true;
      if (r.industry && r.industry.toLowerCase().includes(q)) return true;
      if (r.meta) {
        for (const v of Object.values(r.meta)) {
          if (v != null && String(v).toLowerCase().includes(q)) return true;
        }
      }
      return false;
    });
  }, [stockRows, stockSearch]);

  const formatMetaCell = (row: StockRow, key: string) => {
    const v = row.meta?.[key];
    if (v === undefined || v === null || v === "") return "—";
    if (typeof v === "boolean") return v ? "Yes" : "No";
    return String(v);
  };

  const apiLowStock: ReorderItem[] = useMemo(() => {
    if (useApi && lowStockQuery.data) {
      return lowStockQuery.data.map((l) => ({
        product_id: l.product_id,
        sku: l.sku,
        name: l.name,
        qty_on_hand: l.qty_on_hand,
        qty_available: l.qty_available,
        reorder_point: l.reorder_point,
      }));
    }
    return stockRows.filter((r) => r.available < threshold).map((r) => ({
      product_id: r.productId ?? r.sku,
      sku: r.sku,
      name: r.name,
      qty_on_hand: r.qty,
      qty_available: r.available,
      reorder_point: threshold,
    }));
  }, [useApi, lowStockQuery.data, stockRows, threshold]);

  const mockLowStockRows = useMemo(() => {
    return lowStock.filter((l) => l.qty < Math.max(l.reorder, threshold));
  }, [threshold]);

  const totalSkus = stockRows.length;
  const totalUnits = stockRows.reduce((s, r) => s + r.available, 0);
  const totalValue = stockRows.reduce((s, r) => s + r.available * r.price, 0);
  const lowCount = apiLowStock.length;
  const warehouseCount = useApi ? (storesQuery.data?.length ?? 0) : stores.length;

  const openReorder = (item: ReorderItem) => {
    setReorderItem(item);
    setReorderOpen(true);
  };

  const submitTransfer = async () => {
    if (!xferForm.product_id || !xferForm.to_store_id || xferForm.qty <= 0) {
      toast.error("Product, destination store, and quantity required");
      return;
    }
    if (xferForm.from_store_id && xferForm.from_store_id === xferForm.to_store_id) {
      toast.error("Source and destination stores must be different");
      return;
    }
    try {
      if (useApi) {
        await transferMut.mutateAsync({
          product_id: xferForm.product_id,
          from_store_id: xferForm.from_store_id || user?.store_id || undefined,
          to_store_id: xferForm.to_store_id,
          qty: xferForm.qty,
          reason: xferForm.reason || "Manual inter-store transfer",
        });
      } else {
        toast.success(`Transferred ${xferForm.qty} units (demo mode)`);
      }
      setXferOpen(false);
      setXferForm({ from_store_id: user?.store_id ?? "", product_id: "", to_store_id: "", qty: 1, reason: "" });
    } catch {
      // Handled by onError toast
    }
  };

  const escapeHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const printAuditSheet = () => {
    const w = window.open("", "_blank", "width=850,height=900");
    if (!w) {
      toast.error("Pop-up blocked. Allow pop-ups to print the audit sheet.");
      return;
    }
    const rows = filteredStockRows
      .slice()
      .sort((a, b) => a.sku.localeCompare(b.sku))
      .map(
        (r) => `<tr>
          <td>${escapeHtml(r.sku)}</td>
          <td>${escapeHtml(r.name)}</td>
          <td class="blank"></td>
          <td class="blank"></td>
        </tr>`,
      )
      .join("");
    const packLabel = activePackFilter
      ? INDUSTRY_PACKS.find((p) => p.id === activePackFilter)?.shortName ?? activePackFilter
      : "All packs";
    const html = `<!doctype html><html><head><title>Physical Inventory Audit Sheet</title>
      <style>
        @page { size: A4; margin: 14mm; }
        body { font-family: ui-sans-serif, system-ui, Arial, sans-serif; color: #1f1d18; margin: 0; padding: 0; }
        h1 { font-size: 18px; margin: 0 0 4px; }
        .meta { font-size: 12px; color: #555; margin-bottom: 14px; }
        .meta span { margin-right: 18px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; }
        th { background: #eee; text-transform: uppercase; font-size: 10px; letter-spacing: 0.04em; }
        td.blank { min-width: 90px; height: 26px; }
        tfoot td { border: none; padding-top: 20px; font-size: 11px; }
      </style></head><body>
      <h1>Physical Inventory Audit Sheet</h1>
      <div class="meta">
        <span>Pack: ${packLabel}</span>
        <span>Printed: ${new Date().toLocaleString()}</span>
        <span>Counted by: ______________________</span>
        <span>Date: ______________________</span>
      </div>
      <table>
        <thead>
          <tr><th>SKU</th><th>Item name</th><th>Physical count</th><th>Notes</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <script>window.onload=()=>{try{window.focus();window.print();}catch(e){}};</script>
      </body></html>`;
    w.document.write(html);
    w.document.close();
  };

  const printOpeningStockSlip = () => {
    const rows = openingHistoryQuery.data ?? [];
    const w = window.open("", "_blank", "width=850,height=900");
    if (!w) {
      toast.error("Pop-up blocked. Allow pop-ups to print the slip.");
      return;
    }
    const tableRows = rows
      .map(
        (r) => `<tr>
          <td>${escapeHtml(r.created_at ? new Date(r.created_at).toLocaleString() : "—")}</td>
          <td>${escapeHtml(r.sku)}</td>
          <td>${escapeHtml(r.name)}</td>
          <td class="right">${r.in_qty}</td>
          <td class="right">${r.balance_after}</td>
        </tr>`,
      )
      .join("");
    const html = `<!doctype html><html><head><title>Opening Stock Initialization Slip</title>
      <style>
        @page { size: A4; margin: 14mm; }
        body { font-family: ui-sans-serif, system-ui, Arial, sans-serif; color: #1f1d18; margin: 0; padding: 0; }
        h1 { font-size: 18px; margin: 0 0 4px; }
        .meta { font-size: 12px; color: #555; margin-bottom: 14px; }
        .meta span { margin-right: 18px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; }
        th { background: #eee; text-transform: uppercase; font-size: 10px; letter-spacing: 0.04em; }
        td.right, th.right { text-align: right; }
      </style></head><body>
      <h1>Opening Stock Initialization Slip</h1>
      <div class="meta">
        <span>Printed: ${new Date().toLocaleString()}</span>
        <span>Verified by: ______________________</span>
        <span>Date: ______________________</span>
      </div>
      <table>
        <thead>
          <tr><th>Timestamp</th><th>SKU</th><th>Item name</th><th class="right">Qty</th><th class="right">Balance after</th></tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
      <script>window.onload=()=>{try{window.focus();window.print();}catch(e){}};</script>
      </body></html>`;
    w.document.write(html);
    w.document.close();
  };

  const exportOpeningStockCSV = () => {
    const rows = openingHistoryQuery.data ?? [];
    if (rows.length === 0) {
      toast.error("No opening stock postings to export");
      return;
    }
    const csvEscape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const header = ["Timestamp", "SKU", "Name", "Qty", "Balance after"];
    const lines = rows.map((r) => [
      r.created_at ? new Date(r.created_at).toLocaleString() : "",
      r.sku,
      r.name,
      r.in_qty,
      r.balance_after,
    ].map(csvEscape).join(","));
    const csv = [header.map(csvEscape).join(","), ...lines].join("\n");
    saveTextFile(csv, timestampedFilename("opening-stock", "csv"));
  };

  const submitAdjust = async () => {
    if (!adjForm.product_id || !adjForm.reason.trim()) {
      toast.error("Product and reason required");
      return;
    }
    if (useApi) {
      await adjustMut.mutateAsync({
        product_id: adjForm.product_id,
        store_id: adjForm.store_id || undefined,
        qty_after: adjForm.qty_after,
        reason: adjForm.reason,
      });
    } else {
      toast.success("Stock adjustment recorded");
    }
    setAdjOpen(false);
    setAdjForm({ store_id: user?.store_id ?? "", product_id: "", sku: "", qty_after: 0, reason: "" });
  };

  return (
    <>
      <PageHeader
        title={
          activeTab === "adjustment"
            ? "Stock Adjustment"
            : activeTab === "history"
            ? "Adjustment History"
            : activeTab === "opening"
            ? "Opening Stock & Initial Balances"
            : activeTab === "opening-docs"
            ? "Opening Stock Documents List"
            : "Stock Levels"
        }
        subtitle={
          activeTab === "adjustment"
            ? "Adjust product stock quantity with audit tracking and real-time database sync"
            : activeTab === "history"
            ? "Historical stock adjustments audit log"
            : activeTab === "opening"
            ? "Initialize starting inventory quantities, unit costs, batches, and valuations"
            : activeTab === "opening-docs"
            ? "Audit log of submitted and draft opening stock initialization documents"
            : useApi
            ? "Stock from backend · adjustments sync to database"
            : "Stock by store and warehouse · adjustments and transfers."
        }
      />
      <PageBody className="space-y-5">
        {/* Navigation Tabs and Quick Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: "levels" as InventoryTab, label: "Stock Levels" },
              { id: "adjustment" as InventoryTab, label: "Stock Adjustment" },
              { id: "history" as InventoryTab, label: "Adjustment History" },
              ...(useApi ? [
                { id: "opening" as InventoryTab, label: "Opening Stock" },
                { id: "opening-docs" as InventoryTab, label: "Opening Documents" },
              ] : []),
            ].map(tab => (
              <Button
                key={tab.id}
                variant={activeTab === tab.id ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs font-medium cursor-pointer"
                onClick={() => {
                  setActiveTab(tab.id);
                  navigate({ to: "/app/inventory", search: { tab: tab.id } });
                }}
              >
                {tab.label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 text-xs font-medium cursor-pointer border-primary/30 text-primary hover:bg-primary/10"
              onClick={() => setXferOpen(true)}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              <span>Inter-Store Transfer</span>
            </Button>
          </div>
        </div>

        {isError && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Failed to load inventory from backend.
            <Button variant="outline" size="sm" className="ml-auto" onClick={refetch}>Retry</Button>
          </div>
        )}

        {activeTab === "levels" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
            ) : (
              <>
                <StatCard label="Total stock value" value={fmtBDT(totalValue)} icon={<Boxes className="h-4 w-4" />} />
                <StatCard label="Total available" value={totalUnits.toLocaleString()} icon={<Package className="h-4 w-4" />} />
                <StatCard label="Total SKUs" value={String(totalSkus)} icon={<Boxes className="h-4 w-4" />} />
                <StatCard label="Low stock" value={String(lowCount)} icon={<AlertTriangle className="h-4 w-4" />} />
                <StatCard label="Warehouses" value={String(warehouseCount)} icon={<Warehouse className="h-4 w-4" />} />
              </>
            )}
          </div>
        )}

        {activeTab === "levels" && (
          useApi ? (
            <SectionCard title="Stock levels">
              <FilterBar>
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search SKU, product name, barcode..."
                    className="h-9 pl-9 text-xs"
                    value={stockSearch}
                    onChange={e => setStockSearch(e.target.value)}
                  />
                  {stockSearch && (
                    <button
                      type="button"
                      onClick={() => setStockSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded cursor-pointer"
                      title="Clear search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <Select value={packFilter} onValueChange={setPackFilter}>
                  <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Industry pack" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All enabled packs</SelectItem>
                    {INDUSTRY_PACKS.filter(p => app.isPackEnabled(p.id)).map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.shortName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {activePackFilter && allDynamicColumns.length > 0 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-9 gap-1.5 shrink-0 text-xs bg-transparent">
                        <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>Columns ({visibleCustomColumns.size})</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2" align="end">
                      <div className="space-y-1.5">
                        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground border-b border-border mb-1 text-left">
                          Toggle Dynamic Columns
                        </div>
                        <div className="max-h-60 overflow-y-auto space-y-1">
                          {allDynamicColumns.map(col => {
                            const checked = visibleCustomColumns.has(col.key);
                            return (
                              <label
                                key={col.key}
                                className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary/50 cursor-pointer text-xs font-medium transition-colors text-left"
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() => toggleColumnVisible(col.key)}
                                />
                                <span className="truncate">{col.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </FilterBar>
              {isLoading ? (
                <div className="space-y-2 p-5">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : filteredStockRows.length === 0 ? (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  {stockSearch ? (
                    <div className="space-y-2">
                      <p>No stock records matching &ldquo;{stockSearch}&rdquo;</p>
                      <Button variant="outline" size="sm" onClick={() => setStockSearch("")}>Clear search</Button>
                    </div>
                  ) : (
                    "No stock records found"
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="w-8 px-2 py-2.5" />
                        <th className="px-5 py-2.5 text-left">SKU</th>
                        <th className="px-3 py-2.5 text-left">Name</th>
                        {!activePackFilter && <th className="px-3 py-2.5 text-left">Pack</th>}
                        {dynamicColumns.map(col => (
                          <th key={col.key} className="px-3 py-2.5 text-left">{col.label}</th>
                        ))}
                        <th className="px-3 py-2.5 text-right">On hand</th>
                        <th className="px-3 py-2.5 text-right">Reserved</th>
                        <th className="px-3 py-2.5 text-right">Available</th>
                        <th className="px-5 py-2.5 text-right">Value</th>
                        <th className="px-3 py-2.5 text-right">Audit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredStockRows.map(r => {
                        const branchRows = r.productId ? branchStockByProduct.get(r.productId) ?? [] : [];
                        const rowKey = r.productId ?? r.sku;
                        const isExpanded = rowKey ? expandedSkus.has(rowKey) : false;
                        const canExpand = true; // Every inventory item can expand to view details
                        return (
                          <React.Fragment key={rowKey}>
                            <tr
                              onClick={() => rowKey && toggleExpanded(rowKey)}
                              className={`cursor-pointer transition-colors group ${
                                isExpanded ? "bg-primary/5" : "hover:bg-accent/40"
                              }`}
                            >
                              <td className="px-2 py-3 text-center">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    rowKey && toggleExpanded(rowKey);
                                  }}
                                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-all cursor-pointer"
                                  aria-label={isExpanded ? "Collapse stock breakdown" : "Expand stock breakdown"}
                                >
                                  <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? "rotate-90 text-primary font-bold" : "group-hover:text-foreground"}`} />
                                </button>
                              </td>
                              <td className="px-5 py-3 font-mono text-xs font-semibold text-foreground">{r.sku}</td>
                              <td className="px-3 py-3 font-medium text-foreground group-hover:text-primary transition-colors">{r.name}</td>
                              {!activePackFilter && (
                                <td className="px-3 py-3 text-muted-foreground">
                                  {INDUSTRY_PACKS.find(p => p.id === r.industry)?.shortName ?? r.industry ?? "—"}
                                </td>
                              )}
                              {dynamicColumns.map(col => (
                                <td key={col.key} className="px-3 py-3 text-muted-foreground">{formatMetaCell(r, col.key)}</td>
                              ))}
                              <td className={`px-3 py-3 text-right tabular-nums ${r.qty < 20 ? "text-destructive font-semibold" : "font-medium"}`}>{r.qty}</td>
                              <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{r.reserved}</td>
                              <td className={`px-3 py-3 text-right tabular-nums ${r.available < 20 ? "text-destructive font-semibold" : "font-semibold"}`}>{r.available}</td>
                              <td className="px-5 py-3 text-right tabular-nums font-semibold">{fmtBDT(r.available * r.price)}</td>
                              <td className="px-3 py-3 text-right" onClick={e => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-1">
                                  {r.productId && (
                                    <Link
                                      to="/app/stock-ledger"
                                      search={{ product_id: r.productId, sku: r.sku }}
                                      className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                                      title={`Audit ledger for ${r.sku}`}
                                      aria-label={`Audit ledger for ${r.sku}`}
                                    >
                                      <ScrollText className="h-4 w-4" />
                                    </Link>
                                  )}
                                  {useApi && r.productId && (
                                    <PermissionGate perm="inventory.adjust">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setAdjForm({
                                            store_id: user?.store_id ?? "",
                                            product_id: r.productId!,
                                            sku: r.sku,
                                            qty_after: r.qty,
                                            reason: "",
                                          });
                                          setAdjOpen(true);
                                        }}
                                        className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                                        title={`Adjust stock for ${r.sku}`}
                                        aria-label={`Adjust stock for ${r.sku}`}
                                      >
                                        <Plus className="h-4 w-4" />
                                      </button>
                                    </PermissionGate>
                                  )}
                                </div>
                              </td>
                            </tr>
                            {isExpanded && (() => {
                              const definedSpecs = allDynamicColumns
                                .map(col => ({ key: col.key, label: col.label, val: formatMetaCell(r, col.key) }))
                                .filter(item => item.val !== "—");

                              return (
                                <tr className="bg-secondary/10">
                                  <td colSpan={8 + (activePackFilter ? 0 : 1) + dynamicColumns.length} className="px-4 py-4 sm:px-6 border-y border-border/60">
                                    <div className="rounded-xl border border-border/70 bg-card p-4 sm:p-5 space-y-4 shadow-sm text-left">
                                      {/* Header Bar */}
                                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/50 pb-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                                            <Boxes className="h-4 w-4 text-primary" /> Stock &amp; Location Breakdown
                                          </span>
                                          <Badge variant="outline" className="font-mono text-xs font-bold border-primary/30 text-primary bg-primary/5">
                                            {r.sku}
                                          </Badge>
                                          {r.industry && (
                                            <Badge variant="secondary" className="text-xs capitalize font-medium">
                                              {INDUSTRY_PACKS.find(ip => ip.id === r.industry)?.shortName ?? r.industry}
                                            </Badge>
                                          )}
                                          <Badge
                                            variant="outline"
                                            className={`text-[11px] font-semibold ${
                                              r.available > 10
                                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                                                : r.available > 0
                                                ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
                                                : "bg-destructive/10 text-destructive border-destructive/30"
                                            }`}
                                          >
                                            {r.available > 10 ? "In Stock" : r.available > 0 ? "Low Stock" : "Out of Stock"}
                                          </Badge>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2">
                                          {r.productId && (
                                            <Link
                                              to="/app/stock-ledger"
                                              search={{ product_id: r.productId, sku: r.sku }}
                                              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border border-border/70 hover:bg-secondary/80 text-foreground transition-colors cursor-pointer"
                                            >
                                              <ScrollText className="h-3.5 w-3.5 text-primary" />
                                              <span>Stock Ledger</span>
                                            </Link>
                                          )}
                                          {useApi && r.productId && (
                                            <PermissionGate perm="inventory.adjust">
                                              <Button
                                                size="sm"
                                                variant="default"
                                                className="h-8 text-xs gap-1.5 cursor-pointer shadow-xs"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setAdjForm({
                                                    store_id: user?.store_id ?? (typeof store === "string" ? store : ""),
                                                    product_id: r.productId!,
                                                    sku: r.sku,
                                                    qty_after: r.qty,
                                                    reason: "",
                                                  });
                                                  setAdjOpen(true);
                                                }}
                                              >
                                                <Plus className="h-3.5 w-3.5" />
                                                <span>Adjust Stock</span>
                                              </Button>
                                            </PermissionGate>
                                          )}
                                        </div>
                                      </div>

                                      {/* Quick Metrics Strip */}
                                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        <div className="rounded-lg border border-border/60 bg-secondary/15 p-3 space-y-1">
                                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Product Name</span>
                                          <div className="font-semibold text-foreground text-xs truncate" title={r.name}>{r.name}</div>
                                        </div>
                                        <div className="rounded-lg border border-border/60 bg-secondary/15 p-3 space-y-1">
                                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Primary Barcode</span>
                                          <div className="font-mono text-xs font-semibold text-foreground">{r.barcode || r.sku || "—"}</div>
                                        </div>
                                        <div className="rounded-lg border border-border/60 bg-secondary/15 p-3 space-y-1">
                                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Total Available</span>
                                          <div className="font-bold text-sm text-foreground">
                                            {r.available} <span className="text-xs font-normal text-muted-foreground">units</span>
                                          </div>
                                        </div>
                                        <div className="rounded-lg border border-border/60 bg-secondary/15 p-3 space-y-1">
                                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Stock Valuation</span>
                                          <div className="font-bold text-sm text-primary">{fmtBDT(r.available * r.price)}</div>
                                        </div>
                                      </div>

                                      {/* 2-Column: Store Inventory Breakdown & Active Batches (FEFO) */}
                                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                        {/* Left: Store Inventory Breakdown */}
                                        <div className="rounded-lg border border-border/60 bg-secondary/10 p-3.5 space-y-2.5">
                                          <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                              <Warehouse className="h-3.5 w-3.5 text-primary" /> Store Inventory Breakdown
                                            </span>
                                            <span className="text-[10px] text-muted-foreground">Multi-location on-hand</span>
                                          </div>

                                          {branchRows.length > 0 ? (
                                            <div className="rounded-lg border border-border/60 bg-background overflow-hidden">
                                              <table className="w-full text-xs">
                                                <thead className="bg-secondary/40 text-muted-foreground">
                                                  <tr>
                                                    <th className="px-3 py-2 text-left font-semibold">Store</th>
                                                    <th className="px-3 py-2 text-right font-semibold">On hand</th>
                                                    <th className="px-3 py-2 text-right font-semibold">Reserved</th>
                                                    <th className="px-3 py-2 text-right font-semibold">Available</th>
                                                    {useApi && <th className="px-3 py-2 text-right font-semibold">Action</th>}
                                                  </tr>
                                                </thead>
                                                <tbody className="divide-y divide-border/40">
                                                  {branchRows.map(b => (
                                                    <tr key={b.store_id} className="hover:bg-secondary/20 transition-colors">
                                                      <td className="px-3 py-2 text-left font-medium text-foreground">
                                                        {(b as any).store_name || (b as any).store_code || "Main Store"}
                                                      </td>
                                                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{b.qty_on_hand}</td>
                                                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{b.qty_reserved}</td>
                                                      <td className="px-3 py-2 text-right tabular-nums font-bold text-primary">{b.qty_available}</td>
                                                      {useApi && (
                                                        <td className="px-3 py-2 text-right">
                                                          <PermissionGate perm="inventory.adjust">
                                                            <Button
                                                              size="sm"
                                                              variant="ghost"
                                                              className="h-6 text-[11px] px-2 hover:bg-primary/10 hover:text-primary cursor-pointer"
                                                              onClick={(e) => {
                                                                e.stopPropagation();
                                                                setAdjForm({
                                                                  store_id: b.store_id || "",
                                                                  product_id: r.productId!,
                                                                  sku: r.sku,
                                                                  qty_after: b.qty_on_hand,
                                                                  reason: "",
                                                                });
                                                                setAdjOpen(true);
                                                              }}
                                                            >
                                                              Adjust
                                                            </Button>
                                                          </PermissionGate>
                                                        </td>
                                                      )}
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            </div>
                                          ) : (
                                            <div className="rounded-lg border border-dashed border-border/70 bg-background/50 p-3 text-xs text-muted-foreground">
                                              Current Store: <strong className="text-foreground">{r.available} units available</strong> ({r.qty} total on-hand)
                                            </div>
                                          )}
                                        </div>

                                        {/* Right: Active Batches & Expiry (FEFO) */}
                                        <div className="rounded-lg border border-border/60 bg-secondary/10 p-3.5 space-y-2.5">
                                          <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                              <Calendar className="h-3.5 w-3.5 text-primary" /> Active Batches &amp; Expiry (FEFO)
                                            </span>
                                            <span className="text-[10px] text-muted-foreground">Earliest expiry dispatch</span>
                                          </div>
                                          {useApi && r.productId ? (
                                            <InventoryBatchesDetail productId={r.productId} />
                                          ) : (
                                            <div className="rounded-lg border border-dashed border-border/70 bg-background/50 p-3 text-xs text-muted-foreground">
                                              Batches tracking available in connected database mode.
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      {/* Product Specifications & Attributes (Only if defined) */}
                                      {definedSpecs.length > 0 && (
                                        <div className="rounded-lg border border-border/60 bg-secondary/10 p-3.5 space-y-2">
                                          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                                            Product Specifications &amp; Attributes
                                          </span>
                                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                                            {definedSpecs.map(col => (
                                              <div key={col.key} className="bg-background/80 border border-border/60 p-2.5 rounded-lg text-xs">
                                                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate mb-0.5">
                                                  {col.label}
                                                </div>
                                                <div className="font-semibold text-foreground truncate">
                                                  {col.val}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })()}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          ) : (
            <SectionCard title="Stock by store">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr><th className="px-5 py-2.5 text-left">Store</th><th className="px-3 py-2.5 text-left">City</th><th className="px-3 py-2.5 text-right">SKUs</th><th className="px-3 py-2.5 text-right">Units</th><th className="px-3 py-2.5 text-right">Value</th><th className="px-5 py-2.5 text-right">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stores.map(s => (
                    <tr key={s.code} className="hover:bg-secondary/30">
                      <td className="px-5 py-3 font-medium">{s.name}</td>
                      <td className="px-3 py-3 text-muted-foreground">{s.city}</td>
                      <td className="px-3 py-3 text-right tabular">{Math.floor(Math.random() * 400 + 600)}</td>
                      <td className="px-3 py-3 text-right tabular">{Math.floor(Math.random() * 4000 + 8000)}</td>
                      <td className="px-3 py-3 text-right tabular">{fmtBDT(Math.floor(Math.random() * 2000000 + 1500000))}</td>
                      <td className="px-5 py-3 text-right"><StatusBadge status={s.online ? "active" : "on-hold"} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SectionCard>
          )
        )}

        {activeTab === "adjustment" && (
          <PermissionGate
            perm="inventory.adjust"
            fallback={
              <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 p-4 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Requires "Stock adjustment" permission to perform stock adjustments.
              </div>
            }
          >
            <div className="space-y-6">
              <SectionCard
                title="Stock Adjustment"
                description="Adjust product on-hand count for cycle count corrections, damage, loss, or returns."
              >
                <div className="p-6 max-w-2xl space-y-4">
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Store Branch *</Label>
                    <Select
                      value={adjForm.store_id}
                      onValueChange={v => {
                        setAdjForm(f => ({ ...f, store_id: v, product_id: "", sku: "", qty_after: 0 }));
                        setAdjProductSearch("");
                        setAdjProductOpen(false);
                      }}
                      disabled={!canAdjustAnyStore}
                    >
                      <SelectTrigger className="mt-1 h-10 bg-background">
                        <SelectValue placeholder="Select store branch" />
                      </SelectTrigger>
                      <SelectContent>
                        {storeList.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!canAdjustAnyStore && (
                      <p className="mt-1 text-xs text-muted-foreground">Locked to your assigned store. Requires "Adjust stock at any store branch" permission to change.</p>
                    )}
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Product / Item *</Label>
                    <Popover open={adjProductOpen} onOpenChange={setAdjProductOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={adjProductOpen}
                          className="mt-1 h-10 w-full justify-between bg-background font-normal text-sm border-input hover:bg-background px-3"
                        >
                          {selectedAdjItem ? (
                            <span className="truncate flex items-center gap-2">
                              <span className="font-mono font-semibold text-primary">{selectedAdjItem.sku}</span>
                              <span className="truncate text-foreground">{selectedAdjItem.name}</span>
                              <span className="text-xs text-muted-foreground shrink-0 font-normal">
                                (On hand: {selectedAdjItem.qty_on_hand})
                              </span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Select product by SKU or name</span>
                          )}
                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            {adjForm.product_id && (
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAdjForm(f => ({ ...f, product_id: "", sku: "", qty_after: 0 }));
                                  setAdjProductSearch("");
                                }}
                                className="h-5 w-5 rounded-full inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary cursor-pointer"
                                title="Clear selection"
                              >
                                <X className="h-3 w-3" />
                              </span>
                            )}
                            <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", adjProductOpen && "rotate-180")} />
                          </div>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[340px] p-0" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder="Type SKU, barcode, or name to search..."
                            value={adjProductSearch}
                            onValueChange={setAdjProductSearch}
                            className="h-10 text-sm"
                            autoFocus
                          />
                          <CommandList className="max-h-64 overflow-y-auto p-1">
                            {filteredAdjProducts.length === 0 ? (
                              <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                                No products found matching "{adjProductSearch}"
                              </CommandEmpty>
                            ) : (
                              <CommandGroup>
                                {filteredAdjProducts.map((r) => {
                                  const isSelected = r.product_id === adjForm.product_id;
                                  return (
                                    <CommandItem
                                      key={r.product_id}
                                      value={`${r.sku} ${r.barcode || ""} ${r.name}`}
                                      onSelect={() => {
                                        setAdjForm(f => ({
                                          ...f,
                                          product_id: r.product_id,
                                          sku: r.sku,
                                          qty_after: r.qty_on_hand,
                                        }));
                                        setAdjProductSearch("");
                                        setAdjProductOpen(false);
                                      }}
                                      className={cn(
                                        "flex items-center justify-between cursor-pointer py-2.5 px-3 rounded-md",
                                        isSelected ? "bg-primary text-primary-foreground font-semibold" : "hover:bg-accent hover:text-accent-foreground"
                                      )}
                                    >
                                      <div className="flex items-center gap-2 min-w-0 pr-2">
                                        <Check className={cn("h-4 w-4 shrink-0", isSelected ? "text-primary-foreground opacity-100" : "opacity-0")} />
                                        <span className={cn("font-mono font-semibold shrink-0", isSelected ? "text-primary-foreground" : "text-primary")}>
                                          {r.sku}
                                        </span>
                                        <span className="truncate">{r.name}</span>
                                        {r.barcode && (
                                          <span className={cn("text-[11px] font-mono shrink-0", isSelected ? "text-primary-foreground/80" : "text-muted-foreground/70")}>
                                            ({r.barcode})
                                          </span>
                                        )}
                                      </div>
                                      <span className={cn("text-xs tabular-nums shrink-0 font-medium", isSelected ? "text-primary-foreground/90 font-semibold" : "text-muted-foreground")}>
                                        On hand: {r.qty_on_hand}
                                      </span>
                                    </CommandItem>
                                  );
                                })}
                              </CommandGroup>
                            )}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {adjForm.product_id && (
                    <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Current On-Hand Stock:</span>
                        <span className="font-semibold font-mono text-base">{currentQty} units</span>
                      </div>

                      <div>
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">New Quantity After Adjustment *</Label>
                        <Input
                          type="number"
                          className="mt-1 h-10 bg-background font-mono text-base font-semibold"
                          value={adjForm.qty_after}
                          onChange={e => setAdjForm(f => ({ ...f, qty_after: Number(e.target.value) }))}
                        />
                      </div>

                      <div className="flex items-center justify-between text-xs pt-1 border-t border-border/60">
                        <span className="text-muted-foreground">Adjustment Delta:</span>
                        <span className={`font-bold font-mono text-sm ${adjForm.qty_after - currentQty > 0 ? "text-success" : adjForm.qty_after - currentQty < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                          {adjForm.qty_after - currentQty > 0 ? `+${adjForm.qty_after - currentQty} units (Stock Increase)` : adjForm.qty_after - currentQty < 0 ? `${adjForm.qty_after - currentQty} units (Stock Decrease)` : "0 units (No Change)"}
                        </span>
                      </div>
                    </div>
                  )}

                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Adjustment Reason *</Label>
                    <Input
                      className="mt-1 h-10 bg-background"
                      value={adjForm.reason}
                      onChange={e => setAdjForm(f => ({ ...f, reason: e.target.value }))}
                      placeholder="Enter reason or select quick preset below"
                    />
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {["Cycle count correction", "Damaged goods", "Theft/Loss", "Stock expiration", "Supplier return"].map(r => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setAdjForm(f => ({ ...f, reason: r }))}
                          className={`px-3 py-1.5 text-xs rounded-full border transition-all cursor-pointer ${
                            adjForm.reason === r
                              ? "bg-primary/10 border-primary/40 text-primary font-semibold"
                              : "bg-secondary/40 border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-3">
                    <Button
                      size="lg"
                      onClick={submitAdjust}
                      disabled={adjustMut.isPending || !adjForm.product_id || !adjForm.reason.trim()}
                      className="px-6 gap-2"
                    >
                      <Check className="h-4 w-4" />
                      {adjustMut.isPending ? "Saving Adjustment..." : "Submit Adjustment"}
                    </Button>
                  </div>
                </div>
              </SectionCard>

              {(adjustmentsQuery.data ?? []).length > 0 && (
                <SectionCard
                  title="Recent Adjustments"
                  description="Recent stock adjustments logged in system"
                  actions={
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-primary gap-1"
                      onClick={() => {
                        setActiveTab("history");
                        navigate({ to: "/app/inventory", search: { tab: "history" } });
                      }}
                    >
                      View Audit List →
                    </Button>
                  }
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-5 py-2.5 text-left">Timestamp</th>
                          <th className="px-3 py-2.5 text-left">SKU</th>
                          <th className="px-3 py-2.5 text-left">Product</th>
                          <th className="px-3 py-2.5 text-right">Before</th>
                          <th className="px-3 py-2.5 text-right">After</th>
                          <th className="px-3 py-2.5 text-right">Delta</th>
                          <th className="px-3 py-2.5 text-left">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {(adjustmentsQuery.data ?? []).slice(0, 5).map((adj) => (
                          <tr key={adj.id} className="hover:bg-secondary/30">
                            <td className="px-5 py-2.5 text-xs text-muted-foreground">{adj.created_at ? new Date(adj.created_at).toLocaleString() : "—"}</td>
                            <td className="px-3 py-2.5 font-mono text-xs">{adj.sku}</td>
                            <td className="px-3 py-2.5 font-medium">{adj.name}</td>
                            <td className="px-3 py-2.5 text-right tabular">{adj.qty_before}</td>
                            <td className="px-3 py-2.5 text-right tabular">{adj.qty_after}</td>
                            <td className={`px-3 py-2.5 text-right tabular font-semibold ${adj.qty_delta > 0 ? "text-success" : adj.qty_delta < 0 ? "text-destructive" : ""}`}>
                              {adj.qty_delta > 0 ? `+${adj.qty_delta}` : adj.qty_delta}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground">{adj.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SectionCard>
              )}
            </div>
          </PermissionGate>
        )}

        {activeTab === "history" && (
          <SectionCard title="Adjustment History" description="Historical stock adjustments audit log">
            <FilterBar>
              <div className="relative flex-1 min-w-[200px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search SKU or product..." className="h-9 pl-9" value={historySearch} onChange={e => setHistorySearch(e.target.value)} />
              </div>
              <Select value={historyStoreFilter} onValueChange={setHistoryStoreFilter}>
                <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="All stores" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All stores</SelectItem>
                  {(storesQuery.data ?? []).map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterBar>
            {adjustmentsQuery.isLoading ? (
              <div className="space-y-2 p-5">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : adjustmentsQuery.isError ? (
              <div className="p-5 text-center text-sm text-destructive">Failed to load adjustment history</div>
            ) : filteredHistory.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground">No matching adjustments found</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-5 py-2.5 text-left">Timestamp</th>
                      <th className="px-3 py-2.5 text-left">SKU</th>
                      <th className="px-3 py-2.5 text-left">Product Name</th>
                      <th className="px-3 py-2.5 text-left">Store Branch</th>
                      <th className="px-3 py-2.5 text-right">Before</th>
                      <th className="px-3 py-2.5 text-right">After</th>
                      <th className="px-3 py-2.5 text-right">Delta</th>
                      <th className="px-3 py-2.5 text-left">Reason</th>
                      <th className="px-5 py-2.5 text-left">Adjusted by</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredHistory.map((adj) => {
                      const delta = adj.qty_delta;
                      const deltaColor = delta > 0 ? "text-success font-medium" : delta < 0 ? "text-destructive font-medium" : "text-muted-foreground";
                      const deltaText = delta > 0 ? `+${delta}` : `${delta}`;
                      return (
                        <tr key={adj.id} className="hover:bg-secondary/30">
                          <td className="px-5 py-3 text-muted-foreground text-xs whitespace-nowrap">
                            {adj.created_at ? new Date(adj.created_at).toLocaleString() : "—"}
                          </td>
                          <td className="px-3 py-3 font-mono text-xs">{adj.sku}</td>
                          <td className="px-3 py-3 font-medium">{adj.name}</td>
                          <td className="px-3 py-3 text-muted-foreground">{adj.store_name}</td>
                          <td className="px-3 py-3 text-right tabular">{adj.qty_before}</td>
                          <td className="px-3 py-3 text-right tabular">{adj.qty_after}</td>
                          <td className={`px-3 py-3 text-right tabular ${deltaColor}`}>{deltaText}</td>
                          <td className="px-3 py-3 text-muted-foreground">{adj.reason}</td>
                          <td className="px-5 py-3 text-muted-foreground whitespace-nowrap">{adj.adjusted_by}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        )}

        {useApi && activeTab === "opening" && (
          <PermissionGate
            perm="inventory.adjust"
            fallback={
              <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 p-4 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Requires "Stock adjustment" permission to initialize opening stock.
              </div>
            }
          >
            <div className="space-y-6">
              <SectionCard>
                <div className="p-6 space-y-6">
                  {/* Top Store Selector & Clear Action */}
                  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                    <div className="flex-1 max-w-sm">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Store *</Label>
                      <Select value={draftStoreId} onValueChange={setDraftStoreId} disabled={!canAdjustAnyStore}>
                        <SelectTrigger className="mt-1 h-11 bg-background border-border">
                          <SelectValue placeholder="Select store" />
                        </SelectTrigger>
                        <SelectContent>
                          {(storesQuery.data ?? []).map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name.toUpperCase()}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setConfirmClearOpen(true)}
                      disabled={clearOpeningStockMut.isPending}
                      className="h-11 border-destructive/40 text-destructive hover:bg-destructive/10 gap-2 shrink-0 text-xs font-semibold"
                    >
                      <Trash2 className="h-4 w-4" />
                      Clear Store Opening Stock
                    </Button>
                  </div>

                  {/* Form Table */}
                  <div className="rounded-lg border border-border overflow-x-auto bg-background">
                    <table className="w-full min-w-[960px] text-sm border-collapse">
                      <thead className="bg-secondary/50 text-muted-foreground text-xs font-semibold uppercase tracking-wide border-b border-border">
                        <tr>
                          <th className="px-3 py-3 text-left w-[180px] min-w-[150px]">Item Code</th>
                          <th className="px-3 py-3 text-left w-[240px] min-w-[200px]">Item Name</th>
                          <th className="px-3 py-3 text-left w-[130px] min-w-[110px]">Category</th>
                          <th className="px-3 py-3 text-right w-[110px] min-w-[100px]">Current Stock</th>
                          <th className="px-3 py-3 text-right w-[110px] min-w-[100px]">Initial Qty *</th>
                          <th className="px-3 py-3 text-right w-[120px] min-w-[110px]">Unit Cost (৳) *</th>
                          <th className="px-3 py-3 text-right w-[130px] min-w-[120px]">Total Balance (৳)</th>
                          <th className="px-3 py-3 text-center w-[70px] min-w-[70px]">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-border bg-secondary/10">
                          {/* Item Code Selection */}
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1">
                              <div className="relative flex-1">
                                <Input
                                  value={rowCodeInput}
                                  onChange={e => setRowCodeInput(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      resolveProductByCode(rowCodeInput);
                                    }
                                  }}
                                  placeholder="Code or scan..."
                                  className="h-10 text-xs font-mono pr-7 bg-background border-border"
                                />
                                {isResolvingCode ? (
                                  <Loader2 className="absolute right-2 top-3 h-4 w-4 animate-spin text-muted-foreground" />
                                ) : (
                                  <Popover open={rowProductPickerOpen} onOpenChange={setRowProductPickerOpen}>
                                    <PopoverTrigger asChild>
                                      <button
                                        type="button"
                                        className="absolute right-1 top-1.5 h-7 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary/60 cursor-pointer"
                                        title="Browse or search catalog"
                                      >
                                        <Search className="h-3.5 w-3.5" />
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[360px] p-0" align="start">
                                      <Command shouldFilter={false}>
                                        <CommandInput
                                          value={openingProductSearch}
                                          onValueChange={setOpeningProductSearch}
                                          placeholder="Search SKU, barcode, name..."
                                        />
                                        <CommandList>
                                          {openingCatalogQuery.isLoading || openingSearchQuery.isLoading ? (
                                            <div className="py-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                                              <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading products...
                                            </div>
                                          ) : openingAvailableProducts.length === 0 ? (
                                            <CommandEmpty>No product found</CommandEmpty>
                                          ) : null}
                                          <CommandGroup heading={`Catalog Products (${openingAvailableProducts.length})`}>
                                            {openingAvailableProducts
                                              .filter(p => {
                                                if (!openingProductSearch.trim()) return true;
                                                const q = openingProductSearch.toLowerCase().trim();
                                                return (
                                                  p.name.toLowerCase().includes(q) ||
                                                  p.sku.toLowerCase().includes(q) ||
                                                  (p.barcode && p.barcode.toLowerCase().includes(q))
                                                );
                                              })
                                              .slice(0, 100)
                                              .map(p => (
                                                <CommandItem
                                                  key={p.id}
                                                  value={`${p.sku} ${p.barcode || ""} ${p.name}`}
                                                  onSelect={() => {
                                                    setSelectedProductCache(p);
                                                    setRowForm(f => ({
                                                      ...f,
                                                      product_id: p.id,
                                                      variant_id: "",
                                                      qty: f.qty && Number(f.qty) > 0 ? f.qty : 1,
                                                      unit_cost: p.base_price || (p as any).cost_price || 0,
                                                    }));
                                                    setRowCodeInput(p.sku);
                                                    setRowProductPickerOpen(false);
                                                    setOpeningProductSearch("");
                                                  }}
                                                  className="cursor-pointer"
                                                >
                                                  <Check className={cn("mr-2 h-4 w-4 shrink-0", rowForm.product_id === p.id ? "opacity-100" : "opacity-0")} />
                                                  <div className="flex flex-col min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                      <span className="font-mono font-semibold text-xs text-foreground">{p.sku}</span>
                                                      {p.barcode && (
                                                        <span className="text-[10px] text-muted-foreground bg-secondary px-1 py-0.2 rounded font-mono">
                                                          {p.barcode}
                                                        </span>
                                                      )}
                                                    </div>
                                                    <span className="text-xs text-muted-foreground truncate">{p.name}</span>
                                                  </div>
                                                </CommandItem>
                                              ))}
                                          </CommandGroup>
                                        </CommandList>
                                      </Command>
                                    </PopoverContent>
                                  </Popover>
                                )}
                              </div>

                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-10 w-9 shrink-0 border-border text-muted-foreground hover:text-foreground"
                                onClick={() => setCameraScannerOpen(true)}
                                title="Scan barcode with camera"
                              >
                                <Camera className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>

                          {/* Item Name & Variant Selector */}
                          <td className="px-3 py-2 space-y-1.5">
                            <Input
                              value={rowProduct?.name || ""}
                              placeholder="Product name"
                              readOnly
                              className="h-10 bg-secondary/30 text-xs border-border font-medium"
                            />
                            {rowPack === "fashion" && rowVariantsQuery.isLoading && (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                                <span>Loading variants...</span>
                              </div>
                            )}
                            {rowPack === "fashion" && !rowVariantsQuery.isLoading && (rowVariantsQuery.data ?? []).length === 0 && rowForm.product_id && (
                              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-secondary/50 rounded px-2 py-1 border border-border">
                                <Sparkles className="h-3 w-3 text-primary shrink-0" />
                                <span>Standard variant (Auto-assigned)</span>
                              </div>
                            )}
                            {(rowVariantsQuery.data ?? []).length > 0 && (
                              <Select
                                value={rowForm.variant_id || "__none__"}
                                onValueChange={v => {
                                  const variantId = v === "__none__" ? "" : v;
                                  const variantObj = (rowVariantsQuery.data ?? []).find(vr => vr.id === variantId);
                                  setRowForm(f => ({
                                    ...f,
                                    variant_id: variantId,
                                    qty: 1,
                                    unit_cost: (variantObj as any)?.additional_price ? (rowProduct?.base_price || 0) + (variantObj as any).additional_price : f.unit_cost,
                                  }));
                                }}
                              >
                                <SelectTrigger className="h-9 text-xs bg-background border-primary/50 text-foreground font-semibold shadow-2xs">
                                  <SelectValue placeholder="Select Variant (Size / Color) *" />
                                </SelectTrigger>
                                <SelectContent className="max-h-56">
                                  <SelectItem value="__none__">-- Select Variant (Size / Color) --</SelectItem>
                                  {(rowVariantsQuery.data ?? []).map(v => {
                                    const parts: string[] = [];
                                    if (v.size) parts.push(`Size: ${v.size}`);
                                    if (v.color) parts.push(`Color: ${v.color}`);
                                    const label = parts.join(" · ") || v.variant_code || `Variant #${v.id.slice(0, 6)}`;
                                    return (
                                      <SelectItem key={v.id} value={v.id}>
                                        {label} ({v.variant_code})
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                            )}
                          </td>

                          {/* Category (read-only) */}
                          <td className="px-3 py-2">
                            <Input
                              value={rowCategoryName}
                              placeholder="Category"
                              readOnly
                              className="h-10 bg-secondary/30 text-xs border-border font-medium"
                            />
                          </td>

                          {/* Current Stock (read-only) */}
                          <td className="px-3 py-2 text-right">
                            <Input
                              value={rowCurrentStock !== null ? rowCurrentStock : 0}
                              readOnly
                              className="h-10 text-right bg-secondary/30 text-sm border-border font-semibold tabular-nums"
                            />
                          </td>

                          {/* Quantity */}
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min={0}
                              step="any"
                              value={rowForm.qty}
                              onChange={e => setRowForm(f => ({ ...f, qty: e.target.value }))}
                              onFocus={e => e.target.select()}
                              className="h-10 text-right text-sm border-border font-bold focus:ring-primary tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              placeholder="Qty"
                            />
                          </td>

                          {/* Unit Cost */}
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min={0}
                              step="any"
                              value={rowForm.unit_cost}
                              onChange={e => setRowForm(f => ({ ...f, unit_cost: e.target.value }))}
                              onFocus={e => e.target.select()}
                              className="h-10 text-right text-sm border-border font-bold focus:ring-primary tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              placeholder="0.00"
                            />
                          </td>

                          {/* Line Total Balance */}
                          <td className="px-3 py-2 text-right">
                            <Input
                              value={fmtBDT((Number(rowForm.qty) || 0) * (Number(rowForm.unit_cost) || 0))}
                              readOnly
                              className="h-10 text-right bg-secondary/30 text-sm border-border font-bold text-success tabular-nums"
                            />
                          </td>

                          {/* Add Action button */}
                          <td className="px-3 py-2 text-center">
                            <Button
                              onClick={addRowToDraft}
                              disabled={!rowForm.product_id}
                              size="icon"
                              className="h-9 w-9 rounded-full bg-success hover:bg-success/90 text-white font-bold shadow-sm"
                              title="Add to draft batch"
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>

                        {/* List items or Empty state placeholder */}
                        {draftLines.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-16 text-center">
                              <div className="flex flex-col items-center justify-center space-y-3">
                                <Warehouse className="h-12 w-12 text-muted-foreground/40" />
                                <div className="text-sm font-semibold text-muted-foreground/80">No items added yet</div>
                                <div className="text-xs text-muted-foreground">Search product code above to enter starting stock & unit cost balance</div>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          draftLines.map((ln, idx) => (
                            <tr key={idx} className="hover:bg-secondary/5 border-b border-border">
                              <td className="px-4 py-3 font-mono text-xs font-semibold text-foreground">{ln.sku}</td>
                              <td className="px-4 py-3 text-xs font-medium text-foreground">{ln.name}</td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">{ln.category_name}</td>
                              <td className="px-4 py-3 text-right text-xs tabular font-medium text-muted-foreground">
                                {ln.variant_id
                                  ? ((rawStockQuery.data ?? []).find(r => r.product_id === ln.product_id && (r as any).variant_id === ln.variant_id && r.store_id === draftStoreId)?.qty_on_hand ?? 0)
                                  : ((rawStockQuery.data ?? []).find(r => r.product_id === ln.product_id && r.store_id === draftStoreId)?.qty_on_hand ?? 0)}
                              </td>
                              <td className="px-4 py-3 text-right text-xs font-bold text-foreground tabular">{ln.qty}</td>
                              <td className="px-4 py-3 text-right text-xs font-medium tabular">{fmtBDT(ln.unit_cost ?? 0)}</td>
                              <td className="px-4 py-3 text-right text-xs font-bold text-success tabular">{fmtBDT(ln.qty * (ln.unit_cost ?? 0))}</td>
                              <td className="px-4 py-3 text-center">
                                <button type="button" onClick={() => removeDraftLine(idx)} className="text-destructive hover:text-destructive/80 font-semibold text-xs transition-colors">
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Note block & Footer buttons */}
                  {draftLines.length > 0 && (
                    <div className="space-y-4 pt-2">
                      <div>
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Note / Reference</Label>
                        <Input value={draftNote} onChange={e => setDraftNote(e.target.value)} placeholder="Enter notes here..." className="mt-1 h-10 border-border" />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                    <Button variant="outline" className="px-6 h-10 border-border" onClick={() => setDraftLines([])}>
                      Cancel
                    </Button>
                    <Button
                      onClick={saveDraftBatch}
                      disabled={draftLines.length === 0 || createDocMut.isPending}
                      className="px-6 h-10 font-medium"
                    >
                      Add ({draftLines.length} items)
                    </Button>
                  </div>
                </div>
              </SectionCard>
            </div>
          </PermissionGate>
        )}

        {useApi && activeTab === "opening-docs" && (
          <SectionCard>
            <div className="p-6 space-y-4">
              {/* Search, POS Filter & Status Tabs */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search by product name, SKU, OS number..."
                      className="h-10 pl-9 pr-8 border-border text-xs sm:text-sm"
                      value={historySearch}
                      onChange={e => setHistorySearch(e.target.value)}
                    />
                    {historySearch && (
                      <button
                        type="button"
                        onClick={() => setHistorySearch("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded cursor-pointer"
                        title="Clear search"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <Select value={docPackFilter} onValueChange={setDocPackFilter}>
                    <SelectTrigger className="h-10 w-full sm:w-[200px] text-xs bg-background">
                      <SelectValue placeholder="Filter by POS" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All POS Verticals</SelectItem>
                      {INDUSTRY_PACKS.filter(p => app.isPackEnabled(p.id)).map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.shortName} POS
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-1.5 p-1 bg-secondary/30 rounded-lg border border-border shrink-0 self-start lg:self-auto">
                  {[
                    { id: "all", label: "All" },
                    { id: "POSTED", label: "Posted" },
                    { id: "REVERTED", label: "Reverted" },
                    { id: "DRAFT", label: "Draft" },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setDocStatusFilter(tab.id)}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                        docStatusFilter === tab.id
                          ? "bg-background text-foreground shadow-xs font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table */}
              {openingDocsQuery.isLoading ? (
                <div className="space-y-2 py-4">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (openingDocsQuery.data ?? []).length === 0 ? (
                <div className="p-12 text-center text-sm text-muted-foreground">No opening stock documents found</div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/50 text-muted-foreground text-xs font-semibold uppercase tracking-wide border-b border-border">
                      <tr>
                        <th className="px-5 py-3 text-left">OS Number</th>
                        <th className="px-3 py-3 text-left">POS Mode</th>
                        <th className="px-4 py-3 text-left">Products Included</th>
                        <th className="px-3 py-3 text-right">Total Amount</th>
                        <th className="px-3 py-3 text-center">Status</th>
                        <th className="px-3 py-3 text-left">Created At</th>
                        <th className="px-5 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(openingDocsQuery.data ?? [])
                        .filter(doc => {
                          if (docStatusFilter !== "all" && doc.status !== docStatusFilter) return false;
                          if (docPackFilter !== "all") {
                            const packs = getDocPacks(doc);
                            if (packs.length > 0 && !packs.includes(docPackFilter)) {
                              return false;
                            }
                          }
                          if (!historySearch) return true;
                          const q = historySearch.toLowerCase();
                          const matchesOs = doc.os_number.toLowerCase().includes(q);
                          const matchesStatus = doc.status.toLowerCase().includes(q);
                          const matchesProducts = (doc.product_names ?? []).some(name => name.toLowerCase().includes(q));
                          const matchesSkus = (doc.product_skus ?? []).some(sku => sku.toLowerCase().includes(q));
                          const matchesSummary = (doc.items_summary ?? "").toLowerCase().includes(q);
                          return matchesOs || matchesStatus || matchesProducts || matchesSkus || matchesSummary;
                        })
                        .map(doc => {
                          const docPacks = getDocPacks(doc);
                          return (
                          <tr key={doc.id} className="hover:bg-secondary/30 transition-colors">
                            <td className="px-5 py-3 font-mono text-xs font-bold text-primary hover:underline cursor-pointer" onClick={() => setViewDocId(doc.id)}>{doc.os_number}</td>
                            <td className="px-3 py-3 text-left whitespace-nowrap">
                              {docPacks.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {docPacks.map(p => {
                                    const packDef = INDUSTRY_PACKS.find(ip => ip.id === p);
                                    return (
                                      <Badge key={p} variant="secondary" className="text-[10px] capitalize font-medium">
                                        {packDef?.shortName ?? p}
                                      </Badge>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-xs font-mono">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs max-w-xs">
                              {doc.product_names && doc.product_names.length > 0 ? (
                                <div className="space-y-0.5">
                                  <div className="font-medium text-foreground truncate" title={doc.items_summary}>
                                    {doc.product_names.slice(0, 2).join(", ")}
                                    {doc.product_names.length > 2 && (
                                      <span className="text-muted-foreground ml-1">+{doc.product_names.length - 2} more</span>
                                    )}
                                  </div>
                                  {doc.total_items && doc.total_items > 0 && (
                                    <div className="text-[11px] text-muted-foreground">
                                      {doc.total_items} item{doc.total_items > 1 ? "s" : ""}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-right font-semibold tabular-nums">{fmtBDT(doc.total_amount)}</td>
                            <td className="px-3 py-3 text-center">
                              <StatusBadge status={doc.status} />
                            </td>
                            <td className="px-3 py-3 text-muted-foreground text-xs whitespace-nowrap">
                              {doc.created_at ? new Date(doc.created_at).toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' }) : "—"}
                            </td>
                            <td className="px-5 py-3 text-right">
                              <div className="flex items-center justify-end gap-2.5">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 gap-1.5 text-xs text-muted-foreground hover:bg-secondary"
                                  onClick={() => setViewDocId(doc.id)}
                                >
                                  <Eye className="h-3.5 w-3.5" /> View
                                </Button>
                                {doc.status === "DRAFT" && (
                                  <>
                                    <PermissionGate perm="inventory.approve_opening_stock">
                                      <Button
                                        type="button"
                                        size="sm"
                                        onClick={() => approveDocMut.mutate(doc.id)}
                                        disabled={approveDocMut.isPending}
                                        className="h-8 gap-1.5 bg-success hover:bg-success/90 text-white font-medium text-xs px-3"
                                      >
                                        <Check className="h-3.5 w-3.5" /> Approve
                                      </Button>
                                    </PermissionGate>
                                    <PermissionGate perm="inventory.adjust">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => cancelDocMut.mutate(doc.id)}
                                        disabled={cancelDocMut.isPending}
                                        className="h-8 gap-1.5 border-destructive text-destructive hover:bg-destructive hover:text-white font-medium text-xs px-3"
                                      >
                                        <XCircle className="h-3.5 w-3.5" /> Cancel
                                      </Button>
                                    </PermissionGate>
                                  </>
                                )}
                                {doc.status === "POSTED" && (
                                  <PermissionGate perm="inventory.adjust">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setRevertConfirmDoc({ id: doc.id, os_number: doc.os_number })}
                                      disabled={revertDocMut.isPending}
                                      className="h-8 gap-1.5 border-amber-500/50 text-amber-500 hover:bg-amber-500 hover:text-white font-medium text-xs px-3"
                                    >
                                      <RotateCcw className="h-3.5 w-3.5" /> Revert
                                    </Button>
                                  </PermissionGate>
                                )}
                                {(doc.status === "REVERTED" || doc.status === "CANCELLED") && (
                                  <PermissionGate perm="inventory.adjust">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setDeleteConfirmDoc({ id: doc.id, os_number: doc.os_number })}
                                      disabled={deleteDocMut.isPending}
                                      className="h-8 gap-1.5 text-destructive hover:bg-destructive/10 font-medium text-xs px-2.5"
                                      title="Delete document"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" /> Delete
                                    </Button>
                                  </PermissionGate>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </SectionCard>
        )}





        <Dialog open={Boolean(viewDocId)} onOpenChange={(open) => { if (!open) setViewDocId(null); }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{viewDocQuery.data?.os_number ?? "Opening stock document"}</DialogTitle>
            </DialogHeader>
            {viewDocQuery.isLoading ? (
              <div className="space-y-2 py-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : viewDocQuery.data ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                  <span>Status: <StatusBadge status={viewDocQuery.data.status} /></span>
                  <span>Total: <span className="font-semibold text-foreground">{fmtBDT(viewDocQuery.data.total_amount)}</span></span>
                  {getDocPacks(viewDocQuery.data).length > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span>POS:</span>
                      {getDocPacks(viewDocQuery.data).map(p => (
                        <Badge key={p} variant="secondary" className="text-xs capitalize font-medium">
                          {INDUSTRY_PACKS.find(ip => ip.id === p)?.shortName ?? p} POS
                        </Badge>
                      ))}
                    </span>
                  )}
                </div>
                {viewDocQuery.data.note && <p className="text-sm text-muted-foreground">Note: {viewDocQuery.data.note}</p>}
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-secondary/50 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-1.5 text-left">SKU</th>
                        <th className="px-3 py-1.5 text-left">Name</th>
                        <th className="px-3 py-1.5 text-right">Qty</th>
                        <th className="px-3 py-1.5 text-right">Unit cost</th>
                        <th className="px-3 py-1.5 text-right">Line total</th>
                        <th className="px-3 py-1.5 text-left">Batch / Serials</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(viewDocQuery.data.lines ?? []).map(ln => (
                        <tr key={ln.id}>
                          <td className="px-3 py-1.5 font-mono">
                            <div>{ln.sku}</div>
                            {(ln as any).variant_code && (ln as any).variant_code !== ln.sku && (
                              <div className="text-[10px] text-muted-foreground">{(ln as any).variant_code}</div>
                            )}
                          </td>
                          <td className="px-3 py-1.5">
                            <div>{ln.name}</div>
                            {((ln as any).variant_name || (ln as any).size || (ln as any).color) && (
                              <div className="text-[10px] text-primary/80 font-medium">
                                {(ln as any).variant_name || [(ln as any).size, (ln as any).color].filter(Boolean).join(" · ")}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular">{ln.qty}</td>
                          <td className="px-3 py-1.5 text-right tabular">{fmtBDT(ln.unit_cost)}</td>
                          <td className="px-3 py-1.5 text-right tabular">{fmtBDT(ln.line_total)}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{ln.batch_no || (ln.serials ? `${ln.serials.length} serials` : "—")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {viewDocQuery.data.status === "POSTED" && (
                  <div className="flex items-center justify-between pt-3 border-t border-border gap-3">
                    <p className="text-xs text-muted-foreground">
                      Entered wrong quantities? Reverting will subtract posted stock and mark this document as REVERTED.
                    </p>
                    <PermissionGate perm="inventory.adjust">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setRevertConfirmDoc({ id: viewDocQuery.data.id, os_number: viewDocQuery.data.os_number })}
                        disabled={revertDocMut.isPending}
                        className="h-8 gap-1.5 border-amber-500/50 text-amber-500 hover:bg-amber-500 hover:text-white font-medium text-xs px-3 shrink-0"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Revert Document
                      </Button>
                    </PermissionGate>
                  </div>
                )}
                {(viewDocQuery.data.status === "REVERTED" || viewDocQuery.data.status === "CANCELLED") && (
                  <div className="flex items-center justify-between pt-3 border-t border-border gap-3">
                    <p className="text-xs text-muted-foreground">
                      This document has been {viewDocQuery.data.status.toLowerCase()}. You can permanently remove it from your document list.
                    </p>
                    <PermissionGate perm="inventory.adjust">
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setDeleteConfirmDoc({ id: viewDocQuery.data.id, os_number: viewDocQuery.data.os_number });
                        }}
                        disabled={deleteDocMut.isPending}
                        className="h-8 gap-1.5 font-medium text-xs px-3 shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete Document
                      </Button>
                    </PermissionGate>
                  </div>
                )}
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog open={confirmClearOpen} onOpenChange={(open) => { setConfirmClearOpen(open); if (!open) setClearAdminPassword(""); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Clear Opening Stock for {storeNameMap.get(draftStoreId) || "this store"}?
              </DialogTitle>
            </DialogHeader>
            <div className="text-sm text-muted-foreground space-y-3 py-2">
              <p>
                This will remove all <strong>Opening Stock records and documents</strong> for <strong>{storeNameMap.get(draftStoreId) || "this store"}</strong>, and revert the stock quantities added by them back to 0.
              </p>
              <p className="text-xs text-muted-foreground/80">
                Non-opening transactions (sales, purchases, regular adjustments) will remain unaffected.
              </p>
              <div className="space-y-1.5 pt-2 border-t border-border">
                <Label htmlFor="admin-pass-clear" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-destructive" /> Admin Password Required *
                </Label>
                <Input
                  id="admin-pass-clear"
                  type="password"
                  placeholder="Enter your admin password"
                  value={clearAdminPassword}
                  onChange={e => setClearAdminPassword(e.target.value)}
                  className="h-10 text-sm border-border bg-background"
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => { setConfirmClearOpen(false); setClearAdminPassword(""); }}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={!clearAdminPassword.trim() || clearOpeningStockMut.isPending}
                onClick={async () => {
                  if (!clearAdminPassword.trim()) {
                    toast.error("Admin password is required");
                    return;
                  }
                  try {
                    await clearOpeningStockMut.mutateAsync({
                      store_id: draftStoreId || undefined,
                      password: clearAdminPassword,
                    });
                    setConfirmClearOpen(false);
                    setClearAdminPassword("");
                    setDraftLines([]);
                  } catch (err) {
                    console.error("Clear opening stock error:", err);
                  }
                }}
              >
                {clearOpeningStockMut.isPending ? "Clearing..." : "Yes, Clear Opening Stock"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(revertConfirmDoc)} onOpenChange={(open) => { if (!open) setRevertConfirmDoc(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-500">
                <RotateCcw className="h-5 w-5" />
                Revert Document {revertConfirmDoc?.os_number}?
              </DialogTitle>
            </DialogHeader>
            <div className="text-sm text-muted-foreground space-y-2 py-2">
              <p>
                This will reverse the quantities added by <strong>{revertConfirmDoc?.os_number}</strong> from your stock balance and set the document status to <strong>REVERTED</strong>.
              </p>
              <p className="text-xs text-muted-foreground/80">
                Any initial stock defined in Product Master is preserved. You can then submit a new opening stock entry with the corrected quantity.
              </p>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setRevertConfirmDoc(null)}>
                Cancel
              </Button>
              <Button
                variant="default"
                className="bg-amber-600 hover:bg-amber-700 text-white font-medium"
                disabled={revertDocMut.isPending}
                onClick={async () => {
                  if (!revertConfirmDoc) return;
                  try {
                    await revertDocMut.mutateAsync(revertConfirmDoc.id);
                    setRevertConfirmDoc(null);
                    if (viewDocId === revertConfirmDoc.id) {
                      setViewDocId(null);
                    }
                  } catch (err) {
                    console.error("Revert opening stock error:", err);
                  }
                }}
              >
                {revertDocMut.isPending ? "Reverting..." : "Yes, Revert Document"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(deleteConfirmDoc)} onOpenChange={(open) => { if (!open) setDeleteConfirmDoc(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="h-5 w-5" />
                Delete Document {deleteConfirmDoc?.os_number}?
              </DialogTitle>
            </DialogHeader>
            <div className="text-sm text-muted-foreground space-y-2 py-2">
              <p>
                Are you sure you want to permanently delete <strong>{deleteConfirmDoc?.os_number}</strong>?
              </p>
              <p className="text-xs text-muted-foreground/80">
                This document record will be removed from your list. Stock balance is unaffected since this document has already been reverted.
              </p>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setDeleteConfirmDoc(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={deleteDocMut.isPending}
                onClick={async () => {
                  if (!deleteConfirmDoc) return;
                  try {
                    await deleteDocMut.mutateAsync(deleteConfirmDoc.id);
                    setDeleteConfirmDoc(null);
                    if (viewDocId === deleteConfirmDoc.id) {
                      setViewDocId(null);
                    }
                  } catch (err) {
                    console.error("Delete opening stock error:", err);
                  }
                }}
              >
                {deleteDocMut.isPending ? "Deleting..." : "Yes, Delete Document"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <CameraBarcodeScannerDialog
          open={cameraScannerOpen}
          onOpenChange={setCameraScannerOpen}
          onScan={(scannedCode) => {
            resolveProductByCode(scannedCode);
            setCameraScannerOpen(false);
          }}
          title="Scan Product Code / Barcode"
          subtitle="Point camera at product barcode to auto-select item"
        />

        {activeTab === "levels" && (
          <SectionCard
            title="Low stock alerts"
            description={
              useApi
                ? `Below ${threshold} units available or product reorder point`
                : `Below ${threshold} units available or product reorder point`
            }
            actions={
              <div className="flex items-center gap-2">
                <Label htmlFor="low-stock-threshold-input" className="text-xs text-muted-foreground whitespace-nowrap">
                  Alert threshold:
                </Label>
                <div className="relative flex items-center">
                  <Input
                    id="low-stock-threshold-input"
                    type="number"
                    min={1}
                    max={9999}
                    value={thresholdInput}
                    onChange={(e) => {
                      const str = e.target.value;
                      setThresholdInput(str);
                      const parsed = Number(str);
                      if (!Number.isNaN(parsed) && parsed > 0) {
                        setThreshold(parsed);
                        setStoredLowStockThreshold(parsed);
                      }
                    }}
                    onBlur={() => {
                      const parsed = Number(thresholdInput);
                      if (Number.isNaN(parsed) || parsed <= 0) {
                        const fallback = DEFAULT_LOW_STOCK_THRESHOLD;
                        setThreshold(fallback);
                        setThresholdInput(String(fallback));
                        setStoredLowStockThreshold(fallback);
                      }
                    }}
                    className="h-8 w-20 text-xs text-right pr-6 tabular font-medium"
                  />
                  <span className="pointer-events-none absolute right-2 text-[10px] text-muted-foreground uppercase font-medium">
                    qty
                  </span>
                </div>
                {threshold !== DEFAULT_LOW_STOCK_THRESHOLD && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setThreshold(DEFAULT_LOW_STOCK_THRESHOLD);
                      setThresholdInput(String(DEFAULT_LOW_STOCK_THRESHOLD));
                      setStoredLowStockThreshold(DEFAULT_LOW_STOCK_THRESHOLD);
                    }}
                    title="Reset to default (20)"
                  >
                    Reset
                  </Button>
                )}
              </div>
            }
          >
            {isLoading ? (
              <div className="space-y-2 p-5">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : useApi ? (
              apiLowStock.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">No low-stock items</div>
              ) : (
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr><th className="px-5 py-2.5 text-left">SKU</th><th className="px-3 py-2.5 text-left">Name</th><th className="px-3 py-2.5 text-right">Available</th><th className="px-3 py-2.5 text-right">Reorder pt</th><th className="px-5 py-2.5 text-right">Action</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {apiLowStock.map((l) => (
                    <tr key={l.product_id}>
                      <td className="px-5 py-3 font-mono text-xs">{l.sku}</td>
                      <td className="px-3 py-3 font-medium">{l.name}</td>
                      <td className="px-3 py-3 text-right tabular text-destructive">{l.qty_available}</td>
                      <td className="px-3 py-3 text-right tabular text-muted-foreground">{l.reorder_point}</td>
                      <td className="px-5 py-3 text-right">
                        <PermissionGate perm="purchases.edit" fallback={<DisabledReasonButton label="Reorder" reason="Requires purchase.create permission" />}>
                          <Button variant="outline" size="sm" onClick={() => openReorder(l)}>Reorder</Button>
                        </PermissionGate>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              )
            ) : (
              mockLowStockRows.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">No low-stock items</div>
              ) : (
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr><th className="px-5 py-2.5 text-left">SKU</th><th className="px-3 py-2.5 text-left">Name</th><th className="px-3 py-2.5 text-left">Store</th><th className="px-3 py-2.5 text-right">On hand</th><th className="px-3 py-2.5 text-right">Reorder</th><th className="px-5 py-2.5 text-right">Action</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {mockLowStockRows.map(l => (
                    <tr key={l.sku}>
                      <td className="px-5 py-3 font-mono text-xs">{l.sku}</td>
                      <td className="px-3 py-3 font-medium">{l.name}</td>
                      <td className="px-3 py-3 text-muted-foreground">{l.store}</td>
                      <td className="px-3 py-3 text-right tabular text-destructive">{l.qty}</td>
                      <td className="px-3 py-3 text-right tabular text-muted-foreground">{l.reorder}</td>
                      <td className="px-5 py-3 text-right"><DisabledReasonButton label="Reorder" reason="Connect backend to create draft purchase orders." /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              )
            )}
          </SectionCard>
        )}
        {useApi && (
          <ReorderDrawer
            open={reorderOpen}
            onOpenChange={setReorderOpen}
            item={reorderItem}
            defaultStoreId={user?.store_id ?? undefined}
          />
        )}

        {/* Inter-Store Stock Transfer Dialog */}
        <Dialog open={xferOpen} onOpenChange={setXferOpen}>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ArrowLeftRight className="h-5 w-5 text-primary" />
                <span>Inter-Store Stock Transfer</span>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    From Store (Source)
                  </Label>
                  <Select
                    value={xferForm.from_store_id || "__all__"}
                    onValueChange={v => setXferForm(f => ({ ...f, from_store_id: v === "__all__" ? "" : v }))}
                  >
                    <SelectTrigger className="mt-1 h-9 bg-background">
                      <SelectValue placeholder="Select Source Store" />
                    </SelectTrigger>
                    <SelectContent>
                      {storeList.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    To Store (Destination) <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={xferForm.to_store_id}
                    onValueChange={v => setXferForm(f => ({ ...f, to_store_id: v }))}
                  >
                    <SelectTrigger className="mt-1 h-9 bg-background">
                      <SelectValue placeholder="Select Destination Store" />
                    </SelectTrigger>
                    <SelectContent>
                      {storeList.filter(s => !xferForm.from_store_id || s.id !== xferForm.from_store_id).map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Product / Item to Transfer <span className="text-destructive">*</span>
                </Label>
                <Popover open={xferProductOpen} onOpenChange={setXferProductOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={xferProductOpen}
                      className="mt-1 h-9 w-full justify-between bg-background font-normal text-xs border-input hover:bg-background px-3"
                    >
                      {selectedXferItem ? (
                        <span className="truncate flex items-center gap-1.5">
                          <span className="font-mono font-semibold text-primary">{selectedXferItem.sku}</span>
                          <span className="truncate text-foreground">{selectedXferItem.name}</span>
                          <span className="text-[11px] text-muted-foreground shrink-0 font-normal">
                            (Avail: {selectedXferItem.qty_on_hand})
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Select product to transfer</span>
                      )}
                      <div className="flex items-center gap-1 shrink-0 ml-1.5">
                        {xferForm.product_id && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              setXferForm(f => ({ ...f, product_id: "" }));
                              setXferProductSearch("");
                            }}
                            className="h-4 w-4 rounded-full inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary cursor-pointer"
                            title="Clear product"
                          >
                            <X className="h-2.5 w-2.5" />
                          </span>
                        )}
                        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200", xferProductOpen && "rotate-180")} />
                      </div>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[320px] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Type SKU, barcode, or name to filter..."
                        value={xferProductSearch}
                        onValueChange={setXferProductSearch}
                        className="h-9 text-xs"
                        autoFocus
                      />
                      <CommandList className="max-h-56 overflow-y-auto p-1">
                        {filteredXferProducts.length === 0 ? (
                          <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">
                            No products found matching "{xferProductSearch}"
                          </CommandEmpty>
                        ) : (
                          <CommandGroup>
                            {filteredXferProducts.map((r) => {
                              const isSelected = r.product_id === xferForm.product_id;
                              return (
                                <CommandItem
                                  key={r.product_id}
                                  value={`${r.sku} ${r.barcode || ""} ${r.name}`}
                                  onSelect={() => {
                                    setXferForm(f => ({ ...f, product_id: r.product_id }));
                                    setXferProductSearch("");
                                    setXferProductOpen(false);
                                  }}
                                  className={cn(
                                    "flex items-center justify-between cursor-pointer py-2 px-2.5 rounded text-xs",
                                    isSelected ? "bg-primary text-primary-foreground font-semibold" : "hover:bg-accent hover:text-accent-foreground"
                                  )}
                                >
                                  <div className="flex items-center gap-1.5 min-w-0 pr-2">
                                    <Check className={cn("h-3.5 w-3.5 shrink-0", isSelected ? "text-primary-foreground opacity-100" : "opacity-0")} />
                                    <span className={cn("font-mono font-semibold shrink-0", isSelected ? "text-primary-foreground" : "text-primary")}>
                                      {r.sku}
                                    </span>
                                    <span className="truncate">{r.name}</span>
                                    {r.barcode && (
                                      <span className={cn("text-[10px] font-mono shrink-0", isSelected ? "text-primary-foreground/80" : "text-muted-foreground/70")}>
                                        ({r.barcode})
                                      </span>
                                    )}
                                  </div>
                                  <span className={cn("text-[11px] tabular-nums shrink-0", isSelected ? "text-primary-foreground/90 font-semibold" : "text-muted-foreground")}>
                                    Avail: {r.qty_on_hand}
                                  </span>
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {xferForm.product_id && (
                <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">Source Available On-Hand:</span>
                  <span className="font-semibold font-mono text-sm">{xferSourceStock} units</span>
                </div>
              )}

              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Transfer Quantity <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="number"
                  min={1}
                  className="mt-1 h-9 bg-background font-mono font-semibold"
                  value={xferForm.qty}
                  onChange={e => setXferForm(f => ({ ...f, qty: Math.max(1, Number(e.target.value) || 1) }))}
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Transfer Reason / Note
                </Label>
                <Input
                  className="mt-1 h-9 bg-background text-xs"
                  placeholder="e.g. Branch replenishment, inventory rebalance"
                  value={xferForm.reason}
                  onChange={e => setXferForm(f => ({ ...f, reason: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" size="sm" onClick={() => setXferOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={transferMut.isPending || !xferForm.product_id || !xferForm.to_store_id || xferForm.qty <= 0}
                onClick={submitTransfer}
              >
                {transferMut.isPending ? "Transferring..." : "Confirm Transfer"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageBody>
    </>
  );
}
