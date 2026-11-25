import type { LucideIcon } from "lucide-react";
import {
  Beef, Shirt, Pill, ShoppingBasket, Utensils, Gem, Cpu, Sparkles,
  BookOpen, Scissors, Hammer, PenLine, Sparkle, HardHat,
  Smartphone, Ruler, Wheat, Sofa, Glasses, Syringe, ShoppingBag,
  UtensilsCrossed, Bike,
} from "lucide-react";

export type IndustryPackId =
  | "beef-shop"
  | "fashion"
  | "pharmacy"
  | "grocery"
  | "restaurant"
  | "jewelry"
  | "electronics"
  | "bookstore"
  | "salon"
  | "hardware"
  | "stationery"
  | "cosmetics"
  | "building-materials"
  | "mobile-shop"
  | "tailoring"
  | "rice-mill"
  | "furniture"
  | "optical-shop"
  | "surgical-shop"
  | "super-shop"
  | "crockery"
  | "cycle-toys";

export type PosMode = "universal" | IndustryPackId;

export type FieldType =
  | "text"
  | "number"
  | "date"
  | "dropdown"
  | "checkbox"
  | "file"
  | "barcode"
  | "currency"
  | "weight";

export type FeatureFlagDef = {
  key: string;
  pack: IndustryPackId;
  label: string;
  description: string;
  defaultEnabled: boolean;
};

export type DynamicFieldDef = {
  id: string;
  pack: IndustryPackId;
  entity: string;
  name: string;
  type: FieldType;
  required: boolean;
  visibleInPos: boolean;
  visibleInProduct: boolean;
  visibleInReceipt: boolean;
  visibleInReport: boolean;
  order: number;
  enabled?: boolean;
  allStores?: boolean;
  allCounters?: boolean;
  options?: string[];
  stores?: string[];
  counters?: string[];
};

export type PackRoute = { path: string; label: string; group?: string; featureKey?: string };

/** Admin toggle per back-office sidebar route (path → visible). */
export type PackMenuConfig = Record<string, boolean>;

export type IndustryPackDef = {
  id: IndustryPackId;
  name: string;
  shortName: string;
  description: string;
  icon: LucideIcon;
  gradient: string;
  posRoute: string;
  backOfficeRoutes: PackRoute[];
  reports: string[];
  productFields: string[];
  cartFields: string[];
  posWidgets: string[];
  receiptSections: string[];
};

export type PackScopeConfig = {
  company: boolean;
  store: boolean;
  counter: boolean;
  updatedAt: number;
  updatedBy: string;
};

export const INDUSTRY_PACK_IDS: IndustryPackId[] = [
  "beef-shop", "fashion", "pharmacy", "grocery", "restaurant", "jewelry", "electronics",
  "bookstore", "salon", "hardware", "stationery", "cosmetics", "building-materials",
  "mobile-shop", "tailoring", "rice-mill", "furniture",
  "optical-shop", "surgical-shop", "super-shop", "crockery",
  "cycle-toys",
];

export const POS_MODES: { id: PosMode; label: string }[] = [
  { id: "universal", label: "Universal POS" },
  { id: "beef-shop", label: "Beef Shop POS" },
  { id: "fashion", label: "Fashion POS" },
  { id: "pharmacy", label: "Pharmacy POS" },
  { id: "grocery", label: "Grocery POS" },
  { id: "restaurant", label: "Restaurant POS" },
  { id: "jewelry", label: "Jewelry POS" },
  { id: "electronics", label: "Electronics POS" },
  { id: "bookstore", label: "Bookstore POS" },
  { id: "salon", label: "Salon POS" },
  { id: "hardware", label: "Hardware POS" },
  { id: "stationery", label: "Stationery POS" },
  { id: "cosmetics", label: "Cosmetics POS" },
  { id: "building-materials", label: "Building Materials POS" },
  { id: "mobile-shop", label: "Mobile Shop POS" },
  { id: "tailoring", label: "Tailoring & Boutique POS" },
  { id: "rice-mill", label: "Rice & Atta Mill POS" },
  { id: "furniture", label: "Furniture POS" },
  { id: "optical-shop", label: "Optical Shop POS" },
  { id: "surgical-shop", label: "Surgical Items POS" },
  { id: "super-shop", label: "Super Shop POS" },
  { id: "crockery", label: "Crockery & Kitchenware POS" },
  { id: "cycle-toys", label: "Cycle & Toys POS" },
];

const beefFeatures: FeatureFlagDef[] = [
  { key: "beef.weight_scale", pack: "beef-shop", label: "Weight scale sales", description: "Read weight from connected scale mock", defaultEnabled: true },
  { key: "beef.price_per_kg", pack: "beef-shop", label: "Price per kg", description: "Calculate line amount from rate/kg", defaultEnabled: true },
  { key: "beef.cut_wise", pack: "beef-shop", label: "Cut-wise item sale", description: "Require cut type on each line", defaultEnabled: true },
  { key: "beef.tare_weight", pack: "beef-shop", label: "Tare weight", description: "Subtract container weight", defaultEnabled: true },
  { key: "beef.slaughter_batch", pack: "beef-shop", label: "Slaughter batch", description: "Track slaughter batch on sale", defaultEnabled: false },
  { key: "beef.cold_storage", pack: "beef-shop", label: "Cold storage stock", description: "Batch from cold storage", defaultEnabled: true },
  { key: "beef.expiry", pack: "beef-shop", label: "Expiry tracking", description: "Alert near-expiry meat", defaultEnabled: true },
  { key: "beef.wastage", pack: "beef-shop", label: "Wastage tracking", description: "Record trim/wastage on line", defaultEnabled: true },
  { key: "beef.portioning", pack: "beef-shop", label: "Portioning", description: "Preset portion sizes", defaultEnabled: false },
  { key: "beef.halal_cert", pack: "beef-shop", label: "Halal certificate field", description: "Show halal cert on receipt", defaultEnabled: true },
  { key: "beef.butcher", pack: "beef-shop", label: "Butcher assignment", description: "Assign butcher per sale", defaultEnabled: true },
  { key: "beef.delivery_label", pack: "beef-shop", label: "Delivery packing label", description: "Print delivery label UI", defaultEnabled: false },
];

const fashionFeatures: FeatureFlagDef[] = [
  { key: "fashion.variant_matrix", pack: "fashion", label: "Size/color variant matrix", description: "Matrix UI in back office", defaultEnabled: true },
  { key: "fashion.sku_auto", pack: "fashion", label: "SKU auto generation", description: "Auto SKU from style/size/color", defaultEnabled: true },
  { key: "fashion.barcode_variant", pack: "fashion", label: "Barcode per variant", description: "Unique barcode per variant", defaultEnabled: true },
  { key: "fashion.trial_room", pack: "fashion", label: "Trial room status", description: "Trial room panel in POS", defaultEnabled: true },
  { key: "fashion.exchange", pack: "fashion", label: "Exchange management", description: "Exchange button in POS", defaultEnabled: true },
  { key: "fashion.alteration", pack: "fashion", label: "Alteration order", description: "Alteration flow in POS", defaultEnabled: true },
  { key: "fashion.seasonal", pack: "fashion", label: "Seasonal collection", description: "Filter by season", defaultEnabled: false },
  { key: "fashion.offers", pack: "fashion", label: "Offer campaign", description: "Apply campaign offers", defaultEnabled: true },
  { key: "fashion.offer_campaign", pack: "fashion", label: "Campaign discount (POS)", description: "Apply seasonal campaign discount in cart", defaultEnabled: true },
  { key: "fashion.loyalty", pack: "fashion", label: "Loyalty points", description: "Earn/redeem loyalty", defaultEnabled: true },
  { key: "fashion.stock_variant", pack: "fashion", label: "Stock by size/color", description: "Show variant stock on card", defaultEnabled: true },
];

const pharmacyFeatures: FeatureFlagDef[] = [
  { key: "pharmacy.batch", pack: "pharmacy", label: "Batch tracking", description: "Require batch on sale", defaultEnabled: true },
  { key: "pharmacy.fefo", pack: "pharmacy", label: "FEFO picking", description: "Suggest oldest batch first", defaultEnabled: true },
  { key: "pharmacy.expiry_alert", pack: "pharmacy", label: "Expiry alert", description: "Warn on near-expiry batch", defaultEnabled: true },
  { key: "pharmacy.rx_required", pack: "pharmacy", label: "Prescription required", description: "Rx modal for Rx items", defaultEnabled: true },
  { key: "pharmacy.generic", pack: "pharmacy", label: "Generic name search", description: "Search by generic", defaultEnabled: true },
  { key: "pharmacy.generic_display", pack: "pharmacy", label: "Generic name display", description: "Show generic on cards, cart, receipt", defaultEnabled: true },
  { key: "pharmacy.manufacturer_display", pack: "pharmacy", label: "Manufacturer display", description: "Show manufacturer on cards, cart, receipt", defaultEnabled: true },
  { key: "pharmacy.strength_display", pack: "pharmacy", label: "Strength display", description: "Show strength on cards, cart, receipt", defaultEnabled: true },
  { key: "pharmacy.dosage_form_display", pack: "pharmacy", label: "Dosage form display", description: "Show dosage form on cards, cart, receipt", defaultEnabled: true },
  { key: "pharmacy.restricted", pack: "pharmacy", label: "Restricted medicine log", description: "Manager approval flow", defaultEnabled: true },
  { key: "pharmacy.rx_upload", pack: "pharmacy", label: "Prescription upload", description: "Attach Rx image", defaultEnabled: true },
  { key: "pharmacy.fefo_block_expired", pack: "pharmacy", label: "Block expired batches", description: "Prevent expired batch sale", defaultEnabled: true },
];

