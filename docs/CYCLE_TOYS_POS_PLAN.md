# Cycle & Toys POS ("Pedal & Play") — Technical Design & Implementation Plan

| | |
|---|---|
| **Document** | CYCLE_TOYS_POS_PLAN |
| **Status** | Approved for implementation |
| **Version** | 1.0 |
| **Pack ID** | `cycle-toys` |
| **Last updated** | 2026-10-19 |
| **Reviewers** | Product Owner · POS Lead · Retail Domain Architect · QA Lead |

### Revision history
| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-10-19 | Initial specification: Boxed vs Ready-to-Ride assembly, Wheel/Frame size & Age group matrix, Workshop service & repair job cards, Electric ride-on battery/charger tracking, Safety certifications & gift packaging, Zero-Impact Isolation Contract. |

---

## 0. Zero-Impact Isolation Contract

> [!IMPORTANT]
> **The Cycle & Toys POS pack (`cycle-toys`) must have zero effect on any existing POS mode, back-office screen, API response, database table or report.**
> A tenant that does not enable `cycle-toys` must experience byte-for-byte identical behaviour before and after this pack is introduced. All additions must be strictly additive and isolated.

### 0.1 Rules
| # | Rule | Practical Implementation |
|---|---|---|
| **I-1** | **Add, never modify** | New POS component `CycleToysPos.tsx`, new route `app.pos.cycle-toys.tsx`, new mock catalog in `industry-mock.ts`, new dynamic fields and feature flags. |
| **I-2** | **No breaking schema changes** | Cycle & toy product attributes (wheel size, frame material, age group, battery specs, assembly status, safety certification) live in existing flexible `meta` JSON and dedicated extension contracts. |
| **I-3** | **Shared components consumed as-is** | `PosShell`, `ProductGrid`, `PosProductCard`, and `ShiftDialog` are used via established public props without modifying core logic. |
| **I-4** | **Disabled by default** | Registered in `defaultPackConfigs()` with `company: false`, `store: false`, `counter: false`. Feature flags are namespaced under `cycle_toys.*`. |
| **I-5** | **Namespaced permissions** | All pack permissions use `cycle_toys.*` prefix (e.g., `cycle_toys.view`, `cycle_toys.manage`, `cycle_toys.service_manage`, `cycle_toys.assembly_manage`). |

---

## 1. Executive Summary & Retail Context

Cycle and Toy stores ("Pedal & Play") represent a high-turnover, lifestyle and family-centric retail vertical encompassing:
1. **Cycles & Wheels**: Balance bikes, kids tricycles, juvenile bikes (12"–20"), geared MTBs (24"–29"), road/hybrid bikes, and kick scooters.
2. **Battery Ride-ons & Electric Mobility**: 6V/12V/24V battery-operated cars, jeeps, mini-motorcycles, and RC vehicles.
3. **Toys, Games & Hobbies**: STEM kits, building blocks, board games, diecast scale models, plushies, and sports play kits.
4. **Assembly & Mechanical Workshop**:
   - Cartons arrive 85% SKD (Semi-Knocked Down). Stores offer unboxed cartons or ready-to-ride assembled bikes with an optional assembly fee.
   - Bicycle repair and maintenance (tire punctures, gear tuning, brake adjustments, chain lubing).
5. **Gifting & Safety Standards**: High birthday/holiday gift wrapping demand and stringent child safety compliance (EN71/CE certification, non-toxic materials, choke hazard warnings).

---

## 2. Capabilities & Feature Matrix

