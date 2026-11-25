import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { Pager } from "@/components/pulse/Pager";
import { SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { electronicsSerials } from "@/lib/industry-mock";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useElectronicsSerials, useElectronicsDashboard } from "@/hooks/use-api-config";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export const Route = createFileRoute("/app/electronics/serials")({
  component: Page,
});

const PAGE_SIZE = 100;

function Page() {
  const useApi = shouldUseBackend();
  const [status, setStatus] = useState<string>("all");
  const [q, setQ] = useState("");
  // Debounced so typing a search term is one request, not one per keystroke.
  const debouncedQ = useDebouncedValue(q.trim());
  const [page, setPage] = useState(0);
  // Any filter change invalidates the current offset.
  useEffect(() => {
    setPage(0);
  }, [debouncedQ, status]);
  // Company-wide serial counts for the header stats (the table itself is paged).
  const dashboard = useElectronicsDashboard();
  const query = useElectronicsSerials({
    status: status === "all" ? undefined : status,
    q: debouncedQ || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  // The server applies status and search filters. Re-filtering here would filter
  // *within* the fetched page, quietly dropping rows the server already matched.
  const rows = useApi
    ? (query.data ?? []).map((s) => ({
        id: String(s.id ?? s.serial_no ?? s.serial_imei ?? ""),
        serial: String(s.serial_no ?? s.serial_imei ?? "—"),
        sku: String(s.product_sku ?? "—"),
        // The serial payload carries the warranty end date; this column was
        // hardcoded to "—" so it never showed anything in backend mode.
        warrantyUntil: String(s.warranty_end_date ?? "").slice(0, 10) || "—",
        status: String(s.status ?? "available"),
        imei: s.imei_no ? String(s.imei_no) : null,
      }))
    : electronicsSerials
        .map((s) => ({
          id: s.serial,
          serial: s.serial,
          sku: s.sku,
          warrantyUntil: s.warrantyUntil,
          status: s.status === "in-stock" ? "available" : "sold",
          imei: null as string | null,
        }))
        .filter((s) => {
          if (status !== "all" && s.status !== status) return false;
          if (debouncedQ) {
            const needle = debouncedQ.toLowerCase();
            const hay = `${s.serial} ${s.sku} ${s.imei ?? ""}`.toLowerCase();
            if (!hay.includes(needle)) return false;
          }
          return true;
        });

  // Company-wide counts, not page counts — the header would otherwise report the
  // size of the current page as the size of the registry.
  const serialStatus = (dashboard.data?.serial_status as Record<string, number> | undefined) ?? {};
  const totalSerials = useApi ? Number(dashboard.data?.total_serials ?? 0) : rows.length;
  const inStock = useApi
    ? Number(serialStatus.available ?? 0)
    : rows.filter((s) => s.status === "available").length;

  return (
    <BackOfficePage
      title="Serial Stock"
      eyebrow="Electronics"
      subtitle={
        useApi
          ? `${totalSerials} serialized units`
          : `${electronicsSerials.length} demo serialized units`
      }
      stats={[
        { label: "Available", value: String(inStock) },
        { label: "Other", value: String(Math.max(0, totalSerials - inStock)) },
      ]}
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          className="max-w-xs"
          placeholder="Search serial / IMEI / SKU"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {["all", "available", "sold", "warranty", "rma", "reserved", "damaged", "retired"].map(
              (s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
      </div>
      <SectionCard title="Serial / IMEI registry">
        {useApi && query.isLoading ? (
          <div className="p-5">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 text-left">Serial / IMEI</th>
                <th className="px-3 py-2.5 text-left">SKU</th>
                <th className="px-3 py-2.5 text-left">Warranty until</th>
                <th className="px-5 py-2.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((s) => (
                <tr key={s.id || s.serial} className="hover:bg-secondary/30">
                  <td className="px-5 py-3 font-mono text-xs">
                    {s.serial}
                    {s.imei ? <div className="text-muted-foreground">IMEI {s.imei}</div> : null}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs">{s.sku}</td>
                  <td className="px-3 py-3 text-muted-foreground">{s.warrantyUntil}</td>
                  <td className="px-5 py-3 text-right">
                    {/* Real status, not a two-way collapse — "damaged", "rma" and
                        "retired" all used to render as a green "completed". */}
                    <StatusBadge status={s.status} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-sm text-muted-foreground">
                    {debouncedQ || status !== "all"
                      ? "No serials match the current filters"
                      : "No serial stock yet — receive via GRN with serial capture"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </SectionCard>
      {useApi && (
        <div className="mt-4">
          <Pager
            page={page}
            pageSize={PAGE_SIZE}
            count={rows.length}
            onPageChange={setPage}
            isFetching={query.isFetching}
          />
        </div>
      )}
    </BackOfficePage>
  );
}
