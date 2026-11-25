import { query } from '../config/database.js';

export interface BillingWebhookPayload {
  provider: string;
  event_type: string;
  external_id?: string;
  tenant_id?: string | null;
  payload: Record<string, unknown>;
}

/**
 * Record webhook and apply minimal tenant lifecycle updates (stub for Stripe/Razorpay).
 */
export async function processBillingWebhook(
  input: BillingWebhookPayload
): Promise<{ recorded: boolean; tenant_updated: boolean }> {
  const tenantId = input.tenant_id ?? null;

  await query(
    `INSERT INTO public.tenant_billing_events (tenant_id, provider, event_type, external_id, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      tenantId,
      input.provider,
      input.event_type,
      input.external_id ?? null,
      JSON.stringify(input.payload),
    ]
  );

  let tenantUpdated = false;
  if (tenantId) {
    if (
      input.event_type === 'invoice.payment_failed' ||
      input.event_type === 'customer.subscription.deleted'
    ) {
      await query(
        `UPDATE public.tenants SET status = 'suspended', updated_at = NOW() WHERE id = $1`,
        [tenantId]
      );
      tenantUpdated = true;
    } else if (
      input.event_type === 'invoice.paid' ||
      input.event_type === 'customer.subscription.updated'
    ) {
      await query(
        `UPDATE public.tenants SET status = 'active', updated_at = NOW() WHERE id = $1 AND status = 'suspended'`,
        [tenantId]
      );
      tenantUpdated = true;
    }
  }

  return { recorded: true, tenant_updated: tenantUpdated };
}
