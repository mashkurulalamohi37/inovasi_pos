import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, PageBody, SectionCard, FilterBar } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Search, AlertCircle, RefreshCw, ArrowDownRight, ArrowUpRight, DollarSign, Package } from "lucide-react";
import { stockLedger } from "@/lib/mock-extra";
import { resolveLiveRows, EMPTY_LIVE_LABEL } from "@/lib/live-data";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useStockLedger, useApiStores, type ApiStockLedgerEntry } from "@/hooks/use-api-config";
import { useMemo, useState } from "react";
import { fmtBDT } from "@/lib/pos-data";

type LedgerSearch = { product_id?: string; sku?: string };

export const Route = createFileRoute("/app/stock-ledger")({
  validateSearch: (search: Record<string, unknown>): LedgerSearch => ({
    product_id: typeof search.product_id === "string" ? search.product_id : undefined,
    sku: typeof search.sku === "string" ? search.sku : undefined,
  }),
  component: Ledger,
});

const typeTone: Record<string, string> = {
  sale: "bg-destructive/10 text-destructive border-destructive/20",
  grn: "bg-success/10 text-success border-success/20",
  purchase_receive: "bg-success/10 text-success border-success/20",
  transfer_in: "bg-primary/10 text-primary border-primary/20",
  transfer_out: "bg-warning/10 text-warning border-warning/20",
  adjustment: "bg-muted text-muted-foreground border-border",
  opening: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800",
  Sale: "bg-destructive/10 text-destructive border-destructive/20",
  GRN: "bg-success/10 text-success border-success/20",
  "Transfer-in": "bg-primary/10 text-primary border-primary/20",
  "Transfer-out": "bg-warning/10 text-warning border-warning/20",
  Adjustment: "bg-muted text-muted-foreground border-border",
  Opening: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800",
};

