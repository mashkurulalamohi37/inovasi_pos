# Client Demo Script — Pulse POS Phase 9 RC

Presentation-ready guide for sales demos, pilot kickoffs, and investor walkthroughs.

---

## Demo objective

Demonstrate that Pulse POS is a **multi-tenant SaaS retail platform** with one unified core and **seven industry packs** (Grocery, Pharmacy, Fashion, Electronics, Restaurant, Jewelry, Beef shop). Show end-to-end flow: POS sale → inventory → purchase → return → reports → platform governance → offline resilience.

**Outcome for audience:** Confidence that Pulse can run a pilot store on Docker/PostgreSQL with audit, RBAC, subscriptions, and vertical-specific POS without custom code per industry.

---

## Target audience

| Audience | Focus areas |
|----------|-------------|
| Retail owners / GMs | POS speed, receipts, returns, industry packs |
| IT / operations | Docker deploy, health checks, backup, security |
| Finance | Reports, payments summary, subscription tiers |
| Platform buyers | Multi-tenant SaaS, super admin, device control |

---

## Duration

**45–60 minutes** (6 acts below). Allow 10 minutes buffer for Q&A.

| Act | Topic | Time |
|-----|-------|------|
| 1 | Platform story & login | 5 min |
| 2 | POS sale (multi-industry) | 12 min |
| 3 | Back office | 12 min |
| 4 | Configuration | 8 min |
| 5 | SaaS & governance | 12 min |
| 6 | Resilience & close | 8 min |

---

## Demo accounts

| Role | Email | Password | Use in demo |
|------|-------|----------|-------------|
| Super Admin | `super@pulse.pos` | `super123` | Acts 5–6 (platform routes) |
| Tenant Admin | `admin@pulse.pos` | `admin123` | Acts 2–4 (primary narrator account) |
| Cashier | `cashier@pulse.pos` | `cashier123` | RBAC contrast (optional second browser) |
| Store Manager | (seeded if enabled) | — | Approval workflows |

**Seed tenant:** Pulse Demo (`PULSE-DEMO`). **Mode:** Live (backend-connected) — confirm **Live** badge in sidebar after admin login.

> Change or disable seed credentials before any production launch. See [ENVIRONMENT.md](./ENVIRONMENT.md).

---

## Business story (narrative hook)

> *"Imagine **Green Valley Grocery**, a small chain that also runs a pharmacy counter and a beef counter at one location. They need one system: cashiers who cannot change prices, managers who approve big discounts, owners who see daily sales on phone, and HQ who provisions new stores without redeploying software. Pulse gives them one login, industry-specific POS screens, and a platform team that can suspend a tenant or help via audited support access."*

Use this story to transition between grocery sale → pharmacy batch → beef cut → back-office purchase → super-admin tenant view.

---

## Pre-demo checklist

1. Stack running: `docker compose up --build` or hosted pilot URL from [PILOT_DEPLOYMENT.md](./PILOT_DEPLOYMENT.md)
2. Health: `curl http://localhost:8000/health` and `GET /api/v1/system/health` → database `connected`
3. Browser: Chrome or Edge, 1920×1080 or presenter laptop mirrored
4. Second window: incognito for cashier role (optional)
5. Receipt preview tested once before audience arrives
6. Disable OS notifications and email popups

---

## Act 1 — Platform story (5 min)

### Steps

1. Open landing / login page
2. Log in as **admin@pulse.pos**
3. Point out sidebar: **Live** badge, industry nav, Sync Center, System health

### Talking points

- Multi-tenant SaaS: many brands, one codebase
- Industry packs toggled per tenant — no fork per vertical
- Demo mode vs Live mode: Live uses PostgreSQL and full audit; Demo is localStorage-only fallback for prospects without backend

### Show

- Clean login → dashboard or POS hub
- Industry pack icons: Grocery, Pharmacy, Fashion, Electronics, Restaurant, Jewelry, Beef shop

---

## Act 2 — POS sale (12 min)

### Steps

1. **POS → Grocery** — add 3 items, apply small discount (manager path if needed)
2. Complete **cash** sale → receipt preview / print dialog
3. **POS → Pharmacy** — sell batch-tracked item; mention expiry on receipt
4. **POS → Fashion** — pick size/color variant
5. (Optional 30 sec each) Electronics serial, Restaurant table, Jewelry weight, Beef cut

### Talking points

- Sub-second catalog search with pagination (50 items default)
- `client_transaction_id` — safe offline replay, no duplicate invoices
- Cashier vs manager permissions on discount and restricted pharmacy SKUs
- Receipt templates configurable per tenant (brand, footer, tax lines)

### Risk notes

- Empty catalog → confirm Live mode and products API (`/api/v1/products`)
- Slow search → check network; run `npm run perf:smoke` on API host

---

## Act 3 — Back office (12 min)

### Steps

1. **Products** — search, filter by pack, show price edit (audit trail)
2. **Purchases** — create PO → approve (as admin) → receive GRN
3. **Inventory / Stock ledger** — show movement after receive and earlier sale
4. **Sales history** — partial return on Act 2 invoice
5. **Payments & Reports** — daily sales summary; reconcile with POS totals

### Talking points

