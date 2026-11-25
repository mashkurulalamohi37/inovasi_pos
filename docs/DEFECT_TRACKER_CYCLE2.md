# Defect Tracker — Cycle 2 (v9.0.0-rc1)

Cycle 2 UAT findings. **No open product defects.**

**Related:** [UAT_EXECUTION_REPORT_CYCLE2.md](./UAT_EXECUTION_REPORT_CYCLE2.md) · [DEFECT_TRACKER_CYCLE1.md](./DEFECT_TRACKER_CYCLE1.md)

---

## Product defect log

| Defect ID | Module | Severity | Status | Summary |
|-----------|--------|----------|--------|---------|
| — | — | — | — | No product defects logged in Cycle 2 |

---

## Cycle 2 findings — classified (not defects)

| ID | Type | Area | Summary | Decision |
|----|------|------|---------|----------|
| CFG-001 | Configuration | Offline sync | IndexedDB queue not wired from POS; localStorage queue is operational path | Training: use App queue in Sync Center |
| ENH-004 | Enhancement | Restaurant | KOT fire uses local mock; no UI call to `POST /industry/restaurant/kot` | Backlog v9.1 |
| ENH-005 | Enhancement | Restaurant | Split bill shows estimate only; no partial invoices | Backlog v9.1 |
| ENH-006 | Enhancement | Sales UI | `app.sales.tsx` return/exchange without line picker | Backlog v9.1; API works |
| ENH-007 | Enhancement | Fashion | `/app/fashion/exchange` page stub | Use Sales API or POS |
| ENH-008 | Enhancement | Electronics RMA | POS RMA form → localStorage only | Use return API in Live mode |
| OOS-001 | Out of scope | Hardware | Cash drawer kick, ESC/POS direct, fiscal printer | Per HARDWARE_INTEGRATION.md |
| OOS-002 | Out of scope | Grocery | `grocery.scale` flag without scale UI | Not in pilot grocery scope |
| TRN-001 | Training | Demo vs Live | Demo offline sync simulates conflicts; use Live for SYNC-05 | PILOT_UAT_CHECKLIST note |
| DEP-001 | Deployment | Environment | HTTPS, domain, backup cron require production deploy | PILOT_GO_LIVE_CHECKLIST A |

---

## Enhancement backlog (consolidated)

| ID | Summary | Target |
|----|---------|--------|
| ENH-001 | Full CSV import | v9.1 |
| ENH-004 | Restaurant KOT API integration in POS | v9.1 |
| ENH-005 | Restaurant split bill with partial payments | v9.1 |
| ENH-006 | Sales UI line-level return/refund/exchange | v9.1 |
| ENH-007 | Fashion exchange back office page | v9.1 |
| ENH-008 | Electronics RMA → backend API from POS | v9.1 |

---

## Retest log

| Item | Date | Result | Notes |
|------|------|--------|-------|
| Cycle 2 smoke script | 2026-06-26 | Pass | 11/11 |
| Return/refund pytest suite | 2026-06-26 | Pass | 60 tests in ops+industry+client_uat |
| Offline sync frontend tests | 2026-06-26 | Pass | sync-center.test.ts |
