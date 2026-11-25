# Super Shop POS — Technical Design & Implementation Plan

| | |
|---|---|
| **Document** | SUPER_SHOP_POS_PLAN |
| **Status** | Draft for review |
| **Version** | 2.4 (supersedes v2.3; adds full Editability Specifications for departments, capabilities, products, and in-cart lines) |
| **Pack ID** | `super-shop` |
| **Last updated** | 2026-09-28 |
| **Reviewers** | Product owner · POS lead · Backend lead · QA lead |

### Revision history
| Version | Change |
|---|---|
| 2.0 | Full technical design: capability profiles, server-side VAT, data model, API, test and delivery plan |
| 2.1 | §20 feature enhancements, MoSCoW priorities, MVP slice, pilot metrics |
| 2.2 | **Counter flow aligned with hypermarket practice:**<br>• FEFO allocated by the server; no batch prompt.<br>• Variants sold by their own barcode.<br>• Scan-order receipt.<br>• Scanner-scale + PLU for loose produce.<br>• Fast keys.<br>• X/Z reports and blind cash close.<br>• Loss-prevention reporting.<br>• Integrated card terminals.<br>• HQ price publishing. |
| 2.3 | **Zero-Impact Isolation Contract (§0):**<br>• Super Shop is additive only.<br>• No existing table altered; extension tables instead.<br>• No behaviour change to `PosShell`, `sales_service`, returns, shifts, purchases, receipts, barcode or offline code.<br>• Dedicated sale endpoint.<br>• Pack disabled by default.<br>• CI isolation gate. |
| 2.4 | **Full Dynamic Editability (§5.4, §8.3.1, §9.1.1):**<br>• Departments & Capability flags are fully editable (CRUD, custom departments, dynamic flag toggling).<br>• In-cart line editing (tap to re-weigh, swap variant, edit/re-scan serial, line discount, change qty).<br>• Product Master dynamic editing & department re-assignment.<br>• Fast-key grid and lane profile layout editing.<br>• Scale label barcode format & tare preset editing. |

---

## 0. Zero-Impact Isolation Contract

> [!IMPORTANT]
> **The Super Shop pack must have zero effect on any existing POS mode, back-office screen, API response, database table or report.**
> A tenant that does not enable `super-shop` must see **byte-for-byte identical behaviour** before and after this work ships. This contract overrides any other section of this document. If a feature cannot be built without breaking it, the feature is redesigned or dropped. The contract is not relaxed.

### 0.1 Rules
| # | Rule | What it means in practice |
|---|---|---|
| **I-1** | **Add, never modify** | New files, new routes, new tables, new endpoints. Existing functions, components, props, columns and endpoints keep their current signatures and behaviour |
| **I-2** | **No `ALTER` on existing tables** | Super-shop data lives in **extension tables** keyed by the existing row id (`super_shop_product_ext.product_id`, `super_shop_sale_line_ext.sales_invoice_line_id`, …). Migrations contain only `CREATE TABLE` / `CREATE INDEX` on new tables, and their downgrade drops only those tables |
| **I-3** | **Shared components used, not edited** | `PosShell`, `ShiftDialog`, `PosReturnExchange`, `PurchaseForms`, `receipt-templates`, `print-document`, `barcode-pos`, `offline-store` and `fresh-markdown-policy` are **consumed through their existing public props and functions**. Super-shop behaviour lives in new wrapper components and new modules |
| **I-4** | **Dedicated backend path** | Super-shop sales post to a **new endpoint** (`POST /api/v1/super-shop/sales`). The existing sales endpoint, `sales_service`, `purchase_service`, `inventory_service` and `industry_sales_service` are **not modified** |
| **I-5** | **Branch on pack, never on shared state** | Every super-shop code path is reachable only when `industry_pack == "super-shop"` or on a `/super-shop` route. There are no global flags, global CSS, global stores or global event listeners |
| **I-6** | **Disabled by default** | `defaultPackConfigs()` registers `"super-shop": defaultPackConfig(false)`. Feature flags are namespaced `super-shop.*` and have no meaning outside the pack |
| **I-7** | **Namespaced permissions** | All new permissions use the `super-shop.*` prefix. Existing roles gain **no** new rights by default. Admins grant them explicitly |
| **I-8** | **Opt-in seed data** | Demo catalog and departments go in a new `seed_super_shop.py`, run only by an explicit command. `seed.py` and existing tests' fixtures are untouched |
| **I-9** | **No refactor of existing verticals** | Scale, FEFO, variant and serial modules for the super shop are **new files**. Beef, Pharmacy, Fashion, Electronics and the other POS files are not edited, even where the code is similar |

### 0.2 The only shared files touched (additive registrations)
Adding a pack to this codebase requires a few one-line registrations. TypeScript's exhaustive `Record<IndustryPackId, …>` maps will not compile without them. These are the **only** edits to existing files, and each is **append-only**:

| File | Edit | Why it cannot affect other packs |
|---|---|---|
| [industry-registry.ts](../src/lib/industry-registry.ts) | Append `"super-shop"` to `IndustryPackId`, `INDUSTRY_PACK_IDS`, `POS_MODES`, `INDUSTRY_PACKS`, `defaultPackConfigs` (disabled), `ALL_FEATURE_FLAGS` (`super-shop.*`), `ROUTE_FEATURE_KEYS` | New keys only. Existing entries unchanged. Pack is off by default |
| [PosModeView.tsx](../src/features/pos/PosModeView.tsx) | One import + one `MODES` entry | Only reachable when mode is `super-shop` |
| [product-form-registry.ts](../src/lib/product-form-registry.ts) | One `PRODUCT_FORM_REGISTRY["super-shop"]` entry | Read only for `super-shop` products |
| [nav-config.ts](../src/lib/nav-config.ts) | One `PACK_ICONS["super-shop"]` entry | Menu item shown only when the pack is enabled |
| [permissions.ts](../src/lib/permissions.ts), [backend-permissions.ts](../src/lib/backend-permissions.ts), backend permission list | Append `super-shop.*` permissions. **No role mapping changes** | Unassigned permissions change nothing |
| `backend/app/api/v1/router.py` | One `include_router(super_shop.router)` | New URL prefix only |
| `backend/app/models/__init__.py` | Import the new models module | Registers new tables only |

**Known, accepted visible effect:** super-admins, who today see every pack in the POS mode list (`availablePosModes(…, isSuperAdmin)`), will see "Super Shop POS" as one more option. Nothing else changes for them.

Backend services that branch on explicit pack sets (for example `industry_pack in {"electronics", "mobile-shop"}` in `purchase_service.py` and `inventory_service.py`) are **not edited**. A `super-shop` product falls through to their existing default path, and super-shop-specific handling happens in the super-shop service.

### 0.3 How the contract is enforced
| Gate | Mechanism | Blocks merge? |
|---|---|---|
| **Protected-file diff check** | `scripts/check-super-shop-isolation.mjs` diffs the branch against `main`:<br>• Only the files listed in §0.2 may change outside the new super-shop paths.<br>• Those files may only **add** lines. | Yes |
| **Migration check** | Test asserts migrations 056/057 contain no `alter_column`, `add_column`, `drop_*` or `op.execute` against pre-existing tables, and that downgrade leaves the schema identical to 055 | Yes |
| **Full regression suite** | Every existing Vitest, pytest and Playwright suite, including all `*-vertical-wiring` tests, runs unchanged and must pass | Yes |
| **API contract snapshot** | For every existing pack, response snapshots of `/sales`, `/products`, `/reports/*`, `/purchases` and `/inventory` are recorded on `main` and compared on the branch | Yes |
| **Pack-disabled test** | With default configs, the super-shop route, menu and endpoints are unreachable or return 403 for non-super-admins | Yes |
| **Bundle check** | Super-shop code is lazy-loaded behind its route, so other POS modes do not download it | Reported |

### 0.4 Rollback
- **Switch off the pack** (config): super-shop disappears, and every other pack is unaffected by construction.
- **Downgrade migrations 057 → 056 → 055**: drops only super-shop tables.
- **Revert the commits**: because existing files only gained appended registrations, reverting them is conflict-free.

---

## 1. Executive Summary

A **Super Shop** (hypermarket / megastore) sells many product types under one roof: packaged FMCG, weighed fresh produce and meat, over-the-counter medicines, apparel, cosmetics, small electronics and stationery. Today, Omni POS supports each of these as a **separate industry pack**, and a store picks one of them. A super shop needs all of those behaviours **in one cart, one checkout and one invoice**.

This plan adds a `super-shop` industry pack built on two principles.

> **1. A product's *department* decides how it behaves.** Each department maps to a **capability profile** (weighed, batch-tracked, variant, serial, age-restricted). Stock, pricing, reports and the counter all read that profile. None of them branch on department names.
>
> **2. The counter only asks for what the cashier alone can supply.** Most department complexity is handled *before* checkout, in receiving, labelling and tagging, or *after* it, by server-side stock allocation. At the counter, about 95% of items are **scan → beep**. A cashier is interrupted only for:
> - the weight of loose produce (read from the scanner-scale);
> - a serial number;
> - an age check.

What this gives us:

- **Hypermarket-grade throughput.**
  - Pre-packed fresh items carry weight-embedded barcodes.
  - Every apparel size and colour has its own barcode.
  - The server allocates medicine and cosmetics batches FEFO.
  - None of these need a pop-up.
