# Pulse POS — Multi-industry SaaS Platform

Pulse POS is a multi-tenant, multi-industry point-of-sale platform with a polished React frontend and FastAPI/PostgreSQL backend.

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite, TanStack Router/Query, Tailwind |
| Backend | FastAPI, SQLModel, Alembic |
| Database | PostgreSQL 16 |
| Auth | JWT access + refresh tokens |
| Deployment | Docker Compose |

## Quick Start

### Full stack (Docker)

```bash
docker compose up --build
```

- Frontend: http://localhost:3001 (Docker; port 3001 avoids conflict with local `npm run dev` on 3000)
- Backend API: http://localhost:8000
- API docs: http://localhost:8000/docs
- PostgreSQL: localhost:5540 (host port; Docker maps 5540→5432 to avoid local Windows PostgreSQL on 5432 and Hyper-V reserved ports)

### Local development

```bash
# Backend
cd backend
pip install -r requirements.txt
python -m app.seed
uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cp .env.example .env
npm install
npm run dev
```

Sign in at http://localhost:3000/login with:

| Role | Email | Password |
|------|-------|----------|
| Super Admin | super@pulse.pos | super123 |
| Admin | admin@pulse.pos | admin123 |
| Store Manager | manager@pulse.pos | manager123 |
| Cashier | cashier@pulse.pos | cashier123 |
| Inventory | inventory@pulse.pos | inventory123 |
| Auditor | auditor@pulse.pos | auditor123 |

Use **Continue without backend** on the login page for localStorage-only demo mode.

## Release Candidate (Phase 9)

Pilot-ready documentation:

| Document | Purpose |
|----------|---------|
| [PILOT_UAT_CHECKLIST.md](docs/PILOT_UAT_CHECKLIST.md) | Client UAT sign-off (89 scenarios) |
| [PILOT_DEPLOYMENT.md](docs/PILOT_DEPLOYMENT.md) | Staging / pilot server setup |
| [CLIENT_DEMO_SCRIPT.md](docs/CLIENT_DEMO_SCRIPT.md) | Presentation demo script |
| [SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md) | Production security review |
| [RELEASE_NOTES_PHASE_9.md](docs/RELEASE_NOTES_PHASE_9.md) | v9.0.0-rc1 release notes |
| [PERFORMANCE_NOTES.md](docs/PERFORMANCE_NOTES.md) | API smoke test & performance guidance |
| [HARDWARE_INTEGRATION.md](docs/HARDWARE_INTEGRATION.md) | Future hardware integration points |

## Docker Full Stack Verification

### Prerequisites

- Docker Desktop 4.x+ (Windows/macOS) or Docker Engine 24+ (Linux)
- Docker Compose v2
- Ports **3000**, **8000**, and **5432** available on the host
- At least **4 GB RAM** free for containers

### Commands

```bash
# Copy Docker env template (optional — compose has sensible dev defaults)
cp .env.docker.example .env

# Build and start all services (foreground)
docker compose up --build

# Detached mode
docker compose up --build -d

# View logs
docker compose logs -f backend pulse-pos

# Stop and remove containers
docker compose down

# Reset database volume (destructive)
docker compose down -v
docker compose up --build
```

### Expected containers

| Container | Service | Port | Health |
|-----------|---------|------|--------|
| `omni-pos-core-postgres-1` | PostgreSQL 16 | 5432 | `pg_isready` |
| `omni-pos-core-backend-1` | FastAPI API | 8000 | `GET /health` |
| `omni-pos-core-pulse-pos-1` | Nitro frontend | 3001→3000 | `GET /` |

Startup order: **postgres** → **backend** (migrate + seed) → **pulse-pos**.

### Health check URLs

| Check | URL |
|-------|-----|
| Backend liveness | http://localhost:8000/health |
| API health (DB) | http://localhost:8000/api/v1/system/health |
| Frontend | http://localhost:3001 |
| API docs | http://localhost:8000/docs |

### Smoke test after Docker start

