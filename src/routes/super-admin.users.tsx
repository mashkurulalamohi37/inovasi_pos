import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import {
  useCreatePlatformUser,
  useSuperAdminCompanies,
  useSuperAdminRoles,
  useSuperAdminUsers,
  useUpdatePlatformUser,
  type ApiPlatformUser,
} from "@/hooks/use-api-config";
import { shouldUseBackend } from "@/lib/demo-mode";

export const Route = createFileRoute("/super-admin/users")({ component: SuperUsersPage });

function SuperUsersPage() {
  const on = shouldUseBackend();
  const companies = useSuperAdminCompanies(on);
  const [companyId, setCompanyId] = useState<string>("all");
  const filterCompany = companyId === "all" ? undefined : companyId;
  const users = useSuperAdminUsers(filterCompany, on);
  const roles = useSuperAdminRoles(filterCompany ?? companies.data?.[0]?.id, on && !!filterCompany);
  const createUser = useCreatePlatformUser();
  const updateUser = useUpdatePlatformUser();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ApiPlatformUser | null>(null);
  const [formCompanyId, setFormCompanyId] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [roleCode, setRoleCode] = useState("Admin");
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const formRoles = useSuperAdminRoles(formCompanyId || undefined, on && !!formCompanyId);
  const companyOptions = companies.data ?? [];
  const selectedCompany = companyOptions.find(c => c.id === formCompanyId);

  const openCreate = () => {
    setEditing(null);
    setFormCompanyId(filterCompany ?? companyOptions[0]?.id ?? "");
    setEmail("");
    setFullName("");
    setPassword("");
    setRoleCode("Admin");
    setIsPlatformAdmin(false);
    setIsActive(true);
    setDrawerOpen(true);
  };

  const openEdit = (user: ApiPlatformUser) => {
    setEditing(user);
    setFormCompanyId(user.company_id);
    setEmail(user.email);
    setFullName(user.full_name);
    setPassword("");
    setRoleCode(user.role_code ?? "Admin");
    setIsPlatformAdmin(user.is_platform_admin);
    setIsActive(user.is_active);
    setDrawerOpen(true);
  };

  const roleChoices = useMemo(() => {
    const list = formRoles.data ?? roles.data ?? [];
    if (list.length) return list.map(r => r.code);
    return ["Admin", "Store Manager", "Cashier", "Inventory", "Auditor", "Super Admin"];
  }, [formRoles.data, roles.data]);

  const submit = async () => {
    if (editing) {
      await updateUser.mutateAsync({
        userId: editing.id,
        full_name: fullName.trim(),
        role_code: roleCode,
        is_active: isActive,
        is_platform_admin: isPlatformAdmin,
        ...(password ? { password } : {}),
      });
    } else {
      if (!formCompanyId || !email.trim() || !password || !fullName.trim()) return;
      await createUser.mutateAsync({
        company_id: formCompanyId,
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        role_code: roleCode,
        is_platform_admin: isPlatformAdmin && selectedCompany?.is_platform === true,
      });
    }
    setDrawerOpen(false);
  };

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Users"
        subtitle="Create and manage users across any tenant. Super Admin can assign any role."
        actions={<Button size="sm" onClick={openCreate} disabled={!on}>Create user</Button>}
      />
      <PageBody className="space-y-5">
        <SectionCard title="Filter">
          <div className="p-5 sm:max-w-sm">
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger><SelectValue placeholder="All companies" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All companies</SelectItem>
                {companyOptions.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name} ({c.code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </SectionCard>
        <SectionCard title="Directory">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 text-left">User</th>
                  <th className="px-5 py-2 text-left">Company</th>
                  <th className="px-5 py-2 text-left">Role</th>
                  <th className="px-5 py-2 text-left">Status</th>
                  <th className="px-5 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(users.data ?? []).map(u => (
                  <tr key={u.id}>
                    <td className="px-5 py-3">
                      <div className="font-medium">{u.full_name}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </td>
                    <td className="px-5 py-3">{u.company_name ?? u.company_code ?? "—"}</td>
                    <td className="px-5 py-3">
                      {u.role_code ?? "—"}
                      {u.is_platform_admin ? (
                        <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">
                          Platform
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3">{u.is_active ? "Active" : "Disabled"}</td>
                    <td className="px-5 py-3 text-right">
                      <Button variant="outline" size="sm" onClick={() => openEdit(u)}>Edit</Button>
                    </td>
                  </tr>
                ))}
                {!users.data?.length ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                      {on ? "No users found." : "Connect to the API to manage users."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </PageBody>

      <EntityFormDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={editing ? "Edit user" : "Create user"}
        description="Super Admin can create users in any company and assign any role."
        onSubmit={submit}
        isPending={createUser.isPending || updateUser.isPending}
        submitLabel={editing ? "Save changes" : "Create user"}
      >
        <div className="space-y-4">
          {!editing ? (
            <div className="space-y-2">
              <Label>Company</Label>
              <Select value={formCompanyId} onValueChange={setFormCompanyId}>
                <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                <SelectContent>
                  {companyOptions.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name} ({c.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label>Full name</Label>
            <Input value={fullName} onChange={e => setFullName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={!!editing}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>{editing ? "New password (optional)" : "Password"}</Label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required={!editing}
              minLength={6}
            />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={roleCode} onValueChange={setRoleCode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {roleChoices.map(code => (
                  <SelectItem key={code} value={code}>{code}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {editing ? (
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Active</span>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </label>
          ) : null}
          {(selectedCompany?.is_platform || editing?.is_platform_admin) ? (
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Platform admin</span>
              <Switch checked={isPlatformAdmin} onCheckedChange={setIsPlatformAdmin} />
            </label>
          ) : null}
        </div>
      </EntityFormDrawer>
    </>
  );
}
