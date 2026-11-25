import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/lib/app-store";
import { fmtBDT } from "@/lib/pos-data";
import {
  bookstoreCatalog,
  salonCatalog,
  salonStylists,
  hardwareCatalog,
  stationeryCatalog,
  cosmeticsCatalog,
  buildingMaterialsCatalog,
  mobileShopCatalog,
  tailoringCatalog,
  tailoringMasters,
  riceMillCatalog,
  furnitureCatalog,
  opticalCatalog,
  surgicalCatalog,
} from "@/lib/industry-mock";
import { MinimalPos, toPosCatalogItems } from "./minimal-pos";
import type { IndustryPackId } from "@/lib/industry-registry";
import type { PosCatalogItem } from "@/hooks/use-pos-catalog";
import type { CartLine } from "@/lib/app-store";

const bookstoreItems = toPosCatalogItems(bookstoreCatalog, row => ({
  price: row.price,
  barcode: row.isbn,
  meta: {
    isbn: row.isbn,
    author: row.author,
    publisher: row.publisher,
    board: row.board,
    class_level: row.classLevel,
    language: row.language,
    academic_year: row.academicYear,
  },
}));

const salonItems = toPosCatalogItems(salonCatalog, row => ({
  price: row.price,
  meta: {
    item_type: row.type,
    duration_mins: row.durationMins ?? 0,
    gender: row.gender,
    category: row.category,
  },
}));

const hardwareItems = toPosCatalogItems(hardwareCatalog, row => ({
  price: row.price,
  barcode: row.barcode,
  meta: { brand: row.brand, unit: row.unit, category: row.category, warranty_months: row.warrantyMonths ?? 0 },
}));

const stationeryItems = toPosCatalogItems(stationeryCatalog, row => ({
  price: row.price,
  wholesalePrice: row.wholesalePrice,
  barcode: row.barcode,
  meta: { brand: row.brand, school_class: row.schoolClass, pack_qty: row.packQty },
}));

const cosmeticsItems = toPosCatalogItems(cosmeticsCatalog, row => ({
  price: row.price,
  meta: { brand: row.brand, shade: row.shade ?? "", category: row.category, expiry_date: row.expiryDate, mrp: row.mrp },
}));

const buildingItems = toPosCatalogItems(buildingMaterialsCatalog, row => ({
  price: row.price,
  meta: { material: row.material, unit: row.unit, grade: row.grade, brand: row.brand },
}));

const mobileShopItems = toPosCatalogItems(mobileShopCatalog, row => ({
  price: row.price,
  meta: {
    brand: row.brand,
    model: row.model,
    storage: row.storage ?? "",
    category: row.category,
    serialized: row.serialized,
    warranty_months: row.warrantyMonths,
  },
}));

const tailoringItems = toPosCatalogItems(tailoringCatalog, row => ({
  price: row.price,
  meta: {
    item_type: row.type,
    garment_type: row.garment,
    fabric: row.fabric ?? "",
    lead_days: row.leadDays,
  },
}));

const furnitureItems = toPosCatalogItems(furnitureCatalog, row => ({
  price: row.price,
  meta: {
    category: row.category,
    material: row.material,
    set_pieces: row.setPieces,
    assembly_fee: row.assemblyFee,
    lead_days: row.leadDays,
  },
}));

const opticalItems = toPosCatalogItems(opticalCatalog, row => ({
  price: row.price,
  meta: {
    category: row.category,
    brand: row.brand,
    lens_power: row.lensPower ?? "",
    frame_size: row.frameSize ?? "",
    coating: row.coating ?? "",
  },
}));

const surgicalItems = toPosCatalogItems(surgicalCatalog, row => ({
  price: row.price,
  meta: {
    category: row.category,
    brand: row.brand,
    sterile: row.sterile,
    batch_no: row.batchNo,
    expiry_date: row.expiryDate,
    unit: row.unit,
    surgical_grade: row.surgicalGrade ?? "",
  },
}));

