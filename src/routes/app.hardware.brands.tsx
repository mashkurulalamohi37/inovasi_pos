import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { PermissionGate } from "@/components/pulse/gates";
import { EmptyState, ErrorState, LoadingState } from "@/components/pulse/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Plus, Search } from "lucide-react";
import { shouldUseBackend } from "@/lib/demo-mode";
import {
  useBrands,
  useCreateBrand,
  useUpdateBrand,
  useHardwareProfiles,
  type ApiMasterBrand,
} from "@/hooks/use-api-config";
import { toast } from "sonner";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";

export const Route = createFileRoute("/app/hardware/brands")({ component: HardwareBrandsPage });

function HardwareBrandsPage() {
  const useApi = shouldUseBackend();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ApiMasterBrand | null>(null);
  const [form, setForm] = useState({ code: "", name: "", is_active: true });

  const brandsQuery = useBrands(q || undefined, useApi);
  const profilesQuery = useHardwareProfiles({ active_only: true }, useApi);
  const createMut = useCreateBrand();
  const updateMut = useUpdateBrand();

  const hardwareBrandIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of profilesQuery.data ?? []) {
      if (p.brand_id) ids.add(String(p.brand_id));
    }
    return ids;
  }, [profilesQuery.data]);

  const productCountByBrand = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of profilesQuery.data ?? []) {
      if (!p.brand_id) continue;
      const id = String(p.brand_id);
      map.set(id, (map.get(id) ?? 0) + 1);
    }
    return map;
  }, [profilesQuery.data]);

  const rows = useMemo(() => {
    const all = brandsQuery.data ?? [];
    // Prefer brands used by hardware profiles; still show all brands for create/filter
    if (hardwareBrandIds.size === 0) return all;
    const hw = all.filter((b) => hardwareBrandIds.has(b.id));
    return hw.length ? hw : all;
  }, [brandsQuery.data, hardwareBrandIds]);

  const openCreate = () => {
    setEditing(null);
    setForm({ code: "", name: "", is_active: true });
    setOpen(true);
  };
  const openEdit = (r: ApiMasterBrand) => {
    setEditing(r);
    setForm({ code: r.code, name: r.name, is_active: r.is_active !== false });
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!useApi) {
      toast.error("Backend mode required to manage brands");
      return;
    }
    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, body: { name: form.name, is_active: form.is_active } });
        toast.success("Brand updated");
      } else {
        await createMut.mutateAsync({ code: form.code, name: form.name });
        toast.success("Brand created");
      }
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Brand save failed");
    }
  };

  if (!useApi) {
    return (
      <>
        <PageHeader title="Hardware brands" subtitle="Shared brand master filtered for hardware products" />
        <PageBody>
          <EmptyState
            title="Backend required"
            description="Hardware brands use the shared Brand master. Enable backend mode to list and manage brands."
          />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Hardware brands"
        subtitle="Reuses shared Brand master — filter hardware products by brand"
        actions={
          <PermissionGate perm="hardware.manage" fallback={<DisabledReasonButton label="Add brand" reason="Requires hardware.manage" />}>
            <Button size="sm" className="gap-1.5" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" /> Add brand
            </Button>
          </PermissionGate>
        }
      />
      <PageBody>
        <SectionCard
          title="Brand catalog"
          actions={
            <div className="relative w-56">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="pl-7 h-8" placeholder="Search brands…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          }
        >
          {brandsQuery.isLoading || profilesQuery.isLoading ? (
            <LoadingState rows={4} />
          ) : brandsQuery.isError ? (
            <ErrorState title="Failed to load brands" description={String(brandsQuery.error)} onRetry={() => brandsQuery.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState title="No brands" description="Create a brand, then assign it on hardware product profiles." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase">
                <tr>
                  <th className="px-5 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-right">Hardware products</th>
                  <th className="px-3 py-2 text-right">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-2 font-mono text-xs">{r.code}</td>
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2 text-right">{productCountByBrand.get(r.id) ?? r.product_count ?? 0}</td>
                    <td className="px-3 py-2 text-right">{r.is_active === false ? "Inactive" : "Active"}</td>
                    <td className="px-3 py-2 text-right">
                      <PermissionGate perm="hardware.manage">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </PermissionGate>
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
          title={editing ? "Edit brand" : "Add brand"}
          onSubmit={handleSubmit}
          isPending={createMut.isPending || updateMut.isPending}
          submitDisabled={!form.name || (!editing && !form.code)}
        >
          <div className="space-y-3">
            {!editing && (
              <div>
                <Label>Code</Label>
                <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
              </div>
            )}
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            {editing && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                  id="hw-brand-active"
                />
                <Label htmlFor="hw-brand-active">Active</Label>
              </div>
            )}
          </div>
        </EntityFormDrawer>
      </PageBody>
    </>
  );
}
