import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { PermissionGate } from "@/components/pulse/gates";
import { LoadingState, ErrorState, EmptyState } from "@/components/pulse/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, RefreshCw, Pencil, Trash2, Search, ArrowUp, ArrowDown, X } from "lucide-react";
import { shouldUseBackend } from "@/lib/demo-mode";
import {
  useBrands, useCategories, useCreateBrand, useCreateCategory, useCreateUnit, useUnits,
  useUpdateBrand, useUpdateCategory, useUpdateUnit,
  useDeleteBrand, useDeleteCategory, useDeleteUnit,
  type ApiMasterBrand, type ApiMasterCategory, type ApiMasterUnit,
} from "@/hooks/use-api-config";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-provider";
import { orderCategoryTree, descendantIds } from "@/lib/category-tree";
import { INDUSTRY_PACKS } from "@/lib/industry-registry";
import { useApp } from "@/lib/app-store";

export const Route = createFileRoute("/app/categories")({ component: Categories });

function Categories() {
  const useApi = shouldUseBackend();
  const app = useApp();
  const [industryFilter, setIndustryFilter] = useState<string>("all");

  if (!useApi) {
    return (
      <>
        <PageHeader title="Categories" subtitle="Connect backend for live master data." />
        <PageBody><EmptyState title="Backend required" description="Category, brand, and unit master requires API mode." /></PageBody>
      </>
    );
  }

  const selectedIndustry = industryFilter !== "all" ? industryFilter : undefined;

  return (
    <PermissionGate perm="inventory.view" fallback={<PageBody><ErrorState title="Permission denied" description="Requires inventory.view" /></PageBody>}>
      <PageHeader title="Product master data" subtitle="Categories, brands, and units — organized per POS vertical with tenant isolation"
        actions={
          <div className="flex items-center gap-2">
            <Select value={industryFilter} onValueChange={setIndustryFilter}>
              <SelectTrigger className="w-[180px] h-8 text-xs bg-background">
                <SelectValue placeholder="All POS Verticals" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All POS Verticals</SelectItem>
                {INDUSTRY_PACKS.filter(p => app.isPackEnabled(p.id)).map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" asChild><Link to="/app/products">Product list</Link></Button>
          </div>
        }
      />
      <PageBody>
        <Tabs defaultValue="categories">
          <TabsList><TabsTrigger value="categories">Categories</TabsTrigger><TabsTrigger value="brands">Brands</TabsTrigger><TabsTrigger value="units">Units</TabsTrigger></TabsList>
          <TabsContent value="categories" className="pt-4"><CategoryPanel industry={selectedIndustry} /></TabsContent>
          <TabsContent value="brands" className="pt-4"><BrandPanel industry={selectedIndustry} /></TabsContent>
          <TabsContent value="units" className="pt-4"><UnitPanel /></TabsContent>
        </Tabs>
      </PageBody>
    </PermissionGate>
  );
}

function CategoryPanel({ industry }: { industry?: string }) {
  const { can } = useAuth();
  const canEdit = can("inventory.edit");
  const { data, isLoading, refetch, isFetching } = useCategories({ industry });
  const createMut = useCreateCategory();
  const updateMut = useUpdateCategory();
  const deleteMut = useDeleteCategory();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ApiMasterCategory | null>(null);
  const [form, setForm] = useState({ code: "", name: "", parent_id: "", is_active: true });
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const rows = data ?? [];

  // All categories ordered by code for parent selection drawer
  const allOrdered = useMemo(() => {
    const sorted = [...rows].sort((a, b) =>
      (a.code || "").localeCompare(b.code || "", undefined, { sensitivity: "base", numeric: true })
    );
    return orderCategoryTree(sorted);
  }, [rows]);

  // Filtered and sorted according to search term and sort direction (default alphabetical A-Z)
  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = term
      ? rows.filter(
          (r) =>
            (r.code && r.code.toLowerCase().includes(term)) ||
            (r.name && r.name.toLowerCase().includes(term))
        )
      : rows;

    return [...list].sort((a, b) => {
      const codeA = (a.code || "").trim();
      const codeB = (b.code || "").trim();
      const cmp = codeA.localeCompare(codeB, undefined, { sensitivity: "base", numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, search, sortDir]);

  const ordered = useMemo(() => orderCategoryTree(filteredRows), [filteredRows]);

  const parentChoices = useMemo(() => {
    const excluded = editing ? descendantIds(rows, editing.id) : new Set<string>();
    return allOrdered.filter((r) => !excluded.has(r.id));
  }, [allOrdered, rows, editing]);

  const openCreate = () => { setEditing(null); setForm({ code: "", name: "", parent_id: "", is_active: true }); setOpen(true); };
  const openEdit = (r: ApiMasterCategory) => { setEditing(r); setForm({ code: r.code, name: r.name, parent_id: r.parent_id ?? "", is_active: r.is_active !== false }); setOpen(true); };
  const handleSubmit = async () => {
    if (editing) {
      await updateMut.mutateAsync({ id: editing.id, body: { name: form.name, parent_id: form.parent_id || null, is_active: form.is_active } });
    } else {
      await createMut.mutateAsync({ code: form.code, name: form.name, parent_id: form.parent_id || undefined, industry_pack: industry || undefined });
    }
    setOpen(false);
  };
  const handleDelete = async (r: ApiMasterCategory) => {
    if (window.confirm(`Delete category "${r.name}"? This action cannot be undone.`)) {
      await deleteMut.mutateAsync(r.id);
      setOpen(false);
    }
  };
  return (
    <SectionCard title="Categories" actions={canEdit ? <Button size="sm" className="gap-1.5" onClick={openCreate}><Plus className="h-3.5 w-3.5" /> Add</Button> : undefined}>
      <div className="flex items-center justify-between gap-3 p-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code or name..."
            className="h-8 pl-8 pr-8 text-xs bg-background"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching} title="Refresh">
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {isLoading ? (
        <LoadingState rows={4} />
      ) : rows.length === 0 ? (
        <EmptyState title="No categories" />
      ) : ordered.length === 0 ? (
        <EmptyState
          title="No categories found"
          description={`No categories match "${search}"`}
          action={<Button variant="outline" size="sm" onClick={() => setSearch("")}>Clear search</Button>}
        />
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase">
            <tr>
              <th
                className="px-5 py-2 text-left cursor-pointer select-none hover:text-foreground transition-colors"
                onClick={() => setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))}
                title="Sort by Code (alphabetical order)"
              >
                <div className="flex items-center gap-1.5">
                  <span>Code</span>
                  {sortDir === "asc" ? (
                    <ArrowUp className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <ArrowDown className="h-3.5 w-3.5 text-primary" />
                  )}
                </div>
              </th>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">POS</th>
              <th className="px-3 py-2 text-right">Products</th>
              <th className="px-5 py-2 text-right">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ordered.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-2 font-mono text-xs font-semibold">{r.code}</td>
                <td className="px-3 py-2" style={{ paddingLeft: `${12 + r.depth * 20}px` }}>
                  {r.depth > 0 && <span className="mr-1 text-muted-foreground">└</span>}
                  {r.name}
                </td>
                <td className="px-3 py-2">
                  {r.industry_pack ? (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize">{r.industry_pack}</Badge>
                  ) : r.industry_packs && r.industry_packs.length > 0 ? (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">{r.industry_packs.join(", ")}</Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular">{r.product_count}</td>
                <td className="px-5 py-2 text-right"><Badge variant="outline">{r.is_active ? "active" : "inactive"}</Badge></td>
                <td className="px-3 py-2 text-right">
                  {canEdit ? (
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(r)} title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(r)} disabled={deleteMut.isPending} title="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <EntityFormDrawer
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Edit category" : "Add category"}
        onSubmit={handleSubmit}
        onDelete={editing && canEdit ? () => handleDelete(editing) : undefined}
        deleteLabel="Delete Category"
        isPending={createMut.isPending || updateMut.isPending || deleteMut.isPending}
        submitDisabled={!form.name || (!editing && !form.code)}
      >
        <div className="space-y-3">
          {!editing && <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} /></div>}
          <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
          <div>
            <Label>Parent category</Label>
            <Select value={form.parent_id || "__none__"} onValueChange={(v) => setForm((f) => ({ ...f, parent_id: v === "__none__" ? "" : v }))}>
              <SelectTrigger><SelectValue placeholder="None (top-level)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— None (top-level) —</SelectItem>
                {parentChoices.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{"  ".repeat(c.depth)}{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {editing && <div className="flex items-center gap-2"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} id="cat-active" /><Label htmlFor="cat-active">Active</Label></div>}
        </div>
      </EntityFormDrawer>
    </SectionCard>
  );
}

function BrandPanel({ industry }: { industry?: string }) {
  const { can } = useAuth();
  const canEdit = can("inventory.edit");
  const { data, isLoading, refetch, isFetching } = useBrands({ industry });
  const createMut = useCreateBrand();
  const updateMut = useUpdateBrand();
  const deleteMut = useDeleteBrand();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ApiMasterBrand | null>(null);
  const [form, setForm] = useState({ code: "", name: "", is_active: true });
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const rows = data ?? [];

  const filteredAndSorted = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = term
      ? rows.filter(
          (r) =>
            (r.code && r.code.toLowerCase().includes(term)) ||
            (r.name && r.name.toLowerCase().includes(term))
        )
      : rows;

    return [...list].sort((a, b) => {
      const codeA = (a.code || "").trim();
      const codeB = (b.code || "").trim();
      const cmp = codeA.localeCompare(codeB, undefined, { sensitivity: "base", numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, search, sortDir]);

  const openCreate = () => { setEditing(null); setForm({ code: "", name: "", is_active: true }); setOpen(true); };
  const openEdit = (r: ApiMasterBrand) => { setEditing(r); setForm({ code: r.code, name: r.name, is_active: r.is_active !== false }); setOpen(true); };
  const handleSubmit = async () => {
    if (editing) await updateMut.mutateAsync({ id: editing.id, body: { name: form.name, is_active: form.is_active } });
    else await createMut.mutateAsync({ code: form.code, name: form.name, industry_pack: industry || undefined });
    setOpen(false);
  };
  const handleDelete = async (r: ApiMasterBrand) => {
    if (window.confirm(`Delete brand "${r.name}"? This action cannot be undone.`)) {
      await deleteMut.mutateAsync(r.id);
      setOpen(false);
    }
  };
  return (
    <SectionCard title="Brands" actions={canEdit ? <Button size="sm" className="gap-1.5" onClick={openCreate}><Plus className="h-3.5 w-3.5" /> Add</Button> : undefined}>
      <div className="flex items-center justify-between gap-3 p-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search brand code or name..."
            className="h-8 pl-8 pr-8 text-xs bg-background"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching} title="Refresh">
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {isLoading ? (
        <LoadingState rows={3} />
      ) : rows.length === 0 ? (
        <EmptyState title="No brands" />
      ) : filteredAndSorted.length === 0 ? (
        <EmptyState
          title="No brands found"
          description={`No brands match "${search}"`}
          action={<Button variant="outline" size="sm" onClick={() => setSearch("")}>Clear search</Button>}
        />
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase">
            <tr>
              <th
                className="px-5 py-2 text-left cursor-pointer select-none hover:text-foreground transition-colors"
                onClick={() => setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))}
                title="Sort by Code (alphabetical order)"
              >
                <div className="flex items-center gap-1.5">
                  <span>Code</span>
                  {sortDir === "asc" ? (
                    <ArrowUp className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <ArrowDown className="h-3.5 w-3.5 text-primary" />
                  )}
                </div>
              </th>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">POS</th>
              <th className="px-3 py-2 text-right">Products</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredAndSorted.map((r: ApiMasterBrand) => (
              <tr key={r.id}>
                <td className="px-5 py-2 font-mono text-xs font-semibold">{r.code}</td>
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2">
                  {r.industry_pack ? (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize">{r.industry_pack}</Badge>
                  ) : r.industry_packs && r.industry_packs.length > 0 ? (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">{r.industry_packs.join(", ")}</Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular">{r.product_count}</td>
                <td className="px-3 py-2 text-right">
                  {canEdit ? (
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(r)} title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(r)} disabled={deleteMut.isPending} title="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <EntityFormDrawer
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Edit brand" : "Add brand"}
        onSubmit={handleSubmit}
        onDelete={editing && canEdit ? () => handleDelete(editing) : undefined}
        deleteLabel="Delete Brand"
        isPending={createMut.isPending || updateMut.isPending || deleteMut.isPending}
        submitDisabled={!form.name || (!editing && !form.code)}
      >
        <div className="space-y-3">
          {!editing && <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} /></div>}
          <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
          {editing && <div className="flex items-center gap-2"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} id="brand-active" /><Label htmlFor="brand-active">Active</Label></div>}
        </div>
      </EntityFormDrawer>
    </SectionCard>
  );
}

function UnitPanel() {
  const { can } = useAuth();
  const canEdit = can("inventory.edit");
  const { data, isLoading, refetch, isFetching } = useUnits();
  const createMut = useCreateUnit();
  const updateMut = useUpdateUnit();
  const deleteMut = useDeleteUnit();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ApiMasterUnit | null>(null);
  const [form, setForm] = useState({ code: "", name: "", is_active: true });
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const rows = data ?? [];

  const filteredAndSorted = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = term
      ? rows.filter(
          (r) =>
            (r.code && r.code.toLowerCase().includes(term)) ||
            (r.name && r.name.toLowerCase().includes(term))
        )
      : rows;

    return [...list].sort((a, b) => {
      const codeA = (a.code || "").trim();
      const codeB = (b.code || "").trim();
      const cmp = codeA.localeCompare(codeB, undefined, { sensitivity: "base", numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, search, sortDir]);

  const openCreate = () => { setEditing(null); setForm({ code: "", name: "", is_active: true }); setOpen(true); };
  const openEdit = (r: ApiMasterUnit) => { setEditing(r); setForm({ code: r.code, name: r.name, is_active: r.is_active !== false }); setOpen(true); };
  const handleSubmit = async () => {
    if (editing) await updateMut.mutateAsync({ id: editing.id, body: { name: form.name, is_active: form.is_active } });
    else await createMut.mutateAsync({ code: form.code, name: form.name });
    setOpen(false);
  };
  const handleDelete = async (r: ApiMasterUnit) => {
    if (window.confirm(`Delete unit "${r.name}"? This action cannot be undone.`)) {
      await deleteMut.mutateAsync(r.id);
      setOpen(false);
    }
  };
  return (
    <SectionCard title="Units / UOM" actions={canEdit ? <Button size="sm" className="gap-1.5" onClick={openCreate}><Plus className="h-3.5 w-3.5" /> Add</Button> : undefined}>
      <div className="flex items-center justify-between gap-3 p-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search unit code or name..."
            className="h-8 pl-8 pr-8 text-xs bg-background"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching} title="Refresh">
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {isLoading ? (
        <LoadingState rows={3} />
      ) : rows.length === 0 ? (
        <EmptyState title="No units" />
      ) : filteredAndSorted.length === 0 ? (
        <EmptyState
          title="No units found"
          description={`No units match "${search}"`}
          action={<Button variant="outline" size="sm" onClick={() => setSearch("")}>Clear search</Button>}
        />
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase">
            <tr>
              <th
                className="px-5 py-2 text-left cursor-pointer select-none hover:text-foreground transition-colors"
                onClick={() => setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))}
                title="Sort by Code (alphabetical order)"
              >
                <div className="flex items-center gap-1.5">
                  <span>Code</span>
                  {sortDir === "asc" ? (
                    <ArrowUp className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <ArrowDown className="h-3.5 w-3.5 text-primary" />
                  )}
                </div>
              </th>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-right">Products</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredAndSorted.map((r: ApiMasterUnit) => (
              <tr key={r.id}>
                <td className="px-5 py-2 font-mono text-xs font-semibold">{r.code}</td>
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2 text-right tabular">{r.product_count}</td>
                <td className="px-3 py-2 text-right">
                  {canEdit ? (
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(r)} title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(r)} disabled={deleteMut.isPending} title="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <EntityFormDrawer
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Edit unit" : "Add unit"}
        onSubmit={handleSubmit}
        onDelete={editing && canEdit ? () => handleDelete(editing) : undefined}
        deleteLabel="Delete Unit"
        isPending={createMut.isPending || updateMut.isPending || deleteMut.isPending}
        submitDisabled={!form.name || (!editing && !form.code)}
      >
        <div className="space-y-3">
          {!editing && <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} /></div>}
          <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
          {editing && <div className="flex items-center gap-2"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} id="unit-active" /><Label htmlFor="unit-active">Active</Label></div>}
        </div>
      </EntityFormDrawer>
    </SectionCard>
  );
}
