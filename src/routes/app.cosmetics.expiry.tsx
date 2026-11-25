import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, PageBody, SectionCard, StatusBadge, StatCard } from "@/components/pulse/primitives";
import { ConfirmActionDialog } from "@/components/pulse/ConfirmActionDialog";
import { PermissionGate } from "@/components/pulse/gates";
import { EmptyState, ErrorState, LoadingState } from "@/components/pulse/states";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useCosmeticsBatches, type CosmeticsBatch } from "@/hooks/use-api-config";
import { useQuarantineCosmeticsBatch } from "@/hooks/use-industry-backoffice";
import { toast } from "sonner";

export const Route = createFileRoute("/app/cosmetics/expiry")({
  component: CosmeticsExpiryPage,
  validateSearch: (search: Record<string, unknown>) => ({
    brand: typeof search.brand === "string" ? search.brand : undefined,
  }),
});

type Tab = "expired" | "near30" | "near60" | "near90" | "valid" | "quarantined";

function CosmeticsExpiryPage() {
  const useApi = shouldUseBackend();
  const { brand: brandFromSearch } = Route.useSearch();
  const [tab, setTab] = useState<Tab>("near90");
  const [q, setQ] = useState("");
  const [brand, setBrand] = useState(brandFromSearch ?? "");
  const [selected, setSelected] = useState<CosmeticsBatch | null>(null);
  const [reason, setReason] = useState("");

  const queryParams = useMemo(() => {
    const base: {
      status?: string;
      near_days?: number;
      brand?: string;
      q?: string;
    } = {
      brand: brand || undefined,
      q: q || undefined,
    };
    if (tab === "expired") {
      base.status = "expired";
    } else if (tab === "quarantined") {
      base.status = "quarantined";
    } else if (tab === "valid") {
      base.status = "available";
    } else if (tab === "near30") {
      base.status = "near_expiry";
      base.near_days = 30;
    } else if (tab === "near60") {
      base.status = "near_expiry";
      base.near_days = 60;
    } else {
      base.status = "near_expiry";
      base.near_days = 90;
    }
    return base;
  }, [tab, brand, q]);

  const batchesQuery = useCosmeticsBatches(queryParams);
  const quarantineMut = useQuarantineCosmeticsBatch();

  const rows = useMemo(() => {
    const data = batchesQuery.data ?? [];
    return data.filter((b) => !b.is_tester);
  }, [batchesQuery.data]);

  const expiredCount = rows.filter((r) => Number(r.days_to_expiry ?? 1) <= 0 || r.status === "expired").length;
  const nearCount = rows.filter((r) => {
    const d = Number(r.days_to_expiry ?? 999);
    return d > 0 && d <= 90;
  }).length;

  const runQuarantine = async () => {
    if (!selected) return;
    if (!reason.trim()) {
      toast.error("Quarantine reason required");
      return;
    }
    try {
      await quarantineMut.mutateAsync({
        id: selected.id,
        body: { reason: reason.trim() },
      });
      toast.success("Batch quarantined");
      setSelected(null);
      setReason("");
      void batchesQuery.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Quarantine failed");
    }
  };

  if (!useApi) {
    return (
      <>
        <PageHeader title="Expiry watch" subtitle="Batch / lot / FEFO expiry for cosmetics" />
        <PageBody>
          <EmptyState
            title="Backend required"
            description="Expiry watch uses live cosmetics batch APIs. Enable backend mode to list and quarantine batches."
          />
        </PageBody>
      </>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "expired", label: "Expired" },
    { id: "near30", label: "Near 30" },
    { id: "near60", label: "Near 60" },
    { id: "near90", label: "Near 90" },
    { id: "valid", label: "Valid" },
    { id: "quarantined", label: "Quarantined" },
  ];

  return (
    <>
      <PageHeader
        title="Expiry watch"
        subtitle="Expired and near-expiry cosmetics batches. Quarantined / expired stock cannot be sold."
      />
      <PageBody>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <StatCard label="In view" value={String(rows.length)} />
          <StatCard label="Expired" value={String(expiredCount)} />
          <StatCard label="Near expiry" value={String(nearCount)} />
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          <Input
            placeholder="Search product / batch / shade…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
          />
          <Input
            placeholder="Brand filter"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className="max-w-[10rem]"
          />
          {tabs.map((t) => (
            <Button
              key={t.id}
              size="sm"
              variant={tab === t.id ? "default" : "outline"}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </Button>
          ))}
        </div>
        <SectionCard>
          {batchesQuery.isLoading ? (
            <LoadingState rows={3} />
          ) : batchesQuery.isError ? (
            <ErrorState
              title="Failed to load batches"
              description={String(batchesQuery.error)}
              onRetry={() => batchesQuery.refetch()}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No matching batches"
              description="No cosmetics batches match this expiry filter."
            />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 text-left">Product</th>
                  <th className="px-3 py-2.5 text-left">Brand</th>
                  <th className="px-3 py-2.5 text-left">Shade</th>
                  <th className="px-3 py-2.5 text-left">Batch</th>
                  <th className="px-3 py-2.5 text-left">Lot</th>
                  <th className="px-3 py-2.5 text-left">Mfg</th>
                  <th className="px-3 py-2.5 text-left">Expiry</th>
                  <th className="px-3 py-2.5 text-right">Days</th>
                  <th className="px-3 py-2.5 text-right">Qty</th>
                  <th className="px-3 py-2.5 text-right">Status</th>
                  <th className="px-5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const qty = r.sellable_qty ?? r.qty_on_hand ?? 0;
                  const canQuarantine =
                    r.status !== "quarantined" && r.status !== "expired" && Number(qty) > 0;
                  return (
                    <tr key={r.id} className="hover:bg-secondary/30">
                      <td className="px-5 py-3 font-medium">{r.product_name ?? r.sku ?? "—"}</td>
                      <td className="px-3 py-3 text-xs">{r.brand_name ?? "—"}</td>
                      <td className="px-3 py-3 text-xs">
                        {[r.shade_code, r.shade_name].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">{r.batch_no}</td>
                      <td className="px-3 py-3 font-mono text-xs">{r.lot_no ?? "—"}</td>
                      <td className="px-3 py-3">{r.mfg_date ? String(r.mfg_date).slice(0, 10) : "—"}</td>
                      <td className="px-3 py-3">{r.expiry_date ? String(r.expiry_date).slice(0, 10) : "—"}</td>
                      <td className="px-3 py-3 text-right tabular">{r.days_to_expiry ?? "—"}</td>
                      <td className="px-3 py-3 text-right tabular">{qty}</td>
                      <td className="px-3 py-3 text-right">
                        <StatusBadge status={String(r.status ?? "available")} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        {canQuarantine ? (
                          <PermissionGate
                            perm="cosmetics.manage"
                            fallback={
                              <DisabledReasonButton
                                label="Quarantine"
                                reason="Requires cosmetics.manage"
                              />
                            }
                          >
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelected(r);
                                setReason("");
                              }}
                            >
                              Quarantine
                            </Button>
                          </PermissionGate>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </SectionCard>
      </PageBody>

      <ConfirmActionDialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setReason("");
          }
        }}
        title="Quarantine batch"
        description="Quarantined cosmetics stock cannot be sold until released via inventory controls."
        confirmLabel="Quarantine"
        destructive
        onConfirm={runQuarantine}
        isPending={quarantineMut.isPending}
      >
        <Input
          className="mt-3"
          placeholder="Quarantine reason (required)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </ConfirmActionDialog>
    </>
  );
}
