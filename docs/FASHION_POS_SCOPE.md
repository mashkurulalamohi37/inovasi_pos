# Fashion & Garments Retail POS — Scope & Gap Matrix

**Date:** 2026-07-17  
**Product:** Pulse POS (`omni-pos-core`)  
**Edition target:** Fashion / Garments Retail (no manufacturing)  
**Release label until gates pass:** `Pilot / Conditional GA`

This document is the living requirement gap matrix for the Fashion master prompt.  
Statuses: **Complete** · **Partial** · **Missing** · **Incorrect** · **Unsafe**

---

## Architectural rules (must preserve)

| Rule | Status |
|------|--------|
| Stock only via `inventory_service.record_stock_movement()` | Complete (enforced + fashion mirror documented) |
| Tenant isolation by `company_id` | Complete (generic); fashion routes now also gated on frontend |
| Store-scope via assigned stores | Complete (generic `store_scope`) |
| Industry pack DB-driven | Complete |
| Fashion `industry_pack` on products/sales | Complete |
| POS Mode = UI only; data server-authoritative | Complete (with prior Universal POS live catalog fix) |
| No duplicate stock engines | Complete |
| Backend totals authoritative | Partial (POS preview still client-side until checkout) |

See also: [FASHION_STOCK_AUTHORITY.md](./FASHION_STOCK_AUTHORITY.md) (Option B bridge — variant stock mirror).

---

## Gap matrix (requirement → status)

