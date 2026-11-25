import type { IndustryPackId } from "./industry-registry";
import { getPackDef } from "./industry-registry";

export type ProductFormFieldType = "text" | "number" | "select" | "checkbox";

export type ProductFormFieldDef = {
  /** Stored in product.meta on the backend. */
  key: string;
  label: string;
  type: ProductFormFieldType;
  placeholder?: string;
  options?: string[];
  required?: boolean;
  /** Shown in minimal POS mode; elaborate forms can hide these. */
  minimal?: boolean;
};

export type ProductFormPackDef = {
  packId: IndustryPackId;
  /** Base fields always shown: SKU, name, price, barcode (from Product Master). */
  fields: ProductFormFieldDef[];
};

/** Per-industry product fields for Product Master. Extend one pack at a time. */
export const PRODUCT_FORM_REGISTRY: Record<IndustryPackId, ProductFormPackDef> = {
  "beef-shop": {
    packId: "beef-shop",
    fields: [
      { key: "rate_per_kg", label: "Rate per kg", type: "number", required: true, minimal: true },
      { key: "category", label: "Category", type: "select", options: ["Beef", "Mutton", "Chicken", "Fish", "Sausage", "Frozen"], minimal: true },
      { key: "halal_cert", label: "Halal certificate no.", type: "text" },
      { key: "storage_temp", label: "Storage temp", type: "text" },
    ],
  },
  fashion: {
    packId: "fashion",
    fields: [
      { key: "style_code", label: "Style code", type: "text", minimal: true },
      { key: "product_type", label: "Product type", type: "select", options: ["Polo", "Jeans", "Shirt", "T-Shirt", "Dress", "Jacket", "Accessories", "Belts & Bags", "Footwear"], minimal: true },
      { key: "season", label: "Season", type: "select", options: ["SS", "FW", "All season", "Summer", "Winter"], minimal: true },
      { key: "year", label: "Year", type: "number", minimal: true },
      { key: "gender", label: "Gender", type: "select", options: ["Men", "Women", "Unisex", "Boys", "Girls", "Kids"], minimal: true },
      { key: "collection", label: "Collection", type: "text" },
      { key: "department", label: "Department", type: "text" },
      { key: "category", label: "Category", type: "select", options: ["Tops", "Bottoms", "Outerwear", "Accessories"], minimal: true },
      { key: "subcategory", label: "Subcategory", type: "select", options: [] },
      { key: "fabric", label: "Fabric", type: "select", options: ["Cotton", "Denim", "Linen", "Polyester", "Silk", "Wool"] },
      { key: "material_composition", label: "Material composition", type: "text" },
      { key: "fit", label: "Default fit", type: "select", options: ["Slim", "Regular", "Relaxed", "Oversized", "Tailored"] },
      { key: "color", label: "Primary color", type: "select", options: ["Black", "White", "Blue", "Red", "Green", "Navy"], minimal: true },
      { key: "pattern", label: "Pattern", type: "text" },
      { key: "sleeve_type", label: "Sleeve type", type: "text" },
      { key: "min_selling_price", label: "Min selling price", type: "number" },
      { key: "max_discount_pct", label: "Max discount %", type: "number" },
      { key: "reorder_level", label: "Reorder level", type: "number" },
      { key: "returnable", label: "Returnable", type: "checkbox" },
      { key: "exchangeable", label: "Exchangeable", type: "checkbox" },
    ],
  },
  pharmacy: {
    packId: "pharmacy",
    fields: [
      { key: "generic", label: "Generic name", type: "text", required: true, minimal: true },
      { key: "manufacturer", label: "Manufacturer", type: "text", minimal: true },
      { key: "strength", label: "Strength", type: "text", required: true, minimal: true },
      { key: "dosage_form", label: "Dosage form", type: "select", options: ["Tablet", "Capsule", "Syrup", "Injection"], minimal: true },
      { key: "therapeutic_class", label: "Therapeutic class", type: "text" },
      { key: "rx_required", label: "Prescription required", type: "checkbox" },
    ],
  },
  grocery: {
    packId: "grocery",
    fields: [
      { key: "mrp", label: "MRP", type: "number", minimal: true },
      { key: "shelf", label: "Shelf location", type: "text", minimal: true },
      { key: "pack_size", label: "Pack size", type: "text" },
      { key: "weight_item", label: "Sold by weight", type: "checkbox" },
    ],
  },
  restaurant: {
    packId: "restaurant",
    fields: [
      { key: "course", label: "Course", type: "select", options: ["Starter", "Main", "Dessert", "Beverage", "Combo"], minimal: true },
      { key: "kitchen_station", label: "Kitchen station", type: "text", minimal: true },
      { key: "prep_time_mins", label: "Prep time (mins)", type: "number" },
    ],
  },
  jewelry: {
    packId: "jewelry",
    fields: [
      { key: "metal", label: "Metal", type: "select", options: ["Gold", "Silver", "Platinum"], required: true, minimal: true },
      { key: "karat", label: "Karat / purity", type: "select", options: ["24K", "22K", "21K", "18K", "14K", "925", "999"], required: true, minimal: true },
      { key: "gross_weight_g", label: "Gross weight (g)", type: "number", required: true, minimal: true },
      { key: "stone_weight", label: "Stone weight (g)", type: "number", minimal: true },
      { key: "net_metal_weight", label: "Net metal weight (g)", type: "number", minimal: true },
      { key: "making_charge_type", label: "Making charge type", type: "select", options: ["per_gram", "fixed", "percent"], minimal: true },
      { key: "making_charge", label: "Making charge rate/amount", type: "number", minimal: true },
      { key: "wastage_percentage", label: "Wastage %", type: "number" },
      { key: "default_stone_value", label: "Default stone value", type: "number" },
      { key: "certificate_required", label: "Certificate required", type: "checkbox" },
      { key: "tag_no", label: "Tag no.", type: "text" },
      { key: "certificate_no", label: "Certificate no.", type: "text" },
    ],
  },
  electronics: {
    packId: "electronics",
    fields: [
      { key: "brand", label: "Brand", type: "text", required: true, minimal: true },
      { key: "model", label: "Model", type: "text", required: true, minimal: true },
      { key: "warranty_months", label: "Warranty (months)", type: "number", minimal: true },
      { key: "serialized", label: "Serial / IMEI tracked", type: "checkbox" },
    ],
  },
  bookstore: {
    packId: "bookstore",
    fields: [
      { key: "isbn", label: "ISBN", type: "text", minimal: true },
      { key: "author", label: "Author", type: "text", minimal: true },
      { key: "publisher", label: "Publisher", type: "text", minimal: true },
      { key: "board", label: "Board", type: "select", options: ["NCTB", "Dhaka Board", "Madrasah", "General"], minimal: true },
      { key: "class_level", label: "Class", type: "text", minimal: true },
      { key: "language", label: "Language", type: "select", options: ["Bangla", "English", "Arabic"], minimal: true },
      { key: "academic_year", label: "Academic year", type: "text" },
    ],
  },
  salon: {
    packId: "salon",
    fields: [
      { key: "item_type", label: "Type", type: "select", options: ["service", "product"], required: true, minimal: true },
      { key: "duration_mins", label: "Duration (mins)", type: "number", minimal: true },
      { key: "gender", label: "Gender", type: "select", options: ["Men", "Women", "Unisex"], minimal: true },
      { key: "category", label: "Category", type: "select", options: ["Hair", "Skin", "Bridal", "Color", "Retail"], minimal: true },
    ],
  },
  hardware: {
    packId: "hardware",
    fields: [
      { key: "brand", label: "Brand", type: "text", required: true, minimal: true },
      { key: "unit", label: "Unit", type: "select", options: ["Piece", "Dozen", "Ft", "Kg", "Bag"], required: true, minimal: true },
      { key: "category", label: "Category", type: "select", options: ["Pipe", "Electrical", "Tools", "Paint", "Fitting"], minimal: true },
      { key: "warranty_months", label: "Warranty (months)", type: "number" },
    ],
  },
  stationery: {
    packId: "stationery",
    fields: [
      { key: "brand", label: "Brand", type: "text", minimal: true },
      { key: "school_class", label: "School class", type: "text", minimal: true },
      { key: "pack_qty", label: "Pack qty", type: "number", minimal: true },
      { key: "wholesale_price", label: "Dealer price", type: "number" },
    ],
  },
  cosmetics: {
    packId: "cosmetics",
    fields: [
      { key: "shade", label: "Shade", type: "text", minimal: true },
      { key: "mrp", label: "MRP", type: "number", minimal: true },
    ],
  },
  "building-materials": {
    packId: "building-materials",
    fields: [
      { key: "material", label: "Material type", type: "select", options: ["Cement", "Rod", "Sand", "Stone", "Tile", "Brick"], required: true, minimal: true },
      { key: "unit", label: "Unit", type: "select", options: ["Bag", "Ton", "CFT", "Piece", "Sqft"], required: true, minimal: true },
      { key: "grade", label: "Grade", type: "text", minimal: true },
      { key: "brand", label: "Brand", type: "text", minimal: true },
    ],
  },
  "mobile-shop": {
    packId: "mobile-shop",
    fields: [
      { key: "brand", label: "Brand", type: "select", options: ["Samsung", "Symphony", "Xiaomi", "Apple", "Realme", "Local"], required: true, minimal: true },
      { key: "model", label: "Model", type: "text", required: true, minimal: true },
      { key: "storage", label: "Storage", type: "text", minimal: true },
      { key: "category", label: "Category", type: "select", options: ["Phone", "Accessory", "Used"], minimal: true },
      { key: "serialized", label: "IMEI tracked", type: "checkbox" },
      { key: "warranty_months", label: "Warranty (months)", type: "number", minimal: true },
    ],
  },
  tailoring: {
    packId: "tailoring",
    fields: [
      { key: "garment_type", label: "Garment type", type: "select", options: ["Shirt", "Pant", "Panjabi", "Kurta", "Blouse", "Saree", "Fabric"], minimal: true },
      { key: "item_type", label: "Job type", type: "select", options: ["alteration", "stitch", "fabric", "ready-made"], required: true, minimal: true },
      { key: "fabric", label: "Fabric", type: "text", minimal: true },
      { key: "lead_days", label: "Lead days", type: "number", minimal: true },
    ],
  },
  "rice-mill": {
    packId: "rice-mill",
    fields: [
      { key: "variety", label: "Variety", type: "select", options: ["Miniket", "Nazirshail", "BRRI-28", "Atap", "Atta", "Maida", "Suji"], required: true, minimal: true },
      { key: "rate_per_kg", label: "Rate per kg", type: "number", required: true, minimal: true },
      { key: "grade", label: "Grade", type: "text", minimal: true },
      { key: "bag_size_kg", label: "Bag size (kg)", type: "number" },
    ],
  },
  furniture: {
    packId: "furniture",
    fields: [
      { key: "category", label: "Category", type: "select", options: ["Bedroom", "Living", "Dining", "Office", "Kitchen"], minimal: true },
      { key: "material", label: "Material", type: "select", options: ["Solid wood", "Board", "Steel", "Mixed"], minimal: true },
      { key: "set_pieces", label: "Set pieces", type: "number", minimal: true },
      { key: "assembly_fee", label: "Assembly fee", type: "number" },
      { key: "lead_days", label: "Lead days", type: "number" },
    ],
  },
  "optical-shop": {
    packId: "optical-shop",
    fields: [
      { key: "item_type", label: "Type", type: "select", options: ["Frame", "Lens", "Contact lens", "Accessory"], required: true, minimal: true },
      { key: "brand", label: "Brand", type: "text", required: true, minimal: true },
      { key: "frame_size", label: "Frame size", type: "text", minimal: true },
      { key: "lens_power_range", label: "Lens power range", type: "text", minimal: true },
      { key: "coating", label: "Coating", type: "select", options: ["None", "Anti-glare", "Blue-light", "UV"], minimal: true },
    ],
  },
  "surgical-shop": {
    packId: "surgical-shop",
    fields: [
      { key: "sterile", label: "Sterile", type: "checkbox", required: true, minimal: true },
      { key: "surgical_grade", label: "Surgical grade", type: "text", minimal: true },
      { key: "unit", label: "Unit", type: "select", options: ["Piece", "Box", "Pair", "Roll"], required: true, minimal: true },
      { key: "hospital_contract_eligible", label: "Hospital contract eligible", type: "checkbox" },
    ],
  },
  "super-shop": {
    packId: "super-shop",
    fields: [
      { key: "department", label: "Department", type: "select", options: ["Grocery & FMCG", "Fresh, Meat & Fish", "Pharmacy & Health", "Apparel & Footwear", "Cosmetics & Beauty", "Electronics & Home", "Stationery & General"], required: true, minimal: true },
      { key: "mrp", label: "MRP", type: "number", minimal: true },
      { key: "shelf_location", label: "Shelf / Aisle location", type: "text", minimal: true },
      { key: "plu_code", label: "PLU code", type: "text" },
      { key: "is_weighable", label: "Weighable on scale", type: "checkbox" },
      { key: "tare_weight_g", label: "Tare weight (grams)", type: "number" },
      { key: "generic_name", label: "Generic / Molecule (Medicine)", type: "text" },
      { key: "batch_no", label: "Batch number", type: "text" },
      { key: "rx_required", label: "Prescription required", type: "checkbox" },
      { key: "style_code", label: "Style code (Apparel)", type: "text" },
      { key: "size", label: "Size", type: "text" },
      { key: "color", label: "Color", type: "text" },
      { key: "serial_required", label: "Serial / IMEI required", type: "checkbox" },
      { key: "warranty_months", label: "Warranty (months)", type: "number" },
    ],
  },
  crockery: {
    packId: "crockery",
    fields: [
      { key: "category", label: "Category", type: "select", options: ["Dinnerware", "Cookware & Cookers", "Glassware", "Drinkware & Flasks", "Cutlery & Tools", "Food Storage", "Spare Parts"], required: true, minimal: true },
      { key: "material", label: "Material", type: "select", options: ["Opal Glass", "Fine Bone China", "Ceramic / Porcelain", "Melamine", "Stainless Steel 304", "Hard Anodized", "Cast Iron", "Non-Stick Granite", "Borosilicate Glass"], required: false, minimal: true },
      { key: "piece_count", label: "Piece count in set", type: "number", minimal: true },
      { key: "heat_compatibility", label: "Heat / Stovetop compatibility", type: "select", options: ["Induction & Gas", "Gas Only", "Microwave Safe", "Oven Safe", "Not Heat Resistant"], minimal: true },
      { key: "capacity", label: "Capacity (e.g. 5.5L, 500ml)", type: "text", minimal: true },
      { key: "warranty_months", label: "Warranty (months)", type: "number" },
      { key: "is_fragile", label: "Fragile (Handle with care)", type: "checkbox" },
      { key: "replacement_piece_available", label: "Single piece replacement available", type: "checkbox" },
    ],
  },
  "cycle-toys": {
    packId: "cycle-toys",
    fields: [
      { key: "category", label: "Category", type: "select", options: ["Kids Cycles & Tricycles", "Geared Mountain & Road Bicycles", "Electric Battery Ride-on Cars & Bikes", "Action Toys, Blocks & Board Games", "Baby Strollers, Prams & Walkers", "Helmets, Bells & Cycle Spares", "Workshop Service & Assembly Charge"], required: true, minimal: true },
      { key: "wheel_size", label: "Wheel Size", type: "select", options: ['12"', '14"', '16"', '18"', '20"', '24"', '26"', '27.5"', '29"', '700C', 'N/A'], minimal: true },
      { key: "age_group", label: "Age Group", type: "select", options: ["0-12 Months", "1-3 Years", "3-5 Years", "6-8 Years", "9-12 Years", "13+ / Adult"], minimal: true },
      { key: "assembly_status", label: "Assembly Condition", type: "select", options: ["Ready-to-Ride (Assembled)", "Boxed SKD (Unassembled Carton)"], minimal: true },
      { key: "gear_type", label: "Gears / Transmission", type: "select", options: ["Single Speed", "7-Speed Shimano", "21-Speed Shimano", "24-Speed", "Dual Motor 12V", "None"] },
      { key: "frame_material", label: "Frame / Body Material", type: "text" },
      { key: "battery_type", label: "Battery Specification", type: "text" },
      { key: "safety_cert", label: "Safety Certification (EN71/CE)", type: "text" },
      { key: "warranty_months", label: "Warranty (months)", type: "number" },
    ],
  },
};

