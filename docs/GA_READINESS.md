# GA Readiness Matrix (Phase 8B update)

Status: **CONDITIONAL GO** — see [PHASE_8B_FINAL_REPORT.md](./PHASE_8B_FINAL_REPORT.md)

## Fashion edition (Phase 7)

Fashion / Garments release label: **`Pilot / Conditional GA`** until remote CI + production backup/monitoring evidence land.  
Feature gates (Phases 1–7) are documented in [FASHION_POS_SCOPE.md](./FASHION_POS_SCOPE.md) § Fashion edition production gates.

| Fashion area | Status | Evidence |
| --- | --- | --- |
| Catalog / matrix / PO→GRN / POS / returns | GREEN | Fashion pytest suite |
| Reports + dashboard KPIs | GREEN | Phase 6 |
| RBAC `fashion.*` | GREEN | Phase 6 |
| Products/suppliers/customers/opening/fashion-variants import | GREEN | Phase 7 / 7B |
| Offer CRUD | GREEN | Phase 7 |
| Fashion sale API smoke | GREEN | `e2e/fashion-pos-sale.spec.ts` |
| Local gate `scripts/fashion_ga_gate.py` | GREEN | Local only |
| CI `pytest -m fashion` | GREEN (local) | Workflow step; **remote run pending** |
| Offline | Mode A | Online-only for Fashion production |
| Backup / observability | Platform | [BACKUP_AND_DR.md](./BACKUP_AND_DR.md), [OBSERVABILITY.md](./OBSERVABILITY.md) |

| Area | Status | Evidence | Remaining Risk | Blocker? |
| --- | --- | --- | --- | --- |
| Backend unit | GREEN | 366+ local | Remote CI | Soft |
| Frontend unit | GREEN | 137 | — | No |
| Integration | GREEN | 37 | — | No |
| PostgreSQL | GREEN | 22 | Remote CI | Soft |
| Concurrency | GREEN | PG suite | — | No |
| Migration | GREEN | fresh + matrix | — | No |
| Playwright smoke | GREEN | API @smoke | — | No |
| Full critical UI E2E | YELLOW | Login+reload+verticals PASS; grocery UI sale residual | Pack enable / cart | Soft |
| Failure-path E2E | GREEN | 409/401 API | — | No |
| Browser compatibility | YELLOW | Chromium only | FF/WebKit | Soft |
| Mobile viewport | YELLOW | Not measured | — | Soft |
| Offline | YELLOW | Partial | — | Soft |
| Security | YELLOW | Suites + npm critical 0 | pip-audit triage remote | Soft |
| Tenant isolation | GREEN | Expanded suite | — | No |
| RBAC | GREEN | Suite | — | No |
| Rate limiting | GREEN* | Redis implemented | *memory = single replica | Topology |
| Performance | GREEN | Measured smoke | Peak | Soft |
| Load | GREEN | 72 req, 0% err | — | No |
| DB pool | GREEN | Docs + defaults | — | No |
| Slow queries | YELLOW | Checklist | Deep EXPLAIN | Soft |
| Backup | GREEN | Off-host PASS | Prod schedule | Soft |
| Restore | GREEN | 13.5s drill | — | No |
| Observability | YELLOW | /metrics | Full dashboards | Soft |
| Alerting | YELLOW | Spec | Wired alerts | Soft |
| CI/CD | YELLOW | Jobs defined | **Remote not run** | **Yes for GA GO** |
| Deployment/Rollback | YELLOW | Runbooks | Live drill | Soft |
| Secrets | GREEN | Guards | — | No |
| Documentation | GREEN | 8B report | — | No |
