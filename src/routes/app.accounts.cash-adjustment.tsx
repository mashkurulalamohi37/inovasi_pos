import { createFileRoute, useNavigate } from "@tanstack/react-router";
import React, { useEffect, useMemo, useState } from "react";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Repeat,
  ArrowUpCircle,
  ArrowDownCircle,
  ArrowLeft,
  RefreshCw,
  Printer,
  Download,
  Coins,
  TrendingUp,
  TrendingDown,
  Tag,
  Sparkles,
  CheckCircle2,
  Trash2,
  Vault,
  SlidersHorizontal,
} from "lucide-react";
import {
  useChartOfAccounts,
  useJournalEntries,
  useCreateJournalEntry,
  useAccountLedger,
  type ApiJournalEntry,
  type ApiAccount,
} from "@/hooks/use-api-config";
import { shouldUseBackend } from "@/lib/demo-mode";
import { PermissionGate } from "@/components/pulse/gates";
import { LoadingState, ErrorState } from "@/components/pulse/states";
import { fmtBDT } from "@/lib/pos-data";
import { todayDateRange } from "@/lib/dates";
import { toCsv } from "@/lib/csv";
import { saveTextFile } from "@/lib/download";
import { openPrintDocument, escapeHtml } from "@/lib/print-document";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/accounts/cash-adjustment")({
  component: CashAdjustmentPage,
});

interface LocalAdjustmentEntry {
  id: string;
  entry_no: string;
  entry_date: string;
  cash_account_name: string;
  offset_account_name: string;
  direction: "increase" | "decrease";
  amount: number;
  reason: string;
  created_at: string;
}

const LOCAL_STORAGE_KEY = "pulse_cash_adjustments_v1";

const DEFAULT_CASH_ACCOUNTS: ApiAccount[] = [
  { id: "acc-cash-1", code: "1000-01", name: "Main Cash Drawer / Till", account_type: "asset", account_subtype: "cash", is_active: true },
  { id: "acc-cash-2", code: "1000-02", name: "Petty Cash Reserve", account_type: "asset", account_subtype: "cash", is_active: true },
  { id: "acc-bank-1", code: "1000-03", name: "Operating Bank Account", account_type: "asset", account_subtype: "bank", is_active: true },
];

const DEFAULT_OFFSET_ACCOUNTS: ApiAccount[] = [
  { id: "acc-off-1", code: "5000-01", name: "Cash Over and Short (Shrinkage)", account_type: "expense", is_active: true },
  { id: "acc-off-2", code: "5000-02", name: "Miscellaneous Office Expense", account_type: "expense", is_active: true },
  { id: "acc-off-3", code: "3000-01", name: "Owner / Capital Contribution", account_type: "equity", is_active: true },
];

const QUICK_REASONS = [
  "Till Shortage Reconciled",
  "Till Overage Reconciled",
  "Starting Float Initialized",
  "Damaged Note Replacement",
  "Petty Cash Top-up",
];

const AMOUNT_PRESETS = [500, 1000, 2000, 5000, 10000];

function getInitialLocalAdjustments(): LocalAdjustmentEntry[] {
  const todayStr = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return [
    {
      id: "adj-1",
      entry_no: "ADJ-1001",
      entry_date: todayStr,
      cash_account_name: "Main Cash Drawer / Till",
      offset_account_name: "Starting Float Reserve",
      direction: "increase",
      amount: 15000,
      reason: "Initial register float allocation for shift opening",
      created_at: todayStr,
    },
    {
      id: "adj-2",
      entry_no: "ADJ-1002",
      entry_date: todayStr,
      cash_account_name: "Main Cash Drawer / Till",
      offset_account_name: "Cash Over and Short",
      direction: "decrease",
      amount: 250,
      reason: "Till count short by 250 at end of evening shift",
      created_at: todayStr,
    },
  ];
}

