# Pilot Live Day Log — Pulse POS v9.0.0-rc1

Operational log for the first live trading day(s). Complete one row per notable event.

**Tenant:** Pulse Demo (staging) / _Client tenant_  
**Go-live date:** _Pending client production_  
**Environment:** Staging http://localhost:3001 · Production _pending_  
**Support lead:** ____________________  
**Status label:** Pilot Live — Hardware Conditions Accepted

**Related ops hub:** [PILOT_LIVE_OPERATIONS.md](./PILOT_LIVE_OPERATIONS.md)

---

## Monitoring checklist (first day)

| Area | Check | Owner | Time | OK? |
|------|-------|-------|------|-----|
| Login | Admin/cashier login success rate | Support | | |
| POS | Sale completion rate by industry | Support | | |
| Sync | Offline queue / Sync Center failures | Support | | |
| Payments | Cash vs card totals vs sales | Ops | | |
| Stock | Spot-check 5 SKUs after sales | Inventory | | |
| Receipts | Print/preview failures | Store | | |
| Devices | Blocked/unapproved device errors | IT | | |
| Refunds | Approval queue backlog | Manager | | |
| API | `/health` and `/system/health` | Engineering | | |
| Database | Connection / latency | Engineering | | |
| Backup | Nightly backup completed | DevOps | | |

---

## Event log

| Time | Store | Module | Event | User | Counter | Issue / observation | Severity | Action taken | Owner | Status | Remarks |
|------|-------|--------|-------|------|---------|---------------------|----------|--------------|-------|--------|---------|
| 2026-06-26 | Staging | Ops | Day 0 smoke verification | Engineering | — | All automated gates pass | Info | Record baseline | Engineering | Closed | Awaiting client live day |
| | | | | | | | | | | | |

**Severity:** Critical · High · Medium · Low · Info  
**Status:** Open · In progress · Resolved · Deferred

---

## End-of-day summary

| Metric | Value |
|--------|-------|
| Total sales (count) | |
| Failed sales / sync | |
| Open incidents | |
| Critical/High open | |
| Backup verified | Yes / No |
| Sign-off for Day 1 | |

**Notes:**

---

**Related:** [PILOT_SUPPORT_PLAN.md](./PILOT_SUPPORT_PLAN.md) · [PILOT_GO_LIVE_EXECUTION.md](./PILOT_GO_LIVE_EXECUTION.md) · [FIRST_DAY_LIVE_CHECKLIST.md](./FIRST_DAY_LIVE_CHECKLIST.md)
