import express from 'express';
import { authenticateWithTenant } from '../middleware/auth-with-tenant.js';
import { getReqTenantId } from '../lib/tenant-scope.js';
import { getTenantById } from '../lib/tenant-context.js';
import { getPlan } from '../lib/subscription-plans.js';
import { buildSubscriptionSummary } from '../lib/subscription-summary.js';
import { query } from '../config/database.js';
import { getSafeErrorMessage } from '../lib/errors.js';
import { processBillingWebhook } from '../lib/billing-webhooks.js';
import { writeAuditLog } from '../lib/audit-log.js';

const router = express.Router();

/** Tenant: current subscription + usage (hybrid SaaS model). */
router.get('/subscription', ...authenticateWithTenant, async (req, res) => {
  try {
    const tenantId = getReqTenantId(req);
    const tenant = await getTenantById(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    const plan = await getPlan(tenant.plan_code);
    const summary = await buildSubscriptionSummary(tenant);

    const [users, locations, events, orders, invoices, pendingOrders] = await Promise.all([
      query(
        `SELECT COUNT(*)::int AS c FROM public.tenant_members WHERE tenant_id = $1 AND status = 'active'`,
        [tenantId]
      ),
      query(
        `SELECT COUNT(*)::int AS c FROM public.locations WHERE tenant_id = $1`,
        [tenantId]
      ),
      query(
        `SELECT id, event_type, provider, created_at
         FROM public.tenant_billing_events
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [tenantId]
      ),
      query(
        `SELECT o.*, sp.name AS plan_name
         FROM public.tenant_subscription_orders o
         LEFT JOIN public.subscription_plans sp ON sp.code = o.plan_code
         WHERE o.tenant_id = $1
         ORDER BY o.created_at DESC
         LIMIT 50`,
        [tenantId]
      ),
      query(
        `SELECT * FROM public.tenant_subscription_invoices
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [tenantId]
      ),
      query(
        `SELECT o.*, sp.name AS plan_name
         FROM public.tenant_subscription_orders o
         LEFT JOIN public.subscription_plans sp ON sp.code = o.plan_code
         WHERE o.tenant_id = $1 AND o.status = 'pending'
         ORDER BY o.created_at DESC`,
        [tenantId]
      ),
    ]);

    const pendingTotal = pendingOrders.rows.reduce(
      (sum: number, o: { amount?: number }) => sum + Number(o.amount ?? 0),
      0
    );

    res.json({
      tenant,
      plan,
      subscription_summary: summary,
      usage: {
        users: Number(users.rows[0]?.c ?? 0),
        locations: Number(locations.rows[0]?.c ?? 0),
      },
      enabled_modules: tenant.enabled_modules ?? [],
      recent_billing_events: events.rows,
      subscription_orders: orders.rows,
      subscription_invoices: invoices.rows,
      pending_payments: pendingOrders.rows,
      pending_payments_total: pendingTotal,
      payment_status:
        tenant.status === 'active'
          ? 'current'
          : tenant.status === 'suspended'
            ? 'past_due'
            : tenant.status,
    });
  } catch (error) {
    if ((error as Error).message === 'TENANT_REQUIRED') {
      return res.status(403).json({ error: 'Organization context required', code: 'TENANT_REQUIRED' });
    }
    res.status(500).json({ error: getSafeErrorMessage(error, 'Failed to load subscription') });
  }
});

/**
 * Payment provider webhooks (Stripe/Razorpay stub).
 * Production: verify signature with STRIPE_WEBHOOK_SECRET.
 */
router.post('/webhooks/stripe', async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const eventType = String(body.type || body.event_type || 'unknown');
    const tenantId =
      (body.metadata as { tenant_id?: string } | undefined)?.tenant_id ??
      (body.data as { object?: { metadata?: { tenant_id?: string } } })?.object?.metadata
        ?.tenant_id ??
      null;

    const result = await processBillingWebhook({
      provider: 'stripe',
      event_type: eventType,
      external_id: String(body.id || ''),
      tenant_id: tenantId,
      payload: body,
    });

    if (tenantId) {
      await writeAuditLog({
        tenantId,
        action: 'billing.webhook',
        resourceType: 'billing',
        metadata: { event_type: eventType, provider: 'stripe' },
        req,
      });
    }

    res.json({ received: true, ...result });
  } catch (error) {
    res.status(500).json({ error: getSafeErrorMessage(error, 'Webhook processing failed') });
  }
});

router.post('/webhooks/razorpay', async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const eventType = String(body.event || 'unknown');
    const tenantId = (body.payload as { tenant_id?: string })?.tenant_id ?? null;

    const result = await processBillingWebhook({
      provider: 'razorpay',
      event_type: eventType,
      external_id: String(body.id || ''),
      tenant_id: tenantId,
      payload: body,
    });

    res.json({ received: true, ...result });
  } catch (error) {
    res.status(500).json({ error: getSafeErrorMessage(error, 'Webhook processing failed') });
  }
});

export default router;
