import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Download, FileSpreadsheet, FileText, ChevronDown } from "lucide-react";
import { PageHeader, PageBody, SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportRowsToCsv, exportRowsToExcel, exportRowsToPdf, type ExportColumn } from "@/lib/report-export";
import { LoadingState, ErrorState, EmptyState } from "@/components/pulse/states";
import { fmtBDT } from "@/lib/pos-data";
import { shouldUseBackend, isDemoMode } from "@/lib/demo-mode";
import { resolveLiveRows, EMPTY_LIVE_LABEL } from "@/lib/live-data";
import { salesInvoices } from "@/lib/mock-extra";
import { useApp } from "@/lib/app-store";
import { todayInputDate } from "@/lib/dates";
import { useClientPagination } from "@/hooks/use-client-pagination";
import { ListPagination } from "@/components/pulse/ListPagination";
import {
  useSales,
  useSale,
  useApiStores,
  type ApiSale,
} from "@/hooks/use-api-config";
import { SaleDetailDrawer } from "@/features/sales/SaleDetailDrawer";
import {
  SalesReturnForm,
  SalesRefundForm,
  SalesExchangeForm,
  DueCollectionForm,
} from "@/features/sales/SalesForms";
import { normSaleStatus } from "@/features/sales/utils";

export const Route = createFileRoute("/app/sales")({ component: Sales });

type FormMode = "return" | "refund" | "exchange" | "collect" | null;

type SaleRow = {
  id: string;
  invoice: string;
  store: string;
  cashier: string;
  customer: string;
  total: number;
  paid: number;
  due: number;
  tender: string;
  industry: string;
  ts: string;
  status: string;
};

/** Column order used by every Sales export format. */
const EXPORT_COLUMNS: ExportColumn[] = [
  { key: "invoice", label: "Invoice" },
  { key: "ts", label: "Date" },
  { key: "store", label: "Store" },
  { key: "cashier", label: "Cashier" },
  { key: "customer", label: "Customer" },
  { key: "industry", label: "Industry" },
  { key: "tender", label: "Tender" },
  { key: "status", label: "Status" },
  { key: "total", label: "Total" },
  { key: "paid", label: "Paid" },
  { key: "due", label: "Due" },
];

function toRow(s: ApiSale): SaleRow {
  return {
    id: s.id,
    invoice: s.invoice_number,
    store: s.store_name ?? "—",
    cashier: s.cashier_name ?? "—",
    customer: s.customer_name ?? "Walk-in",
    total: s.total,
    paid: s.paid_amount ?? 0,
    due: s.due_amount ?? 0,
    tender: s.tender,
    industry: s.industry_pack,
    ts: s.completed_at ? new Date(s.completed_at).toLocaleString() : (s.created_at ? new Date(s.created_at).toLocaleString() : "—"),
    status: normSaleStatus(s.status),
  };
}

