# Crockery & Kitchenware POS ("Cookeries") — Technical Design & Implementation Plan

| | |
|---|---|
| **Document** | CROCKERY_POS_PLAN |
| **Status** | Approved for implementation |
| **Version** | 1.0 |
| **Pack ID** | `crockery` |
| **Last updated** | 2026-10-03 |
| **Reviewers** | Product Owner · POS Lead · Retail Domain Architect · QA Lead |

### Revision history
| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-10-03 | Initial full technical specification: Set vs. Loose Piece decanting, Material & Heat compatibility attributes, Breakage & Damage logging, Gift/Protective packaging add-ons, Cookware warranty & spare parts cross-sell, Zero-Impact Isolation Contract. |

---

## 0. Zero-Impact Isolation Contract

> [!IMPORTANT]
> **The Crockery POS pack (`crockery`) must have zero effect on any existing POS mode, back-office screen, API response, database table or report.**
> A tenant that does not enable `crockery` must experience byte-for-byte identical behaviour before and after this pack is introduced. All additions must be strictly additive and isolated.

### 0.1 Rules
| # | Rule | Practical Implementation |
|---|---|---|
| **I-1** | **Add, never modify** | New POS component `CrockeryPos.tsx`, new route `app.pos.crockery.tsx`, new pack mock catalog in `industry-mock.ts`, new dynamic fields and feature flags. |
| **I-2** | **No breaking schema changes** | Crockery product attributes (material, piece count, heat compatibility, warranty, fragile flag) live in existing flexible `meta` JSON / dynamic fields and dedicated extension contracts. |
| **I-3** | **Shared components consumed as-is** | `PosShell`, `ProductGrid`, `PosProductCard`, and `ShiftDialog` are used via their established public props without altering core logic. |
| **I-4** | **Disabled by default** | Registered in `defaultPackConfigs()` with `enabled: false`. Feature flags are namespaced under `crockery.*`. |
| **I-5** | **Namespaced permissions** | All pack permissions use `crockery.*` prefix (e.g., `crockery.breakage_log`, `crockery.set_decant`, `crockery.gift_pack`). |

---

## 1. Executive Summary & Retail Context

Crockery, Kitchenware & Cookware retail (often colloquially referred to in retail trade as **"Cookeries & Crockery"**) represents a distinct vertical spanning tableware, cookware (pressure cookers, non-stick pans, rice cookers), glassware, dinner sets, cutlery, and kitchen organizers. 

Unlike standard FMCG or fashion retail, a specialized Crockery & Cookware store faces specific operational realities:
1. **Set vs. Loose Pieces ("Decanting")**: Dinner sets (32-pc, 52-pc) are frequently sold complete, but stores also sell replacement plates/bowls from open sets or break a carton into open-stock items.
2. **Material & Heat/Induction Compatibility**: Customers demand clear verification on whether cookware works on **Induction Stoves vs Gas**, or if dinnerware is **Microwave Safe, Oven Safe, or Dishwasher Safe**, and whether materials are **Opal Glass, Fine Bone China, Melamine, Stainless Steel (304), Cast Iron, or Hard Anodized**.
3. **Fragile Loss & Breakage Tracking**: High vulnerability to chipped rims, transit cracks, or customer display drops. Cashiers and inventory managers need a 2-tap breakage write-off log to reconcile inventory shrinkage without manual journal gymnastics.
4. **Gift Wrapping & Protective Packaging**: Cookware and dinnerware are top gift choices for weddings, Eid, housewarmings, and anniversaries. The POS must easily add bubble wrap, reinforced outer cartons, or luxury gift wrap with greeting messages.
5. **Cookware Warranty & Spare Parts Matching**: Pressure cookers and premium non-stick cookware carry 2–10 year warranties and require recurring spare parts (gaskets, safety valves, whistle weights, handles). The POS should cross-sell matching spares at checkout.

---

## 2. Capabilities & Feature Matrix

### 2.1 Core Feature Flags (`crockery.*`)
| Key | Label | Default | Purpose |
|---|---|---|---|
| `crockery.set_breakdown` | Set / Loose Piece Selling | `true` | Allows selling individual pieces from dinner/cookware sets or decanting sets |
| `crockery.material_specs` | Material & Safety Badges | `true` | Shows Opal, Ceramic, Melamine, Steel, Microwave/Induction compatibility |
| `crockery.breakage_log` | In-Store Breakage Log | `true` | Fast POS recording of damaged/cracked items with reason & loss audit |
| `crockery.gift_packaging` | Gift & Transit Packing | `true` | One-click addition of bubble wrap, gift box, ribbon & greeting slip |
| `crockery.cooker_warranty` | Cookware Warranty & Spares | `true` | Warranty tracking + prompt for matching spare gaskets/valves |
| `crockery.heat_filter` | Induction / Microwave Filter | `true` | Quick filter chips on POS catalog for Induction-ready, Microwave-safe |

---

## 3. Department & Category Classification

