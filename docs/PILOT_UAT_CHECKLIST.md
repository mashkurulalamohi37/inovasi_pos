# Pilot UAT Checklist — Phase 9 RC

User acceptance testing checklist for Pulse POS Release Candidate v9.0.0-rc1. Complete before pilot go-live.

**Environment:** Pilot/staging URL or `docker compose -f docker-compose.prod.yml up`

**Demo credentials (seed):** See [ENVIRONMENT.md](./ENVIRONMENT.md). Rotate before production.

**How to use:** Execute each scenario, record results in the blank columns, and attach screenshots for failures.

**Execution report:** Summarize results in [UAT_EXECUTION_REPORT_TEMPLATE.md](./UAT_EXECUTION_REPORT_TEMPLATE.md). Log defects in [DEFECT_TRACKER_TEMPLATE.md](./DEFECT_TRACKER_TEMPLATE.md).

---

## Execution metadata

| Field | Value |
|-------|-------|
| **UAT cycle number** | Cycle 1 + Cycle 2 complete |
| **Client name** | Pulse Demo pilot tenant |
| **Tester role** | Engineering QA; client sign-off pending |
| **Environment URL** | http://localhost:3001/login (Docker) |
| **Build version** | v9.0.0-rc1 |
| **Test date** | Cycle 1: 2026-06-26 · Cycle 2: 2026-06-26 |

**Reports:** [UAT_EXECUTION_REPORT_CYCLE1.md](./UAT_EXECUTION_REPORT_CYCLE1.md) · [UAT_EXECUTION_REPORT_CYCLE2.md](./UAT_EXECUTION_REPORT_CYCLE2.md)

### Pass / fail summary (combined)

| Status | Count |
|--------|-------|
| Passed | 90 |
| Failed | 0 |
| Blocked | 0 |
| Not run / deferred | 8 |

### Critical defects

| Defect ID | Module | Summary | Status |
|-----------|--------|---------|--------|
| — | — | None open | — |

### Go / no-go risk

**Pilot Go-Live Ready — Hardware Pending Conditions.** See [UAT_SIGNOFF_PACKAGE.md](./UAT_SIGNOFF_PACKAGE.md).

### Sign-off (execution)

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Lead tester | | | |
| Client representative | | | |
| QA / Engineering observer | | | |

---

## Section A — Super Admin

| Test ID | Scenario | Steps | Expected Result | Actual Result | Status | Tester | Date | Remarks |
|---------|----------|-------|-----------------|---------------|--------|--------|------|---------|
| SA-01 | Platform admin login | 1. Open login page<br>2. Enter `super@pulse.pos` / `super123` | Login succeeds; sidebar shows platform admin routes (Tenants, Subscriptions) | | | | | |
| SA-02 | List tenants | 1. Navigate to **Platform → Tenants**<br>2. Review tenant list | All seeded tenants visible with status, plan, store count | | | | | |
| SA-03 | Suspend tenant | 1. Select **Pulse Demo** tenant<br>2. Suspend tenant<br>3. Confirm | Tenant status = suspended; audit log entry created | | | | | |
| SA-04 | Suspended tenant login blocked | 1. Log out<br>2. Log in as `admin@pulse.pos` | Login rejected with tenant suspended message (403) | | | | | |
| SA-05 | Reactivate tenant | 1. Log in as super admin<br>2. Activate suspended tenant | Tenant active; tenant admin can log in again | | | | | |
| SA-06 | Subscription plans | 1. Open **Subscriptions**<br>2. Review Starter / Professional / Enterprise | Plans listed with limits (stores, devices, packs) | | | | | |
| SA-07 | Tenant subscription assignment | 1. Assign or change plan for pilot tenant<br>2. Save | Plan updated; usage limits reflect new plan | | | | | |
| SA-08 | Platform health overview | 1. Open platform dashboard or health view | Aggregated health for demo tenant visible | | | | | |
| SA-09 | Support impersonation start | 1. Start support access for a tenant<br>2. Note impersonation ID | Time-limited support session created; audit log `support_impersonation` | | | | | |
| SA-10 | Support impersonation end | 1. End support session | Session closed; further API calls use normal super-admin context | | | | | |
| SA-11 | Super admin cannot access tenant POS data without impersonation | 1. As super admin, attempt tenant-scoped sale without impersonation | Appropriate restriction or empty tenant context (platform routes only) | | | | | |

---

## Section B — Tenant Admin

