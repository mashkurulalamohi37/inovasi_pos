import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, PageBody, SectionCard, StatCard } from "@/components/pulse/primitives";
import { PermissionGate } from "@/components/pulse/gates";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, AlertTriangle, UserX, FileText, CheckCircle2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { fmtBDT } from "@/lib/pos-data";

export const Route = createFileRoute("/app/super-shop/loss-prevention")({
  component: SuperShopLossPreventionPage,
});

type CashierAuditMetric = {
  cashierId: string;
  cashierName: string;
  lane: string;
  voidCount: number;
  postSubtotalVoids: number;
  manualWeightCount: number;
  priceOverrides: number;
  cashVariance: number;
  status: "normal" | "flagged";
};

const CASHIER_AUDITS: CashierAuditMetric[] = [
  {
    cashierId: "c-01",
    cashierName: "Tanvir Ahmed",
    lane: "Lane 01 (Express)",
    voidCount: 4,
    postSubtotalVoids: 1,
    manualWeightCount: 0,
    priceOverrides: 0,
    cashVariance: -20,
    status: "normal",
  },
  {
    cashierId: "c-02",
    cashierName: "Nasreen Sultana",
    lane: "Lane 02 (General)",
    voidCount: 14,
    postSubtotalVoids: 6,
    manualWeightCount: 8,
    priceOverrides: 3,
    cashVariance: -450,
    status: "flagged",
  },
  {
    cashierId: "c-03",
    cashierName: "Hasan Mahmud",
    lane: "Lane 03 (Produce)",
    voidCount: 3,
    postSubtotalVoids: 0,
    manualWeightCount: 2,
    priceOverrides: 1,
    cashVariance: 10,
    status: "normal",
  },
];

function SuperShopLossPreventionPage() {
  const [audits] = useState<CashierAuditMetric[]>(CASHIER_AUDITS);

  return (
    <PermissionGate perm="super-shop.manage">
      <PageHeader
        title="Loss Prevention & Cashier Audits"
        subtitle="Monitor counter exceptions, post-subtotal line voids, manual weight entries, and cash variance"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.success("Audit log exported")}
            className="gap-1.5 text-xs"
          >
            <FileText className="h-3.5 w-3.5" /> Export Audit Log
          </Button>
        }
      />

      <PageBody>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Total Monitored Lanes" value="3 Counters" icon={FileText} />
          <StatCard label="Line Voids Today" value="21 Lines" icon={UserX} />
          <StatCard label="Manual Weights" value="10 Entries" icon={AlertTriangle} />
          <StatCard label="Flagged Variances" value="1 Cashier" icon={ShieldAlert} />
        </div>

        <SectionCard>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-base flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-primary" /> Shift Exception Metrics by Cashier
              </h3>
              <p className="text-xs text-muted-foreground">
                Outliers exceeding 2 standard deviations from store averages are flagged for supervisor review.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-border bg-secondary/20 text-muted-foreground font-semibold">
                  <th className="py-2.5 px-3">Cashier</th>
                  <th className="py-2.5 px-3">Active Lane</th>
                  <th className="py-2.5 px-3">Line Voids</th>
                  <th className="py-2.5 px-3">Post-Subtotal Voids</th>
                  <th className="py-2.5 px-3">Manual Weights</th>
                  <th className="py-2.5 px-3">Price Overrides</th>
                  <th className="py-2.5 px-3">Cash Variance</th>
                  <th className="py-2.5 px-3">Risk Assessment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {audits.map((a) => (
                  <tr key={a.cashierId} className="hover:bg-secondary/10">
                    <td className="py-2.5 px-3 font-semibold">{a.cashierName}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{a.lane}</td>
                    <td className="py-2.5 px-3 font-mono font-medium">{a.voidCount}</td>
                    <td className="py-2.5 px-3 font-mono">
                      <span className={a.postSubtotalVoids > 3 ? "text-destructive font-bold" : ""}>
                        {a.postSubtotalVoids}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono">{a.manualWeightCount}</td>
                    <td className="py-2.5 px-3 font-mono">{a.priceOverrides}</td>
                    <td className="py-2.5 px-3 font-mono font-bold">
                      <span className={a.cashVariance < -100 ? "text-destructive" : ""}>
                        {fmtBDT(a.cashVariance)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      {a.status === "flagged" ? (
                        <Badge variant="destructive" className="text-[10px]">
                          Review Required
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30">
                          Normal Activity
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </PageBody>
    </PermissionGate>
  );
}
