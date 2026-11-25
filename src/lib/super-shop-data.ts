// Super Shop multi-department catalog & dynamic department store

export type SuperShopCapability =
  | "weighed"
  | "tare"
  | "batch_tracked"
  | "expiry_block"
  | "variant"
  | "serial_tracked"
  | "warranty"
  | "age_restricted"
  | "rx_reference"
  | "open_price";

export type SuperShopDepartment = {
  id: string;
  code: string;
  name: string;
  color: string;
  iconName: string;
  sortOrder: number;
  capabilities: SuperShopCapability[];
  defaultVatClass: string;
  returnable: boolean;
  returnWindowDays: number;
  isActive: boolean;
};

export const DEFAULT_SUPER_SHOP_DEPARTMENTS: SuperShopDepartment[] = [
  {
    id: "dept-fresh",
    code: "FRESH",
    name: "Fresh, Meat & Fish",
    color: "#10b981", // Emerald
    iconName: "Apple",
    sortOrder: 1,
    capabilities: ["weighed", "tare", "batch_tracked"],
    defaultVatClass: "EXEMPT",
    returnable: false,
    returnWindowDays: 0,
    isActive: true,
  },
  {
    id: "dept-groc",
    code: "GROC",
    name: "Grocery & FMCG",
    color: "#f59e0b", // Amber
    iconName: "ShoppingBasket",
    sortOrder: 2,
    capabilities: [],
    defaultVatClass: "STANDARD_5",
    returnable: true,
    returnWindowDays: 7,
    isActive: true,
  },
  {
    id: "dept-pharm",
    code: "PHARM",
    name: "Pharmacy & Health (OTC)",
    color: "#06b6d4", // Cyan
    iconName: "Pill",
    sortOrder: 3,
    capabilities: ["batch_tracked", "expiry_block", "rx_reference"],
    defaultVatClass: "MED_EXEMPT",
    returnable: false,
    returnWindowDays: 0,
    isActive: true,
  },
  {
    id: "dept-apparel",
    code: "APPAREL",
    name: "Apparel & Footwear",
    color: "#8b5cf6", // Purple
    iconName: "Shirt",
    sortOrder: 4,
    capabilities: ["variant"],
    defaultVatClass: "STANDARD_7_5",
    returnable: true,
    returnWindowDays: 7,
    isActive: true,
  },
  {
    id: "dept-beauty",
    code: "BEAUTY",
    name: "Cosmetics & Personal Care",
    color: "#ec4899", // Pink
    iconName: "Sparkles",
    sortOrder: 5,
    capabilities: ["batch_tracked", "expiry_block", "variant"],
    defaultVatClass: "STANDARD_5",
    returnable: false,
    returnWindowDays: 0,
    isActive: true,
  },
  {
    id: "dept-tech",
    code: "TECH",
    name: "Electronics & Home",
    color: "#3b82f6", // Blue
    iconName: "Cpu",
    sortOrder: 6,
    capabilities: ["serial_tracked", "warranty"],
    defaultVatClass: "STANDARD_5",
    returnable: true,
    returnWindowDays: 7,
    isActive: true,
  },
  {
    id: "dept-stat",
    code: "STAT",
    name: "Stationery & General",
    color: "#64748b", // Slate
    iconName: "PenLine",
    sortOrder: 7,
    capabilities: [],
    defaultVatClass: "STANDARD_5",
    returnable: true,
    returnWindowDays: 7,
    isActive: true,
  },
];

const STORAGE_KEY = "pulse.super_shop_departments";

export function getSuperShopDepartments(): SuperShopDepartment[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return DEFAULT_SUPER_SHOP_DEPARTMENTS;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SUPER_SHOP_DEPARTMENTS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (err) {
    console.error("Failed to parse super shop departments", err);
  }
  return DEFAULT_SUPER_SHOP_DEPARTMENTS;
}

