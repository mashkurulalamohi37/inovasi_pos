import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Scale } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/app-store";
import { riceMillCatalog } from "@/lib/industry-mock";
import { fmtBDT } from "@/lib/pos-data";
import { PosShell, ProductGrid, PosProductCard } from "./PosShell";
import { usePosCatalog, catalogToCartExtras, type PosCatalogItem } from "@/hooks/use-pos-catalog";

export function RiceMillPos() {
  const app = useApp();
  const [tab, setTab] = useState("All");
  const [addOpen, setAddOpen] = useState<PosCatalogItem | null>(null);
  const [weight, setWeight] = useState("5.000");
  const [tare, setTare] = useState("0.000");

  const demoItems = useMemo(() => riceMillCatalog.map(r => ({
    id: r.sku,
    sku: r.sku,
    name: r.name,
    price: r.ratePerKg,
    stock: 500,
    meta: {
      variety: r.variety,
      ratePerKg: r.ratePerKg,
      grade: r.grade,
      bagSizeKg: r.bagSizeKg,
    },
  })), []);

  const catalog = usePosCatalog("rice-mill", demoItems);
  const varieties = useMemo(
    () => ["All", ...Array.from(new Set(catalog.items.map(i => String(i.meta?.variety ?? ""))))],
    [catalog.items],
  );
  const filtered = useMemo(
    () => catalog.items.filter(i => tab === "All" || String(i.meta?.variety) === tab),
    [catalog.items, tab],
  );

  const applyBagTare = (item: PosCatalogItem) => {
    const bagKg = Number(item.meta?.bagSizeKg ?? 0);
    if (bagKg > 0 && app.isFeatureEnabled("rice.tare_bag")) {
      setTare(String(bagKg));
      toast.info(`Bag tare ${bagKg} kg applied`);
    } else {
      setTare("0.000");
    }
  };

  const openAdd = (item: PosCatalogItem) => {
    setAddOpen(item);
    setWeight("5.000");
    applyBagTare(item);
  };

  const readScale = () => {
    const mock = (Math.random() * 20 + 2).toFixed(3);
    setWeight(mock);
    toast.success(`Scale: ${mock} kg`);
  };

  const confirmAdd = () => {
    if (!addOpen) return;
    const net = Math.max(0, Number(weight) - Number(tare));
    const ratePerKg = Number(addOpen.meta?.ratePerKg ?? addOpen.price);
    const amount = Math.round(net * ratePerKg);
    app.addToCart({
      sku: addOpen.sku,
      name: addOpen.name,
      meta: String(addOpen.meta?.variety ?? ""),
      price: ratePerKg,
      qty: net,
      industry: "rice-mill",
      extras: {
        ...catalogToCartExtras(addOpen),
        grossWeight: Number(weight),
        tare: Number(tare),
        netWeight: net,
        ratePerKg,
        amount,
        variety: String(addOpen.meta?.variety ?? ""),
        grade: String(addOpen.meta?.grade ?? ""),
      },
    });
    toast.success(`${addOpen.name} · ${net.toFixed(3)} kg · ${fmtBDT(amount)}`);
    setAddOpen(null);
  };

  return (
    <>
      <PosShell
        industry="rice-mill"
        title="Rice & Atta Mill POS"
        subtitle="Miniket · Nazirshail · atta by kg · scale & bag tare"
        qtyStep={0.5}
        receiptNote="Net weight & rate/kg on receipt"
        headerBadges={
          <>
            {app.isFeatureEnabled("rice.price_per_kg") && <Badge variant="secondary">Rate/kg</Badge>}
            {app.isFeatureEnabled("rice.attamill") && <Badge variant="secondary">Atta / maida</Badge>}
          </>
        }
        cartLineExtra={l => l.extras?.netWeight != null ? (
          <div className="text-[10px] text-muted-foreground">
            {String(l.extras.variety ?? "")} · {Number(l.extras.netWeight).toFixed(3)} kg @ {fmtBDT(Number(l.extras.ratePerKg))}/kg
          </div>
        ) : null}
        catalog={
          <>
            <div className="flex flex-wrap gap-2 border-b border-border px-4 py-3">
              {varieties.map(v => (
                <Button key={v} size="sm" variant={tab === v ? "default" : "outline"} className="h-8 text-xs" onClick={() => setTab(v)}>
                  {v}
                </Button>
              ))}
            </div>
            <ProductGrid
              items={filtered}
              onAdd={item => openAdd(item as PosCatalogItem)}
              renderCard={item => {
                const r = item as PosCatalogItem;
                return (
                  <PosProductCard
                    badge={String(r.meta?.variety ?? "Rice")}
                    title={r.name}
                    subtitle={`${fmtBDT(Number(r.meta?.ratePerKg ?? r.price))}/kg · ${String(r.meta?.grade ?? "")}`}
                    price={`${fmtBDT(Number(r.meta?.ratePerKg ?? r.price))}/kg`}
                    industry="rice-mill"
                    sku={r.sku}
                    imageUrl={(r.meta?.image_url as string) || (r.meta?.image as string)}
                  />
                );
              }}
            />
          </>
        }
      />

      <Dialog open={!!addOpen} onOpenChange={v => !v && setAddOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Weigh · {addOpen?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Gross weight (kg)</Label>
                <Input value={weight} onChange={e => setWeight(e.target.value)} className="font-mono" />
              </div>
              <div>
                <Label>Tare / bag (kg)</Label>
                <Input value={tare} onChange={e => setTare(e.target.value)} className="font-mono" />
              </div>
            </div>
            {app.isFeatureEnabled("rice.weight_scale") && (
              <Button variant="outline" className="w-full gap-2" onClick={readScale}>
                <Scale className="h-4 w-4" /> Read scale
              </Button>
            )}
            <div className="rounded-lg bg-secondary p-3 text-sm">
              Net: <strong>{Math.max(0, Number(weight) - Number(tare)).toFixed(3)} kg</strong>
              {" · "}
              Amount: <strong>{fmtBDT(Math.round(Math.max(0, Number(weight) - Number(tare)) * Number(addOpen?.meta?.ratePerKg ?? addOpen?.price ?? 0)))}</strong>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(null)}>Cancel</Button>
            <Button onClick={confirmAdd}>Add to cart</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