- **Zero impact on other POS modes.** Everything is additive and isolated (§0). No existing screen, endpoint or table changes behaviour.
- **Correct tax.** VAT is calculated per line from the product's or department's VAT class, and the **server recomputes it**. Today the server stores the tax value the client sends (`sales_service.py`), which is unsafe once several rates are in play.
- **Retail-grade controls.** The pack includes:
  - X/Z reports and blind cash close;
  - drawer limits with cash pickups;
  - supervisor approvals;
  - loss-prevention reporting per cashier.
- **Admin-configurable.** Departments, capability profiles, VAT classes, fast keys and store layout are master data. None of them are hard-coded.

---

## 2. Goals & Non-Goals

### 2.1 Goals
| # | Goal | Measure of success |
|---|---|---|
| G1 | Sell items from every department in a single transaction | One invoice holds weighed, batch, variant, serial and standard lines together |
| G2 | Scan-first checkout | ≥ 95% of lines added with no dialog. Scan to line-in-cart ≤ 150 ms (p95) |
| G3 | Correct mixed-rate VAT | Server-recomputed tax equals the printed tax on 100% of invoices in the test suite |
| G4 | Accurate batch and expiry stock without cashier effort | FEFO allocation by the server. Zero expired units sold |
| G5 | Cash accountability | Every shift closes with a blind count, a Z report and a variance record |
| G6 | Department-level stock and sales visibility | Valuation, sales, expiry loss and shrinkage filterable by department |
| G7 | **Zero impact on existing packs** | All §0.3 gates pass: protected-file diff, migration check, full regression, API snapshots, pack-disabled test |

### 2.2 Non-Goals (this release)
- Self-checkout kiosks and conveyor lanes with built-in scales.
- Full pharmacy dispensing (Rx-only drugs). The super-shop pharmacy department is **OTC-only by default**. See §11.3.
- Multi-store replenishment and automatic PO generation. Reorder suggestions produce **draft** POs only.
- Loyalty or promotion engine redesign. We extend the existing promo-code, price-list and time-pricing rules.

---

## 3. Current-State Analysis (what we build on)

| Capability | Where it lives today | Reuse strategy |
|---|---|---|
| Pack registry, flags, routes | [industry-registry.ts](../src/lib/industry-registry.ts) (`IndustryPackId`, `INDUSTRY_PACKS`, `ALL_FEATURE_FLAGS`, `ROUTE_FEATURE_KEYS`) | Register `super-shop` the same way as the other 19 packs |
| POS frame (cart, payment, receipt, holds, offline) | [PosShell.tsx](../src/features/pos/PosShell.tsx) | **Used unchanged**, through existing props (`totalsOverride`, `onCompleteSale`, `cartLineExtra`, `headerBadges`, `onBeforeComplete`) (§8.2) |
| Mode dispatch | [PosModeView.tsx](../src/features/pos/PosModeView.tsx) `MODES` map | Add `"super-shop": SuperShopPos` |
| Weighing | Beef / Grocery / Rice-mill POS, flags `beef.weight_scale`, `grocery.scale` | Reference only. **New** super-shop scale adapter + `WeighDialog`; existing POS files not edited |
| Batch + FEFO | `PharmaBatch`, `CosmeticsBatch` (backend), Pharmacy/Cosmetics POS | Reference only. **New** `super_shop_batch` table + **server-side FEFO allocator**. No batch picker at the counter |
| Variants | `ProductVariant` (size/color/style) + `ProductBarcode.variant_id`, Fashion variant matrix | Existing tables **used as-is** through existing APIs (rows added, schema unchanged). New super-shop matrix screen generates variants, barcodes and tags |
| Serials | `ElectronicsSerialStock`, `StockLedger.serial_id` | Reference only. **New** `super_shop_serial` table and `SerialCaptureDialog` |
| Shifts | Cashier shifts (migration 028), [ShiftDialog.tsx](../src/components/pulse/ShiftDialog.tsx) | **Unchanged.** A new super-shop cash-control panel references the existing shift id and stores its data in `super_shop_shift_cash_event` |
| Payment methods | bKash / Nagad / card payment methods (master data) | **Unchanged.** A new super-shop terminal/QR adapter is used only on super-shop lanes (§8.7) |
| Time markdown | [fresh-markdown-policy.ts](../src/lib/fresh-markdown-policy.ts), `TimePricingRule` (migration 055) | **Unchanged.** Department scope stored in a new `super_shop_rule_scope` table and applied only in the super-shop quote |
| Category tree | `ProductCategory.parent_id`, [category-tree.ts](../src/lib/category-tree.ts) | Department sits **above** the category tree |
| Product form | [product-form-registry.ts](../src/lib/product-form-registry.ts), [pack-master-attributes.ts](../src/lib/pack-master-attributes.ts) | One appended registry entry. Department-driven panels live on a **new** super-shop product screen (§9.1) |
| Barcode lookup | [barcode-pos.ts](../src/lib/barcode-pos.ts) | **Unchanged.** New parsers in `super-shop/barcode.ts` fall back to the existing lookup for plain codes (§12.2) |
| Returns | [PosReturnExchange.tsx](../src/features/pos/PosReturnExchange.tsx) | **Unchanged.** New `SuperShopReturn` flow + `POST /super-shop/returns` |

### 3.1 Gaps this plan must close
1. **`Product.industry_pack` is a single value.** A super-shop product is `industry_pack = "super-shop"`, and its behaviour comes from its department.
2. **Batch and serial tables are pack-specific** (`pharma_batch`, `cosmetics_batch`, `electronics_serial_stock`). The super shop needs a **pack-neutral** batch/serial store and an allocator.
3. **`PosShell` takes one `taxRate`**, and **`SalesInvoiceLine` has no tax columns**. Mixed-rate VAT cannot be represented or audited.
4. **The server trusts client totals** (`tax=body.tax`). With several VAT classes this becomes a compliance risk.
5. **`usePosCatalog` loads up to 250 products.** A hypermarket carries 5,000–30,000 SKUs.
6. **Shift close has no blind count, no Z report and no drawer-limit control.**

---

## 4. Key Architecture Decisions

| ID | Decision | Alternatives considered | Rationale |
|---|---|---|---|
| **AD-1** | Department → **capability profile** drives behaviour | Hard-code `if dept === "pharmacy"`. Or switch pack per item | Departments are tenant-defined. Profiles are a closed, testable set |
| **AD-2** | Profiles are **composable flags**, not one enum | Single `sale_mode` enum | Cosmetics need a batch **and** shade variants. Bulk tech may need a serial **and** a batch |
| **AD-3** | New **super-shop-owned** `super_shop_batch` and `super_shop_serial` tables | Reuse `pharma_batch` for every department | Avoids coupling to pharmacy semantics and guarantees no effect on existing packs |
| **AD-4** | **Per-line tax, recomputed on the server** | Client-computed blended rate | Required for audit, VAT returns and mixed-rate receipts |
| **AD-5** | **New** capability modules in `src/features/pos/super-shop/capabilities/` | Extract from, and so edit, existing vertical POS files | Zero-impact contract (§0) beats deduplication. Existing verticals can adopt these modules later as separate, individually tested work |
| **AD-6** | Existing verticals and shared services **unchanged** | Refactor packs onto profiles now; add hooks to `sales_service` | Enforced by the §0.3 gates |
| **AD-10** | **Extension tables** instead of new columns on shared tables | `ALTER TABLE product / sales_invoice_line …` | New columns change every ORM query and API serialiser for every pack. Extension tables are invisible to existing code |
| **AD-11** | **Dedicated sale endpoint** `POST /super-shop/sales` | Hooks inside the shared sales endpoint | The shared endpoint keeps identical behaviour and responses |
| **AD-7** | **Counter asks only for data the cashier alone can supply** (loose weight, serial, age) | Prompt per department (batch picker, variant grid) | Hypermarket lanes are measured in items per minute. Batch and variant are known before the sale (label, tag, GRN) or can be decided by the server |
| **AD-8** | **FEFO allocation on the server at posting.** One sale line can draw from several batches | Cashier selects a batch | Cashiers cannot see which physical pack is from which batch, so a manual pick is guesswork. FEFO on the server is consistent and auditable. A scanned GS1 DataMatrix (batch + expiry) overrides it with the actual batch |
| **AD-9** | **Receipt and cart in scan order.** Department totals go in reports and the Z report | Group lines by department on the receipt | Matches customer expectations and paper-saving practice. Scan order also matches the cashier's screen |

---

## 5. Domain Model

### 5.1 Hierarchy
```
Company (HQ)
 ├── Price & promotion master  (published to stores on a schedule, §9.5)
 └── Department                (tenant-defined; e.g. Fresh & Meat, Grocery, Pharmacy)
      ├── capability flags     (weighed | batch_tracked | variant | serial | age_restricted | …)
      ├── default VAT class
      ├── return policy        (returnable?, window days)
      ├── supervisor (user)
      └── Category tree        (existing product_category, scoped to department)
           └── Product         (may override flags, VAT class, return policy)
                ├── Variant    (own barcode per size/colour/shade)
                ├── Batch      (captured at goods receipt)
                └── Serial     (captured at goods receipt)

Store
 ├── Zone → Aisle → Shelf      (location codes, e.g. A04-B3)
 └── Counter / Lane            (lane type, scanner-scale, drawer limit, fast-key layout, payment terminal)
      └── Shift                (open float → cash pickups → blind count → Z report)
```

