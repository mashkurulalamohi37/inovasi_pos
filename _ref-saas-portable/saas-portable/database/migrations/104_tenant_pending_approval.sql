-- Organization signup → pending super-admin approval → active

ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_status_check;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_status_check
  CHECK (status IN (
    'pending_approval', 'active', 'suspended', 'offboarding', 'cancelled', 'deleted'
  ));

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tenants.status IS
  'pending_approval: self-signup awaiting platform operator; active: full access';
