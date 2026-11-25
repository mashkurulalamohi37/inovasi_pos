import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, PageBody, SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { PermissionGate } from "@/components/pulse/gates";
import { EmptyState, LoadingState } from "@/components/pulse/states";
import { FileCheck, Plus, RefreshCw, Shield, Upload } from "lucide-react";
import { prescriptions as demoPrescriptions } from "@/lib/mock-extra";
import { shouldUseBackend } from "@/lib/demo-mode";
import { usePharmaPrescriptions, usePharmaRestrictedLog } from "@/hooks/use-industry-data";
import { useCreatePharmaPrescription } from "@/hooks/use-industry-backoffice";
import { useApiCustomers } from "@/hooks/use-api-config";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/app/pharmacy/prescription")({ component: Rx });

function Rx() {
  const useApi = shouldUseBackend();
  const query = usePharmaPrescriptions();
  const restrictedQuery = usePharmaRestrictedLog();
  const createMut = useCreatePharmaPrescription();
  const customersQuery = useApiCustomers();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    customer_id: "",
    patient_name: "",
    doctor_name: "",
    rx_ref: "",
    prescription_date: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const rows = useApi ? (query.data ?? []) : demoPrescriptions.map((r) => ({
    id: r.id,
    patient_name: r.patient,
    doctor_name: r.doctor,
    rx_ref: r.ref,
    status: r.status,
    created_at: r.ts,
    notes: null,
  }));

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.patient_name.trim() && !form.customer_id) next.patient = "Patient name or customer required";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    const customer = (customersQuery.data ?? []).find((c) => c.id === form.customer_id);
    await createMut.mutateAsync({
      customer_id: form.customer_id || undefined,
      patient_name: customer?.name ?? form.patient_name,
      doctor_name: form.doctor_name || undefined,
      rx_ref: form.rx_ref || undefined,
      prescription_date: form.prescription_date ? `${form.prescription_date}T12:00:00` : undefined,
      notes: form.notes || undefined,
      status: "captured",
    });
    setForm({ customer_id: "", patient_name: "", doctor_name: "", rx_ref: "", prescription_date: new Date().toISOString().slice(0, 10), notes: "" });
    setFormOpen(false);
    query.refetch();
  };

  return (
    <>
      <PageHeader
        title="Prescriptions"
        subtitle="Rx metadata capture — file upload deferred to document storage phase"
        actions={
          <>
            {useApi && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { query.refetch(); restrictedQuery.refetch(); }} disabled={query.isFetching}>
                <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} /> Refresh
              </Button>
            )}
            <PermissionGate perm="pharmacy.manage">
              <Button size="sm" className="gap-1.5" onClick={() => setFormOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Capture Rx
              </Button>
            </PermissionGate>
          </>
        }
      />
      <PageBody className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-3">
          <SectionCard className="lg:col-span-2" title="Prescription records">
            {useApi && query.isLoading ? (
              <LoadingState rows={3} />
            ) : rows.length === 0 ? (
              <EmptyState title="No prescriptions" description="Capture prescription metadata when a customer presents an Rx." />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-5 py-2.5 text-left">Ref</th>
                    <th className="px-3 py-2.5 text-left">Patient</th>
                    <th className="px-3 py-2.5 text-left">Doctor</th>
                    <th className="px-3 py-2.5 text-left">When</th>
                    <th className="px-5 py-2.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-secondary/30">
                      <td className="px-5 py-3 font-mono text-xs">{r.rx_ref ?? r.id}</td>
                      <td className="px-3 py-3 font-medium">{r.patient_name}</td>
                      <td className="px-3 py-3 text-muted-foreground">{r.doctor_name ?? "—"}</td>
                      <td className="px-3 py-3 text-muted-foreground">{(r.created_at ?? "").slice(0, 10)}</td>
                      <td className="px-5 py-3 text-right"><StatusBadge status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>

          <SectionCard title="Restricted medicine log" description="Dispensed with manager approval">
            {useApi && restrictedQuery.isLoading ? (
              <LoadingState rows={2} />
            ) : useApi ? (
              <div className="space-y-2 p-4">
                {(restrictedQuery.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No restricted sales logged yet.</p>
                ) : (
                  (restrictedQuery.data ?? []).map((l) => (
                    <Card key={l.id} className="p-3">
                      <div className="mb-1 flex items-center gap-1.5">
                        <Shield className="h-3.5 w-3.5 text-destructive" />
                        <span className="text-xs font-semibold text-destructive">Restricted</span>
                      </div>
                      <div className="text-sm font-medium">{l.product_name}</div>
                      <div className="text-xs text-muted-foreground">Approved by {l.approved_by}</div>
                    </Card>
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-2 p-4 text-sm text-muted-foreground">Demo restricted log — switch to backend mode for live data.</div>
            )}
          </SectionCard>
        </div>

        <SectionCard title="Rx file upload">
          <div className="grid gap-3 p-5 sm:grid-cols-3">
            <div className="flex h-32 flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 text-muted-foreground">
              <Upload className="h-6 w-6 opacity-50" />
              <div className="mt-2 px-3 text-center text-xs">Prescription file upload will be completed in document storage phase.</div>
            </div>
            <div className="flex h-32 flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 text-muted-foreground">
              <FileCheck className="h-6 w-6 opacity-50" />
              <div className="mt-2 px-3 text-center text-xs">Use Capture Rx for metadata until file storage is available.</div>
            </div>
          </div>
        </SectionCard>
      </PageBody>

      <EntityFormDrawer
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Capture prescription"
        onSubmit={submit}
        submitLabel="Save prescription"
        isPending={createMut.isPending}
        errorMessage={createMut.error instanceof Error ? createMut.error.message : null}
      >
        {useApi ? (
          <div>
            <Label>Customer (optional)</Label>
            <Select value={form.customer_id} onValueChange={(v) => setForm((f) => ({ ...f, customer_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Link customer" /></SelectTrigger>
              <SelectContent>
                {(customersQuery.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div>
          <Label>Patient name</Label>
          <Input value={form.patient_name} onChange={(e) => setForm((f) => ({ ...f, patient_name: e.target.value }))} />
          {errors.patient && <p className="text-xs text-destructive mt-1">{errors.patient}</p>}
        </div>
        <div><Label>Doctor</Label><Input value={form.doctor_name} onChange={(e) => setForm((f) => ({ ...f, doctor_name: e.target.value }))} /></div>
        <div><Label>Rx reference</Label><Input value={form.rx_ref} onChange={(e) => setForm((f) => ({ ...f, rx_ref: e.target.value }))} className="font-mono" /></div>
        <div><Label>Prescription date</Label><Input type="date" value={form.prescription_date} onChange={(e) => setForm((f) => ({ ...f, prescription_date: e.target.value }))} /></div>
        <div><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
      </EntityFormDrawer>
    </>
  );
}
