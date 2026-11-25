import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingState, ErrorState, EmptyState } from "@/components/pulse/states";
import { fmtBDT } from "@/lib/pos-data";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useApiCustomers, useCustomerLedger } from "@/hooks/use-api-config";

export const Route = createFileRoute("/app/customers/$customerId/ledger")({
  component: CustomerLedgerPage,
});

function CustomerLedgerPage() {
  const { customerId } = Route.useParams();
  const useApi = shouldUseBackend();
  const { data: customers } = useApiCustomers(undefined, useApi);
  const customer = (customers ?? []).find((c) => c.id === customerId);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const ledgerQuery = useCustomerLedger(customerId, {
    from_date: fromDate || undefined,
    to_date: toDate || undefined,
  });

  if (!useApi) {
    return (
      <>
        <PageHeader title="Customer ledger" />
        <PageBody><EmptyState title="Backend required" description="Customer ledger requires the live API." /></PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={customer ? `${customer.name} — Ledger` : "Customer ledger"}
        subtitle="Running balance from sales, collections, returns and refunds"
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/app/customers"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Customers</Link>
          </Button>
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
              <SectionCard title="Opening balance"><div className="p-4 text-lg font-semibold tabular-nums">{fmtBDT(ledgerQuery.data.opening_balance)}</div></SectionCard>
              <SectionCard title="Closing balance"><div className="p-4 text-lg font-semibold tabular-nums">{fmtBDT(ledgerQuery.data.closing_balance)}</div></SectionCard>
              <SectionCard title="Current outstanding"><div className="p-4 text-lg font-semibold tabular-nums">{fmtBDT(ledgerQuery.data.current_outstanding)}</div></SectionCard>
            </div>
            <SectionCard title="Transactions">
              {ledgerQuery.data.entries.length === 0 ? (
                <EmptyState title="No transactions" description="Sales, collections and returns appear here." />
              ) : (
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
                        <td className="px-4 py-3 text-muted-foreground">{new Date(e.at).toLocaleString()}</td>
                        <td className="px-3 py-3 capitalize">{e.type.replace(/_/g, " ")}</td>
                        <td className="px-3 py-3 font-mono text-xs">{e.ref}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{e.debit ? fmtBDT(e.debit) : "—"}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{e.credit ? fmtBDT(e.credit) : "—"}</td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">{fmtBDT(e.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </SectionCard>
          </>
        )}
      </PageBody>
    </>
  );
}
