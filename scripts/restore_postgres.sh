#!/usr/bin/env sh
set -eu

if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup-file.dump|backup-file.sql>" >&2
  exit 1
fi

BACKUP_FILE="$1"
POSTGRES_USER="${POSTGRES_USER:-pulse}"
POSTGRES_DB="${POSTGRES_DB:-pulse_pos}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "Error: backup file not found: ${BACKUP_FILE}" >&2
  exit 1
fi

echo "WARNING: This will restore ${POSTGRES_DB} from ${BACKUP_FILE}."
printf "Continue? [y/N] "
read -r CONFIRM
case "${CONFIRM}" in
  y|Y|yes|YES) ;;
  *) echo "Aborted."; exit 0 ;;
esac

if command -v docker >/dev/null 2>&1 && docker compose ps postgres 2>/dev/null | grep -q "running"; then
  echo "Stopping backend and frontend..."
  docker compose stop backend pulse-pos 2>/dev/null || true

  case "${BACKUP_FILE}" in
    *.sql)
      docker compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" < "${BACKUP_FILE}"
      ;;
    *)
      docker compose exec -T postgres pg_restore -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --clean --if-exists < "${BACKUP_FILE}"
      ;;
  esac

  echo "Restarting services..."
  docker compose up -d backend pulse-pos
else
  if command -v pg_restore >/dev/null 2>&1 && case "${BACKUP_FILE}" in *.sql) false;; *) true;; esac; then
    PGPASSWORD="${POSTGRES_PASSWORD:-}" pg_restore -h "${POSTGRES_HOST}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --clean --if-exists "${BACKUP_FILE}"
  elif command -v psql >/dev/null 2>&1; then
    PGPASSWORD="${POSTGRES_PASSWORD:-}" psql -h "${POSTGRES_HOST}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" < "${BACKUP_FILE}"
  else
    echo "Error: docker compose or pg_restore/psql required." >&2
    exit 1
  fi
fi

echo "Restore complete. Verify with: curl http://localhost:8000/api/v1/system/health"
