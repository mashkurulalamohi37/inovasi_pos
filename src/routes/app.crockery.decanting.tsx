import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { SectionCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { Boxes, Plus, PackageCheck, ArrowRight, Sparkles, Download, Layers } from "lucide-react";
import { toast } from "sonner";
import { fmtBDT } from "@/lib/pos-data";
import { readStorage, writeStorage, downloadCsv } from "@/lib/pulse-storage";
import { useAuth } from "@/lib/auth-provider";
import { useApiProducts, useApiStock } from "@/hooks/use-api-config";

export const Route = createFileRoute("/app/crockery/decanting")({ component: Page });

export interface DecantConversionLog {
  id: string;
  setSku: string;
  setName: string;
  piecesPerSet: number;
  setsDecanted: number;
  piecesGenerated: number;
  looseItemSku: string;
  looseItemName: string;
  looseRate: number;
  decantedBy: string;
  decantedAt: string;
}

export type DecantableProduct = {
  sku: string;
  name: string;
  category: string;
  brand: string;
  material: string;
  price: number;
  stock: number;
  piecesInSet: number;
  looseItemPrice?: number;
};

const DEFAULT_DECANT_LOGS: DecantConversionLog[] = [];

const STORAGE_KEY = "pulse_crockery_decant_logs";

function Page() {
  const auth = useAuth();
  const { data: prodData } = useApiProducts({ status: "active" });
  const { data: stockData } = useApiStock();

  const stockMap = useMemo(() => {
    const map = new Map<string, number>();
    (stockData ?? []).forEach((s) => map.set(s.product_id, s.qty_available ?? s.qty_on_hand ?? 0));
    return map;
  }, [stockData]);

  const liveItems = prodData?.items ?? [];

  const [logs, setLogs] = useState<DecantConversionLog[]>(() => {
    const raw = readStorage<DecantConversionLog[]>(STORAGE_KEY, DEFAULT_DECANT_LOGS);
    // Purge legacy demo entries
    const clean = raw.filter(
      (l) => !l.id.startsWith("DEC-2026-00") && !l.decantedBy?.includes("Aura")
    );
    if (clean.length !== raw.length) {
      writeStorage(STORAGE_KEY, clean);
    }
    return clean;
  });

  const [setsStockAdjustments, setSetsStockAdjustments] = useState<Record<string, number>>({});
  const [looseStock, setLooseStock] = useState<Record<string, number>>({});

  // Filter products that represent multi-piece sets
  const decantableSets: DecantableProduct[] = useMemo(() => {
    return liveItems
      .filter((p) => {
        const pieces = Number(p.meta?.pieces_in_set ?? 1);
        return pieces > 1 || Boolean(p.meta?.is_decantable);
      })
      .map((p) => {
        const pieces = Number(p.meta?.pieces_in_set ?? 1);
        const loosePrice = Number(p.meta?.loose_item_price) || Math.round((p.base_price / Math.max(1, pieces)) * 1.25);
        return {
          sku: p.sku,
          name: p.name,
          category: p.industry_pack || "Dinnerware",
          brand: String(p.meta?.brand || ""),
          material: String(p.meta?.material || "Ceramic"),
          price: p.base_price,
          stock: stockMap.get(p.id) ?? 0,
          piecesInSet: pieces,
          looseItemPrice: loosePrice,
        };
      });
  }, [liveItems, stockMap]);

  const totalPiecesDecanted = logs.reduce((s, l) => s + l.piecesGenerated, 0);
  const totalSetsDecanted = logs.reduce((s, l) => s + l.setsDecanted, 0);

  const exportCsv = () => {
    downloadCsv(
      "crockery-set-decanting-history.csv",
      ["Log ID", "Set SKU", "Set Name", "Sets Decanted", "Pieces Generated", "Loose Target", "Operator", "Date"],
      logs.map((l) => [
        l.id,
        l.setSku,
        l.setName,
        String(l.setsDecanted),
        String(l.piecesGenerated),
        l.looseItemName,
        l.decantedBy,
        l.decantedAt,
      ])
    );
    toast.success("Decanting history CSV exported");
  };

  const handleDecant = (
    setSku: string,
    setName: string,
    piecesPerSet: number,
    qtySets: number,
    looseSku: string,
    looseName: string,
    loosePrice: number
  ) => {
    const piecesCreated = piecesPerSet * qtySets;
    const operatorName = auth.user?.full_name || auth.user?.email || "Store Staff";
    const newLog: DecantConversionLog = {
      id: `DEC-2026-${String(logs.length + 1).padStart(3, "0")}`,
      setSku,
      setName,
      piecesPerSet,
      setsDecanted: qtySets,
      piecesGenerated: piecesCreated,
      looseItemSku: looseSku,
      looseItemName: looseName,
      looseRate: loosePrice,
      decantedBy: operatorName,
      decantedAt: new Date().toISOString().replace("T", " ").slice(0, 16),
    };

    const updatedLogs = [newLog, ...logs];
    setLogs(updatedLogs);
    writeStorage(STORAGE_KEY, updatedLogs);

    setSetsStockAdjustments((prev) => ({
      ...prev,
      [setSku]: (prev[setSku] ?? 0) - qtySets,
    }));

    setLooseStock((prev) => ({
      ...prev,
      [looseSku]: (prev[looseSku] ?? 0) + piecesCreated,
    }));

    toast.success(`Successfully decanted ${qtySets} set(s) into ${piecesCreated} loose pieces!`);
  };

  return (
    <BackOfficePage
      title="Set Decanting & Open-Stock"
      subtitle="Break down complete dinnerware & drinkware sets into individual loose pieces for replacement sales"
      eyebrow="Crockery & Kitchenware"
      stats={[
        { label: "Decantable Sets in Catalog", value: `${decantableSets.length} Models` },
        { label: "Total Sets Decanted", value: `${totalSetsDecanted} Sets` },
        { label: "Loose Pieces Generated", value: `${totalPiecesDecanted} Pcs` },
      ]}
      actions={
        <>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
          <DecantModal sets={decantableSets} onDecant={handleDecant} />
        </>
      }
    >
      <div className="space-y-6">
        <SectionCard
          title="Convertible Sets & Open-Stock Readiness"
          description="Catalog dinner sets and drinkware packs that can be unboxed into open replacement stock"
        >
          {decantableSets.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              <Boxes className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <div className="font-semibold text-foreground text-base">No Multi-Piece Sets Configured</div>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                To break down full dinner sets or glassware packs into loose individual replacement pieces, ensure your products in Product Master have "Pieces in Set" greater than 1.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-5 py-2.5 text-left">Boxed Set / SKU</th>
                    <th className="px-3 py-2.5 text-left">Material & Brand</th>
                    <th className="px-3 py-2.5 text-center">Set Configuration</th>
                    <th className="px-3 py-2.5 text-right">Boxed Price</th>
                    <th className="px-3 py-2.5 text-right">Loose Unit Rate</th>
                    <th className="px-3 py-2.5 text-center">Boxed Stock</th>
                    <th className="px-5 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {decantableSets.map((set) => {
                    const currentBoxed = Math.max(0, (set.stock ?? 0) + (setsStockAdjustments[set.sku] ?? 0));
                    const pieces = set.piecesInSet ?? 1;
                    const loosePrice = set.looseItemPrice ?? Math.round((set.price / pieces) * 1.25);
                    const looseAvailable = looseStock[`${set.sku}-LOOSE`] ?? 0;

                    return (
                      <tr key={set.sku} className="hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-3">
                          <div className="font-semibold text-foreground">{set.name}</div>
                          <div className="text-[11px] font-mono text-muted-foreground">{set.sku} · {set.category}</div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="text-xs font-medium text-foreground">{set.brand}</div>
                          <Badge variant="outline" className="text-[10px] mt-0.5">{set.material}</Badge>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <Badge variant="secondary" className="font-mono text-xs bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200">
                            {pieces}-Pc Set
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-right font-mono font-semibold text-foreground">
                          {fmtBDT(set.price)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                          {fmtBDT(loosePrice)} / pc
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="font-mono font-bold text-foreground">{currentBoxed} Boxes</span>
                          <div className="text-[10px] text-muted-foreground">({looseAvailable} loose in bin)</div>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <DirectDecantButton
                            set={set}
                            boxedStock={currentBoxed}
                            onDecant={handleDecant}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Decanting Conversion Audit Log"
          description="Historical record of boxed sets opened into loose individual inventory"
        >
          {logs.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Layers className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
              <div className="font-semibold text-foreground">No Sets Decanted Yet</div>
              <p className="text-xs text-muted-foreground mt-1">Open-stock unboxing conversion records will appear here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-5 py-2.5 text-left">Log ID & Date</th>
                    <th className="px-3 py-2.5 text-left">Source Boxed Set</th>
                    <th className="px-3 py-2.5 text-center">Sets Opened</th>
                    <th className="px-3 py-2.5 text-center">Pieces Yielded</th>
                    <th className="px-3 py-2.5 text-left">Target Open Stock SKU</th>
                    <th className="px-5 py-2.5 text-left">Operator</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3">
                        <div className="font-mono text-xs font-semibold text-foreground">{log.id}</div>
                        <div className="text-[11px] text-muted-foreground">{log.decantedAt}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-foreground">{log.setName}</div>
                        <div className="text-[11px] font-mono text-muted-foreground">{log.setSku} ({log.piecesPerSet}-Pc)</div>
                      </td>
                      <td className="px-3 py-3 text-center font-bold text-amber-600">
                        -{log.setsDecanted} Box
                      </td>
                      <td className="px-3 py-3 text-center font-bold text-emerald-600 font-mono">
                        +{log.piecesGenerated} Loose Pcs
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-xs font-medium text-foreground">{log.looseItemName}</div>
                        <div className="text-[11px] font-mono text-muted-foreground">{log.looseItemSku} · {fmtBDT(log.looseRate)} / pc</div>
                      </td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">
                        {log.decantedBy}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </BackOfficePage>
  );
}

function DirectDecantButton({
  set,
  boxedStock,
  onDecant,
}: {
  set: any;
  boxedStock: number;
  onDecant: (
    sku: string,
    name: string,
    pieces: number,
    qty: number,
    looseSku: string,
    looseName: string,
    loosePrice: number
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState("1");
  const pieces = set.piecesInSet ?? 1;
  const loosePrice = set.looseItemPrice ?? Math.round((set.price / pieces) * 1.25);
  const looseSku = set.sku === "CRK-001" ? "CRK-005" : `${set.sku}-LOOSE`;
  const looseName = `Loose Replacement ${set.name.split(" ")[0]} Pieces`;

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    const q = parseInt(qty) || 1;
    onDecant(set.sku, set.name, pieces, q, looseSku, looseName, loosePrice);
    setOpen(false);
    setQty("1");
  };

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setOpen(true)}>
        <Boxes className="h-3 w-3 text-amber-600" /> Decant Set
      </Button>

      <EntityFormDrawer
        open={open}
        onOpenChange={setOpen}
        title={`Decant: ${set.name}`}
        description={`Unbox complete ${pieces}-piece set into open replacement pieces.`}
      >
        <form onSubmit={handleConfirm} className="space-y-4 p-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900 dark:bg-amber-950/40 text-xs">
            <div className="font-semibold text-amber-800 dark:text-amber-300 mb-1">Decanting Formula:</div>
            <div>• 1 Boxed Set ({pieces} Pieces) converts to open replacement stock.</div>
            <div>• Current Boxed Stock: <strong>{boxedStock} Boxes</strong></div>
            <div>• Calculated Loose Selling Rate: <strong>{fmtBDT(loosePrice)} / piece</strong></div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Number of Sets to Unbox</Label>
            <Input
              type="number"
              min="1"
              max={Math.max(1, boxedStock)}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="text-xs font-mono font-bold"
              required
            />
          </div>

          <div className="rounded-lg border border-border p-3 space-y-2 bg-muted/30 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sets Deducted:</span>
              <span className="font-mono font-bold text-rose-600">-{parseInt(qty) || 1} Box</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2">
              <span className="text-muted-foreground">Loose Pieces Generated:</span>
              <span className="font-mono font-bold text-emerald-600">+{(parseInt(qty) || 1) * pieces} Pieces</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2">
              <span className="text-muted-foreground">Total Open-Stock Value:</span>
              <span className="font-mono font-bold text-foreground">{fmtBDT((parseInt(qty) || 1) * pieces * loosePrice)}</span>
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5">
              <PackageCheck className="h-3.5 w-3.5" /> Execute Decanting
            </Button>
          </div>
        </form>
      </EntityFormDrawer>
    </>
  );
}

function DecantModal({
  sets,
  onDecant,
}: {
  sets: any[];
  onDecant: (
    sku: string,
    name: string,
    pieces: number,
    qty: number,
    looseSku: string,
    looseName: string,
    loosePrice: number
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedSku, setSelectedSku] = useState(sets[0]?.sku ?? "");
  const [qty, setQty] = useState("1");

  const selectedSet = sets.find((s) => s.sku === selectedSku);
  const pieces = selectedSet?.piecesInSet ?? 1;
  const loosePrice = selectedSet?.looseItemPrice ?? Math.round(((selectedSet?.price ?? 1000) / pieces) * 1.25);
  const looseSku = selectedSet?.sku === "CRK-001" ? "CRK-005" : `${selectedSet?.sku ?? "ITEM"}-LOOSE`;
  const looseName = `Loose Replacement ${selectedSet?.name?.split(" ")[0] ?? "Items"}`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSet) return;
    const q = parseInt(qty) || 1;
    onDecant(selectedSet.sku, selectedSet.name, pieces, q, looseSku, looseName, loosePrice);
    setOpen(false);
    setQty("1");
  };

  return (
    <>
      <Button size="sm" className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> Decant Boxed Set
      </Button>

      <EntityFormDrawer
        open={open}
        onOpenChange={setOpen}
        title="Decant Complete Set to Open Stock"
        description="Select a complete dinner set or glass pack to convert into individual open-stock pieces."
      >
        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Select Boxed Set</Label>
            <select
              value={selectedSku}
              onChange={(e) => setSelectedSku(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs"
            >
              {sets.map((s) => (
                <option key={s.sku} value={s.sku}>
                  {s.name} ({s.piecesInSet}-Pc Set) · {fmtBDT(s.price)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Quantity of Sets to Decant</Label>
            <Input
              type="number"
              min="1"
              max="20"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="text-xs font-mono font-bold"
              required
            />
          </div>

          {selectedSet && (
            <div className="rounded-lg border border-border p-3 space-y-2 bg-muted/30 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sets Deducted:</span>
                <span className="font-mono font-bold text-rose-600">-{parseInt(qty) || 1} Box</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2">
                <span className="text-muted-foreground">Loose Pieces Generated:</span>
                <span className="font-mono font-bold text-emerald-600">+{(parseInt(qty) || 1) * pieces} Pieces</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2">
                <span className="text-muted-foreground">Loose Retail Rate:</span>
                <span className="font-mono font-bold text-foreground">{fmtBDT(loosePrice)} / pc</span>
              </div>
            </div>
          )}

          <div className="pt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5">
              <PackageCheck className="h-3.5 w-3.5" /> Execute Decanting
            </Button>
          </div>
        </form>
      </EntityFormDrawer>
    </>
  );
}
