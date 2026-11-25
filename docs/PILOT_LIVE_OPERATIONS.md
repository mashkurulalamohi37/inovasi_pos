# Pilot Live Operations — Pulse POS v9.0.0-rc1

Operational hub for controlled pilot live period, hypercare, and production readiness.

**Current label:** Pilot Live — Hardware Conditions Accepted  
**Next label after client trading starts:** Pilot Live → Pilot Live — Hypercare

---

## Document index

| Document | Use |
|----------|-----|
| [PILOT_LIVE_DAY_LOG.md](./PILOT_LIVE_DAY_LOG.md) | Real-time event log (first days) |
| [FIRST_DAY_LIVE_CHECKLIST.md](./FIRST_DAY_LIVE_CHECKLIST.md) | First transaction verification |
| [DAILY_RECONCILIATION_TEMPLATE.md](./DAILY_RECONCILIATION_TEMPLATE.md) | End-of-day reconciliation |
| [DAILY_HYPERCARE_REPORT_TEMPLATE.md](./DAILY_HYPERCARE_REPORT_TEMPLATE.md) | Daily hypercare summary |
| [PILOT_INCIDENT_REGISTER.md](./PILOT_INCIDENT_REGISTER.md) | Incident tracking & fixes |
| [HARDWARE_VALIDATION_RECORD.md](./HARDWARE_VALIDATION_RECORD.md) | Terminal hardware sign-off |
| [PRODUCTION_READINESS_ASSESSMENT.md](./PRODUCTION_READINESS_ASSESSMENT.md) | Post-pilot assessment |
| [CREDENTIAL_ROTATION_RUNBOOK.md](./CREDENTIAL_ROTATION_RUNBOOK.md) | Secrets & users |
| [BACKUP_RESTORE.md](./BACKUP_RESTORE.md) | Backup/restore |
| [PILOT_SUPPORT_PLAN.md](./PILOT_SUPPORT_PLAN.md) | Escalation |

---

## 1. Production deployment confirmation (pre-trading)

Run on **production server** before first sale:

```powershell
# Fill .env from .env.production.example — never commit secrets
python scripts/prod_readiness_check.py --env-file .env --base https://api.CLIENTDOMAIN.com
python scripts/docker_smoke_test.py --base https://api.CLIENTDOMAIN.com
python scripts/live_trial_smoke.py --base https://api.CLIENTDOMAIN.com --email NAMED_ADMIN@client.com --password ***
docker compose exec backend python -m app.manage disable-demo-users --dry-run
```

| Check | Required | Staging (2026-06-26) | Production |
|-------|----------|----------------------|------------|
| Server running | Yes | Docker healthy | Client VPS |
| HTTPS active | Yes | HTTP localhost | Client TLS |
| Frontend opens | Yes | :3001/login 200 | Client domain |
| `/health` | Yes | PASS | |
| `/system/health` | Yes | PASS | |
| DB volume persistent | Yes | pulse_pg_data | |
| `SEED_ON_STARTUP=false` | Yes | dev seed on | **Must be false** |
| Secrets rotated | Yes | dev defaults | Client `.env` |
| CORS restricted | Yes | localhost dev | Prod domain only |
| Demo users disabled | Yes | dry-run OK | **Apply on prod** |
| Named users created | Yes | Pending | Client runbook |
| Devices approved | Yes | API verified | Per terminal |
| `prod_readiness_check` | 100% pass | Template fails (expected) | Required |

---

## 2. Status labels

| Label | Meaning |
|-------|---------|
| Pilot Live — Hardware Conditions Accepted | Software ready; client deploy/sign-off pending |
| **Pilot Live** | Client trading started (named users) |
| Pilot Live — Hypercare | Active hypercare monitoring period |
| Pilot Stable | No Critical/High; daily reconcile balanced |
| Production Ready with Conditions | Assessment with signed waivers |
| Production Ready | Full exit criteria + client acceptance |

---

## 3. Pilot exit criteria

- [ ] No open Critical incidents
- [ ] No open High incidents affecting operation
- [ ] Daily sales reconcile correctly
- [ ] Inventory movement accurate
- [ ] Payment collection matches reports
- [ ] Backup verified (+ restore tested)
- [ ] Hardware accepted or limitations signed
- [ ] Client operates independently
- [ ] Support process working
- [ ] Client pilot acceptance signed

---

## 4. Regression after production fix

```powershell
npm run build
npm run backend:test
npm run frontend:test
python scripts/docker_smoke_test.py
python scripts/live_trial_smoke.py
```

---

## 5. Day 0 staging verification log

| Time | Event | Result |
|------|-------|--------|
| 2026-06-26 | docker_smoke_test | 11/11 PASS |
| 2026-06-26 | live_trial_smoke | 12/12 PASS |
| 2026-06-26 | backend:test | 101 passed |
| 2026-06-26 | Open incidents | 0 |

**Awaiting:** Client production deploy, formal sign-off, first live trading day.
