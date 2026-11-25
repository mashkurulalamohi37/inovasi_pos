# Deployment Guide

Production deployment for Pulse POS using Docker Compose.

## Overview

| Service | Image / build | Port |
|---------|---------------|------|
| PostgreSQL 16 | `postgres:16-alpine` | 5432 (internal) |
| Backend API | `backend/Dockerfile` | 8000 |
| Frontend | root `Dockerfile` | 3000 |

Use `docker-compose.prod.yml` for production-oriented settings (no dev ports exposed publicly, secrets via env file, restart policies).

## Quick deploy

```bash
cp .env.example .env
# Edit .env with production SECRET_KEY, DATABASE_URL, CORS_ORIGINS, VITE_API_URL

docker compose -f docker-compose.prod.yml up -d --build
```

- Frontend: configured `VITE_API_URL` (build-time) + served on port 3000
- API: `https://your-domain/api/v1` (put reverse proxy in front)
- Health: `GET /health` and `GET /api/v1/system/health`

## Environment

See [ENVIRONMENT.md](./ENVIRONMENT.md) for all variables.

Minimum production set:

```env
SECRET_KEY=<long-random-string>
DATABASE_URL=postgresql+psycopg2://pulse:<password>@postgres:5432/pulse_pos
CORS_ORIGINS=https://app.yourdomain.com
ENVIRONMENT=production
SEED_ON_STARTUP=false
VITE_API_URL=https://api.yourdomain.com/api/v1
```

## Reverse proxy (nginx example)

```nginx
server {
  listen 443 ssl;
  server_name app.yourdomain.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
  }
}

server {
  listen 443 ssl;
  server_name api.yourdomain.com;

  location / {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

## Database

- First deploy: set `SEED_ON_STARTUP=true` once to load demo/super-admin seed, then set to `false`
- Migrations: run Alembic before backend start when schema changes ship
- Backups: see [BACKUP_RESTORE.md](./BACKUP_RESTORE.md)

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs backend tests, frontend tests, build, and Docker image build on push/PR.

Deploy pipeline suggestion:

1. CI passes on `main`
2. Build and push images to your registry
3. Pull on server and `docker compose -f docker-compose.prod.yml up -d`
4. Run smoke tests (health, login, one sale)

## Scaling notes

- Single-node Compose is suitable for pilot tenants
- For HA: managed PostgreSQL, multiple backend replicas behind a load balancer, shared Redis optional for rate-limit/session if added later
- Frontend is static SSR output — scale horizontally with identical containers

## Rollback

1. Stop stack: `docker compose -f docker-compose.prod.yml down`
2. Restore database from backup (see BACKUP_RESTORE.md)
3. Deploy previous image tag: `docker compose -f docker-compose.prod.yml up -d`

## Checklist

Use [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md) before go-live.
