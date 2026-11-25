# MediFlow Pro — SaaS Portable Package

Copy-paste bundle for **multi-tenant SaaS**: animated login/signup, workspace branding, subscription packages, platform admin console, organization approval workflow, and button/card animations.

Extracted from `mediflow-pro` on 2026-06-30.

---

## What is included

| Area | Contents |
|------|----------|
| **Auth UI/UX** | Sliding login ↔ signup panel (`Auth.tsx` + `auth-slide.css`), workspace code verify, password reveal, org vs customer signup |
| **Package selection** | Animated plan cards (`SubscriptionPlanCards.tsx`), onboarding choose-plan page |
| **Approval flows** | Org pending approval, staff membership pending, platform approve tenant |
| **Platform admin** | Full console: companies, users, packages CRUD, plan allocation, notifications |
| **Backend API** | `saas-admin`, `tenants`, `public-tenant`, `billing`, notifications |
| **Database** | Migrations 093 → 105 (tenancy, production fields, billing, pending approval, custom roles) |
| **Animations** | Auth slide panel, plan card hover/lift, `btn-slide-shine` button effect |

---

## User journeys (copy these flows)

### 1. Organization owner self-signup

```
/auth (signup tab) → register organization
  → status: pending_approval
  → /onboarding/choose-plan (select package)
  → /pending-approval (poll every 15s)
  → platform admin approves
  → status: active → full app access
```

### 2. Employee joins existing pharmacy

```
/auth → workspace code + signup (staff)
  → membership status: invited
  → /membership-pending
  → org owner approves in Users / tenant members
  → status: active → app access
```

### 3. Platform operator

```
/platform/admin/companies   — list + approve pending tenants
/platform/admin/packages    — create/edit subscription plans
/platform/admin/users       — suspend/activate memberships
/platform/admin/notifications — broadcast to tenants
```

### 4. Login (all users)

```
/auth → step 1: workspace code (Company ID) → verify branding
      → step 2: email + password → JWT with tenantId
```

---

## Folder layout

```
saas-portable/
├── README.md                          ← you are here
├── database/migrations/               ← run in order (see below)
├── backend/
│   ├── routes/                        ← Express routers
│   ├── lib/                           ← tenant context, approval, plans
│   ├── middleware/                    ← tenant JWT + module guards
│   └── scripts/                       ← set_platform_admin, verify script
├── frontend/
│   ├── pages/                         ← Auth, admin console, onboarding
│   ├── components/                    ← subscription, auth guards, platform UI
│   ├── contexts/TenantContext.tsx
│   ├── lib/                           ← tenant-onboarding, tenant-modules
│   ├── types/tenant.ts
│   ├── components/button.tsx          ← slide-shine variant
│   ├── styles/btn-slide-shine.css     ← button animation CSS
│   └── snippets/                      ← paste-into-your-app fragments
└── docs/                              ← SAAS.md, SAAS_ARCHITECTURE.md
```

---

## Integration steps (new application)

### Step 1 — Database

Run migrations **in order** against PostgreSQL:

```bash
cd your-server
node run-migration.js 093_saas_tenancy.sql
node run-migration.js 094_saas_production.sql
node run-migration.js 101_saas_billing_rbac_completion.sql
node run-migration.js 104_tenant_pending_approval.sql
node run-migration.js 105_tenant_custom_roles.sql
```

Promote your first platform operator:

```bash
node scripts/set_platform_admin.js admin@yourdomain.com
```

### Step 2 — Backend

1. Copy `backend/routes/*` → `server/routes/`
2. Copy `backend/lib/*` → `server/lib/`
3. Copy `backend/middleware/*` → `server/middleware/`
4. Mount routes (see `frontend/snippets/server-index-mounts.ts`)
5. Wire **auth** sign-in to accept `companyCode` and resolve tenant (see `server/routes/auth.ts` in main repo — uses `tenant-context.ts`)
6. Apply `authenticateWithTenant` middleware on business routes

**Required npm deps (typical):** `express`, `pg`, `jsonwebtoken`, `bcrypt`, `zod` (if used in routes)

### Step 3 — Frontend

