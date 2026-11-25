import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, PageBody, SectionCard, StatCard } from "@/components/pulse/primitives";
import { Wallet, TrendingUp, TrendingDown, Users, Building2 } from "lucide-react";
import { useProfitLoss, useBalanceSheet, useJournalEntries, useApiCustomers, useApiSuppliers, useChartOfAccounts } from "@/hooks/use-api-config";
import { LoadingState } from "@/components/pulse/states";
import { fmtBDT } from "@/lib/pos-data";
import { todayInputDate } from "@/lib/dates";

export const Route = createFileRoute("/app/accounts/dashboard")({
  component: AccountsDashboard,
});

function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function AccountsDashboard() {
  const today = todayInputDate();
  const pnl = useProfitLoss(monthStart(), today);
  const balanceSheet = useBalanceSheet(today);
  const { data: entries = [], isLoading: entriesLoading } = useJournalEntries(10);
  const { data: customers = [] } = useApiCustomers();
  const { data: suppliers = [] } = useApiSuppliers();
  const { data: coaAccounts = [] } = useChartOfAccounts();

  const totalReceivable = customers.reduce((s, c) => s + (c.outstanding ?? 0), 0);
  const totalPayable = suppliers.reduce((s, s2) => s + (s2.outstanding ?? 0), 0);
  const cashAccounts = coaAccounts.filter(
    (a) =>
      a.account_type === "asset" &&
      (a.account_subtype === "cash" ||
        a.account_subtype === "bank" ||
        /cash|bank|petty|drawer|till|hand|clearing/i.test(a.name)),
  );
  const cashAndBankFromCoa = cashAccounts.reduce((s, a) => s + (a.balance ?? 0), 0);
  const cashAndBankFromBs =
    balanceSheet.data?.assets
      .filter((a) => /cash|bank|petty|drawer|till|hand|clearing/i.test(a.name))
      .reduce((s, a) => s + a.amount, 0) ?? 0;
  const cashAndBank = coaAccounts.length > 0 ? cashAndBankFromCoa : cashAndBankFromBs;

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Accounts Dashboard"
        subtitle="This month's revenue, cash position, and dues at a glance"
      />
      <PageBody className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Cash & bank"
            value={fmtBDT(cashAndBank)}
            icon={<Wallet className="h-4 w-4" />}
            hint="as of today"
          />
          <StatCard
            label="Net profit (MTD)"
            value={fmtBDT(pnl.data?.net_profit ?? 0)}
            icon={(pnl.data?.net_profit ?? 0) >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            hint="month to date"
          />
          <StatCard
            label="Receivable (customer dues)"
            value={fmtBDT(totalReceivable)}
            icon={<Users className="h-4 w-4" />}
            hint={`${customers.filter((c) => (c.outstanding ?? 0) > 0).length} customers`}
          />
          <StatCard
            label="Payable (supplier dues)"
            value={fmtBDT(totalPayable)}
            icon={<Building2 className="h-4 w-4" />}
            hint={`${suppliers.filter((s) => (s.outstanding ?? 0) > 0).length} suppliers`}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="Profit &amp; loss (month to date)">
            {pnl.isLoading ? <LoadingState /> : (
              <div className="space-y-2 p-5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Revenue</span><span className="font-mono">{fmtBDT(pnl.data?.total_revenue ?? 0)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Cost of goods sold</span><span className="font-mono">− {fmtBDT(pnl.data?.total_cogs ?? 0)}</span></div>
                <div className="flex justify-between border-t border-border pt-2 font-medium"><span>Gross profit</span><span className="font-mono">{fmtBDT(pnl.data?.gross_profit ?? 0)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Operating expenses</span><span className="font-mono">− {fmtBDT(pnl.data?.total_operating_expenses ?? 0)}</span></div>
                <div className="flex justify-between border-t border-border pt-2 text-base font-bold"><span>Net profit</span><span className="font-mono">{fmtBDT(pnl.data?.net_profit ?? 0)}</span></div>
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Recent activity"
            actions={<Link to="/app/accounts/ledger" className="text-xs font-medium text-primary hover:underline">View all →</Link>}
          >
            {entriesLoading ? <LoadingState /> : entries.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No transactions yet.</div>
            ) : (
              <div className="divide-y divide-border">
                {entries.map((e) => (
                  <div key={e.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium capitalize">{e.source_type.replace(/_/g, " ")}</div>
                      <div className="truncate text-xs text-muted-foreground">{e.memo || e.entry_no}</div>
                    </div>
                    <div className="shrink-0 font-mono text-xs">{fmtBDT(e.total_debit ?? 0)}</div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        <SectionCard title="Quick links">
          <div className="flex flex-wrap gap-2 p-5">
            <Link to="/app/accounts/record-payment" className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary/40">Record payment</Link>
            <Link to="/app/accounts/expenses" className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary/40">Record expense</Link>
            <Link to="/app/accounts/cash-adjustment" className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary/40">Cash adjustment</Link>
            <Link to="/app/accounts/customer-advance" className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary/40">Customer advance</Link>
            <Link to="/app/accounts/reports" className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary/40">Financial statements</Link>
          </div>
        </SectionCard>
      </PageBody>
    </>
  );
}
