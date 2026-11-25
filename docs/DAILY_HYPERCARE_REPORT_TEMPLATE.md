# Daily Hypercare Report Template — Pulse POS Pilot

Complete **once per trading day** during pilot live / hypercare period.

**Tenant:** ____________________  
**Report date:** ____________________  
**Trading day number:** ____________________  
**Prepared by:** ____________________  
**Distribution:** Client ops · IT · Engineering · Support

---

## 1. Day summary

| Metric | Value |
|--------|-------|
| Total transactions (sales) | |
| Total sales value (net) | |
| Active users | |
| Active counters / devices | |
| Failed POS attempts | |
| Offline sync issues | |

---

## 2. System health

| Check | Status | Notes |
|-------|--------|-------|
| API `/health` | Green / Amber / Red | |
| `/system/health` (DB) | | |
| Login success rate | | |
| Avg API response (subjective) | | |
| Backup last run | | |
| Backup file size / OK? | | |

---

## 3. Incidents

| Severity | New today | Open | Resolved today | Pending |
|----------|-----------|------|----------------|---------|
| Critical | | | | |
| High | | | | |
| Medium | | | | |
| Low | | | | |

**Reference:** [PILOT_INCIDENT_REGISTER.md](./PILOT_INCIDENT_REGISTER.md)

**Top issues today:**

1.
2.
3.

---

## 4. Reconciliation

| Item | Status |
|------|--------|
| Daily reconciliation completed | Yes / No |
| Balanced | Yes / No / Variance |
| Link to reconciliation | [DAILY_RECONCILIATION_TEMPLATE.md](./DAILY_RECONCILIATION_TEMPLATE.md) |

---

## 5. Hardware status

| Device | Status today | Issues |
|--------|--------------|--------|
| Barcode scanner | | |
| Receipt printer | | |
| Weight scale | | |
| Kitchen / KOT printer | | |
| Cash drawer | | |
| Serial scanner | | |

**Reference:** [HARDWARE_VALIDATION_RECORD.md](./HARDWARE_VALIDATION_RECORD.md)

---

## 6. Client feedback

| Stakeholder | Feedback | Action |
|-------------|----------|--------|
| | | |

---

## 7. Go-forward recommendation

| Recommendation | Notes |
|----------------|-------|
| Continue pilot | |
| Escalate incident(s) | |
| Schedule fix release | |
| Ready for production assessment | |

**Support contacts:** [PILOT_SUPPORT_PLAN.md](./PILOT_SUPPORT_PLAN.md)

---

## 8. Sign-off

| Role | Name | Date |
|------|------|------|
| Support lead | | |
| Implementation lead | | |
| Client ops (optional) | | |

---

## Day 0 — Staging baseline (engineering)

| Metric | Value |
|--------|-------|
| Date | 2026-06-26 |
| Label | Pilot Live — Hardware Conditions Accepted |
| Smoke tests | 11/11 docker · 12/12 live trial |
| Open Critical/High | 0 |
| Notes | Awaiting client production deploy and first live trading day |
