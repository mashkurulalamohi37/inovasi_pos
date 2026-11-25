import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { ProductionIncompleteBanner } from "@/components/pulse/ProductionIncompleteBanner";
import { SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { Plus, RefreshCw, Truck } from "lucide-react";
import { useFurnitureDeliveries } from "@/hooks/use-industry-data";
import { useCreateFurnitureDelivery, useUpdateFurnitureDelivery } from "@/hooks/use-industry-backoffice";
import { furnitureDeliveriesDemo } from "@/lib/industry-mock";
import { isDemoMode } from "@/lib/demo-mode";
import { fmtBDT } from "@/lib/pos-data";
import { toast } from "sonner";

export const Route = createFileRoute("/app/furniture/delivery")({
  component: Page,
});

const NEXT_STATUS: Record<string, string> = {
  scheduled: "out-for-delivery",
  "out-for-delivery": "delivered",
};

function Page() {
  const useApi = !isDemoMode();
  const query = useFurnitureDeliveries();
  const createMut = useCreateFurnitureDelivery();
  const updateMut = useUpdateFurnitureDelivery();
  const [demoRows, setDemoRows] = useState(furnitureDeliveriesDemo);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState({
    customer_name: "", customer_phone: "", delivery_address: "",
    items_summary: "", assembly_required: true, assembly_fee: 0, scheduled_date: "",
  });

  const rows = useMemo(() => (useApi ? (query.data ?? []) : demoRows), [useApi, query.data, demoRows]);
  const pending = rows.filter(r => r.status === "scheduled" || r.status === "out-for-delivery").length;

  const advance = async (id: string, status: string) => {
    const next = NEXT_STATUS[status];
    if (!next) return;
    if (useApi) {
      toast.error("Furniture delivery remains backlog debt — status updates are unavailable");
      return;
    }
    setDemoRows(prev => prev.map(r => r.id === id ? { ...r, status: next as typeof r.status } : r));
    toast.success(`Marked ${next.replace(/-/g, " ")}`);
  };

  const schedule = async () => {
    if (!form.customer_name || !form.delivery_address) {
      toast.error("Customer and address required");
      return;
    }
    if (useApi) {
      toast.error("Furniture delivery remains backlog debt — schedule is unavailable");
      return;
    }
    {
      setDemoRows(prev => [...prev, {
        id: `dlv-${Date.now()}`,
        delivery_no: `DLV-${String(prev.length + 101)}`,
        customer_name: form.customer_name,
        customer_phone: form.customer_phone,
        delivery_address: form.delivery_address,
        items_summary: form.items_summary,
        assembly_required: form.assembly_required,
        assembly_fee: form.assembly_fee,
        scheduled_date: form.scheduled_date || new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        status: "scheduled",
      }]);
    }
    setSheetOpen(false);
    setForm({ customer_name: "", customer_phone: "", delivery_address: "", items_summary: "", assembly_required: true, assembly_fee: 0, scheduled_date: "" });
    toast.success("Delivery scheduled");
  };

  return (
    <BackOfficePage
      title="Delivery Schedule"
      eyebrow="Furniture"
      subtitle="Home delivery · assembly crew · site address across Dhaka & districts"
      stats={[
        { label: "Pending deliveries", value: String(pending) },
        { label: "Delivered (sample)", value: String(rows.filter(r => r.status === "delivered").length) },
      ]}
      actions={
        <>
          {useApi && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => query.refetch()} disabled={query.isFetching}>
              <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
          )}
          <Button variant="outline" size="sm" asChild><Link to="/app/pos/furniture">Open POS</Link></Button>
          <Button size="sm" className="gap-1.5" onClick={() => setSheetOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Schedule delivery
          </Button>
        </>
      }
    >
      <EntityFormDrawer
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Schedule home delivery"
        onSubmit={schedule}
        submitLabel="Schedule"
        isPending={createMut.isPending}
      >
        <div className="space-y-3">
          <div><Label>Customer</Label><Input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} /></div>
          <div><Label>Phone</Label><Input value={form.customer_phone} onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))} /></div>
          <div><Label>Delivery address</Label><Input value={form.delivery_address} onChange={e => setForm(f => ({ ...f, delivery_address: e.target.value }))} placeholder="House, area, district" /></div>
          <div><Label>Items</Label><Input value={form.items_summary} onChange={e => setForm(f => ({ ...f, items_summary: e.target.value }))} placeholder="Sofa set, bed, etc." /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Delivery date</Label><Input type="date" value={form.scheduled_date} onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))} /></div>
            <div><Label>Assembly fee</Label><Input type="number" value={form.assembly_fee || ""} onChange={e => setForm(f => ({ ...f, assembly_fee: Number(e.target.value) }))} /></div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox checked={form.assembly_required} onCheckedChange={v => setForm(f => ({ ...f, assembly_required: Boolean(v) }))} id="asm" />
            <Label htmlFor="asm" className="font-normal">Assembly required</Label>
          </div>
        </div>
      </EntityFormDrawer>
      <ProductionIncompleteBanner
        moduleName="Furniture delivery"
        reason="Delivery schedule and status changes are toast-oriented without hardened posting."
      />
      <SectionCard title="Delivery board">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 text-left">Delivery</th>
                <th className="px-3 py-2.5 text-left">Customer</th>
                <th className="px-3 py-2.5 text-left">Items</th>
                <th className="px-3 py-2.5 text-left">Address</th>
                <th className="px-3 py-2.5 text-left">Date</th>
                <th className="px-3 py-2.5 text-right">Assembly</th>
                <th className="px-3 py-2.5 text-left">Status</th>
                <th className="px-5 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-secondary/30">
                  <td className="px-5 py-3 font-mono text-xs">{r.delivery_no}</td>
                  <td className="px-3 py-3">
                    <div className="font-medium">{r.customer_name}</div>
                    {r.customer_phone && <div className="text-xs text-muted-foreground">{r.customer_phone}</div>}
                  </td>
                  <td className="px-3 py-3 max-w-[140px] truncate">{r.items_summary}</td>
                  <td className="px-3 py-3 max-w-[180px] truncate text-muted-foreground">{r.delivery_address}</td>
                  <td className="px-3 py-3">{r.scheduled_date?.slice(0, 10) ?? "—"}</td>
                  <td className="px-3 py-3 text-right tabular">
                    {r.assembly_required ? fmtBDT(r.assembly_fee) : "—"}
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={r.status} />
                    {r.driver_note && <div className="mt-0.5 text-[10px] text-muted-foreground">{r.driver_note}</div>}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {NEXT_STATUS[r.status] && (
                      <Button size="sm" variant="outline" className="gap-1 h-8" onClick={() => advance(r.id, r.status)}>
                        <Truck className="h-3 w-3" /> Next
                      </Button>
                    )}
                    {r.assembly_required && <Badge variant="outline" className="ml-1 text-[9px]">Asm</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </BackOfficePage>
  );
}
