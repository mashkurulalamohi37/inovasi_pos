import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, PageBody, SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { useTenantDetail, useAssignTenantPlan } from "@/hooks/use-api-config";
import { shouldUseBackend } from "@/lib/demo-mode";

export const Route = createFileRoute("/app/admin/tenants/$id")({ component: AdminTenantDetailPage });

function AdminTenantDetailPage() {
  const { id } = Route.useParams();
  const on = shouldUseBackend();
  const query = useTenantDetail(id, on);
  const assignPlan = useAssignTenantPlan();
  const tenant = query.data;

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title={tenant?.name ?? "Tenant detail"}
        subtitle={tenant ? `${tenant.code} · ${tenant.plan_name ?? "No plan"}` : "Loading tenant…"}
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link to="/app/admin/tenants">Back to list</Link>
          </Button>
        }
      />
      <PageBody>
        {!on ? (
          <SectionCard>
            <div className="p-8 text-center text-sm text-muted-foreground">
              Sign in as platform admin to view live tenant details.
            </div>
          </SectionCard>
        ) : query.isLoading ? (
          <SectionCard><div className="p-8 text-center text-sm text-muted-foreground">Loading…</div></SectionCard>
        ) : query.isError || !tenant ? (
          <SectionCard><div className="p-8 text-center text-sm text-destructive">Tenant not found</div></SectionCard>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Overview">
              <dl className="grid gap-3 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Status</dt><dd><StatusBadge status={tenant.is_suspended ? "suspended" : "active"} /></dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Plan</dt><dd>{tenant.plan_name ?? tenant.plan_code ?? "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Admin email</dt><dd>{tenant.admin_email ?? "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Users</dt><dd className="tabular">{tenant.user_count}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Stores</dt><dd className="tabular">{tenant.store_count}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Counters</dt><dd className="tabular">{tenant.counter_count}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Warehouses</dt><dd className="tabular">{tenant.warehouse_count}</dd></div>
              </dl>
            </SectionCard>
            <SectionCard title="Stores">
              {tenant.stores.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">No stores</div>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {tenant.stores.map(s => (
                    <li key={s.id} className="flex justify-between px-1 py-2">
                      <span>{s.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{s.code}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
            <SectionCard title="Subscription" className="lg:col-span-2">
              <div className="flex flex-wrap gap-2">
                {(["starter", "professional", "enterprise"] as const).map(plan => (
                  <Button
                    key={plan}
                    size="sm"
                    variant={tenant.plan_code === plan ? "default" : "outline"}
                    disabled={assignPlan.isPending || tenant.plan_code === plan}
                    onClick={() => assignPlan.mutate({ company_id: tenant.id, plan_code: plan })}
                  >
                    {plan.charAt(0).toUpperCase() + plan.slice(1)}
                  </Button>
                ))}
              </div>
            </SectionCard>
          </div>
        )}
      </PageBody>
    </>
  );
}