export function saveSuperShopDepartments(depts: SuperShopDepartment[]): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(depts));
    window.dispatchEvent(new Event("super-shop-departments-updated"));
  } catch (err) {
    console.error("Failed to save super shop departments", err);
  }
}

export function resetSuperShopDepartments(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event("super-shop-departments-updated"));
}

export type SuperShopCatalogVariant = {
  id: string;
  size: string;
  color: string;
  sku: string;
  barcode: string;
  price: number;
  stock: number;
};

export type SuperShopCatalogItem = {
  id: string;
  sku: string;
  name: string;
  departmentCode: string;
  category: string;
  price: number;
  mrp?: number;
  costPrice?: number;
  stock: number;
  barcode?: string;
  pluCode?: string;
  ratePerKg?: number;
  tareWeightGrams?: number;
  isWeighable?: boolean;
  batchNo?: string;
  expiryDate?: string;
  genericName?: string;
  rxRequired?: boolean;
  styleCode?: string;
  variants?: SuperShopCatalogVariant[];
  serialRequired?: boolean;
  warrantyMonths?: number;
  shelfLocation?: string;
  meta?: Record<string, unknown>;
};

export const superShopCatalog: SuperShopCatalogItem[] = [
  // 1. Fresh, Meat & Fish
  {
    id: "ss-bf-01",
    sku: "BF-SIRLOIN",
    name: "Fresh Beef · Sirloin Cut",
    departmentCode: "FRESH",
    category: "Meat & Butchery",
    price: 850,
    ratePerKg: 850,
    mrp: 850,
    stock: 45,
    isWeighable: true,
    pluCode: "4011",
    tareWeightGrams: 20,
    shelfLocation: "Cold Counter C1",
    barcode: "204011000000",
  },
  {
    id: "ss-bf-02",
    sku: "CK-WHOLE",
    name: "Broiler Chicken · Skinless Whole",
    departmentCode: "FRESH",
    category: "Meat & Butchery",
    price: 220,
    ratePerKg: 220,
    mrp: 230,
    stock: 80,
    isWeighable: true,
    pluCode: "4012",
    tareWeightGrams: 15,
    shelfLocation: "Cold Counter C2",
    barcode: "204012000000",
  },
  {
    id: "ss-fr-01",
    sku: "AP-FUJI",
    name: "Fuji Apples · Import Grade A",
    departmentCode: "FRESH",
    category: "Fresh Produce",
    price: 280,
    ratePerKg: 280,
    mrp: 300,
    stock: 120,
    isWeighable: true,
    pluCode: "4013",
    tareWeightGrams: 10,
    shelfLocation: "Fruit Bay F1",
    barcode: "204013000000",
  },
  {
    id: "ss-fr-02",
    sku: "TM-ROMA",
    name: "Red Tomatoes · Fresh Local",
    departmentCode: "FRESH",
    category: "Vegetables",
    price: 65,
    ratePerKg: 65,
    mrp: 70,
    stock: 200,
    isWeighable: true,
    pluCode: "4014",
    tareWeightGrams: 10,
    shelfLocation: "Veggie Bin V3",
    barcode: "204014000000",
  },

  // 2. Grocery & FMCG
  {
    id: "ss-gc-01",
    sku: "PRAN-MJ-1L",
    name: "Pran Mango Fruit Juice 1L",
    departmentCode: "GROC",
    category: "Beverages",
    price: 220,
    mrp: 240,
    stock: 150,
    barcode: "894110022331",
    shelfLocation: "Aisle 02 · Shelf B",
  },
  {
    id: "ss-gc-02",
    sku: "RC-MINIKET-5K",
    name: "Premium Miniket Rice 5kg Pack",
    departmentCode: "GROC",
    category: "Food Staples",
    price: 410,
    mrp: 440,
    stock: 65,
    barcode: "894110033442",
    shelfLocation: "Aisle 01 · Shelf A",
  },
  {
    id: "ss-gc-03",
    sku: "RUCHI-CHANACHUR",
    name: "Ruchi BBQ Chanachur 300g",
    departmentCode: "GROC",
    category: "Snacks",
    price: 85,
    mrp: 90,
    stock: 180,
    barcode: "894110044553",
    shelfLocation: "Aisle 03 · Shelf C",
  },
  {
    id: "ss-gc-04",
    sku: "SAVLON-LIQ-500",
    name: "Savlon Antiseptic Liquid 500ml",
    departmentCode: "GROC",
    category: "Household Hygiene",
    price: 180,
    mrp: 195,
    stock: 90,
    barcode: "894110055663",
    shelfLocation: "Aisle 04 · Shelf D",
  },

  // 3. Pharmacy & Health (OTC)
  {
    id: "ss-ph-01",
    sku: "MED-NAPA-EX",
    name: "Napa Extra 500mg (10 Tabs)",
    departmentCode: "PHARM",
    category: "Analgesic & Fever",
    price: 30,
    mrp: 30,
    stock: 350,
    barcode: "894220011001",
    genericName: "Paracetamol + Caffeine",
    batchNo: "BT-2026-09A",
    expiryDate: "2027-12-31",
    rxRequired: false,
    shelfLocation: "Pharmacy Counter Bay 1",
  },
  {
    id: "ss-ph-02",
    sku: "MED-AMOX-500",
    name: "Moxacil 500mg Capsule (10 Caps)",
    departmentCode: "PHARM",
    category: "Antibiotics",
    price: 75,
    mrp: 80,
    stock: 140,
    barcode: "894220022002",
    genericName: "Amoxicillin Trihydrate",
    batchNo: "BT-2026-04C",
    expiryDate: "2027-06-30",
    rxRequired: true,
    shelfLocation: "Pharmacy Rx Cabinet",
  },
  {
    id: "ss-ph-03",
    sku: "MED-CEVIT-500",
    name: "Ceevit Vitamin C Chewable 250mg",
    departmentCode: "PHARM",
    category: "Supplements",
    price: 25,
    mrp: 28,
    stock: 220,
    barcode: "894220033003",
    genericName: "Ascorbic Acid",
    batchNo: "BT-2026-11B",
    expiryDate: "2028-02-28",
    rxRequired: false,
    shelfLocation: "Pharmacy Counter Bay 2",
  },

  // 4. Apparel & Footwear
  {
    id: "ss-ap-01",
    sku: "POLO-COTTON",
    name: "Men's Pique Cotton Polo Shirt",
    departmentCode: "APPAREL",
    category: "Men's Casual",
    price: 850,
    mrp: 990,
    stock: 55,
    styleCode: "POLO-01",
    shelfLocation: "Apparel Rack A1",
    variants: [
      { id: "v1", size: "M", color: "Navy", sku: "POLO-01-M-NV", barcode: "894330011011", price: 850, stock: 18 },
      { id: "v2", size: "L", color: "Navy", sku: "POLO-01-L-NV", barcode: "894330011012", price: 850, stock: 22 },
      { id: "v3", size: "XL", color: "Black", sku: "POLO-01-XL-BK", barcode: "894330011013", price: 850, stock: 15 },
    ],
  },
  {
    id: "ss-ap-02",
    sku: "CHINO-PANTS",
    name: "Men's Stretch Chino Trousers",
    departmentCode: "APPAREL",
    category: "Men's Bottoms",
    price: 1250,
    mrp: 1450,
    stock: 40,
    styleCode: "CHINO-02",
    shelfLocation: "Apparel Rack A2",
    variants: [
      { id: "v4", size: "32", color: "Khaki", sku: "CHINO-32-KH", barcode: "894330022021", price: 1250, stock: 20 },
      { id: "v5", size: "34", color: "Black", sku: "CHINO-34-BK", barcode: "894330022022", price: 1250, stock: 20 },
    ],
  },
  {
    id: "ss-ap-03",
    sku: "COTTON-SOCKS-3P",
    name: "Crew Cotton Socks (3-Pack)",
    departmentCode: "APPAREL",
    category: "Hosiery",
    price: 240,
    mrp: 280,
    stock: 90,
    barcode: "894330033031",
    shelfLocation: "Apparel Bin H1",
  },

  // 5. Cosmetics & Beauty
  {
    id: "ss-bt-01",
    sku: "NIVEA-SOFT-200",
    name: "Nivea Soft Moisturising Cream 200ml",
    departmentCode: "BEAUTY",
    category: "Skincare",
    price: 420,
    mrp: 460,
    stock: 75,
    barcode: "894550011001",
    expiryDate: "2027-08-31",
    shelfLocation: "Beauty Aisle 05 · A",
  },
  {
    id: "ss-bt-02",
    sku: "LIPSTICK-RUBY",
    name: "Velvet Matte Lipstick · Ruby Red",
    departmentCode: "BEAUTY",
    category: "Color Cosmetics",
    price: 680,
    mrp: 750,
    stock: 45,
    barcode: "894550022002",
    shelfLocation: "Beauty Display Stand",
  },

  // 6. Electronics & Home
  {
    id: "ss-tc-01",
    sku: "WALTON-LED-12W",
    name: "Walton LED Bulb 12W Day Light",
    departmentCode: "TECH",
    category: "Lighting & Home",
    price: 350,
    mrp: 380,
    stock: 110,
    barcode: "894440011001",
    serialRequired: true,
    warrantyMonths: 12,
    shelfLocation: "Tech Aisle 06 · B",
  },
  {
    id: "ss-tc-02",
    sku: "CHARGER-USBC-30W",
    name: "Fast PD USB-C Charger 30W",
    departmentCode: "TECH",
    category: "Mobile Accessories",
    price: 650,
    mrp: 750,
    stock: 60,
    barcode: "894440022002",
    serialRequired: true,
    warrantyMonths: 6,
    shelfLocation: "Tech Glass Showcase",
  },

  // 7. Stationery & General
  {
    id: "ss-st-01",
    sku: "A4-PAPER-500",
    name: "Double A Paper 80GSM 500 Sheets",
    departmentCode: "STAT",
    category: "Office Stationery",
    price: 520,
    mrp: 550,
    stock: 85,
    barcode: "894660011001",
    shelfLocation: "Stationery Rack S1",
  },
  {
    id: "ss-st-02",
    sku: "BALLPEN-SET-10",
    name: "Matador Pinpoint Ball Pen (Pack of 10)",
    departmentCode: "STAT",
    category: "Writing Supplies",
    price: 150,
    mrp: 160,
    stock: 200,
    barcode: "894660022002",
    shelfLocation: "Stationery Stand S2",
  },
];

