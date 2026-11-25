# Slow Query Review (Phase 8A)

Critical endpoints to review with `EXPLAIN (ANALYZE, BUFFERS)` on PostgreSQL (not SQLite):

- Product search / barcode lookup
- Stock balance / ledger
- Sales create + history
- Purchases / GRN
- Dashboard / professional reports
- Pharmacy batches / FEFO
- Serial / IMEI / certificate lookup
- Building deliveries
- School-list availability
- Cosmetics expiry / shade batch

## Known baseline

- Migration `009_reporting_indexes` added reporting indexes.
- Vertical hardening migrations added domain indexes — verify under real data volumes.

## Checklist per endpoint

- [ ] Sequential scan on large tables?
- [ ] Missing composite index (company_id + filter)?
- [ ] N+1 from ORM loops?
- [ ] Unbounded list response (add limit/cursor)?
- [ ] Oversized joins?

Do not optimize tiny static tables. Record findings in release notes when indexes change.
