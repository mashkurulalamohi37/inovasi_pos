import { fashionStyles, pharmacyItems, genericCatalog, stores } from "./pos-data";

export const categories = [
  { id: "c1",  name: "Men · Shirts",          products: 18, pack: "fashion" },
  { id: "c2",  name: "Women · Ethnic",         products: 22, pack: "fashion" },
  { id: "c3",  name: "Women · Western",        products: 15, pack: "fashion" },
  { id: "c4",  name: "Men · Trousers",         products: 12, pack: "fashion" },
  { id: "c5",  name: "Kids · Clothing",        products: 9,  pack: "fashion" },
  { id: "c6",  name: "Analgesic",              products: 12, pack: "pharmacy" },
  { id: "c7",  name: "Antihypertensive",       products: 8,  pack: "pharmacy" },
  { id: "c8",  name: "Antibiotic",             products: 16, pack: "pharmacy" },
  { id: "c9",  name: "Vitamin & Supplement",   products: 21, pack: "pharmacy" },
  { id: "c10", name: "Beverage",               products: 14, pack: "grocery" },
  { id: "c11", name: "Snacks",                 products: 26, pack: "grocery" },
  { id: "c12", name: "Rice & Flour",           products: 10, pack: "grocery" },
  { id: "c13", name: "Dairy & Eggs",           products: 8,  pack: "grocery" },
  { id: "c14", name: "Electronics",            products: 9,  pack: "electronics" },
  { id: "c15", name: "Accessories",            products: 17, pack: "electronics" },
  { id: "c16", name: "Frames",                 products: 24, pack: "optical-shop" },
  { id: "c17", name: "Lenses & Power",         products: 18, pack: "optical-shop" },
  { id: "c18", name: "Sterile PPE",            products: 15, pack: "surgical-shop" },
  { id: "c19", name: "Sutures & IV",           products: 22, pack: "surgical-shop" },
];

export const suppliers = [
  { id: "s1",  code: "SUP-001", name: "Demo Meat Supplier",        contact: "Mr. Rahim",    phone: "+880 1700-000001", outstanding: 124000, status: "active" },
  { id: "s2",  code: "SUP-002", name: "Fashion Wholesale Ltd",     contact: "Ms. Nazia",    phone: "+880 1700-000002", outstanding: 0,      status: "active" },
  { id: "s3",  code: "SUP-003", name: "Pharma Distributors BD",    contact: "Mr. Kabir",    phone: "+880 1700-000003", outstanding: 56000,  status: "active" },
  { id: "s4",  code: "SUP-004", name: "Indigo Lane Wholesale",     contact: "Ms. Sumi",     phone: "+880 1711-200004", outstanding: 18500,  status: "on-hold" },
  { id: "s5",  code: "SUP-005", name: "AquaPure Beverages",        contact: "Mr. Tariq",    phone: "+880 1711-200005", outstanding: 0,      status: "active" },
  { id: "s6",  code: "SUP-006", name: "Beximco Pharma",            contact: "Mr. Hasan",    phone: "+880 1712-300006", outstanding: 34200,  status: "active" },
  { id: "s7",  code: "SUP-007", name: "Square Pharmaceuticals",    contact: "Ms. Rekha",    phone: "+880 1712-300007", outstanding: 0,      status: "active" },
  { id: "s8",  code: "SUP-008", name: "Apex Footwear Ltd",         contact: "Mr. Jalal",    phone: "+880 1713-400008", outstanding: 88000,  status: "active" },
  { id: "s9",  code: "SUP-009", name: "Partex Star Group",         contact: "Ms. Fariha",   phone: "+880 1713-400009", outstanding: 0,      status: "active" },
  { id: "s10", code: "SUP-010", name: "ACI Consumer Brands",       contact: "Mr. Saiful",   phone: "+880 1714-500010", outstanding: 12000,  status: "active" },
  { id: "s11", code: "SUP-011", name: "Pran-RFL Group",            contact: "Ms. Taslima",  phone: "+880 1714-500011", outstanding: 0,      status: "active" },
  { id: "s12", code: "SUP-012", name: "Meghna Group BD",           contact: "Mr. Arif",     phone: "+880 1715-600012", outstanding: 47500,  status: "active" },
  { id: "s13", code: "SUP-013", name: "Global Electronics Dist.",  contact: "Ms. Sharmin",  phone: "+880 1715-600013", outstanding: 0,      status: "on-hold" },
  { id: "s14", code: "SUP-014", name: "Surgical Supplies BD",      contact: "Mr. Rakib",    phone: "+880 1716-700014", outstanding: 9200,   status: "active" },
  { id: "s15", code: "SUP-015", name: "Fresh Dairy Direct",        contact: "Ms. Shirin",   phone: "+880 1716-700015", outstanding: 0,      status: "active" },
];

export const purchaseOrders = [
  { id: "p1",  po: "PO-2026-0114", supplier: "Beximco Pharma",          date: "2026-07-01", total: 84200,  status: "received" },
  { id: "p2",  po: "PO-2026-0115", supplier: "Square Pharma",            date: "2026-07-02", total: 62500,  status: "partial" },
  { id: "p3",  po: "PO-2026-0116", supplier: "Pulse Atelier Mfg.",       date: "2026-07-03", total: 156400, status: "open" },
  { id: "p4",  po: "PO-2026-0117", supplier: "Indigo Lane Wholesale",    date: "2026-07-04", total: 42800,  status: "draft" },
  { id: "p5",  po: "PO-2026-0118", supplier: "AquaPure Beverages",       date: "2026-07-05", total: 28000,  status: "received" },
  { id: "p6",  po: "PO-2026-0119", supplier: "ACI Consumer Brands",      date: "2026-07-06", total: 34500,  status: "received" },
  { id: "p7",  po: "PO-2026-0120", supplier: "Pran-RFL Group",           date: "2026-07-07", total: 55200,  status: "partial" },
  { id: "p8",  po: "PO-2026-0121", supplier: "Meghna Group BD",          date: "2026-07-08", total: 71000,  status: "open" },
  { id: "p9",  po: "PO-2026-0122", supplier: "Global Electronics Dist.", date: "2026-07-09", total: 210000, status: "received" },
  { id: "p10", po: "PO-2026-0123", supplier: "Surgical Supplies BD",     date: "2026-07-10", total: 18400,  status: "received" },
  { id: "p11", po: "PO-2026-0124", supplier: "Fresh Dairy Direct",       date: "2026-07-11", total: 9800,   status: "received" },
  { id: "p12", po: "PO-2026-0125", supplier: "Apex Footwear Ltd",        date: "2026-07-12", total: 132000, status: "open" },
  { id: "p13", po: "PO-2026-0126", supplier: "Fashion Wholesale Ltd",    date: "2026-07-13", total: 96000,  status: "partial" },
  { id: "p14", po: "PO-2026-0127", supplier: "Partex Star Group",        date: "2026-07-14", total: 47000,  status: "draft" },
  { id: "p15", po: "PO-2026-0128", supplier: "Demo Meat Supplier",       date: "2026-07-15", total: 38400,  status: "received" },
];

