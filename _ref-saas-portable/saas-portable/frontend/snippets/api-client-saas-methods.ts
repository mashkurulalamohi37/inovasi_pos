/**
 * SaaS API types + methods — merge into your ApiClient class.
 * Requires base `request()`, `setToken()`, `setActiveTenantId()` methods.
 */

// --- Types (top of api-client.ts) ---

export interface SubscriptionPlanRow {
  code: string;
  name: string;
  max_users: number;
  max_locations: number;
  price_monthly: number;
  features?: Record<string, unknown>;
  is_active?: boolean;
}

export interface SaasAdminUserRow {
  user_id: string;
  email: string;
  display_name: string | null;
  phone: string | null;
  memberships: Array<{
    tenant_id: string;
    tenant_name: string;
    company_code: string;
    member_role: string;
    status: string;
  }>;
}

export interface PlatformNotificationRow {
  id: string;
  tenant_id: string;
  tenant_name?: string;
  company_code?: string;
  title: string;
  message: string;
  severity: string;
  is_read: boolean;
  created_at: string;
}

// --- Methods (inside ApiClient class) ---

async resolveTenantBranding(companyCode: string) {
  return this.request<{
    tenant_id: string;
    name: string;
    company_code: string;
    logo_url: string | null;
    theme_primary: string;
  }>(`/public/tenant-branding?code=${encodeURIComponent(companyCode)}`);
}

async signIn(email: string, password: string, remember = true, companyCode?: string) {
  const data = await this.request<{
    user: { id: string; email: string };
    profile: unknown;
    role: string;
    token: string;
    tenant?: { id: string };
    membership_status?: string;
    customer_portal_pending?: boolean;
  }>('/auth/signin', {
    method: 'POST',
    body: JSON.stringify({ email, password, companyCode }),
  });
  this.setToken(data.token, remember);
  if (data.tenant?.id) this.setActiveTenantId(data.tenant.id);
  return data;
}

async registerOrganization(
  payload: {
    organizationName: string;
    slug?: string;
    email: string;
    password: string;
    displayName?: string;
    logo_url?: string | null;
    phone?: string;
    address?: string;
  },
  options?: { persistSession?: boolean }
) {
  const data = await this.request<{
    user: { id: string; email: string };
    tenant: { id: string; company_code?: string; name?: string };
    token: string;
  }>('/tenants/register', { method: 'POST', body: JSON.stringify(payload) });
  if (options?.persistSession !== false) {
    this.setToken(data.token, true);
    if (data.tenant?.id) this.setActiveTenantId(data.tenant.id);
  }
  return data;
}

async getPublicSubscriptionPlans() {
  return this.request<SubscriptionPlanRow[]>('/tenants/plans');
}

async getMyTenants() {
  return this.request<Array<{
    id: string;
    name: string;
    slug: string;
    plan_code: string;
    member_role: string;
    is_default: boolean;
  }>>('/tenants/mine');
}

async getCurrentTenant() {
  return this.request<{
    tenant: {
      id: string;
      name: string;
      slug: string;
      plan_code: string;
      status: string;
      company_code?: string;
      feature_flags?: Record<string, unknown>;
    };
    plan: { code: string; name: string; max_users: number; max_locations: number } | null;
    usage: { users: number; locations: number };
    member_role: string;
  }>('/tenants/current');
}

async switchTenant(tenantId: string) {
  const data = await this.request<{ tenant: { id: string }; token: string }>(
    '/tenants/switch',
    { method: 'POST', body: JSON.stringify({ tenantId }) }
  );
  this.setToken(data.token, true);
  if (data.tenant?.id) this.setActiveTenantId(data.tenant.id);
  return data;
}

async requestTenantPlan(planCode: string) {
  return this.request<{ tenant: unknown; message: string }>(
    '/tenants/current/request-plan',
    { method: 'POST', body: JSON.stringify({ plan_code: planCode }) }
  );
}

async getSaasAdminDashboard() {
  return this.request<{
    active_tenants: number;
    suspended_tenants: number;
    active_employees: number;
    trial_tenants: number;
    pending_approval_tenants?: number;
  }>('/saas-admin/dashboard');
}

async getSaasAdminTenants() {
  return this.request<unknown[]>('/saas-admin/tenants');
}

async createSaasTenant(body: Record<string, unknown>) {
  return this.request<{ tenant: unknown; company_code: string }>('/saas-admin/tenants', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async approveSaasTenant(tenantId: string) {
  return this.request<{ tenant: unknown }>(`/saas-admin/tenants/${tenantId}/approve`, {
    method: 'POST',
  });
}

async getSaasAdminPlans() {
  return this.request<SubscriptionPlanRow[]>('/saas-admin/plans');
}

async createSaasPlan(body: Record<string, unknown>) {
  return this.request<SubscriptionPlanRow>('/saas-admin/plans', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async updateSaasPlan(code: string, body: Record<string, unknown>) {
  return this.request<SubscriptionPlanRow>(`/saas-admin/plans/${encodeURIComponent(code)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

async deleteSaasPlan(code: string) {
  return this.request(`/saas-admin/plans/${encodeURIComponent(code)}`, { method: 'DELETE' });
}

async allocateSaasTenantPlan(
  tenantId: string,
  body: {
    plan_code: string;
    period_months?: number;
    amount?: number;
    payment_method?: string;
    reference_no?: string;
    notes?: string;
  }
) {
  return this.request(`/saas-admin/tenants/${tenantId}/allocate-plan`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async getSaasAdminUsers(params?: { search?: string; limit?: number }) {
  const q = new URLSearchParams();
  if (params?.search) q.set('search', params.search);
  if (params?.limit) q.set('limit', String(params.limit));
  const suffix = q.toString() ? `?${q}` : '';
  return this.request<SaasAdminUserRow[]>(`/saas-admin/users${suffix}`);
}

async sendSaasAdminNotification(body: {
  title: string;
  message: string;
  severity?: string;
  tenant_id?: string;
  broadcast_all?: boolean;
}) {
  return this.request<{ count: number }>('/saas-admin/notifications', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async updatePlatformTenantStatus(tenantId: string, status: string) {
  return this.request(`/tenants/platform/${tenantId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

async updatePlatformTenantPlan(tenantId: string, plan_code: string) {
  return this.request(`/tenants/platform/${tenantId}/plan`, {
    method: 'PATCH',
    body: JSON.stringify({ plan_code }),
  });
}
