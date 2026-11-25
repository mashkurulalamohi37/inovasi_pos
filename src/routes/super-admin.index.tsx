import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, PageBody, SectionCard, StatCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useApproveTenant,
  useRejectTenant,
  useSuperAdminTenants,
  useSuperAdminAuditSummary,
} from "@/hooks/use-api-config";
import { shouldUseBackend } from "@/lib/demo-mode";
import { Building2, Users, ScrollText, Package, ClipboardList } from "lucide-react";

export const Route = createFileRoute("/super-admin/")({ component: SuperAdminHome });

function SuperAdminHome() {
  const on = shouldUseBackend();
  const tenants = useSuperAdminTenants(on);
  const audit = useSuperAdminAuditSummary(on);
  const approve = useApproveTenant();
  const reject = useRejectTenant();
  const list = tenants.data ?? [];
  const pending = list.filter((t) => (t.approval_status ?? "approved") === "pending");
  const active = list.filter((t) => !t.is_suspended && (t.approval_status ?? "approved") === "approved").length;
  const suspended = list.filter((t) => t.is_suspended).length;
  const auditTotal = audit.data?.reduce((s, r) => s + r.count, 0) ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="SaaS control center"
        subtitle="Approve signups, manage packages, and track which customer is on which plan."
      />
      <PageBody className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Tenants" value={String(list.length)} icon={<Building2 className="h-4 w-4" />} />
          <StatCard label="Signup queue" value={String(pending.length)} hint="Awaiting approval" icon={<ClipboardList className="h-4 w-4" />} />
          <StatCard label="Active" value={String(active)} hint={`${suspended} suspended`} icon={<Users className="h-4 w-4" />} />
          <StatCard label="Audit events" value={String(auditTotal)} icon={<ScrollText className="h-4 w-4" />} />
        </div>

        <SectionCard
          title="Signup requests"
          description="Companies that submitted the signup form and need platform approval before they can sign in."
          actions={
            <Button asChild size="sm" variant="outline">
              <Link to="/super-admin/tenants">Open all requests</Link>
            </Button>
          }
        >
          {pending.length === 0 ? (
            <div className="p-5 text-sm text-muted-foreground">No pending signup requests.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 text-left">Company</th>
                  <th className="px-3 py-2 text-left">Requested package</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-5 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pending.slice(0, 8).map((t) => (
                  <tr key={t.id}>
                    <td className="px-5 py-3">
                      <div className="font-medium">{t.name}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{t.code}</div>
                    </td>
                    <td className="px-3 py-3">{t.plan_name ?? t.plan_code ?? "—"}</td>
                    <td className="px-3 py-3"><Badge variant="secondary">pending</Badge></td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1.5">
                        {on && (
                          <>
                            <Button
                              size="sm"
                              disabled={approve.isPending}
                              onClick={() =>
                                approve.mutate({
                                  companyId: t.id,
                                  plan_code: t.plan_code,
                                  billing_cycle: t.billing_cycle || "monthly",
                                  billing_months: 1,
                                })
                              }
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={reject.isPending}
                              onClick={() => reject.mutate({ companyId: t.id })}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>

        <SectionCard title="Quick actions">
          <div className="flex flex-wrap gap-2 p-5">
            <Button asChild size="sm"><Link to="/super-admin/tenants">Tenants & signups</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/super-admin/subscriptions">Packages</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/super-admin/users">Users</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/super-admin/roles">Roles & access</Link></Button>
            <Button asChild variant="outline" size="sm"><Link to="/onboarding">Signup wizard</Link></Button>
            <Button asChild variant="outline" size="sm" className="gap-1">
              <Link to="/super-admin/subscriptions"><Package className="h-3.5 w-3.5" /> Create package</Link>
            </Button>
          </div>
        </SectionCard>
      </PageBody>
    </>
  );
}
