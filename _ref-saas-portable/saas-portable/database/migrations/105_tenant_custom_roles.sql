-- Per-tenant custom roles and menu privileges

CREATE TABLE IF NOT EXISTS public.tenant_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_full_access BOOLEAN NOT NULL DEFAULT FALSE,
  legacy_app_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug),
  CONSTRAINT tenant_roles_legacy_app_role_check
    CHECK (legacy_app_role IS NULL OR legacy_app_role IN ('admin', 'pharmacist', 'cashier'))
);

CREATE INDEX IF NOT EXISTS idx_tenant_roles_tenant ON public.tenant_roles(tenant_id);

CREATE TABLE IF NOT EXISTS public.tenant_role_menu_grants (
  tenant_role_id UUID NOT NULL REFERENCES public.tenant_roles(id) ON DELETE CASCADE,
  menu_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_role_id, menu_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_role_menu_grants_role ON public.tenant_role_menu_grants(tenant_role_id);

ALTER TABLE public.tenant_members
  ADD COLUMN IF NOT EXISTS tenant_role_id UUID REFERENCES public.tenant_roles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant_role ON public.tenant_members(tenant_role_id);
