# Pilot Go-Live Execution Record — v9.0.0-rc1

Final go-live preparation status. **Staging/Docker verified**; **production HTTPS and client hardware** require client deployment session.

**Date:** 2026-06-26  
**Version:** v9.0.0-rc1  
**Prior UAT:** [UAT_EXECUTION_REPORT_CYCLE2.md](./UAT_EXECUTION_REPORT_CYCLE2.md) — 90/98 passed, 0 failed

---

## 1. Production environment readiness

| Check | Staging (Docker) | Production | Evidence |
|-------|------------------|------------|----------|
| Server provisioned | Docker host | Client VPS pending | Docker compose healthy |
| Docker installed | Yes | Client deploy | `docker compose up` |
| Docker compose verified | Yes | `docker-compose.prod.yml` updated | JWT_REFRESH, BACKUP_PATH |
| Domain configured | localhost | Client domain pending | |
| HTTPS/SSL | HTTP local | Client nginx/Caddy pending | |
| Reverse proxy | N/A local | Client pending | PILOT_DEPLOYMENT.md |
| Firewall reviewed | N/A local | Client pending | |
| PostgreSQL volume | `pulse_pg_data` | Named volume in prod file | Persists restart |
| Application logs | Docker logs | Client aggregator pending | |
| Backup path configured | `./backups` | `/var/backups/pulse` in template | |
| Restore tested | Documented | Staging drill pending on prod | BACKUP_RESTORE.md |
| Health endpoints | Pass | Pending prod URL | docker_smoke 11/11 |

| Runtime check | Result |
|---------------|--------|
| Frontend URL | http://localhost:3001/login — 200 |
| Backend `/health` | Pass |
| `/system/health` | database connected |
| Super admin login | Pass (staging seed) |
| Tenant admin login | Pass |
| DB persists after restart | Verified in Docker verification |
| Backup script | `scripts/backup_postgres.sh` — run on deploy host |

**Production gate:** Run `python scripts/prod_readiness_check.py --env-file .env` on server after `.env` filled.

---

## 2. Environment variables

| Variable | Required | Staging | Production action |
|----------|----------|---------|-------------------|
| `ENVIRONMENT=production` | Yes | dev compose | Set in prod `.env` |
| `SEED_ON_STARTUP=false` | Yes | true on dev seed | **Must be false** |
| `SECRET_KEY` rotated | Yes | dev default | `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET_KEY` | Yes | optional dev | Distinct random |
| `CORS_ORIGINS` | HTTPS only | localhost dev | Single prod domain |
| Demo passwords | Not for live | Seed accounts | `disable-demo-users` |
| `POSTGRES_PASSWORD` | Strong | docker default | Rotate |
| Rate limiting | Yes | LOGIN_MAX_ATTEMPTS=5 | In prod template |
| `LOG_LEVEL` | warning | info dev | warning prod |
| `BACKUP_PATH` | Yes | ./backups | /var/backups/pulse |
| `VITE_API_URL` | HTTPS API | localhost:8000 | Rebuild frontend |

**Fail deployment if:** weak secret, wildcard CORS, `SEED_ON_STARTUP=true` in production, non-persistent DB volume.

---

## 3. User, role & credential finalization

| Task | Status | Tool |
|------|--------|------|
| Named super admin | **Pending client** | `manage create-super-admin` |
| Named tenant admin | **Pending client** | `manage create-tenant-user` |
| Manager / cashier / inventory / auditor | **Pending client** | `manage create-tenant-user` |
| Disable seed users | **Ready** | `manage disable-demo-users` |
| Cashier RBAC | **Verified** | pytest SEC-08 |
| Manager approval | **Verified** | refund approval smoke |
| Support access audited | **Verified** | Cycle 1 SA-09 |

**Runbook:** [CREDENTIAL_ROTATION_RUNBOOK.md](./CREDENTIAL_ROTATION_RUNBOOK.md)

User list: **client password vault only** — not in repository.

---

## 4. Tenant and store configuration

| Item | Staging (PULSE-DEMO seed) | Client pilot |
|------|---------------------------|--------------|
| Company profile | Seeded | Confirm / update |
| Stores / warehouses / counters | Seeded DHK-01 | Match import CSV codes |
| Devices | API approve works | Register each terminal |
| Number series | INV/PO/GRN | Verify prefixes |
| Tax rules | Default | Client tax setup |
| Payment methods | cash/card/mobile | Configure |
| Receipt templates | Default seeded | Branding |
| Industry packs | All 7 enabled | Scope to pilot |
| Feature flags | Seeded defaults | Review |
| Approval workflow | Refund approval | Manager trained |

---

## 5. Hardware validation

Software-level validation complete in UAT Cycle 2. **Physical terminal validation** uses [HARDWARE_VALIDATION_RECORD.md](./HARDWARE_VALIDATION_RECORD.md).

| Device | Software UAT | Physical client |
|--------|----------------|-----------------|
| Barcode scanner | Pass (wedge) | Pending client |
| Receipt printer | Pass (browser print) | Pending client |
| Weight scale | Mock Pass | Pending client |
| KOT / kitchen printer | Preview only | Pending client |
| Cash drawer | Out of scope | Out of scope |
| Serial scanner | Pass API | Pending client |
| Device approval | Pass API | Pending client |

