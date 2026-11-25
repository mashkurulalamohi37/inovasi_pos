// Mock catalogue, stores, batches and variants used across the Pulse POS prototype.
// All currency values are BDT minor-unit-friendly (whole taka).

export type Tenant = {
  id: string;
  name: string;
  country: string;
  currency: string;
  timezone: string;
  packs: ("core" | "fashion" | "pharmacy" | "grocery" | "restaurant")[];
};

export type Store = {
  id: string;
  code: string;
  name: string;
  city: string;
  vertical: "fashion" | "pharmacy" | "general";
  counters: number;
  online: boolean;
};

export const tenant: Tenant = {
  id: "tnt_outfit_bd",
  name: "OUTFIT",
  country: "Bangladesh",
  currency: "BDT",
  timezone: "Asia/Dhaka",
  packs: ["core", "fashion"],
};

export const stores: Store[] = [
  { id: "str_outfit_01", code: "OUTFIT-01", name: "OUTFIT Basurhat Outlet", city: "Noakhali", vertical: "fashion", counters: 2, online: true },
  { id: "str_dhk_01", code: "DHK-01", name: "Banani Flagship", city: "Dhaka", vertical: "fashion", counters: 4, online: true },
];

export type FashionVariant = {
  sku: string;
  size: string;
  color: string;
  fit: string;
  price: number;
  stock: Record<string, number>; // by store code
  barcode: string;
};

export type FashionStyle = {
  id: string;
  styleCode: string;
  name: string;
  category: string;
  brand: string;
  season: string;
  basePrice: number;
  image: string;
  fabric: string;
  variants: FashionVariant[];
};

