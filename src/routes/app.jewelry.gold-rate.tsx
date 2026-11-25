import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { SectionCard } from "@/components/pulse/primitives";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { useGoldRate, useJewelryRates } from "@/hooks/use-industry-data";
import { useCreateJewelryRate } from "@/hooks/use-industry-backoffice";
import { fmtBDT } from "@/lib/pos-data";
import { shouldUseBackend } from "@/lib/demo-mode";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";

export const Route = createFileRoute("/app/jewelry/gold-rate")({ component: Page });

const DEMO_RATE = { rate_per_gram: 7850, karat: "22K", selling_rate: 7850, buying_rate: 7222 };
const BOARD_KARATS = ["24K", "22K", "21K", "18K"];

function Page() {
  const useApi = shouldUseBackend();
  const { data, isLoading, isError } = useGoldRate();
  // Unfiltered and capped at 50 rows, a shop that reposts 22K often pushed the
  // other karats past the cutoff and their board tiles read "No posted rate".
  const history = useJewelryRates({ limit: 200 });
  const createRate = useCreateJewelryRate();
  const rate = useApi ? data : DEMO_RATE;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    metal_type: "Gold",
    karat: "22K",
    selling_rate: "",
    buying_rate: "",
    override_reason: "",
    manual_override: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const board = useMemo(() => {
    const rows = history.data ?? [];
    return BOARD_KARATS.map((karat) => {
      const match = rows.find(
        (r) => String(r.karat).toUpperCase() === karat && (r.metal_type ?? "Gold") === "Gold",
      );
      if (match) {
        return {
          karat,
          selling: Number(match.selling_rate ?? match.rate_per_gram ?? 0),
          buying: Number(match.buying_rate ?? 0),
          live: true,
          source: "posted",
        };
      }
      if (karat === (rate?.karat ?? "22K") && rate) {
        const selling = Number(rate.selling_rate ?? rate.rate_per_gram ?? 0);
        return {
          karat,
          selling,
          buying: Number(rate.buying_rate ?? Math.round(selling * 0.92)),
          live: useApi,
          source: "effective",
        };
      }
      return { karat, selling: 0, buying: 0, live: false, source: "missing" as const };
    });
  }, [history.data, rate, useApi]);

  const submit = async () => {
    const next: Record<string, string> = {};
    if (!form.selling_rate || Number(form.selling_rate) <= 0)
      next.selling_rate = "Selling rate required";
    if (form.manual_override && !form.override_reason.trim())
      next.override_reason = "Reason required for override";
    setErrors(next);
    if (Object.keys(next).length) return;
    await createRate.mutateAsync({
      metal_type: form.metal_type,
      karat: form.karat,
      selling_rate: Number(form.selling_rate),
      buying_rate: form.buying_rate ? Number(form.buying_rate) : undefined,
      manual_override: form.manual_override || undefined,
      override_reason: form.override_reason.trim() || undefined,
    });
    setOpen(false);
    setForm({
      metal_type: "Gold",
      karat: "22K",
      selling_rate: "",
      buying_rate: "",
      override_reason: "",
      manual_override: false,
    });
    history.refetch();
  };

  const selling = rate?.selling_rate ?? rate?.rate_per_gram ?? 0;

  return (
    <BackOfficePage
      title="Metal Rate"
      eyebrow="Jewelry"
      subtitle={
        useApi
          ? "Historical tenant metal rates — sales snapshot rates separately"
          : "Demo rate board"
      }
      stats={
        rate
          ? [
              { label: "Sell / gram", value: fmtBDT(selling) },
              {
                label: "Buy / gram",
                value: fmtBDT(rate.buying_rate ?? Math.round(selling * 0.92)),
              },
              { label: "Karat", value: rate.karat },
            ]
          : []
      }
      actions={
        useApi ? (
          <Button size="sm" className="gap-1" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Post rate
          </Button>
        ) : (
          <DisabledReasonButton label="Post rate" reason="Enable backend mode to manage rates" />
        )
      }
    >
      <SectionCard title="Current board">
        {useApi && isLoading ? (
          <div className="grid gap-4 p-5 sm:grid-cols-4">
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </div>
        ) : useApi && isError ? (
          <div className="p-8 text-center text-sm text-destructive">Failed to load metal rate</div>
        ) : (
          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
            {board.map((r) => (
              <div key={r.karat} className="rounded-xl border border-border p-4">
                <div className="text-xs text-muted-foreground">{r.karat} gold</div>
                <div className="mt-1 text-2xl font-semibold tabular">
                  {r.selling > 0 ? fmtBDT(r.selling) : "—"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {r.source === "missing" ? "No posted rate" : "sell per gram · BDT"}
                </div>
                {r.buying > 0 && (
                  <div className="mt-1 text-xs text-muted-foreground">Buy {fmtBDT(r.buying)}</div>
                )}
                {useApi && r.live && (
                  <Badge variant="outline" className="mt-3 text-[10px]">
                    Live
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {useApi && (
        <SectionCard title="Rate history">
          {history.isLoading ? (
            <div className="p-5">
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (history.data ?? []).length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No rate history yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase">
                <tr>
                  <th className="px-5 py-2 text-left">Effective</th>
                  <th className="px-3 py-2 text-left">Metal</th>
                  <th className="px-3 py-2 text-left">Karat</th>
                  <th className="px-3 py-2 text-right">Sell</th>
                  <th className="px-3 py-2 text-right">Buy</th>
                  <th className="px-5 py-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(history.data ?? []).map((r) => (
                  <tr key={String(r.id ?? `${r.effective_date}-${r.karat}`)}>
                    <td className="px-5 py-3 text-xs">
                      {String(r.effective_date ?? "—").slice(0, 19)}
                    </td>
                    <td className="px-3 py-3">{r.metal_type ?? "Gold"}</td>
                    <td className="px-3 py-3">{r.karat}</td>
                    <td className="px-3 py-3 text-right tabular">
                      {fmtBDT(r.selling_rate ?? r.rate_per_gram)}
                    </td>
                    <td className="px-3 py-3 text-right tabular">{fmtBDT(r.buying_rate ?? 0)}</td>
                    <td className="px-5 py-3 text-right text-xs">{r.status ?? "active"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      )}

      <EntityFormDrawer
        open={open}
        onOpenChange={setOpen}
        title="Post metal rate"
        description="Creates a new historical rate row. Existing invoices keep their snapshotted rates."
        onSubmit={submit}
        submitLabel="Post rate"
        isPending={createRate.isPending}
        errorMessage={createRate.error instanceof Error ? createRate.error.message : null}
      >
        <div>
          <Label>Metal</Label>
          <select
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={form.metal_type}
            onChange={(e) => setForm((f) => ({ ...f, metal_type: e.target.value }))}
          >
            {["Gold", "Silver", "Platinum"].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Karat / purity</Label>
          <select
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={form.karat}
            onChange={(e) => setForm((f) => ({ ...f, karat: e.target.value }))}
          >
            {["24K", "22K", "21K", "18K", "14K", "925", "999"].map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Selling rate / gram</Label>
          <Input
            type="number"
            value={form.selling_rate}
            onChange={(e) => setForm((f) => ({ ...f, selling_rate: e.target.value }))}
          />
          {errors.selling_rate ? (
            <p className="text-xs text-destructive">{errors.selling_rate}</p>
          ) : null}
        </div>
        <div>
          <Label>Buying rate / gram</Label>
          <Input
            type="number"
            value={form.buying_rate}
            onChange={(e) => setForm((f) => ({ ...f, buying_rate: e.target.value }))}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.manual_override}
            onChange={(e) => setForm((f) => ({ ...f, manual_override: e.target.checked }))}
          />
          Manual mid-day override (requires jewelry.rate_override)
        </label>
        <div>
          <Label>Override reason</Label>
          <Input
            value={form.override_reason}
            onChange={(e) => setForm((f) => ({ ...f, override_reason: e.target.value }))}
          />
          {errors.override_reason ? (
            <p className="text-xs text-destructive">{errors.override_reason}</p>
          ) : null}
        </div>
      </EntityFormDrawer>
    </BackOfficePage>
  );
}
