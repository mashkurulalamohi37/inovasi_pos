# First Day Live Transaction Checklist

Complete on **first real trading day** after production go-live. Record invoice numbers and evidence in [PILOT_LIVE_DAY_LOG.md](./PILOT_LIVE_DAY_LOG.md).

**Tenant:** ____________________  
**Date:** ____________________  
**Store:** ____________________  
**Lead cashier:** ____________________

---

## Pre-open

- [ ] Named user login (not seed email)
- [ ] Device registered and approved
- [ ] Opening stock verified in inventory
- [ ] Receipt template / branding correct
- [ ] Payment methods enabled
- [ ] Manager on-site for approvals

---

## First transactions (check each)

| # | Step | Done | Invoice / ref | Verified |
|---|------|------|---------------|----------|
| 1 | First successful login | | User: | |
| 2 | First product search | | SKU: | |
| 3 | First POS sale | | INV: | |
| 4 | First payment recorded | | Tender: | Amount matches sale |
| 5 | First receipt print/preview | | | Layout OK |
| 6 | Inventory deducted | | SKU qty before/after | |
| 7 | Stock ledger entry | | transaction_type: sale | |
| 8 | Sales report updated | | Report total | |
| 9 | Audit log entry | | action: sale | |
| 10 | First refund/return (if applicable) | | | |
| 11 | End-of-day reconciliation started | | Link to daily recon | |

---

## Per-sale verification (first 5 live sales)

For each sale, confirm:

| Sale # | Invoice | Payment = total? | Stock OK? | Ledger? | Receipt OK? | Report? | Audit? |
|--------|---------|------------------|-----------|---------|-------------|---------|--------|
| 1 | | | | | | | |
| 2 | | | | | | | |
| 3 | | | | | | | |
| 4 | | | | | | | |
| 5 | | | | | | | |

---

## Sign-off

| Role | Name | Date |
|------|------|------|
| Store manager | | |
| Implementation observer | | |

---

**If any step fails:** Log incident in [PILOT_INCIDENT_REGISTER.md](./PILOT_INCIDENT_REGISTER.md) — do not proceed with mass trading until Critical/High resolved or workaround approved.
