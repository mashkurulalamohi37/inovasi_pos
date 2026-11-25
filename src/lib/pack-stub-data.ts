import {
  bookstoreCatalog,
  salonCatalog,
  salonStylists,
  hardwareCatalog,
  stationeryCatalog,
  cosmeticsCatalog,
  mobileShopCatalog,
  opticalCatalog,
  surgicalCatalog,
} from "@/lib/industry-mock";
import { fmtBDT } from "@/lib/pos-data";

export type StubColumn = { key: string; label: string; align?: "left" | "right" };
export type StubTable = { columns: StubColumn[]; rows: Record<string, string | number>[] };

const bookstorePublishers = Array.from(
  new Map(bookstoreCatalog.map(b => [b.publisher, { publisher: b.publisher, titles: 0, board: b.board }])).values(),
).map(p => ({
  ...p,
  titles: bookstoreCatalog.filter(b => b.publisher === p.publisher).length,
}));

const hardwareBrands = Array.from(
  new Set(hardwareCatalog.map(h => h.brand)),
).map(brand => ({
  brand,
  skus: hardwareCatalog.filter(h => h.brand === brand).length,
  category: hardwareCatalog.find(h => h.brand === brand)?.category ?? "—",
}));

const cosmeticBrands = Array.from(
  new Set(cosmeticsCatalog.map(c => c.brand)),
).map(brand => ({
  brand,
  skus: cosmeticsCatalog.filter(c => c.brand === brand).length,
}));

