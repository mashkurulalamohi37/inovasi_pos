// Industry-specific mock catalog data

export type BeefItem = {
  sku: string;
  name: string;
  category: "Beef" | "Mutton" | "Chicken" | "Fish" | "Sausage" | "Frozen";
  ratePerKg: number;
  batchNo: string;
  expiryDate: string;
  storage: string;
  halalCert?: string;
};

export const beefCatalog: BeefItem[] = [
  {
    sku: "BF-001",
    name: "Premium Beef · Sirloin",
    category: "Beef",
    ratePerKg: 850,
    batchNo: "CS-2026-0612",
    expiryDate: "2026-06-28",
    storage: "Cold-A",
    halalCert: "HAL-8821",
  },
  {
    sku: "BF-002",
    name: "Beef · Boneless Cubes",
    category: "Beef",
    ratePerKg: 780,
    batchNo: "CS-2026-0614",
    expiryDate: "2026-06-27",
    storage: "Cold-A",
    halalCert: "HAL-8821",
  },
  {
    sku: "MT-001",
    name: "Mutton · Leg",
    category: "Mutton",
    ratePerKg: 920,
    batchNo: "CS-2026-0610",
    expiryDate: "2026-06-26",
    storage: "Cold-B",
    halalCert: "HAL-8822",
  },
  {
    sku: "CK-001",
    name: "Broiler Chicken · Whole",
    category: "Chicken",
    ratePerKg: 220,
    batchNo: "CS-2026-0620",
    expiryDate: "2026-06-26",
    storage: "Cold-C",
  },
  {
    sku: "FS-001",
    name: "Hilsa Fish · Medium",
    category: "Fish",
    ratePerKg: 1200,
    batchNo: "CS-2026-0618",
    expiryDate: "2026-06-25",
    storage: "Cold-D",
  },
  {
    sku: "SG-001",
    name: "Beef Sausage · 500g pack",
    category: "Sausage",
    ratePerKg: 650,
    batchNo: "CS-2026-0615",
    expiryDate: "2026-07-05",
    storage: "Cold-A",
  },
  {
    sku: "FR-001",
    name: "Frozen Beef Mince",
    category: "Frozen",
    ratePerKg: 720,
    batchNo: "CS-2026-0601",
    expiryDate: "2026-08-01",
    storage: "Freezer-1",
  },
];

export const butchers = ["Karim", "Rashid", "Salam", "Hafiz"];
export const cutTypes = [
  "Regular cut",
  "Boneless",
  "Minced",
  "Ribs",
  "Steak",
  "Liver",
  "Custom cut",
];

export type GroceryItem = {
  sku: string;
  name: string;
  category: string;
  mrp: number;
  price: number;
  wholesalePrice: number;
  barcode: string;
  shelf: string;
  weightItem: boolean;
  offer?: string;
};

export const groceryCatalog: GroceryItem[] = [
  {
    sku: "GR-001",
    name: "Fresh Milk 1L",
    category: "Dairy",
    mrp: 95,
    price: 90,
    wholesalePrice: 82,
    barcode: "8801001001",
    shelf: "A-12",
    weightItem: false,
    offer: "Buy 2 Save ৳10",
  },
  {
    sku: "GR-002",
    name: "Basmati Rice 5kg",
    category: "Staple",
    mrp: 620,
    price: 599,
    wholesalePrice: 560,
    barcode: "8801001002",
    shelf: "B-04",
    weightItem: false,
  },
  {
    sku: "GR-003",
    name: "Red Apple",
    category: "Produce",
    mrp: 320,
    price: 280,
    wholesalePrice: 240,
    barcode: "8801001003",
    shelf: "C-01",
    weightItem: true,
  },
  {
    sku: "GR-004",
    name: "Potato",
    category: "Produce",
    mrp: 45,
    price: 38,
    wholesalePrice: 32,
    barcode: "8801001004",
    shelf: "C-02",
    weightItem: true,
  },
  {
    sku: "GR-005",
    name: "Lays Chips 25g",
    category: "Snacks",
    mrp: 20,
    price: 18,
    wholesalePrice: 15,
    barcode: "8801001005",
    shelf: "D-08",
    weightItem: false,
    offer: "3 for ৳50",
  },
];

export type RestaurantItem = {
  sku: string;
  name: string;
  category: string;
  price: number;
  station: string;
  image?: string;
  modifiers?: string[];
};

export const restaurantMenu: RestaurantItem[] = [
  // 1. Appetizer (এপিটাইজার)
  {
    sku: "EM-APP-01",
    name: "Luchi (Per Pc) / লুচি",
    category: "Appetizer",
    price: 10,
    station: "Kitchen",
    image: "/food-images/EM-APP-01.jpg",
  },
  {
    sku: "EM-APP-02",
    name: "Chola Batora / ছোলা বাটোরা",
    category: "Appetizer",
    price: 60,
    station: "Kitchen",
    image: "/food-images/EM-APP-02.jpg",
  },
  {
    sku: "EM-APP-03",
    name: "Chicken Jhal Fry / চিকেন ঝাল ফ্রাই",
    category: "Appetizer",
    price: 80,
    station: "Kitchen",
    image: "/food-images/EM-APP-03.jpg",
  },
  {
    sku: "EM-APP-04",
    name: "Chicken Chaap / চিকেন চাপ",
    category: "Appetizer",
    price: 130,
    station: "Grill",
    image: "/food-images/EM-APP-04.jpg",
  },
  {
    sku: "EM-APP-05",
    name: "Haleem / হালিম",
    category: "Appetizer",
    price: 80,
    station: "Kitchen",
    image: "/food-images/EM-APP-05.jpg",
  },
  {
    sku: "EM-APP-06",
    name: "Chicken Soup / চিকেন স্যুপ",
    category: "Appetizer",
    price: 50,
    station: "Kitchen",
    image: "/food-images/EM-APP-06.jpg",
  },
  {
    sku: "EM-APP-07",
    name: "Chicken Steak / চিকেন স্টেক",
    category: "Appetizer",
    price: 200,
    station: "Grill",
    image: "/food-images/EM-APP-07.jpg",
  },

  // 2. Fried Rice & Combos (ফ্রাইড রাইস)
  {
    sku: "EM-RICE-01",
    name: "Student Special (Rice, Veg, Chicken 2pcs)",
    category: "Fried Rice",
    price: 60,
    station: "Kitchen",
    image: "/food-images/EM-RICE-01.jpg",
  },
  {
    sku: "EM-RICE-02",
    name: "Regular Combo (Rice, Veg, Chicken 2pcs)",
    category: "Fried Rice",
    price: 120,
    station: "Kitchen",
    image: "/food-images/EM-RICE-02.jpg",
  },
  {
    sku: "EM-RICE-03",
    name: "Superior Combo (Rice, Veg, Chicken 2pcs, Chili)",
    category: "Fried Rice",
    price: 180,
    station: "Kitchen",
    image: "/food-images/EM-RICE-03.jpg",
  },

  // 3. Sandwich (স্য্যান্ডউইচ)
  {
    sku: "EM-SW-01",
    name: "Egg Sandwich (Student Special)",
    category: "Sandwich",
    price: 30,
    station: "Kitchen",
    image: "/food-images/EM-SW-01.jpg",
  },
  {
    sku: "EM-SW-02",
    name: "Chicken Sandwich",
    category: "Sandwich",
    price: 50,
    station: "Kitchen",
    image: "/food-images/EM-SW-02.jpg",
  },
  {
    sku: "EM-SW-03",
    name: "Club Sandwich",
    category: "Sandwich",
    price: 70,
    station: "Kitchen",
    image: "/food-images/EM-SW-03.jpg",
  },
  {
    sku: "EM-SW-04",
    name: "Cheese Sandwich",
    category: "Sandwich",
    price: 70,
    station: "Kitchen",
    image: "/food-images/EM-SW-04.jpg",
  },
  {
    sku: "EM-SW-05",
    name: "Sub Sandwich",
    category: "Sandwich",
    price: 120,
    station: "Kitchen",
    image: "/food-images/EM-SW-05.jpg",
  },

  // 4. Burger (বার্গার)
  {
    sku: "EM-BGR-01",
    name: "Chicken Burger",
    category: "Burger",
    price: 70,
    station: "Grill",
    image: "/food-images/EM-BGR-01.jpg",
  },
  {
    sku: "EM-BGR-02",
    name: "Mini Burger Combo",
    category: "Burger",
    price: 50,
    station: "Grill",
    image: "/food-images/EM-BGR-02.jpg",
  },
  {
    sku: "EM-BGR-03",
    name: "Cheese Burger",
    category: "Burger",
    price: 100,
    station: "Grill",
    image: "/food-images/EM-BGR-03.jpg",
  },

  // 5. Meat Box (মিট বক্স)
  {
    sku: "EM-BOX-01",
    name: "Mini Meat Box (Student Special)",
    category: "Meat Box",
    price: 50,
    station: "Kitchen",
    image: "/food-images/EM-BOX-01.jpg",
  },
  {
    sku: "EM-BOX-02",
    name: "Medium Meat Box",
    category: "Meat Box",
    price: 100,
    station: "Kitchen",
    image: "/food-images/EM-BOX-02.jpg",
  },
  {
    sku: "EM-BOX-03",
    name: "Large Meat Box",
    category: "Meat Box",
    price: 150,
    station: "Kitchen",
    image: "/food-images/EM-BOX-03.jpg",
  },

  // 6. Pasta (পাস্তা)
  {
    sku: "EM-PST-01",
    name: "Student Special Pasta",
    category: "Pasta",
    price: 50,
    station: "Kitchen",
    image: "/food-images/EM-PST-01.jpg",
  },
  {
    sku: "EM-PST-02",
    name: "Regular Pasta",
    category: "Pasta",
    price: 80,
    station: "Kitchen",
    image: "/food-images/EM-PST-02.jpg",
  },

  // 7. French Fries (ফ্রেঞ্চ ফ্রাই)
  {
    sku: "EM-FF-01",
    name: "French Fries (Student Special)",
    category: "French Fries",
    price: 30,
    station: "Kitchen",
    image: "/food-images/EM-FF-01.jpg",
  },
  {
    sku: "EM-FF-02",
    name: "Regular French Fries",
    category: "French Fries",
    price: 50,
    station: "Kitchen",
    image: "/food-images/EM-FF-02.jpg",
  },

  // 8. Fried Chicken (ফ্রাইড চিকেন)
  {
    sku: "EM-FC-01",
    name: "Chicken Fry (Leg / Roast pc)",
    category: "Fried Chicken",
    price: 99,
    station: "Kitchen",
    image: "/food-images/EM-FC-01.jpg",
  },
  {
    sku: "EM-FC-02",
    name: "Chicken Combo (2pcs Mixed)",
    category: "Fried Chicken",
    price: 189,
    station: "Kitchen",
    image: "/food-images/EM-FC-02.jpg",
  },
  {
    sku: "EM-FC-03",
    name: "Chicken Bucket (5pcs)",
    category: "Fried Chicken",
    price: 449,
    station: "Kitchen",
    image: "/food-images/EM-FC-03.jpg",
  },
  {
    sku: "EM-FC-04",
    name: "Chicken Bucket (10pcs)",
    category: "Fried Chicken",
    price: 799,
    station: "Kitchen",
    image: "/food-images/EM-FC-04.jpg",
  },
  {
    sku: "EM-FC-05",
    name: "Hot Wings (Spicy 2pcs)",
    category: "Fried Chicken",
    price: 50,
    station: "Kitchen",
    image: "/food-images/EM-FC-05.jpg",
  },
  {
    sku: "EM-FC-06",
    name: "Crispy Chicken Fry",
    category: "Fried Chicken",
    price: 110,
    station: "Kitchen",
    image: "/food-images/EM-FC-06.jpg",
  },

  // 9. Other Items (অন্যান্য আইটেম)
  {
    sku: "EM-OTH-01",
    name: "Chicken Ball Fry",
    category: "Other Items",
    price: 40,
    station: "Kitchen",
    image: "/food-images/EM-OTH-01.jpg",
  },
  {
    sku: "EM-OTH-02",
    name: "Chicken Chop",
    category: "Other Items",
    price: 120,
    station: "Kitchen",
    image: "/food-images/EM-OTH-02.jpg",
  },
  {
    sku: "EM-OTH-03",
    name: "Nati Combo / রোল",
    category: "Other Items",
    price: 50,
    station: "Kitchen",
    image: "/food-images/EM-OTH-03.jpg",
  },
  {
    sku: "EM-OTH-04",
    name: "Dry Cake (4 Pcs)",
    category: "Other Items",
    price: 50,
    station: "Kitchen",
    image: "/food-images/EM-OTH-04.jpg",
  },
  {
    sku: "EM-OTH-05",
    name: "Cola BBQ Chicken",
    category: "Other Items",
    price: 60,
    station: "Grill",
    image: "/food-images/EM-OTH-05.jpg",
  },

  // 10. Drinks & Cold Beverages (ড্রিংকস)
  {
    sku: "EM-DRK-01",
    name: "Mineral Water (250ml)",
    category: "Beverages",
    price: 20,
    station: "Bar",
    image: "/food-images/EM-DRK-01.jpg",
  },
  {
    sku: "EM-DRK-02",
    name: "Cold Drinks / Soda",
    category: "Beverages",
    price: 30,
    station: "Bar",
    image: "/food-images/EM-DRK-02.jpg",
  },
];