| Test ID | Scenario | Steps | Expected Result | Actual Result | Status | Tester | Date | Remarks |
|---------|----------|-------|-----------------|---------------|--------|--------|------|---------|
| TA-01 | Tenant admin login | 1. Log in as `admin@pulse.pos` / `admin123` | Login succeeds; **Live** mode badge in sidebar | | | | | |
| TA-02 | User profile / me | 1. Open profile or call `/auth/me` | Email, company name, role **Admin**, permissions list returned | | | | | |
| TA-03 | Enable industry pack | 1. **Configuration → Industry packs**<br>2. Enable **Pharmacy** pack<br>3. Save | Pharmacy nav and POS routes appear | | | | | |
| TA-04 | Disable industry pack | 1. Disable a pack not in use<br>2. Save | Pack routes hidden; existing data retained | | | | | |
| TA-05 | Feature flags | 1. **Configuration → Feature flags**<br>2. Toggle wholesale pricing<br>3. Save | Flag persisted; POS reflects change on refresh | | | | | |
| TA-06 | Receipt template | 1. **Configuration → Receipt templates**<br>2. Edit header/footer<br>3. Set default | Receipt preview shows updated branding | | | | | |
| TA-07 | Role permissions | 1. **Configuration → Roles**<br>2. Review Cashier vs Admin permissions | Cashier lacks purchase.approve; Admin has full set | | | | | |
| TA-08 | Device registration list | 1. **Devices**<br>2. View pending devices | Registered browser device appears with status | | | | | |
| TA-09 | Approve device | 1. Approve pending POS device | Device status = approved; device can complete sales | | | | | |
| TA-10 | Block device | 1. Block a test device | Device blocked; sales from device rejected | | | | | |
| TA-11 | Approvals inbox | 1. Open **Approvals**<br>2. Review pending items | Manager approval queue loads | | | | | |
| TA-12 | Notifications | 1. Open notification bell | Notifications for approvals/system events visible | | | | | |
| TA-13 | Dynamic fields config | 1. **Configuration → Dynamic fields**<br>2. Add field for Grocery product | Field appears on product form and POS when enabled | | | | | |
| TA-14 | Health check | 1. **Configuration → Health check**<br>2. Run check | API, DB, catalog, subscription items reported | | | | | |
| TA-15 | Change password | 1. **Settings → Change password**<br>2. Set new password<br>3. Re-login | Old password fails; new password works | | | | | |

---

## Section C — POS Operation (All 7 Industries)

| Test ID | Scenario | Steps | Expected Result | Actual Result | Status | Tester | Date | Remarks |
|---------|----------|-------|-----------------|---------------|--------|--------|------|---------|
| POS-G01 | Grocery — cash sale | 1. **POS → Grocery**<br>2. Add 3 items<br>3. Pay cash<br>4. Complete | Invoice created; stock decremented; receipt shown | | | | | |
| POS-G02 | Grocery — barcode search | 1. Search product by barcode/SKU | Product found and added to cart | | | | | |
| POS-G03 | Grocery — wholesale price | 1. Enable wholesale flag<br>2. Apply wholesale on eligible item | Wholesale price applied per permission | | | | | |
| POS-P01 | Pharmacy — batch sale | 1. **POS → Pharmacy**<br>2. Add batch-tracked medicine<br>3. Complete sale | Batch/expiry captured; stock by batch updated | | | | | |
| POS-P02 | Pharmacy — restricted medicine | 1. Attempt restricted SKU as cashier<br>2. Retry as admin | Cashier blocked or approval required; admin can sell | | | | | |
| POS-F01 | Fashion — variant sale | 1. **POS → Fashion**<br>2. Select size/color variant<br>3. Complete | Variant stock decremented; receipt shows variant | | | | | |
| POS-E01 | Electronics — serial sale | 1. **POS → Electronics**<br>2. Sell serial-tracked item | Serial number recorded on invoice line | | | | | |
| POS-R01 | Restaurant — table order | 1. **POS → Restaurant**<br>2. Open table<br>3. Add items<br>4. Close bill | Table order saved; KOT/kitchen flow if enabled | | | | | |
| POS-J01 | Jewelry — weighted item | 1. **POS → Jewelry**<br>2. Add weight-based item<br>3. Complete | Weight × rate calculated correctly | | | | | |
| POS-B01 | Beef shop — cut sale | 1. **POS → Beef shop**<br>2. Sell by cut/weight | Cut metadata on line; stock movement recorded | | | | | |
| POS-U01 | Universal POS mode | 1. Open Universal POS<br>2. Complete mixed sale | Sale completes without industry-specific errors | | | | | |
| POS-02 | Hold and resume sale | 1. Add items<br>2. Hold sale<br>3. Resume and complete | Held sale restored; single invoice on complete | | | | | |
| POS-03 | Manager discount | 1. As cashier, request discount above limit<br>2. Manager approves | Discount applied after approval | | | | | |
| POS-04 | Receipt reprint | 1. Open sales history<br>2. Reprint receipt | Receipt renders; reprint audited | | | | | |
| POS-05 | Multi-payment split | 1. Split payment cash + card (mock) | Invoice shows split payments; totals balance | | | | | |
| POS-06 | Customer attach | 1. Attach customer to sale | Customer linked on invoice | | | | | |
| POS-07 | Idempotent sale (client_transaction_id) | 1. Submit same sale twice with same client ID | Second request does not duplicate invoice | | | | | |

