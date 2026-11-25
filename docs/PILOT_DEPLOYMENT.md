# Pilot Deployment Guide — Phase 9 RC

Deploy Pulse POS for a **single pilot tenant** on one VPS or on-prem server using Docker Compose and PostgreSQL.

For production hardening beyond pilot, also complete [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md).

---

## Overview

| Service | Image / build | Internal port |
|---------|---------------|---------------|
| PostgreSQL 16 | `postgres:16-alpine` | 5432 |
| Backend API | `backend/Dockerfile` | 8000 |
| Frontend | root `Dockerfile` | 3000 |

Use `docker-compose.prod.yml` for pilot production settings (restart policies, health checks, required secrets).

---

## Server requirements

| Resource | Minimum (pilot) | Recommended |
|----------|-----------------|-------------|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| Disk | 40 GB SSD | 80 GB SSD (+ backup storage) |
| OS | Ubuntu 22.04 / 24.04 LTS | Same |
| Network | Static IP or DNS | TLS via nginx/Caddy |

**Software on host:**

- Docker Engine 24+ and Docker Compose v2
- `git`, `curl`, optional `nginx` for reverse proxy
- Firewall: allow 443 (and 22 for SSH); do **not** expose PostgreSQL publicly

---

## Install Docker (Ubuntu example)

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

Clone or copy the repo to e.g. `/opt/pulse-pos`.

---

## PostgreSQL volume

`docker-compose.prod.yml` defines a named volume:

```yaml
volumes:
  pulse_pg_data:
```

Data persists across container restarts. For pilot:

- Do not delete the volume without a backup
- Monitor disk usage on `/var/lib/docker/volumes/`
- Optional: bind-mount to a host path for easier backup snapshots:

```yaml
volumes:
  - /data/pulse/pg:/var/lib/postgresql/data
```

---

## Environment setup

```bash
cd /opt/pulse-pos
cp .env.example .env
```

Edit `.env` (see [ENVIRONMENT.md](./ENVIRONMENT.md)):

```env
POSTGRES_USER=pulse
POSTGRES_PASSWORD=<strong-random-password>
POSTGRES_DB=pulse_pos
SECRET_KEY=<openssl-rand-hex-32>
CORS_ORIGINS=https://app.pilot.yourdomain.com
VITE_API_URL=https://api.pilot.yourdomain.com/api/v1
SEED_ON_STARTUP=true
BACKEND_PORT=8000
FRONTEND_PORT=3000
```

**First boot only:** set `SEED_ON_STARTUP=true` to load demo tenant and super admin. After successful login test, set `SEED_ON_STARTUP=false` and restart backend.

Backend-specific (if not using Compose env injection):

```env
DATABASE_URL=postgresql+psycopg2://pulse:<password>@postgres:5432/pulse_pos
ENVIRONMENT=production
LOG_LEVEL=warning
```

> `VITE_API_URL` is baked in at **frontend build time**. Changing API URL requires rebuilding the `pulse-pos` image.

---

## Build and run

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Verify containers:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f backend --tail 50
```

Initial data (if not using `SEED_ON_STARTUP`):

```bash
docker compose -f docker-compose.prod.yml exec backend python -m app.manage migrate
docker compose -f docker-compose.prod.yml exec backend python -m app.manage seed
```

Create super admin manually if needed:

```bash
docker compose -f docker-compose.prod.yml exec backend python -m app.manage create-super-admin
```

---

## Domain and SSL

1. Point DNS A records:
   - `app.pilot.yourdomain.com` → server IP
   - `api.pilot.yourdomain.com` → server IP
2. Obtain certificates (Let's Encrypt example):

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d app.pilot.yourdomain.com -d api.pilot.yourdomain.com
```

3. Set `CORS_ORIGINS` to the frontend origin only
4. Set `VITE_API_URL` to `https://api.pilot.yourdomain.com/api/v1` before frontend build

---

## Nginx reverse proxy (sample)