export const PACK_STUB_TABLES: Record<string, StubTable> = {
  "/app/bookstore/academic": {
    columns: [
      { key: "sku", label: "SKU" },
      { key: "name", label: "Title" },
      { key: "classLevel", label: "Class" },
      { key: "board", label: "Board" },
      { key: "language", label: "Language" },
      { key: "price", label: "Price", align: "right" },
    ],
    rows: bookstoreCatalog.map(b => ({
      sku: b.sku,
      name: b.name,
      classLevel: b.classLevel,
      board: b.board,
      language: b.language,
      price: b.price,
    })),
  },
  "/app/bookstore/publishers": {
    columns: [
      { key: "publisher", label: "Publisher" },
      { key: "board", label: "Board" },
      { key: "titles", label: "Titles", align: "right" },
    ],
    rows: bookstorePublishers,
  },
  "/app/salon/services": {
    columns: [
      { key: "sku", label: "SKU" },
      { key: "name", label: "Service" },
      { key: "category", label: "Category" },
      { key: "gender", label: "Gender" },
      { key: "durationMins", label: "Mins", align: "right" },
      { key: "price", label: "Price", align: "right" },
    ],
    rows: salonCatalog
      .filter(s => s.type === "service")
      .map(s => ({
        sku: s.sku,
        name: s.name,
        category: s.category,
        gender: s.gender,
        durationMins: s.durationMins ?? 0,
        price: s.price,
      })),
  },
  "/app/salon/stylists": {
    columns: [
      { key: "name", label: "Stylist" },
      { key: "specialty", label: "Specialty" },
      { key: "bookings", label: "Bookings today", align: "right" },
      { key: "status", label: "Status" },
    ],
    rows: salonStylists.map((name, i) => ({
      name,
      specialty: ["Hair", "Skin", "Bridal", "Color", "Walk-in"][i] ?? "General",
      bookings: [4, 6, 2, 5, 0][i] ?? 3,
      status: name === "Walk-in" ? "Available" : "On floor",
    })),
  },
  "/app/hardware/brands": {
    columns: [
      { key: "brand", label: "Brand" },
      { key: "category", label: "Category" },
      { key: "skus", label: "SKUs", align: "right" },
    ],
    rows: hardwareBrands,
  },
  "/app/stationery/school-lists": {
    columns: [
      { key: "sku", label: "SKU" },
      { key: "name", label: "Item" },
      { key: "schoolClass", label: "Class" },
      { key: "brand", label: "Brand" },
      { key: "packQty", label: "Pack", align: "right" },
      { key: "price", label: "Price", align: "right" },
    ],
    rows: stationeryCatalog.map(s => ({
      sku: s.sku,
      name: s.name,
      schoolClass: s.schoolClass,
      brand: s.brand,
      packQty: s.packQty,
      price: s.price,
    })),
  },
  "/app/cosmetics/brands": {
    columns: [
      { key: "brand", label: "Brand" },
      { key: "skus", label: "SKUs", align: "right" },
    ],
    rows: cosmeticBrands,
  },
  "/app/cosmetics/expiry": {
    columns: [
      { key: "sku", label: "SKU" },
      { key: "name", label: "Product" },
      { key: "brand", label: "Brand" },
      { key: "expiryDate", label: "Expiry" },
      { key: "mrp", label: "MRP", align: "right" },
    ],
    rows: cosmeticsCatalog.map(c => ({
      sku: c.sku,
      name: c.name,
      brand: c.brand,
      expiryDate: c.expiryDate,
      mrp: c.mrp,
    })),
  },
  "/app/building-materials/contractors": {
    columns: [
      { key: "name", label: "Contractor" },
      { key: "site", label: "Active site" },
      { key: "phone", label: "Phone" },
      { key: "openOrders", label: "Open orders", align: "right" },
    ],
    rows: [
      { name: "Rahim Construction", site: "Gulshan Tower · Block B", phone: "01711-223344", openOrders: 3 },
      { name: "Metro Builders Ltd", site: "Mirpur Housing Phase 3", phone: "01822-556677", openOrders: 5 },
      { name: "Coastal Developers", site: "Chattogram Port Road", phone: "01933-889900", openOrders: 2 },
      { name: "Green Villa Projects", site: "Uttara Sector 7", phone: "01644-112233", openOrders: 1 },
    ],
  },
  "/app/building-materials/delivery": {
    columns: [
      { key: "deliveryNo", label: "Delivery #" },
      { key: "contractor", label: "Contractor" },
      { key: "material", label: "Material" },
      { key: "qty", label: "Qty" },
      { key: "scheduled", label: "Scheduled" },
      { key: "status", label: "Status" },
    ],
    rows: [
      { deliveryNo: "BM-DLV-1041", contractor: "Rahim Construction", material: "Holcim Cement · 50kg", qty: "120 bags", scheduled: "2026-07-05", status: "dispatched" },
      { deliveryNo: "BM-DLV-1042", contractor: "Metro Builders Ltd", material: "BSRM Rod · 10mm", qty: "2 ton", scheduled: "2026-07-06", status: "scheduled" },
      { deliveryNo: "BM-DLV-1043", contractor: "Coastal Developers", material: "RAK Ceramic Tile", qty: "800 sqft", scheduled: "2026-07-04", status: "delivered" },
    ],
  },
  "/app/mobile-shop/stock": {
    columns: [
      { key: "sku", label: "SKU" },
      { key: "name", label: "Model" },
      { key: "brand", label: "Brand" },
      { key: "storage", label: "Storage" },
      { key: "category", label: "Category" },
      { key: "price", label: "Price", align: "right" },
    ],
    rows: mobileShopCatalog.map(m => ({
      sku: m.sku,
      name: m.name,
      brand: m.brand,
      storage: m.storage ?? "—",
      category: m.category,
      price: m.price,
    })),
  },
  "/app/optical-shop/lenses": {
    columns: [
      { key: "sku", label: "SKU" },
      { key: "name", label: "Lens" },
      { key: "brand", label: "Brand" },
      { key: "lensPower", label: "Power" },
      { key: "coating", label: "Coating" },
      { key: "price", label: "Price", align: "right" },
    ],
    rows: opticalCatalog
      .filter(o => o.category === "Lens" || o.category === "Contact lens")
      .map(o => ({
        sku: o.sku,
        name: o.name,
        brand: o.brand,
        lensPower: o.lensPower ?? "—",
        coating: o.coating ?? "—",
        price: o.price,
      })),
  },
  "/app/optical-shop/frames": {
    columns: [
      { key: "sku", label: "SKU" },
      { key: "name", label: "Frame" },
      { key: "brand", label: "Brand" },
      { key: "frameSize", label: "Size" },
      { key: "price", label: "Price", align: "right" },
    ],
    rows: opticalCatalog
      .filter(o => o.category === "Frame")
      .map(o => ({
        sku: o.sku,
        name: o.name,
        brand: o.brand,
        frameSize: o.frameSize ?? "—",
        price: o.price,
      })),
  },
  "/app/surgical-shop/sterile-stock": {
    columns: [
      { key: "sku", label: "SKU" },
      { key: "name", label: "Item" },
      { key: "category", label: "Category" },
      { key: "batchNo", label: "Batch" },
      { key: "surgicalGrade", label: "Grade" },
      { key: "price", label: "Price", align: "right" },
    ],
    rows: surgicalCatalog
      .filter(s => s.sterile)
      .map(s => ({
        sku: s.sku,
        name: s.name,
        category: s.category,
        batchNo: s.batchNo,
        surgicalGrade: s.surgicalGrade ?? "Sterile",
        price: s.price,
      })),
  },
  "/app/surgical-shop/expiry": {
    columns: [
      { key: "sku", label: "SKU" },
      { key: "name", label: "Item" },
      { key: "brand", label: "Brand" },
      { key: "batchNo", label: "Batch" },
      { key: "expiryDate", label: "Expiry" },
      { key: "unit", label: "Unit" },
    ],
    rows: surgicalCatalog.map(s => ({
      sku: s.sku,
      name: s.name,
      brand: s.brand,
      batchNo: s.batchNo,
      expiryDate: s.expiryDate,
      unit: s.unit,
    })),
  },
};

export function formatStubCell(key: string, value: string | number): string {
  if (key === "price" || key === "mrp") return fmtBDT(Number(value));
  return String(value);
}