---

## Section D — Inventory & Purchase

| Test ID | Scenario | Steps | Expected Result | Actual Result | Status | Tester | Date | Remarks |
|---------|----------|-------|-----------------|---------------|--------|--------|------|---------|
| INV-01 | Product create | 1. **Products → Add**<br>2. Enter SKU, name, price, pack | Product created; audit `product_create` | | | | | |
| INV-02 | Product search/filter | 1. Search by name/SKU<br>2. Filter by industry pack | Correct products returned | | | | | |
| INV-03 | Price change audit | 1. Edit product price | Audit `price_change` with old/new values | | | | | |
| INV-04 | Stock adjustment | 1. **Inventory → Adjustment**<br>2. Increase/decrease qty<br>3. Submit | Ledger entry; on-hand qty updated | | | | | |
| INV-05 | Stock ledger view | 1. Open stock ledger for product | Movements: sale, receive, adjustment visible | | | | | |
| INV-06 | Low stock indicator | 1. View products below reorder level | Low-stock items highlighted or listed | | | | | |
| PUR-01 | Create purchase order | 1. **Purchases → New PO**<br>2. Add supplier lines<br>3. Save draft | PO created in draft/pending status | | | | | |
| PUR-02 | Approve PO (admin) | 1. Approve PO as admin | Status approved; approval audited | | | | | |
| PUR-03 | Cashier cannot approve PO | 1. Log in as `cashier@pulse.pos`<br>2. Attempt approve | 403 forbidden | | | | | |
| PUR-04 | Receive GRN | 1. Receive against approved PO<br>2. Enter received quantities | Stock increased; ledger `purchase_receive` | | | | | |
| PUR-05 | Partial receive | 1. Receive partial qty on PO | PO partially received; remaining open | | | | | |
| PUR-06 | Supplier list | 1. View suppliers | Seeded suppliers available for PO | | | | | |
| PUR-07 | Beef batch receive | 1. Receive beef batch on PO | Batch record created with batch metadata | | | | | |

---

## Section E — Sales Return & Refund

| Test ID | Scenario | Steps | Expected Result | Actual Result | Status | Tester | Date | Remarks |
|---------|----------|-------|-----------------|---------------|--------|--------|------|---------|
| RET-01 | Full return | 1. **Sales → History**<br>2. Return full invoice<br>3. Confirm | Return document created; stock restored | | | | | |
| RET-02 | Partial return | 1. Return one line from multi-line sale | Partial return qty; partial stock restore | | | | | |
| RET-03 | Return reason | 1. Enter return reason code/note | Reason stored on return record | | | | | |
| REF-01 | Refund to cash | 1. Process refund on returned sale | Refund payment recorded; invoice balance zero | | | | | |
| REF-02 | Cashier refund approval | 1. As cashier, request refund above limit | Approval created; pending in manager inbox | | | | | |
| REF-03 | Manager approves refund | 1. Manager approves refund request | Refund completes; audit entries | | | | | |
| REF-04 | Electronics RMA link | 1. Return serial-tracked electronics item | Serial returned to available or RMA state | | | | | |
| REF-05 | Return receipt | 1. Print return/refund receipt | Return receipt shows original invoice ref | | | | | |

---

## Section F — Security

