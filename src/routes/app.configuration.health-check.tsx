import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, PageBody, SectionCard, StatCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, CheckCircle2, AlertTriangle, XCircle, ExternalLink, AlertCircle } from "lucide-react";
import { useApp } from "@/lib/app-store";
import { runConfigurationHealthCheck } from "@/lib/industry-registry";
import { requirePermission } from "@/lib/permission-ui";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useHealthCheck } from "@/hooks/use-api-config";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/configuration/health-check")({ component: HealthCheck });

type LocalResult = ReturnType<typeof runConfigurationHealthCheck>[number];

function HealthCheck() {
  const app = useApp();
  const useApi = shouldUseBackend();
  const [ran, setRan] = useState(false);
  const [localResults, setLocalResults] = useState<LocalResult[]>([]);
  const healthQuery = useHealthCheck(useApi && ran);

  const run = () => {
    if (!requirePermission(app.can("config.health"))) return;
    if (useApi) {
      setRan(true);
      healthQuery.refetch().then(res => {
        const items = res.data?.items ?? [];
        const failed = items.filter(x => x.status === "failed").length;
        if (failed) toast.error(`${failed} check(s) failed`);
        else toast.success("Configuration health check passed");
      });
    } else {
      const r = runConfigurationHealthCheck({
        packConfigs: app.packConfigs,
        flags: app.flags,
        dynamicFields: app.dynamicFields,
        posMode: app.posMode,
      });
      setLocalResults(r);
      setRan(true);
      const failed = r.filter(x => x.status === "failed").length;
      if (failed) toast.error(`${failed} check(s) failed`);
      else toast.success("Configuration health check passed");
    }
  };

  const apiItems = healthQuery.data?.items ?? [];
  const apiSummary = healthQuery.data?.summary;

  const passed = useApi
    ? (apiSummary?.passed ?? apiItems.filter(r => r.status === "passed").length)
    : localResults.filter(r => r.status === "passed").length;
  const warnings = useApi
    ? (apiSummary?.warnings ?? apiItems.filter(r => r.status === "warning").length)
    : localResults.filter(r => r.status === "warning").length;
  const failed = useApi
    ? (apiSummary?.failed ?? apiItems.filter(r => r.status === "failed").length)
    : localResults.filter(r => r.status === "failed").length;

  const icon = (s: string) => s === "passed" ? CheckCircle2 : s === "warning" ? AlertTriangle : XCircle;
  const color = (s: string) => s === "passed" ? "text-success" : s === "warning" ? "text-warning" : "text-destructive";

  return (
    <>
      <PageHeader
        eyebrow="Configuration"
        title="Configuration Health Check"
        subtitle={useApi ? "Validate tenant setup against backend rules" : "Validate packs, fields, flags, receipts, permissions, conflicts, and POS routes."}
        actions={<Button className="gap-1.5" onClick={run} disabled={!app.can("config.health") || healthQuery.isFetching}><Activity className="h-4 w-4" /> Run Configuration Check</Button>}
      />
      <PageBody className="space-y-5">
        {useApi && ran && healthQuery.isError && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Health check failed to run.
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => healthQuery.refetch()}>Retry</Button>
          </div>
        )}

        {ran && (
          <div className="grid gap-4 sm:grid-cols-3">
            {healthQuery.isFetching ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
            ) : (
              <>
                <StatCard label="Passed" value={String(passed)} icon={<CheckCircle2 className="h-4 w-4 text-success" />} />
                <StatCard label="Warnings" value={String(warnings)} icon={<AlertTriangle className="h-4 w-4 text-warning" />} />
                <StatCard label="Failed" value={String(failed)} icon={<XCircle className="h-4 w-4 text-destructive" />} />
              </>
            )}
          </div>
        )}
        <SectionCard title="Results">
          {!ran ? (
            <div className="p-12 text-center text-sm text-muted-foreground">Click Run Configuration Check to validate your tenant setup.</div>
          ) : healthQuery.isFetching && useApi ? (
            <div className="space-y-2 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : useApi ? (
            <div className="divide-y divide-border">
              {apiItems.map(r => {
                const Icon = icon(r.status);
                return (
                  <div key={r.id} className="flex items-start gap-3 px-5 py-4">
                    <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", color(r.status))} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{r.title}</span>
                        <Badge variant="outline" className="text-[10px] capitalize">{r.status}</Badge>
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">{r.message}</p>
                    </div>
                    {r.fix_link && (
                      <Button asChild variant="outline" size="sm" className="shrink-0 gap-1">
                        <Link to={r.fix_link}><ExternalLink className="h-3 w-3" /> Fix</Link>
                      </Button>
                    )}
                  </div>
                );
              })}
              {apiItems.length === 0 && (
                <div className="p-8 text-center text-sm text-muted-foreground">No issues found</div>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {localResults.map(r => {
                const Icon = icon(r.status);
                return (
                  <div key={r.id} className="flex items-start gap-3 px-5 py-4">
                    <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", color(r.status))} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{r.label}</span>
                        <Badge variant="outline" className="text-[10px] capitalize">{r.status}</Badge>
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">{r.detail}</p>
                      {r.fix && <p className="mt-1 text-xs text-primary">{r.fix}</p>}
                    </div>
                    {r.link && (
                      <Button asChild variant="outline" size="sm" className="shrink-0 gap-1">
                        <Link to={r.link}><ExternalLink className="h-3 w-3" /> Fix</Link>
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </PageBody>
    </>
  );
}
