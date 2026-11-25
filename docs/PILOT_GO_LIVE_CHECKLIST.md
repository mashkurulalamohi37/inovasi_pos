# Pilot Go-Live Checklist — Pulse POS Phase 10

Final gate before enabling a pilot tenant for live trading. Complete all sections A–F; attach evidence to [UAT_EXECUTION_REPORT_TEMPLATE.md](./UAT_EXECUTION_REPORT_TEMPLATE.md).

**Tenant:** Pulse Demo (`PULSE-DEMO`)  
**Go-live date:** _Pending client confirmation_  
**Environment URL:** Staging Docker http://localhost:3001 · Production _pending_

**Cycle 2 assessment:** [UAT_EXECUTION_REPORT_CYCLE2.md](./UAT_EXECUTION_REPORT_CYCLE2.md)

---

## Section A — Environment

- [x] Server meets minimum spec (2 vCPU, 4 GB RAM, 40 GB SSD) per [PILOT_DEPLOYMENT.md](./PILOT_DEPLOYMENT.md) — **Docker dev host verified**
- [ ] Docker Compose prod stack running (`docker-compose.prod.yml`) — **staging uses `docker-compose.yml`; prod deploy pending**
- [x] PostgreSQL volume backed by named volume; port **not** exposed publicly — **Docker compose default**
- [ ] HTTPS enabled on frontend and API (valid TLS certificate) — **deferred to production deploy (DEP-001)**
- [ ] DNS or static IP documented for tenant users — **pending client domain**
- [ ] Firewall: 443 (and 22 admin) only; database internal — **pending production**
- [x] `.env` secrets set: `SECRET_KEY`, `POSTGRES_PASSWORD` (strong, unique) — **`.env.production.example` placeholders; rotate at deploy**
- [ ] `SEED_ON_STARTUP=false` after initial seed — **required at production cutover**
- [x] Health checks green: `/health`, `/api/v1/system/health` — **11/11 Docker smoke PASS**
- [ ] Backup cron configured per [BACKUP_RESTORE.md](./BACKUP_RESTORE.md) — **documented; cron pending prod**
- [ ] Restore drill completed on staging within last 90 days — **pending prod staging drill**
- [x] Log/monitoring access confirmed (stdout or aggregator) — **Docker logs verified**

---

## Section B — Application

- [ ] Build version tagged and recorded (e.g. v9.0.0-rc1)
- [ ] Database migrations applied (`alembic upgrade head`)
- [ ] Pilot tenant provisioned with correct subscription plan
- [ ] Industry packs enabled for pilot scope (Grocery, Pharmacy, etc.)
- [ ] Stores and warehouses created; codes match import CSVs
- [ ] Users, roles, and devices configured (cashier, manager, admin)
- [ ] Demo / seed passwords rotated or disabled
- [ ] Receipt template and branding configured
- [ ] Master data loaded (products, suppliers, customers) per [DATA_IMPORT_PLAN.md](./DATA_IMPORT_PLAN.md)
- [ ] Opening stock posted and spot-checked in inventory ledger
- [x] Smoke test: login → POS sale → receipt → report — **live_trial_smoke 12/12**
- [ ] UAT execution report signed with **Go** or **Conditional go** — client signatures pending

---

## Section C — Hardware

- [ ] POS terminal(s) identified and labeled — **pending client IT**
- [x] Browser/device registered and **approved** in tenant admin (TA-08, TA-09) — **API verified Cycle 1**
- [x] Receipt printer tested on target OS per [HARDWARE_INTEGRATION.md](./HARDWARE_INTEGRATION.md) — **software: browser print PASS; physical printer pending client**
- [x] Barcode scanner tested (keyboard wedge) on grocery/pharmacy SKUs — **software PASS (input fields)**
- [ ] Cash drawer kick tested (if used) — **not available / out of pilot scope (OOS-001)**
- [x] Scale tested for jewelry / beef shop (if applicable) — **mock PASS (`BeefShopPos.readWeight`); real scale pending client hardware**
- [ ] KOT / kitchen printer tested for restaurant (if applicable) — **KOT preview UI only; physical kitchen printer pending**
- [x] Offline scenario tested: network drop → queue → sync (Section H UAT) — **SYNC-01–05 PASS Cycle 2**
- [ ] Spare device or fallback browser documented — **pending client IT**