export const customers = [
  { id: "u1",  code: "CUS-001", name: "Rahim Uddin",       phone: "+880 1711-110001", loyalty: 1240,  lastVisit: "2026-07-24", lifetime: 48200, customer_type: "employee", custom_discount_pct: 15 },
  { id: "u2",  code: "CUS-002", name: "Fatima Begum",      phone: "+880 1711-110002", loyalty: 890,   lastVisit: "2026-07-23", lifetime: 32400, customer_type: "family", custom_discount_pct: undefined },
  { id: "u3",  code: "CUS-003", name: "Karim Traders",     phone: "+880 1711-110003", loyalty: 2890,  lastVisit: "2026-07-25", lifetime: 134700, customer_type: "friends", custom_discount_pct: 10 },
  { id: "u4",  code: "CUS-004", name: "Nadia Islam",       phone: "+880 1711-110004", loyalty: 320,   lastVisit: "2026-07-22", lifetime: 12450, customer_type: "general", custom_discount_pct: undefined },
  { id: "u5",  code: "CUS-005", name: "Walk-in Guest",     phone: "+880 1711-110005", loyalty: 80,    lastVisit: "2026-07-18", lifetime: 3200, customer_type: "general", custom_discount_pct: undefined },
  { id: "u6",  code: "CUS-006", name: "Selim Hossain",     phone: "+880 1712-220006", loyalty: 640,   lastVisit: "2026-07-20", lifetime: 24800, customer_type: "friends", custom_discount_pct: undefined },
  { id: "u7",  code: "CUS-007", name: "Morium Akter",      phone: "+880 1712-220007", loyalty: 1780,  lastVisit: "2026-07-21", lifetime: 67300, customer_type: "family", custom_discount_pct: undefined },
  { id: "u8",  code: "CUS-008", name: "Tanvir Ahmed",      phone: "+880 1713-330008", loyalty: 0,     lastVisit: "2026-07-15", lifetime: 5100, customer_type: "employee", custom_discount_pct: undefined },
  { id: "u9",  code: "CUS-009", name: "Ruma Enterprise",   phone: "+880 1713-330009", loyalty: 3420,  lastVisit: "2026-07-25", lifetime: 189200, customer_type: "friends", custom_discount_pct: 12 },
  { id: "u10", code: "CUS-010", name: "Jamal & Sons",      phone: "+880 1714-440010", loyalty: 560,   lastVisit: "2026-07-19", lifetime: 28900, customer_type: "general", custom_discount_pct: undefined },
  { id: "u11", code: "CUS-011", name: "Shahida Parvin",    phone: "+880 1714-440011", loyalty: 110,   lastVisit: "2026-07-10", lifetime: 7600, customer_type: "general", custom_discount_pct: undefined },
  { id: "u12", code: "CUS-012", name: "Nasir Corp.",       phone: "+880 1715-550012", loyalty: 4800,  lastVisit: "2026-07-26", lifetime: 312000, customer_type: "general", custom_discount_pct: 18 },
  { id: "u13", code: "CUS-013", name: "Poly Begum",        phone: "+880 1715-550013", loyalty: 200,   lastVisit: "2026-07-17", lifetime: 9800, customer_type: "family", custom_discount_pct: undefined },
  { id: "u14", code: "CUS-014", name: "Rahman Retail",     phone: "+880 1716-660014", loyalty: 2100,  lastVisit: "2026-07-24", lifetime: 98400, customer_type: "friends", custom_discount_pct: undefined },
  { id: "u15", code: "CUS-015", name: "Lutfun Nahar",      phone: "+880 1716-660015", loyalty: 470,   lastVisit: "2026-07-22", lifetime: 18200, customer_type: "employee", custom_discount_pct: undefined },
];

