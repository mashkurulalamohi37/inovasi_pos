import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HardHat, Ruler, Truck, Barcode, Search} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/app-store";
import { buildingMaterialsCatalog } from "@/lib/industry-mock";
import { shouldUseBackend } from "@/lib/demo-mode";
import { fmtBDT } from "@/lib/pos-data";
import { PosShell, ProductGrid, PosProductCard } from "./PosShell";
import { usePosCatalog, catalogToCartExtras, type PosCatalogItem } from "@/hooks/use-pos-catalog";
import {
  useBuildingProfiles,
  useBuildingQuote,
  useBuildingSites,
  type BuildingProfile,
} from "@/hooks/use-api-config";
import {
  useConfirmBuildingOrder,
  useCreateBuildingOrder,
  useUpdateBuildingOrder,
} from "@/hooks/use-industry-backoffice";
import { CustomerPicker, type CustomerSelection } from "@/features/sales/CustomerPicker";
import { ConfirmActionDialog } from "@/components/pulse/ConfirmActionDialog";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";

type BuildingPosItem = PosCatalogItem & {
  material?: string;
  grade?: string;
  unitLabel?: string;
  profile?: BuildingProfile | null;
};

type OrderDeskLine = {
  product_id: string;
  sku: string;
  name: string;
  entered_qty: number;
  sales_uom_id?: string;
  unit_price: number;
  line_total: number;
  conversion_factor: number;
  base_qty: number;
  price_source?: string;
};

