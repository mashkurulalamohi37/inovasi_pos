import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader, SectionCard, StatCard } from "@/components/pulse/primitives";
import { LoadingState } from "@/components/pulse/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Gem,
  TrendingUp,
  ShieldCheck,
  RotateCcw,
  BarChart3,
  ArrowRight,
  Tag,
  Scale,
  Factory,
  UserCheck,
  Flame,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { fmtBDT } from "@/lib/pos-data";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useJewelryDashboard, useGoldRate } from "@/hooks/use-industry-data";
import { useJewelryFineGoldPosition } from "@/hooks/use-industry-backoffice";
import { jewelryCertificates, jewelryBuybackMock, jewelryProfilesMock } from "@/lib/industry-mock";

export const Route = createFileRoute("/app/jewelry/dashboard")({
  component: JewelryDashboard,
});

function JewelryDashboard() {
  const useApi = shouldUseBackend();
  const navigate = useNavigate();

  const { data: apiStats, isLoading } = useJewelryDashboard();
  const { data: goldRateData } = useGoldRate();
  const { data: goldPosition } = useJewelryFineGoldPosition();

  const demoRates = {
    "24K": (goldRateData?.selling_rate ?? 12800) * 1.09,
    "22K": goldRateData?.selling_rate ?? 11750,
    "21K": (goldRateData?.selling_rate ?? 11750) * 0.95,
    "18K": (goldRateData?.selling_rate ?? 11750) * 0.81,
    Silver_925: 140,
  };

  const rates =
    useApi && apiStats?.board_rates ? (apiStats.board_rates as Record<string, number>) : demoRates;

  const totalProfiles =
    useApi && apiStats ? Number(apiStats.total_tagged_profiles ?? 0) : jewelryProfilesMock.length;
  const activeCerts =
    useApi && apiStats
      ? Number(apiStats.active_certificates ?? 0)
      : jewelryCertificates.filter((c) => c.valid).length;
  const pendingBuybacks =
    useApi && apiStats
      ? Number(apiStats.pending_buybacks ?? 0)
      : jewelryBuybackMock.filter((b) => b.status !== "settled").length;
  const settledBuybackAmount =
    useApi && apiStats
      ? Number(apiStats.settled_buyback_amount ?? 0)
      : jewelryBuybackMock
          .filter((b) => b.status === "settled")
          .reduce((s, b) => s + b.final_amount, 0);

  if (isLoading && useApi) return <LoadingState />;

  const fineGoldSummary = goldPosition?.summary;
  const fineGoldBreakdown = goldPosition?.breakdown;

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Jewelry Gold Shop ERP Dashboard"
        subtitle="Live fine-gold position, daily metal board rates, factory WIP custody, custom orders, and certificates."
        eyebrow="Jewelry POS & ERP"
      />

      {/* Live Fine Gold Stock Position Summary */}
      {fineGoldSummary && (
        <SectionCard title="Consolidated Fine-Gold Stock Position (24K Pure Metal Equivalent)">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
              <span className="text-xs text-muted-foreground block">Total Enterprise Fine Gold:</span>
              <span className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono block">
                {fineGoldSummary.total_fine_gold_grams.toFixed(3)}g
              </span>
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                {fineGoldSummary.total_fine_gold_bhori?.display_en} ({fineGoldSummary.total_fine_gold_bhori?.display_bn})
              </span>
            </div>
            <div className="p-4 bg-muted/40 border border-border/40 rounded-xl">
              <span className="text-xs text-muted-foreground block">Estimated Asset Value:</span>
              <span className="text-2xl font-black text-slate-800 dark:text-slate-100 font-mono block">
                {fmtBDT(fineGoldSummary.estimated_market_value)}
              </span>
              <span className="text-[11px] text-muted-foreground">
                @ Ref 24K Rate: {fmtBDT(fineGoldSummary.reference_24k_rate)}/g
              </span>
            </div>
            <div className="p-4 bg-muted/40 border border-border/40 rounded-xl">
              <span className="text-xs text-muted-foreground block">Karigar WIP Gold Custody:</span>
              <span className="text-xl font-bold text-blue-600 dark:text-blue-400 font-mono block">
                {fineGoldBreakdown?.karigar_wip_stock?.fine_gold_grams.toFixed(3) || "0.000"}g
              </span>
              <span className="text-xs text-muted-foreground">
                {fineGoldBreakdown?.karigar_wip_stock?.open_jobs_count || 0} Open Factory Jobs
              </span>
            </div>
            <div className="p-4 bg-muted/40 border border-border/40 rounded-xl">
              <span className="text-xs text-muted-foreground block">Old Gold Vault & Melting:</span>
              <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 font-mono block">
                {((fineGoldBreakdown?.old_gold_vault?.fine_gold_grams || 0) + (fineGoldBreakdown?.melting_lots?.fine_gold_grams || 0)).toFixed(3)}g
              </span>
              <span className="text-xs text-muted-foreground">
                Trade-in & Recovery Bullion
              </span>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Today's Board Rate Banner */}
      <SectionCard title="Today's Metal Board Rates (per gram)">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { karat: "24K Gold", rate: rates["24K"] ?? 12800, purity: "99.9%", highlight: true },
            { karat: "22K Gold", rate: rates["22K"] ?? 11750, purity: "91.6%", highlight: true },
            { karat: "21K Gold", rate: rates["21K"] ?? 11150, purity: "87.5%", highlight: false },
            { karat: "18K Gold", rate: rates["18K"] ?? 9550, purity: "75.0%", highlight: false },
            {
              karat: "925 Silver",
              rate: rates["Silver_925"] ?? 140,
              purity: "92.5%",
              highlight: false,
            },
          ].map(({ karat, rate, purity, highlight }) => (
            <div
              key={karat}
              className={`p-3.5 rounded-xl border transition-all ${
                highlight
                  ? "bg-gradient-to-br from-amber-500/10 to-yellow-500/10 border-amber-400/40"
                  : "bg-muted/30 border-border/40"
              }`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-semibold">{karat}</span>
                <Badge variant="outline" className="text-[10px] py-0">
                  {purity}
                </Badge>
              </div>
              <p className="text-xl font-bold">{fmtBDT(Math.round(rate))}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                ≈ {fmtBDT(Math.round(rate * 11.664))} / Bhori
              </p>
            </div>
          ))}
        </div>
        <div className="pt-3 border-t mt-3 flex justify-between items-center text-xs text-muted-foreground">
          <span>Rates are synchronized across POS terminals and custom order quotes in real time.</span>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-xs"
            onClick={() => navigate({ to: "/app/jewelry/gold-rate" })}
          >
            Manage rates & history <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </SectionCard>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Tagged Profiles"
          value={String(totalProfiles)}
          icon={<Tag className="w-5 h-5 text-amber-400" />}
        />
        <StatCard
          label="Active Certificates"
          value={String(activeCerts)}
          icon={<ShieldCheck className="w-5 h-5 text-emerald-400" />}
        />
        <StatCard
          label="Pending Buybacks"
          value={String(pendingBuybacks)}
          icon={<RotateCcw className="w-5 h-5 text-blue-400" />}
        />
        <StatCard
          label="Old Gold Settled"
          value={fmtBDT(settledBuybackAmount)}
          icon={<TrendingUp className="w-5 h-5 text-violet-400" />}
        />
      </div>

      {/* Quick Actions ERP Modules */}
      <SectionCard title="Jewelry ERP Modules">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {[
            {
              label: "Jewelry POS",
              icon: BarChart3,
              to: "/app/pos/jewelry",
              color: "text-amber-500",
            },
            {
              label: "Custom Orders",
              icon: ShoppingBag,
              to: "/app/jewelry/orders",
              color: "text-purple-500",
            },
            {
              label: "Factory WIP",
              icon: Factory,
              to: "/app/jewelry/factory",
              color: "text-blue-500",
            },
            {
              label: "Karigars & Ledger",
              icon: UserCheck,
              to: "/app/jewelry/karigars",
              color: "text-emerald-500",
            },
            {
              label: "Melting & Recovery",
              icon: Flame,
              to: "/app/jewelry/melting",
              color: "text-rose-500",
            },
            {
              label: "Barcode Tags",
              icon: Tag,
              to: "/app/jewelry/tags",
              color: "text-amber-600",
            },
            {
              label: "Daily Rates",
              icon: TrendingUp,
              to: "/app/jewelry/gold-rate",
              color: "text-yellow-500",
            },
            {
              label: "Certificates",
              icon: ShieldCheck,
              to: "/app/jewelry/certificate",
              color: "text-teal-500",
            },
            {
              label: "Buyback & Credits",
              icon: RotateCcw,
              to: "/app/jewelry/buyback",
              color: "text-indigo-500",
            },
          ].map(({ label, icon: Icon, to, color }) => (
            <Button
              key={to}
              variant="outline"
              className="flex flex-col h-20 gap-2 items-center justify-center hover:border-amber-400 transition-colors"
              onClick={() => navigate({ to })}
            >
              <Icon className={`w-5 h-5 ${color}`} />
              <span className="text-xs font-semibold text-center">{label}</span>
            </Button>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

