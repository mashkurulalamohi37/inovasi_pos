import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Barcode, Search, Camera, Sparkles, User } from "lucide-react";
import { CameraBarcodeScannerDialog, playScannerBeep } from "@/components/scanner/CameraBarcodeScannerDialog";
import { toast } from "sonner";
import { useApp } from "@/lib/app-store";
import { cosmeticsCatalog } from "@/lib/industry-mock";
import { shouldUseBackend } from "@/lib/demo-mode";
import { fmtBDT } from "@/lib/pos-data";
import { useAuth } from "@/lib/auth-provider";
import { PosShell, ProductGrid, PosProductCard } from "./PosShell";
import { usePosCatalog, catalogToCartExtras, type PosCatalogItem } from "@/hooks/use-pos-catalog";
import {
  useApiStores,
  useCosmeticsBarcodeLookup,
  useCosmeticsBatches,
  useCosmeticsFefo,
  useCosmeticsProfiles,
  useCosmeticsQuote,
  useCreateCosmeticsBatch,
  type CosmeticsBatch,
  type CosmeticsProfile,
  type CosmeticsVariant,
} from "@/hooks/use-api-config";
import { CustomerPicker, type CustomerSelection } from "@/features/sales/CustomerPicker";
import { usePosBarcodeScan } from "@/hooks/use-pos-barcode";
import { formatApiError, type ApiError } from "@/lib/api";

type CosmeticsPosItem = PosCatalogItem & {
  brand?: string;
  productType?: string;
  shade?: string;
  expiryDate?: string;
  daysToExpiry?: number | null;
  mrp?: number;
  profile?: CosmeticsProfile | null;
};