| Department Code | Department Name | Key Products | Key Attributes |
|---|---|---|---|
| `DINNERWARE` | Dinnerware & Tableware | 32-pc Dinner Sets, 52-pc Opal Sets, Loose Dinner Plates, Quarter Plates, Curry Bowls, Soup Bowls | Pieces in Set, Material, Microwave Safe, Dishwasher Safe |
| `COOKWARE` | Cookware & Cookers | Pressure Cookers (3L, 5L, 6.5L), Hard Anodized Karahi, Non-stick Fry Pans, Induction Saucepans, Cast Iron Skillets | Heat Compatibility, Capacity (Liters), Warranty (Years), Coating |
| `DRINKWARE` | Glassware & Drinkware | Water Tumbler Sets (6-pc), Crystal Jugs, Vacuum Flasks, Thermal Mugs, Borosilicate Glass | Heat Resistance, Volume (ml), Fragility Level |
| `CUTLERY` | Cutlery & Kitchen Tools | 24-pc Cutlery Sets with Stand, Chef Knives, Spatula Sets, Tongs, Whisk, Scissors | Steel Grade (SS 304/410), Wooden/Silicone handle |
| `STORAGE` | Food Storage & Organizers | Airtight Jar Sets, 3-tier Tiffin Carriers, Spice Carousels, Dish Drying Racks | Air-tight lock, BPA Free, Stackable |
| `SPARES` | Cooker & Pan Spare Parts | Pressure Cooker Gaskets (Rubber/Silicone), Safety Valves, Weight Whistles, Bakelite Handles | Cooker Brand/Size match (Universal, Hawkins, Kiam, Prestige) |

---

## 4. POS Screen Design (`CrockeryPos.tsx`)

### 4.1 Header Bar & Specialized Actions
- **Mode Badge**: "Crockery & Cookware POS" (Deep Amber / Bronze theme `#d97706` / `#b45309`).
- **Quick Filters**:
  - All Categories
  - Dinner Sets (Complete Sets)
  - Loose Pieces (Decanted open-stock)
  - Cookware & Cookers
  - Glassware & Drinkware
  - Cutlery & Tools
  - Spare Parts
- **Feature Filter Chips**:
  - `⚡ Induction Safe`
  - `♨ Microwave Safe`
  - `🛡️ Warranty Covered`
- **Top Action Buttons**:
  - `🎁 Gift & Packaging` modal trigger
  - `💔 Breakage / Damage Log` modal trigger
  - `📦 Decant Set to Pieces` inventory breakdown modal

### 4.2 Product Card Presentation
Each product card in the catalog display displays:
- **Set/Piece Count Badge**: e.g., `32-Pc Set`, `Single Pcs`, `5.0 Liter`, `6-Pc Pack`
- **Material & Safety Icons**: `[Ceramic]` `[Opal]` `[SS 304]` `[Induction]` `[Microwave]`
- **Brand & Model**: e.g., `Kiam`, `Milano`, `Prestige`, `Luminarc`, `Corelle`
- **Price & Stock Indicator**: Clear BDT price with stock level and replacement loose rate

### 4.3 Cart & Line Item Enhancements
- Visual badge for Set vs Single Piece.
- Warranty term display if applicable (e.g. `5-Yr Warranty`).
- Induction / Microwave compatibility icons on receipt and cart item row.
- **Gift Packaging Line**: Tagged with recipient name or note (e.g., "Wedding Gift - Ribbon & Box").

---

## 5. Technical Implementation Steps

### Step 1: Pack Registration in `industry-registry.ts`
- Add `"crockery"` to `IndustryPackId`, `INDUSTRY_PACK_IDS`, and `POS_MODES`.
- Add pack definition with icon (`Utensils` / `Coffee` / `Package`), route `/app/pos/crockery`, feature flags, product fields, and dynamic fields.
- Configure `defaultPackConfigs()` with `"crockery": defaultPackConfig(false)`.

### Step 2: Product Form Registry in `product-form-registry.ts`
- Register metadata fields:
  - `material` (Opal Glass, Bone China, Ceramic, Melamine, Stainless Steel, Cast Iron, Non-Stick)
  - `pieces_in_set` (number, default 1)
  - `heat_compatibility` (Induction, Gas, Microwave Safe, Oven Safe, Dishwasher Safe)
  - `capacity` (e.g. "3.5 Liters", "500 ml")
  - `warranty_months` (number, e.g. 24, 60)
  - `is_fragile` (boolean)

### Step 3: Mock Catalog in `industry-mock.ts`
- Seed representative Dhaka & regional retail items:
  - Milano 32-Pc Royal Opal Dinner Set
  - Kiam 5.5L Induction Classic Pressure Cooker
  - Luminarc 6-Pc Water Goblet Glass Set
  - Hawkins 3L Contura Hard Anodized Cooker
  - Prestige Non-Stick Granite Fry Pan 26cm
  - 24-Pc Stainless Steel Luxury Cutlery Set with Revolving Stand
  - Loose Replacement Soup Bowl (Opal White)
  - Replacement Silicone Gasket for 5L Cooker
  - Premium Gift Packaging & Wooden Crate Service

### Step 4: Component Implementation `src/features/pos/CrockeryPos.tsx`
- Build rich interactive POS with:
  - Filter by category, heat compatibility, and material.
  - Set Decanting / Loose piece selector.
  - Breakage / Damage log dialog with instant stock write-off.
  - Gift Packaging & Greeting message drawer/dialog.
  - Pressure Cooker spare part recommendation trigger.

### Step 5: Route Creation
- Create `src/routes/app.pos.crockery.tsx` mounting `PosModeView` with `mode="crockery"`.
- Register in `PosModeView.tsx` `MODES` map.
- Register navigation icon in `nav-config.ts`.

---

## 6. Verification & Quality Gates
- **Zero Regression**: Run existing test suites (`npm run frontend:test`).
- **Isolation Check**: Ensure other POS modes remain unaffected.
- **Hydration & Route Test**: Ensure smooth navigation to `/app/pos/crockery`.
