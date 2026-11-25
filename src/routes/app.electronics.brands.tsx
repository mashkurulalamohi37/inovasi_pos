import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/pulse/primitives";
import { LoadingState, ErrorState, EmptyState } from "@/components/pulse/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Search, Pencil } from "lucide-react";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useBrands, useCreateBrand, useUpdateBrand } from "@/hooks/use-api-config";

export const Route = createFileRoute("/app/electronics/brands")({
  component: ElectronicsBrands,
});

// Electronics product brands derived from mock catalog
const DEMO_ELECTRONICS_BRANDS = [
  { id: "br-1", name: "Samsung", code: "SAMSUNG", is_active: true, product_count: 3 },
  { id: "br-2", name: "Xiaomi", code: "XIAOMI", is_active: true, product_count: 2 },
  { id: "br-3", name: "Sony", code: "SONY", is_active: true, product_count: 1 },
  { id: "br-4", name: "Anker", code: "ANKER", is_active: true, product_count: 1 },
  { id: "br-5", name: "Apple", code: "APPLE", is_active: true, product_count: 1 },
];

function ElectronicsBrands() {
  const useApi = shouldUseBackend();
  const [q, setQ] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editBrand, setEditBrand] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState({ name: "", code: "" });

  const { data: apiBrands, isLoading, isError, refetch } = useBrands();
  const createBrand = useCreateBrand();
  const updateBrand = useUpdateBrand();

  // BrandMaster has no industry column — brands are company-wide master data
  // shared by every vertical. This page previously presented them as "electronics
  // brands", which misrepresented the blast radius of editing one. Filtering to
  // brands that have electronics products would be worse: a brand created here
  // would disappear from the page until a product was assigned to it.
  const allBrands = useApi
    ? ((apiBrands as Array<Record<string, unknown>>) ?? [])
    : DEMO_ELECTRONICS_BRANDS;

  const filtered = allBrands.filter((b) => {
    if (!q) return true;
    const hay = `${b.name ?? ""} ${b.code ?? ""}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  const resetForm = () => setForm({ name: "", code: "" });

  const openCreate = () => {
    setEditBrand(null);
    resetForm();
    setDialogOpen(true);
  };
  const openEdit = (b: Record<string, unknown>) => {
    setEditBrand(b);
    setForm({ name: String(b.name ?? ""), code: String(b.code ?? "") });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Brand name required");
      return;
    }
    try {
      if (editBrand) {
        // The brand PATCH endpoint only accepts name/is_active — code is immutable once created.
        await updateBrand.mutateAsync({
          id: String(editBrand.id),
          body: { name: form.name.trim() },
        });
      } else {
        await createBrand.mutateAsync({ name: form.name.trim(), code: form.code.trim() });
      }
      setDialogOpen(false);
      resetForm();
    } catch (e: unknown) {
      // The mutation hooks already surface the error toast via onMutationError.
      return;
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        eyebrow="Electronics"
        title="Brands"
        subtitle="Shared brand master — these brands are used by every vertical, not electronics alone"
        actions={
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" /> New Brand
          </Button>
        }
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search brands…"
          className="pl-9"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {/* Header and filters stay mounted while data loads — replacing the whole
          page on every refetch discarded the user's typed search. */}
      {useApi && isLoading ? (
        <LoadingState />
      ) : useApi && isError ? (
        <ErrorState onRetry={refetch} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No brands found"
          description={
            q ? "No brand matches your search." : "Create your first brand to get started."
          }
        />
      ) : (
        <SectionCard title={`${filtered.length} brand${filtered.length !== 1 ? "s" : ""}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((b, i) => (
              <div
                key={String(b.id ?? i)}
                className="flex items-center justify-between p-3.5 rounded-xl border border-border/50 hover:border-blue-400/40 hover:bg-blue-50/10 dark:hover:bg-blue-900/10 transition-all group cursor-pointer"
                onClick={() => openEdit(b)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-slate-600 to-blue-500 flex items-center justify-center text-white text-sm font-bold">
                    {String(b.name ?? "")
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{String(b.name ?? "")}</p>
                    {Boolean(b.code) && (
                      <p className="text-xs text-muted-foreground font-mono">{String(b.code)}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {b.product_count !== undefined && (
                    <Badge variant="outline" className="text-xs">
                      {String(b.product_count)} products
                    </Badge>
                  )}
                  <Badge
                    variant={b.is_active !== false ? "success" : "secondary"}
                    className="text-xs"
                  >
                    {b.is_active !== false ? "Active" : "Inactive"}
                  </Badge>
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editBrand ? "Edit Brand" : "New Brand"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1">
              <Label>Brand Name *</Label>
              <Input
                placeholder="e.g. Samsung"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Code</Label>
              <Input
                placeholder="e.g. SAMSUNG"
                value={form.code}
                disabled={!!editBrand}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
              />
              {editBrand && (
                <p className="text-[11px] text-muted-foreground">
                  Code cannot be changed after creation.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={createBrand.isPending || updateBrand.isPending}>
              {editBrand ? "Save Changes" : "Create Brand"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
