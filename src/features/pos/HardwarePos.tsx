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
import { Barcode, Ruler, Search} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/app-store";
import { hardwareCatalog } from "@/lib/industry-mock";
import { shouldUseBackend } from "@/lib/demo-mode";
import { fmtBDT } from "@/lib/pos-data";
import { PosShell, ProductGrid, PosProductCard } from "./PosShell";
import { usePosCatalog, catalogToCartExtras, type PosCatalogItem } from "@/hooks/use-pos-catalog";
import {
  useHardwareConversions,
  useHardwareProfiles,
  useHardwareQuote,
  type HardwareProfile,
} from "@/hooks/use-api-config";
import { CustomerPicker, type CustomerSelection } from "@/features/sales/CustomerPicker";
import { usePosBarcodeScan } from "@/hooks/use-pos-barcode";

type HardwarePosItem = PosCatalogItem & {
  brand?: string;
  unitLabel?: string;
  profile?: HardwareProfile | null;
};

export function HardwarePos() {
  const app = useApp();
  const useApi = shouldUseBackend();
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("all");
  const [quoteCustomer, setQuoteCustomer] = useState<CustomerSelection | undefined>();
  const [pickCustomer, setPickCustomer] = useState(false);
  const [pending, setPending] = useState<HardwarePosItem | null>(null);
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

  const profilesQuery = useHardwareProfiles({ active_only: true }, useApi);
  const conversionsQuery = useHardwareConversions(pending?.id);
  const quoteMut = useHardwareQuote();

  const demoItems = useMemo((): HardwarePosItem[] => hardwareCatalog.map((row) => ({
    id: row.sku,
    sku: row.sku,
    name: row.name,
    price: row.price,
    stock: 50,
    barcode: row.barcode,
    meta: { brand: row.brand, unit: row.unit, category: row.category },
    brand: row.brand,
    unitLabel: row.unit,
  })), []);

  const catalog = usePosCatalog("hardware", demoItems);

  const items = useMemo((): HardwarePosItem[] => {
    if (catalog.fromBackend) {
      const profileByProduct = new Map((profilesQuery.data ?? []).map((p) => [p.product_id, p]));
      return catalog.items.map((p) => {
        const profile = profileByProduct.get(p.id) ?? null;
        return {
          ...p,
          brand: profile?.brand_name ?? String(p.meta?.brand ?? ""),
          unitLabel: profile?.default_sales_uom?.code ?? profile?.base_uom?.code ?? String(p.meta?.unit ?? "PCS"),
          profile,
        };
      });
    }
    return catalog.items as HardwarePosItem[];
  }, [catalog.fromBackend, catalog.items, profilesQuery.data]);

  const brands = useMemo(() => {
    const set = new Set(items.map((i) => i.brand).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((p) => {
      if (brandFilter !== "all" && p.brand !== brandFilter) return false;
      if (!q) return true;
      const spec = JSON.stringify(p.profile?.specification ?? {});
      return [p.name, p.sku, p.brand, p.unitLabel, spec].some((x) => String(x ?? "").toLowerCase().includes(q));
    });
  }, [items, search, brandFilter]);

  const openAdd = (item: HardwarePosItem) => {
    setPending(item);
    setEnteredQty("1");
    setSalesUomId(item.profile?.default_sales_uom_id ?? item.profile?.base_uom_id ?? "");
    setQuotePreview(null);
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
        const fromUom = (conversionsQuery.data ?? []).find(
          (c) => String(c.from_uom_id) === String(q.from_uom_id ?? salesUomId),
        );
        const fromCode = (fromUom?.from_uom as { code?: string } | undefined)?.code
          ?? pending.profile?.base_uom?.code
          ?? pending.unitLabel
          ?? "PCS";
        app.addToCart({
          sku: pending.sku,
          name: pending.name,
          meta: pending.brand,
          price: q.unit_price,
          qty,
          industry: "hardware",
          extras: {
            ...catalogToCartExtras(pending),
            productId: pending.id,
            brand: pending.brand ?? "",
            unit: fromCode,
            sales_uom_id: String(q.from_uom_id ?? ""),
            entered_qty: q.entered_qty,
            conversion_factor: q.conversion_factor,
            base_qty: q.base_qty,
            base_uom_id: String(q.base_uom_id ?? ""),
            price_source: q.price_source,
            measurement_mode: pending.profile?.measurement_mode ?? "quantity",
          },
        });
        setPending(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not add line");
      }
      return;
    }

    app.addToCart({
      sku: pending.sku,
      name: pending.name,
      meta: pending.brand,
      price: pending.price,
      qty,
      industry: "hardware",
      extras: {
        ...catalogToCartExtras(pending),
        brand: pending.brand ?? "",
        unit: pending.unitLabel ?? "Piece",
      },
    });
    setPending(null);
  };

  const { barcode, setBarcode, handleScan, isPending: scanPending } = usePosBarcodeScan({
    fromBackend: catalog.fromBackend,
    catalogItems: items,
    onAdd: (item) => openAdd(item as HardwarePosItem),
  });

  const handleHardwareScan = async () => {
    const code = (barcode || search).trim();
    if (!code) return;
    const match = items.find(
      (i) =>
        (i.barcode && i.barcode.toLowerCase() === code.toLowerCase()) ||
        (i.meta?.barcode && String(i.meta.barcode).toLowerCase() === code.toLowerCase()) ||
        i.sku.toLowerCase() === code.toLowerCase()
    );
    if (match) {
      openAdd(match as HardwarePosItem);
      setBarcode("");
      setSearch("");
      return;
    }
    if (filtered.length === 1) {
      openAdd(filtered[0] as HardwarePosItem);
      setBarcode("");
      setSearch("");
      return;
    }
    await handleScan();
    setBarcode("");
    setSearch("");
  };

  const uomOptions = useMemo(() => {
    if (!pending?.profile) return [];
    const opts: Array<{ id: string; label: string }> = [];
    const base = pending.profile.base_uom;
    if (base) opts.push({ id: base.id, label: `${base.code} (base)` });
    for (const c of conversionsQuery.data ?? []) {
      const from = c.from_uom as { id?: string; code?: string } | undefined;
      const id = String(c.from_uom_id ?? from?.id ?? "");
      if (!id || opts.some((o) => o.id === id)) continue;
      if (c.sales_enabled === false) continue;
      opts.push({ id, label: `${from?.code ?? id} → ×${c.conversion_factor}` });
    }
    return opts;
  }, [pending, conversionsQuery.data]);

  return (
    <>
      <PosShell
        industry="hardware"
        title="Hardware & Sanitary POS"
        subtitle="Piece · box · carton · length · contractor pricing"
        receiptNote={quoteCustomer ? `Quote customer: ${quoteCustomer.name}` : undefined}
        headerBadges={
          <>
            {app.isFeatureEnabled("hardware.brand") && (
              <Select value={brandFilter} onValueChange={setBrandFilter}>
                <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue placeholder="Brand" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All brands</SelectItem>
                  {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {useApi && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPickCustomer(true)}>
                {quoteCustomer ? quoteCustomer.name : "Contractor / customer"}
              </Button>
            )}
            {catalog.fromBackend && <Badge variant="secondary" className="text-[10px]">Live stock</Badge>}
          </>
        }
        cartLineExtra={(line) => (
          <div className="text-[10px] text-muted-foreground space-y-0.5">
            {line.extras?.unit ? <div>{String(line.extras.brand ?? "")} · {String(line.extras.unit)}</div> : null}
            {line.extras?.conversion_factor != null && Number(line.extras.conversion_factor) !== 1 ? (
              <div>
                ×{String(line.extras.conversion_factor)} → base {String(line.extras.base_qty)}
                {line.extras?.price_source ? ` · ${String(line.extras.price_source)}` : ""}
              </div>
            ) : line.extras?.price_source ? (
              <div>{String(line.extras.price_source)}</div>
            ) : null}
          </div>
        )}
        catalog={
          <div className="flex min-h-0 flex-1 flex-col">
            <form
              className="flex gap-2 border-b border-border bg-background px-4 py-2"
              onSubmit={(e) => {
                e.preventDefault();
                void handleHardwareScan();
              }}
            >
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search SKU, brand, specification, or scan barcode (Enter to add)…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setBarcode(e.target.value);
                  }}
                  className="h-8 pl-8 pr-8 text-xs flex-1"
                />
                <Barcode className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
              </div>
              {app.isFeatureEnabled("hardware.barcode") && (
                <Button type="submit" size="sm" variant="outline" className="h-8" disabled={scanPending}>
                  Scan
                </Button>
              )}
            </form>
            <ProductGrid
              items={filtered}
              onAdd={(item) => openAdd(item as HardwarePosItem)}
              renderCard={(item) => {
                const p = item as HardwarePosItem;
                return (
                  <PosProductCard
                    badge={p.brand || "Hardware"}
                    title={p.name}
                    subtitle={`${p.sku} · ${p.unitLabel ?? "PCS"} · stock ${p.stock}`}
                    price={fmtBDT(p.price)}
                    industry="hardware"
                    sku={p.sku}
                    imageUrl={(p.meta?.image_url as string) || (p.meta?.image as string)}
                    footer={
                      p.profile?.measurement_mode && p.profile.measurement_mode !== "quantity" ? (
                        <div className="mt-1 text-[10px] text-muted-foreground flex items-center gap-1">
                          <Ruler className="h-3 w-3" /> {p.profile.measurement_mode}
                          {p.profile.fractional_qty_allowed ? " · fractional" : ""}
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
            {catalog.fromBackend && uomOptions.length > 0 && (
              <div>
                <Label>Selling UOM</Label>
                <Select value={salesUomId || uomOptions[0]?.id} onValueChange={setSalesUomId}>
                  <SelectTrigger><SelectValue placeholder="UOM" /></SelectTrigger>
                  <SelectContent>
                    {uomOptions.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {catalog.fromBackend && (
              <div className="rounded-md border p-3 text-xs space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Server quote (authoritative)</span>
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
                  <div className="text-muted-foreground">Refresh to preview conversion and price source</div>
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
