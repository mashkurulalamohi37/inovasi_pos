# Fashion stock authority (Phase 6B-16)

## Decision: Option B — Controlled compatibility bridge

| Layer | Role |
| --- | --- |
| **StockBalance / StockLedger** | Canonical inventory quantity and audit trail |
| **ProductVariant** | Canonical Fashion variant identity (POS, barcode, exchange) |
| **FashionProductVariant.stock_qty** | Compatibility mirror only — updated solely via `sync_industry_stock_on_movement` |

## Rules

1. Never mutate Fashion stock outside `record_stock_movement`.
2. `apply_industry_receive_stock` must **not** independently bump `FashionProductVariant.stock_qty`.
3. When a sale/receive passes a generic `ProductVariant.id`, the sync path resolves the legacy row by barcode or size+color and mirrors qty.
4. Drift between legacy `stock_qty` and `StockBalance` is a defect; tests assert mirror alignment after movements.

## Future (not this phase)

Option A consolidation: migrate legacy identities into `ProductVariant` and drop independent `stock_qty` writes entirely.
