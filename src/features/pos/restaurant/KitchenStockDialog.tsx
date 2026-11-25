import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Package,
  AlertTriangle,
  Flame,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { fmtBDT } from "@/lib/pos-data";
import type { KitchenStockItem, KitchenWasteLog } from "./types";

const INITIAL_STOCK: KitchenStockItem[] = [
  { id: "st-1", name: "Burger Bun", category: "Bakery", current_stock: 45, unit: "pcs", min_stock_level: 20, unit_cost: 12 },
  { id: "st-2", name: "Chicken Patty", category: "Meat & Poultry", current_stock: 32, unit: "pcs", min_stock_level: 15, unit_cost: 35 },
  { id: "st-3", name: "Beef Patty", category: "Meat & Poultry", current_stock: 8, unit: "pcs", min_stock_level: 10, unit_cost: 45 },
  { id: "st-4", name: "Cheddar Cheese", category: "Dairy", current_stock: 60, unit: "slices", min_stock_level: 25, unit_cost: 8 },
  { id: "st-5", name: "Mayonnaise", category: "Sauces & Condiments", current_stock: 2500, unit: "ml", min_stock_level: 1000, unit_cost: 0.16 },
  { id: "st-6", name: "Cooking Oil", category: "Pantry", current_stock: 12, unit: "liters", min_stock_level: 5, unit_cost: 180 },
  { id: "st-7", name: "Food Packaging Box", category: "Packaging", current_stock: 120, unit: "pcs", min_stock_level: 50, unit_cost: 5 },
];

const INITIAL_WASTE: KitchenWasteLog[] = [
  { id: "w-1", ts: "14:20 PM", ingredient_name: "Beef Patty", qty: 1, unit: "pc", reason: "Burnt on grill", cost: 45 },
  { id: "w-2", ts: "12:45 PM", ingredient_name: "Burger Bun", qty: 2, unit: "pcs", reason: "Dropped on floor", cost: 24 },
];

