# Playwright E2E (Phase 8A)

## Architecture

```
Browser / APIRequest
  → Playwright (@smoke)
    → Vite frontend (optional UI tests)
    → FastAPI (real)
      → PostgreSQL (real)   # CI e2e-smoke job
```

**No MSW** for production-critical smoke. Prefer APIRequest against live FastAPI when UI is not yet started; UI login tests require `PLAYWRIGHT_BASE_URL`.

## Classification

| Class | Tag | Contents | Gate |
| --- | --- | --- | --- |
| P0 Smoke | `@smoke` | Auth, sale, purchase lifecycle, oversell 409, health | PR `e2e-smoke` |
| P1 Vertical | `@p1` | Industry API smoke (pharmacy/electronics/jewelry/restaurant) | Nightly |
| P2 Extended | — | Full UI vertical flows | Release |

## Local

```bash
# Terminal A — API on PostgreSQL + seed
cd backend
set DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/pulse_pos_test
python -m app.manage migrate
python -m app.manage seed
python -m uvicorn app.main:app --port 9001

# Terminal B
npm ci
npx playwright install chromium
set E2E_API_URL=http://127.0.0.1:9001/api/v1
npm run e2e:smoke
```

## Honesty

- Chromium only in CI today — do not claim Firefox/WebKit compatibility.
- Vertical specs are API smoke unless UI is asserted.
- Double-submit protection is asserted on sale `client_transaction_id` idempotency.
