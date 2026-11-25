# Incident Runbook (Phase 8A)

## Severity

| Sev | Definition | Example |
| --- | --- | --- |
| P0 | Store cannot sell / pay / authenticate | DB down, auth outage, mass 5xx |
| P1 | Major degradation | High latency, intermittent stock conflicts, backup failure |
| P2 | Limited impact | Single tenant issue, non-critical feature |
| P3 | Minor / cosmetic | UI polish, docs |

## First response

1. Acknowledge severity and owner.
2. Check `/health/live` and `/health/ready`.
3. Capture recent deploy version / migration head.
4. Pull logs filtered by `request_id` / `error_category`.
5. Contain: rate-limit abusive clients, disable broken feature flag if available, scale or restart only if safe.

## Correlation

Every API response includes `X-Request-ID`. Ask the user/cashier for the ID from failed network responses or support UI. Search structured logs for `request_id=…` and `error_category=…`.

Do **not** ask users for passwords, JWTs, or card data.

## Containment / recovery

| Symptom | Containment | Recovery |
| --- | --- | --- |
| DB unavailable | Stop writers; fail ready | Restore connectivity / failover; verify migrations |
| Bad deploy | Freeze deploys | Rollback images ([DEPLOYMENT_RUNBOOK.md](./DEPLOYMENT_RUNBOOK.md)) |
| Broken migration | Stop app | Restore backup or forward-fix migration |
| Credential leak | Rotate secrets immediately | See CREDENTIAL_ROTATION_RUNBOOK.md |
| Suspected breach | Isolate tenant/network | Preserve logs; rotate JWT secrets; audit |

## Verification

- Health ready green
- Smoke: login → sale → stock
- Error rate returned to baseline
- Customer communication if P0/P1

## Post-incident

Timeline, root cause, customer impact, permanent fix, test gap, runbook updates. File P0/P1 in risk register until closed.
