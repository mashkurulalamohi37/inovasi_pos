# Environment Variables

Reference for Pulse POS frontend and backend configuration.

## Frontend (`.env` / build args)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_URL` | Yes (prod) | `http://localhost:8000/api/v1` | Backend API base URL (baked in at build time) |

Example:

```env
VITE_API_URL=https://api.yourdomain.com/api/v1
```

## Backend (`backend/.env` or Docker env)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | SQLAlchemy URL (`postgresql+psycopg2://...` or SQLite for local dev) |
| `SECRET_KEY` | Yes | — | JWT access token signing key — 32+ random bytes in production |
| `JWT_REFRESH_SECRET_KEY` | No | falls back to `SECRET_KEY` | Separate refresh token signing key (recommended in production) |
| `CORS_ORIGINS` | Yes | `http://localhost:3000` | Comma-separated allowed origins |
| `ENVIRONMENT` | No | `development` | `development` \| `staging` \| `production` — production/staging validate secrets |
| `LOG_LEVEL` | No | `info` | Python log level |
| `SEED_ON_STARTUP` | No | `false` | Run demo seed on backend start (must be `false` in production) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | `30` | JWT access token TTL |
| `REFRESH_TOKEN_EXPIRE_DAYS` | No | `7` | Refresh token TTL |
| `LOGIN_MAX_ATTEMPTS` | No | `5` | Failed logins before lockout |
| `LOGIN_LOCKOUT_MINUTES` | No | `15` | Account lockout duration |
| `BACKUP_PATH` | No | `./backups` | Local backup directory for scripts |
| `STORAGE_PATH` | No | `./storage` | Future media/file storage root |

Example production:

```env
DATABASE_URL=postgresql+psycopg2://pulse:STRONG_PASSWORD@postgres:5432/pulse_pos
SECRET_KEY=replace-with-openssl-rand-hex-32
JWT_REFRESH_SECRET_KEY=replace-with-different-openssl-rand-hex-32
CORS_ORIGINS=https://app.yourdomain.com
ENVIRONMENT=production
SEED_ON_STARTUP=false
LOG_LEVEL=warning
```

## Docker Compose

Root `.env` templates: `.env.example`, `.env.docker.example`, `.env.production.example`

```env
POSTGRES_USER=pulse
POSTGRES_PASSWORD=change-me
POSTGRES_DB=pulse_pos
SECRET_KEY=change-me-in-production
VITE_API_URL=http://localhost:8000/api/v1
```

## PostgreSQL (container)

| Variable | Default |
|----------|---------|
| `POSTGRES_USER` | `pulse` |
| `POSTGRES_PASSWORD` | set in compose |
| `POSTGRES_DB` | `pulse_pos` |

## Backup scripts

| Variable | Default | Used by |
|----------|---------|---------|
| `POSTGRES_USER` | `pulse` | `scripts/backup_postgres.sh` |
| `POSTGRES_DB` | `pulse_pos` | backup/restore scripts |
| `POSTGRES_HOST` | `localhost` | backup/restore scripts |
| `BACKUP_DIR` | `./backups` | backup script |

## Security

- Never commit `.env` with real secrets
- Rotate `SECRET_KEY` only with a planned session invalidation
- Use TLS termination at the reverse proxy in production
- Restrict PostgreSQL to the Docker network or private subnet

## Demo credentials (development seed only)

| Role | Email | Password |
|------|-------|----------|
| Super Admin | super@pulse.pos | super123 |
| Admin | admin@pulse.pos | admin123 |

Change or disable seed data before production launch.
