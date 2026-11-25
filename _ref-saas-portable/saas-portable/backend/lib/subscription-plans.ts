import { query } from '../config/database.js';

export interface SubscriptionPlan {
  code: string;
  name: string;
  max_users: number;
  max_locations: number;
  price_monthly: number;
  features: Record<string, unknown>;
}

export async function getPlan(code: string): Promise<SubscriptionPlan | null> {
  const result = await query(
    `SELECT code, name, max_users, max_locations, price_monthly, features
     FROM public.subscription_plans
     WHERE code = $1 AND is_active = TRUE`,
    [code]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    code: String(row.code),
    name: String(row.name),
    max_users: Number(row.max_users),
    max_locations: Number(row.max_locations),
    price_monthly: Number(row.price_monthly),
    features: (row.features as Record<string, unknown>) ?? {},
  };
}

export async function listPlans(): Promise<SubscriptionPlan[]> {
  const result = await query(
    `SELECT code, name, max_users, max_locations, price_monthly, features
     FROM public.subscription_plans
     WHERE is_active = TRUE
     ORDER BY price_monthly ASC`
  );
  return result.rows.map((row) => ({
    code: String(row.code),
    name: String(row.name),
    max_users: Number(row.max_users),
    max_locations: Number(row.max_locations),
    price_monthly: Number(row.price_monthly),
    features: (row.features as Record<string, unknown>) ?? {},
  }));
}

/** -1 means unlimited */
export function isWithinLimit(current: number, max: number): boolean {
  if (max < 0) return true;
  return current < max;
}
