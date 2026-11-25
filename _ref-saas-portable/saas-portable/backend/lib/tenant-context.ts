import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query, getClient } from '../config/database.js';
import { getPlan, isWithinLimit, type SubscriptionPlan } from './subscription-plans.js';
import { isPlatformOperator } from './platform-operator.js';
import { generateUniqueCompanyCode } from './company-code.js';

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  company_code: string;
  plan_code: string;
  status: string;
  trial_ends_at: string | null;
  plan_valid_until: string | null;
  billing_email: string | null;
  logo_url?: string | null;
  theme_primary?: string | null;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  subdomain_slug?: string | null;
  enabled_modules?: string[];
  feature_flags?: Record<string, unknown>;
}

export interface TenantPublicBranding {
  tenant_id: string;
  name: string;
  company_code: string;
  logo_url: string | null;
  theme_primary: string;
  subdomain_slug: string | null;
  tenant_status?: string;
}

export interface TenantMembership {
  tenant_id: string;
  member_role: string;
  is_default: boolean;
}

/** Site-relative default when DB has a broken external placeholder URL. */
export const DEFAULT_TENANT_LOGO_PATH = '/pulse-pharma-logo.svg';

/** Normalize logo URLs returned to the client (fix legacy broken hotlinks). */
export function normalizeTenantLogoUrl(logoUrl: string | null | undefined): string | null {
  if (!logoUrl?.trim()) return null;
  const trimmed = logoUrl.trim();
  if (/wikimedia\.org/i.test(trimmed)) {
    return DEFAULT_TENANT_LOGO_PATH;
  }
  return trimmed;
}

export function slugifyOrganizationName(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'org';
}

export async function ensureUniqueTenantSlug(baseSlug: string): Promise<string> {
  let slug = baseSlug;
  let n = 0;
  for (;;) {
    const existing = await query('SELECT 1 FROM public.tenants WHERE slug = $1 LIMIT 1', [slug]);
    if (existing.rows.length === 0) return slug;
    n += 1;
    slug = `${baseSlug}-${n}`;
    if (slug.length > 64) slug = `${baseSlug.slice(0, 48)}-${n}`;
  }
}

function mapTenantRow(row: Record<string, unknown>): TenantSummary {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    company_code: String(row.company_code ?? row.slug),
    plan_code: String(row.plan_code),
    status: String(row.status),
    trial_ends_at: row.trial_ends_at ? String(row.trial_ends_at) : null,
    plan_valid_until: row.plan_valid_until ? String(row.plan_valid_until) : null,
    billing_email: row.billing_email ? String(row.billing_email) : null,
    logo_url: normalizeTenantLogoUrl(row.logo_url ? String(row.logo_url) : null),
    theme_primary: row.theme_primary ? String(row.theme_primary) : '#0d9488',
    contact_person: row.contact_person ? String(row.contact_person) : null,
    phone: row.phone ? String(row.phone) : null,
    email: row.email ? String(row.email) : null,
    address: row.address ? String(row.address) : null,
    subdomain_slug: row.subdomain_slug ? String(row.subdomain_slug) : null,
    enabled_modules: Array.isArray(row.enabled_modules)
      ? (row.enabled_modules as string[])
      : undefined,
    feature_flags:
      row.feature_flags && typeof row.feature_flags === 'object' && !Array.isArray(row.feature_flags)
        ? (row.feature_flags as Record<string, unknown>)
        : {},
  };
}

export async function getTenantById(tenantId: string): Promise<TenantSummary | null> {
  const result = await query(`SELECT * FROM public.tenants WHERE id = $1`, [tenantId]);
  if (result.rows.length === 0) return null;
  return mapTenantRow(result.rows[0]);
}

export async function resolveTenantByCompanyCodeOrSlug(
  identifier: string
): Promise<TenantPublicBranding | null> {
  const id = identifier.trim();
  if (!id) return null;
  const result = await query(
    `SELECT id, name, company_code, logo_url, theme_primary, subdomain_slug, status
     FROM public.tenants
     WHERE status IN ('active', 'pending_approval')
       AND (
         upper(company_code) = upper($1)
         OR lower(subdomain_slug) = lower($1)
         OR lower(slug) = lower($1)
       )
     LIMIT 1`,
    [id]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    tenant_id: String(row.id),
    name: String(row.name),
    company_code: String(row.company_code),
    logo_url: normalizeTenantLogoUrl(row.logo_url ? String(row.logo_url) : null),
    theme_primary: row.theme_primary ? String(row.theme_primary) : '#0d9488',
    subdomain_slug: row.subdomain_slug ? String(row.subdomain_slug) : null,
    tenant_status: String(row.status ?? 'active'),
  };
}

