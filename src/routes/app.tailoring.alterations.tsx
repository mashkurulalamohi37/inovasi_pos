import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { Plus, RefreshCw, Scissors } from "lucide-react";
import { useTailoringAlterations } from "@/hooks/use-industry-data";
import { useCreateTailoringJob, useUpdateTailoringJob } from "@/hooks/use-industry-backoffice";
import { tailoringAlterationQueue, tailoringMasters } from "@/lib/industry-mock";
import { isDemoMode } from "@/lib/demo-mode";
import { fmtBDT } from "@/lib/pos-data";
import { toast } from "sonner";

export const Route = createFileRoute("/app/tailoring/alterations")({
  component: Page,
});

const STATUSES = ["pending", "in-progress", "ready", "collected"] as const;

function Page() {
  const useApi = !isDemoMode();
  const query = useTailoringAlterations();
  const createMut = useCreateTailoringJob();
  const updateMut = useUpdateTailoringJob();
  const [filter, setFilter] = useState<string>("all");
  const [demoRows, setDemoRows] = useState(tailoringAlterationQueue);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState({
    customer_name: "", customer_phone: "", garment_type: "Shirt",
    alteration_task: "Hem", master_name: "Karim Master", amount: 0, due_date: "",
  });

  const rows = useMemo(() => {
    const data = useApi ? (query.data ?? []) : demoRows;
    return filter === "all" ? data : data.filter(r => r.status === filter);
  }, [useApi, query.data, demoRows, filter]);

  const advanceStatus = async (id: string, current: string) => {
    const idx = STATUSES.indexOf(current as typeof STATUSES[number]);
    const next = STATUSES[Math.min(idx + 1, STATUSES.length - 1)];
    if (useApi) {
      await updateMut.mutateAsync({ id, body: { status: next } });
      toast.success(`Moved to ${next}`);
    } else {
      setDemoRows(prev => prev.map(r => r.id === id ? { ...r, status: next as typeof r.status } : r));
      toast.success(`Moved to ${next}`);
    }
  };

  const createJob = async () => {
    if (!form.customer_name) { toast.error("Customer name required"); return; }
    if (useApi) {
      await createMut.mutateAsync({
        ...form,
        due_date: form.due_date ? `${form.due_date}T12:00:00` : undefined,
      });
    } else {
      setDemoRows(prev => [...prev, {
        id: `alt-${Date.now()}`,
        job_no: `ALT-${String(prev.length + 1).padStart(3, "0")}`,
        customer_name: form.customer_name,
        customer_phone: form.customer_phone,
        garment_type: form.garment_type,
        alteration_task: form.alteration_task,
        master_name: form.master_name,
        status: "pending",
        due_date: form.due_date || new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10),
        amount: form.amount,
      }]);
    }
    setForm({ customer_name: "", customer_phone: "", garment_type: "Shirt", alteration_task: "Hem", master_name: "Karim Master", amount: 0, due_date: "" });
    setSheetOpen(false);
    toast.success("Alteration job created");
  };

  const pending = rows.filter(r => r.status === "pending" || r.status === "in-progress").length;

  return (
    <BackOfficePage
      title="Alteration Queue"
      eyebrow="Tailoring"
      subtitle="Track stitching & alteration jobs · master tailor · due dates"
      stats={[
        { label: "Open jobs", value: String(pending) },
        { label: "Ready for pickup", value: String(rows.filter(r => r.status === "ready").length) },
      ]}
      actions={
        <>
          {useApi && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => query.refetch()} disabled={query.isFetching}>
              <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
          )}
          <Button variant="outline" size="sm" asChild><Link to="/app/tailoring/measurements">Measurements</Link></Button>
          <Button size="sm" className="gap-1.5" onClick={() => setSheetOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> New job
          </Button>
        </>
      }
    >
      <EntityFormDrawer
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="New alteration job"
        onSubmit={createJob}
        submitLabel="Create job"
        isPending={createMut.isPending}
      >
        <div className="space-y-3">
          <div><Label>Customer</Label><Input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} /></div>
          <div><Label>Phone</Label><Input value={form.customer_phone} onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Garment</Label><Input value={form.garment_type} onChange={e => setForm(f => ({ ...f, garment_type: e.target.value }))} /></div>
            <div>
              <Label>Task</Label>
              <Select value={form.alteration_task} onValueChange={v => setForm(f => ({ ...f, alteration_task: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Hem", "Sleeve", "Waist", "Full stitch", "Embroidery"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Master</Label>
              <Select value={form.master_name} onValueChange={v => setForm(f => ({ ...f, master_name: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{tailoringMasters.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Amount</Label><Input type="number" value={form.amount || ""} onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))} /></div>
          </div>
          <div><Label>Due date</Label><Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} /></div>
        </div>
      </EntityFormDrawer>
      <SectionCard title="Job queue">
        <div className="flex gap-2 border-b border-border px-5 py-3">
          {["all", ...STATUSES].map(s => (
            <Button key={s} size="sm" variant={filter === s ? "default" : "outline"} className="h-8 capitalize" onClick={() => setFilter(s)}>
              {s === "all" ? "All" : s.replace("-", " ")}
            </Button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 text-left">Job</th>
                <th className="px-3 py-2.5 text-left">Customer</th>
                <th className="px-3 py-2.5 text-left">Garment / task</th>
                <th className="px-3 py-2.5 text-left">Master</th>
                <th className="px-3 py-2.5 text-left">Due</th>
                <th className="px-3 py-2.5 text-right">Amount</th>
                <th className="px-3 py-2.5 text-left">Status</th>
                <th className="px-5 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-secondary/30">
                  <td className="px-5 py-3 font-mono text-xs">{r.job_no}</td>
                  <td className="px-3 py-3">
                    <div className="font-medium">{r.customer_name}</div>
                    {r.customer_phone && <div className="text-xs text-muted-foreground">{r.customer_phone}</div>}
                  </td>
                  <td className="px-3 py-3">{r.garment_type} · {r.alteration_task}</td>
                  <td className="px-3 py-3"><Badge variant="outline">{r.master_name}</Badge></td>
                  <td className="px-3 py-3 text-muted-foreground">{r.due_date?.slice(0, 10) ?? "—"}</td>
                  <td className="px-3 py-3 text-right tabular">{fmtBDT(r.amount)}</td>
                  <td className="px-3 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-5 py-3 text-right">
                    {r.status !== "collected" && (
                      <Button size="sm" variant="outline" className="gap-1 h-8" onClick={() => advanceStatus(r.id, r.status)}>
                        <Scissors className="h-3 w-3" /> Next
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-muted-foreground">No jobs in this filter</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </BackOfficePage>
  );
}
