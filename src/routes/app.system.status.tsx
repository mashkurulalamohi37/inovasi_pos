import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PageBody, SectionCard, StatCard } from "@/components/pulse/primitives";
import { Badge } from "@/components/ui/badge";
import { useSystemHealth, useSystemVersion, useBackupStatus, useSystemReadiness } from "@/hooks/use-api-config";
import { isDemoMode, shouldUseBackend } from "@/lib/demo-mode";
import { Activity, Server, Database, ShieldCheck, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/app/system/status")({ component: SystemStatusPage });

function SystemStatusPage() {
  const demo = isDemoMode();
  const useApi = shouldUseBackend();
  const health = useSystemHealth();
  const version = useSystemVersion();
  const backup = useBackupStatus(!demo);
  const readiness = useSystemReadiness();

  const healthData = demo
    ? { status: "ok", service: "Pulse POS", database: "demo" }
    : health.data;

  const checks = readiness.data?.checks ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="System Status"
        subtitle="API health, go-live readiness, version, and backup configuration."
      />
      <PageBody className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-4">
          <StatCard label="API status" value={healthData?.status ?? "—"} icon={<Activity className="h-4 w-4" />} />
          <StatCard label="Database" value={healthData?.database ?? "—"} icon={<Database className="h-4 w-4" />} />
          <StatCard label="Version" value={version.data?.version ?? "demo"} icon={<Server className="h-4 w-4" />} />
          <StatCard
            label="Go-live ready"
            value={useApi ? (readiness.data?.ready ? "Yes" : "No") : "—"}
            icon={<ShieldCheck className="h-4 w-4" />}
          />
        </div>

        {useApi && readiness.data && (
          <SectionCard title="Readiness checks" description={`Environment: ${readiness.data.environment}`}>
            <div className="divide-y divide-border">
              {checks.map(c => (
                <div key={c.name} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    {c.ok ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-destructive" />}
                    <span className="font-medium">{c.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{c.detail ?? ""}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        <SectionCard title="Service details">
          <div className="space-y-3 p-5 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Service</span><span>{healthData?.service ?? version.data?.service ?? "Pulse POS"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">API prefix</span><span className="font-mono text-xs">{version.data?.api_prefix ?? "/api/v1"}</span></div>
            {version.data?.build && (
              <div className="flex justify-between"><span className="text-muted-foreground">Build</span><span>{version.data.build}</span></div>
            )}
            {version.data?.phases && (
              <div className="flex flex-wrap gap-1 pt-2">
                {Object.entries(version.data.phases).map(([k, v]) => (
                  <Badge key={k} variant={v ? "default" : "outline"} className="text-[10px]">{k}</Badge>
                ))}
              </div>
            )}
            {demo && <Badge variant="outline" className="border-warning/30 text-warning">Demo mode — live metrics require backend</Badge>}
          </div>
        </SectionCard>

        <SectionCard title="Backup status">
          <div className="space-y-2 p-5 text-sm">
            {backup.data ? (
              <>
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span>{backup.data.status}</span></div>
                <p className="text-muted-foreground">{backup.data.message}</p>
                <div className="flex justify-between"><span className="text-muted-foreground">Last backup</span><span>{backup.data.last_backup ?? "Not recorded"}</span></div>
              </>
            ) : (
              <p className="text-muted-foreground">Backup status available when connected to backend.</p>
            )}
          </div>
        </SectionCard>
      </PageBody>
    </>
  );
}
