/**
 * COPY THIS FILE when adding a new industry POS.
 *
 * Steps (frontend only, minimum viable):
 * 1. Add pack id to IndustryPackId in src/lib/industry-registry.ts
 * 2. Register pack in INDUSTRY_PACKS, POS_MODES, INDUSTRY_PACK_IDS, defaultPackConfigs
 * 3. Add demo catalog in src/lib/industry-mock.ts
 * 4. Add product fields in src/lib/product-form-registry.ts
 * 5. Create YourPos.tsx using MinimalPos (below)
 * 6. Register in PosModeView.tsx MODES map
 * 7. Add route src/routes/app.pos.<pack-id>.tsx
 * 8. Enable pack in Configuration → Industry Packs
 *
 * Later: replace MinimalPos with custom widgets; add feature flags + dynamic fields;
 * build elaborate product screens per pack (variants, batches, serials, etc.).
 */

/*
import { MinimalPos, toPosCatalogItems } from "./minimal-pos";
import { myCatalog } from "@/lib/industry-mock";

export function MyShopPos() {
  const demoItems = toPosCatalogItems(myCatalog, row => ({
    price: row.price,
    meta: { shelf: row.shelf },
    barcode: row.barcode,
  }));

  return (
    <MinimalPos
      industry="my-shop"
      title="My Shop POS"
      subtitle="Search · cart · checkout"
      demoCatalog={demoItems}
      cardSubtitle={item => String(item.meta?.shelf ?? "")}
    />
  );
}
*/

export {};
