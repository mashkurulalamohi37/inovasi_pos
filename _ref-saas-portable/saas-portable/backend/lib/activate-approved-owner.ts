import { query } from '../config/database.js';
import { resolveUserRoleEnumLabel } from './user-role-enum.js';

/** All pharmacy modules unlocked when a workspace is approved. */
export const FULL_TENANT_ENABLED_MODULES = [
  'pos',
  'inventory',
  'purchasing',
  'accounts',
  'reports',
  'patient',
  'prescription',
  'ecommerce',
];

/**
 * Promote the active tenant owner to platform_admin in user_roles (idempotent).
 */
export async function promoteTenantOwnerToPlatformAdmin(
  tenantId: string
): Promise<string | null> {
  const ownerResult = await query(
    `SELECT user_id FROM public.tenant_members
     WHERE tenant_id = $1 AND member_role = 'owner' AND status = 'active'
     LIMIT 1`,
    [tenantId]
  );

  if (ownerResult.rows.length === 0) return null;

  const ownerUserId = String(ownerResult.rows[0].user_id);
  const platformAdminLabel = await resolveUserRoleEnumLabel('platform_admin');
  await query(`UPDATE public.user_roles SET role = $1 WHERE user_id = $2`, [
    platformAdminLabel,
    ownerUserId,
  ]);
  return ownerUserId;
}

/**
 * After platform approval: activate tenant, unlock modules, promote owner to platform_admin.
 * If the tenant is already active (approved before this logic existed), still promotes the owner.
 */
export async function activateApprovedOrganizationOwner(
  tenantId: string,
  approvedByUserId: string
): Promise<{ tenant: Record<string, unknown>; ownerUserId: string | null }> {
  let tenantResult = await query(
    `UPDATE public.tenants
     SET status = 'active',
         approved_at = COALESCE(approved_at, NOW()),
         approved_by = COALESCE(approved_by, $1),
         enabled_modules = $2::jsonb,
         updated_at = NOW()
     WHERE id = $3 AND status = 'pending_approval'
     RETURNING *`,
    [approvedByUserId, JSON.stringify(FULL_TENANT_ENABLED_MODULES), tenantId]
  );

  if (tenantResult.rows.length === 0) {
    const existing = await query(`SELECT * FROM public.tenants WHERE id = $1`, [tenantId]);
    if (existing.rows.length === 0) {
      throw new Error('TENANT_NOT_FOUND');
    }
    const row = existing.rows[0] as { status?: string };
    if (row.status !== 'active') {
      throw new Error('TENANT_NOT_PENDING');
    }
    tenantResult = await query(
      `UPDATE public.tenants
       SET enabled_modules = $1::jsonb,
           updated_at = NOW()
       WHERE id = $2 AND status = 'active'
       RETURNING *`,
      [JSON.stringify(FULL_TENANT_ENABLED_MODULES), tenantId]
    );
  }

  const tenant = tenantResult.rows[0] as Record<string, unknown>;
  const ownerUserId = await promoteTenantOwnerToPlatformAdmin(tenantId);

  await query(
    `INSERT INTO public.tenant_platform_notifications (tenant_id, title, message, severity, source)
     VALUES ($1, $2, $3, 'success', 'platform')`,
    [
      tenantId,
      'Workspace approved',
      `Your organization "${tenant.name}" is now active. Sign out and sign in again to load all menus (POS, inventory, master data, and platform tools).`,
    ]
  );

  return { tenant, ownerUserId };
}
