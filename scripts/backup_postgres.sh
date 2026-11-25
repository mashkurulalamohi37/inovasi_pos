#!/usr/bin/env sh
set -eu

POSTGRES_USER="${POSTGRES_USER:-pulse}"
POSTGRES_DB="${POSTGRES_DB:-pulse_pos}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTPUT="${BACKUP_DIR}/pulse_pos_${TIMESTAMP}.dump"

mkdir -p "${BACKUP_DIR}"

echo "Backing up ${POSTGRES_DB} on ${POSTGRES_HOST}..."

if command -v docker >/dev/null 2>&1 && docker compose ps postgres 2>/dev/null | grep -q "running"; then
  docker compose exec -T postgres pg_dump -U "${POSTGRES_USER}" -Fc "${POSTGRES_DB}" > "${OUTPUT}"
elif command -v pg_dump >/dev/null 2>&1; then
  PGPASSWORD="${POSTGRES_PASSWORD:-}" pg_dump -h "${POSTGRES_HOST}" -U "${POSTGRES_USER}" -Fc "${POSTGRES_DB}" > "${OUTPUT}"
else
  echo "Error: neither 'docker compose' (postgres running) nor pg_dump found." >&2
  exit 1
fi

echo "Backup written to ${OUTPUT}"
ls -lh "${OUTPUT}"
