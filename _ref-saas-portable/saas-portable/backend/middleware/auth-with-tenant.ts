import { authenticateToken } from './auth.js';
import { attachTenantContext } from './tenant.js';
import { enforceApiPermission, enforceTenantModule } from './tenant-api-guards.js';

/** Tenant JWT + module entitlements + RBAC on mapped API routes. */
export const authenticateWithTenant = [
  authenticateToken,
  attachTenantContext,
  enforceTenantModule,
  enforceApiPermission,
];