export function KitchenStockDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [stock, setStock] = useState<KitchenStockItem[]>(INITIAL_STOCK);
  const [wasteLogs, setWasteLogs] = useState<KitchenWasteLog[]>(INITIAL_WASTE);
  const [search, setSearch] = useState("");

  const [wasteItemName, setWasteItemName] = useState("Chicken Patty");
  const [wasteQty, setWasteQty] = useState("1");
  const [wasteReason, setWasteReason] = useState("Burnt / Damaged");

  const lowStockItems = stock.filter(s => s.current_stock <= s.min_stock_level);
  const filteredStock = stock.filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.category.toLowerCase().includes(search.toLowerCase()));

  const handleLogWaste = () => {
    if (!wasteItemName.trim()) return;
    const target = stock.find(s => s.name === wasteItemName);
    const qtyNum = Number(wasteQty) || 1;
    const costCalc = target ? target.unit_cost * qtyNum : 30 * qtyNum;

    const newWaste: KitchenWasteLog = {
      id: `w-${Date.now()}`,
      ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      ingredient_name: wasteItemName,
      qty: qtyNum,
      unit: target?.unit || "pcs",
      reason: wasteReason,
      cost: costCalc,
    };

    setWasteLogs(prev => [newWaste, ...prev]);
    if (target) {
      setStock(prev => prev.map(s => s.id === target.id ? { ...s, current_stock: Math.max(0, s.current_stock - qtyNum) } : s));
    }
    toast.warning(`Logged kitchen waste: ${qtyNum} ${target?.unit || 'pcs'} of ${wasteItemName}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="border-b pb-3">
          <DialogTitle className="flex items-center justify-between gap-2 text-lg font-bold">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              <span>Kitchen Raw Material Inventory & Stock</span>
            </div>
            {lowStockItems.length > 0 && (
              <Badge variant="destructive" className="animate-pulse gap-1 font-extrabold text-xs">
                <AlertTriangle className="h-3.5 w-3.5" />
                {lowStockItems.length} Low Stock Alert
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="stock" className="py-2 space-y-3">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="stock" className="gap-1.5 font-bold">
              <Package className="h-4 w-4" /> Live Raw Material Stock
            </TabsTrigger>
            <TabsTrigger value="waste" className="gap-1.5 font-bold">
              <Flame className="h-4 w-4 text-rose-500" /> Kitchen Waste & Spoilage Log
            </TabsTrigger>
          </TabsList>

          <TabsContent value="stock" className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search raw ingredients (Buns, Patties, Cheese...)"
                  className="h-8 pl-8 text-xs"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={() => toast.info("Kitchen stock refreshed")}
              >
                <RefreshCw className="h-3 w-3" /> Refresh
              </Button>
            </div>

            <div className="rounded-xl border border-border overflow-hidden bg-card">
              <div className="grid grid-cols-12 bg-muted/60 px-3 py-2 text-xs font-bold text-muted-foreground border-b border-border">
                <div className="col-span-5">Raw Material</div>
                <div className="col-span-3 text-center">Category</div>
                <div className="col-span-4 text-right">In Stock</div>
              </div>
              <div className="divide-y divide-border/60 max-h-64 overflow-y-auto">
                {filteredStock.map((st) => {
                  const isLow = st.current_stock <= st.min_stock_level;
                  return (
                    <div key={st.id} className="grid grid-cols-12 px-3 py-2.5 text-xs items-center hover:bg-muted/20">
                      <div className="col-span-5 font-bold text-foreground">
                        {st.name}
                      </div>
                      <div className="col-span-3 text-center">
                        <Badge variant="outline" className="text-[10px] bg-secondary/80">
                          {st.category}
                        </Badge>
                      </div>
                      <div className="col-span-4 text-right font-mono font-bold flex items-center justify-end gap-1.5">
                        <span className={isLow ? "text-rose-600 dark:text-rose-400 font-extrabold text-sm" : "text-foreground text-sm"}>
                          {st.current_stock} {st.unit}
                        </span>
                        {isLow && (
                          <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4">
                            LOW
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="waste" className="space-y-3">
            {/* Waste Form */}
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 space-y-2">
              <div className="text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                <Flame className="h-4 w-4 text-rose-500" />
                <span>Log Burnt / Damaged Ingredient Waste</span>
              </div>
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-5">
                  <Input
                    placeholder="Ingredient Name"
                    className="h-8 text-xs bg-background"
                    value={wasteItemName}
                    onChange={e => setWasteItemName(e.target.value)}
                  />
                </div>
                <div className="col-span-3">
                  <Input
                    placeholder="Qty"
                    className="h-8 text-xs bg-background"
                    type="number"
                    value={wasteQty}
                    onChange={e => setWasteQty(e.target.value)}
                  />
                </div>
                <div className="col-span-4">
                  <Input
                    placeholder="Reason (e.g. Burnt / Expired)"
                    className="h-8 text-xs bg-background"
                    value={wasteReason}
                    onChange={e => setWasteReason(e.target.value)}
                  />
                </div>
              </div>
              <Button
                size="sm"
                variant="destructive"
                className="h-8 text-xs w-full font-bold gap-1 cursor-pointer"
                onClick={handleLogWaste}
              >
                <Plus className="h-3.5 w-3.5" /> Record Waste Log & Deduct Stock
              </Button>
            </div>

            {/* Waste History */}
            <div className="rounded-xl border border-border overflow-hidden bg-card">
              <div className="grid grid-cols-12 bg-muted/60 px-3 py-2 text-xs font-bold text-muted-foreground border-b border-border">
                <div className="col-span-3">Time</div>
                <div className="col-span-4">Ingredient</div>
                <div className="col-span-3">Reason</div>
                <div className="col-span-2 text-right">Cost</div>
              </div>
              <div className="divide-y divide-border/60 max-h-48 overflow-y-auto">
                {wasteLogs.map((w) => (
                  <div key={w.id} className="grid grid-cols-12 px-3 py-2 text-xs items-center">
                    <div className="col-span-3 text-muted-foreground font-mono">{w.ts}</div>
                    <div className="col-span-4 font-bold text-foreground">{w.qty} {w.unit} {w.ingredient_name}</div>
                    <div className="col-span-3 text-rose-600 dark:text-rose-400 font-medium">{w.reason}</div>
                    <div className="col-span-2 text-right font-mono font-bold text-foreground">{fmtBDT(w.cost)}</div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="border-t pt-3">
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Close Stock View
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
