# Rate Limiting (Phase 8B)

## Decision

**Option A (preferred for multi-replica GA):** Redis-backed distributed rate limiting  
**Option C (allowed CONDITIONAL GO):** `RATE_LIMIT_BACKEND=memory` with **single API replica only**

Do not claim multi-replica safety with memory backend.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `RATE_LIMIT_ENABLED` | true | Master switch |
| `RATE_LIMIT_BACKEND` | memory | `memory` \| `redis` |
| `REDIS_URL` | — | Required when backend=redis |
| `RATE_LIMIT_REQUIRE_REDIS` | false | If true, auth returns 503 when Redis down |
| `RATE_LIMIT_FORCE` | false | Enforce in non-prod (tests) |

## Protected paths

| Path | Limit | Window | Dimensions |
| --- | --- | --- | --- |
| POST `/api/v1/auth/login` | 10 | 60s | IP + optional `X-RateLimit-Account` |
| POST `/api/v1/auth/refresh` | 30 | 60s | IP (+ account hint) |
| POST `/api/v1/onboarding/tenant/public` | 5 | 300s | IP |

**Not limited:** POS sales, GRN receive, barcode lookup (avoid cashier lockouts).

## Key strategy

`rl:{path}:ip:{ip}[:acct:{account}]`

TTL = window seconds via Redis EXPIRE.

## Failure policy

| Mode | Auth when Redis down | Normal POS |
| --- | --- | --- |
| redis + require=false | Memory fallback + warning log | Unaffected |
| redis + require=true | **503** + readiness not ready | Unaffected |
| memory | Local only | Single replica documented |

## Monitoring

- Log: `rate_limit exceeded`, `rate_limit redis unavailable`, `fallback=memory`
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Backend`
- Metric: login failures / HTTP 429 via `/metrics`

## Multi-replica checklist

- [ ] `RATE_LIMIT_BACKEND=redis`
- [ ] Shared `REDIS_URL`
- [ ] Prefer `RATE_LIMIT_REQUIRE_REDIS=true` for auth integrity
- [ ] Redis HA/monitoring in place
