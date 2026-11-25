-- SaaS multi-tenancy: organizations (tenants), subscription plans, memberships

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  max_users INTEGER NOT NULL DEFAULT 5,
  max_locations INTEGER NOT NULL DEFAULT 1,
  price_monthly NUMERIC(10, 2) NOT NULL DEFAULT 0,
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.subscription_plans (code, name, max_users, max_locations, price_monthly, features)
VALUES
  ('trial', 'Trial', 3, 1, 0, '{"trial_days": 14}'::jsonb),
  ('starter', 'Starter', 10, 2, 49, '{}'::jsonb),
  ('professional', 'Professional', 50, 10, 149, '{}'::jsonb),
  ('enterprise', 'Enterprise', -1, -1, 499, '{"priority_support": true}'::jsonb)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan_code TEXT NOT NULL DEFAULT 'trial' REFERENCES public.subscription_plans(code),
  status TEXT NOT NULL DEFAULT 'active',
  trial_ends_at TIMESTAMPTZ,
  billing_email TEXT,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenants_status_check CHECK (status IN ('active', 'suspended', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants(lower(slug));
CREATE INDEX IF NOT EXISTS idx_tenants_status ON public.tenants(status);

CREATE TABLE IF NOT EXISTS public.tenant_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_role TEXT NOT NULL DEFAULT 'member',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id),
  CONSTRAINT tenant_members_role_check CHECK (member_role IN ('owner', 'admin', 'member'))
);

CREATE INDEX IF NOT EXISTS idx_tenant_members_user ON public.tenant_members(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_members_one_default
  ON public.tenant_members(user_id)
  WHERE is_default = TRUE;

-- platform_admin role for SaaS operator console
DO $$
DECLARE
  enum_typname text;
BEGIN
  SELECT t.typname INTO enum_typname
  FROM pg_attribute a
  JOIN pg_type t ON a.atttypid = t.oid
  WHERE a.attrelid = 'public.user_roles'::regclass
    AND a.attname = 'role'
    AND t.typtype = 'e';

  IF enum_typname IS NULL THEN
    RAISE NOTICE 'user_roles.role is not an enum — platform_admin stored as text label';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = enum_typname AND lower(e.enumlabel) = 'platform_admin'
  ) THEN
    EXECUTE format('ALTER TYPE public.%I ADD VALUE %L', enum_typname, 'platform_admin');
  END IF;
END $$;

-- Tenant scope on core master tables
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.medicines ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_locations_tenant ON public.locations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_medicines_tenant ON public.medicines(tenant_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON public.suppliers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON public.customers(tenant_id);

-- Default tenant for existing single-tenant deployments
INSERT INTO public.tenants (name, slug, plan_code, status, trial_ends_at)
SELECT 'Default Organization', 'default', 'professional', 'active', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.tenants WHERE slug = 'default');

DO $$
DECLARE
  default_tenant_id UUID;
BEGIN
  SELECT id INTO default_tenant_id FROM public.tenants WHERE slug = 'default' LIMIT 1;
  IF default_tenant_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.locations SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE public.medicines SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE public.suppliers SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE public.customers SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;

  INSERT INTO public.tenant_members (tenant_id, user_id, member_role, is_default)
  SELECT default_tenant_id, u.id, 'owner', TRUE
  FROM auth.users u
  WHERE NOT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = default_tenant_id AND tm.user_id = u.id
  );
END $$;
