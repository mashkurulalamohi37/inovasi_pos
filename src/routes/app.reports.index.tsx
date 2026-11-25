import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, PageBody } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  BarChart3, FileSpreadsheet, RefreshCw, AlertCircle, ChevronRight, Search,
  ShoppingCart, Boxes, Truck, Wallet, TrendingUp, Sparkles, Filter, CheckCircle2,
  Clock, FileText, Lock, ArrowUpRight
} from "lucide-react";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useAuth } from "@/lib/auth-provider";
import { LoadingState, ErrorState } from "@/components/pulse/states";
import { useReportExports, useReportsCatalog } from "@/hooks/use-api-config";

export const Route = createFileRoute("/app/reports/")({ component: ReportsCatalog });

const REPORT_CATEGORY_MAP: Record<string, { label: string; icon: typeof BarChart3; color: string; bg: string }> = {
  sales: { label: "Sales & Collection", icon: ShoppingCart, color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20" },
  inventory: { label: "Inventory & Stock", icon: Boxes, color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/20" },
  purchases: { label: "Purchases & Goods", icon: Truck, color: "text-purple-500", bg: "bg-purple-500/10 border-purple-500/20" },
  finance: { label: "Financials & Margins", icon: Wallet, color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/20" },
  industry: { label: "Industry Vertical", icon: TrendingUp, color: "text-rose-500", bg: "bg-rose-500/10 border-rose-500/20" },
};

function getReportCategory(key: string): string {
  if (key.includes("sales") || key.includes("collection") || key.includes("cashier") || key.includes("due-customer")) return "sales";
  if (key.includes("stock") || key.includes("inventory") || key.includes("item-ledger")) return "inventory";
  if (key.includes("purchase") || key.includes("grn") || key.includes("supplier")) return "purchases";
  if (key.includes("margin") || key.includes("profit") || key.includes("expense") || key.includes("account") || key.includes("kpi")) return "finance";
  return "industry";
}

function ReportsCatalog() {
  const useApi = shouldUseBackend();
  const { can } = useAuth();
  const catalogQuery = useReportsCatalog(useApi);
  const exportsQuery = useReportExports(useApi && can("reports.export"));
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const reports = catalogQuery.data ?? [];

  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      const matchesSearch =
        r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.key.toLowerCase().includes(searchQuery.toLowerCase());
      
      const cat = getReportCategory(r.key);
      const matchesCategory = selectedCategory === "all" || cat === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [reports, searchQuery, selectedCategory]);

  return (
    <>
      <PageHeader
        eyebrow="Insights & Analytics"
        title="Report catalog"
        subtitle={useApi ? "Real-time tenant reporting with audit trails and PDF/Excel export" : "Connect backend for live reports"}
        actions={useApi ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 border-teal-500/30 hover:bg-teal-500/10" asChild>
              <Link to="/app/reports/custom">
                <Sparkles className="h-3.5 w-3.5 text-teal-500" /> Custom Reports
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => catalogQuery.refetch()} disabled={catalogQuery.isFetching}>
              <RefreshCw className={`h-3.5 w-3.5 ${catalogQuery.isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        ) : undefined}
      />

      <PageBody className="space-y-6">
        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card/60 backdrop-blur-md p-3.5 rounded-2xl border border-border/60 shadow-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search reports by name, keyword, or module..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 text-xs bg-background/80 border-border/50 focus-visible:ring-teal-500/30"
            />
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <Button
              variant={selectedCategory === "all" ? "default" : "ghost"}
              size="sm"
              onClick={() => setSelectedCategory("all")}
              className="h-8 text-xs px-3 rounded-lg"
            >
              All ({reports.length})
            </Button>
            {Object.entries(REPORT_CATEGORY_MAP).map(([catKey, catInfo]) => {
              const count = reports.filter(r => getReportCategory(r.key) === catKey).length;
              if (count === 0) return null;
              const Icon = catInfo.icon;
              return (
                <Button
                  key={catKey}
                  variant={selectedCategory === catKey ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(catKey)}
                  className={`h-8 text-xs px-2.5 rounded-lg gap-1.5 transition-all ${selectedCategory === catKey ? "" : "border-border/40 text-muted-foreground hover:text-foreground"}`}
                >
                  <Icon className={`h-3.5 w-3.5 ${catInfo.color}`} />
                  <span className="hidden md:inline">{catInfo.label.split(" ")[0]}</span>
                  <span className="text-[10px] opacity-70">({count})</span>
                </Button>
              );
            })}
          </div>
        </div>

        {/* States */}
        {!useApi && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Reports require backend mode. Sign in with API enabled to run tenant-safe reports.
          </div>
        )}
        {useApi && catalogQuery.isError && (
          <ErrorState title="Failed to load catalog" onRetry={() => catalogQuery.refetch()} />
        )}
        {useApi && catalogQuery.isLoading && <LoadingState rows={6} />}

        {/* Reports Grid */}
        {useApi && !catalogQuery.isLoading && (
          <>
            {filteredReports.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-border/60 rounded-2xl bg-card/20">
                <Search className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                <h3 className="text-sm font-semibold text-foreground">No reports match your search</h3>
                <p className="text-xs text-muted-foreground mt-1">Try searching with a different term or clear filters</p>
                <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(""); setSelectedCategory("all"); }} className="mt-3 text-xs">
                  Clear search
                </Button>
              </div>
            ) : (
              <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                {filteredReports.map((r) => {
                  const allowed = can(r.permission as Parameters<typeof can>[0]);
                  const catKey = getReportCategory(r.key);
                  const catInfo = REPORT_CATEGORY_MAP[catKey] || REPORT_CATEGORY_MAP.sales;
                  const Icon = catInfo.icon;

                  const CardContentBody = (
                    <Card
                      className={`group relative flex flex-col justify-between overflow-hidden rounded-xl border border-border/60 bg-card/90 transition-all duration-200 ${
                        allowed
                          ? "cursor-pointer hover:-translate-y-1 hover:border-teal-500/50 hover:bg-card hover:shadow-lg hover:shadow-teal-500/5"
                          : "opacity-75"
                      }`}
                    >
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${catInfo.bg} shadow-xs group-hover:scale-105 transition-transform`}>
                              <Icon className={`h-4 w-4 ${catInfo.color}`} />
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-foreground group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors line-clamp-1">
                                {r.name}
                              </h4>
                              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                {catInfo.label.split(" ")[0]}
                              </span>
                            </div>
                          </div>

                          {r.priority === "P0" ? (
                            <Badge className="text-[9px] h-4 px-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-semibold shrink-0">
                              Core P0
                            </Badge>
                          ) : r.advanced ? (
                            <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-teal-500/30 text-teal-600 dark:text-teal-400 shrink-0">
                              Advanced
                            </Badge>
                          ) : null}
                        </div>

                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed h-8">
                          {r.description}
                        </p>

                        <div className="flex items-center justify-between pt-2 border-t border-border/40 text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Multi-format
                          </span>
                          {allowed ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-600 dark:text-teal-400 group-hover:translate-x-0.5 transition-transform">
                              Open Report <ArrowUpRight className="h-3.5 w-3.5" />
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-muted-foreground font-medium">
                              <Lock className="h-3 w-3" /> Locked
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );

                  return allowed ? (
                    <Link key={r.key} to="/app/reports/$reportCode" params={{ reportCode: r.key }} className="block h-full no-underline">
                      {CardContentBody}
                    </Link>
                  ) : (
                    <div key={r.key} className="h-full">
                      {CardContentBody}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Recent Exports Table */}
        {useApi && can("reports.export") && (exportsQuery.data ?? []).length > 0 && (
          <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-teal-500" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Recent export audit log</h3>
              </div>
              <span className="text-[10px] text-muted-foreground">Server-side audit trail</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-secondary/40 text-[10px] uppercase tracking-wide text-muted-foreground rounded-lg">
                  <tr>
                    <th className="px-3 py-2 text-left">Report Key</th>
                    <th className="px-3 py-2 text-right">Rows</th>
                    <th className="px-3 py-2 text-right">Exported At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {(exportsQuery.data ?? []).slice(0, 6).map((row) => (
                    <tr key={row.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="px-3 py-2 font-mono text-foreground font-medium">{row.report_key}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{row.row_count}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        {row.completed_at ? new Date(row.completed_at).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}