function formatType(t: string) {
  return t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function Ledger() {
  const useApi = shouldUseBackend();
  const { product_id: auditProductId, sku: auditSku } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [search, setSearch] = useState(auditSku ?? "");
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const { data: stores = [] } = useApiStores();

  const { data, isLoading, isError, refetch, isFetching } = useStockLedger({
    product_id: auditProductId,
    transaction_type: typeFilter,
    limit: 200,
  });

  const storeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of stores) {
      map.set(s.id, s.name);
    }
    return map;
  }, [stores]);

  const clearAudit = () => {
    setSearch("");
    void navigate({ search: {} });
  };

  const apiRows = useMemo(() => {
    const rows: ApiStockLedgerEntry[] = data ?? [];
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r => (r.sku || "").toLowerCase().includes(q) || (r.name || "").toLowerCase().includes(q));
  }, [data, search]);

  const mockRows = useMemo(() => {
    let rows = stockLedger;
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r => r.sku.toLowerCase().includes(q) || ((r as any).name || "").toLowerCase().includes(q));
    }
    return rows;
  }, [search]);

  const { rows: displayRows, isEmpty, usingDemo } = resolveLiveRows<any>(
    useApi,
    apiRows,
    isLoading,
    mockRows,
  );

  const metrics = useMemo(() => {
    let totalInQty = 0;
    let totalOutQty = 0;
    let totalValue = 0;

    if (usingDemo) {
      for (const r of (displayRows as unknown as typeof stockLedger)) {
        if (r.qty > 0) totalInQty += r.qty;
        else totalOutQty += Math.abs(r.qty);
        totalValue += (r.total || (Math.abs(r.qty) * (r.price || 0)));
      }
    } else {
      for (const r of displayRows as ApiStockLedgerEntry[]) {
        totalInQty += (r.in_qty || 0);
        totalOutQty += (r.out_qty || 0);
        const qty = r.in_qty > 0 ? r.in_qty : r.out_qty;
        const price = r.unit_price || r.unit_cost || 0;
        totalValue += (r.total_price || (qty * price));
      }
    }

    return { totalInQty, totalOutQty, totalValue, count: displayRows.length };
  }, [displayRows, usingDemo]);

  return (
    <>
      <PageHeader title="Stock Ledger" subtitle={useApi ? "Live stock movements and transaction values from backend" : "Every quantity and value movement — auditable and immutable."}
        actions={
          <>
            {useApi && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
              </Button>
            )}
            {useApi ? (
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <Link to="/app/reports/$reportCode" params={{ reportCode: "item-ledger" }}>
                  <Download className="h-3.5 w-3.5" /> Item Ledger Report
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="gap-1.5" disabled title="Connect backend for export">
                <Download className="h-3.5 w-3.5" /> Export CSV
              </Button>
            )}
          </>
        }
      />
      <PageBody className="space-y-4">
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border bg-card p-3.5 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-medium uppercase tracking-wider">Movements</span>
              <Package className="h-4 w-4 text-primary" />
            </div>
            <div className="text-xl font-bold font-mono">{metrics.count}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3.5 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-medium uppercase tracking-wider">Total Inward</span>
              <ArrowDownRight className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="text-xl font-bold font-mono text-emerald-600">+{metrics.totalInQty}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3.5 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-medium uppercase tracking-wider">Total Outward</span>
              <ArrowUpRight className="h-4 w-4 text-rose-600" />
            </div>
            <div className="text-xl font-bold font-mono text-rose-600">-{metrics.totalOutQty}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3.5 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-medium uppercase tracking-wider">Movement Value</span>
              <DollarSign className="h-4 w-4 text-amber-600" />
            </div>
            <div className="text-xl font-bold font-mono text-foreground">{fmtBDT(metrics.totalValue)}</div>
          </div>
        </div>

        {auditProductId && (
          <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            Filtered to SKU <span className="font-mono font-medium">{auditSku ?? auditProductId}</span>
            <Button variant="outline" size="sm" className="ml-auto" onClick={clearAudit}>Clear filter</Button>
          </div>
        )}
        {isError && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Failed to load stock ledger.
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => refetch()}>Retry</Button>
          </div>
        )}
        <SectionCard>
          <FilterBar>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search by SKU or product name…" className="h-9 pl-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Button variant={typeFilter === undefined ? "default" : "outline"} size="sm" onClick={() => setTypeFilter(undefined)}>All</Button>
            <Button variant={typeFilter === "sale" ? "default" : "outline"} size="sm" onClick={() => setTypeFilter("sale")}>Sales</Button>
            <Button variant={typeFilter === "purchase_receive" ? "default" : "outline"} size="sm" onClick={() => setTypeFilter("purchase_receive")}>GRN</Button>
            <Button variant={typeFilter === "adjustment" ? "default" : "outline"} size="sm" onClick={() => setTypeFilter("adjustment")}>Adjust</Button>
          </FilterBar>
          {isLoading && useApi ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[750px]">
                <thead className="bg-secondary/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3.5 py-2.5 text-left">Timestamp</th>
                    <th className="px-3 py-2.5 text-left">Product & SKU</th>
                    <th className="px-3 py-2.5 text-left">Store</th>
                    <th className="px-3 py-2.5 text-left">Type</th>
                    <th className="px-3 py-2.5 text-right">Qty</th>
                    <th className="px-3 py-2.5 text-right">Unit Price</th>
                    <th className="px-3 py-2.5 text-right">Total Amount</th>
                    <th className="px-3.5 py-2.5 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isEmpty ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-8 text-center text-xs text-muted-foreground">{EMPTY_LIVE_LABEL}</td>
                    </tr>
                  ) : usingDemo ? displayRows.map((l: any, i: number) => {
                    const price = l.price || 0;
                    const total = l.total || (Math.abs(l.qty) * price);
                    return (
                      <tr key={i} className="hover:bg-secondary/30 transition-colors">
                        <td className="px-3.5 py-2 font-mono text-[11px] text-muted-foreground">{l.ts}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-foreground">{l.name || l.sku}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">{l.sku}</div>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{l.store}</td>
                        <td className="px-3 py-2"><Badge variant="outline" className={`text-[9.5px] px-1.5 py-0 ${typeTone[l.type] ?? ""}`}>{l.type}</Badge></td>
                        <td className={`px-3 py-2 text-right tabular font-medium ${l.qty < 0 ? "text-destructive" : "text-success"}`}>{l.qty > 0 ? "+" : ""}{l.qty}</td>
                        <td className="px-3 py-2 text-right tabular text-muted-foreground font-mono">{price > 0 ? fmtBDT(price) : "—"}</td>
                        <td className="px-3 py-2 text-right tabular font-mono font-semibold text-foreground">{total > 0 ? fmtBDT(total) : "—"}</td>
                        <td className="px-3.5 py-2 text-right tabular font-semibold">{l.balance}</td>
                      </tr>
                    );
                  }) : (displayRows as ApiStockLedgerEntry[]).map(l => {
                    const qty = l.in_qty > 0 ? l.in_qty : -l.out_qty;
                    const typeLabel = formatType(l.transaction_type);
                    const unitPrice = l.unit_price || l.unit_cost || 0;
                    const totalAmount = l.total_price || (Math.abs(qty) * unitPrice);
                    const storeDisplayName = l.store_name || (l.store_id ? storeMap.get(l.store_id) || "Main Store" : "Main Store");

                    return (
                      <tr key={l.id} className="hover:bg-secondary/30 transition-colors">
                        <td className="px-3.5 py-2 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                          {l.created_at ? new Date(l.created_at).toLocaleString() : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-foreground">{l.name || l.sku}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">{l.sku}</div>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground font-medium">{storeDisplayName}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={`text-[9.5px] px-1.5 py-0 ${typeTone[l.transaction_type] ?? typeTone[typeLabel] ?? ""}`}>{typeLabel}</Badge>
                        </td>
                        <td className={`px-3 py-2 text-right tabular font-semibold ${qty < 0 ? "text-destructive" : "text-success"}`}>{qty > 0 ? "+" : ""}{qty}</td>
                        <td className="px-3 py-2 text-right tabular font-mono text-muted-foreground">
                          {unitPrice > 0 ? fmtBDT(unitPrice) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular font-mono font-semibold text-foreground">
                          {totalAmount > 0 ? fmtBDT(totalAmount) : "—"}
                        </td>
                        <td className="px-3.5 py-2 text-right tabular font-bold text-foreground">{l.balance_after}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </PageBody>
    </>
  );
}