---

## 6. Opening data

| Module | Staging | Live pilot |
|--------|---------|------------|
| Products | Seed 7 SKUs | Import or manual per DATA_IMPORT_PLAN |
| Opening stock | Seed 100 qty | opening_stock.csv / adjustment |
| Suppliers / customers | Seed supplier | Manual or v9.1 CSV |
| Pharmacy batches | Seeded | pharmacy_batches.csv |
| Fashion variants | Seeded | fashion_variants.csv |
| Electronics serials | Seeded | electronics_serials.csv |
| Import dry run | Pass | API stub dry_run |

---

## 7. Live trial transactions

Executed via `scripts/live_trial_smoke.py` on staging Docker API:

| Transaction | Result |
|-------------|--------|
| Grocery sale | Pass |
| Beef sale | Pass |
| Fashion sale | Pass |
| Pharmacy sale | Pass |
| Electronics serial sale | Pass |
| Purchase receive | Pass |
| Refund | Pass |
| Receipt reprint | Pass |
| Stock ledger | Pass |
| Sales report | Pass |
| Audit log | Pass |

**Note:** Mark trial invoices or clear before live trading per client policy.

Command: `npm run live:trial`

---

## 8. Backup and restore

| Item | Value |
|------|-------|
| Script | `scripts/backup_postgres.sh` |
| Restore | `scripts/restore_postgres.sh` |
| Frequency | Daily 02:00 cron (recommended) |
| Location | `BACKUP_PATH` / `./backups` |
| Retention | 7 daily + 4 weekly off-site |
| API status | `GET /api/v1/system/backup/status` |
| Last staging backup | Run on deploy: `npm run backup:db` |
| Restore drill | Required on prod staging before go-live |
| Access | Restrict to DevOps / backup role |

---

## 9. Go-live command center

Live-day template: [PILOT_LIVE_DAY_LOG.md](./PILOT_LIVE_DAY_LOG.md)  
Support plan: [PILOT_SUPPORT_PLAN.md](./PILOT_SUPPORT_PLAN.md)

---

## 10. Client sign-off

| Document | Status |
|----------|--------|
| [UAT_SIGNOFF_PACKAGE.md](./UAT_SIGNOFF_PACKAGE.md) | Ready for client signatures |
| [PILOT_GO_LIVE_CHECKLIST.md](./PILOT_GO_LIVE_CHECKLIST.md) | Sections A/C/E updated |

**Sign-off statement (template):**

> The client accepts Pulse POS v9.0.0-rc1 for controlled pilot go-live, subject to documented limitations and hardware/integration conditions.

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Client business owner | | | |
| Client IT representative | | | |
| Implementation lead | | | |
| Project manager | | | |
| Support lead | | | |

---

## 11. Go / No-Go decision

### Recommendation: **Conditional Go → Pilot Live (Hardware Conditions Accepted)**

| Go criterion | Status |
|--------------|--------|
| No Critical defect | Met |
| No High operational defect | Met |
| Hardware accepted or documented pending | Met (software + client form) |
| Backup configured | Script ready; prod cron pending |
| HTTPS enabled | Pending prod deploy |
| Credentials rotated | Runbook ready; client execution pending |
| Live users configured | CLI ready; client execution pending |
| Opening stock verified | Seed on staging; client data pending |
| Client sign-off | **Pending** |

**No-Go triggers:** None active on staging.

---

## 12. Final verification (2026-06-26)

| Command | Result |
|---------|--------|
| `npm run build` | Pass |
| `npm run backend:test` | 101 passed |
| `npm run frontend:test` | 48 passed |
| `python scripts/docker_smoke_test.py` | 11/11 |
| `python scripts/uat_cycle2_smoke.py` | 11/11 |
| `python scripts/live_trial_smoke.py` | Run after docker up |
| `python scripts/perf_smoke_test.py` | Pass (prior cycle) |
| `python scripts/prod_readiness_check.py --env-file .env.production.example` | Expected FAIL (placeholders) |

---

## 13. Release label

| Label | When |
|-------|------|
| Pilot Go-Live Ready (hardware pending) | UAT Cycle 2 complete |
| **Pilot Live — Hardware Conditions Accepted** | **Current** — software go-live ready; client sign-off + prod deploy pending |
| Pilot Live | After client signs and trading starts |
| Production Ready | After successful pilot with real devices |

---

**Next actions for client:**

1. Deploy `docker-compose.prod.yml` with production `.env`
2. Run [CREDENTIAL_ROTATION_RUNBOOK.md](./CREDENTIAL_ROTATION_RUNBOOK.md)
3. Complete [HARDWARE_VALIDATION_RECORD.md](./HARDWARE_VALIDATION_RECORD.md) on terminals
4. Sign [UAT_SIGNOFF_PACKAGE.md](./UAT_SIGNOFF_PACKAGE.md)
5. Open [PILOT_LIVE_DAY_LOG.md](./PILOT_LIVE_DAY_LOG.md) on first trading day