export const fashionStyles: FashionStyle[] = [
  {
    id: "f1",
    styleCode: "MNS-SHRT-2406",
    name: "Oxford Button-Down",
    category: "Men · Shirts",
    brand: "Pulse Atelier",
    season: "SS-26",
    basePrice: 2490,
    fabric: "100% combed cotton",
    image: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=400&q=80",
    variants: [
      { sku: "MNS-SHRT-2406-WHT-S-SLM", size: "S", color: "White", fit: "Slim", price: 2490, stock: { "DHK-01": 4, "CTG-01": 2 }, barcode: "8801240601" },
      { sku: "MNS-SHRT-2406-WHT-M-SLM", size: "M", color: "White", fit: "Slim", price: 2490, stock: { "DHK-01": 6, "CTG-01": 3 }, barcode: "8801240602" },
      { sku: "MNS-SHRT-2406-WHT-L-SLM", size: "L", color: "White", fit: "Slim", price: 2490, stock: { "DHK-01": 2, "CTG-01": 0 }, barcode: "8801240603" },
      { sku: "MNS-SHRT-2406-WHT-XL-REG", size: "XL", color: "White", fit: "Regular", price: 2590, stock: { "DHK-01": 1, "CTG-01": 1 }, barcode: "8801240604" },
      { sku: "MNS-SHRT-2406-BLU-S-SLM", size: "S", color: "Indigo", fit: "Slim", price: 2490, stock: { "DHK-01": 3, "CTG-01": 0 }, barcode: "8801240605" },
      { sku: "MNS-SHRT-2406-BLU-M-SLM", size: "M", color: "Indigo", fit: "Slim", price: 2490, stock: { "DHK-01": 0, "CTG-01": 2 }, barcode: "8801240606" },
      { sku: "MNS-SHRT-2406-BLU-L-SLM", size: "L", color: "Indigo", fit: "Slim", price: 2490, stock: { "DHK-01": 5, "CTG-01": 1 }, barcode: "8801240607" },
      { sku: "MNS-SHRT-2406-BLK-M-SLM", size: "M", color: "Charcoal", fit: "Slim", price: 2590, stock: { "DHK-01": 2, "CTG-01": 2 }, barcode: "8801240608" },
      { sku: "MNS-SHRT-2406-BLK-L-SLM", size: "L", color: "Charcoal", fit: "Slim", price: 2590, stock: { "DHK-01": 3, "CTG-01": 1 }, barcode: "8801240609" },
    ],
  },
  {
    id: "f6",
    styleCode: "MNS-PNT-3011",
    name: "Green Cargo Pants",
    category: "Men · Pants",
    brand: "Pulse Athletics",
    season: "SS-26",
    basePrice: 1990,
    fabric: "Tough cotton drill",
    image: "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?auto=format&fit=crop&w=400&q=80",
    variants: [
      { sku: "MNS-PNT-3011-GRN-30", size: "30", color: "Olive", fit: "Regular", price: 1990, stock: { "DHK-01": 5 }, barcode: "8801301101" },
      { sku: "MNS-PNT-3011-GRN-32", size: "32", color: "Olive", fit: "Regular", price: 1990, stock: { "DHK-01": 8 }, barcode: "8801301102" },
      { sku: "MNS-PNT-3011-GRN-34", size: "34", color: "Olive", fit: "Regular", price: 1990, stock: { "DHK-01": 3 }, barcode: "8801301103" },
    ],
  },
  {
    id: "f7",
    styleCode: "MNS-PNT-3012",
    name: "Black Canvas Pants",
    category: "Men · Pants",
    brand: "Pulse Athletics",
    season: "SS-26",
    basePrice: 2190,
    fabric: "100% canvas cotton",
    image: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=400&q=80",
    variants: [
      { sku: "MNS-PNT-3012-BLK-30", size: "30", color: "Black", fit: "Regular", price: 2190, stock: { "DHK-01": 4 }, barcode: "8801301201" },
      { sku: "MNS-PNT-3012-BLK-32", size: "32", color: "Black", fit: "Regular", price: 2190, stock: { "DHK-01": 10 }, barcode: "8801301202" },
      { sku: "MNS-PNT-3012-BLK-34", size: "34", color: "Black", fit: "Regular", price: 2190, stock: { "DHK-01": 5 }, barcode: "8801301203" },
    ],
  },
  {
    id: "f8",
    styleCode: "UNX-SWP-4401",
    name: "Grey Jogger Sweatpants",
    category: "Unisex · Pants",
    brand: "Pulse Athletics",
    season: "AW-26",
    basePrice: 1790,
    fabric: "80% fleece, 20% cotton",
    image: "https://images.unsplash.com/photo-1580906853223-f17a700a7029?auto=format&fit=crop&w=400&q=80",
    variants: [
      { sku: "UNX-SWP-4401-GRY-S", size: "S", color: "Grey", fit: "Standard", price: 1790, stock: { "DHK-01": 6 }, barcode: "8801440101" },
      { sku: "UNX-SWP-4401-GRY-M", size: "M", color: "Grey", fit: "Standard", price: 1790, stock: { "DHK-01": 9 }, barcode: "8801440102" },
      { sku: "UNX-SWP-4401-GRY-L", size: "L", color: "Grey", fit: "Standard", price: 1790, stock: { "DHK-01": 4 }, barcode: "8801440103" },
    ],
  },
  {
    id: "f9",
    styleCode: "UNX-SWP-4402",
    name: "Active Track Pants",
    category: "Unisex · Pants",
    brand: "Pulse Athletics",
    season: "AW-26",
    basePrice: 1690,
    fabric: "Polyester dry-fit",
    image: "https://images.unsplash.com/photo-1506152983158-b4a74a01c721?auto=format&fit=crop&w=400&q=80",
    variants: [
      { sku: "UNX-SWP-4402-BLK-S", size: "S", color: "Black", fit: "Athletic", price: 1690, stock: { "DHK-01": 5 }, barcode: "8801440201" },
      { sku: "UNX-SWP-4402-BLK-M", size: "M", color: "Black", fit: "Athletic", price: 1690, stock: { "DHK-01": 8 }, barcode: "8801440202" },
      { sku: "UNX-SWP-4402-BLK-L", size: "L", color: "Black", fit: "Athletic", price: 1690, stock: { "DHK-01": 7 }, barcode: "8801440203" },
    ],
  },
  {
    id: "f10",
    styleCode: "MNS-TEE-1011",
    name: "Teal Cotton Tee",
    category: "Men · Shirts",
    brand: "Pulse Atelier",
    season: "SS-26",
    basePrice: 1290,
    fabric: "100% organic cotton",
    image: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=400&q=80",
    variants: [
      { sku: "MNS-TEE-1011-TEL-S", size: "S", color: "Teal", fit: "Regular", price: 1290, stock: { "DHK-01": 10 }, barcode: "8801101101" },
      { sku: "MNS-TEE-1011-TEL-M", size: "M", color: "Teal", fit: "Regular", price: 1290, stock: { "DHK-01": 12 }, barcode: "8801101102" },
      { sku: "MNS-TEE-1011-TEL-L", size: "L", color: "Teal", fit: "Regular", price: 1290, stock: { "DHK-01": 6 }, barcode: "8801101103" },
    ],
  },
  {
    id: "f12",
    styleCode: "MNS-TEE-1012",
    name: "Grey Cotton Tee",
    category: "Men · Shirts",
    brand: "Pulse Atelier",
    season: "SS-26",
    basePrice: 1190,
    fabric: "100% organic cotton",
    image: "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=400&q=80",
    variants: [
      { sku: "MNS-TEE-1012-GRY-S", size: "S", color: "Grey", fit: "Regular", price: 1190, stock: { "DHK-01": 8 }, barcode: "8801101201" },
      { sku: "MNS-TEE-1012-GRY-M", size: "M", color: "Grey", fit: "Regular", price: 1190, stock: { "DHK-01": 14 }, barcode: "8801101202" },
      { sku: "MNS-TEE-1012-GRY-L", size: "L", color: "Grey", fit: "Regular", price: 1190, stock: { "DHK-01": 5 }, barcode: "8801101203" },
    ],
  },
  {
    id: "f13",
    styleCode: "MNS-TEE-1013",
    name: "Black Classic Tee",
    category: "Men · Shirts",
    brand: "Pulse Atelier",
    season: "SS-26",
    basePrice: 1290,
    fabric: "100% organic cotton",
    image: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=400&q=80",
    variants: [
      { sku: "MNS-TEE-1013-BLK-S", size: "S", color: "Black", fit: "Regular", price: 1290, stock: { "DHK-01": 9 }, barcode: "8801101301" },
      { sku: "MNS-TEE-1013-BLK-M", size: "M", color: "Black", fit: "Regular", price: 1290, stock: { "DHK-01": 11 }, barcode: "8801101302" },
      { sku: "MNS-TEE-1013-BLK-L", size: "L", color: "Black", fit: "Regular", price: 1290, stock: { "DHK-01": 7 }, barcode: "8801101303" },
    ],
  },
  {
    id: "f14",
    styleCode: "MNS-POL-2022",
    name: "Red Polo Shirt",
    category: "Men · Shirts",
    brand: "Pulse Atelier",
    season: "SS-26",
    basePrice: 1590,
    fabric: "Pique cotton knit",
    image: "https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&w=400&q=80",
    variants: [
      { sku: "MNS-POL-2022-RED-S", size: "S", color: "Red", fit: "Regular", price: 1590, stock: { "DHK-01": 12 }, barcode: "8801202201" },
      { sku: "MNS-POL-2022-RED-M", size: "M", color: "Red", fit: "Regular", price: 1590, stock: { "DHK-01": 16 }, barcode: "8801202202" },
      { sku: "MNS-POL-2022-RED-L", size: "L", color: "Red", fit: "Regular", price: 1590, stock: { "DHK-01": 8 }, barcode: "8801202203" },
    ],
  },
  {
    id: "f2",
    styleCode: "WMN-KRT-1188",
    name: "Block-Print Kurta",
    category: "Women · Ethnic",
    brand: "Indigo Lane",
    season: "SS-26",
    basePrice: 3290,
    fabric: "Cotton voile",
    image: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=400&q=80",
    variants: [
      { sku: "WMN-KRT-1188-RED-S-REG", size: "S", color: "Madder", fit: "Regular", price: 3290, stock: { "DHK-01": 3 }, barcode: "8801118801" },
      { sku: "WMN-KRT-1188-RED-M-REG", size: "M", color: "Madder", fit: "Regular", price: 3290, stock: { "DHK-01": 5 }, barcode: "8801118802" },
      { sku: "WMN-KRT-1188-IND-M-REG", size: "M", color: "Indigo", fit: "Regular", price: 3290, stock: { "DHK-01": 4 }, barcode: "8801118803" },
      { sku: "WMN-KRT-1188-IND-L-REG", size: "L", color: "Indigo", fit: "Regular", price: 3290, stock: { "DHK-01": 2 }, barcode: "8801118804" },
    ],
  },
  {
    id: "f11",
    styleCode: "WMN-BLS-1201",
    name: "Pink Chiffon Blouse",
    category: "Women · Tops",
    brand: "Indigo Lane",
    season: "SS-26",
    basePrice: 2290,
    fabric: "Polyester chiffon",
    image: "https://images.unsplash.com/photo-1603252109303-2751441dd157?auto=format&fit=crop&w=400&q=80",
    variants: [
      { sku: "WMN-BLS-1201-PNK-S", size: "S", color: "Pink", fit: "Regular", price: 2290, stock: { "DHK-01": 4 }, barcode: "8801120101" },
      { sku: "WMN-BLS-1201-PNK-M", size: "M", color: "Pink", fit: "Regular", price: 2290, stock: { "DHK-01": 7 }, barcode: "8801120102" },
      { sku: "WMN-BLS-1201-PNK-L", size: "L", color: "Pink", fit: "Regular", price: 2290, stock: { "DHK-01": 3 }, barcode: "8801120103" },
    ],
  },
  {
    id: "f3",
    styleCode: "UNX-SWT-8890",
    name: "Premium Crewneck Sweatshirt",
    category: "Unisex · Athletics",
    brand: "Pulse Athletics",
    season: "AW-26",
    basePrice: 1890,
    fabric: "80% cotton, 20% polyester fleece",
    image: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=400&q=80",
    variants: [
      { sku: "UNX-SWT-8890-GRY-S", size: "S", color: "Grey", fit: "Relaxed", price: 1890, stock: { "DHK-01": 10 }, barcode: "8801889001" },
      { sku: "UNX-SWT-8890-GRY-M", size: "M", color: "Grey", fit: "Relaxed", price: 1890, stock: { "DHK-01": 8 }, barcode: "8801889002" },
      { sku: "UNX-SWT-8890-BLK-L", size: "L", color: "Charcoal", fit: "Relaxed", price: 1990, stock: { "DHK-01": 0 }, barcode: "8801889003" },
    ],
  },
  {
    id: "f4",
    styleCode: "KDS-TEE-0012",
    name: "Cartoon Cotton Tee",
    category: "Kids · Tops",
    brand: "Tiny Threads",
    season: "SS-26",
    basePrice: 990,
    fabric: "100% organic cotton",
    image: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=400&q=80",
    variants: [
      { sku: "KDS-TEE-0012-YEL-2T", size: "2T", color: "Yellow", fit: "Kids", price: 990, stock: { "DHK-01": 12 }, barcode: "8801001201" },
      { sku: "KDS-TEE-0012-YEL-4T", size: "4T", color: "Yellow", fit: "Kids", price: 990, stock: { "DHK-01": 15 }, barcode: "8801001202" },
    ],
  },
  {
    id: "f5",
    styleCode: "ACC-BELT-4450",
    name: "Full-Grain Leather Belt",
    category: "Accessories · Leather",
    brand: "AeroGoods",
    season: "AW-26",
    basePrice: 1590,
    fabric: "Genuine leather",
    image: "https://images.unsplash.com/photo-1624224971170-2f84fed5eb5e?auto=format&fit=crop&w=400&q=80",
    variants: [
      { sku: "ACC-BELT-4450-BRW-32", size: "32", color: "Brown", fit: "Standard", price: 1590, stock: { "DHK-01": 5 }, barcode: "8801445001" },
      { sku: "ACC-BELT-4450-BRW-34", size: "34", color: "Brown", fit: "Standard", price: 1590, stock: { "DHK-01": 6 }, barcode: "8801445002" },
    ],
  },
];