### 5.2 Capability flags
| Flag | Where the data comes from | Counter behaviour | Receipt line |
|---|---|---|---|
| `weighed` (pre-packed) | Department scale prints a **weight/price-embedded label** | Scan → add. **No dialog** | `1.350 kg × ৳850/kg` |
| `weighed` (loose) | **Scanner-scale** at the lane | Scan, or enter the PLU (e.g. `4011`), or tap a fast key → the stable weight is read → add | `0.742 kg × ৳120/kg` |
| `tare` | Tare preset on the product / PLU | Subtracted automatically | `Tare 0.010 kg` |
| `batch_tracked` | Batch + expiry captured at **goods receipt** | **No dialog.** Server allocates FEFO at posting. A GS1 DataMatrix scan attaches the exact batch | `Exp 08/2027` *(when the batch is known at scan)* |
| `expiry_block` | Batch expiry dates | **Blocks** an item only if every sellable batch has expired, or the scanned batch has expired | — |
| `variant` | Variant + barcode generated in back office; tag printed at receiving | Variant barcode → add. **No dialog**. A parent/style code opens a lookup fallback (missing tag) | `Polo Shirt · XL · Navy` |
| `serial_tracked` | Serials captured at goods receipt | **Serial/IMEI scan required**, validated as in stock and unsold | `S/N 884920481` |
| `warranty` | Product master | Printed automatically; separate warranty slip | `Warranty 12 months` |
| `age_restricted` | Product master | One confirmation **per transaction**, however many restricted items | — |
| `rx_reference` | Product master (OTC advisory) | Optional reference field, not blocking | `Rx ref …` |
| `open_price` | Product master (e.g. misc. bakery) | Price entry within min/max limits | — |
| *(none)* | — | **Scan → beep** | `MRP ৳240 · You save ৳20` |

### 5.3 Seeded default departments
| Code | Name | Default flags | Returnable | Default VAT class* |
|---|---|---|---|---|
| `FRESH` | Fresh, Meat & Fish | `weighed`, `tare`, `batch_tracked` | No | `EXEMPT` / `REDUCED` |
| `GROC` | Grocery & FMCG | *(none)* | Yes (7 days, sealed) | `STANDARD_RETAIL` |
| `PHARM` | Pharmacy & Health (OTC) | `batch_tracked`, `expiry_block`, `rx_reference` | No | `MED_EXEMPT` / `REDUCED` |
| `APPAREL` | Apparel & Footwear | `variant` | Yes (7 days, tag on); innerwear No | `STANDARD_RETAIL` |
| `BEAUTY` | Cosmetics & Personal Care | `batch_tracked`, `expiry_block`, `variant` (shade) | No (opened) | `STANDARD_RETAIL` |
| `TECH` | Electronics & Home | `serial_tracked`, `warranty` | Yes (7 days, sealed; warranty after that) | `STANDARD_RETAIL` |
| `STAT` | Stationery & General | *(none)* | Yes (7 days) | `STANDARD_RETAIL` |

\* VAT classes and return windows are **placeholders**. Actual values are configured per tenant. VAT rates **must be confirmed with the client's tax advisor** under the applicable VAT & SD Act and NBR rules. The plan does not hard-code any rate.

### 5.4 Dynamic Department & Capability Editing Lifecycle

> [!TIP]
> **Departments are not hardcoded enums.** The seeded list (`FRESH`, `GROC`, `PHARM`, `APPAREL`, `BEAUTY`, `TECH`, `STAT`) provides out-of-the-box templates, but every department and capability flag is **fully editable** by the tenant admin at `/app/super-shop/departments`.

1. **Department Master CRUD**:
   - **Create**: Add custom departments as the super shop expands (e.g. `BAKERY`, `DELI`, `PET_CARE`, `BABY`, `FROZEN`, `FLORAL`).
   - **Edit Basic Info**: Rename department, change short code, pick visual theme color (hex) and Lucide icon, set sort order.
   - **Edit Capability Flags**: Toggle capability flags on or off per department using a visual switchboard:
     - `weighed` (Loose / scale items)
     - `tare` (Container deduction)
     - `batch_tracked` (FEFO & expiry tracking)
     - `expiry_block` (Hard block on expired goods)
     - `variant` (Size/color matrix)
     - `serial_tracked` (Serial/IMEI capture)
     - `warranty` (Warranty card print)
     - `age_restricted` (Cashier age prompt)
     - `rx_reference` (Doctor/Rx note)
     - `open_price` (Price input at POS)
   - **Edit Tax & Returns**: Reassign default VAT class, returnable status, and return window (days).
   - **Deactivate / Reorder**: Deactivate seasonal or discontinued departments without altering historical invoices.

---

## 6. Data Model & Migrations

All changes are **new tables only** (rule I-2). Migration `056_super_shop_foundation.py` creates the catalog and stock tables. `057_super_shop_counter_controls.py` creates the counter and cash tables. All tables use the `super_shop_` prefix and nothing references them from existing code.

### 6.1 New tables
```text
super_shop_department
  id, company_id, code (uniq per company), name, color, icon, sort_order,
  capability_flags_json, default_vat_class_id, supervisor_user_id,
  returnable, return_window_days, is_active

super_shop_vat_class
  id, company_id, code, name, rate_percent, is_inclusive, effective_from, is_active

super_shop_zone / super_shop_location
  id, company_id, store_id, [zone_id], code, name, zone_type | aisle, shelf, bin

super_shop_batch                              -- super-shop-owned (AD-3)
  id, company_id, store_id, product_id, variant_id?, batch_no, mfg_date?,
  expiry_date?, cost_price, qty_on_hand, status (active|quarantined|expired),
  grn_line_id?                                -- captured at goods receipt
  UNIQUE (company_id, store_id, product_id, batch_no)

super_shop_batch_allocation                   -- FEFO result (AD-8); one line → N batches
  id, sales_invoice_line_id, batch_id, qty, source (fefo|scanned|offline_sync)

super_shop_serial
  id, company_id, store_id, product_id, serial_no, batch_id?,
  status (in_stock|reserved|sold|returned|rma), sales_invoice_line_id?
  UNIQUE (company_id, product_id, serial_no)

super_shop_scale_label_config
  id, company_id, prefix (e.g. "2"), plu_digits, value_type (weight|price),
  value_digits, value_decimals, check_digit_mode

super_shop_counter_profile
  id, store_id, counter_id, lane_type (standard|express|service),
  scanner_scale_enabled, drawer_limit_amount, fast_key_layout_id,
  payment_terminal_id?, customer_display_enabled

super_shop_fast_key_layout / super_shop_fast_key
  layout: id, company_id, name
  key:    id, layout_id, page, position, product_id | variant_id, label, color, image?

super_shop_shift_cash_event                   -- references existing shift id; shift table untouched
  id, shift_id, type (float|pickup|payout|no_sale|blind_count),
  amount, denominations_json?, reason_code?, approved_by?, created_by

super_shop_price_change                       -- HQ price publishing (§9.5)
  id, company_id, effective_at, store_scope_json, status (draft|scheduled|published),
  lines → (product_id|variant_id, new_price, new_mrp?, promo_tag?)
```

### 6.2 Extension tables (no existing table is altered)
Super-shop facts about existing rows live in 1-to-1 extension tables. Existing tables, models, schemas and API serialisers are unchanged.

```text
super_shop_product_ext                       -- 1:1 with product (PK = product_id)
  product_id (PK, FK product.id), department_id, vat_class_id?, capability_overrides_json?,
  location_id?, plu_code? (indexed, uniq per company), returnable?, return_window_days?,
  open_price_min?, open_price_max?

super_shop_category_ext                      -- 1:1 with product_category
  category_id (PK), department_id

super_shop_sale_line_ext                     -- 1:1 with sales_invoice_line
  sales_invoice_line_id (PK), department_id, vat_class_id, tax_rate, tax_amount,
  serial_id?, weight_kg?, tare_kg?, weight_source (label|scale|manual)?

super_shop_invoice_ext                       -- 1:1 with sales_invoice
  sales_invoice_id (PK), counter_id, shift_id, round_off, quote_hash, vat_by_class_json

super_shop_rule_scope                        -- department scope for existing promo / price-list / time-pricing rules
  id, rule_type (promo|price_list|time_pricing), rule_id, department_id
```

Invoices and lines are still written to the existing `sales_invoice` / `sales_invoice_line` tables through their existing columns. As a result, company-wide reports, accounting and the customer ledger keep working and include super-shop sales with no code change.

### 6.3 Effective capability resolution
```
effective_flags = department.capability_flags
                  ∪ product_ext.overrides.add
                  − product_ext.overrides.remove
effective_vat   = product_ext.vat_class ?? department.default_vat_class ?? super_shop_settings.default_vat_class
effective_return_policy = product_ext.returnable/window ?? department.returnable/window
```
This resolution runs on the **backend** and is returned with every catalog item. The frontend does not re-derive it.

### 6.4 FEFO allocation rule
When a sale is posted, for each `batch_tracked` line **without** a scanned batch:
1. Select the store's `active` batches with `expiry_date > today`, ordered by `expiry_date ASC, created_at ASC`.
2. Take quantity from each in turn until the line quantity is covered, and write one `super_shop_batch_allocation` row per batch used.
3. If sellable batch stock is short, allocate the remainder to an `unbatched` bucket and raise a **stock exception** for the department supervisor. The sale still completes: the customer is holding the item, so the stock record is what is wrong.
4. Returns restock to the **originally allocated** batches.

