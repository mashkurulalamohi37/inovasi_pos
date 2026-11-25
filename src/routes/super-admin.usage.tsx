import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { useSuperAdminUsage } from "@/hooks/use-api-config";
import { shouldUseBackend } from "@/lib/demo-mode";

export const Route = createFileRoute("/super-admin/usage")({ component: SuperUsagePage });

const DEMO = [
  { id: "demo-1", code: "PULSE-DEMO", name: "Pulse Demo Retail", plan_code: "professional", user_count: 5, store_count: 2 },
  { id: "demo-jw", code: "AURA-JEWELRY", name: "Aura Fine Jewelry & Gems", plan_code: "professional", user_count: 2, store_count: 1 },
  { id: "demo-el", code: "VOLT-ELECTRONICS", name: "Volt Electronics & Gadgets", plan_code: "professional", user_count: 2, store_count: 1 },
  { id: "demo-2", code: "FASHION-01", name: "Style House", plan_code: "starter", user_count: 3, store_count: 1 },
];

function SuperUsagePage() {
  const on = shouldUseBackend();
  const query = useSuperAdminUsage(on);
  const rows = on ? (query.data ?? []) : DEMO;

  return (
    <>
      <PageHeader eyebrow="Platform" title="Usage" subtitle="Per-tenant resource consumption." />
      <PageBody>
        <SectionCard>
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase">
              <tr>
                <th className="px-5 py-2 text-left">Tenant</th>
                <th className="px-3 py-2 text-left">Plan</th>
                <th className="px-3 py-2 text-right">Users</th>
                <th className="px-3 py-2 text-right">Stores</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="px-5 py-3">{r.name}</td>
                  <td className="px-3 py-3">{r.plan_code ?? "—"}</td>
                  <td className="px-3 py-3 text-right tabular">{r.user_count}</td>
                  <td className="px-3 py-3 text-right tabular">{r.store_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      </PageBody>
    </>
  );
}
