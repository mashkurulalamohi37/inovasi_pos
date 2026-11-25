import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { PermissionGate } from "@/components/pulse/gates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Scale, Barcode, Save, Download, FileSpreadsheet, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { superShopCatalog } from "@/lib/super-shop-data";
import { fmtBDT } from "@/lib/pos-data";

export const Route = createFileRoute("/app/super-shop/scale-station")({
  component: SuperShopScaleStationPage,
});

function SuperShopScaleStationPage() {
  const [prefix, setPrefix] = useState("20");
  const [pluDigits, setPluDigits] = useState("4");
  const [valueType, setValueType] = useState("weight");
  const [decimalPlaces, setDecimalPlaces] = useState("3");

  const [tarePresets, setTarePresets] = useState([
    { id: "tp-1", name: "Produce Poly Bag", grams: 10 },
    { id: "tp-2", name: "Poultry Bag", grams: 15 },
    { id: "tp-3", name: "Rigid Meat Container", grams: 25 },
    { id: "tp-4", name: "Fish Foil Box", grams: 35 },
  ]);

  const weighableItems = superShopCatalog.filter((x) => x.isWeighable);

  const saveConfig = () => {
    toast.success("Scale label format and calibration updated successfully");
  };

  const exportPluList = () => {
    toast.success(`Exported ${weighableItems.length} PLU items for CAS / DIGI / Mettler scales`);
  };

  return (
    <PermissionGate perm="super-shop.manage">
      <PageHeader
        title="Weighing Scale & Barcode Label Station"
        subtitle="Configure scale-embedded barcode prefixes, tare deduction presets, and export PLU catalogs"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportPluList} className="gap-1.5 text-xs">
              <Download className="h-3.5 w-3.5" /> Export Scale PLUs
            </Button>
            <Button size="sm" onClick={saveConfig} className="gap-1.5 text-xs">
              <Save className="h-3.5 w-3.5" /> Save Configuration
            </Button>
          </div>
        }
      />

      <PageBody>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Label Barcode Format Configuration */}
          <SectionCard>
            <h3 className="font-semibold text-base flex items-center gap-2 mb-1">
              <Barcode className="h-4 w-4 text-emerald-600" /> Embedded Barcode Parsing Format
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Defines how the checkout scanner extracts the product PLU and weight or price from pre-packed scale labels.
            </p>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Barcode Prefix (EAN-13)</Label>
                  <Input
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                    className="h-9 text-xs font-mono"
                    placeholder="e.g. 20 or 21"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">PLU Digits Count</Label>
                  <Select value={pluDigits} onValueChange={setPluDigits}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="PLU digits" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="4">4 Digits (e.g. 4011)</SelectItem>
                      <SelectItem value="5">5 Digits (e.g. 04011)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Embedded Value Type</Label>
                  <Select value={valueType} onValueChange={setValueType}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Value type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weight">Weight-embedded (e.g. 01.350 kg)</SelectItem>
                      <SelectItem value="price">Price-embedded (e.g. ৳01147.00)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Decimal Precision</Label>
                  <Select value={decimalPlaces} onValueChange={setDecimalPlaces}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Decimals" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">3 Decimals (kg / grams)</SelectItem>
                      <SelectItem value="2">2 Decimals (currency cents)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Live Barcode Template Visualizer */}
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 text-xs font-mono">
                <span className="text-muted-foreground block text-[11px] font-sans font-medium mb-1">
                  Generated EAN-13 Pattern:
                </span>
                <div className="flex items-center gap-1 text-sm font-bold text-emerald-700 dark:text-emerald-300">
                  <span className="bg-emerald-500/20 px-1.5 py-0.5 rounded" title="Prefix">
                    {prefix}
                  </span>
                  <span className="bg-blue-500/20 px-1.5 py-0.5 rounded text-blue-700 dark:text-blue-300" title="PLU">
                    {"X".repeat(parseInt(pluDigits, 10))}
                  </span>
                  <span className="bg-amber-500/20 px-1.5 py-0.5 rounded text-amber-700 dark:text-amber-300" title="Weight / Price">
                    {"W".repeat(12 - parseInt(prefix.length.toString(), 10) - parseInt(pluDigits, 10))}
                  </span>
                  <span className="bg-slate-500/20 px-1.5 py-0.5 rounded text-muted-foreground" title="Checksum">
                    C
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2 font-sans">
                  Example: <code>{prefix}401101350C</code> resolves to PLU <b>4011</b> weighing <b>1.350 kg</b>.
                </p>
              </div>
            </div>
          </SectionCard>

          {/* Tare Presets */}
          <SectionCard>
            <h3 className="font-semibold text-base flex items-center gap-2 mb-1">
              <Scale className="h-4 w-4 text-emerald-600" /> Automatic Tare Presets
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Container deductions applied automatically when weighing loose or packaging fresh items.
            </p>

            <div className="space-y-2">
              {tarePresets.map((tp) => (
                <div key={tp.id} className="flex items-center justify-between p-2.5 rounded-lg border border-border/70 text-xs">
                  <span className="font-semibold">{tp.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-primary">{tp.grams} g</span>
                    <span className="text-[10px] text-muted-foreground">({(tp.grams / 1000).toFixed(3)} kg)</span>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        {/* Weighable Items & PLU Directory Table */}
        <SectionCard className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-base">Active PLU Catalog for Scale Counters</h3>
              <p className="text-xs text-muted-foreground">List of loose produce and fresh meat mapped to PLU numbers.</p>
            </div>
            <Badge variant="outline">{weighableItems.length} PLU items</Badge>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-border bg-secondary/20 text-muted-foreground font-semibold">
                  <th className="py-2.5 px-3">PLU</th>
                  <th className="py-2.5 px-3">Product Name</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Rate / Kg</th>
                  <th className="py-2.5 px-3">Default Tare</th>
                  <th className="py-2.5 px-3">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {weighableItems.map((item) => (
                  <tr key={item.sku} className="hover:bg-secondary/10">
                    <td className="py-2.5 px-3 font-mono font-bold text-primary">{item.pluCode || "—"}</td>
                    <td className="py-2.5 px-3 font-medium">{item.name}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{item.category}</td>
                    <td className="py-2.5 px-3 font-semibold">{fmtBDT(item.ratePerKg || item.price)}</td>
                    <td className="py-2.5 px-3 font-mono">{item.tareWeightGrams || 15} g</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{item.shelfLocation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </PageBody>
    </PermissionGate>
  );
}
