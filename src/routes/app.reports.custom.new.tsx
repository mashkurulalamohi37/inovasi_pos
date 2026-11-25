import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PermissionGate } from "@/components/pulse/gates";
import { LoadingState, ErrorState } from "@/components/pulse/states";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useCreateCustomReport, useCustomReportSources } from "@/hooks/use-api-config";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/reports/custom/new")({ component: CustomReportBuilderPage });

function CustomReportBuilderPage() {
  const useApi = shouldUseBackend();
  const navigate = useNavigate();
  const sourcesQuery = useCustomReportSources(useApi);
  const createMut = useCreateCustomReport();

  const [title, setTitle] = useState("");
  const [sourceKey, setSourceKey] = useState("sales_lines");
  const [selected, setSelected] = useState<string[]>([]);

  const source = useMemo(
    () => (sourcesQuery.data ?? []).find((s) => s.key === sourceKey),
    [sourcesQuery.data, sourceKey],
  );

  const toggle = (code: string) => {
    setSelected((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

  const selectAll = () => {
    if (!source) return;
    setSelected(source.columns.map((c) => c.code));
  };

  const handleSave = async () => {
    if (!title.trim() || selected.length === 0) return;
    const report = await createMut.mutateAsync({
      title: title.trim(),
      source_key: sourceKey,
      columns: selected,
    });
    void navigate({ to: "/app/reports/custom/$reportId", params: { reportId: report.id } });
  };

  return (
    <PermissionGate perm="reports.custom" fallback={
      <PageBody><ErrorState title="Permission denied" description="Requires reports.custom (Admin or Store Manager)" /></PageBody>
    }>
      <PageHeader
        eyebrow="Custom Reports"
        title="Create custom report"
        subtitle="Choose a data source and the columns you want to see"
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/app/reports/custom">Cancel</Link>
          </Button>
        }
      />
      <PageBody className="space-y-4">
        {!useApi && <div className="text-sm text-muted-foreground">Backend required.</div>}
        {useApi && sourcesQuery.isLoading && <LoadingState />}
        {useApi && sourcesQuery.isError && <ErrorState onRetry={() => sourcesQuery.refetch()} />}
        {useApi && source && (
          <>
            <SectionCard title="Report details">
              <div className="grid gap-3 p-4 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <Label>Report title</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Fashion sales by size" />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Data source</Label>
                  <div className="flex flex-wrap gap-2">
                    {(sourcesQuery.data ?? []).map((s) => (
                      <Button
                        key={s.key}
                        type="button"
                        size="sm"
                        variant={sourceKey === s.key ? "default" : "outline"}
                        onClick={() => {
                          setSourceKey(s.key);
                          setSelected([]);
                        }}
                      >
                        {s.label}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{source.description}</p>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Columns"
              description="Select the fields that appear in the report. Filters will be based on filterable columns."
              actions={
                <Button type="button" size="sm" variant="outline" onClick={selectAll}>Select all</Button>
              }
            >
              <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {source.columns.map((col) => {
                  const on = selected.includes(col.code);
                  return (
                    <button
                      key={col.code}
                      type="button"
                      onClick={() => toggle(col.code)}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                        on ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
                      )}
                    >
                      <div className="font-medium">{col.label}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {col.code} · {col.type}{col.filterable ? " · filterable" : ""}
                      </div>
                    </button>
                  );
                })}
              </div>
            </SectionCard>

            <div className="flex justify-end gap-2">
              <Button
                onClick={() => void handleSave()}
                disabled={!title.trim() || selected.length === 0 || createMut.isPending}
              >
                {createMut.isPending ? "Saving…" : "Save & run"}
              </Button>
            </div>
          </>
        )}
      </PageBody>
    </PermissionGate>
  );
}
