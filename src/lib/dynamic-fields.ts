import type { DynamicFieldDef, IndustryPackId, PosMode } from "./industry-registry";

export type FieldVisibilityContext = {
  pack: IndustryPackId | PosMode;
  store: string;
  counter: string;
  surface: "product" | "pos" | "receipt" | "report";
};

/** Entities that belong on the POS cart / checkout panel (not product master). */
const POS_CART_ENTITIES = new Set([
  "sale line",
  "sale_line",
  "saleline",
  // "variant" intentionally excluded — variant attributes (fit, colour, size)
  // are product-master data chosen before adding to cart, not POS checkout fields.
  "batch",
  "line",
]);

function normalizeEntity(entity: string): string {
  return entity.trim().toLowerCase().replace(/[_-]+/g, " ");
}

function isPosCartEntity(entity: string): boolean {
  const e = normalizeEntity(entity);
  if (POS_CART_ENTITIES.has(e)) return true;
  // Allow explicit sale-line naming variants from admin UI
  return e.includes("sale") && e.includes("line");
}

function matchesScope(field: DynamicFieldDef, ctx: FieldVisibilityContext): boolean {
  if (field.enabled === false) return false;

  // Universal POS must NOT dump every industry pack's fields into the cart.
  // Only show fields explicitly assigned to the "universal" pack (rare).
  // Mode-specific lanes (fashion, beef-shop, …) only see their own pack.
  if (ctx.pack === "universal") {
    if ((field.pack as string) !== "universal") return false;
  } else if (field.pack !== ctx.pack) {
    return false;
  }

  const allStores = field.allStores !== false;
  const allCounters = field.allCounters !== false;
  if (!allStores && field.stores?.length && !field.stores.includes(ctx.store)) return false;
  if (!allCounters && field.counters?.length && !field.counters.includes(ctx.counter)) return false;
  return true;
}

export function filterDynamicFields(
  fields: DynamicFieldDef[],
  ctx: FieldVisibilityContext,
): DynamicFieldDef[] {
  return fields
    .filter(f => matchesScope(f, ctx))
    .filter(f => {
      if (ctx.surface === "product") return f.visibleInProduct;
      if (ctx.surface === "pos") {
        // Product-master fields (Halal cert, Fabric Care Label, …) never belong on the cart panel.
        if (!isPosCartEntity(f.entity)) return false;
        return f.visibleInPos;
      }
      if (ctx.surface === "receipt") return f.visibleInReceipt;
      return f.visibleInReport;
    })
    .sort((a, b) => a.order - b.order);
}

/**
 * Hard-coded corrections for fields whose visibility was wrong in earlier
 * releases and may still be cached in localStorage.  The id is the canonical
 * field id from DEFAULT_DYNAMIC_FIELDS; any property listed here overrides
 * whatever was persisted on the device.
 */
const FIELD_PATCHES: Record<string, Partial<DynamicFieldDef>> = {
  // "Fit" is a variant/product attribute — not a POS checkout field.
  df4: { visibleInPos: false },
  // Material for crockery is optional
  df22: { required: false },
};

export function migrateDynamicField(f: DynamicFieldDef): DynamicFieldDef {
  const patch = FIELD_PATCHES[f.id] ?? {};
  
  // When connected to the backend, the field ID is a database UUID instead of "df4".
  // Check by name and pack to ensure the correction is applied to backend data too.
  const isFitField =
    (f.pack === "fashion" || !f.pack) &&
    f.name.trim().toLowerCase() === "fit";
  const nameBasedPatch = isFitField ? { visibleInPos: false } : {};

  // Fabric Care Label, Fabric composition, Material code / composition / material, and Style code must not be required
  const nameLower = f.name.trim().toLowerCase();
  const isOptionalOverride =
    nameLower.includes("fabric care") ||
    nameLower.includes("fabric comp") ||
    nameLower.includes("composition") ||
    nameLower.includes("material code") ||
    nameLower === "material" ||
    nameLower === "fabric" ||
    nameLower.includes("style code");
  const optionalPatch = isOptionalOverride ? { required: false } : {};

  return {
    allStores: true,
    allCounters: true,
    enabled: true,
    stores: [],
    counters: [],
    ...f,
    // Apply known corrections on top of whatever was stored
    ...patch,
    ...nameBasedPatch,
    ...optionalPatch,
  };
}

export function migrateDynamicFields(fields: DynamicFieldDef[]): DynamicFieldDef[] {
  return fields.map(migrateDynamicField);
}