export type FastKeyItem = {
  id: string;
  label: string;
  subLabel?: string;
  sku: string;
  color?: string;
  price?: number;
};

export const DEFAULT_FAST_KEYS: FastKeyItem[] = [
  { id: "fk-1", label: "Carry Bag", subLabel: "৳5", sku: "CARRY-BAG", color: "#64748b", price: 5 },
  { id: "fk-2", label: "Tomato", subLabel: "PLU 4014", sku: "TM-ROMA", color: "#ef4444" },
  { id: "fk-3", label: "Fuji Apple", subLabel: "PLU 4013", sku: "AP-FUJI", color: "#10b981" },
  { id: "fk-4", label: "Beef Sirloin", subLabel: "PLU 4011", sku: "BF-SIRLOIN", color: "#b91c1c" },
  { id: "fk-5", label: "Broiler", subLabel: "PLU 4012", sku: "CK-WHOLE", color: "#f97316" },
  { id: "fk-6", label: "Napa Extra", subLabel: "৳30", sku: "MED-NAPA-EX", color: "#06b6d4", price: 30 },
  { id: "fk-7", label: "LED 12W", subLabel: "৳350", sku: "WALTON-LED-12W", color: "#3b82f6", price: 350 },
  { id: "fk-8", label: "Mango Juice", subLabel: "৳220", sku: "PRAN-MJ-1L", color: "#f59e0b", price: 220 },
];

