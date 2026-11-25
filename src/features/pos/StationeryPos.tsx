import { useMemo, useState } from "react";
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
import { Barcode, List, Package, Search} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/app-store";
import { stationeryCatalog } from "@/lib/industry-mock";
import { shouldUseBackend } from "@/lib/demo-mode";
import { fmtBDT } from "@/lib/pos-data";
import { useAuth } from "@/lib/auth-provider";
import { PosShell, ProductGrid, PosProductCard } from "./PosShell";
import { usePosCatalog, catalogToCartExtras, type PosCatalogItem } from "@/hooks/use-pos-catalog";
import {
  useApiStores,
  useStationeryBarcodeLookup,
  useStationeryProfiles,
  useStationeryQuote,
  useStationerySchoolLists,
  type StationeryProfile,
} from "@/hooks/use-api-config";
import { useStationeryCartResolve } from "@/hooks/use-industry-backoffice";
import { CustomerPicker, type CustomerSelection } from "@/features/sales/CustomerPicker";
import { usePosBarcodeScan } from "@/hooks/use-pos-barcode";
import { formatApiError, type ApiError } from "@/lib/api";

type StationeryPosItem = PosCatalogItem & {
  brand?: string;
  category?: string;
  schoolClass?: string;
  unitLabel?: string;
  wholesalePrice?: number;
  profile?: StationeryProfile | null;
};

