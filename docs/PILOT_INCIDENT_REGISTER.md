# Pilot Incident Register — Pulse POS v9.0.0-rc1

Log all live pilot incidents. **Enhancement requests** go to enhancement backlog, not this register.

**Related:** [PILOT_LIVE_DAY_LOG.md](./PILOT_LIVE_DAY_LOG.md) · [DEFECT_TRACKER_CYCLE2.md](./DEFECT_TRACKER_CYCLE2.md)

---

## Severity definitions

| Severity | Examples |
|----------|----------|
| **Critical** | Cannot complete sale; payment mismatch; inventory corruption; tenant data leak; system down; data loss |
| **High** | Refund/return blocked; reports materially wrong; hardware blocks operation; cannot login; sync duplicates |
| **Medium** | Workaround exists; non-critical report issue; speed/UX impact |
| **Low** | Cosmetic; wording; enhancement disguised as bug |

---

## Incident log

| Incident ID | Date/time | Reported by | Module | Severity | Business impact | Steps to reproduce | Root cause | Immediate workaround | Permanent fix | Owner | Status | Retest | Client acceptance |
|-------------|-----------|-------------|--------|----------|-----------------|-------------------|------------|----------------------|---------------|-------|--------|--------|-------------------|
| INC-000 | — | — | — | — | No open incidents | — | — | — | — | — | — | — | — |

### Status values

`Open` · `Investigating` · `Workaround` · `Fix deployed` · `Retest` · `Closed` · `Deferred`

---

## Pilot fix rules (summary)

| Fix now | Defer |
|---------|-------|
| Critical / High operational | Cosmetic / Low |
| Data integrity / security | Enhancement requests |
| | Non-blocking preferences |

**After each fix:** reproduce → root cause → test → smallest fix → regression → update this register → client retest.

---

## Staging baseline (pre-live)

| Check | Date | Result |
|-------|------|--------|
| Docker smoke | 2026-06-26 | 11/11 PASS |
| Live trial smoke | 2026-06-26 | 12/12 PASS (after serial receive fix) |
| Open Critical/High | 2026-06-26 | 0 |

---

## Retest log

| Incident ID | Fix version | Retest date | Retester | Result | Notes |
|-------------|-------------|-------------|----------|--------|-------|
| | | | | Pass / Fail | |
