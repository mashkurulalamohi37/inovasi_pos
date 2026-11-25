import { createFileRoute } from "@tanstack/react-router";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { beefCatalog } from "@/lib/industry-mock";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useBeefBatches, useBeefColdStorage } from "@/hooks/use-industry-data";

export const Route = createFileRoute("/app/beef-shop/batches")({ component: Page });

function Page() {
  const useApi = shouldUseBackend();
  const batchesQuery = useBeefBatches();
  const coldQuery = useBeefColdStorage();

  const demoBatches = beefCatalog.map(b => ({
    batch: b.batchNo,
    item: b.name,
    storage: b.storage,
    expiry: b.expiryDate,
    qtyKg: 0,
    status: new Date(b.expiryDate) < new Date() ? "expired" as const : "active" as const,
  }));

  const apiBatches = (batchesQuery.data ?? []).map(b => ({
    batch: b.batch_code,
    item: b.meat_type,
    storage: "—",
    expiry: b.expiry_date ?? "—",
    qtyKg: 0,
    status: b.expiry_date && new Date(b.expiry_date) < new Date() ? "expired" as const : "active" as const,
  }));

  const coldRows = coldQuery.data ?? [];
  const batches = useApi ? apiBatches : demoBatches;

  return (
    <BackOfficePage
      title="Cold Storage Batches"
      subtitle={useApi ? "Batch master and cold storage zones from backend" : "Demo batch catalog"}
      eyebrow="Beef Shop"
      stats={[
        { label: "Active batches", value: String(batches.filter(b => b.status === "active").length) },
        { label: "Storage zones", value: useApi ? String(new Set(coldRows.map(c => c.location)).size) : "4" },
      ]}
    >
      <SectionCard title="Batch inventory">
        {useApi && batchesQuery.isLoading ? (
          <div className="p-5"><Skeleton className="h-32 w-full" /></div>
        ) : batches.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No batches on record</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 text-left">Batch</th>
                <th className="px-3 py-2.5 text-left">Type</th>
                <th className="px-3 py-2.5 text-left">Expiry</th>
                <th className="px-5 py-2.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {batches.map(b => (
                <tr key={b.batch} className="hover:bg-secondary/30">
                  <td className="px-5 py-3 font-mono text-xs">{b.batch}</td>
                  <td className="px-3 py-3">{b.item}</td>
                  <td className="px-3 py-3 text-muted-foreground">{b.expiry}</td>
                  <td className="px-5 py-3 text-right"><StatusBadge status={b.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {useApi && coldRows.length > 0 && (
        <SectionCard title="Cold storage positions">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
              <tr><th className="px-5 py-2 text-left">Location</th><th className="px-3 py-2 text-right">Qty (kg)</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {coldRows.map(c => (
                <tr key={c.id}>
                  <td className="px-5 py-3"><Badge variant="outline">{c.location}</Badge></td>
                  <td className="px-3 py-3 text-right tabular">{c.qty_kg}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      )}
    </BackOfficePage>
  );
}
