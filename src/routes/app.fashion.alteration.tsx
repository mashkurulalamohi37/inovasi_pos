import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { PermissionGate } from "@/components/pulse/gates";
import { EmptyState, LoadingState } from "@/components/pulse/states";
import { Plus, RefreshCw, Scissors } from "lucide-react";
import { alterationOrders } from "@/lib/industry-mock";
import { shouldUseBackend } from "@/lib/demo-mode";
import { fmtBDT } from "@/lib/pos-data";
import { useFashionAlterations, useFashionVariants } from "@/hooks/use-industry-data";
import { useCreateFashionAlteration, useUpdateFashionAlteration } from "@/hooks/use-industry-backoffice";
import { useApiCustomers } from "@/hooks/use-api-config";

export const Route = createFileRoute("/app/fashion/alteration")({ component: Page });

const STATUSES = ["new", "in_progress", "ready", "delivered", "cancelled"] as const;

function Page() {
  const useApi = shouldUseBackend();
  const query = useFashionAlterations();
  const variantsQuery = useFashionVariants();
  const customersQuery = useApiCustomers();
  const createMut = useCreateFashionAlteration();
  const updateMut = useUpdateFashionAlteration();
  const [filter, setFilter] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [demoRows, setDemoRows] = useState(alterationOrders);
  const [form, setForm] = useState({
    customer_id: "",
    customer_name: "",
    product_sku: "",
    variant_id: "",
    instruction: "",
    measurement_note: "",
    charge_amount: 0,
    paid_amount: 0,
    delivery_date: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const rows = useMemo(() => {
    if (!useApi) {
      const data = demoRows;
      return filter === "all" ? data : data.filter((r) => r.status === filter);
    }
    const data = query.data ?? [];
    return filter === "all" ? data : data.filter((r) => r.status === filter);
  }, [useApi, query.data, demoRows, filter]);

  const openJobs = rows.filter((r) => r.status === "new" || r.status === "in_progress" || r.status === "pending").length;

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.customer_name.trim() && !form.customer_id) next.customer = "Customer is required";
    if (form.charge_amount < 0) next.charge = "Charge cannot be negative";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const createJob = async () => {
    if (!validate()) return;
    const variant = (variantsQuery.data ?? []).find((v) => v.id === form.variant_id);
    if (useApi) {
      const customer = (customersQuery.data ?? []).find((c) => c.id === form.customer_id);
      await createMut.mutateAsync({
        customer_id: form.customer_id || undefined,
        customer_name: customer?.name ?? form.customer_name,
        product_sku: variant?.sku ?? form.product_sku,
        variant_id: form.variant_id || undefined,
        instruction: form.instruction || undefined,
        measurement_note: form.measurement_note || undefined,
        charge_amount: form.charge_amount,
        paid_amount: form.paid_amount,
        delivery_date: form.delivery_date ? `${form.delivery_date}T12:00:00` : undefined,
        status: "new",
      });
      query.refetch();
    } else {
      setDemoRows((prev) => [...prev, {
        id: `alt-${Date.now()}`,
        customer: form.customer_name,
        item: variant?.product_name ?? form.product_sku,
        task: form.instruction || "Alteration",
        due: form.delivery_date || new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10),
        status: "pending",
      }]);
    }
    setForm({
      customer_id: "", customer_name: "", product_sku: "", variant_id: "",
      instruction: "", measurement_note: "", charge_amount: 0, paid_amount: 0, delivery_date: "",
    });
    setFormOpen(false);
  };

  const advanceStatus = async (id: string, current: string) => {
    const idx = STATUSES.indexOf(current as typeof STATUSES[number]);
    const next = STATUSES[Math.min(idx + 1, STATUSES.length - 1)];
    if (useApi) {
      await updateMut.mutateAsync({ id, body: { status: next } });
      query.refetch();
    } else {
      setDemoRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: next } : r)));
    }
  };

  return (
    <BackOfficePage
      title="Alteration Orders"
      eyebrow="Fashion"
      subtitle={`${openJobs} open alteration jobs`}
      actions={
        <>
          {useApi && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => query.refetch()} disabled={query.isFetching}>
              <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
          )}
          <PermissionGate perm="fashion.manage">
            <Button size="sm" className="gap-1.5" onClick={() => setFormOpen(true)}>
              <Scissors className="h-3.5 w-3.5" /> New job
            </Button>
          </PermissionGate>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {["all", ...STATUSES].map((s) => (
          <Button key={s} size="sm" variant={filter === s ? "default" : "outline"} onClick={() => setFilter(s)}>
            {s.replace("_", " ")}
          </Button>
        ))}
      </div>
      <SectionCard title="Alteration queue">
        {useApi && query.isLoading ? (
          <LoadingState rows={3} />
        ) : rows.length === 0 ? (
          <EmptyState title="No alteration orders" description="Create a tailoring job for hems, sleeves, or fittings." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 text-left">Job #</th>
                <th className="px-3 py-2.5 text-left">Customer</th>
                <th className="px-3 py-2.5 text-left">Item</th>
                <th className="px-3 py-2.5 text-left">Task</th>
                <th className="px-3 py-2.5 text-left">Due</th>
                <th className="px-3 py-2.5 text-right">Charge</th>
                <th className="px-5 py-2.5 text-right">Status</th>
                <th className="px-5 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((a) => {
                const jobNo = "job_no" in a ? (a as { job_no?: string }).job_no : a.id;
                const customer = "customer_name" in a ? (a as { customer_name: string }).customer_name : (a as { customer: string }).customer;
                const item = "product_sku" in a ? (a as { product_sku: string }).product_sku : (a as { item: string }).item;
                const task = "instruction" in a ? ((a as { instruction?: string }).instruction ?? "—") : (a as { task: string }).task;
                const due = "delivery_date" in a
                  ? ((a as { delivery_date?: string | null }).delivery_date?.slice(0, 10) ?? "—")
                  : (a as { due: string }).due;
                const charge = "charge_amount" in a ? (a as { charge_amount: number }).charge_amount : 0;
                return (
                  <tr key={a.id} className="hover:bg-secondary/30">
                    <td className="px-5 py-3 font-mono text-xs">{jobNo ?? a.id}</td>
                    <td className="px-3 py-3">{customer}</td>
                    <td className="px-3 py-3 font-medium">{item}</td>
                    <td className="px-3 py-3 text-muted-foreground">{task}</td>
                    <td className="px-3 py-3 text-muted-foreground">{due}</td>
                    <td className="px-3 py-3 text-right tabular">{fmtBDT(charge)}</td>
                    <td className="px-5 py-3 text-right"><StatusBadge status={a.status} /></td>
                    <td className="px-5 py-3 text-right">
                      {a.status !== "delivered" && a.status !== "cancelled" && (
                        <Button variant="ghost" size="sm" onClick={() => advanceStatus(a.id, a.status)} disabled={updateMut.isPending}>
                          Advance
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </SectionCard>

      <EntityFormDrawer
        open={formOpen}
        onOpenChange={setFormOpen}
        title="New alteration order"
        onSubmit={createJob}
        submitLabel="Create order"
        isPending={createMut.isPending}
        errorMessage={createMut.error instanceof Error ? createMut.error.message : null}
      >
        {useApi ? (
          <div>
            <Label>Customer</Label>
            <Select value={form.customer_id} onValueChange={(v) => setForm((f) => ({ ...f, customer_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>
                {(customersQuery.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.customer && <p className="text-xs text-destructive mt-1">{errors.customer}</p>}
          </div>
        ) : (
          <div>
            <Label>Customer</Label>
            <Input value={form.customer_name} onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))} />
            {errors.customer && <p className="text-xs text-destructive mt-1">{errors.customer}</p>}
          </div>
        )}
        <div>
          <Label>Variant (optional)</Label>
          <Select value={form.variant_id} onValueChange={(v) => setForm((f) => ({ ...f, variant_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Link product variant" /></SelectTrigger>
            <SelectContent>
              {(variantsQuery.data ?? []).filter((v) => v.source !== "legacy").map((v) => (
                <SelectItem key={v.id} value={v.id}>{v.product_name} · {v.size} · {v.color}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Instruction</Label><Input value={form.instruction} onChange={(e) => setForm((f) => ({ ...f, instruction: e.target.value }))} placeholder="e.g. Sleeve shorten 2cm" /></div>
        <div><Label>Measurement note</Label><Input value={form.measurement_note} onChange={(e) => setForm((f) => ({ ...f, measurement_note: e.target.value }))} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Charge (BDT)</Label><Input type="number" min={0} value={form.charge_amount} onChange={(e) => setForm((f) => ({ ...f, charge_amount: Number(e.target.value) }))} /></div>
          <div><Label>Paid (BDT)</Label><Input type="number" min={0} value={form.paid_amount} onChange={(e) => setForm((f) => ({ ...f, paid_amount: Number(e.target.value) }))} /></div>
        </div>
        {errors.charge && <p className="text-xs text-destructive">{errors.charge}</p>}
        <div><Label>Delivery date</Label><Input type="date" value={form.delivery_date} onChange={(e) => setForm((f) => ({ ...f, delivery_date: e.target.value }))} /></div>
      </EntityFormDrawer>
    </BackOfficePage>
  );
}