---

## 7. API Contract (FastAPI, `/api/v1/super-shop/*`)

| Method | Path | Purpose | Permission |
|---|---|---|---|
| GET/POST/PATCH | `/departments` | CRUD departments, flags, VAT class, return policy | `super-shop.manage` |
| GET/POST/PATCH | `/vat-classes` | CRUD super-shop VAT classes | `super-shop.manage` |
| GET/POST/PATCH | `/zones`, `/locations` | Store layout | `super-shop.manage` |
| GET | `/catalog?department=&q=&cursor=&since=` | POS catalog (delta sync with `since`), resolved flags, VAT, active price and markdown | `super-shop.pos_sell` |
| GET | `/lookup/{code}` | Barcode, variant barcode, PLU, weight-embedded label or GS1 DataMatrix → item + parsed weight/price/batch/expiry | `super-shop.pos_sell` |
| GET | `/serials/{serial_no}/validate?product_id=` | Serial in stock and unsold | `super-shop.pos_sell` |
| POST | `/quote` | **Authoritative** priced cart: per-line tax, promotions, markdowns | `super-shop.pos_sell` |
| GET/PUT | `/counters/{id}/profile`, `/fast-key-layouts` | Lane configuration and fast keys | `super-shop.manage` |
| POST | `/shifts/{id}/cash-events` | Float, pickup, payout, no-sale, blind count (existing shift id; shift table untouched) | `super-shop.shift_close` / `super-shop.cash_pickup` |
| GET | `/shifts/{id}/x-report`, `/shifts/{id}/z-report` | Mid-shift and closing reports | `super-shop.shift_view` |
| GET/POST | `/price-changes`, `/price-changes/{id}/publish` | HQ price publishing | `super-shop.price_publish` |
| GET | `/batches?product_id=` | Batch stock by FEFO order (back office) | `super-shop.inventory_view` |
| POST | `/sales`, `/returns`, `/receiving` | Dedicated posting endpoints (AD-11) | `super-shop.pos_sell` / `super-shop.receive` |
| GET | `/reports/department-sales`, `/reports/vat-by-class`, `/reports/expiry-loss`, `/reports/department-valuation`, `/reports/loss-prevention` | Reporting | `super-shop.reports_view` |
| GET/PUT | `/scale-config` | Label barcode format, PLU export, tare presets | `super-shop.manage` |

**Sale posting** uses a **dedicated endpoint**, `POST /api/v1/super-shop/sales` (AD-11). The existing sales endpoint and `sales_service` are not modified. The new `super_shop_sale_service` runs **in one transaction**:
1. **Recompute and verify.** The server recomputes line tax and the invoice total from VAT classes and the active price. If they differ from the client values by more than ৳1, the sale is rejected with **409** and a fresh quote is returned.
2. **Create the invoice through the existing, unmodified service functions.** Invoice, lines, stock ledger, payments and accounting entries post exactly as they do for any other pack, with the server-verified totals.
   - If an existing function cannot join the caller's transaction as it is written, the super-shop service calls it as-is and **compensates on failure**.
   - The shared function is never edited to add a parameter.
3. **Write super-shop facts.** Extension rows (§6.2), FEFO batch allocation (§6.4), serial status `in_stock → sold`, round-off record.

The same pattern applies to returns (`POST /super-shop/returns`) and goods receipt (`POST /super-shop/receiving`).

---

## 8. POS Experience — `SuperShopPos`

### 8.1 Screen layout
```
┌──────────────────────────────────────────────────────────┬────────────────────────────┐
│ [Scan / PLU / search]   Qty × [  ]   Lane 03 · Express   │  CART (scan order)         │
├──────────────────────────────────────────────────────────┤  1 Pran Mango 1L    2  440 │
│ FAST KEYS  [Bread] [Eggs 12] [Banana] [Tomato] [Onion]   │  2 Beef bone-in 1.350 1,147│
│            [Carry bag] [Paratha] [Lemon] [+ page 2]      │  3 Polo Shirt XL Navy  850 │
├──────────────────────────────────────────────────────────┤  4 Walton LED 12W      350 │
│ [All] [Fresh] [Grocery] [Pharmacy] [Apparel] [Beauty]…   │     S/N 884920481          │
│ Product grid (virtualised; search/browse fallback)       │  ▸ newest line highlighted │
│                                                          │  Items 5 · Subtotal · VAT  │
│  Scale: 0.742 kg ● stable                                │  You save ৳40              │
│                                                          │  [ PAY  F12 ]              │
└──────────────────────────────────────────────────────────┴────────────────────────────┘
```
- **Scan field always has focus.** It accepts a barcode, a PLU number, or `qty*` followed by a scan (the quantity multiplier).
- **Fast keys** are a configurable grid of buttons for unlabelled items (bread, eggs, loose produce, carry bags). There can be several pages per lane.
- **Department bar and grid** are a *browse fallback* for items without a readable barcode, not the main input.
- **Scale strip** shows the live scanner-scale weight and whether it is stable.
- **Express lane** (a lane-profile setting) caps the basket size and hides the grid. It still allows serial-tracked items.

### 8.2 Scan dispatcher
The dispatcher is a pure function in `super-shop/dispatch.ts`, and is unit-tested:

```ts
type AddIntent =
  | { kind: "add"; line: CartLine }                                        // no dialog
  | { kind: "prompt"; dialog: CapabilityDialog; item: SuperShopItem; prefill?: Partial<CartLine> }
  | { kind: "block"; reason: BlockReason };

function resolveAddIntent(item: SuperShopItem, scan: ParsedScan, ctx: CounterContext): AddIntent
```

Rules are checked in this order. The first match wins:

| # | Condition | Result | Frequency |
|---|---|---|---|
| 1 | Item inactive or not on sale at this store | `block` | Rare |
| 2 | Scanned batch (GS1) is expired, or every sellable batch is expired | `block` + write-off prompt for supervisor | Rare |
| 3 | Weight/price-embedded label | `add` with the parsed weight or price | **Common** (pre-packed fresh) |
| 4 | `weighed` loose item and the scanner-scale has a stable reading | `add` with the scale weight | Common (produce) |
| 5 | `weighed` loose item and no scale or no stable reading | `prompt: WeighDialog` (waits for the scale; manual entry needs `super-shop.manual_weight`) | Rare |
| 6 | Parent/style code of a `variant` product | `prompt: VariantLookup` (tag missing) | Rare |
| 7 | `serial_tracked` | `prompt: SerialCaptureDialog` (validated against `/serials/validate`) | Occasional (high-value) |
| 8 | `open_price` | `prompt: PriceEntry` (within min/max) | Rare |
| 9 | `age_restricted` and not yet confirmed in this transaction | `prompt: AgeConfirmDialog` | Occasional |
| 10 | Otherwise (including `batch_tracked` and variant barcodes) | `add` → beep | **~95% of scans** |

Behaviours outside the dispatcher:
- **Near-expiry** (GS1-scanned batch within the warning window) shows a non-blocking amber chip. It never opens a dialog.
- **Repeat scans** of the same standard item increase quantity on the last line. Weighed, serial and variant lines always get their own line.
- **Out of stock** by the system count never blocks a sale: the customer is holding the item. It logs a stock exception instead.

**No change to `PosShell`.** `SuperShopPos` uses only props that already exist:

| Need | Existing `PosShell` prop used |
|---|---|
| Mixed-rate tax total | `totalsOverride` (server quote: subtotal, discount, tax, total) with `taxLabel="VAT (mixed)"` |
| VAT-by-class breakdown on screen | Rendered by `SuperShopPos` in its own summary panel (`headerBadges` / catalog area) |
| Line chips (weight, serial, expiry) | `cartLineExtra` |
| Posting to the dedicated endpoint | `onCompleteSale` (returns the invoice id from `POST /super-shop/sales`) |
| Age check, serial and quote validation before pay | `onBeforeComplete` |

The **receipt** comes from super-shop's own template (§10), printed through the existing `print-document` API. If `PosShell`'s built-in receipt cannot show VAT by class through existing props, `SuperShopPos` prints its own receipt after `onCompleteSale`. It does not edit `PosShell`.

### 8.3 Cart line presentation
The cart is in **scan order**. The newest line is highlighted and the list scrolls to it automatically.

| Profile | Primary line | Secondary chips |
|---|---|---|
| Weighed | `Beef bone-in` | `1.350 kg @ ৳850/kg` · `label`/`scale` source · `Clearance −30%` |
| Batch-tracked | `Napa 500mg ×10` | `Exp 08/2027` only when scanned via GS1. Amber chip if near expiry |
| Variant | `Polo Shirt · XL · Navy` | — |
| Serial | `Walton LED 12W` | `S/N 884920481` · `12-mo warranty` |
| Standard | `Pran Mango Juice 1L` | `MRP ৳240 · Save ৳20` |

A slim department colour stripe on each line helps supervisors scan the basket visually. A **Review by department** view is available to supervisors (for example during a price dispute) but is off for cashiers.

### 8.3.1 In-Cart Line Editing & Counter Overrides

At hypermarket checkouts, customers frequently change their minds, request a size swap, or need an item re-weighed. In `SuperShopPos`, every line item in the cart is **directly editable** prior to finalizing payment:

| Edit Action | Trigger / Gesture | What Happens | Permission Required |
|---|---|---|---|
| **Edit Quantity** | Tap quantity, press `F8`, or click `+`/`-` | Opens numeric keypad or multiplier input | Standard cashier |
| **Re-Weigh / Edit Weight** | Tap the weight chip (e.g. `1.350 kg`) | Re-polls the scanner-scale for live reading; or opens `WeighDialog` for manual kg/g entry if the scale has an error | `super-shop.manual_weight` (for manual entry) |
| **Swap Variant (Size / Color)** | Tap the variant chip (e.g. `XL · Navy`) | Opens a quick variant-swap drawer for the parent product, allowing 1-tap replacement without deleting and re-scanning | Standard cashier |
| **Correct / Edit Serial** | Tap the serial chip (e.g. `S/N 884920481`) | Opens serial capture dialog to re-scan or type the corrected serial number; validates against available inventory | Standard cashier |
| **Line Discount / Price Override** | Tap price or action menu `…` | Enter percentage discount or fixed amount discount with reason code | `pos.manager_discount` |
| **Void / Remove Line** | Tap `X` button or press `Del` | Removes item from active cart; logs voided line in loss-prevention audit if after subtotal | Standard (pre-subtotal) / Supervisor (post-subtotal) |

### 8.4 Keyboard & accessibility
| Key | Action |
|---|---|
| `F2` | Search |
| `F3` | PLU entry |
| `F4` | Hold / suspend |
| `F6` | Customer / loyalty |
| `F8` | Quantity |
| `F9` | Price check (no add) |
| `F10` | Fast keys page |
| `F12` | Pay |
| `*` | Quantity multiplier |
| `Del` | Void line (needs supervisor approval after subtotal) |
| `Esc` | Close dialog, return focus to scan |

- Every dialog can be finished with the keyboard alone.
- Status is never shown by colour alone. Near-expiry, clearance and restricted items also carry text or icon chips (WCAG 2.1 AA).

### 8.5 Performance budgets
| Interaction | Budget (p95, mid-range POS PC) |
|---|---|
| Barcode scan → line in cart | ≤ 150 ms (served from the local catalog, no network) |
| Scanner-scale stable reading → line in cart | ≤ 300 ms after the reading is stable |
| Fast-key tap → line in cart | ≤ 100 ms |
| Catalog delta sync (`since=`) | Background, every 5 min + on price publish |
| Server quote round-trip | ≤ 400 ms, and **non-blocking**: local totals show at once, the server quote reconciles in the background |

The full catalog is cached locally in a super-shop-owned IndexedDB store and refreshed by delta sync, so scanning never waits on the network. The grid is virtualised. Super-shop uses its own `useSuperShopCatalog` hook. The shared `usePosCatalog` (limit 250) is not changed, because other POS modes depend on it.

### 8.6 Shift & cash control
These controls are delivered by a **new** `SuperShopCashControl` panel shown only on super-shop lanes. The existing `ShiftDialog` and shift tables are unchanged; super-shop records reference the existing shift id.

| Control | Behaviour |
|---|---|
| **Opening float** | Counted and entered at shift open (existing flow) |
| **X report** | Mid-shift snapshot (sales, tenders, voids) that does **not** close the shift |
| **Drawer limit & cash pickup** | When cash in the drawer exceeds `drawer_limit_amount`, the POS prompts for a pickup. The supervisor records it with a denomination breakdown |
| **No-sale** | Opening the drawer without a sale needs a reason code. Every no-sale is logged |
| **Blind close** | The cashier counts by denomination **without seeing the expected amount**. The system then works out the variance, and the supervisor signs off if it is over the tolerance |
| **Z report** | Final report per shift: tender totals, VAT by class, department totals, voids, refunds, no-sales, round-off and variance. Numbered sequentially and cannot be reprinted as a new Z |

### 8.7 Payments
- **Existing tenders stay unchanged**: cash, bKash, Nagad, card, split tender.
- **New adapters are used only on super-shop lanes.** Other POS modes' payment flow is untouched.
- **Integrated card terminal (adapter).** The POS sends the exact amount to the terminal and receives the approval code, so there is no retyping and no amount mismatch. Configured per lane; manual card entry remains as a fallback.
- **Dynamic QR.** For bKash and Nagad, show a QR with the amount on the customer display, where the provider's merchant API allows it.
- **Cash round-off** to the nearest ৳1 (configurable), posted to a round-off account.

---

## 9. Back-Office

### 9.1 Product master (dynamic by department)
A **new** product screen, `/app/super-shop/products`, manages super-shop products. It creates the base product through the existing products API and writes department fields to `super_shop_product_ext`. The shared [app.products.tsx](../src/routes/app.products.tsx) is **not modified**. It lists super-shop products like any other pack, using the one appended `PRODUCT_FORM_REGISTRY` entry. Choosing a **Department** loads that department's field set:

| Flag present | Panel rendered | Key fields |
|---|---|---|
| `weighed` | Weighing & freshness | Rate/kg, PLU code, tare preset, label type (weight/price), storage temp, clearance-eligible |
| `batch_tracked` | Batch & expiry | Expiry warning days, minimum remaining shelf life at receipt, generic name / manufacturer (health) |
| `variant` | Variant matrix | Style code, size set × colour/shade set → **generates `ProductVariant` rows + a barcode each + printable tags** |
| `serial_tracked` | Serial & warranty | Brand, model, warranty months, serial pattern (regex) |
| `open_price` | Open price | Min / max price |
| *(always)* | Commercial | Barcodes (multiple, incl. case barcode), MRP, selling price, VAT class, location, reorder level, return policy |

Server-side validation mirrors the client rules (new super-shop Pydantic schemas), so a malformed product cannot be created through the API.

### 9.1.1 Dynamic Attribute & Department Reassignment

Products are **never locked** into their original department:
- **Department Reassignment**: When editing a product in `/app/super-shop/products`, selecting a different Department dynamically swaps the rendered metadata panels (e.g., changing from Grocery to Fresh Produce unhides scale & tare attributes).
- **Capability Overrides**: An individual product can override its department's default capability flags (e.g., a specific high-value apparel item can enable `serial_tracked`, or a unique bakery item can enable `open_price`).
- **Batch Editing**: Bulk department assignment, price adjustment, and VAT class updates are supported via `/app/super-shop/products` and CSV import.

### 9.2 Goods receipt: where the detail is captured
Hypermarkets capture batch, expiry, serial and variant detail **when stock arrives**, not at the counter. This happens on a **new** `/app/super-shop/receiving` screen and `POST /super-shop/receiving`. That endpoint posts the purchase through the existing, unmodified purchase functions, then writes batches and serials to super-shop tables. `PurchaseForms` and `purchase_service` are not edited.
- **Batch & expiry** are entered per GRN line (or scanned from GS1). Stock below the minimum remaining shelf life is rejected or needs approval.
- **Serials** are scanned in per unit at GRN.
- **Variant tags** and **weight labels** are printed at receiving or at the department scale.
- A **FEFO replenishment list** tells shelf staff which batch to bring forward.

### 9.3 New back-office routes
| Route | Purpose | Feature key |
|---|---|---|
| `/app/super-shop/dashboard` | Department KPIs: sales, margin, stock value, expiry risk, stock-outs | — |
| `/app/super-shop/products` | Super-shop product master with department panels (§9.1) | `super-shop.departments` |
| `/app/super-shop/receiving` | Goods receipt with batch/expiry/serial capture (§9.2) | `super-shop.batch` |
| `/app/super-shop/inventory` | Department stock, valuation, batch/serial drill-down, exception queue (§9.4) | `super-shop.departments` |
| `/app/super-shop/returns` | Department-aware returns | `super-shop.departments` |
| `/app/super-shop/departments` | Departments, flags, VAT class, return policy, supervisor, colours | `super-shop.departments` |
| `/app/super-shop/layout` | Zones, aisles, shelves, shelf-edge labels | `super-shop.departments` |
| `/app/super-shop/lanes` | Counter profiles, drawer limits, fast-key layouts, payment terminals | `super-shop.fast_keys` |
| `/app/super-shop/price-changes` | Scheduled price changes and publishing; prints changed labels only | `super-shop.price_publish` |
| `/app/super-shop/expiry-markdown` | Near-expiry board, markdown rules, write-off | `super-shop.expiry_markdown` |
| `/app/super-shop/scale-station` | Label barcode format, PLU export to scales, tare presets | `super-shop.scale` |
| `/app/super-shop/loss-prevention` | Exception reports per cashier (§13) | `super-shop.loss_prevention` |

### 9.4 Inventory
A **new** `/app/super-shop/inventory` screen provides the following. The shared [app.inventory.index.tsx](../src/routes/app.inventory.index.tsx) is not modified and keeps showing super-shop stock totals like any other pack:
- A department filter.
- Department valuation totals (cost and retail).
- Batch and serial drill-downs.
- A stock-exception queue (unbatched sales, negative stock).
- A reorder list grouped by department supervisor.

### 9.5 HQ price & promotion publishing
Prices and promotions are prepared centrally as a **price-change document** with an effective date and a store scope. Publishing does four things:
1. Updates the prices that take effect at the effective time.
2. Starts a catalog delta sync on every counter.
3. Queues shelf-label printing for **changed items only**.
4. Records who changed what, and when, for audit.

---

## 10. Receipt & Invoice

