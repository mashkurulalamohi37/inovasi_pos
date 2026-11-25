import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { apiClient } from "@/lib/api-client";
import type { SubscriptionPlan, TenantSummary, TenantUsage } from "@/types/tenant";
import { useAuthContext } from "@/contexts/AuthContext";
import { isMotherAccountRole } from "@/lib/mother-account";

interface TenantContextValue {
  tenant: TenantSummary | null;
  tenants: TenantSummary[];
  plan: SubscriptionPlan | null;
  usage: TenantUsage | null;
  memberRole: string | null;
  isMotherAccount: boolean;
  isPendingApproval: boolean;
  loading: boolean;
  switchTenant: (tenantId: string) => Promise<{ error: Error | null }>;
  refreshTenant: () => Promise<void>;
}

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user, role, loading: authLoading } = useAuthContext();
  const [tenant, setTenant] = useState<TenantSummary | null>(null);
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null);
  const [usage, setUsage] = useState<TenantUsage | null>(null);
  const [memberRole, setMemberRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshTenant = useCallback(async () => {
    if (!user || role === "customer") {
      setTenant(null);
      setTenants([]);
      setPlan(null);
      setUsage(null);
      setMemberRole(null);
      setLoading(false);
      return;
    }

    if (!apiClient.hasOrganizationInToken()) {
      setTenant(null);
      setTenants([]);
      setPlan(null);
      setUsage(null);
      setMemberRole(null);
      setLoading(false);
      return;
    }

    try {
      const [mine, current] = await Promise.all([
        apiClient.getMyTenants(),
        apiClient.getCurrentTenant().catch(() => null),
      ]);
      setTenants(mine);
      if (current?.tenant) {
        setTenant(current.tenant);
        setPlan(current.plan ?? null);
        setUsage(current.usage ?? null);
        setMemberRole(
          (current as { member_role?: string }).member_role ??
            current.tenant.member_role ??
            null
        );
      } else if (mine.length > 0) {
        setTenant(mine[0]);
        setMemberRole(mine[0].member_role ?? null);
      }
    } catch {
      setTenants([]);
    } finally {
      setLoading(false);
    }
  }, [user, role]);

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    void refreshTenant();
  }, [authLoading, refreshTenant]);

  const switchTenant = useCallback(async (tenantId: string) => {
    try {
      const data = await apiClient.switchTenant(tenantId);
      if (data.tenant) setTenant(data.tenant);
      if (data.tenants) setTenants(data.tenants);
      await refreshTenant();
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error("Failed to switch organization") };
    }
  }, [refreshTenant]);

  const isMotherAccount = isMotherAccountRole(memberRole);
  const isPendingApproval = tenant?.status === "pending_approval";

  return (
    <TenantContext.Provider
      value={{
        tenant,
        tenants,
        plan,
        usage,
        memberRole,
        isMotherAccount,
        isPendingApproval,
        loading,
        switchTenant,
        refreshTenant,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenantContext(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error("useTenantContext must be used within TenantProvider");
  }
  return ctx;
}
