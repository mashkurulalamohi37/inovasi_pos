import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Barcode, Smartphone, Search} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/app-store";
import { mobileShopCatalog } from "@/lib/industry-mock";
import { fmtBDT } from "@/lib/pos-data";
import { shouldUseBackend } from "@/lib/demo-mode";
import { PosShell, ProductGrid, PosProductCard } from "./PosShell";
import { usePosCatalog, catalogToCartExtras, type PosCatalogItem } from "@/hooks/use-pos-catalog";
import { usePosBarcodeScan } from "@/hooks/use-pos-barcode";
import { validateMobileDevice } from "@/hooks/use-industry-data";
import { useMobileDevices } from "@/hooks/use-api-config";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";

type MobileItem = PosCatalogItem & {
  brand: string;
  model: string;
  warrantyMonths: number;
  serialized: boolean;
  inStock: number;
};

export function MobileShopPos() {
  const app = useApp();
  const useApi = shouldUseBackend();
  const availableDevices = useMobileDevices({ status: "available", sellable_only: true });
  const [deviceOpen, setDeviceOpen] = useState<MobileItem | null>(null);
  const [imei, setImei] = useState("");
  const [validating, setValidating] = useState(false);
  const [brandFilter, setBrandFilter] = useState("all");
  const [search, setSearch] = useState("");

  const demoItems = useMemo((): MobileItem[] => mobileShopCatalog.map((e) => ({
    id: e.sku,
    sku: e.sku,
    name: e.name,
    price: e.price,
    stock: 10,
    meta: {
      brand: e.brand,
      model: e.model,
      storage: e.storage,
      warranty_months: e.warrantyMonths ?? 12,
      serialized: e.serialized !== false && e.category !== "Accessory",
      category: e.category,
    },
    brand: e.brand,
    model: e.model,
    warrantyMonths: e.warrantyMonths ?? 12,
    serialized: e.serialized !== false && e.category !== "Accessory",
    inStock: 10,
  })), []);

  const catalog = usePosCatalog("mobile-shop", demoItems);

  const items = useMemo((): MobileItem[] => {
    const mapped = catalog.fromBackend
      ? catalog.items.map((p) => ({
          ...p,
          brand: String(p.meta?.brand ?? ""),
          model: String(p.meta?.model ?? ""),
          warrantyMonths: Number(p.meta?.warrantyMonths ?? p.meta?.warranty_months ?? 12),
          serialized: p.meta?.serialized === undefined ? true : Boolean(p.meta?.serialized),
          inStock: p.stock,
        }))
      : (catalog.items as MobileItem[]);
    if (brandFilter === "all" || !app.isFeatureEnabled("mobile.brand_filter")) return mapped;
    return mapped.filter((i) => i.brand.toLowerCase() === brandFilter.toLowerCase());
  }, [app, brandFilter, catalog.fromBackend, catalog.items]);

  const brands = useMemo(() => {
    const set = new Set(items.map((i) => i.brand).filter(Boolean));
    return Array.from(set).sort();
  }, [items]);

  const isSerialized = (e: MobileItem) =>
    e.serialized || Boolean(e.meta?.serialized) || (catalog.fromBackend && e.meta?.serialized !== false && e.meta?.category !== "accessory");

  const { barcode, setBarcode, handleScan, isPending: barcodePending } = usePosBarcodeScan({
    fromBackend: useApi && catalog.fromBackend,
    catalogItems: items,
    onAdd: (item) => {
      const e = items.find((x) => x.id === item.id || x.sku === item.sku) ?? {
        ...item,
        brand: String(item.meta?.brand ?? ""),
        model: String(item.meta?.model ?? ""),
        warrantyMonths: Number(item.meta?.warrantyMonths ?? 12),
        serialized: item.meta?.serialized === undefined ? true : Boolean(item.meta?.serialized),
        inStock: item.stock,
      } as MobileItem;
      if (isSerialized(e) && app.isFeatureEnabled("mobile.imei_required")) {
        setDeviceOpen(e);
        setImei("");
      } else {
        app.addToCart({
          sku: e.sku,
          name: e.name,
          meta: e.model,
          price: e.price,
          qty: 1,
          industry: "mobile-shop",
          extras: { ...catalogToCartExtras(e), brand: e.brand, model: e.model, warrantyMonths: e.warrantyMonths },
        });
      }
    },
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((m) => {
      if (brandFilter !== "all" && m.brand !== brandFilter) return false;
      if (!q) return true;
      return [m.name, m.sku, m.brand, m.model, m.meta?.model, m.barcode, m.meta?.barcode].some((x) =>
        String(x ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, search, brandFilter]);

  const handleMobileScan = async () => {
    const code = (barcode || search).trim();
    if (!code) return;
    setBarcode(code);
    const match = items.find(
      (i) =>
        (i.barcode && i.barcode.toLowerCase() === code.toLowerCase()) ||
        (i.meta?.barcode && String(i.meta.barcode).toLowerCase() === code.toLowerCase()) ||
        i.sku.toLowerCase() === code.toLowerCase()
    );
    if (match) {
      if (isSerialized(match) && app.isFeatureEnabled("mobile.imei_required")) {
        setDeviceOpen(match);
        setImei("");
      } else {
        app.addToCart({
          sku: match.sku,
          name: match.name,
          meta: match.model,
          price: match.price,
          qty: 1,
          industry: "mobile-shop",
          extras: { ...catalogToCartExtras(match), brand: match.brand, model: match.model, warrantyMonths: match.warrantyMonths },
        });
      }
      setBarcode("");
      setSearch("");
      return;
    }
    if (filtered.length === 1) {
      const single = filtered[0];
      if (isSerialized(single) && app.isFeatureEnabled("mobile.imei_required")) {
        setDeviceOpen(single);
        setImei("");
      } else {
        app.addToCart({
          sku: single.sku,
          name: single.name,
          meta: single.model,
          price: single.price,
          qty: 1,
          industry: "mobile-shop",
          extras: { ...catalogToCartExtras(single), brand: single.brand, model: single.model, warrantyMonths: single.warrantyMonths },
        });
      }
      setBarcode("");
      setSearch("");
      return;
    }
    await handleScan();
    setBarcode("");
    setSearch("");
  };

  const confirmAdd = async () => {
    if (!deviceOpen) return;
    if (isSerialized(deviceOpen) && app.isFeatureEnabled("mobile.imei_required") && !imei.trim()) {
      toast.error("IMEI / device selection required");
      return;
    }
    let deviceStockId: string | undefined;
    let imei1: string | undefined;
    let imei2: string | undefined;
    if (useApi && imei.trim()) {
      setValidating(true);
      try {
        const res = await validateMobileDevice(imei.trim(), deviceOpen.id);
        if (!res.valid || !res.available) {
          toast.error(res.detail || (res.valid ? "Device already sold or unavailable" : "IMEI/device not found"));
          return;
        }
        deviceStockId = res.serial_id;
        imei1 = res.imei_no ?? res.imei_1 ?? imei.trim();
        imei2 = res.imei_2 ?? undefined;
      } catch (e: unknown) {
        toast.error(String((e as { detail?: string }).detail ?? "Device validation failed"));
        return;
      } finally {
        setValidating(false);
      }
    }
    app.addToCart({
      sku: deviceOpen.sku,
      name: `${deviceOpen.brand} ${deviceOpen.name}`.trim() || deviceOpen.name,
      meta: deviceOpen.model,
      price: deviceOpen.price,
      qty: 1,
      industry: "mobile-shop",
      extras: {
        ...catalogToCartExtras(deviceOpen),
        brand: deviceOpen.brand,
        model: deviceOpen.model,
        serial: imei || "N/A",
        serial_imei: imei || "",
        serial_id: deviceStockId || "",
        device_stock_id: deviceStockId || "",
        imei: imei1 || imei || "",
        imei_1: imei1 || imei || "",
        imei_2: imei2 || "",
        warrantyMonths: deviceOpen.warrantyMonths,
        product_id: deviceOpen.id,
      },
    });
    setDeviceOpen(null);
    setImei("");
  };

  const productDeviceOptions = useMemo(() => {
    if (!deviceOpen || !useApi) return [];
    return (availableDevices.data ?? []).filter((s) => String(s.product_id) === deviceOpen.id);
  }, [availableDevices.data, deviceOpen, useApi]);

  return (
    <>
      <PosShell
        industry="mobile-shop"
        title="Mobile & Accessories POS"
        subtitle="Handsets · IMEI · accessories · warranty"
        receiptNote={app.isFeatureEnabled("mobile.bkash_note") ? "bKash / Nagad payment accepted" : "Warranty card on receipt"}
        headerBadges={
          app.isFeatureEnabled("mobile.trade_in") ? (
            <DisabledReasonButton
              label="Trade-in"
              reason="Open Mobile Shop → Trade-ins to assess and settle trade-ins"
              icon={<Smartphone className="h-3 w-3" />}
            />
          ) : null
        }
        cartLineExtra={(l) => l.extras ? (
          <div className="text-[10px] text-muted-foreground">
            {l.extras.imei_1 || l.extras.serial
              ? `IMEI ${String(l.extras.imei_1 || l.extras.serial)}`
              : "Accessory"}
            {l.extras.warrantyMonths ? ` · ${String(l.extras.warrantyMonths)}mo` : ""}
          </div>
        ) : null}
        onBeforeComplete={() => {
          const missing = app.cart.some((l) => {
            const e = items.find((x) => x.sku === l.sku);
            return e && isSerialized(e) && app.isFeatureEnabled("mobile.imei_required")
              && (!l.extras?.serial || l.extras.serial === "N/A");
          });
          if (missing) {
            toast.error("Select exact IMEI for all serialized devices");
            return false;
          }
          return true;
        }}
        catalog={
          <>
            <form
              className="mb-3 flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void handleMobileScan();
              }}
            >
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9 pr-9"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setBarcode(e.target.value);
                  }}
                  placeholder="Search model, brand, spec, or scan barcode / IMEI (Enter to add)…"
                />
                <Barcode className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
              </div>
              <Button type="submit" disabled={barcodePending}>Scan</Button>
              {app.isFeatureEnabled("mobile.brand_filter") && brands.length > 0 && (
                <Select value={brandFilter} onValueChange={setBrandFilter}>
                  <SelectTrigger className="w-36"><SelectValue placeholder="Brand" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All brands</SelectItem>
                    {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </form>
            <ProductGrid
              items={filtered}
              onAdd={(item) => {
                const e = item as MobileItem;
                if (isSerialized(e) && app.isFeatureEnabled("mobile.imei_required")) {
                  setDeviceOpen(e);
                  setImei("");
                } else {
                  app.addToCart({
                    sku: e.sku,
                    name: e.name,
                    meta: e.model,
                    price: e.price,
                    qty: 1,
                    industry: "mobile-shop",
                    extras: {
                      ...catalogToCartExtras(e),
                      brand: e.brand,
                      model: e.model,
                      warrantyMonths: e.warrantyMonths,
                    },
                  });
                }
              }}
              renderCard={(item) => {
                const e = item as MobileItem;
                return (
                  <PosProductCard
                    badge={e.brand || "Mobile"}
                    title={e.name}
                    subtitle={[e.model, e.meta?.storage ? String(e.meta.storage) : "", isSerialized(e) ? "IMEI" : "Accessory"]
                      .filter(Boolean).join(" · ")}
                    price={fmtBDT(e.price)}
                    industry="mobile-shop"
                    sku={e.sku}
                    imageUrl={(e.meta?.image_url as string) || (e.meta?.image as string)}
                  />
                );
              }}
            />
          </>
        }
      />

      <Dialog open={Boolean(deviceOpen)} onOpenChange={(o) => !o && setDeviceOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select device IMEI</DialogTitle>
          </DialogHeader>
          {deviceOpen && (
            <div className="space-y-3">
              <div className="text-sm">
                <Badge variant="secondary">{deviceOpen.brand}</Badge>{" "}
                {deviceOpen.name}
              </div>
              {useApi && productDeviceOptions.length > 0 && (
                <Select value={imei} onValueChange={setImei}>
                  <SelectTrigger><SelectValue placeholder="Available devices" /></SelectTrigger>
                  <SelectContent>
                    {productDeviceOptions.map((d) => (
                      <SelectItem key={String(d.id)} value={String(d.imei_1 || d.serial_no || d.serial_imei)}>
                        {String(d.imei_1 || d.serial_no)}
                        {d.imei_2 ? ` / ${String(d.imei_2)}` : ""}
                        {d.condition ? ` · ${String(d.condition)}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Input
                className="font-mono"
                placeholder="Or type / scan IMEI"
                value={imei}
                onChange={(e) => setImei(e.target.value)}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeviceOpen(null)}>Cancel</Button>
            <Button onClick={confirmAdd} disabled={validating}>
              {validating ? "Validating…" : "Add to cart"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