Rendered by a **new** `super-shop/receipt.ts` template, printed through the existing [print-document.ts](../src/lib/print-document.ts) API. [receipt-templates.ts](../src/lib/receipt-templates.ts) is used read-only, for company branding. Lines print in **scan order**:

```
            WRIKMART SUPER SHOP — Gulshan
      BIN 000000000-0000 · Mushak 6.3 (if applicable)
Inv SS-2026-000812   28/09/26 18:42   Lane 03 · C-117
--------------------------------------------------
Pran Mango 1L         2 × 220.00          440.00
  MRP 240.00 · You save 40.00
Beef bone-in    1.350kg × 850.00        1,147.50
Polo Shirt XL Navy    1 × 850.00          850.00
Napa 500mg ×10        1 ×  12.00           12.00
Walton LED 12W        1 × 350.00          350.00
  S/N 884920481 · Warranty 12 months
--------------------------------------------------
Items 6                      Subtotal   2,799.50
VAT  [STANDARD]  on x,xxx.xx              xxx.xx
VAT  [EXEMPT]    on x,xxx.xx                0.00
Round-off                                  +0.50
TOTAL                                   x,xxx.00
Cash 3,000.00                 Change      xxx.00
You saved ৳40.00 today · Points earned 28
Returns: see policy by department on reverse / QR
```
- The VAT summary is **by class**, and every figure comes from the server quote.
- **Department totals** are not printed on the customer receipt. They appear in the Z report and department reports.
- A **warranty slip** prints separately when the `warranty` flag is present (reuses the Electronics template).
- Returnability is printed as a short policy line or a QR link, not per line.
- A grouped-by-department layout is available as an optional template setting, off by default.

---

## 11. Security, Permissions & Compliance

### 11.1 Permissions ([permissions.ts](../src/lib/permissions.ts) + backend)
All permissions are new and namespaced (rule I-7). The "recommended for" column is the assignment an admin makes when the pack is enabled. **No existing role changes automatically**, and existing `pos.*` permissions keep their current meaning.

| Permission | Recommended for |
|---|---|
| `super-shop.manage` | Admin, Store Manager |
| `super-shop.department_supervise` | Department Supervisor (own departments only) |
| `super-shop.price_publish` | Admin, HQ Pricing |
| `super-shop.pos_sell` | Super-shop cashier |
| `super-shop.void_after_subtotal` | Supervisor |
| `super-shop.price_override` | Supervisor |
| `super-shop.manual_weight` | Supervisor (manual weight when a scale is fitted) |
| `super-shop.no_sale` | Cashier, with a reason code |
| `super-shop.cash_pickup` | Supervisor |
| `super-shop.shift_close`, `super-shop.shift_view` | Cashier / Supervisor |
| `super-shop.receive`, `super-shop.inventory_view` | Store staff |
| `super-shop.expired_writeoff` | Department Supervisor |
| `super-shop.reports_view` | Manager |

Supervisor approval is given **at the lane**, by PIN or supervisor card, without logging the cashier out. It is a new super-shop component. Audit entries are written through the existing audit-log API unchanged.

### 11.2 Audit events
Each of these writes an audit-log entry with user, approver, counter and line:
- Void after subtotal, and whole-transaction cancel.
- Price override and open-price entry.
- Manual weight entry.
- No-sale.
- Cash pickup and payout.
- Blind-count variance over tolerance.
- Age-restriction confirmation.
- Quote mismatch (409).
- Stock exception (unbatched or negative stock).

### 11.3 Pharmacy department scope
Selling prescription-only medicines usually needs a licensed pharmacy and a pharmacist on site. The super-shop pharmacy department therefore:
- Allows **OTC products only** by default.
- Blocks products marked `rx_only` unless the store has the existing `pharmacy` pack enabled **and** the user holds a pharmacist role.
- Must have its regulatory rules signed off by the client before go-live.

---

## 12. Hardware & Offline

### 12.1 Scales
Two kinds of scale are supported through one shared adapter (Web Serial where the browser supports it; otherwise the existing mock/manual path):
- **Department label scales** (fresh and meat counters). PLUs, prices and tares are **exported** to them from `/scale-station`, and they print weight/price-embedded labels.
- **Checkout scanner-scales** (lanes). A reading is accepted only once it is **stable** and above a configurable minimum weight. The zero and tare state is shown in the scale strip.

### 12.2 Barcode formats
| Format | Use | Parsed into |
|---|---|---|
| EAN-13 / EAN-8 / UPC-A | Packaged goods, variant tags | Product / variant |
| Store label EAN-13 `P PPPPP VVVVV C` | Weight/price-embedded fresh labels | PLU + weight (g) or price. Prefix and layout configured in `scale_label_config` |
| GS1 DataMatrix / GS1-128 (AIs 01, 10, 17, 21) | Medicines, cosmetics where printed | GTIN + batch + expiry + serial |
| Code-128 | Internal serial and IMEI labels | Serial |

The parsers live in a **new** `src/features/pos/super-shop/barcode.ts`. Plain codes fall through to the existing, unmodified [barcode-pos.ts](../src/lib/barcode-pos.ts) lookup. They are covered by unit tests for check-digit validation, every value type, and malformed input.

### 12.3 Customer display & terminal
- The **customer display** is a second-screen route that mirrors the cart, savings, total and payment QR.
- The **card terminal** connects through a per-lane adapter (§8.7). If it is unavailable, the lane falls back to manual card entry with an audit flag.

### 12.4 Offline
- Offline super-shop sales go into a **separate** IndexedDB store (`pulse-super-shop`) with its own sync worker, targeting `POST /super-shop/sales`. The existing offline queue ([offline-store.ts](../src/lib/offline-store.ts)) is not modified and never holds super-shop sales.
- The local catalog cache is also super-shop-owned (§8.5).
- **FEFO batch allocation runs at sync**, on the server, using the rule in §6.4.
- **Serial captures** made offline are validated at sync. If a serial is already sold, the sale syncs with a flagged exception for supervisor review. It is never silently dropped.
- Offline VAT classes and prices carry a version stamp. A sale made on a stale snapshot is flagged at sync, and **the price charged is honoured**.

---

## 13. Reporting

| Report | Key dimensions |
|---|---|
| X / Z report | Shift: tenders, VAT by class, department totals, voids, refunds, no-sales, round-off, variance |
| Department sales & margin | Department → category → product; hour; lane; cashier |
| VAT by class | Taxable value and VAT per class, per day. Feeds the VAT return |
| Perishable loss | Expired write-off, markdown value, wastage, by department and batch |
| **Loss prevention** | Per cashier: voids, post-subtotal voids, no-sales, price overrides, manual weights, refunds without receipt, blind-count variance. Outliers are flagged against the store average |
| Basket analytics | Departments per basket, cross-department attach rate |
| Lane throughput | Items per minute, baskets per hour, share of scans with no dialog, by lane type |
| Stock valuation & exceptions | Cost and retail value by department and zone. Unbatched and negative-stock exceptions |

---

## 14. Feature Flags

Appended to `ALL_FEATURE_FLAGS` under a `superShopFeatures` group, using `pack: "super-shop"`. `ROUTE_FEATURE_KEYS["super-shop"]` maps routes to these flags. They are read only by super-shop code. "Default on" means on **inside** the pack once the pack is enabled; the pack itself is off by default (I-6).

| Key | Default | Description |
|---|---|---|
| `super-shop.departments` | on | Department taxonomy, filters, department reports |
| `super-shop.scale` | on | Scale labels, scanner-scale, PLU entry |
| `super-shop.batch` | on | Batch capture at GRN + server FEFO allocation |
| `super-shop.variant` | on | Variant generation, barcodes, tags |
| `super-shop.serial` | on | Serial capture at GRN and counter, warranty slip |
| `super-shop.fast_keys` | on | Fast-key layouts per lane |
| `super-shop.blind_close` | on | Blind count, X/Z reports, drawer limits |
| `super-shop.expiry_markdown` | on | Department-scoped markdown rules, near-expiry board |
| `super-shop.loss_prevention` | on | Exception reporting per cashier |
| `super-shop.price_publish` | off | HQ price-change documents (enable for multi-store tenants) |
| `super-shop.payment_terminal` | off | Integrated card terminal and dynamic QR |
| `super-shop.customer_display` | off | Second-screen customer display |
| `super-shop.express_lane` | off | Express lane profile |
| `super-shop.age_restricted` | off | Age confirmation prompts |
| `super-shop.dept_grouped_receipt` | off | Optional grouped receipt layout |

If a capability flag is switched **off**, the matching capability is treated as absent. For example, with `batch` off, sales post without batch allocation. The item stays sellable.

---

## 15. Test Strategy

