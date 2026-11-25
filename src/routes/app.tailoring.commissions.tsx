import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, LoadingState } from "@/components/pulse/states";
import { Coins, CheckCircle, RefreshCw } from "lucide-react";
import { useTailorCommissions, usePayTailorCommission } from "@/hooks/use-industry-backoffice";
import { isDemoMode } from "@/lib/demo-mode";
import { fmtBDT } from "@/lib/pos-data";
import { toast } from "sonner";

export const Route = createFileRoute("/app/tailoring/commissions")({
  component: CommissionsPage,
});

type CommissionRow = {
  id: string;
  tailor_name: string;
  job_id: string;
  job_amount: number;
  commission_pct: number;
  payout_amount: number;
  status: string;
  created_at?: string | null;
};

const demoCommissions: CommissionRow[] = [
  {
    id: "comm-1",
    tailor_name: "Karim Master",
    job_id: "ALT-001",
    job_amount: 120,
    commission_pct: 15.0,
    payout_amount: 18.0,
    status: "unpaid",
    created_at: new Date().toISOString(),
  },
  {
    id: "comm-2",
    tailor_name: "Salam Ustad",
    job_id: "ALT-002",
    job_amount: 850,
    commission_pct: 15.0,
    payout_amount: 127.5,
    status: "paid",
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
];

function CommissionsPage() {
  const useApi = !isDemoMode();
  const [filter, setFilter] = useState<string>("all");
  const query = useTailorCommissions(filter === "all" ? undefined : filter);
  const payMut = usePayTailorCommission();
  const [localRows, setLocalRows] = useState<CommissionRow[]>(demoCommissions);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payingCommissionId, setPayingCommissionId] = useState<string | null>(null);
  const [payoutMethod, setPayoutMethod] = useState<string>("cash");

  const rows = useMemo(() => {
    if (useApi) {
      return (query.data ?? []) as CommissionRow[];
    }
    return filter === "all" ? localRows : localRows.filter((r) => r.status === filter);
  }, [useApi, query.data, localRows, filter]);

  const handlePayClick = (id: string) => {
    setPayingCommissionId(id);
    setPayoutMethod("cash");
    setPayDialogOpen(true);
  };

  const handleConfirmPay = async () => {
    if (!payingCommissionId) return;
    if (useApi) {
      try {
        await payMut.mutateAsync({ id: payingCommissionId, method: payoutMethod });
        toast.success(`Commission paid via ${payoutMethod}`);
        query.refetch();
      } catch (err) {
        toast.error("Failed to pay commission");
      }
    } else {
      setLocalRows((prev) =>
        prev.map((r) => (r.id === payingCommissionId ? { ...r, status: "paid" } : r)),
      );
      toast.success(`Commission paid via ${payoutMethod} (Demo Mode)`);
    }
    setPayDialogOpen(false);
    setPayingCommissionId(null);
  };

  const totals = useMemo(() => {
    const data = useApi ? (query.data ?? []) : localRows;
    const unpaid = data.filter((r) => r.status === "unpaid").reduce((sum, r) => sum + r.payout_amount, 0);
    const paid = data.filter((r) => r.status === "paid").reduce((sum, r) => sum + r.payout_amount, 0);
    return { unpaid, paid };
  }, [useApi, query.data, localRows]);

  return (
    <BackOfficePage
      title="Master Tailor Commissions"
      eyebrow="Tailoring"
      subtitle="Track commission payouts per master tailor job"
      stats={[
        { label: "Unpaid Payouts", value: fmtBDT(totals.unpaid) },
        { label: "Paid Payouts", value: fmtBDT(totals.paid) },
      ]}
      actions={
        useApi ? (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        ) : undefined
      }
    >
      <div className="mb-4 flex gap-2">
        {["all", "unpaid", "paid"].map((s) => (
          <Button key={s} size="sm" variant={filter === s ? "default" : "outline"} className="capitalize" onClick={() => setFilter(s)}>
            {s}
          </Button>
        ))}
      </div>

      <SectionCard title="Commission Log">
        {useApi && query.isLoading ? (
          <LoadingState rows={3} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No commissions found"
            description="Commissions are automatically recorded when tailoring alteration jobs are completed and marked as collected."
            icon={Coins}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 text-left">Date</th>
                  <th className="px-3 py-2.5 text-left">Tailor</th>
                  <th className="px-3 py-2.5 text-left">Job Ref</th>
                  <th className="px-3 py-2.5 text-right">Job Amount</th>
                  <th className="px-3 py-2.5 text-right">Commission %</th>
                  <th className="px-3 py-2.5 text-right">Payout</th>
                  <th className="px-3 py-2.5 text-left">Status</th>
                  <th className="px-5 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-secondary/30">
                    <td className="px-5 py-3 text-muted-foreground">
                      {r.created_at ? r.created_at.slice(0, 10) : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-medium">{r.tailor_name}</span>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">{r.job_id}</td>
                    <td className="px-3 py-3 text-right tabular">{fmtBDT(r.job_amount)}</td>
                    <td className="px-3 py-3 text-right">{r.commission_pct}%</td>
                    <td className="px-3 py-3 text-right font-medium tabular text-indigo-600">
                      {fmtBDT(r.payout_amount)}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      {r.status === "unpaid" && (
                        <Button size="sm" variant="outline" className="gap-1 h-8" onClick={() => handlePayClick(r.id)} disabled={payMut.isPending}>
                          <CheckCircle className="h-3 w-3" /> Mark paid
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Mark Commission as Paid</DialogTitle>
            <DialogDescription>
              Select the payment method used to pay this tailor. This will record a corresponding payout in the accounting system.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="payout-method" className="text-right text-sm font-medium">
                Method
              </label>
              <select
                id="payout-method"
                className="col-span-3 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={payoutMethod}
                onChange={(e) => setPayoutMethod(e.target.value)}
              >
                <option value="cash">Cash - Main (1011)</option>
                <option value="bank">Bank & Card Clearing (1012)</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmPay} disabled={payMut.isPending}>
              Confirm Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </BackOfficePage>
  );
}