const groceryFeatures: FeatureFlagDef[] = [
  { key: "grocery.barcode", pack: "grocery", label: "Barcode scanning", description: "Fast barcode checkout", defaultEnabled: true },
  { key: "grocery.mrp", pack: "grocery", label: "MRP display", description: "Show MRP on product card", defaultEnabled: true },
  { key: "grocery.wholesale", pack: "grocery", label: "Wholesale/retail price", description: "Dual price tiers", defaultEnabled: false },
  { key: "grocery.wholesale_price", pack: "grocery", label: "Wholesale price mode", description: "Retail vs wholesale toggle in POS", defaultEnabled: false },
  { key: "grocery.expiry", pack: "grocery", label: "Expiry tracking", description: "Expiry on perishable items", defaultEnabled: true },
  { key: "grocery.shelf", pack: "grocery", label: "Shelf/location", description: "Show aisle/shelf", defaultEnabled: true },
  { key: "grocery.scale", pack: "grocery", label: "Weighing scale", description: "Weight items by kg", defaultEnabled: true },
  { key: "grocery.bundle", pack: "grocery", label: "Bundle offer", description: "Multi-buy bundles", defaultEnabled: true },
  { key: "grocery.loyalty", pack: "grocery", label: "Loyalty", description: "Loyalty earn/redeem", defaultEnabled: true },
  { key: "grocery.fast_checkout", pack: "grocery", label: "Fast checkout", description: "Minimal touch flow", defaultEnabled: true },
];

const restaurantFeatures: FeatureFlagDef[] = [
  { key: "restaurant.tables", pack: "restaurant", label: "Table management", description: "Table map in POS", defaultEnabled: true },
  { key: "restaurant.kot", pack: "restaurant", label: "KOT", description: "Kitchen order ticket", defaultEnabled: true },
  { key: "restaurant.kds", pack: "restaurant", label: "Kitchen display", description: "Kitchen status panel", defaultEnabled: true },
  { key: "restaurant.waiter", pack: "restaurant", label: "Waiter assignment", description: "Assign waiter per order", defaultEnabled: true },
  { key: "restaurant.modifiers", pack: "restaurant", label: "Menu modifiers", description: "Add-ons and modifiers", defaultEnabled: true },
  { key: "restaurant.combo", pack: "restaurant", label: "Combo meals", description: "Combo item bundles", defaultEnabled: true },
  { key: "restaurant.combo_meals", pack: "restaurant", label: "Combo meal builder", description: "Build combo bundles in POS", defaultEnabled: true },
  { key: "restaurant.recipe", pack: "restaurant", label: "Recipe/ingredients", description: "Recipe cost hint", defaultEnabled: false },
  { key: "restaurant.order_type", pack: "restaurant", label: "Dine-in/takeaway/delivery", description: "Order type selector", defaultEnabled: true },
  { key: "restaurant.service_charge", pack: "restaurant", label: "Service charge", description: "Auto service charge", defaultEnabled: true },
  { key: "restaurant.split_bill", pack: "restaurant", label: "Split bill", description: "Split payment UI", defaultEnabled: true },
];

const jewelryFeatures: FeatureFlagDef[] = [
  { key: "jewelry.metal_type", pack: "jewelry", label: "Metal type", description: "Gold/silver/platinum", defaultEnabled: true },
  { key: "jewelry.purity", pack: "jewelry", label: "Purity/karat", description: "22K/21K/18K etc", defaultEnabled: true },
  { key: "jewelry.weights", pack: "jewelry", label: "Gross/net/stone weight", description: "Weight fields on cart", defaultEnabled: true },
  { key: "jewelry.making_charge", pack: "jewelry", label: "Making charge", description: "Making charge calc", defaultEnabled: true },
  { key: "jewelry.wastage_pct", pack: "jewelry", label: "Wastage percentage", description: "Wastage on gold", defaultEnabled: true },
  { key: "jewelry.certificate", pack: "jewelry", label: "Certificate number", description: "Cert on receipt", defaultEnabled: true },
  { key: "jewelry.repair", pack: "jewelry", label: "Repair order", description: "Repair/estimate flow", defaultEnabled: true },
  { key: "jewelry.gold_rate", pack: "jewelry", label: "Gold rate update", description: "Daily rate panel", defaultEnabled: true },
  { key: "jewelry.buyback", pack: "jewelry", label: "Buyback", description: "Customer metal buyback", defaultEnabled: true },
  { key: "jewelry.estimate", pack: "jewelry", label: "Estimate invoice", description: "Estimate before sale", defaultEnabled: false },
];

const electronicsFeatures: FeatureFlagDef[] = [
  { key: "electronics.serial", pack: "electronics", label: "Serial/IMEI tracking", description: "Require serial on sale", defaultEnabled: true },
  { key: "electronics.warranty", pack: "electronics", label: "Warranty registration", description: "Warranty modal", defaultEnabled: true },
  { key: "electronics.brand_model", pack: "electronics", label: "Brand/model", description: "Show brand model on card", defaultEnabled: true },
  { key: "electronics.accessories", pack: "electronics", label: "Accessories bundle", description: "Suggest accessories", defaultEnabled: true },
  { key: "electronics.service_job", pack: "electronics", label: "Service job card", description: "Service shortcut", defaultEnabled: true },
  { key: "electronics.installation", pack: "electronics", label: "Installation request", description: "Schedule installation", defaultEnabled: false },
  { key: "electronics.return", pack: "electronics", label: "Return/replacement", description: "RMA flow", defaultEnabled: true },
  { key: "electronics.return_replacement", pack: "electronics", label: "RMA / return modal", description: "Dedicated RMA modal in POS", defaultEnabled: true },
  { key: "electronics.supplier_warranty", pack: "electronics", label: "Supplier warranty", description: "Supplier warranty tracking", defaultEnabled: false },
  { key: "electronics.amc", pack: "electronics", label: "AMC/extended warranty", description: "Sell extended warranty", defaultEnabled: true },
  /** Electronics-only EMI / installment payment system — not shared with any other pack. */
  { key: "electronics.emi", pack: "electronics", label: "EMI / Installments", description: "Enable EMI payment option at POS and EMI schedule management", defaultEnabled: true },
];

const bookstoreFeatures: FeatureFlagDef[] = [
  { key: "bookstore.nctb", pack: "bookstore", label: "NCTB / board books", description: "Filter SSC, HSC, primary board titles", defaultEnabled: true },
  { key: "bookstore.isbn_scan", pack: "bookstore", label: "ISBN barcode scan", description: "Lookup by ISBN at checkout", defaultEnabled: true },
  { key: "bookstore.academic_year", pack: "bookstore", label: "Academic year filter", description: "Filter by session (e.g. 2026)", defaultEnabled: true },
  { key: "bookstore.bangla_english", pack: "bookstore", label: "Bangla / English filter", description: "Language tabs in POS catalog", defaultEnabled: true },
  { key: "bookstore.publisher", pack: "bookstore", label: "Publisher on receipt", description: "Show publisher on receipt line", defaultEnabled: true },
];

const salonFeatures: FeatureFlagDef[] = [
  { key: "salon.services", pack: "salon", label: "Service menu", description: "Haircut, facial, spa services in POS", defaultEnabled: true },
  { key: "salon.stylist", pack: "salon", label: "Stylist assignment", description: "Assign stylist per sale line", defaultEnabled: true },
  { key: "salon.appointment", pack: "salon", label: "Walk-in / appointment", description: "Track appointment ref on sale", defaultEnabled: true },
  { key: "salon.membership", pack: "salon", label: "Membership / package", description: "Apply prepaid packages", defaultEnabled: false },
  { key: "salon.product_retail", pack: "salon", label: "Retail product upsell", description: "Sell shampoo, color kits alongside services", defaultEnabled: true },
];

const hardwareFeatures: FeatureFlagDef[] = [
  { key: "hardware.unit_pricing", pack: "hardware", label: "Unit pricing", description: "Piece, dozen, ft, kg pricing", defaultEnabled: true },
  { key: "hardware.barcode", pack: "hardware", label: "Barcode scan", description: "Fast SKU/barcode checkout", defaultEnabled: true },
  { key: "hardware.brand", pack: "hardware", label: "Brand filter", description: "Filter by local/import brand", defaultEnabled: true },
  { key: "hardware.credit_khatian", pack: "hardware", label: "Mudaraba / credit khata", description: "Contractor credit note on receipt", defaultEnabled: false },
  { key: "hardware.warranty", pack: "hardware", label: "Tool warranty", description: "Warranty months on power tools", defaultEnabled: true },
];

const stationeryFeatures: FeatureFlagDef[] = [
  { key: "stationery.school_list", pack: "stationery", label: "School book list", description: "Bundle by school / class list", defaultEnabled: true },
  { key: "stationery.seasonal", pack: "stationery", label: "January rush mode", description: "Peak season fast checkout", defaultEnabled: true },
  { key: "stationery.barcode", pack: "stationery", label: "Barcode scan", description: "Scan pen, copy, rim barcode", defaultEnabled: true },
  { key: "stationery.wholesale", pack: "stationery", label: "Dealer wholesale price", description: "Retail vs dealer price toggle", defaultEnabled: true },
];

const cosmeticsFeatures: FeatureFlagDef[] = [
  { key: "cosmetics.brand", pack: "cosmetics", label: "Brand shelf", description: "Filter Unilever, Marico, local brands", defaultEnabled: true },
  { key: "cosmetics.expiry", pack: "cosmetics", label: "Expiry alert", description: "Warn on near-expiry SKU", defaultEnabled: true },
  { key: "cosmetics.shade", pack: "cosmetics", label: "Shade / variant", description: "Shade code on cart line", defaultEnabled: true },
  { key: "cosmetics.combo_offer", pack: "cosmetics", label: "Combo / gift set", description: "Bundle offers at POS", defaultEnabled: false },
];

const buildingMaterialsFeatures: FeatureFlagDef[] = [
  { key: "building.cement_bag", pack: "building-materials", label: "Cement bag pricing", description: "Per-bag cement/rod pricing", defaultEnabled: true },
  { key: "building.delivery", pack: "building-materials", label: "Site delivery", description: "Delivery address on invoice", defaultEnabled: true },
  { key: "building.credit_contractor", pack: "building-materials", label: "Contractor credit", description: "Allow due/advance on contractor orders via shared ledger", defaultEnabled: true },
  { key: "building.weight_volume", pack: "building-materials", label: "Weight / CFT pricing", description: "Sand, stone by CFT or ton", defaultEnabled: true },
];

const mobileShopFeatures: FeatureFlagDef[] = [
  { key: "mobile.brand_filter", pack: "mobile-shop", label: "Brand tabs", description: "Samsung, Xiaomi, Symphony, Apple filters", defaultEnabled: true },
  { key: "mobile.imei_required", pack: "mobile-shop", label: "IMEI required for handsets", description: "Exact device IMEI selection on serialized phones", defaultEnabled: true },
  { key: "mobile.accessories", pack: "mobile-shop", label: "Accessory upsell", description: "Case, charger bundle suggestions", defaultEnabled: true },
  { key: "mobile.bkash_note", pack: "mobile-shop", label: "bKash / Nagad note", description: "Mobile wallet ref on receipt", defaultEnabled: true },
  { key: "mobile.trade_in", pack: "mobile-shop", label: "Trade-in workflow", description: "Assess, approve, and intake used devices", defaultEnabled: true },
  { key: "mobile.used_phone", pack: "mobile-shop", label: "Used / refurbished", description: "Second-hand phone pricing tier", defaultEnabled: false },
];

