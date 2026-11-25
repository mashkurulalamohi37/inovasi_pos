import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, PageBody, SectionCard, FilterBar } from "@/components/pulse/primitives";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { PermissionGate } from "@/components/pulse/gates";
import { LoadingState, ErrorState, EmptyState } from "@/components/pulse/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Plus, RefreshCw, BookOpen, ChevronDown, ChevronRight, Mail, Phone,
  User, MapPin, Search, DollarSign, Wallet, Users, AlertCircle, CreditCard, Check
} from "lucide-react";
import { fmtBDT } from "@/lib/pos-data";
import { shouldUseBackend } from "@/lib/demo-mode";
import {
  useApiSuppliers, useCreateSupplier, useUpdateSupplier, useCreateSupplierPayment,
  type ApiSupplier
} from "@/hooks/use-api-config";
import { useClientPagination } from "@/hooks/use-client-pagination";
import { ListPagination } from "@/components/pulse/ListPagination";
import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/suppliers/")({ component: Suppliers });

type FormState = { code: string; name: string; phone: string; email: string; contact_person: string; address: string; is_active: boolean };
const emptyForm = (): FormState => ({ code: "", name: "", phone: "", email: "", contact_person: "", address: "", is_active: true });

function SupplierExpandedRow({ s }: { s: ApiSupplier }) {
  return (
    <tr>
      <td colSpan={7} className="px-0 pb-0">
        <div className="mx-0 border-t border-b border-primary/10 bg-primary/[0.03] px-6 py-4 animate-in slide-in-from-top-1 duration-150">
          <div className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Supplier Code</p>
              <p className="font-mono font-medium">{s.code}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> Phone</p>
              <p>{s.phone ?? "—"}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" /> Email</p>
              <p>{s.email ?? "—"}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" /> Contact Person</p>
              <p>{s.contact_person ?? "—"}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> Address</p>
              <p>{s.address ?? "—"}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Outstanding Balance</p>
              <p className={(s.outstanding ?? 0) >= 1 ? "font-semibold text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>
                {(s.outstanding ?? 0) >= 1 ? fmtBDT(Math.round(s.outstanding!)) : "No balance due"}
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Status</p>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s.is_active !== false ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-secondary text-muted-foreground"}`}>
                {s.is_active !== false ? "Active" : "Inactive"}
              </span>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

function Suppliers() {
  const useApi = shouldUseBackend();
  const { data, isLoading, isError, refetch, isFetching } = useApiSuppliers(useApi);
  const createMut = useCreateSupplier();
  const updateMut = useUpdateSupplier();
  const payMut = useCreateSupplierPayment();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ApiSupplier | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Search & Khata Filter
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "due">("all");

  // Pay Due Modal State
  const [payDrawerOpen, setPayDrawerOpen] = useState(false);
  const [payingSupplier, setPayingSupplier] = useState<ApiSupplier | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("bank");
  const [payRef, setPayRef] = useState("");

  const rawRows: ApiSupplier[] = data ?? [];

  // Metrics
  const metrics = useMemo(() => {
    let totalDue = 0;
    let dueCount = 0;
    for (const s of rawRows) {
      const bal = s.outstanding ?? 0;
      if (bal >= 1) {
        totalDue += bal;
        dueCount++;
      }
    }
    return {
      totalSuppliers: rawRows.length,
      dueCount,
      totalDue: Math.round(totalDue),
    };
  }, [rawRows]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    let result = rawRows;
    if (filterMode === "due") {
      result = result.filter(s => (s.outstanding ?? 0) >= 1);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.phone && s.phone.toLowerCase().includes(q)) ||
        (s.contact_person && s.contact_person.toLowerCase().includes(q))
      );
    }
    return result;
  }, [rawRows, filterMode, search]);

  const listPage = useClientPagination(filteredRows, 10);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setDrawerOpen(true); };
  const openEdit = (s: ApiSupplier) => {
    setEditing(s);
    setForm({
      code: s.code, name: s.name, phone: s.phone ?? "", email: s.email ?? "",
      contact_person: s.contact_person ?? "", address: s.address ?? "", is_active: s.is_active !== false,
    });
    setDrawerOpen(true);
  };

  const openPayDue = (s: ApiSupplier) => {
    setPayingSupplier(s);
    setPayAmount(String(Math.round(s.outstanding ?? 0)));
    setPayMethod("bank");
    setPayRef("");
    setPayDrawerOpen(true);
  };

  const handleSubmitPayDue = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!payingSupplier) return;
    const amt = Number(payAmount);
    if (!amt || amt <= 0) {
      toast.error("Please enter a valid payment amount");
      return;
    }
    if (amt > (payingSupplier.outstanding ?? 0)) {
      toast.error("Payment amount cannot exceed the outstanding due");
      return;
    }
    try {
      await payMut.mutateAsync({
        supplier_id: payingSupplier.id,
        amount: amt,
        method: payMethod,
        reference: payRef.trim() || undefined,
      });
      toast.success(`Payment of ${fmtBDT(amt)} recorded for ${payingSupplier.name}`);
      // Optimistically update the paying supplier's outstanding so
      // the drawer reflects the new balance before refetch completes
      const newOutstanding = Math.max(0, (payingSupplier.outstanding ?? 0) - amt);
      setPayingSupplier({ ...payingSupplier, outstanding: newOutstanding });
      // Await refetch so the table updates before drawer closes
      await refetch();
      setPayDrawerOpen(false);
      setPayingSupplier(null);
    } catch (err: unknown) {
      toast.error(String((err as { detail?: string })?.detail || "Failed to record payment"));
    }
  };

  const handleSubmit = async () => {
    if (!form.code.trim() || !form.name.trim()) return;
    const body = {
      name: form.name.trim(), phone: form.phone.trim() || undefined, email: form.email.trim() || undefined,
      contact_person: form.contact_person.trim() || undefined, address: form.address.trim() || undefined,
      ...(editing ? { is_active: form.is_active } : {}),
    };
    if (editing) await updateMut.mutateAsync({ id: editing.id, body });
    else await createMut.mutateAsync({ code: form.code.trim(), name: form.name.trim(), phone: body.phone, email: body.email, contact_person: body.contact_person, address: body.address });
    setDrawerOpen(false);
  };

  if (!useApi) {
    return (
      <>
        <PageHeader title="Suppliers" subtitle="Connect backend to manage suppliers." />
        <PageBody><EmptyState title="Backend required" description="Sign in with API enabled." /></PageBody>
      </>
    );
  }

  return (
    <PermissionGate perm="suppliers.manage" fallback={<PageBody><ErrorState title="Permission denied" description="Requires suppliers.manage" /></PageBody>}>
      <PageHeader title="Suppliers" subtitle="Vendor master with ledger and payable due management"
        actions={<>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh</Button>
          <Button size="sm" className="gap-1.5" onClick={openCreate}><Plus className="h-3.5 w-3.5" /> Add supplier</Button>
        </>}
      />
      <PageBody className="space-y-4">
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-card p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium uppercase tracking-wider">Total Suppliers</span>
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div className="text-2xl font-bold font-mono">{metrics.totalSuppliers}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium uppercase tracking-wider">Due Suppliers (বকেয়া খাতা)</span>
              <AlertCircle className="h-4 w-4 text-amber-600" />
            </div>
            <div className="text-2xl font-bold font-mono text-amber-600">{metrics.dueCount}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium uppercase tracking-wider">Total Payable Due (মোট দেনা)</span>
              <DollarSign className="h-4 w-4 text-rose-600" />
            </div>
            <div className="text-2xl font-bold font-mono text-rose-600">{fmtBDT(metrics.totalDue)}</div>
          </div>
        </div>

        {isError && <ErrorState title="Failed to load suppliers" onRetry={() => refetch()} />}

        <SectionCard>
          <FilterBar>
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search suppliers by name, code, phone…"
                className="h-9 pl-9"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Button
              variant={filterMode === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterMode("all")}
            >
              All Suppliers ({rawRows.length})
            </Button>
            <Button
              variant={filterMode === "due" ? "default" : "outline"}
              size="sm"
              className={filterMode === "due" ? "bg-amber-600 hover:bg-amber-700 text-white" : "border-amber-500/40 text-amber-700 dark:text-amber-400"}
              onClick={() => setFilterMode("due")}
            >
              <Wallet className="mr-1.5 h-3.5 w-3.5" />
              Due Suppliers (দেনা খাতা)
              {metrics.dueCount > 0 && (
                <Badge className="ml-1.5 px-1.5 py-0 text-[10px] bg-white text-amber-700 font-bold">
                  {metrics.dueCount}
                </Badge>
              )}
            </Button>
          </FilterBar>

          {isLoading ? <LoadingState rows={5} /> : filteredRows.length === 0 ? (
            <EmptyState
              title={filterMode === "due" ? "No suppliers with open due" : "No suppliers found"}
              description={filterMode === "due" ? "All supplier balances are fully settled." : "Add a supplier or adjust search query."}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-8 px-3 py-2.5"></th>
                    <th className="px-3 py-2.5 text-left">Code</th>
                    <th className="px-3 py-2.5 text-left">Supplier Name</th>
                    <th className="px-3 py-2.5 text-left">Phone</th>
                    <th className="px-3 py-2.5 text-left">Contact Person</th>
                    <th className="px-3 py-2.5 text-right">Payable Due</th>
                    <th className="px-5 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {listPage.pageItems.map((s) => {
                    const isExpanded = expandedId === s.id;
                    const dueAmt = s.outstanding ?? 0;
                    const hasDue = dueAmt >= 1;

                    return (
                      <Fragment key={s.id}>
                        <tr
                          className="cursor-pointer hover:bg-secondary/40 transition-colors"
                          onClick={() => setExpandedId(isExpanded ? null : s.id)}
                        >
                          <td className="px-3 py-3 text-muted-foreground">
                            {isExpanded
                              ? <ChevronDown className="h-4 w-4 text-primary" />
                              : <ChevronRight className="h-4 w-4" />}
                          </td>
                          <td className="px-3 py-3 font-mono text-xs font-medium">{s.code}</td>
                          <td className="px-3 py-3 font-medium text-foreground">
                            {s.name}
                            {hasDue && (
                              <Badge variant="outline" className="ml-2 bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 text-[10px] py-0 px-1.5">
                                Due
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-3 text-muted-foreground">{s.phone ?? "—"}</td>
                          <td className="px-3 py-3 text-muted-foreground">{s.contact_person ?? "—"}</td>
                          <td className="px-3 py-3 text-right tabular font-mono font-semibold">
                            {hasDue ? (
                              <span className="text-amber-600 dark:text-amber-400">{fmtBDT(Math.round(dueAmt))}</span>
                            ) : (
                              <span className="text-muted-foreground text-xs font-normal">Paid (৳0)</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end items-center gap-1.5">
                              {hasDue && (
                                <Button
                                  size="sm"
                                  className="h-8 px-2.5 gap-1 bg-amber-600 hover:bg-amber-700 text-white shadow-xs font-medium text-xs cursor-pointer"
                                  onClick={() => openPayDue(s)}
                                >
                                  <CreditCard className="h-3.5 w-3.5" /> Pay Due
                                </Button>
                              )}
                              <Button variant="outline" size="sm" className="h-8 px-2.5 gap-1" asChild>
                                <Link to="/app/suppliers/$supplierId/ledger" params={{ supplierId: s.id }}>
                                  <BookOpen className="h-3.5 w-3.5" /> Ledger
                                </Link>
                              </Button>
                              <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => openEdit(s)}>Edit</Button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <SupplierExpandedRow key={`${s.id}-exp`} s={s} />
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {filteredRows.length > 0 && (
            <ListPagination page={listPage.page} pageSize={listPage.pageSize} total={listPage.total} onPageChange={listPage.setPage} />
          )}
        </SectionCard>
      </PageBody>

      {/* Add / Edit Supplier Drawer */}
      <EntityFormDrawer open={drawerOpen} onOpenChange={setDrawerOpen} title={editing ? "Edit supplier" : "Add supplier"} onSubmit={handleSubmit}
        isPending={createMut.isPending || updateMut.isPending} submitDisabled={!form.code.trim() || !form.name.trim()}
        errorMessage={createMut.error ? String(createMut.error) : updateMut.error ? String(updateMut.error) : null}>
        <div className="space-y-3">
          <div><Label>Code *</Label><Input value={form.code} disabled={!!editing} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} /></div>
          <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
          <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
          <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
          <div><Label>Contact person</Label><Input value={form.contact_person} onChange={(e) => setForm((f) => ({ ...f, contact_person: e.target.value }))} /></div>
          <div><Label>Address</Label><Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} /></div>
          {editing && <div className="flex items-center justify-between"><Label>Active</Label><Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} /></div>}
        </div>
      </EntityFormDrawer>

      {/* Pay Supplier Due Drawer */}
      <EntityFormDrawer
        open={payDrawerOpen}
        onOpenChange={setPayDrawerOpen}
        title={payingSupplier ? `Pay Due — ${payingSupplier.name}` : "Pay Supplier Due"}
        onSubmit={handleSubmitPayDue}
        isPending={payMut.isPending}
        submitDisabled={!payAmount || Number(payAmount) <= 0 || Number(payAmount) > (payingSupplier?.outstanding ?? 0)}
        submitLabel="Confirm Payment (পরিশোধ)"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-1">
            <div className="text-xs text-muted-foreground">Supplier Outstanding Due:</div>
            <div className="text-2xl font-bold font-mono text-amber-600">
              {fmtBDT(Math.round(payingSupplier?.outstanding ?? 0))}
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              Code: {payingSupplier?.code} · {payingSupplier?.phone || "No phone"}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Payment Amount (৳) *</Label>
              <button
                type="button"
                className="text-xs text-primary hover:underline font-medium"
                onClick={() => setPayAmount(String(Math.round(payingSupplier?.outstanding ?? 0)))}
              >
                Pay full amount
              </button>
            </div>
            <Input
              type="number"
              min={1}
              max={payingSupplier?.outstanding ?? undefined}
              value={payAmount}
              onChange={e => setPayAmount(e.target.value)}
              className="text-lg font-bold font-mono h-11"
              placeholder="0"
            />
            {/* Live remaining balance */}
            {Number(payAmount) > 0 && (
              <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold mt-1 ${
                Number(payAmount) >= (payingSupplier?.outstanding ?? 0)
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                  : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
              }`}>
                <span>
                  {Number(payAmount) >= (payingSupplier?.outstanding ?? 0)
                    ? "✓ Fully settled"
                    : "Remaining balance after payment"}
                </span>
                <span className="font-mono">
                  {Number(payAmount) >= (payingSupplier?.outstanding ?? 0)
                    ? fmtBDT(0)
                    : fmtBDT(Math.round((payingSupplier?.outstanding ?? 0) - Number(payAmount)))}
                </span>
              </div>
            )}
            {Number(payAmount) > (payingSupplier?.outstanding ?? 0) && (
              <p className="text-xs text-destructive mt-1">Amount exceeds outstanding due</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Payment Method *</Label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium"
              value={payMethod}
              onChange={e => setPayMethod(e.target.value)}
            >
              <option value="bank">Bank Transfer</option>
              <option value="cash">Cash</option>
              <option value="mobile">Mobile Banking (bKash / Nagad / Rocket)</option>
              <option value="cheque">Cheque</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Reference / Transaction ID / Remarks</Label>
            <Input
              placeholder="e.g. Bank slip #48921 / bKash TrxID"
              value={payRef}
              onChange={e => setPayRef(e.target.value)}
            />
          </div>
        </div>
      </EntityFormDrawer>
    </PermissionGate>
  );
}
