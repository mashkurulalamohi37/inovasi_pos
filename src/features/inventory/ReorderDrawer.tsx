import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApiStores, useApiSuppliers, useReorderPurchase } from "@/hooks/use-api-config";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export type ReorderItem = {
  product_id: string;
  sku: string;
  name: string;
  qty_on_hand: number;
  qty_available: number;
  reorder_point: number;
  suggested_qty?: number;
  unit_cost?: number;
};

export function ReorderDrawer({
  open,
  onOpenChange,
  item,
  defaultStoreId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ReorderItem | null;
  defaultStoreId?: string;
}) {
  const navigate = useNavigate();
  const { data: suppliers } = useApiSuppliers();
  const { data: stores } = useApiStores();
  const reorder = useReorderPurchase();
  const [supplierId, setSupplierId] = useState("");
  const [storeId, setStoreId] = useState(defaultStoreId ?? "");
  const [qty, setQty] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [expectedDate, setExpectedDate] = useState("");

  useEffect(() => {
    if (!open || !item) return;
    const deficit = Math.max(0, item.reorder_point - item.qty_available);
    const suggested = item.suggested_qty ?? Math.max(deficit, item.reorder_point);
    setQty(String(Math.max(1, Math.ceil(suggested))));
    setUnitCost(item.unit_cost != null ? String(item.unit_cost) : "");
    setStoreId(defaultStoreId ?? "");
    setSupplierId("");
    setExpectedDate("");
  }, [open, item, defaultStoreId]);

  const handleSubmit = async () => {
    if (!item) return;
    const po = await reorder.mutateAsync({
      product_id: item.product_id,
      store_id: storeId || undefined,
      supplier_id: supplierId || undefined,
      qty: Number(qty),
      unit_cost: unitCost ? Number(unitCost) : undefined,
      expected_date: expectedDate || undefined,
    });
    onOpenChange(false);
    if (po?.id) {
      navigate({ to: "/app/purchases/$purchaseId", params: { purchaseId: po.id } });
    }
  };

  if (!item) return null;

  return (
    <EntityFormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Reorder — create draft PO"
      description={`${item.sku} · ${item.name}`}
      onSubmit={handleSubmit}
      isPending={reorder.isPending}
      submitLabel="Create draft PO"
      submitDisabled={!qty || Number(qty) <= 0 || !storeId}
    >
      <div className="rounded-lg border border-border bg-secondary/30 p-3 text-sm space-y-1">
        <div className="flex justify-between"><span className="text-muted-foreground">On hand</span><span className="tabular">{item.qty_on_hand}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Available</span><span className="tabular text-destructive">{item.qty_available}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Reorder point</span><span className="tabular">{item.reorder_point}</span></div>
      </div>
      <div className="space-y-3">
        <div>
          <Label>Store</Label>
          <Select value={storeId} onValueChange={setStoreId}>
            <SelectTrigger><SelectValue placeholder="Select store" /></SelectTrigger>
            <SelectContent>
              {(stores ?? []).filter((s) => s.is_active !== false).map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Supplier (optional)</Label>
          <Select value={supplierId || "__none__"} onValueChange={(v) => setSupplierId(v === "__none__" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— No supplier —</SelectItem>
              {(suppliers ?? []).filter((s) => s.is_active !== false).map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Order qty</Label><Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} /></div>
          <div><Label>Unit cost</Label><Input type="number" min={0} step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="Optional" /></div>
        </div>
        <div><Label>Expected date</Label><Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} /></div>
      </div>
    </EntityFormDrawer>
  );
}