- Full purchase workflow with RBAC (cashier cannot approve PO)
- Stock ledger is source of truth for on-hand qty
- Returns restore stock; refunds may require manager approval for cashier role

### Risk notes

- 403 on purchase → switch to admin account
- GRN without approved PO → demonstrate correct workflow instead

---

## Act 4 — Configuration (8 min)

### Steps

1. **Industry packs** — enable/disable a pack; show nav update
2. **Receipt templates** — edit header, set default
3. **Feature flags** — wholesale price, device control
4. **Role permissions** — contrast Cashier vs Admin matrix
5. **Dynamic fields** — show one grocery product field (optional)

### Talking points

- Starter vs Enterprise subscription limits on pack count and devices (reference Act 5)
- Feature flags per pack without redeploy
- Health check surfaces catalog gaps before store opens

---

## Act 5 — SaaS & governance (12 min)

### Steps

1. Log out admin
2. Log in **super@pulse.pos**
3. **Platform → Tenants** — list, show suspend/activate (do not leave suspended for closing demo)
4. **Subscriptions** — Starter / Professional / Enterprise limits
5. **Devices** — show browser POS registration → approve as tenant admin (quick switch or pre-approved)
6. **Approvals & notifications** — manager inbox if cashier refund was queued in Act 3
7. (Optional) **Support impersonation** — start/end with audit mention

### Talking points

- Tenant isolation: every query scoped by `company_id`
- Suspended tenant cannot log in (except platform admin)
- Device registration for browser POS today; hardware paths in [HARDWARE_INTEGRATION.md](./HARDWARE_INTEGRATION.md)
- Support access is time-boxed and fully audited

### Risk notes

- Super admin 403 on tenant routes → expected; use impersonation or switch to admin for POS
- Tenant list empty → run seed once (`SEED_ON_STARTUP=true` or `python -m app.manage seed`)

---

## Act 6 — Resilience & close (8 min)

### Steps

1. **System health** — API + DB status in sidebar
2. **Offline demo** — DevTools → Network offline → queue one sale → reconnect → Sync Center
3. Mention **backup script** (`scripts/backup_postgres.sh`) and [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md)
4. Recap slide or verbal: one core, seven packs, SaaS-ready pilot

### Talking points

- Offline queue with idempotent sync
- Docker Compose pilot path; HA path for scale (managed Postgres, load balancer)
- Phase 9 RC: 74 backend + 48 frontend automated tests; UAT checklist for pilot sign-off

### Closing next steps

1. Provision pilot tenant (onboarding API or super admin)
2. IT review [PILOT_DEPLOYMENT.md](./PILOT_DEPLOYMENT.md) and [SECURITY_REVIEW.md](./SECURITY_REVIEW.md)
3. Schedule UAT using [PILOT_UAT_CHECKLIST.md](./PILOT_UAT_CHECKLIST.md)
4. Target go-live date and training session for cashiers

---

## Backup demo mode (no backend)

If API is down or prospect has no network to your host:

1. Open app without logging in
2. Enable **Demo mode** from login page or localStorage: `localStorage.setItem('pulse.demoMode', 'true')`
3. Navigate POS — catalog and sales use `industry-mock` data
4. Explain: *"This is a UI sandbox; pilot and production use Live mode with PostgreSQL."*
5. Do **not** claim demo sales appear in reports or sync to cloud

To exit demo mode: log in (clears demo flag) or `localStorage.removeItem('pulse.demoMode')`.

---

## Q&A preparation

| Question | Answer |
|----------|--------|
| Payment gateways? | Cash and mock card in RC; external PSP integration planned post-pilot |
| SMS / email receipts? | Not in RC; receipt print/preview only |
| Hardware (scanner, printer)? | Software-ready; driver testing per client — see HARDWARE_INTEGRATION.md |
| Data residency / backup? | PostgreSQL on your VPS; daily `backup_postgres.sh`; restore tested quarterly |
| How many stores? | Subscription-tier limits; Enterprise multi-store |
| Mobile POS? | Browser POS today; responsive layout; native app not in RC |
| GDPR / audit? | Audit logs for admin actions, login, price changes, impersonation |
| Upgrade path? | Pull new image tag, migrate DB, smoke test — see PILOT_DEPLOYMENT.md |

---

## Troubleshooting during demo

| Issue | Fix |
|-------|-----|
| Login fails | Check `/health`; verify seed ran |
| Empty catalog | Live mode + backend products API |
| 403 on purchase | Use admin, not cashier |
| Super admin 403 on POS | Use admin account or support impersonation |
| CORS errors | `CORS_ORIGINS` must include frontend URL |
| Slow API | Run `python scripts/perf_smoke_test.py --warn-ms 2000` |
| White screen after deploy | Rebuild frontend with correct `VITE_API_URL` |

---

## Optional deep dives (if time or audience asks)

- Beef shop batches, wastage, cut reports
- Electronics serial tracking and RMA returns
- Restaurant KOT and table management
- Audit log export and filter by action
- Public onboarding wizard (`/onboarding`)

---

**Related:** [RELEASE_NOTES_PHASE_9.md](./RELEASE_NOTES_PHASE_9.md) · [ENVIRONMENT.md](./ENVIRONMENT.md) · [DEPLOYMENT.md](./DEPLOYMENT.md)