function CashAdjustmentPage() {
  const navigate = useNavigate();
  const useApi = shouldUseBackend();
  const { data: apiAccounts = [] } = useChartOfAccounts();
  const { data: apiEntries = [], isLoading, isError, refetch } = useJournalEntries();
  const createEntry = useCreateJournalEntry();

  const cashAccounts = useMemo(() => {
    const filtered = apiAccounts.filter(
      (a) =>
        a.account_subtype === "cash" ||
        a.account_subtype === "bank" ||
        /cash|bank|till|drawer/i.test(a.name)
    );
    if (useApi) return filtered;
    return filtered.length > 0 ? filtered : DEFAULT_CASH_ACCOUNTS;
  }, [apiAccounts, useApi]);

  const offsetAccounts = useMemo(() => {
    const filtered = apiAccounts.filter((a) => a.account_type !== "asset");
    if (useApi) return filtered;
    return filtered.length > 0 ? filtered : DEFAULT_OFFSET_ACCOUNTS;
  }, [apiAccounts, useApi]);

  // Form states
  const [date, setDate] = useState(() => todayDateRange().from);
  const [cashAccountId, setCashAccountId] = useState("");
  const [offsetAccountId, setOffsetAccountId] = useState("");
  const [direction, setDirection] = useState<"increase" | "decrease">("increase");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (cashAccounts.length > 0 && !cashAccountId) {
      setCashAccountId(cashAccounts[0].id);
    }
  }, [cashAccounts, cashAccountId]);

  useEffect(() => {
    if (offsetAccounts.length > 0 && !offsetAccountId) {
      setOffsetAccountId(offsetAccounts[0].id);
    }
  }, [offsetAccounts, offsetAccountId]);

  const activeCashAccount = useMemo(() => {
    return cashAccounts.find((a) => a.id === cashAccountId) || cashAccounts[0];
  }, [cashAccounts, cashAccountId]);

  const activeOffsetAccount = useMemo(() => {
    return offsetAccounts.find((a) => a.id === offsetAccountId) || offsetAccounts[0];
  }, [offsetAccounts, offsetAccountId]);

  const cashLedger = useAccountLedger(activeCashAccount?.id || undefined);
  const rawCashBalance = cashLedger.data?.ending_balance;
  const cashBalance = rawCashBalance !== undefined ? rawCashBalance : (useApi ? 0 : 6791668.27);

  // Local storage state for instant persistence
  const [localAdjustments, setLocalAdjustments] = useState<LocalAdjustmentEntry[]>(() => {
    if (useApi) {
      try {
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            return parsed.filter((item) => !["adj-1", "adj-2"].includes(item.id));
          }
        }
      } catch {
        // ignore
      }
      return [];
    }
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return getInitialLocalAdjustments();
  });

  useEffect(() => {
    if (useApi) {
      try {
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            const cleaned = parsed.filter((item) => !["adj-1", "adj-2"].includes(item.id));
            if (cleaned.length !== parsed.length) {
              localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cleaned));
            }
          }
        }
      } catch {
        // ignore
      }
    }
  }, [useApi]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localAdjustments));
    } catch {
      // ignore
    }
  }, [localAdjustments]);

  // Combine API entries with local entries
  const allAdjustmentEntries = useMemo(() => {
    const apiAdjustments: LocalAdjustmentEntry[] = apiEntries
      .filter((e) => (e.memo ?? "").startsWith("Cash adjustment:"))
      .map((e) => ({
        id: e.id,
        entry_no: e.entry_no || `ADJ-${e.id.slice(0, 6)}`,
        entry_date: e.entry_date ? new Date(e.entry_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—",
        cash_account_name: "Cash Drawer / Till",
        offset_account_name: "Offset Account",
        direction: "increase",
        amount: e.total_debit ?? 0,
        reason: (e.memo ?? "").replace("Cash adjustment: ", ""),
        created_at: e.entry_date ? new Date(e.entry_date).toLocaleDateString() : "—",
      }));

    const map = new Map<string, LocalAdjustmentEntry>();
    if (useApi) {
      localAdjustments
        .filter((item) => !["adj-1", "adj-2"].includes(item.id))
        .forEach((item) => map.set(item.id, item));
    } else {
      localAdjustments.forEach((item) => map.set(item.id, item));
    }
    apiAdjustments.forEach((item) => map.set(item.id, item));
    return Array.from(map.values());
  }, [apiEntries, localAdjustments, useApi]);

  // Total KPIs
  const totalIncreased = useMemo(() => {
    return allAdjustmentEntries
      .filter((e) => e.direction === "increase")
      .reduce((acc, curr) => acc + curr.amount, 0);
  }, [allAdjustmentEntries]);

  const totalDecreased = useMemo(() => {
    return allAdjustmentEntries
      .filter((e) => e.direction === "decrease")
      .reduce((acc, curr) => acc + curr.amount, 0);
  }, [allAdjustmentEntries]);

  const netAdjustment = totalIncreased - totalDecreased;

  const canSubmit = cashAccountId && offsetAccountId && Number(amount) > 0 && reason.trim();

  const handleSubmit = async () => {
    const amt = Number(amount) || 0;
    if (!canSubmit || amt <= 0) return;

    const todayFormatted = new Date(date).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    const newRecord: LocalAdjustmentEntry = {
      id: `adj-${Date.now()}`,
      entry_no: `ADJ-${Math.floor(1000 + Math.random() * 9000)}`,
      entry_date: todayFormatted,
      cash_account_name: activeCashAccount?.name || "Cash Drawer",
      offset_account_name: activeOffsetAccount?.name || "Offset Account",
      direction: direction,
      amount: amt,
      reason: reason.trim(),
      created_at: todayFormatted,
    };

    try {
      await createEntry.mutateAsync({
        entry_date: new Date(date).toISOString(),
        memo: `Cash adjustment: ${reason.trim()}`,
        lines:
          direction === "increase"
            ? [
                { account_id: cashAccountId, debit: amt, credit: 0 },
                { account_id: offsetAccountId, debit: 0, credit: amt },
              ]
            : [
                { account_id: offsetAccountId, debit: amt, credit: 0 },
                { account_id: cashAccountId, debit: 0, credit: amt },
              ],
      });
    } catch (err) {
      console.error("API journal entry optional warning:", err);
    }

    setLocalAdjustments((prev) => [newRecord, ...prev]);

    toast.success(
      `Cash adjustment posted: ${direction === "increase" ? "+" : "-"}${fmtBDT(amt)}`
    );

    setAmount("");
    setReason("");
    refetch();
  };

  const handleDeleteAdjustment = (id: string, entryNo: string) => {
    setLocalAdjustments((prev) => prev.filter((item) => item.id !== id));
    toast.success(`Adjustment ${entryNo} removed`);
  };

  const appendReason = (preset: string) => {
    setReason(preset);
  };

  const handleExportCsv = () => {
    if (allAdjustmentEntries.length === 0) {
      toast.error("No cash adjustments to export");
      return;
    }
    const headers = [
      "Entry No",
      "Date",
      "Direction",
      "Amount (BDT)",
      "Cash Account",
      "Offset Account",
      "Reason",
    ];
    const csvData = allAdjustmentEntries.map((r) => ({
      "Entry No": r.entry_no,
      "Date": r.entry_date,
      "Direction": r.direction.toUpperCase(),
      "Amount (BDT)": r.amount,
      "Cash Account": r.cash_account_name,
      "Offset Account": r.offset_account_name,
      "Reason": r.reason,
    }));

    const csv = toCsv(headers, csvData);
    saveTextFile(csv, `cash_adjustments_${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success("Cash adjustments exported to CSV");
  };

  const handlePrintAdjustments = () => {
    if (allAdjustmentEntries.length === 0) {
      toast.error("No cash adjustments to print");
      return;
    }

    let bodyHtml = `<table>
      <thead>
        <tr>
          <th>Entry No</th>
          <th>Date</th>
          <th>Direction</th>
          <th>Cash Account</th>
          <th>Offset Account</th>
          <th class="num">Amount (BDT)</th>
          <th>Reason</th>
        </tr>
      </thead>
      <tbody>`;

    allAdjustmentEntries.forEach((r) => {
      const isInc = r.direction === "increase";
      bodyHtml += `<tr>
        <td><b>${escapeHtml(r.entry_no)}</b></td>
        <td>${escapeHtml(r.entry_date)}</td>
        <td><span style="color:${isInc ? "#059669" : "#dc2626"};font-weight:700;text-transform:uppercase;font-size:10px;">${escapeHtml(r.direction)}</span></td>
        <td>${escapeHtml(r.cash_account_name)}</td>
        <td>${escapeHtml(r.offset_account_name)}</td>
        <td class="num"><b>${isInc ? "+" : "-"}${fmtBDT(r.amount)}</b></td>
        <td>${escapeHtml(r.reason)}</td>
      </tr>`;
    });

    bodyHtml += `<tr class="subtotal">
      <td colspan="5"><b>Net Adjustment Balance</b></td>
      <td class="num"><b>${fmtBDT(netAdjustment)}</b></td>
      <td></td>
    </tr></tbody></table>`;

    const ok = openPrintDocument({
      title: "Cash & Drawer Adjustment Register",
      subtitle: "Detailed till discrepancy & cash adjustment ledger log",
      orientation: "landscape",
      meta: [
        { label: "Total Entries", value: String(allAdjustmentEntries.length) },
        { label: "Net Difference", value: fmtBDT(netAdjustment) },
        { label: "Printed", value: new Date().toLocaleString() },
      ],
      bodyHtml,
    });

    if (!ok) {
      toast.error("Pop-up blocked. Please allow pop-ups to print.");
    }
  };

  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader
        eyebrow="Finance & Till Management"
        title="Cash & Drawer Adjustment"
        subtitle="Initialize starting cash drawer float balances and reconcile till discrepancies"
        actions={
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs font-medium border-border/80 shadow-2xs hover:bg-accent"
              onClick={() => navigate({ to: "/app/accounts" })}
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Button>
            <div className="rounded-xl border border-teal-500/25 bg-gradient-to-r from-teal-500/10 via-emerald-500/5 to-transparent px-3.5 py-1 text-right shadow-2xs backdrop-blur-xs">
              <div className="text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">
                {activeCashAccount?.name || "Cash Drawer"}
              </div>
              <div className="font-display text-sm font-extrabold text-teal-700 dark:text-teal-300">
                {fmtBDT(cashBalance)}
              </div>
            </div>
          </div>
        }
      />

      <PageBody className="space-y-4">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Left Column: Compact Form Card */}
          <div className="lg:col-span-5">
            <PermissionGate
              perm="accounts.journal_manage"
              fallback={
                <SectionCard>
                  <div className="p-4 text-xs text-muted-foreground">
                    Requires accounts.journal_manage permission.
                  </div>
                </SectionCard>
              }
            >
              <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm transition-all hover:shadow-md">
                {/* Header Banner */}
                <div className="flex items-center justify-between border-b border-border/60 pb-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-xs">
                      <SlidersHorizontal className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h3 className="font-display text-sm font-bold text-foreground">
                        New Till Adjustment
                      </h3>
                      <p className="text-[11px] text-muted-foreground">
                        Record float or till discrepancy
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-teal-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-teal-600 border border-teal-500/20">
                    <Sparkles className="h-2.5 w-2.5" /> Posting
                  </span>
                </div>

                <div className="space-y-3">
                  {/* Date & Cash Account */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <Label className="text-[11px] font-semibold text-foreground">Date *</Label>
                      <Input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="h-9 border-border/80 text-xs font-medium focus:border-teal-500 focus:ring-teal-500/20"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] font-semibold text-foreground">Cash / Bank Account *</Label>
                      <Select value={cashAccountId} onValueChange={setCashAccountId}>
                        <SelectTrigger className="h-9 border-border/80 text-xs font-medium focus:ring-teal-500/20">
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                        <SelectContent>
                          {cashAccounts.map((a) => (
                            <SelectItem key={a.id} value={a.id} className="text-xs">
                              [{a.code || "Asset"}] {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Direction Toggle */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-foreground">Adjustment Direction *</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setDirection("increase")}
                        className={cn(
                          "flex items-center justify-center gap-1.5 rounded-lg border py-2 px-2 text-xs font-bold transition-all cursor-pointer shadow-2xs",
                          direction === "increase"
                            ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 shadow-xs ring-1 ring-emerald-500/20"
                            : "border-border/80 text-muted-foreground hover:bg-accent hover:text-foreground"
                        )}
                      >
                        <ArrowUpCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <span>Increase (+)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDirection("decrease")}
                        className={cn(
                          "flex items-center justify-center gap-1.5 rounded-lg border py-2 px-2 text-xs font-bold transition-all cursor-pointer shadow-2xs",
                          direction === "decrease"
                            ? "border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-400 shadow-xs ring-1 ring-rose-500/20"
                            : "border-border/80 text-muted-foreground hover:bg-accent hover:text-foreground"
                        )}
                      >
                        <ArrowDownCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                        <span>Decrease (-)</span>
                      </button>
                    </div>
                  </div>

                  {/* Amount & Offset Account */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <Label className="text-[11px] font-semibold text-foreground">Amount (BDT) *</Label>
                      <div className="relative">
                        <span className="absolute left-2 top-1.5 flex h-6 items-center justify-center rounded-md bg-muted px-1.5 text-[10px] font-bold text-muted-foreground">
                          ৳ BDT
                        </span>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="0.00"
                          className="h-9 pl-15 font-bold text-xs border-border/80 focus:border-teal-500 focus:ring-teal-500/20"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] font-semibold text-foreground">Offset Account *</Label>
                      <Select value={offsetAccountId} onValueChange={setOffsetAccountId}>
                        <SelectTrigger className="h-9 border-border/80 text-xs font-medium focus:ring-teal-500/20">
                          <SelectValue placeholder="Select offset account" />
                        </SelectTrigger>
                        <SelectContent>
                          {offsetAccounts.map((a) => (
                            <SelectItem key={a.id} value={a.id} className="text-xs">
                              [{a.code || "Offset"}] {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Amount Presets */}
                  <div>
                    <div className="text-[10px] font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                      <Sparkles className="h-2.5 w-2.5 text-amber-500" /> Presets:
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {AMOUNT_PRESETS.map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setAmount(String(amt))}
                          className={cn(
                            "rounded-md border border-border/70 bg-secondary/30 px-2 py-0.5 text-[10px] font-semibold text-foreground hover:bg-teal-500/10 hover:border-teal-500/40 transition-colors cursor-pointer",
                            amount === String(amt) && "bg-teal-600 text-white border-teal-600 font-bold"
                          )}
                        >
                          ৳{amt.toLocaleString()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Reason & Quick Tags */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-foreground">Reason / Audit Memo *</Label>
                    <Input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Till short by 200, float, etc."
                      className="h-9 text-xs border-border/80 focus:border-teal-500 focus:ring-teal-500/20 font-medium"
                    />
                    <div className="flex flex-wrap gap-1 mt-1">
                      {QUICK_REASONS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => appendReason(preset)}
                          className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[9px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
                        >
                          <Tag className="h-2 w-2" /> {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Submit Button */}
                <div className="border-t border-border/60 mt-4 pt-3 flex justify-end">
                  <Button
                    onClick={handleSubmit}
                    disabled={!canSubmit || createEntry.isPending}
                    className="w-full h-10 gap-2 font-bold text-white bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 shadow-sm shadow-teal-600/20 transition-all hover:scale-[1.01] active:scale-[0.99]"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Post Adjustment
                  </Button>
                </div>
              </div>
            </PermissionGate>
          </div>

          {/* Right Column: Compact KPI + Table */}
          <div className="lg:col-span-7 space-y-4">
            {/* KPI Stat Cards Bar */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="rounded-xl border border-border/80 bg-card p-3 shadow-2xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-[9px] font-bold uppercase tracking-wider">Total Increase</span>
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                </div>
                <div className="mt-1 font-display text-base font-extrabold text-emerald-600">
                  +{fmtBDT(totalIncreased)}
                </div>
              </div>

              <div className="rounded-xl border border-border/80 bg-card p-3 shadow-2xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-[9px] font-bold uppercase tracking-wider">Total Decrease</span>
                  <TrendingDown className="h-3.5 w-3.5 text-rose-600" />
                </div>
                <div className="mt-1 font-display text-base font-extrabold text-rose-600">
                  -{fmtBDT(totalDecreased)}
                </div>
              </div>

              <div className="rounded-xl border border-border/80 bg-card p-3 shadow-2xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-[9px] font-bold uppercase tracking-wider">Net Impact</span>
                  <Vault className="h-3.5 w-3.5 text-blue-600" />
                </div>
                <div className={cn("mt-1 font-display text-base font-extrabold", netAdjustment >= 0 ? "text-emerald-600" : "text-rose-600")}>
                  {netAdjustment >= 0 ? "+" : ""}{fmtBDT(netAdjustment)}
                </div>
              </div>
            </div>

            {/* Recent Adjustments Table Card */}
            <SectionCard
              title="Recent Cash Adjustments"
              description="Audited till discrepancy log"
              actions={
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[11px] font-medium shadow-2xs hover:bg-accent gap-1"
                    onClick={handleExportCsv}
                  >
                    <Download className="h-3 w-3" /> CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[11px] font-medium shadow-2xs hover:bg-accent gap-1"
                    onClick={handlePrintAdjustments}
                  >
                    <Printer className="h-3 w-3" /> Print
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => refetch()}
                  >
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                </div>
              }
            >
              {isLoading ? (
                <LoadingState />
              ) : allAdjustmentEntries.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-1.5">
                  <Coins className="h-7 w-7 text-muted-foreground/40" />
                  <div className="font-bold text-xs text-foreground">No cash adjustments posted yet</div>
                  <div className="text-[11px] text-muted-foreground">
                    Use the form on the left to record float or till discrepancies.
                  </div>
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border/80 bg-background shadow-2xs mt-2">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-muted/60 text-[9px] uppercase font-bold text-muted-foreground border-b border-border/80">
                        <th className="px-3 py-2">Entry No</th>
                        <th className="px-2.5 py-2">Date</th>
                        <th className="px-2.5 py-2">Direction</th>
                        <th className="px-2.5 py-2">Cash Account</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2">Reason</th>
                        <th className="px-2 py-2 text-center w-8">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {allAdjustmentEntries.map((e) => {
                        const isInc = e.direction === "increase";
                        return (
                          <tr key={e.id} className="hover:bg-muted/30 transition-colors group">
                            <td className="px-3 py-2 font-mono font-bold text-foreground">
                              {e.entry_no}
                            </td>
                            <td className="px-2.5 py-2 text-muted-foreground text-[11px] font-medium">{e.entry_date}</td>
                            <td className="px-2.5 py-2">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-0.5 px-2 py-0.2 rounded-full text-[9px] font-bold uppercase tracking-wider border",
                                  isInc
                                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                                    : "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20"
                                )}
                              >
                                {isInc ? <ArrowUpCircle className="h-2.5 w-2.5 text-emerald-600" /> : <ArrowDownCircle className="h-2.5 w-2.5 text-rose-600" />}
                                {e.direction}
                              </span>
                            </td>
                            <td className="px-2.5 py-2 text-foreground text-[11px] font-medium max-w-[120px] truncate">{e.cash_account_name}</td>
                            <td className={cn("px-3 py-2 text-right font-bold tabular-nums text-[11px]", isInc ? "text-emerald-600" : "text-rose-600")}>
                              {isInc ? "+" : "-"}{fmtBDT(e.amount)}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground italic font-normal text-[11px] max-w-[130px] truncate">
                              {e.reason}
                            </td>
                            <td className="px-2 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleDeleteAdjustment(e.id, e.entry_no)}
                                className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded-sm hover:bg-destructive/10 cursor-pointer"
                                title="Remove entry"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>
        </div>
      </PageBody>
    </>
  );
}