const tailoringFeatures: FeatureFlagDef[] = [
  { key: "tailoring.alteration", pack: "tailoring", label: "Alteration orders", description: "Hem, sleeve, fitting job on cart line", defaultEnabled: true },
  { key: "tailoring.measurement", pack: "tailoring", label: "Measurement capture", description: "Chest, length, sleeve notes", defaultEnabled: true },
  { key: "tailoring.due_date", pack: "tailoring", label: "Due date tracking", description: "Promise date on alteration job", defaultEnabled: true },
  { key: "tailoring.tailor_assign", pack: "tailoring", label: "Tailor assignment", description: "Assign master tailor per job", defaultEnabled: true },
  { key: "tailoring.fabric_retail", pack: "tailoring", label: "Fabric retail", description: "Sell cloth by metre alongside stitching", defaultEnabled: true },
  { key: "tailoring.boutique", pack: "tailoring", label: "Ready-made boutique", description: "Off-the-rack kurta, saree blouses", defaultEnabled: true },
];

const riceMillFeatures: FeatureFlagDef[] = [
  { key: "rice.weight_scale", pack: "rice-mill", label: "Weight scale", description: "Weigh rice/atta by kg at POS", defaultEnabled: true },
  { key: "rice.price_per_kg", pack: "rice-mill", label: "Price per kg", description: "Line amount from rate/kg × net weight", defaultEnabled: true },
  { key: "rice.tare_bag", pack: "rice-mill", label: "Bag tare weight", description: "Subtract sack weight (25/50 kg bag)", defaultEnabled: true },
  { key: "rice.variety", pack: "rice-mill", label: "Rice variety filter", description: "Miniket, Nazirshail, BRRI dhan tabs", defaultEnabled: true },
  { key: "rice.wholesale", pack: "rice-mill", label: "Wholesale / retail", description: "Dealer vs counter price", defaultEnabled: false },
  { key: "rice.attamill", pack: "rice-mill", label: "Atta / flour mill", description: "Atta, maida, suji by kg", defaultEnabled: true },
];

const furnitureFeatures: FeatureFlagDef[] = [
  { key: "furniture.set_pricing", pack: "furniture", label: "Set / piece pricing", description: "Sell single piece or full set", defaultEnabled: true },
  { key: "furniture.delivery", pack: "furniture", label: "Home delivery", description: "Delivery charge & address on invoice", defaultEnabled: true },
  { key: "furniture.assembly", pack: "furniture", label: "Assembly charge", description: "Fitting / assembly fee line", defaultEnabled: true },
  { key: "furniture.material", pack: "furniture", label: "Material filter", description: "Solid wood, board, steel categories", defaultEnabled: true },
  { key: "furniture.custom_order", pack: "furniture", label: "Custom order", description: "Made-to-order lead time note", defaultEnabled: false },
];

const opticalShopFeatures: FeatureFlagDef[] = [
  { key: "optical.prescription", pack: "optical-shop", label: "Prescription capture", description: "SPH/CYL/AXIS on lens orders", defaultEnabled: true },
  { key: "optical.lens_power", pack: "optical-shop", label: "Lens power lookup", description: "Filter lenses by diopter range", defaultEnabled: true },
  { key: "optical.frame_size", pack: "optical-shop", label: "Frame sizing", description: "Bridge, temple, lens width on frame", defaultEnabled: true },
  { key: "optical.blue_coating", pack: "optical-shop", label: "Blue-light coating", description: "Coating upsell on lens lines", defaultEnabled: true },
  { key: "optical.contact_lens", pack: "optical-shop", label: "Contact lens expiry", description: "Expiry alert on contact lens SKUs", defaultEnabled: true },
  { key: "optical.advance_payment", pack: "optical-shop", label: "Advance & due settlement", description: "Advance payment and promised delivery tracking", defaultEnabled: true },
];

const surgicalShopFeatures: FeatureFlagDef[] = [
  { key: "surgical.sterile_batch", pack: "surgical-shop", label: "Sterile batch tracking", description: "Batch no. on sterile items", defaultEnabled: true },
  { key: "surgical.expiry", pack: "surgical-shop", label: "Expiry watch", description: "Warn on near-expiry surgical stock", defaultEnabled: true },
  { key: "surgical.grade", pack: "surgical-shop", label: "Surgical grade", description: "ISO / Class II grade on receipt", defaultEnabled: true },
  { key: "surgical.hospital_contract", pack: "surgical-shop", label: "Hospital contract pricing", description: "Contract rate for hospital buyers", defaultEnabled: false },
  { key: "surgical.rx_required", pack: "surgical-shop", label: "Rx-required items", description: "Flag restricted surgical supplies", defaultEnabled: true },
  { key: "surgical.doctor_ref", pack: "surgical-shop", label: "Doctor & OT reference", description: "Record surgeon, OT ref, and hospital on requisition", defaultEnabled: true },
  { key: "surgical.udi_scan", pack: "surgical-shop", label: "UDI & GS1 parsing", description: "Parse UDI / DataMatrix GTIN, batch, and expiry on scan", defaultEnabled: true },
];

const superShopFeatures: FeatureFlagDef[] = [
  { key: "super-shop.departments", pack: "super-shop", label: "Department taxonomy", description: "Department taxonomy, filters, and reports", defaultEnabled: true },
  { key: "super-shop.scale", pack: "super-shop", label: "Weighing scale sales", description: "Scale labels, scanner-scale, PLU entry", defaultEnabled: true },
  { key: "super-shop.batch", pack: "super-shop", label: "Batch & FEFO tracking", description: "Batch capture at GRN + server FEFO allocation", defaultEnabled: true },
  { key: "super-shop.variant", pack: "super-shop", label: "Variant matrix", description: "Variant generation, barcodes, tags", defaultEnabled: true },
  { key: "super-shop.serial", pack: "super-shop", label: "Serial & warranty", description: "Serial capture at GRN and counter, warranty slip", defaultEnabled: true },
  { key: "super-shop.fast_keys", pack: "super-shop", label: "Fast-key layouts", description: "Fast-key layouts per lane", defaultEnabled: true },
  { key: "super-shop.blind_close", pack: "super-shop", label: "Blind cash close", description: "Blind count, X/Z reports, drawer limits", defaultEnabled: true },
  { key: "super-shop.expiry_markdown", pack: "super-shop", label: "Expiry markdown", description: "Department-scoped markdown rules, near-expiry board", defaultEnabled: true },
  { key: "super-shop.loss_prevention", pack: "super-shop", label: "Loss prevention", description: "Exception reporting per cashier", defaultEnabled: true },
  { key: "super-shop.price_publish", pack: "super-shop", label: "Price publishing", description: "HQ price-change documents", defaultEnabled: false },
  { key: "super-shop.payment_terminal", pack: "super-shop", label: "Payment terminal", description: "Integrated card terminal and dynamic QR", defaultEnabled: false },
  { key: "super-shop.customer_display", pack: "super-shop", label: "Customer display", description: "Second-screen customer display", defaultEnabled: false },
  { key: "super-shop.express_lane", pack: "super-shop", label: "Express lane", description: "Express lane profile", defaultEnabled: false },
  { key: "super-shop.age_restricted", pack: "super-shop", label: "Age restriction", description: "Age confirmation prompts", defaultEnabled: false },
  { key: "super-shop.dept_grouped_receipt", pack: "super-shop", label: "Grouped receipt", description: "Optional grouped receipt layout", defaultEnabled: false },
];

const crockeryFeatures: FeatureFlagDef[] = [
  { key: "crockery.set_breakdown", pack: "crockery", label: "Set & Loose Piece Breakdown", description: "Allow selling loose pieces from dinner sets or decanting sets into open inventory", defaultEnabled: true },
  { key: "crockery.material_specs", pack: "crockery", label: "Material & Heat Safety Badges", description: "Display Opal, Ceramic, Melamine, Stainless Steel and Induction/Microwave badges", defaultEnabled: true },
  { key: "crockery.breakage_log", pack: "crockery", label: "In-Store Breakage & Damage Log", description: "Record cracked/damaged items directly from POS with reason audit", defaultEnabled: true },
  { key: "crockery.gift_packaging", pack: "crockery", label: "Gift & Protective Packaging", description: "Offer fragile bubble wrap, gift wrap with ribbon, or wooden crate transit boxes", defaultEnabled: true },
  { key: "crockery.cooker_warranty", pack: "crockery", label: "Cookware Warranty & Spares Matching", description: "Warranty terms on receipt and auto-suggest matching gaskets/valves for pressure cookers", defaultEnabled: true },
  { key: "crockery.heat_filter", pack: "crockery", label: "Induction & Microwave Filters", description: "Quick filter catalog by induction-compatible and microwave-safe", defaultEnabled: true },
];

const cycleToysFeatures: FeatureFlagDef[] = [
  { key: "cycle_toys.assembly_service", pack: "cycle-toys", label: "Assembly Service", description: "Toggle between boxed SKD carton and pre-assembled ready-to-ride with optional assembly charge", defaultEnabled: true },
  { key: "cycle_toys.workshop_service", pack: "cycle-toys", label: "Workshop & Repair Jobs", description: "Create and track bicycle servicing, tube replacement, and tune-up job cards", defaultEnabled: true },
  { key: "cycle_toys.size_age_matrix", pack: "cycle-toys", label: "Wheel Size & Age Group Matrix", description: "Quick filter catalog by wheel sizes (12\"–29\") and age groups (0-12m to Adult)", defaultEnabled: true },
  { key: "cycle_toys.battery_rideon", pack: "cycle-toys", label: "Electric Ride-on Battery & Motor", description: "Manage 6V/12V/24V battery specs, remote pairing, and pre-delivery inspection", defaultEnabled: true },
  { key: "cycle_toys.accessories_cross_sell", pack: "cycle-toys", label: "Safety Gear & Spares Cross-Sell", description: "Suggest matching helmets, bells, locks, training wheels, and pumps at POS", defaultEnabled: true },
  { key: "cycle_toys.gift_packaging", pack: "cycle-toys", label: "Gift Wrap & Birthday Slip", description: "Add birthday wrapping, ribbons, and personalized gift tag to sale", defaultEnabled: true },
  { key: "cycle_toys.safety_compliance", pack: "cycle-toys", label: "Child Safety & Compliance Badges", description: "Show EN71, CE, Non-Toxic, and Choke Hazard alerts on products and receipts", defaultEnabled: true },
];