| Layer | Scope | Location |
|---|---|---|
| Unit (Vitest) | Tests cover:<br>• `resolveAddIntent`: every table row, flag combinations, the ≥ 95% no-dialog path.<br>• Barcode parsers (EAN, store-label, GS1).<br>• Quantity multiplier.<br>• Per-line tax and rounding.<br>• Round-off.<br>• Capability resolution. | `src/features/pos/super-shop/__tests__/` |
| Wiring (Vitest) | Tests cover:<br>• Registry entry; `defaultPackConfigs()["super-shop"]` is disabled.<br>• `MODES` map, routes, `super-shop.*` permissions, flags.<br>• No pack-stub or `localStorage` usage.<br>Follows the existing `*-vertical-wiring.test.ts` pattern. | `src/test/super-shop-vertical-wiring.test.ts` |
| Backend (pytest) | Tests cover:<br>• Migration up/down.<br>• Department CRUD + tenancy isolation.<br>• `/quote` tax maths.<br>• Recompute-and-verify 409.<br>• **FEFO allocation across several batches**, the expired-batch block, short batch stock → exception.<br>• Returns restock to the original batch.<br>• Serial double-sell under concurrency.<br>• Offline sync allocation.<br>• Blind-close variance and Z-report numbering. | `backend/tests/test_super_shop.py` |
| E2E (Playwright) | Mixed basket: packaged scan, `12*` multiplier, weight label, scanner-scale item, fast key, variant tag, GS1 medicine, serial item, age item → split tender → receipt totals match the invoice. Then shift close with a blind count and a Z report | `e2e/super-shop.spec.ts` |
| **Isolation gate (§0.3)** | The checks run on every PR:<br>• Protected-file diff: only additions, and only to the §0.2 files.<br>• Migrations create new tables only; downgrade restores the 055 schema.<br>• API snapshots for every existing pack are byte-identical.<br>• Pack disabled by default.<br>• Lazy-loaded bundle. | `scripts/check-super-shop-isolation.mjs`, `backend/tests/test_super_shop_isolation.py`, `src/test/super-shop-isolation.test.ts` |
| Regression | **Every** existing Vitest, pytest and Playwright suite, run unchanged | CI gate |
| Performance | Scan-to-cart timing with a 20,000-SKU seeded catalog | Playwright trace, CI-reported |

**Definition of Done for each phase:** **isolation gate green** · tests green · type-check and lint clean · no new `pack-stub-data` usage · docs updated · QA sign-off recorded in `SUPER_SHOP_POS_QA_REPORT.md` (matching the existing QA report convention).

---

## 16. Delivery Plan

| Phase | Scope | Exit criteria | Size |
|---|---|---|---|
| **P0 — Foundations & isolation gate** | **Isolation gate scripts and API snapshots first**, then registry entry (disabled), route stub, `super-shop.*` permissions and flags; migration 056; department + VAT class CRUD; `seed_super_shop.py` | Isolation gate green; pack appears in configuration only when enabled; wiring test green | M |
| **P1 — Stock capabilities** | `super_shop_batch` / `super_shop_serial`; super-shop receiving; **FEFO allocator**; variant generation + barcodes + tags; super-shop scale adapter | FEFO allocation tests green; isolation gate green | L |
| **P2 — Super Shop POS** | `SuperShopPos` (on unmodified `PosShell`), scan dispatcher, local catalog + delta sync, fast keys, PLU entry, scanner-scale, `SerialCaptureDialog`, `/lookup`, `/quote`, `POST /super-shop/sales` | Mixed-basket e2e passes; ≥ 95% no-dialog; performance budgets met; isolation gate green | L |
| **P3 — Tax, invoicing & cash** | Line tax extension rows, recompute-and-verify, super-shop receipt, round-off, warranty slip; migration 057: blind close, X/Z, drawer limits, no-sale | Server total equals printed total across the tax matrix; Z report reconciles to tenders; isolation gate green | M |
| **P4 — Back-office** | Super-shop product, inventory, returns, departments, layout, lanes, scale and markdown screens | Product CRUD per department; labels and tags print; isolation gate green | M |
| **P5 — Reporting & hardening** | Department, VAT-by-class and loss-prevention reports; audit events; offline sync allocation; demo catalog (≈150 SKUs across 7 departments) | Pilot UAT checklist signed | M |
| **R2 — Scale-out** | HQ price publishing, integrated card terminal and dynamic QR, customer display, mix-and-match promotions, handheld PWA | Per feature | — |

**Critical path:** P0 → P1 → P2 → P3. P4 can run in parallel with P2 once P0 is merged. For the pilot, see the MVP slice in §20.5.

**Lovable sync note:** every phase merges to `main` as small, working increments behind the `super-shop` pack toggle, so the synced branch always builds.

---

## 17. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Batch stock drifts from the shelf, because FEFO is assumed and not scanned | Medium | Medium | Batch capture at GRN, a FEFO replenishment list, cycle counts by batch, GS1 scan where printed. The stock-exception queue shows drift early |
| **Super-shop work changes behaviour of an existing POS or screen** | High | Low (by design) | Zero-Impact Contract (§0): additive-only edits, extension tables, dedicated endpoints, pack off by default, and the isolation gate + API snapshots + full regression suite block any merge that breaks it |
| Some code duplicated with existing verticals (scale, serial, FEFO) | Low | Certain | Accepted cost of isolation (AD-5). Consolidation is a separate, opt-in epic with its own regression sign-off |
| Mixed VAT configured wrongly by the tenant | High | Medium | VAT classes need admin + confirmation. A "VAT by class" report is available from day one. Client tax sign-off before go-live |
| Large catalog degrades POS | Medium | High | Local IndexedDB catalog, delta sync, virtualised grid, 20k-SKU performance test in CI |
| Scale and terminal hardware variety | Medium | Medium | Adapter interfaces + manual fallbacks with audit. Validate on the pilot's actual models ([HARDWARE_INTEGRATION.md](HARDWARE_INTEGRATION.md)) |
| Cash shrinkage at lanes | High | Medium | Blind close, drawer limits, no-sale reason codes, loss-prevention report |
| Serial double-sell offline | Medium | Low | Validation at sync + supervisor exception queue |
| Scope creep into full pharmacy | Medium | Medium | OTC-only default (§11.3). Rx needs the pharmacy pack |

---

## 18. Open Questions

1. Which VAT classes and rates apply to the pilot client, are prices MRP-inclusive, and is an NBR fiscal device (EFD/SDC) required? *(Owner: client finance)*
2. Which department label scales and checkout scanner-scales does the pilot store use, and what label layout do they print? *(Owner: hardware)*
3. Do suppliers print GS1 DataMatrix on medicines and cosmetics for the pilot range? *(Decides how often the exact batch is known at scan)*
4. Which card acquirer and terminal model will the lanes use, and do bKash/Nagad merchant APIs support dynamic QR for the client? *(Owner: client finance)*
5. What are the cash variance tolerance and the drawer limit per lane? *(Owner: store operations)*
6. Should one invoice be allowed across departments owned by different legal entities (concession counters)? *(Default: no)*
7. Should existing packs (Grocery, Pharmacy) move onto capability profiles in the next release? *(Owner: product)*

---

## 19. File Change Inventory

### 19.1 Existing files touched: additive registration only (§0.2)
| Path | Edit |
|---|---|
| `src/lib/industry-registry.ts` | Append `super-shop` to the type, `INDUSTRY_PACK_IDS`, `POS_MODES`, `INDUSTRY_PACKS`, `defaultPackConfigs` (**false**), `superShopFeatures`, `ROUTE_FEATURE_KEYS` |
| `src/features/pos/PosModeView.tsx` | 1 import + 1 `MODES` entry (lazy-loaded) |
| `src/lib/product-form-registry.ts` | 1 `PRODUCT_FORM_REGISTRY` entry |
| `src/lib/nav-config.ts` | 1 `PACK_ICONS` entry |
| `src/lib/permissions.ts`, `src/lib/backend-permissions.ts`, backend permission list | Append `super-shop.*` permissions (no role changes) |
| `backend/app/api/v1/router.py` | 1 `include_router` line |
| `backend/app/models/__init__.py` | 1 import |

**Explicitly not modified:**
- `PosShell.tsx` and every other `*Pos.tsx` file.
- `PosReturnExchange.tsx`, `ShiftDialog.tsx`, `PurchaseForms.tsx`.
- `app.products.tsx`, `app.inventory.index.tsx`.
- `receipt-templates.ts`, `print-document.ts`, `barcode-pos.ts`, `offline-store.ts`, `fresh-markdown-policy.ts`, `use-pos-catalog.ts`, `industry-mock.ts`.
- `models/product.py`, `models/sales.py`.
- `sales_service.py`, `purchase_service.py`, `inventory_service.py`, `industry_sales_service.py`.
- `seed.py`.

### 19.2 New frontend files
| Path | Purpose |
|---|---|
| `src/features/pos/SuperShopPos.tsx` | POS mode on unmodified `PosShell` |
| `src/features/pos/super-shop/{dispatch.ts,barcode.ts,receipt.ts,FastKeys.tsx,ScaleStrip.tsx,DepartmentBar.tsx,VatSummary.tsx}` | Dispatcher, parsers, receipt, lane UI |
| `src/features/pos/super-shop/capabilities/*` | Scale adapter, `WeighDialog`, `SerialCaptureDialog`, `VariantLookup`, `AgeConfirmDialog`, `PriceEntry`, `SupervisorApproval` |
| `src/features/pos/super-shop/{SuperShopCashControl,SuperShopReturn}.tsx` | Cash control and returns |
| `src/features/pos/super-shop/offline.ts` | Super-shop IndexedDB catalog + sale queue |
| `src/features/pos/super-shop/demo-catalog.ts` | Demo data (not in `industry-mock.ts`) |
| `src/hooks/use-super-shop.ts` | Departments, catalog, lookup, quote, sales, serials, lanes, cash-event hooks |
| `src/routes/app.pos.super-shop.tsx` | POS route |
| `src/routes/app.super-shop.{dashboard,products,receiving,inventory,returns,departments,layout,lanes,price-changes,expiry-markdown,scale-station,loss-prevention}.tsx` | Back-office routes |
| `src/test/super-shop-vertical-wiring.test.ts`, `src/test/super-shop-isolation.test.ts` | Wiring + isolation tests |
| `scripts/check-super-shop-isolation.mjs` | Protected-file diff gate |

