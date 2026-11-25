import React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader, PageBody, FilterBar, StatusBadge, SectionCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { Plus, Download, Search, RefreshCw, AlertCircle, X, Upload, ChevronRight, ChevronDown, SlidersHorizontal, Sparkles, Wand2, Check, Package, TrendingUp, ImagePlus, Barcode, ScanLine, LayoutGrid, List, ArrowLeft, Printer, Camera, Trash2, Lock, Eye, EyeOff, Boxes, Calendar, Tag, Edit3, DollarSign, ShieldCheck } from "lucide-react";
import { CameraBarcodeScannerDialog } from "@/components/scanner/CameraBarcodeScannerDialog";
import { useApp } from "@/lib/app-store";
import { useAuth } from "@/lib/auth-provider";
import { INDUSTRY_PACKS, type IndustryPackId } from "@/lib/industry-registry";
import { fmtBDT, stores } from "@/lib/pos-data";
import { shouldUseBackend } from "@/lib/demo-mode";
import { resolveLiveRows, EMPTY_LIVE_LABEL } from "@/lib/live-data";
import { apiFetch, api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import {
  useApiProducts, useApiStock, useCreateProduct, useUpdateProduct, useDeleteProduct, useProduct,
  useCategories, useBrands, useUnits, useCreateCategory, useCreateBrand, useCreateUnit,
  useGenerateFashionVariantMatrix, useStockAdjust, useApiStores,
  usePostOpeningStock, useProductBatches, type ApiProductBatch,
} from "@/hooks/use-api-config";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ProductBarcodePanel, ProductVariantPanel } from "@/features/products/ProductCatalogPanels";
import { BarcodeLabelPrintDialog, type BarcodePrintProduct } from "@/components/products/BarcodeLabelPrintDialog";
import { ProductMetaFields } from "@/components/pulse/ProductMetaFields";
import { requirePermission } from "@/lib/permission-ui";
import { getUnifiedProductFields, resetProductMeta, validateUnifiedProductMeta } from "@/lib/product-field-utils";
import { orderCategoryTree } from "@/lib/category-tree";
import { toast } from "sonner";
import { resolveImageUrl } from "@/lib/utils";
import { demoProducts } from "@/lib/mock-extra";
import { loadScannerConfig } from "@/routes/app.settings";
import { toCsv } from "@/lib/csv";
import { saveTextFile, timestampedFilename } from "@/lib/download";

export const Route = createFileRoute("/app/products")({ component: Products });

const COLOR_HEX_MAP: Record<string, string> = {
  black: "#0f172a",
  white: "#f8fafc",
  navy: "#1e3a8a",
  blue: "#2563eb",
  red: "#dc2626",
  grey: "#64748b",
  gray: "#64748b",
  green: "#16a34a",
  maroon: "#881337",
  beige: "#d4b996",
  olive: "#556b2f",
  yellow: "#eab308",
  pink: "#ec4899",
  purple: "#9333ea",
  orange: "#f97316",
  brown: "#78350f",
  cyan: "#06b6d4",
  teal: "#0d9488",
};

function getFashionColorHex(name: string): string {
  if (!name) return "#94a3b8";
  const lower = name.toLowerCase().trim();
  return COLOR_HEX_MAP[lower] || "#94a3b8";
}

/** Clean Modal Dialog affordance for adding a new master record (category/brand/unit)
 * and automatically selecting it in the product form. */
function QuickAddMaster({
  label,
  industryPack,
  onCreate,
  onCreated,
}: {
  label: string;
  industryPack?: string;
  onCreate: (body: { code: string; name: string; industry_pack?: string }) => Promise<{ id: string }>;
  onCreated: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);

  const formattedLabel = label.charAt(0).toUpperCase() + label.slice(1);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    const finalCode = code.trim() || name.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) || `M-${Date.now().toString().slice(-4)}`;
    try {
      const created = await onCreate({ code: finalCode, name: name.trim(), industry_pack: industryPack });
      if (created?.id) {
        onCreated(created.id);
      }
      setOpen(false);
      setName("");
      setCode("");
    } catch (err) {
      console.error(err);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline cursor-pointer"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-3 w-3" /> New {label.toLowerCase()}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              Add New {formattedLabel}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-4 pt-2">
            {industryPack && (
              <div className="rounded-md bg-secondary/50 px-2.5 py-1.5 text-[11px] text-muted-foreground flex items-center justify-between">
                <span>POS Vertical</span>
                <span className="font-semibold text-foreground uppercase tracking-wide">{industryPack}</span>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                {formattedLabel} Name <span className="text-destructive">*</span>
              </Label>
              <Input
                autoFocus
                placeholder={`e.g. ${label === "category" ? "Apparel / Shirts" : label === "brand" ? "Nike" : "Pieces (Pcs)"}`}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!code || code === name.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10)) {
                    setCode(e.target.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10));
                  }
                }}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">{formattedLabel} Code / Key</Label>
                <span className="text-[10px] text-muted-foreground">Auto-generated if empty</span>
              </div>
              <Input
                placeholder="e.g. SHIRTS, NIK, PCS"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="h-9 text-xs font-mono"
              />
            </div>

            <DialogFooter className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={pending || !name.trim()}
              >
                {pending ? "Saving…" : `Save & Select ${formattedLabel}`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Scanner-aware barcode input. Captures rapid keyboard input (scanner pattern)
 * globally and funnels it into this field. Shows a live scanning indicator. */
function BarcodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const bufferRef = useRef("");
  const lastKeyRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<"idle" | "scanning" | "done">("idle");
  const [cameraOpen, setCameraOpen] = useState(false);

  useEffect(() => {
    const cfg = loadScannerConfig();
    if (!cfg.enabled) return;

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // If focus is already in an input/textarea (other than our own), don't intercept
      const tag = target.tagName.toLowerCase();
      if ((tag === "input" || tag === "textarea") && target !== inputRef.current) return;
      if (e.key.length !== 1 && e.key !== "Enter") return;

      const now = Date.now();
      const gap = now - lastKeyRef.current;
      lastKeyRef.current = now;

      if (e.key === "Enter") {
        if (bufferRef.current.length >= cfg.minLength) {
          onChange(bufferRef.current);
          setStatus("done");
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => setStatus("idle"), 2500);
        }
        bufferRef.current = "";
        return;
      }

      // Fast keystroke → scanner input
      if (gap > cfg.intervalMs && bufferRef.current.length > 0) {
        bufferRef.current = "";
      }
      bufferRef.current += e.key;
      setStatus("scanning");

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (bufferRef.current.length >= cfg.minLength) {
          onChange(bufferRef.current);
          setStatus("done");
          timerRef.current = setTimeout(() => setStatus("idle"), 2500);
        } else {
          setStatus("idle");
        }
        bufferRef.current = "";
      }, cfg.intervalMs * 3);
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onChange]);

  return (
    <div className="mt-1 flex items-center gap-1.5">
      <div className="relative flex-1">
        <div className={`absolute inset-0 rounded-md pointer-events-none transition-all duration-200 ${
          status === "scanning" ? "ring-2 ring-primary/60 bg-primary/5" :
          status === "done" ? "ring-2 ring-emerald-400/60 bg-emerald-50/50 dark:bg-emerald-950/20" : ""
        }`} />
        <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
          {status === "scanning"
            ? <ScanLine className="h-3.5 w-3.5 text-primary animate-pulse" />
            : status === "done"
            ? <Check className="h-3.5 w-3.5 text-emerald-500" />
            : <Barcode className="h-3.5 w-3.5" />}
        </div>
        <Input
          ref={inputRef}
          value={value}
          onChange={e => { onChange(e.target.value); setStatus("idle"); }}
          placeholder="Scan barcode or type manually…"
          className={`h-9 pl-8 pr-16 text-xs font-mono transition-all ${
            status === "done" ? "text-emerald-700 dark:text-emerald-400" : ""
          }`}
        />
        {status === "done" && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 pointer-events-none">
            Scanned ✓
          </span>
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 px-2.5 gap-1.5 shrink-0 text-xs border-dashed text-primary hover:bg-primary/5 cursor-pointer"
        onClick={() => setCameraOpen(true)}
        title="Scan barcode with device camera"
      >
        <Camera className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Camera</span>
      </Button>

      <CameraBarcodeScannerDialog
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        title="Scan Product Barcode"
        subtitle="Point camera at product UPC, EAN, or Code 128 barcode"
        continuous={false}
        onScan={(code) => {
          onChange(code);
          setStatus("done");
          toast.success(`Barcode scanned: ${code}`);
        }}
      />
    </div>
  );
}



type Row = {
  id?: string;
  sku: string;
  name: string;
  pack: string;
  industry?: string;
  cost_price?: number | null;
  price: number;
  wholesale_price?: number | null;
  stock: number;
  status: "active" | "inactive";
  barcode?: string;
  category_id?: string | null;
  brand_id?: string | null;
  unit_id?: string | null;
  meta?: Record<string, unknown>;
};