1. Copy `frontend/pages/*` → `src/pages/`
2. Copy `frontend/components/*` → `src/components/`
3. Copy `frontend/contexts/TenantContext.tsx` → `src/contexts/`
4. Copy `frontend/lib/*` and `frontend/types/*`
5. Import `auth-slide.css` in `Auth.tsx`
6. Add `btn-slide-shine` CSS to your global stylesheet (or copy `frontend/styles/btn-slide-shine.css`)
7. Merge API methods from `frontend/snippets/api-client-saas-methods.ts` into your `api-client`
8. Add routes + guards from `frontend/snippets/App-routes-saas.tsx`
9. Wrap app with `AuthProvider` → `TenantProvider` → guards (order matters)

**Required npm deps:** `@tanstack/react-query`, `react-router-dom`, `sonner`, `lucide-react`, Tailwind + shadcn/ui components (`Button`, `Card`, `Dialog`, `Table`, `Tabs`, `Select`, `Badge`, `Input`, `Label`)

### Step 4 — Environment

```env
JWT_SECRET=your-secret
DATABASE_URL=postgresql://...
```

### Step 5 — Verify

```bash
node backend/scripts/verify-saas-features.mjs
```

---

## Key API endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/public/tenant-branding?code=` | Public | Branded login lookup |
| POST | `/api/auth/signin` | Public | Login with `companyCode` |
| POST | `/api/tenants/register` | Public | Create org + owner |
| GET | `/api/tenants/plans` | Public | List subscription plans |
| POST | `/api/tenants/current/request-plan` | JWT+tenant | Owner selects package |
| GET | `/api/tenants/current` | JWT+tenant | Current org + usage |
| POST | `/api/saas-admin/tenants/:id/approve` | platform_admin | Approve pending org |
| GET/POST | `/api/saas-admin/plans` | platform_admin | Package CRUD |
| POST | `/api/saas-admin/tenants/:id/allocate-plan` | platform_admin | Assign/renew plan |
| GET | `/api/saas-admin/dashboard` | platform_admin | Control plane stats |

Full list: `docs/SAAS.md`

---

## Animation reference

| Effect | File | Class / trigger |
|--------|------|-----------------|
| Login ↔ Signup slide | `auth-slide.css` | `.auth-slide-container.is-active` |
| Plan card lift + glow | `SubscriptionPlanCards.tsx` | `hover:-translate-y-1.5`, staggered `animate-in` |
| Primary button shine | `button.tsx` + `btn-slide-shine.css` | `variant` with `btn-slide-shine` class |
| Pending approval pulse | `OrganizationPendingApproval.tsx` | `animate-pulse` on clock icon |

---

## Default subscription plans (seeded in 093)

| Code | Users | Locations | Monthly |
|------|-------|-----------|---------|
| trial | 3 | 1 | $0 |
| starter | 10 | 2 | $49 |
| professional | 50 | 10 | $149 |
| enterprise | unlimited | unlimited | $499 |

---

## Files you must also port from main repo (not duplicated here)

These are large/shared and should be copied or adapted from `mediflow-pro`:

| File | Why |
|------|-----|
| `server/routes/auth.ts` | Sign-in/sign-up with tenant resolution |
| `src/contexts/AuthContext.tsx` | `signIn`, `signUp`, `registerOrganization`, membership state |
| `src/lib/api-client.ts` | Base HTTP client (snippets only in this package) |
| `src/components/layout/MainLayout.tsx` | Used by admin/onboarding pages |
| `src/components/dialogs/FormDialogLayout.tsx` | Platform admin dialogs |
| `src/hooks/useActionConfirm.tsx` | Confirm dialogs in admin console |
| `src/lib/mother-account.ts` | Owner-only billing paths |
| `server/lib/tenant-custom-roles.ts` | Custom RBAC (migration 105) |

---

## Architecture diagram

```
Platform Admin ──► /api/saas-admin/* ──► tenants, plans, approve
       │
Tenant Owner ──► /api/tenants/* ──► register, request-plan, current
       │
Employee ──► /api/auth/signin + companyCode ──► JWT(tenantId, membershipId)
       │
Guards ──► TenantApprovedGuard / StaffMembershipGuard ──► block until approved
```

See `docs/SAAS_ARCHITECTURE.md` for RLS, migration phases, and security notes.

---

## License / attribution

Extracted from MediFlow Pro internal codebase. Adapt table names and branding when porting to another product.
