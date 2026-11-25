import type { Request, Response, NextFunction } from 'express';
import {
  assertTenantActive,
  getMembershipForUser,
  getTenantById,
  isPlatformAdmin,
} from '../lib/tenant-context.js';

const PENDING_APPROVAL_ALLOWED_PREFIXES = [
  '/api/tenants/current',
  '/api/tenants/mine',
  '/api/tenants/plans',
  '/api/billing',
  '/api/tenant-notifications',
  '/api/auth/me',
  '/api/auth/signout',
];

/** Staff awaiting organization owner approval — minimal API surface. */
const INVITED_MEMBERSHIP_ALLOWED_PREFIXES = [
  '/api/auth/me',
  '/api/auth/signout',
  '/api/tenants/current',
  '/api/tenants/mine',
];

/**
 * Tenant context from verified JWT only — never from X-Tenant-Id or query params.
 */
export async function attachTenantContext(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    req.isPlatformAdmin = await isPlatformAdmin(userId);

    const jwtPayload = req.user as {
      tenantId?: string;
      membershipId?: string;
    };

    const originalUrl = req.originalUrl || '';
    const isSaasControlPlane =
      originalUrl.includes('/api/saas-admin') || originalUrl.includes('/api/tenants/platform');

    if (req.isPlatformAdmin && isSaasControlPlane) {
      req.tenantId = undefined;
      return next();
    }

    const tenantId = jwtPayload.tenantId;
    const membershipId = jwtPayload.membershipId;

    if (!tenantId || !membershipId) {
      return res.status(403).json({
        error: 'Organization context missing. Sign in with your company workspace code.',
        code: 'TENANT_REQUIRED',
      });
    }

    const membership = await getMembershipForUser(userId, tenantId, membershipId);
    if (!membership) {
      return res.status(403).json({ error: 'You do not have access to this organization.' });
    }

    const url = originalUrl.split('?')[0];
    if (membership.status === 'invited') {
      const allowed = INVITED_MEMBERSHIP_ALLOWED_PREFIXES.some((p) => url.startsWith(p));
      if (!allowed) {
        return res.status(403).json({
          error:
            'Your account is pending approval from your pharmacy administrator. You will get menu access once approved.',
          code: 'MEMBERSHIP_PENDING_APPROVAL',
        });
      }
      req.tenantId = tenantId;
      req.tenantMemberRole = membership.member_role;
      req.membershipId = membershipId;
      req.membershipStatus = 'invited';
      req.branchId = membership.branch_id ?? undefined;
      return next();
    }

    if (membership.status !== 'active') {
      return res.status(403).json({ error: 'You do not have access to this organization.' });
    }

    const tenant = await getTenantById(tenantId);
    if (tenant?.status === 'pending_approval') {
      const allowed = PENDING_APPROVAL_ALLOWED_PREFIXES.some((p) => url.startsWith(p));
      if (!allowed) {
        return res.status(403).json({
          error:
            'Organization awaiting approval. Limited access until a platform administrator approves your workspace.',
          code: 'TENANT_PENDING_APPROVAL',
        });
      }
      req.tenantPendingApproval = true;
    } else {
      const activeCheck = await assertTenantActive(tenantId);
      if (!activeCheck.ok) {
        const code =
          'code' in activeCheck && activeCheck.code
            ? activeCheck.code
            : 'TENANT_INACTIVE';
        return res.status(403).json({ error: activeCheck.message, code });
      }
    }

    req.tenantId = tenantId;
    req.tenantMemberRole = membership.member_role;
    req.membershipId = membershipId;
    req.branchId = membership.branch_id ?? undefined;
    next();
  } catch (error) {
    console.error('attachTenantContext error:', error);
    next(error);
  }
}

export function requireTenantContext(req: Request, res: Response, next: NextFunction) {
  if (!req.tenantId) {
    return res.status(403).json({ error: 'Organization context required', code: 'TENANT_REQUIRED' });
  }
  next();
}