| # | Requirement area | Status | Evidence | Production gap |
|---|------------------|--------|----------|----------------|
| 4 | Fashion product master (full attributes) | **Partial** | Meta contract + validation (`fashion_catalog_service`); expanded Product Master fields | Images, dedicated columns optional |
| 5 | Size/color variant matrix | **Complete** | `POST .../variants/generate-matrix`; BO Generate matrix UI; unique size×color + barcode indexes | — |
| 6 | Fashion product UI (tabs, matrix, bulk edit) | **Partial** | Variants page matrix generator + expanded fashion form fields + bulk activate/deactivate (checkbox selection + bulk action bar on `/app/fashion/variants`) | Full unified product+variant workspace (tabs) still separate from `/app/products`; bulk actions limited to activate/deactivate for now |
| 7 | Multi-store / warehouse / counter | **Complete** | `Store`, `Warehouse`, `Counter`; stock scoped | Stock *location* grain optional later |
| 8 | Variant-level inventory | **Partial** | Ledger/reservation/`variant_id` on GRN + Option B mirror; damaged stock holding bucket (`StockBalance.qty_damaged` — mark/restore/write-off, `/inventory/damage*`) + two-phase in-transit transfers (`StockBalance.qty_in_transit`, `StockTransfer.status`, `/inventory/transfer/dispatch` + `/receive`); UI at `/app/inventory/damage-transit` | Option A: `StockBalance.variant_id` full consolidation deliberately deferred (see FASHION_STOCK_AUTHORITY.md) — large, high-blast-radius refactor across every industry's inventory movement code, not fashion-specific |
| 9 | Opening stock & data import | **Complete** | Live products/suppliers/customers/opening-stock + fashion-variants | Pharmacy/electronics CSV still planned |
| 10 | Purchase → approve → GRN → payment | **Complete** | Fashion requires `variant_id`; return posts variant ledger | Pack-ratio / size-run optional |
| 11 | Purchase approvals | **Partial** | Approve permission + Approvals page | Configurable amount/store rules; no fake rows when live |
| 12 | Fashion POS lane | **Partial** | Live variants + barcode + campaigns; MSP enforced server-side | Loyalty; trial room |
| 13 | Checkout + idempotency | **Complete** | Idempotent sale + last-unit oversell blocked | Dual-cashier PG matrix optional |
| 14 | Pricing / discount authority | **Complete** | MSP / max discount / manager override + audit; store price via StorePolicy; effective-dated price lists (`price_list_entry` — scheduled start/end, store-specific beats company-wide, `POST /pricing/price-list`, UI at `/app/fashion/price-list`) | — |
| 15 | Promotions / offers | **Complete** | Offer CRUD + POS % apply + BYGO + stacking (`POST /fashion/offers/preview`) | — |
| 16 | Customers | **Complete** | Customer CRUD + credit + preferred_size + loyalty points (earn on sale, redeem at POS via `Customer.loyalty_points` / `customer_loyalty_ledger`) | Loyalty UI currently Fashion POS only; other industry POS screens don't surface it yet (backend is generic) |
| 17 | Payments | **Complete** (generic) | Multi-method on sale | Gift card / full MFS refs |
| 18 | Cashier shift / drawer | **Complete** | `CashierShift` open/close/variance; optional require-open policy; UI Shift dialog; **blind close** (`current_shift` never reveals running expected cash to the cashier — only after they submit their count, or to a manager); **multi-drawer** (`counter_id` already scoped multiple simultaneous shifts; new manager-only `/app/pos/drawer-status` board surfaces all open drawers store-wide with live expected cash + cashier name) | — |
| 19 | Returns & size/color exchange | **Complete** | Same-product size×color validation; damaged non-restock; cross-style exchange | — |
| 20 | Void / correction | **Complete** | `POST /sales/{id}/void` — full restock + refund reversal, gated on `pos.void_sale`; without it, routes to the existing approval queue (same pattern as refund). Time-boxed via `pos.void_window_minutes` store policy (default 120min); blocked if the sale already has a return/refund. | Frontend UI (button/modal) not yet built — API-only for now |
| 21 | Receipts | **Partial** | Pack templates; size/color on print extras | Receipt snapshot must include line meta (fixed in Phase 1) |
| 22 | Document numbering | **Complete** | `NumberSeries` | — |
| 23 | Fashion reports | **Complete** | Size/color sales, sell-through, variant stock + campaigns | — |
| 24 | Fashion dashboard | **Complete** | Fashion KPI strip on overview when pack enabled | — |
| 25 | Fashion-specific RBAC | **Complete** | `fashion.view` / `fashion.manage` / `fashion.report` in `rbac.py` | Offer CRUD still optional |
| 26 | Tenant isolation tests | **Partial** | Fashion vertical tests include isolation | Expand cross-tenant matrix |
| 27 | Audit trail | **Partial** | Generic audit writes | Fashion price/variant change detail |
| 28 | Standardized errors | **Partial** | HTTPException detail | Error codes + correlation ID contract |
| 29 | Concurrency | **Partial** | Fashion last-unit sequential gate; PG Option B authority | Dual-thread PG fashion matrix |
| 30 | Migrations | **Partial** | Through `028_cashier_shifts` | Option A variant stock migration later |
| 31 | Seed richness | **Partial** | 3 styles (FASH-001..003) × multi size×color | Larger catalog + fashion POs/sessions |
| 32 | Offline | **Partial** | Sync Center queue | **Mode A (online-only)** for Fashion production release |
| 33 | Frontend quality | **Partial** | Live hooks gated | Remove dead loyalty/trial; fix remaining TS |
| 34–39 | Tests / CI / Docker / backup / monitor / perf | **Partial** | Fashion pytest `-m fashion` + e2e API smoke; platform DR/obs docs | Remote CI green + prod backup schedule |
| 40–42 | Prod data / UAT / docs | **Partial** | Scope + Fashion GA checklist | Full UAT pack evidence |

---

## Phase implementation order

| Phase | Focus | Gate |
|-------|--------|------|
| **1** | Audit, route/RBAC fixes, sale line meta, no live mocks, docs | Local green on fashion smoke |
| **2** | Catalog attributes + matrix generator | Variant CRUD + uniqueness tests |
| **3** | Purchase/inventory/opening stock/import | PO→GRN→stock E2E |
| **4** | POS pricing, cashier session, checkout | Concurrent sale + shift |
| **5** | Returns/exchanges hardened | Size/color exchange E2E |
| **6** | Reports + dashboard + permissions | Report reconcile |
| **7** | Import, CI, Docker, backup, monitoring | Production gates (§46) |

---

## Offline decision (production)

**Fashion production release = Mode A (online-only POS).**  
Checkout blocked when API unavailable; Sync Center remains for non-Fashion offline experiments until Mode B tests pass.

---

## Phase 1 changes (this iteration)

| Change | Files |
|--------|-------|
| Live route guard uses full `ROUTE_PERMISSIONS` (includes `/app/fashion`) | `src/routes/app.tsx` |
| Exchange gate `pos.refund`; Alteration gate `fashion.manage` | `app.fashion.exchange.tsx`, `app.fashion.alteration.tsx` |
| Typed `ApiFashionOffer`; sale lines include `meta` | `use-api-config.ts`, `sales_service._sale_out` |
| Stronger `fashion.manage` → backend codes | `backend-permissions.ts` |
| Gap matrix published | this file |
| Module status updated | `MODULE_STATUS.md` |