export type SuperShopScaleBarcodeResult = {
  isScaleBarcode: boolean;
  prefix?: string;
  pluCode?: string;
  type?: "weight" | "price";
  weightKg?: number;
  priceBDT?: number;
  rawDigits?: string;
};

/**
 * Standard EAN-13 in-store variable weight/price barcode parser.
 * Prefix 20: Weight-embedded (20 + 4-digit PLU + 5-digit weight in grams + 1 check digit)
 * Prefix 21: Price-embedded  (21 + 4-digit PLU + 5-digit price in paisa/cents + 1 check digit)
 */
export function parseScaleBarcode(
  rawBarcode: string,
  options?: { pluDigits?: number; priceDecimals?: number }
): SuperShopScaleBarcodeResult {
  const clean = rawBarcode.trim();
  if (clean.length < 12 || clean.length > 13) {
    return { isScaleBarcode: false };
  }

  const prefix = clean.slice(0, 2);
  if (prefix !== "20" && prefix !== "21") {
    return { isScaleBarcode: false };
  }

  const pluLen = options?.pluDigits || 4;
  const pluCode = clean.slice(2, 2 + pluLen);
  const valueSection = clean.slice(2 + pluLen, clean.length - 1); // Exclude last check digit

  if (prefix === "20") {
    // Weight-embedded: 5 digits = grams
    const grams = parseInt(valueSection, 10);
    if (isNaN(grams)) return { isScaleBarcode: false };
    const weightKg = Math.round((grams / 1000) * 1000) / 1000;
    return {
      isScaleBarcode: true,
      prefix,
      pluCode,
      type: "weight",
      weightKg,
      rawDigits: valueSection,
    };
  }

  if (prefix === "21") {
    // Price-embedded: 5 digits = cents/paisa (default 2 decimals) or whole currency units
    const units = parseInt(valueSection, 10);
    if (isNaN(units)) return { isScaleBarcode: false };
    const decimals = options?.priceDecimals ?? 2;
    const factor = Math.pow(10, decimals);
    const priceBDT = Math.round((units / factor) * 100) / 100;
    return {
      isScaleBarcode: true,
      prefix,
      pluCode,
      type: "price",
      priceBDT,
      rawDigits: valueSection,
    };
  }

  return { isScaleBarcode: false };
}

