import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, PageBody, SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { fmtBDT } from "@/lib/pos-data";
import {
  useActivateTenant,
  useApproveTenant,
  useAssignTenantPlan,
  useRejectTenant,
  useResetTenantPassword,
  useSuperAdminPlans,
  useSuperAdminTenants,
  useSuspendTenant,
  useSuperAdminPackRequests,
  useResolvePackRequest,
  type ApiTenantSummary,
  type ApiPackActivationRequest,
} from "@/hooks/use-api-config";
import { shouldUseBackend } from "@/lib/demo-mode";
import { INDUSTRY_PACKS } from "@/lib/industry-registry";
import { Check, Clock, Copy, Eye, EyeOff, Key, Sparkles, User, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/super-admin/tenants")({ component: SuperTenantsPage });

const DEMO_TENANTS: ApiTenantSummary[] = [
  {
    id: "demo-1",
    code: "PULSE-DEMO",
    name: "Pulse Demo Retail",
    is_active: true,
    is_suspended: false,
    approval_status: "approved",
    plan_code: "professional",
    plan_name: "Professional",
    subscription_status: "active",
    billing_cycle: "monthly",
    started_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    user_count: 5,
    store_count: 2,
    admin_email: "admin@pulse.pos",
    admin_username: "admin",
    admin_password: "admin123",
  },
  {
    id: "demo-outfit",
    code: "OUTFIT",
    name: "OUTFIT",
    is_active: true,
    is_suspended: false,
    approval_status: "approved",
    plan_code: "starter",
    plan_name: "Starter",
    subscription_status: "active",
    billing_cycle: "monthly",
    started_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    user_count: 2,
    store_count: 1,
    admin_email: "babar@pos.com",
    admin_username: "babar",
    admin_password: "admin123",
  },
  {
    id: "demo-jw",
    code: "AURA-JEWELRY",
    name: "Aura Fine Jewelry & Gems",
    is_active: true,
    is_suspended: false,
    approval_status: "approved",
    plan_code: "professional",
    plan_name: "Professional",
    subscription_status: "active",
    billing_cycle: "monthly",
    started_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60 * 86400000).toISOString(),
    user_count: 2,
    store_count: 1,
    admin_email: "aura@pos.com",
    admin_username: "aura",
    admin_password: "admin123",
  },
  {
    id: "demo-el",
    code: "VOLT-ELECTRONICS",
    name: "Volt Electronics & Gadgets",
    is_active: true,
    is_suspended: false,
    approval_status: "approved",
    plan_code: "professional",
    plan_name: "Professional",
    subscription_status: "active",
    billing_cycle: "monthly",
    started_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60 * 86400000).toISOString(),
    user_count: 2,
    store_count: 1,
    admin_email: "volt@pos.com",
    admin_username: "volt",
    admin_password: "admin123",
  },
  {
    id: "demo-talico",
    code: "TALICO",
    name: "Tali Co Kitchen",
    is_active: true,
    is_suspended: false,
    approval_status: "approved",
    plan_code: "professional",
    plan_name: "Professional",
    subscription_status: "active",
    billing_cycle: "monthly",
    started_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 90 * 86400000).toISOString(),
    user_count: 2,
    store_count: 1,
    admin_email: "admin@talicokitchen.com",
    admin_username: "talico",
    admin_password: "admin123",
  },
  {
    id: "demo-2",
    code: "FASHION-01",
    name: "Style House",
    is_active: false,
    is_suspended: true,
    approval_status: "pending",
    plan_code: "starter",
    plan_name: "Starter",
    subscription_status: "pending_approval",
    billing_cycle: "monthly",
    started_at: null,
    expires_at: null,
    user_count: 1,
    store_count: 1,
    admin_email: "style@pos.com",
    admin_username: "style",
    admin_password: "admin123",
  },
];

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function periodLabel(t: ApiTenantSummary) {
  if (!t.started_at && !t.expires_at) return "Not started";
  return `${formatDate(t.started_at)} → ${formatDate(t.expires_at)}`;
}

function copyToClipboard(text: string, label: string) {
  navigator.clipboard.writeText(text);
  toast.success(`Copied ${label} to clipboard: ${text}`);
}