export const salesInvoices = [
  { id: "i1",  invoice: "INV-026601", store: "DHK-01", cashier: "Mahin",  total: 4890,  tender: "Card",   ts: "2026-07-27 09:12", status: "paid"     },
  { id: "i2",  invoice: "INV-026602", store: "DHK-01", cashier: "Mahin",  total: 1240,  tender: "Cash",   ts: "2026-07-27 09:31", status: "paid"     },
  { id: "i3",  invoice: "INV-026603", store: "DHK-02", cashier: "Salma",  total: 320,   tender: "Mobile", ts: "2026-07-27 09:35", status: "paid"     },
  { id: "i4",  invoice: "INV-026604", store: "DHK-01", cashier: "Mahin",  total: 7820,  tender: "Split",  ts: "2026-07-27 09:48", status: "paid"     },
  { id: "i5",  invoice: "INV-026605", store: "CTG-01", cashier: "Imran",  total: 990,   tender: "Cash",   ts: "2026-07-27 10:05", status: "refunded" },
  { id: "i6",  invoice: "INV-026606", store: "DHK-01", cashier: "Rajan",  total: 3450,  tender: "bKash",  ts: "2026-07-27 10:22", status: "paid"     },
  { id: "i7",  invoice: "INV-026607", store: "DHK-02", cashier: "Salma",  total: 660,   tender: "Cash",   ts: "2026-07-27 10:38", status: "paid"     },
  { id: "i8",  invoice: "INV-026608", store: "DHK-01", cashier: "Mahin",  total: 12400, tender: "Card",   ts: "2026-07-27 10:54", status: "due"      },
  { id: "i9",  invoice: "INV-026609", store: "SYL-01", cashier: "Kabir",  total: 880,   tender: "Nagad",  ts: "2026-07-27 11:10", status: "paid"     },
  { id: "i10", invoice: "INV-026610", store: "DHK-01", cashier: "Rajan",  total: 5600,  tender: "Cash",   ts: "2026-07-27 11:25", status: "paid"     },
  { id: "i11", invoice: "INV-026611", store: "CTG-01", cashier: "Imran",  total: 2200,  tender: "bKash",  ts: "2026-07-27 11:41", status: "paid"     },
  { id: "i12", invoice: "INV-026612", store: "DHK-02", cashier: "Salma",  total: 440,   tender: "Cash",   ts: "2026-07-27 11:58", status: "paid"     },
  { id: "i13", invoice: "INV-026613", store: "DHK-01", cashier: "Mahin",  total: 9100,  tender: "Card",   ts: "2026-07-27 12:15", status: "paid"     },
  { id: "i14", invoice: "INV-026614", store: "DHK-01", cashier: "Rajan",  total: 3800,  tender: "Split",  ts: "2026-07-27 12:32", status: "due"      },
  { id: "i15", invoice: "INV-026615", store: "SYL-01", cashier: "Kabir",  total: 1500,  tender: "Nagad",  ts: "2026-07-27 12:48", status: "paid"     },
];

