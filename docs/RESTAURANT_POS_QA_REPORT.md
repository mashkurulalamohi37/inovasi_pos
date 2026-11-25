# Restaurant POS — QA Test Report & Defect Register

| | |
|---|---|
| **Scope** | Restaurant vertical only (POS, tables, KOT/KDS, billing) |
| **Branch** | `main` @ `7847be6` |
| **Date** | 2026-08-09 |
| **Verdict** | 🚫 **BLOCKED** — 2 criticals (all 28 since fixed, see §6) |
| **Defects** | 28 (2 Critical, 8 High, 12 Medium, 6 Low) |
| **Cases** | 34 planned · 25 executed · 9 blocked |

> **Status:** this register records the findings as they stood at `main` @ `7847be6`.
> All 28 have since been fixed — see [§6 Remediation](#6-remediation) for what
> changed and what still needs browser verification.

---

## 1. Release verdict

Two independent blockers stop the restaurant POS from shipping.

**The production build fails outright.** `src/features/pos/RestaurantPos.tsx` contains a duplicated JSX block committed to `main`, so neither `tsc` nor `vite build` can parse it.

**Separately, the billing endpoint rejects every restaurant payment** with `400 price_override_reason required`. The project's own backend tests confirm it — an order can be taken, sent to the kitchen, and served, but never closed, leaving the table occupied permanently.

### Execution summary

| Result | Count |
|---|---|
| ✅ Passed | 14 |
| ❌ Failed | 11 |
| ⏸️ Blocked | 9 |

All 9 blocked cases are browser-dependent (cross-browser rendering, viewport responsiveness, keyboard navigation, console/network inspection). They stay blocked until BUG-01 is resolved.

---

## 2. Test plan & results

Priority: **P1** revenue or data integrity · **P2** core flow · **P3** polish

### Order lifecycle

| ID | Description | Steps | Expected | Pri | Result |
|---|---|---|---|---|---|
| RP-01 | Open dine-in order by tapping a free table | Tap an available table tile | Order opens, table occupied, toast confirms | P2 | ⏸️ BLOCKED |
| RP-02 | Create order via API | `POST /industry/restaurant/orders` | 200, order_no assigned, table occupied | P1 | ✅ PASS |
| RP-03 | Reject second order on occupied table | POST order for already-occupied table | 409 Table already has an active order | P1 | ✅ PASS |
| RP-04 | Dine-in requires a table | POST dine_in with no table_id | 400 table_id required | P2 | ✅ PASS |
| RP-05 | Delivery requires address + phone | POST delivery without either | 400 naming both fields | P2 | ✅ PASS |
| RP-06 | Add line to order | `POST /orders/{id}/lines` | 200, subtotal recalculated | P1 | ✅ PASS |
| RP-07 | Reject line on closed order | Add line after payment | 400 Cannot add items to a closed order | P2 | ✅ PASS |
| RP-08 | Cancel order releases table | `POST /orders/{id}/cancel` with reason | Order cancelled, table available | P2 | ✅ PASS |
| RP-09 | Cancel requires a reason | POST cancel with empty body | 400 reason required | P3 | ✅ PASS |
| RP-10 | Order number uniqueness under load | Create N orders concurrently | All order_no distinct | P1 | ❌ FAIL |

### Billing & payment

| ID | Description | Steps | Expected | Pri | Result |
|---|---|---|---|---|---|
| RP-11 | Pay order → invoice + table release | `POST /orders/{id}/pay` | 200, invoice created, table available | P1 | ❌ FAIL |
| RP-12 | Equal split payment | POST pay with `split_count: 2` | 200, two equal payments summing to total | P1 | ❌ FAIL |
| RP-13 | Settle dialog total matches charged total | Open Bill & Pay, compare to invoice | Displayed total equals invoice total | P1 | ❌ FAIL |
| RP-14 | Cart tax matches backend tax | Compare PosShell total to invoice | Identical to the paisa | P1 | ❌ FAIL |
| RP-15 | Payment total must equal bill | POST pay with short payment | 400 Payment total must equal bill | P1 | ❌ FAIL |
| RP-16 | Reject discount above subtotal | POST pay, discount > subtotal | 400 Discount exceeds subtotal | P2 | ✅ PASS |
| RP-17 | Reject double billing | POST pay twice on one order | 400 Order already billed | P1 | ✅ PASS |
| RP-18 | Change-due resets between orders | Pay, open next order, view dialog | Tendered resets to zero | P2 | ❌ FAIL |

### Tables & KOT

| ID | Description | Steps | Expected | Pri | Result |
|---|---|---|---|---|---|
| RP-19 | Add table from POS modal | + Tables → fill form → Add Table | Table appears in grid | P2 | ❌ FAIL |
| RP-20 | Add table from back office | Tables page → New table | Table created | P2 | ✅ PASS |
| RP-21 | Reject duplicate table code | Create same table_no twice | 400 Table code already exists | P3 | ✅ PASS |
| RP-22 | Edit table capacity & zone | Pencil → change → Update | Values persist; code field shows table code | P2 | ❌ FAIL |
| RP-23 | Delete an empty table | Trash → confirm | 200, table removed | P2 | ❌ FAIL |
| RP-24 | Block delete of occupied table | Delete table with live order | 400 Cannot delete a table with an active order | P2 | ❌ FAIL |
| RP-25 | Move order to another table | Move table → pick target → confirm | Order moves, source released | P2 | ❌ FAIL |
| RP-26 | Move via API contract | `POST /orders/{id}/move-table` | 200, both tables updated | P2 | ✅ PASS |
| RP-27 | Send KOT for unsent lines | Add items → Send KOT | KOT per station, unsent count → 0 | P1 | ✅ PASS |
| RP-28 | Reject KOT with nothing unsent | Send KOT twice | 400 No unsent items | P2 | ✅ PASS |
| RP-29 | KDS status transitions | sent → accepted → preparing → ready | Each 200; illegal jumps 400 | P2 | ✅ PASS |
| RP-30 | KDS actions hidden without permission | Sign in lacking kitchen_manage | Action buttons hidden | P2 | ❌ FAIL |

### UI, responsiveness, security

| ID | Description | Steps | Expected | Pri | Result |
|---|---|---|---|---|---|
| RP-31 | Cross-browser (Chrome/Firefox/Safari/Edge) | Load `/app/pos/restaurant` in each | Consistent layout, no console errors | P2 | ⏸️ BLOCKED |
| RP-32 | Responsive at 390 / 768 / 1440 px | Resize; check table grid + header | No overflow or clipped controls | P2 | ⏸️ BLOCKED |
| RP-33 | Keyboard navigation & focus states | Tab through tiles, grid, dialogs | Visible focus, dialogs trap focus | P3 | ⏸️ BLOCKED |
| RP-34 | CORS rejects unknown origins | Inspect middleware config | Explicit allowlist, no reflected origin with credentials | P1 | ❌ FAIL |

---

## 3. Defect register

### 🔴 BUG-01 · Critical — Duplicated JSX block breaks the build; app does not compile

**Repro**
1. Check out `main` at `7847be6`
2. Run `npm run build` (or `npx tsc --noEmit`)

**Expected** — Build completes; bundle emitted.

**Actual** — Build fails: `` Expected `}` but found `const` `` at `RestaurantPos.tsx:900:17`. `tsc` reports 15 parse errors. A ~320-line block (product card renderer, modifier / move / split / pay / KOT dialogs) was pasted into the middle of the Kitchen-tickets dialog at line 900, orphaning the original.

**Impact** — Nothing deploys. The restaurant POS route cannot render in any browser, which blocks all nine browser-dependent test cases.

**Source** — `src/features/pos/RestaurantPos.tsx:883–1220`

**Suggested fix** — Delete the duplicated region (lines 900–1101 re-run content from 703–899) and restore the Kitchen-tickets dialog's original closing tags. Add `tsc --noEmit` to CI so a non-compiling commit cannot reach `main`.

---

### 🔴 BUG-02 · Critical — Restaurant orders can never be paid; MSP guard rejects every bill

**Repro**
1. Open a dine-in order and add a menu item
2. `POST /industry/restaurant/orders/{id}/pay` with `{"tender":"cash","tax_rate":0.05}`

**Expected** — 200; invoice created, order paid, table released.

**Actual** — 400 `price_override_reason required when selling below MSP or over discount cap`. Reproduced by the project's own suite: `test_pay_order_creates_invoice_and_releases_table` and `test_split_payment_equal` both fail (2 failed, 10 passed).

**Cause** — The pricing-authority guard in `sales_policy_service.py` was widened from fashion-only to all packs, but `bill_and_pay_order` was never updated. It forwards the menu price as `unit_price` and builds a meta dict with no `price_override_reason` key, so any menu price under the product's list price or MSP is rejected.

**Impact** — Highest-severity operational failure for a restaurant: staff can seat guests, fire the kitchen, and serve food, then find the bill uncloseable. The table stays occupied with no UI path to recover.

**Source** — `backend/app/services/restaurant_service.py:892–908` · `sales_policy_service.py:185–210`

**Suggested fix** — Treat the restaurant menu price as authoritative — pass the resolved list price, or thread an explicit `price_override_reason` through `SaleLineIn.meta` when the pack is `restaurant`. Add a regression test that pays an order whose menu price is below `base_price`.

---

### 🟠 BUG-03 · High — Settle Bill dialog understates the amount due by 15.5%

**Repro**
1. Build an order totalling ৳1,000 subtotal
2. Open **Bill & Pay** and read the dialog

**Expected** — VAT + service shown; Total Amount Due ৳1,155.

**Actual** — "VAT (5%) + Service" shows **৳0** and Total Amount Due shows **৳1,000**. `order.tax` and `order.service_charge` both default to 0 and are only written during `bill_and_pay_order` — the dialog reads them before they exist.

**Impact** — The cashier reads ৳1,000 to the guest and the "Exact" preset tenders ৳1,000, while the invoice records ৳1,155. Every dine-in transaction under-collects, and the drawer will not reconcile.

**Source** — `src/features/pos/RestaurantPos.tsx:829–836`

**Suggested fix** — Compute the preview client-side with the backend's formula — `service = subtotal × servicePct`, `tax = (subtotal + service) × 0.05` — or add `POST /orders/{id}/quote` so the dialog and the invoice share one source of truth.

---

### 🟠 BUG-04 · High — Cart total applies tax flat where the backend compounds it

**Repro** — Enable `restaurant.service_charge`; compare the PosShell cart total to the issued invoice.

**Expected** — Cart total equals invoice total.

**Actual** — PosShell receives `taxRate = 0.10 + 0.05 = 0.15` and renders `subtotal × 1.15`. The backend charges VAT on the service charge: `(subtotal × 1.10) × 1.05` = `subtotal × 1.155`. A ৳1,000 order differs by ৳5.

**Impact** — Persistent small variance on every serviced order; compounds across a shift and breaks end-of-day reconciliation.

**Source** — `src/features/pos/RestaurantPos.tsx:484` · `restaurant_service.py:920–927`

**Suggested fix** — Pass the service charge to PosShell as a separate line rather than folding it into `taxRate`, so the display mirrors the backend's order of operations.

---

### 🟠 BUG-05 · High — Add Table from the POS always fails (field name mismatch)

**Repro**
1. POS → **+ Tables**
2. Enter code `T-06`, capacity 4
3. Press **Add Table**

**Expected** — Table created and shown in the grid.

**Actual** — 400 `table_no required`. The modal posts `table_number`; the service reads only `table_no` or `table_code`. The back-office page `app.restaurant.tables.tsx` sends `table_no` and works — confirming a defect, not a naming convention.

**Impact** — The headline feature of the last two commits is non-functional from the POS.

**Source** — `src/features/pos/RestaurantPos.tsx:355–360` · `restaurant_service.py:332`

**Suggested fix** — Send `table_no` from the modal. Longer term, replace the `Record<string, unknown>` mutation bodies with typed request interfaces so the compiler catches these.

---

### 🟠 BUG-06 · High — Move Table always fails (field name mismatch)

**Repro** — Open a dine-in order → **Move table** → pick a target → **Confirm Table Move**.

**Expected** — Order transfers; source table released.

**Actual** — 400 `destination_table_id required`. The UI posts `target_table_id`; the service accepts only `destination_table_id` or `table_id`.

**Impact** — Guests cannot be reseated. The API itself is correct (RP-26 passes), so this is purely a client contract error.

**Source** — `src/features/pos/RestaurantPos.tsx:323–326` · `restaurant_service.py:753`

**Suggested fix** — Send `destination_table_id`.

---

### 🟠 BUG-07 · High — Delete table raises AttributeError; 500 on every attempt

**Repro** — `DELETE /industry/restaurant/tables/{id}` on any table.

**Expected** — 200 with a confirmation message, or 400 if the table has an active order.

**Actual** — 500. `delete_table` reads `row.table_number` twice, but `RestaurantTable` defines `table_no` — there is no `table_number` attribute on the model.

**Impact** — Delete is unusable, and the 500 masks the intended 400 guard, so the toast shows a generic error instead of "Cannot delete a table with an active order".

**Source** — `backend/app/services/restaurant_service.py:403,410` · `models/industry.py:224`

**Suggested fix** — Replace both references with `row.table_no`. Add a delete test — the endpoint currently has no coverage at all.

---

### 🟠 BUG-08 · High — Order and KOT numbers derived from row count; collides and scans

**Repro** — Create two orders concurrently from separate terminals, or create an order after deleting an older one.

**Expected** — Monotonic, unique `order_no` / `kot_number`.

**Actual** — `_next_no` is `f"{prefix}-{len(rows)+1:06d}"` over every row for the company. Concurrent callers read the same count and mint the same number; deletions cause reuse. It also loads the full table into memory on every order and KOT creation.

**Impact** — Duplicate ticket numbers during a service rush send the wrong food to the wrong table, and order creation slows linearly as history accumulates.

**Source** — `backend/app/services/restaurant_service.py:59–61`

**Suggested fix** — Use a database sequence or a per-company counter row updated under a lock, and add a unique constraint on `(company_id, order_no)`.

---

### 🟠 BUG-09 · High — Client controls tax rate, service charge, and due-waiver on the bill

**Repro** — `POST /orders/{id}/pay` with `{"tax_rate": 0, "payments": [{"method":"cash","amount":0}], "allow_due": true}` using any token holding `restaurant.order_manage`.

**Expected** — Tax rate from tenant configuration; waiving the balance requires a manager permission.

**Actual** — All three are read straight from the request body. `allow_due` skips the `paid == total` assertion with no permission check, so the order closes as paid with nothing collected.

**Impact** — Any authenticated cashier — or anyone replaying a request from the browser console — can zero out VAT or close a bill without payment. Straightforward revenue-loss vector.

**Source** — `backend/app/services/restaurant_service.py:920–945`

**Suggested fix** — Source `tax_rate` from tenant config; gate `allow_due` behind `pos.manager_discount` or a new `restaurant.allow_due` permission; validate `service_charge` against the configured percentage. Write an audit entry whenever any override is used.

---

### 🟠 BUG-10 · High — CORS reflects any origin while allowing credentials

**Repro** — Set `CORS_ORIGINS=*` (as the non-production defaults and Docker examples do) and issue a cross-origin request from any host.

**Expected** — An explicit allowlist; wildcard and `allow_credentials` never combined.

**Actual** — `allow_origin_regex=r".*"` with `allow_credentials=True` — the middleware echoes back whatever `Origin` is sent and permits credentialed requests from every site on the internet.

**Impact** — Mitigated in production by the config validator (`config.py:108` rejects `*` when `environment=production`) and by bearer tokens in `localStorage` rather than cookies. Staging and dev remain fully open, and the guard is one env var away from being bypassed.

**Source** — `backend/app/main.py:55–65`

**Suggested fix** — Drop the `.*` regex. If a wildcard is genuinely needed locally, pair it with `allow_credentials=False`, and extend the production validator to staging.

---

### 🟡 BUG-11 · Medium — Tapping a table fails silently when order creation errors

**Actual** — The `catch` in `selectTable` clears state but shows no toast. A 409 or 400 leaves the tile looking tapped with no feedback, so staff tap repeatedly.

**Source** — `RestaurantPos.tsx:266–269` · **Fix** — Surface `toast.error(detail)` in the catch, matching `handlePay`.

---

### 🟡 BUG-12 · Medium — Tendered amount persists across orders

**Actual** — `tendered` is never reset on pay or on dialog open, so the next order opens showing the previous guest's change-due banner.

**Source** — `RestaurantPos.tsx:139, 862–867` · **Fix** — `setTendered(0)` in `handlePay` and when `payOpen` becomes true.

---

### 🟡 BUG-13 · Medium — Cart keeps stale lines when service mode switches

**Actual** — Switching Dine-in → Takeaway clears `activeOrderId` but not the cart, so the previous table's items stay visible and are charged to the new ticket.

**Source** — `RestaurantPos.tsx:559–565` · **Fix** — Call `app.clearCart()` alongside `setActiveOrderId(null)`; confirm before discarding a non-empty order.

---

### 🟡 BUG-14 · Medium — Table map and KDS never auto-refresh

**Actual** — No `refetchInterval` on `useRestaurantTables` or `useRestaurantKots`. A table freed at terminal B still reads occupied at terminal A until someone triggers a mutation.

**Source** — `src/hooks/use-api-config.ts:976–1010` · **Fix** — Add a 10–15s `refetchInterval` for tables and KOTs, or move the KDS to server-sent events.

---

### 🟡 BUG-15 · Medium — Edit Table shows a raw UUID in the Table Code field

**Actual** — `handleEditClick` sets `setNewTableNo(t.id)` — the UUID, not the table code. The field is disabled so it cannot be corrected, and the heading reads "Edit Table 3f7a9c2e-…" when no label is set.

**Source** — `RestaurantPos.tsx:378–384, 1118` · **Fix** — Add `table_no` to the `TableRow` type and populate the field from it.

---

### 🟡 BUG-16 · Medium — Kitchen dialog fetches every KOT in the company when no order is open

**Actual** — The hook is called with `undefined` when there is no active order, dropping the `order_id` filter and returning the company's entire KOT history — unpaginated.

**Source** — `RestaurantPos.tsx:154` · **Fix** — Disable the query when `activeOrderId` is null.

---

### 🟡 BUG-17 · Medium — Order and KOT list endpoints have no pagination or date bound

**Actual** — `list_orders` and `list_kots` select every row for the company, then filter and sort in Python. The KDS board degrades continuously as history grows.

**Source** — `restaurant_service.py:419–435, 786–804` · **Fix** — Push filtering and ordering into SQL; add `limit`/`offset`; default the KDS to open tickets from the current service day.

---

### 🟡 BUG-18 · Medium — Rapid taps create duplicate order lines

**Actual** — The product grid is never disabled while `addLine.isPending`, and `POST /lines` has no idempotency key. Double-tapping a dish on a busy touchscreen adds it twice; double-tapping a table fires two order creations.

**Source** — `RestaurantPos.tsx:272–292, 690–702` · **Fix** — Disable the grid while a mutation is in flight, or accept a `client_line_id` the service can de-duplicate against — the pattern `create_sale_idempotent` already uses.

---

### 🟡 BUG-19 · Medium — KDS action buttons shown to users who cannot use them

**Actual** — `backendHasPermission` grants `restaurant.manage` if the user holds **any** mapped code. A POS-only role (`restaurant.view`, `order_manage`, `kot_manage`) passes the gate, sees Accept / Mark ready, and gets 403 on click because the endpoint needs `restaurant.kitchen_manage`.

**Source** — `src/lib/backend-permissions.ts:173–178` · `app.restaurant.kot.tsx:155` · `rbac.py:187` · **Fix** — Gate the KDS action on the specific backend code, not the coarse `restaurant.manage` alias.

---

### 🟡 BUG-20 · Medium — Negative capacity and guest counts reach the database

**Actual** — The `min`/`max` attributes are advisory only — nothing validates on submit. `capacity: -5` is stored verbatim by `update_table`, which applies `int()` with no bounds check.

**Source** — `RestaurantPos.tsx:1148–1157` · `restaurant_service.py:370–371` · **Fix** — Validate `1 ≤ capacity ≤ 50` on both sides and return 400 rather than persisting nonsense.

---

### 🟡 BUG-21 · Medium — Delete uses a native `confirm()` instead of the app's dialog

**Actual** — `handleDeleteTable` calls `window.confirm`. `ConfirmActionDialog` is imported but never used. The native dialog is unstyled, suppressible by the browser, and blocked in sandboxed iframes — in which case delete proceeds with no confirmation at all.

**Source** — `RestaurantPos.tsx:30, 387` · **Fix** — Use the imported `ConfirmActionDialog`, matching the KOT page.

---

### 🟡 BUG-22 · Medium — "billing" table status is styled but never produced

**Actual** — The POS and the tables page both branch on `status === "billing"`, but `TABLE_STATUSES` is `available | occupied | reserved | cleaning | disabled`. A table mid-settlement shows as plain occupied, so staff cannot tell which tables are being closed out.

**Source** — `RestaurantPos.tsx:50–52` · `restaurant_service.py:47` · **Fix** — Either set the table to `billing` when the order reaches `billed`, or drop the dead branches.

---

### 🔵 BUG-23 · Low — Menu images hardcoded to Unsplash with no error fallback

**Actual** — `getRestaurantFoodImage` returns one of a dozen fixed `images.unsplash.com` URLs. On a POS terminal without internet — or if Unsplash rate-limits — every card shows a broken-image icon. There is no `onError` handler. It also leaks menu-browsing activity to a third party.

**Source** — `RestaurantPos.tsx:60–120` · `PosShell.tsx:1295–1300` · **Fix** — Bundle local placeholders per category; add `onError` to fall back to a neutral tile.

---

### 🔵 BUG-24 · Low — 8–10px badge text is unreadable at POS viewing distance

**Actual** — Table tiles use `text-[8px]` for the status badge and `text-[10px]` for labels, several in `text-muted-foreground`. Well below a comfortable minimum, and below WCAG contrast at that size, on a screen read at arm's length under service pressure.

**Source** — `RestaurantPos.tsx:593–608` · **Fix** — Raise the floor to 11–12px; use a colour-coded dot instead of micro-text for status.

---

### 🔵 BUG-25 · Low — Product grid keyed by array index

**Actual** — `ProductGrid` uses `key={i}`. When the category filter or search changes, React reuses DOM nodes across different products, causing lazy-loaded images to flash the wrong dish before settling.

**Source** — `PosShell.tsx:1279` · **Fix** — Key on a stable item identity (SKU).

---

### 🔵 BUG-26 · Low — Non-numeric capacity returns 500 instead of 400

**Actual** — `int(body.get("capacity") or 4)` raises `ValueError` on `"four"`, surfacing as an unhandled 500. The endpoints take raw `dict` bodies, so FastAPI performs no schema validation.

**Source** — `restaurant_service.py:350` · **Fix** — Define Pydantic request models for the restaurant endpoints — this closes BUG-05, BUG-06, BUG-20, and BUG-26 in one change.

---

### 🔵 BUG-27 · Low — Table double-booking race on SQLite

**Actual** — `for_update` is a no-op on any dialect other than PostgreSQL, so on the local SQLite database the "table already has an active order" check is a TOCTOU window. `move_table` takes no lock on the destination at all, even on PostgreSQL.

**Source** — `backend/app/inventory/locking.py:13–16` · `restaurant_service.py:756` · **Fix** — Add a unique partial index on `current_order_id` so the database rejects double-booking regardless of dialect; lock the destination row in `move_table`.

---

### 🔵 BUG-28 · Low — Frontend "tests" are string matches that cannot fail on broken code

**Actual** — `restaurant-vertical-wiring.test.ts` calls `readFileSync` and asserts substrings such as `expect(src).toContain("usePayRestaurantOrder")`. It never imports or renders the component — which is why all four cases pass against a file that does not parse.

**Source** — `src/test/restaurant-vertical-wiring.test.ts:28–40` · **Fix** — Replace with Testing Library render tests over MSW-mocked endpoints covering select table → add item → send KOT → pay.

---

## 4. Coverage gaps

- **No browser verification was possible.** Cross-browser rendering, viewport behaviour at 390/768/1440px, keyboard navigation, focus trapping, console errors, and back-button-after-logout all remain untested until BUG-01 lands.
- **End-to-end coverage is one assertion.** The only restaurant case in `e2e/` is `GET /restaurant/tables` asserting `[200, 404]` — a 404 counts as a pass. Nothing exercises order → KOT → pay.
- **Table CRUD has zero backend tests.** Create, update, and delete are entirely uncovered, which is how BUG-07's AttributeError shipped.
- **No concurrency or load testing.** BUG-08 and BUG-27 were found by reading; neither would surface in single-threaded tests.
- **Offline and slow-network behaviour untested.** A POS must degrade gracefully; there is no retry, queue, or offline indicator on the restaurant path.
- **Printing untested.** KOT printing and receipt output were out of reach without a running app.

---

## 5. Recommended sequence

1. **Repair the build (BUG-01)** and add `tsc --noEmit` to CI. Everything else is gated on this.
2. **Unblock payment (BUG-02).** Until this lands the vertical has no complete happy path.
3. **Reconcile the money (BUG-03, BUG-04)** so the dialog, the cart, and the invoice agree to the paisa.
4. **Fix the four API contract breaks (BUG-05, 06, 07, 09)** — ideally by introducing typed request models, which closes BUG-20 and BUG-26 as well.
5. **Re-run this plan in a browser.** The nine blocked cases plus regression across all 25 executed cases.
6. **Close the test gap (BUG-28)** with a real render test and a Playwright spec covering the full service cycle.

---

## 6. Remediation

All 28 defects fixed. Key design decisions worth reviewing:

| Area | What changed |
|---|---|
| **BUG-01** | Removed lines 900–1094 of `RestaurantPos.tsx` (a duplicated region re-running 703–899). Build now passes. The 154 type errors it exposed were always present — TypeScript skips semantic checks on a file with syntax errors. |
| **BUG-02** | Moved the pricing-authority check from settlement to **order entry** (`add_order_line`), where staff can still act on it. Added `restaurant_order_line.price_override_reason` (migration `047`) so an approval given at entry is replayed at settlement instead of re-challenging a bill for food already eaten. |
| **BUG-03/04** | Extracted the bill formula into `src/features/pos/restaurant-billing.ts` and unit-tested it. Service charge and VAT **compound** (`×1.155`), they do not add (`×1.15`). |
| **BUG-08** | Replaced `len(rows) + 1` with the atomic `NumberSeries` UPDATE pattern already used by `sales_service._next_invoice_number`. |
| **BUG-09** | `tax_rate` and `service_charge` now come from store policy; undercutting them, setting an explicit `tax`, or using `allow_due` requires an override permission. New `restaurant.allow_due` permission. |
| **BUG-10** | Dropped `allow_origin_regex=".*"`. A wildcard now forces `allow_credentials=False`, and the wildcard ban extends to staging. |
| **BUG-28** | Replaced `readFileSync` + substring assertions with 9 behavioural tests that import the code under test. |

### Test results after remediation

- **Backend** `test_restaurant_vertical_wiring.py` — **15 passed** (was 10 passed / 2 failed). Three new tests cover the override path, the `allow_due` hole, and VAT defaulting.
- **Frontend** `restaurant-vertical-wiring.test.ts` — **9 passed**, all behavioural.
- **Build** — `npm run build` exits 0.
- **Typecheck** — every restaurant-touched file is clean.

### Still outstanding

- ⚠️ **The nine browser-dependent cases (RP-01, 31–33) remain unverified.** They were blocked by BUG-01 and are now *runnable*, but have not been run. Cross-browser, responsive, and keyboard testing is still required before sign-off.
- ⚠️ **144 pre-existing type errors elsewhere in the codebase** (AppLayout, ShiftDialog, other POS verticals) are now visible to `tsc`. None are in the restaurant vertical. Fix before adding `tsc --noEmit` to CI, or the gate will fail on day one.
- ⚠️ **`RestaurantPos.tsx` retains its Prettier violations.** The file was never lintable before, so it has never been formatted. Deliberately left alone — running `--fix` would reformat the whole file and bury the behavioural diff. New extracted files are formatted.
- ⚠️ **`e2e/` still has no restaurant service-cycle spec.** BUG-28 closed the unit-level gap only.

---

## 7. Follow-up round — broken interactions

Reading the POS against the backend after the defect fixes surfaced four interactions
wired to nothing. They are not in the register above because they fail silently or only
on a path the original pass did not exercise.

| Finding | Fix |
|---|---|
| **Cart `+` / `−` / `✕` did not persist.** The cart mirrors `order.lines`, but the controls called `app.updateQty` / `app.removeLine` — local state only, silently reverted by the next refetch. A waiter reduced a quantity and neither the kitchen nor the bill learned about it. | New `onLineQtyChange` / `onLineRemove` seam on `PosShell`; restaurant routes both to the backend. |
| **Qty-edit and void were unreachable.** `PATCH …/lines/{id}` and `POST …/lines/{id}/void` existed with **no frontend hook at all** — voiding a fired item could not be done from the POS. | Added `useUpdateRestaurantOrderLine` + `useVoidRestaurantOrderLine` and a `VoidLineDialog` that captures the reason and gates on the new `restaurant.void_item` permission. |
| **Delivery orders could not be created.** The backend requires `delivery_address` + `delivery_phone`; the POS had no fields, so Delivery + any dish returned 400. | `DeliveryDetailsDialog`, gated in `ensureOrder` so the ask happens before the guest orders. |
| **No receipt after payment.** The restaurant carried a thin cash-only settle dialog beside PosShell's much richer one. | Deleted it. Settlement now runs through PosShell via `onCompleteSale` + `totalsOverride`, gaining split tender, banknote chips, change display and a printable receipt. |

**Also:** `RestaurantPos.tsx` split 1,190 → 971 lines, extracting `menu-images.ts`, `types.ts`,
`ManageTablesDialog`, `VoidLineDialog`, `DeliveryDetailsDialog` into `src/features/pos/restaurant/`.

### Results

- **Backend** `test_restaurant_vertical_wiring.py` — **18 passed** (three new: qty-below-sent rejected, void reason required, delivery fields required).
- **Frontend** — 9 billing tests + **3 new MSW contract tests** asserting the qty stepper issues a `PATCH` rather than mutating local state.
- **Full backend suite** — 499 passed, 3 failed; all three (`test_shift_required_policy_blocks_sale`, `test_return_updates_certificate_status`, `test_sales_return_requires_reason`) **fail identically on pristine `HEAD`**, verified in an isolated worktree.
- **Full frontend suite** — 192 passed, 3 failed; all three are the pre-existing `demo-mode-fallback.test.tsx` `AuthProvider` failures, also verified against baseline.
- **Build** exits 0; total `tsc` errors 154 → 144.

### Risk note

`PosShell.tsx` is shared by 19 verticals. Every new prop is optional and defaults to the
previous behaviour, and only `RestaurantPos.tsx` opts in — but the qty/remove call sites and
`completeSale` are common code, so **smoke-test one other vertical in a browser** before release.
