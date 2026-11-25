import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, PageBody, SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/pulse/ConfirmActionDialog";
import { PermissionGate } from "@/components/pulse/gates";
import { EmptyState, ErrorState, LoadingState } from "@/components/pulse/states";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";
import { AuditTrailPanel } from "@/components/pulse/AuditTrailPanel";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useSurgicalRecall } from "@/hooks/use-api-config";
import { useCloseSurgicalRecall } from "@/hooks/use-industry-backoffice";
import { toast } from "sonner";

export const Route = createFileRoute("/app/surgical-shop/recalls/$recallId")({ component: RecallDetailPage });

function RecallDetailPage() {
  const { recallId } = Route.useParams();
  const useApi = shouldUseBackend();
  const query = useSurgicalRecall(useApi ? recallId : undefined);
  const closeMut = useCloseSurgicalRecall();
  const [confirmClose, setConfirmClose] = useState(false);

  if (!useApi) {
    return (
      <>
        <PageHeader title="Recall detail" subtitle="Backend mode required." />
        <PageBody><EmptyState title="Backend required" /></PageBody>
      </>
    );
  }

  if (query.isLoading) {
    return (
      <>
        <PageHeader title="Recall detail" />
        <PageBody><LoadingState rows={3} /></PageBody>
      </>
    );
  }
  if (query.isError || !query.data) {
    return (
      <>
        <PageHeader title="Recall detail" />
        <PageBody><ErrorState title="Recall not found" /></PageBody>
      </>
    );
  }

  const r = query.data;
  const stock = (r.affected_stock as Array<Record<string, unknown>> | undefined) ?? [];
  const sales = (r.affected_sales as Array<Record<string, unknown>> | undefined) ?? [];

  return (
    <>
      <PageHeader
        title={String(r.recall_no)}
        subtitle={String(r.reason ?? "")}
        actions={
          <div className="flex gap-2">
            <Link to="/app/surgical-shop/recalls"><Button variant="outline">Back</Button></Link>
            {r.status !== "closed" ? (
              <PermissionGate perm="surgical-shop.manage">
                <Button variant="destructive" onClick={() => setConfirmClose(true)}>Close recall</Button>
              </PermissionGate>
            ) : null}
          </div>
        }
      />
      <PageBody>
        <div className="mb-4 flex flex-wrap gap-3 text-sm">
          <StatusBadge status={String(r.status)} />
          <span>Severity: {String(r.severity ?? "standard")}</span>
          <span>Date: {r.recall_date ? String(r.recall_date).slice(0, 10) : "—"}</span>
        </div>

        <SectionCard title="Affected stock (blocked)">
          {stock.length === 0 ? (
            <EmptyState title="No blocked stock rows" description="No matching unsold units, or already sold out." />
          ) : (
            <ul className="space-y-2 text-sm p-4">
              {stock.map((s) => (
                <li key={String(s.id)} className="flex justify-between gap-2 border-b border-border pb-2">
                  <span>{String(s.sku)} · {String(s.batch_no ?? s.serial_no ?? s.udi_code ?? s.id)}</span>
                  <StatusBadge status={String(s.status)} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Affected historic sales" className="mt-4">
          {sales.length === 0 ? (
            <EmptyState title="No matching historic sales" description="No invoices found with this tracking identity." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 text-left">Invoice</th>
                  <th className="px-3 py-2 text-left">Tracking</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sales.map((s) => (
                  <tr key={`${s.invoice_id}-${s.line_id}`}>
                    <td className="px-5 py-2 font-mono text-xs">{String(s.invoice_number)}</td>
                    <td className="px-3 py-2 text-xs">{String(s.batch_no ?? s.serial_no ?? s.udi_code ?? "—")}</td>
                    <td className="px-3 py-2 text-right">{String(s.qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>

        <div className="mt-4 flex flex-wrap gap-2">
          <DisabledReasonButton
            label="Notify customers"
            reason={String(r.notification_disabled_reason ?? "Customer messaging integration is not configured.")}
          />
        </div>

        <div className="mt-6">
          <AuditTrailPanel
            entries={[
              {
                id: `${String(r.id)}-created`,
                action: "surgical.recall",
                actor: r.created_by ? String(r.created_by) : null,
                at: r.created_at ? String(r.created_at) : null,
                detail: String(r.reason ?? ""),
              },
              ...(r.closed_at
                ? [{
                    id: `${String(r.id)}-closed`,
                    action: "surgical.recall_close",
                    actor: r.closed_by ? String(r.closed_by) : null,
                    at: String(r.closed_at),
                    detail: "Recall closed",
                  }]
                : []),
            ]}
          />
        </div>
      </PageBody>

      <ConfirmActionDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Close recall"
        description="Marks the recall closed. Blocked stock remains recalled until separately managed."
        confirmLabel="Close"
        onConfirm={async () => {
          try {
            await closeMut.mutateAsync({ recallId });
            toast.success("Recall closed");
            setConfirmClose(false);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Close failed");
          }
        }}
        isPending={closeMut.isPending}
      />
    </>
  );
}
