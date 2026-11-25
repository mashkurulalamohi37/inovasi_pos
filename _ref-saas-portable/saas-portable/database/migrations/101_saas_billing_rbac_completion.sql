-- Billing stubs + complete RBAC seeds for stock/reports

INSERT INTO public.saas_permissions (code, description, resource, action) VALUES
  ('stock.read', 'View stock operations', 'stock', 'read'),
  ('stock.write', 'Create stock operations', 'stock', 'write'),
  ('report.export', 'Export reports', 'reports', 'export')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.saas_role_permissions (role, permission_code)
SELECT 'owner', code FROM public.saas_permissions WHERE code IN ('stock.read', 'stock.write', 'report.export')
ON CONFLICT DO NOTHING;

INSERT INTO public.saas_role_permissions (role, permission_code)
SELECT 'tenant_admin', code FROM public.saas_permissions WHERE code IN ('stock.read', 'stock.write', 'report.export')
ON CONFLICT DO NOTHING;

INSERT INTO public.saas_role_permissions (role, permission_code) VALUES
  ('branch_manager', 'stock.read'), ('branch_manager', 'stock.write'), ('branch_manager', 'report.export'),
  ('pharmacist', 'stock.read'), ('pharmacist', 'stock.write'),
  ('auditor', 'reports.read'), ('auditor', 'report.export'),
  ('auditor', 'accounts.read'), ('auditor', 'inventory.read')
ON CONFLICT DO NOTHING;

-- Billing event log (Stripe/Razorpay webhooks — process in app layer)
CREATE TABLE IF NOT EXISTS public.tenant_billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'stripe',
  event_type TEXT NOT NULL,
  external_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_billing_events_tenant
  ON public.tenant_billing_events(tenant_id, created_at DESC);

COMMENT ON TABLE public.tenant_billing_events IS
  'Inbound payment webhooks; update tenants.plan_code / status in application code';
