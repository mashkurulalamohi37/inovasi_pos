import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PageBody, SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { useSubscriptionInvoices } from "@/hooks/use-api-config";
import { isDemoMode } from "@/lib/demo-mode";

export const Route = createFileRoute("/app/subscription/invoices")({ component: SubscriptionInvoicesPage });

const DEMO_INVOICES = [
  { id: "inv-1", invoice_number: "SUB-2026-001", amount: 99, status: "paid", period_start: "2026-05-01", period_end: "2026-05-31", created_at: "2026-05-01T00:00:00Z" },
  { id: "inv-2", invoice_number: "SUB-2026-002", amount: 99, status: "paid", period_start: "2026-06-01", period_end: "2026-06-30", created_at: "2026-06-01T00:00:00Z" },
];

function SubscriptionInvoicesPage() {
  const demo = isDemoMode();
  const query = useSubscriptionInvoices(!demo);
  const rows = demo ? DEMO_INVOICES : (query.data ?? []);

  return (
    <>
      <PageHeader eyebrow="Billing" title="Invoices" subtitle="Subscription billing history." />
      <PageBody>
        <SectionCard>
          {query.isLoading && !demo ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading invoices…</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No invoices yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase">
                <tr>
                  <th className="px-5 py-2 text-left">Invoice</th>
                  <th className="px-3 py-2 text-left">Period</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-5 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map(inv => (
                  <tr key={inv.id}>
                    <td className="px-5 py-3 font-mono text-xs">{inv.invoice_number}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {inv.period_start ? new Date(inv.period_start).toLocaleDateString() : "—"}
                      {inv.period_end ? ` – ${new Date(inv.period_end).toLocaleDateString()}` : ""}
                    </td>
                    <td className="px-3 py-3 text-right tabular">${inv.amount}</td>
                    <td className="px-5 py-3"><StatusBadge status={inv.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      </PageBody>
    </>
  );
}
