import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import {
  apiClient,
  type PlatformNotificationRow,
  type SaasAdminUserRow,
  type SubscriptionPlanRow,
} from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormDialogLayout, formDialogPrimaryButtonClass } from "@/components/dialogs/FormDialogLayout";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Building2, Bell, Loader2, Package, Plus, Users, Pencil, Trash2, UserX, UserCheck, CheckCircle2 } from "lucide-react";
import { SubscriptionPlanCards } from "@/components/subscription/SubscriptionPlanCards";
import { TenantStatusBadge } from "@/components/platform/TenantStatusBadge";
import { PlanCodeBadge } from "@/components/platform/PlanCodeBadge";
import { TenantStatusSelect } from "@/components/platform/TenantStatusSelect";
import { CopyCompanyIdButton } from "@/components/platform/CopyCompanyIdButton";
import { useActionConfirm } from "@/hooks/useActionConfirm";

interface TenantRow {
  id: string;
  name: string;
  company_code: string;
  plan_code: string;
  status: string;
  employee_count: number;
  location_count: number;
  plan_valid_until?: string | null;
  trial_ends_at?: string | null;
}

const TAB_KEYS = ["companies", "users", "packages", "notifications"] as const;
type TabKey = (typeof TAB_KEYS)[number];

export default function PlatformAdminConsole() {
  const { request: requestConfirm, dialog: confirmDialog } = useActionConfirm();
  const navigate = useNavigate();
  const { section } = useParams<{ section?: string }>();
  const tab: TabKey = TAB_KEYS.includes(section as TabKey) ? (section as TabKey) : "companies";
  const setTab = (v: string) => navigate(`/platform/admin/${v}`);

  useEffect(() => {
    if (section && !TAB_KEYS.includes(section as TabKey)) {
      navigate("/platform/admin/companies", { replace: true });
    }
  }, [section, navigate]);

  const queryClient = useQueryClient();
  const [companyOpen, setCompanyOpen] = useState(false);
  const [allocateOpen, setAllocateOpen] = useState<string | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [userSearch, setUserSearch] = useState("");

  const [companyForm, setCompanyForm] = useState({
    name: "",
    contact_person: "",
    logo_url: "",
    admin_email: "",
    admin_password: "",
  });

  const [allocateForm, setAllocateForm] = useState({
    plan_code: "starter",
    period_months: 1,
    amount: 0,
    payment_method: "manual",
    reference_no: "",
    notes: "",
  });
  const [editPlanOpen, setEditPlanOpen] = useState<SubscriptionPlanRow | null>(null);
  const [editPlanForm, setEditPlanForm] = useState({
    name: "",
    max_users: 10,
    max_locations: 2,
    price_monthly: 0,
    is_active: true,
  });

  const [planForm, setPlanForm] = useState({
    code: "",
    name: "",
    max_users: 10,
    max_locations: 2,
    price_monthly: 49,
  });

  const [notifyForm, setNotifyForm] = useState({
    title: "",
    message: "",
    severity: "info",
    tenant_id: "",
    broadcast_all: false,
  });

  const { data: dashboard } = useQuery({
    queryKey: ["saas-dashboard"],
    queryFn: () => apiClient.getSaasAdminDashboard(),
  });

  const { data: tenants = [], isLoading: tenantsLoading } = useQuery({
    queryKey: ["saas-tenants"],
    queryFn: () => apiClient.getSaasAdminTenants() as Promise<TenantRow[]>,
  });

  const { data: plans = [] } = useQuery({
    queryKey: ["saas-plans"],
    queryFn: () => apiClient.getSaasAdminPlans(),
  });

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["saas-users", userSearch],
    queryFn: () => apiClient.getSaasAdminUsers({ search: userSearch || undefined, limit: 200 }),
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ["saas-notifications"],
    queryFn: () => apiClient.getSaasAdminNotifications({ limit: 100 }),
  });

  const createCompany = useMutation({
    mutationFn: () => apiClient.createSaasTenant(companyForm),
    onSuccess: (res) => {
      toast.success(`Company created. Workspace: ${res.company_code}`);
      setCompanyOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["saas-tenants"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const allocatePlan = useMutation({
    mutationFn: (tenantId: string) =>
      apiClient.allocateSaasTenantPlan(tenantId, allocateForm),
    onSuccess: () => {
      toast.success("Package allocated");
      setAllocateOpen(null);
      void queryClient.invalidateQueries({ queryKey: ["saas-tenants"] });
      void queryClient.invalidateQueries({ queryKey: ["saas-notifications"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createPlan = useMutation({
    mutationFn: () => apiClient.createSaasPlan(planForm),
    onSuccess: () => {
      toast.success("Package created");
      setPlanOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["saas-plans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updatePlan = useMutation({
    mutationFn: () =>
      apiClient.updateSaasPlan(editPlanOpen!.code, editPlanForm),
    onSuccess: () => {
      toast.success("Package updated");
      setEditPlanOpen(null);
      void queryClient.invalidateQueries({ queryKey: ["saas-plans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deletePlan = useMutation({
    mutationFn: (code: string) => apiClient.deleteSaasPlan(code),
    onSuccess: () => {
      toast.success("Package removed");
      void queryClient.invalidateQueries({ queryKey: ["saas-plans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const suspendUser = useMutation({
    mutationFn: ({
      userId,
      tenantId,
      status,
    }: {
      userId: string;
      tenantId?: string;
      status: "active" | "suspended";
    }) => apiClient.setSaasUserMembershipStatus(userId, { status, tenant_id: tenantId }),
    onSuccess: () => {
      toast.success("User membership updated");
      void queryClient.invalidateQueries({ queryKey: ["saas-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendNotify = useMutation({
    mutationFn: () =>
      apiClient.sendSaasAdminNotification({
        title: notifyForm.title,
        message: notifyForm.message,
        severity: notifyForm.severity,
        tenant_id: notifyForm.broadcast_all ? undefined : notifyForm.tenant_id || undefined,
        broadcast_all: notifyForm.broadcast_all,
      }),
    onSuccess: (r) => {
      toast.success(`Sent to ${r.count} organization(s)`);
      setNotifyOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["saas-notifications"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approveTenant = useMutation({
    mutationFn: (tenantId: string) => apiClient.approveSaasTenant(tenantId),
    onSuccess: () => {
      toast.success("Company approved — full access enabled");
      void queryClient.invalidateQueries({ queryKey: ["saas-tenants"] });
      void queryClient.invalidateQueries({ queryKey: ["saas-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiClient.updateSaasTenant(id, { status }),
    onSuccess: () => {
      toast.success("Company updated");
      void queryClient.invalidateQueries({ queryKey: ["saas-tenants"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <MainLayout
      title="Super Admin"
      subtitle="Manage companies, users, subscription packages, and tenant notifications"
    >
      {confirmDialog}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        {[
          { label: "Pending approval", value: dashboard?.pending_approval_tenants ?? "-" },
          { label: "Active companies", value: dashboard?.active_tenants ?? "-" },
          { label: "Trial", value: dashboard?.trial_tenants ?? "-" },
          { label: "Total users", value: dashboard?.active_employees ?? "-" },
        ].map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 flex flex-wrap h-auto">
          <TabsTrigger value="companies" className="gap-1">
            <Building2 className="h-4 w-4" /> Companies
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-1">
            <Users className="h-4 w-4" /> Users
          </TabsTrigger>
          <TabsTrigger value="packages" className="gap-1">
            <Package className="h-4 w-4" /> Packages
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1">
            <Bell className="h-4 w-4" /> Notifications
          </TabsTrigger>
        </TabsList>

        <TabsContent value="companies">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">All pharmacy companies</h2>
            <Button onClick={() => setCompanyOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Onboard company
            </Button>
            <FormDialogLayout
              open={companyOpen}
              onOpenChange={setCompanyOpen}
              title="Create company"
              description="Onboard a pharmacy tenant and optional admin login."
              maxWidth="lg"
              footer={
                <>
                  <Button type="button" variant="outline" onClick={() => setCompanyOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    form="platform-create-company-form"
                    disabled={createCompany.isPending}
                    className={formDialogPrimaryButtonClass}
                  >
                    {createCompany.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating…
                      </>
                    ) : (
                      "Create company"
                    )}
                  </Button>
                </>
              }
            >
              <form
                id="platform-create-company-form"
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  createCompany.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Company name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    required
                    placeholder="Enter company name"
                    value={companyForm.name}
                    onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Admin email</Label>
                  <Input
                    type="email"
                    placeholder="owner@pharmacy.com"
                    value={companyForm.admin_email}
                    onChange={(e) =>
                      setCompanyForm({ ...companyForm, admin_email: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Admin password</Label>
                  <Input
                    type="password"
                    placeholder="Temporary password"
                    value={companyForm.admin_password}
                    onChange={(e) =>
                      setCompanyForm({ ...companyForm, admin_password: e.target.value })
                    }
                  />
                </div>
              </form>
            </FormDialogLayout>
          </div>

          {tenantsLoading ? (
            <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Company ID</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Users</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenants.map((t, rowIndex) => (
                    <TableRow key={t.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-xs rounded-md bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-900 border border-slate-200/80 dark:border-slate-700 px-2 py-1">
                            {t.company_code}
                          </span>
                          <CopyCompanyIdButton companyId={t.company_code} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <PlanCodeBadge planCode={t.plan_code} index={rowIndex} />
                      </TableCell>
                      <TableCell>
                        <TenantStatusBadge status={t.status} />
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex h-7 min-w-[2rem] items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-teal-500/10 text-sm font-semibold text-foreground">
                          {t.employee_count}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          {t.status === "pending_approval" && (
                            <Button
                              size="sm"
                              className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 shadow-md shadow-amber-500/25 hover:from-amber-600 hover:to-orange-600"
                              onClick={() => approveTenant.mutate(t.id)}
                              disabled={approveTenant.isPending}
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Approve
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-violet-300/60 bg-gradient-to-r from-violet-50 to-purple-50 text-violet-900 hover:from-violet-100 hover:to-purple-100 dark:from-violet-950/40 dark:to-purple-950/30 dark:text-violet-200 dark:border-violet-700/50"
                            onClick={() => {
                              setAllocateOpen(t.id);
                              setAllocateForm((f) => ({ ...f, plan_code: t.plan_code || "starter" }));
                            }}
                          >
                            Allocate package
                          </Button>
                          <TenantStatusSelect
                            value={t.status}
                            onValueChange={(v) => {
                              if (v === t.status) return;
                              const needsConfirm =
                                v === "suspended" || v === "cancelled";
                              if (needsConfirm) {
                                requestConfirm({
                                  title:
                                    v === "suspended"
                                      ? "Suspend company?"
                                      : "Cancel company?",
                                  description: `Set "${t.name}" status to ${v.replace("_", " ")}? Users may lose access.`,
                                  confirmLabel: v === "suspended" ? "Suspend" : "Confirm",
                                  variant: "destructive",
                                  onConfirm: () =>
                                    updateStatus.mutate({ id: t.id, status: v }),
                                });
                              } else {
                                updateStatus.mutate({ id: t.id, status: v });
                              }
                            }}
                            disabled={updateStatus.isPending}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <FormDialogLayout
            open={!!allocateOpen}
            onOpenChange={(o) => !o && setAllocateOpen(null)}
            title="Allocate subscription package"
            description="Assign a plan to this company and record payment status."
            footer={
              <>
                <Button type="button" variant="outline" onClick={() => setAllocateOpen(null)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  form="platform-allocate-form"
                  disabled={allocatePlan.isPending}
                  className={formDialogPrimaryButtonClass}
                >
                  {allocatePlan.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    "Confirm allocation"
                  )}
                </Button>
              </>
            }
          >
              <form
                id="platform-allocate-form"
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (allocateOpen) allocatePlan.mutate(allocateOpen);
                }}
              >
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Package</Label>
                  <Select
                    value={allocateForm.plan_code}
                    onValueChange={(v) => setAllocateForm({ ...allocateForm, plan_code: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {plans.map((p: SubscriptionPlanRow) => (
                        <SelectItem key={p.code} value={p.code}>
                          {p.name} — {p.price_monthly}/mo
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Months</Label>
                    <Input
                      type="number"
                      min={1}
                      value={allocateForm.period_months}
                      onChange={(e) =>
                        setAllocateForm({
                          ...allocateForm,
                          period_months: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Amount paid</Label>
                    <Input
                      type="number"
                      min={0}
                      value={allocateForm.amount}
                      onChange={(e) =>
                        setAllocateForm({ ...allocateForm, amount: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Payment status</Label>
                  <Select
                    value={allocateForm.payment_method}
                    onValueChange={(v) =>
                      setAllocateForm({ ...allocateForm, payment_method: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Paid (manual)</SelectItem>
                      <SelectItem value="pending">Pending payment</SelectItem>
                      <SelectItem value="invoice">Invoice (pending)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Reference / invoice</Label>
                  <Input
                    value={allocateForm.reference_no}
                    onChange={(e) =>
                      setAllocateForm({ ...allocateForm, reference_no: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Notes</Label>
                  <Textarea
                    className="resize-none"
                    rows={3}
                    value={allocateForm.notes}
                    onChange={(e) => setAllocateForm({ ...allocateForm, notes: e.target.value })}
                  />
                </div>
              </form>
          </FormDialogLayout>
        </TabsContent>

        <TabsContent value="users">
          <div className="flex gap-2 mb-4 max-w-md">
            <Input
              placeholder="Search email or name…"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
            />
          </div>
          {usersLoading ? (
            <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Companies</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(users as SaasAdminUserRow[]).map((u) => {
                    const hasSuspended = (u.memberships || []).some(
                      (m) => m.status === "suspended"
                    );
                    return (
                      <TableRow key={u.user_id}>
                        <TableCell>{u.email}</TableCell>
                        <TableCell>{u.display_name || "—"}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(u.memberships || []).map((m, i) => (
                              <Badge
                                key={i}
                                variant={m.status === "suspended" ? "destructive" : "secondary"}
                                className="text-xs"
                              >
                                {m.tenant_name} ({m.member_role}
                                {m.status === "suspended" ? ", suspended" : ""})
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          {hasSuspended ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                requestConfirm({
                                  title: "Reactivate user?",
                                  description: `Restore access for ${u.email} across all company memberships?`,
                                  confirmLabel: "Reactivate",
                                  variant: "primary",
                                  onConfirm: () =>
                                    suspendUser.mutate({
                                      userId: u.user_id,
                                      status: "active",
                                    }),
                                })
                              }
                            >
                              <UserCheck className="h-3 w-3 mr-1" />
                              Reactivate
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() =>
                                requestConfirm({
                                  title: "Suspend user?",
                                  description: `Suspend ${u.email} across all company memberships?`,
                                  confirmLabel: "Suspend",
                                  variant: "destructive",
                                  onConfirm: () =>
                                    suspendUser.mutate({
                                      userId: u.user_id,
                                      status: "suspended",
                                    }),
                                })
                              }
                            >
                              <UserX className="h-3 w-3 mr-1" />
                              Suspend
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="packages">
          <div className="flex justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold">Subscription packages</h2>
              <p className="text-sm text-muted-foreground">
                Card catalog shown to organization mother accounts after approval
              </p>
            </div>
            <Button onClick={() => setPlanOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> New package
            </Button>
            <FormDialogLayout
              open={planOpen}
              onOpenChange={setPlanOpen}
              title="Create package"
              description="Add a subscription tier for pharmacy organizations."
              footer={
                <>
                  <Button type="button" variant="outline" onClick={() => setPlanOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    form="platform-create-plan-form"
                    disabled={createPlan.isPending}
                    className={formDialogPrimaryButtonClass}
                  >
                    {createPlan.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      "Save package"
                    )}
                  </Button>
                </>
              }
            >
              <form
                id="platform-create-plan-form"
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  createPlan.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Code (slug)</Label>
                  <Input
                    required
                    placeholder="e.g. starter"
                    value={planForm.code}
                    onChange={(e) => setPlanForm({ ...planForm, code: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Name</Label>
                  <Input
                    required
                    placeholder="Display name"
                    value={planForm.name}
                    onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Max users</Label>
                    <Input
                      type="number"
                      value={planForm.max_users}
                      onChange={(e) =>
                        setPlanForm({ ...planForm, max_users: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Max stores</Label>
                    <Input
                      type="number"
                      value={planForm.max_locations}
                      onChange={(e) =>
                        setPlanForm({ ...planForm, max_locations: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Monthly price</Label>
                    <Input
                      type="number"
                      value={planForm.price_monthly}
                      onChange={(e) =>
                        setPlanForm({ ...planForm, price_monthly: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>
              </form>
            </FormDialogLayout>
          </div>
          <SubscriptionPlanCards plans={plans} className="mb-8" />
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Users</TableHead>
                  <TableHead>Stores</TableHead>
                  <TableHead>Price/mo</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((p: SubscriptionPlanRow) => (
                  <TableRow key={p.code}>
                    <TableCell className="font-mono">{p.code}</TableCell>
                    <TableCell>{p.name}</TableCell>
                    <TableCell>{p.max_users < 0 ? "∞" : p.max_users}</TableCell>
                    <TableCell>{p.max_locations < 0 ? "∞" : p.max_locations}</TableCell>
                    <TableCell>{p.price_monthly}</TableCell>
                    <TableCell>{p.is_active === false ? "No" : "Yes"}</TableCell>
                    <TableCell className="space-x-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditPlanOpen(p);
                          setEditPlanForm({
                            name: p.name,
                            max_users: p.max_users,
                            max_locations: p.max_locations,
                            price_monthly: p.price_monthly,
                            is_active: p.is_active !== false,
                          });
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() =>
                          requestConfirm({
                            title: "Remove package?",
                            description: `Remove subscription package "${p.code}"? Tenants on this plan may need reassignment.`,
                            confirmLabel: "Remove",
                            variant: "destructive",
                            onConfirm: () => deletePlan.mutate(p.code),
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="notifications">
          <div className="flex justify-between mb-4">
            <h2 className="text-lg font-semibold">Company notifications</h2>
            <Button onClick={() => setNotifyOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Send notification
            </Button>
            <FormDialogLayout
              open={notifyOpen}
              onOpenChange={setNotifyOpen}
              title="Notify company account"
              description="Send a platform message to one or all active organizations."
              footer={
                <>
                  <Button type="button" variant="outline" onClick={() => setNotifyOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    form="platform-notify-form"
                    disabled={sendNotify.isPending}
                    className={formDialogPrimaryButtonClass}
                  >
                    {sendNotify.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending…
                      </>
                    ) : (
                      "Send notification"
                    )}
                  </Button>
                </>
              }
            >
              <form
                id="platform-notify-form"
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  sendNotify.mutate();
                }}
              >
                <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                  <input
                    type="checkbox"
                    id="broadcast"
                    className="h-4 w-4"
                    checked={notifyForm.broadcast_all}
                    onChange={(e) =>
                      setNotifyForm({ ...notifyForm, broadcast_all: e.target.checked })
                    }
                  />
                  <Label htmlFor="broadcast" className="text-sm font-medium cursor-pointer">
                    Send to all active companies
                  </Label>
                </div>
                {!notifyForm.broadcast_all && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Company</Label>
                    <Select
                      value={notifyForm.tenant_id}
                      onValueChange={(v) => setNotifyForm({ ...notifyForm, tenant_id: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select company" />
                      </SelectTrigger>
                      <SelectContent>
                        {tenants.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name} ({t.company_code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Title <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    required
                    placeholder="Notification title"
                    value={notifyForm.title}
                    onChange={(e) => setNotifyForm({ ...notifyForm, title: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Message <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    required
                    rows={4}
                    className="resize-none"
                    placeholder="Write your message to the organization…"
                    value={notifyForm.message}
                    onChange={(e) => setNotifyForm({ ...notifyForm, message: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Severity</Label>
                  <Select
                    value={notifyForm.severity}
                    onValueChange={(v) => setNotifyForm({ ...notifyForm, severity: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">Info</SelectItem>
                      <SelectItem value="success">Success</SelectItem>
                      <SelectItem value="warning">Warning</SelectItem>
                      <SelectItem value="error">Error</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </form>
            </FormDialogLayout>
          </div>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Read</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(notifications as PlatformNotificationRow[]).map((n) => (
                  <TableRow key={n.id}>
                    <TableCell>
                      {n.tenant_name} <span className="text-xs text-muted-foreground">{n.company_code}</span>
                    </TableCell>
                    <TableCell>{n.title}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{n.severity}</Badge>
                    </TableCell>
                    <TableCell>{n.is_read ? "Yes" : "No"}</TableCell>
                    <TableCell className="text-xs">
                      {new Date(n.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <FormDialogLayout
        open={!!editPlanOpen}
        onOpenChange={(o) => !o && setEditPlanOpen(null)}
        title={`Edit package — ${editPlanOpen?.code ?? ""}`}
        description="Update limits and pricing for this subscription tier."
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setEditPlanOpen(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="platform-edit-plan-form"
              disabled={updatePlan.isPending}
              className={formDialogPrimaryButtonClass}
            >
              {updatePlan.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </>
        }
      >
        <form
          id="platform-edit-plan-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            updatePlan.mutate();
          }}
        >
          <div className="space-y-2">
            <Label className="text-sm font-medium">Name</Label>
            <Input
              value={editPlanForm.name}
              onChange={(e) => setEditPlanForm({ ...editPlanForm, name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Max users</Label>
              <Input
                type="number"
                value={editPlanForm.max_users}
                onChange={(e) =>
                  setEditPlanForm({ ...editPlanForm, max_users: Number(e.target.value) })
                }
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Max stores</Label>
              <Input
                type="number"
                value={editPlanForm.max_locations}
                onChange={(e) =>
                  setEditPlanForm({ ...editPlanForm, max_locations: Number(e.target.value) })
                }
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Monthly price</Label>
              <Input
                type="number"
                value={editPlanForm.price_monthly}
                onChange={(e) =>
                  setEditPlanForm({ ...editPlanForm, price_monthly: Number(e.target.value) })
                }
              />
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={editPlanForm.is_active}
              onChange={(e) =>
                setEditPlanForm({ ...editPlanForm, is_active: e.target.checked })
              }
            />
            <Label className="text-sm font-medium">Package is active</Label>
          </div>
        </form>
      </FormDialogLayout>
    </MainLayout>
  );
}
