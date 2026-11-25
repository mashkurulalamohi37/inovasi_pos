# Pilot Support Plan — Pulse POS Phase 10

Operational support model for the first **4 weeks** after pilot go-live. Customize placeholders before sharing with the client.

**Tenant:** ____________________  
**Go-live date:** ____________________  
**Support window:** ____________________ to ____________________

---

## Support window

| Period | Coverage | Hours (local) | Channel |
|--------|----------|---------------|---------|
| Week 1 (hypercare) | Engineering + support on-call | __________ | Phone, WhatsApp, email |
| Weeks 2–4 (stabilization) | Business hours support | __________ | Email, ticket portal |
| After week 4 | Standard SLA | Per contract | Ticket portal |

**Blackout / holiday coverage:** ____________________

---

## Escalation matrix

| Level | Role | Responsibility | Contact |
|-------|------|----------------|---------|
| L1 | Client store manager | First-line user issues, restart browser, verify network | ____________________ |
| L2 | Pulse support | Configuration, training, defect triage | ____________________ |
| L3 | Pulse engineering | Bugs, data fixes, rollback | ____________________ |
| L4 | Product / leadership | Go/no-go, major incident, client escalation | ____________________ |

### Escalation triggers

- Any **Critical** defect (see severity below)
- Multiple stores unable to complete sales &gt; 15 minutes
- Suspected data corruption or security incident
- Backup failure on two consecutive days

---

## Severity definitions

| Severity | Examples | Business impact |
|----------|----------|-----------------|
| **S1 — Critical** | Cannot sell, wrong stock totals at scale, auth bypass, DB down | Store stopped |
| **S2 — High** | Industry pack broken, sync failures blocking EOD, printer failure on all lanes | Major degradation |
| **S3 — Medium** | Single report wrong, non-blocking UI bug, one device issue | Workaround exists |
| **S4 — Low** | Cosmetic, documentation, feature request | Minimal |

---

## Response targets (pilot)

| Severity | Initial response | Workaround target | Resolution target |
|----------|------------------|-------------------|-------------------|
| S1 | 15 minutes | 1 hour | 4 hours (or rollback) |
| S2 | 30 minutes | 4 hours | 1 business day |
| S3 | 4 hours | 2 business days | Next patch |
| S4 | 1 business day | N/A | Backlog |

*Response = acknowledgment and triage assigned. Resolution = fix deployed or accepted workaround documented.*

---

## Daily monitoring (week 1)

Engineering or support performs each business morning:

| Check | Action | Owner |
|-------|--------|-------|
| API health | `GET /api/v1/system/health` — all components green | |
| Error rate | Review 5xx and failed login spikes | |
| Sync queue | Tenant Sync Center — pending/failed count | |
| Disk / DB | PostgreSQL volume usage &lt; 80% | |
| Open defects | Review [DEFECT_TRACKER_TEMPLATE.md](./DEFECT_TRACKER_TEMPLATE.md) P1/P2 | |
| Client check-in | 10-min standup with store manager (optional week 1) | |

Log results in daily support notes (date, checker, anomalies).

---

## Backup check

| Task | Frequency | Procedure |
|------|-----------|-----------|
| Automated backup success | Daily | Verify backup job notification or cron log |
| Manual backup before go-live | Once | Run [scripts/backup_postgres.sh](../scripts/backup_postgres.sh) |
| Restore spot test | Before go-live + week 2 | Restore to staging per [BACKUP_RESTORE.md](./BACKUP_RESTORE.md) |
| Pre-change backup | Before any prod data fix | Full DB dump + ticket reference |

**Backup contact:** ____________________  
**Last verified restore date:** ____________________

---

## End-of-day (EOD) reconciliation

Client manager completes; L2 support available for discrepancies.

1. Run daily sales summary report; compare to cash/card totals.
2. Verify no stuck **pending sync** sales (Section H UAT scenarios).
3. Review inventory movements for unexpected negative stock.
4. Confirm purchase approvals processed.
5. Log discrepancies as defects with amounts and invoice IDs.

| Date | Cash expected | Cash actual | Variance | Sync pending | Signed |
|------|---------------|-------------|----------|--------------|--------|
| | | | | | |

---

## Rollback procedure

Use when S1 issue cannot be resolved within resolution target or data integrity is at risk.

1. **Stop** new sales if totals or stock are unreliable (communicate to client).
2. **Assess:** application-only regression vs. database corruption.
3. **Application rollback:** redeploy previous Docker image tags (no DB restore).
4. **Database rollback:** restore from last known-good backup per [BACKUP_RESTORE.md](./BACKUP_RESTORE.md) — **client sign-off required**.
5. Document incident timeline; update [UAT_EXECUTION_REPORT_TEMPLATE.md](./UAT_EXECUTION_REPORT_TEMPLATE.md) if go-live reversed.

**Rollback decision authority:** L4 (Product / leadership) + client product owner.

---

## Emergency contacts (placeholders)

| Role | Name | Phone | Email | Time zone |
|------|------|-------|-------|-----------|
| Client store manager (L1) | | | | |
| Client IT | | | | |
| Pulse support lead (L2) | | | | |
| Pulse engineering on-call (L3) | | | | |
| Product owner (L4) | | | | |

**Incident bridge / war room:** ____________________  
**Status page (if any):** ____________________

---

## Related documentation

| Document | Use |
|----------|-----|
| [PILOT_GO_LIVE_CHECKLIST.md](./PILOT_GO_LIVE_CHECKLIST.md) | Pre go-live gate |
| [DEFECT_TRACKER_TEMPLATE.md](./DEFECT_TRACKER_TEMPLATE.md) | Log and track issues |
| [PILOT_DEPLOYMENT.md](./PILOT_DEPLOYMENT.md) | Rollback and redeploy |
| [DATA_IMPORT_PLAN.md](./DATA_IMPORT_PLAN.md) | Data-related incidents |
