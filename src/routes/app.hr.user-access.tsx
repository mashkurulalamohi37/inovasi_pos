import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, PageBody, SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { ListPagination } from "@/components/pulse/ListPagination";
import { PermissionGate } from "@/components/pulse/gates";
import { LoadingState, ErrorState, EmptyState } from "@/components/pulse/states";
import { ConfirmActionDialog } from "@/components/pulse/ConfirmActionDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useClientPagination } from "@/hooks/use-client-pagination";
import { Search } from "lucide-react";
import {
  useActivateEmployeeAccess,
  useAssignEmployeeRole,
  useCreateEmployeeUser,
  useGenerateTempPassword,
  useMiniHrUserAccess,
  useResetEmployeePassword,
  useSuspendEmployeeAccess,
  type MiniHrUserAccessRow,
} from "@/hooks/use-mini-hr";
import { toast } from "sonner";
import { formatApiError, type ApiError } from "@/lib/api";

export const Route = createFileRoute("/app/hr/user-access")({ component: UserAccessPage });

function UserAccessPage() {
  const useApi = shouldUseBackend();
  const { data, isLoading, isError, refetch } = useMiniHrUserAccess(useApi);
  const createUser = useCreateEmployeeUser();
  const resetPw = useResetEmployeePassword();
  const assignRole = useAssignEmployeeRole();
  const suspend = useSuspendEmployeeAccess();
  const activate = useActivateEmployeeAccess();
  const genPw = useGenerateTempPassword();

  const [loginRow, setLoginRow] = useState<MiniHrUserAccessRow | null>(null);
  const [roleRow, setRoleRow] = useState<MiniHrUserAccessRow | null>(null);
  const [resetRow, setResetRow] = useState<MiniHrUserAccessRow | null>(null);
  const [suspendId, setSuspendId] = useState<string | null>(null);
  const [activateId, setActivateId] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [roleCode, setRoleCode] = useState("Cashier");
  const [resetPassword, setResetPassword] = useState("");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter(
      (row) =>
        row.full_name.toLowerCase().includes(q) ||
        row.employee_code.toLowerCase().includes(q) ||
        (row.username ?? "").toLowerCase().includes(q) ||
        row.roles.some((r) => r.toLowerCase().includes(q)),
    );
  }, [data, search]);
  const listPage = useClientPagination(rows, 10, search);

  if (!useApi) {
    return (
      <>
        <PageHeader title="User access" subtitle="Backend required" />
        <PageBody><EmptyState title="Backend required" description="Sign in with API enabled." /></PageBody>
      </>
    );
  }

  return (
    <PermissionGate perm="hr.view" fallback={<PageBody><ErrorState title="Permission denied" description="Requires hr.view" /></PageBody>}>
      <PageHeader
        title="User access"
        subtitle="Links employees to UserAccount + RBAC — passwords are hashed, never shown after create"
        actions={<Button variant="outline" size="sm" onClick={() => refetch()}>Refresh</Button>}
      />
      <PageBody className="space-y-4">
        {(data?.length ?? 0) > 0 ? (
          <div className="relative max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="h-9 pl-9 text-sm"
              placeholder="Search employee, code, username…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        ) : null}
        {isLoading ? <LoadingState /> : null}
        {isError ? <ErrorState title="Failed to load" description="Could not load user access directory." /> : null}
        {!isLoading && rows.length === 0 ? <EmptyState title="No employees" description={data?.length ? "No matches for this search." : "Create employees first."} /> : null}
        {rows.length > 0 ? (
          <SectionCard title="Directory" description={`${listPage.total} employee(s)`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-5 py-2.5 text-left font-medium">Employee</th>
                    <th className="px-3 py-2.5 text-left font-medium">Code</th>
                    <th className="px-3 py-2.5 text-left font-medium">Username</th>
                    <th className="px-3 py-2.5 text-left font-medium">Role(s)</th>
                    <th className="px-3 py-2.5 text-left font-medium">Account</th>
                    <th className="px-5 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {listPage.pageItems.map(row => (
                    <tr key={row.employee_id} className="align-top hover:bg-secondary/30">
                      <td className="px-5 py-3 font-medium">{row.full_name}</td>
                      <td className="px-3 py-3 font-mono text-xs">{row.employee_code}</td>
                      <td className="px-3 py-3">{row.username ?? "—"}</td>
                      <td className="px-3 py-3">{row.roles.join(", ") || "—"}</td>
                      <td className="px-3 py-3"><StatusBadge status={row.account_status} /></td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap justify-end gap-1">
                          {!row.username ? (
                            <PermissionGate perm="hr.user_access_manage">
                              <Button size="sm" variant="outline" onClick={() => { setLoginRow(row); setUsername(""); setPassword(""); setRoleCode("Cashier"); }}>Create login</Button>
                            </PermissionGate>
                          ) : (
                            <>
                              <PermissionGate perm="hr.role_assign">
                                <Button size="sm" variant="outline" onClick={() => { setRoleRow(row); setRoleCode(row.roles[0] || "Cashier"); }}>Assign role</Button>
                              </PermissionGate>
                              <PermissionGate perm="hr.password_reset">
                                <Button size="sm" variant="outline" onClick={() => { setResetRow(row); setResetPassword(""); }}>Reset password</Button>
                              </PermissionGate>
                              {row.account_status === "active" ? (
                                <PermissionGate perm="hr.user_access_manage">
                                  <Button size="sm" variant="outline" onClick={() => setSuspendId(row.employee_id)}>Suspend</Button>
                                </PermissionGate>
                              ) : (
                                <PermissionGate perm="hr.user_access_manage">
                                  <Button size="sm" variant="outline" onClick={() => setActivateId(row.employee_id)}>Reactivate</Button>
                                </PermissionGate>
                              )}
                            </>
                          )}
                        </div>
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
        open={Boolean(loginRow)}
        onOpenChange={o => { if (!o) setLoginRow(null); }}
        title={`Create login — ${loginRow?.full_name ?? ""}`}
        onSubmit={async () => {
          if (!loginRow) return;
          try {
            await createUser.mutateAsync({
              employeeId: loginRow.employee_id,
              body: { username, temporary_password: password, role_code: roleCode, force_password_change: true },
            });
            toast.success("Login created — temporary password is not stored for display");
            setLoginRow(null);
          } catch (err) {
            toast.error(formatApiError(err as ApiError));
          }
        }}
        isPending={createUser.isPending}
      >
        <div className="grid gap-3">
          <div><Label>Username</Label><Input value={username} onChange={e => setUsername(e.target.value)} autoComplete="off" /></div>
          <div>
            <Label>Temporary password</Label>
            <div className="flex gap-2">
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
              <Button type="button" variant="outline" onClick={async () => {
                try {
                  const res = await genPw.mutateAsync();
                  setPassword(res.temporary_password);
                  toast.message("Generated once — copy now; it will not be shown again from the server");
                } catch (err) {
                  toast.error(formatApiError(err as ApiError));
                }
              }}>Generate</Button>
            </div>
          </div>
          <div>
            <Label>Role</Label>
            <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={roleCode} onChange={e => setRoleCode(e.target.value)}>
              {["Cashier", "Store Manager", "Inventory User", "Auditor", "Admin"].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
      </EntityFormDrawer>

      <EntityFormDrawer
        open={Boolean(roleRow)}
        onOpenChange={o => { if (!o) setRoleRow(null); }}
        title={`Assign role — ${roleRow?.full_name ?? ""}`}
        onSubmit={async () => {
          if (!roleRow) return;
          try {
            await assignRole.mutateAsync({ employeeId: roleRow.employee_id, body: { role_code: roleCode } });
            toast.success("Role assigned");
            setRoleRow(null);
          } catch (err) {
            toast.error(formatApiError(err as ApiError));
          }
        }}
        isPending={assignRole.isPending}
      >
        <div>
          <Label>Role</Label>
          <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={roleCode} onChange={e => setRoleCode(e.target.value)}>
            {["Cashier", "Store Manager", "Inventory User", "Auditor", "Admin"].map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </EntityFormDrawer>

      <EntityFormDrawer
        open={Boolean(resetRow)}
        onOpenChange={o => { if (!o) setResetRow(null); }}
        title={`Reset password — ${resetRow?.full_name ?? ""}`}
        onSubmit={async () => {
          if (!resetRow) return;
          try {
            await resetPw.mutateAsync({
              employeeId: resetRow.employee_id,
              body: { temporary_password: resetPassword, force_password_change: true },
            });
            toast.success("Password reset (hashed; not returned)");
            setResetRow(null);
          } catch (err) {
            toast.error(formatApiError(err as ApiError));
          }
        }}
        isPending={resetPw.isPending}
      >
        <div>
          <Label>New temporary password</Label>
          <div className="flex gap-2">
            <Input type="password" value={resetPassword} onChange={e => setResetPassword(e.target.value)} />
            <Button type="button" variant="outline" onClick={async () => {
              const res = await genPw.mutateAsync();
              setResetPassword(res.temporary_password);
            }}>Generate</Button>
          </div>
        </div>
      </EntityFormDrawer>

      <ConfirmActionDialog
        open={Boolean(suspendId)}
        onOpenChange={o => { if (!o) setSuspendId(null); }}
        title="Suspend access?"
        description="Employee status becomes suspended and login is disabled. Historical transactions remain."
        confirmLabel="Suspend"
        onConfirm={async () => {
          if (!suspendId) return;
          try {
            await suspend.mutateAsync(suspendId);
            toast.success("Access suspended");
            setSuspendId(null);
          } catch (err) {
            toast.error(formatApiError(err as ApiError));
          }
        }}
      />

      <ConfirmActionDialog
        open={Boolean(activateId)}
        onOpenChange={o => { if (!o) setActivateId(null); }}
        title="Reactivate access?"
        description="Employee and linked UserAccount will be re-enabled."
        confirmLabel="Reactivate"
        onConfirm={async () => {
          if (!activateId) return;
          try {
            await activate.mutateAsync(activateId);
            toast.success("Access reactivated");
            setActivateId(null);
          } catch (err) {
            toast.error(formatApiError(err as ApiError));
          }
        }}
      />
    </PermissionGate>
  );
}