export function SalonPos() {
  const app = useApp();
  const [stylist, setStylist] = useState("Walk-in");

  return (
    <MinimalPos
      industry="salon"
      title="Salon & Parlor POS"
      subtitle="Services · retail · stylist assignment"
      receiptNote={`Stylist: ${stylist}`}
      demoCatalog={salonItems}
      headerBadges={
        app.isFeatureEnabled("salon.stylist") ? (
          <Select value={stylist} onValueChange={setStylist}>
            <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {salonStylists.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : null
      }
      cardBadge={item => String(item.meta?.item_type ?? "service") === "service" ? "Service" : "Product"}
      cardSubtitle={item => {
        const mins = item.meta?.duration_mins;
        const gender = item.meta?.gender;
        return mins ? `${gender} · ${mins} min` : String(gender ?? "");
      }}
      mapCartExtras={() => ({ stylist })}
      cartLineExtra={line => line.extras?.stylist ? (
        <div className="text-[10px] text-muted-foreground">Stylist: {String(line.extras.stylist)}</div>
      ) : null}
    />
  );
}

export function MobileShopPos() {
  const app = useApp();
  const [imei, setImei] = useState("");

  return (
    <MinimalPos
      industry="mobile-shop"
      title="Mobile & Accessories POS"
      subtitle="Phones · chargers · cases · optional IMEI · bKash friendly"
      receiptNote={app.isFeatureEnabled("mobile.bkash_note") ? "bKash / Nagad payment accepted" : undefined}
      demoCatalog={mobileShopItems}
      headerBadges={
        app.isFeatureEnabled("mobile.imei_optional") ? (
          <Input
            value={imei}
            onChange={e => setImei(e.target.value)}
            placeholder="IMEI (optional)"
            className="h-7 w-[140px] font-mono text-xs"
          />
        ) : null
      }
      cardBadge={item => String(item.meta?.brand ?? "Mobile")}
      cardSubtitle={item => {
        const storage = item.meta?.storage;
        const cat = item.meta?.category;
        return [String(item.meta?.model ?? ""), storage ? String(storage) : "", String(cat ?? "")].filter(Boolean).join(" · ");
      }}
      mapCartExtras={item => ({
        brand: item.meta?.brand,
        model: item.meta?.model,
        ...(item.meta?.serialized && imei.trim() ? { imei: imei.trim() } : {}),
        warranty_months: item.meta?.warranty_months,
      })}
      cartLineExtra={line => (
        <div className="text-[10px] text-muted-foreground">
          {String(line.extras?.model ?? "")}
          {line.extras?.imei ? ` · IMEI ${String(line.extras.imei)}` : ""}
        </div>
      )}
    />
  );
}

export function TailoringPos() {
  const app = useApp();
  const [master, setMaster] = useState("Walk-in");
  const [alteration, setAlteration] = useState("Hem");

  return (
    <MinimalPos
      industry="tailoring"
      title="Tailoring & Boutique POS"
      subtitle="Alteration · stitching · fabric · ready-made boutique"
      receiptNote={`Master: ${master}`}
      demoCatalog={tailoringItems}
      headerBadges={
        <>
          {app.isFeatureEnabled("tailoring.tailor_assign") && (
            <Select value={master} onValueChange={setMaster}>
              <SelectTrigger className="h-7 w-[140px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {tailoringMasters.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {app.isFeatureEnabled("tailoring.alteration") && (
            <Select value={alteration} onValueChange={setAlteration}>
              <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Hem", "Sleeve", "Waist", "Full stitch", "Embroidery"].map(a => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </>
      }
      cardBadge={item => String(item.meta?.item_type ?? "Job")}
      cardSubtitle={item => {
        const days = item.meta?.lead_days;
        return days ? `${String(item.meta?.garment_type ?? "")} · ${days} day(s)` : String(item.meta?.garment_type ?? "");
      }}
      mapCartExtras={item => ({
        master,
        alteration_task: String(item.meta?.item_type) === "alteration" ? alteration : undefined,
        lead_days: item.meta?.lead_days,
        fabric: item.meta?.fabric,
      })}
      cartLineExtra={line => (
        <div className="text-[10px] text-muted-foreground">
          {line.extras?.master ? `Master: ${String(line.extras.master)}` : ""}
          {line.extras?.alteration_task ? ` · ${String(line.extras.alteration_task)}` : ""}
        </div>
      )}
    />
  );
}

export function FurniturePos() {
  return (
    <MinimalPos
      industry="furniture"
      title="Furniture POS"
      subtitle="Bed · sofa · wardrobe · piece or set · delivery & assembly"
      receiptNote="Assembly & delivery on invoice"
      demoCatalog={furnitureItems}
      cardBadge={item => String(item.meta?.category ?? "Furniture")}
      cardSubtitle={item => `${String(item.meta?.material ?? "")} · ${String(item.meta?.set_pieces ?? 1)} pc`}
      cardFooter={item => item.meta?.assembly_fee ? (
        <span className="text-[10px] text-muted-foreground">Assembly +{fmtBDT(Number(item.meta.assembly_fee))}</span>
      ) : null}
      mapCartExtras={item => ({
        material: item.meta?.material,
        set_pieces: item.meta?.set_pieces,
        assembly_fee: item.meta?.assembly_fee,
        lead_days: item.meta?.lead_days,
      })}
      cartLineExtra={line => line.extras?.assembly_fee ? (
        <div className="text-[10px] text-muted-foreground">
          {String(line.extras.material ?? "")} · Assembly {fmtBDT(Number(line.extras.assembly_fee))}
        </div>
      ) : null}
    />
  );
}

/** Demo catalog items for Universal POS when BD packs are enabled. */
export function bdUniversalCatalogItems(
  enabled: (id: IndustryPackId) => boolean,
): Array<PosCatalogItem & { pack: IndustryPackId; tag: string }> {
  const rows: Array<{ pack: IndustryPackId; tag: string; items: PosCatalogItem[] }> = [
    { pack: "bookstore", tag: "Bookstore", items: bookstoreItems.slice(0, 4) },
    { pack: "salon", tag: "Salon", items: salonItems.slice(0, 4) },
    { pack: "hardware", tag: "Hardware", items: hardwareItems.slice(0, 4) },
    { pack: "stationery", tag: "Stationery", items: stationeryItems.slice(0, 4) },
    { pack: "cosmetics", tag: "Cosmetics", items: cosmeticsItems.slice(0, 4) },
    { pack: "building-materials", tag: "Building", items: buildingItems.slice(0, 4) },
    { pack: "mobile-shop", tag: "Mobile", items: mobileShopItems.slice(0, 4) },
    { pack: "tailoring", tag: "Tailoring", items: tailoringItems.slice(0, 4) },
    { pack: "rice-mill", tag: "Rice Mill", items: toPosCatalogItems(riceMillCatalog.slice(0, 4), row => ({
      price: row.ratePerKg,
      meta: { variety: row.variety, ratePerKg: row.ratePerKg },
    })) },
    { pack: "furniture", tag: "Furniture", items: furnitureItems.slice(0, 4) },
    { pack: "optical-shop", tag: "Optical", items: opticalItems.slice(0, 4) },
    { pack: "surgical-shop", tag: "Surgical", items: surgicalItems.slice(0, 4) },
  ];
  return rows.filter(r => enabled(r.pack)).flatMap(r => r.items.map(i => ({ ...i, pack: r.pack, tag: r.tag })));
}