/** Canonical demo catalog — matches PULSE-DEMO seed SKUs across all industry packs. */
export const demoProducts = [
  { sku: "BEEF-001", name: "Premium Beef Shoulder",        pack: "Beef Shop",   industry: "beef-shop",     cost_price: 620,  price: 850,   stock: 97,  status: "active"   },
  { sku: "BEEF-002", name: "Beef Brisket (Boneless)",      pack: "Beef Shop",   industry: "beef-shop",     cost_price: 510,  price: 720,   stock: 54,  status: "active"   },
  { sku: "FASH-001", name: "Cotton Polo Shirt",            pack: "Fashion",     industry: "fashion",       cost_price: 780,  price: 1290,  stock: 98,  status: "active"   },
  { sku: "FASH-002", name: "Women Kurti — Floral",         pack: "Fashion",     industry: "fashion",       cost_price: 620,  price: 980,   stock: 43,  status: "active"   },
  { sku: "FASH-003", name: "Men Slim-fit Chinos",          pack: "Fashion",     industry: "fashion",       cost_price: 1150, price: 1650,  stock: 30,  status: "active"   },
  { sku: "FASH-004", name: "Kids Summer Frock",            pack: "Fashion",     industry: "fashion",       cost_price: 480,  price: 750,   stock: 22,  status: "active"   },
  { sku: "PHRM-001", name: "Paracetamol 500mg",           pack: "Pharmacy",    industry: "pharmacy",      cost_price: 7.5,  price: 12,    stock: 950, status: "active"   },
  { sku: "PHRM-002", name: "Amoxicillin 250mg Cap",        pack: "Pharmacy",    industry: "pharmacy",      cost_price: 30,   price: 45,    stock: 400, status: "active"   },
  { sku: "PHRM-003", name: "Metformin 500mg Tab",          pack: "Pharmacy",    industry: "pharmacy",      cost_price: 5.2,  price: 8,     stock: 720, status: "active"   },
  { sku: "PHRM-004", name: "Vitamin C 1000mg",             pack: "Pharmacy",    industry: "pharmacy",      cost_price: 80,   price: 120,   stock: 280, status: "active"   },
  { sku: "GROC-001", name: "Basmati Rice 5kg",             pack: "Grocery",     industry: "grocery",       cost_price: 520,  price: 650,   stock: 99,  status: "active"   },
  { sku: "GROC-002", name: "Soybean Oil 2L",               pack: "Grocery",     industry: "grocery",       cost_price: 260,  price: 310,   stock: 78,  status: "active"   },
  { sku: "GROC-003", name: "Full Cream Milk 1L",           pack: "Grocery",     industry: "grocery",       cost_price: 75,   price: 95,    stock: 160, status: "active"   },
  { sku: "GROC-004", name: "Lays Classic 50g",             pack: "Grocery",     industry: "grocery",       cost_price: 26,   price: 35,    stock: 240, status: "active"   },
  // Restaurant POS Demo Data
  { sku: "EM-APP-01", name: "Luchi (Per Pc) / লুচি", pack: "Restaurant", industry: "restaurant", price: 10, stock: 500, status: "active" },
  { sku: "EM-APP-02", name: "Chola Batora / ছোলা বাটোরা", pack: "Restaurant", industry: "restaurant", price: 60, stock: 200, status: "active" },
  { sku: "EM-APP-03", name: "Chicken Jhal Fry / চিকেন ঝাল ফ্রাই", pack: "Restaurant", industry: "restaurant", price: 80, stock: 150, status: "active" },
  { sku: "EM-APP-04", name: "Chicken Chaap / চিকেন চাপ", pack: "Restaurant", industry: "restaurant", price: 130, stock: 120, status: "active" },
  { sku: "EM-APP-05", name: "Haleem / হালিম", pack: "Restaurant", industry: "restaurant", price: 80, stock: 180, status: "active" },
  { sku: "EM-APP-06", name: "Chicken Soup / চিকেন স্যুপ", pack: "Restaurant", industry: "restaurant", price: 50, stock: 220, status: "active" },
  { sku: "EM-APP-07", name: "Chicken Steak / চিকেন স্টেক", pack: "Restaurant", industry: "restaurant", price: 200, stock: 90, status: "active" },
  { sku: "EM-RICE-01", name: "Student Special (Rice, Veg, Chicken)", pack: "Restaurant", industry: "restaurant", price: 60, stock: 300, status: "active" },
  { sku: "EM-RICE-02", name: "Regular Combo (Rice, Veg, Chicken)", pack: "Restaurant", industry: "restaurant", price: 120, stock: 250, status: "active" },
  { sku: "EM-RICE-03", name: "Superior Combo Meal", pack: "Restaurant", industry: "restaurant", price: 180, stock: 150, status: "active" },
  { sku: "EM-SW-01", name: "Egg Sandwich", pack: "Restaurant", industry: "restaurant", price: 30, stock: 140, status: "active" },
  { sku: "EM-SW-02", name: "Chicken Sandwich", pack: "Restaurant", industry: "restaurant", price: 50, stock: 160, status: "active" },
  { sku: "EM-SW-03", name: "Club Sandwich", pack: "Restaurant", industry: "restaurant", price: 70, stock: 110, status: "active" },
  { sku: "EM-BGR-01", name: "Chicken Burger", pack: "Restaurant", industry: "restaurant", price: 70, stock: 210, status: "active" },
  { sku: "EM-BGR-03", name: "Cheese Burger", pack: "Restaurant", industry: "restaurant", price: 100, stock: 130, status: "active" },
  { sku: "EM-BOX-01", name: "Mini Meat Box", pack: "Restaurant", industry: "restaurant", price: 50, stock: 190, status: "active" },
  { sku: "EM-BOX-02", name: "Medium Meat Box", pack: "Restaurant", industry: "restaurant", price: 100, stock: 170, status: "active" },
  { sku: "EM-FC-01", name: "Chicken Fry (Leg / Roast)", pack: "Restaurant", industry: "restaurant", price: 99, stock: 240, status: "active" },
  { sku: "EM-FC-03", name: "Chicken Bucket (5pcs)", pack: "Restaurant", industry: "restaurant", price: 449, stock: 80, status: "active" },
  { sku: "EM-DRK-01", name: "Mineral Water (250ml)", pack: "Restaurant", industry: "restaurant", price: 20, stock: 600, status: "active" },

  // Jewelry POS Demo Data
  { sku: "JW-001", name: "22K Gold Chain", pack: "Jewelry", industry: "jewelry", price: 115000, stock: 10, status: "active" },
  { sku: "JW-002", name: "Diamond Ring · 18K White Gold", pack: "Jewelry", industry: "jewelry", price: 48000, stock: 6, status: "active" },
  { sku: "JW-003", name: "Silver Bangle Pair · 925", pack: "Jewelry", industry: "jewelry", price: 3500, stock: 25, status: "active" },
  { sku: "JW-004", name: "22K Bridal Har Necklace", pack: "Jewelry", industry: "jewelry", price: 380000, stock: 3, status: "active" },
  { sku: "JW-005", name: "22K Gold Kulla Bangle Set (4 Pcs)", pack: "Jewelry", industry: "jewelry", price: 290000, stock: 5, status: "active" },
  { sku: "JW-006", name: "Platinum Solitaire Engagement Ring", pack: "Jewelry", industry: "jewelry", price: 75000, stock: 4, status: "active" },
  { sku: "JW-007", name: "21K Gold Earring Tops", pack: "Jewelry", industry: "jewelry", price: 36000, stock: 12, status: "active" },
  { sku: "JW-008", name: "22K Gold Jhumka Earrings", pack: "Jewelry", industry: "jewelry", price: 135000, stock: 8, status: "active" },
  { sku: "JW-009", name: "18K Rose Gold Diamond Pendant", pack: "Jewelry", industry: "jewelry", price: 34000, stock: 9, status: "active" },
  { sku: "JW-010", name: "22K Gold Pearl Drop Necklace", pack: "Jewelry", industry: "jewelry", price: 210000, stock: 4, status: "active" },
  { sku: "JW-011", name: "22K Heavy Mens Gold Bracelet", pack: "Jewelry", industry: "jewelry", price: 235000, stock: 6, status: "active" },
  { sku: "JW-012", name: "925 Silver Payal / Anklet Pair", pack: "Jewelry", industry: "jewelry", price: 2400, stock: 30, status: "active" },
  { sku: "JW-013", name: "22K Crown Tiara Gold Ring", pack: "Jewelry", industry: "jewelry", price: 58000, stock: 7, status: "active" },
  { sku: "JW-014", name: "18K Yellow Gold Emerald Ring", pack: "Jewelry", industry: "jewelry", price: 68000, stock: 5, status: "active" },
  { sku: "JW-015", name: "22K Gold Mangalsutra Pendant", pack: "Jewelry", industry: "jewelry", price: 92000, stock: 8, status: "active" },
  { sku: "JW-016", name: "22K Gold Nose Pin / Noth", pack: "Jewelry", industry: "jewelry", price: 12000, stock: 40, status: "active" },
  { sku: "JW-017", name: "Platinum Mens Wedding Band", pack: "Jewelry", industry: "jewelry", price: 82000, stock: 5, status: "active" },
  { sku: "JW-018", name: "22K Royal Choker Necklace", pack: "Jewelry", industry: "jewelry", price: 340000, stock: 2, status: "active" },
  { sku: "JW-019", name: "18K Blue Sapphire Earrings", pack: "Jewelry", industry: "jewelry", price: 78000, stock: 6, status: "active" },
  { sku: "JW-020", name: "22K Stamped Gold Coin (5g)", pack: "Jewelry", industry: "jewelry", price: 44000, stock: 50, status: "active" },

  // Electronics POS Demo Data
  { sku: "EL-001", name: "Galaxy A55 5G", pack: "Electronics", industry: "electronics", price: 42990, stock: 8, status: "active" },
  { sku: "EL-002", name: "Redmi Note 13 Pro", pack: "Electronics", industry: "electronics", price: 28999, stock: 14, status: "active" },
  { sku: "EL-003", name: "USB-C Hub 7-in-1", pack: "Electronics", industry: "electronics", price: 3200, stock: 32, status: "active" },
  { sku: "EL-004", name: '55" 4K Smart TV', pack: "Electronics", industry: "electronics", price: 89900, stock: 3, status: "active" },
  { sku: "EL-005", name: "iPhone 15 Pro 128GB", pack: "Electronics", industry: "electronics", price: 139900, stock: 5, status: "active" },
  { sku: "EL-006", name: 'MacBook Air M3 15"', pack: "Electronics", industry: "electronics", price: 178000, stock: 4, status: "active" },
  { sku: "EL-007", name: "WH-1000XM5 Headphones", pack: "Electronics", industry: "electronics", price: 36500, stock: 10, status: "active" },
  { sku: "EL-008", name: "Inverter AC 1.5 Ton", pack: "Electronics", industry: "electronics", price: 64500, stock: 6, status: "active" },
  { sku: "EL-009", name: "Direct Cool Refrigerator 252L", pack: "Electronics", industry: "electronics", price: 41900, stock: 7, status: "active" },
  { sku: "EL-010", name: "Front Load Washing Machine 8kg", pack: "Electronics", industry: "electronics", price: 58900, stock: 5, status: "active" },
  { sku: "EL-011", name: "Mechanical Gaming Keyboard", pack: "Electronics", industry: "electronics", price: 8500, stock: 18, status: "active" },
  { sku: "EL-012", name: "Wireless Ergonomic Mouse", pack: "Electronics", industry: "electronics", price: 11500, stock: 22, status: "active" },
  { sku: "EL-013", name: '27" 4K IPS Monitor', pack: "Electronics", industry: "electronics", price: 54900, stock: 6, status: "active" },
  { sku: "EL-014", name: "Wi-Fi 6 Mesh Router System", pack: "Electronics", industry: "electronics", price: 14500, stock: 12, status: "active" },
  { sku: "EL-015", name: "Soundbar 3.1ch with Subwoofer", pack: "Electronics", industry: "electronics", price: 27500, stock: 9, status: "active" },
  { sku: "EL-016", name: "Smartwatch Series 9 45mm", pack: "Electronics", industry: "electronics", price: 52000, stock: 8, status: "active" },
  { sku: "EL-017", name: "20000mAh Fast Power Bank", pack: "Electronics", industry: "electronics", price: 2400, stock: 40, status: "active" },
  { sku: "EL-018", name: "Portable Bluetooth Speaker", pack: "Electronics", industry: "electronics", price: 16800, stock: 15, status: "active" },
  { sku: "EL-019", name: "Mirrorless Camera 24.2MP", pack: "Electronics", industry: "electronics", price: 148500, stock: 3, status: "active" },
  { sku: "EL-020", name: "Microwave Oven 23L Grill", pack: "Electronics", industry: "electronics", price: 14900, stock: 11, status: "active" },
  { sku: "OP-001",   name: "Metal Full-Rim Frame · Black", pack: "Optical",     industry: "optical-shop",  price: 1200,  stock: 45,  status: "active"   },
  { sku: "OP-002",   name: "Rimless Titanium Frame",       pack: "Optical",     industry: "optical-shop",  price: 2800,  stock: 12,  status: "active"   },
  { sku: "SG-001",   name: "Surgical Gloves · M",          pack: "Surgical",    industry: "surgical-shop", price: 280,   stock: 120, status: "active"   },
  { sku: "SG-002",   name: "3-Ply Surgical Mask (50pcs)",  pack: "Surgical",    industry: "surgical-shop", price: 350,   stock: 90,  status: "active"   },
];

