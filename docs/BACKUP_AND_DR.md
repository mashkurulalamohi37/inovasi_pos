# Backup & Disaster Recovery (Phase 8A)

## Architecture

| Component | Approach |
| --- | --- |
| Engine | PostgreSQL 16 |
| Dump | `pg_dump -Fc` via `scripts/backup_postgres.sh` |
| Restore | `scripts/restore_postgres.sh` / `pg_restore` |
| Drill | `python scripts/backup_restore_drill.py` (isolated DBs) |
| Storage | **Must** be off-host (object storage / other region). Local `./backups` alone is not production-ready. |

## Required production controls

1. **Automated schedule** (example daily 02:00 local).
2. **Retention**: ≥7 daily + ≥4 weekly off-host.
3. **Encryption**: at-rest encryption on backup storage + transit TLS.
4. **Monitoring**: alert on backup job failure (P0).
5. **Restore drill**: run at least quarterly (staging) and before major upgrades.

A backup is only proven when restore succeeds.

## Docker-compose `db-backup` service (docker-compose.prod.yml)

The `db-backup` container runs a daily `pg_dump | gzip | gpg --symmetric` loop into
`./backups`, retaining 7 days locally. Requires `BACKUP_ENCRYPTION_PASSPHRASE` in
`.env` (see `.env.production.example`) — the compose file refuses to start the
service without it.

To restore a file produced by this service:

```bash
gpg --batch --yes --passphrase "$BACKUP_ENCRYPTION_PASSPHRASE" \
  --decrypt backups/pulse_YYYYMMDD_HHMMSS.sql.gz.gpg | gunzip | \
  psql -h <host> -U <user> -d <target_db>
```

This local retention is a stopgap, not the production control — per "Required
production controls" above, backups still need off-host storage (object storage
/ other region); copy the `.sql.gz.gpg` files out on the same schedule.

## RPO / RTO starting recommendations

| Deployment | RPO | RTO | Notes |
| --- | --- | --- | --- |
| Single-store | ≤24h (daily dump) | ≤4h | Acceptable for many SMB POS |
| Multi-store | ≤4–12h | ≤2h | Prefer PITR / continuous archiving |
| Enterprise | ≤15–60m | ≤1h | Managed PG + replicas + runbooks |

Agree exact numbers with the customer; do not treat the table as contractual SLA without sign-off.

## Restore drill (mandatory evidence)

```bash
# Requires local/admin PostgreSQL credentials
set DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/postgres
python scripts/backup_restore_drill.py
```

Expected: `PASS: backup restore drill restored BACKUP-DEMO company`.

After real `pg_dump` restore into a scratch DB, validate customers, products, stock, invoices, and key vertical rows.

## Detection → recovery (DB outage)

1. Ready endpoint fails / DB errors spike.
2. Fail closed (do not fake healthy).
3. Restore latest good backup to new instance if primary unrecoverable.
4. Point `DATABASE_URL` at restored DB; migrate if needed (single runner).
5. Smoke sale + ledger spot-check.
