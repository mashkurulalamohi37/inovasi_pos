# UAT Sign-off Package — Pulse POS v9.0.0-rc1

Pilot release candidate acceptance package for client review and formal sign-off.

---

## 1. Document index

| Document | Purpose | Location |
|----------|---------|----------|
| Go-live execution record | Final prep status | [PILOT_GO_LIVE_EXECUTION.md](./PILOT_GO_LIVE_EXECUTION.md) |
| **Pilot live operations hub** | Hypercare, incidents, reconciliation | [PILOT_LIVE_OPERATIONS.md](./PILOT_LIVE_OPERATIONS.md) |
| Credential rotation | Secrets and user CLI | [CREDENTIAL_ROTATION_RUNBOOK.md](./CREDENTIAL_ROTATION_RUNBOOK.md) |
| Hardware validation form | Client terminal sign-off | [HARDWARE_VALIDATION_RECORD.md](./HARDWARE_VALIDATION_RECORD.md) |
| Live day log | First trading day ops | [PILOT_LIVE_DAY_LOG.md](./PILOT_LIVE_DAY_LOG.md) |
| Defect tracker (Cycle 1) | Defects and enhancement backlog | [DEFECT_TRACKER_CYCLE1.md](./DEFECT_TRACKER_CYCLE1.md) |
| Pilot UAT checklist | Full 98-scenario matrix | [PILOT_UAT_CHECKLIST.md](./PILOT_UAT_CHECKLIST.md) |
| Go-live checklist | Production readiness | [PILOT_GO_LIVE_CHECKLIST.md](./PILOT_GO_LIVE_CHECKLIST.md) |
| Release notes | v9.0.0-rc1 scope and changes | [RELEASE_NOTES_V9_RC1.md](./RELEASE_NOTES_V9_RC1.md) |
| Deployment guide | Docker and env setup | [DEPLOYMENT.md](./DEPLOYMENT.md) · [PILOT_DEPLOYMENT.md](./PILOT_DEPLOYMENT.md) |
| Backup / restore | DR procedures | [BACKUP_RESTORE.md](./BACKUP_RESTORE.md) |
| Support plan | Escalation and SLAs | [PILOT_SUPPORT_PLAN.md](./PILOT_SUPPORT_PLAN.md) |
| Data import plan | Master data and opening stock | [DATA_IMPORT_PLAN.md](./DATA_IMPORT_PLAN.md) |
| Docker verification | Stack evidence | [DOCKER_VERIFICATION_REPORT.md](./DOCKER_VERIFICATION_REPORT.md) |

---

## 2. Project summary

| Field | Value |
|-------|-------|
| **Client name** | _Pilot client — to be completed at sign-off_ |
| **Project name** | Pulse POS — Multi-industry SaaS POS |
| **Version** | v9.0.0-rc1 |
| **UAT period** | Cycle 1: 2026-06-26 · Cycle 2: 2026-06-26 · Client formal sign-off pending |
| **Environment** | Docker staging: http://localhost:3001 · API http://localhost:8000 |
| **Tenant** | Pulse Demo (`PULSE-DEMO`) |

### Summary result

UAT Cycle 1 (38 API scenarios) + Cycle 2 (52 scenarios) = **90/98 passed (91.8%)**. Zero failed product defects. Eight scenarios deferred (production HTTPS, backup drill, physical hardware). Regression gate green. **Recommendation: Pilot Go-Live Ready with Hardware Pending Conditions.**

### Passed / failed / blocked count

| Status | Cycle 1 | Cycle 2 | **Total** |
|--------|---------|---------|-----------|
| Passed | 38 | 52 | **90** |
| Failed | 0 | 0 | **0** |
| Blocked | 0 | 0 | **0** |
| Not run / deferred | 60 | 8 | **8** |
| **Total checklist** | 98 | — | **98** |

### Open defects

| Severity | Open count |
|----------|------------|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 0 |

---

## 3. Accepted limitations (v9.0.0-rc1)