/**
 * Calculates net weight and final line price considering gross weight and tare deduction.
 */
export function computeWeighedPrice(
  grossKg: number,
  ratePerKg: number,
  tareGrams: number = 0
): { netKg: number; grossKg: number; tareKg: number; totalPrice: number } {
  const tareKg = Math.max(0, tareGrams / 1000);
  const netKg = Math.max(0.01, Math.round((grossKg - tareKg) * 1000) / 1000);
  const totalPrice = Math.round(netKg * ratePerKg);
  return { netKg, grossKg, tareKg, totalPrice };
}

/**
 * Computes markdown discount according to perishable expiry days.
 */
export function computeExpiryMarkdown(
  basePrice: number,
  daysToExpiry: number
): { discountPct: number; finalPrice: number; status: "critical" | "warning" | "fresh" } {
  if (daysToExpiry <= 0) {
    return { discountPct: 100, finalPrice: 0, status: "critical" };
  }
  if (daysToExpiry === 1) {
    return { discountPct: 50, finalPrice: Math.round(basePrice * 0.5), status: "critical" };
  }
  if (daysToExpiry <= 3) {
    return { discountPct: 30, finalPrice: Math.round(basePrice * 0.7), status: "warning" };
  }
  if (daysToExpiry <= 7) {
    return { discountPct: 15, finalPrice: Math.round(basePrice * 0.85), status: "warning" };
  }
  return { discountPct: 0, finalPrice: basePrice, status: "fresh" };
}

