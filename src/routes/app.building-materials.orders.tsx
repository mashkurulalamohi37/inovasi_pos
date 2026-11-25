import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { ConfirmActionDialog } from "@/components/pulse/ConfirmActionDialog";
import { PermissionGate } from "@/components/pulse/gates";
import { EmptyState, ErrorState, LoadingState } from "@/components/pulse/states";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { shouldUseBackend } from "@/lib/demo-mode";
import { fmtBDT } from "@/lib/pos-data";
import { useBuildingOrders } from "@/hooks/use-api-config";
import { useCancelBuildingOrder, useConfirmBuildingOrder } from "@/hooks/use-industry-backoffice";
import { toast } from "sonner";

export const Route = createFileRoute("/app/building-materials/orders")({ component: OrdersPage });

function OrdersPage() {
  const useApi = shouldUseBackend();
  const [status, setStatus] = useState("all");
  const [pending, setPending] = useState<{ id: string; action: "confirm" | "cancel"; label: string } | null>(null);

  const { data, isLoading, isError, refetch } = useBuildingOrders(status !== "all" ? { status } : undefined);
  const confirmOrder = useConfirmBuildingOrder();
  const cancelOrder = useCancelBuildingOrder();

  const rows = useApi ? (data ?? []) : [];

  const runPending = async () => {
    if (!pending) return;
    try {
      if (pending.action === "confirm") {
        await confirmOrder.mutateAsync({ id: pending.id, body: { allow_due: true } });
        toast.success("Order confirmed");
      } else {
        await cancelOrder.mutateAsync({ id: pending.id, body: { reason: "Cancelled from order desk" } });
        toast.success("Order cancelled");
      }
      setPending(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  };

  if (!useApi) {
    return (
      <BackOfficePage title="Sales orders" eyebrow="Building" subtitle="Draft · confirm · site fulfillment">
        <EmptyState title="Backend required" description="Building orders are not available in demo mode." />
      </BackOfficePage>
    );
  }

  return (
    <BackOfficePage
      title="Sales orders"
      eyebrow="Building"
      subtitle="Contractor orders · site · delivery fulfillment"
      stats={[
        { label: "Draft", value: String(rows.filter((r) => r.status === "draft").length) },
        { label: "Open", value: String(rows.filter((r) => !["delivered", "cancelled"].includes(r.status)).length) },
      ]}
      actions={
        <>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8 w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {["draft", "confirmed", "partially_dispatched", "partially_delivered", "delivered", "cancelled"].map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" asChild><Link to="/app/pos/building-materials">Open POS</Link></Button>
        </>
      }
    >
      <SectionCard title="Order desk">
        {isLoading ? (
          <LoadingState rows={4} label="Loading orders…" />
        ) : isError ? (
          <ErrorState title="Failed to load orders" onRetry={() => void refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title="No orders" description="Create draft orders from Building Materials POS order desk." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 text-left">Order</th>
                <th className="px-3 py-2.5 text-left">Customer</th>
                <th className="px-3 py-2.5 text-left">Site</th>
                <th className="px-3 py-2.5 text-right">Total</th>
                <th className="px-3 py-2.5 text-left">Status</th>
                <th className="px-5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((o) => (
                <tr key={o.id} className="hover:bg-secondary/30">
                  <td className="px-5 py-3 font-mono text-xs">{o.order_no}</td>
                  <td className="px-3 py-3">{o.customer_name ?? "—"}</td>
                  <td className="px-3 py-3 max-w-[160px] truncate">{o.site_name ?? "—"}</td>
                  <td className="px-3 py-3 text-right tabular">{fmtBDT(Number(o.total ?? 0))}</td>
                  <td className="px-3 py-3"><StatusBadge status={o.status} /></td>
                  <td className="px-5 py-3 text-right">
                    <PermissionGate perm="building.manage">
                      <div className="flex justify-end gap-1">
                        {o.status === "draft" && (
                          <Button size="sm" variant="outline" className="h-7" onClick={() => setPending({ id: o.id, action: "confirm", label: "Confirm order" })}>
                            Confirm
                          </Button>
                        )}
                        {!["cancelled", "delivered"].includes(o.status) && (
                          <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => setPending({ id: o.id, action: "cancel", label: "Cancel order" })}>
                            Cancel
                          </Button>
                        )}
                        {o.status !== "draft" && o.status !== "cancelled" && (
                          <Button size="sm" variant="ghost" className="h-7" asChild>
                            <Link to="/app/building-materials/delivery">Deliver</Link>
                          </Button>
                        )}
                      </div>
                    </PermissionGate>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      <ConfirmActionDialog
        open={Boolean(pending)}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending?.label ?? "Confirm"}
        description={
          pending?.action === "cancel"
            ? "Cancel remaining undelivered quantity on this order?"
            : "Create invoice and lock pricing for site delivery?"
        }
        confirmLabel={pending?.label ?? "Confirm"}
        onConfirm={() => runPending()}
        isPending={confirmOrder.isPending || cancelOrder.isPending}
      />
    </BackOfficePage>
  );
}