export const restaurantTables = [
  { id: "T-01", seats: 4, status: "free" as const, waiter: "" },
  { id: "T-02", seats: 2, status: "occupied" as const, waiter: "Rahim" },
  { id: "T-03", seats: 6, status: "occupied" as const, waiter: "Sadia" },
  { id: "T-04", seats: 4, status: "billing" as const, waiter: "Rahim" },
  { id: "T-05", seats: 8, status: "free" as const, waiter: "" },
  { id: "T-06", seats: 2, status: "reserved" as const, waiter: "" },
];

export const waiters = ["Rahim", "Sadia", "Imran", "Nusrat"];

export type JewelryItem = {
  sku: string;
  name: string;
  metal: "Gold" | "Silver" | "Platinum";
  karat: number;
  grossWeight: number;
  netWeight: number;
  stoneWeight: number;
  makingChargePerGram: number;
  certificate?: string;
};

export const jewelryCatalog: JewelryItem[] = [
  {
    sku: "JW-001",
    name: "22K Gold Chain",
    metal: "Gold",
    karat: 22,
    grossWeight: 12.4,
    netWeight: 11.8,
    stoneWeight: 0,
    makingChargePerGram: 850,
    certificate: "CERT-JW-8821",
  },
  {
    sku: "JW-002",
    name: "Diamond Ring · 18K White Gold",
    metal: "Gold",
    karat: 18,
    grossWeight: 5.2,
    netWeight: 4.6,
    stoneWeight: 0.4,
    makingChargePerGram: 1200,
    certificate: "CERT-JW-8822",
  },
  {
    sku: "JW-003",
    name: "Silver Bangle Pair · 925",
    metal: "Silver",
    karat: 925,
    grossWeight: 28,
    netWeight: 27.5,
    stoneWeight: 0,
    makingChargePerGram: 120,
  },
  {
    sku: "JW-004",
    name: "22K Bridal Har Necklace",
    metal: "Gold",
    karat: 22,
    grossWeight: 42.5,
    netWeight: 39.0,
    stoneWeight: 3.5,
    makingChargePerGram: 950,
    certificate: "CERT-JW-8824",
  },
  {
    sku: "JW-005",
    name: "22K Gold Kulla Bangle Set (4 Pcs)",
    metal: "Gold",
    karat: 22,
    grossWeight: 36.0,
    netWeight: 36.0,
    stoneWeight: 0,
    makingChargePerGram: 800,
    certificate: "CERT-JW-8825",
  },
  {
    sku: "JW-006",
    name: "Platinum Solitaire Engagement Ring",
    metal: "Platinum",
    karat: 950,
    grossWeight: 6.8,
    netWeight: 6.1,
    stoneWeight: 0.7,
    makingChargePerGram: 1800,
    certificate: "CERT-JW-8826",
  },
  {
    sku: "JW-007",
    name: "21K Gold Earring Tops",
    metal: "Gold",
    karat: 21,
    grossWeight: 4.5,
    netWeight: 4.2,
    stoneWeight: 0.3,
    makingChargePerGram: 750,
    certificate: "CERT-JW-8827",
  },
  {
    sku: "JW-008",
    name: "22K Gold Jhumka Earrings",
    metal: "Gold",
    karat: 22,
    grossWeight: 15.2,
    netWeight: 13.8,
    stoneWeight: 1.4,
    makingChargePerGram: 1100,
    certificate: "CERT-JW-8828",
  },
  {
    sku: "JW-009",
    name: "18K Rose Gold Diamond Pendant",
    metal: "Gold",
    karat: 18,
    grossWeight: 3.9,
    netWeight: 3.3,
    stoneWeight: 0.6,
    makingChargePerGram: 1400,
    certificate: "CERT-JW-8829",
  },
  {
    sku: "JW-010",
    name: "22K Gold Pearl Drop Necklace",
    metal: "Gold",
    karat: 22,
    grossWeight: 24.5,
    netWeight: 19.0,
    stoneWeight: 5.5,
    makingChargePerGram: 900,
    certificate: "CERT-JW-8830",
  },
  {
    sku: "JW-011",
    name: "22K Heavy Mens Gold Bracelet",
    metal: "Gold",
    karat: 22,
    grossWeight: 26.5,
    netWeight: 26.5,
    stoneWeight: 0,
    makingChargePerGram: 750,
    certificate: "CERT-JW-8831",
  },
  {
    sku: "JW-012",
    name: "925 Silver Payal / Anklet Pair",
    metal: "Silver",
    karat: 925,
    grossWeight: 22.0,
    netWeight: 22.0,
    stoneWeight: 0,
    makingChargePerGram: 100,
  },
  {
    sku: "JW-013",
    name: "22K Crown Tiara Gold Ring",
    metal: "Gold",
    karat: 22,
    grossWeight: 6.5,
    netWeight: 6.0,
    stoneWeight: 0.5,
    makingChargePerGram: 1250,
    certificate: "CERT-JW-8833",
  },
  {
    sku: "JW-014",
    name: "18K Yellow Gold Emerald Ring",
    metal: "Gold",
    karat: 18,
    grossWeight: 7.4,
    netWeight: 6.1,
    stoneWeight: 1.3,
    makingChargePerGram: 1500,
    certificate: "CERT-JW-8834",
  },
  {
    sku: "JW-015",
    name: "22K Gold Mangalsutra Pendant",
    metal: "Gold",
    karat: 22,
    grossWeight: 10.8,
    netWeight: 9.5,
    stoneWeight: 1.3,
    makingChargePerGram: 850,
    certificate: "CERT-JW-8835",
  },
  {
    sku: "JW-016",
    name: "22K Gold Nose Pin / Noth",
    metal: "Gold",
    karat: 22,
    grossWeight: 1.4,
    netWeight: 1.2,
    stoneWeight: 0.2,
    makingChargePerGram: 500,
  },
  {
    sku: "JW-017",
    name: "Platinum Mens Wedding Band",
    metal: "Platinum",
    karat: 950,
    grossWeight: 8.6,
    netWeight: 8.6,
    stoneWeight: 0,
    makingChargePerGram: 1600,
    certificate: "CERT-JW-8837",
  },
  {
    sku: "JW-018",
    name: "22K Royal Choker Necklace",
    metal: "Gold",
    karat: 22,
    grossWeight: 38.5,
    netWeight: 35.8,
    stoneWeight: 2.7,
    makingChargePerGram: 1050,
    certificate: "CERT-JW-8838",
  },
  {
    sku: "JW-019",
    name: "18K Blue Sapphire Earrings",
    metal: "Gold",
    karat: 18,
    grossWeight: 8.8,
    netWeight: 7.2,
    stoneWeight: 1.6,
    makingChargePerGram: 1650,
    certificate: "CERT-JW-8839",
  },
  {
    sku: "JW-020",
    name: "22K Stamped Gold Coin (5g)",
    metal: "Gold",
    karat: 22,
    grossWeight: 5.0,
    netWeight: 5.0,
    stoneWeight: 0,
    makingChargePerGram: 400,
    certificate: "CERT-JW-8840",
  },
];

export type ElectronicsItem = {
  sku: string;
  name: string;
  brand: string;
  model: string;
  price: number;
  warrantyMonths: number;
  serialized: boolean;
  inStock: number;
};

