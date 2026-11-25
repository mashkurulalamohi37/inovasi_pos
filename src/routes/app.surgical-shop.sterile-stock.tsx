import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, PageBody, SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/pulse/ConfirmActionDialog";
import { PermissionGate } from "@/components/pulse/gates";
import { EmptyState, ErrorState, LoadingState } from "@/components/pulse/states";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useSurgicalStock } from "@/hooks/use-api-config";
import { useQuarantineSurgicalStock, useReleaseSurgicalStock, useCreateSurgicalRecall } from "@/hooks/use-industry-backoffice";
import { toast } from "sonner";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";

export const Route = createFileRoute("/app/surgical-shop/sterile-stock")({ component: SterileStockPage });

function SterileStockPage() {
  const useApi = shouldUseBackend();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [sterile, setSterile] = useState<string>("all");
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [action, setAction] = useState<"quarantine" | "release" | "recall" | null>(null);
  const [reason, setReason] = useState("");

  const query = useSurgicalStock({
    q: q || undefined,
    status: status === "all" ? undefined : status,
    sterile_status: sterile === "all" ? undefined : sterile,
  });
  const quarantine = useQuarantineSurgicalStock();
  const release = useReleaseSurgicalStock();
  const recall = useCreateSurgicalRecall();

  const rows = useMemo(() => query.data ?? [], [query.data]);

  if (!useApi) {
    return (
      <>
        <PageHeader title="Sterile stock" subtitle="Connect backend mode to manage live surgical stock units." />
        <PageBody>
          <EmptyState title="Backend required" description="Surgical sterile stock is not available in demo mode." />
        </PageBody>
      </>
    );
  }

  const runAction = async () => {
    if (!selected?.id || !action) return;
    try {
      if (action === "quarantine") {
        if (!reason.trim()) { toast.error("Quarantine reason required"); return; }
        await quarantine.mutateAsync({ unitId: String(selected.id), body: { reason } });
        toast.success("Stock quarantined");
      } else if (action === "release") {
        await release.mutateAsync({ unitId: String(selected.id), body: { note: reason } });
        toast.success("Stock released");
      } else if (action === "recall") {
        if (!reason.trim()) { toast.error("Recall reason required"); return; }
        await recall.mutateAsync({
          product_id: selected.product_id,
          batch_no: selected.batch_no,
          lot_no: selected.lot_no,
          serial_no: selected.serial_no,
          udi_code: selected.udi_code,
          reason,
        });
        toast.success("Recall created — matching stock blocked");
      }
      setAction(null);
      setSelected(null);
      setReason("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  };

  return (
    <>
      <PageHeader title="Sterile stock" subtitle="Live surgical stock units — batch/lot/serial/UDI with sterile and QC status." />
      <PageBody>
        <div className="mb-4 flex flex-wrap gap-2">
          <Input placeholder="Search product, batch, serial, UDI…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
          {(["all", "available", "quarantined", "recalled", "expired", "sold"] as const).map((s) => (
            <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>{s}</Button>
          ))}
          {(["all", "sterile", "non_sterile", "unknown"] as const).map((s) => (
            <Button key={s} size="sm" variant={sterile === s ? "default" : "outline"} onClick={() => setSterile(s)}>{s.replace("_", " ")}</Button>
          ))}
          <Link to="/app/surgical-shop/recalls" className="text-sm text-primary underline-offset-2 hover:underline self-center ml-2">Recalls</Link>
        </div>
        <SectionCard>
          {query.isLoading ? (
            <LoadingState rows={4} />
          ) : query.isError ? (
            <ErrorState title="Failed to load surgical stock" description="Check API connectivity and surgical.view permission." />
          ) : rows.length === 0 ? (
            <EmptyState title="No surgical stock units" description="Receive surgical products via purchase GRN with batch/lot/serial/UDI as required by tracking policy." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 text-left">Product</th>
                  <th className="px-3 py-2.5 text-left">SKU</th>
                  <th className="px-3 py-2.5 text-left">Manufacturer</th>
                  <th className="px-3 py-2.5 text-left">Batch/Lot</th>
                  <th className="px-3 py-2.5 text-left">Serial/UDI</th>
                  <th className="px-3 py-2.5 text-right">Qty</th>
                  <th className="px-3 py-2.5 text-left">Expiry</th>
                  <th className="px-3 py-2.5 text-left">Sterile</th>
                  <th className="px-3 py-2.5 text-left">Status</th>
                  <th className="px-5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={String(r.id)} className="hover:bg-secondary/30">
                    <td className="px-5 py-3 font-medium">{String(r.product_name ?? "—")}</td>
                    <td className="px-3 py-3 font-mono text-xs">{String(r.sku ?? "—")}</td>
                    <td className="px-3 py-3 text-xs">{String(r.manufacturer_name ?? "—")}</td>
                    <td className="px-3 py-3 font-mono text-xs">
                      {r.batch_no ? String(r.batch_no) : "—"}
                      {r.lot_no ? <div className="text-muted-foreground">Lot {String(r.lot_no)}</div> : null}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">
                      {r.serial_no ? String(r.serial_no) : "—"}
                      {r.udi_code ? <div className="text-muted-foreground">UDI {String(r.udi_code)}</div> : null}
                    </td>
                    <td className="px-3 py-3 text-right tabular">{String(r.qty_on_hand ?? 0)}</td>
                    <td className="px-3 py-3 text-xs">
                      {r.expiry_date ? String(r.expiry_date).slice(0, 10) : "—"}
                      {typeof r.days_to_expiry === "number" ? (
                        <div className="text-muted-foreground">{r.days_to_expiry}d</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3"><StatusBadge status={String(r.sterile_status ?? "unknown")} /></td>
                    <td className="px-3 py-3"><StatusBadge status={String(r.status ?? "available")} /></td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        <PermissionGate perm="surgical-shop.manage" fallback={null}>
                          {r.status === "available" || r.status === "released" ? (
                            <Button size="sm" variant="outline" onClick={() => { setSelected(r); setAction("quarantine"); setReason(""); }}>Quarantine</Button>
                          ) : null}
                          {r.status === "quarantined" ? (
                            <Button size="sm" variant="outline" onClick={() => { setSelected(r); setAction("release"); setReason(""); }}>Release</Button>
                          ) : null}
                          {r.status !== "recalled" && r.status !== "sold" ? (
                            <Button size="sm" variant="destructive" onClick={() => { setSelected(r); setAction("recall"); setReason(""); }}>Recall</Button>
                          ) : null}
                        </PermissionGate>
                        <DisabledReasonButton
                          size="sm"
                          variant="ghost"
                          label="Warranty"
                          reason="Shared warranty service is not wired for surgical devices in this phase."
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      </PageBody>

      <ConfirmActionDialog
        open={Boolean(action && selected)}
        onOpenChange={(open) => { if (!open) { setAction(null); setSelected(null); } }}
        title={action === "quarantine" ? "Quarantine stock" : action === "release" ? "Release stock" : "Create recall"}
        description={
          action === "recall"
            ? "Matching unsold stock will be blocked. Customer notification is not automated."
            : action === "release"
              ? "Stock returns to available only if not expired or recalled."
              : "Quarantined stock cannot be sold until released."
        }
        confirmLabel={action === "recall" ? "Create recall" : action === "release" ? "Release" : "Quarantine"}
        onConfirm={runAction}
        isPending={quarantine.isPending || release.isPending || recall.isPending}
      >
        {(action === "quarantine" || action === "recall") && (
          <Input
            className="mt-3"
            placeholder={action === "recall" ? "Recall reason (required)" : "Quarantine reason (required)"}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
        {action === "release" && (
          <Input className="mt-3" placeholder="Release note (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        )}
      </ConfirmActionDialog>
    </>
  );
}
