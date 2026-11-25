# Multi-replica readiness (Phase 8B)

| Component | Multi-replica safe? | Shared dependency | Decision |
| --- | --- | --- | --- |
| FastAPI app (stateless JWT) | Yes | PostgreSQL | OK |
| Rate limiting | Only with Redis | Redis | `RATE_LIMIT_BACKEND=redis` required for >1 replica |
| Session / refresh | Mostly | DB refresh tokens if used | Document residual: access JWT not server-revoked until expiry |
| In-memory rate limit | **No** | — | Single replica only |
| Alembic migrations | **No concurrent** | Job lock | Dedicated migrate job / one runner |
| Local file storage | **No** | Object storage | Use shared volume/S3 for uploads |
| Background jobs | Unknown/none central | Scheduler | No duplicate job runner across replicas |
| WebSocket | N/A if unused | Sticky/redis | Document if added |
| Metrics `/metrics` | Per-process | Scrape all pods | OK |

## GA constraint

**Multi-replica GA:** Redis rate limiting enabled (`RATE_LIMIT_REQUIRE_REDIS=true` recommended).  
**Single-replica CONDITIONAL GO:** memory backend allowed with documented restriction.
