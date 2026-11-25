import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Scale, Beef } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/app-store";
import { beefCatalog, butchers as demoButchers, cutTypes as demoCutTypes } from "@/lib/industry-mock";
import { fmtBDT } from "@/lib/pos-data";
import { PosShell, ProductGrid, PosProductCard } from "./PosShell";
import { usePosCatalog, catalogToCartExtras, type PosCatalogItem } from "@/hooks/use-pos-catalog";
import { useBeefBatches, useBeefButchers, useBeefCuts } from "@/hooks/use-industry-data";

export function BeefShopPos() {
  const app = useApp();
  const [tab, setTab] = useState("All");
  const [addOpen, setAddOpen] = useState<PosCatalogItem | null>(null);
  const [weight, setWeight] = useState("1.000");
  const [tare, setTare] = useState("0.050");
  const [cut, setCut] = useState(demoCutTypes[0]);
  const [butcher, setButcher] = useState(demoButchers[0]);
  const [butcherId, setButcherId] = useState("");
  const [wastage, setWastage] = useState("0");

  const demoItems = useMemo(() => beefCatalog.map(b => ({
    id: b.sku,
    sku: b.sku,
    name: b.name,
    price: b.ratePerKg,
    stock: 12,
    meta: {
      category: b.category,
      batchNo: b.batchNo,
      expiryDate: b.expiryDate,
      halalCert: b.halalCert ?? "",
      ratePerKg: b.ratePerKg,
    },
  })), []);

  const catalog = usePosCatalog("beef-shop", demoItems);
  const cutsQuery = useBeefCuts();
  const batchesQuery = useBeefBatches();
  const butchersQuery = useBeefButchers();

  const cutOptions = catalog.fromBackend && cutsQuery.data?.length
    ? cutsQuery.data.map(c => c.name)
    : demoCutTypes;
  const butcherOptions = catalog.fromBackend && butchersQuery.data?.length
    ? butchersQuery.data
    : demoButchers.map(name => ({ id: name, name }));

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(catalog.items.map(b => String(b.meta?.category ?? "Beef"))))],
    [catalog.items],
  );
  const filtered = useMemo(
    () => catalog.items.filter(b => tab === "All" || String(b.meta?.category) === tab),
    [catalog.items, tab],
  );

  const openAdd = (item: PosCatalogItem) => {
    setAddOpen(item);
    setCut(cutOptions[0] ?? demoCutTypes[0]);
    if (catalog.fromBackend && butchersQuery.data?.length) {
      setButcherId(butchersQuery.data[0].id);
      setButcher(butchersQuery.data[0].name);
    } else {
      setButcher(demoButchers[0]);
      setButcherId("");
    }
  };

  const readWeight = () => {
    const mock = (Math.random() * 2 + 0.5).toFixed(3);
    setWeight(mock);
    toast.success(`Scale: ${mock} kg`);
  };

  const resolveBatchId = (item: PosCatalogItem) => {
    const batchNo = String(item.meta?.batchNo ?? "");
    const match = batchesQuery.data?.find(b => b.batch_code === batchNo || b.id === item.meta?.batch_id);
    return match?.id ?? (item.meta?.batch_id as string | undefined);
  };

  const confirmAdd = () => {
    if (!addOpen) return;
    const net = Math.max(0, Number(weight) - Number(tare) - Number(wastage));
    const ratePerKg = Number(addOpen.meta?.ratePerKg ?? addOpen.price);
    const amount = Math.round(net * ratePerKg);
    const batchNo = String(addOpen.meta?.batchNo ?? "");
    app.addToCart({
      sku: addOpen.sku,
      name: addOpen.name,
      meta: String(addOpen.meta?.category ?? ""),
      price: ratePerKg,
      qty: net,
      industry: "beef-shop",
      extras: {
        ...catalogToCartExtras(addOpen),
        grossWeight: Number(weight),
        tare: Number(tare),
        netWeight: net,
        cutType: cut,
        butcher,
        ...(butcherId ? { butcher_id: butcherId } : {}),
        batch: batchNo,
        ...(resolveBatchId(addOpen) ? { batch_id: resolveBatchId(addOpen) } : {}),
        expiry: String(addOpen.meta?.expiryDate ?? ""),
        wastage: Number(wastage),
        amount,
        ratePerKg,
        halalCert: String(addOpen.meta?.halalCert ?? ""),
      },
    });
    toast.success(`${addOpen.name} · ${net.toFixed(3)} kg`);
    setAddOpen(null);
  };

  return (
    <>
      <PosShell
        industry="beef-shop"
        title="Beef Shop POS"
        subtitle="Weight · cut · batch · butcher · cold storage"
        qtyStep={0.1}
        receiptNote="Meat sale · weight & batch on receipt"
        headerBadges={
          <>
            {app.isFeatureEnabled("beef.price_per_kg") && <Badge variant="secondary">Rate/kg</Badge>}
            {app.isFeatureEnabled("beef.cold_storage") && <Badge variant="secondary">Cold storage</Badge>}
          </>
        }
        cartLineExtra={l => l.extras ? (
          <div className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
            <div>{String(l.extras.netWeight)} kg net · {String(l.extras.cutType)}</div>
            <div>Butcher {String(l.extras.butcher)} · Batch {String(l.extras.batch)}</div>
          </div>
        ) : null}
        catalog={
          <>
            <div className="flex flex-wrap gap-1 border-b border-border px-4 py-2">
              {categories.map(c => (
                <Button key={c} size="sm" variant={tab === c ? "default" : "outline"} onClick={() => setTab(c)}>{c}</Button>
              ))}
            </div>
            <ProductGrid
              items={filtered}
              onAdd={item => openAdd(item as PosCatalogItem)}
              renderCard={item => {
                const b = item as PosCatalogItem;
                const ratePerKg = Number(b.meta?.ratePerKg ?? b.price);
                return (
                  <PosProductCard
                    badge={String(b.meta?.category ?? "Beef")}
                    title={b.name}
                    subtitle={`Batch ${String(b.meta?.batchNo ?? "—")} · exp ${String(b.meta?.expiryDate ?? "—")}`}
                    price={`${fmtBDT(ratePerKg)}/kg`}
                    industry="beef-shop"
                    sku={b.sku}
                    imageUrl={(b.meta?.image_url as string) || (b.meta?.image as string)}
                    footer={<div className="mt-1 text-[10px] text-warning">Exp {String(b.meta?.expiryDate ?? "—")}</div>}
                  />
                );
              }}
            />
          </>
        }
      />

      <Dialog open={!!addOpen} onOpenChange={v => !v && setAddOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Beef className="h-5 w-5" /> {addOpen?.name}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Rate/kg</Label><Input readOnly value={addOpen ? fmtBDT(Number(addOpen.meta?.ratePerKg ?? addOpen.price)) : ""} /></div>
            <div><Label>Batch</Label><Input readOnly value={String(addOpen?.meta?.batchNo ?? "")} /></div>
            {app.isFeatureEnabled("beef.weight_scale") && (
              <div className="sm:col-span-2 flex gap-2">
                <div className="flex-1"><Label>Gross weight (kg)</Label><Input type="number" step="0.001" value={weight} onChange={e => setWeight(e.target.value)} /></div>
                <Button type="button" className="mt-6 gap-1" onClick={readWeight}><Scale className="h-4 w-4" /> Read Weight</Button>
              </div>
            )}
            {app.isFeatureEnabled("beef.tare_weight") && (
              <div><Label>Tare (kg)</Label><Input type="number" step="0.001" value={tare} onChange={e => setTare(e.target.value)} /></div>
            )}
            {app.isFeatureEnabled("beef.wastage") && (
              <div><Label>Wastage/trim (kg)</Label><Input type="number" step="0.001" value={wastage} onChange={e => setWastage(e.target.value)} /></div>
            )}
            {app.isFeatureEnabled("beef.cut_wise") && (
              <div><Label>Cut type</Label>
                <Select value={cut} onValueChange={setCut}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{cutOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {app.isFeatureEnabled("beef.butcher") && (
              <div><Label>Butcher</Label>
                <Select
                  value={catalog.fromBackend ? butcherId || butcher : butcher}
                  onValueChange={v => {
                    if (catalog.fromBackend && butchersQuery.data?.length) {
                      const row = butchersQuery.data.find(b => b.id === v);
                      setButcherId(v);
                      setButcher(row?.name ?? v);
                    } else {
                      setButcher(v);
                    }
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {butcherOptions.map(b => (
                      <SelectItem key={typeof b === "string" ? b : b.id} value={typeof b === "string" ? b : b.id}>
                        {typeof b === "string" ? b : b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
