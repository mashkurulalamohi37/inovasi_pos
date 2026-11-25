import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingState, ErrorState, EmptyState } from "@/components/pulse/states";
import { ExportButton } from "@/components/pulse/ActionButtons";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useAuth } from "@/lib/auth-provider";
import {
  useCustomReport,
  useCustomReportSources,
  useExportCustomReport,
  useRunCustomReport,
  useCompanyProfile,
  type ApiCustomReportRun,
} from "@/hooks/use-api-config";
import { fmtBDT } from "@/lib/pos-data";
import { todayDateRange } from "@/lib/dates";
import { ReportCompanyHeader } from "@/components/pulse/ReportCompanyHeader";

export const Route = createFileRoute("/app/reports/custom/$reportId")({
  component: CustomReportRunPage,
});

function defaultDateRange(): { from: string; to: string } {
  return todayDateRange();
}

function CustomReportRunPage() {
  const { reportId } = Route.useParams();
  const useApi = shouldUseBackend();
  const { can } = useAuth();
  const { data: companyProfile } = useCompanyProfile();
  const reportQuery = useCustomReport(reportId, useApi);
  const sourcesQuery = useCustomReportSources(useApi);
  const runMut = useRunCustomReport();
  const exportMut = useExportCustomReport();

  const initial = defaultDateRange();
  const [fromDate, setFromDate] = useState(initial.from);
  const [toDate, setToDate] = useState(initial.to);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ApiCustomReportRun | null>(null);

  const source = useMemo(
    () => (sourcesQuery.data ?? []).find((s) => s.key === reportQuery.data?.source_key),
    [sourcesQuery.data, reportQuery.data?.source_key],
  );

  const filterableColumns = useMemo(() => {
    if (!source || !reportQuery.data) return [];
    const selected = new Set(reportQuery.data.columns);
    return source.columns.filter((c) => c.filterable && selected.has(c.code) && c.code !== source.date_column);
  }, [source, reportQuery.data]);

  const run = async () => {
    const data = await runMut.mutateAsync({
      reportId,
      body: {
        from_date: new Date(fromDate).toISOString(),
        to_date: new Date(`${toDate}T23:59:59`).toISOString(),
        filters,
        limit: 500,
      },
    });
    setResult(data);
  };

  useEffect(() => {
    if (reportQuery.data && !result && !runMut.isPending) {
      void run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- auto-run once when definition loads
  }, [reportQuery.data?.id]);

  if (reportQuery.isLoading) return <LoadingState label="Loading report…" />;
  if (reportQuery.isError || !reportQuery.data) {
    return <ErrorState title="Report not found" onRetry={() => reportQuery.refetch()} />;
  }

  const report = reportQuery.data;
  const rows = result?.rows ?? [];
  const columns = result?.columns ?? report.columns.map((c) => ({ code: c, label: report.column_labels[c] || c }));

  return (
    <>
      <PageHeader
        eyebrow="My Reports"
        title={report.title}
        subtitle={`${report.source_key} · ${report.columns.length} columns`}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/app/reports/custom">← My Reports</Link>
          </Button>
        }
      />
      <PageBody className="space-y-4">
        <SectionCard title="Filters">
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">From date</Label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To date</Label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
            {filterableColumns.map((col) => (
              <div key={col.code} className="space-y-1">
                <Label className="text-xs">{col.label}</Label>
                <Input
                  value={filters[col.code] ?? ""}
                  onChange={(e) => setFilters((p) => ({ ...p, [col.code]: e.target.value }))}
                  placeholder={`Filter ${col.label}`}
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
            <Button size="sm" onClick={() => void run()} disabled={runMut.isPending}>
              {runMut.isPending ? "Running…" : "Get report"}
            </Button>
            {can("reports.export") && (
              <ExportButton
                label="Export CSV"
                onExport={() =>
                  exportMut.mutate({
                    reportId,
                    from_date: new Date(fromDate).toISOString(),
                    to_date: new Date(`${toDate}T23:59:59`).toISOString(),
                  })
                }
                isExporting={exportMut.isPending}
              />
            )}
          </div>
        </SectionCard>

        <SectionCard title="Results" description={result ? `${result.row_count} rows` : undefined}>
          <div className="p-4 pb-0">
            <ReportCompanyHeader
              company={companyProfile}
              reportTitle={reportQuery.data?.title || "Custom Report"}
              period={`From ${new Date(fromDate).toLocaleDateString()} to ${new Date(toDate).toLocaleDateString()}`}
              className="border-0 shadow-none p-0 mb-3 bg-transparent"
            />
          </div>

          {runMut.isPending && !result ? (
            <LoadingState />
          ) : runMut.isError ? (
            <ErrorState onRetry={() => void run()} />
          ) : rows.length === 0 ? (
            <EmptyState title="No rows" description="Widen the date range or clear column filters." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs uppercase">
                  <tr>
                    {columns.map((col) => (
                      <th key={col.code} className="px-3 py-2 text-left font-medium">{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row, i) => (
                    <tr key={i} className="hover:bg-secondary/30">
                      {columns.map((col) => {
                        const val = row[col.label];
                        const display =
                          typeof val === "number" && /price|total|cost|amount/i.test(col.label)
                            ? fmtBDT(val)
                            : val == null || val === ""
                              ? "—"
                              : String(val);
                        return (
                          <td key={col.code} className="px-3 py-2 tabular-nums">{display}</td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </PageBody>
    </>
  );
}