export const demoPayments = [
  { id: "pay1",  payment_type: "sale",    method: "cash",   direction: "in",  amount: 4890,  created_at: new Date(Date.now() - 1000*60*10).toISOString() },
  { id: "pay2",  payment_type: "sale",    method: "card",   direction: "in",  amount: 1240,  created_at: new Date(Date.now() - 1000*60*20).toISOString() },
  { id: "pay3",  payment_type: "sale",    method: "bkash",  direction: "in",  amount: 320,   created_at: new Date(Date.now() - 1000*60*30).toISOString() },
  { id: "pay4",  payment_type: "sale",    method: "cash",   direction: "in",  amount: 7820,  created_at: new Date(Date.now() - 1000*60*40).toISOString() },
  { id: "pay5",  payment_type: "refund",  method: "cash",   direction: "out", amount: 990,   created_at: new Date(Date.now() - 1000*60*50).toISOString() },
  { id: "pay6",  payment_type: "sale",    method: "nagad",  direction: "in",  amount: 3450,  created_at: new Date(Date.now() - 1000*60*70).toISOString() },
  { id: "pay7",  payment_type: "sale",    method: "cash",   direction: "in",  amount: 660,   created_at: new Date(Date.now() - 1000*60*90).toISOString() },
  { id: "pay8",  payment_type: "sale",    method: "card",   direction: "in",  amount: 12400, created_at: new Date(Date.now() - 1000*60*120).toISOString() },
  { id: "pay9",  payment_type: "sale",    method: "cash",   direction: "in",  amount: 880,   created_at: new Date(Date.now() - 1000*60*150).toISOString() },
  { id: "pay10", payment_type: "sale",    method: "bkash",  direction: "in",  amount: 5600,  created_at: new Date(Date.now() - 1000*60*180).toISOString() },
  { id: "pay11", payment_type: "sale",    method: "cash",   direction: "in",  amount: 2200,  created_at: new Date(Date.now() - 86400000).toISOString() },
  { id: "pay12", payment_type: "sale",    method: "card",   direction: "in",  amount: 440,   created_at: new Date(Date.now() - 86400000*2).toISOString() },
  { id: "pay13", payment_type: "expense", method: "cash",   direction: "out", amount: 1200,  created_at: new Date(Date.now() - 86400000*2).toISOString() },
  { id: "pay14", payment_type: "sale",    method: "nagad",  direction: "in",  amount: 9100,  created_at: new Date(Date.now() - 86400000*3).toISOString() },
  { id: "pay15", payment_type: "sale",    method: "cash",   direction: "in",  amount: 3800,  created_at: new Date(Date.now() - 86400000*3).toISOString() },
];

