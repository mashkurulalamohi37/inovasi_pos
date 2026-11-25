import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, SectionCard, StatCard } from "@/components/pulse/primitives";
import { LoadingState } from "@/components/pulse/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";
import {
  Cpu,
  ShieldCheck,
  AlertTriangle,
  FileText,
  TrendingUp,
  CreditCard,
  Clock,
  CheckCircle2,
  BarChart3,
  ArrowRight,
} from "lucide-react";
import { fmtBDT } from "@/lib/pos-data";
import { shouldUseBackend } from "@/lib/demo-mode";
import {
  useElectronicsDashboard,
  useElectronicsRma,
  useElectronicsWarranties,
} from "@/hooks/use-api-config";
import {
  electronicsCatalog,
  electronicsSerials,
  warrantyRegistrations,
  emiSchedules,
  amcContracts,
} from "@/lib/industry-mock";

export const Route = createFileRoute("/app/electronics/dashboard")({
  component: ElectronicsDashboard,
});

const SERIAL_STATUS_COLORS: Record<string, string> = {
  available: "bg-emerald-500",
  sold: "bg-blue-500",
  rma: "bg-red-500",
  reserved: "bg-amber-500",
  warranty: "bg-violet-500",
  damaged: "bg-rose-700",
};

function ElectronicsDashboard() {
  const useApi = shouldUseBackend();
  const navigate = useNavigate();

  const { data: apiStats, isLoading: statsLoading } = useElectronicsDashboard();
  const { data: apiRma } = useElectronicsRma();
  const { data: apiWarranties } = useElectronicsWarranties();

  // --- Demo mode stats ---
  const demoTotalSerials = electronicsSerials.length + 8; // + unseen
  const demoAvailable = electronicsSerials.filter((s) => s.status === "in-stock").length;
  const demoSold = electronicsSerials.filter((s) => s.status === "sold").length;
  const demoActiveWarranties = warrantyRegistrations.length;
  const demoOpenRma = 0;
  const demoEmiOutstanding = emiSchedules
    .filter((e) => e.status === "active")
    .reduce((s, e) => s + (e.total_payable - e.total_collected), 0);
  const demoEmiOverdue = emiSchedules
    .flatMap((e) => e.installments)
    .filter((i) => i.status === "overdue").length;
  const demoExpiringSoon = amcContracts.filter((a) => {
    const end = new Date(a.end_date);
    const now = new Date();
    const diff = (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 30;
  }).length;

  const stats =
    useApi && apiStats
      ? {
          totalSerials: (apiStats.total_serials as number) ?? 0,
          serialStatus: (apiStats.serial_status as Record<string, number>) ?? {},
          activeWarranties: (apiStats.active_warranties as number) ?? 0,
          expiringWarranty30d: (apiStats.expiring_warranty_30d as number) ?? 0,
          openRma: (apiStats.open_rma as number) ?? 0,
          emiOutstanding: (apiStats.emi_outstanding as number) ?? 0,
          emiOverdueCount: (apiStats.emi_overdue_count as number) ?? 0,
          activeEmiCount: (apiStats.active_emi_count as number) ?? 0,
        }
      : {
          totalSerials: demoTotalSerials,
          serialStatus: { available: demoAvailable, sold: demoSold },
          activeWarranties: demoActiveWarranties,
          expiringWarranty30d: demoExpiringSoon,
          openRma: demoOpenRma,
          emiOutstanding: demoEmiOutstanding,
          emiOverdueCount: demoEmiOverdue,
          activeEmiCount: emiSchedules.filter((e) => e.status === "active").length,
        };

  // Recent RMA rows
  const recentRma = useApi && apiRma ? (apiRma as Array<Record<string, unknown>>).slice(0, 5) : [];

  // Expiring warranties — normalised to one shape so the row renderer is source-agnostic
  const expiringWarranties: Array<{
    id: string;
    serial: string;
    product: string;
    expires: string;
  }> =
    useApi && apiWarranties
      ? (apiWarranties as Array<Record<string, unknown>>)
          .filter((w) => {
            const end = w.warranty_end_date as string | null;
            if (!end) return false;
            const diff = (new Date(end).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
            return diff >= 0 && diff <= 30;
          })
          .slice(0, 5)
          .map((w) => ({
            id: String(w.id ?? w.warranty_no ?? ""),
            serial: String(w.serial_no ?? w.serial_imei ?? ""),
            product: String(w.product_name ?? ""),
            expires: String(w.warranty_end_date ?? ""),
          }))
      : warrantyRegistrations
          .filter((w) => {
            const diff = (new Date(w.expires).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
            return diff >= 0 && diff <= 30;
          })
          .slice(0, 5)
          .map((w) => ({ id: w.id, serial: w.serial, product: w.product, expires: w.expires }));

  if (statsLoading && useApi) return <LoadingState />;

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        eyebrow="Electronics"
        title="Electronics Dashboard"
        subtitle="Overview · serial stock, warranties, EMI & RMA health"
      />

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total serials"
          value={String(stats.totalSerials)}
          icon={<Cpu className="w-5 h-5 text-blue-400" />}
        />
        <StatCard
          label="Active warranties"
          value={String(stats.activeWarranties)}
          icon={<ShieldCheck className="w-5 h-5 text-emerald-400" />}
          hint={
            stats.expiringWarranty30d > 0
              ? `${stats.expiringWarranty30d} expiring in 30d`
              : undefined
          }
        />
        <StatCard
          label="Open RMAs"
          value={String(stats.openRma)}
          icon={<AlertTriangle className="w-5 h-5 text-rose-400" />}
        />
        <StatCard
          label="EMI outstanding"
          value={fmtBDT(stats.emiOutstanding)}
          icon={<CreditCard className="w-5 h-5 text-violet-400" />}
          hint={stats.emiOverdueCount > 0 ? `${stats.emiOverdueCount} overdue` : undefined}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Serial status breakdown */}
        <SectionCard title="Serial Stock Status">
          <div className="space-y-3">
            {Object.entries(stats.serialStatus).map(([status, count]) => {
              const pct =
                stats.totalSerials > 0 ? Math.round((count / stats.totalSerials) * 100) : 0;
              return (
                <div key={status} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="capitalize text-muted-foreground">{status}</span>
                    <span className="font-medium">
                      {count} <span className="text-muted-foreground text-xs">({pct}%)</span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${SERIAL_STATUS_COLORS[status] ?? "bg-slate-400"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {Object.keys(stats.serialStatus).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No serial data yet</p>
            )}
          </div>
          <div className="pt-3 border-t mt-3">
            <Button
              variant="ghost"
              size="sm"
              className="w-full gap-1 text-muted-foreground"
              onClick={() => navigate({ to: "/app/electronics/serials" })}
            >
              View all serials <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </SectionCard>

        {/* EMI Health */}
        <SectionCard title="EMI Health">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground mb-1">Active agreements</p>
              <p className="text-2xl font-bold">{stats.activeEmiCount}</p>
            </div>
            <div
              className={`rounded-lg p-3 ${stats.emiOverdueCount > 0 ? "bg-rose-50 dark:bg-rose-900/20" : "bg-muted/50"}`}
            >
              <p className="text-xs text-muted-foreground mb-1">Overdue installments</p>
              <p
                className={`text-2xl font-bold ${stats.emiOverdueCount > 0 ? "text-rose-500" : ""}`}
              >
                {stats.emiOverdueCount}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm p-3 rounded-lg bg-muted/30">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4" /> Total outstanding
            </span>
            <span className="font-semibold">{fmtBDT(stats.emiOutstanding)}</span>
          </div>
          <div className="pt-3 border-t mt-3">
            <Button
              variant="ghost"
              size="sm"
              className="w-full gap-1 text-muted-foreground"
              onClick={() => navigate({ to: "/app/electronics/emi" })}
            >
              Manage EMI schedules <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expiring warranties */}
        <SectionCard title="Warranties Expiring in 30 Days">
          {expiringWarranties.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              <p className="text-sm">No warranties expiring soon</p>
            </div>
          ) : (
            <div className="space-y-2">
              {expiringWarranties.map((w, i) => (
                <div
                  key={w.id || i}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-800/30"
                >
                  <div>
                    <p className="text-sm font-medium">{w.serial}</p>
                    <p className="text-xs text-muted-foreground">{w.product}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant="warning" className="text-xs">
                      <Clock className="w-3 h-3 mr-1" />
                      {w.expires.slice(0, 10)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="pt-3 border-t mt-3">
            <Button
              variant="ghost"
              size="sm"
              className="w-full gap-1 text-muted-foreground"
              onClick={() => navigate({ to: "/app/electronics/warranty" })}
            >
              View warranty registry <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </SectionCard>

        {/* Recent RMA */}
        <SectionCard title="Recent RMA Activity">
          {recentRma.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              <p className="text-sm">No open RMAs</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentRma.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40"
                >
                  <div>
                    <p className="text-sm font-medium">{String(r.rma_no ?? "")}</p>
                    <p className="text-xs text-muted-foreground">
                      {String(r.customer_name ?? "")} · {String(r.serial_imei ?? "")}
                    </p>
                  </div>
                  <Badge
                    variant={
                      r.status === "closed"
                        ? "secondary"
                        : r.status === "replacement_approved"
                          ? "success"
                          : "outline"
                    }
                    className="text-xs capitalize"
                  >
                    {String(r.status ?? "").replace(/_/g, " ")}
                  </Badge>
                </div>
              ))}
            </div>
          )}
          <div className="pt-3 border-t mt-3">
            <Button
              variant="ghost"
              size="sm"
              className="w-full gap-1 text-muted-foreground"
              onClick={() => navigate({ to: "/app/electronics/warranty" })}
            >
              View RMA registry <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </SectionCard>
      </div>

      {/* Quick actions */}
      <SectionCard title="Quick Actions">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {[
            { label: "POS", icon: BarChart3, to: "/app/pos/electronics", color: "text-blue-400" },
            {
              label: "Serial Stock",
              icon: Cpu,
              to: "/app/electronics/serials",
              color: "text-slate-400",
            },
            {
              label: "Warranty/RMA",
              icon: ShieldCheck,
              to: "/app/electronics/warranty",
              color: "text-emerald-400",
            },
            { label: "AMC", icon: FileText, to: "/app/electronics/amc", color: "text-amber-400" },
            {
              label: "EMI Schedules",
              icon: CreditCard,
              to: "/app/electronics/emi",
              color: "text-violet-400",
            },
          ].map(({ label, icon: Icon, to, color }) => (
            <Button
              key={to}
              variant="outline"
              className="flex flex-col h-20 gap-2"
              onClick={() => navigate({ to })}
            >
              <Icon className={`w-5 h-5 ${color}`} />
              <span className="text-xs">{label}</span>
            </Button>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
