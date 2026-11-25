#!/bin/sh
set -e
echo "Pulse POS backend starting (ENVIRONMENT=${ENVIRONMENT:-development})..."
python -m app.manage wait-db
python -m app.manage migrate
if [ "${SEED_ON_STARTUP:-false}" = "true" ]; then
  echo "Running demo seed (SEED_ON_STARTUP=true)..."
  python -m app.manage seed || echo "[WARN] Seed had errors but continuing startup..."
fi
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