1. Open http://localhost:3000/login — confirm page loads
2. Login as `super@pulse.pos` / `super123` — Super Admin works
3. Login as `admin@pulse.pos` / `admin123` — confirm **Live** badge
4. Products, POS sale, purchase receive, stock ledger, reports, audit logs
5. **Continue without backend** — demo mode still works
6. Run `npm run perf:smoke` (backend must be on port 8000)

### Troubleshooting

| Symptom | Fix |
|---------|-----|
| `dockerDesktopLinuxEngine` pipe not found | Start Docker Desktop; wait until engine is running |
| Backend exits on startup | Check `docker compose logs backend` — usually DB not ready or migration error |
| Frontend cannot reach API | Confirm `VITE_API_URL=http://localhost:8000/api/v1` at **build** time; rebuild: `docker compose build pulse-pos --no-cache` |
| CORS errors | Ensure browser origin is in `CORS_ORIGINS` (default includes localhost:3000) |
| Port already in use | Stop local `npm run dev` / uvicorn or change ports in compose |
| Stale database | `docker compose down -v && docker compose up --build` |
| Seed did not run | Set `SEED_ON_STARTUP=true` on backend service |

### Rebuild commands

```bash
docker compose build --no-cache
docker compose up --build
```

Production-style deploy: see [PILOT_DEPLOYMENT.md](docs/PILOT_DEPLOYMENT.md) and `docker-compose.prod.yml`.

## Phase 8 — SaaS Platform

| Module | Routes | Notes |
|--------|--------|-------|
| Onboarding | `/onboarding/tenant/public` | Self-service tenant signup |
| Subscriptions | `/subscriptions/*`, `/super-admin/subscriptions/*` | Plans, usage limits, warnings |
| Super Admin | `/super-admin/tenants`, suspend/activate | Platform tenant management |
| Devices | `/devices/register`, approve, block | POS terminal control |
| Approvals | `/approvals` | Manager approval workflow |
| Notifications | `/notifications` | In-app notification bell |
| System | `/system/health`, `/version`, `/backup/status` | Ops endpoints |

Documentation: `docs/DEPLOYMENT.md`, `docs/BACKUP_RESTORE.md`, `docs/ENVIRONMENT.md`, `docs/PRODUCTION_CHECKLIST.md`, `docs/CLIENT_DEMO_SCRIPT.md`

## Phase 7B — Operational Modules

Authenticated mode now includes full backend wiring for:

| Module | Routes | Notes |
|--------|--------|-------|
| Purchases | `/purchases`, `/suppliers`, `/supplier-payments` | Create, approve, GRN receive, purchase return |
| Sales returns | `/sales/{id}/return`, `/refund`, `/exchange` | Industry-specific return behavior |
| Receipts | `/sales/{id}/receipt`, `/receipt/reprint` | Reprint with audit log |
| Stock ledger | `/inventory/stock-ledger`, `/transfer`, `/low-stock` | All movements recorded |
| Payments | `/payments`, `/payments/summary` | Sales, refunds, supplier payments |
| Receipt templates | `/configuration/receipt-templates` | CRUD, set default, preview |
| System | `/system/health`, `/system/version` | Health + version for status UI |

Demo mode continues to use localStorage and mock data for all of the above.

## Environment Variables

### Frontend (`.env`)

```
VITE_API_URL=http://localhost:8000/api/v1
```

### Backend (`backend/.env`)

```
DATABASE_URL=postgresql+psycopg2://pulse:pulse@localhost:5540/pulse_pos
SECRET_KEY=change-me-in-production
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
SEED_ON_STARTUP=true
ENVIRONMENT=development
LOG_LEVEL=info
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
```

Never commit production secrets.

## Commands

