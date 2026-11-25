import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { ConfirmActionDialog } from "@/components/pulse/ConfirmActionDialog";
import { PermissionGate } from "@/components/pulse/gates";
import { LoadingState, ErrorState, EmptyState } from "@/components/pulse/states";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useOpticalOrders } from "@/hooks/use-api-config";
import {
  useConfirmOpticalOrder,
  useFinalizeOpticalOrder,
  useUpdateOpticalOrderStatus,
} from "@/hooks/use-industry-backoffice";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";
import { fmtBDT } from "@/lib/pos-data";
import { toast } from "sonner";

export const Route = createFileRoute("/app/optical-shop/orders")({ component: Page });

const LAB_NEXT: Record<string, { status: string; label: string } | null> = {
  confirmed: { status: "sent_to_lab", label: "Send to lab" },
  sent_to_lab: { status: "lens_processing", label: "Start processing" },
  lens_processing: { status: "lens_ready", label: "Lens ready" },
  lens_ready: { status: "fitting", label: "Start fitting" },
  fitting: { status: "qc", label: "QC pass" },
  qc: { status: "ready", label: "Mark ready" },
  ready: null,
  paid: { status: "delivered", label: "Deliver" },
  partially_paid: null,
};

function Page() {
  const useApi = shouldUseBackend();
  const [status, setStatus] = useState("all");
  const { data, isLoading, isError, refetch } = useOpticalOrders(
    status !== "all" ? { status } : undefined,
  );
  const confirmOrder = useConfirmOpticalOrder();
  const updateStatus = useUpdateOpticalOrderStatus();
  const finalize = useFinalizeOpticalOrder();
  const [pending, setPending] = useState<{
    id: string;
    action: "confirm" | "status" | "finalize" | "deliver";
    status?: string;
    label: string;
  } | null>(null);

  const rows = useApi ? (data ?? []) : [];

  return (
    <BackOfficePage
      title="Optical orders"
      eyebrow="Optical"
      subtitle="Lab · fitting · QC · delivery"
      stats={[
        { label: "Open", value: String(rows.filter(r => !["delivered", "cancelled", "paid"].includes(String(r.status))).length) },
        { label: "Ready", value: String(rows.filter(r => r.status === "ready" || r.status === "paid").length) },
      ]}
      actions={
        useApi ? (
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8 w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {["draft", "confirmed", "sent_to_lab", "lens_processing", "lens_ready", "fitting", "qc", "ready", "paid", "delivered", "cancelled"].map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <DisabledReasonButton label="Filter" reason="Connect backend for live optical orders" />
        )
      }
    >
      <SectionCard title="Orders">
        {!useApi ? (
          <EmptyState title="Backend required" description="Optical orders are not available in demo mode." />
        ) : isLoading ? (
          <LoadingState rows={4} label="Loading orders…" />
        ) : isError ? (
          <ErrorState title="Failed to load orders" onRetry={() => void refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title="No orders" description="Create optical orders from Optical POS." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 text-left">Order</th>
                <th className="px-3 py-2.5 text-left">Customer</th>
                <th className="px-3 py-2.5 text-left">Rx</th>
                <th className="px-3 py-2.5 text-right">Net</th>
                <th className="px-3 py-2.5 text-right">Due</th>
                <th className="px-3 py-2.5 text-left">Status</th>
                <th className="px-5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(o => {
                const st = String(o.status);
                const next = LAB_NEXT[st];
                return (
                  <tr key={String(o.id)} className="hover:bg-secondary/30">
                    <td className="px-5 py-3 font-mono text-xs">{String(o.order_no)}</td>
                    <td className="px-3 py-3">{String(o.customer_name ?? "—")}</td>
                    <td className="px-3 py-3 text-muted-foreground">{String(o.prescription_no ?? "—")}</td>
                    <td className="px-3 py-3 text-right tabular">{fmtBDT(Number(o.net_amount ?? 0))}</td>
                    <td className="px-3 py-3 text-right tabular">{fmtBDT(Number(o.due_amount ?? 0))}</td>
                    <td className="px-3 py-3"><StatusBadge status={st} /></td>
                    <td className="px-5 py-3 text-right">
                      <PermissionGate perm="optical-shop.manage">
                        <div className="flex justify-end gap-1">
                          {st === "draft" && (
                            <Button size="sm" variant="outline" className="h-7" onClick={() => setPending({ id: String(o.id), action: "confirm", label: "Confirm order" })}>
                              Confirm
                            </Button>
                          )}
                          {next && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7"
                              onClick={() => setPending({
                                id: String(o.id),
                                action: next.status === "delivered" ? "deliver" : "status",
                                status: next.status,
                                label: next.label,
                              })}
                            >
                              {next.label}
                            </Button>
                          )}
                          {(st === "ready" || st === "partially_paid" || st === "confirmed") && !o.sales_invoice_id && Number(o.due_amount ?? 0) >= 0 && (
                            <Button size="sm" className="h-7" onClick={() => setPending({ id: String(o.id), action: "finalize", label: "Finalize & invoice" })}>
                              Finalize
                            </Button>
                          )}
                          {st === "paid" && (
                            <Button size="sm" className="h-7" onClick={() => setPending({ id: String(o.id), action: "deliver", status: "delivered", label: "Deliver" })}>
                              Deliver
                            </Button>
                          )}
                        </div>
                      </PermissionGate>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </SectionCard>

      <SectionCard title="After-sales">
        <div className="p-4">
          <DisabledReasonButton
            label="Repair / remake"
            reason="Optical repair and remake workflow will be completed in the after-sales service phase."
          />
        </div>
      </SectionCard>

      <ConfirmActionDialog
        open={!!pending}
        onOpenChange={v => !v && setPending(null)}
        title={pending?.label ?? "Confirm"}
        description="This updates the optical order on the server and writes an audit entry."
        confirmLabel={pending?.label ?? "Confirm"}
        isPending={confirmOrder.isPending || updateStatus.isPending || finalize.isPending}
        onConfirm={async () => {
          if (!pending) return;
          if (pending.action === "confirm") {
            await confirmOrder.mutateAsync({ orderId: pending.id });
          } else if (pending.action === "finalize") {
            await finalize.mutateAsync({ orderId: pending.id, body: { tender: "cash" } });
          } else {
            await updateStatus.mutateAsync({ orderId: pending.id, body: { status: pending.status } });
          }
          toast.success(pending.label);
          setPending(null);
          refetch();
        }}
      />
    </BackOfficePage>
  );
}
