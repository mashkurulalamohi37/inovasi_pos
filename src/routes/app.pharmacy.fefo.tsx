import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, PageBody, SectionCard, StatCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingState } from "@/components/pulse/states";
import { Calendar, AlertTriangle, Flame, ArrowDown } from "lucide-react";
import { pharmacyItems } from "@/lib/pos-data";
import { shouldUseBackend } from "@/lib/demo-mode";
import { usePharmaBatchesAll } from "@/hooks/use-industry-data";

export const Route = createFileRoute("/app/pharmacy/fefo")({ component: FEFO });

type Filter = "all" | "valid" | "near-expiry" | "expired";

function FEFO() {
  const useApi = shouldUseBackend();
  const [filter, setFilter] = useState<Filter>("valid");
  const [nearDays, setNearDays] = useState(90);
  const batchesQuery = usePharmaBatchesAll({ near_days: nearDays });

  const demoAll = pharmacyItems.flatMap((p) =>
    p.batches.map((b) => ({
      brand: p.brand,
      strength: p.strength,
      batchNo: b.batchNo,
      expiryDate: b.expiryDate,
      days: Math.floor((new Date(b.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      qty: Object.values(b.qty).reduce((a, c) => a + c, 0),
      status: b.status,
    })),
  );

  const apiAll = useMemo(
    () =>
      (batchesQuery.data ?? []).map((b) => ({
        brand: b.product_name,
        strength: "",
        batchNo: b.batch_no,
        expiryDate: b.expiry_date.slice(0, 10),
        days: b.days_to_expiry ?? Math.floor((new Date(b.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
        qty: b.qty_on_hand,
        status: b.status ?? "active",
      })),
    [batchesQuery.data],
  );

  const all = useApi ? apiAll : demoAll;
  const filtered = useMemo(() => {
    if (filter === "expired") return all.filter((b) => b.status === "expired" || b.days <= 0);
    if (filter === "near-expiry") return all.filter((b) => b.status === "near-expiry" || (b.days > 0 && b.days <= nearDays));
    if (filter === "valid") return all.filter((b) => b.days > 0 && b.status !== "expired");
    return all;
  }, [all, filter, nearDays]);

  const expiring = all.filter((b) => b.days > 0 && b.days <= nearDays && b.status !== "expired");
  const expired = all.filter((b) => b.days <= 0 || b.status === "expired");
  const fefoQueue = [...filtered].filter((b) => b.qty > 0 && b.days > 0).sort((a, b) => a.days - b.days);

  return (
    <>
      <PageHeader
        eyebrow="FEFO"
        title="First-Expired, First-Out Console"
        subtitle={useApi ? "FEFO queue from live pharmacy batches — earliest valid expiry first" : "Demo pick suggestions and expiry alerts."}
      />
      {useApi && (
        <p className="px-6 pb-2 text-xs text-muted-foreground">
          Export disabled — pharmacy expiry report not yet registered in Reports module.
        </p>
      )}
      <PageBody className="space-y-5">
        {useApi && (
          <div className="flex flex-wrap gap-2">
            {(["valid", "near-expiry", "expired", "all"] as Filter[]).map((f) => (
              <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
                {f.replace("-", " ")}
              </Button>
            ))}
            <Button size="sm" variant="outline" onClick={() => setNearDays(30)}>30d</Button>
            <Button size="sm" variant="outline" onClick={() => setNearDays(60)}>60d</Button>
            <Button size="sm" variant="outline" onClick={() => setNearDays(90)}>90d</Button>
          </div>
        )}
        {useApi && batchesQuery.isLoading ? (
          <LoadingState rows={2} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Batches in stock" value={String(all.filter((b) => b.qty > 0).length)} icon={<Calendar className="h-4 w-4" />} />
            <StatCard label={`Near expiry (≤${nearDays}d)`} value={String(expiring.length)} icon={<AlertTriangle className="h-4 w-4" />} />
            <StatCard label="Expired" value={String(expired.length)} icon={<Flame className="h-4 w-4" />} />
          </div>
        )}

        <SectionCard title="FEFO suggestion · pick from oldest valid expiry first">
          {fefoQueue.length === 0 ? (
            <EmptyState title="No sellable batches" description="Expired batches are blocked at POS. Receive stock via GRN with batch and expiry." />
          ) : (
            <div className="divide-y divide-border">
              {fefoQueue.slice(0, 12).map((b) => (
                <div key={b.batchNo} className="grid grid-cols-12 items-center gap-3 px-5 py-3">
                  <div className="col-span-12 sm:col-span-4">
                    <div className="text-sm font-semibold">{b.brand} {b.strength}</div>
                  </div>
                  <div className="col-span-6 sm:col-span-2 font-mono text-xs">{b.batchNo}</div>
                  <div className="col-span-6 sm:col-span-2 text-xs">Exp <span className="font-medium">{b.expiryDate}</span></div>
                  <div className="col-span-6 sm:col-span-2">
                    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${b.days <= nearDays ? "bg-warning/10 text-warning" : "bg-success/10 text-success"}`}>
                      <ArrowDown className="h-3 w-3" /> {b.days}d left
                    </span>
                  </div>
                  <div className="col-span-6 sm:col-span-2 text-right text-xs tabular">{b.qty} units</div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </PageBody>
    </>
  );
}
