import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, PageBody, SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useJournalEntries } from "@/hooks/use-api-config";
import { LoadingState, ErrorState, EmptyState } from "@/components/pulse/states";
import { fmtBDT } from "@/lib/pos-data";

export const Route = createFileRoute("/app/accounts/ledger")({
  component: TransactionLedgerPage,
});

const SOURCE_TYPES = [
  "sale", "refund", "purchase", "supplier_payment", "due_collection", "opening_stock", "expense", "manual",
];

function TransactionLedgerPage() {
  const { data: entries = [], isLoading, isError, refetch } = useJournalEntries(500);
  const [sourceType, setSourceType] = useState("__all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (sourceType !== "__all" && e.source_type !== sourceType) return false;
      if (search && !`${e.entry_no} ${e.memo ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [entries, sourceType, search]);

  const total = filtered.reduce((s, e) => s + (e.total_debit ?? 0), 0);

  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Transaction Ledger"
        subtitle="Every posted transaction across sales, purchases, payments, and expenses, in one chronological list"
      />
      <PageBody className="space-y-5">
        <SectionCard title="Filters">
          <div className="grid gap-3 p-4 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={sourceType} onValueChange={setSourceType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">All types</SelectItem>
                  {SOURCE_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Search entry no / memo</Label>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Transactions" description={`${filtered.length} entries · total ${fmtBDT(total)}`}>
          {isLoading ? (
            <LoadingState />
          ) : filtered.length === 0 ? (
            <EmptyState title="No transactions" description="No posted transactions match these filters." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-5 py-2.5 text-left">Date</th>
                    <th className="px-3 py-2.5 text-left">Entry No</th>
                    <th className="px-3 py-2.5 text-left">Type</th>
                    <th className="px-3 py-2.5 text-left">Description</th>
                    <th className="px-5 py-2.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((e) => (
                    <tr key={e.id} className="hover:bg-secondary/30">
                      <td className="px-5 py-3 text-muted-foreground">{e.entry_date ? new Date(e.entry_date).toLocaleDateString() : "—"}</td>
                      <td className="px-3 py-3 font-mono">{e.entry_no}</td>
                      <td className="px-3 py-3"><StatusBadge status={e.source_type} /></td>
                      <td className="px-3 py-3 text-muted-foreground truncate max-w-[280px]" title={e.memo ?? ""}>{e.memo || "—"}</td>
                      <td className="px-5 py-3 text-right font-mono font-semibold">{fmtBDT(e.total_debit ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </PageBody>
    </>
  );
}
