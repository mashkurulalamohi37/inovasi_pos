import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/pulse/primitives";
import { LoadingState, ErrorState, EmptyState } from "@/components/pulse/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Plus, Search, RefreshCw, ShieldCheck } from "lucide-react";
import { fmtBDT } from "@/lib/pos-data";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useJewelryProfiles } from "@/hooks/use-industry-data";
import { useCreateJewelryProfile } from "@/hooks/use-industry-backoffice";
import { jewelryProfilesMock, type JewelryProfileMock } from "@/lib/industry-mock";

export const Route = createFileRoute("/app/jewelry/profiles")({
  component: JewelryProfiles,
});

/** Sentinel for "no karat filter" — Radix Select cannot use "" as an item value. */
const ALL_KARATS = "all";

/** Display shape the table renders, normalised from either data source. */
type ProfileRow = {
  key: string;
  sku: string;
  name: string;
  metal: string;
  karat: string;
  grossWeight: number;
  netWeight: number;
  makingCharge: number;
  wastagePct: number;
  certificate?: string;
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const str = (v: unknown): string => (v == null ? "" : String(v));

/** Maps a row from `GET /industry/jewelry/profiles` (see `_profile_out`). */
function apiToRow(p: Record<string, unknown>): ProfileRow {
  return {
    key: str(p.id) || str(p.product_id),
    sku: str(p.product_sku) || "—",
    name: str(p.product_name) || "—",
    metal: str(p.metal_type) || "Gold",
    karat: str(p.karat) || "22K",
    grossWeight: num(p.gross_weight),
    netWeight: num(p.net_metal_weight),
    makingCharge: num(p.making_charge_rate),
    wastagePct: num(p.wastage_percentage),
    certificate: str(p.tag_no) || undefined,
  };
}

function mockToRow(p: JewelryProfileMock): ProfileRow {
  return {
    key: p.id,
    sku: p.sku,
    name: p.name,
    metal: p.metal,
    karat: p.karat,
    grossWeight: p.grossWeight,
    netWeight: p.netWeight,
    makingCharge: p.makingCharge,
    wastagePct: p.wastagePct,
    certificate: p.certificate_no,
  };
}

function JewelryProfiles() {
  const useApi = shouldUseBackend();
  const [q, setQ] = useState("");
  const [karatFilter, setKaratFilter] = useState(ALL_KARATS);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state
  const [form, setForm] = useState({
    productId: "",
    metal_type: "Gold",
    karat: "22K",
    gross_weight_grams: "",
    net_metal_weight: "",
    stone_weight_grams: "0",
    making_charge_type: "per_gram",
    making_charge_rate: "",
    wastage_percentage: "2.5",
    stone_value: "0",
    certificate_no: "",
  });

  // Radix Select reserves "" for the cleared state and throws on an item that
  // uses it, so the "all" sentinel is mapped back to undefined here.
  const {
    data: apiProfiles,
    isLoading,
    isError,
    refetch,
  } = useJewelryProfiles({
    karat: karatFilter === ALL_KARATS ? undefined : karatFilter || undefined,
    q: q || undefined,
  });

  const createProfile = useCreateJewelryProfile();

  // One row shape for both sources. The table used to cast API rows to the mock
  // type and then read snake_case fields off it, so every API column rendered as
  // "0" or "—" while TypeScript reported the mismatch.
  const rows: ProfileRow[] = useApi
    ? ((apiProfiles as Array<Record<string, unknown>> | undefined) ?? []).map(apiToRow)
    : jewelryProfilesMock
        .filter((p) => {
          if (karatFilter && karatFilter !== ALL_KARATS && p.karat !== karatFilter) return false;
          if (q) {
            const hay = `${p.sku} ${p.name} ${p.karat} ${p.certificate_no ?? ""}`.toLowerCase();
            if (!hay.includes(q.toLowerCase())) return false;
          }
          return true;
        })
        .map(mockToRow);

  const resetForm = () =>
    setForm({
      productId: "",
      metal_type: "Gold",
      karat: "22K",
      gross_weight_grams: "",
      net_metal_weight: "",
      stone_weight_grams: "0",
      making_charge_type: "per_gram",
      making_charge_rate: "",
      wastage_percentage: "2.5",
      stone_value: "0",
      certificate_no: "",
    });

  const handleSave = async () => {
    if (!form.productId && useApi) {
      toast.error("Product ID required");
      return;
    }
    try {
      if (useApi) {
        await createProfile.mutateAsync({
          productId: form.productId,
          // Field names must match what jewelry_service.upsert_product_profile
          // reads. Posting the `_grams` spellings left gross at 0 server-side and
          // every save came back 400.
          body: {
            metal_type: form.metal_type,
            karat: form.karat,
            purity: form.karat,
            gross_weight: parseFloat(form.gross_weight_grams) || 0,
            net_metal_weight: parseFloat(form.net_metal_weight) || 0,
            stone_weight: parseFloat(form.stone_weight_grams) || 0,
            making_charge_type: form.making_charge_type,
            making_charge_rate: parseFloat(form.making_charge_rate) || 0,
            wastage_percentage: parseFloat(form.wastage_percentage) || 0,
            default_stone_value: parseFloat(form.stone_value) || 0,
            tag_no: form.certificate_no || undefined,
          },
        });
        toast.success("Jewelry profile saved");
      } else {
        jewelryProfilesMock.unshift({
          id: `demo-${Date.now()}`,
          sku: `JW-${Math.floor(Math.random() * 900 + 100)}`,
          name: form.certificate_no ? `Custom Item (${form.karat})` : `Gold Item (${form.karat})`,
          metal: form.metal_type,
          karat: form.karat,
          grossWeight: parseFloat(form.gross_weight_grams) || 0,
          netWeight: parseFloat(form.net_metal_weight) || 0,
          stoneWeight: parseFloat(form.stone_weight_grams) || 0,
          makingCharge: parseFloat(form.making_charge_rate) || 0,
          wastagePct: parseFloat(form.wastage_percentage) || 0,
          stoneValue: parseFloat(form.stone_value) || 0,
          certificate_no: form.certificate_no || undefined,
        });
        toast.success("Jewelry tag profile added (Demo mode)");
      }
      setDialogOpen(false);
      resetForm();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to save profile");
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Jewelry Tagged Profiles"
        subtitle="Weight, Karat, Making Charge & Certificate tagging for jewelry inventory"
        eyebrow="Jewelry"
        actions={
          <Button
            onClick={() => {
              resetForm();
              setDialogOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="w-4 h-4" /> Tag New Product
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search tag, SKU, certificate…"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select value={karatFilter} onValueChange={setKaratFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All purity / karat" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_KARATS}>All purity / karat</SelectItem>
            <SelectItem value="24K">24K Gold</SelectItem>
            <SelectItem value="22K">22K Gold</SelectItem>
            <SelectItem value="21K">21K Gold</SelectItem>
            <SelectItem value="18K">18K Gold</SelectItem>
            <SelectItem value="925">925 Silver</SelectItem>
          </SelectContent>
        </Select>
        {useApi && (
          <Button variant="ghost" size="icon" onClick={() => refetch()} title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Header and filters stay mounted while data loads — replacing the whole
          page on every refetch discarded the user's typed search. */}
      {useApi && isLoading ? (
        <LoadingState />
      ) : useApi && isError ? (
        <ErrorState onRetry={refetch} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No tagged jewelry profiles found"
          description="Tag a product with its weight, karat and making charge to price it at the counter."
        />
      ) : (
        <SectionCard title={`${rows.length} tagged profile${rows.length !== 1 ? "s" : ""}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border/50 text-xs uppercase text-muted-foreground">
                  <th className="pb-3 pr-4 font-medium">SKU / Tag</th>
                  <th className="pb-3 pr-4 font-medium">Item Name</th>
                  <th className="pb-3 pr-4 font-medium">Metal & Karat</th>
                  <th className="pb-3 pr-4 font-medium">Gross / Net Wt</th>
                  <th className="pb-3 pr-4 font-medium">Making Charge</th>
                  <th className="pb-3 pr-4 font-medium">Wastage %</th>
                  <th className="pb-3 font-medium">Certificate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {rows.map((p, i) => {
                  return (
                    // No row action exists here, so the row is not given a button
                    // role — announcing one that cannot be operated is worse for
                    // assistive tech than plain rows, and it swallowed Space-scroll.
                    <tr key={p.key || String(i)} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 pr-4 font-mono text-xs font-semibold">{p.sku}</td>
                      <td className="py-3 pr-4">{p.name}</td>
                      <td className="py-3 pr-4">
                        <Badge variant="outline" className="text-xs">
                          {p.metal} · {p.karat}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs">
                        {p.grossWeight.toFixed(2)}g /{" "}
                        <span className="font-semibold text-amber-500">
                          {p.netWeight.toFixed(2)}g
                        </span>
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs">{fmtBDT(p.makingCharge)}/g</td>
                      <td className="py-3 pr-4 text-xs font-mono">{p.wastagePct}%</td>
                      <td className="py-3 text-xs">
                        {p.certificate ? (
                          <Badge variant="success" className="text-[10px] gap-1">
                            <ShieldCheck className="w-3 h-3" /> {p.certificate}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Tag Jewelry Profile</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {useApi && (
              <div className="space-y-1">
                <Label>Product ID *</Label>
                <Input
                  placeholder="Product UUID"
                  value={form.productId}
                  onChange={(e) => setForm((p) => ({ ...p, productId: e.target.value }))}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Metal Type</Label>
                <Select
                  value={form.metal_type}
                  onValueChange={(v) => setForm((p) => ({ ...p, metal_type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Gold">Gold</SelectItem>
                    <SelectItem value="Silver">Silver</SelectItem>
                    <SelectItem value="Platinum">Platinum</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Purity / Karat</Label>
                <Select
                  value={form.karat}
                  onValueChange={(v) => setForm((p) => ({ ...p, karat: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24K">24K Gold</SelectItem>
                    <SelectItem value="22K">22K Gold</SelectItem>
                    <SelectItem value="21K">21K Gold</SelectItem>
                    <SelectItem value="18K">18K Gold</SelectItem>
                    <SelectItem value="925">925 Silver</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Gross Wt (g) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={form.gross_weight_grams}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      gross_weight_grams: e.target.value,
                      net_metal_weight: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Net Wt (g) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={form.net_metal_weight}
                  onChange={(e) => setForm((p) => ({ ...p, net_metal_weight: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Stone Wt (g)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={form.stone_weight_grams}
                  onChange={(e) => setForm((p) => ({ ...p, stone_weight_grams: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Making Charge (৳/g)</Label>
                <Input
                  type="number"
                  placeholder="650"
                  value={form.making_charge_rate}
                  onChange={(e) => setForm((p) => ({ ...p, making_charge_rate: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Wastage (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="2.5"
                  value={form.wastage_percentage}
                  onChange={(e) => setForm((p) => ({ ...p, wastage_percentage: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Stone Val (৳)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={form.stone_value}
                  onChange={(e) => setForm((p) => ({ ...p, stone_value: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Hallmark Certificate No.</Label>
              <Input
                placeholder="e.g. CERT-JW-8821"
                value={form.certificate_no}
                onChange={(e) => setForm((p) => ({ ...p, certificate_no: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={createProfile.isPending}>
              {createProfile.isPending ? "Saving…" : "Save Profile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
