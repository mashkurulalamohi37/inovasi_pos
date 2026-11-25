import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, PageBody, SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useSuperAdminTenants,
  useSupportAccessSessions,
  useStartSupportAccess,
  useEndSupportAccess,
} from "@/hooks/use-api-config";
import { applySupportAccessToken, restoreOperatorSessionAfterSupport } from "@/lib/auth";
import { shouldUseBackend } from "@/lib/demo-mode";
import { toast } from "sonner";

export const Route = createFileRoute("/super-admin/support-access")({ component: SupportAccessPage });

function SupportAccessPage() {
  const on = shouldUseBackend();
  const tenants = useSuperAdminTenants(on);
  const sessions = useSupportAccessSessions(on);
  const start = useStartSupportAccess();
  const end = useEndSupportAccess();
  const [companyId, setCompanyId] = useState("");
  const [reason, setReason] = useState("Customer support");

  const handleStart = async () => {
    if (!companyId) {
      toast.error("Select a tenant");
      return;
    }
    try {
      const result = await start.mutateAsync({
        company_id: companyId,
        reason,
        duration_minutes: 60,
      });
      await applySupportAccessToken(result.access_token);
      toast.success(`Support mode active for ${result.target_company_name}`);
      window.location.href = "/app/pos";
    } catch {
      /* handled by mutation */
    }
  };

  const handleEnd = async (sessionId: string) => {
    try {
      await end.mutateAsync(sessionId);
      const restored = await restoreOperatorSessionAfterSupport();
      if (restored) {
        toast.success("Back to operator account");
        window.location.href = "/super-admin/support-access";
      }
    } catch {
      /* handled by mutation */
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Support access"
        subtitle="Enter a tenant as their Admin for up to 60 minutes. All actions are audited. Your operator session is restored when you end support."
      />
      <PageBody className="space-y-4">
        <SectionCard title="Start support session">
          {!on ? (
            <p className="p-4 text-sm text-muted-foreground">Connect to backend to manage support access.</p>
          ) : (
            <div className="grid gap-4 p-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Tenant</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={companyId}
                  onChange={e => setCompanyId(e.target.value)}
                >
                  <option value="">Select tenant…</option>
                  {(tenants.data ?? []).map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.code})</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Input value={reason} onChange={e => setReason(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Button onClick={handleStart} disabled={start.isPending || !companyId}>
                  Enter support mode (60 min)
                </Button>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Recent sessions">
          {sessions.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading sessions…</div>
          ) : (sessions.data ?? []).length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No support sessions recorded.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase">
                <tr>
                  <th className="px-5 py-2 text-left">Tenant</th>
                  <th className="px-3 py-2 text-left">Target user</th>
                  <th className="px-3 py-2 text-left">Reason</th>
                  <th className="px-3 py-2 text-left">Expires</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-5 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(sessions.data ?? []).map(s => (
                  <tr key={s.id}>
                    <td className="px-5 py-3">{s.target_company_name ?? s.target_company_id}</td>
                    <td className="px-3 py-3 text-muted-foreground">{s.target_user_email ?? "—"}</td>
                    <td className="px-3 py-3">{s.reason ?? "—"}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{new Date(s.expires_at).toLocaleString()}</td>
                    <td className="px-3 py-3"><StatusBadge status={s.is_active ? "active" : "inactive"} /></td>
                    <td className="px-5 py-3 text-right">
                      {s.is_active && on ? (
                        <Button size="sm" variant="outline" onClick={() => handleEnd(s.id)}>End</Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      </PageBody>
    </>
  );
}