export const electronicsCatalog: ElectronicsItem[] = [
  {
    sku: "EL-001",
    name: "Galaxy A55 5G",
    brand: "Samsung",
    model: "SM-A556",
    price: 42990,
    warrantyMonths: 12,
    serialized: true,
    inStock: 8,
  },
  {
    sku: "EL-002",
    name: "Redmi Note 13 Pro",
    brand: "Xiaomi",
    model: "2312DRA50G",
    price: 28999,
    warrantyMonths: 12,
    serialized: true,
    inStock: 14,
  },
  {
    sku: "EL-003",
    name: "USB-C Hub 7-in-1",
    brand: "Anker",
    model: "A8346",
    price: 3200,
    warrantyMonths: 18,
    serialized: false,
    inStock: 32,
  },
  {
    sku: "EL-004",
    name: '55" 4K Smart TV',
    brand: "Sony",
    model: "KD-55X80L",
    price: 89900,
    warrantyMonths: 24,
    serialized: true,
    inStock: 3,
  },
  {
    sku: "EL-005",
    name: "iPhone 15 Pro 128GB",
    brand: "Apple",
    model: "A3102",
    price: 139900,
    warrantyMonths: 12,
    serialized: true,
    inStock: 5,
  },
  {
    sku: "EL-006",
    name: 'MacBook Air M3 15"',
    brand: "Apple",
    model: "MXD13",
    price: 178000,
    warrantyMonths: 12,
    serialized: true,
    inStock: 4,
  },
  {
    sku: "EL-007",
    name: "WH-1000XM5 Headphones",
    brand: "Sony",
    model: "WH1000XM5",
    price: 36500,
    warrantyMonths: 12,
    serialized: true,
    inStock: 10,
  },
  {
    sku: "EL-008",
    name: "Inverter AC 1.5 Ton",
    brand: "Gree",
    model: "GS-18XLM32",
    price: 64500,
    warrantyMonths: 36,
    serialized: true,
    inStock: 6,
  },
  {
    sku: "EL-009",
    name: "Direct Cool Refrigerator 252L",
    brand: "Walton",
    model: "WFD-2E2",
    price: 41900,
    warrantyMonths: 120,
    serialized: true,
    inStock: 7,
  },
  {
    sku: "EL-010",
    name: "Front Load Washing Machine 8kg",
    brand: "LG",
    model: "FHV1208Z4W",
    price: 58900,
    warrantyMonths: 24,
    serialized: true,
    inStock: 5,
  },
  {
    sku: "EL-011",
    name: "Mechanical Gaming Keyboard",
    brand: "Keychron",
    model: "K2-V2",
    price: 8500,
    warrantyMonths: 12,
    serialized: false,
    inStock: 18,
  },
  {
    sku: "EL-012",
    name: "Wireless Ergonomic Mouse",
    brand: "Logitech",
    model: "MX Master 3S",
    price: 11500,
    warrantyMonths: 12,
    serialized: false,
    inStock: 22,
  },
  {
    sku: "EL-013",
    name: '27" 4K IPS Monitor',
    brand: "Dell",
    model: "U2723QE",
    price: 54900,
    warrantyMonths: 36,
    serialized: true,
    inStock: 6,
  },
  {
    sku: "EL-014",
    name: "Wi-Fi 6 Mesh Router System",
    brand: "TP-Link",
    model: "Deco X50 (2-Pack)",
    price: 14500,
    warrantyMonths: 24,
    serialized: true,
    inStock: 12,
  },
  {
    sku: "EL-015",
    name: "Soundbar 3.1ch with Subwoofer",
    brand: "JBL",
    model: "Cinema SB550",
    price: 27500,
    warrantyMonths: 12,
    serialized: true,
    inStock: 9,
  },
  {
    sku: "EL-016",
    name: "Smartwatch Series 9 45mm",
    brand: "Apple",
    model: "MR993",
    price: 52000,
    warrantyMonths: 12,
    serialized: true,
    inStock: 8,
  },
  {
    sku: "EL-017",
    name: "20000mAh Fast Power Bank",
    brand: "Baseus",
    model: "PPBD050301",
    price: 2400,
    warrantyMonths: 6,
    serialized: false,
    inStock: 40,
  },
  {
    sku: "EL-018",
    name: "Portable Bluetooth Speaker",
    brand: "JBL",
    model: "Charge 5",
    price: 16800,
    warrantyMonths: 12,
    serialized: true,
    inStock: 15,
  },
  {
    sku: "EL-019",
    name: "Mirrorless Camera 24.2MP",
    brand: "Canon",
    model: "EOS R8",
    price: 148500,
    warrantyMonths: 24,
    serialized: true,
    inStock: 3,
  },
  {
    sku: "EL-020",
    name: "Microwave Oven 23L Grill",
    brand: "Samsung",
    model: "MG23T5018AK",
    price: 14900,
    warrantyMonths: 12,
    serialized: true,
    inStock: 11,
  },
];

export const beefWastageLog = [
  {
    id: "w1",
    date: "2026-06-25",
    sku: "BF-001",
    qty: 0.8,
    reason: "Trim",
    butcher: "Karim",
    value: 680,
  },
  {
    id: "w2",
    date: "2026-06-24",
    sku: "CK-001",
    qty: 1.2,
    reason: "Spoilage",
    butcher: "Salam",
    value: 264,
  },
];

export const beefBatches = beefCatalog.map((b) => ({
  batchNo: b.batchNo,
  item: b.name,
  qtyKg: Math.round(Math.random() * 40 + 10),
  expiryDate: b.expiryDate,
  storage: b.storage,
}));

export const kotOrders = [
  { id: "KOT-1042", table: "T-02", items: 3, status: "preparing", waiter: "Rahim", ts: "14:22" },
  { id: "KOT-1043", table: "T-03", items: 5, status: "ready", waiter: "Sadia", ts: "14:28" },
  { id: "KOT-1044", table: "T-04", items: 2, status: "served", waiter: "Rahim", ts: "14:35" },
];

export const alterationOrders = [
  {
    id: "ALT-021",
    customer: "Nabila C.",
    item: "Oxford Shirt · M",
    task: "Sleeve shorten",
    due: "2026-06-27",
    status: "in-progress",
  },
  {
    id: "ALT-022",
    customer: "Walk-in",
    item: "Kurta · L",
    task: "Hem adjust",
    due: "2026-06-26",
    status: "ready",
  },
];

export const jewelryCertificates = [
  {
    id: "CERT-JW-8821",
    item: "22K Gold Chain",
    customer: "Ayesha K.",
    date: "2026-06-20",
    valid: true,
  },
  {
    id: "CERT-JW-8822",
    item: "Diamond Ring",
    customer: "Rifat H.",
    date: "2026-06-22",
    valid: true,
  },
];

export type JewelryProfileMock = {
  id: string;
  sku: string;
  name: string;
  metal: string;
  karat: string;
  grossWeight: number;
  netWeight: number;
  stoneWeight: number;
  makingCharge: number;
  wastagePct: number;
  stoneValue: number;
  certificate_no?: string;
};

export const jewelryProfilesMock: JewelryProfileMock[] = [
  {
    id: "prof-1",
    sku: "JW-001",
    name: "22K Gold Bangle Set",
    metal: "Gold",
    karat: "22K",
    grossWeight: 14.5,
    netWeight: 14.2,
    stoneWeight: 0.3,
    makingCharge: 650,
    wastagePct: 2.5,
    stoneValue: 1500,
    certificate_no: "CERT-JW-8821",
  },
  {
    id: "prof-2",
    sku: "JW-002",
    name: "18K Diamond Solitaire Ring",
    metal: "Gold",
    karat: "18K",
    grossWeight: 4.8,
    netWeight: 4.2,
    stoneWeight: 0.6,
    makingCharge: 1200,
    wastagePct: 1.5,
    stoneValue: 45000,
    certificate_no: "CERT-JW-8822",
  },
  {
    id: "prof-3",
    sku: "JW-003",
    name: "21K Traditional Necklace",
    metal: "Gold",
    karat: "21K",
    grossWeight: 22.0,
    netWeight: 21.8,
    stoneWeight: 0.2,
    makingCharge: 700,
    wastagePct: 3.0,
    stoneValue: 2000,
    certificate_no: "CERT-JW-8825",
  },
  {
    id: "prof-4",
    sku: "JW-004",
    name: "925 Silver Bracelet",
    metal: "Silver",
    karat: "925",
    grossWeight: 18.0,
    netWeight: 18.0,
    stoneWeight: 0.0,
    makingCharge: 150,
    wastagePct: 0.0,
    stoneValue: 0,
  },
];

export type JewelryBuybackMock = {
  id: string;
  buyback_no: string;
  customer_name: string;
  metal_type: string;
  karat: string;
  gross_weight: number;
  net_weight: number;
  offered_rate: number;
  purity_deduction_pct: number;
  final_amount: number;
  status: "draft" | "assessed" | "approved" | "settled" | "cancelled";
  created_at: string;
};

export const jewelryBuybackMock: JewelryBuybackMock[] = [
  {
    id: "bb-1",
    buyback_no: "BB-000001",
    customer_name: "Tanvir A.",
    metal_type: "Gold",
    karat: "22K",
    gross_weight: 11.66,
    net_weight: 11.2,
    offered_rate: 11200,
    purity_deduction_pct: 3,
    final_amount: 121650,
    status: "settled",
    created_at: "2026-08-01",
  },
  {
    id: "bb-2",
    buyback_no: "BB-000002",
    customer_name: "Nabila H.",
    metal_type: "Gold",
    karat: "21K",
    gross_weight: 8.5,
    net_weight: 8.1,
    offered_rate: 10800,
    purity_deduction_pct: 4,
    final_amount: 83980,
    status: "approved",
    created_at: "2026-08-05",
  },
  {
    id: "bb-3",
    buyback_no: "BB-000003",
    customer_name: "Rafiq M.",
    metal_type: "Gold",
    karat: "18K",
    gross_weight: 5.2,
    net_weight: 4.9,
    offered_rate: 9200,
    purity_deduction_pct: 5,
    final_amount: 42826,
    status: "assessed",
    created_at: "2026-08-09",
  },
];

/** Subscribers re-render when the shared demo buyback list changes. */
const buybackListeners = new Set<() => void>();

export function subscribeDemoBuybacks(fn: () => void): () => void {
  buybackListeners.add(fn);
  return () => buybackListeners.delete(fn);
}

export function getDemoBuybacks(): JewelryBuybackMock[] {
  return jewelryBuybackMock;
}

/**
 * Single entry point for adding a demo buyback.
 *
 * Both the POS trade-in and the buyback back office used to append to their own
 * copy of this list and mint `BB-…` numbers from their own length, so the two
 * surfaces disagreed and reissued the same number. Numbering here is derived
 * from the highest existing number, matching what the backend does.
 */