**Not done in Phase 1:** cashier shifts, variant stock Option A, import, offer CRUD, full product attribute schema, Fashion E2E suite.

---

## Phase 2 changes

| Change | Files |
|--------|-------|
| Fashion meta contract + normalize/validate on create/update | `fashion_catalog_service.py`, `commerce.py`, `product_service.py` |
| Size×color matrix generator API | `POST /products/{id}/variants/generate-matrix` |
| Tenant uniqueness: size×color required; 409 on duplicate | `assert_fashion_variant_unique`, migration `027` |
| Unique indexes: company+SKU, variant barcode, size×color | `027_fashion_catalog_hardening.py` |
| Matrix UI on Fashion Variants | `app.fashion.variants.tsx`, `useGenerateFashionVariantMatrix` |
| Expanded fashion Product Master fields | `product-form-registry.ts` |
| Seed: FASH-001..003 + multi size×color variants | `seed.py` |
| Tests | `test_fashion_catalog_phase2.py` |

**Gate:** Variant CRUD + uniqueness + matrix tests green.

---

## Phase 3 changes

| Change | Files |
|--------|-------|
| Fashion PO/GRN require `variant_id`; return posts variant ledger | `purchase_service.py` |
| Purchase out includes size/color/variant_code | `_purchase_out` |
| Opening stock helper + live import | `post_opening_stock`, `import_service.py`, `data_import.py` |
| Seed fashion PO-1002 multi-variant lines | `seed.py` |
| PO form size×color picker; detail/GRN show variant | `PurchaseForms.tsx`, `PurchaseDetailDrawer.tsx` |
| Sample opening stock CSV with variant columns | `docs/samples/opening_stock.csv` |
| Tests | `test_fashion_procurement_phase3.py` |

**Gate:** Fashion PO→approve→GRN with ledger `variant_id` + Option B mirror; opening-stock import green.

**Deferred:** size-run/pack-ratio rules; Option A `StockBalance.variant_id`; stock bin locations.

---

## Phase 4 changes

| Change | Files |
|--------|-------|
| MSP / max-discount / manager override + audit | `sales_policy_service.py`, `sales_service.py` |
| Store list price via `StorePolicy` `unit_price:{id\|sku}` | `resolve_list_price` |
| Cashier shift open/close/variance + optional require | `CashierShift`, `shift_service.py`, `/pos/shifts`, migration `028` |
| Sales attach `shift_id` when open | `SalesInvoice.shift_id` |
| Shift UI (header → Shift report) | `ShiftDialog.tsx`, `AppLayout.tsx` |
| Fashion seed MSP / max_discount_pct | `seed.py` |
| Tests | `test_fashion_pos_phase4.py` |

**Gate:** MSP reject / override audit; shift open→sale→close; last-unit second sale 409.

**Deferred:** blind close, Option A variant stock grain, full dual-thread PG fashion matrix.

---

## Phase 5 changes

| Change | Files |
|--------|-------|
| Fashion exchange: same product + required `variant_id` | `sales_return_service.py` |
| Fashion return conditions `saleable\|damaged\|defective` | non-restock for damaged/defective + audit |
| `ExchangeIn.condition` wired | `schemas/operations.py` |
| Exchange UI filters same-product size×color | `app.fashion.exchange.tsx`, `SalesForms.tsx` |
| Return UI condition for fashion | `SalesReturnForm` |
| Tests | `test_fashion_returns_phase5.py` |

**Gate:** size A→B same product; damaged no restock; variant required.

**Update (2026-07-22, commit 1b66d9c):** same-product exchange restriction was intentionally
relaxed — cross-product/cross-style exchange is now supported (e.g. shirt for trousers),
not just size×color within one style. `test_fashion_cross_product_exchange_rejected` was
renamed to `test_fashion_cross_product_exchange_allowed` to match; see also
`test_cross_product_exchange` in `test_tailoring_improvements.py`.

**Deferred:** supervisor void; damaged stock bin (Option A).

---

## Phase 6 changes