export const offers = [
  { id: "o1",  name: "End-of-season 30%",            scope: "Fashion · all stores",     type: "percent", value: 30,   active: true  },
  { id: "o2",  name: "Buy 2 Get 1 — Shirts",          scope: "Men · Shirts",             type: "BOGO",    value: 1,    active: true  },
  { id: "o3",  name: "Flat ৳200 off above ৳2000",    scope: "All",                      type: "flat",    value: 200,  active: false },
  { id: "o4",  name: "Eid Special 20%",               scope: "Fashion · Ethnic",         type: "percent", value: 20,   active: true  },
  { id: "o5",  name: "Pharmacy Bundle ৳50 off",       scope: "Pharmacy · 3+ items",      type: "flat",    value: 50,   active: true  },
  { id: "o6",  name: "Grocery Combo — Rice+Oil",      scope: "Grocery combos",           type: "flat",    value: 80,   active: false },
  { id: "o7",  name: "Electronics 5% off Card",       scope: "Electronics · card pay",   type: "percent", value: 5,    active: true  },
  { id: "o8",  name: "Buy 3 Get 1 — Snacks",          scope: "Grocery · Snacks",         type: "BOGO",    value: 1,    active: true  },
  { id: "o9",  name: "Winter Warm-up 15%",            scope: "Fashion · all",            type: "percent", value: 15,   active: false },
  { id: "o10", name: "Loyalty 2x Points Weekend",     scope: "All · weekend",            type: "points",  value: 2,    active: true  },
];

export const exchanges = [
  { id: "x1", ref: "EXC-0021", original: "INV-026421", reason: "Size change",       from: "M / White",   to: "L / White",   diff: 0,    status: "completed"   },
  { id: "x2", ref: "EXC-0022", original: "INV-026518", reason: "Color preference",  from: "S / Indigo",  to: "S / Madder",  diff: 0,    status: "in-progress" },
  { id: "x3", ref: "EXC-0023", original: "INV-026550", reason: "Defect",            from: "L / Charcoal",to: "L / Charcoal",diff: 0,    status: "pending"     },
];

export const trialRoom = [
  { id: "t1", room: "TR-01", customer: "Walk-in #14", items: 4, since: "12 min", status: "busy"     },
  { id: "t2", room: "TR-02", customer: "Nabila C.",   items: 2, since: "5 min",  status: "busy"     },
  { id: "t3", room: "TR-03", customer: "—",           items: 0, since: "—",      status: "free"     },
  { id: "t4", room: "TR-04", customer: "—",           items: 0, since: "—",      status: "cleaning" },
];

export const prescriptions = [
  { id: "rx1",  ref: "RX-2026-0421", patient: "Mr. Faruq",     doctor: "Dr. S. Hasan",    items: 3, ts: "2026-07-27 09:14", status: "verified" },
  { id: "rx2",  ref: "RX-2026-0422", patient: "Ms. Rumana",    doctor: "Dr. T. Roy",      items: 2, ts: "2026-07-27 09:42", status: "pending"  },
  { id: "rx3",  ref: "RX-2026-0423", patient: "Mr. Hannan",    doctor: "Dr. M. Sultana",  items: 5, ts: "2026-07-27 10:08", status: "verified" },
  { id: "rx4",  ref: "RX-2026-0424", patient: "Ms. Kohinoor",  doctor: "Dr. A. Rahman",   items: 1, ts: "2026-07-27 10:31", status: "verified" },
  { id: "rx5",  ref: "RX-2026-0425", patient: "Mr. Joynul",    doctor: "Dr. S. Karim",    items: 4, ts: "2026-07-27 10:55", status: "pending"  },
  { id: "rx6",  ref: "RX-2026-0426", patient: "Ms. Nasima",    doctor: "Dr. F. Islam",    items: 2, ts: "2026-07-27 11:20", status: "verified" },
  { id: "rx7",  ref: "RX-2026-0427", patient: "Mr. Bellal",    doctor: "Dr. R. Hossain",  items: 6, ts: "2026-07-27 11:45", status: "pending"  },
  { id: "rx8",  ref: "RX-2026-0428", patient: "Ms. Roksana",   doctor: "Dr. N. Ahmed",    items: 3, ts: "2026-07-27 12:05", status: "verified" },
  { id: "rx9",  ref: "RX-2026-0429", patient: "Mr. Mukul",     doctor: "Dr. K. Mondal",   items: 2, ts: "2026-07-27 12:30", status: "pending"  },
  { id: "rx10", ref: "RX-2026-0430", patient: "Ms. Farida",    doctor: "Dr. B. Dey",      items: 4, ts: "2026-07-27 12:50", status: "verified" },
  { id: "rx11", ref: "RX-2026-0431", patient: "Mr. Shaheen",   doctor: "Dr. S. Hasan",    items: 1, ts: "2026-07-27 13:10", status: "verified" },
  { id: "rx12", ref: "RX-2026-0432", patient: "Ms. Dilruba",   doctor: "Dr. T. Roy",      items: 3, ts: "2026-07-27 13:35", status: "pending"  },
  { id: "rx13", ref: "RX-2026-0433", patient: "Mr. Kamruzzaman",doctor: "Dr. A. Rahman",  items: 5, ts: "2026-07-27 13:55", status: "verified" },
  { id: "rx14", ref: "RX-2026-0434", patient: "Ms. Sadia",     doctor: "Dr. M. Sultana",  items: 2, ts: "2026-07-27 14:15", status: "pending"  },
  { id: "rx15", ref: "RX-2026-0435", patient: "Mr. Alamgir",   doctor: "Dr. F. Islam",    items: 4, ts: "2026-07-27 14:38", status: "verified" },
];

export const dynamicFields = [
  { id: "d1",  pack: "fashion",  entity: "Product", field: "Fabric composition",  type: "Text",      required: false },
  { id: "d2",  pack: "fashion",  entity: "Product", field: "Care instructions",   type: "Long text", required: false },
  { id: "d3",  pack: "fashion",  entity: "Variant", field: "Fit",                 type: "Enum",      required: true  },
  { id: "d4",  pack: "pharmacy", entity: "Product", field: "Therapeutic class",   type: "Enum",      required: true  },
  { id: "d5",  pack: "pharmacy", entity: "Batch",   field: "Cold-chain only",     type: "Boolean",   required: false },
  { id: "d6",  pack: "grocery",  entity: "Product", field: "Expiry date",         type: "Date",      required: true  },
  { id: "d7",  pack: "grocery",  entity: "Product", field: "Country of origin",   type: "Text",      required: false },
  { id: "d8",  pack: "jewelry",  entity: "Product", field: "Karat",               type: "Enum",      required: true  },
  { id: "d9",  pack: "jewelry",  entity: "Product", field: "Stone type",          type: "Text",      required: false },
  { id: "d10", pack: "electronics", entity: "Product", field: "Warranty months",  type: "Number",    required: true  },
];

