import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, CreditCard, RefreshCw } from "lucide-react";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingState, ErrorState, EmptyState } from "@/components/pulse/states";
import { fmtBDT } from "@/lib/pos-data";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useApiSuppliers, useSupplierLedger, useCreateSupplierPayment } from "@/hooks/use-api-config";
import { toast } from "sonner";

export const Route = createFileRoute("/app/suppliers/$supplierId/ledger")({
  component: SupplierLedgerPage,
});

function SupplierLedgerPage() {
  const { supplierId } = Route.useParams();
  const useApi = shouldUseBackend();
  const { data: suppliers, refetch: refetchSuppliers } = useApiSuppliers(useApi);
  const payMut = useCreateSupplierPayment();
  const supplier = (suppliers ?? []).find((s) => s.id === supplierId);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("bank");
  const [payRef, setPayRef] = useState("");

  const ledgerQuery = useSupplierLedger(supplierId, {
    from_date: fromDate || undefined,
    to_date: toDate || undefined,
  });

  const openPay = () => {
    const due = ledgerQuery.data?.current_outstanding ?? supplier?.outstanding ?? 0;
    setPayAmount(String(Math.round(due)));
    setPayMethod("bank");
    setPayRef("");
    setPayOpen(true);
  };

  const handlePaySubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const amt = Number(payAmount);
    if (!amt || amt <= 0) {
      toast.error("Enter a valid payment amount");
      return;
    }
    try {
      await payMut.mutateAsync({
        supplier_id: supplierId,
        amount: amt,
        method: payMethod,
        reference: payRef.trim() || undefined,
      });
      toast.success(`Payment of ${fmtBDT(amt)} recorded`);
      setPayOpen(false);
      void ledgerQuery.refetch();
      void refetchSuppliers();
    } catch (err: unknown) {
      toast.error(String((err as { detail?: string })?.detail || "Payment failed"));
    }
  };

  if (!useApi) {
    return (
      <>
        <PageHeader title="Supplier ledger" />
        <PageBody><EmptyState title="Backend required" description="Supplier ledger requires the live API." /></PageBody>
      </>
    );
  }

  const outstanding = Math.round(ledgerQuery.data?.current_outstanding ?? supplier?.outstanding ?? 0);

  return (
    <>
      <PageHeader
        title={supplier ? `${supplier.name} — Ledger` : "Supplier ledger"}
        subtitle="Running balance from invoices, payments, and returns"
        actions={
          <div className="flex items-center gap-2">
            {outstanding >= 1 && (
              <Button
                size="sm"
                className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-medium shadow-xs"
                onClick={openPay}
              >
                <CreditCard className="h-3.5 w-3.5" /> Pay Due ({fmtBDT(outstanding)})
              </Button>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link to="/app/suppliers"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Suppliers</Link>
            </Button>
          </div>
        }
      />
      <PageBody className="space-y-4">
        <SectionCard title="Filters">
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <div><Label>From</Label><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></div>
            <div><Label>To</Label><Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></div>
          </div>
        </SectionCard>

        {ledgerQuery.isLoading ? (
          <LoadingState rows={6} />
        ) : ledgerQuery.isError ? (
          <ErrorState title="Could not load ledger" onRetry={() => ledgerQuery.refetch()} />
        ) : !ledgerQuery.data ? (
          <EmptyState title="No ledger data" />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <SectionCard title="Opening balance">
                <div className="p-4 text-lg font-semibold tabular font-mono">
                  {fmtBDT(Math.round(ledgerQuery.data.opening_balance))}
                </div>
              </SectionCard>
              <SectionCard title="Closing balance">
                <div className="p-4 text-lg font-semibold tabular font-mono">
                  {fmtBDT(Math.round(ledgerQuery.data.closing_balance))}
                </div>
              </SectionCard>
              <SectionCard title="Current outstanding">
                <div className={`p-4 text-xl font-bold tabular font-mono ${outstanding >= 1 ? "text-amber-600" : "text-foreground"}`}>
                  {fmtBDT(outstanding)}
                </div>
              </SectionCard>
            </div>
            <SectionCard title="Transactions">
              {ledgerQuery.data.entries.length === 0 ? (
                <EmptyState title="No transactions" description="Invoices, payments and returns appear here." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2.5 text-left">Date</th>
                        <th className="px-3 py-2.5 text-left">Type</th>
                        <th className="px-3 py-2.5 text-left">Ref</th>
                        <th className="px-3 py-2.5 text-right">Debit</th>
                        <th className="px-3 py-2.5 text-right">Credit</th>
                        <th className="px-4 py-2.5 text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {ledgerQuery.data.entries.map((e) => (
                        <tr key={`${e.type}-${e.entity_id}-${e.at}`}>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(e.at).toLocaleString()}</td>
                          <td className="px-3 py-3 capitalize">{e.type.replace(/_/g, " ")}</td>
                          <td className="px-3 py-3 font-mono text-xs">{e.ref}</td>
                          <td className="px-3 py-3 text-right tabular font-mono">{e.debit ? fmtBDT(Math.round(e.debit)) : "—"}</td>
                          <td className="px-3 py-3 text-right tabular font-mono">{e.credit ? fmtBDT(Math.round(e.credit)) : "—"}</td>
                          <td className="px-4 py-3 text-right font-semibold tabular font-mono">{fmtBDT(Math.round(e.balance))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </>
        )}
      </PageBody>

      {/* Pay Supplier Due Drawer */}
      <EntityFormDrawer
        open={payOpen}
        onOpenChange={setPayOpen}
        title={supplier ? `Pay Due — ${supplier.name}` : "Pay Supplier Due"}
        onSubmit={handlePaySubmit}
        isPending={payMut.isPending}
        submitDisabled={!payAmount || Number(payAmount) <= 0}
        submitLabel="Confirm Payment"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-1">
            <div className="text-xs text-muted-foreground">Current Outstanding Due:</div>
            <div className="text-2xl font-bold font-mono text-amber-600">
              {fmtBDT(outstanding)}
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              Code: {supplier?.code} · {supplier?.name}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Payment Amount (৳) *</Label>
            <Input
              type="number"
              min={1}
              value={payAmount}
              onChange={e => setPayAmount(e.target.value)}
              className="text-lg font-bold font-mono h-11"
              placeholder="0"
            />
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
              <option value="mobile">Mobile Banking (bKash / Nagad)</option>
              <option value="cheque">Cheque</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Reference / Transaction ID / Remarks</Label>
            <Input
              placeholder="e.g. Bank Ref #82710 / Check #0012"
              value={payRef}
              onChange={e => setPayRef(e.target.value)}
            />
          </div>
        </div>
      </EntityFormDrawer>
    </>
  );
}
