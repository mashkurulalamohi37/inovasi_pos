# Production Checklist (Phase 8A)

Complete before GA / paying tenants. Cross-check [GA_READINESS.md](./GA_READINESS.md).

## Secrets & environment

- [ ] `SECRET_KEY` / `JWT_REFRESH_SECRET_KEY` ≥32 chars, unique, from secret store
- [ ] `DATABASE_URL` production credentials (not in git)
- [ ] `ENVIRONMENT=production`
- [ ] `SEED_ON_STARTUP=false`
- [ ] `ALLOW_PUBLIC_ONBOARDING=false`
- [ ] Demo mode / demo users disabled or rotated
- [ ] Debug / verbose SQL logging off
- [ ] `.env` excluded from git and images
- [ ] Sample env contains no live secrets

## HTTPS / CORS / headers

- [ ] TLS terminated correctly; HSTS enabled when HTTPS is real
- [ ] CORS origins explicit (no `*` with credentials)
- [ ] Security headers verified (nosniff, frame deny, referrer, permissions-policy)
- [ ] CSP only if tested against the SPA (do not break silently)

## Database

- [ ] PostgreSQL 16 (not SQLite) for production
- [ ] Pool env tuned (`DB_POOL_SIZE`, `DB_MAX_OVERFLOW`, `DB_POOL_RECYCLE`) — see [CONNECTION_POOL.md](./CONNECTION_POOL.md)
- [ ] Alembic at expected head; single migration runner
- [ ] Pre-migration backup taken

## Rate limiting

- [ ] Login/refresh limits active in production
- [ ] Multi-replica → Redis / gateway limits ([RATE_LIMITING.md](./RATE_LIMITING.md))
- [ ] POS sale paths not over-throttled

## Logging / metrics / health

- [ ] Log aggregation receives request_id + error_category
- [ ] No secrets in logs
- [ ] `GET /health/live` and `GET /health/ready` monitored
- [ ] Alerts for DB down / 5xx / backup failure ([OBSERVABILITY.md](./OBSERVABILITY.md))

## Backup / DR

- [ ] Automated off-host backups
- [ ] Retention + encryption configured
- [ ] Restore drill PASS recorded ([BACKUP_AND_DR.md](./BACKUP_AND_DR.md))

## Application

- [ ] Admin account provisioned; MFA/password policy as required
- [ ] Feature flags reviewed for GA surface
- [ ] Test / seed data absent from production DB
- [ ] SMTP / push only if configured and secrets external
- [ ] File upload features remain disabled if not hardened

## Release gates

- [ ] CI PR gates green ([CI_RELEASE_GATES.md](./CI_RELEASE_GATES.md))
- [ ] Playwright `@smoke` green on staging
- [ ] Deployment + incident runbooks reviewed
- [ ] No open P0 in risk register

## Post-cutover smoke

- [ ] Login → POS sale → stock → receipt/history
- [ ] Purchase receive (if used)
- [ ] One vertical path relevant to the tenant
- [ ] Audit log spot-check
