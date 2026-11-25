import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, PageBody, SectionCard, StatCard } from "@/components/pulse/primitives";
import { LoadingState, ErrorState, EmptyState } from "@/components/pulse/states";
import { ListPagination } from "@/components/pulse/ListPagination";
import { useClientPagination } from "@/hooks/use-client-pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PrintButton } from "@/components/pulse/ActionButtons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CreditCard, Banknote, Smartphone, TrendingUp, RefreshCw, X } from "lucide-react";
import { fmtBDT } from "@/lib/pos-data";
import { shouldUseBackend } from "@/lib/demo-mode";
import { dateInputRangeForApi } from "@/lib/dates";
import { escapeHtml, openPrintDocument } from "@/lib/print-document";
import { toast } from "sonner";
import { usePayments, usePaymentsSummary, usePaymentMethods } from "@/hooks/use-api-config";

export const Route = createFileRoute("/app/payments")({ component: Payments });

/** Payments land continuously from every till, so the page polls. */
const AUTO_REFRESH_MS = 30_000;

const PAYMENT_TYPES = ["sale", "refund", "supplier", "advance", "due"] as const;

function Payments() {
  const useApi = shouldUseBackend();

  const [typeFilter, setTypeFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");

  const apiDateRange = useMemo(() => dateInputRangeForApi(fromDate, toDate), [fromDate, toDate]);

  const {
    data: payments,
    isLoading,
    isError,
    refetch,
    isFetching,
    dataUpdatedAt,
  } = usePayments({
    payment_type: typeFilter || undefined,
    method: methodFilter || undefined,
    from_date: apiDateRange.from_date,
    to_date: apiDateRange.to_date,
    limit: 200,
    refetchInterval: AUTO_REFRESH_MS,
  });
  const { data: summary } = usePaymentsSummary({ refetchInterval: AUTO_REFRESH_MS });
  const { data: methods } = usePaymentMethods();

  // Reference/type search stays client-side — the endpoint has no text search.
  const paymentRows = useMemo(() => {
    const rows = payments ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (p) =>
        (p.reference ?? "").toLowerCase().includes(q) ||
        (p.payment_type ?? "").toLowerCase().includes(q) ||
        (p.method ?? "").toLowerCase().includes(q),
    );
  }, [payments, search]);

  const listPage = useClientPagination(
    paymentRows,
    10,
    `${typeFilter}|${methodFilter}|${fromDate}|${toDate}|${search}`,
  );

  const hasFilters = Boolean(typeFilter || methodFilter || fromDate || toDate || search);
  const clearFilters = () => {
    setTypeFilter("");
    setMethodFilter("");
    setFromDate("");
    setToDate("");
    setSearch("");
  };

  const filteredTotal = useMemo(
    () => paymentRows.reduce((sum, p) => sum + (p.amount ?? 0), 0),
    [paymentRows],
  );

  const handlePrint = () => {
    if (!paymentRows.length) return;
    const body =
      `<table><thead><tr>` +
      `<th>When</th><th>Type</th><th>Method</th><th>Reference</th><th class="num">Amount</th>` +
      `</tr></thead><tbody>` +
      paymentRows
        .map(
          (p) =>
            `<tr>` +
            `<td>${escapeHtml(p.created_at ? new Date(p.created_at).toLocaleString() : "—")}</td>` +
            `<td>${escapeHtml(p.payment_type ?? "—")}</td>` +
            `<td>${escapeHtml(p.method ?? "—")}</td>` +
            `<td>${escapeHtml(p.reference ?? "—")}</td>` +
            `<td class="num">${escapeHtml(fmtBDT(p.amount))}</td>` +
            `</tr>`,
        )
        .join("") +
      `</tbody><tfoot><tr>` +
      `<td colspan="4">TOTAL</td><td class="num">${escapeHtml(fmtBDT(filteredTotal))}</td>` +
      `</tr></tfoot></table>`;

    const meta = [
      {
        label: "Period",
        value: fromDate || toDate ? `${fromDate || "—"} to ${toDate || "—"}` : "All dates",
      },
      ...(typeFilter ? [{ label: "Type", value: typeFilter }] : []),
      ...(methodFilter ? [{ label: "Method", value: methodFilter }] : []),
      ...(search ? [{ label: "Search", value: search }] : []),
      { label: "Transactions", value: String(paymentRows.length) },
      { label: "Printed", value: new Date().toLocaleString() },
    ];

    if (!openPrintDocument({ title: "Payment transactions", meta, bodyHtml: body })) {
      toast.error("Pop-up blocked. Allow pop-ups for this site to print.");
    }
  };

  if (!useApi) {
    return (
      <>
        <PageHeader title="Payments" subtitle="Connect backend for live payment data." />
        <PageBody>
          <EmptyState
            title="Backend required"
            description="Payment transactions require API mode."
          />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="Live payment transactions — configure methods under Master Data → Payment methods"
        actions={
          <>
            <span className="hidden text-[11px] text-muted-foreground sm:inline">
              {isFetching
                ? "Refreshing…"
                : dataUpdatedAt
                  ? `Updated ${new Date(dataUpdatedAt).toLocaleTimeString()}`
                  : ""}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <PrintButton
              onPrint={handlePrint}
              disabledReason={!paymentRows.length ? "No transactions to print" : undefined}
            />
          </>
        }
      />
      <PageBody className="space-y-5">
        {isError && <ErrorState title="Failed to load payments" onRetry={() => refetch()} />}
        <div className="grid gap-4 sm:grid-cols-4">
          <StatCard
            label="Cash collected"
            value={fmtBDT(summary?.cash_collected ?? 0)}
            icon={<Banknote className="h-4 w-4" />}
          />
          <StatCard
            label="Card collected"
            value={fmtBDT(summary?.card_collected ?? 0)}
            icon={<CreditCard className="h-4 w-4" />}
          />
          <StatCard
            label="Mobile collected"
            value={fmtBDT(summary?.mobile_collected ?? 0)}
            icon={<Smartphone className="h-4 w-4" />}
          />
          <StatCard
            label="Refunds"
            value={fmtBDT(summary?.refund_amount ?? 0)}
            icon={<TrendingUp className="h-4 w-4" />}
          />
        </div>

        <SectionCard title="Filters">
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Label className="text-xs">Search</Label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Reference, type, method"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select
                value={typeFilter || "__all"}
                onValueChange={(v) => setTypeFilter(v === "__all" ? "" : v)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">All types</SelectItem>
                  {PAYMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Method</Label>
              <Select
                value={methodFilter || "__all"}
                onValueChange={(v) => setMethodFilter(v === "__all" ? "" : v)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All methods" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">All methods</SelectItem>
                  {(methods ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.code}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-9"
              />
            </div>
          </div>
          {hasFilters && (
            <div className="flex items-center gap-3 border-t border-border/60 px-4 py-2.5">
              <span className="text-xs text-muted-foreground">
                {paymentRows.length} {paymentRows.length === 1 ? "transaction" : "transactions"} ·{" "}
                <span className="font-medium text-foreground">{fmtBDT(filteredTotal)}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 gap-1 text-xs"
                onClick={clearFilters}
              >
                <X className="h-3 w-3" /> Clear filters
              </Button>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Recent transactions">
          {isLoading ? (
            <LoadingState rows={5} />
          ) : paymentRows.length === 0 ? (
            <EmptyState
              title={hasFilters ? "No matching payments" : "No payments yet"}
              description={
                hasFilters ? "Try widening the date range or clearing filters." : undefined
              }
            />
          ) : (
            <>
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs uppercase">
                  <tr>
                    <th className="px-5 py-2.5 text-left">When</th>
                    <th className="px-3 py-2.5 text-left">Type</th>
                    <th className="px-3 py-2.5 text-left">Method</th>
                    <th className="px-5 py-2.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {listPage.pageItems.map((p) => (
                    <tr key={p.id}>
                      <td className="px-5 py-3 text-muted-foreground">
                        {p.created_at ? new Date(p.created_at).toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-3 capitalize">{p.payment_type}</td>
                      <td className="px-3 py-3 capitalize">{p.method}</td>
                      <td className="px-5 py-3 text-right tabular font-semibold">
                        {fmtBDT(p.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ListPagination
                page={listPage.page}
                pageSize={listPage.pageSize}
                total={listPage.total}
                onPageChange={listPage.setPage}
              />
            </>
          )}
        </SectionCard>
      </PageBody>
    </>
  );
}