| Change | Files |
|--------|-------|
| Size/color sales + sell-through + variant stock reports | `report_service.py`, `reports/registry.py`, `api/v1/reports.py` |
| Fashion dashboard KPI endpoint | `GET /reports/fashion-dashboard-kpi`; overview KPI strip |
| Dedicated RBAC `fashion.view` / `fashion.manage` / `fashion.report` | `rbac.py`, industry routes, `backend-permissions.ts` |
| Campaign report items_sold = line qty | `fashion_campaigns` |
| Tests | `test_fashion_reports_phase6.py` |

**Gate:** size/color report reconciles to sale + ledger out; dashboard returns KPIs; cashier can view offers but not manage alterations.

**Deferred:** BYGO/stacking; Option A `StockBalance.variant_id`.

---

## Phase 7 changes

| Change | Files |
|--------|-------|
| Live product/supplier/customer import (upsert + dry_run) | `import_service.py`, `data_import.py` |
| Fashion offer CRUD (POST/PATCH + BO UI) | `industry.py`, `app.fashion.offers.tsx` |
| Pytest `fashion` marker + CI step | `pytest.ini`, `conftest.py`, `.github/workflows/ci.yml` |
| Fashion API smoke in Playwright | `e2e/vertical-api-smoke.spec.ts` |
| Fashion GA checklist (links ops docs) | this file, `GA_READINESS.md`, `DATA_IMPORT_PLAN.md` |
| Tests | `test_fashion_phase7_import.py` |

**Gate:** import status `mode=live`; fashion product upsert; offer create/deactivate; `pytest -m fashion` green.

**Release label:** remains **`Pilot / Conditional GA`** until remote CI is green and production backup schedule + monitoring are evidenced (see Fashion GA checklist below). Promote to **`Production Ready / General Availability`** only after those platform gates pass.

**Deferred:** BYGO/stacking; Option A variant stock grain; full browser Fashion POS UI nightly.

---

## Phase 7B changes (GA closeout slice)

| Change | Files |
|--------|-------|
| Live `POST /import/fashion-variants` | `import_service.py`, `data_import.py` |
| Fashion POS sale Playwright `@smoke` | `e2e/fashion-pos-sale.spec.ts` |
| Local Fashion GA gate script | `scripts/fashion_ga_gate.py` |
| Tests | `test_fashion_variants_import_phase7b.py` |

**Gate:** fashion-variants in `live_modules`; sale smoke with `meta.variant_id`; `python scripts/fashion_ga_gate.py` exit 0.

**Release label:** still **`Pilot / Conditional GA`** — remote CI + prod backup/monitor evidence remain unchecked.

---

## Fashion edition production gates (§46 checklist)

Complete **platform** ops plus Fashion-specific gates before flipping the release label.

### Must be green (Fashion)

- [x] Fashion API suite: `pytest -m fashion` (Phases 1–7B)
- [x] Catalog import live: products / suppliers / customers / opening-stock / fashion-variants
- [x] Fashion reports + dashboard KPI endpoints
- [x] Fashion RBAC (`fashion.view` / `fashion.manage` / `fashion.report`)
- [x] Offline Mode A documented (online-only POS for Fashion production)
- [x] Playwright Fashion API smoke (variants/offers + **sale with variant_id**)
- [x] Local gate: `python scripts/fashion_ga_gate.py`
- [ ] **Remote CI** green on default branch (see [CI_RELEASE_GATES.md](./CI_RELEASE_GATES.md))

### Must be green (platform — reuse)

- [ ] Production checklist: [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md)
- [ ] Backup + restore drill: [BACKUP_AND_DR.md](./BACKUP_AND_DR.md)
- [ ] Health/ready + metrics: [OBSERVABILITY.md](./OBSERVABILITY.md)
- [ ] GA matrix: [GA_READINESS.md](./GA_READINESS.md) (Conditional GO → GO)

### Docker

- Dev: `docker-compose.yml` (seed OK)
- Prod-shaped: `docker-compose.prod.yml` — require secrets; `SEED_ON_STARTUP=false`; do not ship demo passwords

---

## Next step (ops — not inventable in code)

1. Evidence **remote CI** green on default branch.  
2. Schedule production backups + wire monitoring/alerts ([BACKUP_AND_DR.md](./BACKUP_AND_DR.md), [OBSERVABILITY.md](./OBSERVABILITY.md)).  
3. Flip release label to **Production Ready / GA** only when §46 unchecked items close.
