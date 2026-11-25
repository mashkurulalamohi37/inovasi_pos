import type { IndustryPackId } from "./industry-registry";

export type PackMasterAttrDef = {
  key: string;
  label: string;
  /** Maps to product.meta key (defaults to key). */
  productFieldKey?: string;
  /** When set, options are filtered by selected parent meta field. */
  parentAttrType?: string;
  parentProductField?: string;
};

/** Industry master-data attribute types shown under each pack menu. */
export const PACK_MASTER_ATTRIBUTES: Partial<Record<IndustryPackId, PackMasterAttrDef[]>> = {
  fashion: [
    { key: "season", label: "Season" },
    { key: "gender", label: "Gender" },
    { key: "fit", label: "Default fit", productFieldKey: "fit" },
    { key: "fabric", label: "Fabric" },
    { key: "product_type", label: "Product type" },
    { key: "category", label: "Category" },
    {
      key: "subcategory",
      label: "Subcategory",
      parentAttrType: "category",
      parentProductField: "category",
    },
    { key: "color", label: "Color" },
  ],
  pharmacy: [
    { key: "dosage_form", label: "Dosage form" },
  ],
  jewelry: [
    { key: "metal", label: "Metal" },
    { key: "karat", label: "Karat / purity" },
  ],
  restaurant: [
    { key: "course", label: "Course" },
  ],
  "beef-shop": [
    { key: "category", label: "Category" },
  ],
  grocery: [
    { key: "shelf", label: "Shelf zone" },
  ],
  electronics: [
    { key: "brand_line", label: "Brand line" },
  ],
  cosmetics: [
    { key: "finish", label: "Finish" },
  ],
  hardware: [
    { key: "material", label: "Material" },
  ],
  stationery: [
    { key: "grade", label: "Grade / level" },
  ],
  bookstore: [
    { key: "genre", label: "Genre" },
  ],
  salon: [
    { key: "service_type", label: "Service type" },
  ],
  "mobile-shop": [
    { key: "condition", label: "Condition" },
  ],
  tailoring: [
    { key: "fabric", label: "Fabric" },
  ],
  furniture: [
    { key: "material", label: "Material" },
  ],
  "building-materials": [
    { key: "grade", label: "Grade" },
  ],
  "rice-mill": [
    { key: "variety", label: "Variety" },
  ],
  "optical-shop": [
    { key: "lens_type", label: "Lens type" },
  ],
  "surgical-shop": [
    { key: "sterile_class", label: "Sterile class" },
  ],
  crockery: [
    { key: "category", label: "Category", productFieldKey: "category" },
    { key: "material", label: "Material", productFieldKey: "material" },
    { key: "heat_compatibility", label: "Heat / Stovetop compatibility", productFieldKey: "heat_compatibility" },
  ],
  "cycle-toys": [
    { key: "category", label: "Category", productFieldKey: "category" },
    { key: "wheel_size", label: "Wheel size", productFieldKey: "wheel_size" },
    { key: "age_group", label: "Age group", productFieldKey: "age_group" },
    { key: "assembly_status", label: "Assembly status", productFieldKey: "assembly_status" },
  ],
};

export function getPackMasterAttributes(packId: IndustryPackId): PackMasterAttrDef[] {
  return PACK_MASTER_ATTRIBUTES[packId] ?? [
    { key: "category", label: "Category" },
  ];
}