export const workflows = [
  { id: "w1", name: "Restricted medicine sale",    trigger: "POS · Rx & restricted",    steps: 3, active: true  },
  { id: "w2", name: "Fashion exchange approval",   trigger: "POS · Exchange > ৳5000",   steps: 2, active: true  },
  { id: "w3", name: "Shift variance review",       trigger: "Shift close · variance >2%",steps: 2, active: true  },
  { id: "w4", name: "Purchase order release",      trigger: "PO > ৳100,000",             steps: 4, active: false },
];

export const demoAuditLogs = [
  { id: "al1",  action: "login",            entity_type: "user",    entity_id: "usr-admin",     created_at: "2026-07-27T09:00:00Z", detail: { email: "admin@pulse.pos" } },
  { id: "al2",  action: "sale_complete",    entity_type: "sale",    entity_id: "INV-026601",    created_at: "2026-07-27T09:12:00Z", detail: { total: 4890, tender: "card" } },
  { id: "al3",  action: "sale_complete",    entity_type: "sale",    entity_id: "INV-026602",    created_at: "2026-07-27T09:31:00Z", detail: { total: 1240, tender: "cash" } },
  { id: "al4",  action: "product_create",   entity_type: "product", entity_id: "FASH-004",      created_at: "2026-07-27T09:45:00Z", detail: { sku: "FASH-004", name: "Kids Summer Frock" } },
  { id: "al5",  action: "price_change",     entity_type: "product", entity_id: "FASH-001",      created_at: "2026-07-27T10:00:00Z", detail: { old: 1190, new: 1290 } },
  { id: "al6",  action: "sale_complete",    entity_type: "sale",    entity_id: "INV-026603",    created_at: "2026-07-27T10:22:00Z", detail: { total: 3450, tender: "bkash" } },
  { id: "al7",  action: "purchase_receive", entity_type: "purchase",entity_id: "PO-2026-0128",  created_at: "2026-07-27T10:35:00Z", detail: { supplier: "Demo Meat Supplier", total: 38400 } },
  { id: "al8",  action: "stock_adjust",     entity_type: "product", entity_id: "GROC-002",      created_at: "2026-07-27T11:00:00Z", detail: { reason: "Damage write-off", qty: -5 } },
  { id: "al9",  action: "login",            entity_type: "user",    entity_id: "usr-cashier-1", created_at: "2026-07-27T11:15:00Z", detail: { email: "mahin@pulse.pos" } },
  { id: "al10", action: "sale_complete",    entity_type: "sale",    entity_id: "INV-026608",    created_at: "2026-07-27T11:25:00Z", detail: { total: 12400, tender: "card" } },
  { id: "al11", action: "customer_create",  entity_type: "customer",entity_id: "CUS-015",       created_at: "2026-07-27T11:42:00Z", detail: { name: "Lutfun Nahar", phone: "+880 1716-660015" } },
  { id: "al12", action: "sale_refund",      entity_type: "sale",    entity_id: "INV-026605",    created_at: "2026-07-27T11:58:00Z", detail: { amount: 990, reason: "Customer return" } },
  { id: "al13", action: "offer_create",     entity_type: "offer",   entity_id: "o10",           created_at: "2026-07-27T12:10:00Z", detail: { name: "Loyalty 2x Points Weekend" } },
  { id: "al14", action: "pack_update",      entity_type: "tenant",  entity_id: "PULSE-DEMO",    created_at: "2026-07-27T12:30:00Z", detail: { pack: "grocery", enabled: true } },
  { id: "al15", action: "report_export",    entity_type: "report",  entity_id: "sales-summary", created_at: "2026-07-27T12:48:00Z", detail: { format: "csv", period: "7d" } },
];

