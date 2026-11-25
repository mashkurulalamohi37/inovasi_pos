import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, PageBody, SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { ListPagination } from "@/components/pulse/ListPagination";
import { PermissionGate } from "@/components/pulse/gates";
import { LoadingState, ErrorState, EmptyState } from "@/components/pulse/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Building2, Power } from "lucide-react";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useClientPagination } from "@/hooks/use-client-pagination";
import { useCreateDepartment, useMiniHrDepartments, usePatchDepartment } from "@/hooks/use-mini-hr";
import { toast } from "sonner";
import { formatApiError, type ApiError } from "@/lib/api";

export const Route = createFileRoute("/app/hr/departments")({ component: DepartmentsPage });

function DepartmentsPage() {
  const useApi = shouldUseBackend();
  const { data, isLoading, isError, refetch } = useMiniHrDepartments(useApi);
  const createMut = useCreateDepartment();
  const patchMut = usePatchDepartment();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [form, setForm] = useState({ department_code: "", department_name: "", description: "" });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((d) => {
      if (statusFilter === "active" && !d.is_active) return false;
      if (statusFilter === "inactive" && d.is_active) return false;
      if (!q) return true;
      return (
        d.department_name.toLowerCase().includes(q) ||
        d.department_code.toLowerCase().includes(q) ||
        (d.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [data, search, statusFilter]);

  const listPage = useClientPagination(rows, 10, `${search}|${statusFilter}`);
  const activeCount = (data ?? []).filter((d) => d.is_active).length;

  const submit = async () => {
    try {
      await createMut.mutateAsync({
        department_code: form.department_code.trim(),
        department_name: form.department_name.trim(),
        description: form.description.trim() || undefined,
      });
      toast.success("Department created");
      setOpen(false);
      setForm({ department_code: "", department_name: "", description: "" });
    } catch (err) {
      toast.error(formatApiError(err as ApiError));
    }
  };

  if (!useApi) {
    return (
      <>
        <PageHeader title="Departments" subtitle="Backend required" />
        <PageBody><EmptyState title="Backend required" description="Sign in with API enabled." /></PageBody>
      </>
    );
  }

  return (
    <PermissionGate perm="hr.view" fallback={<PageBody><ErrorState title="Permission denied" description="Requires hr.view" /></PageBody>}>
      <PageHeader
        title="Departments"
        subtitle="Org units for employees — separate from security roles"
        actions={
          <PermissionGate perm="hr.department_manage">
            <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Add department
            </Button>
          </PermissionGate>
        }
      />
      <PageBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card p-3 shadow-xs">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="h-9 pl-9 text-sm"
              placeholder="Search name or code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="flex h-9 rounded-md border border-input bg-background px-3 text-xs"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <Badge variant="secondary" className="h-8 gap-1.5 px-3 font-normal">
            <Building2 className="h-3.5 w-3.5" />
            {activeCount} active · {(data ?? []).length} total
          </Badge>
        </div>

        {isLoading ? <LoadingState /> : null}
        {isError ? <ErrorState title="Failed to load" description="Could not load departments." onRetry={() => refetch()} /> : null}
        {!isLoading && !isError && rows.length === 0 ? (
          <EmptyState
            title={data?.length ? "No matches" : "No departments"}
            description={data?.length ? "Try another search or status filter." : "Create Sales, Purchase, Inventory, and other org units."}
          />
        ) : null}

        {rows.length > 0 ? (
          <SectionCard
            title="Department directory"
            description={`${listPage.total} shown`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-5 py-2.5 text-left font-medium">Department</th>
                    <th className="px-3 py-2.5 text-left font-medium">Code</th>
                    <th className="px-3 py-2.5 text-left font-medium">Description</th>
                    <th className="px-3 py-2.5 text-left font-medium">Status</th>
                    <th className="px-5 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {listPage.pageItems.map((d) => (
                    <tr key={d.id} className="hover:bg-secondary/30">
                      <td className="px-5 py-3">
                        <div className="font-medium text-foreground">{d.department_name}</div>
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant="outline" className="font-mono text-[11px] uppercase">
                          {d.department_code}
                        </Badge>
                      </td>
                      <td className="max-w-xs px-3 py-3 text-muted-foreground">
                        <span className="line-clamp-2">{d.description?.trim() || "—"}</span>
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={d.is_active ? "active" : "inactive"} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <PermissionGate perm="hr.department_manage">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            disabled={patchMut.isPending}
                            onClick={async () => {
                              try {
                                await patchMut.mutateAsync({ id: d.id, body: { is_active: !d.is_active } });
                                toast.success(d.is_active ? "Department deactivated" : "Department activated");
                              } catch (err) {
                                toast.error(formatApiError(err as ApiError));
                              }
                            }}
                          >
                            <Power className="h-3.5 w-3.5" />
                            {d.is_active ? "Deactivate" : "Activate"}
                          </Button>
                        </PermissionGate>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ListPagination
              page={listPage.page}
              pageSize={listPage.pageSize}
              total={listPage.total}
              onPageChange={listPage.setPage}
            />
          </SectionCard>
        ) : null}
      </PageBody>

      <EntityFormDrawer
        open={open}
        onOpenChange={setOpen}
        title="Create department"
        description="Add an org unit for HR reporting. This does not grant system permissions."
        onSubmit={submit}
        isPending={createMut.isPending}
        submitLabel="Create department"
        maxWidth="xl"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Department Code</Label>
            <Input
              value={form.department_code}
              onChange={(e) => setForm((f) => ({ ...f, department_code: e.target.value }))}
              placeholder="OPS"
              className="uppercase font-mono h-9 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Department Name</Label>
            <Input
              value={form.department_name}
              onChange={(e) => setForm((f) => ({ ...f, department_name: e.target.value }))}
              placeholder="e.g. Sales & Retail Operations, Finance, Logistics"
              className="h-9 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Description / Scope Notes</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Optional department notes"
              className="h-9 text-xs"
            />
          </div>
        </div>
      </EntityFormDrawer>
    </PermissionGate>
  );
}
