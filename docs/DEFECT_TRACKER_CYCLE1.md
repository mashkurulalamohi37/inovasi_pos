# Defect Tracker — Cycle 1 (v9.0.0-rc1)

UAT and RC stabilization defects. Product defects: **none open**.

**Related:** [UAT_EXECUTION_REPORT_CYCLE1.md](./UAT_EXECUTION_REPORT_CYCLE1.md) · [PILOT_UAT_CHECKLIST.md](./PILOT_UAT_CHECKLIST.md)

---

## Severity definitions

| Severity | Definition |
|----------|------------|
| **Critical** | Data loss, security breach, cannot complete sales, or full module unusable |
| **High** | Major function broken; no acceptable workaround |
| **Medium** | Function impaired; workaround exists |
| **Low** | Cosmetic, typo, minor UX issue |

---

## Defect log

| Defect ID | Module | Scenario | Severity | Priority | Steps to reproduce | Expected result | Actual result | Evidence | Assigned | Status | Fix version | Retest |
|-----------|--------|----------|----------|----------|-------------------|-----------------|----------------|----------|----------|--------|-------------|--------|
| DEF-TRACK-001 | Test harness | POS-P01 API | Low | P4 | Run `test_client_uat.py` with SKU PHARM-001 | Pharmacy sale passes | Product not found | pytest | Engineering | Closed | — | Pass |
| DEF-TRACK-002 | Test harness | POS-E01 API | Low | P4 | Run UAT test with random serial | Sale with seeded serial | Serial not found | pytest | Engineering | Closed | — | Pass |
| DEF-TRACK-003 | Test harness | PUR-04 API | Low | P4 | Assert `received["status"]` | Check purchase status | KeyError on response shape | pytest | Engineering | Closed | — | Pass |

### Fix notes (test harness only — not shipped to production)

**DEF-TRACK-001**

- Root cause: Seed SKU is `PHRM-001`, not `PHARM-001`; pharmacy requires FEFO `batch_id`.
- Files changed: `backend/tests/test_client_uat.py`
- Fix summary: Use PHRM-001 and `/industry/pharmacy/fefo/{id}` for batch meta.
- Test added/updated: `test_uat_pos_p01_pharmacy_sale`
- Retest: `pytest tests/test_client_uat.py::test_uat_pos_p01_pharmacy_sale`
- Risk level: None (test only)

**DEF-TRACK-002**

- Root cause: Random serial not registered in `ElectronicsSerialStock`.
- Files changed: `backend/tests/test_client_uat.py`
- Fix summary: Use seeded serial `SN12345678901234`.
- Test added/updated: `_sale_for_pack` electronics branch
- Retest: `pytest tests/test_client_uat.py::test_uat_pos_e01_electronics_sale`
- Risk level: None (test only)

**DEF-TRACK-003**

- Root cause: `receive_purchase` returns `{receive_id, receive_no, purchase}` not top-level `status`.
- Files changed: `backend/tests/test_client_uat.py`
- Fix summary: Assert `received["purchase"]["status"]`.
- Test added/updated: `test_uat_pur02_04_purchase_receive`
- Retest: `pytest tests/test_client_uat.py::test_uat_pur02_04_purchase_receive`
- Risk level: None (test only)

---

## Enhancement backlog (not defects)

| ID | Module | Summary | Priority | Target |
|----|--------|---------|----------|--------|
| ENH-001 | Import | Full CSV import for suppliers, customers, batches, serials | P2 | v9.1 |
| ENH-002 | Reports | PDF export for all report types | P3 | Backlog |
| ENH-003 | POS | Hold/resume sale UI polish | P3 | Backlog |

---

## Retest log

| Defect ID | Fix build | Retest date | Retester | Result | Notes |
|-----------|-----------|-------------|----------|--------|-------|
| DEF-TRACK-001 | rc1-test-fix | 2026-06-26 | Engineering | Pass | 24/24 client UAT tests |
| DEF-TRACK-002 | rc1-test-fix | 2026-06-26 | Engineering | Pass | |
| DEF-TRACK-003 | rc1-test-fix | 2026-06-26 | Engineering | Pass | |
