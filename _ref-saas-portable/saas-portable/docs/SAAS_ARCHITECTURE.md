# MediFlow Pro — Production SaaS Architecture

## 1. Architecture overview

```
┌─────────────────────────────────────────────────────────────┐
│  Control plane (platform_admin)                              │
│  /platform/tenants · /api/saas-admin/*                       │
│  Tenant onboarding · plans · suspend · audit                 │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│  Identity plane                                              │
│  JWT: userId, tenantId, membershipId, tenantRole              │
│  Login: workspace code → branding → credentials              │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│  Data plane (per tenant)                                     │
│  API middleware · tenant_id filters · PostgreSQL RLS         │
│  Cache/files: tenants/{tenant_id}/…                          │
└─────────────────────────────────────────────────────────────┘
```

**Model:** Pooled multi-tenant (shared DB, `tenant_id` on all business rows).  
**Isolation:** JWT membership verification + application filters + PostgreSQL RLS (when using `mediflow_app` role).

## 2. Migration plan (incremental)

| Phase | Scope | Status |
|-------|--------|--------|
| 0 | `093_saas_tenancy` — tenants, plans, members | Done |
| 1 | `094_saas_production` — company_code, branding, RLS, audit, RBAC catalog | **Run now** |
| 2 | Branded login `/login`, workspace sign-in | Done |
| 3 | Super admin `/api/saas-admin` + UI | Done |
| 4 | Scope sales, stock, purchasing, accounts APIs | Partial |
| 4b | `096` patients & prescriptions tenant + PHI audit | Done |
| 5 | Stripe/Razorpay webhooks | Planned |
| 6 | MFA for privileged roles | Planned |
| 7 | Full RLS on all tenant tables + `mediflow_app` DB user in prod | Planned |

```bash
cd server
node run-migration.js 094_saas_production.sql
node scripts/set_platform_admin.js your@email.com
```

## 3. Schema (core)

- **tenants** — `company_code` (public login), `subdomain_slug`, branding, `enabled_modules`, `feature_flags`, status lifecycle
- **tenant_members** — employee link: `user_id`, `employee_code`, `member_role`, `branch_id`, `status`, invite/join timestamps
- **saas_permissions / saas_role_permissions** — RBAC catalog
- **saas_audit_logs** — tenant-scoped audit trail

Unique constraints: `(tenant_id, user_id)`, `(tenant_id, employee_code)`.

## 4. Auth & login

1. `GET /api/public/tenant-branding?code=WORKSPACE` — public branding only (rate limited).
2. `POST /api/auth/signin` — `{ email, password, companyCode }` — server resolves tenant, verifies membership, issues JWT:

```json
{
  "userId": "uuid",
  "email": "user@company.com",
  "tenantId": "uuid",
  "membershipId": "uuid",
  "tenantRole": "pharmacist"
}
```

**Never** trust `X-Tenant-Id` from clients. Tenant switch only via `POST /api/tenants/switch` (re-issues JWT after membership check).

## 5. Admin surfaces

| Surface | Route | Role |
|---------|-------|------|
| SaaS control plane | `/platform/tenants` | `platform_admin` |
| Tenant admin | `/settings/organization` | `tenant_admin` / `owner` |
| Employee app | `/login` → app | membership + RBAC |

## 6. RLS

Session variable per request: `SET LOCAL app.current_tenant = '<uuid>'`.  
Policies on `locations`, `medicines`, `suppliers`, `customers`, `sales`, `tenant_members`.  
Production: use `DB_USER=mediflow_app` (not superuser). Platform jobs: `SET app.bypass_rls = on`.

## 7. Acceptance criteria

- [x] Super admin creates company without SQL
- [x] Branded login after workspace code
- [x] JWT carries verified tenant + membership
- [x] Employee cannot read another tenant’s patients/prescriptions (API + `096`)
- [ ] Employee cannot read another tenant’s sales/stock (all routes)
- [ ] All exports server-filtered by tenant
- [ ] Automated cross-tenant denial tests in CI

## 8. Operations

- Backups: full DB; restore by `tenant_id` filter for offboarding
- Offboarding: `status = offboarding` → export → `deleted` + anonymize PII
- Rate limits: `/api/public/*`, `/api/auth/signin` per IP

See also: `docs/SAAS.md` (operator quick start).
