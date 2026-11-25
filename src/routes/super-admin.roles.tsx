import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import {
  useCreatePlatformRole,
  useGrantAllPlatformRolePermissions,
  useSetPlatformRolePermission,
  useSuperAdminCompanies,
  useSuperAdminRolePermissions,
  useSuperAdminRoles,
} from "@/hooks/use-api-config";
import { shouldUseBackend } from "@/lib/demo-mode";
import { toast } from "sonner";

export const Route = createFileRoute("/super-admin/roles")({ component: SuperRolesPage });

function SuperRolesPage() {
  const on = shouldUseBackend();
  const companies = useSuperAdminCompanies(on);
  const [companyId, setCompanyId] = useState("");
  const [roleCode, setRoleCode] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [grantAll, setGrantAll] = useState(false);

  useEffect(() => {
    if (!companyId && companies.data?.length) {
      const demo = companies.data.find(c => c.code === "PULSE-DEMO") ?? companies.data[0];
      setCompanyId(demo.id);
    }
  }, [companies.data, companyId]);

  const roles = useSuperAdminRoles(companyId || undefined, on);
  const perms = useSuperAdminRolePermissions(companyId || undefined, roleCode || undefined, on);
  const createRole = useCreatePlatformRole();
  const setPerm = useSetPlatformRolePermission();
  const grantAllMut = useGrantAllPlatformRolePermissions();

  useEffect(() => {
    if (!roleCode && roles.data?.length) setRoleCode(roles.data[0].code);
  }, [roles.data, roleCode]);

  const modules = useMemo(() => {
    const map = new Map<string, typeof perms.data>();
    for (const row of perms.data ?? []) {
      const list = map.get(row.module) ?? [];
      list.push(row);
      map.set(row.module, list);
    }
    return [...map.entries()];
  }, [perms.data]);

  const submitRole = async () => {
    if (!companyId || !newCode.trim()) return;
    await createRole.mutateAsync({
      company_id: companyId,
      code: newCode.trim(),
      name: newName.trim() || newCode.trim(),
      grant_all: grantAll,
    });
    setRoleCode(newCode.trim());
    setDrawerOpen(false);
    setNewCode("");
    setNewName("");
    setGrantAll(false);
  };

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Roles & access"
        subtitle="Create roles for any tenant and grant any permission — including full access."
        actions={
          <Button size="sm" disabled={!on || !companyId} onClick={() => setDrawerOpen(true)}>
            Create role
          </Button>
        }
      />
      <PageBody className="space-y-5">
        <SectionCard title="Tenant & role">
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Company</Label>
              <Select value={companyId} onValueChange={id => { setCompanyId(id); setRoleCode(""); }}>
                <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                <SelectContent>
                  {(companies.data ?? []).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name} ({c.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={roleCode} onValueChange={setRoleCode}>
                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>
                  {(roles.data ?? []).map(r => (
                    <SelectItem key={r.id} value={r.code}>
                      {r.name} ({r.user_count} users)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                disabled={!on || !companyId || !roleCode || grantAllMut.isPending}
                onClick={() =>
                  grantAllMut.mutate(
                    { company_id: companyId, role_code: roleCode },
                    { onSuccess: () => toast.success(`${roleCode} now has all permissions`) },
                  )
                }
              >
                Grant all permissions
              </Button>
            </div>
          </div>
        </SectionCard>

        <SectionCard title={roleCode ? `Permissions · ${roleCode}` : "Permissions"}>
          {!roleCode ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Select a role to edit access.</div>
          ) : (
            <div className="divide-y divide-border">
              {modules.map(([module, rows]) => (
                <div key={module} className="p-5">
                  <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{module}</div>
                  <div className="space-y-2">
                    {(rows ?? []).map(row => (
                      <label key={row.permission_code} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-secondary/40">
                        <div>
                          <div className="text-sm font-medium">{row.permission_name}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">{row.permission_code}</div>
                        </div>
                        <Switch
                          checked={row.allowed}
                          disabled={setPerm.isPending}
                          onCheckedChange={allowed =>
                            setPerm.mutate({
                              company_id: companyId,
                              role_code: roleCode,
                              permission_code: row.permission_code,
                              allowed,
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </PageBody>

      <EntityFormDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title="Create role"
        description="New roles are scoped to the selected company."
        onSubmit={submitRole}
        isPending={createRole.isPending}
        submitLabel="Create role"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Code</Label>
            <Input value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="e.g. Regional Manager" required />
          </div>
          <div className="space-y-2">
            <Label>Display name</Label>
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Optional" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={grantAll} onCheckedChange={v => setGrantAll(v === true)} />
            Grant all permissions immediately
          </label>
        </div>
      </EntityFormDrawer>
    </>
  );
}
