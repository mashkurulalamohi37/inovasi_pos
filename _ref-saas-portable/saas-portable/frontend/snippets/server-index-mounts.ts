/**
 * Paste into server/index.ts — route imports and mounts.
 */

import tenantsRoutes from './routes/tenants.js';
import publicTenantRoutes from './routes/public-tenant.js';
import saasAdminRoutes from './routes/saas-admin.js';
import billingRoutes from './routes/billing.js';
import tenantPlatformNotificationsRoutes from './routes/tenant-platform-notifications.js';

// Mount order: public before authenticated
app.use('/api/public', publicTenantRoutes);
app.use('/api/tenants', tenantsRoutes);
app.use('/api/saas-admin', saasAdminRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/tenant-notifications', tenantPlatformNotificationsRoutes);
