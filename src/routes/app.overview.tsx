import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, PageBody, StatCard, SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Activity, ArrowRight, BarChart3, Boxes, DollarSign,
  ShoppingCart, TrendingUp, AlertTriangle, Shirt, Gem, Sparkles, Utensils, Pill,
} from "lucide-react";
import { salesTrend, salesInvoices, lowStock } from "@/lib/mock-extra";
import { stores, fmtBDT } from "@/lib/pos-data";
import { AreaChart, Area, ResponsiveContainer, XAxis, Tooltip, BarChart, Bar, CartesianGrid, YAxis } from "recharts";
import { isDemoMode, shouldUseBackend } from "@/lib/demo-mode";
import { useAuth } from "@/lib/auth-provider";
import { useApp } from "@/lib/app-store";
import {
  useApiPacks,
  useDashboardKpi,
  useFashionDashboardKpi,
  useSalesHistory,
  useLowStock,
  useApiStores,
} from "@/hooks/use-api-config";
import { useState } from "react";
import { getStoredLowStockThreshold } from "@/lib/stock-utils";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";
import { LoadingState } from "@/components/pulse/states";
import { IndustryKpiWidget } from "@/features/dashboard/IndustryKpiWidget";
import { QuickActionCenter } from "@/features/dashboard/QuickActionCenter";

export const Route = createFileRoute("/app/overview")({ component: Overview });

