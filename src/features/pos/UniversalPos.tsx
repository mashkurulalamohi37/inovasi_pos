import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, ShoppingBag, RefreshCw, Camera } from "lucide-react";
import { CameraBarcodeScannerDialog, playScannerBeep } from "@/components/scanner/CameraBarcodeScannerDialog";
import { toast } from "sonner";
import { useApp } from "@/lib/app-store";
import { fashionStyles, pharmacyItems, genericCatalog, fmtBDT } from "@/lib/pos-data";
import { PosShell, PosProductCard } from "./PosShell";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { bdUniversalCatalogItems } from "./BdMarketPos";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useApiProducts, useApiStock } from "@/hooks/use-api-config";
import { INDUSTRY_PACKS, type IndustryPackId } from "@/lib/industry-registry";

type UniversalItem = {
  sku: string;
  name: string;
  price: number;
  tag: string;
  pack?: string;
  productId?: string;
  stock?: number;
  barcode?: string;
  meta?: Record<string, unknown>;
  imageUrl?: string;
};

export function UniversalPos() {
  const app = useApp();
  const useApi = shouldUseBackend();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [cameraScannerOpen, setCameraScannerOpen] = useState(false);

  // Live backend catalog: all active products across enabled packs.
  const productsQuery = useApiProducts({ status: "active" });
  const stockQuery = useApiStock();

  const packLabel = (packId: string) =>
    INDUSTRY_PACKS.find(p => p.id === packId)?.shortName ?? packId;

  const backendItems = useMemo((): UniversalItem[] => {
    if (!useApi || !productsQuery.data?.items) return [];
    const stockMap = new Map(
      (stockQuery.data ?? []).map(s => [s.product_id, s.qty_available ?? s.qty_on_hand]),
    );
    return productsQuery.data.items
      .filter(p => !p.industry_pack || p.industry_pack === "universal" || app.isPackEnabled(p.industry_pack as IndustryPackId))
      .map(p => ({
        sku: p.sku,
        name: p.name,
        price: p.base_price,
        tag: packLabel(p.industry_pack),
        pack: p.industry_pack,
        productId: p.id,
        stock: stockMap.get(p.id) ?? 0,
        barcode: p.barcode ?? undefined,
        meta: p.meta,
        imageUrl: (p.meta?.image_url as string) || (p.meta?.image as string) || (p as any).image_url,
      }));
  }, [useApi, productsQuery.data, stockQuery.data, app]);

  const demoItems = useMemo((): UniversalItem[] => {
    const items: UniversalItem[] = [];
    if (app.isPackEnabled("fashion")) {
      fashionStyles.forEach(s => s.variants.forEach(v => items.push({
        sku: v.sku, name: `${s.name} · ${v.size}`, price: v.price, tag: "Fashion", pack: "fashion",
      })));
    }
    if (app.isPackEnabled("pharmacy")) {
      pharmacyItems.forEach(p => items.push({
        sku: p.sku, name: `${p.brand} ${p.strength}`, price: p.batches[0]?.mrp ?? 0, tag: "Pharmacy", pack: "pharmacy",
      }));
    }
    if (app.isPackEnabled("grocery")) {
      genericCatalog.forEach(g => items.push({ sku: g.sku, name: g.name, price: g.price, tag: g.category, pack: "grocery" }));
    }
    bdUniversalCatalogItems(id => app.isPackEnabled(id)).forEach(c => {
      items.push({ sku: c.sku, name: c.name, price: c.price, tag: c.tag, pack: c.pack });
    });
    return items;
  }, [app]);

  const catalog = useApi ? backendItems : demoItems;
  const isLoading = useApi && (productsQuery.isLoading || stockQuery.isLoading);
  const isEmpty = useApi && !isLoading && backendItems.length === 0;

  // Tabs come from the packs actually present in the catalog.
  const packTabs = useMemo(() => {
    const present = new Set(catalog.map(c => c.pack).filter(Boolean) as string[]);
    return INDUSTRY_PACKS.filter(p => present.has(p.id)).map(p => ({ id: p.id, label: p.shortName }));
  }, [catalog]);

  const filtered = catalog.filter(c => {
    if (tab !== "all" && c.tag.toLowerCase() !== tab && c.pack !== tab) return false;
    const q = search.toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.sku.toLowerCase().includes(q);
  }).slice(0, 48);

  const addItem = (c: UniversalItem) => {
    app.addToCart({
      sku: c.sku,
      name: c.name,
      price: c.price,
      qty: 1,
      industry: "universal",
      ...(c.productId ? { extras: { productId: c.productId } } : {}),
    });
    toast.success(c.name);
  };

  const handleCameraScan = (scannedCode: string) => {
    const trimmed = scannedCode.trim().toLowerCase();
    const found = catalog.find(
      (c) =>
        (c.barcode && c.barcode.toLowerCase() === trimmed) ||
        c.sku.toLowerCase() === trimmed
    );
    if (found) {
      addItem(found);
      playScannerBeep(true);
    } else {
      playScannerBeep(false);
      toast.error(`Barcode "${scannedCode}" not found in catalog`);
    }
  };

  return (
    <>
      <PosShell
      industry="universal"
      title="Universal POS"
      subtitle="Sell across all enabled industry packs"
      catalog={
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 space-y-3 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, SKU or barcode…" className="h-11 pl-9" />
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-11 px-3 gap-1.5 border-dashed border-primary/40 text-primary hover:bg-primary/10 shrink-0 font-medium"
                onClick={() => setCameraScannerOpen(true)}
                title="Scan barcode with device camera"
              >
                <Camera className="h-4 w-4" />
                <span className="hidden sm:inline text-xs">Camera Scan</span>
              </Button>
            </div>
            <Tabs value={tab} onValueChange={setTab}>
              <div className="w-full max-w-full overflow-x-auto pb-0.5">
                <TabsList className="inline-flex h-auto min-w-0 w-max max-w-none flex-nowrap justify-start gap-1 bg-secondary p-1">
                  <TabsTrigger value="all" className="shrink-0">All</TabsTrigger>
                  {packTabs.map(p => (
                    <TabsTrigger key={p.id} value={p.id} className="shrink-0">{p.label}</TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </Tabs>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            {isLoading ? (
              <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 xl:grid-cols-4 lg:p-4">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 xl:grid-cols-4 lg:p-4">
                {filtered.map(c => (
                  <button key={c.sku} type="button" onClick={() => addItem(c)} className="min-w-0 text-left">
                    <PosProductCard
                      badge={c.tag}
                      title={c.name}
                      price={fmtBDT(c.price)}
                      sku={c.sku}
                      imageUrl={(c.meta?.image_url as string) || (c.meta?.image as string)}
                      footer={useApi ? (
                        <span className="mt-1 block text-[10px] text-muted-foreground">Stock {c.stock ?? 0}</span>
                      ) : undefined}
                    />
                  </button>
                ))}
                {filtered.length === 0 && (
                  <div className="col-span-full py-12 text-center text-sm text-muted-foreground">
                    <ShoppingBag className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    {isEmpty ? (
                      <>
                        No products in your catalog yet · add items in Product Master
                        <div className="mt-3">
                          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { productsQuery.refetch(); stockQuery.refetch(); }}>
                            <RefreshCw className="h-3.5 w-3.5" /> Refresh
                          </Button>
                        </div>
                      </>
                    ) : (
                      "No products · enable packs in Configuration"
                    )}
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </div>
      }
    />

    <CameraBarcodeScannerDialog
      open={cameraScannerOpen}
      onOpenChange={setCameraScannerOpen}
      title="Universal Camera Barcode Scanner"
      subtitle="Point camera at product barcode"
      continuous={true}
      onScan={handleCameraScan}
    />
  </>
  );
}