export const stockLedger = [
  { id: "l1",  ts: "2026-07-27 09:14", sku: "MNS-SHRT-2406-WHT-M-SLM", name: "Oxford Cotton Shirt · White",   store: "DHK-01", type: "Sale",        qty: -1,  price: 1850, total: 1850, balance: 5   },
  { id: "l2",  ts: "2026-07-27 09:31", sku: "NPA-500-T10",              name: "Napa Extra 500mg Tablet",     store: "DHK-02", type: "Sale",        qty: -20, price: 12,   total: 240,  balance: 1500},
  { id: "l3",  ts: "2026-07-27 09:48", sku: "WMN-KRT-1188-IND-M-REG",  name: "Women Kurti Indigo · Regular", store: "DHK-01", type: "Transfer-in", qty: 4,   price: 2450, total: 9800, balance: 8   },
  { id: "l4",  ts: "2026-07-27 10:05", sku: "SEC-20-C30",               name: "Secrin 20mg Capsule",          store: "DHK-02", type: "Adjustment",  qty: -5,  price: 35,   total: 175,  balance: 815 },
  { id: "l5",  ts: "2026-07-27 10:22", sku: "AMD-5-T28",                name: "Amodis 5mg Tablet",           store: "DHK-02", type: "GRN",         qty: 200, price: 8,    total: 1600, balance: 660 },
  { id: "l6",  ts: "2026-07-27 10:38", sku: "FASH-002",                 name: "Denim Slim Jeans",             store: "DHK-01", type: "Sale",        qty: -2,  price: 2200, total: 4400, balance: 41  },
  { id: "l7",  ts: "2026-07-27 10:54", sku: "GROC-001",                 name: "Basmati Rice 5kg",             store: "SYL-01", type: "Sale",        qty: -5,  price: 680,  total: 3400, balance: 94  },
  { id: "l8",  ts: "2026-07-27 11:10", sku: "ELEC-001",                 name: "Sony Wireless Headphone",      store: "DHK-01", type: "Sale",        qty: -1,  price: 4500, total: 4500, balance: 98  },
  { id: "l9",  ts: "2026-07-27 11:25", sku: "PHRM-001",                 name: "Paracetamol Syrup 100ml",     store: "DHK-02", type: "Sale",        qty: -30, price: 45,   total: 1350, balance: 920 },
  { id: "l10", ts: "2026-07-27 11:41", sku: "BEEF-001",                 name: "Premium Beef Cut 1kg",         store: "DHK-01", type: "GRN",         qty: 50,  price: 780,  total: 39000,balance: 147 },
  { id: "l11", ts: "2026-07-27 11:58", sku: "GROC-002",                 name: "Sunflower Oil 2L",             store: "DHK-01", type: "Adjustment",  qty: -5,  price: 360,  total: 1800, balance: 73  },
  { id: "l12", ts: "2026-07-27 12:15", sku: "PHRM-004",                 name: "Ceevit 250mg Chewable",       store: "DHK-02", type: "Sale",        qty: -10, price: 25,   total: 250,  balance: 270 },
  { id: "l13", ts: "2026-07-27 12:32", sku: "FASH-003",                 name: "Casual Polo T-Shirt",          store: "CTG-01", type: "Transfer-in", qty: 8,   price: 850,  total: 6800, balance: 30  },
  { id: "l14", ts: "2026-07-27 12:48", sku: "SG-001",                   name: "Surgical Latex Gloves L",     store: "DHK-01", type: "Sale",        qty: -4,  price: 450,  total: 1800, balance: 116 },
  { id: "l15", ts: "2026-07-27 13:05", sku: "JEWL-002",                 name: "Silver Pendant 925",           store: "DHK-01", type: "Sale",        qty: -1,  price: 3200, total: 3200, balance: 17  },
];

export const lowStock = [
  { sku: "MNS-SHRT-2406-WHT-L-SLM", name: "Oxford Button-Down · L · White",   store: "DHK-01", qty: 2,  reorder: 8  },
  { sku: "MNS-SHRT-2406-BLU-M-SLM", name: "Oxford Button-Down · M · Indigo",  store: "DHK-01", qty: 0,  reorder: 6  },
  { sku: "TRM-50-T10",               name: "Tramadex 50mg · Tablet",            store: "DHK-02", qty: 90, reorder: 120},
  { sku: "FASH-004",                 name: "Kids Summer Frock",                 store: "CTG-01", qty: 3,  reorder: 10 },
  { sku: "JEWL-001",                 name: "22K Gold Ring",                     store: "DHK-01", qty: 2,  reorder: 5  },
];

export const salesTrend = [
  { day: "Mon", revenue: 82000,  orders: 142 },
  { day: "Tue", revenue: 96000,  orders: 167 },
  { day: "Wed", revenue: 74000,  orders: 128 },
  { day: "Thu", revenue: 118000, orders: 191 },
  { day: "Fri", revenue: 142000, orders: 224 },
  { day: "Sat", revenue: 168000, orders: 268 },
  { day: "Sun", revenue: 134000, orders: 211 },
];

export const paymentMethods = [
  { id: "pm1", name: "Cash",               enabled: true,  fee: "0%",   icon: "💵" },
  { id: "pm2", name: "Card (Visa/MC)",     enabled: true,  fee: "1.8%", icon: "💳" },
  { id: "pm3", name: "bKash",              enabled: true,  fee: "1.4%", icon: "📱" },
  { id: "pm4", name: "Nagad",              enabled: true,  fee: "1.2%", icon: "📱" },
  { id: "pm5", name: "Rocket",             enabled: false, fee: "1.5%", icon: "📱" },
  { id: "pm6", name: "Loyalty points",     enabled: true,  fee: "—",    icon: "⭐" },
  { id: "pm7", name: "Bank Transfer",      enabled: true,  fee: "0%",   icon: "🏦" },
  { id: "pm8", name: "Upay",               enabled: false, fee: "1.3%", icon: "📱" },
];

export const taxGroups = [
  { id: "t1", name: "Standard VAT",         rate: 5,  applies: "All goods" },
  { id: "t2", name: "Reduced (Pharmacy)",   rate: 0,  applies: "Pharmacy items" },
  { id: "t3", name: "Luxury",               rate: 15, applies: "Jewelry, premium fashion" },
  { id: "t4", name: "F&B",                  rate: 5,  applies: "Restaurant, food items" },
];

export const roles = [
  { id: "r1", name: "Cashier",       users: 18, perms: ["POS · sell", "POS · refund (with approval)", "Hold/Resume"] },
  { id: "r2", name: "Shift Manager", users: 6,  perms: ["All cashier", "Approve refunds", "Open/Close shift", "Apply manager discount"] },
  { id: "r3", name: "Store Manager", users: 3,  perms: ["All shift manager", "Inventory", "Purchases", "Reports"] },
  { id: "r4", name: "HQ Admin",      users: 2,  perms: ["Full access · all stores"] },
];

export const receiptTemplates = [
  { id: "rt1", name: "Default 80mm",   pack: "All",      header: "Pulse Retail Group",          footer: "Thank you · returns within 7 days",                 active: true  },
  { id: "rt2", name: "Pharmacy Rx",    pack: "Pharmacy", header: "Pulse Pharmacy · Lic #PH-2024",footer: "Consult your physician before continuing dosage",     active: true  },
  { id: "rt3", name: "Fashion gift",   pack: "Fashion",  header: "Pulse Atelier",               footer: "Exchange within 14 days with tag intact",            active: false },
  { id: "rt4", name: "Grocery 58mm",   pack: "Grocery",  header: "Pulse Fresh Market",          footer: "Check expiry before consuming",                      active: true  },
  { id: "rt5", name: "Jewelry cert.",  pack: "Jewelry",  header: "Pulse Gold & Gems",           footer: "Hallmark certified · BIS approved",                  active: true  },
];

export { fashionStyles, pharmacyItems, genericCatalog, stores };