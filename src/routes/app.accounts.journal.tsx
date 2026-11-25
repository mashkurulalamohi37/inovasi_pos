import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, PageBody, SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, RefreshCw, Eye, Calendar, AlertTriangle, AlertCircle, CheckCircle2, Trash2 } from "lucide-react";
import {
  useJournalEntries,
  useCreateJournalEntry,
  useChartOfAccounts,
  useApiStores,
  useAccountingSettings,
  type ApiJournalEntry,
} from "@/hooks/use-api-config";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { PermissionGate } from "@/components/pulse/gates";
import { LoadingState, ErrorState } from "@/components/pulse/states";
import { useAuth } from "@/lib/auth-provider";
import { fmtBDT } from "@/lib/pos-data";
import { todayDateRange } from "@/lib/dates";
import { toast } from "sonner";

export const Route = createFileRoute("/app/accounts/journal")({
  component: JournalEntriesPage,
});

interface JournalFormLine {
  account_id: string;
  debit: number;
  credit: number;
  store_id: string;
  memo: string;
}

function JournalEntriesPage() {
  const { data: entries = [], isLoading, isError, refetch } = useJournalEntries();
  const { data: accounts = [] } = useChartOfAccounts();
  const { data: stores = [] } = useApiStores();
  const { data: settings } = useAccountingSettings();
  const createEntryMut = useCreateJournalEntry();

  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<ApiJournalEntry | null>(null);

  // Form state
  const [entryDate, setEntryDate] = useState(() => todayDateRange().from);
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<JournalFormLine[]>([
    { account_id: "", debit: 0, credit: 0, store_id: "", memo: "" },
    { account_id: "", debit: 0, credit: 0, store_id: "", memo: "" },
  ]);

  const addLine = () => {
    setLines((l) => [...l, { account_id: "", debit: 0, credit: 0, store_id: "", memo: "" }]);
  };

  const removeLine = (idx: number) => {
    if (lines.length <= 2) {
      toast.warning("A journal entry must contain at least 2 lines");
      return;
    }
    setLines((l) => l.filter((_, i) => i !== idx));
  };

  const updateLine = (idx: number, field: keyof JournalFormLine, val: unknown) => {
    setLines((prev) => {
      const next = [...prev];
      const line = { ...next[idx] };

      if (field === "debit") {
        line.debit = Number(val) || 0;
        if (line.debit > 0) line.credit = 0; // standard double-entry helper
      } else if (field === "credit") {
        line.credit = Number(val) || 0;
        if (line.credit > 0) line.debit = 0;
      } else {
        (line as any)[field] = val;
      }

      next[idx] = line;
      return next;
    });
  };

  // Calculations
  const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;
  const readyToPost = balanced && totalDebit > 0 && lines.every((l) => l.account_id);

  // Locked date check
  const isDateLocked = settings?.books_locked_before && entryDate
    ? new Date(entryDate) < new Date(settings.books_locked_before)
    : false;

  const handleCreate = async () => {
    if (isDateLocked) {
      toast.error("Cannot post journal entry: The books are locked for the selected date.");
      return;
    }
    if (!balanced) {
      toast.error("Debits and credits must balance before posting.");
      return;
    }

    const payload = {
      entry_date: new Date(entryDate).toISOString(),
      memo: memo || undefined,
      lines: lines
        .filter((l) => l.debit > 0 || l.credit > 0)
        .map((l) => ({
          account_id: l.account_id,
          debit: l.debit,
          credit: l.credit,
          store_id: l.store_id || undefined,
          memo: l.memo || undefined,
        })),
    };

    await createEntryMut.mutateAsync(payload);
    setCreateOpen(false);
    setMemo("");
    setEntryDate(todayDateRange().from);
    setLines([
      { account_id: "", debit: 0, credit: 0, store_id: "", memo: "" },
      { account_id: "", debit: 0, credit: 0, store_id: "", memo: "" },
    ]);
    refetch();
  };

  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const getEntryTotal = (entry: ApiJournalEntry) => {
    if (entry.lines) return entry.lines.reduce((sum, l) => sum + (l.debit ?? 0), 0);
    return entry.total_debit ?? 0;
  };

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Journal Entries"
        subtitle="Record general ledger transactions, view posted journals, and manage manual ledger adjustments"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
            </Button>
            <PermissionGate perm="accounts.journal_manage">
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> New Entry
              </Button>
            </PermissionGate>
          </div>
        }
      />

      <PageBody>
        {isLoading ? (
          <LoadingState rows={8} />
        ) : (
          <SectionCard title="Posted Journal Entries">
            {entries.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No journal entries posted yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-secondary/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3.5 py-2 text-left">Entry No</th>
                      <th className="px-2.5 py-2 text-left">Date</th>
                      <th className="px-2.5 py-2 text-left">Source Type</th>
                      <th className="px-2.5 py-2 text-left">Memo</th>
                      <th className="px-2.5 py-2 text-left">Posted By</th>
                      <th className="px-2.5 py-2 text-right">Total Amount</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {entries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-3.5 py-2 font-mono text-[11px] font-medium">{entry.entry_no}</td>
                        <td className="px-2.5 py-2">
                          {entry.entry_date ? new Date(entry.entry_date).toLocaleDateString() : ""}
                        </td>
                        <td className="px-2.5 py-2">
                          <StatusBadge status={entry.source_type} />
                        </td>
                        <td className="px-2.5 py-2 text-muted-foreground truncate max-w-[200px]" title={entry.memo ?? ""}>
                          {entry.memo || "—"}
                        </td>
                        <td className="px-2.5 py-2 text-muted-foreground">{entry.created_by || "system"}</td>
                        <td className="px-2.5 py-2 text-right font-mono font-semibold tabular-nums">
                          {fmtBDT(getEntryTotal(entry))}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[11px]"
                            onClick={() => {
                              setSelectedEntry(entry);
                              setDetailOpen(true);
                            }}
                          >
                            <Eye className="h-3 w-3 mr-1" /> View details
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        )}

        {/* New Journal Entry Drawer */}
        <EntityFormDrawer
          open={createOpen}
          onOpenChange={setCreateOpen}
          title="New Journal Entry"
          onSubmit={handleCreate}
          isPending={createEntryMut.isPending}
          submitDisabled={!readyToPost || isDateLocked}
          submitLabel="Post Entry"
        >
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Entry Date</Label>
                <Input
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                />
              </div>
              <div>
                <Label>Memo / Description</Label>
                <Input
                  placeholder="Memo of transaction"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                />
              </div>
            </div>

            {isDateLocked && (
              <div className="flex gap-2 items-center bg-destructive/15 border border-destructive/20 text-destructive p-3 rounded-lg text-xs font-semibold">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>The selected date falls in a locked period (locked before {new Date(settings!.books_locked_before!).toLocaleDateString()}). Posting is disabled.</span>
              </div>
            )}

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-secondary/70">
                  <tr>
                    <th className="px-3 py-2 text-left">Account</th>
                    <th className="px-3 py-2 text-left">Store (Optional)</th>
                    <th className="px-3 py-2 text-right w-[100px]">Debit</th>
                    <th className="px-3 py-2 text-right w-[100px]">Credit</th>
                    <th className="px-3 py-2 text-left">Line Memo</th>
                    <th className="px-2 py-2 text-center w-[40px]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map((ln, idx) => (
                    <tr key={idx}>
                      <td className="p-1">
                        <select
                          className="flex h-8 w-full rounded border bg-background px-2 text-xs"
                          value={ln.account_id}
                          onChange={(e) => updateLine(idx, "account_id", e.target.value)}
                        >
                          <option value="">Select Account</option>
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              [{a.code}] {a.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-1">
                        <select
                          className="flex h-8 w-full rounded border bg-background px-2 text-xs"
                          value={ln.store_id}
                          onChange={(e) => updateLine(idx, "store_id", e.target.value)}
                        >
                          <option value="">No Store</option>
                          {stores.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-1 text-right">
                        <Input
                          type="number"
                          className="h-8 text-right text-xs"
                          value={ln.debit || ""}
                          placeholder="0.00"
                          onChange={(e) => updateLine(idx, "debit", e.target.value)}
                        />
                      </td>
                      <td className="p-1 text-right">
                        <Input
                          type="number"
                          className="h-8 text-right text-xs"
                          value={ln.credit || ""}
                          placeholder="0.00"
                          onChange={(e) => updateLine(idx, "credit", e.target.value)}
                        />
                      </td>
                      <td className="p-1">
                        <Input
                          className="h-8 text-xs"
                          placeholder="Memo"
                          value={ln.memo}
                          onChange={(e) => updateLine(idx, "memo", e.target.value)}
                        />
                      </td>
                      <td className="p-1 text-center">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                          onClick={() => removeLine(idx)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-secondary/40 font-semibold border-t">
                  <tr>
                    <td colSpan={2} className="px-3 py-2 text-right font-medium">Totals:</td>
                    <td className="px-3 py-2 text-right font-mono text-primary">{fmtBDT(totalDebit)}</td>
                    <td className="px-3 py-2 text-right font-mono text-primary">{fmtBDT(totalCredit)}</td>
                    <td colSpan={2} className="px-3 py-2">
                      {balanced ? (
                        <span className="text-success text-xs font-semibold">Balanced</span>
                      ) : (
                        <span className="text-destructive text-xs font-semibold">Unbalanced (diff: {fmtBDT(Math.abs(totalDebit - totalCredit))})</span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Live Debit vs Credit Discrepancy Banner */}
            {!balanced && (totalDebit > 0 || totalCredit > 0) && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs flex items-center justify-between gap-2 text-destructive">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    <strong>Voucher Unbalanced:</strong> Debit and Credit must match before posting.
                  </span>
                </div>
                <Badge variant="destructive" className="font-mono text-[11px] shrink-0">
                  Diff: {fmtBDT(Math.abs(totalDebit - totalCredit))} ({totalDebit > totalCredit ? "Debit > Credit" : "Credit > Debit"})
                </Badge>
              </div>
            )}
            {balanced && totalDebit > 0 && (
              <div className="rounded-lg border border-success/30 bg-success/10 p-2.5 text-xs flex items-center gap-2 text-success font-medium">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Voucher perfectly balanced at {fmtBDT(totalDebit)}</span>
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full border-dashed"
              onClick={addLine}
            >
              <Plus className="h-3 w-3 mr-1" /> Add Entry Line
            </Button>
          </div>
        </EntityFormDrawer>

        {/* Journal Entry Detail Drawer */}
        <EntityFormDrawer
          open={detailOpen}
          onOpenChange={setDetailOpen}
          title={`Journal Entry Details: ${selectedEntry?.entry_no}`}
          onSubmit={async () => setDetailOpen(false)}
          submitLabel="Close"
        >
          {selectedEntry && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-xs border bg-secondary/20 p-3 rounded-md">
                <div><span className="font-semibold text-muted-foreground block">Posted Date</span><span>{selectedEntry.entry_date ? new Date(selectedEntry.entry_date).toLocaleDateString() : ""}</span></div>
                <div><span className="font-semibold text-muted-foreground block">Source Type</span><span className="capitalize">{selectedEntry.source_type}</span></div>
                <div className="col-span-2 mt-1"><span className="font-semibold text-muted-foreground block">Memo</span><span>{selectedEntry.memo || "—"}</span></div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-secondary/70">
                    <tr>
                      <th className="px-3 py-2 text-left">Account</th>
                      <th className="px-3 py-2 text-left">Store</th>
                      <th className="px-3 py-2 text-right">Debit</th>
                      <th className="px-3 py-2 text-right">Credit</th>
                      <th className="px-3 py-2 text-left">Line Memo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-mono">
                    {(selectedEntry.lines ?? []).map((ln) => (
                      <tr key={ln.id} className="hover:bg-muted/10">
                        <td className="px-3 py-2 font-sans font-medium text-foreground">
                          [{ln.account_code}] {ln.account_name}
                        </td>
                        <td className="px-3 py-2 font-sans text-muted-foreground">
                          {stores.find((s) => s.id === ln.store_id)?.name || "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-success">
                          {ln.debit > 0 ? fmtBDT(ln.debit) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-destructive">
                          {ln.credit > 0 ? fmtBDT(ln.credit) : "—"}
                        </td>
                        <td className="px-3 py-2 font-sans text-muted-foreground">{ln.memo || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-secondary/40 font-semibold border-t">
                    <tr>
                      <td colSpan={2} className="px-3 py-2 text-right font-medium">Totals:</td>
                      <td className="px-3 py-2 text-right font-mono text-primary">{fmtBDT(getEntryTotal(selectedEntry))}</td>
                      <td className="px-3 py-2 text-right font-mono text-primary">{fmtBDT(getEntryTotal(selectedEntry))}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </EntityFormDrawer>
      </PageBody>
    </>
  );
}
