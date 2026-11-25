import type { TenantSummary } from "@/types/tenant";

export function tenantHasRequestedPlan(tenant: TenantSummary | null | undefined): boolean {
  if (!tenant?.feature_flags) return false;
  const onboarding = tenant.feature_flags.onboarding;
  if (onboarding && typeof onboarding === "object") {
    return Boolean((onboarding as { plan_requested?: boolean }).plan_requested);
  }
  return Boolean(tenant.feature_flags.plan_requested);
}
