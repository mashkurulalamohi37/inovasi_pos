import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { ConfirmActionDialog } from "@/components/pulse/ConfirmActionDialog";
import { fmtBDT } from "@/lib/pos-data";
import { cn } from "@/lib/utils";
import {
  useAssignTenantPlan,
  useCreateSubscriptionPlan,
  useDeleteSubscriptionPlan,
  useSetSubscriptionPlanStatus,
  useSetTenantSubscriptionStatus,
  useSuperAdminPlans,
  useSuperAdminTenants,
  useUpdateSubscriptionPlan,
  useExtendTenantSubscription,
  useSuperAdminPaymentRequests,
  useApproveSubscriptionPayment,
  useRejectSubscriptionPayment,
  type ApiSubscriptionPlan,
  type ApiTenantSummary,
  type ApiPaymentRequestItem,
} from "@/hooks/use-api-config";
import { shouldUseBackend } from "@/lib/demo-mode";
import {
  Clock,
  CheckCircle2,
  XCircle,
  ChevronDown,
  Calendar,
  AlertTriangle,
  Receipt,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/super-admin/subscriptions")({ component: SuperSubscriptionsPage });

const EMPTY_PLAN = {
  code: "",
  name: "",
  max_stores: 1,
  max_counters: 2,
  max_users: 5,
  max_industry_packs: 1,
  advanced_reports: false,
  offline_sync: false,
  api_integration: false,
  price_monthly: 0,
  is_active: true,
};

type PlanFilter = "active" | "inactive" | "all";

function SuperSubscriptionsPage() {
  const on = shouldUseBackend();
  const tenants = useSuperAdminTenants(on);
  const plans = useSuperAdminPlans(on);
  const assign = useAssignTenantPlan();
  const createPlan = useCreateSubscriptionPlan();
  const updatePlan = useUpdateSubscriptionPlan();
  const setStatus = useSetSubscriptionPlanStatus();
  const deletePlan = useDeleteSubscriptionPlan();
  const setSubStatus = useSetTenantSubscriptionStatus();
  const extendSub = useExtendTenantSubscription();
  const paymentRequests = useSuperAdminPaymentRequests(on);
  const approvePayment = useApproveSubscriptionPayment();
  const rejectPayment = useRejectSubscriptionPayment();

  const [companyId, setCompanyId] = useState("");
  const [planCode, setPlanCode] = useState("starter");
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [billingMonths, setBillingMonths] = useState("1");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ApiSubscriptionPlan | null>(null);
  const [form, setForm] = useState(EMPTY_PLAN);
  const [filter, setFilter] = useState<PlanFilter>("active");
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState<
    | { kind: "activate" | "deactivate" | "delete"; plan: ApiSubscriptionPlan }
    | { kind: "sub-status"; tenant: ApiTenantSummary; status: "active" | "suspended" | "cancelled" }
    | null
  >(null);

  // Custom Extension dialog state
  const [customExtendOpen, setCustomExtendOpen] = useState(false);
  const [customExtendTarget, setCustomExtendTarget] = useState<ApiTenantSummary | null>(null);
  const [customExtendDays, setCustomExtendDays] = useState("30");
  const [customExtendNote, setCustomExtendNote] = useState("");

  // Reject payment dialog state
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<ApiPaymentRequestItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const allPlans = plans.data ?? [];
  const activeCount = allPlans.filter((p) => p.is_active !== false).length;
  const inactiveCount = allPlans.filter((p) => p.is_active === false).length;

  const paymentRequestsList = paymentRequests.data ?? [];
  const pendingPaymentCount = paymentRequestsList.filter((r) => r.status === "pending").length;

  const filteredPlans = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allPlans.filter((p) => {
      if (filter === "active" && p.is_active === false) return false;
      if (filter === "inactive" && p.is_active !== false) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q);
    });
  }, [allPlans, filter, search]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_PLAN);
    setDrawerOpen(true);
  };

  const openEdit = (plan: ApiSubscriptionPlan) => {
    setEditing(plan);
    setForm({
      code: plan.code,
      name: plan.name,
      max_stores: plan.max_stores,
      max_counters: plan.max_counters,
      max_users: plan.max_users,
      max_industry_packs: plan.max_industry_packs,
      advanced_reports: plan.advanced_reports,
      offline_sync: plan.offline_sync,
      api_integration: plan.api_integration,
      price_monthly: plan.price_monthly,
      is_active: plan.is_active ?? true,
    });
    setDrawerOpen(true);
  };

  const submitPlan = async () => {
    if (editing?.id) {
      await updatePlan.mutateAsync({
        planId: editing.id,
        name: form.name,
        max_stores: form.max_stores,
        max_counters: form.max_counters,
        max_users: form.max_users,
        max_industry_packs: form.max_industry_packs,
        advanced_reports: form.advanced_reports,
        offline_sync: form.offline_sync,
        api_integration: form.api_integration,
        price_monthly: form.price_monthly,
        is_active: form.is_active,
      });
    } else {
      if (!form.code.trim() || !form.name.trim()) return;
      await createPlan.mutateAsync({ ...form, code: form.code.trim().toLowerCase(), name: form.name.trim() });
    }
    setDrawerOpen(false);
  };

  const setNum = (key: keyof typeof EMPTY_PLAN, value: string) => {
    const n = Number(value);
    setForm((prev) => ({ ...prev, [key]: Number.isFinite(n) ? n : 0 }));
  };

  const runConfirm = async () => {
    if (!confirm) return;
    if (confirm.kind === "activate" || confirm.kind === "deactivate") {
      if (!confirm.plan.id) return;
      await setStatus.mutateAsync({ planId: confirm.plan.id, is_active: confirm.kind === "activate" });
    } else if (confirm.kind === "delete") {
      if (!confirm.plan.id) return;
      await deletePlan.mutateAsync(confirm.plan.id);
    } else if (confirm.kind === "sub-status") {
      await setSubStatus.mutateAsync({ companyId: confirm.tenant.id, status: confirm.status });
    }
    setConfirm(null);
  };

  const confirmPending =
    setStatus.isPending || deletePlan.isPending || setSubStatus.isPending;

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Subscriptions & Packages"
        subtitle="Manage tiers, merchant packages, 1-click extensions, and bKash/Nagad payment requests."
        actions={
          <Button onClick={openCreate} size="sm">
            + New package
          </Button>
        }
      />
      <PageBody className="space-y-6">
        {/* Payment Requests Section (highlighted if pending) */}
        <SectionCard
          title="Manual Payment Requests (bKash / Nagad / Bank)"
          description="Review and approve customer subscription payments submitted via mobile banking & bank transfers"
          actions={
            pendingPaymentCount > 0 ? (
              <Badge variant="destructive" className="px-2 py-0.5 text-xs animate-pulse">
                {pendingPaymentCount} Pending Review
              </Badge>
            ) : undefined
          }
        >
          {paymentRequestsList.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No subscription payment requests submitted yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs uppercase">
                  <tr>
                    <th className="px-5 py-2 text-left">Customer / Store</th>
                    <th className="px-5 py-2 text-left">Package & Duration</th>
                    <th className="px-5 py-2 text-left">Method & TrxID</th>
                    <th className="px-5 py-2 text-left">Amount</th>
                    <th className="px-5 py-2 text-left">Submitted</th>
                    <th className="px-5 py-2 text-left">Status</th>
                    <th className="px-5 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paymentRequestsList.map((req) => {
                    const detail = req.detail || {};
                    const isPending = req.status === "pending";
                    return (
                      <tr key={req.id} className={cn(isPending && "bg-amber-500/5")}>
                        <td className="px-5 py-3">
                          <div className="font-medium text-foreground">{req.company_name}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {req.company_code || req.company_id}
                          </div>
                          {req.requested_by_email && (
                            <div className="text-[11px] text-muted-foreground">{req.requested_by_email}</div>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <div className="font-medium">{detail.plan_name || detail.plan_code}</div>
                          <div className="text-xs text-muted-foreground">
                            {detail.months ? `${detail.months} month(s)` : "1 month"}
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5 font-medium">
                            <Badge variant="outline" className="uppercase text-[10px] font-bold">
                              {detail.method || "manual"}
                            </Badge>
                            <span className="font-mono text-xs">{detail.trx_id}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Sender: <span className="font-mono">{detail.sender_number || "—"}</span>
                          </div>
                          {detail.note && (
                            <div className="text-[11px] text-muted-foreground italic mt-0.5">
                              "{detail.note}"
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3 font-semibold text-emerald-500">
                          {fmtBDT(detail.amount || 0)}
                        </td>
                        <td className="px-5 py-3 text-xs text-muted-foreground">
                          {req.created_at ? new Date(req.created_at).toLocaleString() : "—"}
                        </td>
                        <td className="px-5 py-3">
                          {req.status === "pending" && (
                            <Badge variant="outline" className="border-amber-500/50 bg-amber-500/10 text-amber-500">
                              Pending Review
                            </Badge>
                          )}
                          {req.status === "approved" && (
                            <Badge variant="outline" className="border-emerald-500/50 bg-emerald-500/10 text-emerald-500">
                              Approved
                            </Badge>
                          )}
                          {req.status === "rejected" && (
                            <div className="flex flex-col gap-0.5">
                              <Badge variant="destructive">Rejected</Badge>
                              {req.comment && (
                                <span className="text-[10px] text-destructive/80 italic">"{req.comment}"</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {isPending ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                disabled={approvePayment.isPending || rejectPayment.isPending}
                                onClick={() => approvePayment.mutate(req.id)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 h-7 px-2.5 text-xs cursor-pointer shadow-xs"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>Approve</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={approvePayment.isPending || rejectPayment.isPending}
                                onClick={() => {
                                  setRejectTarget(req);
                                  setRejectReason("");
                                  setRejectOpen(true);
                                }}
                                className="border-rose-500/40 text-rose-500 hover:bg-rose-500/10 gap-1 h-7 px-2.5 text-xs cursor-pointer"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                <span>Reject</span>
                              </Button>
                            </div>
                          ) : (
                            <div className="text-right text-xs text-muted-foreground">
                              {req.resolved_at ? new Date(req.resolved_at).toLocaleDateString() : "—"}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {/* Which customer uses which package */}
        <SectionCard
          title="Customer Subscriptions & 1-Click Extensions"
          description="View active subscription periods and immediately extend validity by +30d, +90d, +1 year, or custom days"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase">
                <tr>
                  <th className="px-5 py-2 text-left">Customer</th>
                  <th className="px-5 py-2 text-left">Package</th>
                  <th className="px-5 py-2 text-left">Cycle</th>
                  <th className="px-5 py-2 text-left">Period</th>
                  <th className="px-5 py-2 text-left">Status & Expiry</th>
                  <th className="px-5 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(tenants.data ?? []).map((t) => {
                  const subStatus = t.subscription_status ?? (t.is_suspended ? "suspended" : t.plan_code ? "active" : "none");
                  const start = t.started_at ? new Date(t.started_at).toLocaleDateString() : "—";
                  const end = t.expires_at ? new Date(t.expires_at).toLocaleDateString() : "—";

                  const now = Date.now();
                  const expiresTime = t.expires_at ? new Date(t.expires_at).getTime() : null;
                  const isExpired = expiresTime ? expiresTime < now : false;
                  const daysRemaining = expiresTime ? Math.ceil((expiresTime - now) / (1000 * 60 * 60 * 24)) : null;

                  return (
                    <tr key={t.id}>
                      <td className="px-5 py-3">
                        <div className="font-medium">{t.name}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">{t.code}</div>
                      </td>
                      <td className="px-5 py-3 font-medium">{t.plan_name ?? t.plan_code ?? "—"}</td>
                      <td className="px-5 py-3 capitalize text-muted-foreground">{t.billing_cycle ?? "monthly"}</td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">
                        {start} → <span className={cn(isExpired && "text-destructive font-semibold")}>{end}</span>
                      </td>
                      <td className="px-5 py-3">
                        {subStatus === "suspended" ? (
                          <Badge variant="destructive">Suspended</Badge>
                        ) : subStatus === "cancelled" ? (
                          <Badge variant="secondary">Cancelled</Badge>
                        ) : isExpired ? (
                          <div className="flex flex-col gap-0.5">
                            <Badge variant="destructive" className="w-fit">
                              Expired
                            </Badge>
                            <span className="text-[10px] text-destructive font-mono font-medium">
                              {Math.abs(daysRemaining ?? 0)}d ago
                            </span>
                          </div>
                        ) : daysRemaining !== null && daysRemaining <= 7 ? (
                          <div className="flex flex-col gap-0.5">
                            <Badge variant="outline" className="w-fit border-amber-500/50 bg-amber-500/10 text-amber-500">
                              Expiring Soon
                            </Badge>
                            <span className="text-[10px] text-amber-500 font-mono font-medium">
                              {daysRemaining}d left
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <Badge variant="default" className="w-fit">
                              Active
                            </Badge>
                            {daysRemaining !== null && (
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {daysRemaining}d left
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap justify-end gap-1.5 items-center">
                          {/* 1-Click Extension Dropdown */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={extendSub.isPending}
                                className="gap-1 border-primary/40 text-primary hover:bg-primary/10 h-7 text-xs cursor-pointer"
                                title="Quickly extend validity"
                              >
                                <Clock className="h-3 w-3" />
                                <span>Extend</span>
                                <ChevronDown className="h-3 w-3 opacity-60" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem
                                className="cursor-pointer"
                                onClick={() => extendSub.mutate({ companyId: t.id, days: 30 })}
                              >
                                <Calendar className="mr-2 h-4 w-4 text-emerald-500" />
                                +30 Days (1 Month)
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="cursor-pointer"
                                onClick={() => extendSub.mutate({ companyId: t.id, days: 90 })}
                              >
                                <Calendar className="mr-2 h-4 w-4 text-sky-500" />
                                +90 Days (3 Months)
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="cursor-pointer"
                                onClick={() => extendSub.mutate({ companyId: t.id, days: 365 })}
                              >
                                <Calendar className="mr-2 h-4 w-4 text-amber-500" />
                                +365 Days (1 Year)
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="cursor-pointer text-xs text-muted-foreground border-t mt-1 pt-1"
                                onClick={() => {
                                  setCustomExtendTarget(t);
                                  setCustomExtendDays("60");
                                  setCustomExtendNote("");
                                  setCustomExtendOpen(true);
                                }}
                              >
                                Custom Days...
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>

                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => {
                              setCompanyId(t.id);
                              if (t.plan_code) setPlanCode(t.plan_code);
                              if (t.billing_cycle) setBillingCycle(t.billing_cycle);
                            }}
                          >
                            Edit
                          </Button>
                          {subStatus !== "suspended" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setConfirm({ kind: "sub-status", tenant: t, status: "suspended" })}
                            >
                              Suspend
                            </Button>
                          )}
                          {subStatus !== "active" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setConfirm({ kind: "sub-status", tenant: t, status: "active" })}
                            >
                              Resume
                            </Button>
                          )}
                          {subStatus !== "cancelled" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setConfirm({ kind: "sub-status", tenant: t, status: "cancelled" })}
                            >
                              Cancel
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>

        {/* Assign / edit customer package form */}
        <SectionCard title="Assign package to customer">
          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {(tenants.data ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.plan_code ?? "none"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select value={planCode} onValueChange={setPlanCode}>
                <SelectTrigger><SelectValue placeholder="Package" /></SelectTrigger>
                <SelectContent>
                  {allPlans.filter((p) => p.is_active !== false).map((p) => (
                    <SelectItem key={p.code} value={p.code}>{p.name} — {fmtBDT(p.price_monthly)}/mo</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select
                value={billingCycle}
                onValueChange={(v) => {
                  setBillingCycle(v);
                  if (v === "yearly") setBillingMonths("12");
                  if (v === "monthly") setBillingMonths("1");
                }}
              >
                <SelectTrigger><SelectValue placeholder="Billing cycle" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                  <SelectItem value="custom">Custom months</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Input
                type="number"
                min={1}
                max={120}
                value={billingMonths}
                onChange={(e) => setBillingMonths(e.target.value)}
                placeholder="Months"
              />
            </div>
            <Button
              onClick={() => {
                const months = Number(billingMonths);
                assign.mutate({
                  company_id: companyId,
                  plan_code: planCode,
                  billing_cycle: billingCycle,
                  billing_months: Number.isFinite(months) && months > 0 ? months : 1,
                });
              }}
              disabled={!on || !companyId || assign.isPending}
            >
              Save assignment
            </Button>
          </div>
        </SectionCard>

        {/* Package list & management */}
        <SectionCard title="Defined subscription tiers">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as PlanFilter)} className="w-full">
            <div className="flex flex-col gap-3 border-b border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <TabsList>
                <TabsTrigger value="active">Active ({activeCount})</TabsTrigger>
                <TabsTrigger value="inactive">Inactive ({inactiveCount})</TabsTrigger>
                <TabsTrigger value="all">All ({allPlans.length})</TabsTrigger>
              </TabsList>
              <div className="w-full sm:w-64">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter packages…"
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <TabsContent value={filter} className="m-0 p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 text-xs uppercase">
                    <tr>
                      <th className="px-5 py-2 text-left">Package</th>
                      <th className="px-5 py-2 text-left">Limits</th>
                      <th className="px-5 py-2 text-left">Monthly</th>
                      <th className="px-5 py-2 text-left">Tenants</th>
                      <th className="px-5 py-2 text-left">Status</th>
                      <th className="px-5 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredPlans.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-8 text-center text-xs text-muted-foreground">
                          No packages found.
                        </td>
                      </tr>
                    ) : (
                      filteredPlans.map((p) => {
                        const assigned = p.assignment_count ?? 0;
                        const active = p.is_active !== false;
                        return (
                          <tr key={p.id ?? p.code}>
                            <td className="px-5 py-3">
                              <div className="font-medium">{p.name}</div>
                              <div className="font-mono text-[10px] text-muted-foreground">{p.code}</div>
                            </td>
                            <td className="px-5 py-3 text-xs text-muted-foreground">
                              {p.max_stores} stores · {p.max_users} users · {p.max_industry_packs} packs
                            </td>
                            <td className="px-5 py-3 font-medium">{fmtBDT(p.price_monthly)}/mo</td>
                            <td className="px-5 py-3 tabular-nums">{assigned}</td>
                            <td className="px-5 py-3">
                              <Badge variant={active ? "default" : "secondary"}>
                                {active ? "Active" : "Inactive"}
                              </Badge>
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex flex-wrap justify-end gap-1.5">
                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openEdit(p)}>
                                  Edit
                                </Button>
                                {active ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => setConfirm({ kind: "deactivate", plan: p })}
                                  >
                                    Deactivate
                                  </Button>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => setConfirm({ kind: "activate", plan: p })}
                                  >
                                    Activate
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  disabled={assigned > 0}
                                  title={assigned > 0 ? `Assigned to ${assigned} tenant(s) — deactivate instead` : "Delete package"}
                                  onClick={() => setConfirm({ kind: "delete", plan: p })}
                                >
                                  Delete
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </SectionCard>
      </PageBody>

      {/* Custom Extension Dialog */}
      <Dialog open={customExtendOpen} onOpenChange={setCustomExtendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend Subscription Validity</DialogTitle>
            <DialogDescription>
              Add validity days for {customExtendTarget?.name} ({customExtendTarget?.code}).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Number of Days to Add</Label>
              <Input
                type="number"
                min={1}
                max={3650}
                value={customExtendDays}
                onChange={(e) => setCustomExtendDays(e.target.value)}
                placeholder="e.g. 30, 60, 90"
              />
            </div>
            <div className="space-y-2">
              <Label>Admin Note (Optional)</Label>
              <Input
                value={customExtendNote}
                onChange={(e) => setCustomExtendNote(e.target.value)}
                placeholder="e.g. Promotional extension or Bank payment received"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomExtendOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!Number(customExtendDays) || extendSub.isPending}
              onClick={async () => {
                if (!customExtendTarget) return;
                await extendSub.mutateAsync({
                  companyId: customExtendTarget.id,
                  days: Number(customExtendDays),
                  note: customExtendNote || undefined,
                });
                setCustomExtendOpen(false);
              }}
            >
              Extend Validity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Payment Request Dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Payment Request</DialogTitle>
            <DialogDescription>
              Reject payment for {rejectTarget?.company_name} (TrxID: {rejectTarget?.detail?.trx_id}).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Reason for rejection (Optional)</Label>
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Invalid TrxID / Amount mismatch"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={rejectPayment.isPending}
              onClick={async () => {
                if (!rejectTarget) return;
                await rejectPayment.mutateAsync({
                  requestId: rejectTarget.id,
                  reason: rejectReason || undefined,
                });
                setRejectOpen(false);
              }}
            >
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EntityFormDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={editing ? "Edit package" : "Create package"}
        description="Subscription packages control store, user, and feature limits."
        onSubmit={submitPlan}
        isPending={createPlan.isPending || updatePlan.isPending}
        submitLabel={editing ? "Save package" : "Create package"}
      >
        <div className="space-y-4">
          {!editing ? (
            <div className="space-y-2">
              <Label>Code</Label>
              <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="growth" required />
              <p className="text-xs text-muted-foreground">Lowercase letters, digits, _ or - (immutable after create).</p>
            </div>
          ) : (
            <div className="space-y-1">
              <Label>Code</Label>
              <div className="font-mono text-sm text-muted-foreground">{form.code}</div>
            </div>
          )}
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Max stores</Label>
              <Input type="number" min={0} value={form.max_stores} onChange={(e) => setNum("max_stores", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Max counters</Label>
              <Input type="number" min={0} value={form.max_counters} onChange={(e) => setNum("max_counters", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Max users</Label>
              <Input type="number" min={0} value={form.max_users} onChange={(e) => setNum("max_users", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Max industry packs</Label>
              <Input type="number" min={0} value={form.max_industry_packs} onChange={(e) => setNum("max_industry_packs", e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Monthly price (BDT)</Label>
            <Input type="number" min={0} value={form.price_monthly} onChange={(e) => setNum("price_monthly", e.target.value)} />
          </div>
          <label className="flex items-center justify-between text-sm">
            <span>Advanced reports</span>
            <Switch checked={form.advanced_reports} onCheckedChange={(v) => setForm((f) => ({ ...f, advanced_reports: v }))} />
          </label>
          <label className="flex items-center justify-between text-sm">
            <span>Offline sync</span>
            <Switch checked={form.offline_sync} onCheckedChange={(v) => setForm((f) => ({ ...f, offline_sync: v }))} />
          </label>
          <label className="flex items-center justify-between text-sm">
            <span>API integration</span>
            <Switch checked={form.api_integration} onCheckedChange={(v) => setForm((f) => ({ ...f, api_integration: v }))} />
          </label>
          <label className="flex items-center justify-between text-sm">
            <span>Active</span>
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
          </label>
        </div>
      </EntityFormDrawer>

      <ConfirmActionDialog
        open={!!confirm}
        onOpenChange={(open) => { if (!open) setConfirm(null); }}
        title={
          confirm?.kind === "delete" ? "Delete package?"
            : confirm?.kind === "activate" ? "Activate package?"
              : confirm?.kind === "deactivate" ? "Deactivate package?"
                : confirm?.kind === "sub-status" ? `Mark subscription ${confirm.status}?`
                  : "Confirm"
        }
        description={
          confirm?.kind === "delete"
            ? `Delete "${confirm.plan.name}" permanently. This is only allowed when no tenants are assigned.`
            : confirm?.kind === "activate"
              ? `"${confirm.plan.name}" will appear in the public catalog and can be assigned.`
              : confirm?.kind === "deactivate"
                ? `"${confirm.plan.name}" will be hidden from new assignments. Existing tenants keep the plan.`
                : confirm?.kind === "sub-status"
                  ? `${confirm.tenant.name} subscription will be set to ${confirm.status}.`
                  : undefined
        }
        confirmLabel={
          confirm?.kind === "delete" ? "Delete"
            : confirm?.kind === "activate" ? "Activate"
              : confirm?.kind === "deactivate" ? "Deactivate"
                : "Confirm"
        }
        isPending={confirmPending}
        onConfirm={runConfirm}
      />
    </>
  );
}
