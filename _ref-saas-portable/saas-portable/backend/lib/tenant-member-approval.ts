import { query } from '../config/database.js';
import { resolveUserRoleEnumLabel } from './user-role-enum.js';
import { isPlatformAdmin } from './tenant-context.js';

const MANAGER_MEMBER_ROLES = new Set(['owner', 'tenant_admin']);

const STAFF_PORTAL_ROLES = new Set(['admin', 'pharmacist', 'cashier']);

/**
 * Organization owner / admin who can approve staff and customer portal access.
 */
export async function userCanManageMemberApprovals(
  userId: string,
  tenantId: string
): Promise<boolean> {
  if (await isPlatformAdmin(userId)) {
    const member = await query(
      `SELECT 1 FROM public.tenant_members
       WHERE user_id = $1 AND tenant_id = $2 AND status = 'active' AND member_role = 'owner'
       LIMIT 1`,
      [userId, tenantId]
    );
    if (member.rows.length > 0) return true;
  }

  const member = await query(
    `SELECT member_role FROM public.tenant_members
     WHERE user_id = $1 AND tenant_id = $2 AND status = 'active'`,
    [userId, tenantId]
  );
  const memberRole = String(member.rows[0]?.member_role || '').toLowerCase();
  if (MANAGER_MEMBER_ROLES.has(memberRole)) return true;

  const roleResult = await query(
    'SELECT role FROM public.user_roles WHERE user_id = $1 LIMIT 1',
    [userId]
  );
  const legacy = String(roleResult.rows[0]?.role || '').toLowerCase();
  return legacy === 'admin' || legacy === 'platform_admin';
}

export async function listPendingStaffMembers(tenantId: string) {
  const result = await query(
    `SELECT tm.id AS membership_id,
            tm.user_id,
            tm.member_role,
            tm.status,
            tm.invited_at,
            tm.created_at,
            p.display_name,
            p.phone,
            u.email,
            ur.role AS portal_role
     FROM public.tenant_members tm
     INNER JOIN auth.users u ON u.id = tm.user_id
     LEFT JOIN public.profiles p ON p.user_id = tm.user_id
     LEFT JOIN public.user_roles ur ON ur.user_id = tm.user_id
     WHERE tm.tenant_id = $1 AND tm.status = 'invited'
     ORDER BY tm.invited_at ASC NULLS LAST, tm.created_at ASC`,
    [tenantId]
  );
  return result.rows;
}

export async function listPendingCustomerPortalUsers(tenantId: string) {
  const result = await query(
    `SELECT c.id AS customer_id,
            c.user_id,
            c.name,
            c.phone,
            c.email,
            c.created_at,
            p.display_name
     FROM public.customers c
     LEFT JOIN public.profiles p ON p.user_id = c.user_id
     WHERE c.tenant_id = $1
       AND c.user_id IS NOT NULL
       AND c.is_active = FALSE
     ORDER BY c.created_at ASC`,
    [tenantId]
  );
  return result.rows;
}

export async function approveStaffMember(
  tenantId: string,
  membershipId: string,
  portalRole: string,
  tenantRoleId?: string | null
): Promise<void> {
  const normalized = String(portalRole || 'cashier').toLowerCase();
  if (!STAFF_PORTAL_ROLES.has(normalized)) {
    throw new Error('INVALID_ROLE');
  }

  const member = await query(
    `SELECT user_id, status FROM public.tenant_members
     WHERE id = $1 AND tenant_id = $2`,
    [membershipId, tenantId]
  );
  if (member.rows.length === 0) {
    throw new Error('NOT_FOUND');
  }
  const row = member.rows[0] as { user_id: string; status: string };
  if (row.status !== 'invited') {
    throw new Error('NOT_PENDING');
  }

  const userId = String(row.user_id);
  let resolvedTenantRoleId = tenantRoleId ?? null;
  if (!resolvedTenantRoleId) {
    const { findTenantRoleIdByLegacySlug } = await import('./tenant-custom-roles.js');
    resolvedTenantRoleId = await findTenantRoleIdByLegacySlug(tenantId, normalized);
  } else {
    const { getTenantRoleById } = await import('./tenant-custom-roles.js');
    const role = await getTenantRoleById(tenantId, resolvedTenantRoleId);
    if (!role) throw new Error('INVALID_TENANT_ROLE');
  }

  await query(
    `UPDATE public.tenant_members
     SET status = 'active',
         joined_at = COALESCE(joined_at, NOW()),
         invited_at = COALESCE(invited_at, NOW()),
         tenant_role_id = $2
     WHERE id = $1`,
    [membershipId, resolvedTenantRoleId]
  );

  const enumLabel = await resolveUserRoleEnumLabel(normalized);
  await query('DELETE FROM public.user_roles WHERE user_id = $1', [userId]);
  await query(
    `INSERT INTO public.user_roles (id, user_id, role, created_at)
     VALUES (gen_random_uuid(), $1, $2, NOW())`,
    [userId, enumLabel]
  );
}

export async function rejectStaffMember(tenantId: string, membershipId: string): Promise<void> {
  const result = await query(
    `UPDATE public.tenant_members
     SET status = 'deactivated'
     WHERE id = $1 AND tenant_id = $2 AND status = 'invited'
     RETURNING id`,
    [membershipId, tenantId]
  );
  if (result.rows.length === 0) {
    throw new Error('NOT_FOUND');
  }
}

export async function approveCustomerPortal(tenantId: string, customerId: string): Promise<void> {
  const result = await query(
    `UPDATE public.customers
     SET is_active = TRUE, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND user_id IS NOT NULL AND is_active = FALSE
     RETURNING id`,
    [customerId, tenantId]
  );
  if (result.rows.length === 0) {
    throw new Error('NOT_FOUND');
  }
}

export async function rejectCustomerPortal(tenantId: string, customerId: string): Promise<void> {
  const result = await query(
    `UPDATE public.customers
     SET user_id = NULL, tenant_id = NULL, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND user_id IS NOT NULL AND is_active = FALSE
     RETURNING id`,
    [customerId, tenantId]
  );
  if (result.rows.length === 0) {
    throw new Error('NOT_FOUND');
  }
}
