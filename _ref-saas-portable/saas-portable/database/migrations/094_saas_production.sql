-- Production SaaS: extended tenants, memberships, RBAC, audit, RLS, tenant_id on sales

-- ---------------------------------------------------------------------------
-- 1. Extend tenants (company registry)
-- ---------------------------------------------------------------------------
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS company_code TEXT,
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS contact_person TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS subdomain_slug TEXT,
  ADD COLUMN IF NOT EXISTS theme_primary TEXT DEFAULT '#0d9488',
  ADD COLUMN IF NOT EXISTS enabled_modules JSONB NOT NULL DEFAULT '["pos","inventory","purchasing","accounts","reports"]'::jsonb,
  ADD COLUMN IF NOT EXISTS feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS offboarded_at TIMESTAMPTZ;

ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_status_check;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_status_check
  CHECK (status IN ('active', 'suspended', 'offboarding', 'cancelled', 'deleted'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_company_code
  ON public.tenants(upper(company_code))
  WHERE company_code IS NOT NULL AND status <> 'deleted';

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_subdomain_slug
  ON public.tenants(lower(subdomain_slug))
  WHERE subdomain_slug IS NOT NULL AND status <> 'deleted';

-- Backfill company_code for existing rows
DO $$
DECLARE r RECORD;
  base TEXT;
  code TEXT;
  n INT;
BEGIN
  FOR r IN SELECT id, slug, name FROM public.tenants WHERE company_code IS NULL LOOP
    base := upper(regexp_replace(coalesce(r.slug, left(r.name, 8)), '[^a-zA-Z0-9]', '', 'g'));
    IF length(base) < 4 THEN base := 'ORG'; END IF;
    code := base || '-' || substr(replace(r.id::text, '-', ''), 1, 4);
    n := 0;
    WHILE EXISTS (SELECT 1 FROM public.tenants t WHERE upper(t.company_code) = upper(code) AND t.id <> r.id) LOOP
      n := n + 1;
      code := base || '-' || substr(md5(r.id::text || n::text), 1, 4);
    END LOOP;
    UPDATE public.tenants SET company_code = code WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE public.tenants ALTER COLUMN company_code SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Extend tenant_members (employees)
-- ---------------------------------------------------------------------------
ALTER TABLE public.tenant_members
  ADD COLUMN IF NOT EXISTS employee_code TEXT,
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.tenant_members DROP CONSTRAINT IF EXISTS tenant_members_role_check;
ALTER TABLE public.tenant_members
  ADD CONSTRAINT tenant_members_role_check
  CHECK (member_role IN (
    'owner', 'tenant_admin', 'branch_manager', 'pharmacist', 'cashier', 'viewer',
    'admin', 'member'
  ));

ALTER TABLE public.tenant_members DROP CONSTRAINT IF EXISTS tenant_members_status_check;
ALTER TABLE public.tenant_members
  ADD CONSTRAINT tenant_members_status_check
  CHECK (status IN ('invited', 'active', 'suspended', 'deactivated'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_members_employee_code
  ON public.tenant_members(tenant_id, upper(employee_code))
  WHERE employee_code IS NOT NULL AND status = 'active';

-- Map legacy roles
UPDATE public.tenant_members SET member_role = 'tenant_admin' WHERE member_role = 'admin';
UPDATE public.tenant_members SET member_role = 'owner' WHERE member_role = 'owner';
UPDATE public.tenant_members SET joined_at = COALESCE(joined_at, created_at);

-- ---------------------------------------------------------------------------
-- 3. RBAC catalog (application-level; mapped to member_role)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saas_permissions (
  code TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  resource TEXT NOT NULL,
  action TEXT NOT NULL
);

INSERT INTO public.saas_permissions (code, description, resource, action) VALUES
  ('sales.read', 'View sales', 'sales', 'read'),
  ('sales.create', 'Create sales / POS', 'sales', 'create'),
  ('sales.export', 'Export sales', 'sales', 'export'),
  ('inventory.read', 'View inventory', 'inventory', 'read'),
  ('inventory.write', 'Modify inventory', 'inventory', 'write'),
  ('purchasing.read', 'View purchasing', 'purchasing', 'read'),
  ('purchasing.write', 'Create PO/GRN', 'purchasing', 'write'),
  ('purchasing.approve', 'Approve purchases', 'purchasing', 'approve'),
  ('users.manage', 'Manage employees', 'users', 'write'),
  ('settings.manage', 'Company settings', 'settings', 'write'),
  ('reports.read', 'View reports', 'reports', 'read'),
  ('accounts.read', 'View accounts', 'accounts', 'read'),
  ('accounts.write', 'Post accounts', 'accounts', 'write'),
  ('prescriptions.read', 'View prescriptions', 'prescriptions', 'read'),
  ('prescriptions.write', 'Dispense prescriptions', 'prescriptions', 'write'),
  ('platform.tenants', 'SaaS control plane', 'platform', 'admin')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.saas_role_permissions (
  role TEXT NOT NULL,
  permission_code TEXT NOT NULL REFERENCES public.saas_permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (role, permission_code)
);

INSERT INTO public.saas_role_permissions (role, permission_code)
SELECT 'owner', code FROM public.saas_permissions WHERE code <> 'platform.tenants'
ON CONFLICT DO NOTHING;

INSERT INTO public.saas_role_permissions (role, permission_code)
SELECT 'tenant_admin', code FROM public.saas_permissions
WHERE code NOT IN ('platform.tenants')
ON CONFLICT DO NOTHING;

INSERT INTO public.saas_role_permissions (role, permission_code) VALUES
  ('branch_manager', 'sales.read'), ('branch_manager', 'sales.create'),
  ('branch_manager', 'inventory.read'), ('branch_manager', 'inventory.write'),
  ('branch_manager', 'purchasing.read'), ('branch_manager', 'purchasing.write'),
  ('branch_manager', 'reports.read'), ('branch_manager', 'prescriptions.read'),
  ('pharmacist', 'sales.read'), ('pharmacist', 'sales.create'),
  ('pharmacist', 'inventory.read'), ('pharmacist', 'inventory.write'),
  ('pharmacist', 'prescriptions.read'), ('pharmacist', 'prescriptions.write'),
  ('cashier', 'sales.read'), ('cashier', 'sales.create'),
  ('viewer', 'sales.read'), ('viewer', 'inventory.read'), ('viewer', 'reports.read')
ON CONFLICT DO NOTHING;

INSERT INTO public.saas_role_permissions (role, permission_code)
SELECT 'platform_admin', 'platform.tenants'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Audit log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saas_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  membership_id UUID REFERENCES public.tenant_members(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  request_id TEXT,
  ip_address INET,
  user_agent TEXT,
  old_values JSONB,
  new_values JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saas_audit_tenant_created
  ON public.saas_audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saas_audit_user_created
  ON public.saas_audit_logs(user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 5. tenant_id on sales (via location backfill)
-- ---------------------------------------------------------------------------
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

UPDATE public.sales s
SET tenant_id = l.tenant_id
FROM public.locations l
WHERE s.location_id = l.id AND s.tenant_id IS NULL AND l.tenant_id IS NOT NULL;

UPDATE public.sales s
SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'default' LIMIT 1)
WHERE s.tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_tenant_id ON public.sales(tenant_id);

-- ---------------------------------------------------------------------------
-- 6. RLS helpers and policies
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_current_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(trim(current_setting('app.current_tenant', true)), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.app_bypass_rls()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(current_setting('app.bypass_rls', true), '') = 'on';
$$;

CREATE OR REPLACE FUNCTION public.app_tenant_check(row_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT public.app_bypass_rls()
    OR (public.app_current_tenant_id() IS NOT NULL AND row_tenant_id = public.app_current_tenant_id());
$$;

-- Apply RLS to tenant-owned tables
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'locations', 'medicines', 'suppliers', 'customers', 'sales'
  ] LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tbl);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', tbl);
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON public.%I FOR ALL
         USING (public.app_tenant_check(tenant_id))
         WITH CHECK (public.app_tenant_check(tenant_id))',
        tbl
      );
    END IF;
  END LOOP;
END $$;

-- Restrictive policy on tenant_members: users see only own tenant rows when context set
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_members_isolation ON public.tenant_members;
CREATE POLICY tenant_members_isolation ON public.tenant_members
  FOR ALL
  USING (public.app_bypass_rls() OR tenant_id = public.app_current_tenant_id())
  WITH CHECK (public.app_bypass_rls() OR tenant_id = public.app_current_tenant_id());

-- Application DB role (use in production instead of superuser)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mediflow_app') THEN
    CREATE ROLE mediflow_app LOGIN PASSWORD 'change_me_in_production';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO mediflow_app;
GRANT USAGE ON SCHEMA auth TO mediflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mediflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO mediflow_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mediflow_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mediflow_app;
