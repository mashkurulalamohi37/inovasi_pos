# Performance Notes — Phase 9 RC

Guidance for API latency, load smoke tests, and frontend data tables in Pulse POS pilot environments.

---

## Smoke test script

**Location:** `scripts/perf_smoke_test.py`

**npm alias:** `npm run perf:smoke`

### Usage

```bash
# Default: localhost API, admin@pulse.pos
python scripts/perf_smoke_test.py

# Pilot/staging host
python scripts/perf_smoke_test.py \
  --base-url https://api.pilot.yourdomain.com/api/v1 \
  --email admin@pulse.pos \
  --password <password> \
  --warn-ms 2000
```

### What it measures

Sequential timed HTTP calls:

| Call | Endpoint |
|------|----------|
| health | `GET /health` |
| login | `POST /auth/login` |
| products (50) | `GET /products?limit=50` |
| sales history | `GET /sales/history?limit=50` |
| sales summary report | `GET /reports/sales-summary` |
| audit logs | `GET /audit-logs?limit=50` |
| system health | `GET /system/health` |

### Output

Per-call latency in ms, then summary: **avg**, approximate **p95**, and pass/fail against `--warn-ms` (default **2000 ms**).

Exit code **1** if any call exceeds threshold — suitable for CI or post-deploy cron.

### Dependencies

```bash
pip install httpx
```

---

## Performance targets (pilot)

| Metric | Target | Notes |
|--------|--------|-------|
| `/health` | < 100 ms | No DB heavy work |
| Login | < 500 ms | Includes bcrypt verify |
| Product list (50) | < 800 ms | Indexed `company_id` |
| Sales history (50) | < 1000 ms | Sort by `created_at` |
| Reports summary | < 1500 ms | Aggregations on pilot data volume |
| Smoke script p95 | < 2000 ms | Default `--warn-ms` |
| POS catalog perceived | < 300 ms search | Frontend debounce + cached pages |

Targets assume single-node pilot with < 10k products and < 100k invoices. Re-baseline after 90 days of production data.

---

## Pagination

Backend list endpoints accept `limit` and `offset` (or cursor where implemented):

| Endpoint | Default limit | Recommendation |
|----------|---------------|----------------|
| `/products` | 50 | Keep 25–50 for POS grid |
| `/sales/history` | 50 | 25 for mobile, 50 desktop |
| `/audit-logs` | 50 | 50 with date filter |
| `/purchases` | unbounded list | Add limit in UI tables |

**API guidance:** Always pass explicit `limit`; avoid `limit=1000` on pilot without load test.

**Frontend:** `use-pos-catalog.ts` and sales hooks should request paginated pages; infinite scroll or "Load more" for large catalogs.

---

## N+1 query awareness

Known patterns to watch when extending code:

| Area | Risk | Mitigation |
|------|------|------------|
| Sales history with lines | Loading invoice + lines per row | Use joined load or batch line fetch |
| Product list with pack metadata | Extra query per product | Eager load industry fields in one query |
| Purchase list with supplier | N+1 on supplier name | `selectinload` or join in service layer |
| Audit log user names | N+1 on user lookup | Join user in list query |

When adding endpoints, run smoke test before/after and inspect SQL logs in development (`LOG_LEVEL=debug` locally only).

---

## Frontend table guidance

| Practice | Detail |
|----------|--------|
| Page size | 25–50 rows default in data tables |
| Virtualization | Use for catalogs > 200 rows (POS product grid) |
| Debounced search | 200–300 ms on SKU/name search |
| Stale data | React Query keys from `queryKeys.ts`; invalidate on sale complete |
| Offline | Show cached page; do not paginate into uncached pages offline |
| Export | Stream or server-side export for large reports; avoid client-side 10k row arrays |

**POS catalog:** `use-pos-catalog.ts` should prefer backend search param over loading full catalog into memory.

**Reports:** Chart components should aggregate server-side (`/reports/*`); do not fetch full sales history for dashboard totals.

---

## Load testing (beyond smoke)

Smoke script is **not** a load test. For pilot capacity planning:

- Use `k6` or `locust` with 10–20 concurrent cashiers on `/products` + `/sales` POST
- Run against staging clone with production-sized product count
- Monitor PostgreSQL connections and backend CPU during test

Document results in pilot runbook before Black Friday or opening day.

---

## Monitoring latency in production

1. nginx `$request_time` logged to access log
2. Alert if p95 > 3s for 5 minutes on `/api/v1/*`
3. Weekly `npm run perf:smoke` against staging after deploy
4. PostgreSQL: watch slow query log for sequential scans on `sales_invoice`, `product`

---

## Quick checklist before pilot

- [ ] `perf_smoke_test.py` passes at `--warn-ms 2000`
- [ ] Product and sales list use `limit <= 50`
- [ ] No unbounded `.all()` in new list endpoints
- [ ] Frontend tables paginated or virtualized
- [ ] Indexes on `company_id` + common filters verified

**Related:** [PILOT_DEPLOYMENT.md](./PILOT_DEPLOYMENT.md) · [RELEASE_NOTES_PHASE_9.md](./RELEASE_NOTES_PHASE_9.md)
