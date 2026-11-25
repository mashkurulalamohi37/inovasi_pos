import { query } from '../config/database.js';

/** Default SaaS operator — keeps pharmacy admin role and all existing menus. */
export const DEFAULT_PLATFORM_OPERATOR_EMAIL = 'admin@mediflow.com';

export function normalizeOperatorEmail(email: string | null | undefined): string {
  return String(email || '').trim().toLowerCase();
}

export function isDefaultPlatformOperatorEmail(email: string | null | undefined): boolean {
  return normalizeOperatorEmail(email) === DEFAULT_PLATFORM_OPERATOR_EMAIL;
}

/** Platform console access: explicit platform_admin role OR default operator email. */
export async function isPlatformOperator(userId: string): Promise<boolean> {
  const roleResult = await query(
    'SELECT role FROM public.user_roles WHERE user_id = $1 LIMIT 1',
    [userId]
  );
  if (String(roleResult.rows[0]?.role || '').toLowerCase() === 'platform_admin') {
    return true;
  }
  const userResult = await query('SELECT email FROM auth.users WHERE id = $1', [userId]);
  return isDefaultPlatformOperatorEmail(userResult.rows[0]?.email as string);
}
