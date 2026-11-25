import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { PermissionGate } from "@/components/pulse/gates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Wallet } from "lucide-react";
import { fmtBDT } from "@/lib/pos-data";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useShiftList } from "@/hooks/use-api-config";

export const Route = createFileRoute("/app/pos/drawer-status")({ component: DrawerStatus });

function DrawerStatus() {
  const useApi = shouldUseBackend();
  const openShifts = useShiftList({ status: "open" });

  if (!useApi) {
    return (
      <>
        <PageHeader title="Drawer Status" subtitle="Connect backend to see live open drawers." />
        <PageBody>
          <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            Sign in with API enabled.
          </div>
        </PageBody>
      </>
    );
  }

  const rows = openShifts.data ?? [];
  const totalExpected = rows.reduce((s, r) => s + (r.expected_cash_so_far ?? 0), 0);

  return (
    <PermissionGate perm="pos.manager_discount" fallback={<PageBody><div className="p-10 text-center text-sm text-muted-foreground">Manager access required.</div></PageBody>}>
      <PageHeader
        title="Drawer Status"
        subtitle="Every open cash drawer right now — multi-cashier, multi-counter overview"
        actions={
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openShifts.refetch()} disabled={openShifts.isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 ${openShifts.isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        }
      />
      <PageBody className="space-y-4">
        <SectionCard>
          <div className="flex items-center justify-between p-5">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Open drawers</div>
                <div className="font-display text-lg font-semibold">{rows.length}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Total expected cash (all drawers)</div>
              <div className="font-display text-lg font-semibold tabular">{fmtBDT(totalExpected)}</div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Open drawers">
          {openShifts.isLoading ? (
            <div className="p-5 text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No drawers currently open</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 text-left">Cashier</th>
                  <th className="px-3 py-2 text-left">Counter</th>
                  <th className="px-3 py-2 text-left">Opened</th>
                  <th className="px-3 py-2 text-right">Opening float</th>
                  <th className="px-5 py-2 text-right">Expected cash now</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-3 font-medium">{r.cashier_name ?? r.cashier_id}</td>
                    <td className="px-3 py-3 text-muted-foreground">{r.counter_id ?? "—"}</td>
                    <td className="px-3 py-3 text-muted-foreground">{r.opened_at ? new Date(r.opened_at).toLocaleString() : "—"}</td>
                    <td className="px-3 py-3 text-right tabular">{fmtBDT(r.opening_float)}</td>
                    <td className="px-5 py-3 text-right">
                      {typeof r.expected_cash_so_far === "number" ? (
                        <span className="font-semibold tabular">{fmtBDT(r.expected_cash_so_far)}</span>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">not visible</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
        <p className="text-xs text-muted-foreground">
          Cashiers never see this running total for their own drawer — they count blind and the variance is only revealed after they close.
        </p>
      </PageBody>
    </PermissionGate>
  );
}