export async function getMembershipForUser(
  userId: string,
  tenantId: string,
  membershipId: string
): Promise<{
  id: string;
  member_role: string;
  status: string;
  branch_id: string | null;
} | null> {
  const result = await query(
    `SELECT id, member_role, status, branch_id
     FROM public.tenant_members
     WHERE id = $1 AND user_id = $2 AND tenant_id = $3`,
    [membershipId, userId, tenantId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: String(row.id),
    member_role: String(row.member_role),
    status: String(row.status),
    branch_id: row.branch_id ? String(row.branch_id) : null,
  };
}

export async function resolveMembershipForLogin(
  userId: string,
  tenantId: string
): Promise<{
  membershipId: string;
  member_role: string;
  branch_id: string | null;
  status: string;
} | null> {
  const result = await query(
    `SELECT id, member_role, branch_id, status
     FROM public.tenant_members
     WHERE user_id = $1 AND tenant_id = $2 AND status IN ('active', 'invited')
     ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END,
              is_default DESC,
              joined_at ASC NULLS LAST
     LIMIT 1`,
    [userId, tenantId]
  );
  if (result.rows.length === 0) return null;
  return {
    membershipId: String(result.rows[0].id),
    member_role: String(result.rows[0].member_role),
    branch_id: result.rows[0].branch_id ? String(result.rows[0].branch_id) : null,
    status: String(result.rows[0].status ?? 'active'),
  };
}

export async function listTenantsForUser(userId: string): Promise<
  Array<TenantSummary & { member_role: string; is_default: boolean }>
> {
  const result = await query(
    `SELECT t.id, t.name, t.slug, t.company_code, t.plan_code, t.status, t.trial_ends_at,
            t.billing_email, t.logo_url, t.theme_primary,
            tm.member_role, tm.is_default
     FROM public.tenant_members tm
     INNER JOIN public.tenants t ON t.id = tm.tenant_id
     WHERE tm.user_id = $1 AND tm.status = 'active' AND t.status IN ('active', 'pending_approval')
     ORDER BY tm.is_default DESC, t.name ASC`,
    [userId]
  );
  return result.rows.map((row) => ({
    ...mapTenantRow(row),
    member_role: String(row.member_role),
    is_default: Boolean(row.is_default),
  }));
}

export async function userBelongsToTenant(userId: string, tenantId: string): Promise<TenantMembership | null> {
  const result = await query(
    `SELECT tenant_id, member_role, is_default
     FROM public.tenant_members
     WHERE user_id = $1 AND tenant_id = $2`,
    [userId, tenantId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    tenant_id: String(row.tenant_id),
    member_role: String(row.member_role),
    is_default: Boolean(row.is_default),
  };
}

export async function resolveActiveTenantId(
  userId: string,
  preferredTenantId?: string | null
): Promise<string | null> {
  if (preferredTenantId) {
    const membership = await userBelongsToTenant(userId, preferredTenantId);
    if (membership) return preferredTenantId;
  }

  const defaultMember = await query(
    `SELECT tenant_id FROM public.tenant_members
     WHERE user_id = $1 AND is_default = TRUE
     LIMIT 1`,
    [userId]
  );
  if (defaultMember.rows[0]?.tenant_id) {
    return String(defaultMember.rows[0].tenant_id);
  }

  const anyMember = await query(
    `SELECT tenant_id FROM public.tenant_members WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [userId]
  );
  if (anyMember.rows[0]?.tenant_id) {
    return String(anyMember.rows[0].tenant_id);
  }

  return null;
}

/** Platform console access (role or default operator email). */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  return isPlatformOperator(userId);
}

export function getTenantIdFromRequest(req: Request): string | undefined {
  const header = req.headers['x-tenant-id'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  const user = req.user as { tenantId?: string } | undefined;
  if (user?.tenantId) return user.tenantId;
  return req.tenantId;
}

export async function assertTenantActive(tenantId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const tenant = await getTenantById(tenantId);
  if (!tenant) return { ok: false, message: 'Organization not found' };
  if (tenant.status === 'suspended') {
    return { ok: false, message: 'This organization has been suspended. Contact support.' };
  }
  if (tenant.status === 'cancelled') {
    return { ok: false, message: 'This organization subscription has ended.' };
  }
  if (tenant.status === 'pending_approval') {
    return {
      ok: false,
      message:
        'Your organization is awaiting platform approval. You will get full access once approved.',
      code: 'TENANT_PENDING_APPROVAL',
    };
  }
  if (tenant.trial_ends_at) {
    const trialEnd = new Date(tenant.trial_ends_at);
    if (trialEnd < new Date() && tenant.plan_code === 'trial') {
      return { ok: false, message: 'Trial period has ended. Please upgrade your plan.' };
    }
  }
  return { ok: true };
}

export async function countTenantUsers(tenantId: string): Promise<number> {
  const result = await query(
    'SELECT COUNT(*)::int AS c FROM public.tenant_members WHERE tenant_id = $1',
    [tenantId]
  );
  return Number(result.rows[0]?.c ?? 0);
}

export async function countTenantLocations(tenantId: string): Promise<number> {
  const result = await query(
    'SELECT COUNT(*)::int AS c FROM public.locations WHERE tenant_id = $1',
    [tenantId]
  );
  return Number(result.rows[0]?.c ?? 0);
}

export async function assertPlanAllowsUsers(tenantId: string, plan: SubscriptionPlan): Promise<void> {
  const count = await countTenantUsers(tenantId);
  if (!isWithinLimit(count, plan.max_users)) {
    throw new Error(`User limit reached for plan "${plan.name}" (${plan.max_users} users). Upgrade to add more.`);
  }
}

export async function assertPlanAllowsLocation(tenantId: string, plan: SubscriptionPlan): Promise<void> {
  const count = await countTenantLocations(tenantId);
  if (!isWithinLimit(count, plan.max_locations)) {
    throw new Error(
      `Location limit reached for plan "${plan.name}" (${plan.max_locations} stores). Upgrade to add more.`
    );
  }
}

export interface RegisterOrganizationInput {
  organizationName: string;
  slug?: string;
  email: string;
  password: string;
  displayName?: string;
  billingEmail?: string;
  logo_url?: string | null;
  phone?: string | null;
  address?: string | null;
}

export async function registerOrganization(input: RegisterOrganizationInput): Promise<{
  tenantId: string;
  userId: string;
  locationId: string;
}> {
  const client = await getClient();
  const organizationName = input.organizationName.trim();
  if (!organizationName) throw new Error('Organization name is required');

  const baseSlug = slugifyOrganizationName(input.slug?.trim() || organizationName);
  const slug = await ensureUniqueTenantSlug(baseSlug);
  const companyCode = await generateUniqueCompanyCode(organizationName);

  const trialEnds = new Date();
  trialEnds.setDate(trialEnds.getDate() + 14);

  try {
    await client.query('BEGIN');

    const { validateTenantLogoValue } = await import('./tenant-logo-upload.js');
    const logoUrl = input.logo_url ? validateTenantLogoValue(input.logo_url) : null;

    const tenantInsert = await client.query(
      `INSERT INTO public.tenants (
         name, slug, company_code, plan_code, status, trial_ends_at, billing_email,
         logo_url, contact_person, email, phone, address
       )
       VALUES ($1, $2, $3, 'trial', 'pending_approval', $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        organizationName,
        slug,
        companyCode,
        trialEnds.toISOString(),
        input.billingEmail || input.email,
        logoUrl,
        input.displayName?.trim() || null,
        input.email.toLowerCase().trim(),
        input.phone?.trim() || null,
        input.address?.trim() || null,
      ]
    );
    const tenantId = String(tenantInsert.rows[0].id);

    const normalizedEmail = input.email.toLowerCase().trim();
    const hashedPassword = await bcrypt.hash(input.password, 10);

    const userResult = await client.query(
      `INSERT INTO auth.users (email, encrypted_password, email_confirmed_at, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW(), NOW())
       RETURNING id`,
      [normalizedEmail, hashedPassword]
    );
    const userId = String(userResult.rows[0].id);

    await client.query(
      `INSERT INTO public.profiles (id, user_id, display_name, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, NOW(), NOW())`,
      [userId, input.displayName || organizationName]
    );

    const { resolveUserRoleEnumLabel } = await import('./user-role-enum.js');
    const adminLabel = await resolveUserRoleEnumLabel('admin');
    await client.query(
      `INSERT INTO public.user_roles (id, user_id, role, created_at)
       VALUES (gen_random_uuid(), $1, $2, NOW())`,
      [userId, adminLabel]
    );

    await client.query(
      `INSERT INTO public.tenant_members (tenant_id, user_id, member_role, status, is_default, joined_at)
       VALUES ($1, $2, 'owner', 'active', TRUE, NOW())`,
      [tenantId, userId]
    );

    const locationResult = await client.query(
      `INSERT INTO public.locations (id, name, address, phone, is_active, tenant_id, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, NULL, NULL, TRUE, $2, NOW(), NOW())
       RETURNING id`,
      [`${organizationName} — Main Store`, tenantId]
    );
    const locationId = String(locationResult.rows[0].id);

    await client.query('COMMIT');
    return { tenantId, userId, locationId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export function requireTenantOnRequest(req: Request, res: Response): string | null {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) {
    res.status(403).json({
      error: 'No organization context. Select an organization or complete onboarding.',
      code: 'TENANT_REQUIRED',
    });
    return null;
  }
  return tenantId;
}

/** SQL fragment: AND table.tenant_id = $n */
export function tenantWhereClause(tableAlias: string, paramIndex: number): string {
  return ` AND ${tableAlias}.tenant_id = $${paramIndex}`;
}