export type PharmacyBatch = {
  batchNo: string;
  mfgDate: string;
  expiryDate: string;
  qty: Record<string, number>;
  mrp: number;
  status: "ok" | "near-expiry" | "expired";
};

export type PharmacyItem = {
  id: string;
  sku: string;
  brand: string;
  generic: string;
  manufacturer: string;
  dosageForm: string;
  strength: string;
  therapeuticClass: string;
  prescriptionRequired: boolean;
  restricted: boolean;
  batches: PharmacyBatch[];
};

export const pharmacyItems: PharmacyItem[] = [
  {
    id: "p1",
    sku: "NPA-500-T10",
    brand: "Napa",
    generic: "Paracetamol",
    manufacturer: "Beximco Pharma",
    dosageForm: "Tablet",
    strength: "500 mg",
    therapeuticClass: "Analgesic / Antipyretic",
    prescriptionRequired: false,
    restricted: false,
    batches: [
      { batchNo: "B240711", mfgDate: "2024-07-01", expiryDate: "2026-06-30", qty: { "DHK-02": 320 }, mrp: 12, status: "near-expiry" },
      { batchNo: "B250214", mfgDate: "2025-02-01", expiryDate: "2027-01-31", qty: { "DHK-02": 1200 }, mrp: 12, status: "ok" },
      { batchNo: "B250901", mfgDate: "2025-09-01", expiryDate: "2027-08-31", qty: { "DHK-02": 800 }, mrp: 13, status: "ok" },
    ],
  },
  {
    id: "p2",
    sku: "SEC-20-C30",
    brand: "Seclo",
    generic: "Omeprazole",
    manufacturer: "Square Pharma",
    dosageForm: "Capsule",
    strength: "20 mg",
    therapeuticClass: "Proton Pump Inhibitor",
    prescriptionRequired: true,
    restricted: false,
    batches: [
      { batchNo: "S230918", mfgDate: "2023-09-01", expiryDate: "2025-08-31", qty: { "DHK-02": 40 }, mrp: 7, status: "expired" },
      { batchNo: "S240612", mfgDate: "2024-06-01", expiryDate: "2026-05-31", qty: { "DHK-02": 280 }, mrp: 7, status: "near-expiry" },
      { batchNo: "S250403", mfgDate: "2025-04-01", expiryDate: "2027-03-31", qty: { "DHK-02": 540 }, mrp: 8, status: "ok" },
    ],
  },
  {
    id: "p3",
    sku: "AMD-5-T28",
    brand: "Amdocal",
    generic: "Amlodipine",
    manufacturer: "Incepta",
    dosageForm: "Tablet",
    strength: "5 mg",
    therapeuticClass: "Antihypertensive",
    prescriptionRequired: true,
    restricted: false,
    batches: [
      { batchNo: "A250120", mfgDate: "2025-01-01", expiryDate: "2027-12-31", qty: { "DHK-02": 460 }, mrp: 4, status: "ok" },
    ],
  },
  {
    id: "p4",
    sku: "TRM-50-T10",
    brand: "Tramadex",
    generic: "Tramadol",
    manufacturer: "Opsonin",
    dosageForm: "Tablet",
    strength: "50 mg",
    therapeuticClass: "Opioid Analgesic",
    prescriptionRequired: true,
    restricted: true,
    batches: [
      { batchNo: "T241108", mfgDate: "2024-11-01", expiryDate: "2026-10-31", qty: { "DHK-02": 90 }, mrp: 18, status: "ok" },
    ],
  },
];

