# Security Review — Phase 9 RC

Security assessment summary for Pulse POS Release Candidate v9.0.0-rc1. Use alongside [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md) before pilot exposure to the internet.

---

## Scope

| In scope | Out of scope (RC) |
|----------|-------------------|
| API authentication, RBAC, tenant isolation | External penetration test report |
| Login lockout, refresh rotation | WAF / DDoS edge protection |
| Audit logging, support impersonation | Hardware security modules for payments |
| CORS, production secret validation | SOC 2 certification |

---

## Authentication — JWT

| Item | Implementation | Status |
|------|----------------|--------|
| Access tokens | HS256 JWT, `type: access`, default TTL 30 min | Implemented |
| Signing key | `SECRET_KEY` env (32+ chars required in production) | Implemented |
| Payload | `sub`, `company_id`, `store_id`, `role_id`, `role_code` | Implemented |
| Validation | `decode_token` on protected routes via `get_current_user` | Implemented |

Access tokens are sent as `Authorization: Bearer <token>`. Invalid or expired tokens return 401.

**Recommendation:** For long-term HA deployments, consider asymmetric keys (RS256) and a dedicated auth service; HS256 is acceptable for single-region pilot.

---

## Refresh token rotation

| Item | Detail |
|------|--------|
| Token type | Separate JWT with `type: refresh`, signed with `JWT_REFRESH_SECRET_KEY` or `SECRET_KEY` |
| Storage | SHA-256 hash stored in `refresh_token` table, not raw token |
| Rotation | On `/auth/refresh`, old row marked `revoked=true`, new pair issued |
| Logout | `/auth/logout` revokes refresh token hash |
| TTL | Default 7 days (`REFRESH_TOKEN_EXPIRE_DAYS`) |

Replay of a revoked refresh token fails with 401. This satisfies one-time-use refresh rotation for pilot scope.

---

## Password hashing — bcrypt

- **Library:** `passlib` with `CryptContext(schemes=["bcrypt"])`
- **Functions:** `hash_password`, `verify_password` in `app.security`
- Seed and user passwords stored as bcrypt hashes only
- Change-password endpoint re-hashes on update

**Recommendation:** Enforce minimum password length and complexity in onboarding UI (backend accepts any string today).

---

## Rate limit and account lockout

| Setting | Default | Env var |
|---------|---------|---------|
| Max failed logins | 5 | `LOGIN_MAX_ATTEMPTS` (via settings) |
| Lockout duration | 15 minutes | `LOGIN_LOCKOUT_MINUTES` |

Failed attempts recorded in `login_attempt` table per email. Locked accounts receive **429** with *"Account temporarily locked"*. Successful login clears the counter.

This is account-level lockout, not IP-level rate limiting. 

**Recommendation:** Add reverse-proxy rate limiting (nginx `limit_req`) on `/api/v1/auth/login` for brute-force protection at scale.

---

## RBAC

- Permission codes defined in `app.rbac` (e.g. `purchase.approve`, `pos.refund`, `reports.margin`)
- Default role matrices: Admin, Store Manager, Cashier, Inventory User, Auditor
- API routes use `require_permission()` dependency
- Frontend mirrors permissions via `backend-permissions.ts` and `permission-ui.tsx`

Verified in tests: cashier denied purchase approve, refund may require approval workflow.

**Recommendation:** Per-user permission overrides exist in schema; document admin process for exceptions.

---

## Tenant isolation

- All tenant-scoped models include `company_id`
- `AuthContext.company_id` from JWT used in queries: `Product.company_id == auth.company_id`
- Cross-tenant resource access returns 404/403 (no data leak in IDOR tests)
- Platform admin routes separated under `/platform` with `is_platform_admin` check

Suspended tenants: login blocked for tenant users (`403 Tenant suspended`); platform admin exempt.

---

## Device validation

- `pos_device` and `device_session` models in SaaS layer
- Registration: `POST /api/v1/devices/register`
- Admin approve/block: `POST /api/v1/devices/{id}/approve|block`
- Store policy `device_control` can enforce approved-device-only sales

Browser POS registers as `device_type: browser`. Heartbeat endpoint tracks last seen.

**Recommendation:** Enable `device_control` policy for pilot if single-store device whitelist is required.

---

## Support impersonation audit

- `support_impersonation` table with start/end timestamps
- Super admin starts support session → audited `support_impersonation` entity
- Time-limited access into tenant context with `impersonation_id` on token
- End session audited; `validate_impersonation` on subsequent requests

All impersonation start/end events should appear in audit logs (UAT AUD-05).

---

## Audit coverage

| Action | Audited |
|--------|---------|
| Login / logout | Yes |
| Product create, price change | Yes |
| Purchase approve, receive | Yes |
| Receipt reprint | Yes |
| Support impersonation | Yes |
| Seed demo (dev) | Yes |
| Failed login | No (lockout table only) |
| Read-only report views | No |

Audit model: `company_id`, `user_id`, `store_id`, `action`, `entity_type`, `entity_id`, metadata JSON.

**Recommendation:** Add audit for permission changes and subscription plan changes before enterprise GA.

---

## CORS

- Configured via `CORS_ORIGINS` comma-separated list
- Applied in FastAPI CORSMiddleware on backend
- Production/staging validates strong `SECRET_KEY`; CORS should list **only** production frontend origin(s)

Misconfigured CORS manifests as browser-blocked requests, not silent credential leak.

---

## Error handling

- HTTP exceptions return JSON `detail` message
- Production `LOG_LEVEL=warning` reduces stack trace verbosity in logs
- Invalid tokens: 401 without exposing internal validation details
- 500 errors logged server-side; generic message to client

**Recommendation:** Ensure nginx does not expose upstream stack traces; use centralized error reporting (`error-reporting.ts` on frontend).

---

## Demo separation

| Mode | Behavior |
|------|----------|
| **Live** | Authenticated session; all writes go to API/PostgreSQL |
| **Demo** | `localStorage pulse.demoMode=true`; no auth; mock catalog via `industry-mock` |

`shouldUseBackend()` returns false in demo mode. Demo sales do not sync and do not appear in tenant reports.

**Recommendation:** Disable demo mode entry point on production builds or hide behind feature flag for pilot URLs.

---

## Super admin separation

- `UserAccount.is_platform_admin` flag for `super@pulse.pos`
- Platform routes: tenants, subscriptions, support impersonation
- Super admin not intended for day-to-day POS; tenant admin for store ops
- JWT does not grant cross-tenant data without explicit impersonation

---

## Recommendations summary

| Priority | Item |
|----------|------|
| High | Rotate all seed passwords before pilot; `SEED_ON_STARTUP=false` |
| High | TLS 1.2+ on all public endpoints |
| High | nginx `limit_req` on login endpoint |
| Medium | Password complexity policy in UI |
| Medium | Encrypt backups at rest (GPG/S3 SSE) |
| Medium | Quarterly restore drill |
| Low | RS256 JWT for multi-service future |
| Low | Audit permission and subscription changes |

---

## Test evidence

- `backend/tests/test_api.py` — auth, RBAC cashier denied
- `backend/tests/test_phase8.py` — lockout, refresh, tenant suspend, impersonation, cashier refund approval
- `backend/tests/test_operations.py` — RBAC purchase denied for cashier

**74 backend tests** collected in Phase 9 RC CI run.

**Related:** [ENVIRONMENT.md](./ENVIRONMENT.md) · [PILOT_UAT_CHECKLIST.md](./PILOT_UAT_CHECKLIST.md) Section F