1. **CSV bulk import** — Products and opening stock support API dry-run stubs only; full CSV persistence ships in v9.1 ([DATA_IMPORT_PLAN.md](./DATA_IMPORT_PLAN.md)).
2. **Payment integrations** — Card/mobile wallet are mock flows; live payment gateway is post-pilot.
3. **SMS / email** — Notification templates exist; production SMS provider configuration is client-specific.
4. **Hardware** — Printer, scale, and KOT depend on OS/browser; see [HARDWARE_INTEGRATION.md](./HARDWARE_INTEGRATION.md).
5. **Offline sync** — Operational via localStorage queue + API dedup; IndexedDB secondary queue informational only.
6. **Restaurant** — KOT fire and split bill are UI previews; backend table sale works.
7. **Sales returns UI** — Simplified buttons on Sales page; full line picker in v9.1.

---

## 4. Enhancement backlog

See [DEFECT_TRACKER_CYCLE1.md](./DEFECT_TRACKER_CYCLE1.md) — ENH-001 through ENH-003. Not blocking pilot go-live.

---

## 5. Go-live recommendation

### Classification: **Pilot Live — Hardware Conditions Accepted**

Software preparation complete. Client signatures, production HTTPS, credential rotation, and physical hardware forms remain before trading.

| Go criteria | Status |
|-------------|--------|
| No open Critical defects | Met |
| No open High defects affecting operation | Met |
| Core POS / purchase / return / refund | Met (live trial 12/12) |
| Backup script and runbook | Ready; prod cron pending |
| Client UI UAT | Met (90/98) |
| Offline sync | Met |
| Client sign-off | **Pending** |

**Sign-off statement:**

> The client accepts Pulse POS v9.0.0-rc1 for controlled pilot go-live, subject to documented limitations and hardware/integration conditions.

**Conditions before trading:**

1. [CREDENTIAL_ROTATION_RUNBOOK.md](./CREDENTIAL_ROTATION_RUNBOOK.md) on production server
2. `python scripts/prod_readiness_check.py` — all checks pass
3. [HARDWARE_VALIDATION_RECORD.md](./HARDWARE_VALIDATION_RECORD.md) completed
4. Signatures in Section 7 below

**No-Go triggers (none currently active):** Critical defect, data loss risk, inventory mismatch, tenant security issue, unstable deployment, or missing backup.

---

## 6. Release status labels

| Label | When |
|-------|------|
| Pilot Go-Live Ready (hardware pending) | UAT Cycle 2 |
| **Pilot Live — Hardware Conditions Accepted** | **Current** — ops framework ready; client production trading pending |
| Pilot Live | Client named users trading on production |
| Pilot Live — Hypercare | Active daily hypercare period |
| Pilot Stable | Reconcile balanced; no Critical/High |
| Production Ready with Conditions | Assessment with waivers |
| Production Ready | Full pilot exit + client acceptance |

---

## 7. Sign-off table

| Role | Name | Organization | Decision | Signature | Date |
|------|------|--------------|----------|-----------|------|
| Client business owner | | | Pilot Live (HW conditions) | | |
| Client IT representative | | | Pilot Live (HW conditions) | | |
| Implementation lead | | | Pilot Live (HW conditions) | | |
| Project manager | | | Pilot Live (HW conditions) | | |
| Support lead | | | Pilot Live (HW conditions) | | |
| QA lead | Engineering | Pulse Engineering | Pilot Live (HW conditions) | | 2026-06-26 |
| Engineering lead | | Pulse Engineering | Pilot Live (HW conditions) | | 2026-06-26 |

**Client UAT sign-off or conditional approval:** _Pending_

---

## 8. Verification commands (reference)

```powershell
docker compose up --build -d
python scripts/docker_smoke_test.py
python scripts/uat_cycle2_smoke.py
python scripts/live_trial_smoke.py
python scripts/prod_readiness_check.py --env-file .env
npm run build
npm run frontend:test
```

**Demo credentials (rotate before production):** `admin@pulse.pos` / `admin123` · `super@pulse.pos` / `super123`

---

*Package prepared: 2026-06-26 · Pulse POS v9.0.0-rc1*
