import { useMemo, useState } from "react";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { PermissionGate } from "@/components/pulse/gates";
import { EmptyState, ErrorState, LoadingState } from "@/components/pulse/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { shouldUseBackend } from "@/lib/demo-mode";
import { getPackDef, type IndustryPackId } from "@/lib/industry-registry";
import { getPackMasterAttributes } from "@/lib/pack-master-attributes";
import {
  useCreatePackAttribute,
  useDeletePackAttribute,
  usePackAttributes,
  useUpdatePackAttribute,
  type ApiPackAttribute,
} from "@/hooks/use-api-config";

export function PackMasterDataPage({ packId }: { packId: IndustryPackId }) {
  const pack = getPackDef(packId);
  const attrDefs = getPackMasterAttributes(packId);
  const useApi = shouldUseBackend();
  const [tab, setTab] = useState(attrDefs[0]?.key ?? "category");
  const activeDef = attrDefs.find((a) => a.key === tab) ?? attrDefs[0];

  const parentsQuery = usePackAttributes(
    packId,
    activeDef?.parentAttrType,
    { includeInactive: true, enabled: useApi && !!activeDef?.parentAttrType },
  );
  const listQuery = usePackAttributes(packId, tab, { includeInactive: true, enabled: useApi && !!tab });
  const createMut = useCreatePackAttribute();
  const updateMut = useUpdatePackAttribute();
  const deleteMut = useDeletePackAttribute();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ApiPackAttribute | null>(null);
  const [form, setForm] = useState({ code: "", name: "", parent_id: "", is_active: true });

  const rows = useMemo(() => listQuery.data ?? [], [listQuery.data]);
  const parents = useMemo(() => parentsQuery.data ?? [], [parentsQuery.data]);

  const openCreate = () => {
    setEditing(null);
    setForm({ code: "", name: "", parent_id: "", is_active: true });
    setOpen(true);
  };

  const openEdit = (row: ApiPackAttribute) => {
    setEditing(row);
    setForm({
      code: row.code,
      name: row.name,
      parent_id: row.parent_id ?? "",
      is_active: row.is_active,
    });
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!useApi || !activeDef) return;
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Code and name are required");
      return;
    }
    try {
      if (editing) {
        await updateMut.mutateAsync({
          id: editing.id,
          body: {
            code: form.code.trim(),
            name: form.name.trim(),
            parent_id: form.parent_id || null,
            is_active: form.is_active,
          },
        });
      } else {
        await createMut.mutateAsync({
          pack_code: packId,
          attr_type: activeDef.key,
          code: form.code.trim(),
          name: form.name.trim(),
          parent_id: form.parent_id || undefined,
          is_active: form.is_active,
        });
      }
      setOpen(false);
      void listQuery.refetch();
    } catch {
      /* toast via mutation */
    }
  };

  const handleDelete = async (row: ApiPackAttribute) => {
    if (!confirm(`Delete ${row.name}?`)) return;
    try {
      await deleteMut.mutateAsync(row.id);
      void listQuery.refetch();
    } catch {
      /* toast via mutation */
    }
  };

  if (!useApi) {
    return (
      <>
        <PageHeader title={`${pack.shortName} master data`} subtitle="Industry attribute masters for product forms" />
        <PageBody>
          <EmptyState
            title="Backend required"
            description="Connect to the API to manage pack master data used by Product Master fields."
          />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`${pack.shortName} master data`}
        subtitle="Values here drive Product Master dropdowns for this industry pack"
        actions={
          <PermissionGate perm="inventory.edit">
            <Button size="sm" className="gap-1.5" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" /> Add {activeDef?.label.toLowerCase() ?? "value"}
            </Button>
          </PermissionGate>
        }
      />
      <PageBody>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-3 flex h-auto flex-wrap gap-1">
            {attrDefs.map((a) => (
              <TabsTrigger key={a.key} value={a.key} className="text-xs">
                {a.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {attrDefs.map((a) => (
            <TabsContent key={a.key} value={a.key} className="mt-0">
              <SectionCard title={a.label}>
                {listQuery.isLoading && tab === a.key ? (
                  <LoadingState rows={3} />
                ) : listQuery.isError && tab === a.key ? (
                  <ErrorState title="Failed to load" onRetry={() => listQuery.refetch()} />
                ) : rows.length === 0 && tab === a.key ? (
                  <EmptyState
                    title={`No ${a.label.toLowerCase()} values`}
                    description="Add values so they appear on the product form for this pack."
                  />
                ) : tab === a.key ? (
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 text-left">Code</th>
                        <th className="px-4 py-2 text-left">Name</th>
                        {a.parentAttrType && <th className="px-4 py-2 text-left">Parent</th>}
                        <th className="px-4 py-2 text-left">Status</th>
                        <th className="px-4 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rows.map((row) => (
                        <tr key={row.id}>
                          <td className="px-4 py-2.5 font-mono text-xs">{row.code}</td>
                          <td className="px-4 py-2.5">{row.name}</td>
                          {a.parentAttrType && (
                            <td className="px-4 py-2.5 text-muted-foreground">
                              {parents.find((p) => p.id === row.parent_id)?.name ?? "—"}
                            </td>
                          )}
                          <td className="px-4 py-2.5">
                            <Badge variant="outline">{row.is_active ? "active" : "inactive"}</Badge>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <PermissionGate perm="inventory.edit">
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(row)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => handleDelete(row)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </PermissionGate>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </SectionCard>
            </TabsContent>
          ))}
        </Tabs>
      </PageBody>

      <EntityFormDrawer
        open={open}
        onOpenChange={setOpen}
        title={editing ? `Edit ${activeDef?.label}` : `New ${activeDef?.label}`}
        onSubmit={handleSubmit}
        submitLabel="Save"
        isPending={createMut.isPending || updateMut.isPending}
      >
        <div className="space-y-3">
          <div>
            <Label>Code</Label>
            <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} disabled={!!editing} />
          </div>
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          {activeDef?.parentAttrType && (
            <div>
              <Label>Parent {activeDef.parentAttrType}</Label>
              <Select value={form.parent_id || "__none__"} onValueChange={(v) => setForm((f) => ({ ...f, parent_id: v === "__none__" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Select parent" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {parents.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </EntityFormDrawer>
    </>
  );
}
