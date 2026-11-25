import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { useSuperAdminAuditSummary } from "@/hooks/use-api-config";
import { shouldUseBackend } from "@/lib/demo-mode";

export const Route = createFileRoute("/super-admin/audit-logs")({ component: SuperAuditLogsPage });

const DEMO_AUDIT = [
  { action: "login", count: 42 },
  { action: "sale_complete", count: 128 },
  { action: "product_create", count: 15 },
  { action: "subscription_change", count: 3 },
];

function SuperAuditLogsPage() {
  const on = shouldUseBackend();
  const query = useSuperAdminAuditSummary(on);
  const rows = on ? (query.data ?? []) : DEMO_AUDIT;

  return (
    <>
      <PageHeader eyebrow="Platform" title="Audit summary" subtitle="Aggregated audit actions across all tenants." />
      <PageBody>
        <SectionCard>
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase">
              <tr>
                <th className="px-5 py-2 text-left">Action</th>
                <th className="px-5 py-2 text-right">Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(r => (
                <tr key={r.action}>
                  <td className="px-5 py-3 font-mono text-xs">{r.action}</td>
                  <td className="px-5 py-3 text-right tabular">{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      </PageBody>
    </>
  );
}
