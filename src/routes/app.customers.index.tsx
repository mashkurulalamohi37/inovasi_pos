import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, PageBody, SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { PermissionGate } from "@/components/pulse/gates";
import { LoadingState, ErrorState, EmptyState } from "@/components/pulse/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, RefreshCw, Search, BookOpen, ChevronDown, ChevronRight, Mail, Phone, CreditCard, Star, MapPin, User, Banknote, Clock, Users, Briefcase, Heart } from "lucide-react";
import { fmtBDT } from "@/lib/pos-data";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useApiCustomers, useCreateCustomer, useUpdateCustomer, useDueCollection, type ApiCustomer } from "@/hooks/use-api-config";
import { useClientPagination } from "@/hooks/use-client-pagination";
import { ListPagination } from "@/components/pulse/ListPagination";
import { CustomerTypeBadge, CUSTOMER_TYPES } from "@/features/sales/CustomerPicker";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/customers/")({ component: Customers });

type FormState = {
  code: string;
  name: string;
  phone: string;
  email: string;
  customer_type: string;
  custom_discount_pct: string;
  credit_limit: string;
  preferred_size: string;
  is_active: boolean;
};

const emptyForm = (): FormState => ({
  code: "",
  name: "",
  phone: "",
  email: "",
  customer_type: "general",
  custom_discount_pct: "",
  credit_limit: "",
  preferred_size: "",
  is_active: true,
});

