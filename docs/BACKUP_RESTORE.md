# PostgreSQL Backup & Restore

Pulse POS stores all tenant data in PostgreSQL. Use these procedures before upgrades, migrations, or disaster recovery.

## Prerequisites

- Docker Compose stack running, or direct access to PostgreSQL
- Sufficient disk space for compressed dumps
- Production `DATABASE_URL` credentials (never commit secrets)

## Backup

### Using the project script (recommended)

```bash
# From repo root — writes timestamped dump to ./backups/
./scripts/backup_postgres.sh
```

Environment variables (optional):

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_USER` | `pulse` | Database user |
| `POSTGRES_DB` | `pulse_pos` | Database name |
| `POSTGRES_HOST` | `localhost` | Host (use `postgres` inside Docker network) |
| `BACKUP_DIR` | `./backups` | Output directory |

### Manual backup (Docker Compose)

```bash
docker compose exec postgres pg_dump -U pulse -Fc pulse_pos > backups/pulse_pos_$(date +%Y%m%d_%H%M%S).dump
```

`-Fc` produces a custom-format archive suitable for `pg_restore`.

### Scheduled backups

Add a cron job on the host or use your cloud provider's managed backup:

```cron
0 2 * * * cd /opt/pulse-pos && ./scripts/backup_postgres.sh >> /var/log/pulse-backup.log 2>&1
```

Retain at least 7 daily and 4 weekly backups off-site.

## Restore

### Using the project script

```bash
# Restore from a custom-format dump
./scripts/restore_postgres.sh backups/pulse_pos_20260626_020000.dump
```

The script stops the backend, restores the database, and prompts you to restart services.

### Manual restore (Docker Compose)

```bash
docker compose stop backend pulse-pos
docker compose exec -T postgres pg_restore -U pulse -d pulse_pos --clean --if-exists < backups/your.dump
docker compose up -d
```

For plain SQL dumps:

```bash
docker compose exec -T postgres psql -U pulse pulse_pos < backup.sql
```

## Verification

After restore:

1. `curl http://localhost:8000/api/v1/system/health` — database should be `connected`
2. Log in as a known tenant admin and verify products/sales history
3. Check `/api/v1/system/backup/status` for configuration message

## API status endpoint

`GET /api/v1/system/backup/status` returns backup configuration hints for the admin UI. It does not perform backups itself — use the scripts above.

## Security

- Encrypt backup files at rest (S3 SSE, GPG, or volume encryption)
- Restrict file permissions: `chmod 600 backups/*.dump`
- Test restores quarterly on a staging environment
