export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  company_code?: string;
  plan_code: string;
  status: string;
  trial_ends_at: string | null;
  billing_email: string | null;
  logo_url?: string | null;
  theme_primary?: string;
  enabled_modules?: string[];
  feature_flags?: Record<string, unknown>;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  member_role?: string;
  is_default?: boolean;
}

export interface SubscriptionPlan {
  code: string;
  name: string;
  max_users: number;
  max_locations: number;
  price_monthly: number;
  features: Record<string, unknown>;
}

export interface TenantUsage {
  users: number;
  locations: number;
}