export type GenericProduct = {
  id: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  stock: number;
};

export const genericCatalog: GenericProduct[] = [
  { id: "g1", sku: "WTR-500", name: "Mineral Water 500ml", category: "Beverage", price: 25, stock: 240 },
  { id: "g2", sku: "SNK-CHP-50", name: "Potato Chips 50g", category: "Snacks", price: 35, stock: 180 },
  { id: "g3", sku: "BAT-AA-4", name: "AA Battery (4pk)", category: "Electronics", price: 220, stock: 60 },
  { id: "g4", sku: "TWL-MD", name: "Cotton Hand Towel", category: "Home", price: 480, stock: 32 },
];

// Poisha are shown only when the amount actually has them. Rounding every
// figure to whole taka made the bill disagree with the money collected: a 50
// item plus 10% service and 5% VAT is charged as 57.75, but the total line,
// the Charge button and the receipt all read 58 — a quarter-taka the guest was
// never asked for. Menu prices are whole numbers, so they still render clean.
export const fmtBDT = (n: number) => {
  const amount = Number.isFinite(n) ? n : 0;
  // Guard against 57.750000000000004 printing as "57.75" while a stray
  // fractional cent flips an otherwise-round number into 2dp.
  const hasPoisha = Math.abs(amount - Math.round(amount)) > 0.005;
  return `৳${new Intl.NumberFormat("en-BD", {
    minimumFractionDigits: hasPoisha ? 2 : 0,
    maximumFractionDigits: hasPoisha ? 2 : 0,
  }).format(amount)}`;
};

