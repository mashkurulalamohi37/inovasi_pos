# SaaS approval & package flows — sequence reference

## Organization registration → package → platform approval

```mermaid
sequenceDiagram
  participant Owner as Org Owner
  participant Auth as /auth UI
  participant API as /api/tenants
  participant Admin as Platform Admin
  participant SaaS as /api/saas-admin

  Owner->>Auth: Sign up (new organization)
  Auth->>API: POST /tenants/register
  API-->>Owner: tenant status=pending_approval, company_code
  Owner->>Auth: Navigate /onboarding/choose-plan
  Owner->>API: POST /tenants/current/request-plan
  API-->>Owner: subscription order pending, notification sent
  Owner->>Auth: /pending-approval (poll GET /tenants/current)
  Admin->>SaaS: POST /tenants/:id/approve
  SaaS-->>API: status=active, enabled_modules unlocked
  Owner->>Auth: Auto-redirect to dashboard
```

## Staff join existing pharmacy

```mermaid
sequenceDiagram
  participant Staff
  participant Auth as /auth UI
  participant API as /api/auth
  participant Owner as Org Admin

  Staff->>Auth: Workspace code + staff signup
  Auth->>API: signUp with companyCode
  API-->>Staff: membership_status=invited
  Staff->>Auth: /membership-pending
  Owner->>API: Approve member (users route)
  API-->>Staff: membership_status=active
  Staff->>Auth: Full app access
```

## Package creation (platform admin)

1. `GET /api/saas-admin/plans` — list plans
2. `POST /api/saas-admin/plans` — create `{ code, name, max_users, max_locations, price_monthly }`
3. `PATCH /api/saas-admin/plans/:code` — edit limits/pricing
4. `DELETE /api/saas-admin/plans/:code` — deactivate (soft) or delete if unused

## Package assignment to tenant

**During onboarding (tenant owner):**
- `POST /api/tenants/current/request-plan` — creates pending `tenant_subscription_orders` row

**By platform admin:**
- `POST /api/saas-admin/tenants/:id/allocate-plan` — sets `plan_code`, `plan_valid_until`, creates paid/pending order

## Tenant status lifecycle

| Status | Meaning |
|--------|---------|
| `pending_approval` | Self-signup, awaiting platform review |
| `active` | Full module access |
| `suspended` | Login blocked / read-only |
| `cancelled` | Subscription ended |
| `offboarding` | Export window |
| `deleted` | Anonymized |

## Frontend guards (order matters)

```
AuthProvider
  └─ TenantProvider
       └─ StaffMembershipGuard      → /membership-pending if invited
            └─ CustomerPortalGuard   → customer portal pending
                 └─ TenantApprovedGuard → /pending-approval if org not active
                      └─ MotherAccountGuard → billing pages owner-only
```

## UI animation triggers

| Screen | Animation |
|--------|-----------|
| `/auth` | Toggle `is-active` on container → 0.6s slide between login/signup |
| Choose plan | Plan cards: staggered fade-in, hover lift -6px, ring on select |
| Approve button | `btn-slide-shine` hover shine sweep |
| Pending page | Clock icon `animate-pulse`, 15s polling refetch |