function Sales() {
  const demo = isDemoMode();
  const useApi = shouldUseBackend();
  const app = useApp();
  const { transactions } = app;
  // Gates on backend-enabled internally; takes no arguments.
  const { data: stores } = useApiStores();

  const [statusFilter, setStatusFilter] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [industryFilter, setIndustryFilterRaw] = useState("");
  const industryFilterTouched = useRef(false);
  const setIndustryFilter = (v: string) => { industryFilterTouched.current = true; setIndustryFilterRaw(v); };
  const [fromDate, setFromDate] = useState(todayInputDate);
  const [toDate, setToDate] = useState(todayInputDate);
  const [search, setSearch] = useState("");

  const filters = useMemo(() => ({
    status: statusFilter || undefined,
    store_id: storeFilter || undefined,
    industry_pack: industryFilter || undefined,
    from_date: fromDate || undefined,
    to_date: toDate || undefined,
    limit: 200,
  }), [statusFilter, storeFilter, industryFilter, fromDate, toDate]);

  const salesQuery = useSales(useApi ? filters : undefined);

  const [detailId, setDetailId] = useState<string | null>(null);
  const detailQuery = useSale(detailId ?? undefined);
  const [activeSale, setActiveSale] = useState<ApiSale | null>(null);
  const [formMode, setFormMode] = useState<FormMode>(null);

  const apiRows: SaleRow[] = (salesQuery.data ?? []).map(toRow);

  const demoRows: SaleRow[] = transactions.map((t) => ({
    id: t.id,
    invoice: t.id,
    store: "DHK-01",
    cashier: "You",
    customer: "Walk-in",
    total: t.total,
    paid: t.total,
    due: 0,
    tender: t.tender,
    industry: t.industry,
    ts: new Date(t.ts).toLocaleString(),
    status: "completed",
  }));

  const mockRows: SaleRow[] = salesInvoices.map((s) => ({
    id: s.id,
    invoice: s.invoice,
    store: s.store,
    cashier: s.cashier,
    customer: "—",
    total: s.total,
    paid: s.total,
    due: 0,
    tender: s.tender,
    industry: "—",
    ts: s.ts,
    status: s.status,
  }));

  const demoOnlyRows: SaleRow[] = demo ? [...demoRows, ...mockRows] : mockRows;
  const { rows: baseRows, isEmpty } = resolveLiveRows(useApi, apiRows, salesQuery.isLoading, demoOnlyRows);

  const rows = baseRows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return r.invoice.toLowerCase().includes(q)
      || r.cashier.toLowerCase().includes(q)
      || r.customer.toLowerCase().includes(q);
  });

  const listPage = useClientPagination(
    rows,
    10,
    `${statusFilter}|${storeFilter}|${industryFilter}|${fromDate}|${toDate}|${search}`,
  );

  const selected = detailQuery.data ?? activeSale;

  const openForm = (mode: FormMode) => {
    if (detailQuery.data) setActiveSale(detailQuery.data);
    setFormMode(mode);
  };

  // Exports cover every filtered row, not just the visible page.
  const exportTotals = useMemo(
    () => ({
      total: rows.reduce((s, r) => s + r.total, 0),
      paid: rows.reduce((s, r) => s + r.paid, 0),
      due: rows.reduce((s, r) => s + r.due, 0),
    }),
    [rows],
  );
  const exportRows = rows as unknown as Record<string, unknown>[];
  const exportName = `sales-${fromDate || "all"}-to-${toDate || "all"}`;
  const exportDisabledReason = rows.length === 0 ? "No sales to export" : undefined;

  if (!useApi && !demo) {
    return (
      <>
        <PageHeader title="Sales" subtitle="Connect to backend to view sales history." />
        <PageBody>
          <EmptyState
            title="Backend required"
            description="Sales history, returns, refunds and due collection require the live API."
          />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Sales"
        subtitle={demo ? "Demo sales + local transactions" : "Sales history from PostgreSQL"}
        actions={
          <>
            {useApi && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => salesQuery.refetch()} disabled={salesQuery.isFetching}>
                <RefreshCw className={`h-3.5 w-3.5 ${salesQuery.isFetching ? "animate-spin" : ""}`} /> Refresh
              </Button>
            )}
            {exportDisabledReason ? (
              <DisabledReasonButton
                label="Export"
                reason={exportDisabledReason}
                icon={<Download className="h-3.5 w-3.5" />}
              />
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Download className="h-3.5 w-3.5" /> Export
                    <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel>
                    Export {rows.length} {rows.length === 1 ? "sale" : "sales"}
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => exportRowsToCsv(exportRows, exportName, EXPORT_COLUMNS, exportTotals)}
                  >
                    <FileText className="mr-2 h-4 w-4" /> CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => exportRowsToExcel(exportRows, exportName, EXPORT_COLUMNS, exportTotals)}
                  >
                    <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      exportRowsToPdf(
                        exportRows,
                        exportName,
                        {
                          title: "Sales history",
                          subtitle: `${fromDate || "—"} to ${toDate || "—"}`,
                        },
                        EXPORT_COLUMNS,
                        exportTotals,
                      )
                    }
                  >
                    <FileText className="mr-2 h-4 w-4" /> PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />

      <PageBody className="space-y-5">
        {useApi && salesQuery.isError && (
          <ErrorState title="Failed to load sales" onRetry={() => salesQuery.refetch()} />
        )}

        <SectionCard title="Filters">
          <div className="p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <div>
                <Label>Search</Label>
                <Input placeholder="Invoice, cashier, customer…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              {useApi && (
                <>
                  <div>
                    <Label>Status</Label>
                    <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                      <option value="">All</option>
                      <option value="completed">Completed</option>
                      <option value="held">Held</option>
                      <option value="returned">Returned</option>
                    </select>
                  </div>
                  <div>
                    <Label>Store</Label>
                    <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)}>
                      <option value="">All stores</option>
                      {(stores ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Industry</Label>
                    <Input placeholder="e.g. grocery" value={industryFilter} onChange={(e) => setIndustryFilter(e.target.value)} />
                  </div>
                  <div><Label>From</Label><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></div>
                  <div><Label>To</Label><Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></div>
                </>
              )}
            </div>

            {useApi && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/40 text-xs">
                <span className="text-muted-foreground mr-1 text-[11px] font-medium">Quick Date Presets:</span>
                {[
                  { label: "Today", value: "today" },
                  { label: "Yesterday", value: "yesterday" },
                  { label: "Last 7 Days", value: "last7d" },
                  { label: "This Month", value: "thisMonth" },
                  { label: "Clear Dates", value: "all" },
                ].map(p => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const format = (d: Date) => d.toISOString().slice(0, 10);
                      if (p.value === "today") {
                        const today = format(now);
                        setFromDate(today);
                        setToDate(today);
                      } else if (p.value === "yesterday") {
                        const y = new Date(now);
                        y.setDate(y.getDate() - 1);
                        const yd = format(y);
                        setFromDate(yd);
                        setToDate(yd);
                      } else if (p.value === "last7d") {
                        const d7 = new Date(now);
                        d7.setDate(d7.getDate() - 6);
                        setFromDate(format(d7));
                        setToDate(format(now));
                      } else if (p.value === "thisMonth") {
                        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
                        setFromDate(format(firstDay));
                        setToDate(format(now));
                      } else if (p.value === "all") {
                        setFromDate("");
                        setToDate("");
                      }
                    }}
                    className="rounded-full border border-border/80 bg-secondary/60 hover:bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-foreground transition-colors cursor-pointer"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Sales">
          {useApi && salesQuery.isLoading ? (
            <LoadingState rows={6} />
          ) : rows.length === 0 ? (
            <EmptyState title="No sales yet" description="Complete a POS sale to see data here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-sm">
                <thead className="bg-secondary/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3.5 py-2 text-left">Invoice</th>
                    <th className="px-2.5 py-2 text-left">Customer</th>
                    <th className="px-2.5 py-2 text-left">Industry</th>
                    <th className="px-2.5 py-2 text-left">Store</th>
                    <th className="px-2.5 py-2 text-left">Cashier</th>
                    <th className="px-2.5 py-2 text-left">Tender</th>
                    <th className="px-2.5 py-2 text-left">When</th>
                    <th className="px-2.5 py-2 text-right">Amount</th>
                    <th className="px-2.5 py-2 text-right">Due</th>
                    <th className="px-2.5 py-2 text-right">Status</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-xs">
                  {isEmpty ? (
                    <tr>
                      <td colSpan={11} className="px-5 py-8 text-center text-xs text-muted-foreground">{EMPTY_LIVE_LABEL}</td>
                    </tr>
                  ) : listPage.pageItems.map((r) => (
                    <tr key={r.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-3.5 py-2 font-mono text-[11px] font-medium">{r.invoice}</td>
                      <td className="px-2.5 py-2 font-medium">{r.customer}</td>
                      <td className="px-2.5 py-2"><Badge variant="outline" className="text-[9.5px] px-1.5 py-0 capitalize">{r.industry}</Badge></td>
                      <td className="px-2.5 py-2 text-muted-foreground">{r.store}</td>
                      <td className="px-2.5 py-2 text-muted-foreground">{r.cashier}</td>
                      <td className="px-2.5 py-2 capitalize">{r.tender}</td>
                      <td className="px-2.5 py-2 text-muted-foreground text-[11px]">{r.ts}</td>
                      <td className="px-2.5 py-2 text-right font-semibold tabular-nums">{fmtBDT(r.total)}</td>
                      <td className="px-2.5 py-2 text-right tabular-nums text-muted-foreground">{r.due > 0 ? fmtBDT(r.due) : "—"}</td>
                      <td className="px-2.5 py-2 text-right"><StatusBadge status={r.status} /></td>
                      <td className="px-3 py-2 text-right">
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setDetailId(r.id)}>View</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!isEmpty && rows.length > 0 && (
            <ListPagination page={listPage.page} pageSize={listPage.pageSize} total={listPage.total} onPageChange={listPage.setPage} />
          )}
        </SectionCard>
      </PageBody>

      <SaleDetailDrawer
        saleId={detailId}
        onClose={() => { setDetailId(null); setActiveSale(null); }}
        onReturn={() => openForm("return")}
        onRefund={() => openForm("refund")}
        onExchange={() => openForm("exchange")}
        onCollectDue={() => openForm("collect")}
      />

      {selected && formMode === "return" && (
        <SalesReturnForm open onOpenChange={(v) => !v && setFormMode(null)} sale={selected} />
      )}
      {selected && formMode === "refund" && (
        <SalesRefundForm open onOpenChange={(v) => !v && setFormMode(null)} sale={selected} />
      )}
      {selected && formMode === "exchange" && (
        <SalesExchangeForm open onOpenChange={(v) => !v && setFormMode(null)} sale={selected} />
      )}
      {selected && formMode === "collect" && (
        <DueCollectionForm open onOpenChange={(v) => !v && setFormMode(null)} sale={selected} />
      )}
    </>
  );
}
