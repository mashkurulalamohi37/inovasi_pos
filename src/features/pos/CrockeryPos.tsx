import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  UtensilsCrossed,
  ShieldCheck,
  Flame,
  Zap,
  Gift,
  HeartCrack,
  Boxes,
  Plus,
  PackageCheck,
  Sparkles,
  AlertTriangle,
  Info,
  Camera,
  Search,
} from "lucide-react";
import { CameraBarcodeScannerDialog, playScannerBeep } from "@/components/scanner/CameraBarcodeScannerDialog";
import { toast } from "sonner";
import { useApp } from "@/lib/app-store";
import { crockeryCatalog, type CrockeryItem } from "@/lib/industry-mock";
import { fmtBDT } from "@/lib/pos-data";
import { PosShell, ProductGrid, PosProductCard } from "./PosShell";
import { usePosCatalog, catalogToCartExtras, type PosCatalogItem } from "@/hooks/use-pos-catalog";
import { useBarcodeLookup } from "@/hooks/use-api-config";
import { barcodeLookupToCatalogItem } from "@/lib/barcode-pos";
import { shouldUseBackend } from "@/lib/demo-mode";

type CrockeryPosItem = PosCatalogItem & {
  category?: string;
  brand?: string;
  material?: string;
  piecesInSet?: number;
  heatCompatibility?: string;
  capacity?: string;
  warrantyMonths?: number;
  isFragile?: boolean;
  isDecantable?: boolean;
  looseItemPrice?: number;
};