function batchDaysLeft(expiry: string) {
  return Math.floor((new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function sellableQty(profile: CosmeticsProfile | null | undefined, fallback: number) {
  if (!profile) return fallback;
  if (profile.is_tester) return 0;
  if (profile.sellable_qty != null) return Number(profile.sellable_qty);
  const stock = profile.stock != null ? Number(profile.stock) : fallback;
  const tester = profile.tester_qty != null ? Number(profile.tester_qty) : 0;
  return Math.max(0, stock - tester);
}

function normalizeFefo(data: CosmeticsBatch | CosmeticsBatch[] | undefined): CosmeticsBatch | null {
  if (!data) return null;
  if (Array.isArray(data)) return data[0] ?? null;
  return data;
}

function shadeLabel(v: CosmeticsVariant) {
  return [v.shade_code, v.shade_name].filter(Boolean).join(" · ") || v.sku || v.id;
}

export function CosmeticsPos() {
  const app = useApp();
  const useApi = shouldUseBackend();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [quoteCustomer, setQuoteCustomer] = useState<CustomerSelection | undefined>();
  const [pickCustomer, setPickCustomer] = useState(false);
  const [showQuickBatchAdd, setShowQuickBatchAdd] = useState(false);
  const [quickBatchNo, setQuickBatchNo] = useState("New Stock");
  const [quickBatchExpiry, setQuickBatchExpiry] = useState("");
  const [quickBatchQty, setQuickBatchQty] = useState("10");
  const [cameraScannerOpen, setCameraScannerOpen] = useState(false);
  const [pending, setPending] = useState<CosmeticsPosItem | null>(null);
  const [enteredQty, setEnteredQty] = useState("1");
  const [variantId, setVariantId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [quotePreview, setQuotePreview] = useState<{
    unit_price: number;
    line_total: number;
    price_source?: string;
    expiry_date?: string | null;
    days_to_expiry?: number | null;
    batch_no?: string | null;
    shade_code?: string | null;
    shade_name?: string | null;
  } | null>(null);

  const profilesQuery = useCosmeticsProfiles({ active_only: true }, useApi);
  const storesQuery = useApiStores();
  const storeId = user?.store_id ?? storesQuery.data?.[0]?.id ?? "";
  const quoteMut = useCosmeticsQuote();
  const createBatchMut = useCreateCosmeticsBatch();
  const barcodeLookup = useCosmeticsBarcodeLookup();

  const demoItems = useMemo((): CosmeticsPosItem[] => cosmeticsCatalog.map((row) => {
    const days = batchDaysLeft(row.expiryDate);
    const img = (row as any).image || (row as any).imageUrl || (row as any).image_url;
    return {
      id: row.sku,
      sku: row.sku,
      name: row.name,
      price: row.price,
      stock: 40,
      imageUrl: img || undefined,
      meta: {
        brand: row.brand,
        shade: row.shade ?? "",
        category: row.category,
        expiry_date: row.expiryDate,
        mrp: row.mrp,
        days_to_expiry: days,
        image: img,
      },
      brand: row.brand,
      productType: row.category,
      shade: row.shade,
      expiryDate: row.expiryDate,
      daysToExpiry: days,
      mrp: row.mrp,
    };
  }), []);

  const catalog = usePosCatalog("cosmetics", demoItems);

  const items = useMemo((): CosmeticsPosItem[] => {
    if (catalog.fromBackend) {
      const profileByProduct = new Map((profilesQuery.data ?? []).map((p) => [p.product_id, p]));
      const out: CosmeticsPosItem[] = [];
      for (const p of catalog.items) {
        const profile = profileByProduct.get(p.id) ?? null;
        if (profile?.is_tester) continue;
        const days =
          profile?.days_to_expiry != null
            ? Number(profile.days_to_expiry)
            : profile?.nearest_expiry
              ? batchDaysLeft(String(profile.nearest_expiry))
              : null;
        out.push({
          ...p,
          imageUrl:
            p.imageUrl ||
            (p.meta?.image as string) ||
            (p.meta?.image_url as string) ||
            (p.meta?.imageUrl as string) ||
            (p as any)?.image ||
            (profile as any)?.image_url ||
            (profile as any)?.image,
          stock: sellableQty(profile, p.stock),
          brand: profile?.brand_name ?? String(p.meta?.brand ?? ""),
          productType: profile?.product_type ?? profile?.category ?? String(p.meta?.category ?? ""),
          shade: profile?.shade_name ?? profile?.shade_code ?? String(p.meta?.shade ?? ""),
          expiryDate: profile?.nearest_expiry ? String(profile.nearest_expiry).slice(0, 10) : undefined,
          daysToExpiry: days,
          mrp: profile?.mrp != null ? Number(profile.mrp) : undefined,
          profile,
        });
      }
      return out;
    }
    return catalog.items as CosmeticsPosItem[];
  }, [catalog.fromBackend, catalog.items, profilesQuery.data]);

  const brands = useMemo(() => {
    const set = new Set(items.map((i) => i.brand).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [items]);

  const types = useMemo(() => {
    const set = new Set(items.map((i) => i.productType).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((p) => {
      if (brandFilter !== "all" && p.brand !== brandFilter) return false;
      if (typeFilter !== "all" && p.productType !== typeFilter) return false;
      if (!q) return true;
      return [p.name, p.sku, p.brand, p.shade, p.productType, p.expiryDate, p.barcode, p.meta?.barcode].some((x) =>
        String(x ?? "").toLowerCase().includes(q),
      );
    });
  }, [items, search, brandFilter, typeFilter]);

  const variants = pending?.profile?.variants?.filter((v) => v.is_active !== false) ?? [];

  const batchesQuery = useCosmeticsBatches(
    {
      product_id: catalog.fromBackend && pending ? pending.id : undefined,
      store_id: storeId || undefined,
    },
    Boolean(catalog.fromBackend && pending),
  );
  const fefoQuery = useCosmeticsFefo({
    product_id: catalog.fromBackend && pending ? pending.id : undefined,
    variant_id: variantId || undefined,
    store_id: storeId || undefined,
  });

  const fefoBatch = normalizeFefo(fefoQuery.data);
  const batchOptions = useMemo(() => {
    const fromList = (batchesQuery.data ?? []).filter(
      (b) => !b.is_tester && (b.sellable_qty ?? b.qty_on_hand ?? 0) > 0 && b.status !== "quarantined" && b.status !== "expired",
    );
    const seen = new Set<string>();
    const list: CosmeticsBatch[] = [];

    const addBatch = (b: CosmeticsBatch) => {
      const bNo = b.batch_no?.trim().toLowerCase() || "";
      const bId = String(b.id || "").trim();
      const key = `${bId}::${bNo}`;
      if (!seen.has(key) && (!bNo || !seen.has(bNo))) {
        seen.add(key);
        if (bNo) seen.add(bNo);
        list.push(b);
      }
    };

    if (fefoBatch && !fefoBatch.is_tester) {
      addBatch(fefoBatch);
    }
    for (const b of fromList) {
      addBatch(b);
    }
    return list;
  }, [batchesQuery.data, fefoBatch]);

  useEffect(() => {
    if (!pending || !catalog.fromBackend) return;
    if (variants.length && !variantId) {
      const match = variants.find(
        (v) =>
          (pending.shade && (v.shade_name === pending.shade || v.shade_code === pending.shade)) ||
          false,
      );
      setVariantId(match?.id ?? variants[0]?.id ?? "");
    }
  }, [pending, catalog.fromBackend, variants, variantId]);

  useEffect(() => {
    if (!pending || !catalog.fromBackend) return;
    if (fefoBatch?.id && (!batchId || !batchOptions.some((b) => b.id === batchId))) {
      setBatchId(fefoBatch.id);
    } else if (batchOptions[0]?.id && (!batchId || !batchOptions.some((b) => b.id === batchId))) {
      setBatchId(batchOptions[0].id);
    }
  }, [pending, catalog.fromBackend, fefoBatch?.id, batchOptions, batchId]);

  const openAdd = (item: CosmeticsPosItem) => {
    if ((item.stock ?? 0) <= 0 && catalog.fromBackend) {
      toast.error("No sellable stock (testers excluded)");
      return;
    }
    setPending(item);
    setEnteredQty("1");
    setVariantId("");
    setBatchId("");
    setQuotePreview(null);
    setShowQuickBatchAdd(false);
    setQuickBatchNo("New Stock");
    setQuickBatchExpiry("");
    setQuickBatchQty(String(item.stock || 10));
  };

  const selectedBatch = batchOptions.find((b) => b.id === batchId) ?? fefoBatch;
  const selectedVariant = variants.find((v) => v.id === variantId);

  const refreshQuote = async () => {
    if (!pending || !catalog.fromBackend) return;
    const qty = Number(enteredQty);
    if (!qty || qty <= 0) {
      toast.error("Enter a valid quantity");
      return;
    }
    try {
      const q = await quoteMut.mutateAsync({
        product_id: pending.id,
        entered_qty: qty,
        variant_id: variantId || undefined,
        batch_id: batchId || undefined,
        store_id: storeId || undefined,
        customer_id: quoteCustomer?.id,
      });
      setQuotePreview({
        unit_price: q.unit_price,
        line_total: q.line_total,
        price_source: q.price_source,
        expiry_date: q.expiry_date,
        days_to_expiry: q.days_to_expiry,
        batch_no: q.batch_no,
        shade_code: q.shade_code,
        shade_name: q.shade_name,
      });
      if (q.days_to_expiry != null && Number(q.days_to_expiry) <= 90 && Number(q.days_to_expiry) > 0) {
        toast.warning(`Near-expiry: ${q.days_to_expiry} days left`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Quote failed");
    }
  };

  const confirmAdd = async () => {
    if (!pending) return;
    const qty = Number(enteredQty);
    if (!qty || qty <= 0) {
      toast.error("Enter a valid quantity");
      return;
    }

    if (catalog.fromBackend) {
      const isBatchTracked = pending.profile ? pending.profile.batch_tracked !== false : true;
      let effectiveBatchId = batchId || selectedBatch?.id;

      if (!effectiveBatchId) {
        if (batchOptions.length > 0) {
          effectiveBatchId = batchOptions[0].id;
          setBatchId(effectiveBatchId);
        } else if (isBatchTracked) {
          try {
            const cleanSku = (pending.sku || "COS").toUpperCase().replace(/\s+/g, "-");
            const autoBatch = await createBatchMut.mutateAsync({
              product_id: pending.id,
              batch_no: `BATCH-${cleanSku}-01`,
              qty_on_hand: pending.stock || 10,
              store_id: storeId || undefined,
              expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
            });
            effectiveBatchId = autoBatch.id;
            setBatchId(autoBatch.id);
            await batchesQuery.refetch();
          } catch {
            if (pending.profile?.batch_tracked === true) {
              toast.error("Select a sellable batch");
              return;
            }
          }
        }
      }

      const effectiveBatch = batchOptions.find((b) => b.id === effectiveBatchId) ?? selectedBatch;
      const days =
        effectiveBatch?.days_to_expiry != null
          ? Number(effectiveBatch.days_to_expiry)
          : effectiveBatch?.expiry_date
            ? batchDaysLeft(effectiveBatch.expiry_date)
            : null;
      if (days != null && days <= 0) {
        toast.error("Expired batch cannot be sold");
        return;
      }
      try {
        const q = await quoteMut.mutateAsync({
          product_id: pending.id,
          entered_qty: qty,
          variant_id: variantId || undefined,
          batch_id: effectiveBatchId || undefined,
          store_id: storeId || undefined,
          customer_id: quoteCustomer?.id,
        });
        if (q.days_to_expiry != null && Number(q.days_to_expiry) <= 0) {
          toast.error("Expired batch cannot be sold");
          return;
        }
        if (q.days_to_expiry != null && Number(q.days_to_expiry) <= 90) {
          toast.warning(`Near-expiry batch: ${q.days_to_expiry} days left`);
        }
        const shade =
          [q.shade_code ?? selectedVariant?.shade_code, q.shade_name ?? selectedVariant?.shade_name]
            .filter(Boolean)
            .join(" · ") || pending.shade || "";
        app.addToCart({
          sku: pending.sku,
          name: pending.name,
          meta: pending.brand,
          price: q.unit_price,
          qty,
          industry: "cosmetics",
          extras: {
            ...catalogToCartExtras(pending),
            productId: pending.id,
            brand: q.brand_name ?? pending.brand ?? "",
            shade,
            shade_code: q.shade_code ?? selectedVariant?.shade_code ?? "",
            shade_name: q.shade_name ?? selectedVariant?.shade_name ?? "",
            variant_id: variantId || "",
            batch: q.batch_no ?? effectiveBatch?.batch_no ?? selectedBatch?.batch_no ?? "",
            batch_id: q.batch_id || effectiveBatchId || selectedBatch?.id || "",
            expiry: String(q.expiry_date ?? selectedBatch?.expiry_date ?? ""),
            days_to_expiry: Number(q.days_to_expiry ?? days ?? 0),
            mrp: Number(q.mrp ?? pending.mrp ?? 0),
            price_source: q.price_source ?? "",
            fefo: true,
          },
        });
        setPending(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not add line");
      }
      return;
    }

    if (pending.daysToExpiry != null && pending.daysToExpiry <= 0) {
      toast.error("Expired item cannot be sold");
      return;
    }
    if (pending.daysToExpiry != null && pending.daysToExpiry <= 90) {
      toast.warning(`Near-expiry: ${pending.daysToExpiry} days left`);
    }
    app.addToCart({
      sku: pending.sku,
      name: pending.name,
      meta: pending.brand,
      price: pending.price,
      qty,
      industry: "cosmetics",
      extras: {
        ...catalogToCartExtras(pending),
        brand: pending.brand ?? "",
        shade: pending.shade ?? "",
        expiry: pending.expiryDate ?? "",
        mrp: pending.mrp ?? 0,
      },
    });
    setPending(null);
  };

  const { barcode, setBarcode, handleScan, isPending: scanPending } = usePosBarcodeScan({
    fromBackend: false,
    catalogItems: items,
    onAdd: (item) => openAdd(item as CosmeticsPosItem),
  });

  const handleScanBarcode = async (scannedCode: string) => {
    const code = scannedCode.trim();
    if (!code) return;
    playScannerBeep();
    setBarcode(code);
    setSearch(code);
    if (catalog.fromBackend) {
      try {
        const hit = await barcodeLookup.mutateAsync(code);
        if (hit.is_tester) {
          toast.error("Tester units are not sellable");
          return;
        }
        const stockRow = items.find((i) => i.id === hit.product_id);
        const resolvedStock = stockRow ? stockRow.stock : ((hit as any).stock ?? (hit as any).qty_on_hand ?? 0);
        const item: CosmeticsPosItem = {
          id: hit.product_id,
          sku: hit.sku ?? stockRow?.sku ?? hit.product_id,
          name: hit.name || stockRow?.name || "Cosmetics",
          price: hit.base_price != null ? Number(hit.base_price) : stockRow?.price ?? 0,
          stock: sellableQty(hit, resolvedStock),
          barcode: hit.barcode ?? code,
          brand: hit.brand_name ?? stockRow?.brand ?? "",
          productType: hit.product_type ?? hit.category ?? stockRow?.productType ?? "",
          shade: hit.shade_name ?? hit.shade_code ?? stockRow?.shade ?? "",
          expiryDate: hit.nearest_expiry ? String(hit.nearest_expiry).slice(0, 10) : stockRow?.expiryDate,
          daysToExpiry: hit.days_to_expiry != null ? Number(hit.days_to_expiry) : stockRow?.daysToExpiry ?? null,
          mrp: hit.mrp != null ? Number(hit.mrp) : stockRow?.mrp,
          profile: hit,
        };
        openAdd(item);
        if (hit.variant_id) setVariantId(hit.variant_id);
        if (hit.batch?.id) setBatchId(hit.batch.id);
        setBarcode("");
        setSearch("");
        setCameraScannerOpen(false);
      } catch (err) {
        const match = items.find(
          (i) =>
            (i.barcode && i.barcode.toLowerCase() === code.toLowerCase()) ||
            (i.meta?.barcode && String(i.meta.barcode).toLowerCase() === code.toLowerCase()) ||
            i.sku.toLowerCase() === code.toLowerCase()
        );
        if (match) {
          openAdd(match);
          setBarcode("");
          setSearch("");
          setCameraScannerOpen(false);
          return;
        }
        if (filtered.length === 1) {
          openAdd(filtered[0]);
          setBarcode("");
          setSearch("");
          setCameraScannerOpen(false);
          return;
        }
        toast.error(formatApiError(err as ApiError) || `Barcode "${code}" not found`);
      }
      return;
    }
    const match = items.find(
      (i) =>
        i.sku.toLowerCase() === code.toLowerCase() ||
        (i.barcode && i.barcode.toLowerCase() === code.toLowerCase()) ||
        (i.meta?.barcode && String(i.meta.barcode).toLowerCase() === code.toLowerCase())
    );
    if (match) {
      openAdd(match);
      setBarcode("");
      setSearch("");
      setCameraScannerOpen(false);
    } else if (filtered.length === 1) {
      openAdd(filtered[0]);
      setBarcode("");
      setSearch("");
      setCameraScannerOpen(false);
    } else {
      await handleScan();
      setBarcode("");
      setSearch("");
      setCameraScannerOpen(false);
    }
  };

  const handleBarcodeLookup = async () => {
    await handleScanBarcode((barcode || search).trim());
  };

  return (
    <>
      <PosShell
        industry="cosmetics"
        title="Cosmetics & Beauty Retail POS"
        subtitle="Brand · shade · FEFO batch · expiry alerts"
        receiptNote={quoteCustomer ? `Customer: ${quoteCustomer.name}` : undefined}
        onCameraScan={handleScanBarcode}
        onSyncCatalog={() => catalog.refetch()}
        isSyncing={catalog.isRefetching}
        headerBadges={
          <>
            {app.isFeatureEnabled("cosmetics.brand") && (
              <Select value={brandFilter} onValueChange={setBrandFilter}>
                <SelectTrigger className="h-7 w-[110px] text-xs bg-background/80 shadow-2xs shrink-0">
                  <SelectValue placeholder="All brands" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All brands</SelectItem>
                  {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-7 w-[105px] text-xs bg-background/80 shadow-2xs shrink-0">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {types.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5 bg-background/80 shadow-2xs font-medium shrink-0 cursor-pointer"
              onClick={() => setPickCustomer(true)}
            >
              <User className="h-3 w-3 text-primary" />
              <span className="truncate max-w-[100px]">{quoteCustomer ? quoteCustomer.name : "Customer"}</span>
            </Button>
            {catalog.fromBackend && (
              <Badge
                variant="outline"
                className="h-7 text-[10px] px-2 font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 whitespace-nowrap shrink-0 shadow-2xs flex items-center gap-1.5"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                Live stock
              </Badge>
            )}
            <Badge
              variant="outline"
              className="h-7 text-[10px] px-2 font-normal text-muted-foreground whitespace-nowrap shrink-0 bg-muted/30 border-dashed flex items-center gap-1"
              title="AI shade match recommendation engine is offline/disabled"
            >
              <Sparkles className="h-3 w-3 text-muted-foreground/60 shrink-0" />
              AI Shade: Off
            </Badge>
          </>
        }
        cartLineExtra={(line) => (
          <div className="text-[10px] text-muted-foreground space-y-0.5">
            <div>
              {[line.extras?.brand, line.extras?.shade].filter(Boolean).map(String).join(" · ")}
            </div>
            {line.extras?.batch ? (
              <div>
                Batch {String(line.extras.batch)}
                {line.extras?.expiry ? ` · exp ${String(line.extras.expiry).slice(0, 10)}` : ""}
              </div>
            ) : line.extras?.expiry ? (
              <div>Exp {String(line.extras.expiry).slice(0, 10)}</div>
            ) : null}
            {line.extras?.mrp != null ? <div>MRP {fmtBDT(Number(line.extras.mrp))}</div> : null}
          </div>
        )}
        catalog={
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="space-y-2 border-b border-border bg-background px-4 py-2">
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleBarcodeLookup();
                }}
              >
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search SKU, brand, shade, or scan barcode (Enter to add)…"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setBarcode(e.target.value);
                    }}
                    className="h-9 pl-8 pr-8 text-xs flex-1 bg-card/60 shadow-2xs"
                  />
                  <Barcode className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCameraScannerOpen(true)}
                  className="h-9 px-3 gap-1.5 border-dashed border-primary/40 text-primary hover:bg-primary/10 shrink-0 cursor-pointer shadow-2xs"
                  title="Scan barcode using device camera"
                >
                  <Camera className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline text-xs font-medium">Camera</span>
                </Button>
                {(useApi || app.isFeatureEnabled("cosmetics.brand")) && (
                  <Button
                    type="submit"
                    size="sm"
                    className="h-9 px-3.5 gap-1.5 shadow-2xs cursor-pointer"
                    disabled={scanPending || barcodeLookup.isPending}
                  >
                    <Barcode className="h-3.5 w-3.5" />
                    <span>Scan</span>
                  </Button>
                )}
              </form>
              {app.isFeatureEnabled("cosmetics.expiry") && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                  FEFO suggests earliest sellable batch · tester qty never sellable · expired blocked
                </div>
              )}
              {!app.isFeatureEnabled("cosmetics.combo_offer") && (
                <p className="text-[10px] text-muted-foreground">
                  Combo / gift-set offers disabled — no fake combo pricing.
                </p>
              )}
            </div>
            <ProductGrid
              items={filtered}
              onAdd={(item) => openAdd(item as CosmeticsPosItem)}
              renderCard={(item) => {
                const p = item as CosmeticsPosItem;
                const near =
                  p.daysToExpiry != null && p.daysToExpiry > 0 && p.daysToExpiry <= 90;
                return (
                  <PosProductCard
                    badge={p.brand || "Cosmetics"}
                    title={p.name}
                    subtitle={[p.shade, p.productType].filter(Boolean).join(" · ") || p.sku}
                    price={fmtBDT(p.price)}
                    industry="cosmetics"
                    sku={p.sku}
                    imageUrl={
                      p.imageUrl ||
                      (p.meta?.image as string) ||
                      (p.meta?.image_url as string) ||
                      (p.meta?.imageUrl as string) ||
                      (p as any)?.image ||
                      (p as any)?.imageUrl ||
                      (p.profile as any)?.image_url ||
                      (p.profile as any)?.image
                    }
                    footer={
                      <div className="mt-1 flex flex-wrap gap-1">
                        {p.expiryDate && (
                          <Badge variant="outline" className="text-[9px]">
                            Exp {p.expiryDate}
                          </Badge>
                        )}
                        {near && app.isFeatureEnabled("cosmetics.expiry") && (
                          <Badge variant="outline" className="text-[9px] text-warning">
                            Near expiry · {p.daysToExpiry}d
                          </Badge>
                        )}
                        {p.daysToExpiry != null && p.daysToExpiry <= 0 && (
                          <Badge variant="destructive" className="text-[9px]">Expired</Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          Sellable {p.stock}
                        </span>
                      </div>
                    }
                  />
                );
              }}
            />
          </div>
        }
      />

      <Dialog
        open={!!pending}
        onOpenChange={(v) => {
          if (!v) setPending(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add cosmetics line</DialogTitle>
          </DialogHeader>
          {pending && (
            <div className="space-y-3">
              <div>
                <div className="font-medium">{pending.name}</div>
                <div className="text-xs text-muted-foreground">
                  {[pending.brand, pending.productType].filter(Boolean).join(" · ")}
                </div>
              </div>
              {app.isFeatureEnabled("cosmetics.shade") && variants.length > 0 && (
                <div>
                  <Label>Shade / variant</Label>
                  <Select value={variantId} onValueChange={(v) => { setVariantId(v); setQuotePreview(null); }}>
                    <SelectTrigger><SelectValue placeholder="Select shade" /></SelectTrigger>
                    <SelectContent>
                      {variants.map((v) => (
                        <SelectItem key={v.id} value={v.id}>{shadeLabel(v)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {catalog.fromBackend && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label>Batch (FEFO)</Label>
                    <div className="flex items-center gap-2">
                      {batchesQuery.isLoading && (
                        <span className="text-[10px] text-muted-foreground animate-pulse">Loading batches...</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowQuickBatchAdd(v => !v)}
                        className="text-[11px] text-primary hover:underline font-semibold cursor-pointer"
                      >
                        {showQuickBatchAdd ? "Cancel" : "+ Add / Restock Batch"}
                      </button>
                    </div>
                  </div>

                  {showQuickBatchAdd && (
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5 space-y-2 mb-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">Add Batch to Stock</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setQuickBatchNo("Old Stock")}
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-colors",
                              quickBatchNo === "Old Stock"
                                ? "bg-amber-500/20 border-amber-500 text-amber-700 dark:text-amber-300"
                                : "bg-background border-border text-muted-foreground hover:text-foreground"
                            )}
                          >
                            🏷️ Old Stock
                          </button>
                          <button
                            type="button"
                            onClick={() => setQuickBatchNo("New Stock")}
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-colors",
                              quickBatchNo === "New Stock"
                                ? "bg-emerald-500/20 border-emerald-500 text-emerald-700 dark:text-emerald-300"
                                : "bg-background border-border text-muted-foreground hover:text-foreground"
                            )}
                          >
                            ✨ New Stock
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] text-muted-foreground block uppercase font-medium">Batch #</label>
                          <Input
                            className="h-7 text-xs bg-background mt-0.5"
                            value={quickBatchNo}
                            onChange={e => setQuickBatchNo(e.target.value)}
                            placeholder="e.g. BATCH-01"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground block uppercase font-medium">Expiry Date *</label>
                          <Input
                            type="date"
                            className="h-7 text-xs bg-background mt-0.5"
                            value={quickBatchExpiry}
                            onChange={e => setQuickBatchExpiry(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground block uppercase font-medium">Qty *</label>
                          <Input
                            type="number"
                            min="1"
                            className="h-7 text-xs bg-background mt-0.5"
                            value={quickBatchQty}
                            onChange={e => setQuickBatchQty(e.target.value)}
                            placeholder="Qty"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end pt-1">
                        <Button
                          type="button"
                          size="sm"
                          disabled={createBatchMut.isPending || !quickBatchNo.trim() || !quickBatchExpiry}
                          className="h-7 text-xs px-3"
                          onClick={async () => {
                            try {
                              const res = await createBatchMut.mutateAsync({
                                product_id: pending.id,
                                batch_no: quickBatchNo.trim(),
                                qty_on_hand: Number(quickBatchQty) || 10,
                                store_id: storeId || undefined,
                                expiry_date: quickBatchExpiry,
                              });
                              toast.success(`Batch ${quickBatchNo} registered!`);
                              setShowQuickBatchAdd(false);
                              await batchesQuery.refetch();
                              await fefoQuery.refetch();
                              if (res?.id) setBatchId(res.id);
                            } catch (err: any) {
                              toast.error(err?.message || "Failed to add batch");
                            }
                          }}
                        >
                          {createBatchMut.isPending ? "Adding..." : "Save & Select Batch"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {batchOptions.length > 0 ? (
                    <Select value={batchId} onValueChange={(v) => { setBatchId(v); setQuotePreview(null); }}>
                      <SelectTrigger><SelectValue placeholder="Select batch" /></SelectTrigger>
                      <SelectContent>
                        {batchOptions.map((b) => {
                          const days =
                            b.days_to_expiry != null
                              ? Number(b.days_to_expiry)
                              : batchDaysLeft(b.expiry_date);
                          const qty = b.sellable_qty ?? b.qty_on_hand ?? 0;
                          return (
                            <SelectItem key={b.id} value={b.id}>
                              {b.batch_no} · exp {String(b.expiry_date).slice(0, 10)} · {days}d · qty {qty}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="rounded-md border border-dashed border-border p-2.5 text-xs text-muted-foreground flex items-center justify-between">
                      <span>{pending.profile?.batch_tracked === false ? "Standard stock (no batch tracking)" : "No batch registered yet"}</span>
                      {pending.profile?.batch_tracked !== false && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-6 text-[10px] px-2"
                          disabled={createBatchMut.isPending}
                          onClick={async () => {
                            try {
                              const cleanSku = (pending.sku || "COS").toUpperCase().replace(/\s+/g, "-");
                              const res = await createBatchMut.mutateAsync({
                                product_id: pending.id,
                                batch_no: `BATCH-${cleanSku}-01`,
                                qty_on_hand: pending.stock || 10,
                                store_id: storeId || undefined,
                                expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
                              });
                              toast.success("Batch created");
                              await batchesQuery.refetch();
                              if (res?.id) setBatchId(res.id);
                            } catch (err: any) {
                              toast.error(err?.message || "Failed to create batch");
                            }
                          }}
                        >
                          + Quick Add Batch
                        </Button>
                      )}
                    </div>
                  )}
                  {selectedBatch && Number(selectedBatch.days_to_expiry ?? 999) <= 90 && (
                    <Badge variant="outline" className="mt-2 text-[10px] text-warning">
                      Near-expiry warning
                    </Badge>
                  )}
                </div>
              )}
              <div>
                <Label>Qty</Label>
                <Input
                  type="number"
                  min={1}
                  value={enteredQty}
                  onChange={(e) => {
                    setEnteredQty(e.target.value);
                    setQuotePreview(null);
                  }}
                />
              </div>
              {catalog.fromBackend && (
                <div className="rounded-md border border-border bg-secondary/30 p-2 text-xs space-y-1">
                  {quotePreview ? (
                    <>
                      <div>Unit {fmtBDT(quotePreview.unit_price)} · Line {fmtBDT(quotePreview.line_total)}</div>
                      {quotePreview.expiry_date && (
                        <div>Expiry {String(quotePreview.expiry_date).slice(0, 10)}
                          {quotePreview.days_to_expiry != null ? ` · ${quotePreview.days_to_expiry}d` : ""}
                        </div>
                      )}
                      {quotePreview.price_source && <div>Source {quotePreview.price_source}</div>}
                    </>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => void refreshQuote()} disabled={quoteMut.isPending}>
                      Quote before add
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>Cancel</Button>
            <Button onClick={() => void confirmAdd()} disabled={quoteMut.isPending}>
              Add to cart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CustomerPicker
        open={pickCustomer}
        onOpenChange={setPickCustomer}
        value={quoteCustomer}
        onSelect={(c) => {
          setQuoteCustomer(c);
          setPickCustomer(false);
        }}
      />

      <CameraBarcodeScannerDialog
        open={cameraScannerOpen}
        onOpenChange={setCameraScannerOpen}
        title="Cosmetics Camera Barcode Scanner"
        subtitle="Point device camera at any cosmetics package, shade barcode or SKU"
        continuous={true}
        onScan={(code) => {
          void handleScanBarcode(code);
        }}
      />
    </>
  );
}