function Overview() {
  const useApi = shouldUseBackend();
  const demo = isDemoMode();
  const { user } = useAuth();
  const { posMode, goldRatePerGram } = useApp();
  const storeId = user?.store_id ?? undefined;
  const packsQuery = useApiPacks(useApi);
  const fashionPackOn = Boolean(
    packsQuery.data?.some((p) => p.industry_code === "fashion" && p.enabled_company),
  );
  const kpiQuery = useDashboardKpi(useApi, storeId);
  const fashionKpiQuery = useFashionDashboardKpi(useApi && fashionPackOn, storeId);
  const salesQuery = useSalesHistory(undefined, storeId);
  const [threshold] = useState(() => getStoredLowStockThreshold());
  const lowStockQuery = useLowStock(threshold, storeId);
  const storesQuery = useApiStores();

  const displayStores = useApi
    ? (storesQuery.data ?? []).map(s => ({
        code: s.code,
        name: s.name,
        subtitle: s.address || "Active outlet",
        online: s.is_active,
      }))
    : stores.map(s => ({
        code: s.code,
        name: s.name,
        subtitle: `${s.code} · ${s.counters} counters`,
        online: s.online,
      }));

  const kpi = kpiQuery.data;
  const fashionKpi = fashionKpiQuery.data;
  const salesToday = useApi ? (kpi?.today_sales ?? 0) : 142800;
  const todayCollection = useApi ? (kpi?.today_collection ?? 0) : 0;
  const todayPurchase = useApi ? (kpi?.today_purchase ?? 0) : 0;
  const stockValue = useApi ? (kpi?.current_stock_value ?? 0) : 8240000;
  const lowStockCount = useApi ? (kpi?.low_stock_count ?? lowStockQuery.data?.length ?? 0) : lowStock.length;
  const supplierDue = useApi ? (kpi?.supplier_due ?? 0) : 0;
  const customerDue = useApi ? (kpi?.customer_due ?? 0) : 0;

  const apiSales = salesQuery.data ?? [];
  const recentRows = useApi
    ? apiSales.slice(0, 5).map(s => ({
        id: s.id,
        invoice: s.invoice_number,
        store: "—",
        tender: s.tender,
        total: s.total,
        status: "paid" as const,
      }))
    : salesInvoices.slice(0, 5);

  const topProducts = useApi
    ? (kpi?.top_selling_products ?? []).slice(0, 5).map(r => ({
        name: r.name,
        units: 0,
        rev: r.revenue,
      }))
    : [
        { name: "Oxford Button-Down · M · White", units: 142, rev: 353580 },
        { name: "Napa 500mg · 10s", units: 1280, rev: 15360 },
        { name: "Premium Beef Shoulder", units: 97, rev: 82450 },
      ];

  const chartData = useApi
    ? (kpi?.monthly_sales_trend ?? []).map(d => ({
        day: d.date.slice(5),
        revenue: d.sales,
        orders: 0,
      }))
    : salesTrend;

  const paymentChart = useApi
    ? (kpi?.sales_by_payment_method ?? []).map(p => ({ method: p.method, amount: p.amount }))
    : [];

  const hasLiveKpi = useApi && !kpiQuery.isLoading && kpiQuery.isSuccess;

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title={`Good afternoon, ${user?.full_name?.split(" ")[0] ?? "there"}`}
        subtitle={useApi ? "Live dashboard from PostgreSQL" : "Demo dashboard — sample metrics"}
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <Link to="/app/reports"><BarChart3 className="h-3.5 w-3.5" /> Reports</Link>
            </Button>
            <Button asChild size="sm" className="gap-1.5">
              <Link to="/app/pos"><ShoppingCart className="h-3.5 w-3.5" /> Open POS</Link>
            </Button>
          </>
        }
      />
      <PageBody className="space-y-6">
        {useApi && kpiQuery.isLoading ? (
          <LoadingState rows={2} label="Loading live KPIs…" />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Sales today" value={fmtBDT(salesToday)} delta={hasLiveKpi ? `Collection ${fmtBDT(todayCollection)}` : "+18.2%"} deltaTone="up" hint={hasLiveKpi ? "from API" : "demo"} icon={<DollarSign className="h-4 w-4" />} />
          <StatCard label="Purchase today" value={fmtBDT(todayPurchase)} hint={hasLiveKpi ? "posted POs" : "demo"} icon={<TrendingUp className="h-4 w-4" />} />
          <StatCard label="Inventory value" value={fmtBDT(stockValue)} hint="stock balance costing" icon={<Boxes className="h-4 w-4" />} />
          <StatCard label="Low stock alerts" value={String(lowStockCount)} delta={hasLiveKpi ? "live count" : "−3"} deltaTone="up" hint="below threshold" icon={<AlertTriangle className="h-4 w-4" />} />
        </div>

        {useApi && apiSales.length === 0 && (
          <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-background p-5 sm:p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary text-xs mb-1.5">
                  Welcome to Inovasi POS
                </Badge>
                <h2 className="font-display text-lg sm:text-xl font-bold text-foreground">Getting Started: 3 Steps to Your First Sale</h2>
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Follow these recommended steps to set up your store catalog and start ringing up orders.</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border/80 bg-background/80 p-4 flex flex-col justify-between hover:border-primary/40 transition-colors">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
                    <h3 className="font-semibold text-sm">Add Products</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">Create items, import barcodes, and set initial cost and retail prices.</p>
                </div>
                <Button asChild size="sm" variant="outline" className="mt-4 w-full text-xs">
                  <Link to="/app/products">Open Products →</Link>
                </Button>
              </div>

              <div className="rounded-xl border border-border/80 bg-background/80 p-4 flex flex-col justify-between hover:border-primary/40 transition-colors">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
                    <h3 className="font-semibold text-sm">Configure Taxes & Stores</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">Set your default VAT rate, VAT inclusive toggle, and branch profile.</p>
                </div>
                <Button asChild size="sm" variant="outline" className="mt-4 w-full text-xs">
                  <Link to="/app/settings">Open Settings →</Link>
                </Button>
              </div>

              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex flex-col justify-between hover:border-primary/50 transition-colors">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
                    <h3 className="font-semibold text-sm">Open POS Lane</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">Ring up sales, scan barcodes, print receipts, and track live cashier shifts.</p>
                </div>
                <Button asChild size="sm" className="mt-4 w-full text-xs font-bold">
                  <Link to="/app/pos">Launch POS →</Link>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Quick Operations Command Center */}
        <QuickActionCenter posMode={posMode} />

        {/* Dynamic Industry Vertical Telemetry Widget */}
        <IndustryKpiWidget
          posMode={posMode}
          salesToday={salesToday}
          goldRatePerGram={goldRatePerGram}
          fashionKpi={fashionKpi}
          fashionLoading={fashionKpiQuery.isLoading}
        />

        {useApi && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Supplier due" value={fmtBDT(supplierDue)} hint="AP outstanding" />
            <StatCard label="Customer due" value={fmtBDT(customerDue)} hint="AR outstanding" />
            <StatCard
              label="Stock in / out today"
              value={`${kpi?.stock_movement_summary?.in_qty ?? 0} / ${kpi?.stock_movement_summary?.out_qty ?? 0}`}
              hint="ledger movements"
            />
            {kpi?.today_expense == null ? (
              <div className="flex items-center rounded-xl border border-border bg-card p-4">
                <DisabledReasonButton label="Expense today" reason={kpi?.today_expense_reason ?? "Expense module not available"} />
              </div>
            ) : (
              <StatCard label="Expense today" value={fmtBDT(kpi.today_expense)} />
            )}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <SectionCard className="lg:col-span-2" title="Monthly sales trend" description={hasLiveKpi ? "Current month by day" : "Demo trend"}
            actions={<Badge variant="secondary" className="text-[10px]">MTD</Badge>}>
            <div className="h-[260px] w-full px-2 pb-3">
              {chartData.length === 0 ? (
                <div className="grid h-full place-items-center text-sm text-muted-foreground">No sales data yet</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.918 0.013 247)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "10px",
                        backgroundColor: "var(--card)",
                        borderColor: "var(--border)",
                        fontSize: "12px",
                        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)",
                      }}
                      formatter={(v: number) => [fmtBDT(v), "Revenue"]}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="var(--primary)" strokeWidth={2.5} fill="url(#rev)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Sales by payment method" description="Current month">
            <div className="h-[260px] w-full px-2 pb-3">
              {useApi && paymentChart.length === 0 ? (
                <div className="grid h-full place-items-center text-sm text-muted-foreground">No payment data</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={useApi ? paymentChart : chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.918 0.013 247)" vertical={false} />
                    <XAxis dataKey={useApi ? "method" : "day"} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v / 1000}k`} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "10px",
                        backgroundColor: "var(--card)",
                        borderColor: "var(--border)",
                        fontSize: "12px",
                        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)",
                      }}
                      formatter={(v: number) => [fmtBDT(v), useApi ? "Amount" : "Orders"]}
                    />
                    <Bar dataKey={useApi ? "amount" : "orders"} fill="var(--brand-2)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </SectionCard>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <SectionCard className="lg:col-span-2" title={demo ? "Top selling products" : "Top selling products (MTD)"} description={demo ? "Today" : "From sales lines"}>
            <div className="divide-y divide-border">
              {topProducts.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">No data yet</div>
              ) : topProducts.map((p, i) => (
                <div key={p.name} className="flex items-center gap-3 px-5 py-3">
                  <div className="grid h-8 w-8 place-items-center rounded-md bg-primary/10 font-mono text-xs font-semibold text-primary">{i + 1}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{p.name}</div>
                    {p.units > 0 && <div className="text-xs text-muted-foreground">{p.units} units</div>}
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular">{fmtBDT(p.rev)}</div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Alerts" description="Needs attention">
            <div className="space-y-2.5 p-4">
              {lowStockCount > 0 ? (
                <div className="flex gap-3 rounded-lg border border-warning/20 bg-warning/5 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <div className="min-w-0 text-xs">
                    <div className="font-medium text-foreground">{lowStockCount} SKUs below reorder point</div>
                    <div className="text-muted-foreground">Review inventory and purchasing</div>
                  </div>
                </div>
              ) : null}
              {useApi && (supplierDue > 0 || customerDue > 0) && (
                <div className="flex gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <Activity className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 text-xs">
                    <div className="font-medium text-foreground">Outstanding balances</div>
                    <div className="text-muted-foreground">Supplier {fmtBDT(supplierDue)} · Customer {fmtBDT(customerDue)}</div>
                  </div>
                </div>
              )}
            </div>
          </SectionCard>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <SectionCard title="Recent transactions" className="lg:col-span-2" actions={
            <Button asChild variant="ghost" size="sm" className="gap-1 text-xs"><Link to="/app/sales">View all <ArrowRight className="h-3 w-3" /></Link></Button>
          }>
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 text-left font-medium">Invoice</th>
                  <th className="px-3 py-2.5 text-left font-medium">Tender</th>
                  <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-5 py-2.5 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentRows.length === 0 ? (
                  <tr><td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">No sales yet — complete a POS sale</td></tr>
                ) : recentRows.map(s => (
                  <tr key={s.id} className="hover:bg-secondary/30">
                    <td className="px-5 py-3 font-mono text-xs">{s.invoice}</td>
                    <td className="px-3 py-3 text-muted-foreground">{s.tender}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular">{fmtBDT(s.total)}</td>
                    <td className="px-5 py-3 text-right"><StatusBadge status={s.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>

          <SectionCard title="Store performance" description="Configured stores">
            <div className="space-y-3 p-4">
              {displayStores.length === 0 && useApi && storesQuery.isLoading ? (
                <div className="text-center text-xs text-muted-foreground py-4">Loading stores...</div>
              ) : displayStores.length === 0 ? (
                <div className="text-center text-xs text-muted-foreground py-4">No configured stores found</div>
              ) : displayStores.map(s => (
                <div key={s.code} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">{s.name}</div>
                      <div className="text-[11px] text-muted-foreground">{s.subtitle}</div>
                    </div>
                    <Badge variant="outline" className={s.online ? "border-success/30 bg-success/10 text-success" : "border-destructive/30 bg-destructive/10 text-destructive"}>
                      {s.online ? "online" : "offline"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </PageBody>
    </>
  );
}