| Test ID | Scenario | Steps | Expected Result | Actual Result | Status | Tester | Date | Remarks |
|---------|----------|-------|-----------------|---------------|--------|--------|------|---------|
| SEC-01 | Invalid login | 1. Enter wrong password 1× | 401 invalid credentials | | | | | |
| SEC-02 | Account lockout | 1. Fail login 5× (default max) | 429 account temporarily locked | | | | | |
| SEC-03 | Lockout clears on success | 1. Wait lockout period or reset<br>2. Login with correct password | Login succeeds; failed count cleared | | | | | |
| SEC-04 | JWT access token | 1. Call API with valid Bearer token | 200 on authorized routes | | | | | |
| SEC-05 | Expired/invalid token | 1. Call API with tampered token | 401 unauthorized | | | | | |
| SEC-06 | Refresh token rotation | 1. Call `/auth/refresh` with valid refresh token<br>2. Retry old refresh token | New tokens issued; old refresh revoked | | | | | |
| SEC-07 | Logout revokes refresh | 1. Logout with refresh token<br>2. Attempt refresh | Refresh rejected | | | | | |
| SEC-08 | RBAC cashier denied | 1. As cashier, POST purchase approve | 403 forbidden | | | | | |
| SEC-09 | Tenant isolation | 1. Use tenant A token on tenant B resource ID | 404 or 403; no cross-tenant data leak | | | | | |
| SEC-10 | CORS enforcement | 1. Call API from unauthorized origin (browser) | CORS blocks or no credentials accepted | | | | | |
| SEC-11 | Suspended user account | 1. Disable user `is_active=false`<br>2. Attempt login | 403 account disabled | | | | | |
| SEC-12 | Device validation | 1. Sale from unapproved device (if device_control on) | Sale blocked until device approved | | | | | |
| SEC-13 | HTTPS redirect (prod) | 1. Hit HTTP URL on production | Redirect to HTTPS or connection refused | | | | | |
| SEC-14 | Production secret validation | 1. Start backend with weak SECRET_KEY in production | Startup fails with configuration error | | | | | |

---

## Section G — Reports & Audit

| Test ID | Scenario | Steps | Expected Result | Actual Result | Status | Tester | Date | Remarks |
|---------|----------|-------|-----------------|---------------|--------|--------|------|---------|
| REP-01 | Daily sales summary | 1. **Reports → Sales summary**<br>2. Select today | Totals match completed sales for date | | | | | |
| REP-02 | Payment summary | 1. **Payments / Reports** | Cash/card/mock splits reconcile | | | | | |
| REP-03 | Margin report (manager) | 1. Open margin report as admin | Margin visible per permission | | | | | |
| REP-04 | Margin denied (cashier) | 1. Open margin as cashier | Hidden or 403 | | | | | |
| REP-05 | Export report | 1. Export sales CSV/PDF (if enabled) | File downloads with tenant data only | | | | | |
| REP-06 | Industry reports — beef | 1. **Beef shop → Reports** | Batch/wastage/cut analytics load | | | | | |
| AUD-01 | Audit log list | 1. **Audit logs**<br>2. Filter by action | Login, product_create, price_change visible | | | | | |
| AUD-02 | Audit tenant scope | 1. Review audit as tenant admin | Only own company events shown | | | | | |
| AUD-03 | Reprint audited | 1. Reprint receipt | Audit action for reprint | | | | | |
| AUD-04 | Purchase approval audited | 1. Approve PO | Audit entry with PO reference | | | | | |
| AUD-05 | Support impersonation audited | 1. Review audit after support session | start/end impersonation logged | | | | | |

---

## Section H — Offline Sync

| Test ID | Scenario | Steps | Expected Result | Actual Result | Status | Tester | Date | Remarks |
|---------|----------|-------|-----------------|---------------|--------|--------|------|---------|
| SYNC-01 | Offline queue sale | 1. DevTools → Network offline<br>2. Complete POS sale | Sale queued locally; UI shows pending sync | | | | | |
| SYNC-02 | Sync on reconnect | 1. Restore network<br>2. Open Sync Center or wait auto-sync | Queued sale posts to API; duplicate prevented | | | | | |
| SYNC-03 | Sync center status | 1. **Sync Center** | Pending/failed/synced counts accurate | | | | | |
| SYNC-04 | Failed sync retry | 1. Force API error on sync<br>2. Retry from Sync Center | Retry succeeds after API restored | | | | | |
| SYNC-05 | client_transaction_id dedup | 1. Sync same queued sale twice | Single invoice on server | | | | | |
| SYNC-06 | Catalog cache offline | 1. Offline: browse POS catalog | Cached products available from last sync | | | | | |
| SYNC-07 | Demo mode offline (no backend) | 1. Enable demo mode (no login)<br>2. Complete sale offline | Local-only sale; no API calls | | | | | |
| SYNC-08 | Live mode requires backend | 1. Logged-in Live mode offline | Sales queue; no silent data loss | | | | | |

---

## Sign-off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Product Owner | | | |
| Pilot Tenant Admin | | | |
| QA Lead | | | |
| Engineering | | | |

**Related docs:** [RELEASE_NOTES_PHASE_9.md](./RELEASE_NOTES_PHASE_9.md), [PILOT_DEPLOYMENT.md](./PILOT_DEPLOYMENT.md), [CLIENT_DEMO_SCRIPT.md](./CLIENT_DEMO_SCRIPT.md)
