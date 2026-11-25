import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOnboardTenant } from "@/hooks/use-api-config";
import { isDemoMode } from "@/lib/demo-mode";
import { toast } from "sonner";

export const Route = createFileRoute("/app/admin/tenants/new")({ component: AdminNewTenantPage });

function AdminNewTenantPage() {
  const demo = isDemoMode();
  const onboard = useOnboardTenant();
  const [form, setForm] = useState({
    company_code: "",
    company_name: "",
    admin_email: "",
    admin_password: "",
    plan_code: "starter",
    industry_packs: ["grocery"],
  });
  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (demo) {
      toast.success("Demo mode — tenant creation preview only");
      return;
    }
    onboard.mutate({
      ...form,
      industry_packs: form.industry_packs as string[],
      store_code: "STORE-01",
      store_name: "Main Store",
      counter_code: "CTR-01",
      counter_name: "Counter 1",
    });
  };

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Create tenant"
        subtitle="Platform admin onboarding (authenticated)."
        actions={<Button variant="outline" size="sm" asChild><Link to="/app/admin/tenants">Back</Link></Button>}
      />
      <PageBody>
        <SectionCard title="Tenant details">
          <form onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-2">
            <div><Label>Company code</Label><Input value={form.company_code} onChange={e => set("company_code", e.target.value)} required /></div>
            <div><Label>Company name</Label><Input value={form.company_name} onChange={e => set("company_name", e.target.value)} required /></div>
            <div><Label>Admin email</Label><Input type="email" value={form.admin_email} onChange={e => set("admin_email", e.target.value)} required /></div>
            <div><Label>Admin password</Label><Input type="password" value={form.admin_password} onChange={e => set("admin_password", e.target.value)} required /></div>
            <div><Label>Plan</Label><Input value={form.plan_code} onChange={e => set("plan_code", e.target.value)} /></div>
            <div className="sm:col-span-2 flex gap-2">
              <Button type="submit" disabled={onboard.isPending}>{onboard.isPending ? "Creating…" : "Create tenant"}</Button>
              <Button type="button" variant="outline" asChild><Link to="/onboarding">Full wizard</Link></Button>
            </div>
          </form>
        </SectionCard>
      </PageBody>
    </>
  );
}