function SuperTenantsPage() {
  const on = shouldUseBackend();
  const query = useSuperAdminTenants(on);
  const plans = useSuperAdminPlans(on);
  const suspend = useSuspendTenant();
  const activate = useActivateTenant();
  const approve = useApproveTenant();
  const reject = useRejectTenant();
  const assign = useAssignTenantPlan();
  const resetPassword = useResetTenantPassword();

  const rows = on ? (query.data ?? []) : DEMO_TENANTS;
  const packRequestsQuery = useSuperAdminPackRequests(undefined, on);
  const resolvePack = useResolvePackRequest();
  const packRequests = packRequestsQuery.data ?? [];
  const pendingPackRequests = useMemo(
    () => packRequests.filter((r) => r.status === "pending"),
    [packRequests],
  );

  const [tab, setTab] = useState<"pending" | "all" | "pack_requests">("all");
  const [search, setSearch] = useState("");
  const [editTenant, setEditTenant] = useState<ApiTenantSummary | null>(null);
  const [editPlan, setEditPlan] = useState("starter");
  const [editCycle, setEditCycle] = useState("monthly");
  const [editMonths, setEditMonths] = useState("1");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectTarget, setRejectTarget] = useState<ApiTenantSummary | null>(null);
  const [rejectPackTarget, setRejectPackTarget] = useState<ApiPackActivationRequest | null>(null);
  const [rejectPackComment, setRejectPackComment] = useState("");

  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [resetTarget, setResetTarget] = useState<ApiTenantSummary | null>(null);
  const [newPassword, setNewPassword] = useState("admin123");

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const pending = useMemo(
    () => rows.filter((t) => (t.approval_status ?? "approved") === "pending"),
    [rows],
  );

  const filtered = useMemo(() => {
    const source = tab === "pending" ? pending : rows;
    const q = search.trim().toLowerCase();
    if (!q) return source;
    return source.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q) ||
        (t.admin_email ?? "").toLowerCase().includes(q) ||
        (t.admin_username ?? "").toLowerCase().includes(q) ||
        (t.plan_name ?? "").toLowerCase().includes(q) ||
        (t.plan_code ?? "").toLowerCase().includes(q),
    );
  }, [rows, pending, tab, search]);

  const filteredPackRequests = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return packRequests;
    return packRequests.filter(
      (r) =>
        (r.company_name ?? "").toLowerCase().includes(q) ||
        (r.company_code ?? "").toLowerCase().includes(q) ||
        (r.industry_code ?? "").toLowerCase().includes(q) ||
        (r.pack_name ?? "").toLowerCase().includes(q) ||
        (r.requested_by_name ?? "").toLowerCase().includes(q) ||
        (r.note ?? "").toLowerCase().includes(q),
    );
  }, [packRequests, search]);

  const openEdit = (t: ApiTenantSummary) => {
    setEditTenant(t);
    setEditPlan(t.plan_code || "starter");
    setEditCycle(t.billing_cycle || "monthly");
    setEditMonths(t.billing_cycle === "yearly" ? "12" : "1");
  };

  const savePackage = async () => {
    if (!editTenant) return;
    const months = Number(editMonths);
    await assign.mutateAsync({
      company_id: editTenant.id,
      plan_code: editPlan,
      billing_cycle: editCycle,
      billing_months: Number.isFinite(months) && months > 0 ? months : 1,
    });
    setEditTenant(null);
  };

  const approveSignup = async (t: ApiTenantSummary) => {
    await approve.mutateAsync({
      companyId: t.id,
      plan_code: t.plan_code,
      billing_cycle: t.billing_cycle || "monthly",
      billing_months: t.billing_cycle === "yearly" ? 12 : 1,
    });
  };

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    await resetPassword.mutateAsync({
      companyId: resetTarget.id,
      password: newPassword,
      email: resetTarget.admin_email || undefined,
    });
    setResetTarget(null);
  };

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Tenants & signup requests"
        subtitle="Manage company signups, credentials (Company Code, Admin User & Password), and subscription plans."
      />
      <PageBody className="space-y-5">
        <SectionCard
          title="Customers & Store Access"
          description={`${pending.length} signups pending · ${pendingPackRequests.length} pack requests · ${rows.length} total tenants`}
          actions={
            <Input
              className="h-8 w-60"
              placeholder="Search by company, code, pack, admin…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          }
        >
          <Tabs value={tab} onValueChange={(v) => setTab(v as "pending" | "all" | "pack_requests")} className="px-5 pt-3">
            <TabsList>
              <TabsTrigger value="all">All tenants ({rows.length})</TabsTrigger>
              <TabsTrigger value="pending">Signup requests ({pending.length})</TabsTrigger>
              <TabsTrigger value="pack_requests" className="flex items-center gap-1.5">
                <span>POS Pack Requests</span>
                {pendingPackRequests.length > 0 && (
                  <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                    {pendingPackRequests.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
            <TabsContent value={tab} className="mt-3">
              {tab === "pack_requests" ? (
                packRequestsQuery.isLoading ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">Loading pack activation requests…</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-5 py-2.5 text-left">Company & Code</th>
                          <th className="px-4 py-2.5 text-left">Requested POS Pack</th>
                          <th className="px-3 py-2.5 text-left">Plan</th>
                          <th className="px-4 py-2.5 text-left">Requested By & Date</th>
                          <th className="px-4 py-2.5 text-left">Customer Note</th>
                          <th className="px-3 py-2.5 text-left">Status</th>
                          <th className="px-5 py-2.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filteredPackRequests.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">
                              No POS pack activation requests found.
                            </td>
                          </tr>
                        ) : (
                          filteredPackRequests.map((r) => {
                            const packMeta = INDUSTRY_PACKS.find((p) => p.id === r.industry_code);
                            const PackIcon = packMeta?.icon ?? Sparkles;
                            const isPending = r.status === "pending";
                            return (
                              <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                                <td className="px-5 py-3">
                                  <div className="font-semibold text-foreground text-sm">{r.company_name || "Company"}</div>
                                  <div className="mt-1 flex items-center gap-1.5">
                                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                                      {r.company_code || r.company_id.slice(0, 8)}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                                      <PackIcon className="h-4 w-4" />
                                    </div>
                                    <div>
                                      <div className="font-medium text-foreground text-xs">{packMeta?.name || r.industry_code}</div>
                                      <span className="text-[11px] text-muted-foreground">{packMeta?.shortName || r.industry_code}</span>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-3">
                                  <Badge variant="outline" className="text-xs capitalize">
                                    {r.plan_name || "Active"}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3 text-xs">
                                  <div className="font-medium text-foreground">{r.requested_by_name || r.requested_by}</div>
                                  <div className="text-muted-foreground text-[11px]">
                                    {r.created_at ? new Date(r.created_at).toLocaleString() : "Recently"}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-xs max-w-xs">
                                  {r.note ? (
                                    <span className="text-foreground italic">"{r.note}"</span>
                                  ) : (
                                    <span className="text-muted-foreground text-[11px]">No note</span>
                                  )}
                                </td>
                                <td className="px-3 py-3">
                                  {r.status === "approved" ? (
                                    <Badge className="bg-emerald-600 text-white hover:bg-emerald-600 text-[11px]">Approved</Badge>
                                  ) : r.status === "rejected" ? (
                                    <Badge variant="destructive" className="text-[11px]">Rejected</Badge>
                                  ) : (
                                    <Badge variant="secondary" className="bg-amber-500 text-white hover:bg-amber-500 text-[11px]">
                                      Pending Review
                                    </Badge>
                                  )}
                                </td>
                                <td className="px-5 py-3 text-right">
                                  {isPending ? (
                                    <div className="flex items-center justify-end gap-2">
                                      <Button
                                        size="sm"
                                        className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1"
                                        onClick={() => resolvePack.mutate({ id: r.id, action: "approve" })}
                                        disabled={resolvePack.isPending}
                                      >
                                        <Check className="h-3.5 w-3.5" /> Approve
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 border-destructive/40 text-destructive hover:bg-destructive/10 text-xs gap-1"
                                        onClick={() => {
                                          setRejectPackTarget(r);
                                          setRejectPackComment("");
                                        }}
                                        disabled={resolvePack.isPending}
                                      >
                                        <X className="h-3.5 w-3.5" /> Reject
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="text-[11px] text-muted-foreground">
                                      {r.resolved_at ? `Resolved ${new Date(r.resolved_at).toLocaleDateString()}` : "Completed"}
                                      {r.comment && <div className="text-[10px] italic">"{r.comment}"</div>}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                )
              ) : query.isLoading ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Loading tenants…</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-5 py-2.5 text-left">Company & Code</th>
                        <th className="px-4 py-2.5 text-left">Admin User & Login</th>
                        <th className="px-3 py-2.5 text-left">Password</th>
                        <th className="px-3 py-2.5 text-left">Package</th>
                        <th className="px-3 py-2.5 text-left">Period</th>
                        <th className="px-3 py-2.5 text-right">Users</th>
                        <th className="px-3 py-2.5 text-right">Stores</th>
                        <th className="px-3 py-2.5 text-left">Status</th>
                        <th className="px-5 py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-5 py-8 text-center text-muted-foreground">
                            {tab === "pending" ? "No signup requests waiting for approval." : "No tenants found."}
                          </td>
                        </tr>
                      ) : (
                        filtered.map((t) => {
                          const approval = t.approval_status ?? "approved";
                          const subStatus =
                            t.subscription_status ??
                            (t.is_suspended ? "suspended" : t.plan_code ? "active" : "none");
                          const adminEmail = t.admin_email || `${t.code.toLowerCase().replace(/[^a-z0-9]/g, "")}@pulse.pos`;
                          const adminUser = t.admin_username || adminEmail.split("@")[0];
                          const pwd = t.admin_password || "admin123";
                          const isPwdVisible = !!visiblePasswords[t.id];

                          return (
                            <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                              {/* Company & Code */}
                              <td className="px-5 py-3">
                                <div className="font-semibold text-foreground text-sm">{t.name}</div>
                                <div className="mt-1 flex items-center gap-1.5">
                                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                                    {t.code}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 text-muted-foreground hover:text-foreground"
                                    title="Copy Company Code"
                                    onClick={() => copyToClipboard(t.code, "Company Code")}
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                </div>
                              </td>

                              {/* Admin User / Email */}
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5 font-medium text-xs text-foreground">
                                  <User className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span className="truncate max-w-[180px]" title={adminEmail}>{adminEmail}</span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 text-muted-foreground hover:text-foreground shrink-0"
                                    title="Copy Admin Email"
                                    onClick={() => copyToClipboard(adminEmail, "Admin Email")}
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                </div>
                                <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                                  user: {adminUser}
                                </div>
                              </td>

                              {/* Password with View/Copy/Reset */}
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-1">
                                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-secondary/80 text-foreground border border-border min-w-[76px] text-center">
                                    {isPwdVisible ? pwd : "••••••••"}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                    title={isPwdVisible ? "Hide password" : "Show password"}
                                    onClick={() => togglePasswordVisibility(t.id)}
                                  >
                                    {isPwdVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                    title="Copy password"
                                    onClick={() => copyToClipboard(pwd, "Password")}
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground hover:text-primary"
                                    title="Reset / change password"
                                    onClick={() => {
                                      setResetTarget(t);
                                      setNewPassword("admin123");
                                    }}
                                  >
                                    <Key className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </td>

                              {/* Package */}
                              <td className="px-3 py-3">
                                <div className="font-medium text-xs">{t.plan_name ?? t.plan_code ?? "—"}</div>
                                <div className="text-[10px] uppercase text-muted-foreground font-semibold">
                                  {t.billing_cycle ?? "monthly"}
                                </div>
                              </td>

                              {/* Period */}
                              <td className="px-3 py-3 text-xs text-muted-foreground">{periodLabel(t)}</td>

                              {/* Counts */}
                              <td className="px-3 py-3 text-right tabular-nums text-xs">{t.user_count}</td>
                              <td className="px-3 py-3 text-right tabular-nums text-xs">{t.store_count}</td>

                              {/* Status */}
                              <td className="px-3 py-3">
                                <div className="flex flex-col gap-1">
                                  <Badge variant={approval === "approved" ? "default" : "secondary"}>
                                    {approval}
                                  </Badge>
                                  <StatusBadge status={subStatus} />
                                </div>
                              </td>

                              {/* Actions */}
                              <td className="px-5 py-3">
                                <div className="flex flex-wrap justify-end gap-1.5">
                                  {on && approval === "pending" && (
                                    <>
                                      <Button size="sm" onClick={() => approveSignup(t)} disabled={approve.isPending}>
                                        Approve
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          setRejectTarget(t);
                                          setRejectReason("");
                                        }}
                                      >
                                        Reject
                                      </Button>
                                    </>
                                  )}
                                  {on && (
                                    <Button size="sm" variant="outline" onClick={() => openEdit(t)}>
                                      Edit package
                                    </Button>
                                  )}
                                  {on && approval === "approved" && (
                                    t.is_suspended ? (
                                      <Button size="sm" variant="outline" onClick={() => activate.mutate(t.id)}>
                                        Activate
                                      </Button>
                                    ) : (
                                      <Button size="sm" variant="outline" onClick={() => suspend.mutate(t.id)}>
                                        Suspend
                                      </Button>
                                    )
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </SectionCard>
      </PageBody>

      {/* Edit Package Drawer */}
      <EntityFormDrawer
        open={!!editTenant}
        onOpenChange={(open) => { if (!open) setEditTenant(null); }}
        title={editTenant ? `Edit package — ${editTenant.name}` : "Edit package"}
        description="Change the package and billing period for this customer."
        onSubmit={savePackage}
        isPending={assign.isPending}
        submitLabel="Save package"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Package</Label>
            <Select value={editPlan} onValueChange={setEditPlan}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(plans.data ?? []).filter((p) => p.is_active !== false).map((p) => (
                  <SelectItem key={p.code} value={p.code}>
                    {p.name} — {fmtBDT(p.price_monthly)}/mo
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Billing cycle</Label>
            <Select value={editCycle} onValueChange={setEditCycle}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Period length (months)</Label>
            <Input
              type="number"
              min={1}
              max={120}
              value={editMonths}
              onChange={(e) => setEditMonths(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Starts today and sets the package end date for this customer.
            </p>
          </div>
        </div>
      </EntityFormDrawer>

      {/* Reset Password Drawer */}
      <EntityFormDrawer
        open={!!resetTarget}
        onOpenChange={(open) => { if (!open) setResetTarget(null); }}
        title={resetTarget ? `Reset Password — ${resetTarget.name}` : "Reset Password"}
        description={`Set a new login password for tenant admin (${resetTarget?.admin_email || resetTarget?.code}).`}
        onSubmit={handleResetPassword}
        isPending={resetPassword.isPending}
        submitLabel="Update Password"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Company Code</Label>
            <Input value={resetTarget?.code || ""} disabled className="font-mono bg-muted" />
          </div>
          <div className="space-y-2">
            <Label>Admin User</Label>
            <Input value={resetTarget?.admin_email || resetTarget?.admin_username || "admin"} disabled className="bg-muted" />
          </div>
          <div className="space-y-2">
            <Label>New Password</Label>
            <Input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password (e.g. admin123)"
            />
            <p className="text-xs text-muted-foreground">
              Minimum 4 characters. The tenant can sign in immediately with this new password.
            </p>
          </div>
        </div>
      </EntityFormDrawer>

      {/* Reject Signup Drawer */}
      <EntityFormDrawer
        open={!!rejectTarget}
        onOpenChange={(open) => { if (!open) setRejectTarget(null); }}
        title={rejectTarget ? `Reject signup — ${rejectTarget.name}` : "Reject signup"}
        description="The company will not be able to sign in until a new signup is submitted."
        onSubmit={async () => {
          if (!rejectTarget) return;
          await reject.mutateAsync({ companyId: rejectTarget.id, reason: rejectReason || undefined });
          setRejectTarget(null);
        }}
        isPending={reject.isPending}
        submitLabel="Reject request"
      >
        <div className="space-y-2">
          <Label>Reason (optional)</Label>
          <Input
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Incomplete details, wrong industry, etc."
          />
        </div>
      </EntityFormDrawer>

      {/* Reject Pack Activation Drawer */}
      <EntityFormDrawer
        open={!!rejectPackTarget}
        onOpenChange={(open) => { if (!open) setRejectPackTarget(null); }}
        title={rejectPackTarget ? `Reject POS Pack — ${rejectPackTarget.pack_name || rejectPackTarget.industry_code}` : "Reject Pack Activation"}
        description={`Reject request from ${rejectPackTarget?.company_name || "tenant"}. The pack will remain inactive.`}
        onSubmit={async () => {
          if (!rejectPackTarget) return;
          await resolvePack.mutateAsync({
            id: rejectPackTarget.id,
            action: "reject",
            comment: rejectPackComment.trim() || undefined,
          });
          setRejectPackTarget(null);
        }}
        isPending={resolvePack.isPending}
        submitLabel="Reject activation"
      >
        <div className="space-y-2">
          <Label>Reason (optional)</Label>
          <Input
            value={rejectPackComment}
            onChange={(e) => setRejectPackComment(e.target.value)}
            placeholder="e.g. Plan upgrade required for multiple active POS packs"
          />
        </div>
      </EntityFormDrawer>
    </>
  );
}

