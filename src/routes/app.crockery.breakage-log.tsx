import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { SectionCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { Download, Plus, HeartCrack, AlertTriangle, Filter } from "lucide-react";
import { toast } from "sonner";
import { fmtBDT } from "@/lib/pos-data";
import { readStorage, writeStorage, downloadCsv } from "@/lib/pulse-storage";
import { useAuth } from "@/lib/auth-provider";
import { useApiProducts } from "@/hooks/use-api-config";

export const Route = createFileRoute("/app/crockery/breakage-log")({ component: Page });

export interface CrockeryBreakageRecord {
  id: string;
  sku: string;
  itemName: string;
  category: string;
  material: string;
  qty: number;
  unitCost: number;
  totalLoss: number;
  reason: string;
  notes: string;
  recordedBy: string;
  recordedAt: string;
}

const DEFAULT_BREAKAGE_RECORDS: CrockeryBreakageRecord[] = [];

const STORAGE_KEY = "pulse_crockery_breakage_logs";

function Page() {
  const [records, setRecords] = useState<CrockeryBreakageRecord[]>(() => {
    const raw = readStorage<CrockeryBreakageRecord[]>(STORAGE_KEY, DEFAULT_BREAKAGE_RECORDS);
    // Purge legacy hardcoded demo records
    const clean = raw.filter(
      (r) => !r.id.startsWith("BRK-2026-00") && !r.recordedBy?.includes("Aura")
    );
    if (clean.length !== raw.length) {
      writeStorage(STORAGE_KEY, clean);
    }
    return clean;
  });

  const [selectedReasonFilter, setSelectedReasonFilter] = useState("All");

  const totalLoss = records.reduce((s, r) => s + r.totalLoss, 0);
  const totalItemsBroken = records.reduce((s, r) => s + r.qty, 0);

  const filtered = selectedReasonFilter === "All"
    ? records
    : records.filter(r => r.reason === selectedReasonFilter);

  const exportCsv = () => {
    downloadCsv(
      "crockery-breakage-loss.csv",
      ["Log ID", "Item SKU", "Item Name", "Material", "Qty", "Total Loss", "Reason", "Logged By", "Date"],
      filtered.map(r => [
        r.id,
        r.sku,
        r.itemName,
        r.material,
        String(r.qty),
        String(r.totalLoss),
        r.reason,
        r.recordedBy,
        r.recordedAt,
      ])
    );
    toast.success("Breakage log CSV exported");
  };

  const handleCreate = (entry: Omit<CrockeryBreakageRecord, "id" | "recordedAt">) => {
    const newRecord: CrockeryBreakageRecord = {
      ...entry,
      id: `BRK-2026-${String(records.length + 1).padStart(3, "0")}`,
      recordedAt: new Date().toISOString().replace("T", " ").slice(0, 16),
    };
    const updated = [newRecord, ...records];
    setRecords(updated);
    writeStorage(STORAGE_KEY, updated);
    toast.success(`Breakage written off: ${entry.itemName} (${entry.qty} pcs)`);
  };

  return (
    <BackOfficePage
      title="Breakage & Damage Logs"
      subtitle="In-store fragile damage, display drop records, and inventory loss write-offs"
      eyebrow="Crockery & Kitchenware"
      stats={[
        { label: "Total Loss Value", value: fmtBDT(totalLoss) },
        { label: "Broken Items Written-Off", value: `${totalItemsBroken} pcs` },
        { label: "Audit Incidents", value: String(records.length) },
      ]}
      actions={
        <>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
          <BreakageForm onSave={handleCreate} />
        </>
      }
    >
      <SectionCard
        title="Fragile Loss Audit Records"
        description="All recorded damage incidents with shrinkage deduction tracking"
        actions={
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <Select value={selectedReasonFilter} onValueChange={setSelectedReasonFilter}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue placeholder="Filter by Reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Reasons</SelectItem>
                <SelectItem value="Customer Dropped on Display">Customer Dropped</SelectItem>
                <SelectItem value="Chipped Rim in Transit">Chipped in Transit</SelectItem>
                <SelectItem value="Defective Glaze / Crack">Defective Glaze</SelectItem>
                <SelectItem value="Handling / Shelf Drop">Shelf Drop</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      >
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            <HeartCrack className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <div className="font-semibold text-foreground text-base">No Breakage Incidents Recorded</div>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              Your inventory is clean. When broken, dropped, or transit-damaged items occur, use the "Record Breakage Loss" button to log write-offs.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-5 py-2.5 text-left">Incident / Date</th>
                  <th className="px-3 py-2.5 text-left">Product & SKU</th>
                  <th className="px-3 py-2.5 text-left">Material</th>
                  <th className="px-3 py-2.5 text-center">Qty</th>
                  <th className="px-3 py-2.5 text-right">Total Loss</th>
                  <th className="px-3 py-2.5 text-left">Damage Reason</th>
                  <th className="px-5 py-2.5 text-left">Logged By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-mono text-xs font-semibold text-foreground">{r.id}</div>
                      <div className="text-[11px] text-muted-foreground">{r.recordedAt}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium text-foreground">{r.itemName}</div>
                      <div className="text-[11px] font-mono text-muted-foreground">{r.sku} · {r.category}</div>
                      {r.notes && <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5 italic">"{r.notes}"</div>}
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="outline" className="text-[11px] bg-secondary/30">
                        {r.material}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-center font-bold text-rose-600">
                      -{r.qty}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold font-mono text-foreground">
                      {fmtBDT(r.totalLoss)}
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="secondary" className="text-[11px] gap-1 bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-200">
                        <AlertTriangle className="h-3 w-3" />
                        {r.reason}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">
                      {r.recordedBy}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </BackOfficePage>
  );
}

function BreakageForm({
  onSave,
}: {
  onSave: (entry: Omit<CrockeryBreakageRecord, "id" | "recordedAt">) => void;
}) {
  const auth = useAuth();
  const { data: prodData } = useApiProducts({ status: "active" });
  const liveItems = prodData?.items ?? [];

  const [open, setOpen] = useState(false);
  const [selectedSku, setSelectedSku] = useState("");
  const [customItemName, setCustomItemName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("Customer Dropped on Display");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (liveItems.length > 0 && !selectedSku) {
      setSelectedSku(liveItems[0].sku);
    }
  }, [liveItems, selectedSku]);

  const selectedItem = liveItems.find((i) => i.sku === selectedSku);
  const currentPrice = selectedItem ? selectedItem.base_price : (parseFloat(customPrice) || 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = parseInt(qty) || 1;
    const operatorName = auth.user?.full_name || auth.user?.email || "Store Staff";

    if (selectedItem) {
      onSave({
        sku: selectedItem.sku,
        itemName: selectedItem.name,
        category: selectedItem.industry_pack || "Crockery",
        material: String(selectedItem.meta?.material || "Ceramic"),
        qty: q,
        unitCost: selectedItem.base_price,
        totalLoss: selectedItem.base_price * q,
        reason,
        notes,
        recordedBy: operatorName,
      });
    } else if (customItemName.trim()) {
      const price = parseFloat(customPrice) || 0;
      onSave({
        sku: selectedSku.trim() || `CRK-${Date.now().toString().slice(-4)}`,
        itemName: customItemName.trim(),
        category: "Crockery",
        material: "Ceramic",
        qty: q,
        unitCost: price,
        totalLoss: price * q,
        reason,
        notes,
        recordedBy: operatorName,
      });
    } else {
      toast.error("Please select a product");
      return;
    }

    setOpen(false);
    setQty("1");
    setNotes("");
  };

  return (
    <>
      <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> Record Breakage Loss
      </Button>

      <EntityFormDrawer
        open={open}
        onOpenChange={setOpen}
        title="Record In-Store Breakage / Damage Write-Off"
        description="Deduct cracked, dropped, or damaged fragile tableware from stock and log loss."
      >
        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Select Damaged Item</Label>
            {liveItems.length > 0 ? (
              <Select value={selectedSku} onValueChange={setSelectedSku}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Choose product from catalog" />
                </SelectTrigger>
                <SelectContent>
                  {liveItems.map((item) => (
                    <SelectItem key={item.sku} value={item.sku}>
                      {item.name} ({item.sku}) · {fmtBDT(item.base_price)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="space-y-2">
                <Input
                  placeholder="Item Name (e.g. Opal Glass Dinner Plate)"
                  value={customItemName}
                  onChange={(e) => setCustomItemName(e.target.value)}
                  className="text-xs"
                  required
                />
                <Input
                  placeholder="Unit Price / Cost (৳)"
                  type="number"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  className="text-xs font-mono"
                  required
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Damaged Quantity</Label>
              <Input
                type="number"
                min="1"
                max="50"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="text-xs font-mono"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Estimated Loss Value</Label>
              <Input
                disabled
                value={fmtBDT(currentPrice * (parseInt(qty) || 1))}
                className="text-xs font-mono font-bold bg-muted"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Damage Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Customer Dropped on Display">Customer Dropped on Display</SelectItem>
                <SelectItem value="Chipped Rim in Transit">Chipped Rim in Transit</SelectItem>
                <SelectItem value="Defective Glaze / Crack">Defective Glaze / Crack</SelectItem>
                <SelectItem value="Handling / Shelf Drop">Handling / Shelf Drop</SelectItem>
                <SelectItem value="Unboxed Broken Piece">Unboxed Broken Piece</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Audit Notes / Witness</Label>
            <Input
              placeholder="e.g. Broken near Display Shelf during packing"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-xs"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="bg-rose-600 hover:bg-rose-700 text-white gap-1.5">
              <HeartCrack className="h-3.5 w-3.5" /> Confirm Write-Off
            </Button>
          </div>
        </form>
      </EntityFormDrawer>
    </>
  );
}

