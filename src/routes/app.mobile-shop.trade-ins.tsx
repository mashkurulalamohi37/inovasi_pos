import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, PageBody, SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { ConfirmActionDialog } from "@/components/pulse/ConfirmActionDialog";
import { AuditTrailPanel } from "@/components/pulse/AuditTrailPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, ErrorState, LoadingState } from "@/components/pulse/states";
import { PermissionGate } from "@/components/pulse/gates";
import { Plus } from "lucide-react";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useMobileTradeIns } from "@/hooks/use-api-config";
import { useCreateMobileTradeIn, useUpdateMobileTradeInStatus } from "@/hooks/use-industry-backoffice";
import { fmtBDT } from "@/lib/pos-data";
import { toast } from "sonner";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";

export const Route = createFileRoute("/app/mobile-shop/trade-ins")({ component: TradeInsPage });

const NEXT: Record<string, string[]> = {
  draft: ["inspected", "assessed", "cancelled"],
  inspected: ["assessed", "cancelled"],
  assessed: ["approved", "rejected", "cancelled"],
  approved: ["accepted", "settled", "cancelled"],
  accepted: ["settled", "cancelled"],
  settled: [],
  rejected: [],
  cancelled: [],
};

function TradeInsPage() {
  const useApi = shouldUseBackend();
  const query = useMobileTradeIns();
  const create = useCreateMobileTradeIn();
  const update = useUpdateMobileTradeInStatus();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ id: string; status: string; productId?: string } | null>(null);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState({
    brand: "",
    model_name: "",
    variant_description: "",
    imei_1: "",
    imei_2: "",
    serial_no: "",
    condition_grade: "good",
    storage: "",
    assessed_value: "",
    valuation_reason: "",
    notes: "",
  });
  const [intakeProductId, setIntakeProductId] = useState("");
  const [overrideValue, setOverrideValue] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const rows = useMemo(() => (useApi ? query.data ?? [] : []), [useApi, query.data]);

  const submit = async () => {
    if (!form.imei_1.trim() && !form.serial_no.trim()) {
      toast.error("IMEI-1 or serial required");
      return;
    }
    if (!form.assessed_value || Number(form.assessed_value) < 0) {
      toast.error("Assessed value required");
      return;
    }
    try {
      await create.mutateAsync({
        brand: form.brand.trim() || undefined,
        model_name: form.model_name.trim() || undefined,
        variant_description: form.variant_description.trim() || undefined,
        imei_1: form.imei_1.trim() || undefined,
        imei_2: form.imei_2.trim() || undefined,
        serial_no: form.serial_no.trim() || undefined,
        condition_grade: form.condition_grade,
        storage: form.storage.trim() || undefined,
        assessed_value: Number(form.assessed_value),
        valuation_reason: form.valuation_reason.trim() || undefined,
        notes: form.notes.trim() || undefined,
        status: "assessed",
      });
      toast.success("Trade-in created");
      setOpen(false);
      setForm({
        brand: "",
        model_name: "",
        variant_description: "",
        imei_1: "",
        imei_2: "",
        serial_no: "",
        condition_grade: "good",
        storage: "",
        assessed_value: "",
        valuation_reason: "",
        notes: "",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create trade-in");
    }
  };

  const runStatus = async () => {
    if (!confirm) return;
    try {
      const body: Record<string, unknown> = { status: confirm.status };
      if (["accepted", "settled"].includes(confirm.status)) {
        if (!intakeProductId.trim()) {
          toast.error("product_id required to intake trade-in device into stock");
          return;
        }
        body.product_id = intakeProductId.trim();
      }
      if (overrideValue.trim()) {
        body.approved_value = Number(overrideValue);
        body.override_reason = overrideReason.trim();
      }
      await update.mutateAsync({ tradeInId: confirm.id, body });
      toast.success(`Trade-in marked ${confirm.status}`);
      setConfirm(null);
      setOverrideValue("");
      setOverrideReason("");
      setIntakeProductId("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Status update failed");
    }
  };

  if (!useApi) {
    return (
      <>
        <PageHeader title="Trade-ins" subtitle="Backend mode required for live trade-in workflow." />
        <PageBody>
          <EmptyState title="Backend required" description="Trade-in assessment and intake are not available in demo mode." />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Trade-ins"
        subtitle="Manual assessment → approval → stock intake (trade_in_received). No fake market valuation."
      />
      <PageBody>
        <div className="mb-4 flex flex-wrap gap-2">
          <PermissionGate perm="mobile-shop.manage">
            <Button size="sm" className="gap-1" onClick={() => setOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> New trade-in
            </Button>
          </PermissionGate>
          <Link to="/app/mobile-shop/stock" className="self-center text-sm text-primary underline-offset-2 hover:underline">
            Device stock
          </Link>
        </div>
        <SectionCard>
          {query.isLoading ? (
            <LoadingState rows={3} />
          ) : query.isError ? (
            <ErrorState title="Failed to load trade-ins" description="Check mobile.view permission." />
          ) : rows.length === 0 ? (
            <EmptyState title="No trade-ins yet" description="Create a trade-in with IMEI and assessed value." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 text-left">No</th>
                  <th className="px-3 py-2.5 text-left">Device</th>
                  <th className="px-3 py-2.5 text-left">IMEI</th>
                  <th className="px-3 py-2.5 text-right">Assessed</th>
                  <th className="px-3 py-2.5 text-left">Status</th>
                  <th className="px-5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const next = NEXT[String(r.status)] ?? [];
                  return (
                    <tr key={String(r.id)} className="hover:bg-secondary/30">
                      <td className="px-5 py-3 font-mono text-xs">{String(r.trade_in_no)}</td>
                      <td className="px-3 py-3 text-xs">
                        {String(r.brand ?? "")} {String(r.model_name ?? "")}
                        <div className="text-muted-foreground">{String(r.condition_grade ?? "")}</div>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">{String(r.imei_1 ?? r.serial_no ?? "—")}</td>
                      <td className="px-3 py-3 text-right text-xs">
                        {fmtBDT(Number(r.approved_value ?? r.assessed_value ?? 0))}
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={String(r.status) === "settled" ? "completed" : "active"} />
                        <span className="ml-1 text-xs">{String(r.status)}</span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setSelected(r)}>View</Button>
                          {next.map((s) => (
                            <Button
                              key={s}
                              size="sm"
                              variant="outline"
                              onClick={() => setConfirm({ id: String(r.id), status: s })}
                            >
                              {s}
                            </Button>
                          ))}
                          {next.length === 0 && (
                            <DisabledReasonButton label="No actions" reason="Terminal status — no further transitions" />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </SectionCard>
        {selected && (
          <div className="mt-4">
            <AuditTrailPanel
              entries={[
                {
                  id: `${String(selected.id)}-create`,
                  action: "trade_in_created",
                  detail: `Trade-in ${String(selected.trade_in_no)} · status ${String(selected.status)}`,
                },
                ...(selected.approved_by
                  ? [{
                      id: `${String(selected.id)}-approve`,
                      action: "trade_in_approved",
                      actor: String(selected.approved_by),
                      detail: selected.override_reason ? String(selected.override_reason) : undefined,
                    }]
                  : []),
              ]}
            />
          </div>
        )}
      </PageBody>

      <EntityFormDrawer
        open={open}
        onOpenChange={setOpen}
        title="New trade-in"
        description="Manual valuation only — no external market price claim."
        onSubmit={submit}
        isPending={create.isPending}
      >
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Brand</Label><Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></div>
            <div><Label>Model</Label><Input value={form.model_name} onChange={(e) => setForm({ ...form, model_name: e.target.value })} /></div>
          </div>
          <div><Label>Variant</Label><Input value={form.variant_description} onChange={(e) => setForm({ ...form, variant_description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>IMEI-1</Label><Input className="font-mono" value={form.imei_1} onChange={(e) => setForm({ ...form, imei_1: e.target.value })} /></div>
            <div><Label>IMEI-2</Label><Input className="font-mono" value={form.imei_2} onChange={(e) => setForm({ ...form, imei_2: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Condition</Label><Input value={form.condition_grade} onChange={(e) => setForm({ ...form, condition_grade: e.target.value })} /></div>
            <div><Label>Storage</Label><Input value={form.storage} onChange={(e) => setForm({ ...form, storage: e.target.value })} /></div>
          </div>
          <div><Label>Assessed value (BDT)</Label><Input type="number" value={form.assessed_value} onChange={(e) => setForm({ ...form, assessed_value: e.target.value })} /></div>
          <div><Label>Valuation reason</Label><Input value={form.valuation_reason} onChange={(e) => setForm({ ...form, valuation_reason: e.target.value })} /></div>
          <div><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
      </EntityFormDrawer>

      <ConfirmActionDialog
        open={Boolean(confirm)}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm ? `Mark trade-in as ${confirm.status}?` : "Confirm"}
        description="Approval and valuation overrides are audited. Accept/settle requires a mobile product_id for stock intake."
        confirmLabel={confirm?.status ?? "Confirm"}
        onConfirm={runStatus}
        isPending={update.isPending}
      >
        {confirm && ["accepted", "settled"].includes(confirm.status) && (
          <div className="mt-3 space-y-2">
            <Label>Intake product_id (mobile-shop)</Label>
            <Input value={intakeProductId} onChange={(e) => setIntakeProductId(e.target.value)} placeholder="Product UUID" />
          </div>
        )}
        {confirm && ["approved", "accepted", "settled"].includes(confirm.status) && (
          <div className="mt-3 space-y-2">
            <Label>Approved value override (optional)</Label>
            <Input type="number" value={overrideValue} onChange={(e) => setOverrideValue(e.target.value)} />
            <Label>Override reason</Label>
            <Input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
          </div>
        )}
      </ConfirmActionDialog>
    </>
  );
}
