import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { Badge } from "@/components/ui/badge";
import { useSubscriptionUsage } from "@/hooks/use-api-config";
import { isDemoMode } from "@/lib/demo-mode";

export const Route = createFileRoute("/app/subscription/usage")({ component: SubscriptionUsagePage });

function SubscriptionUsagePage() {
  const demo = isDemoMode();
  const query = useSubscriptionUsage(!demo);
  const usage = query.data?.usage ?? {};
  const warnings = query.data?.warnings ?? [];

  if (demo) {
    return (
      <>
        <PageHeader eyebrow="Billing" title="Usage" subtitle="Sign in with backend to view usage." />
        <PageBody><SectionCard><div className="p-8 text-center text-sm text-muted-foreground">Usage metrics require backend.</div></SectionCard></PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow="Billing" title="Usage" subtitle="Resource consumption vs plan limits." />
      <PageBody className="space-y-5">
        {warnings.length > 0 && (
          <SectionCard title="Warnings">
            <div className="space-y-2 p-5">
              {warnings.map(w => (
                <div key={w.metric} className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className="border-warning/30 text-warning">{w.usage_pct}%</Badge>
                  <span>{w.metric}: {w.message}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        )}
        <SectionCard title="Metrics">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase">
              <tr>
                <th className="px-5 py-2 text-left">Metric</th>
                <th className="px-3 py-2 text-right">Current</th>
                <th className="px-5 py-2 text-right">Limit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {Object.entries(usage).map(([metric, data]) => (
                <tr key={metric}>
                  <td className="px-5 py-3 capitalize">{metric.replace(/_/g, " ")}</td>
                  <td className="px-3 py-3 text-right tabular">{data.current}</td>
                  <td className="px-5 py-3 text-right tabular">{data.limit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      </PageBody>
    </>
  );
}