function CustomerExpandedRow({ c }: { c: ApiCustomer }) {
  return (
    <tr>
      <td colSpan={10} className="px-0 pb-0">
        <div className="mx-0 border-t border-b border-primary/10 bg-primary/[0.03] px-6 py-4 animate-in slide-in-from-top-1 duration-150">
          <div className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Customer Code</p>
              <p className="font-mono font-medium">{c.code}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                <Users className="h-3 w-3" /> Customer Type
              </p>
              <div className="pt-0.5">
                <CustomerTypeBadge type={c.customer_type} />
              </div>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                <Star className="h-3 w-3" /> Custom Discount
              </p>
              <div className="pt-0.5">
                {c.custom_discount_pct != null && c.custom_discount_pct > 0 ? (
                  <Badge className="bg-primary/10 text-primary border-primary/30 font-bold text-xs">
                    {c.custom_discount_pct}% VIP Override
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">Using category default</span>
                )}
              </div>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                <Phone className="h-3 w-3" /> Phone
              </p>
              <p>{c.phone ?? "—"}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                <Mail className="h-3 w-3" /> Email
              </p>
              <p>{c.email ?? "—"}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                <CreditCard className="h-3 w-3" /> Credit Limit
              </p>
              <p className="font-semibold">{c.credit_limit != null ? fmtBDT(c.credit_limit) : "—"}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                <CreditCard className="h-3 w-3" /> Outstanding
              </p>
              <p className={Math.round(c.outstanding ?? 0) >= 1 ? "font-semibold text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>
                {Math.round(c.outstanding ?? 0) >= 1 ? fmtBDT(Math.round(c.outstanding!)) : "No balance due"}
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                <Star className="h-3 w-3" /> Loyalty Points
              </p>
              <p className="font-semibold">{c.loyalty_points ? `${c.loyalty_points} pts` : "0 pts"}</p>
            </div>
            {c.preferred_size && (
              <div className="space-y-0.5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                  <User className="h-3 w-3" /> Preferred Size
                </p>
                <p>{c.preferred_size}</p>
              </div>
            )}
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Status</p>
              <StatusBadge status={c.is_active === false ? "inactive" : "active"} />
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

function Customers() {
  const useApi = shouldUseBackend();
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "employee" | "friends" | "family" | "general" | "due" | "credit">("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ApiCustomer | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Quick Due Collection state
  const [collectOpen, setCollectOpen] = useState(false);
  const [collectCustomer, setCollectCustomer] = useState<ApiCustomer | null>(null);
  const [collectAmount, setCollectAmount] = useState("");
  const [collectMethod, setCollectMethod] = useState("cash");
  const [collectRef, setCollectRef] = useState("");

  const { data, isLoading, isError, refetch, isFetching } = useApiCustomers({ q: search || undefined }, useApi);
  const createMut = useCreateCustomer();
  const updateMut = useUpdateCustomer();
  const collectDue = useDueCollection();

  const allRows = useMemo(() => data ?? [], [data]);

  const dueCount = useMemo(() => {
    return allRows.filter((c) => Math.round(c.outstanding ?? 0) >= 1).length;
  }, [allRows]);

  const filteredRows = useMemo(() => {
    if (filterMode === "due") {
      return allRows.filter((c) => Math.round(c.outstanding ?? 0) >= 1);
    }
    if (filterMode === "credit") {
      return allRows.filter((c) => c.credit_limit != null && c.credit_limit > 0);
    }
    if (["employee", "friends", "family", "general"].includes(filterMode)) {
      return allRows.filter((c) => (c.customer_type || "general").toLowerCase() === filterMode);
    }
    return allRows;
  }, [allRows, filterMode]);

  const listPage = useClientPagination(filteredRows, 10, search);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setDrawerOpen(true);
  };

  const openEdit = (c: ApiCustomer) => {
    setEditing(c);
    setForm({
      code: c.code,
      name: c.name,
      phone: c.phone ?? "",
      email: c.email ?? "",
      customer_type: c.customer_type || "general",
      custom_discount_pct: c.custom_discount_pct != null ? String(c.custom_discount_pct) : "",
      credit_limit: c.credit_limit != null ? String(c.credit_limit) : "",
      preferred_size: c.preferred_size ?? "",
      is_active: c.is_active !== false,
    });
    setDrawerOpen(true);
  };

  const openCollectDue = (c: ApiCustomer) => {
    setCollectCustomer(c);
    setCollectAmount(String(Math.round(c.outstanding ?? 0)));
    setCollectMethod("cash");
    setCollectRef("");
    setCollectOpen(true);
  };

  const handleCollectSubmit = async () => {
    const amt = Number(collectAmount);
    if (!collectCustomer || amt <= 0) return;
    try {
      await collectDue.mutateAsync({
        customer_id: collectCustomer.id,
        amount: amt,
        method: collectMethod,
        reference: collectRef || "Due collection",
      });
      toast.success(`Collected ${fmtBDT(amt)} from ${collectCustomer.name}`);
      const newOutstanding = Math.max(0, (collectCustomer.outstanding ?? 0) - amt);
      setCollectCustomer({ ...collectCustomer, outstanding: newOutstanding });
      await refetch();
      setCollectOpen(false);
      setCollectCustomer(null);
    } catch {
      toast.error("Failed to record payment");
    }
  };

  const handleSubmit = async () => {
    if (!form.code.trim() || !form.name.trim()) return;
    const customDiscNum = form.custom_discount_pct.trim() !== "" ? Number(form.custom_discount_pct) : null;
    const validCustomDisc = customDiscNum !== null && !isNaN(customDiscNum) && customDiscNum >= 0 ? customDiscNum : null;

    if (editing) {
      await updateMut.mutateAsync({
        id: editing.id,
        body: {
          name: form.name.trim(),
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          customer_type: form.customer_type,
          custom_discount_pct: validCustomDisc,
          credit_limit: form.credit_limit ? Number(form.credit_limit) : undefined,
          preferred_size: form.preferred_size.trim() || undefined,
          is_active: form.is_active,
        },
      });
    } else {
      await createMut.mutateAsync({
        code: form.code.trim(),
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        customer_type: form.customer_type,
        custom_discount_pct: validCustomDisc,
        credit_limit: form.credit_limit ? Number(form.credit_limit) : undefined,
        preferred_size: form.preferred_size.trim() || undefined,
      });
    }
    setDrawerOpen(false);
  };

  if (!useApi) {
    return (
      <>
        <PageHeader title="Customers" subtitle="Connect backend to manage customers." />
        <PageBody>
          <EmptyState title="Backend required" description="Sign in with API enabled to use customer master data." />
        </PageBody>
      </>
    );
  }

  return (
    <PermissionGate perm="customers.manage" fallback={<PageBody><ErrorState title="Permission denied" description="Requires customers.manage" /></PageBody>}>
      <PageHeader
        title="Customers"
        subtitle="Live customer master — manage accounts, credit limits, customer types, and due balances (বকেয়া খাতা)"
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button size="sm" className="gap-1.5" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" /> Add customer
            </Button>
          </>
        }
      />
      <PageBody>
        {isError && <ErrorState title="Failed to load customers" onRetry={() => refetch()} />}
        <SectionCard>
          <div className="border-b border-border p-4 flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative max-w-sm flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9 h-9" placeholder="Search name, code, phone, type…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              <button
                type="button"
                onClick={() => setFilterMode("all")}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer shrink-0",
                  filterMode === "all" ? "bg-primary text-primary-foreground shadow-xs" : "bg-secondary/40 text-muted-foreground hover:text-foreground"
                )}
              >
                All Customers ({allRows.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode("employee")}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer shrink-0 flex items-center gap-1.5",
                  filterMode === "employee" ? "bg-blue-600 text-white shadow-xs" : "bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20"
                )}
              >
                <Briefcase className="h-3 w-3" />
                <span>Employee</span>
              </button>
              <button
                type="button"
                onClick={() => setFilterMode("friends")}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer shrink-0 flex items-center gap-1.5",
                  filterMode === "friends" ? "bg-amber-600 text-white shadow-xs" : "bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
                )}
              >
                <Users className="h-3 w-3" />
                <span>Friends</span>
              </button>
              <button
                type="button"
                onClick={() => setFilterMode("family")}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer shrink-0 flex items-center gap-1.5",
                  filterMode === "family" ? "bg-emerald-600 text-white shadow-xs" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
                )}
              >
                <Heart className="h-3 w-3" />
                <span>Family</span>
              </button>
              <button
                type="button"
                onClick={() => setFilterMode("general")}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer shrink-0",
                  filterMode === "general" ? "bg-primary text-primary-foreground shadow-xs" : "bg-secondary/40 text-muted-foreground hover:text-foreground"
                )}
              >
                General
              </button>
              <button
                type="button"
                onClick={() => setFilterMode("due")}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer shrink-0 flex items-center gap-1.5",
                  filterMode === "due" ? "bg-amber-500 text-white shadow-xs" : "text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20"
                )}
              >
                <Clock className="h-3 w-3" />
                <span>Due Customers</span>
                {dueCount > 0 && (
                  <span className={cn("text-[10px] px-1.5 py-0.2 rounded-full font-bold", filterMode === "due" ? "bg-white/25 text-white" : "bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100")}>
                    {dueCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setFilterMode("credit")}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer shrink-0",
                  filterMode === "credit" ? "bg-primary text-primary-foreground shadow-xs" : "bg-secondary/40 text-muted-foreground hover:text-foreground"
                )}
              >
                Credit Limit Active
              </button>
            </div>
          </div>

          {isLoading ? (
            <LoadingState rows={5} />
          ) : filteredRows.length === 0 ? (
            <EmptyState
              title="No customers found"
              description={
                filterMode === "due"
                  ? "No customers currently have an outstanding due balance."
                  : "Create your first customer or adjust filters."
              }
            />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-8 px-3 py-2.5"></th>
                  <th className="px-3 py-2.5 text-left">Code</th>
                  <th className="px-3 py-2.5 text-left">Name</th>
                  <th className="px-3 py-2.5 text-left">Type</th>
                  <th className="px-3 py-2.5 text-center">Discount</th>
                  <th className="px-3 py-2.5 text-left">Phone</th>
                  <th className="px-3 py-2.5 text-right">Outstanding (বকেয়া)</th>
                  <th className="px-3 py-2.5 text-right">Credit Limit</th>
                  <th className="px-3 py-2.5 text-right">Status</th>
                  <th className="px-5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {listPage.pageItems.map((c) => {
                  const isExpanded = expandedId === c.id;
                  const hasDue = Math.round(c.outstanding ?? 0) >= 1;
                  return (
                    <tr
                      key={c.id}
                      className="cursor-pointer hover:bg-secondary/40 transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : c.id)}
                    >
                      <td className="px-3 py-3 text-muted-foreground">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-primary" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">{c.code}</td>
                      <td className="px-3 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          <span>{c.name}</span>
                          {hasDue && (
                            <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400">
                              Due {fmtBDT(Math.round(c.outstanding!))}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <CustomerTypeBadge type={c.customer_type} />
                      </td>
                      <td className="px-3 py-3 text-center">
                        {c.custom_discount_pct != null && c.custom_discount_pct > 0 ? (
                          <Badge className="bg-primary/10 text-primary border-primary/30 text-[10px] font-bold">
                            {c.custom_discount_pct}% Custom
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs font-mono">Type Default</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{c.phone ?? "—"}</td>
                      <td className="px-3 py-3 text-right tabular">
                        {hasDue ? (
                          <span className="font-bold text-amber-600 dark:text-amber-400">
                            {fmtBDT(Math.round(c.outstanding!))}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular">
                        {c.credit_limit != null ? fmtBDT(c.credit_limit) : "—"}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <StatusBadge status={c.is_active === false ? "inactive" : "active"} />
                      </td>
                      <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1.5">
                          {hasDue && (
                            <Button
                              size="sm"
                              variant="default"
                              className="gap-1 h-8 px-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs shadow-xs cursor-pointer"
                              onClick={() => openCollectDue(c)}
                            >
                              <Banknote className="h-3.5 w-3.5" /> Collect Due
                            </Button>
                          )}
                          <Button variant="outline" size="sm" className="gap-1.5 h-8" asChild>
                            <Link to="/app/customers/$customerId/ledger" params={{ customerId: c.id }}>
                              <BookOpen className="h-3.5 w-3.5" /> Ledger
                            </Link>
                          </Button>
                          <Button variant="outline" size="sm" className="h-8" onClick={() => openEdit(c)}>
                            Edit
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {filteredRows.length > 0 && (
            <ListPagination page={listPage.page} pageSize={listPage.pageSize} total={listPage.total} onPageChange={listPage.setPage} />
          )}
        </SectionCard>
      </PageBody>

      {/* Edit / Add Customer Drawer */}
      <EntityFormDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={editing ? "Edit customer" : "Add customer"}
        onSubmit={handleSubmit}
        isPending={createMut.isPending || updateMut.isPending}
        submitDisabled={!form.code.trim() || !form.name.trim()}
        errorMessage={((createMut.error ?? updateMut.error) as any)?.message ?? null}
      >
        <div className="space-y-3.5">
          <div>
            <Label>Code</Label>
            <Input value={form.code} disabled={!!editing} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
          </div>
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label className="mb-1.5 block">Customer Type (গ্রাহক টাইপ)</Label>
            <div className="grid grid-cols-4 gap-1.5">
              {CUSTOMER_TYPES.map((t) => {
                const isSelected = form.customer_type === t.value;
                const Icon = t.icon;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, customer_type: t.value }))}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary shadow-xs"
                        : "bg-secondary/30 text-muted-foreground hover:bg-secondary/60 border-border/60"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label>Custom Discount % (কাস্টম ডিসকাউন্ট)</Label>
              <span className="text-[10px] text-muted-foreground">Overrides category baseline</span>
            </div>
            <div className="relative mt-1">
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={form.custom_discount_pct}
                onChange={(e) => setForm((f) => ({ ...f, custom_discount_pct: e.target.value }))}
                placeholder="e.g. 15 (leave blank to use category default)"
                className="pr-7"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">%</span>
            </div>
          </div>
          <div>
            <Label>Mobile</Label>
            <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <Label>Credit limit (৳)</Label>
            <Input
              type="number"
              value={form.credit_limit}
              onChange={(e) => setForm((f) => ({ ...f, credit_limit: e.target.value }))}
              placeholder="e.g. 50000"
            />
          </div>
          <div>
            <Label>Preferred size</Label>
            <Input
              placeholder="M, 32, 9.5…"
              value={form.preferred_size}
              onChange={(e) => setForm((f) => ({ ...f, preferred_size: e.target.value }))}
            />
          </div>
          {editing && editing.loyalty_points != null && (
            <div className="flex items-center justify-between rounded-md bg-secondary/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Loyalty points</span>
              <span className="font-semibold tabular">{editing.loyalty_points}</span>
            </div>
          )}
          {editing && (
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
            </div>
          )}
        </div>
      </EntityFormDrawer>

      {/* Quick Collect Due Payment Drawer */}
      <EntityFormDrawer
        open={collectOpen}
        onOpenChange={setCollectOpen}
        title={`Collect Due — ${collectCustomer?.name ?? "Customer"}`}
        onSubmit={handleCollectSubmit}
        isPending={collectDue.isPending}
        submitDisabled={!collectCustomer || Number(collectAmount) <= 0}
      >
        <div className="space-y-4 py-1">
          <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/70 dark:border-amber-900/40 dark:bg-amber-950/20 text-xs space-y-1">
            <div className="flex justify-between text-muted-foreground">
              <span>Customer</span>
              <span className="font-semibold text-foreground">{collectCustomer?.name} ({collectCustomer?.code})</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Current Outstanding Due</span>
              <span className="font-mono font-bold text-amber-700 dark:text-amber-400 text-sm">
                {fmtBDT(Math.round(collectCustomer?.outstanding ?? 0))}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Collection Amount (জমা পরিমাণ) *</Label>
              {collectCustomer && (collectCustomer.outstanding ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={() => setCollectAmount(String(Math.round(collectCustomer.outstanding ?? 0)))}
                  className="text-[11px] text-primary hover:underline font-medium cursor-pointer"
                >
                  Pay full amount ({fmtBDT(Math.round(collectCustomer.outstanding ?? 0))})
                </button>
              )}
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">৳</span>
              <Input
                type="number"
                min={1}
                max={collectCustomer?.outstanding ?? undefined}
                value={collectAmount}
                onChange={(e) => setCollectAmount(e.target.value)}
                className="pl-7 h-10 font-mono text-base font-semibold"
                placeholder="0"
              />
            </div>
            {collectCustomer && Number(collectAmount) > 0 && (
              <p className="text-[11px] text-muted-foreground pt-0.5">
                Remaining balance after payment:{" "}
                <span className="font-semibold text-foreground">
                  {fmtBDT(Math.max(0, (collectCustomer.outstanding ?? 0) - Number(collectAmount)))}
                </span>
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold">Payment Method *</Label>
            <Select value={collectMethod} onValueChange={setCollectMethod}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="card">Card / POS</SelectItem>
                <SelectItem value="mobile">Mobile Banking (bKash/Nagad)</SelectItem>
                <SelectItem value="bank">Bank Transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold">Reference / Receipt / TrxID (optional)</Label>
            <Input
              value={collectRef}
              onChange={(e) => setCollectRef(e.target.value)}
              placeholder="e.g. Receipt #4021 or bKash TrxID"
              className="h-10 text-xs"
            />
          </div>
        </div>
      </EntityFormDrawer>
    </PermissionGate>
  );
}
