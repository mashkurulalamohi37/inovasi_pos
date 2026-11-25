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
import { useSalonServices } from "@/hooks/use-api-config";
import { useUpsertSalonService } from "@/hooks/use-industry-backoffice";
import { fmtBDT } from "@/lib/pos-data";
import { toast } from "sonner";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";

export const Route = createFileRoute("/app/salon/services")({ component: SalonServicesPage });

function SalonServicesPage() {
  const useApi = shouldUseBackend();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    id: "",
    service_code: "",
    service_name: "",
    category: "Hair",
    default_duration_minutes: "30",
    base_price: "",
    commission_rate: "20",
    requires_resource: true,
    requires_staff: true,
  });

  const query = useSalonServices({ q: q || undefined, category: category || undefined });
  const upsert = useUpsertSalonService();
  const rows = useMemo(() => query.data ?? [], [query.data]);

  const submit = async () => {
    if (!form.service_code.trim() || !form.service_name.trim()) {
      toast.error("Service code and name required");
      return;
    }
    try {
      await upsert.mutateAsync({
        ...(form.id ? { id: form.id } : {}),
        service_code: form.service_code.trim(),
        service_name: form.service_name.trim(),
        category: form.category.trim() || undefined,
        default_duration_minutes: Number(form.default_duration_minutes || 30),
        base_price: Number(form.base_price || 0),
        commission_type: "percentage",
        commission_rate: Number(form.commission_rate || 0),
        requires_resource: form.requires_resource,
        requires_staff: form.requires_staff,
        is_active: true,
      });
      toast.success(form.id ? "Service updated" : "Service created");
      setOpen(false);
      setForm({
        id: "",
        service_code: "",
        service_name: "",
        category: "Hair",
        default_duration_minutes: "30",
        base_price: "",
        commission_rate: "20",
        requires_resource: true,
        requires_staff: true,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  if (!useApi) {
    return (
      <>
        <PageHeader title="Service menu" subtitle="Backend mode required for live salon services." />
        <PageBody>
          <EmptyState title="Backend required" description="Salon service catalog is not available in demo mode." />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Service menu" subtitle="Duration, price, and commission rules for salon services." />
      <PageBody>
        <div className="mb-4 flex flex-wrap gap-2">
          <Input className="max-w-xs" placeholder="Search services…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Input className="max-w-[140px]" placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
          <PermissionGate perm="salon.manage">
            <Button size="sm" className="gap-1" onClick={() => setOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Add service
            </Button>
          </PermissionGate>
          <DisabledReasonButton label="Packages" reason="Package entitlements deferred — use DisabledReason until Phase packages ship" />
        </div>
        <SectionCard>
          {query.isLoading ? (
            <LoadingState rows={4} />
          ) : query.isError ? (
            <ErrorState title="Failed to load services" description="Check salon.view permission." />
          ) : rows.length === 0 ? (
            <EmptyState title="No services" description="Create a haircut, facial, or other service." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 text-left">Code</th>
                  <th className="px-3 py-2.5 text-left">Name</th>
                  <th className="px-3 py-2.5 text-left">Category</th>
                  <th className="px-3 py-2.5 text-right">Duration</th>
                  <th className="px-3 py-2.5 text-right">Price</th>
                  <th className="px-3 py-2.5 text-right">Commission</th>
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
                        service_code: String(r.service_code ?? ""),
                        service_name: String(r.service_name ?? ""),
                        category: String(r.category ?? "Hair"),
                        default_duration_minutes: String(r.default_duration_minutes ?? 30),
                        base_price: String(r.base_price ?? ""),
                        commission_rate: String(r.commission_rate ?? 0),
                        requires_resource: Boolean(r.requires_resource),
                        requires_staff: Boolean(r.requires_staff),
                      });
                      setOpen(true);
                    }}
                  >
                    <td className="px-5 py-3 font-mono text-xs">{String(r.service_code)}</td>
                    <td className="px-3 py-3 font-medium">{String(r.service_name)}</td>
                    <td className="px-3 py-3 text-xs">{String(r.category ?? "—")}</td>
                    <td className="px-3 py-3 text-right text-xs">{String(r.default_duration_minutes)} min</td>
                    <td className="px-3 py-3 text-right text-xs">{fmtBDT(Number(r.base_price ?? 0))}</td>
                    <td className="px-3 py-3 text-right text-xs">{String(r.commission_rate ?? 0)}%</td>
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

      <EntityFormDrawer
        open={open}
        onOpenChange={setOpen}
        title={form.id ? "Edit service" : "New service"}
        onSubmit={submit}
        isPending={upsert.isPending}
      >
        <div className="grid gap-3">
          <div><Label>Code</Label><Input value={form.service_code} onChange={(e) => setForm({ ...form, service_code: e.target.value })} /></div>
          <div><Label>Name</Label><Input value={form.service_name} onChange={(e) => setForm({ ...form, service_name: e.target.value })} /></div>
          <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Duration (min)</Label><Input type="number" value={form.default_duration_minutes} onChange={(e) => setForm({ ...form, default_duration_minutes: e.target.value })} /></div>
            <div><Label>Price (BDT)</Label><Input type="text" inputMode="numeric" placeholder="0" value={form.base_price} onChange={(e) => setForm({ ...form, base_price: e.target.value.replace(/[^0-9]/g, "") })} /></div>
          </div>
          <div><Label>Commission %</Label><Input type="number" value={form.commission_rate} onChange={(e) => setForm({ ...form, commission_rate: e.target.value })} /></div>
        </div>
      </EntityFormDrawer>
    </>
  );
}
