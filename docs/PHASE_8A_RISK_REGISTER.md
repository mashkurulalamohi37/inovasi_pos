# Phase 8A Risk Register

## P0 — blocks production immediately

| ID | Issue | Module | User impact | Technical | Fix | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| — | *None open after local PG concurrency + upgrade matrix GREEN* | — | — | — | — | Re-confirm on CI push |

If a P0 appears (auth outage, data corruption, oversell on PG), stop GA until fixed + tested.

## P1 — blocks broad GA / multi-replica rollout

| ID | Issue | Module | User impact | Technical | Fix | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| P1-1 | In-memory rate limit insufficient for multi-replica | Auth | Brute-force window × replicas | Shared limiter missing | Redis/`RATE_LIMIT_BACKEND` or gateway limits | Multi-instance load test |
| P1-2 | Restore drill not yet evidenced on target prod/staging | DR | Unproven recovery | Ops gap | Run `backup_restore_drill` + real `pg_restore` | PASS log + checklist |
| P1-3 | Full browser vertical UI E2E incomplete | E2E | UI regressions may slip | API smoke ≠ full UI | Expand Playwright P1 nightly | Nightly green |
| P1-4 | No measured peak load acceptance | Perf | Unknown degradation point | Scripts only | Run k6 Normal/Peak on PG staging | Recorded p95/error rate |
| P1-5 | Dependency scan advisory-only in CI | Security | Known CVEs may ship | `|| true` in workflow | Fail on critical after triage | Tuned gate |

## P2 — important improvement

| ID | Issue | Fix |
| --- | --- | --- |
| P2-1 | No Prometheus/OTel metrics exporter | Phase 8B metrics |
| P2-2 | Distributed tracing not instrumented | Phase 8B spans on sale/receive/return |
| P2-3 | Firefox/WebKit not in CI matrix | Add before broad browser claims |
| P2-4 | Offline/sync partial | Document + E2E network interruption suite |
| P2-5 | Audit log export backlog | Secure export design; do not ship insecure bulk export |
| P2-6 | File upload (prescription) deferred | Keep disabled until hardened |

## P3 — future enhancement

| ID | Issue |
| --- | --- |
| P3-1 | Blue/green automation beyond Compose |
| P3-2 | PITR continuous archiving for enterprise RPO |
| P3-3 | Mobile viewport full back-office coverage |
| P3-4 | Import / HR / Ecommerce / new verticals (explicitly out of 8A) |

## Residual honesty

- JWT logout may not fully revoke access tokens until expiry (document residual risk).
- Do not claim server-side revocation unless implemented.
- Do not claim offline readiness without tested interruption paths.
