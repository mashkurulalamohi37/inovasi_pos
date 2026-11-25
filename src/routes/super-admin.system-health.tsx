import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PageBody, SectionCard, StatCard } from "@/components/pulse/primitives";
import { Badge } from "@/components/ui/badge";
import { useSuperAdminSystemHealth } from "@/hooks/use-api-config";
import { shouldUseBackend } from "@/lib/demo-mode";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/super-admin/system-health")({ component: SuperSystemHealthPage });

function SuperSystemHealthPage() {
  const on = shouldUseBackend();
  const query = useSuperAdminSystemHealth(on);
  const items = query.data?.items ?? [];
  const summary = query.data?.summary ?? {};

  return (
    <>
      <PageHeader eyebrow="Platform" title="System health" subtitle="Demo tenant configuration health snapshot." />
      <PageBody className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-4">
          <StatCard label="Passed" value={String(summary.passed ?? items.filter(i => i.status === "passed").length)} />
          <StatCard label="Warnings" value={String(summary.warnings ?? items.filter(i => i.status === "warning").length)} />
          <StatCard label="Failed" value={String(summary.failed ?? items.filter(i => i.status === "failed").length)} />
          <StatCard label="Total checks" value={String(items.length)} />
        </div>
        <SectionCard title="Health items">
          {query.isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No health data — sign in as platform admin with backend.</div>
          ) : (
            <div className="divide-y divide-border">
              {items.map(item => (
                <div key={item.id} className="flex items-start gap-3 px-5 py-4">
                  <Badge variant="outline" className={cn(
                    item.status === "passed" && "border-success/30 text-success",
                    item.status === "warning" && "border-warning/30 text-warning",
                    item.status === "failed" && "border-destructive/30 text-destructive",
                  )}>
                    {item.status}
                  </Badge>
                  <div>
                    <div className="font-medium">{item.title}</div>
                    <div className="text-sm text-muted-foreground">{item.message}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </PageBody>
    </>
  );
}
