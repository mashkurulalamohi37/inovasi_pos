# MediFlow Pro — SaaS multi-tenancy

This application supports **multi-tenant SaaS**: each pharmacy organization is an isolated **tenant**. Users belong to one or more tenants via `tenant_members`.

## Concepts

| Concept | Description |
|--------|-------------|
| **Tenant** | A pharmacy organization (workspace). Has slug, plan, status. |
| **Tenant member** | Links `auth.users` to a tenant with role `owner`, `admin`, or `member`. |
| **Subscription plan** | Limits users and store locations (`trial`, `starter`, `professional`, `enterprise`). |
| **Platform admin** | Global operator role (`platform_admin`) — manages all tenants, no pharmacy data scope required. |

## Database

Run migration:

```bash
cd server
node run-migration.js 093_saas_tenancy.sql
```

Existing data is assigned to tenant slug **`default`** (`Default Organization`).

## API

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /api/tenants/register` | Public | Create org + owner user |
| `GET /api/tenants/plans` | Public | List plans |
| `GET /api/tenants/mine` | JWT | User's organizations |
| `GET /api/tenants/current` | JWT + tenant | Current org + usage |
| `POST /api/tenants/switch` | JWT | Switch active org (new JWT) |
| `PATCH /api/tenants/current` | JWT + tenant | Update org name / billing email |
| `GET /api/tenants/platform/all` | `platform_admin` | List all tenants |
| `PATCH /api/tenants/platform/:id/status` | `platform_admin` | Suspend / activate |
| `PATCH /api/tenants/platform/:id/plan` | `platform_admin` | Change plan |

JWT payload includes `tenantId`. Clients may also send `X-Tenant-Id`.

## Frontend

- **Register pharmacy**: `/auth/register`
- **Organization settings**: System → Organization (`/settings/organization`)
- **Platform console**: System → Platform Tenants (`/platform/tenants`) — `platform_admin` only
- **Header**: organization switcher when user has multiple tenants

## Promote a platform operator

```bash
cd server
node scripts/set_platform_admin.js admin@yourdomain.com
```

## Plans (default seed)

| Code | Users | Locations | Monthly (USD) |
|------|-------|-----------|---------------|
| trial | 3 | 1 | 0 (14-day trial) |
| starter | 10 | 2 | 49 |
| professional | 50 | 10 | 149 |
| enterprise | unlimited | unlimited | 499 |

## Scoped data

`tenant_id` is on: `locations`, `medicines`, `suppliers`, `customers`.  
Locations are filtered on inventory APIs. User list is filtered by tenant membership.

**Next steps for full isolation** (optional): add `tenant_id` to sales, purchase orders, stock operation tables, and apply `authenticateWithTenant` on remaining routes.

## Billing integration

Plan changes and payment collection are stubbed. Wire Stripe/Razorpay webhooks to:

1. Update `tenants.plan_code` on subscription events
2. Set `tenants.status` on payment failure
3. Store `stripe_customer_id` in `tenants.settings` JSONB
