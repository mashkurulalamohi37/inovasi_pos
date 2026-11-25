import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, PageBody, SectionCard, StatusBadge, StatCard } from "@/components/pulse/primitives";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/pulse/states";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useSurgicalExpiry } from "@/hooks/use-api-config";

export const Route = createFileRoute("/app/surgical-shop/expiry")({ component: ExpiryPage });

type Bucket = "expired" | "30" | "60" | "90" | "custom";

function ExpiryPage() {
  const useApi = shouldUseBackend();
  const [bucket, setBucket] = useState<Bucket>("90");
  const [customDays, setCustomDays] = useState(120);
  const [q, setQ] = useState("");
  const [manufacturer, setManufacturer] = useState("");

  const nearDays = bucket === "expired" ? 0 : bucket === "custom" ? customDays : Number(bucket);
  const query = useSurgicalExpiry({
    near_days: bucket === "expired" ? undefined : nearDays,
    expired_only: bucket === "expired",
    q: q || undefined,
    manufacturer: manufacturer || undefined,
  });

  const rows = useMemo(() => query.data ?? [], [query.data]);
  const expiredCount = rows.filter((r) => Number(r.days_to_expiry ?? 1) <= 0).length;
  const nearCount = rows.length - expiredCount;

  if (!useApi) {
    return (
      <>
        <PageHeader title="Expiry watch" subtitle="Connect backend mode for live surgical expiry data." />
        <PageBody>
          <EmptyState title="Backend required" description="Surgical expiry watch is not available in demo mode." />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Expiry watch" subtitle="Expired and near-expiry surgical stock. Expired / quarantined / recalled units cannot be sold." />
      <PageBody>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <StatCard label="In view" value={String(rows.length)} />
          <StatCard label="Expired" value={String(expiredCount)} />
          <StatCard label="Near expiry" value={String(nearCount)} />
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          <Input placeholder="Search product / batch…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
          <Input placeholder="Manufacturer" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} className="max-w-[10rem]" />
          {([
            ["expired", "Expired"],
            ["30", "30 days"],
            ["60", "60 days"],
            ["90", "90 days"],
            ["custom", "Custom"],
          ] as const).map(([id, label]) => (
            <Button key={id} size="sm" variant={bucket === id ? "default" : "outline"} onClick={() => setBucket(id)}>{label}</Button>
          ))}
          {bucket === "custom" && (
            <Input
              type="number"
              className="w-24"
              value={customDays}
              onChange={(e) => setCustomDays(Number(e.target.value) || 0)}
            />
          )}
        </div>
        <SectionCard>
          {query.isLoading ? (
            <LoadingState rows={3} />
          ) : query.isError ? (
            <ErrorState title="Failed to load expiry data" description="Check API connectivity and surgical.view permission." />
          ) : rows.length === 0 ? (
            <EmptyState title="No matching expiry rows" description="No surgical stock matches this expiry threshold." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 text-left">Product</th>
                  <th className="px-3 py-2.5 text-left">SKU</th>
                  <th className="px-3 py-2.5 text-left">Manufacturer</th>
                  <th className="px-3 py-2.5 text-left">Batch/Lot</th>
                  <th className="px-3 py-2.5 text-left">Expiry</th>
                  <th className="px-3 py-2.5 text-right">Days</th>
                  <th className="px-3 py-2.5 text-right">Qty</th>
                  <th className="px-5 py-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={String(r.id)} className="hover:bg-secondary/30">
                    <td className="px-5 py-3 font-medium">{String(r.product_name ?? "—")}</td>
                    <td className="px-3 py-3 font-mono text-xs">{String(r.sku ?? "—")}</td>
                    <td className="px-3 py-3 text-xs">{String(r.manufacturer_name ?? "—")}</td>
                    <td className="px-3 py-3 font-mono text-xs">
                      {String(r.batch_no ?? r.lot_no ?? "—")}
                    </td>
                    <td className="px-3 py-3">{r.expiry_date ? String(r.expiry_date).slice(0, 10) : "—"}</td>
                    <td className="px-3 py-3 text-right tabular">{String(r.days_to_expiry ?? "—")}</td>
                    <td className="px-3 py-3 text-right tabular">{String(r.qty_on_hand ?? 0)}</td>
                    <td className="px-5 py-3 text-right"><StatusBadge status={String(r.status ?? "available")} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      </PageBody>
    </>
  );
}
