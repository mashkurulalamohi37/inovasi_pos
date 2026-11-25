# UAT Execution Report — Cycle 1

Completed execution record for [PILOT_UAT_CHECKLIST.md](./PILOT_UAT_CHECKLIST.md). Engineering-led automated and Docker verification on 2026-06-26; client UI/hardware session pending sign-off.

---

## 1. Test summary

| Field | Value |
|-------|-------|
| **UAT cycle** | Cycle 1 — Engineering RC verification |
| **Client / tenant** | Pulse Demo (`PULSE-DEMO`) |
| **Environment URL** | http://localhost:3001/login (Docker) · API http://localhost:8000 |
| **Build version** | v9.0.0-rc1 |
| **Test window** | Start: 2026-06-26 · End: 2026-06-26 (Day 1) |
| **Lead tester** | Engineering QA |
| **Participants** | Automated API suite, Docker smoke, regression gate |

### Scope

- [x] Section A — Super Admin (API automated)
- [x] Section B — Tenant Admin (API automated + partial UI)
- [x] Section C — POS (API: grocery, pharmacy, fashion, electronics, beef; UI pending client)
- [x] Section D — Inventory & Purchase (API automated)
- [x] Section E — Sales Return & Refund (refund approval API; full return UI pending)
- [x] Section F — Security (API automated subset)
- [x] Section G — Reports & Audit (API automated)
- [ ] Section H — Offline Sync (client browser session required)

### Results overview

| Metric | Count |
|--------|-------|
| Total checklist scenarios | 98 |
| **Executed** | 38 |
| **Passed** | 38 |
| **Failed** | 0 |
| **Blocked** | 0 |
| **Not run** | 60 |
| Pass rate (passed / executed) | 100% |

**Status key:** Pass · Fail · Block · N/A

---

## 2. Passed / failed / blocked detail

### Passed (automated and smoke — highlights)

| Test ID | Scenario | Tester | Date | Notes |
|---------|----------|--------|------|-------|
| SA-01 | Platform admin login | API auto | 2026-06-26 | `test_uat_sa01_super_admin_login` |
| SA-02 | List tenants | API auto | 2026-06-26 | PULSE-DEMO visible |
| SA-03 | Suspend tenant | API auto | 2026-06-26 | Suspend + audit |
| SA-04 | Suspended tenant login blocked | API auto | 2026-06-26 | 403 on admin login |
| SA-05 | Reactivate tenant | API auto | 2026-06-26 | Login restored |
| SA-06 | Subscription plans | API auto | 2026-06-26 | starter, enterprise listed |
| SA-09 | Support impersonation start | API auto | 2026-06-26 | Start + end session |
| SA-10 | Support impersonation end | API auto | 2026-06-26 | Session closed |
| TA-01 | Tenant admin login | API auto | 2026-06-26 | Role Admin |
| TA-09 | Approve device | API auto | 2026-06-26 | Device approved |
| TA-14 | Health check | API auto | 2026-06-26 | DB connected |
| POS-G01 | Grocery cash sale | API auto | 2026-06-26 | Invoice + stock |
| POS-P01 | Pharmacy batch sale | API auto | 2026-06-26 | FEFO batch_id on line |
| POS-F01 | Fashion variant sale | API auto | 2026-06-26 | FASH-001 sale |
| POS-E01 | Electronics serial sale | API auto | 2026-06-26 | Serial SN12345678901234 |
| POS-B01 | Beef shop cut sale | API auto | 2026-06-26 | BEEF-001 sale |
| POS-07 | Idempotent sale | API auto | 2026-06-26 | Duplicate flag true |
| INV-01 | Product create | API auto | 2026-06-26 | UAT-SKU created |
| PUR-02 | Approve PO | API auto | 2026-06-26 | Status APPROVED |
| PUR-03 | Cashier cannot approve PO | API auto | 2026-06-26 | 403 |
| PUR-04 | Receive GRN | API auto | 2026-06-26 | purchase RECEIVED |
| REF-02 | Cashier refund approval | API auto | 2026-06-26 | 202 → manager approve |
| SEC-08 | RBAC cashier denied | API auto | 2026-06-26 | 403 on pack toggle |
| SEC-09 | Tenant isolation | API auto | 2026-06-26 | OTHER-1 not visible |
| REP-01 | Daily sales summary | API auto | 2026-06-26 | 200 OK |
| AUD-01 | Audit log list | API auto | 2026-06-26 | 200 OK |
| — | Docker smoke (11 checks) | Docker smoke | 2026-06-26 | Health, login, sale INV-001003 |
| — | Import dry run products | API auto | 2026-06-26 | dry_run true |
| — | Import dry run opening stock | API auto | 2026-06-26 | dry_run true |

### Failed

| Test ID | Scenario | Expected | Actual | Defect ID | Tester | Date |
|---------|----------|----------|--------|-----------|--------|------|
| — | — | — | — | — | — | — |

### Blocked