export function StationeryPos() {
  const app = useApp();
  const useApi = shouldUseBackend();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [quoteCustomer, setQuoteCustomer] = useState<CustomerSelection | undefined>();
  const [pickCustomer, setPickCustomer] = useState(false);
  const [schoolListId, setSchoolListId] = useState("");
  const [listNotes, setListNotes] = useState<{ kind: "partial" | "unavailable"; text: string }[]>([]);
  const [pending, setPending] = useState<StationeryPosItem | null>(null);
  const [enteredQty, setEnteredQty] = useState("1");
  const [salesUomId, setSalesUomId] = useState("");
  const [quotePreview, setQuotePreview] = useState<{
    conversion_factor: number;
    base_qty: number;
    unit_price: number;
    line_total: number;
    price_source: string;
    from_uom_id?: string | null;
  } | null>(null);

  const profilesQuery = useStationeryProfiles({ active_only: true }, useApi);
  const listsQuery = useStationerySchoolLists({ status: "active" });
  const storesQuery = useApiStores();
  const storeId = user?.store_id ?? storesQuery.data?.[0]?.id ?? "";
  const quoteMut = useStationeryQuote();
  const barcodeLookup = useStationeryBarcodeLookup();
  const cartResolve = useStationeryCartResolve();

  const demoItems = useMemo((): StationeryPosItem[] => stationeryCatalog.map((row) => ({
    id: row.sku,
    sku: row.sku,
    name: row.name,
    price: row.price,
    stock: 40,
    barcode: row.barcode,
    wholesalePrice: row.wholesalePrice,
    meta: {
      brand: row.brand,
      school_class: row.schoolClass,
      pack_qty: row.packQty,
      category: row.schoolClass,
    },
    brand: row.brand,
    category: row.schoolClass,
    schoolClass: row.schoolClass,
    unitLabel: row.packQty > 1 ? `Pack×${row.packQty}` : "PCS",
  })), []);

  const catalog = usePosCatalog("stationery", demoItems);

  const items = useMemo((): StationeryPosItem[] => {
    if (catalog.fromBackend) {
      const profileByProduct = new Map((profilesQuery.data ?? []).map((p) => [p.product_id, p]));
      return catalog.items.map((p) => {
        const profile = profileByProduct.get(p.id) ?? null;
        return {
          ...p,
          brand: profile?.brand_name ?? String(p.meta?.brand ?? ""),
          category: profile?.stationery_type ?? profile?.category ?? String(p.meta?.category ?? ""),
          schoolClass: String(p.meta?.school_class ?? ""),
          unitLabel: profile?.default_sales_uom?.code ?? profile?.base_uom?.code ?? String(p.meta?.unit ?? "PCS"),
          wholesalePrice: p.wholesalePrice,
          profile,
          name: profile?.name || p.name,
          price: profile?.base_price != null ? Number(profile.base_price) : p.price,
          stock: profile?.stock != null ? Number(profile.stock) : p.stock,
        };
      });
    }
    return catalog.items as StationeryPosItem[];
  }, [catalog.fromBackend, catalog.items, profilesQuery.data]);

  const brands = useMemo(() => {
    const set = new Set(items.map((i) => i.brand).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [items]);

  const categories = useMemo(() => {
    const set = new Set(
      items.map((i) => i.category || i.schoolClass).filter(Boolean) as string[],
    );
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((p) => {
      if (brandFilter !== "all" && p.brand !== brandFilter) return false;
      if (categoryFilter !== "all" && (p.category || p.schoolClass) !== categoryFilter) return false;
      if (!q) return true;
      return [p.name, p.sku, p.brand, p.category, p.schoolClass, p.barcode].some((x) =>
        String(x ?? "").toLowerCase().includes(q),
      );
    });
  }, [items, search, brandFilter, categoryFilter]);

  const openAdd = (item: StationeryPosItem) => {
    setPending(item);
    setEnteredQty("1");
    setSalesUomId(item.profile?.default_sales_uom_id ?? item.profile?.base_uom_id ?? "");
    setQuotePreview(null);
  };

  const addLine = (
    item: StationeryPosItem,
    qty: number,
    extras: Record<string, unknown> = {},
    unitPrice?: number,
  ) => {
    app.addToCart({
      sku: item.sku,
      name: item.name,
      meta: item.brand,
      price: unitPrice ?? item.price,
      qty,
      industry: "stationery",
      extras: {
        ...catalogToCartExtras(item),
        productId: item.id,
        brand: item.brand ?? "",
        unit: item.unitLabel ?? "PCS",
        ...extras,
      },
    });
  };

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
        sales_uom_id: salesUomId || undefined,
        customer_id: quoteCustomer?.id,
      });
      setQuotePreview({
        conversion_factor: q.conversion_factor,
        base_qty: q.base_qty,
        unit_price: q.unit_price,
        line_total: q.line_total,
        price_source: q.price_source,
        from_uom_id: q.from_uom_id,
      });
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
      try {
        const q = await quoteMut.mutateAsync({
          product_id: pending.id,
          entered_qty: qty,
          sales_uom_id: salesUomId || undefined,
          customer_id: quoteCustomer?.id,
        });
        const fromCode =
          (pending.profile?.default_sales_uom?.id === String(q.from_uom_id ?? salesUomId)
            ? pending.profile?.default_sales_uom?.code
            : undefined)
          ?? pending.profile?.base_uom?.code
          ?? pending.unitLabel
          ?? "PCS";
        addLine(
          pending,
          qty,
          {
            unit: fromCode,
            sales_uom_id: String(q.from_uom_id ?? salesUomId ?? ""),
            entered_qty: q.entered_qty,
            conversion_factor: q.conversion_factor,
            base_qty: q.base_qty,
            base_uom_id: String(q.base_uom_id ?? ""),
            price_source: q.price_source,
          },
          q.unit_price,
        );
        setPending(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not add line");
      }
      return;
    }

    const price =
      app.isFeatureEnabled("stationery.wholesale") && quoteCustomer && pending.wholesalePrice != null
        ? pending.wholesalePrice
        : pending.price;
    addLine(pending, qty, {
      unit: pending.unitLabel ?? "PCS",
      price_source: quoteCustomer && pending.wholesalePrice != null ? "dealer" : "standard",
    }, price);
    setPending(null);
  };

  const { barcode, setBarcode, handleScan, isPending: scanPending } = usePosBarcodeScan({
    fromBackend: false,
    catalogItems: items,
    onAdd: (item) => openAdd(item as StationeryPosItem),
  });

  const handleBarcodeLookup = async () => {
    const code = barcode.trim();
    if (!code) return;

    if (catalog.fromBackend) {
      try {
        const hit = await barcodeLookup.mutateAsync(code);
        const stockRow = items.find((i) => i.id === hit.product_id);
        const item: StationeryPosItem = {
          id: hit.product_id,
          sku: hit.sku ?? stockRow?.sku ?? hit.product_id,
          name: hit.name || stockRow?.name || "Stationery",
          price: hit.base_price != null ? Number(hit.base_price) : stockRow?.price ?? 0,
          stock: hit.stock != null ? Number(hit.stock) : stockRow?.stock ?? 0,
          barcode: hit.barcode ?? code,
          brand: hit.brand_name ?? "",
          category: hit.stationery_type ?? hit.category ?? "",
          unitLabel: hit.default_sales_uom?.code ?? hit.base_uom?.code ?? "PCS",
          profile: hit,
        };
        openAdd(item);
        setBarcode("");
      } catch (err) {
        toast.error(formatApiError(err as ApiError) || "Barcode not found");
      }
      return;
    }

    await handleScan();
  };

  const applySchoolList = async () => {
    if (!schoolListId) {
      toast.error("Select a school list");
      return;
    }
    if (!catalog.fromBackend) {
      toast.error("Backend required to resolve school lists");
      return;
    }
    if (!storeId) {
      toast.error("No store context for availability");
      return;
    }
    try {
      const result = await cartResolve.mutateAsync({
        id: schoolListId,
        body: { store_id: storeId },
      });
      const available = result.available_items ?? [];
      const partial = result.partial_items ?? [];
      const unavailable = result.unavailable_items ?? [];
      const notes: { kind: "partial" | "unavailable"; text: string }[] = [];

      const pushLine = (
        line: (typeof available)[number],
        qty: number,
        kind: "available" | "partial",
      ) => {
        const existing = items.find((i) => i.id === line.product_id);
        addLine(
          {
            id: line.product_id,
            sku: line.sku ?? existing?.sku ?? line.product_id,
            name: line.name ?? existing?.name ?? "Stationery",
            price: line.unit_price ?? existing?.price ?? 0,
            stock: existing?.stock ?? 0,
            brand: existing?.brand ?? "",
            unitLabel: existing?.unitLabel ?? "PCS",
          },
          qty,
          {
            base_qty: line.base_qty,
            sales_uom_id: line.sales_uom_id ?? "",
            price_source: line.price_source ?? (kind === "partial" ? "partial" : "school_list"),
            stationery_school_list_id: line.stationery_school_list_id ?? schoolListId,
            school_list_item_id: line.school_list_item_id ?? line.list_item_id,
          },
          line.unit_price,
        );
      };

      for (const line of available) {
        pushLine(line, line.qty ?? 1, "available");
      }
      for (const line of partial) {
        const qty = line.max_qty ?? line.qty ?? 0;
        if (qty > 0) pushLine(line, qty, "partial");
        notes.push({
          kind: "partial",
          text: `${line.name ?? line.product_id}: partial — added ${qty}`,
        });
      }
      for (const u of unavailable) {
        notes.push({
          kind: "unavailable",
          text: `${u.name ?? u.product_id}: ${u.reason ?? "unavailable"}`,
        });
      }

      setListNotes(notes);
      if (unavailable.length) {
        toast.error(`${unavailable.length} item(s) unavailable`);
      } else if (partial.length) {
        toast.error(`${partial.length} item(s) only partially available`);
      } else if (available.length) {
        toast.success(`Added ${available.length} item(s) from school list`);
      } else {
        toast.error("No available items on this list");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not resolve school list");
    }
  };

  const schoolLists = listsQuery.data ?? [];

  return (
    <>
      <PosShell
        industry="stationery"
        title="Stationery & Library POS"
        subtitle="School season · khata · pens · geometry · A4 rim · UOM packs"
        receiptNote={
          [
            quoteCustomer ? `Dealer: ${quoteCustomer.name}` : null,
            schoolListId
              ? `List: ${schoolLists.find((l) => l.id === schoolListId)?.list_name ?? schoolListId}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ") || undefined
        }
        headerBadges={
          <>
            <Select value={brandFilter} onValueChange={setBrandFilter}>
              <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue placeholder="Brand" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All brands</SelectItem>
                {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            {(useApi || app.isFeatureEnabled("stationery.wholesale")) && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPickCustomer(true)}>
                {quoteCustomer ? quoteCustomer.name : "Dealer / customer"}
              </Button>
            )}
            {catalog.fromBackend && <Badge variant="secondary" className="text-[10px]">Live stock</Badge>}
          </>
        }
        cartLineExtra={(line) => (
          <div className="text-[10px] text-muted-foreground space-y-0.5">
            {line.extras?.unit ? (
              <div>{String(line.extras.brand ?? "")} · {String(line.extras.unit)}</div>
            ) : null}
            {line.extras?.conversion_factor != null && Number(line.extras.conversion_factor) !== 1 ? (
              <div>
                ×{String(line.extras.conversion_factor)} → base {String(line.extras.base_qty)}
                {line.extras?.price_source ? ` · ${String(line.extras.price_source)}` : ""}
              </div>
            ) : line.extras?.price_source ? (
              <div>{String(line.extras.price_source)}</div>
            ) : null}
            {line.extras?.stationery_school_list_id ? (
              <div className="flex items-center gap-1">
                <List className="h-3 w-3" /> School list
              </div>
            ) : null}
          </div>
        )}
        catalog={
          <div className="flex min-h-0 flex-1 flex-col">
            <form
              className="flex gap-2 border-b border-border bg-background px-4 py-2"
              onSubmit={(e) => {
                e.preventDefault();
                void handleBarcodeLookup();
              }}
            >
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search SKU, brand, category, or scan barcode (Enter to add)…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setBarcode(e.target.value);
                  }}
                  className="h-8 pl-8 pr-8 text-xs flex-1"
                />
                <Barcode className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
              </div>
              {app.isFeatureEnabled("stationery.barcode") && (
                <Button type="submit" size="sm" className="h-8" disabled={barcodeLookup.isPending || scanPending}>
                  Scan
                </Button>
              )}
            </form>
            {app.isFeatureEnabled("stationery.school_list") && useApi && (
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 bg-secondary/20">
                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                <Select value={schoolListId || "none"} onValueChange={(v) => setSchoolListId(v === "none" ? "" : v)}>
                  <SelectTrigger className="h-7 w-[200px] text-xs"><SelectValue placeholder="School list" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No school list</SelectItem>
                    {schoolLists.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.list_name} {l.class_or_grade ? `· ${l.class_or_grade}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={!schoolListId || cartResolve.isPending}
                  onClick={() => void applySchoolList()}
                >
                  Add list to cart
                </Button>
              </div>
            )}
            {listNotes.length > 0 && (
              <div className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive space-y-0.5">
                <div className="font-medium">School list stock issues</div>
                {listNotes.map((n) => (
                  <div key={`${n.kind}-${n.text}`}>{n.text}</div>
                ))}
              </div>
            )}
            <ProductGrid
              items={filtered}
              onAdd={(item) => openAdd(item as StationeryPosItem)}
              renderCard={(item) => {
                const p = item as StationeryPosItem;
                return (
                  <PosProductCard
                    badge={p.category || p.schoolClass || "Stationery"}
                    title={p.name}
                    subtitle={`${p.brand || "—"} · ${p.unitLabel ?? "PCS"} · stock ${p.stock}`}
                    price={fmtBDT(p.price)}
                    industry="stationery"
                    sku={p.sku}
                    imageUrl={(p.meta?.image_url as string) || (p.meta?.image as string)}
                    footer={
                      p.wholesalePrice != null && app.isFeatureEnabled("stationery.wholesale") ? (
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          Dealer {fmtBDT(p.wholesalePrice)}
                        </div>
                      ) : null
                    }
                  />
                );
              }}
            />
          </div>
        }
      />

      <CustomerPicker
        open={pickCustomer}
        onOpenChange={setPickCustomer}
        value={quoteCustomer}
        onSelect={(c) => {
          setQuoteCustomer(c);
          setPickCustomer(false);
        }}
      />

      <Dialog open={Boolean(pending)} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pending?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Quantity</Label>
              <Input
                type="number"
                step={pending?.profile?.fractional_qty_allowed ? "0.5" : "1"}
                value={enteredQty}
                onChange={(e) => setEnteredQty(e.target.value)}
              />
            </div>
            {catalog.fromBackend && pending?.profile && (
              <div>
                <Label>Selling UOM</Label>
                <Select
                  value={salesUomId || pending.profile.default_sales_uom_id || pending.profile.base_uom_id || ""}
                  onValueChange={setSalesUomId}
                >
                  <SelectTrigger><SelectValue placeholder="UOM" /></SelectTrigger>
                  <SelectContent>
                    {pending.profile.base_uom && (
                      <SelectItem value={pending.profile.base_uom.id}>
                        {pending.profile.base_uom.code} (base)
                      </SelectItem>
                    )}
                    {pending.profile.default_sales_uom &&
                      pending.profile.default_sales_uom.id !== pending.profile.base_uom?.id && (
                      <SelectItem value={pending.profile.default_sales_uom.id}>
                        {pending.profile.default_sales_uom.code}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
            {catalog.fromBackend && (
              <div className="rounded-md border p-3 text-xs space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Server quote (conversion · price)</span>
                  <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={() => void refreshQuote()} disabled={quoteMut.isPending}>
                    Refresh
                  </Button>
                </div>
                {quotePreview ? (
                  <>
                    <div>Conversion ×{quotePreview.conversion_factor} → base {quotePreview.base_qty}</div>
                    <div>Price {fmtBDT(quotePreview.unit_price)} · {quotePreview.price_source}</div>
                    <div className="font-medium">Line {fmtBDT(quotePreview.line_total)}</div>
                  </>
                ) : (
                  <div className="text-muted-foreground">Refresh to preview conversion and dealer price</div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>Cancel</Button>
            <Button onClick={() => void confirmAdd()} disabled={quoteMut.isPending}>Add to cart</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
