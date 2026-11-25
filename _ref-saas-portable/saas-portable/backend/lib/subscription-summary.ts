import type { TenantSummary } from './tenant-context.js';
import { getPlan, type SubscriptionPlan } from './subscription-plans.js';

export interface SubscriptionSummary {
  plan: SubscriptionPlan | null;
  plan_code: string;
  days_remaining: number | null;
  valid_until: string | null;
  is_trial: boolean;
  status: string;
}

/** Resolve subscription end date: paid plan_valid_until or trial_ends_at for trial. */
export function resolveSubscriptionEndDate(tenant: {
  plan_code: string;
  trial_ends_at: string | null;
  plan_valid_until?: string | null;
}): Date | null {
  const paidUntil = tenant.plan_valid_until ? new Date(tenant.plan_valid_until) : null;
  const trialEnd = tenant.trial_ends_at ? new Date(tenant.trial_ends_at) : null;
  if (paidUntil && trialEnd) {
    return paidUntil > trialEnd ? paidUntil : trialEnd;
  }
  return paidUntil ?? trialEnd;
}

export function computeDaysRemaining(end: Date | null): number | null {
  if (!end || Number.isNaN(end.getTime())) return null;
  const ms = end.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export async function buildSubscriptionSummary(
  tenant: TenantSummary & { plan_valid_until?: string | null }
): Promise<SubscriptionSummary> {
  const plan = await getPlan(tenant.plan_code);
  const end = resolveSubscriptionEndDate(tenant);
  return {
    plan,
    plan_code: tenant.plan_code,
    days_remaining: computeDaysRemaining(end),
    valid_until: end ? end.toISOString() : null,
    is_trial: tenant.plan_code === 'trial',
    status: tenant.status,
  };
}
