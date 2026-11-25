import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { useSuperAdminTenants } from "@/hooks/use-api-config";
import { shouldUseBackend } from "@/lib/demo-mode";

export const Route = createFileRoute("/app/admin/tenants")({ component: AdminTenantsPage });

const DEMO = [
  { id: "demo-1", code: "PULSE-DEMO", name: "Pulse Demo Retail", plan_name: "Professional", user_count: 5, store_count: 2, is_suspended: false },
  { id: "demo-jw", code: "AURA-JEWELRY", name: "Aura Fine Jewelry & Gems", plan_name: "Professional", user_count: 2, store_count: 1, is_suspended: false },
  { id: "demo-el", code: "VOLT-ELECTRONICS", name: "Volt Electronics & Gadgets", plan_name: "Professional", user_count: 2, store_count: 1, is_suspended: false },
];

function AdminTenantsPage() {
  const on = shouldUseBackend();
  const query = useSuperAdminTenants(on);
  const rows = on ? (query.data ?? []) : DEMO;

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Tenants"
        subtitle="Platform tenant directory (requires platform admin)."
        actions={<Button size="sm" asChild><Link to="/app/admin/tenants/new">New tenant</Link></Button>}
      />
      <PageBody>
        <SectionCard>
          {!on ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Demo data shown — sign in as platform admin for live tenants.</div>
          ) : null}
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase">
              <tr>
                <th className="px-5 py-2 text-left">Company</th>
                <th className="px-3 py-2 text-left">Plan</th>
                <th className="px-3 py-2 text-right">Users</th>
                <th className="px-5 py-2 text-right">Stores</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(t => (
                <tr key={t.id}>
                  <td className="px-5 py-3">
                    <Link to="/app/admin/tenants/$id" params={{ id: t.id }} className="hover:underline">
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.code}</div>
                    </Link>
                  </td>
                  <td className="px-3 py-3">{t.plan_name ?? "—"}</td>
                  <td className="px-3 py-3 text-right tabular">{t.user_count}</td>
                  <td className="px-5 py-3 text-right tabular">{t.store_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      </PageBody>
    </>
  );
}
