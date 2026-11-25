# Load testing (Phase 8A)

Tool: [k6](https://k6.io/)

## Profiles

| Profile | VUs | Duration | Command |
| --- | --- | --- | --- |
| Smoke | 1–5 | 30s | `k6 run -e VUS=2 -e DURATION=30s scripts/load/k6_smoke.js` |
| Normal | 10–20 | 5m | `k6 run -e VUS=15 -e DURATION=5m scripts/load/k6_smoke.js` |
| Peak | 30–50 | 5m | `k6 run -e VUS=40 -e DURATION=5m scripts/load/k6_smoke.js` |
| Stress | increase until error rate rises | until degradation | raise VUs until p95 or failures breach thresholds |

Always target **PostgreSQL-backed** API (`BASE_URL`). Do not load-test SQLite.

Record: request count, success rate, p50/p95/p99, error rate, throughput.
