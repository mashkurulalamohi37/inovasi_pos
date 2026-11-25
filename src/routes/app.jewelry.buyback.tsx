import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useSyncExternalStore } from "react";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { ConfirmActionDialog } from "@/components/pulse/ConfirmActionDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus } from "lucide-react";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useGoldRate, useJewelryBuybacks } from "@/hooks/use-industry-data";
import { useCreateJewelryBuyback, useUpdateJewelryBuyback } from "@/hooks/use-industry-backoffice";
import { fmtBDT } from "@/lib/pos-data";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";
import { toast } from "sonner";

import {
  addDemoBuyback,
  getDemoBuybacks,
  subscribeDemoBuybacks,
  updateDemoBuybackStatus,
  type JewelryBuybackMock,
} from "@/lib/industry-mock";

export const Route = createFileRoute("/app/jewelry/buyback")({ component: Page });

const NEXT: Record<string, string[]> = {
  draft: ["assessed", "cancelled"],
  assessed: ["approved", "cancelled", "draft"],
  approved: ["settled", "cancelled"],
  settled: [],
  cancelled: [],
};

function Page() {
  const useApi = shouldUseBackend();
  const query = useJewelryBuybacks();
  const rate = useGoldRate();
  const create = useCreateJewelryBuyback();
  const update = useUpdateJewelryBuyback();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ id: string; status: string } | null>(null);
  // Subscribed rather than copied into state (no local mock tickets array): a trade-in rung up in the POS
  // mutates the shared demo list, and a snapshot taken at mount never saw it.
  const demoBuybacks = useSyncExternalStore(
    subscribeDemoBuybacks,
    getDemoBuybacks,
    getDemoBuybacks,
  );
  const [form, setForm] = useState({
    customer_name: "",
    metal_type: "Gold",
    purity: "22K",
    gross_weight: "",
    net_metal_weight: "",
    deductions: "0",
    stone_deduction: "0",
    service_deduction: "0",
    certificate_no: "",
    original_invoice_id: "",
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const rows = useMemo(() => {
    if (useApi) return query.data ?? [];
    return demoBuybacks.map((b) => ({
      id: b.id,
      buyback_no: b.buyback_no,
      customer_name: b.customer_name,
      metal_type: b.metal_type,
      purity: b.karat,
      net_metal_weight: b.net_weight,
      applicable_buy_rate: b.offered_rate,
      final_buyback_value: b.final_amount,
      status: b.status,
    }));
  }, [useApi, query.data, demoBuybacks]);

  const buyRate =
    rate.data?.buying_rate ??
    Math.round((rate.data?.selling_rate ?? rate.data?.rate_per_gram ?? 11750) * 0.92);

  const submit = async () => {
    const next: Record<string, string> = {};
    if (!form.net_metal_weight || Number(form.net_metal_weight) <= 0)
      next.net = "Net metal weight required";
    setErrors(next);
    if (Object.keys(next).length) return;
    try {
      if (useApi) {
        await create.mutateAsync({
          customer_name: form.customer_name.trim() || "Walk-in",
          metal_type: form.metal_type,
          purity: form.purity,
          gross_weight: Number(form.gross_weight || form.net_metal_weight),
          net_metal_weight: Number(form.net_metal_weight),
          deductions: Number(form.deductions || 0),
          stone_deduction: Number(form.stone_deduction || 0),
          service_deduction: Number(form.service_deduction || 0),
          certificate_no: form.certificate_no.trim() || undefined,
          original_invoice_id: form.original_invoice_id.trim() || undefined,
          notes: form.notes.trim() || undefined,
        });
      } else {
        const net = Number(form.net_metal_weight);
        const gross = Number(form.gross_weight || form.net_metal_weight);
        const val = Math.round(net * buyRate - Number(form.deductions || 0));
        const created = addDemoBuyback({
          customer_name: form.customer_name.trim() || "Walk-in",
          metal_type: form.metal_type,
          karat: form.purity,
          gross_weight: gross,
          net_weight: net,
          offered_rate: buyRate,
          purity_deduction_pct: 3,
          final_amount: val,
          status: "draft",
        });
        toast.success(`Buyback Ticket ${created.buyback_no} created (Demo Mode)`);
      }
      setOpen(false);
      setForm({
        customer_name: "",
        metal_type: "Gold",
        purity: "22K",
        gross_weight: "",
        net_metal_weight: "",
        deductions: "0",
        stone_deduction: "0",
        service_deduction: "0",
        certificate_no: "",
        original_invoice_id: "",
        notes: "",
      });
    } catch (e: unknown) {
      toast.error(
        String(
          (e as { detail?: string; message?: string }).detail ??
            (e as Error).message ??
            "Buyback failed",
        ),
      );
    }
  };

  return (
    <BackOfficePage
      title="Jewelry Buyback"
      eyebrow="Jewelry"
      subtitle={
        useApi
          ? "Assessed buy rate · approval · settlement through inventory"
          : "Demo old gold buyback tickets"
      }
      stats={[
        {
          label: "Open",
          value: String(rows.filter((r) => !["settled", "cancelled"].includes(r.status)).length),
        },
        { label: "Buy rate / g", value: fmtBDT(buyRate) },
      ]}
      actions={
        <Button size="sm" className="gap-1" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> New buyback
        </Button>
      }
    >
      <SectionCard title="Buyback tickets">
        {useApi && query.isLoading ? (
          <div className="space-y-2 p-5">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : useApi && query.isError ? (
          <p className="p-5 text-sm text-destructive">Failed to load buybacks.</p>
        ) : rows.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">No buybacks yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div>
                  <div className="font-mono text-sm font-medium">{b.buyback_no}</div>
                  <div className="text-xs text-muted-foreground">
                    {b.customer_name || "—"} · {b.metal_type} {b.purity} · {b.net_metal_weight}g @{" "}
                    {fmtBDT(b.applicable_buy_rate)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums text-sm font-medium">
                    {fmtBDT(b.final_buyback_value)}
                  </span>
                  <StatusBadge status={b.status} />
                  {(NEXT[b.status] ?? []).map((st) => (
                    <Button
                      key={st}
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => {
                        if (useApi) {
                          setConfirm({ id: b.id, status: st });
                        } else {
                          updateDemoBuybackStatus(b.id, st as JewelryBuybackMock["status"]);
                          toast.success(`Ticket ${b.buyback_no} updated to ${st}`);
                        }
                      }}
                    >
                      {st}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <EntityFormDrawer
        open={open}
        onOpenChange={setOpen}
        title="New jewelry buyback"
        description={`Uses buying rate (${fmtBDT(buyRate)}/g), not selling rate.`}
        onSubmit={submit}
        submitLabel="Create draft"
        isPending={create.isPending}
      >
        <Label>Customer name</Label>
        <Input
          value={form.customer_name}
          onChange={(e) => setForm((p) => ({ ...p, customer_name: e.target.value }))}
        />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Metal</Label>
            <Input
              value={form.metal_type}
              onChange={(e) => setForm((p) => ({ ...p, metal_type: e.target.value }))}
            />
          </div>
          <div>
            <Label>Purity</Label>
            <Input
              value={form.purity}
              onChange={(e) => setForm((p) => ({ ...p, purity: e.target.value }))}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Gross weight (g)</Label>
            <Input
              type="number"
              value={form.gross_weight}
              onChange={(e) => setForm((p) => ({ ...p, gross_weight: e.target.value }))}
            />
          </div>
          <div>
            <Label>Net metal weight (g)</Label>
            <Input
              type="number"
              value={form.net_metal_weight}
              onChange={(e) => setForm((p) => ({ ...p, net_metal_weight: e.target.value }))}
            />
            {errors.net && <p className="text-xs text-destructive">{errors.net}</p>}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label>Deductions</Label>
            <Input
              type="number"
              value={form.deductions}
              onChange={(e) => setForm((p) => ({ ...p, deductions: e.target.value }))}
            />
          </div>
          <div>
            <Label>Stone ded.</Label>
            <Input
              type="number"
              value={form.stone_deduction}
              onChange={(e) => setForm((p) => ({ ...p, stone_deduction: e.target.value }))}
            />
          </div>
          <div>
            <Label>Service ded.</Label>
            <Input
              type="number"
              value={form.service_deduction}
              onChange={(e) => setForm((p) => ({ ...p, service_deduction: e.target.value }))}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Original certificate no.</Label>
            <Input
              className="font-mono"
              value={form.certificate_no}
              onChange={(e) => setForm((p) => ({ ...p, certificate_no: e.target.value }))}
              placeholder="Links settle → stock"
            />
          </div>
          <div>
            <Label>Original invoice id</Label>
            <Input
              className="font-mono"
              value={form.original_invoice_id}
              onChange={(e) => setForm((p) => ({ ...p, original_invoice_id: e.target.value }))}
            />
          </div>
        </div>
        <Label>Notes</Label>
        <Input
          value={form.notes}
          onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
        />
      </EntityFormDrawer>

      <ConfirmActionDialog
        open={!!confirm}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={`Mark buyback as ${confirm?.status}?`}
        description={
          confirm?.status === "settled"
            ? "Settlement may restock linked certificate product via inventory service."
            : "Status change is audited."
        }
        confirmLabel="Confirm"
        onConfirm={async () => {
          if (!confirm) return;
          try {
            await update.mutateAsync({
              id: confirm.id,
              body: {
                status: confirm.status,
                settlement_method: confirm.status === "settled" ? "cash" : undefined,
              },
            });
            setConfirm(null);
          } catch (e: unknown) {
            toast.error(
              String(
                (e as { detail?: string; message?: string }).detail ??
                  (e as Error).message ??
                  "Update failed",
              ),
            );
          }
        }}
      />
    </BackOfficePage>
  );
}
