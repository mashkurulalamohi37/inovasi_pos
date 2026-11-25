# Pulse POS — Module Status

Updated: 2026-07-18 (Fashion Phase 7B variants import / local GA gate)

| Module | Status | Notes |
|--------|--------|-------|
| Auth / login | **Live** | JWT, tenant-scoped |
| Products | **Live** | CRUD via API; fashion meta contract + Product Master fields |
| Product variants | **Live** | Size/color matrix generator API + UI; unique size×color |
| Inventory / stock ledger | **Live** | Adjustments + transfer; fashion uses Option B stock mirror |
| Sales / POS checkout | **Live** | Idempotent; fashion MSP / discount override audited |
| Fashion POS lane | **Live** | Variants + barcode from API when authenticated |
| Fashion exchange / alteration | **Live** | Same-product size×color exchange; damaged return non-restock |
| Fashion offers | **Live** | CRUD (POST/PATCH) + POS % apply; BYGO deferred |
| Purchases / GRN | **Live** | Fashion requires size/color `variant_id`; return mirrors Option B |
| Opening stock import | **Live** | `POST /import/opening-stock` posts ledger (fashion needs variant) |
| Catalog import | **Live** | Products / suppliers / customers / opening-stock / fashion-variants |
| Customers | **Live** | CRUD |
| Suppliers | **Live** | CRUD |
| Payments | **Live** | List + on-sale methods |
| Cashier shift / drawer | **Live** | Open/close/variance; optional require-open store policy |
| Reports | **Live** | Catalog + fashion size/color / sell-through / variant stock |
| Fashion dashboard | **Live** | Overview KPI strip when fashion pack enabled |
| Fashion RBAC | **Live** | `fashion.view` / `fashion.manage` / `fashion.report` |
| Data import | **Live** | Core + fashion-variants live; pharmacy/electronics CSV planned |
| Industry packs / flags | **Live** | DB-backed |
| Dynamic fields | **Live** | Create/reorder API |
| Mini HR | **Live** | APIs; seed often empty |
| Integrations / Workflows / QA / Health | **Hidden** | Not in nav |
| Offline Sync Center | **Partial** | Queue local; Fashion prod = online-only (Mode A) |
| Fashion GA label | **Pilot / Conditional GA** | Local gate green; remote CI + prod backup/monitor evidence still required |

## Demo mode

- **Continue without backend** enables localStorage-only demo (`pulse.demoMode`).
- Authenticated sessions must not fall back to mock catalogs on empty API responses (`resolveLiveRows`).

## Fashion edition tracker

See [FASHION_POS_SCOPE.md](./FASHION_POS_SCOPE.md) for the full gap matrix and phase plan.