export function addDemoBuyback(
  entry: Omit<JewelryBuybackMock, "id" | "buyback_no" | "created_at"> &
    Partial<Pick<JewelryBuybackMock, "created_at">>,
): JewelryBuybackMock {
  const highest = jewelryBuybackMock.reduce((max, b) => {
    const n = Number(String(b.buyback_no).split("-").pop());
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  const created: JewelryBuybackMock = {
    ...entry,
    id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    buyback_no: `BB-${String(highest + 1).padStart(6, "0")}`,
    created_at: entry.created_at ?? new Date().toISOString().slice(0, 10),
  };
  jewelryBuybackMock.unshift(created);
  buybackListeners.forEach((fn) => fn());
  return created;
}

/** Status change for a demo buyback, mirrored to every subscribed surface. */
export function updateDemoBuybackStatus(id: string, status: JewelryBuybackMock["status"]): void {
  const row = jewelryBuybackMock.find((b) => b.id === id);
  if (!row) return;
  row.status = status;
  buybackListeners.forEach((fn) => fn());
}

export const electronicsSerials = [
  { serial: "SN-A556-00142", sku: "EL-001", status: "in-stock", warrantyUntil: "2027-06-25" },
  { serial: "IMEI-556789012345", sku: "EL-001", status: "sold", warrantyUntil: "2027-06-20" },
  { serial: "SN-TV-88001", sku: "EL-004", status: "in-stock", warrantyUntil: "2028-06-01" },
];

export const warrantyRegistrations = [
  {
    id: "WR-001",
    serial: "IMEI-556789012345",
    customer: "Tanvir A.",
    product: "Galaxy A55",
    registered: "2026-06-20",
    expires: "2027-06-20",
  },
];

// --- Electronics-only: AMC mock data ---
export type AmcContract = {
  id: string;
  amc_no: string;
  serial_imei: string;
  customer_name: string;
  product_name: string;
  start_date: string;
  end_date: string;
  amount: number;
  status: "active" | "expired" | "pending_renewal" | "cancelled";
  terms?: string;
};

export const amcContracts: AmcContract[] = [
  {
    id: "amc-1",
    amc_no: "AMC-000001",
    serial_imei: "IMEI-556789012345",
    customer_name: "Tanvir A.",
    product_name: "Galaxy A55 5G",
    start_date: "2026-06-20",
    end_date: "2027-06-20",
    amount: 3500,
    status: "active",
    terms: "Software + hardware support, 2 visits/yr",
  },
  {
    id: "amc-2",
    amc_no: "AMC-000002",
    serial_imei: "SN-TV-88001",
    customer_name: "Ayesha K.",
    product_name: '55" Smart TV',
    start_date: "2026-04-01",
    end_date: "2028-04-01",
    amount: 8000,
    status: "active",
    terms: "Panel & remote coverage",
  },
  {
    id: "amc-3",
    amc_no: "AMC-000003",
    serial_imei: "SN-A55-00301",
    customer_name: "Rafiq B.",
    product_name: "Galaxy A55 5G",
    start_date: "2025-05-01",
    end_date: "2026-05-01",
    amount: 3000,
    status: "expired",
  },
  {
    id: "amc-4",
    amc_no: "AMC-000004",
    serial_imei: "SN-NOTE13-0082",
    customer_name: "Nadia H.",
    product_name: "Redmi Note 13",
    start_date: "2026-07-10",
    end_date: "2027-07-10",
    amount: 2500,
    status: "active",
  },
  {
    id: "amc-5",
    amc_no: "AMC-000005",
    serial_imei: "SN-TV-91003",
    customer_name: "Karim M.",
    product_name: '55" Smart TV',
    start_date: "2026-06-01",
    end_date: "2027-06-01",
    amount: 7500,
    status: "pending_renewal",
  },
];

// --- Electronics-only: EMI plans (bank/financier catalog) ---
export const emiPlans = [
  { id: "emi-plan-1", name: "bKash EMI", tenures: [3, 6, 12], interestRate: 0, processingFee: 0 },
  {
    id: "emi-plan-2",
    name: "City Bank 0% EMI",
    tenures: [3, 6, 12, 18, 24],
    interestRate: 0,
    processingFee: 300,
  },
  {
    id: "emi-plan-3",
    name: "DBBL Nexus EMI",
    tenures: [3, 6, 12],
    interestRate: 1.5,
    processingFee: 200,
  },
  {
    id: "emi-plan-4",
    name: "Dutch-Bangla Bank",
    tenures: [6, 12, 18],
    interestRate: 0,
    processingFee: 250,
  },
  {
    id: "emi-plan-5",
    name: "Custom Financier",
    tenures: [3, 6, 12, 18, 24],
    interestRate: 0,
    processingFee: 0,
  },
] as const;

// --- Electronics-only: EMI schedules (demo agreements) ---
export type EmiInstallment = {
  id: string;
  installment_no: number;
  due_date: string;
  amount: number;
  status: "pending" | "paid" | "overdue" | "waived";
  paid_date?: string;
  paid_amount?: number;
  payment_method?: string;
};

export type EmiSchedule = {
  id: string;
  emi_no: string;
  customer_name: string;
  customer_phone?: string;
  product_name: string;
  serial_imei?: string;
  bank_financier: string;
  tenure_months: number;
  principal_amount: number;
  down_payment: number;
  processing_fee: number;
  interest_rate: number;
  monthly_amount: number;
  total_payable: number;
  total_collected: number;
  status: "active" | "completed" | "overdue" | "defaulted" | "cancelled";
  first_due_date: string;
  invoice_number?: string;
  installments: EmiInstallment[];
};

function makeInstallments(
  emiId: string,
  tenure: number,
  monthly: number,
  firstDue: string,
  paidCount: number,
): EmiInstallment[] {
  const first = new Date(firstDue);
  return Array.from({ length: tenure }, (_, i) => {
    const due = new Date(first);
    due.setMonth(due.getMonth() + i);
    const isPaid = i < paidCount;
    const isOverdue = !isPaid && i === paidCount && due < new Date("2026-08-10");
    return {
      id: `${emiId}-inst-${i + 1}`,
      installment_no: i + 1,
      due_date: due.toISOString().slice(0, 10),
      amount: monthly,
      status: isPaid ? "paid" : isOverdue ? "overdue" : "pending",
      ...(isPaid
        ? {
            paid_date: due.toISOString().slice(0, 10),
            paid_amount: monthly,
            payment_method: "cash",
          }
        : {}),
    };
  });
}

export const emiSchedules: EmiSchedule[] = [
  {
    id: "emi-1",
    emi_no: "EMI-000001",
    customer_name: "Tanvir A.",
    customer_phone: "01812345678",
    product_name: "Galaxy A55 5G",
    serial_imei: "IMEI-556789012345",
    bank_financier: "City Bank 0% EMI",
    tenure_months: 12,
    principal_amount: 42990,
    down_payment: 5000,
    processing_fee: 300,
    interest_rate: 0,
    monthly_amount: 3191,
    total_payable: 38290,
    total_collected: 12764,
    status: "active",
    first_due_date: "2026-02-20",
    invoice_number: "INV-001234",
    installments: makeInstallments("emi-1", 12, 3191, "2026-02-20", 4),
  },
  {
    id: "emi-2",
    emi_no: "EMI-000002",
    customer_name: "Ayesha K.",
    product_name: '55" Smart TV',
    serial_imei: "SN-TV-88001",
    bank_financier: "DBBL Nexus EMI",
    tenure_months: 6,
    principal_amount: 89900,
    down_payment: 20000,
    processing_fee: 200,
    interest_rate: 1.5,
    monthly_amount: 11985,
    total_payable: 72100,
    total_collected: 23970,
    status: "active",
    first_due_date: "2026-05-10",
    invoice_number: "INV-001180",
    installments: makeInstallments("emi-2", 6, 11985, "2026-05-10", 2),
  },
  {
    id: "emi-3",
    emi_no: "EMI-000003",
    customer_name: "Rafiq B.",
    product_name: "Redmi Note 13",
    serial_imei: "SN-NOTE13-0082",
    bank_financier: "bKash EMI",
    tenure_months: 3,
    principal_amount: 24999,
    down_payment: 5000,
    processing_fee: 0,
    interest_rate: 0,
    monthly_amount: 6666,
    total_payable: 19999,
    total_collected: 19998,
    status: "completed",
    first_due_date: "2026-04-01",
    invoice_number: "INV-001155",
    installments: makeInstallments("emi-3", 3, 6666, "2026-04-01", 3),
  },
];

// —— Bangladesh retail packs ——

export type BookstoreItem = {
  sku: string;
  name: string;
  price: number;
  isbn: string;
  author: string;
  publisher: string;
  board: "NCTB" | "Dhaka Board" | "General" | "Madrasah";
  classLevel: string;
  language: "Bangla" | "English" | "Arabic";
  academicYear: string;
};

export const bookstoreCatalog: BookstoreItem[] = [
  {
    sku: "BK-001",
    name: "Physics · Class 10 · NCTB",
    price: 320,
    isbn: "9789843398765",
    author: "NCTB",
    publisher: "NCTB",
    board: "NCTB",
    classLevel: "10",
    language: "Bangla",
    academicYear: "2026",
  },
  {
    sku: "BK-002",
    name: "Higher Math · HSC · NCTB",
    price: 450,
    isbn: "9789843398826",
    author: "NCTB",
    publisher: "NCTB",
    board: "NCTB",
    classLevel: "12",
    language: "Bangla",
    academicYear: "2026",
  },
  {
    sku: "BK-003",
    name: "English For Today · Class 9",
    price: 280,
    isbn: "9789843398901",
    author: "NCTB",
    publisher: "NCTB",
    board: "NCTB",
    classLevel: "9",
    language: "English",
    academicYear: "2026",
  },
  {
    sku: "BK-004",
    name: "হুমায়ূন আহমেদ · দীপু",
    price: 350,
    isbn: "9789845020123",
    author: "হুমায়ূন আহমেদ",
    publisher: "অন্য প্রকাশনী",
    board: "General",
    classLevel: "—",
    language: "Bangla",
    academicYear: "2026",
  },
  {
    sku: "BK-005",
    name: "Islamiat · Dakhil · Madrasah",
    price: 220,
    isbn: "9789843399012",
    author: "BMEB",
    publisher: "Madrasah Board",
    board: "Madrasah",
    classLevel: "10",
    language: "Arabic",
    academicYear: "2026",
  },
];

export type SalonItem = {
  sku: string;
  name: string;
  price: number;
  type: "service" | "product";
  durationMins?: number;
  gender: "Men" | "Women" | "Unisex";
  category: string;
};

export const salonCatalog: SalonItem[] = [
  {
    sku: "SL-001",
    name: "Haircut · Men",
    price: 200,
    type: "service",
    durationMins: 25,
    gender: "Men",
    category: "Hair",
  },
  {
    sku: "SL-002",
    name: "Facial · Gold",
    price: 1200,
    type: "service",
    durationMins: 45,
    gender: "Women",
    category: "Skin",
  },
  {
    sku: "SL-003",
    name: "Bridal Package · Full",
    price: 15000,
    type: "service",
    durationMins: 180,
    gender: "Women",
    category: "Bridal",
  },
  {
    sku: "SL-004",
    name: "Hair Color · L'Oreal",
    price: 2500,
    type: "service",
    durationMins: 90,
    gender: "Unisex",
    category: "Color",
  },
  {
    sku: "SL-005",
    name: "Sunsilk Shampoo 180ml",
    price: 320,
    type: "product",
    gender: "Unisex",
    category: "Retail",
  },
  {
    sku: "SL-006",
    name: "Beard Trim · Men",
    price: 150,
    type: "service",
    durationMins: 15,
    gender: "Men",
    category: "Hair",
  },
];

export const salonStylists = ["Rina", "Sumi", "Farhana", "Jashim", "Walk-in"];

export type HardwareItem = {
  sku: string;
  name: string;
  price: number;
  brand: string;
  unit: "Piece" | "Dozen" | "Ft" | "Kg" | "Bag";
  category: string;
  barcode: string;
  warrantyMonths?: number;
};

export const hardwareCatalog: HardwareItem[] = [
  {
    sku: "HW-001",
    name: 'GI Pipe 1" · Local',
    price: 850,
    brand: "BSRM",
    unit: "Ft",
    category: "Pipe",
    barcode: "8802001001",
    warrantyMonths: 0,
  },
  {
    sku: "HW-002",
    name: "Anchor Switch Socket",
    price: 180,
    brand: "Anchor",
    unit: "Piece",
    category: "Electrical",
    barcode: "8802001002",
    warrantyMonths: 12,
  },
  {
    sku: "HW-003",
    name: "Stanley Claw Hammer",
    price: 650,
    brand: "Stanley",
    unit: "Piece",
    category: "Tools",
    barcode: "8802001003",
    warrantyMonths: 6,
  },
  {
    sku: "HW-004",
    name: "Berger Weathercoat 4L",
    price: 1850,
    brand: "Berger",
    unit: "Piece",
    category: "Paint",
    barcode: "8802001004",
    warrantyMonths: 0,
  },
  {
    sku: "HW-005",
    name: 'CPVC Elbow 1"',
    price: 45,
    brand: "National",
    unit: "Dozen",
    category: "Fitting",
    barcode: "8802001005",
  },
];

export type StationeryItem = {
  sku: string;
  name: string;
  price: number;
  brand: string;
  schoolClass: string;
  packQty: number;
  barcode: string;
  wholesalePrice: number;
};

export const stationeryCatalog: StationeryItem[] = [
  {
    sku: "ST-001",
    name: "Matador Hi-Speed Pen · 10pc",
    price: 100,
    brand: "Matador",
    schoolClass: "All",
    packQty: 10,
    barcode: "8803001001",
    wholesalePrice: 85,
  },
  {
    sku: "ST-002",
    name: "Khata Copy · 80 page · Square",
    price: 35,
    brand: "Fresh",
    schoolClass: "Primary",
    packQty: 1,
    barcode: "8803001002",
    wholesalePrice: 28,
  },
  {
    sku: "ST-003",
    name: "Geometry Box · Class 6-10",
    price: 180,
    brand: "Oxford",
    schoolClass: "6-10",
    packQty: 1,
    barcode: "8803001003",
    wholesalePrice: 150,
  },
  {
    sku: "ST-004",
    name: "A4 Rim · 500 sheets",
    price: 420,
    brand: "Double A",
    schoolClass: "Office",
    packQty: 500,
    barcode: "8803001004",
    wholesalePrice: 380,
  },
  {
    sku: "ST-005",
    name: "Class 1 Book List Bundle",
    price: 850,
    brand: "Mixed",
    schoolClass: "1",
    packQty: 1,
    barcode: "8803001005",
    wholesalePrice: 720,
  },
];

export type CosmeticsItem = {
  sku: string;
  name: string;
  price: number;
  brand: string;
  shade?: string;
  category: string;
  expiryDate: string;
  mrp: number;
};

export const cosmeticsCatalog: CosmeticsItem[] = [
  {
    sku: "CM-001",
    name: "Fair & Lovely · 25g",
    price: 165,
    brand: "Unilever",
    category: "Skincare",
    expiryDate: "2027-03-01",
    mrp: 175,
  },
  {
    sku: "CM-002",
    name: "Dove Shampoo · 340ml",
    price: 520,
    brand: "Unilever",
    category: "Hair",
    expiryDate: "2028-01-15",
    mrp: 550,
  },
  {
    sku: "CM-003",
    name: "Lakme Lipstick · Ruby",
    price: 450,
    brand: "Lakme",
    shade: "Ruby Red",
    category: "Makeup",
    expiryDate: "2027-08-20",
    mrp: 480,
  },
  {
    sku: "CM-004",
    name: "Parachute Coconut Oil · 200ml",
    price: 280,
    brand: "Marico",
    category: "Hair",
    expiryDate: "2028-06-01",
    mrp: 300,
  },
  {
    sku: "CM-005",
    name: "Hijab Friendly Foundation · Beige",
    price: 890,
    brand: "Local BD",
    shade: "Beige 02",
    category: "Makeup",
    expiryDate: "2027-11-10",
    mrp: 950,
  },
];

export type BuildingMaterialItem = {
  sku: string;
  name: string;
  price: number;
  material: string;
  unit: "Bag" | "Ton" | "CFT" | "Piece" | "Sqft";
  grade: string;
  brand: string;
};

export const buildingMaterialsCatalog: BuildingMaterialItem[] = [
  {
    sku: "BM-001",
    name: "Holcim Cement · 50kg",
    price: 620,
    material: "Cement",
    unit: "Bag",
    grade: "OPC",
    brand: "Holcim",
  },
  {
    sku: "BM-002",
    name: "BSRM Rod · 60 Grade · 10mm",
    price: 78000,
    material: "Rod",
    unit: "Ton",
    grade: "60",
    brand: "BSRM",
  },
  {
    sku: "BM-003",
    name: "Sand · Sylhet · Local",
    price: 2200,
    material: "Sand",
    unit: "CFT",
    grade: "Medium",
    brand: "Local",
  },
  {
    sku: "BM-004",
    name: "RAK Ceramic Tile · 2×2 ft",
    price: 85,
    material: "Tile",
    unit: "Sqft",
    grade: "Premium",
    brand: "RAK",
  },
  {
    sku: "BM-005",
    name: "TMT Rod · 12mm · Local",
    price: 72000,
    material: "Rod",
    unit: "Ton",
    grade: "500W",
    brand: "KSRM",
  },
];

export type MobileShopItem = {
  sku: string;
  name: string;
  price: number;
  brand: string;
  model: string;
  storage?: string;
  category: "Phone" | "Accessory" | "Used";
  serialized: boolean;
  warrantyMonths: number;
};

export const mobileShopCatalog: MobileShopItem[] = [
  {
    sku: "MB-001",
    name: "Samsung Galaxy A15",
    brand: "Samsung",
    model: "SM-A155",
    storage: "128GB",
    price: 18999,
    category: "Phone",
    serialized: true,
    warrantyMonths: 12,
  },
  {
    sku: "MB-002",
    name: "Symphony Z40",
    brand: "Symphony",
    model: "Z40",
    storage: "64GB",
    price: 8999,
    category: "Phone",
    serialized: true,
    warrantyMonths: 12,
  },
  {
    sku: "MB-003",
    name: "Xiaomi Redmi 13C",
    brand: "Xiaomi",
    model: "23100RN82L",
    storage: "128GB",
    price: 14999,
    category: "Phone",
    serialized: true,
    warrantyMonths: 12,
  },
  {
    sku: "MB-004",
    name: "Fast Charger 25W USB-C",
    brand: "Samsung",
    model: "EP-TA800",
    price: 1200,
    category: "Accessory",
    serialized: false,
    warrantyMonths: 6,
  },
  {
    sku: "MB-005",
    name: "Silicone Case · Universal",
    brand: "Local",
    model: "CASE-UNI",
    price: 250,
    category: "Accessory",
    serialized: false,
    warrantyMonths: 0,
  },
  {
    sku: "MB-006",
    name: "Used iPhone 11 · 64GB",
    brand: "Apple",
    model: "A2221",
    storage: "64GB",
    price: 22000,
    category: "Used",
    serialized: true,
    warrantyMonths: 3,
  },
];

export type TailoringItem = {
  sku: string;
  name: string;
  price: number;
  type: "alteration" | "stitch" | "fabric" | "ready-made";
  garment: string;
  fabric?: string;
  leadDays: number;
};

export const tailoringCatalog: TailoringItem[] = [
  {
    sku: "TL-001",
    name: "Pant Hem · Standard",
    price: 80,
    type: "alteration",
    garment: "Pant",
    leadDays: 2,
  },
  {
    sku: "TL-002",
    name: "Shirt Sleeve Shorten",
    price: 120,
    type: "alteration",
    garment: "Shirt",
    leadDays: 2,
  },
  {
    sku: "TL-003",
    name: "Panjabi Full Stitch",
    price: 850,
    type: "stitch",
    garment: "Panjabi",
    fabric: "Cotton",
    leadDays: 5,
  },
  {
    sku: "TL-004",
    name: "Cotton Fabric · per metre",
    price: 320,
    type: "fabric",
    garment: "Fabric",
    fabric: "Cotton",
    leadDays: 0,
  },
  {
    sku: "TL-005",
    name: "Ready Kurta · M",
    price: 1200,
    type: "ready-made",
    garment: "Kurta",
    leadDays: 0,
  },
  {
    sku: "TL-006",
    name: "Blouse Stitch · Saree",
    price: 450,
    type: "stitch",
    garment: "Blouse",
    leadDays: 4,
  },
];

export const tailoringMasters = ["Karim Master", "Salam Ustad", "Rina Boutique", "Walk-in"];

export type RiceMillItem = {
  sku: string;
  name: string;
  ratePerKg: number;
  variety: "Miniket" | "Nazirshail" | "BRRI-28" | "Atap" | "Atta" | "Maida" | "Suji";
  grade: string;
  bagSizeKg: number;
};

export const riceMillCatalog: RiceMillItem[] = [
  {
    sku: "RC-001",
    name: "Miniket · Premium",
    ratePerKg: 72,
    variety: "Miniket",
    grade: "Premium",
    bagSizeKg: 50,
  },
  {
    sku: "RC-002",
    name: "Nazirshail · Standard",
    ratePerKg: 85,
    variety: "Nazirshail",
    grade: "Standard",
    bagSizeKg: 50,
  },
  {
    sku: "RC-003",
    name: "BRRI-28 · Local",
    ratePerKg: 58,
    variety: "BRRI-28",
    grade: "Local",
    bagSizeKg: 25,
  },
  {
    sku: "RC-004",
    name: "Atap Chal",
    ratePerKg: 52,
    variety: "Atap",
    grade: "Standard",
    bagSizeKg: 25,
  },
  {
    sku: "RC-005",
    name: "Fresh Atta · Mill",
    ratePerKg: 48,
    variety: "Atta",
    grade: "Fresh",
    bagSizeKg: 0,
  },
  {
    sku: "RC-006",
    name: "Maida · Fine",
    ratePerKg: 55,
    variety: "Maida",
    grade: "Fine",
    bagSizeKg: 0,
  },
];

export type FurnitureItem = {
  sku: string;
  name: string;
  price: number;
  category: string;
  material: "Solid wood" | "Board" | "Steel" | "Mixed";
  setPieces: number;
  assemblyFee: number;
  leadDays: number;
};

export const furnitureCatalog: FurnitureItem[] = [
  {
    sku: "FN-001",
    name: "King Size Bed · Sheesham",
    price: 45000,
    category: "Bedroom",
    material: "Solid wood",
    setPieces: 1,
    assemblyFee: 1500,
    leadDays: 3,
  },
  {
    sku: "FN-002",
    name: "5-Seater Sofa Set",
    price: 68000,
    category: "Living",
    material: "Mixed",
    setPieces: 5,
    assemblyFee: 2000,
    leadDays: 5,
  },
  {
    sku: "FN-003",
    name: "Office Desk · Board",
    price: 8500,
    category: "Office",
    material: "Board",
    setPieces: 1,
    assemblyFee: 500,
    leadDays: 2,
  },
  {
    sku: "FN-004",
    name: "Dining Table 6-Chair Set",
    price: 32000,
    category: "Dining",
    material: "Solid wood",
    setPieces: 7,
    assemblyFee: 1200,
    leadDays: 4,
  },
  {
    sku: "FN-005",
    name: "Steel Wardrobe 3-Door",
    price: 18500,
    category: "Bedroom",
    material: "Steel",
    setPieces: 1,
    assemblyFee: 800,
    leadDays: 2,
  },
];

export type TailoringAlterationJob = {
  id: string;
  job_no: string;
  customer_name: string;
  customer_phone?: string;
  garment_type: string;
  alteration_task: string;
  master_name: string;
  status: "pending" | "in-progress" | "ready" | "collected";
  due_date: string;
  measurement_note?: string;
  amount: number;
};

export const tailoringAlterationQueue: TailoringAlterationJob[] = [
  {
    id: "alt-1",
    job_no: "ALT-021",
    customer_name: "Nabila C.",
    customer_phone: "01711112222",
    garment_type: "Shirt",
    alteration_task: "Sleeve shorten",
    master_name: "Karim Master",
    status: "in-progress",
    due_date: "2026-07-01",
    measurement_note: 'Sleeve 24" · chest 38',
    amount: 120,
  },
  {
    id: "alt-2",
    job_no: "ALT-022",
    customer_name: "Walk-in",
    garment_type: "Panjabi",
    alteration_task: "Full stitch",
    master_name: "Salam Ustad",
    status: "pending",
    due_date: "2026-07-04",
    amount: 850,
  },
  {
    id: "alt-3",
    job_no: "ALT-023",
    customer_name: "Farhana B.",
    garment_type: "Blouse",
    alteration_task: "Embroidery",
    master_name: "Rina Boutique",
    status: "ready",
    due_date: "2026-06-28",
    amount: 450,
  },
];

export type RiceVarietyStockRow = {
  id: string;
  variety: string;
  grade: string;
  rate_per_kg: number;
  qty_kg: number;
  bag_count: number;
  reorder_kg: number;
  low_stock: boolean;
};

export const riceVarietyStockDemo: RiceVarietyStockRow[] = riceMillCatalog.map((r, i) => ({
  id: `rv-${i + 1}`,
  variety: r.variety,
  grade: r.grade,
  rate_per_kg: r.ratePerKg,
  qty_kg: 400 + i * 120,
  bag_count: r.bagSizeKg > 0 ? Math.floor((400 + i * 120) / r.bagSizeKg) : 0,
  reorder_kg: 200,
  low_stock: 400 + i * 120 <= 200,
}));

export type FurnitureDeliveryRow = {
  id: string;
  delivery_no: string;
  customer_name: string;
  customer_phone?: string;
  delivery_address: string;
  items_summary: string;
  assembly_required: boolean;
  assembly_fee: number;
  scheduled_date: string;
  status: "scheduled" | "out-for-delivery" | "delivered" | "cancelled";
  driver_note?: string;
};

export const furnitureDeliveriesDemo: FurnitureDeliveryRow[] = [
  {
    id: "dlv-1",
    delivery_no: "DLV-101",
    customer_name: "Rashid H.",
    customer_phone: "01812345678",
    delivery_address: "House 12, Road 5, Dhanmondi, Dhaka",
    items_summary: "King Size Bed · Sheesham",
    assembly_required: true,
    assembly_fee: 1500,
    scheduled_date: "2026-06-30",
    status: "scheduled",
  },
  {
    id: "dlv-2",
    delivery_no: "DLV-102",
    customer_name: "Ayesha K.",
    customer_phone: "01987654321",
    delivery_address: "Flat 4B, Bashundhara R/A",
    items_summary: "5-Seater Sofa Set",
    assembly_required: true,
    assembly_fee: 2000,
    scheduled_date: "2026-07-02",
    status: "out-for-delivery",
    driver_note: "Call before arrival",
  },
  {
    id: "dlv-3",
    delivery_no: "DLV-103",
    customer_name: "Tanvir A.",
    delivery_address: "Mirpur-10, Dhaka",
    items_summary: "Office Desk · Board",
    assembly_required: false,
    assembly_fee: 0,
    scheduled_date: "2026-06-27",
    status: "delivered",
  },
];

export type OpticalItem = {
  sku: string;
  name: string;
  price: number;
  category: "Frame" | "Lens" | "Contact lens" | "Accessory" | "Service";
  brand: string;
  lensPower?: string;
  frameSize?: string;
  coating?: string;
};

export const opticalCatalog: OpticalItem[] = [
  {
    sku: "OP-001",
    name: "Metal Full-Rim Frame · Black",
    price: 1200,
    category: "Frame",
    brand: "VisionStyle",
    frameSize: "54-18-140",
  },
  {
    sku: "OP-002",
    name: "Acetate Frame · Tortoise",
    price: 1850,
    category: "Frame",
    brand: "Ray-Ban Style",
    frameSize: "52-20-145",
  },
  {
    sku: "OP-003",
    name: "Single Vision Lens · CR-39",
    price: 850,
    category: "Lens",
    brand: "Essilor",
    lensPower: "-2.00 SPH",
    coating: "Anti-glare",
  },
  {
    sku: "OP-004",
    name: "Progressive Lens · Blue Cut",
    price: 3200,
    category: "Lens",
    brand: "Hoya",
    lensPower: "+2.50 / -1.00",
    coating: "Blue light",
  },
  {
    sku: "OP-005",
    name: "Monthly Contact Lens · 6pc",
    price: 1800,
    category: "Contact lens",
    brand: "Bausch+Lomb",
    lensPower: "-3.00",
  },
  {
    sku: "OP-006",
    name: "Eye Test · Comprehensive",
    price: 500,
    category: "Service",
    brand: "In-house",
  },
  { sku: "OP-007", name: "Lens Cleaning Kit", price: 150, category: "Accessory", brand: "Generic" },
];

export type SurgicalItem = {
  sku: string;
  name: string;
  price: number;
  category: string;
  brand: string;
  sterile: boolean;
  batchNo: string;
  expiryDate: string;
  unit: string;
  surgicalGrade?: string;
};

export const surgicalCatalog: SurgicalItem[] = [
  // ─── Tynor Orthopedics & Rehabilitation Supports ───
  {
    sku: "TYN-A01-M",
    name: "Tynor Abdominal Support 9\" (23cm) · M",
    price: 850,
    category: "Orthopedics & Supports",
    brand: "Tynor",
    sterile: false,
    batchNo: "TYN-2026-A01M",
    expiryDate: "2029-12-31",
    unit: "Pcs",
    surgicalGrade: "Class I Medical Device",
  },
  {
    sku: "TYN-A01-L",
    name: "Tynor Abdominal Support 9\" (23cm) · L",
    price: 850,
    category: "Orthopedics & Supports",
    brand: "Tynor",
    sterile: false,
    batchNo: "TYN-2026-A01L",
    expiryDate: "2029-12-31",
    unit: "Pcs",
    surgicalGrade: "Class I Medical Device",
  },
  {
    sku: "TYN-A01-XL",
    name: "Tynor Abdominal Support 9\" (23cm) · XL",
    price: 890,
    category: "Orthopedics & Supports",
    brand: "Tynor",
    sterile: false,
    batchNo: "TYN-2026-A01XL",
    expiryDate: "2029-12-31",
    unit: "Pcs",
    surgicalGrade: "Class I Medical Device",
  },
  {
    sku: "TYN-A01-XXL",
    name: "Tynor Abdominal Support 9\" (23cm) · XXL",
    price: 950,
    category: "Orthopedics & Supports",
    brand: "Tynor",
    sterile: false,
    batchNo: "TYN-2026-A01XXL",
    expiryDate: "2029-12-31",
    unit: "Pcs",
    surgicalGrade: "Class I Medical Device",
  },
  {
    sku: "TYN-A05-M",
    name: "Tynor Lumbo Sacral Belt · M",
    price: 1150,
    category: "Orthopedics & Supports",
    brand: "Tynor",
    sterile: false,
    batchNo: "TYN-2026-A05M",
    expiryDate: "2029-12-31",
    unit: "Pcs",
    surgicalGrade: "Class I Medical Device",
  },
  {
    sku: "TYN-A05-L",
    name: "Tynor Lumbo Sacral Belt · L",
    price: 1150,
    category: "Orthopedics & Supports",
    brand: "Tynor",
    sterile: false,
    batchNo: "TYN-2026-A05L",
    expiryDate: "2029-12-31",
    unit: "Pcs",
    surgicalGrade: "Class I Medical Device",
  },
  {
    sku: "TYN-A07-M",
    name: "Tynor Contoured L.S Support · M",
    price: 1450,
    category: "Orthopedics & Supports",
    brand: "Tynor",
    sterile: false,
    batchNo: "TYN-2026-A07M",
    expiryDate: "2029-12-31",
    unit: "Pcs",
    surgicalGrade: "Class I Medical Device",
  },
  {
    sku: "TYN-A07-L",
    name: "Tynor Contoured L.S Support · L",
    price: 1450,
    category: "Orthopedics & Supports",
    brand: "Tynor",
    sterile: false,
    batchNo: "TYN-2026-A07L",
    expiryDate: "2029-12-31",
    unit: "Pcs",
    surgicalGrade: "Class I Medical Device",
  },
  {
    sku: "TYN-A11-M",
    name: "Tynor Chest Binder · M",
    price: 750,
    category: "Orthopedics & Supports",
    brand: "Tynor",
    sterile: false,
    batchNo: "TYN-2026-A11M",
    expiryDate: "2029-12-31",
    unit: "Pcs",
    surgicalGrade: "Class I Medical Device",
  },
  {
    sku: "TYN-A13-REG",
    name: "Tynor Taylor's Brace Short/Long · Regular",
    price: 2450,
    category: "Orthopedics & Supports",
    brand: "Tynor",
    sterile: false,
    batchNo: "TYN-2026-A13",
    expiryDate: "2029-12-31",
    unit: "Pcs",
    surgicalGrade: "Class I Medical Device",
  },
  {
    sku: "TYN-B02-L",
    name: "Tynor Cervical Collar Soft with Support · L",
    price: 520,
    category: "Orthopedics & Supports",
    brand: "Tynor",
    sterile: false,
    batchNo: "TYN-2026-B02L",
    expiryDate: "2029-12-31",
    unit: "Pcs",
    surgicalGrade: "Class I Medical Device",
  },
  {
    sku: "TYN-A33-M",
    name: "Tynor Posture Corrector · M",
    price: 1050,
    category: "Orthopedics & Supports",
    brand: "Tynor",
    sterile: false,
    batchNo: "TYN-2026-A33M",
    expiryDate: "2029-12-31",
    unit: "Pcs",
    surgicalGrade: "Class I Medical Device",
  },
  {
    sku: "TYN-D04-M",
    name: "Tynor Knee Cap (Pair) · M",
    price: 450,
    category: "Orthopedics & Supports",
    brand: "Tynor",
    sterile: false,
    batchNo: "TYN-2026-D04M",
    expiryDate: "2029-12-31",
    unit: "Pair",
    surgicalGrade: "Class I Medical Device",
  },
  {
    sku: "TYN-E05-M",
    name: "Tynor Wrist Brace with Double Lock · M",
    price: 580,
    category: "Orthopedics & Supports",
    brand: "Tynor",
    sterile: false,
    batchNo: "TYN-2026-E05M",
    expiryDate: "2029-12-31",
    unit: "Pcs",
    surgicalGrade: "Class I Medical Device",
  },
  {
    sku: "TYN-E10-M",
    name: "Tynor Tennis Elbow Support · M",
    price: 390,
    category: "Orthopedics & Supports",
    brand: "Tynor",
    sterile: false,
    batchNo: "TYN-2026-E10M",
    expiryDate: "2029-12-31",
    unit: "Pcs",
    surgicalGrade: "Class I Medical Device",
  },

  // ─── Rapid Diagnostic Tests & Medical Disposables ───
  {
    sku: "DIAG-DENGUE-NS1",
    name: "Dengue NS1 Antigen Rapid Test Kit",
    price: 50,
    category: "Rapid Diagnostic Kits",
    brand: "SD Biosensor / Siddiky",
    sterile: true,
    batchNo: "DG-2026-NS1",
    expiryDate: "2027-11-30",
    unit: "Test (Box of 25)",
    surgicalGrade: "IVD Certified",
  },
  {
    sku: "DIAG-DENGUE-COMBO",
    name: "Dengue Combo (NS1 + IgG/IgM) Rapid Test Kit",
    price: 80,
    category: "Rapid Diagnostic Kits",
    brand: "SD Biosensor / Siddiky",
    sterile: true,
    batchNo: "DG-2026-CMB",
    expiryDate: "2027-11-30",
    unit: "Test (Box of 25)",
    surgicalGrade: "IVD Certified",
  },
  {
    sku: "DIAG-PREG-CARD",
    name: "Pregnancy Rapid Diagnostic Test Card (HCG)",
    price: 30,
    category: "Rapid Diagnostic Kits",
    brand: "QuickCheck / Siddiky",
    sterile: true,
    batchNo: "HCG-2026-081",
    expiryDate: "2028-06-30",
    unit: "Pcs (Box of 25)",
    surgicalGrade: "IVD Certified",
  },
  {
    sku: "GLV-STERILE-PF-7.5",
    name: "Surgical Gloves Powder-Free Sterile · Size 7.5",
    price: 43,
    category: "Surgical Disposables & PPE",
    brand: "Medisafe / Siddiky",
    sterile: true,
    batchNo: "GLV-2026-PF75",
    expiryDate: "2028-12-31",
    unit: "Pair",
    surgicalGrade: "ISO 13485 Class IIa",
  },
  {
    sku: "GLV-STERILE-PF-7.0",
    name: "Surgical Gloves Powder-Free Sterile · Size 7.0",
    price: 43,
    category: "Surgical Disposables & PPE",
    brand: "Medisafe / Siddiky",
    sterile: true,
    batchNo: "GLV-2026-PF70",
    expiryDate: "2028-12-31",
    unit: "Pair",
    surgicalGrade: "ISO 13485 Class IIa",
  },
  {
    sku: "GLV-STERILE-PWD-7.5",
    name: "Surgical Gloves Powdered Sterile · Size 7.5",
    price: 43,
    category: "Surgical Disposables & PPE",
    brand: "Medisafe / Siddiky",
    sterile: true,
    batchNo: "GLV-2026-PW75",
    expiryDate: "2028-12-31",
    unit: "Pair",
    surgicalGrade: "ISO 13485 Class IIa",
  },

  // ─── Surgical Instruments & OT Equipment ───
  {
    sku: "SG-02-274-18",
    name: "Beyer Bone Rongeurs 18cm / 7\"",
    price: 4500,
    category: "Orthopedic & Bone Instruments",
    brand: "Siddiky Precision",
    sterile: true,
    batchNo: "BR-2026-274",
    expiryDate: "2032-12-31",
    unit: "Piece",
    surgicalGrade: "German Grade Stainless Steel 316L",
  },
  {
    sku: "SG-02-374-20",
    name: "Jewett Bone Plate Benders 20cm / 8\"",
    price: 3800,
    category: "Orthopedic & Bone Instruments",
    brand: "Siddiky Precision",
    sterile: true,
    batchNo: "PB-2026-374",
    expiryDate: "2032-12-31",
    unit: "Piece",
    surgicalGrade: "German Grade Stainless Steel 316L",
  },
  {
    sku: "SG-03-188-00",
    name: "Balfour Abdominal Retractor (Opening 250mm)",
    price: 8500,
    category: "Surgical Retractors",
    brand: "Siddiky Precision",
    sterile: true,
    batchNo: "RET-2026-188",
    expiryDate: "2032-12-31",
    unit: "Set",
    surgicalGrade: "German Grade Stainless Steel 316L",
  },
  {
    sku: "SG-04-011-01",
    name: "McIntosh Laryngoscope Set (4 Blades + Handle)",
    price: 6500,
    category: "Anesthesia & Airway",
    brand: "Siddiky Precision",
    sterile: true,
    batchNo: "LARY-2026-011",
    expiryDate: "2032-12-31",
    unit: "Complete Set",
    surgicalGrade: "Medical Optical Grade LED",
  },
  {
    sku: "SG-05-118-145",
    name: "Metzenbaum Dissecting Scissors Curved 14.5cm",
    price: 950,
    category: "Surgical Scissors & Cutters",
    brand: "Siddiky Precision",
    sterile: true,
    batchNo: "SCIS-2026-118",
    expiryDate: "2032-12-31",
    unit: "Piece",
    surgicalGrade: "Tungsten Carbide TC Edge",
  },
  {
    sku: "SG-05-839-14",
    name: "Mayo-Hegar Needle Holder 14cm",
    price: 1100,
    category: "Needle Holders & Suturing",
    brand: "Siddiky Precision",
    sterile: true,
    batchNo: "NH-2026-839",
    expiryDate: "2032-12-31",
    unit: "Piece",
    surgicalGrade: "Tungsten Carbide TC Jaws",
  },
  {
    sku: "SG-05-1112-125",
    name: "Halstead-Mosquito Hemostatic Forceps 12.5cm",
    price: 750,
    category: "Hemostatic Clamps",
    brand: "Siddiky Precision",
    sterile: true,
    batchNo: "CLP-2026-1112",
    expiryDate: "2032-12-31",
    unit: "Piece",
    surgicalGrade: "German Grade Stainless Steel 316L",
  },
  {
    sku: "SG-05-2334-75",
    name: "Cusco Vaginal Specula (Lateral Fixation 75x17mm)",
    price: 1450,
    category: "Gynecology & Obstetrics",
    brand: "Siddiky Precision",
    sterile: true,
    batchNo: "GYN-2026-2334",
    expiryDate: "2032-12-31",
    unit: "Piece",
    surgicalGrade: "Mirror Polish Stainless Steel",
  },
];

export type CrockeryItem = {
  sku: string;
  name: string;
  category: "Dinnerware" | "Cookware" | "Glassware" | "Drinkware" | "Cutlery" | "Storage" | "Spares";
  brand: string;
  material: string;
  price: number;
  stock: number;
  barcode: string;
  piecesInSet: number;
  heatCompatibility: "Induction & Gas" | "Gas Only" | "Microwave Safe" | "Oven Safe" | "Not Heat Resistant";
  capacity?: string;
  warrantyMonths?: number;
  isFragile?: boolean;
  isDecantable?: boolean;
  looseItemPrice?: number;
};

export const crockeryCatalog: CrockeryItem[] = [
  {
    sku: "CRK-001",
    name: "Milano 32-Piece Royal Opal Dinner Set",
    category: "Dinnerware",
    brand: "Milano",
    material: "Opal Glass",
    price: 4200,
    stock: 14,
    barcode: "890123456001",
    piecesInSet: 32,
    heatCompatibility: "Microwave Safe",
    isFragile: true,
    isDecantable: true,
    looseItemPrice: 320,
  },
  {
    sku: "CRK-002",
    name: "Kiam Classic 5.5L Induction Pressure Cooker",
    category: "Cookware",
    brand: "Kiam",
    material: "Aluminium Induction Base",
    price: 2450,
    stock: 22,
    barcode: "890123456002",
    piecesInSet: 1,
    heatCompatibility: "Induction & Gas",
    capacity: "5.5 Liters",
    warrantyMonths: 60,
  },
  {
    sku: "CRK-003",
    name: "Hawkins Contura 3.0L Hard Anodized Cooker",
    category: "Cookware",
    brand: "Hawkins",
    material: "Hard Anodized",
    price: 3100,
    stock: 18,
    barcode: "890123456003",
    piecesInSet: 1,
    heatCompatibility: "Gas Only",
    capacity: "3.0 Liters",
    warrantyMonths: 60,
  },
  {
    sku: "CRK-004",
    name: "Prestige 28cm Granite Non-Stick Kadhai with Lid",
    category: "Cookware",
    brand: "Prestige",
    material: "Non-Stick Granite",
    price: 1950,
    stock: 16,
    barcode: "890123456004",
    piecesInSet: 2,
    heatCompatibility: "Induction & Gas",
    capacity: "3.8 Liters",
    warrantyMonths: 24,
  },
  {
    sku: "CRK-005",
    name: "Luminarc 6-Piece Tempered Glass Water Tumbler Set",
    category: "Glassware",
    brand: "Luminarc",
    material: "Tempered Glass",
    price: 780,
    stock: 35,
    barcode: "890123456005",
    piecesInSet: 6,
    heatCompatibility: "Not Heat Resistant",
    capacity: "310 ml",
    isFragile: true,
    isDecantable: true,
    looseItemPrice: 140,
  },
  {
    sku: "CRK-006",
    name: "24-Piece Stainless Steel Luxury Cutlery Set with Stand",
    category: "Cutlery",
    brand: "SuperCook",
    material: "Stainless Steel 304",
    price: 1650,
    stock: 20,
    barcode: "890123456006",
    piecesInSet: 24,
    heatCompatibility: "Not Heat Resistant",
  },
  {
    sku: "CRK-007",
    name: "Milano Loose Replacement Opal Soup Bowl",
    category: "Dinnerware",
    brand: "Milano",
    material: "Opal Glass",
    price: 180,
    stock: 45,
    barcode: "890123456007",
    piecesInSet: 1,
    heatCompatibility: "Microwave Safe",
    isFragile: true,
  },
  {
    sku: "CRK-008",
    name: "Milano Loose Replacement Opal Dinner Plate (10.5 inch)",
    category: "Dinnerware",
    brand: "Milano",
    material: "Opal Glass",
    price: 320,
    stock: 38,
    barcode: "890123456008",
    piecesInSet: 1,
    heatCompatibility: "Microwave Safe",
    isFragile: true,
  },
  {
    sku: "CRK-009",
    name: "Ocean Glass 1.6L Bistro Glass Pitcher Jug",
    category: "Drinkware",
    brand: "Ocean",
    material: "Borosilicate Glass",
    price: 620,
    stock: 26,
    barcode: "890123456009",
    piecesInSet: 1,
    heatCompatibility: "Not Heat Resistant",
    capacity: "1.6 Liters",
    isFragile: true,
  },
  {
    sku: "CRK-010",
    name: "Cello 3-Tier Insulated Stainless Steel Tiffin Box",
    category: "Storage",
    brand: "Cello",
    material: "Stainless Steel 304",
    price: 1250,
    stock: 19,
    barcode: "890123456010",
    piecesInSet: 3,
    heatCompatibility: "Not Heat Resistant",
    capacity: "1.8 Liters",
  },
  {
    sku: "CRK-SP-01",
    name: "Universal Food-Grade Silicone Gasket (5.0L - 5.5L)",
    category: "Spares",
    brand: "Kiam / Prestige Fit",
    material: "Silicone Rubber",
    price: 150,
    stock: 80,
    barcode: "890123456011",
    piecesInSet: 1,
    heatCompatibility: "Induction & Gas",
  },
  {
    sku: "CRK-SP-02",
    name: "Cooker Brass Safety Valve & Weight Whistle Set",
    category: "Spares",
    brand: "Universal Fit",
    material: "Brass & Stainless Steel",
    price: 120,
    stock: 65,
    barcode: "890123456012",
    piecesInSet: 2,
    heatCompatibility: "Induction & Gas",
  },
];

export type CycleToysItem = {
  sku: string;
  name: string;
  category: "Kids Cycles" | "Geared MTBs" | "Electric Ride-ons" | "Toys & Games" | "Baby Gear" | "Spares & Accessories" | "Workshop Service";
  brand: string;
  price: number;
  stock: number;
  barcode: string;
  wheelSize?: string;
  ageGroup?: string;
  assemblyStatus?: "Ready-to-Ride (Assembled)" | "Boxed SKD (Unassembled Carton)" | "N/A";
  assemblyFee?: number;
  batterySpec?: string;
  batteryRequired?: string;
  gearType?: string;
  frameMaterial?: string;
  safetyCert?: string;
  isBoxed?: boolean;
  isElectric?: boolean;
  chokingHazard?: boolean;
  frameSerialRequired?: boolean;
};

export const cycleToysCatalog: CycleToysItem[] = [
  {
    sku: "CYC-KID-01",
    name: 'Hero Sprint Fairy 16" Kids Bicycle with Training Wheels',
    category: "Kids Cycles",
    brand: "Hero Sprint",
    price: 6800,
    stock: 12,
    barcode: "890200001001",
    wheelSize: '16"',
    ageGroup: "4-6 Years",
    assemblyStatus: "Ready-to-Ride (Assembled)",
    gearType: "Single Speed",
    frameMaterial: "Carbon Steel",
    safetyCert: "EN71 Non-Toxic Paint",
  },
  {
    sku: "CYC-KID-02",
    name: 'Phoenix Dino 14" Kids Cycle (Factory Boxed Carton)',
    category: "Kids Cycles",
    brand: "Phoenix",
    price: 5900,
    stock: 20,
    barcode: "890200001002",
    wheelSize: '14"',
    ageGroup: "3-5 Years",
    assemblyStatus: "Boxed SKD (Unassembled Carton)",
    assemblyFee: 300,
    isBoxed: true,
    gearType: "Single Speed",
    frameMaterial: "Alloy Steel",
    safetyCert: "EN71 Certified",
  },
  {
    sku: "CYC-MTB-01",
    name: 'Veloce Outrace 26" 21-Speed Alloy Mountain Bicycle',
    category: "Geared MTBs",
    brand: "Veloce",
    price: 18500,
    stock: 8,
    barcode: "890200001003",
    wheelSize: '26"',
    ageGroup: "13+ / Adult",
    assemblyStatus: "Ready-to-Ride (Assembled)",
    gearType: "21-Speed Shimano",
    frameMaterial: "6061 Aluminium Alloy",
    frameSerialRequired: true,
  },
  {
    sku: "CYC-MTB-02",
    name: 'Core Project 27.5" Hydraulic Disc MTB (Boxed Carton)',
    category: "Geared MTBs",
    brand: "Core",
    price: 24500,
    stock: 6,
    barcode: "890200001004",
    wheelSize: '27.5"',
    ageGroup: "13+ / Adult",
    assemblyStatus: "Boxed SKD (Unassembled Carton)",
    assemblyFee: 500,
    isBoxed: true,
    gearType: "24-Speed Shimano Altus",
    frameMaterial: "Double Butted Alloy",
    frameSerialRequired: true,
  },
  {
    sku: "TOY-RIDE-01",
    name: "Mercedes-Benz G63 12V Dual Motor Electric Ride-on Jeep",
    category: "Electric Ride-ons",
    brand: "Licensed Mercedes",
    price: 16500,
    stock: 5,
    barcode: "890200001005",
    ageGroup: "2-7 Years",
    batterySpec: "12V 7Ah Rechargeable, Dual 35W Motors",
    isElectric: true,
    safetyCert: "CE & ASTM Certified",
  },
  {
    sku: "TOY-RIDE-02",
    name: "BMW S1000RR 6V Kids Electric Rechargeable Superbike",
    category: "Electric Ride-ons",
    brand: "Licensed BMW",
    price: 9800,
    stock: 7,
    barcode: "890200001006",
    ageGroup: "2-5 Years",
    batterySpec: "6V 4.5Ah Lead-Acid",
    isElectric: true,
    safetyCert: "Non-Toxic Plastic",
  },
  {
    sku: "TOY-LEG-01",
    name: "LEGO Technic Monster Jam Remote Racing Stunt Truck",
    category: "Toys & Games",
    brand: "LEGO",
    price: 4200,
    stock: 15,
    barcode: "890200001007",
    ageGroup: "7-12 Years",
    safetyCert: "CE Certified, Non-Toxic",
    chokingHazard: true,
  },
  {
    sku: "TOY-RC-01",
    name: "High-Speed 4WD RC Rock Crawler Buggy with 2.4GHz Remote",
    category: "Toys & Games",
    brand: "WLToys",
    price: 3400,
    stock: 14,
    barcode: "890200001008",
    ageGroup: "6-12 Years",
    batterySpec: "7.4V 1200mAh Li-ion with USB Charger",
    batteryRequired: "2x AA for Remote Controller (Not Included)",
    isElectric: true,
    chokingHazard: true,
  },
  {
    sku: "TOY-ROB-01",
    name: "Smart Interactive Dancing Robot with Sound & Lights",
    category: "Toys & Games",
    brand: "RoboKids",
    price: 1850,
    stock: 22,
    barcode: "890200001015",
    ageGroup: "3-5 Years",
    batteryRequired: "3x AA Batteries (Not Included)",
    safetyCert: "BPA-Free, Non-Toxic",
    chokingHazard: false,
  },
  {
    sku: "TOY-CAR-01",
    name: "Hot Wheels 5-Car Collector Speed Edition Pack",
    category: "Toys & Games",
    brand: "Hot Wheels",
    price: 850,
    stock: 30,
    barcode: "890200001016",
    ageGroup: "3-5 Years",
    safetyCert: "Diecast Metal",
    chokingHazard: true,
  },
  {
    sku: "BAT-AA-04",
    name: "Panasonic Heavy-Duty AA Batteries (4-Pack)",
    category: "Spares & Accessories",
    brand: "Panasonic",
    price: 160,
    stock: 120,
    barcode: "890200001017",
  },
  {
    sku: "BAT-AAA-04",
    name: "Panasonic Alkaline AAA Batteries (4-Pack)",
    category: "Spares & Accessories",
    brand: "Panasonic",
    price: 180,
    stock: 100,
    barcode: "890200001018",
  },
  {
    sku: "TOY-BABY-01",
    name: "ComfortRide 2-in-1 Foldable Baby Stroller with Canopy",
    category: "Baby Gear",
    brand: "LuvLap",
    price: 7200,
    stock: 9,
    barcode: "890200001009",
    ageGroup: "0-3 Years",
    assemblyStatus: "Ready-to-Ride (Assembled)",
    safetyCert: "EN 1888 Certified",
  },
  {
    sku: "CYC-ACC-01",
    name: "Pro-Biker High-Density EPS Foam Safety Helmet (Kids)",
    category: "Spares & Accessories",
    brand: "Pro-Biker",
    price: 850,
    stock: 45,
    barcode: "890200001010",
    ageGroup: "4-10 Years",
    safetyCert: "CPSC & CE Certified",
  },
  {
    sku: "CYC-ACC-02",
    name: "Heavy-Duty 4-Digit Combination Cable Cycle Lock",
    category: "Spares & Accessories",
    brand: "Tonyon",
    price: 450,
    stock: 60,
    barcode: "890200001011",
  },
  {
    sku: "CYC-ACC-03",
    name: 'Universal 26" MTB High-Pressure Butyl Inner Tube',
    category: "Spares & Accessories",
    brand: "Kenda",
    price: 250,
    stock: 80,
    barcode: "890200001012",
  },
  {
    sku: "WRK-ASM-01",
    name: "In-Store Bicycle Assembly & Tuning Service",
    category: "Workshop Service",
    brand: "Pedal & Play Workshop",
    price: 300,
    stock: 999,
    barcode: "890200001013",
  },
  {
    sku: "WRK-REP-01",
    name: "Bicycle Complete Overhaul & Gear Tuning Service",
    category: "Workshop Service",
    brand: "Pedal & Play Workshop",
    price: 600,
    stock: 999,
    barcode: "890200001014",
  },
];
