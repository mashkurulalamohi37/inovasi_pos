# Daily Reconciliation Template — Pulse POS Pilot

Use at **end of each trading day** during pilot live / hypercare. Do not manually alter database to fix mismatches without approved incident procedure.

**Tenant:** ____________________  
**Date:** ____________________  
**Trading day #:** ____________________  
**Prepared by:** ____________________  
**Reviewed by (manager):** ____________________

---

## 1. Sales summary

| Metric | POS report | Payment summary | Match? | Variance | Notes |
|--------|------------|-----------------|--------|----------|-------|
| Total sales (count) | | | | | |
| Gross sales value | | | | | |
| Discount total | | | | | |
| Tax total | | | | | |
| Net sales value | | | | | |

**Source:** Reports → Sales summary · Payments → Summary

---

## 2. Payment collection

| Method | Expected (sales) | Collected | Match? | Variance |
|--------|------------------|-----------|--------|----------|
| Cash | | | | |
| Card | | | | |
| Mobile | | | | |
| Split / other | | | | |
| **Total collection** | | | | |

| Metric | Amount |
|--------|--------|
| Refund total | |
| Net collection (collection − refunds) | |

---

## 3. Cashier / counter breakdown

| Cashier | Counter | Sales count | Sales value | Cash | Card | Mobile | Refunds | Notes |
|---------|---------|-------------|-------------|------|------|--------|---------|-------|
| | | | | | | | | |
| | | | | | | | | |

---

## 4. Inventory movement (spot check)

| SKU | Opening (system) | Sales qty | Returns qty | Adjustments | Expected closing | System closing | Match? |
|-----|------------------|-----------|-------------|-------------|------------------|----------------|--------|
| | | | | | | | |
| | | | | | | | |

**Stock ledger:** verify sale, return, adjustment, purchase_receive entries for day.

---

## 5. Offline sync

| Metric | Value |
|--------|-------|
| Queued at EOD | |
| Synced today | |
| Failed / conflict | |
| Pending next day | |
| Duplicate invoices (should be 0) | |

---

## 6. Approvals & exceptions

| Type | Count | All resolved? | Notes |
|------|-------|---------------|-------|
| Refund approvals | | | |
| Purchase approvals | | | |
| Voids / returns | | | |
| Device blocks | | | |

---

## 7. Audit log spot check

| Action types verified | login · sale_create · receipt_reprint · refund · return · purchase_receive |
|-----------------------|-------------------------------------------------------------------------------|
| Missing expected audits? | Yes / No |
| Notes | |

---

## 8. Reconciliation outcome

| Outcome | Selected |
|---------|----------|
| **Balanced** — all totals match within tolerance | |
| **Variance** — investigate (log incident) | |
| **Blocked** — cannot reconcile (escalate Critical) | |

**Tolerance:** Define with client (e.g. ±0.01 per tender).

---

## 9. Sign-off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Cashier lead | | | |
| Store manager | | | |
| Finance / ops | | | |

---

**Related:** [PILOT_INCIDENT_REGISTER.md](./PILOT_INCIDENT_REGISTER.md) · [DAILY_HYPERCARE_REPORT_TEMPLATE.md](./DAILY_HYPERCARE_REPORT_TEMPLATE.md)
