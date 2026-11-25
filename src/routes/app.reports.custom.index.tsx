import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Play, FileText } from "lucide-react";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useAuth } from "@/lib/auth-provider";
import { LoadingState, ErrorState, EmptyState } from "@/components/pulse/states";
import { useCustomReports } from "@/hooks/use-api-config";

export const Route = createFileRoute("/app/reports/custom/")({ component: CustomReportsPage });

function CustomReportsPage() {
  const useApi = shouldUseBackend();
  const { can } = useAuth();
  const listQuery = useCustomReports(useApi);

  return (
    <>
      <PageHeader
        eyebrow="Insights"
        title="Custom Reports"
        subtitle="Company-wide custom reports — pick columns, then filter by date"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/app/reports">Catalog</Link>
            </Button>
            {can("reports.custom") && (
              <Button size="sm" className="gap-1.5" asChild>
                <Link to="/app/reports/custom/new"><Plus className="h-3.5 w-3.5" /> Create report</Link>
              </Button>
            )}
          </div>
        }
      />
      <PageBody className="space-y-4">
        {!useApi && (
          <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
            Custom reports require backend mode.
          </div>
        )}
        {useApi && listQuery.isLoading && <LoadingState />}
        {useApi && listQuery.isError && <ErrorState onRetry={() => listQuery.refetch()} />}
        {useApi && !listQuery.isLoading && (listQuery.data?.length ?? 0) === 0 && (
          <EmptyState
            title="No custom reports yet"
            description={can("reports.custom")
              ? "Create a report from Sales, Purchases, or Stock movements."
              : "Ask an Admin or Store Manager to create company reports."}
          />
        )}
        {useApi && (listQuery.data?.length ?? 0) > 0 && (
          <SectionCard title="Saved reports" description="Shared with everyone in this company">
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {(listQuery.data ?? []).map((r) => (
                <Card key={r.id} className="flex flex-col p-4">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                      <FileText className="h-4 w-4" />
                    </div>
                    <Badge variant="outline" className="text-[10px]">{r.source_key}</Badge>
                  </div>
                  <h3 className="font-display text-sm font-semibold">{r.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{r.columns.length} columns</p>
                  <Button asChild size="sm" variant="outline" className="mt-3 w-full gap-1.5">
                    <Link to="/app/reports/custom/$reportId" params={{ reportId: r.id }}>
                      <Play className="h-3.5 w-3.5" /> Run
                    </Link>
                  </Button>
                </Card>
              ))}
            </div>
          </SectionCard>
        )}
      </PageBody>
    </>
  );
}