export const ALL_FEATURE_FLAGS: FeatureFlagDef[] = [
  ...beefFeatures,
  ...fashionFeatures,
  ...pharmacyFeatures,
  ...groceryFeatures,
  ...restaurantFeatures,
  ...jewelryFeatures,
  ...electronicsFeatures,
  ...bookstoreFeatures,
  ...salonFeatures,
  ...hardwareFeatures,
  ...stationeryFeatures,
  ...cosmeticsFeatures,
  ...buildingMaterialsFeatures,
  ...mobileShopFeatures,
  ...tailoringFeatures,
  ...riceMillFeatures,
  ...furnitureFeatures,
  ...opticalShopFeatures,
  ...surgicalShopFeatures,
  ...superShopFeatures,
  ...crockeryFeatures,
  ...cycleToysFeatures,
  { key: "pos.offline_mode", pack: "beef-shop", label: "Offline-first selling", description: "Global offline queue", defaultEnabled: true },
  { key: "pos.split_tender", pack: "beef-shop", label: "Split tender payments", description: "Global split payment", defaultEnabled: true },
];

export const DEFAULT_DYNAMIC_FIELDS: DynamicFieldDef[] = [
  { id: "df1", pack: "beef-shop", entity: "Product", name: "Halal certificate no.", type: "text", required: false, visibleInPos: false, visibleInProduct: true, visibleInReceipt: true, visibleInReport: false, order: 1 },
  { id: "df2", pack: "beef-shop", entity: "Sale line", name: "Cut type", type: "dropdown", required: true, visibleInPos: true, visibleInProduct: false, visibleInReceipt: true, visibleInReport: true, order: 2, options: ["Regular", "Boneless", "Minced", "Ribs", "Steak", "Liver", "Custom"] },
  { id: "df3", pack: "fashion", entity: "Product", name: "Fabric composition", type: "text", required: false, visibleInPos: false, visibleInProduct: true, visibleInReceipt: false, visibleInReport: false, order: 1 },
  { id: "df4", pack: "fashion", entity: "Variant", name: "Fit", type: "dropdown", required: true, visibleInPos: false, visibleInProduct: true, visibleInReceipt: true, visibleInReport: true, order: 2, options: ["Slim", "Regular", "Relaxed"] },
  { id: "df5", pack: "pharmacy", entity: "Product", name: "Therapeutic class", type: "dropdown", required: true, visibleInPos: false, visibleInProduct: true, visibleInReceipt: false, visibleInReport: true, order: 1, options: ["Analgesic", "Antibiotic", "Antihypertensive"] },
  { id: "df6", pack: "pharmacy", entity: "Batch", name: "Cold-chain only", type: "checkbox", required: false, visibleInPos: true, visibleInProduct: true, visibleInReceipt: false, visibleInReport: true, order: 2 },
  { id: "df7", pack: "grocery", entity: "Product", name: "Shelf location", type: "text", required: false, visibleInPos: true, visibleInProduct: true, visibleInReceipt: false, visibleInReport: true, order: 1 },
  { id: "df8", pack: "jewelry", entity: "Product", name: "Certificate number", type: "text", required: false, visibleInPos: true, visibleInProduct: true, visibleInReceipt: true, visibleInReport: true, order: 1 },
  { id: "df9", pack: "electronics", entity: "Sale line", name: "Serial / IMEI", type: "barcode", required: true, visibleInPos: true, visibleInProduct: false, visibleInReceipt: true, visibleInReport: true, order: 1 },
  { id: "df10", pack: "bookstore", entity: "Product", name: "ISBN", type: "barcode", required: false, visibleInPos: true, visibleInProduct: true, visibleInReceipt: true, visibleInReport: true, order: 1 },
  { id: "df11", pack: "salon", entity: "Sale line", name: "Stylist", type: "dropdown", required: false, visibleInPos: true, visibleInProduct: false, visibleInReceipt: true, visibleInReport: true, order: 1, options: ["Rina", "Sumi", "Farhana", "Walk-in"] },
  { id: "df12", pack: "hardware", entity: "Product", name: "Unit", type: "dropdown", required: true, visibleInPos: true, visibleInProduct: true, visibleInReceipt: true, visibleInReport: true, order: 1, options: ["Piece", "Dozen", "Ft", "Kg", "Bag"] },
  { id: "df13", pack: "building-materials", entity: "Sale line", name: "Delivery site", type: "text", required: false, visibleInPos: true, visibleInProduct: false, visibleInReceipt: true, visibleInReport: true, order: 1 },
  { id: "df14", pack: "mobile-shop", entity: "Sale line", name: "IMEI (required for handsets)", type: "barcode", required: true, visibleInPos: true, visibleInProduct: false, visibleInReceipt: true, visibleInReport: true, order: 1 },
  { id: "df15", pack: "tailoring", entity: "Sale line", name: "Alteration task", type: "dropdown", required: false, visibleInPos: true, visibleInProduct: false, visibleInReceipt: true, visibleInReport: true, order: 1, options: ["Hem", "Sleeve", "Waist", "Full stitch", "Embroidery"] },
  { id: "df16", pack: "rice-mill", entity: "Sale line", name: "Net weight kg", type: "weight", required: true, visibleInPos: true, visibleInProduct: false, visibleInReceipt: true, visibleInReport: true, order: 1 },
  { id: "df17", pack: "furniture", entity: "Sale line", name: "Delivery address", type: "text", required: false, visibleInPos: true, visibleInProduct: false, visibleInReceipt: true, visibleInReport: true, order: 1 },
  { id: "df18", pack: "optical-shop", entity: "Sale line", name: "Lens power (SPH/CYL)", type: "text", required: false, visibleInPos: true, visibleInProduct: false, visibleInReceipt: true, visibleInReport: true, order: 1 },
  { id: "df19", pack: "surgical-shop", entity: "Sale line", name: "Sterile batch no.", type: "text", required: false, visibleInPos: true, visibleInProduct: false, visibleInReceipt: true, visibleInReport: true, order: 1 },
  { id: "df20", pack: "surgical-shop", entity: "Sale line", name: "UDI code", type: "barcode", required: false, visibleInPos: true, visibleInProduct: false, visibleInReceipt: true, visibleInReport: true, order: 2 },
  { id: "df21", pack: "surgical-shop", entity: "Sale line", name: "Hospital / OT requisition ref", type: "text", required: false, visibleInPos: true, visibleInProduct: false, visibleInReceipt: true, visibleInReport: true, order: 3 },
  { id: "df22", pack: "crockery", entity: "Product", name: "Material", type: "dropdown", required: false, visibleInPos: true, visibleInProduct: true, visibleInReceipt: true, visibleInReport: true, order: 1, options: ["Opal Glass", "Fine Bone China", "Ceramic / Porcelain", "Melamine", "Stainless Steel 304", "Hard Anodized", "Cast Iron", "Non-Stick Granite", "Borosilicate Glass"] },
  { id: "df23", pack: "crockery", entity: "Product", name: "Piece count in set", type: "number", required: false, visibleInPos: true, visibleInProduct: true, visibleInReceipt: true, visibleInReport: true, order: 2 },
  { id: "df24", pack: "crockery", entity: "Product", name: "Heat / Stovetop compatibility", type: "dropdown", required: false, visibleInPos: true, visibleInProduct: true, visibleInReceipt: true, visibleInReport: true, order: 3, options: ["Induction & Gas", "Gas Only", "Microwave Safe", "Oven Safe", "Not Heat Resistant"] },
  { id: "df25", pack: "crockery", entity: "Sale line", name: "Protective Packaging", type: "dropdown", required: false, visibleInPos: true, visibleInProduct: false, visibleInReceipt: true, visibleInReport: true, order: 4, options: ["None", "Bubble Wrap (Free)", "Gift Box Wrapped", "Wooden Crate Transit"] },
  { id: "df26", pack: "cycle-toys", entity: "Product", name: "Wheel Size", type: "dropdown", required: false, visibleInPos: true, visibleInProduct: true, visibleInReceipt: true, visibleInReport: true, order: 1, options: ['12"', '14"', '16"', '18"', '20"', '24"', '26"', '27.5"', '29"', '700C', 'N/A'] },
  { id: "df27", pack: "cycle-toys", entity: "Product", name: "Age Group", type: "dropdown", required: false, visibleInPos: true, visibleInProduct: true, visibleInReceipt: true, visibleInReport: true, order: 2, options: ["0-12 Months", "1-3 Years", "3-5 Years", "6-8 Years", "9-12 Years", "13+ / Adult"] },
  { id: "df28", pack: "cycle-toys", entity: "Product", name: "Assembly Condition", type: "dropdown", required: false, visibleInPos: true, visibleInProduct: true, visibleInReceipt: true, visibleInReport: true, order: 3, options: ["Ready-to-Ride (Assembled)", "Boxed SKD (Unassembled Carton)"] },
  { id: "df29", pack: "cycle-toys", entity: "Product", name: "Battery & Motor Spec", type: "text", required: false, visibleInPos: true, visibleInProduct: true, visibleInReceipt: true, visibleInReport: false, order: 4 },
];

