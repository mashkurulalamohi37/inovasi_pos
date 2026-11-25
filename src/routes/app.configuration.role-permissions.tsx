import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useApp } from "@/lib/app-store";
import { ROLES, CONFIG_MATRIX_PERMS, PERMISSION_LABELS, type Permission, type Role } from "@/lib/permissions";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useApiRolePermissions, useUpdateRolePermission } from "@/hooks/use-api-config";
import { useAuth } from "@/lib/auth-provider";
import { requirePermission } from "@/lib/permission-ui";
import { toast } from "sonner";

export const Route = createFileRoute("/app/configuration/role-permissions")({ component: RoleMatrix });

function RoleMatrix() {
  const app = useApp();
  const { can: authCan, isDemo } = useAuth();
  const useApi = shouldUseBackend();
  const { data: apiPerms, isLoading } = useApiRolePermissions(useApi);
  const updatePerm = useUpdateRolePermission();

  const canEdit = isDemo ? app.can("config.flags") : authCan("config.flags");

  const isAllowed = (role: Role, perm: Permission) => {
    if (useApi && apiPerms) {
      const row = apiPerms.find(p => p.role_code === role && p.permission_code === perm);
      return row?.allowed ?? false;
    }
    return app.canForRole(role, perm);
  };

  const onToggle = (role: Role, perm: Permission, allowed: boolean) => {
    if (!requirePermission(canEdit)) return;
    if (useApi) {
      updatePerm.mutate(
        { role_code: role, permission_code: perm, allowed },
        { onSuccess: () => toast.success(`${role}: ${PERMISSION_LABELS[perm]} ${allowed ? "granted" : "revoked"}`) },
      );
      return;
    }
    app.setRoleOverride(role, perm, allowed);
    toast.success(`${role}: ${PERMISSION_LABELS[perm]} ${allowed ? "granted" : "revoked"}`);
  };

  return (
    <>
      <PageHeader
        eyebrow="Configuration"
        title="Role Permission Matrix"
        subtitle={useApi ? "Permissions persisted on the server per tenant." : "Demo mode — changes stored in localStorage."}
      />
      <PageBody>
        <SectionCard title="Permissions by role">
          {useApi && isLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-5 py-2.5 text-left">Permission</th>
                    {ROLES.map(r => <th key={r} className="px-3 py-2.5 text-center">{r}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {CONFIG_MATRIX_PERMS.map(perm => (
                    <tr key={perm}>
                      <td className="px-5 py-3">
                        <div className="font-medium">{PERMISSION_LABELS[perm]}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">{perm}</div>
                      </td>
                      {ROLES.map(role => (
                        <td key={role} className="px-3 py-3 text-center">
                          <Switch
                            checked={isAllowed(role, perm)}
                            disabled={!canEdit || updatePerm.isPending}
                            onCheckedChange={v => onToggle(role, perm, v)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
            Active role: <strong>{app.role}</strong>
            {isDemo && <> · Switch role in top bar to test runtime enforcement</>}
          </div>
        </SectionCard>
      </PageBody>
    </>
  );
}
