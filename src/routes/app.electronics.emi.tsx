import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader, StatCard } from "@/components/pulse/primitives";
import { Pager } from "@/components/pulse/Pager";
import { LoadingState, ErrorState, EmptyState } from "@/components/pulse/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  CreditCard,
  Search,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  TrendingDown,
} from "lucide-react";
import { fmtBDT } from "@/lib/pos-data";
import { shouldUseBackend } from "@/lib/demo-mode";
import {
  useElectronicsEmi,
  useElectronicsEmiSchedule,
  useElectronicsDashboard,
} from "@/hooks/use-api-config";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useCollectEmiInstallment } from "@/hooks/use-industry-backoffice";
import { emiSchedules, type EmiSchedule, type EmiInstallment } from "@/lib/industry-mock";

export const Route = createFileRoute("/app/electronics/emi")({
  component: ElectronicsEmiPage,
});

const PAGE_SIZE = 50;

const EMI_STATUS_BADGE: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning";
  }
> = {
  active: { label: "Active", variant: "success" },
  completed: { label: "Completed", variant: "secondary" },
  overdue: { label: "Overdue", variant: "warning" },
  defaulted: { label: "Defaulted", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "secondary" },
};

const INSTALLMENT_BADGE: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning";
  }
> = {
  paid: { label: "Paid", variant: "success" },
  pending: { label: "Pending", variant: "outline" },
  overdue: { label: "Overdue", variant: "destructive" },
  waived: { label: "Waived", variant: "secondary" },
};

function InstallmentRow({
  inst,
  emiId,
  onCollect,
}: {
  inst: EmiInstallment | Record<string, unknown>;
  emiId: string;
  onCollect: (installmentId: string) => void;
}) {
  const i = inst as EmiInstallment;
  return (
    <div
      className={`flex min-w-[34rem] items-center justify-between px-4 py-2.5 rounded-lg text-sm border ${i.status === "overdue" ? "border-rose-300/50 bg-rose-50/30 dark:bg-rose-900/10" : "border-border/30 bg-muted/20"}`}
    >
      <span className="font-mono text-muted-foreground w-6">#{i.installment_no}</span>
      <span className="text-muted-foreground flex-1 pl-3">
        {String(i.due_date ?? "").slice(0, 10)}
      </span>
      <span className="font-medium w-24 text-right">{fmtBDT(i.amount)}</span>
      <span className="w-24 text-right text-muted-foreground text-xs">
        {i.paid_date ? String(i.paid_date).slice(0, 10) : "—"}
      </span>
      <div className="w-24 flex justify-end">
        <Badge variant={INSTALLMENT_BADGE[i.status]?.variant ?? "outline"} className="text-xs">
          {INSTALLMENT_BADGE[i.status]?.label ?? i.status}
        </Badge>
      </div>
      <div className="w-24 flex justify-end">
        {(i.status === "pending" || i.status === "overdue") && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onCollect(i.id)}
          >
            Collect
          </Button>
        )}
      </div>
    </div>
  );
}