### 19.3 New backend files
| Path | Purpose |
|---|---|
| `backend/alembic/versions/056_super_shop_foundation.py`, `057_super_shop_counter_controls.py` | New tables only |
| `backend/app/models/super_shop.py` | All `super_shop_*` tables incl. extension tables |
| `backend/app/schemas/super_shop.py` | Request/response schemas |
| `backend/app/services/super_shop_service.py` | Capability resolution, FEFO allocator, serial validation, quote, Z report |
| `backend/app/services/super_shop_sale_service.py` | Dedicated sales/returns/receiving orchestration over existing, unmodified services |
| `backend/app/api/v1/super_shop.py` | `/api/v1/super-shop/*` router |
| `backend/app/seed_super_shop.py` | Opt-in demo seed |
| `backend/tests/test_super_shop.py`, `backend/tests/test_super_shop_isolation.py` | Feature + isolation tests |

### 19.4 E2E & Docs
| Path | Action |
|---|---|
| `e2e/super-shop.spec.ts` | **Create** |
| `docs/MODULE_STATUS.md` | Update (docs only) |
| `docs/SUPER_SHOP_POS_QA_REPORT.md` | Create at P5 |

---

## 20. Feature Enhancements & Scope Changes

This section lists what changed from the v1 blueprint and the features ranked **MoSCoW** (Must / Should / Could) for the pilot. Items marked 🔁 build on something that already exists in the codebase.

### 20.1 Changes to the v1 blueprint
| # | v1 said | Change | Why |
|---|---|---|---|
| C1 | Fixed list of 7 departments in code | Departments are **tenant master data** | Every super shop splits its floor differently |
| C2 | Each department has one "sale mode" | **Composable capability flags** (AD-2) | Cosmetics need a batch *and* a shade |
| C3 | Hard-coded VAT rates (5% / 7.5% / 0%) | **Configurable VAT classes**, server-recomputed | Rates change by law and by product |
| C4 | Rx validation at the super-shop counter | **OTC-only by default** | Regulatory exposure |
| C5 | **Batch/FEFO dialog at the counter** | **Server-side FEFO allocation.** Batch captured at GRN. GS1 scan when printed | Cashiers can't identify batches by eye. A dialog slows the lane |
| C6 | **Size × colour dialog at the counter** | **Each variant has its own barcode.** The matrix moves to the back office for generation and tags | Standard apparel retail practice. Removes a dialog from every apparel sale |
| C7 | **Cart and receipt grouped by department** | **Scan order.** Department totals go to the Z report and reports | Customer expectation; matches the cashier's screen |
| C8 | **Weigh dialog as the main fresh path** | **Weight-embedded labels** for pre-packed items; **scanner-scale + PLU / fast keys** for loose items | How fresh departments and checkout lanes actually operate |
| C9 | No cash controls | **Blind close, X/Z, drawer limits, no-sale codes** | Core cash accountability at any multi-lane store |
| C10 | Department bar as the main input | **Scan field first.** Fast keys for unlabelled items. Grid as fallback | Throughput |
| C11 | Big-bang delivery | **MVP slice first** (§20.5) | Earlier pilot feedback and smaller merges for the Lovable sync |
| C12 | Modify `PosShell`, `sales_service`, product/sales tables and shared screens | **Zero-Impact Isolation Contract** (§0): additive only, extension tables, dedicated endpoints | Guarantees no effect on any other POS or module |

### 20.2 Checkout & counter
| Priority | Feature | Description |
|---|---|---|
| **Must** | Scan-first dispatcher | ≥ 95% of scans add with no dialog (§8.2) |
| **Must** | Fast keys + PLU entry | Configurable button pages and PLU entry for unlabelled items |
| **Must** | Scanner-scale integration | Stable-weight read for loose produce |
| **Must** | Blind close + X/Z reports 🔁 | Reads existing cashier shifts (migration 028). Stores its data in super-shop tables |
| **Must** | Drawer limit, cash pickup, no-sale codes | Cash accountability |
| **Must** | Supervisor approval at the lane | PIN or card, without logging the cashier out |
| **Must** | Mushak-6.3 VAT invoice format | BIN, invoice serial, VAT by class. Fiscal-device hook if required *(confirm)* |
| **Must** | Department-aware returns 🔁 | New `SuperShopReturn` flow ([PosReturnExchange.tsx](../src/features/pos/PosReturnExchange.tsx) untouched) with:<br>• return policy and window per department;<br>• restock to the original batch/serial;<br>• VAT reversed at the original rate. |
| **Must** | Cash round-off | Nearest ৳1 (configurable), posted to a round-off account |
| **Must** | Quantity multiplier (`12*` + scan) | Case-lot FMCG |
| **Should** | Integrated card terminal + dynamic QR 🔁 | Amount sent to the terminal. bKash/Nagad QR with the amount |
| **Should** | Customer-facing display | Mirrors the cart, savings, total and QR |
| **Should** | Suspend/resume across lanes 🔁 | Held sales recallable from any lane by barcode |
| **Should** | Price-check mode | `F9`. Also works as a kiosk route |
| **Should** | Carry-bag / bottle-deposit lines | Non-inventory lines. Deposits refundable |
| **Could** | Donation round-up | Change rounded up to a partner charity |
| **Could** | SMS / WhatsApp e-receipt | Receipt link to the customer's phone |

### 20.3 Pricing & promotions
| Priority | Feature | Description |
|---|---|---|
| **Must** | Department-scoped promotions 🔁 | Existing promo codes (044), price lists (042) and time pricing (055) scoped by department through `super_shop_rule_scope`. The shared tables are unchanged |
| **Should** | HQ price publishing | Scheduled price-change documents, delta sync, changed-label printing (§9.5) |
| **Should** | Mix-and-match / bundle offers | "Any 3 soaps for ৳100". New super-shop rule engine, modelled on Fashion's buy-X-get-Y (040); Fashion code untouched |
| **Should** | Member pricing 🔁 | Regular and member price, applied with a loyalty customer (041) |
| **Should** | Automatic near-expiry markdown | Batches within N days get marked down. Clearance stickers from the expiry board |
| **Could** | Promotion simulator | Margin impact on last month's baskets before enabling |

### 20.4 Inventory & operations
| Priority | Feature | Description |
|---|---|---|
| **Must** | Batch/expiry/serial capture at GRN | New super-shop receiving over unmodified purchase functions. Minimum shelf-life check |
| **Must** | Variant generation + tag printing 🔁 | Matrix → variants → barcodes → tags (from the Fashion pack) |
| **Must** | Stock-exception queue | Unbatched and negative-stock sales for supervisor action |
| **Must** | Shrinkage & wastage ledger | Reason codes per department. New super-shop ledger; beef wastage log untouched |
| **Must** | Department cycle counts 🔁 | Count by aisle or department, including by batch. Variance posted with approval |
| **Should** | Shelf-edge labels | Price, unit price (৳/kg, ৳/100 ml), barcode, promo tag |
| **Should** | FEFO replenishment list | Tells shelf staff which batch to bring forward |
| **Should** | Reorder suggestions by supervisor 🔁 | Min/max + average daily sales → draft PO |
| **Could** | Handheld PWA for staff | Lookup, GRN, count, price check on an Android scanner |
| **Could** | Electronic shelf labels (ESL) | Integration interface only |

### 20.5 Recommended MVP slice (pilot-ready)
This is the smallest release that runs a real super-shop lane:

1. **Foundations**: departments, VAT classes, migration 056, registry and permissions.
2. **Stock at the door**:
   - Batch, expiry and serial capture at GRN.
   - FEFO allocator.
   - Variant barcodes and tags.
3. **Lane**:
   - Scan-first dispatcher, local catalog, quantity multiplier.
   - Weight-embedded labels, scanner-scale, PLU, fast keys.
   - Serial capture, age check.
   - Supervisor approval.
4. **Money**:
   - Server quote + recompute-and-verify.
   - Mushak-format scan-order receipt, round-off.
   - Blind close, X/Z reports, drawer limits.
5. **After-sale**: department-aware returns.
6. **Reports**: department sales, VAT by class, stock valuation, loss prevention.

**Release 2:**
- HQ price publishing.
- Integrated card terminal and dynamic QR.
- Customer display.
- Mix-and-match promotions.
- Shelf-edge labels.
- Handheld PWA.

### 20.6 Success metrics for the pilot
| Metric | Target |
|---|---|
| Regressions in other POS modes or modules caused by super-shop | **0** |
| Share of scans added with no dialog | ≥ 95% |
| Average items scanned per minute (express lane) | ≥ 20 |
| Invoices with a tax mismatch (409) after week 1 | < 0.1% |
| Expired units sold | 0 |
| Serial double-sell incidents | 0 |
| Shifts closed with a blind count and a Z report | 100% |
| Cash variance per shift | Within the agreed tolerance on ≥ 98% of shifts |
| Stock exceptions (unbatched sales) | < 1% of batch-tracked lines after month 1 |
| Perishable write-off value vs. baseline | −15% by month 3 |
