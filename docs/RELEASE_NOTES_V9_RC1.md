# Release Notes — Pulse POS v9.0.0-rc1 (Final)

**Date:** 2026-06-26  
**Status:** **Release Candidate Verified**  
**Pilot readiness:** Pilot UAT Ready (internal Docker + API verification complete; client UAT pending)

---

## Docker verification result

| Item | Status |
|------|--------|
| `docker compose up --build` | **PASS** (after Phase 10 fixes) |
| PostgreSQL + Alembic migrate + seed | **PASS** |
| Backend health | **PASS** |
| Frontend SSR login page | **PASS** (http://localhost:3001/login) |
| API smoke test (11 checks) | **PASS** |

Full report: [DOCKER_VERIFICATION_REPORT.md](./DOCKER_VERIFICATION_REPORT.md)

---

## Test summary

| Suite | Count | Status |
|-------|-------|--------|
| Backend (pytest) | 77 | PASS |
| Frontend (vitest) | 48 | PASS |
| Combined | 125 | PASS |
| Docker API smoke | 11 | PASS |
| Performance smoke | `npm run perf:smoke` | PASS (when backend on :8000) |

---

## UAT status

| Phase | Status |
|-------|--------|
| Internal API / Docker verification | **Complete** |
| Client UAT execution | **Pending** |
| Checklist | [PILOT_UAT_CHECKLIST.md](./PILOT_UAT_CHECKLIST.md) |
| Report template | [UAT_EXECUTION_REPORT_TEMPLATE.md](./UAT_EXECUTION_REPORT_TEMPLATE.md) |

---

## Phase 10 deliverables

- Docker verification report
- UAT execution template + updated checklist metadata
- Defect tracker template
- Pilot go-live checklist
- Data import plan + CSV samples (`docs/samples/`)
- Pilot support plan
- Import API stubs (`/api/v1/import/*`, `/app/import`)
- Live mode fixes: Overview dashboard uses API; Categories/Import pages; SSR guards

---

## Known limitations

| Area | Limitation |
|------|------------|
| **Payments** | Cash / mock card only — no external gateway |
| **Notifications** | In-app only — no SMS/email |
| **Hardware** | Software-ready; per-client driver testing required |
| **Bulk CSV import** | Stub API only — full parser in v9.1 |
| **Docker frontend port** | Uses **3001** when local dev occupies 3000 |
| **Overview charts** | Live mode links to Reports; demo shows sample charts |

---

## External integration status

| Integration | Status |
|-------------|--------|
| Payment gateway | Not connected |
| SMS / WhatsApp / Email | Not connected |
| Fiscal printer | Not connected |
| Barcode / receipt printer / scale | UI-ready, hardware not certified |

See [HARDWARE_INTEGRATION.md](./HARDWARE_INTEGRATION.md).

---

## Production restrictions

- Set `ENVIRONMENT=production`, strong `SECRET_KEY` + `JWT_REFRESH_SECRET_KEY`
- Set `SEED_ON_STARTUP=false` — disable demo credentials
- Restrict CORS to pilot domain
- Use `docker-compose.prod.yml` + [PILOT_DEPLOYMENT.md](./PILOT_DEPLOYMENT.md)

---

## Demo credentials (development seed only)

| Role | Email | Password |
|------|-------|----------|
| Super Admin | super@pulse.pos | super123 |
| Admin | admin@pulse.pos | admin123 |

---

## Go-live recommendation

| Label | When |
|-------|------|
| **Release Candidate Verified** | ✅ Now — Docker + automated tests pass |
| **Pilot UAT Ready** | ✅ Internal verification complete; begin client UAT |
| **Pilot Go-Live Ready** | After client UAT sign-off ([PILOT_GO_LIVE_CHECKLIST.md](./PILOT_GO_LIVE_CHECKLIST.md)) |
| **Production Ready** | After hardware/payment/SMS integrations per client |

**Recommendation:** Proceed to controlled pilot UAT with one tenant. Do not disable seed credentials until production env is configured.

---

## Support

See [PILOT_SUPPORT_PLAN.md](./PILOT_SUPPORT_PLAN.md).
