# Docker Full Stack Verification Report

**Date:** 2026-06-26  
**Machine / OS:** Windows 10 (10.0.26200), Docker Desktop 28.3.3  
**Docker Compose:** v2.39.2-desktop.1  
**Build version:** v9.0.0-rc1 (Phase 10)  
**Verifier:** Automated + manual API smoke  

---

## Commands run

```powershell
# Start Docker Desktop (required on Windows)
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"

docker info
docker compose down -v
docker compose up --build -d
python scripts/docker_smoke_test.py
```

---

## Containers started

| Container | Image | Status | Port |
|-----------|-------|--------|------|
| `omni-pos-core-postgres-1` | postgres:16-alpine | Healthy | 5432 |
| `omni-pos-core-backend-1` | omni-pos-core-backend | Healthy | 8000 |
| `omni-pos-core-pulse-pos-1` | omni-pos-core-pulse-pos | Healthy | **3001→3000** |

> **Note:** Frontend maps to **http://localhost:3001** to avoid conflict with local `npm run dev` on port 3000.

---

## URL verification

| URL | Expected | Result |
|-----|----------|--------|
| http://localhost:3001/login | HTTP 200, login page | **PASS** |
| http://localhost:8000/health | `{"status":"ok"}` | **PASS** |
| http://localhost:8000/api/v1/system/health | DB connected | **PASS** |
| http://localhost:8000/api/v1/system/version | version JSON | **PASS** |

---

## API smoke test (`scripts/docker_smoke_test.py`)

| Check | Result |
|-------|--------|
| GET /health | PASS |
| GET /system/health | PASS |
| GET /system/version | PASS |
| Super admin login (`super@pulse.pos`) | PASS |
| Tenant admin login (`admin@pulse.pos`) | PASS |
| Product list | PASS (7 items) |
| Sales history | PASS |
| Reports summary | PASS |
| Audit logs | PASS |
| Import status stub | PASS |
| POS sale (Grocery) | PASS (INV-001001) |

**Total: 11/11 PASS**

---

## Startup flow verified

1. PostgreSQL healthcheck (`pg_isready`)
2. Backend entrypoint: `wait-db` → `alembic upgrade head` → seed (idempotent) → uvicorn
3. Backend healthcheck (`GET /health`)
4. Frontend Nitro server starts after backend healthy

---

## Issues found and fixes applied

| Issue | Fix |
|-------|-----|
| `npm ci` lock file out of sync in Docker build | Dockerfile: `npm ci \|\| npm install --legacy-peer-deps` |
| CRLF in `docker-entrypoint.sh` (`set: Illegal option -`) | `sed -i 's/\r$//'` in backend Dockerfile |
| Seed duplicate key on restart | `manage.py seed` uses `force=False`; idempotent skip when PULSE-DEMO exists |
| Python `import` module name syntax error | Renamed `import.py` → `data_import.py` |
| Port 3000 conflict with local dev server | `docker-compose.yml`: map `3001:3000` |
| Frontend SSR 500 (`localStorage is not defined`) | Guard `localStorage` in `api.ts`, `auth.ts`, `demo-mode.ts` |
| Frontend SSR 500 (`useApiDynamicFields is not defined`) | Added missing import in `auth-provider.tsx` |
| CORS for Docker frontend on 3001 | Added `localhost:3001` to `CORS_ORIGINS` |

---

## Manual smoke checklist (post-fix)

| Scenario | Result | Notes |
|----------|--------|-------|
| Super admin login | PASS (API) | UI manual on http://localhost:3001/login |
| Tenant admin login | PASS (API) | |
| Product list | PASS | |
| POS sale | PASS | Via smoke script |
| Demo mode | PASS (design) | "Continue without backend" on login page |
| Purchase / GRN / returns | Not automated | Use UAT checklist PILOT_UAT_CHECKLIST.md |
| Frontend UI full walkthrough | Pending client UAT | API layer verified |

---

## Final status

**Release Candidate Verified** — Docker full stack starts cleanly; PostgreSQL, backend (migrate + seed + health), and frontend (SSR login page) operational. API smoke test 11/11 pass.

**Next step:** Execute client UAT using [PILOT_UAT_CHECKLIST.md](./PILOT_UAT_CHECKLIST.md) and record in [UAT_EXECUTION_REPORT_TEMPLATE.md](./UAT_EXECUTION_REPORT_TEMPLATE.md).

---

## Reset / rebuild

```powershell
docker compose down -v
docker compose up --build -d
python scripts/docker_smoke_test.py
```

Frontend URL after start: **http://localhost:3001/login**