function ProductBatchesDetail({ productId }: { productId: string }) {
  const { data: batches = [], isLoading } = useProductBatches(productId, true);

  if (isLoading) {
    return <div className="text-xs text-muted-foreground py-2">Loading active batches...</div>;
  }

  if (batches.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 bg-secondary/10 p-3 text-xs text-muted-foreground">
        Single lot inventory · No separate batches registered.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/40 rounded-lg border border-border/60 bg-secondary/15 overflow-hidden text-xs">
      {batches.map((b, idx) => {
        const days = b.expiry_date
          ? Math.floor((new Date(b.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          : null;
        const isExpired = days != null && days <= 0;
        const isNear = days != null && days > 0 && days <= 90;
        return (
          <div key={b.id || idx} className="flex items-center justify-between p-2.5 hover:bg-secondary/30 transition-colors">
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
              <span className="text-[11px] text-muted-foreground ml-1">available</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Products() {
  const app = useApp();
  const { can: authCan, isDemo, user } = useAuth();
  const can = (p: Parameters<typeof authCan>[0]) => isDemo ? app.can(p) : authCan(p);

  const enabledPacks = app.enabledPacks;
  const defaultPack = (app.posMode !== "universal" && app.isPackEnabled(app.posMode) ? app.posMode : (enabledPacks[0] ?? "grocery")) as IndustryPackId;
  const fieldCtx = { store: app.store, counter: app.counter };
  const useApi = shouldUseBackend();

  const [q, setQ] = useState("");
  const [packFilter, setPackFilterRaw] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deleteConfirmProduct, setDeleteConfirmProduct] = useState<{ id: string; name: string; sku: string } | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const packFilterTouched = useRef(false);
  const setPackFilter = (v: string) => { packFilterTouched.current = true; setPackFilterRaw(v); };
  
  useEffect(() => {
    if (packFilterTouched.current) return;
    setPackFilterRaw(app.posMode !== "universal" && app.isPackEnabled(app.posMode) ? app.posMode : "all");
  }, [app.posMode]);

  const storesQuery = useApiStores();
  const activeStoreId = useMemo(() => {
    if (!storesQuery.data?.length) return app.store || undefined;
    if (app.store) {
      const match = storesQuery.data.find(s => s.id === app.store || s.code === app.store || s.name === app.store);
      if (match?.id) return match.id;
    }
    return storesQuery.data[0]?.id || app.store || undefined;
  }, [app.store, storesQuery.data]);
  const currentStoreName = useMemo(() => {
    // 1. Authenticated user's store or company identity
    if (user?.store_name) return user.store_name;
    if (user?.company_name) return user.company_name;

    // 2. Active store from real backend stores query
    if (app.store && storesQuery.data?.length) {
      const apiMatch = storesQuery.data.find(s => s.id === app.store || s.code === app.store);
      if (apiMatch?.name) return apiMatch.name;
    }
    if (storesQuery.data?.[0]?.name) {
      return storesQuery.data[0].name;
    }

    // 3. User company code
    if (user?.company_code) return user.company_code;

    // 4. Only in mock demo mode fallback to demo stores
    if (isDemo && app.store) {
      const demoMatch = stores.find(s => s.id === app.store || s.code === app.store);
      if (demoMatch?.name) return demoMatch.name;
      return stores[0]?.name || "Main Store";
    }

    return "Main Store";
  }, [user?.store_name, user?.company_name, user?.company_code, app.store, storesQuery.data, isDemo]);

  const [page, setPage] = useState(1);
  const [form, setForm] = useState({
    sku: "",
    name: "",
    industry_pack: defaultPack,
    base_price: "",
    wholesale_price: "",
    cost_price: "",
    initial_stock: "",
    barcode: "",
    category_id: "",
    brand_id: "",
    unit_id: "",
    is_active: true,
  });
  const [meta, setMeta] = useState<Record<string, string | number | boolean>>(() =>
    resetProductMeta(defaultPack, app.dynamicFields, fieldCtx),
  );
  const [editId, setEditId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editTab, setEditTab] = useState("details");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [sizesInput, setSizesInput] = useState("");
  const [colorsInput, setColorsInput] = useState("");
  const [variantQuantities, setVariantQuantities] = useState<Record<string, string>>({});
  const [bulkVariantQty, setBulkVariantQty] = useState("");
  const [variantViewMode, setVariantViewMode] = useState<"matrix" | "list">("matrix");
  const [barcodePrintProduct, setBarcodePrintProduct] = useState<BarcodePrintProduct | null>(null);

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const toggleRowExpanded = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Global barcode scan-to-lookup / scan-to-create ─────────────────────────
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const scanBufRef = useRef("");
  const scanLastKeyRef = useRef(0);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const cfg = loadScannerConfig();
    if (!cfg.enabled) return;

    const onKey = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in an input/textarea
      const target = e.target as HTMLElement;
      const tag = target.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.key.length !== 1 && e.key !== "Enter") return;

      const now = Date.now();
      const gap = now - scanLastKeyRef.current;
      scanLastKeyRef.current = now;

      if (e.key === "Enter") {
        const code = scanBufRef.current.trim();
        scanBufRef.current = "";
        if (code.length < cfg.minLength) return;
        handleScanLookup(code);
        return;
      }

      if (gap > cfg.intervalMs && scanBufRef.current.length > 0) {
        scanBufRef.current = "";
      }
      scanBufRef.current += e.key;

      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
      scanTimerRef.current = setTimeout(() => {
        const code = scanBufRef.current.trim();
        scanBufRef.current = "";
        if (code.length >= cfg.minLength) handleScanLookup(code);
      }, cfg.intervalMs * 3);
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useApi]);

  const handleScanLookup = (code: string) => {
    // Search all loaded products for a barcode match
    const allProducts = apiQuery.data?.items ?? [];
    const match = allProducts.find(
      p => p.barcode === code || p.sku === code
    );

    if (match) {
      // Found — open edit drawer and highlight the row
      toast.success(`Product found: ${match.name}`, { description: `Barcode: ${code}` });
      setHighlightedId(match.id);
      setTimeout(() => setHighlightedId(null), 3000);
      // Open edit
      const row = apiRows.find(r => r.id === match.id);
      if (row) openEditProduct(row);
    } else {
      // Not found — open New Product form with barcode pre-filled
      toast.info("New barcode detected — fill in details to create product", {
        description: `Barcode: ${code}`,
        duration: 4000,
      });
      setEditId(null);
      setForm({
        sku: "",
        name: "",
        industry_pack: defaultPack,
        base_price: "",
        wholesale_price: "",
        cost_price: "",
        initial_stock: "",
        barcode: code,
        category_id: "",
        brand_id: "",
        unit_id: "",
        is_active: true,
      });
      setMeta(resetProductMeta(defaultPack, app.dynamicFields, fieldCtx));
      setSizesInput("");
      setColorsInput("");
      setDrawerOpen(true);
    }
  };
  // ──────────────────────────────────────────────────────────────────────────

  const [visibleCustomColumns, setVisibleCustomColumns] = useState<Set<string>>(new Set());
  const toggleColumnVisible = (key: string) => {
    setVisibleCustomColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file (PNG, JPG, JPEG, WEBP or GIF)");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size exceeds 5MB limit");
      return;
    }

    setUploadingImage(true);
    try {
      if (useApi) {
        try {
          const fd = new FormData();
          fd.append("file", file);
          const res = await apiFetch<{ url: string }>("/products/upload-image", {
            method: "POST",
            body: fd,
            timeout: 60000,
          });
          setMeta(m => ({ ...m, image: res.url }));
          toast.success("Image uploaded successfully");
        } catch (uploadErr) {
          console.warn("Server upload timed out or failed, attaching local preview image...", uploadErr);
          const reader = new FileReader();
          reader.onloadend = () => {
            setMeta(m => ({ ...m, image: reader.result as string }));
            toast.success("Image attached successfully");
          };
          reader.readAsDataURL(file);
        }
      } else {
        const reader = new FileReader();
        reader.onloadend = () => {
          setMeta(m => ({ ...m, image: reader.result as string }));
          toast.success("Image loaded");
        };
        reader.readAsDataURL(file);
      }
    } catch (err) {
      const msg = err && typeof err === "object" && "detail" in err
        ? String((err as any).detail)
        : "Failed to load image";
      toast.error(msg);
      console.error(err);
    } finally {
      setUploadingImage(false);
    }
  };

  const detailQuery = useProduct(detailId ?? undefined);
  const [showAllMasters, setShowAllMasters] = useState(false);
  const activeProductPack = showAllMasters ? undefined : (form.industry_pack || (packFilter !== "all" ? packFilter : defaultPack));
  const categoriesQuery = useCategories({ industry: activeProductPack }, useApi);
  const allCategoriesQuery = useCategories(undefined, useApi && !showAllMasters);
  const brandsQuery = useBrands({ industry: activeProductPack }, useApi);
  const allBrandsQuery = useBrands(undefined, useApi && !showAllMasters);
  const orderedCategories = useMemo(() => {
    const list = [...(categoriesQuery.data ?? [])];
    if (form.category_id && !list.some(c => c.id === form.category_id)) {
      const fallbackCat = allCategoriesQuery.data?.find(c => c.id === form.category_id);
      if (fallbackCat) {
        list.push(fallbackCat);
      }
    }
    return orderCategoryTree(list);
  }, [categoriesQuery.data, allCategoriesQuery.data, form.category_id]);
  const availableBrands = useMemo(() => {
    const list = [...(brandsQuery.data ?? [])];
    if (form.brand_id && !list.some(b => b.id === form.brand_id)) {
      const fallbackBrand = allBrandsQuery.data?.find(b => b.id === form.brand_id);
      if (fallbackBrand) {
        list.push(fallbackBrand);
      }
    }
    return list;
  }, [brandsQuery.data, allBrandsQuery.data, form.brand_id]);
  const unitsQuery = useUnits(undefined, useApi);
  const createCategoryMut = useCreateCategory();
  const createBrandMut = useCreateBrand();
  const createUnitMut = useCreateUnit();

  const industryParam = packFilter !== "all" ? (INDUSTRY_PACKS.find(p => p.shortName === packFilter || p.id === packFilter)?.id as IndustryPackId | undefined) : undefined;
  const apiQuery = useApiProducts({
    industry: industryParam,
    q: q || undefined,
    page,
    limit: 100,
    status: statusFilter === "all" ? undefined : statusFilter,
  });
  const stockQuery = useApiStock();
  const createMut = useCreateProduct();
  const updateMut = useUpdateProduct();
  const deleteMut = useDeleteProduct();
  const generateMatrixMut = useGenerateFashionVariantMatrix();
  const adjustStockMut = useStockAdjust();
  const openingStockMut = usePostOpeningStock();

  const [initialBatchNo, setInitialBatchNo] = useState("");
  const [initialExpiryDate, setInitialExpiryDate] = useState("");
  const [newBatchNo, setNewBatchNo] = useState("");
  const [newBatchExpiry, setNewBatchExpiry] = useState("");
  const [newBatchQty, setNewBatchQty] = useState("");
  const [isAddingBatch, setIsAddingBatch] = useState(false);
  const [hasSecondBatch, setHasSecondBatch] = useState(false);
  const [secondBatchNo, setSecondBatchNo] = useState("");
  const [secondBatchExpiry, setSecondBatchExpiry] = useState("");
  const [secondBatchQty, setSecondBatchQty] = useState("");

  const isBatchTrackedPack = ["cosmetics", "pharmacy", "grocery", "super-shop", "surgical-shop"].includes(form.industry_pack);
  const batchesQuery = useProductBatches(editId || undefined, Boolean(editId && isBatchTrackedPack));

  const activePackFilter = packFilter !== "all" ? (packFilter as IndustryPackId) : undefined;
  const allDynamicColumns = useMemo(() => {
    if (!activePackFilter) return [];
    return getUnifiedProductFields(activePackFilter, app.dynamicFields, fieldCtx);
  }, [activePackFilter, app.dynamicFields, app.store, app.counter]);

  const dynamicColumns = useMemo(() => {
    return allDynamicColumns.filter(col => visibleCustomColumns.has(col.key));
  }, [allDynamicColumns, visibleCustomColumns]);

  const apiRows: Row[] = useMemo(() => {
    if (!apiQuery.data?.items) return [];
    const stockMap = new Map((stockQuery.data ?? []).map(s => [s.product_id, s.qty_available ?? s.qty_on_hand]));
    return apiQuery.data.items.map(p => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      pack: INDUSTRY_PACKS.find(ip => ip.id === p.industry_pack)?.shortName ?? p.industry_pack,
      industry: p.industry_pack,
      cost_price: p.cost_price ?? null,
      price: p.base_price,
      wholesale_price: p.wholesale_price ?? null,
      stock: stockMap.get(p.id) ?? 0,
      status: (p.is_active ? "active" : "inactive") as "active" | "inactive",
      barcode: p.barcode ?? "",
      category_id: p.category_id,
      brand_id: p.brand_id,
      unit_id: p.unit_id,
      meta: p.meta ?? {},
    }));
  }, [apiQuery.data, stockQuery.data]);

  const { rows: catalogSource, isEmpty } = resolveLiveRows<any>(useApi, apiRows, apiQuery.isLoading, demoProducts);
  const rows = catalogSource.filter(r =>
    (packFilter === "all" || r.pack === packFilter || r.industry === packFilter) &&
    (statusFilter === "all" || r.status === statusFilter) &&
    (!q || r.name.toLowerCase().includes(q.toLowerCase()) || r.sku.toLowerCase().includes(q.toLowerCase()) || (r.barcode && r.barcode.toLowerCase().includes(q.toLowerCase())))
  );

  const [debouncedBarcode, setDebouncedBarcode] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedBarcode(form.barcode?.trim() || "");
    }, 350);
    return () => clearTimeout(t);
  }, [form.barcode]);

  const barcodeLookupQuery = useQuery({
    queryKey: ["barcode-remote-lookup", debouncedBarcode],
    queryFn: async () => {
      if (!debouncedBarcode || editId) return null;
      try {
        const res = await api.get<any>(`/products/barcode/${encodeURIComponent(debouncedBarcode)}`);
        return res?.product || null;
      } catch {
        return null;
      }
    },
    enabled: Boolean(useApi && !editId && debouncedBarcode.length >= 3),
    staleTime: 30_000,
  });

  const matchingProduct = useMemo(() => {
    const b = form.barcode?.trim();
    if (!b) return null;
    const local = catalogSource.find(r => r.barcode && r.barcode.trim().toLowerCase() === b.toLowerCase() && r.id !== editId);
    if (local) return local;
    const remote = barcodeLookupQuery.data;
    if (remote && remote.id !== editId && ((remote.barcode && remote.barcode.trim().toLowerCase() === b.toLowerCase()) || (remote.sku && remote.sku.trim().toLowerCase() === b.toLowerCase()))) {
      return {
        id: remote.id,
        sku: remote.sku,
        name: remote.name,
        barcode: remote.barcode || b,
        price: remote.base_price,
        cost_price: remote.cost_price ?? null,
        pack: remote.industry_pack,
        industry: remote.industry_pack,
        category_id: remote.category_id,
        brand_id: remote.brand_id,
        unit_id: remote.unit_id,
        meta: remote.meta || {},
        status: remote.is_active ? "active" : "inactive",
      };
    }
    return null;
  }, [catalogSource, form.barcode, editId, barcodeLookupQuery.data]);

  useEffect(() => {
    if (matchingProduct && !editId) {
      setForm(prev => ({
        ...prev,
        name: prev.name.trim() ? prev.name : matchingProduct.name,
        category_id: prev.category_id || matchingProduct.category_id || "",
        brand_id: prev.brand_id || matchingProduct.brand_id || "",
        unit_id: prev.unit_id || matchingProduct.unit_id || "",
        base_price: Number(prev.base_price) > 0 ? prev.base_price : (matchingProduct.price ? String(matchingProduct.price) : prev.base_price),
        cost_price: Number(prev.cost_price) > 0 ? prev.cost_price : (matchingProduct.cost_price ? String(matchingProduct.cost_price) : prev.cost_price),
      }));
    }
  }, [matchingProduct, editId]);

  const exportProductCatalogCsv = () => {
    if (rows.length === 0) {
      toast.error("No products to export");
      return;
    }
    const headers = ["SKU", "Name", "Barcode", "Industry Pack", "Cost Price", "Base Price", "Stock On Hand", "Status"];
    const exportData = rows.map(r => ({
      "SKU": r.sku,
      "Name": r.name,
      "Barcode": r.barcode || "",
      "Industry Pack": r.pack || r.industry || "",
      "Cost Price": r.cost_price ?? "",
      "Base Price": r.price,
      "Stock On Hand": r.stock,
      "Status": r.status,
    }));
    const csvContent = toCsv(headers, exportData);
    saveTextFile(timestampedFilename("products-catalog", "csv"), csvContent);
    toast.success(`Exported ${rows.length} products to CSV`);
  };

  const formatIsoDate = (d: string | undefined | null): string | undefined => {
    if (!d) return undefined;
    const s = String(d).trim();
    if (!s) return undefined;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (m) {
      const p1 = parseInt(m[1], 10);
      const p2 = parseInt(m[2], 10);
      const yr = m[3];
      if (p2 >= 1 && p2 <= 12) {
        return `${yr}-${String(p2).padStart(2, "0")}-${String(p1).padStart(2, "0")}`;
      }
      if (p1 >= 1 && p1 <= 12) {
        return `${yr}-${String(p1).padStart(2, "0")}-${String(p2).padStart(2, "0")}`;
      }
    }
    return s;
  };

  const saveProduct = async () => {
    if (!requirePermission(can("inventory.edit"))) return;
    const finalName = form.name.trim();
    if (!finalName) { toast.error("Product name is required"); return; }
    const finalSku = form.sku.trim() || `SKU-${Math.floor(100000 + Math.random() * 900000)}`;
    const nextMeta: Record<string, string | number | boolean> = { ...meta };
    const masterBody = {
      category_id: form.category_id || undefined,
      brand_id: form.brand_id || undefined,
      unit_id: form.unit_id || undefined,
    };
    if (initialExpiryDate) {
      nextMeta.expiry_date = initialExpiryDate;
    }
    if (form.brand_id) {
      const bObj = availableBrands.find(b => b.id === form.brand_id) ?? allBrandsQuery.data?.find(b => b.id === form.brand_id);
      if (bObj) nextMeta.brand = bObj.name;
    }
    if (form.category_id) {
      const cObj = orderedCategories.find(c => c.id === form.category_id) ?? allCategoriesQuery.data?.find(c => c.id === form.category_id);
      nextMeta.category = cObj ? cObj.name : (nextMeta.category || form.category_id);
    }
    if (form.unit_id) {
      const uObj = unitsQuery.data?.find(u => u.id === form.unit_id);
      if (uObj) nextMeta.unit = uObj.name;
    }
    const metaError = validateUnifiedProductMeta(form.industry_pack, nextMeta, app.dynamicFields, fieldCtx);
    if (metaError) { toast.error(metaError); return; }
    Object.assign(meta, nextMeta);
    const canPrice = can("inventory.price");
    const basePriceNum = Number(form.base_price || 0);
    const wholesalePriceNum = Number(form.wholesale_price || 0);
    const costPriceNum = Number(form.cost_price || 0);
    // If per-variant quantities are entered, sum them as the total initial stock
    const variantQtyTotal = Object.values(variantQuantities).reduce((acc, v) => acc + (Number(v) || 0), 0);
    const initialStockNum = variantQtyTotal > 0 ? variantQtyTotal : Number(form.initial_stock || 0);

    if (editId) {
      await updateMut.mutateAsync({
        id: editId,
        body: {
          sku: finalSku,
          name: finalName,
          base_price: basePriceNum,
          ...(canPrice ? { wholesale_price: wholesalePriceNum, cost_price: costPriceNum } : {}),
          barcode: form.barcode || null,
          is_active: form.is_active,
          ...masterBody,
          meta,
        },
      });

      // In edit mode: if stock quantity was modified by the user, perform a stock adjustment (qty_after)
      // Never call openingStockMut here, because opening stock is an additive inflow that doubles existing stock.
      if (useApi && form.initial_stock !== "" && Number(form.initial_stock) !== Number(detailQuery.data?.stock_qty ?? 0)) {
        try {
          await adjustStockMut.mutateAsync({
            product_id: editId,
            store_id: activeStoreId,
            qty_after: Number(form.initial_stock || 0),
            reason: "Stock correction from Product Master",
          });
          toast.success(`Stock adjusted to ${Number(form.initial_stock || 0)} units`);
        } catch (err: any) {
          console.error("Failed to update stock:", err);
          const msg = err?.response?.data?.detail || err?.detail || err?.message || "Failed to adjust stock";
          toast.error(typeof msg === "string" ? msg : JSON.stringify(msg));
        }
      }

      if (hasSecondBatch && Number(secondBatchQty) > 0 && useApi) {
        try {
          await openingStockMut.mutateAsync({
            product_id: editId,
            store_id: activeStoreId,
            qty: Number(secondBatchQty),
            unit_cost: costPriceNum || undefined,
            batch_no: secondBatchNo.trim() || "Second Batch",
            expiry_date: formatIsoDate(secondBatchExpiry),
            note: "Secondary batch from Product Master",
          });
          toast.success(`Registered secondary batch "${secondBatchNo.trim() || "Second Batch"}"`);
        } catch (err: any) {
          console.error("Failed to post secondary batch:", err);
          const msg = err?.response?.data?.detail || err?.detail || err?.message || "Failed to post secondary batch";
          toast.error(typeof msg === "string" ? msg : JSON.stringify(msg));
        }
      }

      if (form.industry_pack === "fashion" && (sizesInput.trim() || colorsInput.trim())) {
        const sizes = sizesInput.split(",").map(s => s.trim()).filter(Boolean);
        const colors = colorsInput.split(",").map(c => c.trim()).filter(Boolean);
        if (sizes.length > 0 || colors.length > 0) {
          try {
            await generateMatrixMut.mutateAsync({
              productId: editId,
              body: {
                sizes,
                colors,
                generate_barcodes: true,
                skip_existing: true,
              },
            });
          } catch (err) {
            console.error("Failed to generate variant matrix:", err);
          }
        }
      }
    } else if (matchingProduct || form.barcode?.trim()) {
      let targetMatching = matchingProduct;
      if (!targetMatching && form.barcode?.trim() && useApi) {
        try {
          const res = await api.get<any>(`/products/barcode/${encodeURIComponent(form.barcode.trim())}`);
          if (res?.product?.id) {
            const remote = res.product;
            targetMatching = {
              id: remote.id,
              sku: remote.sku,
              name: remote.name,
              barcode: remote.barcode || form.barcode.trim(),
              price: remote.base_price,
              cost_price: remote.cost_price ?? null,
              pack: remote.industry_pack,
              industry: remote.industry_pack,
              category_id: remote.category_id,
              brand_id: remote.brand_id,
              unit_id: remote.unit_id,
              meta: remote.meta || {},
              status: remote.is_active ? "active" : "inactive",
            };
          }
        } catch {
          // Not found remotely
        }
      }

      if (targetMatching) {
        // User is adding a new batch for an existing barcode!
        try {
          await updateMut.mutateAsync({
            id: targetMatching.id,
            body: {
              name: finalName || targetMatching.name,
              base_price: basePriceNum || targetMatching.price,
              ...(canPrice && (wholesalePriceNum || costPriceNum) ? { wholesale_price: wholesalePriceNum || undefined, cost_price: costPriceNum || undefined } : {}),
              ...masterBody,
              meta,
            },
          });
        } catch (err) {
          console.warn("Could not update metadata on matching product:", err);
        }

        const batchNoToPost = initialBatchNo.trim() || newBatchNo.trim() || "New Stock";
        const expDateToPost = initialExpiryDate || newBatchExpiry || (meta?.expiry_date ? String(meta.expiry_date) : undefined);
        const qtyToPost = initialStockNum > 0 ? initialStockNum : (Number(newBatchQty) > 0 ? Number(newBatchQty) : 10);

        if (useApi) {
          try {
            await openingStockMut.mutateAsync({
              product_id: targetMatching.id,
              store_id: activeStoreId,
              qty: qtyToPost,
              unit_cost: costPriceNum || undefined,
              batch_no: batchNoToPost,
              expiry_date: formatIsoDate(expDateToPost),
              note: "New batch registered for existing barcode",
            });
            toast.success(`Registered batch "${batchNoToPost}" for ${targetMatching.name}`);
          } catch (err: any) {
            console.error("Failed to post batch for existing product:", err);
            const msg = err?.response?.data?.detail || err?.detail || err?.message || "Failed to register new batch";
            toast.error(typeof msg === "string" ? msg : JSON.stringify(msg));
          }

          if (hasSecondBatch && Number(secondBatchQty) > 0) {
            try {
              await openingStockMut.mutateAsync({
                product_id: targetMatching.id,
                store_id: activeStoreId,
                qty: Number(secondBatchQty),
                unit_cost: costPriceNum || undefined,
                batch_no: secondBatchNo.trim() || "Second Batch",
                expiry_date: formatIsoDate(secondBatchExpiry),
                note: "Secondary batch from Product Master",
              });
              toast.success(`Registered secondary batch "${secondBatchNo.trim() || "Second Batch"}"`);
            } catch (err: any) {
              console.error("Failed to post secondary batch:", err);
              const msg = err?.response?.data?.detail || err?.detail || err?.message || "Failed to post secondary batch";
              toast.error(typeof msg === "string" ? msg : JSON.stringify(msg));
            }
          }
        }
      } else {
        const created = await createMut.mutateAsync({
          ...form,
          sku: finalSku,
          name: finalName,
          base_price: basePriceNum,
          wholesale_price: canPrice ? wholesalePriceNum : undefined,
          cost_price: canPrice ? costPriceNum : undefined,
          barcode: form.barcode || undefined,
          ...masterBody,
          meta,
        });

        if (created?.id) {
          if (initialStockNum > 0 && useApi) {
            try {
              if (initialBatchNo.trim() || initialExpiryDate) {
                await openingStockMut.mutateAsync({
                  product_id: created.id,
                  store_id: activeStoreId,
                  qty: initialStockNum,
                  unit_cost: costPriceNum || undefined,
                  batch_no: initialBatchNo.trim() || undefined,
                  expiry_date: formatIsoDate(initialExpiryDate),
                  note: "Initial Opening Stock from Product Master",
                });
              } else {
                await adjustStockMut.mutateAsync({
                  product_id: created.id,
                  store_id: activeStoreId,
                  qty_after: initialStockNum,
                  reason: "Initial Opening Stock",
                });
              }
            } catch (err: any) {
              console.error("Failed to post initial stock:", err);
              const msg = err?.response?.data?.detail || err?.detail || err?.message || "Failed to post initial stock";
              toast.error(typeof msg === "string" ? msg : JSON.stringify(msg));
            }
          }

          if (hasSecondBatch && Number(secondBatchQty) > 0 && useApi) {
            try {
              await openingStockMut.mutateAsync({
                product_id: created.id,
                store_id: activeStoreId,
                qty: Number(secondBatchQty),
                unit_cost: costPriceNum || undefined,
                batch_no: secondBatchNo.trim() || "New Stock",
                expiry_date: formatIsoDate(secondBatchExpiry),
                note: "Secondary Batch from Product Master",
              });
            } catch (err: any) {
              console.error("Failed to post secondary batch:", err);
              const msg = err?.response?.data?.detail || err?.detail || err?.message || "Failed to post secondary batch";
              toast.error(typeof msg === "string" ? msg : JSON.stringify(msg));
            }
          }

          if (form.industry_pack === "fashion" && (sizesInput.trim() || colorsInput.trim())) {
            const sizes = sizesInput.split(",").map(s => s.trim()).filter(Boolean);
            const colors = colorsInput.split(",").map(c => c.trim()).filter(Boolean);
            if (sizes.length > 0 || colors.length > 0) {
              try {
                await generateMatrixMut.mutateAsync({
                  productId: created.id,
                  body: {
                    sizes,
                    colors,
                    generate_barcodes: true,
                    skip_existing: true,
                  },
                });
              } catch (err) {
                console.error("Failed to generate variant matrix:", err);
              }
            }
          }
        }
      }
    }
    setForm({ sku: "", name: "", industry_pack: defaultPack, base_price: "", wholesale_price: "", cost_price: "", initial_stock: "", barcode: "", category_id: "", brand_id: "", unit_id: "", is_active: true });
    setMeta(resetProductMeta(defaultPack, app.dynamicFields, fieldCtx));
    setVariantQuantities({});
    setBulkVariantQty("");
    setInitialBatchNo("");
    setInitialExpiryDate("");
    setHasSecondBatch(false);
    setSecondBatchNo("");
    setSecondBatchExpiry("");
    setSecondBatchQty("");
    setNewBatchNo("");
    setNewBatchExpiry("");
    setNewBatchQty("");
    setIsAddingBatch(false);
    setEditId(null);
    setDrawerOpen(false);
    void apiQuery.refetch();
    void stockQuery.refetch();
  };

  const openNewProduct = () => {
    const activePack = (packFilter !== "all" && app.isPackEnabled(packFilter as IndustryPackId) ? packFilter : defaultPack) as IndustryPackId;
    setEditId(null);
    setForm({ sku: "", name: "", industry_pack: activePack, base_price: "", wholesale_price: "", cost_price: "", initial_stock: "", barcode: "", category_id: "", brand_id: "", unit_id: "", is_active: true });
    setMeta(resetProductMeta(activePack, app.dynamicFields, fieldCtx));
    setSizesInput("");
    setColorsInput("");
    setInitialBatchNo("");
    setInitialExpiryDate("");
    setHasSecondBatch(false);
    setSecondBatchNo("");
    setSecondBatchExpiry("");
    setSecondBatchQty("");
    setNewBatchNo("");
    setNewBatchExpiry("");
    setNewBatchQty("");
    setIsAddingBatch(false);
    setDrawerOpen(true);
  };

  const openEditProduct = (r: Row) => {
    if (!r.id) return;
    const packId = r.industry as IndustryPackId;
    setEditId(r.id);
    setDetailId(r.id);
    setForm((prev) => ({
      sku: r.sku,
      name: r.name,
      industry_pack: packId,
      base_price: r.price ? String(r.price) : "",
      wholesale_price: "",
      cost_price: "",
      initial_stock: r.stock ? String(r.stock) : "",
      barcode: r.barcode || "",
      // Preserve previously loaded category/brand/unit if re-opening the same product
      // so we don't wipe them before the detail query enriches them.
      // The useEffect below will overwrite with accurate data once detailQuery resolves.
      category_id: prev.category_id || "",
      brand_id: prev.brand_id || "",
      unit_id: prev.unit_id || "",
      is_active: r.status === "active",
    }));
    setMeta({
      ...resetProductMeta(packId, app.dynamicFields, fieldCtx),
      ...(r.meta as Record<string, string | number | boolean> | undefined),
    });
    setSizesInput("");
    setColorsInput("");
    setInitialBatchNo("");
    const metaExp = (r.meta as any)?.expiry_date ? String((r.meta as any).expiry_date).slice(0, 10) : "";
    setInitialExpiryDate(metaExp);
    setHasSecondBatch(false);
    setSecondBatchNo("");
    setSecondBatchExpiry("");
    setSecondBatchQty("");
    setNewBatchNo("");
    setNewBatchExpiry("");
    setNewBatchQty("");
    setIsAddingBatch(false);
    setDrawerOpen(true);
    setEditTab("details");
  };

  useEffect(() => {
    if (!detailQuery.data || editId !== detailQuery.data.id) return;
    const p = detailQuery.data;
    let resolvedBrandId = p.brand_id ?? "";
    if (!resolvedBrandId && p.meta?.brand) {
      const foundB = (brandsQuery.data ?? []).find(b => b.name.toLowerCase() === String(p.meta.brand).toLowerCase());
      if (foundB) resolvedBrandId = foundB.id;
    }
    let resolvedCatId = p.category_id ?? "";
    if (!resolvedCatId && p.meta?.category) {
      const foundC = (categoriesQuery.data ?? []).find(c => c.name.toLowerCase() === String(p.meta.category).toLowerCase());
      if (foundC) resolvedCatId = foundC.id;
    }
    setForm((f) => ({
      ...f,
      sku: p.sku ?? f.sku,
      barcode: p.barcode ?? "",
      base_price: p.base_price ? String(p.base_price) : f.base_price,
      wholesale_price: p.wholesale_price ? String(p.wholesale_price) : "",
      cost_price: p.cost_price ? String(p.cost_price) : "",
      initial_stock: p.stock_qty ? String(p.stock_qty) : f.initial_stock,
      category_id: resolvedCatId,
      brand_id: resolvedBrandId,
      unit_id: p.unit_id ?? "",
      is_active: p.is_active,
    }));
  }, [detailQuery.data, editId]);

  const formatMetaCell = (row: Row, key: string) => {
    const v = row.meta?.[key];
    if (v === undefined || v === null || v === "") return "—";
    if (typeof v === "boolean") return v ? "Yes" : "No";
    return String(v);
  };

  // Helpers for preset chips & SKU generation
  const generateAutoSku = () => {
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    const cleaned = form.name ? form.name.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
    const prefix = cleaned.length >= 3 ? cleaned.slice(0, 3) : (cleaned || "PRD");
    setForm(f => ({ ...f, sku: `${prefix}-${randomNum}` }));
  };

  const toggleSizeChip = (size: string) => {
    const current = sizesInput.split(",").map(s => s.trim()).filter(Boolean);
    const exists = current.includes(size);
    const next = exists ? current.filter(s => s !== size) : [...current, size];
    setSizesInput(next.join(", "));
  };

  const toggleColorChip = (color: string) => {
    const current = colorsInput.split(",").map(c => c.trim()).filter(Boolean);
    const exists = current.includes(color);
    const next = exists ? current.filter(c => c !== color) : [...current, color];
    setColorsInput(next.join(", "));
  };

  const selectedSizesList = sizesInput.split(",").map(s => s.trim()).filter(Boolean);
  const selectedColorsList = colorsInput.split(",").map(c => c.trim()).filter(Boolean);

  const variantCombinations = useMemo(() => {
    if (selectedSizesList.length === 0 && selectedColorsList.length === 0) return [];
    const sizes = selectedSizesList.length > 0 ? selectedSizesList : ["__none__"];
    const colors = selectedColorsList.length > 0 ? selectedColorsList : ["__none__"];
    const result: { key: string; size: string; color: string; label: string }[] = [];
    for (const s of sizes) {
      for (const c of colors) {
        const key = `${s}___${c}`;
        const parts: string[] = [];
        if (s !== "__none__") parts.push(s);
        if (c !== "__none__") parts.push(c);
        result.push({ key, size: s === "__none__" ? "" : s, color: c === "__none__" ? "" : c, label: parts.join(" / ") || "Standard" });
      }
    }
    return result;
  }, [selectedSizesList.join(","), selectedColorsList.join(",")]);


  const detailFields = (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Column (7 cols): Basic Info, Category/Brand, Pricing & Stock, Pack Specific Attributes */}
      <div className="lg:col-span-7 space-y-5">
        {/* 1. Basic Info Section */}
        <div className="rounded-xl border border-border/60 bg-card p-4 sm:p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Basic Information</span>
              <p className="text-[11px] text-muted-foreground mt-0.5">Core identifiers and inventory profile</p>
            </div>
            <div className="w-48">
              <Select value={form.industry_pack} disabled={!!editId} onValueChange={v => {
                const packId = v as IndustryPackId;
                setForm(f => ({ ...f, industry_pack: packId }));
                setMeta(resetProductMeta(packId, app.dynamicFields, fieldCtx));
              }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select pack" /></SelectTrigger>
                <SelectContent>
                  {INDUSTRY_PACKS.filter(p => app.isPackEnabled(p.id)).map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label className="text-xs font-medium">Product Name <span className="text-destructive">*</span></Label>
              <Input
                autoFocus
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Premium Cotton Polo Shirt"
                className="mt-1 h-9 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">SKU</Label>
                  <button
                    type="button"
                    onClick={generateAutoSku}
                    className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                    title="Generate unique SKU"
                  >
                    <Sparkles className="h-3 w-3" /> Auto
                  </button>
                </div>
                <div className="relative mt-1">
                  <Input
                    value={form.sku}
                    onChange={e => setForm(f => ({ ...f, sku: e.target.value.toUpperCase() }))}
                    placeholder="Auto-generated if empty"
                    className="h-9 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <Barcode className="h-3.5 w-3.5 text-muted-foreground" />
                    Primary Barcode
                  </Label>
                  {editId && (
                    <button
                      type="button"
                      onClick={() => setBarcodePrintProduct({
                        id: editId,
                        name: form.name || "Product",
                        sku: form.sku,
                        price: Number(form.base_price) || 0,
                        barcode: form.barcode || null,
                        storeName: currentStoreName,
                      })}
                      className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Printer className="h-3 w-3" /> Print Label
                    </button>
                  )}
                </div>
                <div className="mt-1">
                  <BarcodeInput
                    value={form.barcode}
                    onChange={v => setForm(f => ({ ...f, barcode: v }))}
                  />
                </div>
                {matchingProduct && !editId && (
                  <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 mt-2 space-y-1.5 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-bold text-primary flex items-center gap-1">
                          <span>📦</span> Existing Product: <span className="underline truncate">{matchingProduct.name}</span>
                        </span>
                        <span className="font-mono text-[10px] bg-primary/20 text-primary font-bold px-1.5 py-0.5 rounded shrink-0">
                          {matchingProduct.sku}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="text-[11px] font-semibold text-primary underline hover:text-primary/80 shrink-0 ml-2 cursor-pointer"
                        onClick={() => openEditProduct(matchingProduct)}
                      >
                        Open Product &rarr;
                      </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-normal">
                      This barcode belongs to <strong>{matchingProduct.name}</strong>. In retail POS, multiple shipments share the same barcode. Entering a new batch &amp; expiry date below will register this new shipment under this product!
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 2. Categorization Section */}
        {useApi && (
          <div className="rounded-xl border border-border/60 bg-card p-4 sm:p-5 space-y-3 shadow-sm">
            <div className="flex items-center justify-between border-b border-border/40 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                  Category &amp; Brand
                </span>
                <Badge variant="secondary" className="text-[10px] h-5 font-normal px-2 bg-primary/10 text-primary border-primary/20">
                  {(() => {
                    const packName = INDUSTRY_PACKS.find(p => p.id === form.industry_pack)?.name ?? form.industry_pack;
                    return packName.toUpperCase().endsWith("POS") ? packName : `${packName} POS`;
                  })()}
                </Badge>
              </div>
              <button
                type="button"
                onClick={() => setShowAllMasters(v => !v)}
                className="text-[11px] text-primary hover:underline font-medium cursor-pointer"
              >
                {showAllMasters
                  ? `Filter by ${INDUSTRY_PACKS.find(p => p.id === form.industry_pack)?.shortName ?? "POS"} only`
                  : "Show all POS masters"}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-medium">Category</Label>
                <Select value={form.category_id || "__none__"} onValueChange={v => setForm(f => ({ ...f, category_id: v === "__none__" ? "" : v }))}>
                  <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue placeholder="Choose Category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {orderedCategories.map(c => (
                      <SelectItem key={c.id} value={c.id}>{"  ".repeat(c.depth)}{c.depth > 0 ? "└ " : ""}{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <QuickAddMaster
                  label="category"
                  industryPack={form.industry_pack}
                  onCreate={(body) => createCategoryMut.mutateAsync(body)}
                  onCreated={(id) => setForm(f => ({ ...f, category_id: id }))}
                />
              </div>
              <div>
                <Label className="text-xs font-medium">Brand</Label>
                <Select value={form.brand_id || "__none__"} onValueChange={v => setForm(f => ({ ...f, brand_id: v === "__none__" ? "" : v }))}>
                  <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue placeholder="Choose Brand" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {availableBrands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <QuickAddMaster
                  label="brand"
                  industryPack={form.industry_pack}
                  onCreate={(body) => createBrandMut.mutateAsync(body)}
                  onCreated={(id) => setForm(f => ({ ...f, brand_id: id }))}
                />
              </div>
              <div>
                <Label className="text-xs font-medium">Unit of Measure</Label>
                <Select value={form.unit_id || "__none__"} onValueChange={v => setForm(f => ({ ...f, unit_id: v === "__none__" ? "" : v }))}>
                  <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue placeholder="Choose Unit" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None (Pcs)</SelectItem>
                    {(unitsQuery.data ?? []).map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <QuickAddMaster
                  label="unit"
                  onCreate={(body) => createUnitMut.mutateAsync(body)}
                  onCreated={(id) => setForm(f => ({ ...f, unit_id: id }))}
                />
              </div>
            </div>
          </div>
        )}

        {/* 3. Pricing Section */}
        <div className="rounded-xl border border-border/60 bg-card p-4 sm:p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-primary" /> Pricing
              </span>
              <p className="text-[11px] text-muted-foreground mt-0.5">Selling price, cost baselines and wholesale rates</p>
            </div>
            {can("inventory.price") && Number(form.base_price) > 0 && Number(form.cost_price) > 0 && (
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                ((Number(form.base_price) - Number(form.cost_price)) / Number(form.base_price)) * 100 >= 20
                  ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/30"
                  : "bg-amber-500/10 text-amber-600 border border-amber-500/30"
              }`}>
                Margin: {(((Number(form.base_price) - Number(form.cost_price)) / Number(form.base_price)) * 100).toFixed(1)}%
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs font-semibold text-foreground">
                Selling Price (BDT) <span className="text-destructive">*</span>
              </Label>
              <div className="relative mt-1.5">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">৳</span>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={form.base_price}
                  onChange={e => setForm(f => ({ ...f, base_price: e.target.value.replace(/[^0-9]/g, "") }))}
                  onFocus={e => e.target.select()}
                  placeholder="0"
                  className="h-10 pl-6 text-sm font-bold text-foreground bg-background"
                />
              </div>
            </div>

            {can("inventory.price") && (
              <>
                <div>
                  <Label className="text-xs font-medium text-foreground">Cost Price (BDT)</Label>
                  <div className="relative mt-1.5">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">৳</span>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={form.cost_price}
                      onChange={e => setForm(f => ({ ...f, cost_price: e.target.value.replace(/[^0-9]/g, "") }))}
                      onFocus={e => e.target.select()}
                      placeholder="0"
                      className="h-10 pl-6 text-xs bg-background"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-medium text-foreground">Wholesale Price (BDT)</Label>
                  <div className="relative mt-1.5">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">৳</span>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={form.wholesale_price}
                      onChange={e => setForm(f => ({ ...f, wholesale_price: e.target.value.replace(/[^0-9]/g, "") }))}
                      onFocus={e => e.target.select()}
                      placeholder="0"
                      className="h-10 pl-6 text-xs bg-background"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 4. Inventory & Batch Tracking (FEFO) Section */}
        <div className="rounded-xl border border-border/60 bg-card p-4 sm:p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
            <div className="flex items-center gap-2">
              <Boxes className="h-4 w-4 text-primary" />
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-foreground block">
                  Inventory &amp; Batch Tracking (FEFO)
                </span>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Set stock counts, expiry dates and batches for automatic FEFO sales dispatch
                </p>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px] font-medium bg-primary/10 text-primary border-primary/25">
              FEFO Enabled
            </Badge>
          </div>

          {/* Preset Buttons */}
          <div className="space-y-1.5 bg-secondary/15 p-3 rounded-lg border border-border/50">
            <Label className="text-[11px] font-semibold text-muted-foreground block">
              Stock Type / Batch Preset:
            </Label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setInitialBatchNo("Old Stock");
                  if (!editId && (!form.initial_stock || Number(form.initial_stock) === 0)) {
                    setForm(f => ({ ...f, initial_stock: "10" }));
                  }
                }}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                  initialBatchNo === "Old Stock"
                    ? "bg-amber-500/15 border-amber-500 text-amber-700 dark:text-amber-300 shadow-xs ring-1 ring-amber-500/30"
                    : "bg-background border-border hover:bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>🏷️</span>
                <span>Old Stock</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setInitialBatchNo("New Stock");
                  if (!editId && (!form.initial_stock || Number(form.initial_stock) === 0)) {
                    setForm(f => ({ ...f, initial_stock: "10" }));
                  }
                }}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                  initialBatchNo === "New Stock"
                    ? "bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300 shadow-xs ring-1 ring-emerald-500/30"
                    : "bg-background border-border hover:bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>✨</span>
                <span>New Stock</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (initialBatchNo === "Old Stock" || initialBatchNo === "New Stock") {
                    setInitialBatchNo("");
                  }
                }}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                  initialBatchNo !== "Old Stock" && initialBatchNo !== "New Stock" && initialBatchNo !== ""
                    ? "bg-primary/15 border-primary text-primary shadow-xs ring-1 ring-primary/30"
                    : "bg-background border-border hover:bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>🔖</span>
                <span>Custom Batch</span>
              </button>
            </div>
            {initialBatchNo === "Old Stock" && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300 font-medium bg-amber-500/10 rounded px-2.5 py-1 mt-1 border border-amber-500/20">
                ⚠️ <strong>Old Stock:</strong> POS will sell this stock first according to its earlier expiry date (FEFO).
              </p>
            )}
            {initialBatchNo === "New Stock" && (
              <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium bg-emerald-500/10 rounded px-2.5 py-1 mt-1 border border-emerald-500/20">
                ✓ <strong>New Stock:</strong> Will be kept fresh and sold after existing older stock is depleted.
              </p>
            )}
          </div>

          {/* 3 Main Stock Inputs: Units, Expiry, Batch # */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div>
              <Label className="text-[11px] uppercase font-semibold text-muted-foreground block">
                {editId ? "Current Stock on Hand (Units)" : "Initial Stock (Units)"}
              </Label>
              <Input
                type="number"
                min="0"
                value={form.initial_stock}
                onChange={e => setForm(f => ({ ...f, initial_stock: e.target.value }))}
                onFocus={e => e.target.select()}
                placeholder="e.g. 10"
                className="h-9 text-xs bg-background mt-1 font-semibold"
              />
            </div>

            <div>
              <Label className="text-[11px] uppercase font-semibold text-muted-foreground block flex items-center gap-1">
                <Calendar className="h-3 w-3 text-primary" />
                <span>Expiry Date</span>
              </Label>
              <Input
                type="date"
                value={initialExpiryDate}
                onChange={e => setInitialExpiryDate(e.target.value)}
                className="h-9 text-xs bg-background mt-1 font-medium"
              />
            </div>

            <div>
              <Label className="text-[11px] uppercase font-semibold text-muted-foreground block">
                Batch / Lot #
              </Label>
              <Input
                value={initialBatchNo}
                onChange={e => setInitialBatchNo(e.target.value)}
                placeholder="e.g. Old Stock / Lot 1"
                className="h-9 text-xs bg-background mt-1 font-mono"
              />
            </div>
          </div>

          {/* Secondary Batch Option */}
          <div className="pt-2 border-t border-border/50">
            {!hasSecondBatch ? (
              <button
                type="button"
                onClick={() => {
                  setHasSecondBatch(true);
                  setSecondBatchNo(initialBatchNo === "Old Stock" ? "New Stock" : "Second Batch");
                  if (!secondBatchQty) setSecondBatchQty("10");
                }}
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1.5 cursor-pointer py-1"
              >
                <span>+</span> Have both Old &amp; New Stock? Add secondary batch with different expiry
              </button>
            ) : (
              <div className="rounded-lg border border-border bg-secondary/15 p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <span>✨</span>
                    <span>Secondary Batch (e.g. New Stock with later expiry)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setHasSecondBatch(false);
                      setSecondBatchNo("");
                      setSecondBatchExpiry("");
                      setSecondBatchQty("");
                    }}
                    className="text-[11px] text-muted-foreground hover:text-destructive cursor-pointer font-medium"
                  >
                    ✕ Remove
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <Label className="text-[10px] uppercase font-semibold text-muted-foreground">Batch Name</Label>
                    <Input
                      className="h-8 text-xs bg-background mt-0.5"
                      value={secondBatchNo}
                      onChange={e => setSecondBatchNo(e.target.value)}
                      placeholder="e.g. New Stock"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase font-semibold text-muted-foreground">Expiry Date</Label>
                    <Input
                      type="date"
                      className="h-8 text-xs bg-background mt-0.5"
                      value={secondBatchExpiry}
                      onChange={e => setSecondBatchExpiry(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase font-semibold text-muted-foreground">Quantity</Label>
                    <Input
                      type="number"
                      min="1"
                      className="h-8 text-xs bg-background mt-0.5"
                      value={secondBatchQty}
                      onChange={e => setSecondBatchQty(e.target.value)}
                      placeholder="Qty"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Both batches will be created under this barcode so the POS automatically sells the earlier-expiring batch first.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Active Batches & Expiry (FEFO) Card for edit mode in batch-tracked verticals */}
        {editId && isBatchTrackedPack && (
          <div className="rounded-xl border border-border/60 bg-card p-4 sm:p-5 space-y-3.5 shadow-sm">
            <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  Batches &amp; Expiry Dates (FEFO)
                </span>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Track multiple batches (Old Stock vs New Stock) under this same product and barcode.
                </p>
              </div>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-foreground">
                {(batchesQuery.data ?? []).length} batch{(batchesQuery.data ?? []).length === 1 ? "" : "es"}
              </span>
            </div>

            {batchesQuery.isLoading ? (
              <div className="py-2 text-xs text-muted-foreground">Loading batches...</div>
            ) : (batchesQuery.data ?? []).length > 0 ? (
              <div className="divide-y divide-border/40 rounded-lg border border-border/60 bg-secondary/15 overflow-hidden text-xs">
                {(batchesQuery.data ?? []).map((b, idx) => {
                  const days = b.expiry_date
                    ? Math.floor((new Date(b.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                    : null;
                  const isExpired = days != null && days <= 0;
                  const isNear = days != null && days > 0 && days <= 90;
                  return (
                    <div key={b.id || idx} className="flex items-center justify-between p-3">
                      <div>
                        <div className="font-semibold text-foreground flex items-center gap-2">
                          <span>{b.batch_no}</span>
                          {b.lot_no ? <span className="text-muted-foreground font-normal">(Lot: {b.lot_no})</span> : null}
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
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          Expiry: <span className="font-medium text-foreground">{b.expiry_date ? String(b.expiry_date).slice(0, 10) : "Not set"}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold tabular-nums text-foreground text-sm">{b.qty_on_hand}</div>
                        <div className="text-[10px] text-muted-foreground">available</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border/80 bg-secondary/15 p-3 text-center text-xs text-muted-foreground">
                No active batches registered. Register an initial or restock batch below.
              </div>
            )}

            {/* Quick Add Batch Form */}
            {isAddingBatch ? (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">+ Add New Batch / Restock</span>
                  <button
                    type="button"
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                    onClick={() => setIsAddingBatch(false)}
                  >
                    Cancel
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] uppercase font-semibold text-muted-foreground">Batch No *</Label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setNewBatchNo("Old Stock")}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-colors ${
                            newBatchNo === "Old Stock"
                              ? "bg-amber-500/20 border-amber-500 text-amber-700 dark:text-amber-300"
                              : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          🏷️ Old Stock
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewBatchNo("New Stock")}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-colors ${
                            newBatchNo === "New Stock"
                              ? "bg-emerald-500/20 border-emerald-500 text-emerald-700 dark:text-emerald-300"
                              : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          ✨ New Stock
                        </button>
                      </div>
                    </div>
                    <Input
                      placeholder="e.g. Old Stock / New Stock / BATCH-02"
                      className="h-8 text-xs bg-background mt-1"
                      value={newBatchNo}
                      onChange={(e) => setNewBatchNo(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase font-semibold text-muted-foreground">Expiry Date *</Label>
                    <Input
                      type="date"
                      className="h-8 text-xs bg-background mt-1"
                      value={newBatchExpiry}
                      onChange={(e) => setNewBatchExpiry(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase font-semibold text-muted-foreground">Quantity *</Label>
                    <Input
                      type="number"
                      min="1"
                      placeholder="Qty"
                      className="h-8 text-xs bg-background mt-1"
                      value={newBatchQty}
                      onChange={(e) => setNewBatchQty(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    disabled={openingStockMut.isPending}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
                    onClick={async () => {
                      if (!newBatchNo.trim()) {
                        toast.error("Batch number is required");
                        return;
                      }
                      if (!newBatchQty || Number(newBatchQty) <= 0) {
                        toast.error("Valid quantity is required");
                        return;
                      }
                      try {
                        await openingStockMut.mutateAsync({
                          product_id: editId,
                          store_id: activeStoreId,
                          qty: Number(newBatchQty),
                          batch_no: newBatchNo.trim(),
                          expiry_date: formatIsoDate(newBatchExpiry),
                          note: "Restock batch from Product Master",
                        });
                        toast.success(`Batch ${newBatchNo} added with ${newBatchQty} units`);
                        setNewBatchNo("");
                        setNewBatchExpiry("");
                        setNewBatchQty("");
                        setIsAddingBatch(false);
                        void batchesQuery.refetch();
                        void apiQuery.refetch();
                        void stockQuery.refetch();
                      } catch (err: any) {
                        toast.error(err?.message || "Failed to add batch");
                      }
                    }}
                  >
                    {openingStockMut.isPending ? "Adding..." : "Add Batch Stock"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="w-full rounded-lg border border-dashed border-border/80 bg-secondary/20 py-2 text-xs font-medium text-foreground hover:bg-secondary/40 transition-colors flex items-center justify-center gap-1.5"
                onClick={() => setIsAddingBatch(true)}
              >
                + Add Batch / Restock (e.g. New Stock)
              </button>
            )}
          </div>
        )}

        {/* 4. Dynamic Pack Fields */}
        <ProductMetaFields packId={form.industry_pack} meta={meta} onChange={setMeta} />
      </div>

      {/* Right Column (5 cols): Media & Status, Variants Matrix, Form Completeness */}
      <div className="lg:col-span-5 space-y-5">
        {/* Media & Status Section */}
        <div className="rounded-xl border border-border/60 bg-card p-4 sm:p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-border/40 pb-2">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Product Media &amp; Status</span>
              <p className="text-[11px] text-muted-foreground mt-0.5">Thumbnail and POS visibility</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-semibold ${form.is_active ? "text-emerald-600" : "text-muted-foreground"}`}>
                {form.is_active ? "Active" : "Inactive"}
              </span>
              <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} id="prod-active" />
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-xs font-medium block">Product Image</Label>
            <div className="flex gap-3 items-center">
              <div className="relative h-20 w-20 shrink-0 rounded-xl border-2 border-dashed border-border/80 bg-secondary/20 flex items-center justify-center overflow-hidden transition-all group hover:border-primary/50">
                {typeof meta.image === "string" && meta.image ? (
                  <>
                    <img
                      src={resolveImageUrl(meta.image)}
                      alt="Product preview"
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      onError={e => { e.currentTarget.style.display = "none"; }}
                    />
                    <button
                      type="button"
                      onClick={() => setMeta(m => ({ ...m, image: "" }))}
                      className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[11px] font-semibold transition-opacity rounded-xl cursor-pointer"
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <div className="text-center p-1">
                    <Upload className="h-5 w-5 mx-auto text-muted-foreground/60 group-hover:text-primary transition-colors" />
                    <span className="text-[9px] text-muted-foreground mt-1 block">Upload</span>
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    id="product-image-upload"
                    accept="image/*"
                    onChange={handleImageFileChange}
                    className="hidden"
                    disabled={uploadingImage}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => document.getElementById("product-image-upload")?.click()}
                    disabled={uploadingImage}
                    className="h-8 gap-1.5 rounded-lg border-border/60 hover:bg-secondary/40 font-medium text-xs shrink-0 cursor-pointer"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {uploadingImage ? "Uploading…" : "Browse File"}
                  </Button>
                  <span className="text-[10px] text-muted-foreground">PNG, JPG up to 5MB</span>
                </div>
                
                <Input
                  value={typeof meta.image === "string" ? meta.image : ""}
                  onChange={e => setMeta(m => ({ ...m, image: e.target.value }))}
                  placeholder="Or paste image URL (https://…)"
                  className="h-8 text-xs rounded-lg bg-secondary/10 focus:bg-background transition-colors"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Sizes & Colors Interactive Matrix Section */}
        {form.industry_pack === "fashion" && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-primary/10 pb-2">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <Wand2 className="h-3.5 w-3.5" /> Product Variants Generator
                </span>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {editId
                    ? "Tap preset badges to add more variants. Existing combinations are skipped."
                    : "Tap preset badges or type custom values. Variants generate automatically."}
                </p>
              </div>
              {(sizesInput || colorsInput) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => { setSizesInput(""); setColorsInput(""); }}
                >
                  Clear all
                </Button>
              )}
            </div>

            {/* Sizes Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Sizes</Label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
                    onClick={() => toggleSizeChip("All Size")}
                  >
                    + All Size
                  </button>
                  <span className="text-muted-foreground/40 text-xs">·</span>
                  <button
                    type="button"
                    className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
                    onClick={() => setSizesInput(["S", "M", "L", "XL", "XXL"].join(", "))}
                  >
                    + S to XXL
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {["All Size", "Free Size", "S", "M", "L", "XL", "XXL", "3XL", "15", "15.5", "16", "16.5", "17", "28", "30", "32", "34", "36", "38"].map(sz => {
                  const isSelected = selectedSizesList.includes(sz);
                  return (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => toggleSizeChip(sz)}
                      className={`h-7 px-2.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 cursor-pointer border ${
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary shadow-xs"
                          : "bg-background hover:bg-secondary border-border text-foreground"
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                      {sz}
                    </button>
                  );
                })}
              </div>
              <Input
                placeholder="Or type custom sizes (e.g. All Size, S, M, L, XL)"
                value={sizesInput}
                onChange={e => setSizesInput(e.target.value)}
                className="h-8 text-xs bg-background"
              />
            </div>

            {/* Colors Selection */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Colors</Label>
              <div className="flex flex-wrap gap-1.5">
                {["Black", "White", "Navy", "Blue", "Red", "Grey", "Green", "Maroon", "Beige", "Olive"].map(col => {
                  const isSelected = selectedColorsList.includes(col);
                  return (
                    <button
                      key={col}
                      type="button"
                      onClick={() => toggleColorChip(col)}
                      className={`h-7 px-2.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 cursor-pointer border ${
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary shadow-xs"
                          : "bg-background hover:bg-secondary border-border text-foreground"
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                      {col}
                    </button>
                  );
                })}
              </div>
              <Input
                placeholder="Or type custom colors (e.g. Black, White, Navy)"
                value={colorsInput}
                onChange={e => setColorsInput(e.target.value)}
                className="h-8 text-xs bg-background"
              />
            </div>

            {/* Matrix Summary + Quantity per Variant */}
            {variantCombinations.length > 0 && (
              <div className="space-y-3 pt-3 border-t border-primary/20">
                {/* Header row */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <span className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5" />
                      Stock Qty per Variant
                    </span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {variantCombinations.length} combinations · Total:{" "}
                      <strong className="text-foreground font-bold">
                        {Object.values(variantQuantities).reduce((acc, v) => acc + (Number(v) || 0), 0)} units
                      </strong>
                    </p>
                  </div>

                  {/* View switcher & bulk actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedSizesList.length > 0 && selectedColorsList.length > 0 && (
                      <div className="flex items-center bg-secondary/80 p-0.5 rounded-lg border border-border/50 mr-1">
                        <button
                          type="button"
                          onClick={() => setVariantViewMode("matrix")}
                          className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                            variantViewMode === "matrix"
                              ? "bg-card text-foreground shadow-xs"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <LayoutGrid className="h-3 w-3" /> Matrix
                        </button>
                        <button
                          type="button"
                          onClick={() => setVariantViewMode("list")}
                          className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                            variantViewMode === "list"
                              ? "bg-card text-foreground shadow-xs"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <List className="h-3 w-3" /> List
                        </button>
                      </div>
                    )}

                    <Input
                      type="number"
                      min="0"
                      placeholder="Qty"
                      value={bulkVariantQty}
                      onChange={e => setBulkVariantQty(e.target.value)}
                      onFocus={e => e.target.select()}
                      className="h-7 w-16 text-xs bg-background"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2.5 font-medium"
                      onClick={() => {
                        if (!bulkVariantQty) return;
                        const updated: Record<string, string> = {};
                        variantCombinations.forEach(vc => { updated[vc.key] = bulkVariantQty; });
                        setVariantQuantities(updated);
                      }}
                    >
                      Apply All
                    </Button>
                  </div>
                </div>

                {variantViewMode === "matrix" && selectedSizesList.length > 0 && selectedColorsList.length > 0 ? (
                  /* 2D Matrix Table View */
                  <div className="overflow-x-auto rounded-xl border border-border/60 bg-card shadow-2xs">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/40 border-b border-border/60">
                          <th className="p-2.5 text-left font-bold text-muted-foreground">Size \ Color</th>
                          {selectedColorsList.map(c => (
                            <th key={c} className="p-2 text-center font-bold text-foreground border-l border-border/30">
                              <div className="flex items-center justify-center gap-1.5">
                                <span
                                  className="w-2.5 h-2.5 rounded-full border border-black/20 shrink-0"
                                  style={{ backgroundColor: getFashionColorHex(c) }}
                                />
                                {c}
                              </div>
                            </th>
                          ))}
                          <th className="p-2 text-center font-bold text-muted-foreground border-l border-border/30 bg-muted/20">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {selectedSizesList.map(s => {
                          const rowTotal = selectedColorsList.reduce(
                            (acc, c) => acc + (Number(variantQuantities[`${s}___${c}`]) || 0),
                            0
                          );
                          return (
                            <tr key={s} className="hover:bg-muted/10 transition-colors">
                              <td className="p-2 font-bold text-primary bg-muted/10">{s}</td>
                              {selectedColorsList.map(c => {
                                const key = `${s}___${c}`;
                                const qty = variantQuantities[key] ?? "";
                                return (
                                  <td key={key} className="p-1 text-center border-l border-border/30">
                                    <Input
                                      type="number"
                                      min="0"
                                      value={qty}
                                      onChange={e => setVariantQuantities(prev => ({ ...prev, [key]: e.target.value }))}
                                      onFocus={e => e.target.select()}
                                      placeholder="0"
                                      className="h-7 w-14 mx-auto text-xs text-center font-semibold bg-background"
                                    />
                                  </td>
                                );
                              })}
                              <td className="p-2 text-center font-bold text-muted-foreground border-l border-border/30 bg-muted/10">
                                {rowTotal}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-muted/30 border-t-2 border-border/60 font-bold">
                          <td className="p-2 font-bold text-foreground">Total</td>
                          {selectedColorsList.map(c => {
                            const colTotal = selectedSizesList.reduce(
                              (acc, s) => acc + (Number(variantQuantities[`${s}___${c}`]) || 0),
                              0
                            );
                            return (
                              <td key={c} className="p-2 text-center text-foreground font-semibold border-r border-border/30 last:border-r-0">
                                {colTotal}
                              </td>
                            );
                          })}
                          <td className="p-2 text-center text-primary font-extrabold bg-primary/10 text-xs">
                            {Object.values(variantQuantities).reduce((acc, v) => acc + (Number(v) || 0), 0)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  /* List View */
                  <div className="max-h-72 overflow-y-auto rounded-xl border border-border/60 bg-muted/20 p-2 space-y-1.5">
                    {variantCombinations.map(vc => {
                      const qty = variantQuantities[vc.key] ?? "";
                      return (
                        <div
                          key={vc.key}
                          className="flex items-center justify-between bg-card rounded-lg border border-border/40 px-3 py-2 gap-3 hover:border-primary/30 transition-all shadow-2xs"
                        >
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            {vc.size && (
                              <Badge variant="outline" className="text-xs font-bold border-primary/40 bg-primary/5 text-primary">
                                Size: {vc.size}
                              </Badge>
                            )}
                            {vc.color && (
                              <Badge variant="secondary" className="text-xs font-medium flex items-center gap-1.5">
                                <span
                                  className="w-2.5 h-2.5 rounded-full border border-black/20 shrink-0"
                                  style={{ backgroundColor: getFashionColorHex(vc.color) }}
                                />
                                Color: {vc.color}
                              </Badge>
                            )}
                            {!vc.size && !vc.color && (
                              <span className="text-xs font-medium text-foreground">{vc.label}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[11px] font-medium text-muted-foreground">Qty</span>
                            <Input
                              type="number"
                              min="0"
                              value={qty}
                              onChange={e => setVariantQuantities(prev => ({ ...prev, [vc.key]: e.target.value }))}
                              onFocus={e => e.target.select()}
                              placeholder="0"
                              className="h-7 w-20 text-xs font-semibold text-right bg-background"
                            />
                            <span className="text-[11px] text-muted-foreground">pcs</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Form completeness hint */}
        {!editId && (() => {
          const fields = [
            { done: !!form.name.trim(), label: "Name" },
            { done: Number(form.base_price) > 0, label: "Price" },
            { done: !!form.sku.trim(), label: "SKU" },
            { done: !!(form.category_id || !useApi), label: "Category" },
            { done: Number(form.initial_stock) > 0, label: "Stock" },
            { done: !!(typeof meta.image === "string" && meta.image), label: "Image" },
          ];
          const done = fields.filter(f => f.done).length;
          const pct = Math.round((done / fields.length) * 100);
          return (
            <div className="rounded-xl border border-border/40 bg-secondary/20 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-muted-foreground">Form completion</span>
                <span className={`text-[11px] font-bold ${pct === 100 ? "text-green-600" : "text-muted-foreground"}`}>{pct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-border/60 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${pct === 100 ? "bg-green-500" : "bg-primary"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {fields.map(f => (
                  <span
                    key={f.label}
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors ${
                      f.done
                        ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                        : "bg-border/60 text-muted-foreground"
                    }`}
                  >
                    {f.done ? "✓" : "○"} {f.label}
                  </span>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );

  if (drawerOpen) {
    return (
      <>
        <PageHeader
          eyebrow="Catalog"
          title={
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs font-semibold rounded-lg hover:bg-secondary cursor-pointer"
                onClick={() => setDrawerOpen(false)}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back</span>
              </Button>
              <div className="flex flex-col">
                <span className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                  {editId ? "Edit Product" : "New Product"}
                </span>
                <span className="text-xs text-muted-foreground font-normal">
                  {editId ? "Update product details, pricing, barcodes and variant stock" : "Create a new catalog item with pricing, inventory and industry attributes"}
                </span>
              </div>
            </div>
          }
          actions={
            <div className="flex items-center gap-2">
              {editId && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 cursor-pointer"
                  onClick={() => setDeleteConfirmProduct({ id: editId, name: form.name, sku: form.sku })}
                  disabled={createMut.isPending || updateMut.isPending || deleteMut.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete Product</span>
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDrawerOpen(false)}
                disabled={createMut.isPending || updateMut.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="gap-1.5 shadow-sm min-w-[130px]"
                onClick={saveProduct}
                disabled={createMut.isPending || updateMut.isPending}
              >
                {createMut.isPending || updateMut.isPending ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>{useApi ? "Save to database" : "Save (demo)"}</span>
                  </>
                )}
              </Button>
            </div>
          }
        />
        <PageBody>
          <div className="space-y-4 max-w-7xl mx-auto pb-12">
            {editId && detailQuery.data && (
              <div className="flex items-center gap-4 rounded-xl border border-border bg-secondary/30 p-3 text-xs">
                <div><span className="text-muted-foreground">Stock on hand: </span><strong className="text-foreground">{detailQuery.data.stock_qty}</strong></div>
                <div className="h-3.5 w-px bg-border" />
                <div><span className="text-muted-foreground">Available: </span><strong className="text-foreground">{detailQuery.data.stock_available}</strong></div>
                <div className="h-3.5 w-px bg-border" />
                <div><span className="text-muted-foreground">Variants: </span><strong className="text-foreground">{detailQuery.data.variant_count}</strong></div>
              </div>
            )}
            {editId && useApi ? (
              <Tabs value={editTab} onValueChange={setEditTab} className="space-y-4">
                <TabsList className="h-9 p-1 bg-muted/60 rounded-xl">
                  <TabsTrigger value="details" className="rounded-lg text-xs font-semibold px-4">Details</TabsTrigger>
                  <TabsTrigger value="barcodes" className="rounded-lg text-xs font-semibold px-4">Barcodes</TabsTrigger>
                  <TabsTrigger value="variants" className="rounded-lg text-xs font-semibold px-4">Variants</TabsTrigger>
                </TabsList>
                <TabsContent value="details" className="mt-0">
                  {detailFields}
                </TabsContent>
                <TabsContent value="barcodes" className="mt-0"><ProductBarcodePanel productId={editId} /></TabsContent>
                <TabsContent value="variants" className="mt-0"><ProductVariantPanel productId={editId} /></TabsContent>
              </Tabs>
            ) : (
              detailFields
            )}

            {/* Bottom Sticky/Floating Action Bar */}
            <div className="flex items-center justify-between pt-5 border-t border-border mt-6">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() => setDrawerOpen(false)}
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to product list
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDrawerOpen(false)}
                  disabled={createMut.isPending || updateMut.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5 shadow-sm min-w-[140px]"
                  onClick={saveProduct}
                  disabled={createMut.isPending || updateMut.isPending}
                >
                  {createMut.isPending || updateMut.isPending ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>{useApi ? "Save to database" : "Save (demo)"}</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Catalog"
        title="Product Master"
        subtitle={useApi && apiRows.length > 0 ? "Loaded from PostgreSQL · tenant-scoped product records" : "Demo catalog · sample products across industry packs"}
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={exportProductCatalogCsv}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
            {useApi && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => apiQuery.refetch()} disabled={apiQuery.isFetching}>
                <RefreshCw className={`h-3.5 w-3.5 ${apiQuery.isFetching ? "animate-spin" : ""}`} /> Refresh
              </Button>
            )}
            <Button size="sm" className="gap-1.5" disabled={!can("inventory.edit")} onClick={openNewProduct}>
              <Plus className="h-3.5 w-3.5" /> New product
            </Button>
          </>
        }
      />
      <PageBody>
        {useApi && apiQuery.isError && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Failed to load products from backend.
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => apiQuery.refetch()}>Retry</Button>
          </div>
        )}
        <SectionCard>
          <FilterBar>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Search SKU, name, barcode, category…" className="h-9 pl-9" />
            </div>
            <Select value={packFilter} onValueChange={v => { setPackFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Industry" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All industries</SelectItem>
                {INDUSTRY_PACKS.filter(p => app.isPackEnabled(p.id)).map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.shortName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            {activePackFilter && allDynamicColumns.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5 shrink-0 text-xs">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Columns ({visibleCustomColumns.size})</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2" align="end">
                  <div className="space-y-1.5">
                    <div className="px-2 py-1 text-xs font-semibold text-muted-foreground border-b border-border mb-1">
                      Toggle Dynamic Columns
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-1">
                      {allDynamicColumns.map(col => {
                        const checked = visibleCustomColumns.has(col.key);
                        return (
                          <label
                            key={col.key}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary/50 cursor-pointer text-xs font-medium transition-colors"
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
          {apiQuery.isLoading && useApi ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading products…</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No products found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-secondary/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="w-8 px-2 py-2"></th>
                    <th className="px-3 py-2 text-left font-medium">SKU</th>
                    <th className="px-3 py-2 text-left font-medium">Name</th>
                    <th className="px-3 py-2 text-left font-medium">Pack</th>
                    <th className="px-3 py-2 text-right font-medium">Cost Price</th>
                    <th className="px-3 py-2 text-right font-medium">Price</th>
                    <th className="px-3 py-2 text-right font-medium">Stock</th>
                    {dynamicColumns.map(col => (
                      <th key={col.key} className="px-2.5 py-2 text-left font-medium">{col.label}</th>
                    ))}
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    {useApi && <th className="px-3 py-2 text-right font-medium">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isEmpty ? (
                    <tr>
                      <td colSpan={8 + dynamicColumns.length + (useApi ? 1 : 0)} className="px-5 py-8 text-center text-xs text-muted-foreground">
                        {EMPTY_LIVE_LABEL}
                      </td>
                    </tr>
                  ) : rows.map(r => {
                    const rowId = r.id ?? r.sku;
                    const isExpanded = expandedRows.has(rowId);
                    return (
                      <React.Fragment key={rowId}>
                        <tr
                          onClick={() => toggleRowExpanded(rowId)}
                          className={`cursor-pointer transition-colors group ${
                            highlightedId === r.id
                              ? "bg-emerald-50 dark:bg-emerald-950/30 ring-1 ring-inset ring-emerald-400/60 animate-pulse"
                              : isExpanded ? "bg-primary/5" : "hover:bg-accent/40"
                          }`}
                        >
                          <td className="px-2 py-2 text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleRowExpanded(rowId);
                              }}
                              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-all cursor-pointer"
                              aria-label={isExpanded ? "Collapse product details" : "Expand product details"}
                            >
                              <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-200 ${isExpanded ? "rotate-90 text-primary font-bold" : "group-hover:text-foreground"}`} />
                            </button>
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px] font-semibold text-foreground">{r.sku}</td>
                          <td className="px-3 py-2 font-medium text-foreground group-hover:text-primary transition-colors">{r.name}</td>
                          <td className="px-3 py-2"><Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">{r.pack}</Badge></td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground font-medium">
                            {r.cost_price != null && r.cost_price > 0 ? fmtBDT(r.cost_price) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtBDT(r.price)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">{r.stock}</td>
                          {dynamicColumns.map(col => (
                            <td key={col.key} className="px-2.5 py-2 text-muted-foreground">{formatMetaCell(r, col.key)}</td>
                          ))}
                          <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                          {useApi && r.id && (
                            <td className="px-3 py-2 text-right space-x-1" onClick={e => e.stopPropagation()}>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setBarcodePrintProduct({
                                  id: r.id!,
                                  name: r.name,
                                  sku: r.sku,
                                  price: r.price,
                                  barcode: r.barcode,
                                  storeName: currentStoreName,
                                })}
                                className="h-6 px-2 text-[11px] text-muted-foreground hover:bg-primary/10 hover:text-primary"
                                title="Print Barcode / Label Sticker"
                              >
                                <Printer className="h-3.5 w-3.5 mr-1" /> Barcode
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => openEditProduct(r)} className="h-6 px-2 text-[11px] hover:bg-primary/10 hover:text-primary">Edit</Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteConfirmProduct({ id: r.id!, name: r.name, sku: r.sku })}
                                className="h-6 px-2 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                                title="Delete Product"
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                              </Button>
                            </td>
                          )}
                        </tr>
                        {isExpanded && (() => {
                          const categoryName = (r.meta?.category as string) || categoriesQuery.data?.find(c => c.id === r.category_id)?.name || allCategoriesQuery.data?.find(c => c.id === r.category_id)?.name;
                          const brandName = (r.meta?.brand as string) || brandsQuery.data?.find(b => b.id === r.brand_id)?.name || allBrandsQuery.data?.find(b => b.id === r.brand_id)?.name;
                          const marginPercent = r.cost_price != null && r.cost_price > 0 && r.price > 0
                            ? (((r.price - r.cost_price) / r.price) * 100).toFixed(1)
                            : null;
                          const profitPerUnit = r.cost_price != null && r.cost_price > 0 && r.price > 0
                            ? r.price - r.cost_price
                            : null;
                          const definedSpecs = allDynamicColumns
                            .map(col => ({ key: col.key, label: col.label, val: formatMetaCell(r, col.key) }))
                            .filter(item => item.val !== "—");

                          return (
                            <tr className="bg-secondary/10">
                              <td colSpan={8 + dynamicColumns.length + (useApi ? 1 : 0)} className="px-4 py-4 sm:px-6 border-y border-border/60">
                                <div className="rounded-xl border border-border/70 bg-card p-4 sm:p-5 space-y-4 shadow-sm text-left">
                                  {/* Header Bar */}
                                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/50 pb-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                                        <Boxes className="h-4 w-4 text-primary" /> Product Details
                                      </span>
                                      <Badge variant="outline" className="font-mono text-xs font-bold border-primary/30 text-primary bg-primary/5">
                                        {r.sku}
                                      </Badge>
                                      <Badge variant="secondary" className="text-xs capitalize font-medium">
                                        {r.pack || r.industry || "General"}
                                      </Badge>
                                      <Badge
                                        variant="outline"
                                        className={`text-[11px] font-semibold ${
                                          r.status === "active"
                                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                                            : "bg-muted text-muted-foreground border-border"
                                        }`}
                                      >
                                        {r.status === "active" ? "Active" : "Inactive"}
                                      </Badge>
                                      <Badge
                                        variant="outline"
                                        className={`text-[11px] font-semibold ${
                                          r.stock > 10
                                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                                            : r.stock > 0
                                            ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
                                            : "bg-destructive/10 text-destructive border-destructive/30"
                                        }`}
                                      >
                                        {r.stock > 10 ? "In Stock" : r.stock > 0 ? "Low Stock" : "Out of Stock"}
                                      </Badge>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10 cursor-pointer"
                                        onClick={() => setBarcodePrintProduct({
                                          id: r.id!,
                                          name: r.name,
                                          sku: r.sku,
                                          price: r.price,
                                          barcode: r.barcode,
                                          storeName: currentStoreName,
                                        })}
                                      >
                                        <Printer className="h-3.5 w-3.5" />
                                        <span>{r.barcode ? "Print Barcode Label" : "Generate Barcode"}</span>
                                      </Button>
                                      {useApi && r.id && (
                                        <>
                                          <Button
                                            size="sm"
                                            variant="default"
                                            className="h-8 text-xs gap-1.5 cursor-pointer shadow-xs"
                                            onClick={() => openEditProduct(r)}
                                          >
                                            <Edit3 className="h-3.5 w-3.5" />
                                            <span>Edit Master Product</span>
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-8 text-xs gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive cursor-pointer"
                                            onClick={() => setDeleteConfirmProduct({ id: r.id!, name: r.name, sku: r.sku })}
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                            <span>Delete</span>
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </div>

                                  {/* 3 Information Cards Grid */}
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                                    {/* Card 1: Identity & Categorization */}
                                    <div className="rounded-lg border border-border/60 bg-secondary/15 p-3.5 space-y-2.5">
                                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                        <Tag className="h-3.5 w-3.5 text-primary" /> Product Identifiers
                                      </div>
                                      <div className="space-y-1.5 text-xs">
                                        <div className="flex items-baseline justify-between gap-2">
                                          <span className="text-muted-foreground text-[11px] shrink-0">Product Name:</span>
                                          <span className="font-semibold text-foreground text-right truncate">{r.name}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="text-muted-foreground text-[11px] shrink-0">Primary Barcode:</span>
                                          <span className="font-mono text-xs font-semibold text-foreground bg-background px-2 py-0.5 rounded border border-border/50">
                                            {r.barcode || "—"}
                                          </span>
                                        </div>
                                        <div className="flex items-baseline justify-between gap-2">
                                          <span className="text-muted-foreground text-[11px] shrink-0">Category:</span>
                                          <span className="font-medium text-foreground text-right">{categoryName || "General"}</span>
                                        </div>
                                        <div className="flex items-baseline justify-between gap-2">
                                          <span className="text-muted-foreground text-[11px] shrink-0">Brand:</span>
                                          <span className="font-medium text-foreground text-right">{brandName || "—"}</span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Card 2: Pricing & Profit Margins */}
                                    <div className="rounded-lg border border-border/60 bg-secondary/15 p-3.5 space-y-2.5">
                                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                        <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> Pricing &amp; Profitability
                                      </div>
                                      <div className="space-y-1.5 text-xs">
                                        <div className="flex items-baseline justify-between">
                                          <span className="text-muted-foreground text-[11px]">Selling Price:</span>
                                          <span className="font-bold text-sm text-primary">{fmtBDT(r.price)}</span>
                                        </div>
                                        <div className="flex items-baseline justify-between">
                                          <span className="text-muted-foreground text-[11px]">Cost Price:</span>
                                          <span className="font-medium text-foreground">
                                            {r.cost_price != null && r.cost_price > 0 ? fmtBDT(r.cost_price) : "—"}
                                          </span>
                                        </div>
                                        {r.wholesale_price != null && r.wholesale_price > 0 && (
                                          <div className="flex items-baseline justify-between">
                                            <span className="text-muted-foreground text-[11px]">Wholesale Price:</span>
                                            <span className="font-medium text-foreground">{fmtBDT(r.wholesale_price)}</span>
                                          </div>
                                        )}
                                        <div className="flex items-center justify-between pt-1 border-t border-border/40">
                                          <span className="text-muted-foreground text-[11px]">Gross Margin:</span>
                                          {marginPercent != null ? (
                                            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                              +{marginPercent}% {profitPerUnit != null ? `(৳${profitPerUnit.toFixed(0)} profit)` : ""}
                                            </span>
                                          ) : (
                                            <span className="text-muted-foreground text-xs">—</span>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Card 3: Stock & Valuation */}
                                    <div className="rounded-lg border border-border/60 bg-secondary/15 p-3.5 space-y-2.5 sm:col-span-2 lg:col-span-1">
                                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                        <Package className="h-3.5 w-3.5 text-primary" /> Stock &amp; Valuation
                                      </div>
                                      <div className="space-y-1.5 text-xs">
                                        <div className="flex items-baseline justify-between">
                                          <span className="text-muted-foreground text-[11px]">Current Stock:</span>
                                          <span className="font-bold text-sm text-foreground">{r.stock} units</span>
                                        </div>
                                        <div className="flex items-baseline justify-between">
                                          <span className="text-muted-foreground text-[11px]">Retail Valuation:</span>
                                          <span className="font-semibold text-foreground">{fmtBDT(r.stock * r.price)}</span>
                                        </div>
                                        {r.cost_price != null && r.cost_price > 0 && (
                                          <div className="flex items-baseline justify-between">
                                            <span className="text-muted-foreground text-[11px]">Cost Valuation:</span>
                                            <span className="font-semibold text-foreground">{fmtBDT(r.stock * r.cost_price)}</span>
                                          </div>
                                        )}
                                        <div className="flex items-center justify-between pt-1 border-t border-border/40">
                                          <span className="text-muted-foreground text-[11px]">Inventory Mode:</span>
                                          <span className="text-[11px] font-semibold text-foreground bg-background px-2 py-0.5 rounded border border-border/50">
                                            {r.industry && ["cosmetics", "pharmacy", "grocery"].includes(r.industry) ? "FEFO Batch Tracked" : "Standard Inventory"}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Active Batches & Expiry (FEFO) */}
                                  {useApi && r.id && (
                                    <div className="rounded-lg border border-border/60 bg-secondary/10 p-3.5 space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                          <Calendar className="h-3.5 w-3.5 text-primary" /> Active Batches &amp; Expiry Dates (FEFO)
                                        </span>
                                        <span className="text-[10px] text-muted-foreground">Automatic oldest-batch dispatch</span>
                                      </div>
                                      <ProductBatchesDetail productId={r.id} />
                                    </div>
                                  )}

                                  {/* Attributes & Specifications */}
                                  {definedSpecs.length > 0 && (
                                    <div className="rounded-lg border border-border/60 bg-secondary/10 p-3.5 space-y-2">
                                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                                        Attributes &amp; Specifications
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
          {useApi && apiQuery.data && apiQuery.data.pages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-border px-3 py-2.5 sm:px-5 sm:py-3 text-xs sm:text-sm">
              <span className="text-muted-foreground text-center sm:text-left">Page {apiQuery.data.page} of {apiQuery.data.pages} · {apiQuery.data.total} total</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="h-8 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" className="h-8 text-xs" disabled={page >= apiQuery.data.pages} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </SectionCard>
      </PageBody>

      <BarcodeLabelPrintDialog
        open={!!barcodePrintProduct}
        onOpenChange={(open) => {
          if (!open) setBarcodePrintProduct(null);
        }}
        product={barcodePrintProduct}
        onBarcodeAssigned={(newBarcode) => {
          if (useApi) apiQuery.refetch();
          if (barcodePrintProduct) {
            setBarcodePrintProduct(prev => prev ? { ...prev, barcode: newBarcode } : null);
          }
          if (editId && barcodePrintProduct && editId === barcodePrintProduct.id) {
            setForm(f => ({ ...f, barcode: newBarcode }));
          }
        }}
      />

      <Dialog
        open={!!deleteConfirmProduct}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteConfirmProduct(null);
            setDeletePassword("");
            setShowDeletePassword(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertCircle className="h-5 w-5" /> Delete Product
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-foreground space-y-3">
            <p>
              Are you sure you want to permanently delete <strong>{deleteConfirmProduct?.name}</strong> (SKU: <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{deleteConfirmProduct?.sku}</code>)?
            </p>
            <p className="text-xs text-muted-foreground">
              Products with sales or purchase transaction history cannot be deleted and must be deactivated instead.
            </p>
            <div className="pt-2 border-t space-y-1.5">
              <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-amber-500" />
                Admin / Manager Password Required
              </Label>
              <div className="relative">
                <Input
                  type={showDeletePassword ? "text" : "password"}
                  placeholder="Enter admin password to authorize"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  className="pr-10 text-sm"
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && (!useApi || deletePassword.trim()) && !deleteMut.isPending) {
                      e.preventDefault();
                      if (!deleteConfirmProduct) return;
                      try {
                        if (useApi) {
                          await deleteMut.mutateAsync({ id: deleteConfirmProduct.id, password: deletePassword });
                        } else {
                          toast.success("Product removed (demo mode)");
                        }
                        if (drawerOpen && editId === deleteConfirmProduct.id) {
                          setDrawerOpen(false);
                        }
                        setDeleteConfirmProduct(null);
                        setDeletePassword("");
                        setShowDeletePassword(false);
                      } catch {
                        // Error handled by mutation
                      }
                    }
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  tabIndex={-1}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowDeletePassword(!showDeletePassword)}
                >
                  {showDeletePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Enter your account password or an authorized administrator's password to proceed.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDeleteConfirmProduct(null);
                setDeletePassword("");
                setShowDeletePassword(false);
              }}
              disabled={deleteMut.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteMut.isPending || (useApi && !deletePassword.trim())}
              onClick={async () => {
                if (!deleteConfirmProduct) return;
                try {
                  if (useApi) {
                    await deleteMut.mutateAsync({ id: deleteConfirmProduct.id, password: deletePassword });
                  } else {
                    toast.success("Product removed (demo mode)");
                  }
                  if (drawerOpen && editId === deleteConfirmProduct.id) {
                    setDrawerOpen(false);
                  }
                  setDeleteConfirmProduct(null);
                  setDeletePassword("");
                  setShowDeletePassword(false);
                } catch {
                  // Error toast is handled by useDeleteProduct onError
                }
              }}
            >
              {deleteMut.isPending ? "Verifying & Deleting..." : "Authorize & Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
