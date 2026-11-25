# Pagination & Bounded Responses (Phase 8A)

Production-critical list endpoints must not return unbounded datasets.

## Audit targets

| Endpoint area | Expectation |
| --- | --- |
| Products | `limit` / pagination |
| Sales history | bounded |
| Purchases / receives | bounded |
| Customers / suppliers | bounded |
| Stock | store-scoped; prefer limits |
| Serials / batches | bounded |
| Orders / audit logs | bounded |

## Guidance

- Prefer explicit `limit` (default ≤100) + `offset` or cursor.
- Frontend must not silently break when limits are introduced — use existing query params.
- Do not “fix” by truncating without documenting default limits.

When adding limits, cover with unit/integration tests and update API docs.
