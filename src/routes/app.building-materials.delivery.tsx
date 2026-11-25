import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { ConfirmActionDialog } from "@/components/pulse/ConfirmActionDialog";
import { PermissionGate } from "@/components/pulse/gates";
import { EmptyState, ErrorState, LoadingState } from "@/components/pulse/states";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FileText, Plus, RefreshCw, Truck } from "lucide-react";
import { shouldUseBackend } from "@/lib/demo-mode";
import { resolveApiBase, getAccessToken, loadStoredTokens } from "@/lib/api";
import {
  useBuildingDeliveries,
  useBuildingOrder,
  useBuildingOrders,
  type BuildingDelivery,
} from "@/hooks/use-api-config";
import {
  useConfirmBuildingDelivery,
  useCreateBuildingDelivery,
  useDispatchBuildingDelivery,
} from "@/hooks/use-industry-backoffice";
import { toast } from "sonner";

export const Route = createFileRoute("/app/building-materials/delivery")({ component: DeliveryPage });

type PendingAction = { id: string; type: "dispatch" | "confirm"; label: string };

type DeliveryLineForm = { order_line_id: string; planned_qty: string; label: string };

async function openChallan(deliveryId: string) {
  loadStoredTokens();
  const token = getAccessToken();
  const apiBase = resolveApiBase();
  const res = await fetch(`${apiBase}/industry/building/deliveries/${deliveryId}/challan`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof body.detail === "string" ? body.detail : "Challan failed");
  }
  const html = await res.text();
  const w = window.open("", "_blank");
  if (!w) throw new Error("Pop-up blocked");
  w.document.write(html);
  w.document.close();
}