export function CrockeryPos() {
  const app = useApp();
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [filterInduction, setFilterInduction] = useState(false);
  const [filterMicrowave, setFilterMicrowave] = useState(false);
  const [filterWarranty, setFilterWarranty] = useState(false);

  // Modals state
  const [breakageOpen, setBreakageOpen] = useState(false);
  const [selectedBreakageItem, setSelectedBreakageItem] = useState<CrockeryPosItem | null>(null);
  const [breakageQty, setBreakageQty] = useState("1");
  const [breakageReason, setBreakageReason] = useState("Customer Dropped on Display");
  const [breakageNotes, setBreakageNotes] = useState("");

  const [decantOpen, setDecantOpen] = useState(false);
  const [selectedDecantSet, setSelectedDecantSet] = useState<CrockeryPosItem | null>(null);
  const [decantQty, setDecantQty] = useState("1");

  const [giftOpen, setGiftOpen] = useState(false);
  const [giftType, setGiftType] = useState<"bubble" | "luxury" | "crate">("luxury");
  const [giftRecipient, setGiftRecipient] = useState("");
  const [giftGreeting, setGiftGreeting] = useState("");
  const [cameraScannerOpen, setCameraScannerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const barcodeLookup = useBarcodeLookup();

  // Local stock adjustments for demo/in-memory interactivity
  const [stockOverrides, setStockOverrides] = useState<Record<string, number>>({});

  const demoItems = useMemo((): CrockeryPosItem[] => {
    return crockeryCatalog.map((item) => ({
      id: item.sku,
      sku: item.sku,
      name: item.name,
      price: item.price,
      stock: stockOverrides[item.sku] ?? item.stock,
      barcode: item.barcode,
      meta: {
        category: item.category,
        brand: item.brand,
        material: item.material,
        pieces_in_set: item.piecesInSet,
        heat_compatibility: item.heatCompatibility,
        capacity: item.capacity ?? "",
        warranty_months: item.warrantyMonths ?? 0,
        is_fragile: item.isFragile ?? false,
        is_decantable: item.isDecantable ?? false,
        loose_item_price: item.looseItemPrice ?? 0,
      },
      category: item.category,
      brand: item.brand,
      material: item.material,
      piecesInSet: item.piecesInSet,
      heatCompatibility: item.heatCompatibility,
      capacity: item.capacity,
      warrantyMonths: item.warrantyMonths,
      isFragile: item.isFragile,
      isDecantable: item.isDecantable,
      looseItemPrice: item.looseItemPrice,
    }));
  }, [stockOverrides]);

  const catalog = usePosCatalog("crockery", demoItems);

  const categories = useMemo(() => {
    const list = Array.from(new Set(catalog.items.map((i) => String(i.meta?.category ?? "General"))));
    return ["All", ...list];
  }, [catalog.items]);

  const filteredItems = useMemo(() => {
    return (catalog.items as CrockeryPosItem[]).filter((item) => {
      const cat = String(item.meta?.category ?? item.category ?? "");
      const matchCat = selectedCategory === "All" || cat === selectedCategory;
      const heat = String(item.meta?.heat_compatibility ?? item.heatCompatibility ?? "");
      const matchInduction = !filterInduction || heat.includes("Induction");
      const matchMicrowave = !filterMicrowave || heat.includes("Microwave");
      const warranty = Number(item.meta?.warranty_months ?? item.warrantyMonths ?? 0);
      const matchWarranty = !filterWarranty || warranty > 0;

      if (!matchCat || !matchInduction || !matchMicrowave || !matchWarranty) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const mat = String(item.meta?.material ?? item.material ?? "").toLowerCase();
        const sku = item.sku.toLowerCase();
        const name = item.name.toLowerCase();
        const barcode = (item.barcode ?? "").toLowerCase();
        return name.includes(q) || sku.includes(q) || barcode.includes(q) || mat.includes(q) || cat.toLowerCase().includes(q);
      }

      return true;
    });
  }, [catalog.items, selectedCategory, filterInduction, filterMicrowave, filterWarranty, searchQuery]);

  // Check if any pressure cookers are in the active cart
  const hasCookerInCart = useMemo(() => {
    return app.cart.some(
      (line) =>
        line.name.toLowerCase().includes("cooker") ||
        line.sku.includes("CRK-002") ||
        line.sku.includes("CRK-003")
    );
  }, [app.cart]);

  // Add item to cart
  const handleAddToCart = (item: CrockeryPosItem) => {
    const isFragile = Boolean(item.meta?.is_fragile ?? item.isFragile);
    const material = String(item.meta?.material ?? item.material ?? "General");
    const warrantyMonths = Number(item.meta?.warranty_months ?? item.warrantyMonths ?? 0);
    const heat = String(item.meta?.heat_compatibility ?? item.heatCompatibility ?? "");
    const pieces = Number(item.meta?.pieces_in_set ?? item.piecesInSet ?? 1);

    app.addToCart({
      sku: item.sku,
      name: item.name,
      price: item.price,
      qty: 1,
      industry: "crockery",
      meta: `${material} · ${pieces > 1 ? `${pieces}-Pc Set` : "Single Piece"}`,
      extras: {
        ...catalogToCartExtras(item),
        material,
        piecesInSet: pieces,
        heatCompatibility: heat,
        warrantyMonths,
        isFragile,
        brand: String(item.meta?.brand ?? item.brand ?? ""),
      },
    });

    toast.success(`Added ${item.name} to cart`);
  };

  // Camera barcode scan resolution (with live backend fallback)
  const handleCameraScan = async (scannedCode: string) => {
    const trimmed = scannedCode.trim().toLowerCase();
    const found = (catalog.items as CrockeryPosItem[]).find(
      (item) =>
        (item.barcode && item.barcode.toLowerCase() === trimmed) ||
        item.sku.toLowerCase() === trimmed
    );
    if (found) {
      handleAddToCart(found);
      playScannerBeep(true);
      return;
    }

    if (shouldUseBackend()) {
      try {
        const hit = await barcodeLookup.mutateAsync(scannedCode.trim());
        const item = barcodeLookupToCatalogItem(hit, 100);
        app.addToCart({
          sku: item.sku,
          name: item.name,
          price: item.price,
          qty: 1,
          industry: "crockery",
        });
        playScannerBeep(true);
        toast.success(`Scanned: ${item.name}`);
        return;
      } catch {
        /* proceed to error */
      }
    }

    playScannerBeep(false);
    toast.error(`Barcode "${scannedCode}" not found in catalog`);
  };

  // Handle enter key press on search input
  const handleSearchSubmit = () => {
    if (!searchQuery.trim()) return;
    const query = searchQuery.trim().toLowerCase();
    const exactMatch = (catalog.items as CrockeryPosItem[]).find(
      (item) =>
        (item.barcode && item.barcode.toLowerCase() === query) ||
        item.sku.toLowerCase() === query
    );
    if (exactMatch) {
      handleAddToCart(exactMatch);
      setSearchQuery("");
      playScannerBeep(true);
      return;
    }
    if (filteredItems.length === 1) {
      handleAddToCart(filteredItems[0]);
      setSearchQuery("");
      playScannerBeep(true);
      return;
    }
    void handleCameraScan(searchQuery.trim());
    setSearchQuery("");
  };

  // Quick add matching spare part
  const addSparePart = (sku: string, name: string, price: number) => {
    app.addToCart({
      sku,
      name,
      price,
      qty: 1,
      industry: "crockery",
      meta: "Spare Part / Replacement",
      extras: {
        category: "Spares",
        material: "Silicone / Brass",
      },
    });
    toast.success(`Added ${name} (Spare Part) to cart`);
  };

  // Record Breakage / Damage Write-Off
  const handleConfirmBreakage = () => {
    if (!selectedBreakageItem) return;
    const qty = Math.max(1, parseInt(breakageQty, 10) || 1);
    const currentStock = stockOverrides[selectedBreakageItem.sku] ?? selectedBreakageItem.stock;
    const newStock = Math.max(0, currentStock - qty);

    setStockOverrides((prev) => ({
      ...prev,
      [selectedBreakageItem.sku]: newStock,
    }));

    const lossAmount = selectedBreakageItem.price * qty;
    toast.warning(
      `Loss Recorded: ${qty}x ${selectedBreakageItem.name} written off. Reason: "${breakageReason}". Total Loss: ${fmtBDT(lossAmount)}`
    );

    setBreakageOpen(false);
    setSelectedBreakageItem(null);
    setBreakageNotes("");
  };

  // Decant Set to Loose Pieces
  const handleConfirmDecant = () => {
    if (!selectedDecantSet) return;
    const setsToDecant = Math.max(1, parseInt(decantQty, 10) || 1);
    const currentSetStock = stockOverrides[selectedDecantSet.sku] ?? selectedDecantSet.stock;

    if (currentSetStock < setsToDecant) {
      toast.error(`Not enough boxed sets in stock (Current: ${currentSetStock})`);
      return;
    }

    // Reduce set stock
    setStockOverrides((prev) => ({
      ...prev,
      [selectedDecantSet.sku]: currentSetStock - setsToDecant,
      "CRK-007": (prev["CRK-007"] ?? 45) + setsToDecant * 6, // 6 soup bowls per set
      "CRK-008": (prev["CRK-008"] ?? 38) + setsToDecant * 6, // 6 dinner plates per set
    }));

    toast.success(
      `Decanted ${setsToDecant}x ${selectedDecantSet.name} into loose inventory (+${setsToDecant * 6} Dinner Plates, +${setsToDecant * 6} Soup Bowls)`
    );

    setDecantOpen(false);
    setSelectedDecantSet(null);
  };

  // Add Gift Packaging to Cart
  const handleAddGiftPackaging = () => {
    let fee = 0;
    let title = "Standard Bubble Wrap (Protective)";
    if (giftType === "luxury") {
      fee = 50;
      title = "Luxury Gift Wrap + Golden Ribbon";
    } else if (giftType === "crate") {
      fee = 150;
      title = "Heavy-Duty Wooden Crate Transit Packaging";
    }

    app.addToCart({
      sku: `PKG-${giftType.toUpperCase()}`,
      name: title,
      price: fee,
      qty: 1,
      industry: "crockery",
      meta: giftRecipient ? `For: ${giftRecipient}` : "Fragile Protective Packing",
      extras: {
        category: "Packaging",
        recipient: giftRecipient,
        greetingMessage: giftGreeting,
      },
    });

    toast.success(`Packaging Added: ${title}`);
    setGiftOpen(false);
    setGiftRecipient("");
    setGiftGreeting("");
  };

  return (
    <>
      <PosShell
        industry="crockery"
        title="Crockery & Kitchenware POS"
        subtitle="Dinner sets · Cookware & Cookers · Glassware · Set Decanting · Gift Packaging"
        receiptNote="Inspect fragile items before leaving counter · 7-day exchange for boxed sets"
        onCameraScan={handleCameraScan}
        headerBadges={
          <div className="flex items-center gap-1.5 overflow-x-auto py-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
              onClick={() => {
                const firstSet = (catalog.items as CrockeryPosItem[]).find((i) => i.isDecantable);
                setSelectedDecantSet(firstSet || null);
                setDecantOpen(true);
              }}
            >
              <Boxes className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              Decant Set to Pieces
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 border-rose-500/40 text-rose-700 dark:text-rose-300 hover:bg-rose-500/10"
              onClick={() => {
                setSelectedBreakageItem((catalog.items as CrockeryPosItem[])[0] || null);
                setBreakageOpen(true);
              }}
            >
              <HeartCrack className="h-3.5 w-3.5 text-rose-600 shrink-0" />
              Log Breakage / Loss
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 border-indigo-500/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/10"
              onClick={() => setGiftOpen(true)}
            >
              <Gift className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
              Gift & Packaging
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
              onClick={() => setCameraScannerOpen(true)}
              title="Scan crockery barcode with device camera"
            >
              <Camera className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              Camera Scanner
            </Button>
          </div>
        }
        cartLineExtra={(line) => {
          const mat = String(line.extras?.material ?? "");
          const heat = String(line.extras?.heatCompatibility ?? "");
          const warranty = Number(line.extras?.warrantyMonths ?? 0);
          const isFragile = Boolean(line.extras?.isFragile);
          const recipient = String(line.extras?.recipient ?? "");

          return (
            <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
              {mat && <span className="font-medium text-foreground/80">{mat}</span>}
              {heat && (
                <Badge variant="outline" className="h-4 px-1 text-[9px] gap-0.5 py-0">
                  {heat.includes("Induction") ? (
                    <Zap className="h-2.5 w-2.5 text-amber-500" />
                  ) : heat.includes("Microwave") ? (
                    <Flame className="h-2.5 w-2.5 text-rose-500" />
                  ) : null}
                  {heat}
                </Badge>
              )}
              {warranty > 0 && (
                <Badge variant="secondary" className="h-4 px-1 text-[9px] gap-0.5 py-0 bg-blue-500/10 text-blue-700 dark:text-blue-300">
                  <ShieldCheck className="h-2.5 w-2.5 text-blue-600" />
                  {warranty >= 12 ? `${warranty / 12}Y Warranty` : `${warranty}M Warranty`}
                </Badge>
              )}
              {isFragile && (
                <span className="text-amber-600 dark:text-amber-400 font-semibold">Fragile</span>
              )}
              {recipient && (
                <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                  🎁 For: {recipient}
                </span>
              )}
            </div>
          );
        }}
        catalog={
          <div className="flex flex-col h-full overflow-hidden">
            {/* Search & Barcode Input Bar with Instant Camera Scanner trigger */}
            <div className="flex items-center gap-2 border-b border-border px-3 py-2 bg-muted/20 shrink-0">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search crockery, cookware, dinner sets, or scan barcode (Enter to add)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSearchSubmit();
                    }
                  }}
                  className="pl-8 h-8 text-xs bg-background"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCameraScannerOpen(true)}
                className="h-8 px-2.5 gap-1.5 border-dashed border-primary/40 text-primary hover:bg-primary/10 shrink-0 font-medium text-xs shadow-2xs"
                title="Scan barcode with device camera"
              >
                <Camera className="h-3.5 w-3.5 text-primary" />
                <span className="hidden sm:inline">Camera Scanner</span>
              </Button>
            </div>

            {/* Pressure Cooker Spare Parts Smart Upsell Banner */}
            {hasCookerInCart && (
              <div className="mx-4 mt-2 p-2 rounded-xl border border-amber-500/30 bg-amber-500/10 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-600 shrink-0" />
                  <div>
                    <span className="font-semibold text-amber-900 dark:text-amber-200">
                      Cooker in Cart! Recommended Spares:
                    </span>
                    <span className="text-amber-800/80 dark:text-amber-300/80 ml-1.5 hidden sm:inline">
                      Keep extra silicone gaskets and safety valves handy.
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 text-xs bg-amber-200/80 hover:bg-amber-200 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100"
                    onClick={() =>
                      addSparePart("CRK-SP-01", "Universal Silicone Gasket (5.5L)", 150)
                    }
                  >
                    + Gasket (৳150)
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 text-xs bg-amber-200/80 hover:bg-amber-200 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100"
                    onClick={() =>
                      addSparePart("CRK-SP-02", "Brass Safety Valve Set", 120)
                    }
                  >
                    + Valve (৳120)
                  </Button>
                </div>
              </div>
            )}

            {/* Category tabs and smart filter chips */}
            <div className="flex flex-col gap-2 border-b border-border px-4 py-2.5 bg-background shrink-0">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {categories.map((c) => (
                  <Button
                    key={c}
                    size="sm"
                    variant={selectedCategory === c ? "default" : "outline"}
                    className="h-8 text-xs shrink-0"
                    onClick={() => setSelectedCategory(c)}
                  >
                    {c}
                  </Button>
                ))}
              </div>

              <div className="flex items-center gap-2 overflow-x-auto text-xs text-muted-foreground pt-0.5">
                <span className="font-medium text-[11px] shrink-0">Quick Filters:</span>
                <Button
                  size="sm"
                  variant={filterInduction ? "secondary" : "ghost"}
                  className={`h-6 text-[11px] px-2 rounded-full gap-1 ${
                    filterInduction ? "bg-amber-500/20 text-amber-800 dark:text-amber-200 font-semibold" : ""
                  }`}
                  onClick={() => setFilterInduction(!filterInduction)}
                >
                  <Zap className="h-3 w-3 text-amber-500" /> Induction Ready
                </Button>

                <Button
                  size="sm"
                  variant={filterMicrowave ? "secondary" : "ghost"}
                  className={`h-6 text-[11px] px-2 rounded-full gap-1 ${
                    filterMicrowave ? "bg-rose-500/20 text-rose-800 dark:text-rose-200 font-semibold" : ""
                  }`}
                  onClick={() => setFilterMicrowave(!filterMicrowave)}
                >
                  <Flame className="h-3 w-3 text-rose-500" /> Microwave Safe
                </Button>

                <Button
                  size="sm"
                  variant={filterWarranty ? "secondary" : "ghost"}
                  className={`h-6 text-[11px] px-2 rounded-full gap-1 ${
                    filterWarranty ? "bg-blue-500/20 text-blue-800 dark:text-blue-200 font-semibold" : ""
                  }`}
                  onClick={() => setFilterWarranty(!filterWarranty)}
                >
                  <ShieldCheck className="h-3 w-3 text-blue-500" /> Warranty Covered
                </Button>
              </div>
            </div>

            {/* Catalog Grid */}
            <div className="flex-1 overflow-y-auto">
              <ProductGrid
                items={filteredItems}
                onAdd={(item) => handleAddToCart(item as CrockeryPosItem)}
                renderCard={(item) => {
                  const ci = item as CrockeryPosItem;
                  const pieces = Number(ci.meta?.pieces_in_set ?? ci.piecesInSet ?? 1);
                  const isDecantable = Boolean(ci.meta?.is_decantable ?? ci.isDecantable);
                  const mat = String(ci.meta?.material ?? ci.material ?? "");
                  const heat = String(ci.meta?.heat_compatibility ?? ci.heatCompatibility ?? "");
                  const cap = String(ci.meta?.capacity ?? ci.capacity ?? "");
                  const warranty = Number(ci.meta?.warranty_months ?? ci.warrantyMonths ?? 0);

                  return (
                    <div key={ci.sku} className="relative group">
                      <PosProductCard
                        badge={pieces > 1 ? `${pieces}-Pc Set` : cap || mat}
                        title={ci.name}
                        subtitle={`${mat} · ${heat || "Standard"}${warranty > 0 ? ` · ${warranty / 12}Y War.` : ""}`}
                        price={fmtBDT(ci.price)}
                        industry="crockery"
                        sku={ci.sku}
                      />

                      {/* Decant Set Action Button on Product Card */}
                      {isDecantable && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="absolute top-2 right-2 h-6 px-1.5 text-[10px] gap-1 opacity-90 group-hover:opacity-100 shadow-sm border border-border"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDecantSet(ci);
                            setDecantOpen(true);
                          }}
                        >
                          <Boxes className="h-3 w-3 text-amber-600" />
                          Decant
                        </Button>
                      )}
                    </div>
                  );
                }}
              />
            </div>
          </div>
        }
      />

      {/* 1. Set Decanting / Loose Piece Breakdown Dialog */}
      <Dialog open={decantOpen} onOpenChange={setDecantOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Boxes className="h-5 w-5 text-amber-600" />
              Decant Set into Loose Inventory
            </DialogTitle>
          </DialogHeader>

          {selectedDecantSet && (
            <div className="space-y-4 pt-2">
              <div className="rounded-xl border border-border bg-secondary/30 p-3">
                <div className="font-semibold text-sm">{selectedDecantSet.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Full Set Price: {fmtBDT(selectedDecantSet.price)} · Current Stock: {selectedDecantSet.stock} Sets
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold">Number of Sets to Decant (Unbox)</Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min="1"
                    max={selectedDecantSet.stock || 1}
                    value={decantQty}
                    onChange={(e) => setDecantQty(e.target.value)}
                    className="h-9 w-24 font-mono text-center font-bold"
                  />
                  <span className="text-xs text-muted-foreground">
                    Will produce open-stock plates and bowls for individual selling.
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-border/80 bg-muted/40 p-3 text-xs space-y-2">
                <div className="font-semibold text-foreground/90">Decanted Stock Generated:</div>
                <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                  <div>• 6× Dinner Plates (Loose ৳320)</div>
                  <div>• 6× Soup Bowls (Loose ৳180)</div>
                  <div>• 6× Quarter Plates (Loose ৳220)</div>
                  <div>• 2× Serving Bowls (Loose ৳550)</div>
                </div>
              </div>

              <DialogFooter className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setDecantOpen(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={handleConfirmDecant}
                >
                  Confirm Decant & Add Stock
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 2. Breakage / Damage Log Dialog */}
      <Dialog open={breakageOpen} onOpenChange={setBreakageOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <HeartCrack className="h-5 w-5" />
              In-Store Breakage / Damage Write-Off
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3.5 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Select Damaged Item</Label>
              <Select
                value={selectedBreakageItem?.sku || ""}
                onValueChange={(sku) => {
                  const found = (catalog.items as CrockeryPosItem[]).find((i) => i.sku === sku);
                  setSelectedBreakageItem(found || null);
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select item" />
                </SelectTrigger>
                <SelectContent>
                  {(catalog.items as CrockeryPosItem[]).map((item) => (
                    <SelectItem key={item.sku} value={item.sku} className="text-xs">
                      {item.name} ({fmtBDT(item.price)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Quantity Broken</Label>
                <Input
                  type="number"
                  min="1"
                  value={breakageQty}
                  onChange={(e) => setBreakageQty(e.target.value)}
                  className="h-9 text-xs font-mono font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Damage Reason</Label>
                <Select value={breakageReason} onValueChange={setBreakageReason}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Customer Dropped on Display" className="text-xs">
                      Customer Dropped on Display
                    </SelectItem>
                    <SelectItem value="Unpacking Transit Crack" className="text-xs">
                      Unpacking Transit Crack
                    </SelectItem>
                    <SelectItem value="Chipped Rim / Defective Glaze" className="text-xs">
                      Chipped Rim / Glaze Defect
                    </SelectItem>
                    <SelectItem value="Handle / Lid Broken" className="text-xs">
                      Handle / Lid Broken
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Notes / Audit Ref (Optional)</Label>
              <Input
                value={breakageNotes}
                onChange={(e) => setBreakageNotes(e.target.value)}
                placeholder="e.g. Broken near Display Stand #3"
                className="h-9 text-xs"
              />
            </div>

            {selectedBreakageItem && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-900 dark:text-rose-200">
                <span className="font-semibold">Write-Off Value: </span>
                {fmtBDT(selectedBreakageItem.price * Math.max(1, parseInt(breakageQty, 10) || 1))} will be recorded in shrinkage ledger.
              </div>
            )}

            <DialogFooter className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setBreakageOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={handleConfirmBreakage}>
                Confirm Breakage Write-off
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* 3. Gift & Protective Packaging Dialog */}
      <Dialog open={giftOpen} onOpenChange={setGiftOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-600">
              <Gift className="h-5 w-5" />
              Gift & Protective Packaging
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3.5 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Select Packaging Style</Label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setGiftType("bubble")}
                  className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-colors ${
                    giftType === "bubble"
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : "border-border hover:bg-secondary/40 text-muted-foreground"
                  }`}
                >
                  <PackageCheck className="h-5 w-5 mb-1" />
                  <span className="text-[11px] leading-tight">Bubble Wrap</span>
                  <span className="text-[10px] text-muted-foreground mt-0.5">Free</span>
                </button>

                <button
                  type="button"
                  onClick={() => setGiftType("luxury")}
                  className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-colors ${
                    giftType === "luxury"
                      ? "border-indigo-600 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold"
                      : "border-border hover:bg-secondary/40 text-muted-foreground"
                  }`}
                >
                  <Gift className="h-5 w-5 mb-1 text-indigo-600" />
                  <span className="text-[11px] leading-tight">Luxury Gift Wrap</span>
                  <span className="text-[10px] font-mono mt-0.5">৳50</span>
                </button>

                <button
                  type="button"
                  onClick={() => setGiftType("crate")}
                  className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-colors ${
                    giftType === "crate"
                      ? "border-amber-600 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold"
                      : "border-border hover:bg-secondary/40 text-muted-foreground"
                  }`}
                >
                  <Boxes className="h-5 w-5 mb-1 text-amber-600" />
                  <span className="text-[11px] leading-tight">Wooden Crate</span>
                  <span className="text-[10px] font-mono mt-0.5">৳150</span>
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Recipient Name (For Gift Slip)</Label>
              <Input
                value={giftRecipient}
                onChange={(e) => setGiftRecipient(e.target.value)}
                placeholder="e.g. Mr. & Mrs. Chowdhury"
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Gift Greeting Message (Optional)</Label>
              <Input
                value={giftGreeting}
                onChange={(e) => setGiftGreeting(e.target.value)}
                placeholder="e.g. Heartiest congratulations on your wedding!"
                className="h-9 text-xs"
              />
            </div>

            <DialogFooter className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setGiftOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleAddGiftPackaging}>
                Add to Cart
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Camera Barcode Scanner Modal */}
      <CameraBarcodeScannerDialog
        open={cameraScannerOpen}
        onOpenChange={setCameraScannerOpen}
        title="Crockery Camera Barcode Scanner"
        subtitle="Point camera at cookware or dinner set packaging barcode"
        continuous={true}
        onScan={handleCameraScan}
      />
    </>
  );
}