```bash
npm run dev              # Frontend dev server
npm run build            # Production frontend build
npm run backend:dev      # Backend with hot reload
npm run backend:migrate  # Alembic upgrade head
npm run backend:migrate:down  # Rollback one migration
npm run backend:seed     # Load demo seed data
npm run backend:reset-demo # Reset PULSE-DEMO tenant and re-seed
npm run backend:create-super-admin  # Create/update platform super admin
npm run backend:init     # Migrate + seed (local DB setup)
npm run backend:test     # Run backend pytest suite (76 tests)
npm run frontend:test    # Vitest + MSW integration tests (48 tests)
npm run frontend:test:watch  # Vitest watch mode
npm run test:all         # Backend + frontend tests
npm run perf:smoke       # API performance smoke test
npm run docker:up        # Start Docker Compose stack (detached)
docker compose up --build    # Full stack build + run (foreground)
```

### Database

```bash
# Apply migrations (Alembic)
npm run backend:migrate

# Rollback one revision
npm run backend:migrate:down

# Seed demo tenant + super admin
npm run backend:seed

# Reset demo tenant only
npm run backend:reset-demo

# Create platform super admin
npm run backend:create-super-admin

# Docker Compose runs migrate + seed via backend entrypoint when SEED_ON_STARTUP=true
```

Schema is managed by **Alembic** (`backend/alembic/versions/`). Initial revision `001_initial` creates all SQLModel tables. Local dev without Docker can also use `npm run backend:init` (migrate + seed).

### Backup / restore (PostgreSQL)

```bash
# Backup
docker compose exec postgres pg_dump -U pulse pulse_pos > backup.sql

# Restore
docker compose exec -T postgres psql -U pulse pulse_pos < backup.sql
```

## Architecture

```
backend/app/
├── api/v1/          # REST endpoints (auth, commerce, purchases, returns, payments, inventory, config, reports, system)
├── models/          # SQLModel tables (core, config, industry, operations)
├── services/        # Sales, purchase, returns, inventory, health check
└── seed.py          # Demo tenant seed

src/
├── lib/api.ts       # API client with token refresh
├── lib/auth.ts      # Login/session
├── lib/demo-mode.ts # Demo vs authenticated mode
├── hooks/           # React Query hooks
└── routes/          # TanStack Router pages
```

## Modes

| Mode | Trigger | Data source |
|------|---------|-------------|
| **Authenticated** | Login with backend | PostgreSQL via REST API |
| **Demo** | "Continue without backend" | localStorage + mock data |

When authenticated, backend is the source of truth for products, sales, purchases, returns, payments, inventory, stock ledger, configuration, reports, receipt templates, and audit logs.

The top bar shows **Live** (PostgreSQL) or **Demo** (localStorage) mode plus API health from `/system/health`.

## API Overview

- `POST /api/v1/auth/login` — Authenticate
- `GET /api/v1/auth/me` — Current user + permissions
- `GET /api/v1/products` — Paginated product list
- `POST /api/v1/sales` — Create sale (idempotent via `client_transaction_id`)
- `GET/POST /api/v1/purchases` — Purchase orders; approve, receive, return
- `POST /api/v1/sales/{id}/return|refund|exchange` — Sales returns
- `GET /api/v1/inventory/stock-ledger` — Stock movement history
- `GET /api/v1/payments` — Payment collection
- `GET/POST /api/v1/configuration/receipt-templates` — Receipt template CRUD
- `GET /api/v1/system/health` — Backend + DB status
- `GET /api/v1/configuration/*` — Packs, flags, dynamic fields
- `GET /api/v1/reports/*` — Sales, purchase, return, payment reports
- `GET /api/v1/audit-logs` — Tenant audit trail

## Testing

```bash
npm run test:all         # 76 backend + 48 frontend tests
npm run backend:test     # pytest only
npm run frontend:test    # Vitest + MSW only
npm run build
```

### Manual demo checklist (authenticated)

1. Login as admin → confirm **Live** badge
2. Create supplier → create purchase → approve → receive GRN
3. Verify inventory + stock ledger updated
4. Complete POS sales (Grocery, Fashion, Pharmacy, etc.)
5. Process return/refund/exchange from Sales History drawer
6. Reprint receipt → check audit log
7. Review Payments and Reports pages
8. Edit receipt template → complete sale → verify receipt branding
9. Login as cashier → confirm purchase approval denied
10. Switch to demo mode → confirm mock fallback still works

## License

Private — Pulse Retail Group