### 2.1 Core Feature Flags (`cycle_toys.*`)
| Key | Label | Default | Purpose |
|---|---|---|---|
| `cycle_toys.assembly_service` | Assembly Service Toggle | `true` | Allows selling boxed SKD or pre-assembled bikes with optional assembly service charge |
| `cycle_toys.workshop_service` | Workshop & Repair Job Cards | `true` | Enables in-POS repair job creation (flat tire, brake tuning, full servicing) |
| `cycle_toys.size_age_matrix` | Wheel Size & Age Group Matrix | `true` | Fast catalog filter chips for wheel sizes (12"–29") and age categories (0–12m to Adult) |
| `cycle_toys.battery_rideon` | Electric Ride-on & Battery Specs | `true` | Tracks battery voltage (6V/12V/24V), motor count, remote pairing & pre-delivery test |
| `cycle_toys.accessories_cross_sell` | Safety Gear & Spares Cross-sell | `true` | Contextual recommendations (helmets, bells, locks, training wheels) when bikes are in cart |
| `cycle_toys.gift_packaging` | Gift Wrap & Birthday Message | `true` | One-click addition of festive gift wrap, ribbons, and personalized birthday greeting cards |
| `cycle_toys.safety_compliance` | Safety Badges & Warnings | `true` | Displays EN71, CE, Non-Toxic, and Choke Hazard alerts on product cards and receipts |

---

## 3. Product Taxonomy & Master Attributes

### 3.1 Categories
- `KIDS_CYCLES`: Tricycles, Balance Bikes, 12", 14", 16", 18", 20" Kids Bikes
- `GEARED_MTB`: 24", 26", 27.5", 29" Mountain & Hybrid Bicycles
- `RIDE_ONS`: 6V/12V/24V Battery-Operated Electric Cars, Jeeps, Scooters
- `TOYS_GAMES`: Building Bricks, RC Cars, Board Games, Action Figures, Plushies
- `BABY_GEAR`: Strollers, Prams, Baby Walkers, High Chairs
- `SPARES_GEAR`: Helmets, Bells, Lights, Pumps, Locks, Tires, Tubes, Chains
- `WORKSHOP`: Assembly Fee, Tire Puncture Fix, Gear Tuning, Full Cycle Overhaul

### 3.2 Master Attributes
- `wheel_size`: `12"`, `14"`, `16"`, `18"`, `20"`, `24"`, `26"`, `27.5"`, `29"`, `N/A`
- `age_group`: `0-12 Months`, `1-3 Years`, `3-5 Years`, `6-8 Years`, `9-12 Years`, `13+ / Adult`
- `assembly_status`: `Ready-to-Ride (Assembled)`, `Boxed SKD (Unassembled)`
- `battery_type`: `6V 4.5Ah`, `12V 7Ah`, `12V 10Ah`, `24V`, `AA/AAA Cells`, `None`
- `gear_type`: `Single Speed`, `7-Speed`, `21-Speed Shimano`, `24-Speed`, `Electric Motor`

---

## 4. POS Screen Design (`CycleToysPos.tsx`)

### 4.1 Header Bar & Specialized Actions
- **Mode Badge**: "Cycle & Toys POS" (Electric Blue / Amber `#0284c7`).
- **Quick Filters**: All, Kids Cycles, Geared MTBs, Electric Ride-ons, Toys & Games, Spares & Gear, Workshop Services.
- **Filter Chips**: `🚲 Ready to Ride`, `📦 Boxed/SKD`, `⚡ Electric/Battery`, `🎂 Age 3-5y`, `🛡️ Safety Certified`.
- **Top Actions**:
  - `🔧 New Service / Repair Job` (opens intake modal for customer bike servicing).
  - `🎁 Gift & Birthday Wrap` (selects wrap theme, ribbon color, and prints birthday tag).
  - `🔋 Battery & Pre-Delivery Test` (records ride-on motor and battery voltage inspection).

---

## 5. Back-Office Routes

1. `/app/cycle-toys/assembly-queue` — Tracks unboxed vs ready-to-deliver bicycles, technician assignment, and PDI status.
2. `/app/cycle-toys/service-jobs` — Bicycle repairs, tune-ups, tire fixes, and customer status (Pending $\to$ In Progress $\to$ Ready $\to$ Delivered).
3. `/app/cycle-toys/battery-warranty` — Ride-on battery serial logging, warranty tracking, and charger replacements.
