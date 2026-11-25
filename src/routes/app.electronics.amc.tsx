import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/pulse/primitives";
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
import { Textarea } from "@/components/ui/textarea";
import { ShieldCheck, Plus, Search, AlertTriangle, Clock, RefreshCw } from "lucide-react";
import { fmtBDT } from "@/lib/pos-data";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useElectronicsAmc } from "@/hooks/use-api-config";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useCreateElectronicsAmc, useUpdateElectronicsAmc } from "@/hooks/use-industry-backoffice";
import { amcContracts, type AmcContract } from "@/lib/industry-mock";

export const Route = createFileRoute("/app/electronics/amc")({
  component: ElectronicsAmc,
});

const PAGE_SIZE = 50;

const STATUS_BADGES: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning";
  }
> = {
  active: { label: "Active", variant: "success" },
  expired: { label: "Expired", variant: "destructive" },
  pending_renewal: { label: "Pending Renewal", variant: "warning" },
  cancelled: { label: "Cancelled", variant: "secondary" },
};

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function ElectronicsAmc() {
  const useApi = shouldUseBackend();
  const [q, setQ] = useState("");
  // Radix rejects an empty-string SelectItem value, so "all" is the no-filter sentinel.
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRow, setEditRow] = useState<AmcContract | Record<string, unknown> | null>(null);

  // Form state
  const [form, setForm] = useState({
    serial_imei: "",
    customer_name: "",
    product_name: "",
    duration_months: "12",
    amount: "",
    terms: "",
    notes: "",
  });

  const statusParam = statusFilter === "all" ? undefined : statusFilter;
  // Debounced so typing a search term is one request, not one per keystroke.
  const debouncedQ = useDebouncedValue(q.trim());
  const [page, setPage] = useState(0);
  // Any filter change invalidates the current offset.
  useEffect(() => {
    setPage(0);
  }, [debouncedQ, statusParam]);
  const {
    data: apiAmc,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useElectronicsAmc({
    status: statusParam,
    q: debouncedQ || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });
  const createAmc = useCreateElectronicsAmc();
  const updateAmc = useUpdateElectronicsAmc();

  const rows: Array<AmcContract | Record<string, unknown>> = useApi
    ? ((apiAmc as Array<Record<string, unknown>>) ?? [])
    : amcContracts.filter((a) => {
        if (statusParam && a.status !== statusParam) return false;
        if (q) {
          const hay =
            `${a.amc_no} ${a.serial_imei} ${a.customer_name} ${a.product_name}`.toLowerCase();
          if (!hay.includes(q.toLowerCase())) return false;
        }
        return true;
      });

  const resetForm = () =>
    setForm({
      serial_imei: "",
      customer_name: "",
      product_name: "",
      duration_months: "12",
      amount: "",
      terms: "",
      notes: "",
    });

  const handleCreate = async () => {
    if (!form.serial_imei.trim() || !form.customer_name.trim()) {
      toast.error("Serial/IMEI and customer name required");
      return;
    }
    // Creating an AMC is backend-only. Without this the button fired a request
    // that could only fail when no backend session was available.
    if (!useApi) {
      toast.error("Sign in to create an AMC contract");
      return;
    }
    try {
      await createAmc.mutateAsync({
        ...form,
        serial_imei: form.serial_imei.trim(),
        customer_name: form.customer_name.trim(),
        amount: parseFloat(form.amount) || 0,
        duration_months: parseInt(form.duration_months, 10) || 12,
      });
      toast.success("AMC contract created");
      setDialogOpen(false);
      resetForm();
    } catch (e: unknown) {
      toast.error(
        String(
          (e as { detail?: string })?.detail ?? (e as Error)?.message ?? "Failed to create AMC",
        ),
      );
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        eyebrow="Electronics"
        title="AMC / Extended Warranty"
        subtitle="Annual Maintenance Contracts — Electronics only"
        actions={
          <Button
            onClick={() => {
              setEditRow(null);
              resetForm();
              setDialogOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="w-4 h-4" /> New AMC
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search serial, customer, product…"
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
            <SelectItem value="pending_renewal">Pending Renewal</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
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
          title="No AMC contracts found"
          description={
            q || statusParam
              ? "No contract matches the current filters."
              : "Create an AMC to start tracking extended warranty coverage."
          }
        />
      ) : (
        <SectionCard title={`${rows.length} contract${rows.length !== 1 ? "s" : ""}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border/50">
                  <th className="pb-3 pr-4 font-medium text-muted-foreground">AMC No.</th>
                  <th className="pb-3 pr-4 font-medium text-muted-foreground">Serial / IMEI</th>
                  <th className="pb-3 pr-4 font-medium text-muted-foreground">Customer</th>
                  <th className="pb-3 pr-4 font-medium text-muted-foreground">Product</th>
                  <th className="pb-3 pr-4 font-medium text-muted-foreground">Expires</th>
                  <th className="pb-3 pr-4 font-medium text-muted-foreground">Amount</th>
                  <th className="pb-3 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const amc = r as AmcContract;
                  const days = daysUntil(amc.end_date as string);
                  const expiringSoon = amc.status === "active" && days >= 0 && days <= 30;
                  return (
                    <tr
                      key={String(amc.id ?? i)}
                      tabIndex={0}
                      // No role="button": a <tr> cannot be a button without
                      // destroying the row/cell semantics screen readers rely on
                      // to announce this table. Focus + Enter/Space still work.
                      aria-label={`Open AMC contract ${String(amc.amc_no ?? "")}`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setEditRow(r);
                        }
                      }}
                      className={`border-b border-border/30 hover:bg-muted/30 cursor-pointer transition-colors focus:outline-none focus:ring-1 focus:ring-primary ${expiringSoon ? "bg-amber-50/30 dark:bg-amber-900/10" : ""}`}
                      onClick={() => setEditRow(r)}
                    >
                      <td className="py-3 pr-4 font-mono text-xs">{String(amc.amc_no ?? "—")}</td>
                      <td className="py-3 pr-4 font-mono text-xs">
                        {String(amc.serial_imei ?? "")}
                      </td>
                      <td className="py-3 pr-4">{String(amc.customer_name ?? "")}</td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {String(amc.product_name ?? "")}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`flex items-center gap-1 ${expiringSoon ? "text-amber-500 font-medium" : ""}`}
                        >
                          {expiringSoon && <Clock className="w-3 h-3" />}
                          {String(amc.end_date ?? "").slice(0, 10)}
                          {expiringSoon && <span className="text-xs">({days}d)</span>}
                        </span>
                      </td>
                      <td className="py-3 pr-4">{fmtBDT(Number(amc.amount ?? 0))}</td>
                      <td className="py-3">
                        <Badge
                          variant={STATUS_BADGES[amc.status as string]?.variant ?? "outline"}
                          className="text-xs"
                        >
                          {STATUS_BADGES[amc.status as string]?.label ?? String(amc.status)}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
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

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New AMC Contract</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Serial / IMEI *</Label>
                <Input
                  placeholder="SN-A55-00142"
                  value={form.serial_imei}
                  onChange={(e) => setForm((p) => ({ ...p, serial_imei: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Customer Name *</Label>
                <Input
                  placeholder="Customer name"
                  value={form.customer_name}
                  onChange={(e) => setForm((p) => ({ ...p, customer_name: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Product Name</Label>
              <Input
                placeholder="e.g. Galaxy A55 5G"
                value={form.product_name}
                onChange={(e) => setForm((p) => ({ ...p, product_name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Duration (months)</Label>
                <Select
                  value={form.duration_months}
                  onValueChange={(v) => setForm((p) => ({ ...p, duration_months: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[6, 12, 18, 24, 36].map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {m} months
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Amount (৳)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={form.amount}
                  onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Terms & Coverage</Label>
              <Textarea
                placeholder="Software + hardware support, 2 visits/yr…"
                rows={2}
                value={form.terms}
                onChange={(e) => setForm((p) => ({ ...p, terms: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea
                placeholder="Additional notes…"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createAmc.isPending}>
              {createAmc.isPending ? "Creating…" : "Create AMC"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit / View AMC Contract Dialog */}
      <Dialog open={!!editRow} onOpenChange={() => setEditRow(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>AMC Contract Details — {String(editRow?.amc_no ?? "")}</DialogTitle>
          </DialogHeader>
          {editRow && (
            <div className="space-y-3 py-2 text-sm">
              <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-muted/30">
                <div>
                  <p className="text-xs text-muted-foreground">Customer</p>
                  <p className="font-medium">{String(editRow.customer_name ?? "—")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Serial / IMEI</p>
                  <p className="font-mono text-xs font-medium">
                    {String(editRow.serial_imei ?? "—")}
                  </p>
                </div>
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground">Product</p>
                  <p className="font-medium">{String(editRow.product_name ?? "—")}</p>
                </div>
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground">Amount</p>
                  <p className="font-medium">{fmtBDT(Number(editRow.amount ?? 0))}</p>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select
                  value={String(editRow.status ?? "active")}
                  onValueChange={async (status) => {
                    if (useApi && editRow.id) {
                      try {
                        await updateAmc.mutateAsync({ id: String(editRow.id), body: { status } });
                        toast.success("AMC status updated");
                      } catch {
                        toast.error("Failed to update status");
                      }
                    } else {
                      editRow.status = status;
                      toast.success(`Status updated to ${status}`);
                    }
                    setEditRow({ ...editRow, status });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="pending_renewal">Pending Renewal</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {Boolean(editRow.terms) && (
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">Terms & Coverage</p>
                  <p className="text-xs p-2.5 rounded bg-muted/40 text-muted-foreground">
                    {String(editRow.terms)}
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditRow(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