function EmiCard({
  emi,
  useApi,
  onCollect,
}: {
  emi: EmiSchedule | Record<string, unknown>;
  useApi: boolean;
  onCollect: (emiId: string, installmentId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const e = emi as EmiSchedule;
  // The list endpoint carries aggregate counts but not the installment rows, so
  // the schedule is fetched per agreement the first time the card is expanded.
  // Without this the API-mode card rendered an empty table with no Collect button.
  const schedule = useElectronicsEmiSchedule(useApi && open ? String(e.id) : null);
  const apiInstallments = (schedule.data?.installments as EmiInstallment[] | undefined) ?? [];
  const installments: EmiInstallment[] = useApi ? apiInstallments : (e.installments ?? []);
  const collected = e.total_collected ?? 0;
  const payable = e.total_payable ?? 0;
  const pct = payable > 0 ? Math.min(100, Math.round((collected / payable) * 100)) : 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="border border-border/50 rounded-xl overflow-hidden">
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-3">
              {open ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {String(e.emi_no ?? "")}
                  </span>
                  <Badge
                    variant={EMI_STATUS_BADGE[e.status as string]?.variant ?? "outline"}
                    className="text-xs"
                  >
                    {EMI_STATUS_BADGE[e.status as string]?.label ?? String(e.status)}
                  </Badge>
                </div>
                <p className="font-medium text-sm mt-0.5">{String(e.customer_name ?? "")}</p>
                <p className="text-xs text-muted-foreground">
                  {String(e.product_name ?? "")} · {String(e.serial_imei ?? "")}
                </p>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-6 text-sm">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Bank</p>
                <p className="font-medium">{String(e.bank_financier ?? "")}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Tenure</p>
                <p className="font-medium">{e.tenure_months}mo</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Monthly</p>
                <p className="font-medium">{fmtBDT(e.monthly_amount)}</p>
              </div>
              <div className="text-right min-w-32">
                <p className="text-xs text-muted-foreground">Progress</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="h-1.5 rounded-full bg-muted flex-1 overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-medium">{pct}%</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {fmtBDT(collected)} / {fmtBDT(payable)}
                </p>
              </div>
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-border/30 p-4">
            {/* Summary row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[
                { label: "Principal", value: fmtBDT(e.principal_amount) },
                { label: "Down payment", value: fmtBDT(e.down_payment) },
                { label: "Processing fee", value: fmtBDT(e.processing_fee) },
                {
                  label: "Interest rate",
                  value: e.interest_rate === 0 ? "0% EMI" : `${e.interest_rate}% p.a.`,
                },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg bg-muted/30 p-2.5">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="font-medium text-sm">{value}</p>
                </div>
              ))}
            </div>

            {/* Installment table. The fixed-width columns total ~450px, so the
                whole block scrolls horizontally on a phone rather than crushing
                the page. */}
            <div className="space-y-1.5 overflow-x-auto">
              <div className="flex min-w-[34rem] items-center justify-between px-4 pb-1 text-xs font-medium text-muted-foreground">
                <span className="w-6">#</span>
                <span className="flex-1 pl-3">Due Date</span>
                <span className="w-24 text-right">Amount</span>
                <span className="w-24 text-right">Paid Date</span>
                <span className="w-24 text-right">Status</span>
                <span className="w-24 text-right">Action</span>
              </div>
              {useApi && schedule.isLoading && (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Loading schedule…
                </p>
              )}
              {useApi && schedule.isError && (
                <p className="px-4 py-6 text-center text-sm text-destructive">
                  Could not load the installment schedule.{" "}
                  <button className="underline" onClick={() => schedule.refetch()}>
                    Retry
                  </button>
                </p>
              )}
              {!schedule.isLoading && !schedule.isError && installments.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No installments on this agreement.
                </p>
              )}
              {installments.map((inst) => (
                <InstallmentRow
                  key={inst.id}
                  inst={inst}
                  emiId={String(e.id)}
                  onCollect={(instId) => onCollect(String(e.id), instId)}
                />
              ))}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function ElectronicsEmiPage() {
  const useApi = shouldUseBackend();
  const [q, setQ] = useState("");
  // Radix rejects an empty-string SelectItem value, so "all" is the no-filter sentinel.
  const [statusFilter, setStatusFilter] = useState("all");
  const [collectDialog, setCollectDialog] = useState<{
    emiId: string;
    installmentId: string;
  } | null>(null);
  const [collectForm, setCollectForm] = useState({ payment_method: "cash", reference_no: "" });

  const statusParam = statusFilter === "all" ? undefined : statusFilter;
  // Debounced so typing a search term is one request, not one per keystroke.
  const debouncedQ = useDebouncedValue(q.trim());
  const [page, setPage] = useState(0);
  // Any filter change invalidates the current offset — without this, narrowing a
  // search while on page 3 asks for rows 150+ of a result set that may have 2.
  useEffect(() => {
    setPage(0);
  }, [debouncedQ, statusParam]);
  const {
    data: apiEmi,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useElectronicsEmi({
    status: statusParam,
    q: debouncedQ || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });
  // Company-wide EMI aggregates for the KPI row (the list itself is paged).
  const dashboard = useElectronicsDashboard();
  const collectMutation = useCollectEmiInstallment();

  const rows: Array<EmiSchedule | Record<string, unknown>> = useApi
    ? ((apiEmi as Array<Record<string, unknown>>) ?? [])
    : emiSchedules.filter((e) => {
        if (statusParam && e.status !== statusParam) return false;
        if (q) {
          const hay =
            `${e.emi_no} ${e.customer_name} ${e.serial_imei ?? ""} ${e.invoice_number ?? ""}`.toLowerCase();
          if (!hay.includes(q.toLowerCase())) return false;
        }
        return true;
      });

  // KPIs are company-wide, not page-scoped. Deriving them from `rows` would have
  // silently reported the current page's totals as the whole book once the list
  // became paginated. Outstanding counts only agreements still being repaid —
  // cancelled and defaulted balances are not collectable.
  const OUTSTANDING_STATUSES = new Set(["active", "overdue"]);
  const totalOutstanding = useApi
    ? Number(dashboard.data?.emi_outstanding ?? 0)
    : emiSchedules.reduce(
        (s, e) =>
          OUTSTANDING_STATUSES.has(String(e.status))
            ? s + Math.max(0, (e.total_payable ?? 0) - (e.total_collected ?? 0))
            : s,
        0,
      );
  const overdueCount = useApi
    ? Number(dashboard.data?.emi_overdue_count ?? 0)
    : emiSchedules.reduce(
        (s, e) => s + (e.installments ?? []).filter((i) => i.status === "overdue").length,
        0,
      );
  const activeCount = useApi
    ? Number(dashboard.data?.active_emi_count ?? 0)
    : emiSchedules.filter((e) => e.status === "active").length;

  const handleCollect = async () => {
    if (!collectDialog) return;
    if (useApi) {
      try {
        await collectMutation.mutateAsync({
          emiId: collectDialog.emiId,
          installmentId: collectDialog.installmentId,
          body: collectForm,
        });
        toast.success("Installment collected");
        setCollectDialog(null);
      } catch (e: unknown) {
        toast.error((e as Error).message ?? "Failed to collect installment");
      }
    } else {
      // Demo mode: update local state in emiSchedules
      const targetEmi = emiSchedules.find((e) => e.id === collectDialog.emiId);
      if (targetEmi) {
        const inst = targetEmi.installments.find((i) => i.id === collectDialog.installmentId);
        if (inst) {
          inst.status = "paid";
          inst.paid_date = new Date().toISOString().slice(0, 10);
          inst.paid_amount = inst.amount;
          inst.payment_method = collectForm.payment_method;
          targetEmi.total_collected = Math.min(
            targetEmi.total_payable,
            targetEmi.total_collected + inst.amount,
          );
          if (targetEmi.total_collected >= targetEmi.total_payable) {
            targetEmi.status = "completed";
          }
        }
      }
      toast.success("Installment marked as paid (Demo mode)");
      setCollectDialog(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        eyebrow="Electronics"
        title="EMI Schedules"
        subtitle="Installment payment management — Electronics only"
      />
      {/* Stated explicitly: these are company-wide, while the list below is paged. */}

      {/* KPI summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total outstanding"
          value={fmtBDT(totalOutstanding)}
          icon={<TrendingDown className="w-5 h-5 text-violet-400" />}
        />
        <StatCard
          label="Overdue installments"
          value={String(overdueCount)}
          icon={<AlertTriangle className="w-5 h-5 text-rose-400" />}
          hint={overdueCount > 0 ? "Action required" : undefined}
        />
        <StatCard
          label="Active agreements"
          value={String(activeCount)}
          icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search customer, serial, EMI no…"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="defaulted">Defaulted</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        {useApi && (
          <Button variant="ghost" size="icon" onClick={() => refetch()} title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Header and filters stay mounted while data loads — replacing the whole
          page on every refetch discarded the user's typed search. */}
      {useApi && isLoading ? (
        <LoadingState />
      ) : useApi && isError ? (
        <ErrorState onRetry={refetch} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No EMI agreements found"
          description={
            q || statusParam
              ? "No agreement matches the current filters."
              : "EMI agreements created at the POS appear here."
          }
        />
      ) : (
        <div className="space-y-3">
          {rows.map((emi, i) => (
            <EmiCard
              key={String((emi as EmiSchedule).id ?? i)}
              emi={emi}
              useApi={useApi}
              onCollect={(emiId, installmentId) => {
                // Cleared per installment — the reference number from the last
                // collection was otherwise pre-filled onto the next one.
                setCollectForm({ payment_method: "cash", reference_no: "" });
                setCollectDialog({ emiId, installmentId });
              }}
            />
          ))}
        </div>
      )}

      {useApi && (
        <Pager
          page={page}
          pageSize={PAGE_SIZE}
          count={rows.length}
          onPageChange={setPage}
          isFetching={isFetching}
        />
      )}

      {/* Collect dialog */}
      <Dialog open={!!collectDialog} onOpenChange={() => setCollectDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Collect Installment</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1">
              <Label>Payment Method</Label>
              <Select
                value={collectForm.payment_method}
                onValueChange={(v) => setCollectForm((p) => ({ ...p, payment_method: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="mobile">Mobile Banking</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Reference No.</Label>
              <Input
                placeholder="Transaction ref / receipt no"
                value={collectForm.reference_no}
                onChange={(e) => setCollectForm((p) => ({ ...p, reference_no: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCollectDialog(null)}>
              Cancel
            </Button>
            <Button onClick={handleCollect} disabled={collectMutation.isPending}>
              {collectMutation.isPending ? "Saving…" : "Mark as Paid"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
