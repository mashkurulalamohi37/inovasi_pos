import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { PermissionGate } from "@/components/pulse/gates";
import { EmptyState, ErrorState, LoadingState } from "@/components/pulse/states";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Plus, Search } from "lucide-react";
import { shouldUseBackend } from "@/lib/demo-mode";
import {
  useCosmeticsBrands,
  useCreateBrand,
  useUpdateBrand,
  type CosmeticsBrandShelf,
} from "@/hooks/use-api-config";
import { toast } from "sonner";

export const Route = createFileRoute("/app/cosmetics/brands")({ component: CosmeticsBrandsPage });

function brandId(row: CosmeticsBrandShelf) {
  return String(row.brand_id ?? row.id ?? "");
}

function brandCode(row: CosmeticsBrandShelf) {
  return String(row.brand_code ?? row.code ?? "—");
}

function brandName(row: CosmeticsBrandShelf) {
  return String(row.brand_name ?? row.name ?? "—");
}

function CosmeticsBrandsPage() {
  const useApi = shouldUseBackend();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CosmeticsBrandShelf | null>(null);
  const [form, setForm] = useState({ code: "", name: "", is_active: true });

  const brandsQuery = useCosmeticsBrands({ q: q || undefined }, useApi);
  const createMut = useCreateBrand();
  const updateMut = useUpdateBrand();

  const rows = useMemo(() => (useApi ? brandsQuery.data ?? [] : []), [useApi, brandsQuery.data]);

  const openCreate = () => {
    setEditing(null);
    setForm({ code: "", name: "", is_active: true });
    setOpen(true);
  };

  const openEdit = (r: CosmeticsBrandShelf) => {
    setEditing(r);
    setForm({
      code: brandCode(r) === "—" ? "" : brandCode(r),
      name: brandName(r) === "—" ? "" : brandName(r),
      is_active: r.is_active !== false,
    });
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!useApi) {
      toast.error("Backend mode required to manage brands");
      return;
    }
    try {
      const id = editing ? brandId(editing) : "";
      if (editing && id) {
        await updateMut.mutateAsync({
          id,
          body: { name: form.name.trim(), is_active: form.is_active },
        });
      } else {
        if (!form.code.trim() || !form.name.trim()) {
          toast.error("Brand code and name required");
          return;
        }
        await createMut.mutateAsync({ code: form.code.trim(), name: form.name.trim() });
      }
      setOpen(false);
      void brandsQuery.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Brand save failed");
    }
  };

  if (!useApi) {
    return (
      <>
        <PageHeader title="Brand shelf" subtitle="Cosmetics brand shelf with stock health" />
        <PageBody>
          <EmptyState
            title="Backend required"
            description="Brand shelf uses live cosmetics brand APIs and shared Brand master. Enable backend mode to list and manage brands."
          />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Brand shelf"
        subtitle="Product counts · near-expiry · out of stock — filter expiry by brand"
        actions={
          <PermissionGate
            perm="cosmetics.manage"
            fallback={<DisabledReasonButton label="Add brand" reason="Requires cosmetics.manage" />}
          >
            <Button size="sm" className="gap-1.5" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" /> Add brand
            </Button>
          </PermissionGate>
        }
      />
      <PageBody>
        <SectionCard
          title="Cosmetics brands"
          actions={
            <div className="relative w-56">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-7 h-8"
                placeholder="Search brands…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          }
        >
          {brandsQuery.isLoading ? (
            <LoadingState rows={4} />
          ) : brandsQuery.isError ? (
            <ErrorState
              title="Failed to load brands"
              description={String(brandsQuery.error)}
              onRetry={() => brandsQuery.refetch()}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No brands"
              description="Create a brand via Brand master, then assign it on cosmetics product profiles."
            />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase">
                <tr>
                  <th className="px-5 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">Brand</th>
                  <th className="px-3 py-2 text-right">Products</th>
                  <th className="px-3 py-2 text-right">Near expiry</th>
                  <th className="px-3 py-2 text-right">Out of stock</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const id = brandId(r);
                  const name = brandName(r);
                  return (
                    <tr key={id || name}>
                      <td className="px-5 py-2 font-mono text-xs">{brandCode(r)}</td>
                      <td className="px-3 py-2 font-medium">{name}</td>
                      <td className="px-3 py-2 text-right tabular">{r.product_count ?? 0}</td>
                      <td className="px-3 py-2 text-right tabular">{r.near_expiry_count ?? 0}</td>
                      <td className="px-3 py-2 text-right tabular">{r.out_of_stock_count ?? 0}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                            <Link
                              to="/app/cosmetics/expiry"
                              search={{ brand: name }}
                            >
                              Expiry
                            </Link>
                          </Button>
                          <PermissionGate perm="cosmetics.manage">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </PermissionGate>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
          submitDisabled={!form.name.trim() || (!editing && !form.code.trim())}
        >
          <div className="space-y-3">
            {!editing && (
              <div>
                <Label>Code</Label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                />
              </div>
            )}
            <div>
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            {editing && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                />
                Active
              </label>
            )}
            <p className="text-xs text-muted-foreground">
              Creates/updates shared Brand master records used across cosmetics profiles.
            </p>
          </div>
        </EntityFormDrawer>
      </PageBody>
    </>
  );
}
