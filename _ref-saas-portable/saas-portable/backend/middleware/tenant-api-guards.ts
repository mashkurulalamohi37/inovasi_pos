import type { Request, Response, NextFunction } from 'express';
import { resolveApiPermission } from '../lib/api-permission-map.js';
import {
  getTenantEnabledModules,
  isModuleEnabled,
  resolveModuleForApiPath,
} from '../lib/tenant-modules.js';
import { requirePermission } from '../lib/permissions.js';
import { writeAuditLog } from '../lib/audit-log.js';

/**
 * Enforce tenant enabled_modules for API prefixes (pos, inventory, etc.).
 */
export async function enforceTenantModule(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.tenantId) return next();

    const moduleKey = resolveModuleForApiPath(req.originalUrl || req.url);
    if (!moduleKey) return next();

    const enabled = await getTenantEnabledModules(req.tenantId);
    if (!isModuleEnabled(enabled, moduleKey)) {
      await writeAuditLog({
        tenantId: req.tenantId,
        userId: req.user?.userId,
        membershipId: req.membershipId,
        action: 'auth.module_denied',
        resourceType: 'module',
        resourceId: moduleKey,
        metadata: { path: req.originalUrl },
        req,
      });
      res.status(403).json({
        error: 'This module is not enabled for your organization plan',
        code: 'MODULE_DISABLED',
        module: moduleKey,
      });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Enforce RBAC permission from route map when tenant context is present.
 */
export async function enforceApiPermission(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.tenantId || !req.tenantMemberRole) return next();

    const permission = resolveApiPermission(req.method, req.originalUrl || req.url);
    if (!permission) return next();

    const check = await requirePermission(req.tenantMemberRole, permission);
    if (!check.allowed) {
      await writeAuditLog({
        tenantId: req.tenantId,
        userId: req.user?.userId,
        membershipId: req.membershipId,
        action: 'auth.permission_denied',
        resourceType: 'permission',
        resourceId: permission,
        metadata: { path: req.originalUrl, method: req.method },
        req,
      });
      res.status(403).json({
        error: check.message,
        code: 'FORBIDDEN',
        permission,
      });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}
