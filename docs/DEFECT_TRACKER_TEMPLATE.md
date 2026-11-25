# Defect Tracker — Pulse POS Phase 10

Use one row per defect found during UAT or pilot support. Copy the table into a spreadsheet or issue tracker.

**Related:** [UAT_EXECUTION_REPORT_TEMPLATE.md](./UAT_EXECUTION_REPORT_TEMPLATE.md) · [PILOT_UAT_CHECKLIST.md](./PILOT_UAT_CHECKLIST.md)

---

## Severity definitions

| Severity | Definition |
|----------|------------|
| **Critical** | Data loss, security breach, cannot complete sales, or full module unusable |
| **High** | Major function broken; no acceptable workaround |
| **Medium** | Function impaired; workaround exists |
| **Low** | Cosmetic, typo, minor UX issue |

## Priority definitions

| Priority | Definition |
|----------|------------|
| **P1** | Fix before go-live |
| **P2** | Fix in first pilot week |
| **P3** | Fix in next release |
| **P4** | Backlog |

---

## Defect log

| Defect ID | Module | Scenario | Severity | Priority | Steps to reproduce | Expected result | Actual result | Screenshot / evidence | Assigned | Status | Fix version | Retest |
|-----------|--------|----------|----------|----------|-------------------|-----------------|----------------|----------------------|----------|--------|-------------|--------|
| DEF-001 | | | | | | | | | | Open | | |
| DEF-002 | | | | | | | | | | | | |
| DEF-003 | | | | | | | | | | | | |
| DEF-004 | | | | | | | | | | | | |
| DEF-005 | | | | | | | | | | | | |

### Status values

`Open` · `In progress` · `Fixed` · `Retest` · `Closed` · `Won't fix` · `Deferred`

---

## Module reference (for Module column)

| Code | Area |
|------|------|
| Platform | Super admin, tenants, subscriptions |
| Config | Tenant admin, packs, flags, devices |
| POS | Industry POS screens |
| Inventory | Stock, ledger, adjustments |
| Purchase | PO, GRN, suppliers |
| Returns | Sales return, refund |
| Reports | Sales, margin, industry reports |
| Security | Auth, RBAC, device control |
| Sync | Offline queue, Sync Center |
| Import | CSV / API import |

---

## Retest log (optional)

| Defect ID | Fix build | Retest date | Retester | Result | Notes |
|-----------|-----------|-------------|----------|--------|-------|
| | | | | Pass / Fail | |
