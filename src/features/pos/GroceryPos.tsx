import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Barcode, Scale, Star, Search} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/app-store";
import { groceryCatalog } from "@/lib/industry-mock";
import { fmtBDT } from "@/lib/pos-data";
import { requirePermission } from "@/lib/permission-ui";
import { PosShell, ProductGrid, PosProductCard, CartPill } from "./PosShell";
import { usePosCatalog, catalogToCartExtras } from "@/hooks/use-pos-catalog";
import { usePosBarcodeScan } from "@/hooks/use-pos-barcode";

export function GroceryPos() {
  const app = useApp();
  const wholesaleOn = app.isFeatureEnabled("grocery.wholesale") || app.isFeatureEnabled("grocery.wholesale_price");

  const demoItems = useMemo(() => groceryCatalog.map((g: any) => ({
    id: g.sku, sku: g.sku, name: g.name, price: g.price, wholesalePrice: g.wholesalePrice,
    barcode: g.barcode, stock: g.stock, meta: { mrp: g.mrp, shelf: g.shelf, offer: g.offer ?? "" },
  })), []);

  const catalog = usePosCatalog("grocery", demoItems);

  const getPrice = (g: typeof catalog.items[0]) =>
    app.groceryPriceMode === "wholesale" && wholesaleOn && g.wholesalePrice ? g.wholesalePrice : g.price;

  const addItem = (g: typeof catalog.items[0], qty: number) => {
    const price = getPrice(g);
    app.addToCart({
      sku: g.sku, name: g.name, meta: String(g.meta?.shelf ?? ""), price, qty,
      industry: "grocery",
      extras: {
        ...catalogToCartExtras(g),
        mrp: g.meta?.mrp != null ? Number(g.meta.mrp) : 0,
        shelf: String(g.meta?.shelf ?? ""),
        offer: String(g.meta?.offer ?? ""),
        barcode: g.barcode || "",
        priceMode: app.groceryPriceMode,
        retail: g.price,
        wholesale: g.wholesalePrice ?? 0,
      },
    });
    toast.success(g.name);
  };

  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return catalog.items;
    return catalog.items.filter((g) =>
      [g.name, g.sku, g.meta?.category, g.meta?.shelf, g.barcode, g.meta?.barcode].some((x) =>
        String(x ?? "").toLowerCase().includes(q)
      )
    );
  }, [catalog.items, search]);

  const { barcode, setBarcode, handleScan, isPending } = usePosBarcodeScan({
    fromBackend: catalog.fromBackend,
    catalogItems: catalog.items,
    onAdd: addItem,
  });

  const handleGroceryScan = async () => {
    const code = (barcode || search).trim();
    if (!code) return;
    setBarcode(code);
    const match = catalog.items.find(
      (i) =>
        (i.barcode && i.barcode.toLowerCase() === code.toLowerCase()) ||
        (i.meta?.barcode && String(i.meta.barcode).toLowerCase() === code.toLowerCase()) ||
        i.sku.toLowerCase() === code.toLowerCase()
    );
    if (match) {
      addItem(match as typeof catalog.items[0], 1);
      setBarcode("");
      setSearch("");
      return;
    }
    if (filtered.length === 1) {
      addItem(filtered[0] as typeof catalog.items[0], 1);
      setBarcode("");
      setSearch("");
      return;
    }
    await handleScan();
    setBarcode("");
    setSearch("");
  };

  const toggleWholesale = () => {
    if (app.groceryPriceMode === "retail") {
      if (!requirePermission(app.can("grocery.wholesale"))) return;
      app.setGroceryPriceMode("wholesale");
      toast.success("Wholesale pricing mode");
    } else {
      app.setGroceryPriceMode("retail");
      toast.info("Retail pricing mode");
    }
  };

  const items = catalog.items;

  return (
    <PosShell
      industry="grocery"
      title="Grocery / Super Shop POS"
      subtitle={`Barcode · MRP · ${app.groceryPriceMode} pricing · loyalty`}
      receiptNote={`MRP & discount · ${app.groceryPriceMode} mode · VAT 5%`}
      headerBadges={
        <>
          {app.isFeatureEnabled("grocery.fast_checkout") && <Badge>Fast checkout</Badge>}
          {wholesaleOn && (
            <Button variant={app.groceryPriceMode === "wholesale" ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={toggleWholesale}>
              {app.groceryPriceMode === "wholesale" ? "Wholesale" : "Retail"}
            </Button>
          )}
          {app.isFeatureEnabled("grocery.loyalty") && (
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => toast.success(app.customer ? "৳50 loyalty discount applied" : "Attach customer for loyalty")}>
              <Star className="h-3 w-3" /> Loyalty
            </Button>
          )}
        </>
      }
      cartLineExtra={l => l.extras ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {l.extras.mrp && <CartPill variant="neutral">MRP: {fmtBDT(Number(l.extras.mrp))}</CartPill>}
          {l.extras.priceMode && (
            <CartPill variant={l.extras.priceMode === "wholesale" ? "success" : "info"}>
              {String(l.extras.priceMode)}
            </CartPill>
          )}
          {l.extras.shelf && <CartPill variant="neutral">Shelf: {String(l.extras.shelf)}</CartPill>}
        </div>
      ) : null}
      catalog={
        <>
          {app.isFeatureEnabled("grocery.barcode") && (
            <form
              className="flex gap-2 border-b border-border px-4 py-3"
              onSubmit={(e) => {
                e.preventDefault();
                void handleGroceryScan();
              }}
            >
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setBarcode(e.target.value);
                  }}
                  placeholder="Search item, category, shelf, or scan barcode (Enter to add)…"
                  className="h-11 pl-9 pr-9 font-mono"
                />
                <Barcode className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
              </div>
              <Button type="submit" disabled={isPending}>Scan</Button>
            </form>
          )}
          <ProductGrid
            items={filtered}
            onAdd={item => addItem(item as typeof catalog.items[0], 1)}
            renderCard={item => {
              const g = item as typeof catalog.items[0];
              const price = getPrice(g);
              return (
                <PosProductCard
                  badge={g.isMarkdownActive ? g.markdownBadge || "⚡ 50% Fresh Clearance" : String(g.meta?.offer ?? "Grocery")}
                  isMarkdown={g.isMarkdownActive}
                  originalPrice={g.originalPrice ? fmtBDT(g.originalPrice) : undefined}
                  title={g.name}
                  subtitle={app.isFeatureEnabled("grocery.shelf") ? `Shelf ${String(g.meta?.shelf ?? "—")}` : undefined}
                  price={fmtBDT(price)}
                  industry="grocery"
                  sku={g.sku}
                  imageUrl={(g.meta?.image_url as string) || (g.meta?.image as string)}
                  footer={
                    <div className="mt-1 flex flex-col gap-0.5 text-[10px]">
                      {g.isMarkdownActive && g.originalPrice && (
                        <span className="line-through text-amber-600 dark:text-amber-400 font-semibold">Orig. {fmtBDT(g.originalPrice)}</span>
                      )}
                      {app.isFeatureEnabled("grocery.mrp") && g.meta?.mrp != null && !g.isMarkdownActive && (
                        <span className="line-through text-muted-foreground">MRP {fmtBDT(Number(g.meta.mrp))}</span>
                      )}
                      {wholesaleOn && g.wholesalePrice != null && app.groceryPriceMode === "retail" && (
                        <span className="text-muted-foreground">Wholesale {fmtBDT(g.wholesalePrice)}</span>
                      )}
                      {catalog.fromBackend && <span className="text-muted-foreground">Stock {g.stock}</span>}
                    </div>
                  }
                />
              );
            }}
          />
        </>
      }
    />
  );
}