function DeliveryPage() {
  const useApi = shouldUseBackend();
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [driverName, setDriverName] = useState("");
  const [lineForms, setLineForms] = useState<DeliveryLineForm[]>([]);
  const [pending, setPending] = useState<PendingAction | null>(null);

  const deliveriesQuery = useBuildingDeliveries(status !== "all" ? { status } : undefined);
  const ordersQuery = useBuildingOrders({ status: "confirmed" });
  const partialOrdersQuery = useBuildingOrders({ status: "partially_dispatched" });
  const partialDeliveredQuery = useBuildingOrders({ status: "partially_delivered" });
  const orderDetailQuery = useBuildingOrder(orderId || null);

  const createDelivery = useCreateBuildingDelivery();
  const dispatchDelivery = useDispatchBuildingDelivery();
  const confirmDelivery = useConfirmBuildingDelivery();

  const orderOptions = useMemo(() => {
    const all = [
      ...(ordersQuery.data ?? []),
      ...(partialOrdersQuery.data ?? []),
      ...(partialDeliveredQuery.data ?? []),
    ];
    const seen = new Set<string>();
    return all.filter((o) => {
      if (seen.has(o.id)) return false;
      seen.add(o.id);
      return o.status !== "draft" && o.status !== "cancelled" && o.status !== "delivered";
    });
  }, [ordersQuery.data, partialOrdersQuery.data, partialDeliveredQuery.data]);

  const rows = useApi ? (deliveriesQuery.data ?? []) : [];

  useEffect(() => {
    if (!orderId) {
      setLineForms([]);
      return;
    }
    const order = orderDetailQuery.data ?? orderOptions.find((o) => o.id === orderId);
    const lines = order?.lines ?? [];
    setLineForms(
      lines
        .filter((l) => (l.pending_base_qty ?? l.base_qty) > 0)
        .map((l) => ({
          order_line_id: l.id,
          planned_qty: String(l.entered_qty),
          label: `${l.product_name ?? l.sku} · pending base ${l.pending_base_qty ?? l.base_qty}`,
        })),
    );
  }, [orderId, orderDetailQuery.data, orderOptions]);

  const loadOrderLines = (oid: string) => {
    setOrderId(oid);
  };

  const submitCreate = async () => {
    if (!orderId) {
      toast.error("Select an order");
      return;
    }
    const lines = lineForms
      .map((l) => ({ order_line_id: l.order_line_id, planned_qty: Number(l.planned_qty) }))
      .filter((l) => l.planned_qty > 0);
    if (lines.length === 0) {
      toast.error("Enter quantity for at least one line");
      return;
    }
    try {
      await createDelivery.mutateAsync({
        order_id: orderId,
        vehicle_no: vehicleNo || undefined,
        driver_name: driverName || undefined,
        lines,
      });
      toast.success("Delivery planned");
      setOpen(false);
      setOrderId("");
      setLineForms([]);
      setVehicleNo("");
      setDriverName("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    }
  };

  const runPending = async () => {
    if (!pending) return;
    try {
      if (pending.type === "dispatch") {
        await dispatchDelivery.mutateAsync({ id: pending.id });
        toast.success("Dispatched — stock posted");
      } else {
        await confirmDelivery.mutateAsync({ id: pending.id });
        toast.success("Delivery confirmed");
      }
      setPending(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  };

  const openChallanSafe = async (d: BuildingDelivery) => {
    try {
      await openChallan(d.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Challan failed");
    }
  };

  if (!useApi) {
    return (
      <BackOfficePage title="Site delivery" eyebrow="Building" subtitle="Challan · dispatch · confirm">
        <EmptyState title="Backend required" description="Site deliveries require backend mode and building.view." />
      </BackOfficePage>
    );
  }

  return (
    <BackOfficePage
      title="Site delivery"
      eyebrow="Building"
      subtitle="Plan challan · dispatch stock · confirm site receipt"
      stats={[
        { label: "Planned", value: String(rows.filter((r) => r.status === "planned").length) },
        { label: "In transit", value: String(rows.filter((r) => r.status === "dispatched").length) },
      ]}
      actions={
        <>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => deliveriesQuery.refetch()} disabled={deliveriesQuery.isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 ${deliveriesQuery.isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" asChild><Link to="/app/pos/building-materials">Open POS</Link></Button>
          <PermissionGate perm="building.manage">
            <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Plan delivery
            </Button>
          </PermissionGate>
        </>
      }
    >
      <SectionCard
        title="Delivery board"
        actions={
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8 w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {["planned", "dispatched", "delivered", "failed", "returned", "cancelled"].map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      >
        {deliveriesQuery.isLoading ? (
          <LoadingState rows={4} />
        ) : deliveriesQuery.isError ? (
          <ErrorState title="Failed to load deliveries" onRetry={() => deliveriesQuery.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title="No deliveries" description="Confirm a building order, then plan a site delivery." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 text-left">Challan</th>
                <th className="px-3 py-2.5 text-left">Order</th>
                <th className="px-3 py-2.5 text-left">Site</th>
                <th className="px-3 py-2.5 text-left">Vehicle</th>
                <th className="px-3 py-2.5 text-left">Status</th>
                <th className="px-5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((d) => (
                <tr key={d.id} className="hover:bg-secondary/30">
                  <td className="px-5 py-3 font-mono text-xs">{d.delivery_no}</td>
                  <td className="px-3 py-3 text-xs">{d.order_no ?? d.order_id.slice(0, 8)}</td>
                  <td className="px-3 py-3 max-w-[180px] truncate">{d.site_name ?? d.site_address ?? "—"}</td>
                  <td className="px-3 py-3 text-xs">{d.vehicle_no ?? "—"}</td>
                  <td className="px-3 py-3"><StatusBadge status={d.status} /></td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-7" onClick={() => void openChallanSafe(d)}>
                        <FileText className="h-3.5 w-3.5" />
                      </Button>
                      {d.status === "planned" && (
                        <PermissionGate perm="building.manage" fallback={<DisabledReasonButton label="Dispatch" reason="Requires building.dispatch" />}>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1"
                            onClick={() => setPending({ id: d.id, type: "dispatch", label: "Dispatch delivery" })}
                          >
                            <Truck className="h-3 w-3" /> Dispatch
                          </Button>
                        </PermissionGate>
                      )}
                      {d.status === "dispatched" && (
                        <PermissionGate perm="building.manage">
                          <Button
                            size="sm"
                            className="h-7"
                            onClick={() => setPending({ id: d.id, type: "confirm", label: "Confirm delivered" })}
                          >
                            Confirm
                          </Button>
                        </PermissionGate>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      <EntityFormDrawer
        open={open}
        onOpenChange={setOpen}
        title="Plan site delivery"
        onSubmit={submitCreate}
        isPending={createDelivery.isPending}
        submitDisabled={!orderId || lineForms.length === 0}
      >
        <div className="space-y-3">
          <div>
            <Label>Sales order</Label>
            <Select value={orderId} onValueChange={loadOrderLines}>
              <SelectTrigger><SelectValue placeholder="Select confirmed order" /></SelectTrigger>
              <SelectContent>
                {orderOptions.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.order_no} · {o.customer_name ?? "Walk-in"} · {o.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Vehicle no</Label>
              <Input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} placeholder="Dhaka-GA-1234" />
            </div>
            <div>
              <Label>Driver</Label>
              <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} />
            </div>
          </div>
          {lineForms.length > 0 && (
            <div className="space-y-2">
              <Label>Lines (sales qty)</Label>
              {lineForms.map((l, idx) => (
                <div key={l.order_line_id} className="grid grid-cols-[1fr_100px] gap-2 items-center">
                  <span className="text-xs text-muted-foreground">{l.label}</span>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={l.planned_qty}
                    onChange={(e) => {
                      const next = [...lineForms];
                      next[idx] = { ...l, planned_qty: e.target.value };
                      setLineForms(next);
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </EntityFormDrawer>

      <ConfirmActionDialog
        open={Boolean(pending)}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending?.label ?? "Confirm"}
        description={
          pending?.type === "dispatch"
            ? "Post stock out for this challan? This cannot be undone without a return."
            : "Mark materials as received at site?"
        }
        confirmLabel={pending?.label ?? "Confirm"}
        onConfirm={() => runPending()}
        isPending={dispatchDelivery.isPending || confirmDelivery.isPending}
      />
    </BackOfficePage>
  );
}
