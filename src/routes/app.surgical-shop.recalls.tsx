import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, PageBody, SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { PermissionGate } from "@/components/pulse/gates";
import { EmptyState, ErrorState, LoadingState } from "@/components/pulse/states";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useSurgicalRecalls } from "@/hooks/use-api-config";
import { useCreateSurgicalRecall } from "@/hooks/use-industry-backoffice";
import { toast } from "sonner";

export const Route = createFileRoute("/app/surgical-shop/recalls")({ component: RecallsPage });

function RecallsPage() {
  const useApi = shouldUseBackend();
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ product_id: "", batch_no: "", serial_no: "", udi_code: "", reason: "" });
  const query = useSurgicalRecalls({ status: status === "all" ? undefined : status });
  const create = useCreateSurgicalRecall();

  if (!useApi) {
    return (
      <>
        <PageHeader title="Recalls" subtitle="Backend mode required." />
        <PageBody><EmptyState title="Backend required" description="Surgical recalls are not available in demo mode." /></PageBody>
      </>
    );
  }

  const submit = async () => {
    if (!form.reason.trim()) { toast.error("Recall reason required"); return; }
    if (!form.product_id && !form.batch_no && !form.serial_no && !form.udi_code) {
      toast.error("Target product, batch, serial, or UDI required");
      return;
    }
    try {
      const row = await create.mutateAsync({
        product_id: form.product_id || undefined,
        batch_no: form.batch_no || undefined,
        serial_no: form.serial_no || undefined,
        udi_code: form.udi_code || undefined,
        reason: form.reason,
      });
      toast.success(`Recall ${String(row.recall_no)} created`);
      setOpen(false);
      setForm({ product_id: "", batch_no: "", serial_no: "", udi_code: "", reason: "" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Recall failed");
    }
  };

  return (
    <>
      <PageHeader
        title="Recalls"
        subtitle="Operational recall blocking for surgical stock. Not a regulatory certification claim."
        actions={
          <PermissionGate perm="surgical-shop.manage">
            <Button onClick={() => setOpen(true)}>New recall</Button>
          </PermissionGate>
        }
      />
      <PageBody>
        <div className="mb-4 flex flex-wrap gap-2">
          {(["all", "open", "stock_blocked", "closed"] as const).map((s) => (
            <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>{s.replace("_", " ")}</Button>
          ))}
        </div>
        <SectionCard>
          {query.isLoading ? (
            <LoadingState rows={3} />
          ) : query.isError ? (
            <ErrorState title="Failed to load recalls" />
          ) : (query.data ?? []).length === 0 ? (
            <EmptyState title="No recalls" description="Create a recall to block matching unsold stock." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 text-left">Recall #</th>
                  <th className="px-3 py-2.5 text-left">Target</th>
                  <th className="px-3 py-2.5 text-left">Reason</th>
                  <th className="px-3 py-2.5 text-left">Severity</th>
                  <th className="px-3 py-2.5 text-left">Status</th>
                  <th className="px-5 py-2.5 text-right">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(query.data ?? []).map((r) => (
                  <tr key={String(r.id)} className="hover:bg-secondary/30">
                    <td className="px-5 py-3 font-mono text-xs">{String(r.recall_no)}</td>
                    <td className="px-3 py-3 text-xs">
                      {r.batch_no ? `Batch ${String(r.batch_no)}` : null}
                      {r.serial_no ? ` Serial ${String(r.serial_no)}` : null}
                      {r.udi_code ? ` UDI ${String(r.udi_code)}` : null}
                      {!r.batch_no && !r.serial_no && !r.udi_code ? String(r.product_id ?? "Product") : null}
                    </td>
                    <td className="px-3 py-3">{String(r.reason ?? "")}</td>
                    <td className="px-3 py-3">{String(r.severity ?? "standard")}</td>
                    <td className="px-3 py-3"><StatusBadge status={String(r.status)} /></td>
                    <td className="px-5 py-3 text-right">
                      <Link to="/app/surgical-shop/recalls/$recallId" params={{ recallId: String(r.id) }} className="text-primary text-xs underline-offset-2 hover:underline">
                        Detail
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
        <div className="mt-4">
          <DisabledReasonButton label="Notify affected customers" reason="Customer messaging integration is not configured." />
        </div>
      </PageBody>

      <EntityFormDrawer
        open={open}
        onOpenChange={setOpen}
        title="Create recall"
        description="Blocks matching unsold stock. Historic sales are listed on the detail page."
        onSubmit={submit}
        isPending={create.isPending}
      >
        <div className="space-y-3">
          <Input placeholder="Product ID (optional if batch/serial/UDI set)" value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })} />
          <Input placeholder="Batch no" value={form.batch_no} onChange={(e) => setForm({ ...form, batch_no: e.target.value })} />
          <Input placeholder="Serial no" value={form.serial_no} onChange={(e) => setForm({ ...form, serial_no: e.target.value })} />
          <Input placeholder="UDI" value={form.udi_code} onChange={(e) => setForm({ ...form, udi_code: e.target.value })} />
          <Input placeholder="Reason (required)" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </div>
      </EntityFormDrawer>
    </>
  );
}