export function BuildingMaterialsPos() {
  const app = useApp();
  const useApi = shouldUseBackend();
  const [mode, setMode] = useState<"counter" | "order">("counter");
  const [search, setSearch] = useState("");
  const [materialFilter, setMaterialFilter] = useState("all");
  const [contractor, setContractor] = useState<CustomerSelection | undefined>();
  const [pickContractor, setPickContractor] = useState(false);
  const [siteId, setSiteId] = useState("");
  const [pending, setPending] = useState<BuildingPosItem | null>(null);
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
  const [orderLines, setOrderLines] = useState<OrderDeskLine[]>([]);
  const [confirmOrderOpen, setConfirmOrderOpen] = useState(false);
  const [draftOrderId, setDraftOrderId] = useState<string | null>(null);

  const profilesQuery = useBuildingProfiles({ active_only: true }, useApi);
  const sitesQuery = useBuildingSites(
    contractor?.id ? { customer_id: contractor.id, active_only: true } : undefined,
  );
  const quoteMut = useBuildingQuote();
  const createOrder = useCreateBuildingOrder();
  const updateOrder = useUpdateBuildingOrder();
  const confirmOrder = useConfirmBuildingOrder();

  const demoItems = useMemo((): BuildingPosItem[] => buildingMaterialsCatalog.map((row: any) => ({
    id: row.sku,
    sku: row.sku,
    name: row.name,
    price: row.price,
    stock: 50,
    barcode: row.barcode,
    meta: { material: row.material, brand: row.brand, grade: row.grade, unit: row.unit },
    material: row.material,
    grade: row.grade,
    unitLabel: row.unit,
  })), []);

  const catalog = usePosCatalog("building-materials", demoItems);

  const items = useMemo((): BuildingPosItem[] => {
    if (catalog.fromBackend) {
      const profileByProduct = new Map((profilesQuery.data ?? []).map((p) => [p.product_id, p]));
      return catalog.items.map((p) => {
        const profile = profileByProduct.get(p.id) ?? null;
        return {
          ...p,
          material: profile?.material_type ?? String(p.meta?.material ?? ""),
          grade: profile?.grade ?? String(p.meta?.grade ?? ""),
          unitLabel: profile?.default_sales_uom?.code ?? profile?.base_uom?.code ?? String(p.meta?.unit ?? "BAG"),
          profile,
        };
      });
    }
    return catalog.items as BuildingPosItem[];
  }, [catalog.fromBackend, catalog.items, profilesQuery.data]);

  const materials = useMemo(() => {
    const set = new Set(items.map((i) => i.material).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((p) => {
      if (materialFilter !== "all" && p.material !== materialFilter) return false;
      if (!q) return true;
      return [p.name, p.sku, p.material, p.grade, p.unitLabel].some((x) => String(x ?? "").toLowerCase().includes(q));
    });
  }, [items, search, materialFilter]);

  const sites = sitesQuery.data ?? [];
  const siteLabel = sites.find((s) => s.id === siteId)?.site_name ?? "";

  const openAdd = (item: BuildingPosItem) => {
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
        customer_id: contractor?.id,
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

  const confirmAddToCart = async () => {
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
          customer_id: contractor?.id,
        });
        app.addToCart({
          sku: pending.sku,
          name: pending.name,
          meta: pending.material,
          price: q.unit_price,
          qty,
          industry: "building-materials",
          extras: {
            ...catalogToCartExtras(pending),
            productId: pending.id,
            material: pending.material ?? "",
            grade: pending.grade ?? "",
            unit: pending.profile?.default_sales_uom?.code ?? pending.unitLabel ?? "BAG",
            sales_uom_id: String(q.from_uom_id ?? ""),
            entered_qty: q.entered_qty,
            conversion_factor: q.conversion_factor,
            base_qty: q.base_qty,
            base_uom_id: String(q.base_uom_id ?? ""),
            price_source: q.price_source,
            site_id: siteId || "",
            site_name: siteLabel || "",
            contractor_id: contractor?.id ?? "",
            contractor_name: contractor?.name ?? "",
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
      meta: pending.material,
      price: pending.price,
      qty,
      industry: "building-materials",
      extras: {
        ...catalogToCartExtras(pending),
        material: pending.material ?? "",
        grade: pending.grade ?? "",
        unit: pending.unitLabel ?? "Bag",
      },
    });
    setPending(null);
  };

  const addToOrderDesk = async () => {
    if (!pending) return;
    const qty = Number(enteredQty);
    if (!qty || qty <= 0) {
      toast.error("Enter a valid quantity");
      return;
    }
    if (!catalog.fromBackend) {
      setOrderLines((prev) => [
        ...prev,
        {
          product_id: pending.id,
          sku: pending.sku,
          name: pending.name,
          entered_qty: qty,
          unit_price: pending.price,
          line_total: pending.price * qty,
          conversion_factor: 1,
          base_qty: qty,
        },
      ]);
      setPending(null);
      return;
    }
    try {
      const q = await quoteMut.mutateAsync({
        product_id: pending.id,
        entered_qty: qty,
        sales_uom_id: salesUomId || undefined,
        customer_id: contractor?.id,
      });
      setOrderLines((prev) => [
        ...prev,
        {
          product_id: pending.id,
          sku: pending.sku,
          name: pending.name,
          entered_qty: qty,
          sales_uom_id: String(q.from_uom_id ?? salesUomId ?? ""),
          unit_price: q.unit_price,
          line_total: q.line_total,
          conversion_factor: q.conversion_factor,
          base_qty: q.base_qty,
          price_source: q.price_source,
        },
      ]);
      setPending(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add order line");
    }
  };

  const saveDraftOrder = async () => {
    if (!catalog.fromBackend) {
      toast.error("Backend required for site orders");
      return;
    }
    if (orderLines.length === 0) {
      toast.error("Add at least one line");
      return;
    }
    try {
      const body = {
        customer_id: contractor?.id,
        site_id: siteId || undefined,
        lines: orderLines.map((l) => ({
          product_id: l.product_id,
          entered_qty: l.entered_qty,
          sales_uom_id: l.sales_uom_id,
        })),
      };
      if (draftOrderId) {
        await updateOrder.mutateAsync({ id: draftOrderId, body });
      } else {
        const saved = await createOrder.mutateAsync(body);
        const id = String((saved as { id?: string }).id ?? "");
        if (id) setDraftOrderId(id);
      }
      toast.success("Draft order saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const handleConfirmOrder = async () => {
    if (!catalog.fromBackend) return;
    try {
      let orderId = draftOrderId;
      if (!orderId) {
        const created = await createOrder.mutateAsync({
          customer_id: contractor?.id,
          site_id: siteId || undefined,
          lines: orderLines.map((l) => ({
            product_id: l.product_id,
            entered_qty: l.entered_qty,
            sales_uom_id: l.sales_uom_id,
          })),
        });
        orderId = String((created as { id: string }).id);
      }
      await confirmOrder.mutateAsync({
        id: orderId,
        body: { allow_due: true },
      });
      toast.success("Order confirmed — schedule delivery from back office");
      setOrderLines([]);
      setDraftOrderId(null);
      setConfirmOrderOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Confirm failed");
    }
  };

  const orderDeskTotal = orderLines.reduce((s, l) => s + l.line_total, 0);

  return (
    <>
      <PosShell
        industry="building-materials"
        title="Building Materials POS"
        subtitle="Counter sale · contractor orders · site delivery"
        receiptNote={
          contractor
            ? `Contractor: ${contractor.name}${siteLabel ? ` · Site: ${siteLabel}` : ""}`
            : undefined
        }
        headerBadges={
          <>
            <Tabs value={mode} onValueChange={(v) => setMode(v as "counter" | "order")}>
              <TabsList className="h-7">
                <TabsTrigger value="counter" className="text-xs h-6">Counter</TabsTrigger>
                <TabsTrigger value="order" className="text-xs h-6">Order desk</TabsTrigger>
              </TabsList>
            </Tabs>
            {app.isFeatureEnabled("building.weight_volume") && (
              <Select value={materialFilter} onValueChange={setMaterialFilter}>
                <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue placeholder="Material" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All materials</SelectItem>
                  {materials.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {useApi && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPickContractor(true)}>
                {contractor ? contractor.name : "Contractor"}
              </Button>
            )}
            {useApi && contractor && (
              <Select value={siteId || "none"} onValueChange={(v) => setSiteId(v === "none" ? "" : v)}>
                <SelectTrigger className="h-7 w-[140px] text-xs"><SelectValue placeholder="Site" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No site</SelectItem>
                  {sites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.site_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {catalog.fromBackend && <Badge variant="secondary" className="text-[10px]">Live stock</Badge>}
            {useApi && (
              <Button size="sm" variant="ghost" className="h-7 text-xs" asChild>
                <Link to="/app/building-materials/delivery"><Truck className="h-3 w-3 mr-1" /> Deliveries</Link>
              </Button>
            )}
          </>
        }
        cartLineExtra={(line) => (
          <div className="text-[10px] text-muted-foreground space-y-0.5">
            {line.extras?.unit ? (
              <div>{String(line.extras.material ?? "")} · {String(line.extras.unit)} · {String(line.extras.grade ?? "")}</div>
            ) : null}
            {line.extras?.conversion_factor != null && Number(line.extras.conversion_factor) !== 1 ? (
              <div>×{String(line.extras.conversion_factor)} → base {String(line.extras.base_qty)}</div>
            ) : null}
            {line.extras?.site_name ? <div>Site: {String(line.extras.site_name)}</div> : null}
          </div>
        )}
        catalog={
          mode === "counter" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <form
                className="flex gap-2 border-b border-border bg-background px-4 py-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const code = search.trim();
                  if (!code) return;
                  const match = items.find(
                    (i) =>
                      (i.barcode && i.barcode.toLowerCase() === code.toLowerCase()) ||
                      (i.meta?.barcode && String(i.meta.barcode).toLowerCase() === code.toLowerCase()) ||
                      i.sku.toLowerCase() === code.toLowerCase()
                  );
                  if (match) {
                    openAdd(match as BuildingPosItem);
                    setSearch("");
                    return;
                  }
                  if (filtered.length === 1) {
                    openAdd(filtered[0] as BuildingPosItem);
                    setSearch("");
                  }
                }}
              >
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search cement, rod, sand, tile, or scan barcode (Enter to add)…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-8 pl-8 pr-8 text-xs flex-1"
                  />
                  <Barcode className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
                </div>
              </form>
              <ProductGrid
                items={filtered}
                onAdd={(item) => openAdd(item as BuildingPosItem)}
                renderCard={(item) => {
                  const p = item as BuildingPosItem;
                  return (
                    <PosProductCard
                      badge={p.material || "Material"}
                      title={p.name}
                      subtitle={`${p.sku} · ${p.unitLabel ?? "BAG"} · stock ${p.stock}`}
                      price={fmtBDT(p.price)}
                      industry="building-materials"
                      sku={p.sku}
                      imageUrl={(p.meta?.image_url as string) || (p.meta?.image as string)}
                      footer={
                        p.profile?.measurement_mode ? (
                          <div className="mt-1 text-[10px] text-muted-foreground flex items-center gap-1">
                            <Ruler className="h-3 w-3" /> {p.profile.measurement_mode}
                          </div>
                        ) : null
                      }
                    />
                  );
                }}
              />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col p-4 gap-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Search materials…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 flex-1"
                />
                <Button size="sm" variant="outline" onClick={() => void saveDraftOrder()} disabled={createOrder.isPending || orderLines.length === 0}>
                  Save draft
                </Button>
                {catalog.fromBackend ? (
                  <Button size="sm" onClick={() => setConfirmOrderOpen(true)} disabled={orderLines.length === 0}>
                    Confirm order
                  </Button>
                ) : (
                  <DisabledReasonButton label="Confirm" reason="Backend required to confirm site orders" />
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 overflow-auto flex-1">
                {filtered.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="rounded-lg border p-3 text-left hover:bg-secondary/40"
                    onClick={() => openAdd(p)}
                  >
                    <div className="text-xs text-muted-foreground">{p.material} · {p.unitLabel}</div>
                    <div className="font-medium text-sm">{p.name}</div>
                    <div className="text-xs mt-1">{fmtBDT(p.price)}</div>
                  </button>
                ))}
              </div>
              <div className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <HardHat className="h-4 w-4" /> Order lines ({orderLines.length})
                </div>
                {orderLines.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Tap a product to add lines for site delivery.</p>
                ) : (
                  <ul className="text-xs space-y-1">
                    {orderLines.map((l, i) => (
                      <li key={`${l.product_id}-${i}`} className="flex justify-between">
                        <span>{l.name} × {l.entered_qty} (base {l.base_qty})</span>
                        <span>{fmtBDT(l.line_total)}</span>
                      </li>
                    ))}
                    <li className="flex justify-between font-medium pt-1 border-t">
                      <span>Total</span>
                      <span>{fmtBDT(orderDeskTotal)}</span>
                    </li>
                  </ul>
                )}
              </div>
            </div>
          )
        }
      />

      <CustomerPicker
        open={pickContractor}
        onOpenChange={setPickContractor}
        value={contractor}
        onSelect={(c) => {
          setContractor(c);
          setSiteId("");
          setPickContractor(false);
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
                  <span className="text-muted-foreground">Conversion preview</span>
                  <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={() => void refreshQuote()} disabled={quoteMut.isPending}>
                    Refresh
                  </Button>
                </div>
                {quotePreview ? (
                  <>
                    <div>×{quotePreview.conversion_factor} → base {quotePreview.base_qty}</div>
                    <div>Price {fmtBDT(quotePreview.unit_price)} · {quotePreview.price_source}</div>
                    <div className="font-medium">Line {fmtBDT(quotePreview.line_total)}</div>
                  </>
                ) : (
                  <div className="text-muted-foreground">Refresh to preview UOM conversion and contractor price</div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>Cancel</Button>
            {mode === "counter" ? (
              <Button onClick={() => void confirmAddToCart()} disabled={quoteMut.isPending}>Add to cart</Button>
            ) : (
              <Button onClick={() => void addToOrderDesk()} disabled={quoteMut.isPending}>Add to order</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={confirmOrderOpen}
        onOpenChange={setConfirmOrderOpen}
        title="Confirm building order"
        description={`Confirm ${orderLines.length} line(s) for ${contractor?.name ?? "walk-in"}${siteLabel ? ` at ${siteLabel}` : ""}? Invoice will be created; stock posts on dispatch.`}
        confirmLabel="Confirm order"
        onConfirm={() => handleConfirmOrder()}
        isPending={createOrder.isPending || confirmOrder.isPending}
      />
    </>
  );
}
