import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { PermissionGate } from "@/components/pulse/gates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Zap, Monitor, Sliders, Plus, Edit2, ShieldAlert, Check } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_FAST_KEYS, type FastKeyItem } from "@/lib/super-shop-data";

export const Route = createFileRoute("/app/super-shop/lanes")({
  component: SuperShopLanesPage,
});

export type LaneProfile = {
  id: string;
  name: string;
  laneType: "express" | "standard" | "fresh_counter";
  maxItemsExpress: number;
  cashDrawerLimit: number;
  blindCloseEnabled: boolean;
  scannerScaleConnected: boolean;
};

const DEFAULT_LANES: LaneProfile[] = [
  {
    id: "lane-1",
    name: "Lane 01 · Express Checkout",
    laneType: "express",
    maxItemsExpress: 10,
    cashDrawerLimit: 30000,
    blindCloseEnabled: true,
    scannerScaleConnected: false,
  },
  {
    id: "lane-2",
    name: "Lane 02 · General Hypermarket Counter",
    laneType: "standard",
    maxItemsExpress: 0,
    cashDrawerLimit: 50000,
    blindCloseEnabled: true,
    scannerScaleConnected: true,
  },
  {
    id: "lane-3",
    name: "Lane 03 · Butchery & Produce Counter",
    laneType: "fresh_counter",
    maxItemsExpress: 0,
    cashDrawerLimit: 40000,
    blindCloseEnabled: true,
    scannerScaleConnected: true,
  },
];

function SuperShopLanesPage() {
  const [lanes, setLanes] = useState<LaneProfile[]>(DEFAULT_LANES);
  const [fastKeys, setFastKeys] = useState<FastKeyItem[]>(DEFAULT_FAST_KEYS);
  const [editingKey, setEditingKey] = useState<FastKeyItem | null>(null);
  const [keyLabel, setKeyLabel] = useState("");
  const [keySubLabel, setKeySubLabel] = useState("");
  const [keySku, setKeySku] = useState("");
  const [keyColor, setKeyColor] = useState("#64748b");

  const openKeyEditor = (fk: FastKeyItem) => {
    setEditingKey(fk);
    setKeyLabel(fk.label);
    setKeySubLabel(fk.subLabel || "");
    setKeySku(fk.sku);
    setKeyColor(fk.color || "#64748b");
  };

  const saveFastKey = () => {
    if (!editingKey) return;
    if (!keyLabel.trim()) {
      toast.error("Button label is required");
      return;
    }
    const updated = fastKeys.map((k) =>
      k.id === editingKey.id
        ? {
            ...k,
            label: keyLabel.trim(),
            subLabel: keySubLabel.trim() || undefined,
            sku: keySku.trim().toUpperCase(),
            color: keyColor,
          }
        : k
    );
    setFastKeys(updated);
    toast.success(`Updated fast key: ${keyLabel}`);
    setEditingKey(null);
  };

  return (
    <PermissionGate perm="super-shop.manage">
      <PageHeader
        title="Lanes & Fast-Key Grid Configuration"
        subtitle="Manage lane profiles, drawer pickup thresholds, and customize cashier fast-keys"
      />

      <PageBody>
        {/* Fast Keys Layout Editor Section */}
        <SectionCard className="mb-6">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div>
              <h3 className="font-semibold text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" /> Fast-Key Grid Layout (Page 1)
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Customize touch-screen buttons for high-velocity items and loose produce. Click any button to edit.
              </p>
            </div>
            <Badge variant="outline" className="text-xs">
              {fastKeys.length} Configured Keys
            </Badge>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 pt-4">
            {fastKeys.map((fk) => (
              <button
                key={fk.id}
                type="button"
                onClick={() => openKeyEditor(fk)}
                className="group relative flex flex-col items-center justify-center p-3 rounded-xl border border-border/70 bg-card hover:bg-secondary/40 hover:border-primary/50 text-center transition-all cursor-pointer shadow-xs active:scale-95"
              >
                <div
                  className="h-1.5 w-8 rounded-full mb-1.5"
                  style={{ backgroundColor: fk.color || "#64748b" }}
                />
                <span className="font-semibold text-xs leading-tight">{fk.label}</span>
                <span className="text-[10px] text-muted-foreground mt-0.5">{fk.subLabel || fk.sku}</span>
                <Edit2 className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 absolute top-1.5 right-1.5 transition-opacity" />
              </button>
            ))}
          </div>
        </SectionCard>

        {/* Lane Profiles Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-base flex items-center gap-2">
              <Monitor className="h-4 w-4 text-primary" /> Active Counter Lane Profiles
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {lanes.map((lane) => (
              <SectionCard key={lane.id} className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-sm">{lane.name}</h4>
                    <span className="text-xs font-mono text-muted-foreground capitalize">
                      Type: {lane.laneType.replace(/_/g, " ")}
                    </span>
                  </div>
                  <Badge variant={lane.laneType === "express" ? "default" : "secondary"} className="text-xs">
                    {lane.laneType === "express" ? "Express" : "Standard"}
                  </Badge>
                </div>

                <div className="space-y-2 pt-2 border-t border-border/50 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Drawer Limit:</span>
                    <span className="font-semibold font-mono">৳{lane.cashDrawerLimit.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Scanner-Scale:</span>
                    <span className="font-semibold">
                      {lane.scannerScaleConnected ? "Integrated" : "None"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Blind Count Close:</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">Enabled</span>
                  </div>
                  {lane.laneType === "express" && (
                    <div className="flex justify-between text-amber-600 dark:text-amber-400">
                      <span>Basket Max:</span>
                      <span className="font-bold">{lane.maxItemsExpress} items</span>
                    </div>
                  )}
                </div>
              </SectionCard>
            ))}
          </div>
        </div>
      </PageBody>

      {/* Fast Key Edit Dialog */}
      <Dialog open={!!editingKey} onOpenChange={(open) => !open && setEditingKey(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Edit2 className="h-4 w-4 text-primary" /> Edit Fast-Key Button
            </DialogTitle>
          </DialogHeader>

          {editingKey && (
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Button Label *</Label>
                <Input
                  value={keyLabel}
                  onChange={(e) => setKeyLabel(e.target.value)}
                  placeholder="e.g. Fuji Apples"
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Sub-label / Price Hint</Label>
                <Input
                  value={keySubLabel}
                  onChange={(e) => setKeySubLabel(e.target.value)}
                  placeholder="e.g. PLU 4013 or ৳280"
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Target Product SKU / PLU *</Label>
                <Input
                  value={keySku}
                  onChange={(e) => setKeySku(e.target.value.toUpperCase())}
                  placeholder="e.g. AP-FUJI"
                  className="h-9 text-xs font-mono uppercase"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Accent Color</Label>
                <div className="flex items-center gap-2">
                  {["#ef4444", "#10b981", "#f59e0b", "#3b82f6", "#8b5cf6", "#64748b"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setKeyColor(c)}
                      className="h-6 w-6 rounded-full border border-black/10 flex items-center justify-center transition-transform hover:scale-110 cursor-pointer"
                      style={{ backgroundColor: c }}
                    >
                      {keyColor === c && <Check className="h-3.5 w-3.5 text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              <DialogFooter className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setEditingKey(null)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={saveFastKey}>
                  Save Key
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PermissionGate>
  );
}
