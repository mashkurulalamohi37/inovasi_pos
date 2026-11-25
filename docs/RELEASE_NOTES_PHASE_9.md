# Release Notes — Pulse POS v9.0.0-rc1

**Release date:** 2026-06-26  
**Tag:** `v9.0.0-rc1` (Release Candidate — Phase 9)  
**Branch:** Phase 9 pilot / RC line

---

## Summary

Phase 9 delivers a **pilot-ready Release Candidate** for multi-tenant Pulse POS: seven industry packs on one platform, full back-office (inventory, purchase, returns), SaaS governance (subscriptions, devices, approvals), offline sync, security hardening, and Docker-based deployment documentation.

This RC is intended for **controlled pilot tenants**, not general availability without UAT sign-off.

---

## Major features

### Platform & SaaS

- Multi-tenant company model with tenant suspend/activate (super admin)
- Subscription plans: Starter, Professional, Enterprise with usage limits
- Public tenant onboarding API and wizard UI
- POS device registration, approval, block, heartbeat (browser devices)
- Manager approval workflow (discount, refund, purchase, restricted medicine)
- In-app notifications and approval inbox
- Support impersonation with time-limited audited access

### Industry packs (7)

| Pack | Highlights |
|------|------------|
| Grocery | Wholesale pricing, fast SKU/barcode POS |
| Pharmacy | Batch/expiry, restricted medicine controls |
| Fashion | Size/color variants |
| Electronics | Serial tracking, RMA returns |
| Restaurant | Table orders, KOT flow |
| Jewelry | Weight-based pricing |
| Beef shop | Cuts, batches, wastage, vertical reports |

### POS & sales

- Universal and industry-specific POS shells
- Hold/resume sales, manager discounts, split payments (cash + mock card)
- Receipt templates, preview, reprint with audit
- Idempotent sales via `client_transaction_id` for offline sync
- Customer attach on invoice

### Inventory & purchase

- Product CRUD with industry dynamic fields
- Stock ledger, adjustments, low-stock awareness
- Purchase order → approve → GRN receive workflow with RBAC
- Supplier management

### Returns & refunds

- Full and partial returns with stock restoration
- Refund payments; cashier refund triggers approval when above limit
- Industry-specific return handling (e.g. electronics serial)

### Security & audit

- JWT access + refresh with rotation and revocation on logout
- bcrypt password hashing, login lockout (5 failures / 15 min default)
- RBAC aligned across API and frontend
- Tenant isolation on all scoped queries
- Audit logs for admin actions, login, price changes, impersonation

### Operations

- System health endpoint (API + database)
- Backup/restore scripts and backup status API hint
- Demo mode (localStorage) vs Live mode (API) separation
- Performance smoke test script (`scripts/perf_smoke_test.py`)
- Docker Compose prod stack (`docker-compose.prod.yml`)
- CI: backend tests, frontend tests, Docker build

---

## Known limitations

| Area | Limitation |
|------|------------|
| **Docker full stack** | `docker compose up --build` documented and entrypoint hardened (Alembic migrate + seed); **end-to-end verification pending** until Docker Desktop engine is running on the host — see README Docker section |
| **Payments** | Cash and internal mock card only — **no external payment gateway** (Stripe, bKash, etc.) |
| **Notifications** | **No SMS or email** for receipts, alerts, or OTP |
| **Hardware** | Receipt print dialog and barcode field UI are **software-ready**; physical scanner, printer, drawer, scale require **per-client driver testing** — see [HARDWARE_INTEGRATION.md](./HARDWARE_INTEGRATION.md) |
| **Rate limiting** | Account lockout on login; no global IP rate limit in app (use nginx) |
| **HA / scale** | Single-node Compose suitable for pilot; multi-region HA not in RC |
| **Mobile** | Responsive browser POS; no native iOS/Android app |
| **Fiscal compliance** | No certified fiscal printer integration in RC |

