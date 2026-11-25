import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { EmptyState, LoadingState } from "@/components/pulse/states";
import { Plus, RefreshCw, Scissors } from "lucide-react";
import { useCustomerFabrics, useCreateCustomerFabric, useUpdateCustomerFabric } from "@/hooks/use-industry-backoffice";
import { isDemoMode } from "@/lib/demo-mode";
import { toast } from "sonner";

export const Route = createFileRoute("/app/tailoring/fabrics")({
  component: FabricsPage,
});

type FabricRow = {
  id: string;
  customer_name: string;
  customer_phone: string;
  description: string;
  status: string;
  job_id?: string | null;
  created_at?: string | null;
};

const demoFabrics: FabricRow[] = [
  {
    id: "fab-1",
    customer_name: "Nabila C.",
    customer_phone: "01711112222",
    description: '3.5m Cotton Print fabric for Panjabi stitching',
    status: "cutting",
    job_id: "ALT-001",
    created_at: new Date().toISOString(),
  },
  {
    id: "fab-2",
    customer_name: "Zoya Rahman",
    customer_phone: "01822223333",
    description: "4m Silk saree blouse material",
    status: "received",
    job_id: null,
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
];

const STATUSES = ["received", "cutting", "completed", "returned"] as const;

function FabricsPage() {
  const useApi = !isDemoMode();
  const [filter, setFilter] = useState<string>("all");
  const query = useCustomerFabrics(filter === "all" ? undefined : filter);
  const createMut = useCreateCustomerFabric();
  const updateMut = useUpdateCustomerFabric();

  const [formOpen, setFormOpen] = useState(false);
  const [localRows, setLocalRows] = useState<FabricRow[]>(demoFabrics);
  const [form, setForm] = useState({
    customer_name: "",
    customer_phone: "",
    description: "",
    status: "received",
    job_id: "",
  });

  const rows = useMemo(() => {
    if (useApi) {
      return (query.data ?? []) as FabricRow[];
    }
    return filter === "all" ? localRows : localRows.filter((r) => r.status === filter);
  }, [useApi, query.data, localRows, filter]);

  const handleCreate = async () => {
    if (!form.description.trim()) {
      toast.error("Fabric description is required");
      return;
    }
    if (useApi) {
      try {
        await createMut.mutateAsync({
          customer_name: form.customer_name || "Walk-in",
          customer_phone: form.customer_phone,
          description: form.description,
          status: form.status,
          job_id: form.job_id || null,
        });
        toast.success("Custody record created");
        query.refetch();
        setFormOpen(false);
      } catch (err) {
        toast.error("Failed to create custody record");
      }
    } else {
      const newRec: FabricRow = {
        id: `fab-${Date.now()}`,
        customer_name: form.customer_name || "Walk-in",
        customer_phone: form.customer_phone,
        description: form.description,
        status: form.status,
        job_id: form.job_id || null,
        created_at: new Date().toISOString(),
      };
      setLocalRows((prev) => [newRec, ...prev]);
      toast.success("Custody record added (Demo Mode)");
      setFormOpen(false);
    }
    setForm({ customer_name: "", customer_phone: "", description: "", status: "received", job_id: "" });
  };

  const advanceStatus = async (id: string, current: string) => {
    const idx = STATUSES.indexOf(current as typeof STATUSES[number]);
    const next = STATUSES[Math.min(idx + 1, STATUSES.length - 1)];
    if (useApi) {
      try {
        await updateMut.mutateAsync({ id, body: { status: next } });
        toast.success(`Fabric updated to ${next}`);
        query.refetch();
      } catch (err) {
        toast.error("Failed to update fabric status");
      }
    } else {
      setLocalRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: next } : r)),
      );
      toast.success(`Fabric updated to ${next} (Demo Mode)`);
    }
  };

  const openCount = rows.filter((r) => r.status === "received" || r.status === "cutting").length;

  return (
    <BackOfficePage
      title="Customer Fabric Custody"
      eyebrow="Tailoring"
      subtitle="Track raw fabric custody ledgering"
      stats={[
        { label: "Active Custody", value: String(openCount) },
        { label: "Completed/Returned", value: String(rows.filter((r) => r.status === "completed" || r.status === "returned").length) },
      ]}
      actions={
        <>
          {useApi && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => query.refetch()} disabled={query.isFetching}>
              <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
          )}
          <Button size="sm" className="gap-1.5" onClick={() => setFormOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Intake Fabric
          </Button>
        </>
      }
    >
      <div className="mb-4 flex gap-2">
        {["all", ...STATUSES].map((s) => (
          <Button key={s} size="sm" variant={filter === s ? "default" : "outline"} className="capitalize" onClick={() => setFilter(s)}>
            {s}
          </Button>
        ))}
      </div>

      <SectionCard title="Custody Inventory">
        {useApi && query.isLoading ? (
          <LoadingState rows={3} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No fabrics in custody"
            description="Log fabric materials provided by customers to stitch or alter."
            icon={Scissors}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 text-left">Received Date</th>
                  <th className="px-3 py-2.5 text-left">Customer</th>
                  <th className="px-3 py-2.5 text-left">Fabric Description</th>
                  <th className="px-3 py-2.5 text-left">Job Ref</th>
                  <th className="px-3 py-2.5 text-left">Status</th>
                  <th className="px-5 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-secondary/30">
                    <td className="px-5 py-3 text-muted-foreground">
                      {r.created_at ? r.created_at.slice(0, 10) : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium">{r.customer_name}</div>
                      {r.customer_phone && <div className="text-xs text-muted-foreground">{r.customer_phone}</div>}
                    </td>
                    <td className="px-3 py-3 max-w-[250px] truncate">{r.description}</td>
                    <td className="px-3 py-3 font-mono text-xs text-indigo-600">
                      {r.job_id ?? "—"}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      {r.status !== "returned" && (
                        <Button size="sm" variant="outline" className="gap-1 h-8" onClick={() => advanceStatus(r.id, r.status)} disabled={updateMut.isPending}>
                          Next Status
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <EntityFormDrawer
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Fabric Intake Custody Log"
        onSubmit={handleCreate}
        submitLabel="Intake Fabric"
        isPending={createMut.isPending}
      >
        <div className="space-y-4">
          <div>
            <Label>Customer Name</Label>
            <Input value={form.customer_name} onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))} placeholder="e.g. Walk-in" />
          </div>
          <div>
            <Label>Phone Number</Label>
            <Input value={form.customer_phone} onChange={(e) => setForm((f) => ({ ...f, customer_phone: e.target.value }))} />
          </div>
          <div>
            <Label>Fabric Description</Label>
            <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder='e.g. 3m red linen' />
          </div>
          <div>
            <Label>Alteration Job ID (Optional)</Label>
            <Input value={form.job_id} onChange={(e) => setForm((f) => ({ ...f, job_id: e.target.value }))} placeholder="e.g. ALT-001" />
          </div>
          <div>
            <Label>Intake Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </EntityFormDrawer>
    </BackOfficePage>
  );
}
