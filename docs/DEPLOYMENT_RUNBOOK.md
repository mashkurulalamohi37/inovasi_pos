# Deployment Runbook (Phase 8A)

Operational procedure for upgrading Pulse POS. Prefer one migration runner and immutable image tags (not `latest` alone).

## 1. Pre-deployment checks

- [ ] CI green: backend-unit, frontend-unit, frontend-integration, production-route-guard, postgres-migrate-fresh, postgres-upgrade-matrix, postgres-integration
- [ ] Release tag / image digests recorded
- [ ] `ENVIRONMENT=production` (or staging) secrets validated
- [ ] `SEED_ON_STARTUP=false`, `ALLOW_PUBLIC_ONBOARDING=false` in production
- [ ] CORS origins match production frontend only
- [ ] Backup completed and verified (see [BACKUP_AND_DR.md](./BACKUP_AND_DR.md))
- [ ] Change window / rollback owner identified

## 2. Backup

```bash
./scripts/backup_postgres.sh
# Store dump off-host; record filename + checksum
```

## 3. Build

```bash
docker compose -f docker-compose.prod.yml build
# Tag as pulse-pos-backend:<version> / pulse-pos-frontend:<version>
```

Frontend: `npm ci && npm run build` with production `VITE_API_URL`.

## 4. Migration

**Single runner only** — never run multiple Alembic processes concurrently.

```bash
# Stop app writers if migration is locking / high-risk
docker compose -f docker-compose.prod.yml run --rm backend python -m app.manage migrate
```

On failure: do not continue deploy. Restore from backup or forward-fix with a hotfix migration.

## 5. Deploy

```bash
docker compose -f docker-compose.prod.yml up -d
```

Rolling / blue-green: bring new app instances up behind health checks; drain old instances after `/health/ready` succeeds.

## 6. Health check

```bash
curl -sf https://api.example/health/live
curl -sf https://api.example/health/ready
```

Ready must return HTTP 200 with `ready: true`. Do not treat live-only as full readiness.

## 7. Smoke tests

- Login (admin + cashier)
- One POS sale + stock deduction
- One purchase receive (if in scope)
- Playwright `@smoke` against staging: `npx playwright test --grep @smoke`

## 8. Monitoring

Watch 15–30 minutes: 5xx rate, p95 latency, DB connections, stock conflicts, failed logins. Correlate via `X-Request-ID`.

## 9. Rollback criteria

Rollback if any of:

- `/health/ready` fails after grace period
- Elevated 5xx (> threshold agreed with ops)
- Critical POS sale / payment path broken
- Migration left schema inconsistent and cannot forward-fix quickly

## 10. Rollback procedure

1. Redeploy previous image tags.
2. If migration is irreversible: restore DB from pre-deploy backup into isolated verify DB first, then cut over (see DR runbook).
3. Confirm `/health/ready` and smoke sale.
4. Open incident if customer impact occurred ([INCIDENT_RUNBOOK.md](./INCIDENT_RUNBOOK.md)).