---

## Test summary

| Suite | Count | Command |
|-------|-------|---------|
| Backend (pytest) | **76** | `npm run backend:test` |
| Frontend (vitest) | **48** | `npm run frontend:test` |
| Combined | **124** | `npm run test:all` |

Coverage highlights: auth/RBAC, industry sales, operations (purchase, devices), Phase 8 platform (subscriptions, lockout, impersonation, sync), frontend integration (login, demo mode, sync center, permissions).

Performance smoke: `npm run perf:smoke` (see [PERFORMANCE_NOTES.md](./PERFORMANCE_NOTES.md)).

---

## UAT checklist

Complete pilot sign-off using:

**[PILOT_UAT_CHECKLIST.md](./PILOT_UAT_CHECKLIST.md)**

Sections A–H: Super Admin, Tenant Admin, POS (all industries), Inventory & Purchase, Sales Return & Refund, Security, Reports & Audit, Offline Sync.

---

## Deployment notes

| Doc | Purpose |
|-----|---------|
| [PILOT_DEPLOYMENT.md](./PILOT_DEPLOYMENT.md) | Pilot server, Docker, nginx, backup, upgrade/rollback |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | General production deployment |
| [ENVIRONMENT.md](./ENVIRONMENT.md) | Environment variables |
| [BACKUP_RESTORE.md](./BACKUP_RESTORE.md) | PostgreSQL backup and restore |
| [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md) | Pre-go-live checklist |

**Quick pilot start:**

```bash
cp .env.example .env
# Edit SECRET_KEY, POSTGRES_PASSWORD, VITE_API_URL, CORS_ORIGINS
docker compose -f docker-compose.prod.yml up -d --build
```

Set `SEED_ON_STARTUP=true` once for initial data, then `false`.

---

## Demo credentials (development seed only)

| Role | Email | Password |
|------|-------|----------|
| Super Admin | `super@pulse.pos` | `super123` |
| Tenant Admin | `admin@pulse.pos` | `admin123` |
| Cashier | `cashier@pulse.pos` | `cashier123` |

**Rotate or disable before production.** See [CLIENT_DEMO_SCRIPT.md](./CLIENT_DEMO_SCRIPT.md) for demo flow.

---

## Support notes

| Topic | Guidance |
|-------|----------|
| Tenant suspended | Super admin → Tenants → Activate; tenant users cannot log in while suspended |
| Login lockout | Wait 15 min or clear `login_attempt` row for email (support DB access) |
| Empty catalog | Confirm Live mode, health check, products API |
| CORS errors | `CORS_ORIGINS` must match frontend URL exactly |
| Reset demo data | `docker compose exec backend python -m app.manage reset-demo` |
| Create super admin | `python -m app.manage create-super-admin` |
| Logs | `docker compose logs backend` / nginx access log |
| Escalation | Engineering + audit log export for incident ID |

---

## Documentation index (Phase 9)

| File | Description |
|------|-------------|
| PILOT_UAT_CHECKLIST.md | UAT test cases A–H |
| CLIENT_DEMO_SCRIPT.md | 45–60 min demo script |
| PILOT_DEPLOYMENT.md | Pilot install guide |
| SECURITY_REVIEW.md | Security architecture review |
| PERFORMANCE_NOTES.md | Latency targets and smoke test |
| HARDWARE_INTEGRATION.md | Future hardware roadmap |
| RELEASE_NOTES_PHASE_9.md | This document |

---

## Upgrade from Phase 8

1. Backup database
2. Pull RC tag / branch
3. `python -m app.manage migrate`
4. Rebuild images with updated `VITE_API_URL` if API domain changed
5. Run `test:all` and UAT smoke subset
6. Review SECURITY_REVIEW recommendations

---

**Previous:** Phase 8 — SaaS platform, subscriptions, devices, approvals  
**Next (post-pilot):** External payments, SMS/email, hardware certification, GA release