export const fmtDateTime = (val: string | number | Date | null | undefined): string => {
  if (!val) return "—";
  let d: Date;
  if (typeof val === "string") {
    let clean = val.trim();
    if (clean.includes("T") && !clean.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(clean)) {
      clean += "Z";
    } else if (!clean.includes("T") && /^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}/.test(clean)) {
      clean = clean.replace(" ", "T") + "Z";
    }
    d = new Date(clean);
  } else {
    d = new Date(val);
  }
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString();
};

export const featureFlags = [
  { key: "pos.offline_mode", label: "Offline-first selling", enabled: true, scope: "all stores" },
  { key: "pos.split_tender", label: "Split tender payments", enabled: true, scope: "all stores" },
  { key: "fashion.exchange_workflow", label: "Fashion exchange & alteration", enabled: true, scope: "fashion stores" },
  { key: "fashion.trial_room", label: "Trial-room queue", enabled: false, scope: "DHK-01 pilot" },
  { key: "pharmacy.fefo_block_expired", label: "Block sale of expired batches", enabled: true, scope: "pharmacy stores" },
  { key: "pharmacy.rx_capture_image", label: "Prescription image capture", enabled: true, scope: "pharmacy stores" },
  { key: "pharmacy.restricted_approval", label: "Restricted medicine approval", enabled: true, scope: "pharmacy stores" },
  { key: "core.shift_blind_close", label: "Blind shift close (variance hidden)", enabled: false, scope: "all stores" },
];

export const navSections = [
  {
    label: "Operate",
    items: [
      { to: "/pos", label: "POS Lane", desc: "Cashier sell shell" },
    ],
  },
  {
    label: "Back Office",
    items: [
      { to: "/admin", label: "Overview" },
      { to: "/admin/products", label: "Product master" },
      { to: "/admin/fashion", label: "Fashion pack" },
      { to: "/admin/pharmacy", label: "Pharmacy pack" },
      { to: "/admin/config", label: "Configuration engine" },
    ],
  },
];