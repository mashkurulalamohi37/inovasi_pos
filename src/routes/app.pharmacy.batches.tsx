import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, PageBody, SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingState } from "@/components/pulse/states";
import { pharmacyItems } from "@/lib/pos-data";
import { shouldUseBackend } from "@/lib/demo-mode";
import { usePharmaBatchesAll } from "@/hooks/use-industry-data";

export const Route = createFileRoute("/app/pharmacy/batches")({ component: Batches });

type Filter = "all" | "valid" | "near-expiry" | "expired";

function Batches() {
  const useApi = shouldUseBackend();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const batchesQuery = usePharmaBatchesAll({
    q: q || undefined,
    status: filter === "all" ? undefined : filter,
    near_days: 90,
  });

  const demoRows = pharmacyItems.flatMap((p) =>
    p.batches.map((b) => ({
      product: `${p.brand} ${p.strength}`,
      sku: p.sku,
      batchNo: b.batchNo,
      expiry: b.expiryDate,
      qty: Object.values(b.qty).reduce((a, c) => a + c, 0),
      status: b.status as string,
    })),
  );

  const apiRows = useMemo(
    () =>
      (batchesQuery.data ?? []).map((b) => ({
        product: b.product_name,
        sku: b.product_sku,
        batchNo: b.batch_no,
        expiry: b.expiry_date.slice(0, 10),
        qty: b.qty_on_hand,
        status: b.status ?? "active",
      })),
    [batchesQuery.data],
  );

  const rows = useApi ? apiRows : demoRows;

  return (
    <>
      <PageHeader
        title="Batches"
        subtitle={useApi ? "Live batch stock — batches are created via purchase GRN receive" : "Demo batch-wise stock, mfg & expiry dates."}
      />
      {useApi && (
        <p className="px-6 pb-2 text-xs text-muted-foreground">
          Batch qty reflects PharmaBatch stock from inventory ledger. Export via Reports when pharmacy expiry report is available.
        </p>
      )}
      <PageBody>
        {useApi && (
          <div className="mb-4 flex flex-wrap gap-2">
            <Input placeholder="Search product, SKU, batch…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
            {(["all", "valid", "near-expiry", "expired"] as Filter[]).map((f) => (
              <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
                {f.replace("-", " ")}
              </Button>
            ))}
          </div>
        )}
        <SectionCard>
          {useApi && batchesQuery.isLoading ? (
            <LoadingState rows={3} />
          ) : rows.length === 0 ? (
            <EmptyState title="No pharmacy batches" description="Receive pharmacy stock via purchase GRN with batch no and expiry date." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 text-left">Item</th>
                  <th className="px-3 py-2.5 text-left">SKU</th>
                  <th className="px-3 py-2.5 text-left">Batch</th>
                  <th className="px-3 py-2.5 text-left">Expiry</th>
                  <th className="px-3 py-2.5 text-right">Qty</th>
                  <th className="px-5 py-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r, i) => (
                  <tr key={`${r.batchNo}-${i}`} className="hover:bg-secondary/30">
                    <td className="px-5 py-3 font-medium">{r.product}</td>
                    <td className="px-3 py-3 font-mono text-xs">{r.sku}</td>
                    <td className="px-3 py-3 font-mono text-xs">{r.batchNo}</td>
                    <td className="px-3 py-3">{r.expiry}</td>
                    <td className="px-3 py-3 text-right tabular">{r.qty}</td>
                    <td className="px-5 py-3 text-right"><StatusBadge status={r.status} /></td>
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
