# CI / Release Gates (Phase 8A)

## PR gates (required)

1. `backend-unit` (includes Fashion step `pytest -m fashion`)
2. `frontend-unit`
3. `frontend-integration` (+ production-route-guard)
4. `postgres-migrate-fresh`
5. `postgres-upgrade-matrix`
6. `postgres-integration` (concurrency + rollback + fashion)
7. `frontend-build`
8. `e2e-smoke` (Playwright `@smoke` against real API + PostgreSQL when job enabled — includes Fashion API smoke)
9. Security scan job (pip-audit / npm audit — advisory, fail on critical when tuned)

## Nightly

- Full Playwright P0 + P1 verticals
- Upgrade matrix (redundant safety)
- Optional k6 smoke against staging

## Pre-release / GA

- All stable E2E
- Backup restore drill evidence
- Load profile Normal + Peak measured on PostgreSQL
- Security scan triage complete (no open P0 vulns)
- `docker-build` images tagged with version

## Not on every commit

Full stress / multi-browser matrix / hour-long load — nightly or release only.