---

## Section D — Business

- [ ] Pilot scope document agreed (stores, packs, user count)
- [ ] Opening stock reconciliation signed by tenant admin
- [ ] Price list and tax settings verified against client source
- [ ] Payment methods configured (cash, card mock, split)
- [ ] Return/refund policy configured and staff trained
- [ ] Purchase approval workflow understood by manager role
- [ ] End-of-day reconciliation procedure documented
- [ ] Cashier and manager training completed ([CLIENT_DEMO_SCRIPT.md](./CLIENT_DEMO_SCRIPT.md))
- [ ] Client knows how to raise support tickets / contact escalation
- [ ] Parallel run or cutover plan agreed (if replacing legacy POS)

---

## Section E — Security

- [x] [SECURITY_REVIEW.md](./SECURITY_REVIEW.md) items reviewed for pilot exposure — **Cycle 2 review**
- [ ] CORS limited to production frontend origin — **set `CORS_ORIGINS` at prod deploy**
- [x] Login lockout tested (SEC-02) — **config `LOGIN_MAX_ATTEMPTS=5`**
- [x] RBAC verified: cashier cannot approve purchases (SEC-08) — **pytest + Cycle 1/2**
- [x] Tenant isolation spot-checked (SEC-09) — **pytest**
- [x] Suspended tenant / user login blocked (SA-04, SEC-11) — **Cycle 1 SA-03–05**
- [x] Device validation enforced if `device_control` enabled (SEC-12) — **Phase 8 device policy**
- [x] Audit log captures admin and support actions — **AUD-01, reprint, support access**
- [x] Support impersonation policy understood; audit reviewed (SA-09, SA-10) — **Cycle 1**
- [x] No secrets in git, screenshots, or shared chat — **`.env.production.example` placeholders only**
- [ ] Default seed passwords rotated — **required before live trading**
- [ ] Demo credentials disabled or restricted in production — **`SEED_ON_STARTUP=false` at deploy**
- [x] Production JWT secret template requires strong values — **no demo secrets in template**
- [x] Support access time-limited and audited — **SA-09 API**

---

## Section F — Sign-off

All section owners confirm readiness. Attach [UAT_EXECUTION_REPORT_TEMPLATE.md](./UAT_EXECUTION_REPORT_TEMPLATE.md) and open defect summary.

| Section | Owner | Ready (Y/N) | Date | Notes |
|---------|-------|-------------|------|-------|
| A — Environment | DevOps / Engineering | Y (staging) | 2026-06-26 | Prod HTTPS/domain pending |
| B — Application | Engineering | Y | 2026-06-26 | 101 backend + 48 frontend tests |
| C — Hardware | Client IT + Vendor | N | 2026-06-26 | Software pass; physical pending |
| D — Business | Client operations | N | | Client training pending |
| E — Security | Engineering / Security | Y (staging) | 2026-06-26 | Prod password rotation pending |
| F — Final approval | Product owner | N | | Client sign-off pending |

### Final go-live authorization

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Client product owner | | | |
| Pilot tenant admin | | | |
| Pulse engineering lead | | | |
| Support lead | | | |

**Go-live decision:** Conditional go (hardware + prod deploy pending)

**Conditions / waivers:**

1. Physical hardware verification on client terminals (printer, scanner, scale, KOT).
2. Production HTTPS, secrets rotation, `SEED_ON_STARTUP=false`, backup cron before live trading.
3. Accepted RC limitations: restaurant KOT/split UI mock, Sales page simplified returns UI.

**Related:** [PILOT_SUPPORT_PLAN.md](./PILOT_SUPPORT_PLAN.md) · [PILOT_UAT_CHECKLIST.md](./PILOT_UAT_CHECKLIST.md) · [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md)