export const INDUSTRY_PACKS: IndustryPackDef[] = [
  {
    id: "beef-shop",
    name: "Beef Shop POS",
    shortName: "Beef Shop",
    description: "Weight-based meat sales, cut types, cold storage batches, butcher assignment.",
    icon: Beef,
    gradient: "from-red-600 to-rose-500",
    posRoute: "/app/pos/beef-shop",
    backOfficeRoutes: [
      { path: "/app/beef-shop/dashboard", label: "Dashboard", group: "Beef Shop" },
      { path: "/app/beef-shop/cuts", label: "Cut catalog", group: "Beef Shop" },
      { path: "/app/beef-shop/batches", label: "Cold storage batches", group: "Beef Shop" },
      { path: "/app/beef-shop/wastage", label: "Wastage log", group: "Beef Shop" },
      { path: "/app/beef-shop/reports", label: "Meat reports", group: "Beef Shop" },
    ],
    reports: ["Daily meat sales", "Wastage report", "Cold storage stock", "Butcher-wise sales"],
    productFields: ["Category", "Rate/kg", "Halal cert", "Storage temp"],
    cartFields: ["Weight kg", "Tare", "Net weight", "Cut type", "Butcher", "Batch"],
    posWidgets: ["Scale reader", "Cut selector", "Batch picker", "Wastage field"],
    receiptSections: ["Weight", "Rate/kg", "Cut", "Butcher", "Batch", "Halal cert"],
  },
  {
    id: "fashion",
    name: "Fashion POS",
    shortName: "Fashion",
    description: "Size/color matrix, trial rooms, exchange, alteration, seasonal offers.",
    icon: Shirt,
    gradient: "from-indigo-600 to-violet-500",
    posRoute: "/app/pos/fashion",
    backOfficeRoutes: [
      { path: "/app/fashion/variants", label: "Variant matrix", group: "Fashion" },
      { path: "/app/fashion/offers", label: "Offers", group: "Fashion" },
      { path: "/app/fashion/price-list", label: "Price Lists", group: "Fashion" },
    ],
    reports: ["Size/color sales", "Variant sell-through", "Variant stock", "Fashion campaigns"],
    productFields: ["Style code", "Season", "Fabric", "Fit"],
    cartFields: ["Size", "Color", "Style", "Season", "Barcode"],
    posWidgets: ["Trial room", "Exchange", "Alteration", "Loyalty"],
    receiptSections: ["Style", "Size", "Color", "Barcode", "Exchange policy"],
  },
  {
    id: "pharmacy",
    name: "Pharmacy POS",
    shortName: "Pharmacy",
    description: "Batch, FEFO, expiry, prescription, restricted medicine controls.",
    icon: Pill,
    gradient: "from-emerald-600 to-teal-500",
    posRoute: "/app/pos/pharmacy",
    backOfficeRoutes: [
      { path: "/app/pharmacy/batches", label: "Batches", group: "Pharmacy" },
      { path: "/app/pharmacy/fefo", label: "FEFO console", group: "Pharmacy" },
      { path: "/app/pharmacy/prescription", label: "Prescriptions", group: "Pharmacy" },
    ],
    reports: ["Expiry report", "Batch report", "Prescription sales", "FEFO compliance"],
    productFields: ["Generic", "Manufacturer", "Strength", "Dosage form"],
    cartFields: ["Batch", "Expiry", "Rx ref", "Approval"],
    posWidgets: ["FEFO suggestion", "Rx modal", "Restricted approval"],
    receiptSections: ["Batch", "Expiry", "Dosage", "Manufacturer"],
  },
  {
    id: "grocery",
    name: "Grocery / Super Shop POS",
    shortName: "Grocery",
    description: "Barcode, MRP, weight items, bundles, loyalty, fast checkout.",
    icon: ShoppingBasket,
    gradient: "from-amber-600 to-orange-500",
    posRoute: "/app/pos/grocery",
    backOfficeRoutes: [],
    reports: ["Category sales", "Fast moving items", "Low stock", "Expiry"],
    productFields: ["MRP", "Pack size", "Shelf", "Barcode"],
    cartFields: ["MRP", "Offer", "Weight", "Loyalty"],
    posWidgets: ["Barcode scan", "Scale", "Bundle offer"],
    receiptSections: ["MRP", "Discount", "VAT"],
  },
  {
    id: "restaurant",
    name: "Restaurant POS",
    shortName: "Restaurant",
    description: "Tables, KOT, kitchen, waiter, modifiers, split bill.",
    icon: Utensils,
    gradient: "from-orange-600 to-red-500",
    posRoute: "/app/pos/restaurant",
    backOfficeRoutes: [
      { path: "/app/restaurant/tables", label: "Table map", group: "Restaurant" },
      { path: "/app/restaurant/kot", label: "KOT / Kitchen", group: "Restaurant" },
    ],
    reports: ["Table sales", "Waiter sales", "Kitchen pending", "Item popularity"],
    productFields: ["Course", "Prep time", "Kitchen station"],
    cartFields: ["Table", "Waiter", "Order type", "Modifiers", "KOT"],
    posWidgets: ["Table map", "KOT", "Split bill", "Service charge"],
    receiptSections: ["Table", "Waiter", "KOT", "Order type"],
  },
  {
    id: "jewelry",
    name: "Jewelry POS",
    shortName: "Jewelry",
    description: "Gold rate, karat, weights, making charge, factory, karigar, custom order, certificate, repair.",
    icon: Gem,
    gradient: "from-yellow-600 to-amber-500",
    posRoute: "/app/pos/jewelry",
    backOfficeRoutes: [
      { path: "/app/jewelry/dashboard", label: "Dashboard & Gold Position", group: "Jewelry" },
      { path: "/app/jewelry/gold-rate", label: "Daily Gold Rates", group: "Jewelry" },
      { path: "/app/jewelry/orders", label: "Custom Orders & Advances", group: "Jewelry" },
      { path: "/app/jewelry/factory", label: "Factory & WIP Work Orders", group: "Jewelry" },
      { path: "/app/jewelry/karigars", label: "Karigar Directory & Ledger", group: "Jewelry" },
      { path: "/app/jewelry/melting", label: "Old Gold Melting & Recovery", group: "Jewelry" },
      { path: "/app/jewelry/profiles", label: "Product Profiles", group: "Jewelry" },
      { path: "/app/jewelry/tags", label: "Barcode & Tag Labels", group: "Jewelry" },
      { path: "/app/jewelry/certificate", label: "Certificates", group: "Jewelry" },
      { path: "/app/jewelry/buyback", label: "Buyback & Credits", group: "Jewelry" },
      { path: "/app/jewelry/repair", label: "Repair Job Cards", group: "Jewelry" },
    ],
    reports: ["Gold sales", "Making charge", "Karigar ledger", "Melting recovery", "Repair orders", "Certificate report"],
    productFields: ["Metal", "Karat", "Gross weight", "Net metal weight", "Making charge", "Wastage %"],
    cartFields: ["Gold rate", "Net weight", "Bhori weight", "Stone value", "Making charge", "Certificate"],
    posWidgets: ["Gold rate panel", "Bhori converter", "Weight calc", "Old gold exchange", "Repair flow"],
    receiptSections: ["Metal", "Karat", "Weight", "Bhori", "Making charge", "Certificate", "Exchange credit"],
  },
  {
    id: "electronics",
    name: "Electronics POS",
    shortName: "Electronics",
    description: "Serial/IMEI, warranty, service job, accessories, RMA.",
    icon: Cpu,
    gradient: "from-slate-600 to-blue-500",
    posRoute: "/app/pos/electronics",
    backOfficeRoutes: [
      { path: "/app/electronics/dashboard", label: "Dashboard", group: "Electronics" },
      { path: "/app/electronics/serials", label: "Serial stock", group: "Electronics" },
      { path: "/app/electronics/warranty", label: "Warranty registry", group: "Electronics" },
      { path: "/app/electronics/amc", label: "AMC / Extended Warranty", group: "Electronics" },
      { path: "/app/electronics/emi", label: "EMI Schedules", group: "Electronics" },
      { path: "/app/electronics/brands", label: "Brands", group: "Electronics" },
    ],
    reports: ["Warranty report", "Serial stock", "Return/replacement", "Service requests"],
    productFields: ["Brand", "Model", "Warranty months"],
    cartFields: ["Serial/IMEI", "Warranty", "Accessories", "Service job"],
    posWidgets: ["Serial capture", "Warranty modal", "Service job", "Bundle"],
    receiptSections: ["Serial/IMEI", "Warranty", "Service contact"],
  },
  {
    id: "bookstore",
    name: "Bookstore POS",
    shortName: "Bookstore",
    description: "NCTB & board books, Bangla/English titles, academic year, ISBN lookup — common in Bangladesh bookshops.",
    icon: BookOpen,
    gradient: "from-blue-700 to-indigo-500",
    posRoute: "/app/pos/bookstore",
    backOfficeRoutes: [
      { path: "/app/bookstore/academic", label: "Academic lists", group: "Bookstore" },
      { path: "/app/bookstore/publishers", label: "Publishers", group: "Bookstore" },
      { path: "/app/bookstore/authors", label: "Authors", group: "Bookstore" },
    ],
    reports: ["Board-wise sales", "Publisher report", "Academic session sales", "Language split"],
    productFields: ["ISBN", "Author", "Publisher", "Board", "Class", "Language"],
    cartFields: ["ISBN", "Board", "Class", "Academic year"],
    posWidgets: ["ISBN scan", "Board filter", "Language tabs"],
    receiptSections: ["ISBN", "Publisher", "Board", "Class"],
  },
  {
    id: "salon",
    name: "Salon & Parlor POS",
    shortName: "Salon",
    description: "Haircut, facial, bridal packages, stylist assignment — men's saloon & women's parlor in Bangladesh.",
    icon: Scissors,
    gradient: "from-pink-600 to-rose-500",
    posRoute: "/app/pos/salon",
    backOfficeRoutes: [
      { path: "/app/salon/services", label: "Service menu", group: "Salon" },
      { path: "/app/salon/stylists", label: "Stylists", group: "Salon" },
      { path: "/app/salon/appointments", label: "Appointments", group: "Salon" },
    ],
    reports: ["Stylist-wise sales", "Service popularity", "Package redemption", "Walk-in vs appointment"],
    productFields: ["Service type", "Duration mins", "Gender", "Stylist"],
    cartFields: ["Stylist", "Duration", "Package", "Appointment ref"],
    posWidgets: ["Stylist picker", "Service timer", "Package apply"],
    receiptSections: ["Service", "Stylist", "Duration", "Package"],
  },
  {
    id: "hardware",
    name: "Hardware & Sanitary POS",
    shortName: "Hardware",
    description: "Pipes, fittings, switches, tools — piece/dozen/ft pricing for local hardware shops.",
    icon: Hammer,
    gradient: "from-zinc-600 to-stone-500",
    posRoute: "/app/pos/hardware",
    backOfficeRoutes: [
      { path: "/app/hardware/brands", label: "Brand catalog", group: "Hardware" },
    ],
    reports: ["Category sales", "Brand-wise sales", "Credit khata", "Low stock alerts"],
    productFields: ["Brand", "Unit", "Category", "Warranty months"],
    cartFields: ["Unit", "Brand", "Credit note", "Contractor"],
    posWidgets: ["Barcode scan", "Unit selector", "Credit khata"],
    receiptSections: ["Unit", "Brand", "Warranty"],
  },
  {
    id: "stationery",
    name: "Stationery & Library POS",
    shortName: "Stationery",
    description: "Khata copy, pens, geometry box, A4 rim — school-season rush for Bangladesh library shops.",
    icon: PenLine,
    gradient: "from-violet-600 to-purple-500",
    posRoute: "/app/pos/stationery",
    backOfficeRoutes: [
      { path: "/app/stationery/school-lists", label: "School lists", group: "Stationery" },
    ],
    reports: ["School list bundles", "Seasonal peak sales", "Dealer vs retail", "Fast movers"],
    productFields: ["School class", "Brand", "Pack qty", "Barcode"],
    cartFields: ["School list", "Pack qty", "Dealer price"],
    posWidgets: ["School list bundle", "Barcode scan", "Seasonal rush"],
    receiptSections: ["Class", "Pack", "School list ref"],
  },
  {
    id: "cosmetics",
    name: "Cosmetics & Beauty Retail POS",
    shortName: "Cosmetics",
    description: "Skincare, makeup, hijab-friendly beauty — Unilever, Marico, local brands across Bangladesh.",
    icon: Sparkle,
    gradient: "from-fuchsia-600 to-pink-500",
    posRoute: "/app/pos/cosmetics",
    backOfficeRoutes: [
      { path: "/app/cosmetics/brands", label: "Brand shelf", group: "Cosmetics" },
      { path: "/app/cosmetics/expiry", label: "Expiry watch", group: "Cosmetics" },
      { path: "/app/cosmetics/testers", label: "Testers", group: "Cosmetics" },
    ],
    reports: ["Brand sales", "Shade-wise sales", "Expiry report", "Combo performance"],
    productFields: ["Brand", "Shade", "Skin type", "Expiry date"],
    cartFields: ["Shade", "Brand", "Combo offer", "Expiry"],
    posWidgets: ["Brand filter", "Shade picker", "Combo bundle"],
    receiptSections: ["Brand", "Shade", "Expiry", "MRP"],
  },
  {
    id: "building-materials",
    name: "Building Materials POS",
    shortName: "Building",
    description: "Cement, rod, sand, tiles — bag/CFT/ton pricing for Bangladesh construction supply yards.",
    icon: HardHat,
    gradient: "from-orange-700 to-amber-600",
    posRoute: "/app/pos/building-materials",
    backOfficeRoutes: [
      { path: "/app/building-materials/orders", label: "Sales orders", group: "Building" },
      { path: "/app/building-materials/delivery", label: "Site delivery", group: "Building" },
      { path: "/app/building-materials/contractors", label: "Contractors", group: "Building" },
    ],
    reports: ["Cement & rod daily", "Contractor credit", "Delivery log", "Site-wise sales"],
    productFields: ["Material type", "Unit", "Grade", "Brand"],
    cartFields: ["Unit", "Delivery site", "Contractor", "Vehicle ref"],
    posWidgets: ["Bag calculator", "Delivery note", "Contractor credit"],
    receiptSections: ["Material", "Unit", "Grade", "Delivery site"],
  },
  {
    id: "mobile-shop",
    name: "Mobile & Accessories POS",
    shortName: "Mobile Shop",
    description: "Phones, chargers, cases — lighter than full electronics; Symphony, Samsung, Xiaomi shops across Bangladesh.",
    icon: Smartphone,
    gradient: "from-cyan-600 to-blue-500",
    posRoute: "/app/pos/mobile-shop",
    backOfficeRoutes: [
      { path: "/app/mobile-shop/stock", label: "Phone stock", group: "Mobile Shop" },
      { path: "/app/mobile-shop/trade-ins", label: "Trade-ins", group: "Mobile Shop" },
    ],
    reports: ["Brand-wise sales", "Accessory attach rate", "Used phone sales", "Wallet payment split"],
    productFields: ["Brand", "Model", "Storage", "RAM", "Color", "IMEI required"],
    cartFields: ["IMEI", "Accessory bundle", "bKash ref", "Warranty card"],
    posWidgets: ["Brand tabs", "IMEI selection", "Accessory bundle"],
    receiptSections: ["Brand", "Model", "IMEI", "Warranty card"],
  },
  {
    id: "tailoring",
    name: "Tailoring & Boutique POS",
    shortName: "Tailoring",
    description: "Alteration, stitching, boutique ready-wear — master tailor, due date, measurements.",
    icon: Ruler,
    gradient: "from-teal-600 to-emerald-500",
    posRoute: "/app/pos/tailoring",
    backOfficeRoutes: [
      { path: "/app/tailoring/alterations", label: "Alteration queue", group: "Tailoring" },
      { path: "/app/tailoring/measurements", label: "Measurements", group: "Tailoring" },
      { path: "/app/tailoring/commissions", label: "Commissions", group: "Tailoring" },
      { path: "/app/tailoring/fabrics", label: "Customer Fabrics", group: "Tailoring" },
    ],
    reports: ["Tailor-wise jobs", "Alteration backlog", "Fabric vs stitch revenue", "Due date overdue"],
    productFields: ["Garment type", "Fabric", "Alteration type", "Due days"],
    cartFields: ["Tailor", "Alteration", "Measurement ref", "Due date"],
    posWidgets: ["Alteration picker", "Tailor assign", "Due date"],
    receiptSections: ["Alteration", "Tailor", "Due date", "Measurement"],
  },
  {
    id: "rice-mill",
    name: "Rice & Atta Mill POS",
    shortName: "Rice Mill",
    description: "Miniket, Nazirshail, BRRI dhan, atta by kg — scale, bag tare, wholesale counter pricing.",
    icon: Wheat,
    gradient: "from-yellow-700 to-amber-500",
    posRoute: "/app/pos/rice-mill",
    backOfficeRoutes: [
      { path: "/app/rice-mill/variety", label: "Variety stock", group: "Rice Mill" },
    ],
    reports: ["Variety-wise kg sales", "Wholesale vs retail", "Daily mill throughput", "Bag stock"],
    productFields: ["Variety", "Rate/kg", "Bag size", "Grade"],
    cartFields: ["Net kg", "Tare", "Rate/kg", "Bag ref"],
    posWidgets: ["Scale reader", "Variety tabs", "Bag tare"],
    receiptSections: ["Variety", "Net kg", "Rate/kg", "Amount"],
  },
  {
    id: "furniture",
    name: "Furniture POS",
    shortName: "Furniture",
    description: "Bed, sofa, wardrobe — piece or set, delivery, assembly; local BD furniture showrooms.",
    icon: Sofa,
    gradient: "from-amber-800 to-orange-600",
    posRoute: "/app/pos/furniture",
    backOfficeRoutes: [
      { path: "/app/furniture/delivery", label: "Delivery schedule", group: "Furniture" },
    ],
    reports: ["Category sales", "Delivery pending", "Assembly revenue", "Custom orders"],
    productFields: ["Category", "Material", "Set pieces", "Assembly fee"],
    cartFields: ["Piece/set", "Delivery", "Assembly", "Lead days"],
    posWidgets: ["Set builder", "Delivery note", "Assembly charge"],
    receiptSections: ["Material", "Set/piece", "Delivery", "Assembly"],
  },
  {
    id: "optical-shop",
    name: "Optical Shop POS",
    shortName: "Optical",
    description: "Frames, lenses, contact lenses — prescription power, coating, and eye-test services for Bangladesh optical retailers.",
    icon: Glasses,
    gradient: "from-sky-600 to-indigo-500",
    posRoute: "/app/pos/optical-shop",
    backOfficeRoutes: [
      { path: "/app/optical-shop/lenses", label: "Lens catalog", group: "Optical Shop" },
      { path: "/app/optical-shop/frames", label: "Frame inventory", group: "Optical Shop" },
      { path: "/app/optical-shop/orders", label: "Optical orders", group: "Optical Shop" },
    ],
    reports: ["Lens power sales", "Frame vs lens revenue", "Contact lens expiry", "Eye test bookings"],
    productFields: ["Lens power", "Frame size", "Coating", "Brand"],
    cartFields: ["SPH/CYL", "Frame size", "Coating", "Prescription ref"],
    posWidgets: ["Power lookup", "Frame size", "Coating upsell"],
    receiptSections: ["Prescription", "Lens power", "Frame", "Coating"],
  },
  {
    id: "surgical-shop",
    name: "Surgical Items Shop POS",
    shortName: "Surgical",
    description: "Sterile gloves, sutures, IV supplies, dressings — batch and expiry tracking for hospital and clinic supply counters.",
    icon: Syringe,
    gradient: "from-emerald-700 to-teal-600",
    posRoute: "/app/pos/surgical-shop",
    backOfficeRoutes: [
      { path: "/app/surgical-shop/sterile-stock", label: "Sterile stock", group: "Surgical Shop" },
      { path: "/app/surgical-shop/expiry", label: "Expiry watch", group: "Surgical Shop" },
      { path: "/app/surgical-shop/recalls", label: "Recalls", group: "Surgical Shop" },
    ],
    reports: ["Sterile batch usage", "Expiry report", "Hospital contract sales", "Category-wise PPE"],
    productFields: ["Sterile", "Batch no.", "Expiry", "Surgical grade", "Unit"],
    cartFields: ["Batch no.", "Expiry", "Grade", "Hospital contract"],
    posWidgets: ["Batch scan", "Expiry alert", "Sterile badge"],
    receiptSections: ["Batch", "Expiry", "Grade", "Sterile"],
  },
  {
    id: "super-shop",
    name: "Super Shop & Megastore POS",
    shortName: "Super Shop",
    description: "Multi-department retail POS: grocery, fresh meat & scale, pharmacy batches, fashion variants, electronics.",
    icon: ShoppingBag,
    gradient: "from-emerald-600 via-teal-600 to-cyan-500",
    posRoute: "/app/pos/super-shop",
    backOfficeRoutes: [
      { path: "/app/super-shop/departments", label: "Departments & Aisles", group: "Super Shop" },
      { path: "/app/super-shop/lanes", label: "Counters & Fast Keys", group: "Super Shop" },
      { path: "/app/super-shop/scale-station", label: "Weighing Scales", group: "Super Shop" },
      { path: "/app/super-shop/expiry-markdown", label: "Fresh & Expiry Markdown", group: "Super Shop" },
      { path: "/app/super-shop/inventory", label: "Department Stock", group: "Super Shop" },
      { path: "/app/super-shop/loss-prevention", label: "Loss Prevention", group: "Super Shop" },
    ],
    reports: ["Department-wise sales", "Perishable expiry loss", "Hourly counter throughput", "Mixed basket analytics"],
    productFields: ["Department", "Barcode", "MRP", "Scale / Weight", "Batch / Expiry", "Variant Matrix"],
    cartFields: ["Department", "Weight / Tare", "Batch / Expiry", "Size / Color", "Serial / Warranty"],
    posWidgets: ["Department tabs", "Scale reader", "FEFO batch picker", "Variant selector", "Express lane scan"],
    receiptSections: ["Department grouping", "Weight / Tare", "Batch & Expiry", "Warranty card", "Savings summary"],
  },
  {
    id: "crockery",
    name: "Crockery & Kitchenware POS",
    shortName: "Crockery & Cookware",
    description: "Dinner sets, cookware & pressure cookers, glassware, cutlery — piece decanting, material safety, and gift packing.",
    icon: UtensilsCrossed,
    gradient: "from-amber-600 via-orange-600 to-amber-700",
    posRoute: "/app/pos/crockery",
    backOfficeRoutes: [
      { path: "/app/crockery/breakage-log", label: "Breakage & Damage Logs", group: "Crockery & Cookware" },
      { path: "/app/crockery/decanting", label: "Set Decanting & Open Stock", group: "Crockery & Cookware" },
      { path: "/app/crockery/warranty-spares", label: "Cookware Warranties & Spares", group: "Crockery & Cookware" },
      { path: "/app/crockery/packaging", label: "Gift & Packaging Services", group: "Crockery & Cookware" },
    ],
    reports: ["Category-wise crockery sales", "Set vs loose piece revenue", "Breakage & damage loss", "Cookware warranty claims"],
    productFields: ["Category", "Material", "Set pieces", "Heat compatibility", "Capacity", "Warranty months"],
    cartFields: ["Set/Piece", "Material", "Heat safety", "Packaging", "Spare part"],
    posWidgets: ["Heat safety badges", "Decant set dialog", "Breakage log", "Gift packaging", "Spare parts match"],
    receiptSections: ["Material & Set info", "Heat compatibility", "Packaging note", "Warranty terms", "Inspection disclaimer"],
  },
  {
    id: "cycle-toys",
    name: "Cycle & Toys POS",
    shortName: "Pedal & Play",
    description: "Bicycles, kids ride-ons, electric cars, toys & games — assembly queue, workshop repair jobs, and battery tracking.",
    icon: Bike,
    gradient: "from-sky-600 via-cyan-600 to-amber-600",
    posRoute: "/app/pos/cycle-toys",
    backOfficeRoutes: [
      { path: "/app/cycle-toys/assembly-queue", label: "Assembly Workshop Queue", group: "Pedal & Play" },
      { path: "/app/cycle-toys/service-jobs", label: "Cycle Repair & Service Jobs", group: "Pedal & Play" },
      { path: "/app/cycle-toys/battery-warranty", label: "Ride-on Battery & Warranty", group: "Pedal & Play" },
    ],
    reports: ["Cycle vs Toy revenue", "Assembly & workshop service income", "Ride-on battery replacement logs", "Safety compliance sales"],
    productFields: ["Category", "Wheel size", "Age group", "Assembly condition", "Gear type", "Battery spec", "Safety cert"],
    cartFields: ["Assembly status", "Technician assignment", "Battery serial", "Gift wrapping", "Safety gear cross-sell"],
    posWidgets: ["Size & Age matrix chips", "Add assembly charge modal", "Workshop job card intake", "Battery test log", "Safety gear prompt"],
    receiptSections: ["Assembly disclaimer", "Frame & Wheel specs", "Battery & Charger guidelines", "Workshop service notes", "Birthday gift tag"],
  },
];

