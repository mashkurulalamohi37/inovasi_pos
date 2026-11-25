import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, PageBody, SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { PermissionGate } from "@/components/pulse/gates";
import { EmptyState, ErrorState, LoadingState } from "@/components/pulse/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useSalonServices, useSalonStaff } from "@/hooks/use-api-config";
import { useSetSalonStaffServices, useUpsertSalonStaff } from "@/hooks/use-industry-backoffice";
import { toast } from "sonner";

export const Route = createFileRoute("/app/salon/stylists")({ component: SalonStylistsPage });

function SalonStylistsPage() {
  const useApi = shouldUseBackend();
  const staffQuery = useSalonStaff();
  const servicesQuery = useSalonServices({ active_only: true });
  const upsert = useUpsertSalonStaff();
  const setServices = useSetSalonStaffServices();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    id: "",
    display_name: "",
    staff_code: "",
    default_commission_rate: "15",
    service_ids: [] as string[],
  });

  const rows = useMemo(() => staffQuery.data ?? [], [staffQuery.data]);
  const services = useMemo(() => servicesQuery.data ?? [], [servicesQuery.data]);

  const submit = async () => {
    if (!form.display_name.trim()) {
      toast.error("Display name required");
      return;
    }
    try {
      const saved = await upsert.mutateAsync({
        ...(form.id ? { id: form.id } : {}),
        display_name: form.display_name.trim(),
        staff_code: form.staff_code.trim() || undefined,
        appointment_enabled: true,
        commission_enabled: true,
        default_commission_type: "percentage",
        default_commission_rate: Number(form.default_commission_rate || 0),
        is_active: true,
      });
      if (form.service_ids.length && saved?.id) {
        await setServices.mutateAsync({ staffId: String(saved.id), serviceIds: form.service_ids });
      }
      toast.success(form.id ? "Stylist updated" : "Stylist created");
      setOpen(false);
      setForm({ id: "", display_name: "", staff_code: "", default_commission_rate: "15", service_ids: [] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  if (!useApi) {
    return (
      <>
        <PageHeader title="Stylists" subtitle="Backend mode required for live staff mapping." />
        <PageBody>
          <EmptyState title="Backend required" description="Salon stylist profiles are not available in demo mode." />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Stylists" subtitle="Map salon staff to services. Not a full HR/payroll system." />
      <PageBody>
        <div className="mb-4 flex flex-wrap gap-2">
          <PermissionGate perm="salon.manage">
            <Button size="sm" className="gap-1" onClick={() => setOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Add stylist
            </Button>
          </PermissionGate>
        </div>
        <SectionCard>
          {staffQuery.isLoading ? (
            <LoadingState rows={3} />
          ) : staffQuery.isError ? (
            <ErrorState title="Failed to load stylists" description="Check salon.view permission." />
          ) : rows.length === 0 ? (
            <EmptyState title="No stylists" description="Create a staff profile and assign eligible services." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 text-left">Name</th>
                  <th className="px-3 py-2.5 text-left">Code</th>
                  <th className="px-3 py-2.5 text-right">Default commission</th>
                  <th className="px-3 py-2.5 text-left">Booking</th>
                  <th className="px-5 py-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr
                    key={String(r.id)}
                    className="cursor-pointer hover:bg-secondary/30"
                    onClick={() => {
                      setForm({
                        id: String(r.id),
                        display_name: String(r.display_name ?? ""),
                        staff_code: String(r.staff_code ?? ""),
                        default_commission_rate: String(r.default_commission_rate ?? 0),
                        service_ids: [],
                      });
                      setOpen(true);
                    }}
                  >
                    <td className="px-5 py-3 font-medium">{String(r.display_name)}</td>
                    <td className="px-3 py-3 font-mono text-xs">{String(r.staff_code ?? "—")}</td>
                    <td className="px-3 py-3 text-right text-xs">{String(r.default_commission_rate ?? 0)}%</td>
                    <td className="px-3 py-3 text-xs">{r.appointment_enabled ? "Enabled" : "Off"}</td>
                    <td className="px-5 py-3 text-right">
                      <StatusBadge status={r.is_active ? "active" : "completed"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      </PageBody>

      <EntityFormDrawer open={open} onOpenChange={setOpen} title={form.id ? "Edit stylist" : "New stylist"} onSubmit={submit} isPending={upsert.isPending}>
        <div className="grid gap-3">
          <div><Label>Display name</Label><Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></div>
          <div><Label>Staff code</Label><Input value={form.staff_code} onChange={(e) => setForm({ ...form, staff_code: e.target.value })} /></div>
          <div><Label>Default commission %</Label><Input type="number" value={form.default_commission_rate} onChange={(e) => setForm({ ...form, default_commission_rate: e.target.value })} /></div>
          <div>
            <Label>Eligible services</Label>
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded border p-2 text-sm">
              {services.map((s) => {
                const id = String(s.id);
                const checked = form.service_ids.includes(id);
                return (
                  <label key={id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setForm({
                          ...form,
                          service_ids: checked
                            ? form.service_ids.filter((x) => x !== id)
                            : [...form.service_ids, id],
                        })
                      }
                    />
                    {String(s.service_name)}
                  </label>
                );
              })}
              {services.length === 0 && <div className="text-muted-foreground text-xs">No active services yet</div>}
            </div>
          </div>
        </div>
      </EntityFormDrawer>
    </>
  );
}