```nginx
# /etc/nginx/sites-available/pulse-pilot

upstream pulse_frontend {
  server 127.0.0.1:3000;
}

upstream pulse_api {
  server 127.0.0.1:8000;
}

server {
  listen 443 ssl http2;
  server_name app.pilot.yourdomain.com;

  ssl_certificate     /etc/letsencrypt/live/app.pilot.yourdomain.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/app.pilot.yourdomain.com/privkey.pem;

  location / {
    proxy_pass http://pulse_frontend;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}

server {
  listen 443 ssl http2;
  server_name api.pilot.yourdomain.com;

  ssl_certificate     /etc/letsencrypt/live/api.pilot.yourdomain.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/api.pilot.yourdomain.com/privkey.pem;

  location / {
    proxy_pass http://pulse_api;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
  }
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/pulse-pilot /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## Backup schedule

Use [BACKUP_RESTORE.md](./BACKUP_RESTORE.md).

**Recommended pilot schedule:**

| Job | Schedule | Retention |
|-----|----------|-----------|
| Full DB dump | Daily 02:00 | 7 daily, 4 weekly off-site |
| Config backup | Weekly | `.env` in secrets vault (not git) |

Cron example:

```cron
0 2 * * * cd /opt/pulse-pos && ./scripts/backup_postgres.sh >> /var/log/pulse-backup.log 2>&1
```

Set `POSTGRES_HOST=localhost` if backing up from host against exposed port, or run script inside Compose network with `POSTGRES_HOST=postgres`.

---

## Restore

```bash
./scripts/restore_postgres.sh backups/pulse_pos_YYYYMMDD_HHMMSS.dump
```

Or manual — see BACKUP_RESTORE.md. Always verify health and login after restore.

---

## Log locations

| Source | Location |
|--------|----------|
| Backend API | `docker compose logs backend` (stdout) |
| Frontend | `docker compose logs pulse-pos` |
| PostgreSQL | `docker compose logs postgres` |
| Nginx access/error | `/var/log/nginx/access.log`, `error.log` |
| Backup cron | `/var/log/pulse-backup.log` |

Forward stdout to your aggregator (CloudWatch, Datadog, Loki) for pilot monitoring.

---

## Health checks

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /health` | No | Liveness (backend process) |
| `GET /api/v1/system/health` | Yes (admin) | DB connectivity, subsystem checks |
| `GET /api/v1/system/backup/status` | Yes | Backup configuration hints |

Quick smoke:

```bash
curl -sf http://localhost:8000/health
python scripts/perf_smoke_test.py --base-url http://localhost:8000/api/v1
```

Compose healthchecks are defined in `docker-compose.prod.yml` for postgres, backend, and frontend.

---

## Monitoring

Pilot minimum:

- Uptime monitor on `https://api.pilot.yourdomain.com/health` (60s interval)
- Disk alert on Docker volume and backup directory
- Email/Slack on backup cron failure (check log non-zero exit)
- Optional: 5xx rate from nginx or container logs

Application metrics (future): Prometheus endpoint not in RC — use log-based alerts.

---

## Upgrade procedure

1. **Backup database** before upgrade
2. Pull latest code or image tag
3. Review [RELEASE_NOTES_PHASE_9.md](./RELEASE_NOTES_PHASE_9.md) for breaking changes
4. Run migrations:

```bash
docker compose -f docker-compose.prod.yml exec backend python -m app.manage migrate
```

5. Rebuild and restart:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

6. Smoke test: login → POS sale → report → health
7. Run UAT spot-checks from [PILOT_UAT_CHECKLIST.md](./PILOT_UAT_CHECKLIST.md)

---

## Rollback procedure

1. Stop stack:

```bash
docker compose -f docker-compose.prod.yml down
```

2. Restore database from pre-upgrade dump (if schema/data migration failed)
3. Deploy previous known-good image tag or git commit:

```bash
git checkout <previous-tag>
docker compose -f docker-compose.prod.yml up -d --build
```

4. Verify health and tenant login
5. Document incident and root cause

If only the frontend/API regressed without DB changes, redeploy previous images without DB restore.

---

## Pilot go-live checklist

- [ ] Secrets set (`SECRET_KEY`, `POSTGRES_PASSWORD`)
- [ ] `SEED_ON_STARTUP=false` after initial seed
- [ ] HTTPS on app and API
- [ ] Backup cron active and one restore tested on staging
- [ ] Demo passwords rotated or disabled
- [ ] UAT checklist in progress
- [ ] Support contact documented for tenant admin

**Related:** [DEPLOYMENT.md](./DEPLOYMENT.md) · [ENVIRONMENT.md](./ENVIRONMENT.md) · [BACKUP_RESTORE.md](./BACKUP_RESTORE.md)