| Test ID | Scenario | Blocker | Owner | ETA unblock |
|---------|----------|---------|-------|-------------|
| — | — | — | — | — |

### Not run (pending client session)

Remaining checklist items (60): UI navigation (SA-07, SA-08, SA-11, TA-02–TA-08, TA-10–TA-13, TA-15), POS UI flows (POS-G02–G03, P02, R01, J01, U01, POS-02–06), inventory UI (INV-02–06, PUR-01, PUR-05–07), returns UI (RET-01–03, REF-01, REF-03–05), security browser tests (SEC-01–07, SEC-10–14), report UI (REP-02–06, AUD-02–05), offline sync (SYNC-01–08). Scheduled for client UAT Day 2–3.

---

## 3. Defect list

See [DEFECT_TRACKER_CYCLE1.md](./DEFECT_TRACKER_CYCLE1.md).

| Defect ID | Module | Severity | Priority | Summary | Status | Fix version |
|-----------|--------|----------|----------|---------|--------|-------------|
| — | — | — | — | No open product defects | — | — |

### Severity summary

| Severity | Open | Fixed | Closed |
|----------|------|-------|--------|
| Critical | 0 | 0 | 0 |
| High | 0 | 0 | 0 |
| Medium | 0 | 0 | 0 |
| Low | 0 | 0 | 0 |

**Test harness fixes (not product defects):** UAT automated tests corrected for PHRM-001 SKU, seeded electronics serial, and GRN response shape — see DEF-TRACK-001–003 in defect tracker (Closed).

---

## 4. Data import dry run

Per [DATA_IMPORT_PLAN.md](./DATA_IMPORT_PLAN.md) and `docs/samples/*.csv`:

| Module | Method | Result | Notes |
|--------|--------|--------|-------|
| Products | `POST /import/products` dry_run | Pass | Invalid rows rejected in stub validation; audit path verified |
| Opening stock | `POST /import/opening-stock` dry_run | Pass | GROC-001 row accepted in dry run |
| Suppliers | Manual UI (pilot) | Not run | v9.1 CSV API |
| Customers | Manual UI (pilot) | Not run | v9.1 CSV API |
| Pharmacy batches | Manual UI | Covered by seed + POS-P01 API |
| Fashion variants | Manual UI | Covered by seed + POS-F01 API |
| Electronics serials | Manual UI | Covered by seed + POS-E01 API |

---

## 5. Regression gate evidence (2026-06-26)

| Gate | Result |
|------|--------|
| `npm run build` | Pass |
| Backend pytest | 101 passed |
| `npm run frontend:test` | 48 passed |
| `docker compose up --build -d` | Healthy |
| `python scripts/docker_smoke_test.py` | 11/11 PASS |

---

## 6. Client comments

| Date | Stakeholder | Role | Comment |
|------|-------------|------|---------|
| 2026-06-26 | Engineering | QA | Cycle 1 automated UAT complete; no release-blocking defects |

### Open questions / change requests

| ID | Description | Impact | Decision |
|----|-------------|--------|----------|
| ENH-001 | Full CSV bulk import (suppliers, customers, batches) | Medium | Deferred to v9.1 backlog |
| ENH-002 | Restaurant/Jewelry POS UI walkthrough | Low | Client UAT Day 2 |

---

## 7. Go / no-go recommendation

| Criterion | Met? | Evidence |
|-----------|------|----------|
| Critical defects = 0 (or waived) | Yes | Defect tracker |
| Core POS flows pass (cash sale, stock, receipt) | Yes | API + Docker smoke sale |
| Security scenarios SEC-08, SEC-09 pass | Yes | Automated tests |
| Backup and restore verified on staging | Partial | Documented in BACKUP_RESTORE.md; client prod drill pending |
| Pilot support plan acknowledged | Yes | PILOT_SUPPORT_PLAN.md |
| Data import / opening stock complete | Partial | Dry run pass; live import at go-live |

### Recommendation

- [ ] **Go** — Approve pilot go-live
- [x] **Conditional go** — Proceed after client UI UAT (60 scenarios) and go-live checklist Section A/C
- [ ] **No-go**

**Waivers / conditions:**

1. Client completes Sections C (POS UI), H (offline sync), and hardware checks before first live trading day.
2. Production backup restore drill within 90 days of go-live per PILOT_GO_LIVE_CHECKLIST.

### Sign-off

| Role | Name | Decision | Signature | Date |
|------|------|----------|-----------|------|
| Client product owner | _Pending_ | — | | |
| Pilot tenant admin | _Pending_ | — | | |
| QA lead | Engineering | Conditional go | | 2026-06-26 |
| Engineering | Engineering | Conditional go | | 2026-06-26 |

---

**Related:** [UAT_SIGNOFF_PACKAGE.md](./UAT_SIGNOFF_PACKAGE.md) · [PILOT_GO_LIVE_CHECKLIST.md](./PILOT_GO_LIVE_CHECKLIST.md) · [PILOT_SUPPORT_PLAN.md](./PILOT_SUPPORT_PLAN.md)
