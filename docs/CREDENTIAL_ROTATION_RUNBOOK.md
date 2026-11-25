# Credential Rotation & User Finalization Runbook

Execute on the **production/pilot server** before live trading. **Do not commit passwords to git.**

---

## 1. Generate secrets

```bash
openssl rand -hex 32   # SECRET_KEY
openssl rand -hex 32   # JWT_REFRESH_SECRET_KEY (must differ)
openssl rand -base64 24  # POSTGRES_PASSWORD
```

Update `.env` (from `.env.production.example`):

| Variable | Requirement |
|----------|-------------|
| `ENVIRONMENT` | `production` |
| `SEED_ON_STARTUP` | `false` |
| `SECRET_KEY` | 32+ char random |
| `JWT_REFRESH_SECRET_KEY` | Different random |
| `POSTGRES_PASSWORD` | Strong, unique |
| `CORS_ORIGINS` | `https://app.yourdomain.com` only |
| `VITE_API_URL` | `https://api.yourdomain.com/api/v1` |

Verify:

```bash
python scripts/prod_readiness_check.py --env-file .env --base https://api.yourdomain.com
```

---

## 2. First-time bootstrap (empty database only)

```bash
docker compose -f docker-compose.prod.yml up -d postgres
npm run backend:wait-db
npm run backend:migrate
# ONE-TIME only if empty DB — then set SEED_ON_STARTUP=false immediately
SEED_ON_STARTUP=true docker compose -f docker-compose.prod.yml up -d backend
```

After seed smoke test, set `SEED_ON_STARTUP=false` and restart backend.

---

## 3. Create named accounts (replace seed users)

**Platform super admin** (not seed email):

```bash
cd backend
python -m app.manage create-super-admin \
  --email "platform.admin@CLIENTDOMAIN.com" \
  --password "STRONG_PASSWORD" \
  --name "Platform Administrator"
```

**Tenant users** (repeat per role):

```bash
python -m app.manage create-tenant-user \
  --email "store.admin@CLIENTDOMAIN.com" \
  --password "STRONG_PASSWORD" \
  --role "Admin" \
  --company PULSE-DEMO \
  --store DHK-01 \
  --name "Store Administrator"

python -m app.manage create-tenant-user \
  --email "manager@CLIENTDOMAIN.com" \
  --password "STRONG_PASSWORD" \
  --role "Store Manager" \
  --company PULSE-DEMO

python -m app.manage create-tenant-user \
  --email "cashier1@CLIENTDOMAIN.com" \
  --password "STRONG_PASSWORD" \
  --role "Cashier" \
  --company PULSE-DEMO

python -m app.manage create-tenant-user \
  --email "inventory@CLIENTDOMAIN.com" \
  --password "STRONG_PASSWORD" \
  --role "Inventory User" \
  --company PULSE-DEMO

python -m app.manage create-tenant-user \
  --email "auditor@CLIENTDOMAIN.com" \
  --password "STRONG_PASSWORD" \
  --role "Auditor" \
  --company PULSE-DEMO
```

Document final users in a **client-controlled password vault** (not this repository).

---

## 4. Disable seed demo users

```bash
docker compose exec backend python -m app.manage disable-demo-users --dry-run   # preview
docker compose exec backend python -m app.manage disable-demo-users             # apply
```

Disables: `admin@pulse.pos`, `manager@pulse.pos`, `cashier@pulse.pos`, `inventory@pulse.pos`, `auditor@pulse.pos`, `super@pulse.pos`.

---

## 5. Verification

| Check | Command / action |
|-------|----------------|
| Seed login blocked | `curl` login with `admin@pulse.pos` → 403 |
| Named admin works | Login with new admin email |
| Cashier RBAC | Cashier cannot approve purchase |
| Support access audited | SA-09 support session start/end |

---

## 6. Post-rotation

- Rebuild frontend if `VITE_API_URL` changed: `docker compose -f docker-compose.prod.yml build pulse-pos`
- Restart stack: `docker compose -f docker-compose.prod.yml up -d`
- Run `python scripts/docker_smoke_test.py --base https://api.yourdomain.com`
