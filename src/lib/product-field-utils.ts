import type { DynamicFieldDef, IndustryPackId } from "./industry-registry";
import type { FieldVisibilityContext } from "./dynamic-fields";
import { filterDynamicFields } from "./dynamic-fields";
import {
  emptyMetaForPack,
  getProductFormFields,
  validateProductMeta,
  type ProductFormFieldDef,
} from "./product-form-registry";

export type UnifiedProductField = {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "checkbox" | "date" | "barcode" | "weight" | "currency";
  required?: boolean;
  options?: string[];
  source: "admin" | "registry";
};

function mapDynamicType(t: DynamicFieldDef["type"]): UnifiedProductField["type"] {
  if (t === "dropdown") return "select";
  if (t === "date" || t === "barcode" || t === "weight" || t === "currency") return t;
  if (t === "checkbox") return "checkbox";
  if (t === "number") return "number";
  return "text";
}

function mapRegistryType(t: ProductFormFieldDef["type"]): UnifiedProductField["type"] {
  if (t === "select") return "select";
  if (t === "checkbox") return "checkbox";
  if (t === "number") return "number";
  return "text";
}

export function isFieldExemptFromRequired(key: string, label: string): boolean {
  const l = label.toLowerCase();
  const k = key.toLowerCase();
  return (
    l.includes("fabric care") ||
    l.includes("fabric comp") ||
    l.includes("composition") ||
    l.includes("material code") ||
    l.includes("style code") ||
    l === "material" ||
    l === "fabric" ||
    l === "material composition" ||
    k === "style_code" ||
    k === "material_code" ||
    k === "material" ||
    k === "fabric" ||
    k === "fabric_composition" ||
    k === "material_composition" ||
    k.includes("fabric_care")
  );
}

/** Admin dynamic fields + registry defaults, admin wins on duplicate keys. */
export function getUnifiedProductFields(
  packId: IndustryPackId,
  dynamicFields: DynamicFieldDef[],
  ctx: Omit<FieldVisibilityContext, "pack" | "surface">,
  mode: "minimal" | "full" = "full",
): UnifiedProductField[] {
  const admin = filterDynamicFields(dynamicFields, { ...ctx, pack: packId, surface: "product" })
    .filter(f => f.entity === "Product" || f.entity === "Variant")
    .map(f => ({
      key: f.id,
      label: f.name,
      type: mapDynamicType(f.type),
      required: isFieldExemptFromRequired(f.id, f.name) ? false : f.required,
      options: f.options,
      source: "admin" as const,
    }));

  const registry = getProductFormFields(packId, mode)
    .filter(rf => !admin.some(a => a.key === rf.key))
    .map(rf => ({
      key: rf.key,
      label: rf.label,
      type: mapRegistryType(rf.type),
      required: isFieldExemptFromRequired(rf.key, rf.label) ? false : rf.required,
      options: rf.options,
      source: "registry" as const,
    }));

  return [...admin, ...registry];
}

export function emptyMetaForUnifiedFields(fields: UnifiedProductField[]): Record<string, string | number | boolean> {
  const meta: Record<string, string | number | boolean> = {};
  for (const f of fields) {
    if (f.type === "checkbox") meta[f.key] = false;
    else if (f.type === "number" || f.type === "currency" || f.type === "weight") meta[f.key] = 0;
    else meta[f.key] = "";
  }
  return meta;
}

export function resetProductMeta(
  packId: IndustryPackId,
  dynamicFields: DynamicFieldDef[],
  ctx: Omit<FieldVisibilityContext, "pack" | "surface">,
): Record<string, string | number | boolean> {
  const unified = getUnifiedProductFields(packId, dynamicFields, ctx);
  return { ...emptyMetaForPack(packId), ...emptyMetaForUnifiedFields(unified) };
}

export function validateUnifiedProductMeta(
  packId: IndustryPackId,
  meta: Record<string, unknown>,
  dynamicFields: DynamicFieldDef[],
  ctx: Omit<FieldVisibilityContext, "pack" | "surface">,
): string | null {
  const registryErr = validateProductMeta(packId, meta);
  if (registryErr) return registryErr;

  for (const f of getUnifiedProductFields(packId, dynamicFields, ctx).filter(x => x.source === "admin")) {
    if (!f.required || isFieldExemptFromRequired(f.key, f.label)) continue;
    const v = meta[f.key];
    if (v === undefined || v === null || v === "") return `${f.label} is required`;
  }
  return null;
}
