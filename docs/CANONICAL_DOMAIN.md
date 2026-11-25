# Pulse POS — Canonical Domain (Phase 1)

## Core entities (tenant-scoped)

| Entity | Owner | API module |
|--------|-------|------------|
| Company / tenant | `core.Company` | auth, onboarding |
| Store, warehouse, counter | `core` | organization |
| User, role, permission | `core` + `rbac` | auth, configuration |
| Product, customer, supplier | `product` | commerce, purchases |
| Stock ledger & balance | `inventory` | inventory_ledger |
| Sales invoice | `sales` | commerce |
| Purchase PO / GRN | `sales` + `operations` | purchases |
| Payments, returns | `operations` | payments, returns |
| Subscriptions | `saas` | subscriptions |
| Audit log | `audit` | audit |

## Stock posting entry points

All quantity changes must flow through `inventory_service.record_stock_movement()`:

- `sale` — `sales_service`
- `purchase_receive` — `purchase_service`
- `purchase_return` — `purchase_service`
- `sales_return` — `sales_return_service`
- `adjustment` — `inventory_service.adjust_stock`
- `transfer` — `inventory_service.transfer_stock`
- `exchange` — `sales_return_service`

## Configuration authority (Phase 1)

| Setting | Source of truth |
|---------|-----------------|
| Industry packs | `GET/PATCH /configuration/industry-packs` |
| Feature flags | `GET/PATCH /configuration/feature-flags` |
| Pack menu visibility | `GET/PATCH /configuration/menu-config` |
| Role permissions | `GET/PUT /configuration/role-permissions` |
| Dynamic fields | `GET/POST/PUT /configuration/dynamic-fields` |

## Phase 2 targets

- Unify warehouse/store stock grain
- Product variants in core schema
- Lot/serial tracking in ledger
- Reservations (cart holds)
- Negative stock policy per tenant
