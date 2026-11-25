# Data Import Plan — Pulse POS

Master data and opening-balance import for pilot tenants. Sample files: [docs/samples/](./samples/)

**API status (Fashion Phase 7):** `GET /api/v1/import/status` → `mode: "live"` for `products`, `suppliers`, `customers`, `opening_stock`.  
Industry-specific CSV importers (`fashion_variants`, pharmacy batches, electronics serials) remain planned.

---

## Import modules overview

| Module | Sample CSV | Primary use | Status |
|--------|------------|-------------|--------|
| Products | [products.csv](./samples/products.csv) | Catalog SKUs across packs | **Live** `POST /import/products` (upsert by SKU) |
| Categories | *(column on products.csv)* | Product grouping | Resolved by name when category exists |
| Suppliers | [suppliers.csv](./samples/suppliers.csv) | Purchase orders, GRN | **Live** `POST /import/suppliers` (upsert by code) |
| Customers | [customers.csv](./samples/customers.csv) | Loyalty / invoicing | **Live** `POST /import/customers` (upsert by code) |
| Opening stock | [opening_stock.csv](./samples/opening_stock.csv) | Go-live inventory | **Live** ledger via `post_opening_stock` |
| Fashion variants | [fashion_variants.csv](./samples/fashion_variants.csv) | Size/color matrix | **Live** `POST /import/fashion-variants` (upsert by size×color) |
| Pharmacy batches | [pharmacy_batches.csv](./samples/pharmacy_batches.csv) | Batch/expiry | Planned |
| Electronics serials | [electronics_serials.csv](./samples/electronics_serials.csv) | IMEI/serial | Planned |

---

## Live API contract

All live modules accept:

```json
{ "rows": [{ "data": { ... } }], "dry_run": false }
```

| Endpoint | Permission | Notes |
|----------|------------|-------|
| `POST /api/v1/import/products` | `inventory.edit` | Fashion rows default `style_code=sku` when missing |
| `POST /api/v1/import/suppliers` | `inventory.edit` | Maps `contact_phone` / `contact_email` |
| `POST /api/v1/import/customers` | `inventory.edit` | Maps `loyalty_tier` → `customer_group` |
| `POST /api/v1/import/opening-stock` | `inventory.adjust` | Fashion requires variant identity |
| `POST /api/v1/import/fashion-variants` | `inventory.edit` | `parent_sku` + size×color; optional `qty_on_hand` + `store_code` |
| `GET /api/v1/import/status` | authenticated | `live_modules` / `planned_modules` |

### Fashion go-live order

1. Import products (`industry_pack=fashion`) from [products.csv](./samples/products.csv)
2. Import or generate size×color variants (`POST /import/fashion-variants` or matrix UI)
3. Optional: suppliers / customers CSVs
4. Opening stock with `variant_sku` or size+color ([opening_stock.csv](./samples/opening_stock.csv)) — or include `qty_on_hand` on fashion-variants import
5. Spot-check POS sale decrements Option B mirror + ledger `variant_id`

### Mapping CSV columns

**Products** ([products.csv](./samples/products.csv)):

```json
{
  "sku": "FASH-001",
  "name": "Oxford Shirt M White",
  "industry_pack": "fashion",
  "base_price": 2490,
  "barcode": "FASH001001",
  "category": "Fashion",
  "is_active": true,
  "style_code": "OXF-001"
}
```

**Suppliers** ([suppliers.csv](./samples/suppliers.csv)): `code`, `name`, `contact_phone`, `contact_email`, `address`

**Customers** ([customers.csv](./samples/customers.csv)): `code`, `name`, `phone`, `email`, `loyalty_tier`

**Opening stock** — fashion rows require `variant_sku` / size+color / `variant_id`.

---

## Planned (not yet live)

- `POST /import/pharmacy-batches`
- `POST /import/electronics-serials`
- Dedicated beef batch/cut importers

### Fashion variants CSV mapping

```json
{
  "parent_sku": "FASH-001",
  "sku": "FASH-001-M-WHT",
  "size": "M",
  "color": "White",
  "qty_on_hand": 25,
  "store_code": "DHK-01"
}
```

`sku` here is the **variant_code**, not the parent product SKU.

---

## Pilot manual UI (fallback)

Use Back Office forms when CSV volume is small or for industry extensions not yet imported via API. Recommended order: categories → products → variants → suppliers → customers → opening stock.
