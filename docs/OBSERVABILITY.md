# Observability (Phase 8A)

## Health

| Endpoint | Purpose |
| --- | --- |
| `GET /health/live` | Process alive; safe fields: status, service, version, environment |
| `GET /health/ready` | DB + readiness checks; includes version, request_id; HTTP 503 if not ready |

Do not expose secrets, connection strings, or stack traces publicly.

## Structured request logging

Middleware logs method, path, status, duration_ms, request_id, and `error_category` on 4xx/5xx.

Recommended fields (partially present today):

- timestamp, level, request_id, method, path, status, duration_ms, error_category
- company_id / user_id when available in request context (extend carefully)
- operation / business_reference only when non-sensitive

### Never log

Passwords, JWTs, Authorization headers, card secrets, unnecessary prescription content, highly sensitive PII dumps.

## Error categories

See `backend/app/errors.py`: VALIDATION, AUTHENTICATION, AUTHORIZATION, NOT_FOUND, BUSINESS_CONFLICT, STOCK_CONFLICT, CONCURRENCY_CONFLICT, DATABASE, EXTERNAL_DEPENDENCY, INTERNAL.

HTTP 409 currently maps to BUSINESS_CONFLICT; refine STOCK/CONCURRENCY at throw sites when logging.

## Metrics foundation (wishlist / Phase 8B if not shipped)

- HTTP request count / latency / error rate
- DB pool usage
- sales created, stock conflicts, login failures, payment failures

Prometheus or OpenTelemetry metrics exporter is acceptable. **Do not claim metrics readiness without an exporter.**

## Tracing decision

**Phase 8A:** no full distributed tracing instrumentation claimed.

**Phase 8B backlog:** OpenTelemetry spans for sale, receive, return, checkout, optical finalize, building dispatch.

## Dashboard (minimum)

Request rate, error rate, p95 latency, active DB connections, pool pressure, stock conflict count, failed logins, payment failures, migration version, uptime.

## Alerts

**P0:** DB unavailable, high 5xx, payment finalization failures, backup failure  
**P1:** elevated latency, pool pressure, repeated stock conflicts, disk pressure