/** Optional link from back-office route to a feature flag (sidebar hidden when flag off). */
const ROUTE_FEATURE_KEYS: Partial<Record<IndustryPackId, Record<string, string>>> = {
  "beef-shop": {
    "/app/beef-shop/cuts": "beef.cut_wise",
    "/app/beef-shop/batches": "beef.cold_storage",
    "/app/beef-shop/wastage": "beef.wastage",
  },
  fashion: {
    "/app/fashion/variants": "fashion.variant_matrix",
    "/app/fashion/offers": "fashion.offers",
    "/app/fashion/exchange": "fashion.exchange",
    "/app/fashion/alteration": "fashion.alteration",
  },
  pharmacy: {
    "/app/pharmacy/batches": "pharmacy.batch",
    "/app/pharmacy/fefo": "pharmacy.fefo",
    "/app/pharmacy/prescription": "pharmacy.rx_required",
  },
  restaurant: {
    "/app/restaurant/tables": "restaurant.tables",
    "/app/restaurant/kot": "restaurant.kot",
  },
  jewelry: {
    // Dashboard and Profiles are core to the vertical and intentionally ungated.
    // They previously mapped to "jewelry.manage", which is not a defined feature
    // flag, so the toggle shown for them in the pack config screen did nothing.
    "/app/jewelry/gold-rate": "jewelry.gold_rate",
    "/app/jewelry/repair": "jewelry.repair",
    "/app/jewelry/certificate": "jewelry.certificate",
    "/app/jewelry/buyback": "jewelry.buyback",
  },
  electronics: {
    "/app/electronics/serials":   "electronics.serial",
    "/app/electronics/warranty":  "electronics.warranty",
    "/app/electronics/amc":       "electronics.amc",
    "/app/electronics/emi":       "electronics.emi",
    "/app/electronics/dashboard": "electronics.manage",
    "/app/electronics/brands":    "electronics.manage",
  },
  bookstore: {
    "/app/bookstore/academic": "bookstore.academic_year",
    "/app/bookstore/publishers": "bookstore.publisher",
    // Authors are core catalog master data; do not gate behind an optional flag.
  },
  salon: {
    "/app/salon/services": "salon.services",
    "/app/salon/stylists": "salon.stylist",
    "/app/salon/appointments": "salon.appointment",
  },
  hardware: {
    "/app/hardware/brands": "hardware.brand",
  },
  stationery: {
    "/app/stationery/school-lists": "stationery.school_list",
  },
  cosmetics: {
    "/app/cosmetics/brands": "cosmetics.brand",
    "/app/cosmetics/expiry": "cosmetics.expiry",
  },
  "building-materials": {
    "/app/building-materials/delivery": "building.delivery",
    // Contractors are core to the vertical (not optional credit); do not gate on credit_contractor.
  },
  "mobile-shop": {
    "/app/mobile-shop/stock": "mobile.brand_filter",
    "/app/mobile-shop/trade-ins": "mobile.trade_in",
  },
  tailoring: {
    "/app/tailoring/alterations": "tailoring.alteration",
    "/app/tailoring/measurements": "tailoring.measurement",
  },
  "rice-mill": {
    "/app/rice-mill/variety": "rice.variety",
  },
  furniture: {
    "/app/furniture/delivery": "furniture.delivery",
  },
  "optical-shop": {
    "/app/optical-shop/lenses": "optical.lens_power",
    "/app/optical-shop/frames": "optical.frame_size",
    "/app/optical-shop/orders": "optical.prescription",
  },
  "surgical-shop": {
    "/app/surgical-shop/sterile-stock": "surgical.sterile_batch",
    "/app/surgical-shop/expiry": "surgical.expiry",
  },
  "super-shop": {
    "/app/super-shop/departments": "super-shop.departments",
    "/app/super-shop/lanes": "super-shop.fast_keys",
    "/app/super-shop/scale-station": "super-shop.scale",
    "/app/super-shop/expiry-markdown": "super-shop.expiry_markdown",
    "/app/super-shop/inventory": "super-shop.departments",
    "/app/super-shop/loss-prevention": "super-shop.loss_prevention",
  },
  crockery: {
    "/app/crockery/breakage-log": "crockery.breakage_log",
    "/app/crockery/decanting": "crockery.set_breakdown",
    "/app/crockery/warranty-spares": "crockery.cooker_warranty",
    "/app/crockery/packaging": "crockery.gift_packaging",
  },
  "cycle-toys": {
    "/app/cycle-toys/assembly-queue": "cycle_toys.assembly_service",
    "/app/cycle-toys/service-jobs": "cycle_toys.workshop_service",
    "/app/cycle-toys/battery-warranty": "cycle_toys.battery_rideon",
  },
};

