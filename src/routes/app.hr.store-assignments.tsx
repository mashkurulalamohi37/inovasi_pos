import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { SectionCard } from "@/components/pulse/primitives";
import { ListPagination } from "@/components/pulse/ListPagination";
import { PermissionGate } from "@/components/pulse/gates";
import { LoadingState, ErrorState, EmptyState } from "@/components/pulse/states";
import { ConfirmActionDialog } from "@/components/pulse/ConfirmActionDialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Building2, User, Plus, Trash2 } from "lucide-react";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useClientPagination } from "@/hooks/use-client-pagination";
import { useApiStores } from "@/hooks/use-api-config";
import {
  useAssignEmployeeStore,
  useMiniHrEmployeeStores,
  useMiniHrEmployees,
  useRemoveEmployeeStore,
} from "@/hooks/use-mini-hr";
import { toast } from "sonner";
import { formatApiError, type ApiError } from "@/lib/api";

export const Route = createFileRoute("/app/hr/store-assignments")({ component: StoreAssignmentsPage });

function StoreAssignmentsPage() {
  const useApi = shouldUseBackend();
  const employees = useMiniHrEmployees(undefined, useApi);
  const stores = useApiStores();
  const [employeeId, setEmployeeId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const assignments = useMiniHrEmployeeStores(employeeId || undefined, useApi && Boolean(employeeId));
  const assignMut = useAssignEmployeeStore();
  const removeMut = useRemoveEmployeeStore();
  const [removeId, setRemoveId] = useState<string | null>(null);

  const selectedEmp = useMemo(
    () => (employees.data ?? []).find(e => e.id === employeeId),
    [employees.data, employeeId],
  );

  const storeName = (id: string) => stores.data?.find(s => s.id === id)?.name ?? id;
  const activeAssignments = useMemo(
    () => (assignments.data ?? []).filter(a => a.is_active),
    [assignments.data],
  );
  const listPage = useClientPagination(activeAssignments, 10, `${employeeId}|${activeAssignments.length}`);

  const assign = async () => {
    if (!employeeId || !storeId) return;
    try {
      await assignMut.mutateAsync({
        employeeId,
        body: { store_id: storeId, is_primary: isPrimary, assignment_type: isPrimary ? "primary" : "secondary" },
      });
      toast.success("Store assigned to employee");
      setStoreId("");
      setIsPrimary(false);
    } catch (err) {
      toast.error(formatApiError(err as ApiError));
    }
  };

  if (!useApi) {
    return (
      <BackOfficePage
        title="Store assignments"
        eyebrow="HR"
        subtitle="Operational data scope — backend required"
      >
        <EmptyState title="Backend required" description="Sign in with API enabled to manage store access scopes." />
      </BackOfficePage>
    );
  }

  return (
    <PermissionGate perm="hr.view" fallback={<ErrorState title="Permission denied" description="Requires hr.view" />}>
      <BackOfficePage
        title="Store Assignments"
        eyebrow="HR & Access Control"
        subtitle="Manage store-level operational scope for employees and cashiers"
        stats={[
          { label: "Total Employees", value: String((employees.data ?? []).length) },
          { label: "Outlets Configured", value: String((stores.data ?? []).length) },
          { label: "Active Scope Rules", value: String(activeAssignments.length) },
        ]}
      >
        <div className="space-y-6">
          {/* Employee Picker Card */}
          <SectionCard className="shadow-xs border-border/80">
            <div className="p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-base font-bold tracking-tight text-foreground flex items-center gap-2">
                    <User className="h-4 w-4 text-teal-600 dark:text-teal-400" /> Select Employee
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Choose an employee to view or edit their assigned retail outlets and primary store
                  </p>
                </div>
                <div className="w-full sm:w-auto min-w-[280px]">
                  <select
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium shadow-xs focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all cursor-pointer"
                    value={employeeId}
                    onChange={e => setEmployeeId(e.target.value)}
                  >
                    <option value="">Choose employee…</option>
                    {(employees.data ?? []).map(e => (
                      <option key={e.id} value={e.id}>
                        {e.employee_code} — {e.full_name} ({e.designation_name || "Employee"})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedEmp && (
                <div className="mt-4 flex items-center gap-3 rounded-lg border border-teal-500/30 bg-teal-500/5 p-3 text-xs">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white font-bold text-sm">
                    {selectedEmp.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-bold text-foreground text-sm">{selectedEmp.full_name}</div>
                    <div className="text-muted-foreground flex items-center gap-2 mt-0.5">
                      <span className="font-mono bg-background px-1.5 py-0.5 rounded border text-[10px]">{selectedEmp.employee_code}</span>
                      <span>•</span>
                      <span>{selectedEmp.designation_name || "No designation"}</span>
                      {selectedEmp.department_name && (
                        <>
                          <span>•</span>
                          <span>{selectedEmp.department_name}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

          {/* Split Column Layout when Employee Selected */}
          {employeeId ? (
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Active Assignments Table (2 Cols) */}
              <div className="lg:col-span-2 space-y-4">
                <SectionCard
                  title="Assigned Retail Outlets"
                  description={`${listPage.total} store(s) granted for operational access`}
                >
                  {assignments.isLoading ? <LoadingState rows={3} /> : null}
                  {!assignments.isLoading && activeAssignments.length === 0 ? (
                    <EmptyState
                      title="No active store scope"
                      description="This employee has no active stores. Assign at least one store below for POS checkout access."
                    />
                  ) : null}
                  {activeAssignments.length > 0 ? (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                            <tr>
                              <th className="px-5 py-2.5 text-left font-medium">Store Outlet</th>
                              <th className="px-3 py-2.5 text-left font-medium">Scope Type</th>
                              <th className="px-3 py-2.5 text-left font-medium">Status</th>
                              <th className="px-5 py-2.5 text-right font-medium">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {listPage.pageItems.map(a => (
                              <tr key={a.id} className="hover:bg-secondary/30 transition-colors">
                                <td className="px-5 py-3">
                                  <div className="font-semibold text-foreground flex items-center gap-2">
                                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                                    {storeName(a.store_id)}
                                  </div>
                                </td>
                                <td className="px-3 py-3 capitalize text-muted-foreground text-xs font-mono">
                                  {a.assignment_type}
                                </td>
                                <td className="px-3 py-3">
                                  {a.is_primary ? (
                                    <Badge className="bg-teal-600 hover:bg-teal-700">Primary Store</Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-muted-foreground">Secondary</Badge>
                                  )}
                                </td>
                                <td className="px-5 py-3 text-right">
                                  <PermissionGate perm="hr.store_assignment_manage">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 gap-1 text-xs"
                                      onClick={() => setRemoveId(a.id)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" /> Remove
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
                    </>
                  ) : null}
                </SectionCard>
              </div>

              {/* Assign New Store Form Card (1 Col) */}
              <div>
                <PermissionGate perm="hr.store_assignment_manage">
                  <SectionCard
                    title="Assign Outlet Access"
                    description="Add store access for this employee"
                    className="shadow-xs border-border/80"
                  >
                    <div className="p-5 space-y-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-foreground">Select Store Outlet</Label>
                        <select
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:ring-2 focus:ring-teal-500/20"
                          value={storeId}
                          onChange={e => setStoreId(e.target.value)}
                        >
                          <option value="">Choose store…</option>
                          {(stores.data ?? []).map(s => (
                            <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                          ))}
                        </select>
                      </div>

                      <div className="rounded-lg border border-border bg-secondary/30 p-3">
                        <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                          <input
                            type="checkbox"
                            className="rounded border-input text-teal-600 focus:ring-teal-500"
                            checked={isPrimary}
                            onChange={e => setIsPrimary(e.target.checked)}
                          />
                          Set as Primary Default Store
                        </label>
                        <p className="mt-1 text-[11px] text-muted-foreground leading-snug">
                          Primary store will automatically load when this employee logs in.
                        </p>
                      </div>

                      <Button
                        className="w-full gap-1.5 h-9 bg-teal-600 hover:bg-teal-700 text-white font-medium"
                        onClick={assign}
                        disabled={assignMut.isPending || !storeId}
                      >
                        <Plus className="h-4 w-4" />
                        {assignMut.isPending ? "Assigning…" : "Grant Store Access"}
                      </Button>
                    </div>
                  </SectionCard>
                </PermissionGate>
              </div>
            </div>
          ) : (
            <SectionCard>
              <EmptyState
                title="Select an employee above"
                description="Choose an employee from the dropdown list to view or grant store operational access."
              />
            </SectionCard>
          )}
        </div>

        <ConfirmActionDialog
          open={Boolean(removeId)}
          onOpenChange={o => { if (!o) setRemoveId(null); }}
          title="Remove store assignment?"
          description="Inactive assignments no longer grant store data access for POS or backoffice operations."
          confirmLabel="Remove Access"
          onConfirm={async () => {
            if (!removeId || !employeeId) return;
            try {
              await removeMut.mutateAsync({ employeeId, assignmentId: removeId });
              toast.success("Store assignment removed");
              setRemoveId(null);
            } catch (err) {
              toast.error(formatApiError(err as ApiError));
            }
          }}
        />
      </BackOfficePage>
    </PermissionGate>
  );
}