export function getProductFormFields(packId: IndustryPackId, mode: "minimal" | "full" = "full"): ProductFormFieldDef[] {
  const def = PRODUCT_FORM_REGISTRY[packId];
  if (!def) return [];
  if (mode === "minimal") return def.fields.filter(f => f.minimal !== false);
  return def.fields;
}

export function productFormFieldLabels(packId: IndustryPackId): string[] {
  const fromRegistry = getProductFormFields(packId, "minimal").map(f => f.label);
  const fromPack = getPackDef(packId).productFields;
  return [...new Set([...fromRegistry, ...fromPack])];
}

export function emptyMetaForPack(packId: IndustryPackId): Record<string, string | number | boolean> {
  const meta: Record<string, string | number | boolean> = {};
  for (const f of getProductFormFields(packId)) {
    if (f.type === "checkbox") meta[f.key] = false;
    else if (f.type === "number") meta[f.key] = 0;
    else meta[f.key] = "";
  }
  return meta;
}

export function validateProductMeta(packId: IndustryPackId, meta: Record<string, unknown>): string | null {
  for (const f of getProductFormFields(packId)) {
    if (!f.required) continue;
    const l = f.label.toLowerCase();
    const k = f.key.toLowerCase();
    if (
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
      k === "material_composition"
    ) {
      continue;
    }
    const v = meta[f.key];
    if (v === undefined || v === null || v === "") return `${f.label} is required for ${getPackDef(packId).shortName}`;
  }
  return null;
}