export function defaultPackMenus(): Record<IndustryPackId, PackMenuConfig> {
  const menus = {} as Record<IndustryPackId, PackMenuConfig>;
  for (const pack of INDUSTRY_PACKS) {
    menus[pack.id] = {};
    for (const route of packBackOfficeRoutes(pack)) {
      menus[pack.id][route.path] = true;
    }
  }
  return menus;
}

export function mergePackMenus(raw: unknown): Record<IndustryPackId, PackMenuConfig> {
  const defaults = defaultPackMenus();
  if (!raw || typeof raw !== "object") return defaults;
  const stored = raw as Record<string, PackMenuConfig>;
  const merged = { ...defaults };
  for (const id of INDUSTRY_PACK_IDS) {
    merged[id] = { ...defaults[id], ...stored[id] };
  }
  return merged;
}

export function routeFeatureKey(packId: IndustryPackId, path: string): string | undefined {
  return ROUTE_FEATURE_KEYS[packId]?.[path];
}

export function isPackMenuRouteEnabled(
  packId: IndustryPackId,
  path: string,
  menus: Record<IndustryPackId, PackMenuConfig>,
  flags: Record<string, boolean>,
): boolean {
  const menuSetting = menus[packId]?.[path];
  if (menuSetting === false) return false;
  if (menuSetting === true) return true;
  const featureKey = ROUTE_FEATURE_KEYS[packId]?.[path];
  if (!featureKey) return true;
  const def = ALL_FEATURE_FLAGS.find(f => f.key === featureKey);
  return flags[featureKey] ?? def?.defaultEnabled ?? true;
}

export function getPackDef(id: IndustryPackId): IndustryPackDef {
  return INDUSTRY_PACKS.find(p => p.id === id)!;
}

/** Sidebar path for industry pack attribute masters. */
export function packMasterDataPath(packId: IndustryPackId): string {
  return `/app/${packId}/master-data`;
}

export function packMasterDataRoute(packId: IndustryPackId): PackRoute {
  return { path: packMasterDataPath(packId), label: "Master data", group: "Master Data" };
}

/** Pack routes including the Master data entry first. */
export function packBackOfficeRoutes(pack: IndustryPackDef | IndustryPackId): PackRoute[] {
  const def = typeof pack === "string" ? getPackDef(pack) : pack;
  return [packMasterDataRoute(def.id), ...def.backOfficeRoutes];
}

export function getPackFeatures(id: IndustryPackId): FeatureFlagDef[] {
  return ALL_FEATURE_FLAGS.filter(f => f.pack === id && !f.key.startsWith("pos."));
}

export function defaultPackConfig(enabled: boolean): PackScopeConfig {
  return {
    company: enabled,
    store: enabled,
    counter: enabled,
    updatedAt: Date.now(),
    updatedBy: "Mahin Ahmed",
  };
}

export function defaultPackConfigs(): Record<IndustryPackId, PackScopeConfig> {
  return {
    restaurant: defaultPackConfig(true),
    "beef-shop": defaultPackConfig(false),
    fashion: defaultPackConfig(false),
    pharmacy: defaultPackConfig(false),
    grocery: defaultPackConfig(false),
    jewelry: defaultPackConfig(false),
    electronics: defaultPackConfig(false),
    bookstore: defaultPackConfig(false),
    salon: defaultPackConfig(false),
    hardware: defaultPackConfig(false),
    stationery: defaultPackConfig(false),
    cosmetics: defaultPackConfig(false),
    "building-materials": defaultPackConfig(false),
    "mobile-shop": defaultPackConfig(false),
    tailoring: defaultPackConfig(false),
    "rice-mill": defaultPackConfig(false),
    furniture: defaultPackConfig(false),
    "optical-shop": defaultPackConfig(false),
    "surgical-shop": defaultPackConfig(false),
    "super-shop": defaultPackConfig(false),
    crockery: defaultPackConfig(false),
    "cycle-toys": defaultPackConfig(false),
  };
}

/** Enable every industry pack at company, store, and counter scope. */
export function allPacksEnabledConfigs(): Record<IndustryPackId, PackScopeConfig> {
  const configs = defaultPackConfigs();
  for (const id of INDUSTRY_PACK_IDS) {
    configs[id] = defaultPackConfig(true);
  }
  return configs;
}

export function defaultFeatureFlags(): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  ALL_FEATURE_FLAGS.forEach(f => { flags[f.key] = f.defaultEnabled; });
  return flags;
}

export function isPackEnabled(
  packId: IndustryPackId,
  configs: Record<IndustryPackId, PackScopeConfig>,
): boolean {
  const c = configs[packId];
  return c?.company === true && c?.store === true && c?.counter === true;
}

export function enabledPackIds(configs: Record<IndustryPackId, PackScopeConfig>): IndustryPackId[] {
  return INDUSTRY_PACK_IDS.filter(id => isPackEnabled(id, configs));
}

export function availablePosModes(configs: Record<IndustryPackId, PackScopeConfig>, isSuperAdmin?: boolean): PosMode[] {
  if (isSuperAdmin) {
    return ["universal", ...INDUSTRY_PACK_IDS];
  }
  const enabled = enabledPackIds(configs);
  if (enabled.length === 0) return ["fashion"];
  return enabled;
}

export type HealthCheckResult = {
  id: string;
  label: string;
  status: "passed" | "warning" | "failed";
  detail: string;
  fix?: string;
  link?: string;
};

function flagOn(flags: Record<string, boolean>, key: string, defaultEnabled: boolean): boolean {
  return flags[key] ?? defaultEnabled;
}

export function runConfigurationHealthCheck(state: {
  packConfigs: Record<IndustryPackId, PackScopeConfig>;
  flags: Record<string, boolean>;
  dynamicFields: DynamicFieldDef[];
  posMode: PosMode;
}): HealthCheckResult[] {
  const results: HealthCheckResult[] = [];
  const enabled = enabledPackIds(state.packConfigs);

  results.push({
    id: "packs",
    label: "Enabled industry packs",
    status: enabled.length > 0 ? "passed" : "failed",
    detail: enabled.length ? `${enabled.length} pack(s) active: ${enabled.join(", ")}` : "No packs enabled at company/store/counter level",
    fix: "Enable at least one pack at all scope levels",
    link: "/app/configuration/industry-packs",
  });

  const unassignedPack = state.dynamicFields.filter(f => !f.pack);
  if (unassignedPack.length) {
    results.push({
      id: "df-pack",
      label: "Dynamic fields · pack assignment",
      status: "failed",
      detail: `${unassignedPack.length} field(s) missing pack assignment`,
      fix: "Assign each dynamic field to an industry pack",
      link: "/app/configuration/dynamic-fields",
    });
  }

  const missingScope = state.dynamicFields.filter(
    f => f.allStores === false && (!f.stores || f.stores.length === 0),
  );
  if (missingScope.length) {
    results.push({
      id: "df-store",
      label: "Dynamic fields · store assignment",
      status: "warning",
      detail: `${missingScope.length} field(s) restrict stores but have no store list`,
      fix: "Assign stores or enable 'all stores'",
      link: "/app/configuration/dynamic-fields",
    });
  }

  const missingCounter = state.dynamicFields.filter(
    f => f.allCounters === false && (!f.counters || f.counters.length === 0),
  );
  if (missingCounter.length) {
    results.push({
      id: "df-counter",
      label: "Dynamic fields · counter assignment",
      status: "warning",
      detail: `${missingCounter.length} field(s) restrict counters but have no counter list`,
      fix: "Assign counters or enable 'all counters'",
      link: "/app/configuration/dynamic-fields",
    });
  }

  for (const packId of enabled) {
    const pack = getPackDef(packId);
    const requiredFields = state.dynamicFields.filter(d => d.pack === packId && d.required);
    results.push({
      id: `fields-${packId}`,
      label: `${pack.shortName} · required product fields`,
      status: requiredFields.length > 0 ? "passed" : "warning",
      detail: requiredFields.length ? `${requiredFields.length} required field(s) configured` : "No required dynamic fields configured",
      fix: "Add required fields for product/sale lines",
      link: "/app/configuration/dynamic-fields",
    });

    if (pack.reports.length === 0) {
      results.push({
        id: `reports-${packId}`,
        label: `${pack.shortName} · reports`,
        status: "warning",
        detail: "Enabled pack has no report definitions",
        fix: "Configure industry reports",
        link: "/app/reports",
      });
    } else {
      results.push({
        id: `reports-${packId}`,
        label: `${pack.shortName} · reports`,
        status: "passed",
        detail: `${pack.reports.length} report(s): ${pack.reports.slice(0, 2).join(", ")}…`,
      });
    }

    results.push({
      id: `routes-${packId}`,
      label: `${pack.shortName} · POS route`,
      status: "passed",
      detail: `POS available at ${pack.posRoute}`,
      link: pack.posRoute,
    });

    results.push({
      id: `receipt-${packId}`,
      label: `${pack.shortName} · receipt placeholders`,
      status: pack.receiptSections.length > 0 ? "passed" : "warning",
      detail: pack.receiptSections.length
        ? `Sections: ${pack.receiptSections.join(", ")}`
        : "No receipt sections defined for this pack",
      fix: "Configure receipt template sections",
      link: "/app/configuration/receipt-templates",
    });
  }

  if (state.posMode !== "universal" && !isPackEnabled(state.posMode, state.packConfigs)) {
    results.push({
      id: "pos-mode",
      label: "Selected POS mode",
      status: "failed",
      detail: `POS mode "${state.posMode}" is selected but pack is disabled`,
      fix: "Enable the pack or switch POS mode",
      link: "/app/configuration/pos-modes",
    });
  } else {
    results.push({
      id: "pos-mode",
      label: "Selected POS mode",
      status: "passed",
      detail: `Active mode: ${state.posMode}`,
      link: "/app/pos",
    });
  }

  // Conflicting flags
  const conflicts: Array<{ id: string; label: string; detail: string }> = [];
  if (flagOn(state.flags, "pharmacy.fefo", true) && !flagOn(state.flags, "pharmacy.batch", true)) {
    conflicts.push({ id: "c-pharmacy-fefo", label: "Pharmacy FEFO without batch", detail: "FEFO enabled but batch tracking disabled" });
  }
  if (flagOn(state.flags, "beef.expiry", true) && !flagOn(state.flags, "beef.cold_storage", true)) {
    conflicts.push({ id: "c-beef-expiry", label: "Beef expiry without cold storage", detail: "Expiry tracking enabled but cold storage batch disabled" });
  }
  if (flagOn(state.flags, "electronics.warranty", true) && !flagOn(state.flags, "electronics.serial", true)) {
    conflicts.push({ id: "c-electronics-warranty", label: "Warranty without serial", detail: "Warranty registration enabled but serial tracking disabled" });
  }
  if (flagOn(state.flags, "electronics.emi", true) && !flagOn(state.flags, "electronics.serial", true)) {
    conflicts.push({ id: "c-electronics-emi", label: "EMI without serial", detail: "EMI/installments require serial tracking to be enabled" });
  }
  if (flagOn(state.flags, "electronics.amc", true) && !flagOn(state.flags, "electronics.warranty", true)) {
    conflicts.push({ id: "c-electronics-amc", label: "AMC without warranty", detail: "AMC management requires warranty tracking to be enabled" });
  }
  if (flagOn(state.flags, "restaurant.kot", true) && !flagOn(state.flags, "restaurant.kds", true)) {
    conflicts.push({ id: "c-restaurant-kot", label: "KOT without kitchen display", detail: "KOT enabled but kitchen display disabled" });
  }
  for (const c of conflicts) {
    results.push({
      ...c,
      status: "failed",
      fix: "Enable dependent feature or disable conflicting flag",
      link: "/app/configuration/feature-flags",
    });
  }

  results.push({
    id: "permissions",
    label: "Role permissions",
    status: "passed",
    detail: "Review role matrix — Cashier has minimal configuration access",
    link: "/app/configuration/role-permissions",
  });

  return results;
}
