"""Demo seed data for Pulse POS SaaS."""

import json
from datetime import date, datetime, timedelta, timezone

from sqlmodel import Session, select

from app.database import engine
from app.models.config_engine import DynamicFieldDefinition, FeatureFlag, IndustryPack, ReceiptTemplate, StorePolicy, TenantFeature
from app.models.core import (
    Company,
    Counter,
    Permission,
    Role,
    RolePermission,
    Store,
    UserAccount,
    UserRole,
    Warehouse,
)
from app.models.audit import AuditLog
from app.models.industry import (
    BeefBatch,
    BeefColdStorage,
    BeefCutType,
    BeefWastage,
    ButcherMaster,
    ElectronicsRma,
    ElectronicsSerialStock,
    FashionOffer,
    FashionProductVariant,
    JewelryCertificate,
    JewelryGoldRate,
    JewelryProductProfile,
    PharmaBatch,
    PharmaProductProfile,
    RestaurantCombo,
    RestaurantComboItem,
    RestaurantKot,
    RestaurantKotLine,
    RestaurantTable,
    OpticalFrameProfile,
    OpticalLensProfile,
    RiceMillVarietyStock,
    TailoringAlterationJob,
)
from app.models.mini_hr import (
    MiniHrEmployee,
    MiniHrDepartment,
    MiniHrDesignation,
    MiniHrAttendance,
    MiniHrLeaveRequest,
    MiniHrShiftRoster,
)
from app.models.industry import (
    FurnitureDeliveryOrder,
    SurgicalProductProfile,
    SurgicalStockUnit,
    MobileProductProfile,
    SalonService,
    SalonStaffProfile,
    SalonStaffService,
    SalonResource,
    HardwareProductProfile,
    HardwareCustomerPrice,
    HardwareBulkPriceTier,
    BuildingMaterialProfile,
    BuildingProjectSite,
    BookPublisher,
    BookAuthor,
    BookProductProfile,
    BookProductAuthor,
    BookAcademicList,
    BookAcademicListItem,
    StationeryProductProfile,
    StationerySchoolList,
    StationerySchoolListItem,
    CosmeticsProductProfile,
    CosmeticsBatch,
)
from app.models.inventory import StockBalance, StockLedger
from app.models.product import BrandMaster, Customer, Product, ProductBarcode, ProductUomConversion, ProductVariant, Supplier, Unit
from app.models.sales import Payment, PurchaseInvoice, PurchaseInvoiceLine, SalesInvoice, SalesInvoiceLine
from app.models.operations import PaymentMethod
from app.models.saas import ApprovalRequest, Notification, PosDevice, SubscriptionInvoice
from app.rbac import PERMISSIONS, DEFAULT_ROLE_PERMISSIONS
from app.security import hash_password
from app.services.accounting_service import seed_default_chart_of_accounts

INDUSTRY_PACKS = [
    "beef-shop", "fashion", "pharmacy", "grocery", "restaurant", "jewelry", "electronics",
    "bookstore", "salon", "hardware", "stationery", "cosmetics", "building-materials",
    "mobile-shop", "tailoring", "rice-mill", "furniture", "optical-shop", "surgical-shop",
    "super-shop", "crockery", "cycle-toys",
]

FEATURE_FLAGS = [
    ("beef.weight_scale", "beef-shop", "Weight scale sales", True),
    ("beef.price_per_kg", "beef-shop", "Price per kg", True),
    ("beef.cut_wise", "beef-shop", "Cut-wise sale", True),
    ("beef.wastage", "beef-shop", "Wastage tracking", True),
    ("beef.cold_storage", "beef-shop", "Cold storage", True),
    ("beef.expiry", "beef-shop", "Expiry tracking", True),
    ("beef.slaughter_batch", "beef-shop", "Slaughter batch", False),
    ("beef.butcher", "beef-shop", "Butcher assignment", True),
    ("fashion.offer_campaign", "fashion", "Campaign discount", True),
    ("fashion.exchange", "fashion", "Exchange", True),
    ("fashion.loyalty", "fashion", "Loyalty", True),
    ("pharmacy.batch", "pharmacy", "Batch tracking", True),
    ("pharmacy.fefo", "pharmacy", "FEFO picking", True),
    ("pharmacy.restricted", "pharmacy", "Restricted medicine", True),
    ("pharmacy.manufacturer_display", "pharmacy", "Manufacturer display", True),
    ("pharmacy.strength_display", "pharmacy", "Strength display", True),
    ("pharmacy.dosage_form_display", "pharmacy", "Dosage form display", True),
    ("pharmacy.generic_display", "pharmacy", "Generic display", True),
    ("grocery.wholesale_price", "grocery", "Wholesale price mode", True),
    ("grocery.wholesale", "grocery", "Wholesale/retail", True),
    ("restaurant.combo_meals", "restaurant", "Combo meals", True),
    ("restaurant.kot", "restaurant", "KOT", True),
    ("restaurant.kds", "restaurant", "Kitchen display", True),
    ("restaurant.split_bill", "restaurant", "Split bill", True),
    ("optical.prescription", "optical-shop", "Prescription capture", True),
    ("optical.lens_power", "optical-shop", "Lens power lookup", True),
    ("optical.frame_size", "optical-shop", "Frame sizing", True),
    ("optical.blue_coating", "optical-shop", "Blue-light coating", True),
    ("optical.contact_lens", "optical-shop", "Contact lens expiry", True),
    ("surgical.sterile_batch", "surgical-shop", "Sterile batch tracking", True),
    ("surgical.expiry", "surgical-shop", "Expiry watch", True),
    ("surgical.grade", "surgical-shop", "Surgical grade", True),
    ("surgical.hospital_contract", "surgical-shop", "Hospital contract pricing", False),
    ("surgical.rx_required", "surgical-shop", "Rx-required items", True),
    ("mobile.brand_filter", "mobile-shop", "Brand tabs", True),
    ("mobile.imei_required", "mobile-shop", "IMEI required for handsets", True),
    ("mobile.accessories", "mobile-shop", "Accessory upsell", True),
    ("mobile.bkash_note", "mobile-shop", "bKash / Nagad note", True),
    ("mobile.trade_in", "mobile-shop", "Trade-in workflow", True),
    ("mobile.used_phone", "mobile-shop", "Used / refurbished", False),
    ("salon.services", "salon", "Service menu", True),
    ("salon.stylist", "salon", "Stylist assignment", True),
    ("salon.appointment", "salon", "Appointments / walk-in", True),
    ("salon.membership", "salon", "Membership / package", False),
    ("salon.product_retail", "salon", "Retail product upsell", True),
    ("hardware.unit_pricing", "hardware", "Unit pricing", True),
    ("hardware.barcode", "hardware", "Barcode scan", True),
    ("hardware.brand", "hardware", "Brand filter", True),
    ("hardware.credit_khatian", "hardware", "Mudaraba / credit khata", False),
    ("hardware.warranty", "hardware", "Tool warranty", True),
    ("building.cement_bag", "building-materials", "Cement bag pricing", True),
    ("building.delivery", "building-materials", "Site delivery", True),
    ("building.credit_contractor", "building-materials", "Contractor credit khata", False),
    ("building.weight_volume", "building-materials", "Weight / CFT pricing", True),
    ("jewelry.gold_rate", "jewelry", "Gold rate calc", True),
    ("electronics.serial", "electronics", "Serial tracking", True),
    ("electronics.warranty", "electronics", "Warranty", True),
    ("electronics.return_replacement", "electronics", "RMA/Return", True),
    ("stationery.school_list", "stationery", "School stationery lists", True),
    ("cosmetics.batch", "cosmetics", "Cosmetics batch tracking", True),
    ("cosmetics.fefo", "cosmetics", "Cosmetics FEFO picking", True),
    ("cosmetics.tester", "cosmetics", "Cosmetics tester conversion", True),
    ("cosmetics.near_expiry_warn", "cosmetics", "Near-expiry warning (no auto markdown)", True),
    ("cycle_toys.assembly_service", "cycle-toys", "Assembly Service", True),
    ("cycle_toys.workshop_service", "cycle-toys", "Workshop & Repair Jobs", True),
    ("cycle_toys.size_age_matrix", "cycle-toys", "Wheel Size & Age Group Matrix", True),
    ("cycle_toys.battery_rideon", "cycle-toys", "Electric Ride-on Battery & Motor", True),
    ("cycle_toys.accessories_cross_sell", "cycle-toys", "Safety Gear & Spares Cross-Sell", True),
    ("cycle_toys.gift_packaging", "cycle-toys", "Gift Wrap & Birthday Slip", True),
    ("cycle_toys.safety_compliance", "cycle-toys", "Child Safety & Compliance Badges", True),
    ("pos.offline_mode", "core", "Offline POS mode", True),
]

SUPER_SHOP_SPEC_MAP = {
    "SS-BF-01": {"departmentCode": "FRESH", "barcode": "204011000000", "costPrice": 720.0, "wholesalePrice": 800.0, "isWeighable": True, "ratePerKg": 850, "pluCode": "4011", "tareWeightGrams": 20, "shelfLocation": "Cold Counter C1"},
    "SS-CK-01": {"departmentCode": "FRESH", "barcode": "204012000000", "costPrice": 180.0, "wholesalePrice": 200.0, "isWeighable": True, "ratePerKg": 220, "pluCode": "4012", "tareWeightGrams": 15, "shelfLocation": "Cold Counter C2"},
    "SS-AP-01": {"departmentCode": "FRESH", "barcode": "204013000000", "costPrice": 220.0, "wholesalePrice": 250.0, "isWeighable": True, "ratePerKg": 280, "pluCode": "4013", "tareWeightGrams": 10, "shelfLocation": "Fruit Bay F1"},
    "SS-TM-01": {"departmentCode": "FRESH", "barcode": "204014000000", "costPrice": 45.0, "wholesalePrice": 55.0, "isWeighable": True, "ratePerKg": 65, "pluCode": "4014", "tareWeightGrams": 10, "shelfLocation": "Veggie Bin V3"},
    "SS-MJ-01": {"departmentCode": "GROC", "barcode": "894110022331", "costPrice": 175.0, "wholesalePrice": 195.0, "mrp": 240, "shelfLocation": "Aisle 02 · Shelf B"},
    "SS-RC-01": {"departmentCode": "GROC", "barcode": "894110033442", "costPrice": 350.0, "wholesalePrice": 380.0, "mrp": 440, "shelfLocation": "Aisle 01 · Shelf A"},
    "SS-CH-01": {"departmentCode": "GROC", "barcode": "894110044553", "costPrice": 68.0, "wholesalePrice": 76.0, "mrp": 90, "shelfLocation": "Aisle 03 · Shelf C"},
    "SS-SV-01": {"departmentCode": "GROC", "barcode": "894110055663", "costPrice": 145.0, "wholesalePrice": 162.0, "mrp": 195, "shelfLocation": "Aisle 04 · Shelf D"},
    "SS-MED-01": {"departmentCode": "PHARM", "barcode": "894220011001", "costPrice": 22.0, "wholesalePrice": 26.0, "genericName": "Paracetamol + Caffeine", "batchNo": "BT-2026-09A", "expiryDate": "2027-12-31", "rxRequired": False, "shelfLocation": "Pharmacy Bay 1"},
    "SS-MED-02": {"departmentCode": "PHARM", "barcode": "894220022002", "costPrice": 58.0, "wholesalePrice": 68.0, "genericName": "Amoxicillin Trihydrate", "batchNo": "BT-2026-04C", "expiryDate": "2027-06-30", "rxRequired": True, "shelfLocation": "Pharmacy Rx Cabinet"},
    "SS-POLO-01": {"departmentCode": "APPAREL", "barcode": "894330011011", "costPrice": 600.0, "wholesalePrice": 720.0, "mrp": 990, "styleCode": "POLO-01", "shelfLocation": "Apparel Rack A1"},
    "SS-CHINO-01": {"departmentCode": "APPAREL", "barcode": "894330022021", "costPrice": 850.0, "wholesalePrice": 1050.0, "mrp": 1450, "styleCode": "CHINO-02", "shelfLocation": "Apparel Rack A2"},
    "SS-NIVEA-01": {"departmentCode": "BEAUTY", "barcode": "894550011001", "costPrice": 320.0, "wholesalePrice": 370.0, "mrp": 460, "expiryDate": "2027-08-31", "shelfLocation": "Cosmetics Shelf K1"},
    "SS-LED-01": {"departmentCode": "TECH", "barcode": "894660011001", "costPrice": 260.0, "wholesalePrice": 300.0, "mrp": 380, "serialRequired": True, "warrantyMonths": 12, "shelfLocation": "Aisle 06 · Bay 1"},
    "SS-CHG-01": {"departmentCode": "TECH", "barcode": "894660022002", "costPrice": 480.0, "wholesalePrice": 560.0, "mrp": 750, "serialRequired": True, "warrantyMonths": 18, "shelfLocation": "Aisle 06 · Bay 2"},
    "SS-PAP-01": {"departmentCode": "STAT", "barcode": "894770011001", "costPrice": 420.0, "wholesalePrice": 470.0, "mrp": 550, "shelfLocation": "Aisle 07 · Shelf E"},
}

SAMPLE_PRODUCTS = [
    ("BEEF-001", "Premium Beef Shoulder", "beef-shop", 850, None),
    ("FASH-001", "Cotton Polo Shirt", "fashion", 1290, None),
    ("FASH-002", "Slim Fit Chino", "fashion", 1890, None),
    ("FASH-003", "Oversized Hoodie", "fashion", 2490, None),
    ("PHRM-001", "Paracetamol 500mg", "pharmacy", 12, None),
    ("PHRM-002", "Amoxicillin 250mg", "pharmacy", 45, None),
    ("GROC-001", "Basmati Rice 5kg", "grocery", 650, 580),
    ("REST-001", "Chicken Biryani", "restaurant", 320, None),

    # Jewelry POS Demo Products (including JEWL-001 legacy test product)
    ("JEWL-001", "22K Gold Ring", "jewelry", 45000, None),
    ("JW-001", "22K Gold Chain", "jewelry", 115000, None),
    ("JW-002", "Diamond Ring · 18K White Gold", "jewelry", 48000, None),
    ("JW-003", "Silver Bangle Pair · 925", "jewelry", 3500, None),
    ("JW-004", "22K Bridal Har Necklace", "jewelry", 380000, None),
    ("JW-005", "22K Gold Kulla Bangle Set (4 Pcs)", "jewelry", 290000, None),
    ("JW-006", "Platinum Solitaire Engagement Ring", "jewelry", 75000, None),
    ("JW-007", "21K Gold Earring Tops", "jewelry", 36000, None),
    ("JW-008", "22K Gold Jhumka Earrings", "jewelry", 135000, None),
    ("JW-009", "18K Rose Gold Diamond Pendant", "jewelry", 34000, None),
    ("JW-010", "22K Gold Pearl Drop Necklace", "jewelry", 210000, None),
    ("JW-011", "22K Heavy Mens Gold Bracelet", "jewelry", 235000, None),
    ("JW-012", "925 Silver Payal / Anklet Pair", "jewelry", 2400, None),
    ("JW-013", "22K Crown Tiara Gold Ring", "jewelry", 58000, None),
    ("JW-014", "18K Yellow Gold Emerald Ring", "jewelry", 68000, None),
    ("JW-015", "22K Gold Mangalsutra Pendant", "jewelry", 92000, None),
    ("JW-016", "22K Gold Nose Pin / Noth", "jewelry", 12000, None),
    ("JW-017", "Platinum Mens Wedding Band", "jewelry", 82000, None),
    ("JW-018", "22K Royal Choker Necklace", "jewelry", 340000, None),
    ("JW-019", "18K Blue Sapphire Earrings", "jewelry", 78000, None),
    ("JW-020", "22K Stamped Gold Coin (5g)", "jewelry", 44000, None),

    # Electronics POS Demo Products (including ELEC-001 legacy test product)
    ("ELEC-001", "Smartphone X1", "electronics", 28500, None),
    ("EL-001", "Galaxy A55 5G", "electronics", 42990, None),
    ("EL-002", "Redmi Note 13 Pro", "electronics", 28999, None),
    ("EL-003", "USB-C Hub 7-in-1", "electronics", 3200, None),
    ("EL-004", "55\" 4K Smart TV", "electronics", 89900, None),
    ("EL-005", "iPhone 15 Pro 128GB", "electronics", 139900, None),
    ("EL-006", "MacBook Air M3 15\"", "electronics", 178000, None),
    ("EL-007", "WH-1000XM5 Headphones", "electronics", 36500, None),
    ("EL-008", "Inverter AC 1.5 Ton", "electronics", 64500, None),
    ("EL-009", "Direct Cool Refrigerator 252L", "electronics", 41900, None),
    ("EL-010", "Front Load Washing Machine 8kg", "electronics", 58900, None),
    ("EL-011", "Mechanical Gaming Keyboard", "electronics", 8500, None),
    ("EL-012", "Wireless Ergonomic Mouse", "electronics", 11500, None),
    ("EL-013", "27\" 4K IPS Monitor", "electronics", 54900, None),
    ("EL-014", "Wi-Fi 6 Mesh Router System", "electronics", 14500, None),
    ("EL-015", "Soundbar 3.1ch with Subwoofer", "electronics", 27500, None),
    ("EL-016", "Smartwatch Series 9 45mm", "electronics", 52000, None),
    ("EL-017", "20000mAh Fast Power Bank", "electronics", 2400, None),
    ("EL-018", "Portable Bluetooth Speaker", "electronics", 16800, None),
    ("EL-019", "Mirrorless Camera 24.2MP", "electronics", 148500, None),
    ("EL-020", "Microwave Oven 23L Grill", "electronics", 14900, None),

    ("OP-001", "Metal Full-Rim Frame · Black", "optical-shop", 1200, None),
    ("OP-002", "1.56 Single Vision Lens", "optical-shop", 800, None),
    ("SG-001", "Disposable Surgical Gloves · M", "surgical-shop", 280, None),
    ("SG-002", "Reusable Surgical Forceps", "surgical-shop", 1500, None),
    ("SG-003", "IV Cannula · 22G", "surgical-shop", 35, None),
    ("MOB-001", "Samsung Galaxy A15 8/256", "mobile-shop", 24990, None),
    ("MOB-ACC-001", "Type-C Fast Charger 25W", "mobile-shop", 890, None),
    ("SALON-HC", "Haircut · Classic", "salon", 350, None),
    ("SALON-FC", "Facial · Basic", "salon", 800, None),
    ("SALON-SH", "Salon Shampoo 250ml", "salon", 450, None),
    ("HW-SCREW", "Steel Screw · 1.5 inch", "hardware", 2.5, None),
    ("HW-CABLE", "Electrical Cable · 2.5mm", "hardware", 120, None),
    ("HW-PAINT", "Enamel Paint · White", "hardware", 850, None),
    ("BM-CEMENT", "Portland Cement · 50kg bag", "building-materials", 520, 500),
    ("BM-ROD", "MS Rod · 12mm", "building-materials", 850, 820),
    ("BM-SAND", "Construction Sand", "building-materials", 55, 50),
    ("BK-PHY10", "Physics · Class 10 NCTB", "bookstore", 280, None),
    ("BK-MATH12", "Higher Math · Class 12", "bookstore", 320, None),
    ("BK-NOVEL", "দোজখের ওম · Novel", "bookstore", 450, None),
    ("ST-PEN", "Matador Hi-Speed Blue", "stationery", 15, 12),
    ("ST-KHATA", "Fresh Exercise Book 80pg", "stationery", 45, 38),
    ("ST-A4", "Double A A4 Rim", "stationery", 420, 380),
    ("COS-LIP", "Lakme Absolute Matte Lipstick", "cosmetics", 850, None),
    ("COS-FOUND", "Maybelline Fit Me Foundation", "cosmetics", 1200, None),
    ("COS-CREAM", "Pond's Age Miracle Cream", "cosmetics", 650, None),
    ("SS-BF-01", "Fresh Beef · Sirloin Cut", "super-shop", 850, None),
    ("SS-CK-01", "Broiler Chicken · Skinless Whole", "super-shop", 220, None),
    ("SS-AP-01", "Fuji Apples · Import Grade A", "super-shop", 280, None),
    ("SS-TM-01", "Red Tomatoes · Fresh Local", "super-shop", 65, None),
    ("SS-MJ-01", "Pran Mango Fruit Juice 1L", "super-shop", 220, None),
    ("SS-RC-01", "Premium Miniket Rice 5kg Pack", "super-shop", 410, None),
    ("SS-CH-01", "Ruchi BBQ Chanachur 300g", "super-shop", 85, None),
    ("SS-SV-01", "Savlon Antiseptic Liquid 500ml", "super-shop", 180, None),
    ("SS-MED-01", "Napa Extra 500mg (10 Tabs)", "super-shop", 30, None),
    ("SS-MED-02", "Moxacil 500mg Capsule (10 Caps)", "super-shop", 75, None),
    ("SS-POLO-01", "Men's Pique Cotton Polo Shirt", "super-shop", 850, None),
    ("SS-CHINO-01", "Men's Stretch Chino Trousers", "super-shop", 1250, None),
    ("SS-NIVEA-01", "Nivea Soft Moisturising Cream 200ml", "super-shop", 420, None),
    ("SS-LED-01", "Walton LED Bulb 12W Day Light", "super-shop", 350, None),
    ("SS-CHG-01", "Fast PD USB-C Charger 30W", "super-shop", 650, None),
    ("SS-PAP-01", "Double A Paper 80GSM 500 Sheets", "super-shop", 520, None),
]

SAMPLE_PRODUCT_IMAGES = {
    # --- Jewelry ---
    "JEWL-001": "https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=500&auto=format&fit=crop&q=80",
    "JW-001": "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=500&auto=format&fit=crop&q=80",
    "JW-002": "https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=500&auto=format&fit=crop&q=80",
    "JW-003": "https://images.unsplash.com/photo-1611591475155-4284ec28d351?w=500&auto=format&fit=crop&q=80",
    "JW-004": "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=500&auto=format&fit=crop&q=80",
    "JW-005": "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=500&auto=format&fit=crop&q=80",
    "JW-006": "https://images.unsplash.com/photo-1603561591411-07134e71a2a9?w=500&auto=format&fit=crop&q=80",
    "JW-007": "https://images.unsplash.com/photo-1630019852942-f89202989a59?w=500&auto=format&fit=crop&q=80",
    "JW-008": "https://images.unsplash.com/photo-1630019852942-f89202989a59?w=500&auto=format&fit=crop&q=80",
    "JW-009": "https://images.unsplash.com/photo-1599643477877-530eb83abc8e?w=500&auto=format&fit=crop&q=80",
    "JW-010": "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=500&auto=format&fit=crop&q=80",
    "JW-011": "https://images.unsplash.com/photo-1611591475155-4284ec28d351?w=500&auto=format&fit=crop&q=80",
    "JW-012": "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=500&auto=format&fit=crop&q=80",
    "JW-013": "https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=500&auto=format&fit=crop&q=80",
    "JW-014": "https://images.unsplash.com/photo-1603561591411-07134e71a2a9?w=500&auto=format&fit=crop&q=80",
    "JW-015": "https://images.unsplash.com/photo-1599643477877-530eb83abc8e?w=500&auto=format&fit=crop&q=80",
    "JW-016": "https://images.unsplash.com/photo-1630019852942-f89202989a59?w=500&auto=format&fit=crop&q=80",
    "JW-017": "https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=500&auto=format&fit=crop&q=80",
    "JW-018": "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=500&auto=format&fit=crop&q=80",
    "JW-019": "https://images.unsplash.com/photo-1630019852942-f89202989a59?w=500&auto=format&fit=crop&q=80",
    "JW-020": "https://images.unsplash.com/photo-1610375461246-83df859d849d?w=500&auto=format&fit=crop&q=80",
    # --- Electronics ---
    "ELEC-001": "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=500&auto=format&fit=crop&q=80",
    "EL-001": "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=500&auto=format&fit=crop&q=80",
    "EL-002": "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=500&auto=format&fit=crop&q=80",
    "EL-003": "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=500&auto=format&fit=crop&q=80",
    "EL-004": "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=500&auto=format&fit=crop&q=80",
    "EL-005": "https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=500&auto=format&fit=crop&q=80",
    "EL-006": "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=500&auto=format&fit=crop&q=80",
    "EL-007": "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=80",
    "EL-008": "https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=500&auto=format&fit=crop&q=80",
    "EL-009": "https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=500&auto=format&fit=crop&q=80",
    "EL-010": "https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=500&auto=format&fit=crop&q=80",
    "EL-011": "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=500&auto=format&fit=crop&q=80",
    "EL-012": "https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=500&auto=format&fit=crop&q=80",
    "EL-013": "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=500&auto=format&fit=crop&q=80",
    "EL-014": "https://images.unsplash.com/photo-1544724569-5f546fd6f2b5?w=500&auto=format&fit=crop&q=80",
    "EL-015": "https://images.unsplash.com/photo-1545454675-3531b543be5d?w=500&auto=format&fit=crop&q=80",
    "EL-016": "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&auto=format&fit=crop&q=80",
    "EL-017": "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=500&auto=format&fit=crop&q=80",
    "EL-018": "https://images.unsplash.com/photo-1545454675-3531b543be5d?w=500&auto=format&fit=crop&q=80",
    "EL-019": "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=500&auto=format&fit=crop&q=80",
    "EL-020": "https://images.unsplash.com/photo-1585659722983-3a675dabf23d?w=500&auto=format&fit=crop&q=80",
    # --- Fashion ---
    "FASH-001": "https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=500&auto=format&fit=crop&q=80",
    "FASH-002": "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=500&auto=format&fit=crop&q=80",
    "FASH-003": "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=500&auto=format&fit=crop&q=80",
    "FASH-004": "https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?w=500&auto=format&fit=crop&q=80",
    # --- Pharmacy ---
    "PHRM-001": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=500&auto=format&fit=crop&q=80",
    "PHRM-002": "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=500&auto=format&fit=crop&q=80",
    # --- Grocery ---
    "GROC-001": "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500&auto=format&fit=crop&q=80",
    # --- Restaurant ---
    "REST-001": "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=500&auto=format&fit=crop&q=80",
    # --- Meat / Beef Shop ---
    "BEEF-001": "https://images.unsplash.com/photo-1603048588665-791ca8aea617?w=500&auto=format&fit=crop&q=80",
    # --- Optical ---
    "OP-001": "https://images.unsplash.com/photo-1591076482161-42ce6da69f67?w=500&auto=format&fit=crop&q=80",
    "OP-002": "https://images.unsplash.com/photo-1574258495973-f010dfbb5371?w=500&auto=format&fit=crop&q=80",
    # --- Surgical ---
    "SG-001": "https://images.unsplash.com/photo-1584744982491-665216d95f8b?w=500&auto=format&fit=crop&q=80",
    "SG-002": "https://images.unsplash.com/photo-1586942593568-29361efcd571?w=500&auto=format&fit=crop&q=80",
    "SG-003": "https://images.unsplash.com/photo-1583912267670-6575ad472688?w=500&auto=format&fit=crop&q=80",
    # --- Mobile ---
    "MOB-001": "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=500&auto=format&fit=crop&q=80",
    "MOB-ACC-001": "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=500&auto=format&fit=crop&q=80",
    # --- Salon ---
    "SALON-HC": "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=500&auto=format&fit=crop&q=80",
    "SALON-FC": "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=500&auto=format&fit=crop&q=80",
    "SALON-SH": "https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?w=500&auto=format&fit=crop&q=80",
    # --- Hardware ---
    "HW-SCREW": "https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?w=500&auto=format&fit=crop&q=80",
    "HW-CABLE": "https://images.unsplash.com/photo-1544724569-5f546fd6f2b5?w=500&auto=format&fit=crop&q=80",
    "HW-PAINT": "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=500&auto=format&fit=crop&q=80",
    # --- Building Materials ---
    "BM-CEMENT": "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=500&auto=format&fit=crop&q=80",
    "BM-ROD": "https://images.unsplash.com/photo-1535813547-99c456a41d4a?w=500&auto=format&fit=crop&q=80",
    "BM-SAND": "https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?w=500&auto=format&fit=crop&q=80",
    # --- Bookstore ---
    "BK-PHY10": "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=500&auto=format&fit=crop&q=80",
    "BK-MATH12": "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=500&auto=format&fit=crop&q=80",
    "BK-NOVEL": "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=500&auto=format&fit=crop&q=80",
    # --- Stationery ---
    "ST-PEN": "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=500&auto=format&fit=crop&q=80",
    "ST-KHATA": "https://images.unsplash.com/photo-1531346878377-a5be20888e57?w=500&auto=format&fit=crop&q=80",
    "ST-A4": "https://images.unsplash.com/photo-1586075010923-2dd4570fb338?w=500&auto=format&fit=crop&q=80",
    # --- Cosmetics ---
    "COS-LIP": "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=500&auto=format&fit=crop&q=80",
    "COS-FOUND": "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=500&auto=format&fit=crop&q=80",
    "COS-CREAM": "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=500&auto=format&fit=crop&q=80",
}


def _ensure_hr_presets(session: Session, company_id: str) -> None:
    from app.models.mini_hr import MiniHrDepartment, MiniHrDesignation
    
    depts = [
        ("OPS", "Sales & Retail Operations", "Manage direct store floor sales and retail transactions."),
        ("FIN", "Finance & Billing", "Handle cash drawer audits, invoices, bookkeeping, and cash out flows."),
        ("INV", "Inventory & Logistics", "Manage stock receiving, warehouse inventory ledger, and supplier purchases."),
        ("SUP", "Customer Support & Relations", "Manage optical prescriptions, tailoring details, customer loyalty programs."),
        ("ADM", "HR & Administration", "Manage employee records, user system logins, shifts roster planning."),
        ("KIT", "Kitchen & Culinary", "Manage food preparation, restaurant KOT lanes, and recipe billing."),
        ("SAL", "Styling & Beauty Care", "Manage salon appointments, styling commissions, and beauty treatments."),
    ]
    
    for code, name, desc in depts:
        existing = session.exec(
            select(MiniHrDepartment).where(
                MiniHrDepartment.company_id == company_id,
                (MiniHrDepartment.department_code == code) | (MiniHrDepartment.department_name == name)
            )
        ).first()
        if not existing:
            session.add(MiniHrDepartment(company_id=company_id, department_code=code, department_name=name, description=desc))
            
    desigs = [
        ("GM", "Store General Manager", "Overall operations supervisor for retail stores and warehouses.", 1),
        ("SM", "Senior Store Manager", "Manages daily sales, shifts roster, and inventory ordering.", 2),
        ("ASM", "Assistant Store Manager", "Supports store manager, manages cash desk lane operations.", 3),
        ("LCH", "Lead Cashier / Billing Specialist", "Supervises POS checkouts, returns, cash drawers variance.", 4),
        ("SR", "Sales Representative / Retail Associate", "Frontline customer guidance, sales floor helper.", 5),
        ("INV_LEAD", "Inventory Lead / Warehouse Specialist", "Warehouse stock ledger master, counts stock balances.", 4),
        ("STYLIST", "Senior Stylist / Beauty Consultant", "Provides beauty care and salon treatments.", 4),
        ("CHEF", "Head Chef / Kitchen Lead", "Manages KOT orders, recipes, food quality controls.", 4),
        ("CASHIER", "Store Cashier / Drawer Operator", "Standard POS billing operator, opens and closes counter shifts.", 5),
        ("PHARMACIST", "Registered Pharmacist", "Dispenses prescription medicine, controls medical stocks.", 4),
        ("TAILOR", "Master Tailor / Cutter", "Performs custom measurements, cutting, and alteration operations.", 4),
        ("WAITER", "Waiter / Server", "Front-of-house customer table service, carries orders to table.", 5),
        ("KITCHEN_HELPER", "Kitchen Helper / Prep Cook", "Assists line chef, raw ingredients washing/peeling.", 5),
        ("JR_STYLIST", "Junior Stylist / Helper", "Assists stylist, shampoos hair, salon cleanups.", 5),
        ("OPTOMETRIST", "Optometrist / Eye Specialist", "Performs eye examinations, configures lens prescriptions.", 4),
        ("JEWELRY_APPRAISER", "Jewelry Appraiser / Gold Smith", "Evaluates gold purity, weights, and gemstone value.", 4),
        ("DELIVERY", "Delivery Rider / Driver", "Dispatches warehouse orders and coordinates home delivery logistics.", 5),
    ]
    
    for code, name, desc, level in desigs:
        existing = session.exec(
            select(MiniHrDesignation).where(
                MiniHrDesignation.company_id == company_id,
                (MiniHrDesignation.designation_code == code) | (MiniHrDesignation.designation_name == name)
            )
        ).first()
        if not existing:
            session.add(MiniHrDesignation(company_id=company_id, designation_code=code, designation_name=name, description=desc, level=level))
            
    session.flush()


def _ensure_demo_hr_full(session: Session, company_id: str, store_id: str) -> None:
    from datetime import date, datetime, timedelta
    from app.models.mini_hr import (
        MiniHrDepartment, MiniHrDesignation, MiniHrEmployee,
        MiniHrAttendance, MiniHrLeaveRequest, MiniHrShiftRoster,
    )
    from app.models.core import UserAccount

    _ensure_hr_presets(session, company_id)

    dept = session.exec(select(MiniHrDepartment).where(MiniHrDepartment.company_id == company_id)).first()
    desig = session.exec(select(MiniHrDesignation).where(MiniHrDesignation.company_id == company_id)).first()
    dept_id = dept.id if dept else None
    desig_id = desig.id if desig else None

    existing_emps = session.exec(select(MiniHrEmployee).where(MiniHrEmployee.company_id == company_id)).all()
    if len(existing_emps) < 5:
        users = session.exec(select(UserAccount).where(UserAccount.company_id == company_id)).all()
        user_map = {u.email: u.id for u in users}

        sample_employees = [
            ("Mashfak", "Rahman", "admin@pulse.pos", "+880 1711-000001", "EMP-ADM01", "active"),
            ("Salma", "Begum", "manager@pulse.pos", "+880 1711-000002", "EMP-MGR01", "active"),
            ("Mahin", "Hossain", "cashier@pulse.pos", "+880 1711-000003", "EMP-CSH01", "active"),
            ("Imran", "Kabir", "inventory@pulse.pos", "+880 1711-000004", "EMP-INV01", "active"),
            ("Rajan", "Ahmed", "auditor@pulse.pos", "+880 1711-000005", "EMP-AUD01", "active"),
            ("Nadia", "Islam", "nadia@pulse.pos", "+880 1711-000006", "EMP-SR01", "active"),
            ("Tariq", "Hasan", "tariq@pulse.pos", "+880 1711-000007", "EMP-SR02", "active"),
            ("Fatima", "Zohra", "fatima@pulse.pos", "+880 1711-000008", "EMP-CSH02", "active"),
            ("Sumi", "Akter", "sumi@pulse.pos", "+880 1711-000009", "EMP-CSH03", "active"),
            ("Mukul", "Kanti", "mukul@pulse.pos", "+880 1711-000010", "EMP-INV02", "active"),
            ("Roksana", "Parvin", "roksana@pulse.pos", "+880 1711-000011", "EMP-SR03", "active"),
            ("Bellal", "Hossain", "bellal@pulse.pos", "+880 1711-000012", "EMP-MGR02", "active"),
            ("Nasima", "Jahan", "nasima@pulse.pos", "+880 1711-000013", "EMP-SR04", "active"),
            ("Kamrul", "Hasan", "kamrul@pulse.pos", "+880 1711-000014", "EMP-SR05", "active"),
            ("Dilruba", "Yasmin", "dilruba@pulse.pos", "+880 1711-000015", "EMP-SR06", "active"),
        ]

        for fname, lname, email, phone, code, status in sample_employees:
            if not any(e.email == email or e.employee_code == code for e in existing_emps):
                emp = MiniHrEmployee(
                    company_id=company_id,
                    user_account_id=user_map.get(email),
                    employee_code=code,
                    first_name=fname,
                    last_name=lname,
                    full_name=f"{fname} {lname}",
                    display_name=fname,
                    email=email,
                    mobile=phone,
                    joining_date=date(2025, 1, 15),
                    department_id=dept_id,
                    designation_id=desig_id,
                    primary_store_id=store_id,
                    employment_type="full_time",
                    employee_status=status,
                )
                session.add(emp)
        session.flush()
        existing_emps = session.exec(select(MiniHrEmployee).where(MiniHrEmployee.company_id == company_id)).all()

    emp_ids = [e.id for e in existing_emps]
    if not emp_ids:
        return

    att_count = session.exec(select(MiniHrAttendance).where(MiniHrAttendance.company_id == company_id)).all()
    if len(att_count) < 5:
        today = date.today()
        statuses = ["present", "present", "late", "present", "half_day", "present"]
        for idx, eid in enumerate(emp_ids[:15]):
            d = today - timedelta(days=idx % 7)
            clock_in = datetime.combine(d, datetime.min.time()).replace(hour=9, minute=(idx * 7) % 30)
            clock_out = datetime.combine(d, datetime.min.time()).replace(hour=17, minute=30)
            session.add(
                MiniHrAttendance(
                    company_id=company_id,
                    store_id=store_id,
                    employee_id=eid,
                    attendance_date=d,
                    clock_in=clock_in,
                    clock_out=clock_out,
                    status=statuses[idx % len(statuses)],
                    notes="Daily shift record",
                )
            )

    leave_count = session.exec(select(MiniHrLeaveRequest).where(MiniHrLeaveRequest.company_id == company_id)).all()
    if len(leave_count) < 5:
        leave_types = ["annual", "sick", "emergency", "unpaid"]
        l_statuses = ["approved", "pending", "approved", "rejected"]
        reasons = ["Family function", "Medical checkup", "Personal errands", "Seasonal leave"]
        today = date.today()
        for idx, eid in enumerate(emp_ids[:10]):
            st = today + timedelta(days=(idx * 2) - 5)
            en = st + timedelta(days=1)
            session.add(
                MiniHrLeaveRequest(
                    company_id=company_id,
                    employee_id=eid,
                    store_id=store_id,
                    leave_type=leave_types[idx % len(leave_types)],
                    start_date=st,
                    end_date=en,
                    total_days=2.0,
                    reason=reasons[idx % len(reasons)],
                    status=l_statuses[idx % len(l_statuses)],
                )
            )

    shift_count = session.exec(select(MiniHrShiftRoster).where(MiniHrShiftRoster.company_id == company_id)).all()
    if len(shift_count) < 5:
        shift_types = ["morning", "afternoon", "evening", "morning", "off"]
        today = date.today()
        for idx, eid in enumerate(emp_ids[:15]):
            d = today + timedelta(days=(idx % 7) - 3)
            session.add(
                MiniHrShiftRoster(
                    company_id=company_id,
                    employee_id=eid,
                    store_id=store_id,
                    shift_date=d,
                    shift_type=shift_types[idx % len(shift_types)],
                    notes="Assigned shift schedule",
                )
            )

    session.flush()


def _ensure_demo_purchases_full(session: Session, company_id: str, store_id: str) -> None:
    from datetime import date, timedelta
    from app.models.sales import PurchaseInvoice, PurchaseInvoiceLine, Supplier
    from app.models.product import Product

    po_count = session.exec(select(PurchaseInvoice).where(PurchaseInvoice.company_id == company_id)).all()
    if len(po_count) >= 5:
        return

    suppliers = session.exec(select(Supplier).where(Supplier.company_id == company_id)).all()
    if not suppliers:
        sup_names = [
            ("SUP-001", "Demo Meat Supplier", "Mr. Rahim", "+880 1700-000001"),
            ("SUP-002", "Fashion Wholesale Ltd", "Ms. Nazia", "+880 1700-000002"),
            ("SUP-003", "Pharma Distributors BD", "Mr. Kabir", "+880 1700-000003"),
            ("SUP-004", "Indigo Lane Wholesale", "Ms. Sumi", "+880 1711-200004"),
            ("SUP-005", "AquaPure Beverages", "Mr. Tariq", "+880 1711-200005"),
            ("SUP-006", "Beximco Pharma Ltd", "Mr. Hasan", "+880 1712-300006"),
            ("SUP-007", "Square Pharmaceuticals", "Ms. Rekha", "+880 1712-300007"),
            ("SUP-008", "Apex Footwear Ltd", "Mr. Jalal", "+880 1713-400008"),
            ("SUP-009", "ACI Consumer Brands", "Mr. Saiful", "+880 1714-500010"),
            ("SUP-010", "Pran-RFL Group BD", "Ms. Taslima", "+880 1714-500011"),
        ]
        for code, name, contact, phone in sup_names:
            sup = Supplier(
                company_id=company_id,
                supplier_code=code,
                supplier_name=name,
                contact_person=contact,
                phone=phone,
                email=f"contact@{code.lower()}.com",
                is_active=True,
            )
            session.add(sup)
        session.flush()
        suppliers = session.exec(select(Supplier).where(Supplier.company_id == company_id)).all()

    prods = session.exec(select(Product).where(Product.company_id == company_id)).all()
    today = date.today()
    statuses = ["received", "partial", "open", "draft", "received"]

    for i in range(1, 16):
        sup = suppliers[i % len(suppliers)]
        po_num = f"PO-2026-{1100 + i}"
        p_date = today - timedelta(days=i * 2)
        inv = PurchaseInvoice(
            company_id=company_id,
            store_id=store_id,
            supplier_id=sup.id,
            purchase_number=po_num,
            purchase_date=p_date,
            status=statuses[i % len(statuses)],
            subtotal=25000 + (i * 3400),
            tax=1250 + (i * 170),
            total=26250 + (i * 3570),
            paid_amount=26250 if statuses[i % len(statuses)] == "received" else 10000,
            due_amount=0 if statuses[i % len(statuses)] == "received" else 16250,
            notes=f"Bulk purchase order #{po_num}",
        )
        session.add(inv)
        session.flush()

        if prods:
            p = prods[i % len(prods)]
            line = PurchaseInvoiceLine(
                company_id=company_id,
                purchase_id=inv.id,
                product_id=p.id,
                sku=p.sku,
                name=p.name,
                qty=50 + i * 5,
                unit_price=p.cost_price or (p.base_price * 0.7),
                line_total=(50 + i * 5) * (p.cost_price or (p.base_price * 0.7)),
            )
            session.add(line)

    session.flush()


def ensure_demo_super_admin(session: Session, company: Company) -> None:
    """Keep the demo login as tenant Super Admin, never platform admin."""
    user = session.exec(
        select(UserAccount).where(
            UserAccount.company_id == company.id,
            UserAccount.email == "admin@pulse.pos",
        )
    ).first()
    if not user:
        return

    role = session.exec(
        select(Role).where(
            Role.company_id == company.id,
            Role.code == "Super Admin",
        )
    ).first()
    if not role:
        role = Role(
            company_id=company.id,
            code="Super Admin",
            name="Super Admin",
            is_system=True,
        )
        session.add(role)
        session.flush()

    existing_permissions = {
        row.permission_id
        for row in session.exec(
            select(RolePermission).where(RolePermission.role_id == role.id)
        ).all()
    }
    for permission in session.exec(select(Permission)).all():
        if permission.id not in existing_permissions:
            session.add(
                RolePermission(
                    role_id=role.id,
                    permission_id=permission.id,
                    allowed=True,
                )
            )

    for user_role in session.exec(
        select(UserRole).where(UserRole.user_id == user.id)
    ).all():
        session.delete(user_role)
    session.flush()
    session.add(UserRole(user_id=user.id, role_id=role.id))
    # Demo tenant Super Admin also operates the SaaS control center.
    user.full_name = "Mashfak Rahman"
    user.is_platform_admin = True
    session.add(user)


def seed_outfit_company(session: Session) -> None:
    """Create OUTFIT as a fully independent company (code='OUTFIT').
    Idempotent — safe to call on every startup.
    """
    # ── 1. Company ──────────────────────────────────────────────────────────
    company = session.exec(select(Company).where(Company.code == "OUTFIT")).first()
    if not company:
        company = Company(
            code="OUTFIT",
            name="OUTFIT",
            legal_name="OUTFIT FASHION",
            address="Main Road, Basurhat Powrasava, Companyganj, Noakhali-3850",
            phone="+880 1819557711",
            email="outfit.fashion.0325@gmail.com",
        )
        session.add(company)
        session.flush()
    else:
        company.name = "OUTFIT"
        company.legal_name = "OUTFIT FASHION"
        session.add(company)

    company_id = company.id

    # ── 2. Permissions (global table — idempotent) ───────────────────────────
    for code in PERMISSIONS:
        if not session.exec(select(Permission).where(Permission.code == code[0])).first():
            session.add(Permission(code=code[0], name=code[1], module=code[2]))
    session.flush()
    perm_map = {p.code: p.id for p in session.exec(select(Permission)).all()}

    # ── 3. Roles + permissions for OUTFIT company ────────────────────────────
    existing_role_codes = {
        r.code for r in session.exec(select(Role).where(Role.company_id == company_id)).all()
    }
    roles: dict[str, Role] = {}
    for role_code in DEFAULT_ROLE_PERMISSIONS:
        if role_code not in existing_role_codes:
            role = Role(company_id=company_id, code=role_code, name=role_code, is_system=True)
            session.add(role)
            roles[role_code] = role
        else:
            roles[role_code] = session.exec(
                select(Role).where(Role.company_id == company_id, Role.code == role_code)
            ).first()
    session.flush()

    for role_code, perms in DEFAULT_ROLE_PERMISSIONS.items():
        role = roles.get(role_code)
        if not role:
            continue
        existing_perms = {
            rp.permission_id
            for rp in session.exec(select(RolePermission).where(RolePermission.role_id == role.id)).all()
        }
        for perm_code in perms:
            pid = perm_map.get(perm_code)
            if pid and pid not in existing_perms:
                session.add(RolePermission(role_id=role.id, permission_id=pid, allowed=True))

    # ── 4. Store ─────────────────────────────────────────────────────────────
    outfit_store = session.exec(
        select(Store).where(Store.company_id == company_id, Store.code == "OUTFIT-01")
    ).first()
    if not outfit_store:
        outfit_store = Store(
            company_id=company_id,
            code="OUTFIT-01",
            name="OUTFIT Basurhat Outlet",
            address="Main Road, Basurhat Powrasava, Companyganj, Noakhali-3850",
        )
        session.add(outfit_store)
        session.flush()

    target_store_id = outfit_store.id

    # ── 5. Admin user — S M Babar ────────────────────────────────────────────
    admin = session.exec(
        select(UserAccount).where(
            UserAccount.company_id == company_id, UserAccount.username == "babar"
        )
    ).first()
    if not admin:
        admin = UserAccount(
            company_id=company_id,
            store_id=target_store_id,
            email="outfit.fashion.0325@gmail.com",
            username="babar",
            full_name="S M Babar",
            password_hash=hash_password("admin123"),
            # Company-level Super Admin only — NOT a platform admin.
            # is_platform_admin stays False.
        )
        session.add(admin)
        session.flush()
        sa_role = roles.get("Super Admin")
        if sa_role:
            session.add(UserRole(user_id=admin.id, role_id=sa_role.id))
    else:
        admin.store_id = target_store_id
        admin.is_platform_admin = False  # ensure no accidental platform access
        session.add(admin)

    # ── 6. Cashier user — OUTFiT ────────────────────────────────────────────
    sales = session.exec(
        select(UserAccount).where(
            UserAccount.company_id == company_id, UserAccount.username == "OUTFiT"
        )
    ).first()
    if not sales:
        sales = UserAccount(
            company_id=company_id,
            store_id=target_store_id,
            email="outfit@pos.com",
            username="OUTFiT",
            full_name="OUTFiT",
            password_hash=hash_password("outfit123"),
        )
        session.add(sales)
        session.flush()
        c_role = roles.get("Cashier")
        if c_role:
            session.add(UserRole(user_id=sales.id, role_id=c_role.id))
    else:
        sales.store_id = target_store_id
        session.add(sales)

    # ── 7. IndustryPack rows — fashion ONLY enabled ──────────────────────────
    existing_pack_codes = {
        p.industry_code
        for p in session.exec(select(IndustryPack).where(IndustryPack.company_id == company_id)).all()
    }
    enabled_outfit_packs = {"fashion"}
    for pack_code in INDUSTRY_PACKS:
        is_active = pack_code in enabled_outfit_packs
        if pack_code not in existing_pack_codes:
            session.add(IndustryPack(
                company_id=company_id,
                industry_code=pack_code,
                enabled_company=is_active,
                enabled_store=is_active,
                enabled_counter=is_active,
                updated_by="seed",
            ))
        else:
            pack = session.exec(
                select(IndustryPack).where(
                    IndustryPack.company_id == company_id,
                    IndustryPack.industry_code == pack_code,
                )
            ).first()
            if pack:
                pack.enabled_company = is_active
                pack.enabled_store = is_active
                pack.enabled_counter = is_active
                session.add(pack)

    # ── 7.5. Subscription & Approval for OUTFIT ──────────────────────────────
    company.approval_status = "approved"
    if not company.approved_at:
        company.approved_at = datetime.now(timezone.utc)
    session.add(company)

    from app.models.saas import SubscriptionPlan, TenantSubscription
    starter_plan = session.exec(select(SubscriptionPlan).where(SubscriptionPlan.code == "starter")).first()
    if starter_plan:
        sub = session.exec(select(TenantSubscription).where(TenantSubscription.company_id == company_id)).first()
        if not sub:
            sub = TenantSubscription(
                company_id=company_id,
                plan_id=starter_plan.id,
                status="active",
                billing_cycle="monthly",
                started_at=datetime.now(timezone.utc),
                expires_at=datetime.now(timezone.utc) + timedelta(days=365),
            )
            session.add(sub)
        else:
            sub.status = "active"
            session.add(sub)

    session.flush()
    from app.cache import invalidate_company_config
    invalidate_company_config(company_id)

    # ── 8. Clean up leftover OUTFIT users that were previously embedded in PULSE-DEMO ──
    pulse_demo_company = session.exec(
        select(Company).where(Company.code == "PULSE-DEMO")
    ).first()
    if pulse_demo_company:
        for leftover_username in ("babar", "OUTFiT"):
            leftover = session.exec(
                select(UserAccount).where(
                    UserAccount.company_id == pulse_demo_company.id,
                    UserAccount.username == leftover_username,
                )
            ).first()
            if leftover:
                for ur in session.exec(
                    select(UserRole).where(UserRole.user_id == leftover.id)
                ).all():
                    session.delete(ur)
                session.flush()
                session.delete(leftover)


def seed_eimama_company(session: Session) -> None:
    """Create EI MAMA STREET FOOD as an independent company (code='EIMAMA').
    Starter Pack: RESTAURANT POS ONLY.
    Idempotent — safe to call on every startup.
    """
    from app.models.saas import TenantSubscription, SubscriptionPlan
    from app.models.product import ProductCategory
    from app.services.inventory_service import record_stock_movement
    from app.models.inventory import StockLedger
    from app.services.restaurant_service import _reconcile_stale_table
    OPENING = "OPENING"

    # ── 1. Company ──────────────────────────────────────────────────────────
    company = session.exec(select(Company).where(Company.code == "EIMAMA")).first()
    if not company:
        company = Company(
            code="EIMAMA",
            name="EI MAMA STREET FOOD",
            legal_name="EI MAMA STREET FOOD LTD",
            address="House 26, Block B, Main Road, Nobodoy Housing Society, Mohammadpur, Dhaka-1207",
            phone="01854-963923",
            email="contact@eimamabd.com",
        )
        session.add(company)
        session.flush()
    else:
        company.name = "EI MAMA STREET FOOD"
        company.legal_name = "EI MAMA STREET FOOD LTD"
        company.address = "House 26, Block B, Main Road, Nobodoy Housing Society, Mohammadpur, Dhaka-1207"
        company.phone = "01854-963923"
        session.add(company)

    company_id = company.id

    # ── 1.1 Chart of Accounts (Seeding account 1012, 1011, etc. for billing) ──
    from app.services.accounting_service import seed_default_chart_of_accounts
    seed_default_chart_of_accounts(session, company_id)

    # Bundled menu photos are published by app.main at startup, not here — the
    # images must exist even on a boot with SEED_ON_STARTUP=false.

    # ── 2. Permissions (global table) ───────────────────────────────────────
    for code in PERMISSIONS:
        if not session.exec(select(Permission).where(Permission.code == code[0])).first():
            session.add(Permission(code=code[0], name=code[1], module=code[2]))
    session.flush()
    perm_map = {p.code: p.id for p in session.exec(select(Permission)).all()}

    # ── 3. Roles + permissions ──────────────────────────────────────────────
    existing_role_codes = {
        r.code for r in session.exec(select(Role).where(Role.company_id == company_id)).all()
    }
    roles: dict[str, Role] = {}
    for role_code in DEFAULT_ROLE_PERMISSIONS:
        if role_code not in existing_role_codes:
            role = Role(company_id=company_id, code=role_code, name=role_code, is_system=True)
            session.add(role)
            roles[role_code] = role
        else:
            roles[role_code] = session.exec(
                select(Role).where(Role.company_id == company_id, Role.code == role_code)
            ).first()
    session.flush()

    for role_code, perms in DEFAULT_ROLE_PERMISSIONS.items():
        role = roles.get(role_code)
        if not role:
            continue
        existing_perms = {
            rp.permission_id
            for rp in session.exec(select(RolePermission).where(RolePermission.role_id == role.id)).all()
        }
        for perm_code in perms:
            pid = perm_map.get(perm_code)
            if pid and pid not in existing_perms:
                session.add(RolePermission(role_id=role.id, permission_id=pid, allowed=True))

    # ── 4. Store & Counter ──────────────────────────────────────────────────
    store = session.exec(select(Store).where(Store.company_id == company_id, Store.code == "EIMAMA-01")).first()
    if not store:
        store = Store(
            company_id=company_id,
            code="EIMAMA-01",
            name="Ei Mama Street Food - Main Branch",
            address="House 26, Block B, Main Road, Nobodoy Housing Society, Mohammadpur, Dhaka-1207",
            phone="01854-963923",
            is_active=True,
        )
        session.add(store)
        session.flush()

    counter = session.exec(select(Counter).where(Counter.store_id == store.id, Counter.code == "EIMAMA-C1")).first()
    if not counter:
        counter = Counter(
            company_id=company_id,
            store_id=store.id,
            code="EIMAMA-C1",
            name="Main Counter 1",
            is_active=True,
        )
        session.add(counter)
        session.flush()

    # ── 5. User Account (EIMAMA / admin123) ─────────────────────────────────
    user = session.exec(
        select(UserAccount).where(
            UserAccount.company_id == company_id,
            (UserAccount.username == "EIMAMA") | (UserAccount.username == "eimama"),
        )
    ).first()
    if not user:
        user = UserAccount(
            company_id=company_id,
            store_id=store.id,
            counter_id=counter.id,
            username="eimama",
            email="eimama@pulsenext.com",
            password_hash=hash_password("admin123"),
            full_name="Ei Mama Store Admin",
            role="admin",
            is_active=True,
        )
        session.add(user)
        session.flush()
    else:
        user.password_hash = hash_password("admin123")
        user.is_active = True
        session.add(user)
        session.flush()

    admin_role = (
        roles.get("Admin")
        or roles.get("admin")
        or session.exec(
            select(Role).where(Role.company_id == company_id, (Role.code == "Admin") | (Role.code == "admin"))
        ).first()
    )
    if admin_role:
        ur_exist = session.exec(select(UserRole).where(UserRole.user_id == user.id)).first()
        if not ur_exist:
            session.add(UserRole(user_id=user.id, role_id=admin_role.id))
            session.flush()

    # ── 6. Industry Packs — RESTAURANT POS ONLY ──────────────────────────────
    for pack_code in INDUSTRY_PACKS:
        existing_pack = session.exec(
            select(IndustryPack).where(
                IndustryPack.company_id == company_id,
                IndustryPack.industry_code == pack_code,
            )
        ).first()
        is_restaurant = (pack_code == "restaurant")
        if not existing_pack:
            session.add(
                IndustryPack(
                    company_id=company_id,
                    industry_code=pack_code,
                    enabled_company=is_restaurant,
                    enabled_store=is_restaurant,
                    enabled_counter=is_restaurant,
                    updated_by="seed_eimama",
                )
            )
        else:
            existing_pack.enabled_company = is_restaurant
            existing_pack.enabled_store = is_restaurant
            existing_pack.enabled_counter = is_restaurant
            session.add(existing_pack)

    # Company Approval & Subscription Plan (Starter)
    company.approval_status = "approved"
    if not company.approved_at:
        company.approved_at = datetime.now(timezone.utc)
    session.add(company)

    starter_plan = session.exec(select(SubscriptionPlan).where(SubscriptionPlan.code == "starter")).first()
    if starter_plan:
        sub = session.exec(select(TenantSubscription).where(TenantSubscription.company_id == company_id)).first()
        if not sub:
            sub = TenantSubscription(
                company_id=company_id,
                plan_id=starter_plan.id,
                status="active",
                billing_cycle="monthly",
                started_at=datetime.now(timezone.utc),
                expires_at=datetime.now(timezone.utc) + timedelta(days=365),
            )
            session.add(sub)
        else:
            sub.status = "active"
            session.add(sub)

    # ── 7. Categories ────────────────────────────────────────────────────────
    cat_names = [
        "Appetizer",
        "Fried Rice",
        "Sandwich",
        "Burger",
        "Meat Box",
        "Pasta",
        "French Fries",
        "Fried Chicken",
        "Other Items",
        "Beverages",
    ]
    cat_map = {}
    for cname in cat_names:
        c_existing = session.exec(
            select(ProductCategory).where(ProductCategory.company_id == company_id, ProductCategory.name == cname)
        ).first()
        if not c_existing:
            c_existing = ProductCategory(
                company_id=company_id,
                code=cname.upper().replace(" ", "_"),
                name=cname,
                is_active=True,
            )
            session.add(c_existing)
            session.flush()
        cat_map[cname] = c_existing.id

    # ── 8. Menu Items from Official Menu Card ─────────────────────────────────
    menu_items = [
        # 1. Appetizer (এপিটাইজার)
        ("EM-APP-01", "Luchi (Per Pc) / লুচি", "Appetizer", 10, "Kitchen"),
        ("EM-APP-02", "Chola Batora / ছোলা বাটোরা", "Appetizer", 60, "Kitchen"),
        ("EM-APP-03", "Chicken Jhal Fry / চিকেন ঝাল ফ্রাই", "Appetizer", 80, "Kitchen"),
        ("EM-APP-04", "Chicken Chaap / চিকেন চাপ", "Appetizer", 130, "Grill"),
        ("EM-APP-05", "Haleem / হালিম", "Appetizer", 80, "Kitchen"),
        ("EM-APP-06", "Chicken Soup / চিকেন স্যুপ", "Appetizer", 50, "Kitchen"),
        ("EM-APP-07", "Chicken Steak / চিকেন স্টেক", "Appetizer", 200, "Grill"),

        # 2. Fried Rice & Combos (ফ্রাইড রাইস)
        ("EM-RICE-01", "Student Special (Rice, Veg, Chicken 2pcs)", "Fried Rice", 60, "Kitchen"),
        ("EM-RICE-02", "Regular Combo (Rice, Veg, Chicken 2pcs)", "Fried Rice", 120, "Kitchen"),
        ("EM-RICE-03", "Superior Combo (Rice, Veg, Chicken 2pcs, Chili)", "Fried Rice", 180, "Kitchen"),

        # 3. Sandwich (স্য্যান্ডউইচ)
        ("EM-SW-01", "Egg Sandwich (Student Special)", "Sandwich", 30, "Kitchen"),
        ("EM-SW-02", "Chicken Sandwich", "Sandwich", 50, "Kitchen"),
        ("EM-SW-03", "Club Sandwich", "Sandwich", 70, "Kitchen"),
        ("EM-SW-04", "Cheese Sandwich", "Sandwich", 70, "Kitchen"),
        ("EM-SW-05", "Sub Sandwich", "Sandwich", 120, "Kitchen"),

        # 4. Burger (বার্গার)
        ("EM-BGR-01", "Chicken Burger", "Burger", 70, "Grill"),
        ("EM-BGR-02", "Mini Burger Combo", "Burger", 50, "Grill"),
        ("EM-BGR-03", "Cheese Burger", "Burger", 100, "Grill"),

        # 5. Meat Box (মিট বক্স)
        ("EM-BOX-01", "Mini Meat Box (Student Special)", "Meat Box", 50, "Kitchen"),
        ("EM-BOX-02", "Medium Meat Box", "Meat Box", 100, "Kitchen"),
        ("EM-BOX-03", "Large Meat Box", "Meat Box", 150, "Kitchen"),

        # 6. Pasta (পাস্তা)
        ("EM-PST-01", "Student Special Pasta", "Pasta", 50, "Kitchen"),
        ("EM-PST-02", "Regular Pasta", "Pasta", 80, "Kitchen"),

        # 7. French Fries (ফ্রেঞ্চ ফ্রাই)
        ("EM-FF-01", "French Fries (Student Special)", "French Fries", 30, "Kitchen"),
        ("EM-FF-02", "Regular French Fries", "French Fries", 50, "Kitchen"),

        # 8. Fried Chicken (ফ্রাইড চিকেন)
        ("EM-FC-01", "Chicken Fry (Leg / Roast pc)", "Fried Chicken", 99, "Kitchen"),
        ("EM-FC-02", "Chicken Combo (2pcs Mixed)", "Fried Chicken", 189, "Kitchen"),
        ("EM-FC-03", "Chicken Bucket (5pcs)", "Fried Chicken", 449, "Kitchen"),
        ("EM-FC-04", "Chicken Bucket (10pcs)", "Fried Chicken", 799, "Kitchen"),
        ("EM-FC-05", "Hot Wings (Spicy 2pcs)", "Fried Chicken", 50, "Kitchen"),
        ("EM-FC-06", "Crispy Chicken Fry", "Fried Chicken", 110, "Kitchen"),

        # 9. Other Items (অন্যান্য আইটেম)
        ("EM-OTH-01", "Chicken Ball Fry", "Other Items", 40, "Kitchen"),
        ("EM-OTH-02", "Chicken Chop", "Other Items", 120, "Kitchen"),
        ("EM-OTH-03", "Nati Combo / রোল", "Other Items", 50, "Kitchen"),
        ("EM-OTH-04", "Dry Cake (4 Pcs)", "Other Items", 50, "Kitchen"),
        ("EM-OTH-05", "Cola BBQ Chicken", "Other Items", 60, "Grill"),

        # 10. Drinks & Cold Beverages (ড্রিংকস)
        ("EM-DRK-01", "Mineral Water (250ml)", "Beverages", 20, "Beverage Bar"),
        ("EM-DRK-02", "Cold Drinks / Soda", "Beverages", 30, "Beverage Bar"),
    ]

    for pcode, pname, cat_name, price, station in menu_items:
        prod = session.exec(
            select(Product).where(Product.company_id == company_id, Product.sku == pcode)
        ).first()
        cat_id = cat_map.get(cat_name)
        img_url = f"/food-images/{pcode}.jpg"
        meta_dict = {"kitchen_station": station, "image": img_url, "category": cat_name}

        if not prod:
            prod = Product(
                company_id=company_id,
                sku=pcode,
                barcode=pcode,
                name=pname,
                category_id=cat_id,
                base_price=price,
                industry_pack="restaurant",
                meta_json=json.dumps(meta_dict),
                is_active=True,
            )
            session.add(prod)
            session.flush()
        else:
            meta = json.loads(prod.meta_json) if prod.meta_json else {}
            meta.update(meta_dict)
            prod.meta_json = json.dumps(meta)
            prod.base_price = price
            prod.name = pname
            if cat_id:
                prod.category_id = cat_id
            session.add(prod)
            session.flush()

        move = session.exec(select(StockLedger).where(StockLedger.company_id == company_id, StockLedger.product_id == prod.id)).first()
        if not move:
            record_stock_movement(
                session,
                company_id=company_id,
                product_id=prod.id,
                store_id=store.id,
                warehouse_id=None,
                in_qty=100,
                transaction_type=OPENING,
                transaction_ref=f"SEED-{pcode}",
                note="Ei Mama menu item opening stock",
            )

    # ── 9. Restaurant Tables ────────────────────────────────────────────────
    tables_data = [
        ("T-01", "Table 1", 4),
        ("T-02", "Table 2", 4),
        ("T-03", "Table 3", 2),
        ("T-04", "Table 4", 6),
        ("T-05", "Table 5", 4),
        ("VIP-01", "VIP Table 1", 8),
    ]
    for tcode, tname, cap in tables_data:
        tb = session.exec(select(RestaurantTable).where(RestaurantTable.company_id == company_id, RestaurantTable.table_no == tcode)).first()
        if not tb:
            session.add(
                RestaurantTable(
                    company_id=company_id,
                    store_id=store.id,
                    table_no=tcode,
                    table_name=tname,
                    capacity=cap,
                    status="available",
                    is_active=True,
                )
            )
        else:
            # Only reconcile bookkeeping that has gone stale. Forcing status to
            # "available" here would wipe a genuinely occupied table on every
            # restart, and cancelling live orders to "free" tables strands the
            # POS on a closed order that can never be paid.
            _reconcile_stale_table(session, tb)
            session.add(tb)

    session.flush()
    from app.cache import invalidate_company_config
    invalidate_company_config(company_id)


def seed_talico_company(session: Session) -> None:
    """Create TALI CO KITCHEN as an independent company (code='TALICO').
    Address: Ananda Nagar, Tali company road, Mirpur, Darussalam, Dhaka-1216.
    Hotline: +880195 2233933
    Exclusive Vertical: RESTAURANT POS ONLY.
    Idempotent — safe to call on startup.
    """
    from app.models.saas import TenantSubscription, SubscriptionPlan
    from app.models.product import ProductCategory, Unit
    from app.models.inventory import StockLedger
    from app.models.industry import RestaurantTable, RestaurantCombo, RestaurantComboItem
    from app.services.accounting_service import seed_default_chart_of_accounts
    from app.services.inventory_service import record_stock_movement
    from app.services.restaurant_service import _reconcile_stale_table
    from app.cache import invalidate_company_config
    import json

    OPENING = "opening"

    # ── 1. Company ──────────────────────────────────────────────────────────
    company = session.exec(select(Company).where(Company.code == "TALICO")).first()
    if not company:
        company = Company(
            code="TALICO",
            name="Tali Co Kitchen",
            legal_name="Tali Co Kitchen Ltd",
            address="Ananda Nagar, Tali company road, Mirpur, Darussalam, Dhaka-1216",
            phone="+880195 2233933",
            email="admin@talicokitchen.com",
            approval_status="approved",
            approved_at=datetime.now(timezone.utc),
        )
        session.add(company)
        session.flush()
    else:
        company.name = "Tali Co Kitchen"
        company.legal_name = "Tali Co Kitchen Ltd"
        company.address = "Ananda Nagar, Tali company road, Mirpur, Darussalam, Dhaka-1216"
        company.phone = "+880195 2233933"
        company.email = "admin@talicokitchen.com"
        company.approval_status = "approved"
        if not company.approved_at:
            company.approved_at = datetime.now(timezone.utc)
        session.add(company)
        session.flush()

    company_id = company.id

    # ── 1.1 Chart of Accounts ──────────────────────────────────────────────
    seed_default_chart_of_accounts(session, company_id)

    # ── 2. Permissions (global table) ───────────────────────────────────────
    for code in PERMISSIONS:
        if not session.exec(select(Permission).where(Permission.code == code[0])).first():
            session.add(Permission(code=code[0], name=code[1], module=code[2]))
    session.flush()
    perm_map = {p.code: p.id for p in session.exec(select(Permission)).all()}

    # ── 3. Roles + permissions ──────────────────────────────────────────────
    existing_role_codes = {
        r.code for r in session.exec(select(Role).where(Role.company_id == company_id)).all()
    }
    roles: dict[str, Role] = {}
    for role_code in DEFAULT_ROLE_PERMISSIONS:
        if role_code not in existing_role_codes:
            role = Role(company_id=company_id, code=role_code, name=role_code, is_system=True)
            session.add(role)
            roles[role_code] = role
        else:
            roles[role_code] = session.exec(
                select(Role).where(Role.company_id == company_id, Role.code == role_code)
            ).first()
    session.flush()

    for role_code, perms in DEFAULT_ROLE_PERMISSIONS.items():
        role = roles.get(role_code)
        if not role:
            continue
        existing_perms = {
            rp.permission_id
            for rp in session.exec(select(RolePermission).where(RolePermission.role_id == role.id)).all()
        }
        for perm_code in perms:
            pid = perm_map.get(perm_code)
            if pid and pid not in existing_perms:
                session.add(RolePermission(role_id=role.id, permission_id=pid, allowed=True))

    # ── 4. Store, Counter & Warehouse ────────────────────────────────────────
    store = session.exec(
        select(Store).where(Store.company_id == company_id, Store.code == "STORE-TK-01")
    ).first()
    if not store:
        store = Store(
            company_id=company_id,
            code="STORE-TK-01",
            name="Tali Co Kitchen (Mirpur)",
            address="Ananda Nagar, Tali company road, Mirpur, Darussalam, Dhaka-1216",
            phone="+880195 2233933",
            is_active=True,
        )
        session.add(store)
        session.flush()

    counter = session.exec(
        select(Counter).where(Counter.store_id == store.id, Counter.code == "CTR-TK-01")
    ).first()
    if not counter:
        counter = Counter(
            company_id=company_id,
            store_id=store.id,
            code="CTR-TK-01",
            name="Main Restaurant Counter",
            is_active=True,
        )
        session.add(counter)
        session.flush()

    wh = session.exec(
        select(Warehouse).where(Warehouse.company_id == company_id, Warehouse.code == "WH-TK-01")
    ).first()
    if not wh:
        wh = Warehouse(
            company_id=company_id,
            code="WH-TK-01",
            name="Tali Co Central Kitchen & Pantry",
            is_active=True,
        )
        session.add(wh)
        session.flush()

    # ── 5. Users ─────────────────────────────────────────────────────────────
    admin = session.exec(
        select(UserAccount).where(
            UserAccount.company_id == company_id,
            (UserAccount.email == "admin@talicokitchen.com") | (UserAccount.username == "talico"),
        )
    ).first()
    if not admin:
        admin = UserAccount(
            company_id=company_id,
            store_id=store.id,
            email="admin@talicokitchen.com",
            username="talico",
            full_name="Tali Co Admin",
            role="admin",
            password_hash=hash_password("admin123"),
            is_platform_admin=False,
            is_active=True,
        )
        session.add(admin)
        session.flush()
        sa_role = roles.get("Super Admin") or roles.get("Admin")
        if sa_role:
            session.add(UserRole(user_id=admin.id, role_id=sa_role.id))
    else:
        admin.password_hash = hash_password("admin123")
        admin.store_id = store.id
        admin.is_active = True
        session.add(admin)

    cashier = session.exec(
        select(UserAccount).where(
            UserAccount.company_id == company_id,
            (UserAccount.email == "cashier@talicokitchen.com") | (UserAccount.username == "talicocashier"),
        )
    ).first()
    if not cashier:
        cashier = UserAccount(
            company_id=company_id,
            store_id=store.id,
            email="cashier@talicokitchen.com",
            username="talicocashier",
            full_name="Tali Co Cashier",
            role="cashier",
            password_hash=hash_password("cashier123"),
            is_active=True,
        )
        session.add(cashier)
        session.flush()
        c_role = roles.get("Cashier")
        if c_role:
            session.add(UserRole(user_id=cashier.id, role_id=c_role.id))
    else:
        cashier.password_hash = hash_password("cashier123")
        cashier.is_active = True
        session.add(cashier)

    # ── 6. Industry Packs — RESTAURANT ONLY ──────────────────────────────────
    existing_pack_codes = {
        p.industry_code
        for p in session.exec(select(IndustryPack).where(IndustryPack.company_id == company_id)).all()
    }
    for pack_code in INDUSTRY_PACKS:
        is_active = pack_code == "restaurant"
        if pack_code not in existing_pack_codes:
            session.add(IndustryPack(
                company_id=company_id,
                industry_code=pack_code,
                enabled_company=is_active,
                enabled_store=is_active,
                enabled_counter=is_active,
                updated_by="seed_talico",
            ))
        else:
            pack = session.exec(
                select(IndustryPack).where(
                    IndustryPack.company_id == company_id,
                    IndustryPack.industry_code == pack_code,
                )
            ).first()
            if pack:
                pack.enabled_company = is_active
                pack.enabled_store = is_active
                pack.enabled_counter = is_active
                session.add(pack)

    # ── 7. Subscription ──────────────────────────────────────────────────────
    plan = session.exec(select(SubscriptionPlan).where(SubscriptionPlan.code == "professional")).first() or \
           session.exec(select(SubscriptionPlan).where(SubscriptionPlan.code == "starter")).first()
    if plan:
        sub = session.exec(select(TenantSubscription).where(TenantSubscription.company_id == company_id)).first()
        if not sub:
            sub = TenantSubscription(
                company_id=company_id,
                plan_id=plan.id,
                status="active",
                billing_cycle="monthly",
                started_at=datetime.now(timezone.utc),
                expires_at=datetime.now(timezone.utc) + timedelta(days=365),
            )
            session.add(sub)
        else:
            sub.status = "active"
            session.add(sub)

    # ── 8. Categories ────────────────────────────────────────────────────────
    cat_names = [
        "Appetisers",
        "Soups",
        "Chow Mein",
        "Vegetable",
        "Rice",
        "Chicken",
        "Beef",
        "Prawn",
        "Set Menu",
        "Beverage",
    ]
    cat_map = {}
    for cname in cat_names:
        c_existing = session.exec(
            select(ProductCategory).where(ProductCategory.company_id == company_id, ProductCategory.name == cname)
        ).first()
        if not c_existing:
            c_existing = ProductCategory(
                company_id=company_id,
                code=cname.upper().replace(" ", "_"),
                name=cname,
                is_active=True,
            )
            session.add(c_existing)
            session.flush()
        cat_map[cname] = c_existing.id

    # ── 9. Products & Prices from Menu ───────────────────────────────────────
    menu_items = [
        # APPETISERS
        ("TK-APP-01", "Fried Wonton (8 Pcs)", "Appetisers", 400, "Kitchen", "https://images.unsplash.com/photo-1541696432-82c6da8ce7bf?w=500&auto=format&fit=crop&q=80"),
        ("TK-APP-02", "Special Wonton (8 Pcs)", "Appetisers", 450, "Kitchen", "https://images.unsplash.com/photo-1496116218417-1a781b1c416c?w=500&auto=format&fit=crop&q=80"),
        ("TK-APP-03", "French Fries", "Appetisers", 200, "Kitchen", "https://images.unsplash.com/photo-1576107232684-1279f3908594?w=500&auto=format&fit=crop&q=80"),
        ("TK-APP-04", "Chicken & Prawn Cashew Nut Salad", "Appetisers", 550, "Kitchen", "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=500&auto=format&fit=crop&q=80"),
        ("TK-APP-05", "Fried Prawn (10pcs)", "Appetisers", 600, "Kitchen", "https://images.unsplash.com/photo-1559742811-822873691df8?w=500&auto=format&fit=crop&q=80"),

        # SOUPS
        ("TK-SOU-01", "Special Thai Soup", "Soups", 550, "Kitchen", "https://images.unsplash.com/photo-1547592166-23ac45744acd?w=500&auto=format&fit=crop&q=80"),
        ("TK-SOU-02", "Thai Soup", "Soups", 480, "Kitchen", "https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=500&auto=format&fit=crop&q=80"),
        ("TK-SOU-03", "Special Corn Soup", "Soups", 580, "Kitchen", "https://images.unsplash.com/photo-1603105037880-880cd4edfb0d?w=500&auto=format&fit=crop&q=80"),
        ("TK-SOU-04", "Chicken Corn Soup", "Soups", 450, "Kitchen", "https://images.unsplash.com/photo-1547592180-85f173990554?w=500&auto=format&fit=crop&q=80"),

        # CHOW MEIN
        ("TK-CHW-01", "Thai Special Chow Mein", "Chow Mein", 500, "Kitchen", "https://images.unsplash.com/photo-1585032226651-759b368d7246?w=500&auto=format&fit=crop&q=80"),
        ("TK-CHW-02", "Tali Co. Special Chow Mein", "Chow Mein", 550, "Kitchen", "https://images.unsplash.com/photo-1612927601601-6638404737ce?w=500&auto=format&fit=crop&q=80"),
        ("TK-CHW-03", "Chicken Chow Mein", "Chow Mein", 400, "Kitchen", "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=500&auto=format&fit=crop&q=80"),

        # VEGETABLE
        ("TK-VEG-01", "Tali Co. Special Vegetable", "Vegetable", 500, "Kitchen", "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500&auto=format&fit=crop&q=80"),
        ("TK-VEG-02", "Chicken Vegetable", "Vegetable", 450, "Kitchen", "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=80"),
        ("TK-VEG-03", "Vegetable", "Vegetable", 400, "Kitchen", "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=500&auto=format&fit=crop&q=80"),

        # RICE
        ("TK-RIC-01", "Thai Special Fried Rice", "Rice", 550, "Kitchen", "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=500&auto=format&fit=crop&q=80"),
        ("TK-RIC-02", "Tali Co. Special Fried Rice", "Rice", 580, "Kitchen", "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=500&auto=format&fit=crop&q=80"),
        ("TK-RIC-03", "Chicken Fried Rice", "Rice", 470, "Kitchen", "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=500&auto=format&fit=crop&q=80"),
        ("TK-RIC-04", "Egg Fried Rice", "Rice", 390, "Kitchen", "https://images.unsplash.com/photo-1536304929831-ee1ca9d44906?w=500&auto=format&fit=crop&q=80"),

        # CHICKEN
        ("TK-CHK-01", "Thai-Style Fried Bangkok Chicken (8 Pcs)", "Chicken", 580, "Kitchen", "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=500&auto=format&fit=crop&q=80"),
        ("TK-CHK-02", "Royal Chicken Masala", "Chicken", 500, "Kitchen", "https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?w=500&auto=format&fit=crop&q=80"),
        ("TK-CHK-03", "Chicken Chilli Onion", "Chicken", 520, "Kitchen", "https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=500&auto=format&fit=crop&q=80"),
        ("TK-CHK-04", "Chicken Sizzling Hot Plate", "Chicken", 600, "Kitchen", "https://images.unsplash.com/photo-1544025162-d76694265947?w=500&auto=format&fit=crop&q=80"),

        # BEEF
        ("TK-BEF-01", "Royal Beef Masala", "Beef", 620, "Kitchen", "https://images.unsplash.com/photo-1534939561126-855b8675edd7?w=500&auto=format&fit=crop&q=80"),
        ("TK-BEF-02", "Beef Green Chilli Onion", "Beef", 590, "Kitchen", "https://images.unsplash.com/photo-1588168333986-5078d3ae3976?w=500&auto=format&fit=crop&q=80"),
        ("TK-BEF-03", "Beef Sizzling Hot Plate", "Beef", 680, "Kitchen", "https://images.unsplash.com/photo-1603048588665-791ca8aea617?w=500&auto=format&fit=crop&q=80"),

        # PRAWN
        ("TK-PRW-01", "Prawn Masala", "Prawn", 600, "Kitchen", "https://images.unsplash.com/photo-1559742811-822873691df8?w=500&auto=format&fit=crop&q=80"),
        ("TK-PRW-02", "Sweet & Sour Prawn", "Prawn", 600, "Kitchen", "https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=500&auto=format&fit=crop&q=80"),
        ("TK-PRW-03", "Prawn Sizzling", "Prawn", 650, "Kitchen", "https://images.unsplash.com/photo-1559742811-822873691df8?w=500&auto=format&fit=crop&q=80"),

        # SET MENU
        ("TK-SET-01", "SET MENU – 01 (Fried Rice, Fried Chicken 1 Pc, Vegetable)", "Set Menu", 320, "Kitchen", "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=80"),
        ("TK-SET-02", "SET MENU – 02 (Fried Rice, Fried Chicken 2 Pcs, Vegetable)", "Set Menu", 380, "Kitchen", "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=500&auto=format&fit=crop&q=80"),
        ("TK-SET-03", "SET MENU – 03 (Fried Rice, Fried Chicken 1 Pc, Vegetable, Masala Chicken)", "Set Menu", 400, "Kitchen", "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=80"),
        ("TK-SET-04", "SET MENU – 04 (Fried Rice, Fried Chicken 1 Pc, Vegetable, Chicken Chilli Onion)", "Set Menu", 420, "Kitchen", "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=500&auto=format&fit=crop&q=80"),

        # BEVERAGE
        ("TK-BEV-01", "Mineral Water (500ml)", "Beverage", 20, "Beverage Bar", "https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=500&auto=format&fit=crop&q=80"),
        ("TK-BEV-02", "Mineral Water (1500ml)", "Beverage", 35, "Beverage Bar", "https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=500&auto=format&fit=crop&q=80"),
        ("TK-BEV-03", "Soft Drinks", "Beverage", 25, "Beverage Bar", "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=500&auto=format&fit=crop&q=80"),
        ("TK-BEV-04", "Lassi", "Beverage", 200, "Beverage Bar", "https://images.unsplash.com/photo-1587080413959-06b859fb107d?w=500&auto=format&fit=crop&q=80"),
        ("TK-BEV-05", "Cold Coffee", "Beverage", 200, "Beverage Bar", "https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=500&auto=format&fit=crop&q=80"),
        ("TK-BEV-06", "Hot Coffee", "Beverage", 150, "Beverage Bar", "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=500&auto=format&fit=crop&q=80"),
    ]

    prod_map = {}
    for pcode, pname, cat_name, price, station, img_url in menu_items:
        prod = session.exec(
            select(Product).where(Product.company_id == company_id, Product.sku == pcode)
        ).first()
        cat_id = cat_map.get(cat_name)
        meta_dict = {"kitchen_station": station, "category": cat_name, "image": img_url}

        if not prod:
            prod = Product(
                company_id=company_id,
                sku=pcode,
                barcode=pcode,
                name=pname,
                category_id=cat_id,
                base_price=price,
                industry_pack="restaurant",
                meta_json=json.dumps(meta_dict),
                is_active=True,
            )
            session.add(prod)
            session.flush()
        else:
            meta = json.loads(prod.meta_json) if prod.meta_json else {}
            meta.update(meta_dict)
            prod.meta_json = json.dumps(meta)
            prod.base_price = price
            prod.name = pname
            if cat_id:
                prod.category_id = cat_id
            session.add(prod)
            session.flush()

        prod_map[pcode] = prod

        move = session.exec(
            select(StockLedger).where(StockLedger.company_id == company_id, StockLedger.product_id == prod.id)
        ).first()
        if not move:
            record_stock_movement(
                session,
                company_id=company_id,
                product_id=prod.id,
                store_id=store.id,
                warehouse_id=None,
                in_qty=100,
                transaction_type=OPENING,
                transaction_ref=f"SEED-{pcode}",
                note="Tali Co Kitchen opening stock",
            )

    # ── 10. Restaurant Combos ─────────────────────────────────────────────────
    combos_data = [
        ("SET MENU – 01", 320, ["TK-RIC-03", "TK-VEG-03"]),
        ("SET MENU – 02", 380, ["TK-RIC-03", "TK-VEG-03"]),
        ("SET MENU – 03", 400, ["TK-RIC-03", "TK-VEG-03", "TK-CHK-02"]),
        ("SET MENU – 04", 420, ["TK-RIC-03", "TK-VEG-03", "TK-CHK-03"]),
    ]
    for c_name, c_price, item_skus in combos_data:
        combo = session.exec(
            select(RestaurantCombo).where(RestaurantCombo.company_id == company_id, RestaurantCombo.name == c_name)
        ).first()
        if not combo:
            combo = RestaurantCombo(company_id=company_id, name=c_name, combo_price=c_price, is_active=True)
            session.add(combo)
            session.flush()
            for sku in item_skus:
                p = prod_map.get(sku)
                if p:
                    session.add(RestaurantComboItem(combo_id=combo.id, product_id=p.id, item_role="main"))

    # ── 11. Restaurant Dining Tables ─────────────────────────────────────────
    tables_data = [
        ("T-01", "Table 1 (Family)", 4),
        ("T-02", "Table 2 (Family)", 4),
        ("T-03", "Table 3 (Couple)", 2),
        ("T-04", "Table 4 (Group)", 6),
        ("T-05", "Table 5 (Family)", 4),
        ("T-06", "Table 6 (Family)", 4),
        ("T-07", "Table 7 (Couple)", 2),
        ("T-08", "Table 8 (Group)", 8),
        ("VIP-01", "VIP Room Table 1", 8),
        ("VIP-02", "VIP Room Table 2", 10),
    ]
    for tcode, tname, cap in tables_data:
        tb = session.exec(
            select(RestaurantTable).where(RestaurantTable.company_id == company_id, RestaurantTable.table_no == tcode)
        ).first()
        if not tb:
            session.add(
                RestaurantTable(
                    company_id=company_id,
                    store_id=store.id,
                    table_no=tcode,
                    table_name=tname,
                    capacity=cap,
                    status="available",
                    is_active=True,
                )
            )
        else:
            _reconcile_stale_table(session, tb)
            session.add(tb)

    session.flush()
    invalidate_company_config(company_id)


def seed_aura_jewelry_company(session: Session) -> None:
    """Create AURA FINE JEWELRY & GEMS as an independent company (code='AURA-JEWELRY').
    Store: STORE-JW-01 (Aura Flagship Jewellers).
    Exclusive Vertical: JEWELRY POS ONLY.
    Idempotent — safe to call on startup.
    """
    from app.models.saas import TenantSubscription, SubscriptionPlan
    from app.models.product import ProductCategory, Unit, ProductBarcode
    from app.models.inventory import StockBalance
    from app.models.industry import JewelryProductProfile, JewelryCertificate, JewelryGoldRate
    from app.services.accounting_service import seed_default_chart_of_accounts
    from app.cache import invalidate_company_config

    # ── 1. Company ──────────────────────────────────────────────────────────
    company = session.exec(select(Company).where(Company.code == "AURA-JEWELRY")).first()
    if not company:
        company = Company(
            code="AURA-JEWELRY",
            name="Aura Fine Jewelry & Gems",
            legal_name="Aura Jewellers Ltd",
            address="House 14, Road 11, Banani, Dhaka-1213",
            phone="+880 1711-889900",
            email="admin@aurajewelry.com",
            approval_status="approved",
            approved_at=datetime.now(timezone.utc),
        )
        session.add(company)
        session.flush()
    else:
        company.name = "Aura Fine Jewelry & Gems"
        company.legal_name = "Aura Jewellers Ltd"
        company.approval_status = "approved"
        if not company.approved_at:
            company.approved_at = datetime.now(timezone.utc)
        session.add(company)

    company_id = company.id

    # ── 1.1 Chart of Accounts ──────────────────────────────────────────────
    seed_default_chart_of_accounts(session, company_id)

    # ── 2. Permissions (global table) ───────────────────────────────────────
    for code in PERMISSIONS:
        if not session.exec(select(Permission).where(Permission.code == code[0])).first():
            session.add(Permission(code=code[0], name=code[1], module=code[2]))
    session.flush()
    perm_map = {p.code: p.id for p in session.exec(select(Permission)).all()}

    # ── 3. Roles + permissions ──────────────────────────────────────────────
    existing_role_codes = {
        r.code for r in session.exec(select(Role).where(Role.company_id == company_id)).all()
    }
    roles: dict[str, Role] = {}
    for role_code in DEFAULT_ROLE_PERMISSIONS:
        if role_code not in existing_role_codes:
            role = Role(company_id=company_id, code=role_code, name=role_code, is_system=True)
            session.add(role)
            roles[role_code] = role
        else:
            roles[role_code] = session.exec(
                select(Role).where(Role.company_id == company_id, Role.code == role_code)
            ).first()
    session.flush()

    for role_code, perms in DEFAULT_ROLE_PERMISSIONS.items():
        role = roles.get(role_code)
        if not role:
            continue
        existing_perms = {
            rp.permission_id
            for rp in session.exec(select(RolePermission).where(RolePermission.role_id == role.id)).all()
        }
        for perm_code in perms:
            pid = perm_map.get(perm_code)
            if pid and pid not in existing_perms:
                session.add(RolePermission(role_id=role.id, permission_id=pid, allowed=True))

    # ── 4. Store, Counter & Warehouse ────────────────────────────────────────
    store = session.exec(
        select(Store).where(Store.company_id == company_id, Store.code == "STORE-JW-01")
    ).first()
    if not store:
        store = Store(
            company_id=company_id,
            code="STORE-JW-01",
            name="Aura Flagship Jewellers",
            address="House 14, Road 11, Banani, Dhaka-1213",
            phone="+880 1711-889900",
            is_active=True,
        )
        session.add(store)
        session.flush()

    counter = session.exec(
        select(Counter).where(Counter.store_id == store.id, Counter.code == "CTR-JW-01")
    ).first()
    if not counter:
        counter = Counter(
            company_id=company_id,
            store_id=store.id,
            code="CTR-JW-01",
            name="Gold & Diamond Terminal",
            is_active=True,
        )
        session.add(counter)
        session.flush()

    wh = session.exec(
        select(Warehouse).where(Warehouse.company_id == company_id, Warehouse.code == "WH-JW-01")
    ).first()
    if not wh:
        wh = Warehouse(
            company_id=company_id,
            code="WH-JW-01",
            name="Aura Vault & Secure Storage",
            is_active=True,
        )
        session.add(wh)
        session.flush()

    # ── 5. Users ─────────────────────────────────────────────────────────────
    admin = session.exec(
        select(UserAccount).where(
            UserAccount.company_id == company_id,
            (UserAccount.email == "admin@aurajewelry.com") | (UserAccount.username == "aurajewelry"),
        )
    ).first()
    if not admin:
        admin = UserAccount(
            company_id=company_id,
            store_id=store.id,
            email="admin@aurajewelry.com",
            username="aurajewelry",
            full_name="Aura Admin",
            password_hash=hash_password("admin123"),
            is_platform_admin=False,
        )
        session.add(admin)
        session.flush()
        sa_role = roles.get("Super Admin")
        if sa_role:
            session.add(UserRole(user_id=admin.id, role_id=sa_role.id))
    else:
        admin.store_id = store.id
        admin.is_platform_admin = False
        session.add(admin)

    cashier = session.exec(
        select(UserAccount).where(
            UserAccount.company_id == company_id,
            (UserAccount.email == "cashier@aurajewelry.com") | (UserAccount.username == "auracashier"),
        )
    ).first()
    if not cashier:
        cashier = UserAccount(
            company_id=company_id,
            store_id=store.id,
            email="cashier@aurajewelry.com",
            username="auracashier",
            full_name="Aura Cashier",
            password_hash=hash_password("cashier123"),
        )
        session.add(cashier)
        session.flush()
        c_role = roles.get("Cashier")
        if c_role:
            session.add(UserRole(user_id=cashier.id, role_id=c_role.id))

    # ── 6. Industry Packs — JEWELRY ONLY ─────────────────────────────────────
    existing_pack_codes = {
        p.industry_code
        for p in session.exec(select(IndustryPack).where(IndustryPack.company_id == company_id)).all()
    }
    for pack_code in INDUSTRY_PACKS:
        is_active = pack_code == "jewelry"
        if pack_code not in existing_pack_codes:
            session.add(IndustryPack(
                company_id=company_id,
                industry_code=pack_code,
                enabled_company=is_active,
                enabled_store=is_active,
                enabled_counter=is_active,
                updated_by="seed",
            ))
        else:
            pack = session.exec(
                select(IndustryPack).where(
                    IndustryPack.company_id == company_id,
                    IndustryPack.industry_code == pack_code,
                )
            ).first()
            if pack:
                pack.enabled_company = is_active
                pack.enabled_store = is_active
                pack.enabled_counter = is_active
                session.add(pack)

    # ── 7. Subscription ──────────────────────────────────────────────────────
    plan = session.exec(select(SubscriptionPlan).where(SubscriptionPlan.code == "professional")).first()
    if not plan:
        plan = session.exec(select(SubscriptionPlan).where(SubscriptionPlan.code == "starter")).first()
    if plan:
        sub = session.exec(select(TenantSubscription).where(TenantSubscription.company_id == company_id)).first()
        if not sub:
            sub = TenantSubscription(
                company_id=company_id,
                plan_id=plan.id,
                status="active",
                billing_cycle="monthly",
                started_at=datetime.now(timezone.utc),
                expires_at=datetime.now(timezone.utc) + timedelta(days=365),
            )
            session.add(sub)
        else:
            sub.status = "active"
            session.add(sub)

    # ── 8. Live Gold / Metal Rates ───────────────────────────────────────────
    for m_type, k_type, sell_r, buy_r in [
        ("Gold", "24K", 10850, 9980),
        ("Gold", "22K", 9950, 9150),
        ("Gold", "21K", 9500, 8740),
        ("Gold", "18K", 8140, 7490),
        ("Silver", "925", 140, 120),
        ("Platinum", "950", 4300, 3950),
    ]:
        rate_row = session.exec(
            select(JewelryGoldRate).where(
                JewelryGoldRate.company_id == company_id,
                JewelryGoldRate.metal_type == m_type,
                JewelryGoldRate.karat == k_type,
            )
        ).first()
        if not rate_row:
            session.add(
                JewelryGoldRate(
                    company_id=company_id,
                    metal_type=m_type,
                    karat=k_type,
                    purity=k_type,
                    rate_per_gram=sell_r,
                    selling_rate=sell_r,
                    buying_rate=buy_r,
                    currency="BDT",
                    unit_basis="gram",
                    status="active",
                    effective_date=datetime.now(timezone.utc),
                )
            )

    # ── 9. Jewelry Demo Products, Profiles & Certificates ───────────────────
    pcs_unit = session.exec(select(Unit).where(Unit.company_id == company_id, Unit.code == "PCS")).first()
    if not pcs_unit:
        pcs_unit = Unit(company_id=company_id, code="PCS", name="Pieces")
        session.add(pcs_unit)
        session.flush()

    j_cat = session.exec(select(ProductCategory).where(ProductCategory.company_id == company_id, ProductCategory.name == "Jewelry")).first()
    if not j_cat:
        j_cat = ProductCategory(company_id=company_id, code="JEWELRY", name="Jewelry", is_active=True)
        session.add(j_cat)
        session.flush()

    j_spec_map = {
        "JW-001": {"metal": "Gold", "karat": 22, "grossWeight": 12.4, "netWeight": 11.8, "stoneWeight": 0.6, "makingChargePerGram": 850, "cert": "CERT-JW-8821"},
        "JW-002": {"metal": "Gold", "karat": 18, "grossWeight": 5.2, "netWeight": 4.6, "stoneWeight": 0.6, "makingChargePerGram": 1200, "cert": "CERT-JW-8822"},
        "JW-003": {"metal": "Silver", "karat": 925, "grossWeight": 28.0, "netWeight": 27.5, "stoneWeight": 0.5, "makingChargePerGram": 120, "cert": "CERT-JW-8823"},
        "JW-004": {"metal": "Gold", "karat": 22, "grossWeight": 42.5, "netWeight": 39.0, "stoneWeight": 3.5, "makingChargePerGram": 950, "cert": "CERT-JW-8824"},
        "JW-005": {"metal": "Gold", "karat": 24, "grossWeight": 10.0, "netWeight": 10.0, "stoneWeight": 0.0, "makingChargePerGram": 350, "cert": "CERT-JW-8825"},
        "JW-006": {"metal": "Platinum", "karat": 950, "grossWeight": 6.8, "netWeight": 6.1, "stoneWeight": 0.7, "makingChargePerGram": 1800, "cert": "CERT-JW-8826"},
        "JW-007": {"metal": "Gold", "karat": 21, "grossWeight": 4.5, "netWeight": 4.2, "stoneWeight": 0.3, "makingChargePerGram": 750, "cert": "CERT-JW-8827"},
        "JW-008": {"metal": "Gold", "karat": 22, "grossWeight": 15.2, "netWeight": 13.8, "stoneWeight": 1.4, "makingChargePerGram": 1100, "cert": "CERT-JW-8828"},
        "JW-009": {"metal": "Gold", "karat": 18, "grossWeight": 3.9, "netWeight": 3.3, "stoneWeight": 0.6, "makingChargePerGram": 1400, "cert": "CERT-JW-8829"},
        "JW-010": {"metal": "Gold", "karat": 22, "grossWeight": 24.5, "netWeight": 19.0, "stoneWeight": 5.5, "makingChargePerGram": 900, "cert": "CERT-JW-8830"},
        "JW-011": {"metal": "Gold", "karat": 22, "grossWeight": 26.5, "netWeight": 26.5, "stoneWeight": 0.0, "makingChargePerGram": 750, "cert": "CERT-JW-8831"},
        "JW-012": {"metal": "Silver", "karat": 925, "grossWeight": 22.0, "netWeight": 22.0, "stoneWeight": 0.0, "makingChargePerGram": 100, "cert": "CERT-JW-8832"},
        "JW-013": {"metal": "Gold", "karat": 22, "grossWeight": 6.5, "netWeight": 6.0, "stoneWeight": 0.5, "makingChargePerGram": 1250, "cert": "CERT-JW-8833"},
        "JW-014": {"metal": "Gold", "karat": 18, "grossWeight": 7.4, "netWeight": 6.1, "stoneWeight": 1.3, "makingChargePerGram": 1500, "cert": "CERT-JW-8834"},
        "JW-015": {"metal": "Gold", "karat": 22, "grossWeight": 10.8, "netWeight": 9.5, "stoneWeight": 1.3, "makingChargePerGram": 850, "cert": "CERT-JW-8835"},
        "JW-016": {"metal": "Gold", "karat": 22, "grossWeight": 1.4, "netWeight": 1.2, "stoneWeight": 0.2, "makingChargePerGram": 500, "cert": "CERT-JW-8836"},
        "JW-017": {"metal": "Platinum", "karat": 950, "grossWeight": 8.6, "netWeight": 8.6, "stoneWeight": 0.0, "makingChargePerGram": 1600, "cert": "CERT-JW-8837"},
        "JW-018": {"metal": "Gold", "karat": 22, "grossWeight": 38.5, "netWeight": 35.8, "stoneWeight": 2.7, "makingChargePerGram": 1050, "cert": "CERT-JW-8838"},
        "JW-019": {"metal": "Gold", "karat": 18, "grossWeight": 8.8, "netWeight": 7.2, "stoneWeight": 1.6, "makingChargePerGram": 1650, "cert": "CERT-JW-8839"},
        "JW-020": {"metal": "Gold", "karat": 22, "grossWeight": 5.0, "netWeight": 5.0, "stoneWeight": 0.0, "makingChargePerGram": 400, "cert": "CERT-JW-8840"},
    }

    jewelry_items = [
        ("JW-001", "22K Gold Chain", 125000),
        ("JW-002", "Diamond Ring · 18K White Gold", 65000),
        ("JW-003", "Silver Bangle Pair · 925", 4500),
        ("JW-004", "22K Bridal Har Necklace", 425000),
        ("JW-005", "24K Gold Coin 10g", 108500),
        ("JW-006", "Platinum Solitaire Engagement Ring", 75000),
        ("JW-007", "21K Gold Earring Tops", 36000),
        ("JW-008", "22K Gold Jhumka Earrings", 135000),
        ("JW-009", "18K Rose Gold Diamond Pendant", 34000),
        ("JW-010", "22K Gold Pearl Drop Necklace", 210000),
        ("JW-011", "22K Heavy Mens Gold Bracelet", 235000),
        ("JW-012", "925 Silver Payal / Anklet Pair", 2400),
        ("JW-013", "22K Crown Tiara Gold Ring", 58000),
        ("JW-014", "18K Yellow Gold Emerald Ring", 68000),
        ("JW-015", "22K Gold Mangalsutra Pendant", 92000),
        ("JW-016", "22K Gold Nose Pin / Noth", 12000),
        ("JW-017", "Platinum Mens Wedding Band", 82000),
        ("JW-018", "22K Royal Choker Necklace", 340000),
        ("JW-019", "18K Blue Sapphire Earrings", 78000),
        ("JW-020", "22K Stamped Gold Coin (5g)", 44000),
    ]

    for sku, name, price in jewelry_items:
        prod = session.exec(select(Product).where(Product.company_id == company_id, Product.sku == sku)).first()
        jspec = j_spec_map.get(sku, {"metal": "Gold", "karat": 22, "grossWeight": 10.0, "netWeight": 9.5, "stoneWeight": 0.5, "makingChargePerGram": 800})
        meta = {
            "metal": jspec["metal"],
            "karat": jspec["karat"],
            "grossWeight": jspec["grossWeight"],
            "netWeight": jspec["netWeight"],
            "stoneWeight": jspec["stoneWeight"],
            "makingChargePerGram": jspec["makingChargePerGram"],
            "certificate": jspec.get("cert", f"CERT-{sku}"),
            "image_url": SAMPLE_PRODUCT_IMAGES.get(sku, SAMPLE_PRODUCT_IMAGES.get("JW-001")),
        }
        if not prod:
            prod = Product(
                company_id=company_id,
                category_id=j_cat.id,
                unit_id=pcs_unit.id,
                sku=sku,
                name=name,
                industry_pack="jewelry",
                base_price=price,
                is_active=True,
                meta=meta,
                image_url=meta["image_url"],
            )
            session.add(prod)
            session.flush()
        else:
            prod.base_price = price
            prod.meta = meta
            prod.image_url = meta["image_url"]
            session.add(prod)

        # Stock balance
        sb = session.exec(select(StockBalance).where(StockBalance.company_id == company_id, StockBalance.product_id == prod.id, StockBalance.store_id == store.id)).first()
        if not sb:
            session.add(StockBalance(company_id=company_id, product_id=prod.id, store_id=store.id, qty_on_hand=8, qty_available=8))

        # Barcode
        bc = session.exec(select(ProductBarcode).where(ProductBarcode.company_id == company_id, ProductBarcode.product_id == prod.id)).first()
        if not bc:
            session.add(ProductBarcode(company_id=company_id, product_id=prod.id, barcode=sku, is_primary=True))

        # Profile
        prof = session.exec(select(JewelryProductProfile).where(JewelryProductProfile.company_id == company_id, JewelryProductProfile.product_id == prod.id)).first()
        if not prof:
            session.add(
                JewelryProductProfile(
                    company_id=company_id,
                    product_id=prod.id,
                    metal_type=jspec["metal"],
                    purity=str(jspec["karat"]),
                    karat=jspec["karat"],
                    gross_weight=jspec["grossWeight"],
                    stone_weight=jspec["stoneWeight"],
                    net_metal_weight=jspec["netWeight"],
                    making_charge_type="per_gram",
                    making_charge_rate=jspec["makingChargePerGram"],
                    wastage_percentage=2,
                    certificate_required=bool(jspec.get("cert")),
                    tag_no=f"TAG-{sku}",
                    barcode=sku,
                )
            )

        # Certificate
        cert_num = jspec.get("cert", f"CERT-{sku}")
        cert = session.exec(select(JewelryCertificate).where(JewelryCertificate.company_id == company_id, JewelryCertificate.cert_no == cert_num)).first()
        if not cert:
            session.add(
                JewelryCertificate(
                    company_id=company_id,
                    product_id=prod.id,
                    cert_no=cert_num,
                    certificate_no=cert_num,
                    tag_no=f"TAG-{sku}",
                    barcode=sku,
                    metal_type=jspec["metal"],
                    purity=str(jspec["karat"]),
                    weight_gram=jspec["netWeight"],
                    gross_weight=jspec["grossWeight"],
                    stone_weight=jspec["stoneWeight"],
                    net_metal_weight=jspec["netWeight"],
                    issue_date=datetime.now(timezone.utc),
                    status="active",
                )
            )

    session.flush()
    invalidate_company_config(company_id)


def seed_volt_electronics_company(session: Session) -> None:
    """Create VOLT ELECTRONICS & GADGETS as an independent company (code='VOLT-ELECTRONICS').
    Store: STORE-EL-01 (Volt Mega Tech Store).
    Exclusive Vertical: ELECTRONICS POS ONLY.
    Idempotent — safe to call on startup.
    """
    from app.models.saas import TenantSubscription, SubscriptionPlan
    from app.models.product import ProductCategory, Unit, ProductBarcode, BrandMaster
    from app.models.inventory import StockBalance
    from app.models.industry import ElectronicsSerialStock
    from app.services.accounting_service import seed_default_chart_of_accounts
    from app.cache import invalidate_company_config

    # ── 1. Company ──────────────────────────────────────────────────────────
    company = session.exec(select(Company).where(Company.code == "VOLT-ELECTRONICS")).first()
    if not company:
        company = Company(
            code="VOLT-ELECTRONICS",
            name="Volt Electronics & Gadgets",
            legal_name="Volt Electronics BD Ltd",
            address="Level 4, Multiplan Centre, New Elephant Road, Dhaka-1205",
            phone="+880 1711-778899",
            email="admin@voltelectronics.com",
            approval_status="approved",
            approved_at=datetime.now(timezone.utc),
        )
        session.add(company)
        session.flush()
    else:
        company.name = "Volt Electronics & Gadgets"
        company.legal_name = "Volt Electronics BD Ltd"
        company.approval_status = "approved"
        if not company.approved_at:
            company.approved_at = datetime.now(timezone.utc)
        session.add(company)

    company_id = company.id

    # ── 1.1 Chart of Accounts ──────────────────────────────────────────────
    seed_default_chart_of_accounts(session, company_id)

    # ── 2. Permissions (global table) ───────────────────────────────────────
    for code in PERMISSIONS:
        if not session.exec(select(Permission).where(Permission.code == code[0])).first():
            session.add(Permission(code=code[0], name=code[1], module=code[2]))
    session.flush()
    perm_map = {p.code: p.id for p in session.exec(select(Permission)).all()}

    # ── 3. Roles + permissions ──────────────────────────────────────────────
    existing_role_codes = {
        r.code for r in session.exec(select(Role).where(Role.company_id == company_id)).all()
    }
    roles: dict[str, Role] = {}
    for role_code in DEFAULT_ROLE_PERMISSIONS:
        if role_code not in existing_role_codes:
            role = Role(company_id=company_id, code=role_code, name=role_code, is_system=True)
            session.add(role)
            roles[role_code] = role
        else:
            roles[role_code] = session.exec(
                select(Role).where(Role.company_id == company_id, Role.code == role_code)
            ).first()
    session.flush()

    for role_code, perms in DEFAULT_ROLE_PERMISSIONS.items():
        role = roles.get(role_code)
        if not role:
            continue
        existing_perms = {
            rp.permission_id
            for rp in session.exec(select(RolePermission).where(RolePermission.role_id == role.id)).all()
        }
        for perm_code in perms:
            pid = perm_map.get(perm_code)
            if pid and pid not in existing_perms:
                session.add(RolePermission(role_id=role.id, permission_id=pid, allowed=True))

    # ── 4. Store, Counter & Warehouse ────────────────────────────────────────
    store = session.exec(
        select(Store).where(Store.company_id == company_id, Store.code == "STORE-EL-01")
    ).first()
    if not store:
        store = Store(
            company_id=company_id,
            code="STORE-EL-01",
            name="Volt Mega Tech Store",
            address="Level 4, Multiplan Centre, New Elephant Road, Dhaka-1205",
            phone="+880 1711-778899",
            is_active=True,
        )
        session.add(store)
        session.flush()

    counter = session.exec(
        select(Counter).where(Counter.store_id == store.id, Counter.code == "CTR-EL-01")
    ).first()
    if not counter:
        counter = Counter(
            company_id=company_id,
            store_id=store.id,
            code="CTR-EL-01",
            name="Tech & Serial Desk",
            is_active=True,
        )
        session.add(counter)
        session.flush()

    wh = session.exec(
        select(Warehouse).where(Warehouse.company_id == company_id, Warehouse.code == "WH-EL-01")
    ).first()
    if not wh:
        wh = Warehouse(
            company_id=company_id,
            code="WH-EL-01",
            name="Volt Central Depot",
            is_active=True,
        )
        session.add(wh)
        session.flush()

    # ── 5. Users ─────────────────────────────────────────────────────────────
    admin = session.exec(
        select(UserAccount).where(
            UserAccount.company_id == company_id,
            (UserAccount.email == "admin@voltelectronics.com") | (UserAccount.username == "voltelectronics"),
        )
    ).first()
    if not admin:
        admin = UserAccount(
            company_id=company_id,
            store_id=store.id,
            email="admin@voltelectronics.com",
            username="voltelectronics",
            full_name="Volt Admin",
            password_hash=hash_password("admin123"),
            is_platform_admin=False,
        )
        session.add(admin)
        session.flush()
        sa_role = roles.get("Super Admin")
        if sa_role:
            session.add(UserRole(user_id=admin.id, role_id=sa_role.id))
    else:
        admin.store_id = store.id
        admin.is_platform_admin = False
        session.add(admin)

    cashier = session.exec(
        select(UserAccount).where(
            UserAccount.company_id == company_id,
            (UserAccount.email == "cashier@voltelectronics.com") | (UserAccount.username == "voltcashier"),
        )
    ).first()
    if not cashier:
        cashier = UserAccount(
            company_id=company_id,
            store_id=store.id,
            email="cashier@voltelectronics.com",
            username="voltcashier",
            full_name="Volt Cashier",
            password_hash=hash_password("cashier123"),
        )
        session.add(cashier)
        session.flush()
        c_role = roles.get("Cashier")
        if c_role:
            session.add(UserRole(user_id=cashier.id, role_id=c_role.id))

    # ── 6. Industry Packs — ELECTRONICS ONLY ─────────────────────────────────
    existing_pack_codes = {
        p.industry_code
        for p in session.exec(select(IndustryPack).where(IndustryPack.company_id == company_id)).all()
    }
    for pack_code in INDUSTRY_PACKS:
        is_active = pack_code == "electronics"
        if pack_code not in existing_pack_codes:
            session.add(IndustryPack(
                company_id=company_id,
                industry_code=pack_code,
                enabled_company=is_active,
                enabled_store=is_active,
                enabled_counter=is_active,
                updated_by="seed",
            ))
        else:
            pack = session.exec(
                select(IndustryPack).where(
                    IndustryPack.company_id == company_id,
                    IndustryPack.industry_code == pack_code,
                )
            ).first()
            if pack:
                pack.enabled_company = is_active
                pack.enabled_store = is_active
                pack.enabled_counter = is_active
                session.add(pack)

    # ── 7. Subscription ──────────────────────────────────────────────────────
    plan = session.exec(select(SubscriptionPlan).where(SubscriptionPlan.code == "professional")).first()
    if not plan:
        plan = session.exec(select(SubscriptionPlan).where(SubscriptionPlan.code == "starter")).first()
    if plan:
        sub = session.exec(select(TenantSubscription).where(TenantSubscription.company_id == company_id)).first()
        if not sub:
            sub = TenantSubscription(
                company_id=company_id,
                plan_id=plan.id,
                status="active",
                billing_cycle="monthly",
                started_at=datetime.now(timezone.utc),
                expires_at=datetime.now(timezone.utc) + timedelta(days=365),
            )
            session.add(sub)
        else:
            sub.status = "active"
            session.add(sub)

    # ── 8. Electronics Brands, Categories, Products & Serials ────────────────
    pcs_unit = session.exec(select(Unit).where(Unit.company_id == company_id, Unit.code == "PCS")).first()
    if not pcs_unit:
        pcs_unit = Unit(company_id=company_id, code="PCS", name="Pieces")
        session.add(pcs_unit)
        session.flush()

    el_cat = session.exec(select(ProductCategory).where(ProductCategory.company_id == company_id, ProductCategory.name == "Electronics")).first()
    if not el_cat:
        el_cat = ProductCategory(company_id=company_id, code="ELECTRONICS", name="Electronics", is_active=True)
        session.add(el_cat)
        session.flush()

    electronics_items = [
        ("EL-001", "Galaxy A55 5G", "Samsung", "SM-A556", 42990, 12, True, 10),
        ("EL-002", "Redmi Note 13 Pro", "Xiaomi", "2312DRA50G", 28999, 12, True, 15),
        ("EL-003", "USB-C Hub 7-in-1", "Anker", "A8346", 3200, 18, False, 30),
        ("EL-004", "55\" 4K Smart TV", "Sony", "KD-55X80L", 89900, 24, True, 5),
        ("EL-005", "iPhone 15 Pro 128GB", "Apple", "A3102", 139900, 12, True, 8),
        ("EL-006", "MacBook Air M3 15\"", "Apple", "MRYM3", 178000, 12, True, 6),
        ("EL-007", "WH-1000XM5 Headphones", "Sony", "WH-1000XM5", 36500, 12, False, 12),
        ("EL-008", "Inverter AC 1.5 Ton", "Gree", "GS-18XPUV32", 64500, 36, True, 4),
        ("EL-009", "Direct Cool Refrigerator 252L", "Hitachi", "R-H310PND7", 41900, 36, True, 6),
        ("EL-010", "Front Load Washing Machine 8kg", "Whirlpool", "FFCR80120", 58900, 24, True, 5),
        ("EL-011", "Mechanical Gaming Keyboard", "Keychron", "K2-PRO", 8500, 12, False, 20),
        ("EL-012", "Wireless Ergonomic Mouse", "Logitech", "MX-M3S", 11500, 12, False, 25),
        ("EL-013", "27\" 4K IPS Monitor", "Dell", "U2723QE", 54900, 36, True, 7),
        ("EL-014", "Wi-Fi 6 Mesh Router System", "TP-Link", "DECO-X60", 14500, 24, True, 10),
        ("EL-015", "Soundbar 3.1ch with Subwoofer", "JBL", "BAR-300", 27500, 12, True, 8),
        ("EL-016", "Smartwatch Series 9 45mm", "Apple", "MR9A3", 52000, 12, True, 12),
        ("EL-017", "20000mAh Fast Power Bank", "Anker", "A1289", 2400, 18, False, 40),
        ("EL-018", "Portable Bluetooth Speaker", "JBL", "FLIP-6", 16800, 12, False, 15),
        ("EL-019", "Mirrorless Camera 24.2MP", "Canon", "R6-MK2", 148500, 24, True, 4),
        ("EL-020", "Microwave Oven 23L Grill", "Panasonic", "NN-GD37H", 14900, 12, True, 8),
    ]

    for sku, name, brand, model, price, warranty, has_serial, stock_qty in electronics_items:
        prod = session.exec(select(Product).where(Product.company_id == company_id, Product.sku == sku)).first()
        meta = {
            "brand": brand,
            "model": model,
            "warranty_months": warranty,
            "warrantyMonths": warranty,
            "has_serial": has_serial,
            "hasSerial": has_serial,
            "serial_imei_required": has_serial,
            "serialized": has_serial,
            "image_url": SAMPLE_PRODUCT_IMAGES.get(sku, SAMPLE_PRODUCT_IMAGES.get("EL-001")),
        }
        if not prod:
            prod = Product(
                company_id=company_id,
                category_id=el_cat.id,
                unit_id=pcs_unit.id,
                sku=sku,
                name=name,
                industry_pack="electronics",
                base_price=price,
                is_active=True,
                meta=meta,
                image_url=meta["image_url"],
            )
            session.add(prod)
            session.flush()
        else:
            prod.base_price = price
            prod.meta = meta
            prod.image_url = meta["image_url"]
            session.add(prod)

        # Stock balance
        sb = session.exec(select(StockBalance).where(StockBalance.company_id == company_id, StockBalance.product_id == prod.id, StockBalance.store_id == store.id)).first()
        if not sb:
            session.add(StockBalance(company_id=company_id, product_id=prod.id, store_id=store.id, qty_on_hand=stock_qty, qty_available=stock_qty))

        # Barcode
        bc = session.exec(select(ProductBarcode).where(ProductBarcode.company_id == company_id, ProductBarcode.product_id == prod.id)).first()
        if not bc:
            session.add(ProductBarcode(company_id=company_id, product_id=prod.id, barcode=sku, is_primary=True))

        # Serial stock units for serialized items
        if has_serial:
            for s_idx in range(1, 4):
                serial_no = f"SN-{sku}-{1000 + s_idx}"
                existing_sn = session.exec(
                    select(ElectronicsSerialStock).where(
                        ElectronicsSerialStock.company_id == company_id,
                        ElectronicsSerialStock.serial_imei == serial_no,
                    )
                ).first()
                if not existing_sn:
                    session.add(
                        ElectronicsSerialStock(
                            company_id=company_id,
                            store_id=store.id,
                            product_id=prod.id,
                            serial_imei=serial_no,
                            imei_no=f"86940205{sku.replace('-', '')}{s_idx:04d}",
                            status="available",
                        )
                    )

    session.flush()
    invalidate_company_config(company_id)


def _upsert_demo_products_and_catalogs(session: Session, company: Company, store: Store) -> None:
    products: list[Product] = []
    electronics_meta_map = {
        "EL-001": {"brand": "Apple", "model": "iPhone 15 Pro", "warrantyMonths": 12, "hasSerial": True},
        "EL-002": {"brand": "Samsung", "model": "Galaxy S24 Ultra", "warrantyMonths": 12, "hasSerial": True},
        "EL-003": {"brand": "Sony", "model": "WH-1000XM5 Wireless Headphones", "warrantyMonths": 6, "hasSerial": False},
        "EL-004": {"brand": "Apple", "model": "MacBook Air M3 (16GB/512GB)", "warrantyMonths": 12, "hasSerial": True},
        "EL-005": {"brand": "LG", "model": "C3 55-inch OLED 4K Smart TV", "warrantyMonths": 24, "hasSerial": True},
        "EL-006": {"brand": "Dyson", "model": "V15 Detect Cordless Vacuum", "warrantyMonths": 12, "hasSerial": True},
        "EL-007": {"brand": "Dell", "model": "XPS 15 Laptop (Intel i9/32GB)", "warrantyMonths": 12, "hasSerial": True},
        "EL-008": {"brand": "Bose", "model": "QuietComfort Ultra Earbuds", "warrantyMonths": 12, "hasSerial": False},
        "EL-009": {"brand": "Samsung", "model": "55-inch QLED 4K Smart TV", "warrantyMonths": 24, "hasSerial": True},
        "EL-010": {"brand": "Canon", "model": "EOS R6 Mark II Mirrorless Camera", "warrantyMonths": 24, "hasSerial": True},
        "EL-011": {"brand": "ASUS", "model": "ROG Ally Handheld Gaming Console", "warrantyMonths": 12, "hasSerial": True},
        "EL-012": {"brand": "Anker", "model": "737 Power Bank 24000mAh 140W", "warrantyMonths": 18, "hasSerial": False},
        "EL-013": {"brand": "Logitech", "model": "MX Master 3S Wireless Mouse", "warrantyMonths": 12, "hasSerial": False},
        "EL-014": {"brand": "Keychron", "model": "K2 Pro Wireless Mechanical Keyboard", "warrantyMonths": 12, "hasSerial": False},
        "EL-015": {"brand": "JBL", "model": "PartyBox 310 Portable Bluetooth Speaker", "warrantyMonths": 12, "hasSerial": True},
        "EL-016": {"brand": "Gree", "model": "1.5 Ton Inverter Air Conditioner", "warrantyMonths": 36, "hasSerial": True},
        "EL-017": {"brand": "Hitachi", "model": "450L Inverter Refrigerator", "warrantyMonths": 36, "hasSerial": True},
        "EL-018": {"brand": "Whirlpool", "model": "9kg Front Load Washing Machine", "warrantyMonths": 24, "hasSerial": True},
        "EL-019": {"brand": "Xiaomi", "model": "Mi Robot Vacuum Cleaner Mop 2", "warrantyMonths": 12, "hasSerial": True},
        "EL-020": {"brand": "Garmin", "model": "Fenix 7 Pro Sapphire Solar Watch", "warrantyMonths": 24, "hasSerial": True},
    }
    j_spec_map = {
        "JW-001": {"metal": "Gold", "karat": 22, "grossWeight": 12.4, "netWeight": 11.8, "stoneWeight": 0.6, "makingChargePerGram": 850, "cert": "CERT-JW-8821"},
        "JW-002": {"metal": "Gold", "karat": 18, "grossWeight": 5.2, "netWeight": 4.6, "stoneWeight": 0.6, "makingChargePerGram": 1200, "cert": "CERT-JW-8822"},
        "JW-003": {"metal": "Silver", "karat": 925, "grossWeight": 28.0, "netWeight": 27.5, "stoneWeight": 0.5, "makingChargePerGram": 120},
        "JW-004": {"metal": "Gold", "karat": 22, "grossWeight": 42.5, "netWeight": 39.0, "stoneWeight": 3.5, "makingChargePerGram": 950, "cert": "CERT-JW-8824"},
        "JW-005": {"metal": "Gold", "karat": 22, "grossWeight": 36.0, "netWeight": 36.0, "stoneWeight": 0.0, "makingChargePerGram": 800, "cert": "CERT-JW-8825"},
        "JW-006": {"metal": "Platinum", "karat": 950, "grossWeight": 6.8, "netWeight": 6.1, "stoneWeight": 0.7, "makingChargePerGram": 1800, "cert": "CERT-JW-8826"},
        "JW-007": {"metal": "Gold", "karat": 21, "grossWeight": 4.5, "netWeight": 4.2, "stoneWeight": 0.3, "makingChargePerGram": 750, "cert": "CERT-JW-8827"},
        "JW-008": {"metal": "Gold", "karat": 22, "grossWeight": 15.2, "netWeight": 13.8, "stoneWeight": 1.4, "makingChargePerGram": 1100, "cert": "CERT-JW-8828"},
        "JW-009": {"metal": "Gold", "karat": 18, "grossWeight": 3.9, "netWeight": 3.3, "stoneWeight": 0.6, "makingChargePerGram": 1400, "cert": "CERT-JW-8829"},
        "JW-010": {"metal": "Gold", "karat": 22, "grossWeight": 24.5, "netWeight": 19.0, "stoneWeight": 5.5, "makingChargePerGram": 900, "cert": "CERT-JW-8830"},
        "JW-011": {"metal": "Gold", "karat": 22, "grossWeight": 26.5, "netWeight": 26.5, "stoneWeight": 0.0, "makingChargePerGram": 750, "cert": "CERT-JW-8831"},
        "JW-012": {"metal": "Silver", "karat": 925, "grossWeight": 22.0, "netWeight": 22.0, "stoneWeight": 0.0, "makingChargePerGram": 100},
        "JW-013": {"metal": "Gold", "karat": 22, "grossWeight": 6.5, "netWeight": 6.0, "stoneWeight": 0.5, "makingChargePerGram": 1250, "cert": "CERT-JW-8833"},
        "JW-014": {"metal": "Gold", "karat": 18, "grossWeight": 7.4, "netWeight": 6.1, "stoneWeight": 1.3, "makingChargePerGram": 1500, "cert": "CERT-JW-8834"},
        "JW-015": {"metal": "Gold", "karat": 22, "grossWeight": 10.8, "netWeight": 9.5, "stoneWeight": 1.3, "makingChargePerGram": 850, "cert": "CERT-JW-8835"},
        "JW-016": {"metal": "Gold", "karat": 22, "grossWeight": 1.4, "netWeight": 1.2, "stoneWeight": 0.2, "makingChargePerGram": 500},
        "JW-017": {"metal": "Platinum", "karat": 950, "grossWeight": 8.6, "netWeight": 8.6, "stoneWeight": 0.0, "makingChargePerGram": 1600, "cert": "CERT-JW-8837"},
        "JW-018": {"metal": "Gold", "karat": 22, "grossWeight": 38.5, "netWeight": 35.8, "stoneWeight": 2.7, "makingChargePerGram": 1050, "cert": "CERT-JW-8838"},
        "JW-019": {"metal": "Gold", "karat": 18, "grossWeight": 8.8, "netWeight": 7.2, "stoneWeight": 1.6, "makingChargePerGram": 1650, "cert": "CERT-JW-8839"},
        "JW-020": {"metal": "Gold", "karat": 22, "grossWeight": 5.0, "netWeight": 5.0, "stoneWeight": 0.0, "makingChargePerGram": 400, "cert": "CERT-JW-8840"},
    }

    super_shop_spec_map = SUPER_SHOP_SPEC_MAP

    for sku, name, pack, price, wholesale in SAMPLE_PRODUCTS:
        meta = {}
        if pack == "electronics":
            espec = electronics_meta_map.get(sku, {"brand": "Generic", "model": name, "warrantyMonths": 12, "hasSerial": False})
            meta = {
                "brand": espec["brand"],
                "model": espec["model"],
                "warranty_months": espec["warrantyMonths"],
                "warrantyMonths": espec["warrantyMonths"],
                "has_serial": espec["hasSerial"],
                "hasSerial": espec["hasSerial"],
                "serial_imei_required": espec["hasSerial"],
            }
        elif pack == "jewelry":
            jspec = j_spec_map.get(sku, {"metal": "Gold", "karat": 22, "grossWeight": 5.2, "netWeight": 5.0, "stoneWeight": 0.2, "makingChargePerGram": 800, "cert": "CERT-JEWL-001"})
            meta = {
                "metal": jspec["metal"],
                "karat": jspec["karat"],
                "purity": f"{jspec['karat']}K",
                "gross_weight": jspec["grossWeight"],
                "grossWeight": jspec["grossWeight"],
                "stone_weight": jspec["stoneWeight"],
                "stoneWeight": jspec["stoneWeight"],
                "net_weight": jspec["netWeight"],
                "netWeight": jspec["netWeight"],
                "net_metal_weight": jspec["netWeight"],
                "making_charge_type": "per_gram",
                "making_charge_rate": jspec["makingChargePerGram"],
                "makingChargePerGram": jspec["makingChargePerGram"],
                "wastage_percentage": 2,
                "default_stone_value": int(jspec["stoneWeight"] * 5000),
                "certificate": jspec.get("cert", f"CERT-{sku}"),
                "tag_no": f"TAG-{sku}",
            }
        elif pack == "super-shop":
            meta = dict(super_shop_spec_map.get(sku, {"departmentCode": "GROC"}))
            if "wholesalePrice" in meta:
                wholesale = meta["wholesalePrice"]

        if sku in SAMPLE_PRODUCT_IMAGES:
            meta["image_url"] = SAMPLE_PRODUCT_IMAGES[sku]
            meta["image"] = SAMPLE_PRODUCT_IMAGES[sku]

        p = session.exec(select(Product).where(Product.company_id == company.id, Product.sku == sku)).first()
        prod_barcode = sku
        cost_val = None
        if pack == "super-shop" and sku in super_shop_spec_map:
            prod_barcode = super_shop_spec_map[sku].get("barcode", sku)
            cost_val = super_shop_spec_map[sku].get("costPrice")
        if cost_val is None and price:
            sample_cost_map = {"FASH-001": 780.0, "FASH-002": 1150.0, "FASH-003": 1550.0, "BEEF-001": 620.0, "BEEF-002": 510.0, "GROC-001": 520.0, "PHRM-001": 7.5, "PHRM-002": 30.0, "REST-001": 210.0}
            cost_val = sample_cost_map.get(sku, round(price * 0.65, 2))

        if not p:
            p = Product(
                company_id=company.id,
                sku=sku,
                barcode=prod_barcode,
                name=name,
                industry_pack=pack,
                base_price=price,
                wholesale_price=wholesale,
                cost_price=cost_val,
                meta_json=json.dumps(meta),
            )
            session.add(p)
            session.flush()
        else:
            p.name = name
            p.barcode = prod_barcode
            p.base_price = price
            p.wholesale_price = wholesale
            if cost_val is not None:
                p.cost_price = cost_val
            p.meta_json = json.dumps(meta)
            session.add(p)
            session.flush()
        products.append(p)

    for p in products:
        bal = session.exec(
            select(StockBalance).where(
                StockBalance.company_id == company.id,
                StockBalance.product_id == p.id,
                StockBalance.store_id == store.id,
            )
        ).first()
        if not bal:
            session.add(StockBalance(company_id=company.id, product_id=p.id, store_id=store.id, qty_on_hand=100))

    for j_prod in [p for p in products if p.industry_pack == "jewelry"]:
        meta_data = json.loads(j_prod.meta_json) if j_prod.meta_json else {}
        karat_raw = str(meta_data.get("karat", "22"))
        karat_val = f"{karat_raw}K" if karat_raw in {"10", "14", "18", "21", "22", "24"} else karat_raw
        metal_val = meta_data.get("metal", "Gold")
        prof = session.exec(select(JewelryProductProfile).where(JewelryProductProfile.company_id == company.id, JewelryProductProfile.product_id == j_prod.id)).first()
        if not prof:
            prof = JewelryProductProfile(
                company_id=company.id,
                product_id=j_prod.id,
                metal_type=metal_val,
                purity=karat_val,
                karat=karat_val,
                gross_weight=meta_data.get("grossWeight", 5.2),
                stone_weight=meta_data.get("stoneWeight", 0.2),
                net_metal_weight=meta_data.get("netWeight", 5.0),
                making_charge_type="per_gram",
                making_charge_rate=meta_data.get("makingChargePerGram", 800),
                wastage_percentage=2,
                default_stone_value=meta_data.get("default_stone_value", 1000),
                certificate_required=True,
                tag_no=meta_data.get("tag_no", f"TAG-{j_prod.sku}"),
                barcode=j_prod.sku,
            )
            session.add(prof)
        else:
            prof.metal_type = metal_val
            prof.purity = karat_val
            prof.karat = karat_val
            prof.gross_weight = meta_data.get("grossWeight", prof.gross_weight)
            prof.stone_weight = meta_data.get("stoneWeight", prof.stone_weight)
            prof.net_metal_weight = meta_data.get("netWeight", prof.net_metal_weight)
            prof.making_charge_rate = meta_data.get("makingChargePerGram", prof.making_charge_rate)
            session.add(prof)
        cert_num = meta_data.get("certificate", f"CERT-{j_prod.sku}")
        cert = session.exec(select(JewelryCertificate).where(JewelryCertificate.company_id == company.id, JewelryCertificate.cert_no == cert_num)).first()
        if not cert:
            session.add(
                JewelryCertificate(
                    company_id=company.id,
                    product_id=j_prod.id,
                    cert_no=cert_num,
                    certificate_no=cert_num,
                    tag_no=meta_data.get("tag_no", f"TAG-{j_prod.sku}"),
                    barcode=j_prod.sku,
                    metal_type=metal_val,
                    purity=karat_val,
                    weight_gram=meta_data.get("netWeight", 5.0),
                    gross_weight=meta_data.get("grossWeight", 5.2),
                    stone_weight=meta_data.get("stoneWeight", 0.2),
                    net_metal_weight=meta_data.get("netWeight", 5.0),
                    issue_date=datetime.now(timezone.utc),
                    status="active",
                )
            )
        else:
            cert.metal_type = metal_val
            cert.purity = karat_val
            session.add(cert)

    for m_type, k_type, sell_r, buy_r in [
        ("Gold", "24K", 10745, 9885),
        ("Gold", "22K", 9850, 9062),
        ("Gold", "21K", 9400, 8650),
        ("Gold", "18K", 8060, 7415),
        ("Silver", "925", 145, 125),
        ("Platinum", "950", 4200, 3850),
    ]:
        rate_row = session.exec(
            select(JewelryGoldRate).where(
                JewelryGoldRate.company_id == company.id,
                JewelryGoldRate.metal_type == m_type,
                JewelryGoldRate.karat == k_type,
            )
        ).first()
        if not rate_row:
            session.add(
                JewelryGoldRate(
                    company_id=company.id,
                    metal_type=m_type,
                    karat=k_type,
                    purity=k_type,
                    rate_per_gram=sell_r,
                    selling_rate=sell_r,
                    buying_rate=buy_r,
                    currency="BDT",
                    unit_basis="gram",
                    status="active",
                    effective_date=datetime.now(timezone.utc),
                )
            )

    for pack_code in INDUSTRY_PACKS:
        pack = session.exec(
            select(IndustryPack).where(
                IndustryPack.company_id == company.id,
                IndustryPack.industry_code == pack_code,
            )
        ).first()
        if not pack:
            session.add(
                IndustryPack(
                    company_id=company.id,
                    industry_code=pack_code,
                    enabled_company=True,
                    enabled_store=True,
                    enabled_counter=True,
                    updated_by="seed",
                )
            )
        else:
            pack.enabled_company = True
            pack.enabled_store = True
            pack.enabled_counter = True
            session.add(pack)

    session.flush()


def seed_siddiky_surgical_company(session: Session) -> None:
    """Create SIDDIKY INTERNATIONAL as an independent company (code='SIDDIKY-SURGICAL').
    Store: STORE-SG-01 (Siddiky Surgical Dhaka Flagship).
    Exclusive Vertical: SURGICAL POS ONLY.
    Idempotent — safe to call on startup.
    """
    from app.models.saas import TenantSubscription, SubscriptionPlan
    from app.models.product import Product, ProductCategory, Unit, ProductBarcode
    from app.models.inventory import StockBalance
    from app.models.industry import SurgicalProductProfile, SurgicalStockUnit
    from app.services.accounting_service import seed_default_chart_of_accounts

    # ── 1. Company ──────────────────────────────────────────────────────────
    company = session.exec(select(Company).where(Company.code == "SIDDIKY-SURGICAL")).first()
    if not company:
        company = Company(
            code="SIDDIKY-SURGICAL",
            name="Siddiky International",
            legal_name="Siddiky International Ltd.",
            address="Chowdhury Surgical Market (Besides BMA Bhaban), Topkhana Road, Press Club, Dhaka-1000",
            phone="+880 1732-210283, +880 1841-708103",
            email="admin@siddikysurgical.com",
            approval_status="approved",
            approved_at=datetime.now(timezone.utc),
        )
        session.add(company)
        session.flush()
    else:
        company.name = "Siddiky International"
        company.legal_name = "Siddiky International Ltd."
        company.address = "Chowdhury Surgical Market (Besides BMA Bhaban), Topkhana Road, Press Club, Dhaka-1000"
        company.phone = "+880 1732-210283, +880 1841-708103"
        company.email = "admin@siddikysurgical.com"
        company.approval_status = "approved"
        if not company.approved_at:
            company.approved_at = datetime.now(timezone.utc)
        session.add(company)

    company_id = company.id

    # ── 1.1 Chart of Accounts ──────────────────────────────────────────────
    seed_default_chart_of_accounts(session, company_id)

    # ── 2. Permissions (global table) ───────────────────────────────────────
    for code in PERMISSIONS:
        if not session.exec(select(Permission).where(Permission.code == code[0])).first():
            session.add(Permission(code=code[0], name=code[1], module=code[2]))
    session.flush()
    perm_map = {p.code: p.id for p in session.exec(select(Permission)).all()}

    # ── 3. Roles + permissions ──────────────────────────────────────────────
    existing_role_codes = {
        r.code for r in session.exec(select(Role).where(Role.company_id == company_id)).all()
    }
    roles: dict[str, Role] = {}
    for role_code in DEFAULT_ROLE_PERMISSIONS:
        if role_code not in existing_role_codes:
            role = Role(company_id=company_id, code=role_code, name=role_code, is_system=True)
            session.add(role)
            roles[role_code] = role
        else:
            roles[role_code] = session.exec(
                select(Role).where(Role.company_id == company_id, Role.code == role_code)
            ).first()
    session.flush()

    for role_code, perms in DEFAULT_ROLE_PERMISSIONS.items():
        role = roles.get(role_code)
        if not role:
            continue
        existing_perms = {
            rp.permission_id
            for rp in session.exec(select(RolePermission).where(RolePermission.role_id == role.id)).all()
        }
        for perm_code in perms:
            pid = perm_map.get(perm_code)
            if pid and pid not in existing_perms:
                session.add(RolePermission(role_id=role.id, permission_id=pid, allowed=True))

    # ── 4. Store, Counter & Warehouse ────────────────────────────────────────
    store = session.exec(
        select(Store).where(Store.company_id == company_id, Store.code == "STORE-SG-01")
    ).first()
    if not store:
        store = Store(
            company_id=company_id,
            code="STORE-SG-01",
            name="Siddiky Surgical Dhaka Flagship",
            address="Chowdhury Surgical Market, Topkhana Road, Press Club, Dhaka-1000",
            phone="+880 1732-210283",
            is_active=True,
        )
        session.add(store)
        session.flush()

    counter = session.exec(
        select(Counter).where(Counter.store_id == store.id, Counter.code == "CTR-SG-01")
    ).first()
    if not counter:
        counter = Counter(
            company_id=company_id,
            store_id=store.id,
            code="CTR-SG-01",
            name="OT & Surgical Counter",
            is_active=True,
        )
        session.add(counter)
        session.flush()

    wh = session.exec(
        select(Warehouse).where(Warehouse.company_id == company_id, Warehouse.code == "WH-SG-01")
    ).first()
    if not wh:
        wh = Warehouse(
            company_id=company_id,
            code="WH-SG-01",
            name="Surgical Central Depot",
            is_active=True,
        )
        session.add(wh)
        session.flush()

    # ── 5. Users ─────────────────────────────────────────────────────────────
    admin = session.exec(
        select(UserAccount).where(
            UserAccount.company_id == company_id,
            (UserAccount.email == "admin@siddikysurgical.com") | (UserAccount.username == "siddikyadmin"),
        )
    ).first()
    if not admin:
        admin = UserAccount(
            company_id=company_id,
            store_id=store.id,
            email="admin@siddikysurgical.com",
            username="siddikyadmin",
            full_name="Siddiky Admin",
            password_hash=hash_password("admin123"),
            is_platform_admin=False,
        )
        session.add(admin)
        session.flush()
        sa_role = roles.get("Super Admin")
        if sa_role:
            session.add(UserRole(user_id=admin.id, role_id=sa_role.id))
    else:
        admin.store_id = store.id
        admin.is_platform_admin = False
        session.add(admin)

    cashier = session.exec(
        select(UserAccount).where(
            UserAccount.company_id == company_id,
            (UserAccount.email == "cashier@siddikysurgical.com") | (UserAccount.username == "siddikycashier"),
        )
    ).first()
    if not cashier:
        cashier = UserAccount(
            company_id=company_id,
            store_id=store.id,
            email="cashier@siddikysurgical.com",
            username="siddikycashier",
            full_name="Siddiky Cashier",
            password_hash=hash_password("cashier123"),
        )
        session.add(cashier)
        session.flush()
        c_role = roles.get("Cashier")
        if c_role:
            session.add(UserRole(user_id=cashier.id, role_id=c_role.id))

    # ── 6. Industry Packs — SURGICAL-SHOP ONLY ───────────────────────────────
    existing_pack_codes = {
        p.industry_code
        for p in session.exec(select(IndustryPack).where(IndustryPack.company_id == company_id)).all()
    }
    for pack_code in INDUSTRY_PACKS:
        is_active = pack_code == "surgical-shop"
        if pack_code not in existing_pack_codes:
            session.add(IndustryPack(
                company_id=company_id,
                industry_code=pack_code,
                enabled_company=is_active,
                enabled_store=is_active,
                enabled_counter=is_active,
                updated_by="seed",
            ))
        else:
            pack = session.exec(
                select(IndustryPack).where(
                    IndustryPack.company_id == company_id,
                    IndustryPack.industry_code == pack_code,
                )
            ).first()
            if pack:
                pack.enabled_company = is_active
                pack.enabled_store = is_active
                pack.enabled_counter = is_active
                session.add(pack)

    # ── 7. Subscription ──────────────────────────────────────────────────────
    plan = session.exec(select(SubscriptionPlan).where(SubscriptionPlan.code == "professional")).first() or \
           session.exec(select(SubscriptionPlan).where(SubscriptionPlan.code == "starter")).first()
    if plan:
        sub = session.exec(select(TenantSubscription).where(TenantSubscription.company_id == company_id)).first()
        if not sub:
            sub = TenantSubscription(
                company_id=company_id,
                plan_id=plan.id,
                status="active",
                billing_cycle="monthly",
                started_at=datetime.now(timezone.utc),
                expires_at=datetime.now(timezone.utc) + timedelta(days=365),
            )
            session.add(sub)
        else:
            sub.status = "active"
            session.add(sub)

    # ── 8. Units and Categories ──────────────────────────────────────────────
    pcs_unit = session.exec(select(Unit).where(Unit.company_id == company_id, Unit.code == "PCS")).first()
    if not pcs_unit:
        pcs_unit = Unit(company_id=company_id, code="PCS", name="Pieces")
        session.add(pcs_unit)
        session.flush()

    pair_unit = session.exec(select(Unit).where(Unit.company_id == company_id, Unit.code == "PAIR")).first()
    if not pair_unit:
        pair_unit = Unit(company_id=company_id, code="PAIR", name="Pair")
        session.add(pair_unit)
        session.flush()

    set_unit = session.exec(select(Unit).where(Unit.company_id == company_id, Unit.code == "SET")).first()
    if not set_unit:
        set_unit = Unit(company_id=company_id, code="SET", name="Set")
        session.add(set_unit)
        session.flush()

    categories_def = [
        ("ORTHOPEDICS", "Orthopedics & Supports"),
        ("DIAGNOSTICS", "Rapid Diagnostic Kits"),
        ("SURG_PPE", "Surgical Disposables & PPE"),
        ("SURG_INSTRUMENTS", "Surgical Instruments & OT Tools"),
    ]
    cat_map = {}
    for c_code, c_name in categories_def:
        cat = session.exec(select(ProductCategory).where(ProductCategory.company_id == company_id, ProductCategory.code == c_code)).first()
        if not cat:
            cat = ProductCategory(company_id=company_id, code=c_code, name=c_name, is_active=True)
            session.add(cat)
            session.flush()
        cat_map[c_name] = cat.id

    # ── 9. Products & Surgical Profiles ──────────────────────────────────────
    products_data = [
        ("TYN-A01-M", "Tynor Abdominal Support 9\" (23cm) · M", "Orthopedics & Supports", "Tynor", "A01", pcs_unit, 650, 850, False, "Class I", "TYN-26-A01M", None, "088493010011", 1000, 45),
        ("TYN-A01-L", "Tynor Abdominal Support 9\" (23cm) · L", "Orthopedics & Supports", "Tynor", "A01", pcs_unit, 650, 850, False, "Class I", "TYN-26-A01L", None, "088493010012", 1000, 50),
        ("TYN-A01-XL", "Tynor Abdominal Support 9\" (23cm) · XL", "Orthopedics & Supports", "Tynor", "A01", pcs_unit, 680, 890, False, "Class I", "TYN-26-A01XL", None, "088493010013", 1000, 35),
        ("TYN-A01-XXL", "Tynor Abdominal Support 9\" (23cm) · XXL", "Orthopedics & Supports", "Tynor", "A01", pcs_unit, 720, 950, False, "Class I", "TYN-26-A01XXL", None, "088493010014", 1000, 20),
        ("TYN-A05-M", "Tynor Lumbo Sacral Belt · M", "Orthopedics & Supports", "Tynor", "A05", pcs_unit, 850, 1150, False, "Class I", "TYN-26-A05M", None, "088493010051", 1000, 40),
        ("TYN-A05-L", "Tynor Lumbo Sacral Belt · L", "Orthopedics & Supports", "Tynor", "A05", pcs_unit, 850, 1150, False, "Class I", "TYN-26-A05L", None, "088493010052", 1000, 45),
        ("TYN-A05-XL", "Tynor Lumbo Sacral Belt · XL", "Orthopedics & Supports", "Tynor", "A05", pcs_unit, 900, 1220, False, "Class I", "TYN-26-A05XL", None, "088493010053", 1000, 30),
        ("TYN-A07-M", "Tynor Contoured L.S Support · M", "Orthopedics & Supports", "Tynor", "A07", pcs_unit, 1050, 1450, False, "Class I", "TYN-26-A07M", None, "088493010071", 1000, 35),
        ("TYN-A07-L", "Tynor Contoured L.S Support · L", "Orthopedics & Supports", "Tynor", "A07", pcs_unit, 1050, 1450, False, "Class I", "TYN-26-A07L", None, "088493010072", 1000, 35),
        ("TYN-A11-M", "Tynor Chest Binder · M", "Orthopedics & Supports", "Tynor", "A11", pcs_unit, 550, 750, False, "Class I", "TYN-26-A11M", None, "088493010111", 1000, 25),
        ("TYN-A13-REG", "Tynor Taylor's Brace Short/Long · Regular", "Orthopedics & Supports", "Tynor", "A13", pcs_unit, 1800, 2450, False, "Class I", "TYN-26-A13R", None, "088493010131", 1000, 15),
        ("TYN-B02-L", "Tynor Cervical Collar Soft with Support · L", "Orthopedics & Supports", "Tynor", "B02", pcs_unit, 380, 520, False, "Class I", "TYN-26-B02L", None, "088493010021", 1000, 60),
        ("TYN-A33-M", "Tynor Posture Corrector · M", "Orthopedics & Supports", "Tynor", "A33", pcs_unit, 750, 1050, False, "Class I", "TYN-26-A33M", None, "088493010331", 1000, 30),
        ("TYN-D04-M", "Tynor Knee Cap (Pair) · M", "Orthopedics & Supports", "Tynor", "D04", pair_unit, 320, 450, False, "Class I", "TYN-26-D04M", None, "088493010041", 1000, 70),
        ("TYN-E05-M", "Tynor Wrist Brace with Double Lock · M", "Orthopedics & Supports", "Tynor", "E05", pcs_unit, 420, 580, False, "Class I", "TYN-26-E05M", None, "088493010055", 1000, 40),
        ("TYN-E10-M", "Tynor Tennis Elbow Support · M", "Orthopedics & Supports", "Tynor", "E10", pcs_unit, 280, 390, False, "Class I", "TYN-26-E10M", None, "088493010101", 1000, 50),
        ("DIAG-DENGUE-NS1", "Dengue NS1 Antigen Rapid Test Kit", "Rapid Diagnostic Kits", "SD Biosensor", "NS1-25", pcs_unit, 30, 50, True, "IVD", "DG-2026-NS1", None, "088493020011", 450, 500),
        ("DIAG-DENGUE-COMBO", "Dengue Combo (NS1 + IgG/IgM) Rapid Test Kit", "Rapid Diagnostic Kits", "SD Biosensor", "CMB-25", pcs_unit, 55, 80, True, "IVD", "DG-2026-CMB", None, "088493020012", 450, 400),
        ("DIAG-PREG-CARD", "Pregnancy Rapid Diagnostic Test Card (HCG)", "Rapid Diagnostic Kits", "QuickCheck", "HCG-25", pcs_unit, 15, 30, True, "IVD", "HCG-2026-081", None, "088493020013", 600, 600),
        ("GLV-STERILE-PF-7.5", "Surgical Gloves Powder-Free Sterile · Size 7.5", "Surgical Disposables & PPE", "Medisafe", "PF-75", pair_unit, 28, 43, True, "ISO 13485", "GLV-26-PF75", None, "088493030075", 720, 1000),
        ("GLV-STERILE-PF-7.0", "Surgical Gloves Powder-Free Sterile · Size 7.0", "Surgical Disposables & PPE", "Medisafe", "PF-70", pair_unit, 28, 43, True, "ISO 13485", "GLV-26-PF70", None, "088493030070", 720, 800),
        ("GLV-STERILE-PWD-7.5", "Surgical Gloves Powdered Sterile · Size 7.5", "Surgical Disposables & PPE", "Medisafe", "PW-75", pair_unit, 28, 43, True, "ISO 13485", "GLV-26-PW75", None, "088493030175", 720, 600),
        ("SG-02-274-18", "Beyer Bone Rongeurs 18cm / 7\"", "Surgical Instruments & OT Tools", "Siddiky Precision", "02-274-18", pcs_unit, 3200, 4500, True, "SS 316L", "BR-2026-274", "SN-BR-001", "088493040274", 1800, 10),
        ("SG-02-374-20", "Jewett Bone Plate Benders 20cm / 8\"", "Surgical Instruments & OT Tools", "Siddiky Precision", "02-374-20", pcs_unit, 2700, 3800, True, "SS 316L", "PB-2026-374", "SN-PB-001", "088493040374", 1800, 12),
        ("SG-03-188-00", "Balfour Abdominal Retractor (Opening 250mm)", "Surgical Instruments & OT Tools", "Siddiky Precision", "03-188-00", set_unit, 6000, 8500, True, "SS 316L", "RET-2026-188", "SN-RET-001", "088493040188", 1800, 6),
        ("SG-04-011-01", "McIntosh Laryngoscope Set (4 Blades + Handle)", "Surgical Instruments & OT Tools", "Siddiky Precision", "04-011-01", set_unit, 4500, 6500, True, "Optical LED", "LARY-2026-011", "SN-LARY-001", "088493040011", 1800, 8),
        ("SG-05-118-145", "Metzenbaum Dissecting Scissors Curved 14.5cm", "Surgical Instruments & OT Tools", "Siddiky Precision", "05-118-145", pcs_unit, 650, 950, True, "Tungsten Carbide", "SCIS-2026-118", "SN-SCIS-001", "088493040118", 1800, 25),
        ("SG-05-839-14", "Mayo-Hegar Needle Holder 14cm", "Surgical Instruments & OT Tools", "Siddiky Precision", "05-839-14", pcs_unit, 750, 1100, True, "Tungsten Carbide", "NH-2026-839", "SN-NH-001", "088493040839", 1800, 30),
        ("SG-05-1112-125", "Halstead-Mosquito Hemostatic Forceps 12.5cm", "Surgical Instruments & OT Tools", "Siddiky Precision", "05-1112-125", pcs_unit, 500, 750, True, "SS 316L", "CLP-2026-1112", "SN-CLP-001", "088493041112", 1800, 40),
        ("SG-05-2334-75", "Cusco Vaginal Specula (Lateral Fixation 75x17mm)", "Surgical Instruments & OT Tools", "Siddiky Precision", "05-2334-75", pcs_unit, 1000, 1450, True, "SS 316L", "GYN-2026-2334", "SN-GYN-001", "088493042334", 1800, 20),
    ]

    product_images_map = {
        "TYN-A01-M": "/products/surgical/tynor_a01_abdominal.png",
        "TYN-A01-L": "/products/surgical/tynor_a01_abdominal.png",
        "TYN-A01-XL": "/products/surgical/tynor_a01_abdominal.png",
        "TYN-A01-XXL": "/products/surgical/tynor_a01_abdominal.png",
        "TYN-A05-M": "/products/surgical/tynor_a04_ls_belt.png",
        "TYN-A05-L": "/products/surgical/tynor_a04_ls_belt.png",
        "TYN-A05-XL": "/products/surgical/tynor_a04_ls_belt.png",
        "TYN-A07-M": "/products/surgical/tynor_a07_contoured_ls.png",
        "TYN-A07-L": "/products/surgical/tynor_a07_contoured_ls.png",
        "TYN-A11-M": "/products/surgical/tynor_a02_chest.png",
        "TYN-A13-REG": "/products/surgical/tynor_a13_taylor.png",
        "TYN-B02-L": "/products/surgical/tynor_b02_cervical_support.png",
        "TYN-A33-M": "/products/surgical/tynor_a23_posture.png",
        "TYN-D04-M": "/products/surgical/tynor_d04_knee_cap.png",
        "TYN-E05-M": "/products/surgical/tynor_e44_wrist_brace.png",
        "TYN-E10-M": "/products/surgical/tynor_e11_tennis_elbow.png",
        "DIAG-DENGUE-NS1": "/products/surgical/dengue_ns1.png",
        "DIAG-DENGUE-COMBO": "/products/surgical/dengue_combo.png",
        "DIAG-PREG-CARD": "/products/surgical/pregnancy_card.png",
        "GLV-STERILE-PF-7.5": "/products/surgical/sterile_gloves.png",
        "GLV-STERILE-PF-7.0": "/products/surgical/sterile_gloves.png",
        "GLV-STERILE-PWD-7.5": "/products/surgical/sterile_gloves.png",
        "SG-02-274-18": "/products/surgical/bone_rongeurs.png",
        "SG-02-374-20": "/products/surgical/plate_benders.png",
        "SG-03-188-00": "/products/surgical/balfour_retractor.png",
        "SG-04-011-01": "/products/surgical/laryngoscope_set.png",
        "SG-05-118-145": "/products/surgical/metzenbaum_scissors.png",
        "SG-05-839-14": "/products/surgical/needle_holder.png",
        "SG-05-1112-125": "/products/surgical/mosquito_forceps.png",
        "SG-05-2334-75": "/products/surgical/cusco_specula.png",
    }

    for sku, name, cat_name, brand, model, unit_obj, cost, mrp, is_sterile, grade, batch, serial, udi, exp_days, stock_qty in products_data:
        p = session.exec(select(Product).where(Product.company_id == company_id, Product.sku == sku)).first()
        meta = {
            "brand": brand,
            "model": model,
            "surgical_grade": grade,
            "sterile": is_sterile,
            "unit": unit_obj.name,
            "batch_no": batch,
            "udi_code": udi,
            "expiry_date": (datetime.now(timezone.utc) + timedelta(days=exp_days)).strftime("%Y-%m-%d"),
            "image_url": product_images_map.get(sku, ""),
        }
        if not p:
            p = Product(
                company_id=company_id,
                category_id=cat_map.get(cat_name),
                unit_id=unit_obj.id,
                sku=sku,
                name=name,
                industry_pack="surgical-shop",
                base_price=mrp,
                cost_price=cost,
                is_active=True,
                meta_json=json.dumps(meta),
            )
            session.add(p)
            session.flush()
        else:
            p.name = name
            p.industry_pack = "surgical-shop"
            p.base_price = mrp
            p.cost_price = cost
            p.meta_json = json.dumps(meta)
            session.add(p)
            session.flush()

        # Barcode
        bc = session.exec(select(ProductBarcode).where(ProductBarcode.product_id == p.id)).first()
        if not bc:
            session.add(ProductBarcode(
                company_id=company_id,
                product_id=p.id,
                barcode=udi or sku,
                is_primary=True,
            ))

        # Stock balance
        sb = session.exec(select(StockBalance).where(StockBalance.store_id == store.id, StockBalance.product_id == p.id)).first()
        if not sb:
            session.add(StockBalance(
                company_id=company_id,
                store_id=store.id,
                product_id=p.id,
                qty_on_hand=stock_qty,
                avg_cost=cost,
            ))

        # Surgical Product Profile
        s_prof = session.exec(select(SurgicalProductProfile).where(SurgicalProductProfile.product_id == p.id)).first()
        if not s_prof:
            session.add(SurgicalProductProfile(
                company_id=company_id,
                product_id=p.id,
                manufacturer_name=brand,
                model_no=model,
                catalog_no=sku,
                tracking_mode="batch_and_serial" if serial else "batch",
                lot_tracked=True,
                batch_tracked=True,
                serial_tracked=bool(serial),
                expiry_tracked=True,
                udi_required=bool(udi),
                sterile_required=is_sterile,
                sterilization_method="Ethylene Oxide (EO Gas)" if is_sterile else None,
                is_active=True,
            ))

        # Surgical Stock Unit
        s_unit = session.exec(select(SurgicalStockUnit).where(SurgicalStockUnit.product_id == p.id, SurgicalStockUnit.store_id == store.id)).first()
        if not s_unit:
            session.add(SurgicalStockUnit(
                company_id=company_id,
                product_id=p.id,
                store_id=store.id,
                manufacturer_name=brand,
                batch_no=batch,
                lot_no=batch,
                serial_no=serial,
                udi_code=udi,
                manufacture_date=datetime.now(timezone.utc) - timedelta(days=60),
                expiry_date=datetime.now(timezone.utc) + timedelta(days=exp_days),
                qty_on_hand=stock_qty,
                status="available",
                sterile_status="sterile" if is_sterile else "non_sterile",
                sterilization_method="Ethylene Oxide (EO Gas)" if is_sterile else None,
            ))

    session.flush()


def seed_demo_data(force: bool = False, session: Session | None = None) -> None:
    own_session = session is None
    if own_session:
        session = Session(engine)
    try:
        existing = session.exec(select(Company).where(Company.code == "PULSE-DEMO")).first()
        if existing:
            from app.services.platform_iam_service import ensure_platform_super_admin
            from app.services.subscription_service import ensure_plans

            # Guard: ensure correct name, email, phone, and address for PULSE-DEMO
            existing.name = "Pulse Retail Group"
            existing.legal_name = "Pulse Retail Group Ltd"
            existing.email = "contact@pulseretail.pos"
            existing.phone = "+880 2 9887766"
            existing.address = "Road 11, Banani, Dhaka"
            session.add(existing)

            # Guard: remove rogue OUTFIT-01 store that old seed created inside PULSE-DEMO
            rogue_outfit_store = session.exec(
                select(Store).where(Store.company_id == existing.id, Store.code == "OUTFIT-01")
            ).first()
            if rogue_outfit_store:
                # Reassign any users pointing to it → DHK-01
                dhk01 = session.exec(
                    select(Store).where(Store.company_id == existing.id, Store.code == "DHK-01")
                ).first()
                if dhk01:
                    for u in session.exec(
                        select(UserAccount).where(
                            UserAccount.company_id == existing.id,
                            UserAccount.store_id == rogue_outfit_store.id,
                        )
                    ).all():
                        u.store_id = dhk01.id
                        session.add(u)
                for c in session.exec(
                    select(Counter).where(Counter.store_id == rogue_outfit_store.id)
                ).all():
                    session.delete(c)
                session.flush()
                session.delete(rogue_outfit_store)

            # Seed defaults & HR presets
            _ensure_hr_presets(session, existing.id)
            st = session.exec(select(Store).where(Store.company_id == existing.id, Store.code == "DHK-01")).first()
            if not st:
                st = session.exec(select(Store).where(Store.company_id == existing.id)).first()
            st_id = st.id if st else ""
            _ensure_demo_hr_full(session, existing.id, st_id)
            _ensure_demo_purchases_full(session, existing.id, st_id)

            ensure_plans(session)
            ensure_platform_super_admin(session)
            ensure_demo_super_admin(session, existing)

            # Upsert all 20+ items for Jewellery, Electronics, and Restaurant
            if st:
                _upsert_demo_products_and_catalogs(session, existing, st)

            session.commit()
            print("Demo data seed completed successfully (PULSE-DEMO catalog updated).")
            return

        company = Company(code="PULSE-DEMO", name="Pulse Retail Group", legal_name="Pulse Retail Group Ltd")
        session.add(company)
        session.flush()
        _ensure_hr_presets(session, company.id)

        store1 = session.exec(select(Store).where(Store.company_id == company.id, Store.code == "DHK-01")).first()
        if not store1:
            store1 = Store(company_id=company.id, code="DHK-01", name="Banani Flagship", address="Road 11, Banani")
            session.add(store1)
            session.flush()

        store2 = session.exec(select(Store).where(Store.company_id == company.id, Store.code == "DHK-02")).first()
        if not store2:
            store2 = Store(company_id=company.id, code="DHK-02", name="Gulshan Outlet", address="Gulshan 2")
            session.add(store2)
            session.flush()

        wh1 = session.exec(select(Warehouse).where(Warehouse.company_id == company.id, Warehouse.code == "WH-DHK-01")).first()
        if not wh1:
            wh1 = Warehouse(company_id=company.id, store_id=store1.id, code="WH-DHK-01", name="Banani Main WH")
            session.add(wh1)

        wh2 = session.exec(select(Warehouse).where(Warehouse.company_id == company.id, Warehouse.code == "WH-DHK-02")).first()
        if not wh2:
            wh2 = Warehouse(company_id=company.id, store_id=store2.id, code="WH-DHK-02", name="Gulshan WH")
            session.add(wh2)
        session.flush()

        for sid in (store1.id, store2.id):
            for key, val in [
                ("allow_negative_stock", "false"),
                ("inventory_cost_method", "moving_average"),
                ("cart_reservation_minutes", "15"),
                ("sales_return_window_days", "30"),
                ("sales_return_requires_receipt", "false"),
            ]:
                pol = session.exec(
                    select(StorePolicy).where(
                        StorePolicy.company_id == company.id,
                        StorePolicy.store_id == sid,
                        StorePolicy.policy_key == key,
                    )
                ).first()
                if not pol:
                    session.add(
                        StorePolicy(
                            company_id=company.id,
                            store_id=sid,
                            policy_key=key,
                            policy_value=val,
                        )
                    )

        counters = []
        for code, name, sid in [("CTR-01", "Counter 1", store1.id), ("CTR-02", "Counter 2", store1.id), ("CTR-03", "Gulshan Counter", store2.id)]:
            c = session.exec(select(Counter).where(Counter.company_id == company.id, Counter.code == code)).first()
            if not c:
                c = Counter(company_id=company.id, store_id=sid, code=code, name=name)
                session.add(c)
            counters.append(c)
        session.flush()

        for code in PERMISSIONS:
            if not session.exec(select(Permission).where(Permission.code == code[0])).first():
                session.add(Permission(code=code[0], name=code[1], module=code[2]))

        session.flush()
        perm_map = {p.code: p.id for p in session.exec(select(Permission)).all()}

        roles: dict[str, Role] = {}
        for role_code in DEFAULT_ROLE_PERMISSIONS:
            role = session.exec(select(Role).where(Role.company_id == company.id, Role.code == role_code)).first()
            if not role:
                role = Role(company_id=company.id, code=role_code, name=role_code, is_system=True)
                session.add(role)
            roles[role_code] = role
        session.flush()

        for role_code, perms in DEFAULT_ROLE_PERMISSIONS.items():
            role = roles[role_code]
            for perm_code in perms:
                pid = perm_map.get(perm_code)
                if pid:
                    rp = session.exec(select(RolePermission).where(RolePermission.role_id == role.id, RolePermission.permission_id == pid)).first()
                    if not rp:
                        session.add(RolePermission(role_id=role.id, permission_id=pid, allowed=True))

        users = [
            ("admin@pulse.pos", "admin", "Mashfak Rahman", "Super Admin", "admin123", store1.id),
            ("manager@pulse.pos", "manager", "Store Manager", "Store Manager", "manager123", store1.id),
            ("cashier@pulse.pos", "cashier", "Front Cashier", "Cashier", "cashier123", store1.id),
            ("inventory@pulse.pos", "inventory", "Inventory Clerk", "Inventory User", "inventory123", store1.id),
            ("auditor@pulse.pos", "auditor", "Compliance Auditor", "Auditor", "auditor123", store1.id),
        ]
        admin_user_id: str | None = None
        for email, username, full_name, role_code, password, store_id in users:
            user = session.exec(select(UserAccount).where(UserAccount.company_id == company.id, UserAccount.email == email)).first()
            if not user:
                user = UserAccount(
                    company_id=company.id,
                    store_id=store_id,
                    email=email,
                    username=username,
                    full_name=full_name,
                    password_hash=hash_password(password),
                )
                session.add(user)
                session.flush()
                ur = session.exec(select(UserRole).where(UserRole.user_id == user.id, UserRole.role_id == roles[role_code].id)).first()
                if not ur:
                    session.add(UserRole(user_id=user.id, role_id=roles[role_code].id))
            if role_code == "Super Admin":
                admin_user_id = user.id

            name_parts = full_name.split(" ", 1)
            emp = MiniHrEmployee(
                company_id=company.id,
                user_account_id=user.id,
                employee_code=f"EMP-{username.upper()}",
                first_name=name_parts[0],
                last_name=name_parts[1] if len(name_parts) > 1 else "",
                # MiniHrEmployee.full_name is NOT NULL. Omitting it here made
                # seeding an empty database fail outright, which also broke every
                # backend test (they seed in the session fixture).
                full_name=full_name,
                display_name=full_name,
                email=email,
                mobile=f"+880 1700-00000{users.index((email, username, full_name, role_code, password, store_id))+1}",
                employee_status="active",
                primary_store_id=store_id,
                notes=f"Seeded {role_code} employee profile",
            )
            session.add(emp)

        for pack_code in INDUSTRY_PACKS:
            session.add(
                IndustryPack(
                    company_id=company.id,
                    industry_code=pack_code,
                    enabled_company=True,
                    enabled_store=True,
                    enabled_counter=True,
                    updated_by="seed",
                )
            )

        for key, pack, label, default in FEATURE_FLAGS:
            if not session.exec(select(FeatureFlag).where(FeatureFlag.key == key)).first():
                session.add(FeatureFlag(key=key, pack_code=pack, label=label, description=label, default_enabled=default))
            session.add(TenantFeature(company_id=company.id, flag_key=key, enabled=default, updated_by="seed"))

        session.add(
            DynamicFieldDefinition(
                company_id=company.id,
                pack_code="beef-shop",
                entity="product",
                name="Halal Certificate No",
                field_type="text",
                # Product-master field — not a POS cart input (cart uses Sale-line entities only).
                visible_in_pos=False,
                visible_in_product=True,
                visible_in_receipt=True,
                sort_order=1,
            )
        )
        session.add(
            DynamicFieldDefinition(
                company_id=company.id,
                pack_code="beef-shop",
                entity="Sale line",
                name="Cut type",
                field_type="dropdown",
                required=True,
                visible_in_pos=True,
                visible_in_product=False,
                visible_in_receipt=True,
                options='["Regular","Boneless","Minced","Ribs","Steak","Liver","Custom"]',
                sort_order=2,
            )
        )
        session.add(
            DynamicFieldDefinition(
                company_id=company.id,
                pack_code="fashion",
                entity="Sale line",
                name="Fit",
                field_type="dropdown",
                required=False,
                visible_in_pos=True,
                visible_in_product=True,
                visible_in_receipt=True,
                options='["Slim","Regular","Relaxed","Oversized","Tailored"]',
                sort_order=1,
            )
        )
        session.add(
            DynamicFieldDefinition(
                company_id=company.id,
                pack_code="fashion",
                entity="Product",
                name="Fabric Care Label",
                field_type="text",
                # Product master only — must never appear on Fashion/Universal POS cart.
                required=False,
                visible_in_pos=False,
                visible_in_product=True,
                visible_in_receipt=False,
                sort_order=2,
            )
        )

        session.add(
            ReceiptTemplate(
                company_id=company.id,
                pack_code=None,
                name="Default",
                brand_name="Pulse Retail Group",
                tagline="One core · many verticals",
                address_lines="Banani Flagship · DHK-01\nRoad 11, Banani, Dhaka",
                footer_notes="Thank you · returns within 7 days",
                is_default=True,
            )
        )
        pack_receipt_names = {
            "beef-shop": "Beef Shop Receipt",
            "fashion": "Fashion Receipt",
            "pharmacy": "Pharmacy Receipt",
            "grocery": "Grocery Receipt",
            "restaurant": "Restaurant Receipt",
            "jewelry": "Jewelry Receipt",
            "electronics": "Electronics Receipt",
            "tailoring": "Tailoring Receipt",
            "rice-mill": "Rice Mill Receipt",
            "furniture": "Furniture Receipt",
            "optical-shop": "Optical Shop Receipt",
            "surgical-shop": "Surgical Shop Receipt",
            "mobile-shop": "Mobile Shop Receipt",
            "salon": "Salon Receipt",
            "cosmetics": "Cosmetics Receipt",
        }
        for pack_code, tmpl_name in pack_receipt_names.items():
            session.add(
                ReceiptTemplate(
                    company_id=company.id,
                    pack_code=pack_code,
                    name=tmpl_name,
                    brand_name="Pulse Retail Group",
                    tagline=f"{pack_code.replace('-', ' ').title()} POS",
                    address_lines="Banani Flagship · DHK-01\nRoad 11, Banani, Dhaka",
                    footer_notes=f"Thank you for shopping · {pack_code}",
                    is_default=False,
                )
            )

        products: list[Product] = []
        for sku, name, pack, price, wholesale in SAMPLE_PRODUCTS:
            meta: dict = {}
            if pack == "beef-shop":
                meta = {"category": "Premium Cuts", "cut_type": "shoulder"}
            elif pack == "fashion":
                if sku == "FASH-001":
                    meta = {
                        "style_code": "PL-SS26-001",
                        "product_type": "Polo",
                        "season": "SS",
                        "year": 2026,
                        "gender": "Men",
                        "collection": "Basics",
                        "fabric": "Cotton pique",
                        "fit": "Regular",
                        "min_selling_price": 990,
                        "max_discount_pct": 30,
                        "returnable": True,
                        "exchangeable": True,
                    }
                elif sku == "FASH-002":
                    meta = {
                        "style_code": "CH-SS26-002",
                        "product_type": "Chino",
                        "season": "SS",
                        "year": 2026,
                        "gender": "Men",
                        "collection": "Workwear",
                        "fabric": "Cotton twill",
                        "fit": "Slim",
                        "min_selling_price": 1490,
                        "max_discount_pct": 25,
                        "returnable": True,
                        "exchangeable": True,
                    }
                else:
                    meta = {
                        "style_code": "HD-FW26-003",
                        "product_type": "Hoodie",
                        "season": "FW",
                        "year": 2026,
                        "gender": "Unisex",
                        "collection": "Lounge",
                        "fabric": "Fleece",
                        "fit": "Oversized",
                        "min_selling_price": 1990,
                        "max_discount_pct": 20,
                        "returnable": True,
                        "exchangeable": True,
                    }
            elif pack == "electronics":
                elec_meta_map = {
                    "EL-001": {"brand": "Samsung", "model": "SM-A556", "warranty_months": 12, "serialized": True},
                    "EL-002": {"brand": "Xiaomi", "model": "2312DRA50G", "warranty_months": 12, "serialized": True},
                    "EL-003": {"brand": "Anker", "model": "A8346", "warranty_months": 18, "serialized": False},
                    "EL-004": {"brand": "Sony", "model": "KD-55X80L", "warranty_months": 24, "serialized": True},
                    "EL-005": {"brand": "Apple", "model": "A3102", "warranty_months": 12, "serialized": True},
                    "EL-006": {"brand": "Apple", "model": "MXD13", "warranty_months": 12, "serialized": True},
                    "EL-007": {"brand": "Sony", "model": "WH1000XM5", "warranty_months": 12, "serialized": True},
                    "EL-008": {"brand": "Gree", "model": "GS-18XLM32", "warranty_months": 36, "serialized": True},
                    "EL-009": {"brand": "Walton", "model": "WFD-2E2", "warranty_months": 120, "serialized": True},
                    "EL-010": {"brand": "LG", "model": "FHV1208Z4W", "warranty_months": 24, "serialized": True},
                    "EL-011": {"brand": "Keychron", "model": "K2-V2", "warranty_months": 12, "serialized": False},
                    "EL-012": {"brand": "Logitech", "model": "MX Master 3S", "warranty_months": 12, "serialized": False},
                    "EL-013": {"brand": "Dell", "model": "U2723QE", "warranty_months": 36, "serialized": True},
                    "EL-014": {"brand": "TP-Link", "model": "Deco X50", "warranty_months": 24, "serialized": True},
                    "EL-015": {"brand": "JBL", "model": "Cinema SB550", "warranty_months": 12, "serialized": True},
                    "EL-016": {"brand": "Apple", "model": "MR993", "warranty_months": 12, "serialized": True},
                    "EL-017": {"brand": "Baseus", "model": "PPBD050301", "warranty_months": 6, "serialized": False},
                    "EL-018": {"brand": "JBL", "model": "Charge 5", "warranty_months": 12, "serialized": True},
                    "EL-019": {"brand": "Canon", "model": "EOS R8", "warranty_months": 24, "serialized": True},
                    "EL-020": {"brand": "Samsung", "model": "MG23T5018AK", "warranty_months": 12, "serialized": True},
                }
                spec = elec_meta_map.get(sku, {"serialized": True, "warranty_months": 12, "brand": "Pulse", "model": "X1"})
                meta = {"serialized": spec["serialized"], "warranty_months": spec["warranty_months"], "brand": spec["brand"], "model": spec["model"]}
            elif pack == "mobile-shop":
                if sku == "MOB-ACC-001":
                    meta = {"serialized": False, "brand": "Pulse", "category": "accessory"}
                else:
                    meta = {
                        "serialized": True,
                        "warranty_months": 12,
                        "brand": "Samsung",
                        "model": "Galaxy A15",
                        "ram": "8 GB",
                        "storage": "256 GB",
                        "color": "Black",
                    }
            elif pack == "salon":
                if sku == "SALON-SH":
                    meta = {"item_type": "retail", "category": "Hair care"}
                else:
                    meta = {
                        "item_type": "service",
                        "duration_mins": 30 if sku == "SALON-HC" else 45,
                        "gender": "Unisex",
                    }
            elif pack == "hardware":
                if sku == "HW-SCREW":
                    meta = {"category": "Fasteners", "brand": "RFL", "unit": "Piece"}
                elif sku == "HW-CABLE":
                    meta = {"category": "Electrical", "brand": "BRB", "unit": "Meter"}
                else:
                    meta = {"category": "Paint", "brand": "Berger", "unit": "Liter"}
            elif pack == "building-materials":
                if sku == "BM-CEMENT":
                    meta = {"category": "Cement", "brand": "Crown", "unit": "Bag"}
                elif sku == "BM-ROD":
                    meta = {"category": "Rod", "brand": "BSRM", "unit": "Piece"}
                else:
                    meta = {"category": "Sand", "unit": "CFT"}
            elif pack == "bookstore":
                if sku == "BK-PHY10":
                    meta = {"category": "Textbook", "subject": "Physics", "class": "10"}
                elif sku == "BK-MATH12":
                    meta = {"category": "Textbook", "subject": "Mathematics", "class": "12"}
                else:
                    meta = {"category": "Fiction", "language": "Bangla"}
            elif pack == "stationery":
                if sku == "ST-PEN":
                    meta = {"category": "Pen", "brand": "Matador", "color": "Blue"}
                elif sku == "ST-KHATA":
                    meta = {"category": "Exercise Book", "brand": "Fresh", "pages": 80}
                else:
                    meta = {"category": "Paper", "brand": "Double A", "size": "A4"}
            elif pack == "cosmetics":
                if sku == "COS-LIP":
                    meta = {"category": "Lipstick", "brand": "Unilever", "type": "lipstick"}
                elif sku == "COS-FOUND":
                    meta = {"category": "Foundation", "brand": "Unilever", "type": "foundation"}
                else:
                    meta = {"category": "Skincare", "brand": "Marico", "type": "skincare"}
            elif pack == "jewelry":
                j_spec_map = {
                    "JW-001": {"metal": "Gold", "karat": 22, "grossWeight": 12.4, "netWeight": 11.8, "stoneWeight": 0.0, "makingChargePerGram": 850, "cert": "CERT-JW-8821"},
                    "JW-002": {"metal": "Gold", "karat": 18, "grossWeight": 5.2, "netWeight": 4.6, "stoneWeight": 0.4, "makingChargePerGram": 1200, "cert": "CERT-JW-8822"},
                    "JW-003": {"metal": "Silver", "karat": 925, "grossWeight": 28.0, "netWeight": 27.5, "stoneWeight": 0.0, "makingChargePerGram": 120},
                    "JW-004": {"metal": "Gold", "karat": 22, "grossWeight": 42.5, "netWeight": 39.0, "stoneWeight": 3.5, "makingChargePerGram": 950, "cert": "CERT-JW-8824"},
                    "JW-005": {"metal": "Gold", "karat": 22, "grossWeight": 36.0, "netWeight": 36.0, "stoneWeight": 0.0, "makingChargePerGram": 800, "cert": "CERT-JW-8825"},
                    "JW-006": {"metal": "Platinum", "karat": 950, "grossWeight": 6.8, "netWeight": 6.1, "stoneWeight": 0.7, "makingChargePerGram": 1800, "cert": "CERT-JW-8826"},
                    "JW-007": {"metal": "Gold", "karat": 21, "grossWeight": 4.5, "netWeight": 4.2, "stoneWeight": 0.3, "makingChargePerGram": 750, "cert": "CERT-JW-8827"},
                    "JW-008": {"metal": "Gold", "karat": 22, "grossWeight": 15.2, "netWeight": 13.8, "stoneWeight": 1.4, "makingChargePerGram": 1100, "cert": "CERT-JW-8828"},
                    "JW-009": {"metal": "Gold", "karat": 18, "grossWeight": 3.9, "netWeight": 3.3, "stoneWeight": 0.6, "makingChargePerGram": 1400, "cert": "CERT-JW-8829"},
                    "JW-010": {"metal": "Gold", "karat": 22, "grossWeight": 24.5, "netWeight": 19.0, "stoneWeight": 5.5, "makingChargePerGram": 900, "cert": "CERT-JW-8830"},
                    "JW-011": {"metal": "Gold", "karat": 22, "grossWeight": 26.5, "netWeight": 26.5, "stoneWeight": 0.0, "makingChargePerGram": 750, "cert": "CERT-JW-8831"},
                    "JW-012": {"metal": "Silver", "karat": 925, "grossWeight": 22.0, "netWeight": 22.0, "stoneWeight": 0.0, "makingChargePerGram": 100},
                    "JW-013": {"metal": "Gold", "karat": 22, "grossWeight": 6.5, "netWeight": 6.0, "stoneWeight": 0.5, "makingChargePerGram": 1250, "cert": "CERT-JW-8833"},
                    "JW-014": {"metal": "Gold", "karat": 18, "grossWeight": 7.4, "netWeight": 6.1, "stoneWeight": 1.3, "makingChargePerGram": 1500, "cert": "CERT-JW-8834"},
                    "JW-015": {"metal": "Gold", "karat": 22, "grossWeight": 10.8, "netWeight": 9.5, "stoneWeight": 1.3, "makingChargePerGram": 850, "cert": "CERT-JW-8835"},
                    "JW-016": {"metal": "Gold", "karat": 22, "grossWeight": 1.4, "netWeight": 1.2, "stoneWeight": 0.2, "makingChargePerGram": 500},
                    "JW-017": {"metal": "Platinum", "karat": 950, "grossWeight": 8.6, "netWeight": 8.6, "stoneWeight": 0.0, "makingChargePerGram": 1600, "cert": "CERT-JW-8837"},
                    "JW-018": {"metal": "Gold", "karat": 22, "grossWeight": 38.5, "netWeight": 35.8, "stoneWeight": 2.7, "makingChargePerGram": 1050, "cert": "CERT-JW-8838"},
                    "JW-019": {"metal": "Gold", "karat": 18, "grossWeight": 8.8, "netWeight": 7.2, "stoneWeight": 1.6, "makingChargePerGram": 1650, "cert": "CERT-JW-8839"},
                    "JW-020": {"metal": "Gold", "karat": 22, "grossWeight": 5.0, "netWeight": 5.0, "stoneWeight": 0.0, "makingChargePerGram": 400, "cert": "CERT-JW-8840"},
                }
                jspec = j_spec_map.get(sku, {
                    "metal": "Gold", "karat": 22, "grossWeight": 5.2, "netWeight": 5.0, "stoneWeight": 0.2, "makingChargePerGram": 800, "cert": "CERT-JEWL-001"
                })
                meta = {
                    "metal": jspec["metal"],
                    "karat": jspec["karat"],
                    "purity": f"{jspec['karat']}K",
                    "gross_weight": jspec["grossWeight"],
                    "grossWeight": jspec["grossWeight"],
                    "stone_weight": jspec["stoneWeight"],
                    "stoneWeight": jspec["stoneWeight"],
                    "net_weight": jspec["netWeight"],
                    "netWeight": jspec["netWeight"],
                    "net_metal_weight": jspec["netWeight"],
                    "making_charge_type": "per_gram",
                    "making_charge_rate": jspec["makingChargePerGram"],
                    "makingChargePerGram": jspec["makingChargePerGram"],
                    "wastage_percentage": 2,
                    "default_stone_value": int(jspec["stoneWeight"] * 5000),
                    "certificate": jspec.get("cert", f"CERT-{sku}"),
                    "tag_no": f"TAG-{sku}",
                }
            elif pack == "super-shop":
                meta = dict(SUPER_SHOP_SPEC_MAP.get(sku, {"departmentCode": "GROC"}))
            if sku in SAMPLE_PRODUCT_IMAGES:
                meta["image_url"] = SAMPLE_PRODUCT_IMAGES[sku]
                meta["image"] = SAMPLE_PRODUCT_IMAGES[sku]

            p = session.exec(
                select(Product).where(Product.company_id == company.id, Product.sku == sku)
            ).first()
            prod_barcode = sku
            cost_val = None
            if pack == "super-shop" and sku in SUPER_SHOP_SPEC_MAP:
                prod_barcode = SUPER_SHOP_SPEC_MAP[sku].get("barcode", sku)
                cost_val = SUPER_SHOP_SPEC_MAP[sku].get("costPrice")
                if "wholesalePrice" in SUPER_SHOP_SPEC_MAP[sku]:
                    wholesale = SUPER_SHOP_SPEC_MAP[sku]["wholesalePrice"]
            if cost_val is None and price:
                sample_cost_map = {"FASH-001": 780.0, "FASH-002": 1150.0, "FASH-003": 1550.0, "BEEF-001": 620.0, "BEEF-002": 510.0, "GROC-001": 520.0, "PHRM-001": 7.5, "PHRM-002": 30.0, "REST-001": 210.0}
                cost_val = sample_cost_map.get(sku, round(price * 0.65, 2))

            if not p:
                p = Product(
                    company_id=company.id,
                    sku=sku,
                    barcode=prod_barcode,
                    name=name,
                    industry_pack=pack,
                    base_price=price,
                    wholesale_price=wholesale,
                    cost_price=cost_val,
                    meta_json=json.dumps(meta),
                )
                session.add(p)
                session.flush()
            else:
                p.name = name
                p.barcode = prod_barcode
                p.base_price = price
                p.wholesale_price = wholesale
                if cost_val is not None:
                    p.cost_price = cost_val
                p.meta_json = json.dumps(meta)
                session.add(p)
                session.flush()
            products.append(p)

        for p in products:
            bal = session.exec(
                select(StockBalance).where(
                    StockBalance.company_id == company.id,
                    StockBalance.product_id == p.id,
                    StockBalance.store_id == store1.id,
                )
            ).first()
            if not bal:
                session.add(
                    StockBalance(company_id=company.id, product_id=p.id, store_id=store1.id, qty_on_hand=100)
                )

        pharma = next((p for p in products if p.industry_pack == "pharmacy" and p.sku == "PHRM-001"), None)
        pharma_rx = next((p for p in products if p.sku == "PHRM-002"), None)
        if pharma and not session.exec(select(PharmaProductProfile).where(PharmaProductProfile.product_id == pharma.id)).first():
            session.add(
                PharmaProductProfile(
                    product_id=pharma.id,
                    generic_name="Paracetamol",
                    manufacturer="Square Pharma",
                    strength="500mg",
                    dosage_form="Tablet",
                    is_restricted=False,
                    rx_required=False,
                )
            )
        if pharma_rx and not session.exec(select(PharmaProductProfile).where(PharmaProductProfile.product_id == pharma_rx.id)).first():
            session.add(
                PharmaProductProfile(
                    product_id=pharma_rx.id,
                    generic_name="Amoxicillin",
                    manufacturer="Beximco",
                    strength="250mg",
                    dosage_form="Capsule",
                    is_restricted=True,
                    rx_required=True,
                )
            )
        if pharma and not session.exec(select(PharmaBatch).where(PharmaBatch.company_id == company.id, PharmaBatch.batch_no == "BATCH-001")).first():
            session.add(
                PharmaBatch(
                    company_id=company.id,
                    product_id=pharma.id,
                    batch_no="BATCH-001",
                    expiry_date=datetime.now(timezone.utc) + timedelta(days=180),
                    qty_on_hand=100,
                )
            )
        if pharma_rx and not session.exec(select(PharmaBatch).where(PharmaBatch.company_id == company.id, PharmaBatch.batch_no == "RX-BATCH-001")).first():
            session.add(
                PharmaBatch(
                    company_id=company.id,
                    product_id=pharma_rx.id,
                    batch_no="RX-BATCH-001",
                    expiry_date=datetime.now(timezone.utc) + timedelta(days=120),
                    qty_on_hand=50,
                )
            )
        if pharma and pharma_rx:
            for p, batch_qty in ((pharma, 100), (pharma_rx, 50)):
                bal = session.exec(
                    select(StockBalance).where(
                        StockBalance.company_id == company.id,
                        StockBalance.product_id == p.id,
                        StockBalance.store_id == store1.id,
                    )
                ).first()
                if bal:
                    bal.qty_on_hand = batch_qty
                    session.add(bal)

        if not session.exec(select(BeefCutType).where(BeefCutType.company_id == company.id, BeefCutType.code == "SHOULDER")).first():
            session.add(BeefCutType(company_id=company.id, code="SHOULDER", name="Shoulder"))
        if not session.exec(select(ButcherMaster).where(ButcherMaster.company_id == company.id, ButcherMaster.code == "B01")).first():
            session.add(ButcherMaster(company_id=company.id, code="B01", name="Karim"))
        batch = session.exec(select(BeefBatch).where(BeefBatch.company_id == company.id, BeefBatch.batch_code == "SL-2026-001")).first()
        if not batch:
            batch = BeefBatch(company_id=company.id, batch_code="SL-2026-001", meat_type="beef", expiry_date=datetime.now(timezone.utc) + timedelta(days=3))
            session.add(batch)
            session.flush()
            session.add(BeefWastage(company_id=company.id, batch_id=batch.id, wastage_type="trim", wastage_kg=2.5, reason="Prep trim", responsible_person="Karim"))
            session.add(
                BeefColdStorage(
                    company_id=company.id,
                    batch_id=batch.id,
                    location="Cold Room A",
                    qty_kg=45.0,
                    temp_c=-2.0,
                )
            )

        fashion = next((p for p in products if p.sku == "FASH-001"), None)
        fashion2 = next((p for p in products if p.sku == "FASH-002"), None)
        fashion3 = next((p for p in products if p.sku == "FASH-003"), None)
        if fashion and fashion2 and fashion3:
            fashion_matrix = [
                (fashion, "S", "Blue", "FASH-001-S-BLU", "FASH001SBLU", 12),
                (fashion, "M", "Blue", "FASH-001-M-BLU", "FASH001MBLU", 25),
                (fashion, "L", "Blue", "FASH-001-L-BLU", "FASH001LBLU", 18),
                (fashion, "M", "Black", "FASH-001-M-BLK", "FASH001MBLK", 20),
                (fashion, "L", "Black", "FASH-001-L-BLK", "FASH001LBLK", 15),
                (fashion2, "30", "Khaki", "FASH-002-30-KHK", "FASH00230KHK", 14),
                (fashion2, "32", "Khaki", "FASH-002-32-KHK", "FASH00232KHK", 22),
                (fashion2, "34", "Navy", "FASH-002-34-NVY", "FASH00234NVY", 10),
                (fashion3, "M", "Grey", "FASH-003-M-GRY", "FASH003MGRY", 16),
                (fashion3, "L", "Grey", "FASH-003-L-GRY", "FASH003LGRY", 12),
                (fashion3, "XL", "Black", "FASH-003-XL-BLK", "FASH003XLBLK", 8),
            ]
            for prod, size, color, code, barcode, qty in fashion_matrix:
                if not session.exec(select(FashionProductVariant).where(FashionProductVariant.sku == code)).first():
                    session.add(
                        FashionProductVariant(
                            product_id=prod.id,
                            size=size,
                            color=color,
                            sku=code,
                            barcode=barcode,
                            stock_qty=qty,
                        )
                    )
                if not session.exec(select(ProductVariant).where(ProductVariant.company_id == company.id, ProductVariant.variant_code == code)).first():
                    session.add(
                        ProductVariant(
                            company_id=company.id,
                            product_id=prod.id,
                            variant_code=code,
                            size=size,
                            color=color,
                            style=prod.sku,
                            barcode=barcode,
                            is_active=True,
                        )
                    )
        if not session.exec(select(FashionOffer).where(FashionOffer.company_id == company.id, FashionOffer.name == "Summer Clearance")).first():
            session.add(FashionOffer(company_id=company.id, name="Summer Clearance", season="Summer", discount_pct=30))

        rest = next((p for p in products if p.sku == "REST-001"), None)
        if rest:
            combo = session.exec(select(RestaurantCombo).where(RestaurantCombo.company_id == company.id, RestaurantCombo.name == "Lunch Special")).first()
            if not combo:
                combo = RestaurantCombo(company_id=company.id, name="Lunch Special", combo_price=450)
                session.add(combo)
                session.flush()
                session.add(RestaurantComboItem(combo_id=combo.id, product_id=rest.id, item_role="main"))
        if not session.exec(select(RestaurantTable).where(RestaurantTable.company_id == company.id, RestaurantTable.table_no == "T01")).first():
            session.add(RestaurantTable(company_id=company.id, store_id=store1.id, table_no="T01", capacity=4))
        if not session.exec(select(RestaurantTable).where(RestaurantTable.company_id == company.id, RestaurantTable.table_no == "T02")).first():
            session.add(RestaurantTable(company_id=company.id, store_id=store1.id, table_no="T02", capacity=6))

        op_frame = next((p for p in products if p.sku == "OP-001"), None)
        op_lens = next((p for p in products if p.sku == "OP-002"), None)
        if op_frame and not session.exec(select(OpticalFrameProfile).where(OpticalFrameProfile.company_id == company.id, OpticalFrameProfile.product_id == op_frame.id)).first():
            session.add(
                OpticalFrameProfile(
                    company_id=company.id,
                    product_id=op_frame.id,
                    frame_code="OP-001",
                    model_no="MF-BLK-54",
                    frame_type="optical",
                    frame_shape="rectangle",
                    material="metal",
                    size_eye="54",
                    size_bridge="18",
                    temple_length="140",
                    color="Black",
                    rim_type="full-rim",
                    brand_name="Pulse Optical",
                    is_active=True,
                )
            )
        if op_lens and not session.exec(select(OpticalLensProfile).where(OpticalLensProfile.company_id == company.id, OpticalLensProfile.product_id == op_lens.id)).first():
            session.add(
                OpticalLensProfile(
                    company_id=company.id,
                    product_id=op_lens.id,
                    lens_type="single_vision",
                    lens_material="CR-39",
                    refractive_index="1.56",
                    coating="anti-reflective",
                    blue_cut=True,
                    anti_reflective=True,
                    uv_protection=True,
                    brand_name="Pulse Lens",
                    supply_mode="stocked",
                    is_active=True,
                )
            )

        sg_gloves = next((p for p in products if p.sku == "SG-001"), None)
        sg_forceps = next((p for p in products if p.sku == "SG-002"), None)
        sg_cannula = next((p for p in products if p.sku == "SG-003"), None)
        if sg_gloves and not session.exec(select(SurgicalProductProfile).where(SurgicalProductProfile.company_id == company.id, SurgicalProductProfile.product_id == sg_gloves.id)).first():
            session.add(
                SurgicalProductProfile(
                    company_id=company.id,
                    product_id=sg_gloves.id,
                    device_type="consumable",
                    device_class="Class I",
                    manufacturer_name="Pulse MedSupply",
                    model_no="SG-GLV-M",
                    reference_code="REF-SG-001",
                    catalog_no="CAT-SG-001",
                    tracking_mode="batch",
                    lot_tracked=False,
                    batch_tracked=True,
                    serial_tracked=False,
                    expiry_tracked=True,
                    udi_required=False,
                    sterile_required=True,
                    sterilization_method="EO",
                    reusable=False,
                    single_use=True,
                    is_active=True,
                )
            )
        if sg_forceps and not session.exec(select(SurgicalProductProfile).where(SurgicalProductProfile.company_id == company.id, SurgicalProductProfile.product_id == sg_forceps.id)).first():
            session.add(
                SurgicalProductProfile(
                    company_id=company.id,
                    product_id=sg_forceps.id,
                    device_type="instrument",
                    device_class="Class I",
                    manufacturer_name="Pulse Instruments",
                    model_no="SG-FRC-01",
                    reference_code="REF-SG-002",
                    catalog_no="CAT-SG-002",
                    tracking_mode="serial",
                    lot_tracked=False,
                    batch_tracked=False,
                    serial_tracked=True,
                    expiry_tracked=False,
                    udi_required=True,
                    sterile_required=True,
                    sterilization_method="autoclave",
                    reusable=True,
                    single_use=False,
                    warranty_months=12,
                    is_active=True,
                )
            )
        if sg_cannula and not session.exec(select(SurgicalProductProfile).where(SurgicalProductProfile.company_id == company.id, SurgicalProductProfile.product_id == sg_cannula.id)).first():
            session.add(
                SurgicalProductProfile(
                    company_id=company.id,
                    product_id=sg_cannula.id,
                    device_type="consumable",
                    manufacturer_name="Pulse MedSupply",
                    model_no="IV-22G",
                    reference_code="REF-SG-003",
                    tracking_mode="batch",
                    batch_tracked=True,
                    serial_tracked=False,
                    expiry_tracked=True,
                    sterile_required=True,
                    sterilization_method="EO",
                    single_use=True,
                    is_active=True,
                )
            )
        if sg_gloves and not session.exec(select(SurgicalStockUnit).where(SurgicalStockUnit.company_id == company.id, SurgicalStockUnit.batch_no == "SG-BATCH-001")).first():
            session.add(
                SurgicalStockUnit(
                    company_id=company.id,
                    product_id=sg_gloves.id,
                    store_id=store1.id,
                    manufacturer_name="Pulse MedSupply",
                    batch_no="SG-BATCH-001",
                    expiry_date=datetime.now(timezone.utc) + timedelta(days=180),
                    manufacture_date=datetime.now(timezone.utc) - timedelta(days=30),
                    received_date=datetime.now(timezone.utc),
                    qty_on_hand=100,
                    status="available",
                    sterile_status="sterile",
                    sterilization_method="EO",
                )
            )
        if sg_cannula and not session.exec(select(SurgicalStockUnit).where(SurgicalStockUnit.company_id == company.id, SurgicalStockUnit.batch_no == "IV-BATCH-001")).first():
            session.add(
                SurgicalStockUnit(
                    company_id=company.id,
                    product_id=sg_cannula.id,
                    store_id=store1.id,
                    manufacturer_name="Pulse MedSupply",
                    batch_no="IV-BATCH-001",
                    expiry_date=datetime.now(timezone.utc) + timedelta(days=60),
                    received_date=datetime.now(timezone.utc),
                    qty_on_hand=50,
                    status="available",
                    sterile_status="sterile",
                    sterilization_method="EO",
                )
            )
        if sg_forceps and not session.exec(select(SurgicalStockUnit).where(SurgicalStockUnit.company_id == company.id, SurgicalStockUnit.serial_no == "SG-FRC-SN-001")).first():
            session.add(
                SurgicalStockUnit(
                    company_id=company.id,
                    product_id=sg_forceps.id,
                    store_id=store1.id,
                    manufacturer_name="Pulse Instruments",
                    serial_no="SG-FRC-SN-001",
                    udi_code="UDI-SG-FRC-001",
                    received_date=datetime.now(timezone.utc),
                    qty_on_hand=1,
                    status="available",
                    sterile_status="sterile",
                    sterilization_method="autoclave",
                )
            )
        for p, qty in ([(sg_gloves, 100), (sg_cannula, 50), (sg_forceps, 1)]):
            if p:
                bal = session.exec(
                    select(StockBalance).where(
                        StockBalance.company_id == company.id,
                        StockBalance.product_id == p.id,
                        StockBalance.store_id == store1.id,
                    )
                ).first()
                if bal:
                    bal.qty_on_hand = qty
                    session.add(bal)

        if not session.exec(select(JewelryGoldRate).where(JewelryGoldRate.company_id == company.id)).first():
            session.add(
                JewelryGoldRate(
                    company_id=company.id,
                    metal_type="Gold",
                    karat="22K",
                    purity="22K",
                    rate_per_gram=9850,
                    selling_rate=9850,
                    buying_rate=9062,
                    currency="BDT",
                    unit_basis="gram",
                    status="active",
                    effective_date=datetime.now(timezone.utc),
                )
            )

        # Seed profiles & certificates for all Jewelry products (including JW-001..JW-020 and JEWL-001)
        for j_prod in [p for p in products if p.industry_pack == "jewelry"]:
            meta_data = json.loads(j_prod.meta_json) if j_prod.meta_json else {}
            prof = session.exec(select(JewelryProductProfile).where(JewelryProductProfile.company_id == company.id, JewelryProductProfile.product_id == j_prod.id)).first()
            if not prof:
                session.add(
                    JewelryProductProfile(
                        company_id=company.id,
                        product_id=j_prod.id,
                        metal_type=meta_data.get("metal", "Gold"),
                        purity=meta_data.get("purity", "22K"),
                        karat=f"{meta_data.get('karat', 22)}K",
                        gross_weight=meta_data.get("grossWeight", 5.2),
                        stone_weight=meta_data.get("stoneWeight", 0.2),
                        net_metal_weight=meta_data.get("netWeight", 5.0),
                        making_charge_type="per_gram",
                        making_charge_rate=meta_data.get("makingChargePerGram", 800),
                        wastage_percentage=2,
                        default_stone_value=meta_data.get("default_stone_value", 1000),
                        certificate_required=True,
                        tag_no=meta_data.get("tag_no", f"TAG-{j_prod.sku}"),
                        barcode=j_prod.sku,
                    )
                )
            cert_num = meta_data.get("certificate", f"CERT-{j_prod.sku}")
            cert = session.exec(select(JewelryCertificate).where(JewelryCertificate.company_id == company.id, JewelryCertificate.cert_no == cert_num)).first()
            if not cert:
                session.add(
                    JewelryCertificate(
                        company_id=company.id,
                        product_id=j_prod.id,
                        cert_no=cert_num,
                        certificate_no=cert_num,
                        tag_no=meta_data.get("tag_no", f"TAG-{j_prod.sku}"),
                        barcode=j_prod.sku,
                        metal_type=meta_data.get("metal", "Gold"),
                        purity=meta_data.get("purity", "22K"),
                        weight_gram=meta_data.get("netWeight", 5.0),
                        gross_weight=meta_data.get("grossWeight", 5.2),
                        stone_weight=meta_data.get("stoneWeight", 0.2),
                        net_metal_weight=meta_data.get("netWeight", 5.0),
                        issue_date=datetime.now(timezone.utc),
                        status="active",
                    )
                )

        supplier_map = {}
        for code, name, phone in [("SUP-001", "Demo Meat Supplier", "01700000001"), ("SUP-002", "Fashion Wholesale Ltd", "01700000002"), ("SUP-003", "Pharma Distributors BD", "01700000003")]:
            s = session.exec(select(Supplier).where(Supplier.company_id == company.id, Supplier.code == code)).first()
            if not s:
                s = Supplier(company_id=company.id, code=code, name=name, phone=phone)
                session.add(s)
                session.flush()
            supplier_map[code] = s
        supplier1 = supplier_map.get("SUP-001")
        supplier2 = supplier_map.get("SUP-002")
        supplier3 = supplier_map.get("SUP-003")

        customers: list[Customer] = []
        for code, name, phone, email, ctype, custom_disc in [
            ("CUS-001", "Rahim Uddin", "01711110001", "rahim@example.com", "employee", 15.0),
            ("CUS-002", "Fatima Begum", "01711110002", "fatima@example.com", "family", None),
            ("CUS-003", "Karim Traders", "01711110003", "karim.traders@example.com", "friends", 10.0),
            ("CUS-004", "Nadia Islam", "01711110004", "nadia@example.com", "general", None),
            ("CUS-005", "Walk-in Guest", "01711110005", None, "general", None),
        ]:
            c = session.exec(select(Customer).where(Customer.company_id == company.id, Customer.code == code)).first()
            if not c:
                group = "contractor" if code == "CUS-003" else "retail"
                c = Customer(
                    company_id=company.id,
                    code=code,
                    name=name,
                    phone=phone,
                    email=email,
                    customer_group=group,
                    customer_type=ctype,
                    custom_discount_pct=custom_disc,
                )
                session.add(c)
                session.flush()
            customers.append(c)
        session.flush()

        coa = seed_default_chart_of_accounts(session, company.id)
        default_account_by_method = {
            "cash": coa["1011"].id, "card": coa["1012"].id, "bkash": coa["1012"].id, "nagad": coa["1012"].id,
        }
        for code, name in [("cash", "Cash"), ("card", "Card"), ("bkash", "bKash"), ("nagad", "Nagad")]:
            if not session.exec(select(PaymentMethod).where(PaymentMethod.company_id == company.id, PaymentMethod.code == code)).first():
                session.add(PaymentMethod(
                    company_id=company.id, code=code, name=name, is_active=True,
                    linked_account_id=default_account_by_method.get(code),
                ))

        if admin_user_id:
            if not session.exec(select(PosDevice).where(PosDevice.company_id == company.id, PosDevice.device_id == "DEV-SEED-01")).first():
                session.add(
                    PosDevice(
                        device_id="DEV-SEED-01",
                        device_name="Banani Counter 1 POS",
                        company_id=company.id,
                        store_id=store1.id,
                        counter_id=counters[0].id,
                        device_type="browser",
                        status="approved",
                        last_seen_at=datetime.now(timezone.utc),
                        registered_by=admin_user_id,
                    )
                )
            if not session.exec(select(PosDevice).where(PosDevice.company_id == company.id, PosDevice.device_id == "DEV-SEED-02")).first():
                session.add(
                    PosDevice(
                        device_id="DEV-SEED-02",
                        device_name="Gulshan Counter POS",
                        company_id=company.id,
                        store_id=store2.id,
                        counter_id=counters[2].id,
                        device_type="browser",
                        status="approved",
                        last_seen_at=datetime.now(timezone.utc) - timedelta(hours=2),
                        registered_by=admin_user_id,
                    )
                )
            if not session.exec(select(PosDevice).where(PosDevice.company_id == company.id, PosDevice.device_id == "DEV-SEED-03")).first():
                session.add(
                    PosDevice(
                        device_id="DEV-SEED-03",
                        device_name="Back Office Browser",
                        company_id=company.id,
                        store_id=store1.id,
                        device_type="browser",
                        status="pending",
                        registered_by=admin_user_id,
                    )
                )

        beef = next((p for p in products if p.industry_pack == "beef-shop"), None)
        po_draft = session.exec(select(PurchaseInvoice).where(PurchaseInvoice.company_id == company.id, PurchaseInvoice.invoice_number == "PO-1001")).first()
        if not po_draft and supplier1 and beef:
            po_draft = PurchaseInvoice(
                company_id=company.id,
                store_id=store1.id,
                warehouse_id=wh1.id,
                supplier_id=supplier1.id,
                invoice_number="PO-1001",
                status="DRAFT",
                subtotal=17000,
                total=17000,
                due_amount=17000,
                remarks="Weekly beef restock",
                created_by=admin_user_id,
            )
            session.add(po_draft)
            session.flush()
            session.add(
                PurchaseInvoiceLine(
                    purchase_id=po_draft.id,
                    product_id=beef.id,
                    qty=20,
                    unit_cost=850,
                    line_total=17000,
                )
            )

        po_approved = session.exec(select(PurchaseInvoice).where(PurchaseInvoice.company_id == company.id, PurchaseInvoice.invoice_number == "PO-1002")).first()
        if not po_approved and supplier2:
            po_approved = PurchaseInvoice(
                company_id=company.id,
                store_id=store1.id,
                warehouse_id=wh1.id,
                supplier_id=supplier2.id,
                invoice_number="PO-1002",
                status="APPROVED",
                subtotal=25800,
                total=25800,
                due_amount=25800,
                remarks="Fashion season intake",
                created_by=admin_user_id,
            )
            session.add(po_approved)
            session.flush()
            fashion_po_specs = [
                ("FASH-001-M-BLU", 10, 1290),
                ("FASH-001-L-BLU", 5, 1290),
                ("FASH-001-M-BLK", 5, 1290),
            ]
            fashion_po_subtotal = 0.0
            for code, qty, cost in fashion_po_specs:
                pv = session.exec(
                    select(ProductVariant).where(
                        ProductVariant.company_id == company.id,
                        ProductVariant.variant_code == code,
                    )
                ).first()
                if not pv:
                    continue
                line_total = qty * cost
                fashion_po_subtotal += line_total
                session.add(
                    PurchaseInvoiceLine(
                        purchase_id=po_approved.id,
                        product_id=pv.product_id,
                        variant_id=pv.id,
                        qty=qty,
                        unit_cost=cost,
                        line_total=line_total,
                    )
                )
            po_approved.subtotal = fashion_po_subtotal
            po_approved.total = fashion_po_subtotal
            po_approved.due_amount = fashion_po_subtotal
            session.add(po_approved)

        po_received = session.exec(select(PurchaseInvoice).where(PurchaseInvoice.company_id == company.id, PurchaseInvoice.invoice_number == "PO-1003")).first()
        if not po_received and supplier3 and pharma:
            po_received = PurchaseInvoice(
                company_id=company.id,
                store_id=store1.id,
                warehouse_id=wh1.id,
                supplier_id=supplier3.id,
                invoice_number="PO-1003",
                status="RECEIVED",
                subtotal=6000,
                total=6000,
                paid_amount=6000,
                due_amount=0,
                remarks="Pharma batch replenishment",
                created_by=admin_user_id,
            )
            session.add(po_received)
            session.flush()
            session.add(
                PurchaseInvoiceLine(
                    purchase_id=po_received.id,
                    product_id=pharma.id,
                    qty=500,
                    received_qty=500,
                    unit_cost=12,
                    line_total=6000,
                )
            )

        for p in products:
            session.add(
                StockLedger(
                    company_id=company.id,
                    product_id=p.id,
                    store_id=store1.id,
                    transaction_type="opening",
                    transaction_ref="OPENING",
                    in_qty=100,
                    qty_delta=100,
                    balance_after=100,
                    reference_type="seed",
                    note="Opening stock",
                    created_by=admin_user_id,
                )
            )

        product_by_pack = {p.industry_pack: p for p in products}
        sales_specs = [
            ("INV-001000", "grocery", "seed-tx-001", customers[0].id, "cash", 1, 650, 32, 682, 0),
            ("INV-001001", "fashion", "seed-tx-002", customers[1].id, "card", 2, 1290, 129, 2709, 1),
            ("INV-001002", "beef-shop", "seed-tx-003", customers[2].id, "cash", 3, 850, 127.5, 2677.5, 2),
            ("INV-001003", "pharmacy", "seed-tx-004", customers[3].id, "bkash", 5, 12, 3, 63, 3),
            ("INV-001004", "restaurant", "seed-tx-005", customers[4].id, "cash", 2, 320, 32, 672, 4),
            ("INV-001005", "electronics", "seed-tx-006", customers[0].id, "card", 1, 28500, 1425, 29925, 5),
        ]
        for inv_no, pack, client_tx, cust_id, tender, qty, unit, tax, total, days_ago in sales_specs:
            prod = product_by_pack[pack]
            subtotal = unit * qty
            inv = SalesInvoice(
                company_id=company.id,
                store_id=store1.id,
                counter_id=counters[0].id,
                invoice_number=inv_no,
                client_transaction_id=client_tx,
                customer_id=cust_id,
                industry_pack=pack,
                status="completed",
                subtotal=subtotal,
                tax=tax,
                total=total,
                tender=tender,
                price_mode="retail",
                cashier_id=admin_user_id,
                completed_at=datetime.now(timezone.utc) - timedelta(days=days_ago),
            )
            session.add(inv)
            session.flush()
            session.add(
                SalesInvoiceLine(
                    invoice_id=inv.id,
                    product_id=prod.id,
                    sku=prod.sku,
                    name=prod.name,
                    qty=qty,
                    unit_price=unit,
                    line_total=subtotal,
                )
            )
            session.add(
                Payment(
                    company_id=company.id,
                    invoice_id=inv.id,
                    payment_type="sale",
                    direction="in",
                    store_id=store1.id,
                    counter_id=counters[0].id,
                    cashier_id=admin_user_id,
                    method=tender,
                    amount=total,
                    reference=inv_no,
                    status="completed",
                )
            )
            balance_after = 100 - qty
            session.add(
                StockLedger(
                    company_id=company.id,
                    product_id=prod.id,
                    store_id=store1.id,
                    transaction_type="sale",
                    transaction_ref=inv_no,
                    out_qty=qty,
                    qty_delta=-qty,
                    balance_after=balance_after,
                    reference_type="sales_invoice",
                    reference_id=inv.id,
                    note=f"Sale {inv_no}",
                    created_by=admin_user_id,
                )
            )
            bal = session.exec(
                select(StockBalance).where(
                    StockBalance.company_id == company.id,
                    StockBalance.product_id == prod.id,
                    StockBalance.store_id == store1.id,
                )
            ).first()
            if bal:
                bal.qty_on_hand = balance_after
                session.add(bal)

        rest_table = session.exec(select(RestaurantTable).where(RestaurantTable.company_id == company.id, RestaurantTable.store_id == store1.id)).first()
        if not rest_table:
            rest_table = RestaurantTable(company_id=company.id, store_id=store1.id, table_no="T-01", table_name="Table 1", capacity=4)
            session.add(rest_table)
            session.flush()

        session.add(
            RestaurantKot(
                company_id=company.id,
                store_id=store1.id,
                table_id=rest_table.id,
                kot_number="KOT-1001",
                status="preparing",
            )
        )
        session.flush()
        kot = session.exec(
            select(RestaurantKot).where(RestaurantKot.company_id == company.id, RestaurantKot.kot_number == "KOT-1001")
        ).first()
        if kot:
            session.add(RestaurantKotLine(kot_id=kot.id, product_name="Chicken Biryani", qty=2, notes="Less spicy"))
            session.add(RestaurantKotLine(kot_id=kot.id, product_name="Lunch Special Combo", qty=1))

        if admin_user_id:
            if not session.exec(select(ApprovalRequest).where(ApprovalRequest.company_id == company.id, ApprovalRequest.title == "Manager discount — beef bulk order")).first():
                session.add(
                    ApprovalRequest(
                        company_id=company.id,
                        request_type="discount",
                        entity_type="sales_invoice",
                        requested_by=admin_user_id,
                        status="pending",
                        title="Manager discount — beef bulk order",
                        detail_json=json.dumps({"discount_pct": 10, "reason": "Loyalty customer"}),
                    )
                )
            if po_draft and not session.exec(select(ApprovalRequest).where(ApprovalRequest.company_id == company.id, ApprovalRequest.title == f"Approve purchase {po_draft.invoice_number}")).first():
                session.add(
                    ApprovalRequest(
                        company_id=company.id,
                        request_type="purchase",
                        entity_type="purchase_invoice",
                        entity_id=po_draft.id,
                        requested_by=admin_user_id,
                        status="pending",
                        title=f"Approve purchase {po_draft.invoice_number}",
                        detail_json=json.dumps({"total": po_draft.total}),
                    )
                )
            if beef and not session.exec(select(ApprovalRequest).where(ApprovalRequest.company_id == company.id, ApprovalRequest.title == "Stock adjustment — beef trim loss")).first():
                session.add(
                    ApprovalRequest(
                        company_id=company.id,
                        request_type="stock_adjust",
                        entity_type="product",
                        entity_id=beef.id,
                        requested_by=admin_user_id,
                        status="approved",
                        title="Stock adjustment — beef trim loss",
                        resolved_by=admin_user_id,
                        resolved_at=datetime.now(timezone.utc) - timedelta(days=1),
                    )
                )
            if not session.exec(select(Notification).where(Notification.company_id == company.id, Notification.event_type == "approval.pending")).first():
                session.add(
                    Notification(
                        company_id=company.id,
                        user_id=admin_user_id,
                        event_type="approval.pending",
                        title="Purchase approval waiting",
                        message="PO-1001 requires manager approval.",
                        link="/app/approvals",
                    )
                )
            if not session.exec(select(Notification).where(Notification.company_id == company.id, Notification.event_type == "inventory.low_stock")).first():
                session.add(
                    Notification(
                        company_id=company.id,
                        user_id=admin_user_id,
                        event_type="inventory.low_stock",
                        title="Low stock alert",
                        message="Paracetamol 500mg is below reorder level.",
                        link="/app/inventory",
                    )
                )

        if not session.exec(select(SubscriptionInvoice).where(SubscriptionInvoice.company_id == company.id, SubscriptionInvoice.invoice_number == "SUB-2026-001")).first():
            session.add(
                SubscriptionInvoice(
                    company_id=company.id,
                    invoice_number="SUB-2026-001",
                    amount=19900,
                    status="paid",
                    due_date=datetime.now(timezone.utc) - timedelta(days=15),
                )
            )

        if admin_user_id:
            for action, entity, days_ago in [
                ("seed_demo", "company", 7),
                ("login", "user", 3),
                ("product_update", "product", 2),
                ("purchase_create", "purchase_invoice", 1),
                ("sale_complete", "sales_invoice", 0),
            ]:
                if not session.exec(select(AuditLog).where(AuditLog.company_id == company.id, AuditLog.action == action)).first():
                    session.add(
                        AuditLog(
                            company_id=company.id,
                            user_id=admin_user_id,
                            store_id=store1.id,
                            action=action,
                            entity_type=entity,
                            entity_id=company.id,
                            detail_json=json.dumps({"note": f"Demo audit — {action}"}),
                            created_at=datetime.now(timezone.utc) - timedelta(days=days_ago),
                        )
                    )
        elec = next((p for p in products if p.industry_pack == "electronics"), None)
        if elec and not session.exec(select(ElectronicsSerialStock).where(ElectronicsSerialStock.company_id == company.id, ElectronicsSerialStock.serial_imei == "SN12345678901234")).first():
            session.add(
                ElectronicsSerialStock(
                    company_id=company.id,
                    product_id=elec.id,
                    store_id=store1.id,
                    serial_imei="SN12345678901234",
                    imei_no="356938035643809",
                    status="available",
                )
            )
        mob = next((p for p in products if p.sku == "MOB-001"), None)
        mob_acc = next((p for p in products if p.sku == "MOB-ACC-001"), None)
        if mob and not session.exec(select(MobileProductProfile).where(MobileProductProfile.company_id == company.id, MobileProductProfile.product_id == mob.id)).first():
            session.add(
                MobileProductProfile(
                    company_id=company.id,
                    product_id=mob.id,
                    brand="Samsung",
                    model_name="Galaxy A15",
                    model_code="SM-A156",
                    device_type="smartphone",
                    operating_system="Android",
                    network_type="5G",
                    sim_type="nano",
                    dual_sim=True,
                    esim_supported=False,
                    warranty_months=12,
                    imei_required=True,
                    dual_imei=True,
                    serial_required=False,
                    is_active=True,
                )
            )
        if mob_acc and not session.exec(select(MobileProductProfile).where(MobileProductProfile.company_id == company.id, MobileProductProfile.product_id == mob_acc.id)).first():
            session.add(
                MobileProductProfile(
                    company_id=company.id,
                    product_id=mob_acc.id,
                    brand="Pulse",
                    model_name="Type-C Fast Charger 25W",
                    device_type="accessory",
                    warranty_months=6,
                    imei_required=False,
                    dual_imei=False,
                    serial_required=False,
                    is_active=True,
                )
            )
        if mob and not session.exec(select(ProductVariant).where(ProductVariant.company_id == company.id, ProductVariant.variant_code == "MOB-001-8-256-BLK")).first():
            session.add(
                ProductVariant(
                    company_id=company.id,
                    product_id=mob.id,
                    variant_code="MOB-001-8-256-BLK",
                    barcode="MOB-001-8-256-BLK",
                    color="Black",
                    model="Galaxy A15",
                    attributes_json=json.dumps({"ram": "8 GB", "storage": "256 GB", "region": "Global"}),
                    is_active=True,
                )
            )
        if mob and not session.exec(select(ElectronicsSerialStock).where(ElectronicsSerialStock.company_id == company.id, ElectronicsSerialStock.serial_imei == "860123456789012")).first():
            session.add(
                ElectronicsSerialStock(
                    company_id=company.id,
                    product_id=mob.id,
                    store_id=store1.id,
                    serial_imei="860123456789012",
                    imei_no="860123456789012",
                    imei_2="860123456789020",
                    condition="new",
                    activation_status="not_activated",
                    status="available",
                    cost_price=21000,
                )
            )
        if elec and not session.exec(select(ElectronicsRma).where(ElectronicsRma.company_id == company.id, ElectronicsRma.rma_no == "RMA-000001")).first():
            session.add(
                ElectronicsRma(
                    company_id=company.id,
                    rma_no="RMA-000001",
                    customer_name="Demo Customer",
                    product_id=elec.id,
                    product_name=elec.name,
                    serial_imei="SN99999999999999",
                    warranty_status="in_warranty",
                    return_reason="Screen defect",
                    problem_description="Screen defect",
                    action_type="replacement",
                    status="received",
                )
            )

        salon_hc = next(p for p in products if p.sku == "SALON-HC")
        salon_fc = next(p for p in products if p.sku == "SALON-FC")
        _salon_sh = next(p for p in products if p.sku == "SALON-SH")  # noqa: F841 — retail stock via product loop
        svc_hc = SalonService(
            company_id=company.id,
            service_code="HC-CLASSIC",
            service_name="Haircut · Classic",
            category="Hair",
            default_duration_minutes=30,
            base_price=350,
            requires_staff=True,
            requires_resource=True,
            commission_type="percentage",
            commission_rate=20,
            product_id=salon_hc.id,
            is_active=True,
        )
        svc_fc = SalonService(
            company_id=company.id,
            service_code="FC-BASIC",
            service_name="Facial · Basic",
            category="Facial",
            default_duration_minutes=45,
            base_price=800,
            requires_staff=True,
            requires_resource=True,
            commission_type="percentage",
            commission_rate=25,
            product_id=salon_fc.id,
            is_active=True,
        )
        session.add(svc_hc)
        session.add(svc_fc)
        session.flush()
        stylist = SalonStaffProfile(
            company_id=company.id,
            user_id=admin_user_id,
            display_name="Rina",
            staff_code="STY-01",
            specialties_json=json.dumps(["Hair", "Facial"]),
            appointment_enabled=True,
            commission_enabled=True,
            default_commission_type="percentage",
            default_commission_rate=15,
            is_active=True,
        )
        session.add(stylist)
        session.flush()
        session.add(SalonStaffService(company_id=company.id, staff_id=stylist.id, service_id=svc_hc.id, is_active=True))
        session.add(SalonStaffService(company_id=company.id, staff_id=stylist.id, service_id=svc_fc.id, is_active=True))
        session.add(
            SalonResource(
                company_id=company.id,
                store_id=store1.id,
                resource_code="CHAIR-01",
                resource_name="Styling Chair 1",
                resource_type="styling_chair",
                is_active=True,
            )
        )
        session.add(
            SalonResource(
                company_id=company.id,
                store_id=store1.id,
                resource_code="ROOM-01",
                resource_name="Facial Room 1",
                resource_type="treatment_room",
                is_active=True,
            )
        )
        # Ensure retail shampoo has stock (already seeded at 100 via loop)

        # --- Hardware seed ---
        u_piece = Unit(company_id=company.id, code="PCS", name="Pieces", is_active=True)
        u_box = Unit(company_id=company.id, code="BOX", name="Box", is_active=True)
        u_carton = Unit(company_id=company.id, code="CTN", name="Carton", is_active=True)
        u_meter = Unit(company_id=company.id, code="M", name="Meters", is_active=True)
        u_coil = Unit(company_id=company.id, code="COIL", name="Coil", is_active=True)
        u_liter = Unit(company_id=company.id, code="L", name="Liters", is_active=True)
        u_can = Unit(company_id=company.id, code="CAN", name="Can", is_active=True)
        for u in (u_piece, u_box, u_carton, u_meter, u_coil, u_liter, u_can):
            session.add(u)
        session.flush()

        brand_rfl = BrandMaster(company_id=company.id, code="RFL", name="RFL", is_active=True)
        brand_brb = BrandMaster(company_id=company.id, code="BRB", name="BRB Cable", is_active=True)
        brand_berger = BrandMaster(company_id=company.id, code="BERGER", name="Berger", is_active=True)
        session.add(brand_rfl)
        session.add(brand_brb)
        session.add(brand_berger)
        session.flush()

        hw_screw = next(p for p in products if p.sku == "HW-SCREW")
        hw_cable = next(p for p in products if p.sku == "HW-CABLE")
        hw_paint = next(p for p in products if p.sku == "HW-PAINT")
        hw_screw.brand_id = brand_rfl.id
        hw_screw.unit_id = u_piece.id
        hw_cable.brand_id = brand_brb.id
        hw_cable.unit_id = u_meter.id
        hw_paint.brand_id = brand_berger.id
        hw_paint.unit_id = u_liter.id
        session.add(hw_screw)
        session.add(hw_cable)
        session.add(hw_paint)

        session.add(
            HardwareProductProfile(
                company_id=company.id,
                product_id=hw_screw.id,
                brand_id=brand_rfl.id,
                manufacturer_name="RFL Plastics",
                model_no="SCR-1.5",
                material="Steel",
                grade="A",
                specification_json=json.dumps({"length": "1.5 inch", "thread": "standard"}),
                measurement_mode="quantity",
                base_uom_id=u_piece.id,
                default_sales_uom_id=u_piece.id,
                default_purchase_uom_id=u_box.id,
                fractional_qty_allowed=False,
                cut_to_length_allowed=False,
                contractor_pricing_enabled=True,
                bulk_pricing_enabled=True,
                is_active=True,
            )
        )
        session.add(
            HardwareProductProfile(
                company_id=company.id,
                product_id=hw_cable.id,
                brand_id=brand_brb.id,
                manufacturer_name="BRB Cable Industries",
                model_no="CU-2.5",
                material="Copper",
                specification_json=json.dumps({"cross_section": "2.5mm"}),
                measurement_mode="length",
                base_uom_id=u_meter.id,
                default_sales_uom_id=u_meter.id,
                default_purchase_uom_id=u_coil.id,
                fractional_qty_allowed=True,
                cut_to_length_allowed=True,
                minimum_sale_qty=0.5,
                sale_increment=0.5,
                contractor_pricing_enabled=True,
                bulk_pricing_enabled=True,
                is_active=True,
            )
        )
        session.add(
            HardwareProductProfile(
                company_id=company.id,
                product_id=hw_paint.id,
                brand_id=brand_berger.id,
                manufacturer_name="Berger Paints",
                model_no="EN-WHT-5",
                measurement_mode="volume",
                base_uom_id=u_liter.id,
                default_sales_uom_id=u_liter.id,
                default_purchase_uom_id=u_can.id,
                fractional_qty_allowed=True,
                cut_to_length_allowed=False,
                warranty_months=12,
                contractor_pricing_enabled=True,
                bulk_pricing_enabled=True,
                is_active=True,
            )
        )

        # Screws: 1 box = 100 pcs, 1 carton = 2000 pcs
        session.add(
            ProductUomConversion(
                company_id=company.id,
                product_id=hw_screw.id,
                from_uom_id=u_box.id,
                to_uom_id=u_piece.id,
                conversion_factor=100,
                purchase_enabled=True,
                sales_enabled=True,
                is_default=True,
                is_active=True,
            )
        )
        session.add(
            ProductUomConversion(
                company_id=company.id,
                product_id=hw_screw.id,
                from_uom_id=u_carton.id,
                to_uom_id=u_piece.id,
                conversion_factor=2000,
                purchase_enabled=True,
                sales_enabled=True,
                is_active=True,
            )
        )
        # Cable: 1 coil = 100 m
        session.add(
            ProductUomConversion(
                company_id=company.id,
                product_id=hw_cable.id,
                from_uom_id=u_coil.id,
                to_uom_id=u_meter.id,
                conversion_factor=100,
                purchase_enabled=True,
                sales_enabled=True,
                is_default=True,
                is_active=True,
            )
        )
        # Paint: 1 can = 5 L
        session.add(
            ProductUomConversion(
                company_id=company.id,
                product_id=hw_paint.id,
                from_uom_id=u_can.id,
                to_uom_id=u_liter.id,
                conversion_factor=5,
                purchase_enabled=True,
                sales_enabled=True,
                is_default=True,
                is_active=True,
            )
        )

        bc_piece = ProductBarcode(
            company_id=company.id,
            product_id=hw_screw.id,
            barcode="HWSCREWPCS",
            uom_id=u_piece.id,
            packaging_qty=1,
            is_primary=True,
            is_active=True,
        )
        bc_box = ProductBarcode(
            company_id=company.id,
            product_id=hw_screw.id,
            barcode="HWSCREWBOX",
            uom_id=u_box.id,
            packaging_qty=100,
            is_primary=False,
            is_active=True,
        )
        session.add(bc_piece)
        session.add(bc_box)
        session.add(
            ProductBarcode(
                company_id=company.id,
                product_id=hw_cable.id,
                barcode="HWCABLEM",
                uom_id=u_meter.id,
                packaging_qty=1,
                is_primary=True,
                is_active=True,
            )
        )

        # Boost screw stock to support box sales (base pieces)
        screw_bal = session.exec(
            select(StockBalance).where(
                StockBalance.company_id == company.id,
                StockBalance.product_id == hw_screw.id,
                StockBalance.store_id == store1.id,
            )
        ).first()
        if screw_bal:
            screw_bal.qty_on_hand = 5000
            session.add(screw_bal)
        cable_bal = session.exec(
            select(StockBalance).where(
                StockBalance.company_id == company.id,
                StockBalance.product_id == hw_cable.id,
                StockBalance.store_id == store1.id,
            )
        ).first()
        if cable_bal:
            cable_bal.qty_on_hand = 1000
            session.add(cable_bal)

        contractor = next(c for c in customers if c.code == "CUS-003")
        session.add(
            HardwareCustomerPrice(
                company_id=company.id,
                customer_id=contractor.id,
                product_id=hw_screw.id,
                uom_id=u_box.id,
                unit_price=220,
                minimum_qty=1,
                is_active=True,
            )
        )
        session.add(
            HardwareBulkPriceTier(
                company_id=company.id,
                product_id=hw_screw.id,
                uom_id=u_piece.id,
                min_qty=10,
                max_qty=49,
                unit_price=2.3,
                is_active=True,
            )
        )
        session.add(
            HardwareBulkPriceTier(
                company_id=company.id,
                product_id=hw_screw.id,
                uom_id=u_piece.id,
                min_qty=50,
                max_qty=None,
                unit_price=2.0,
                is_active=True,
            )
        )

        bm_cement = next(p for p in products if p.sku == "BM-CEMENT")
        bm_rod = next(p for p in products if p.sku == "BM-ROD")
        bm_sand = next(p for p in products if p.sku == "BM-SAND")
        u_kg = Unit(company_id=company.id, code="KG", name="Kilograms", is_active=True)
        u_bag = Unit(company_id=company.id, code="BAG", name="Bag", is_active=True)
        u_cft = Unit(company_id=company.id, code="CFT", name="Cubic Feet", is_active=True)
        u_ton = Unit(company_id=company.id, code="TON", name="Ton", is_active=True)
        for u in (u_kg, u_bag, u_cft, u_ton):
            session.add(u)
        session.flush()

        bm_cement.unit_id = u_kg.id
        bm_rod.unit_id = u_piece.id
        bm_sand.unit_id = u_cft.id
        session.add(bm_cement)
        session.add(bm_rod)
        session.add(bm_sand)

        session.add(
            BuildingMaterialProfile(
                company_id=company.id,
                product_id=bm_cement.id,
                material_type="cement",
                grade="53 Grade",
                specification_json=json.dumps({"brand": "Crown", "weight_per_bag_kg": 50}),
                measurement_mode="weight",
                base_uom_id=u_kg.id,
                default_sales_uom_id=u_bag.id,
                default_purchase_uom_id=u_bag.id,
                fractional_qty_allowed=False,
                minimum_sale_qty=1,
                sale_increment=1,
                contractor_pricing_enabled=True,
                bulk_pricing_enabled=True,
                is_active=True,
            )
        )
        session.add(
            BuildingMaterialProfile(
                company_id=company.id,
                product_id=bm_rod.id,
                material_type="rod",
                grade="60 Grade",
                specification_json=json.dumps({"diameter_mm": 12, "length_ft": 40}),
                measurement_mode="quantity",
                base_uom_id=u_piece.id,
                default_sales_uom_id=u_piece.id,
                default_purchase_uom_id=u_piece.id,
                fractional_qty_allowed=False,
                minimum_sale_qty=1,
                sale_increment=1,
                contractor_pricing_enabled=True,
                bulk_pricing_enabled=True,
                is_active=True,
            )
        )
        session.add(
            BuildingMaterialProfile(
                company_id=company.id,
                product_id=bm_sand.id,
                material_type="sand",
                specification_json=json.dumps({"type": "construction", "moisture": "dry"}),
                measurement_mode="volume",
                base_uom_id=u_cft.id,
                default_sales_uom_id=u_cft.id,
                default_purchase_uom_id=u_cft.id,
                fractional_qty_allowed=True,
                minimum_sale_qty=1,
                sale_increment=0.5,
                contractor_pricing_enabled=True,
                bulk_pricing_enabled=True,
                is_active=True,
            )
        )
        session.add(
            ProductUomConversion(
                company_id=company.id,
                product_id=bm_cement.id,
                from_uom_id=u_bag.id,
                to_uom_id=u_kg.id,
                conversion_factor=50,
                purchase_enabled=True,
                sales_enabled=True,
                is_default=True,
                is_active=True,
            )
        )
        session.add(
            HardwareCustomerPrice(
                company_id=company.id,
                customer_id=contractor.id,
                product_id=bm_cement.id,
                uom_id=u_bag.id,
                unit_price=500,
                minimum_qty=10,
                is_active=True,
            )
        )
        session.add(
            BuildingProjectSite(
                company_id=company.id,
                customer_id=contractor.id,
                site_code="SITE-001",
                site_name="Gulshan Tower Project",
                address="Plot 14, North Avenue, Gulshan-2, Dhaka",
                contact_phone="01711110003",
                district="Dhaka",
                thana="Gulshan",
                is_active=True,
            )
        )
        session.add(
            BuildingProjectSite(
                company_id=company.id,
                customer_id=contractor.id,
                site_code="SITE-002",
                site_name="Banani Plaza Extension",
                address="Road 11, Banani, Dhaka",
                contact_phone="01711110003",
                district="Dhaka",
                thana="Banani",
                is_active=True,
            )
        )

        cement_bal = session.exec(
            select(StockBalance).where(
                StockBalance.company_id == company.id,
                StockBalance.product_id == bm_cement.id,
                StockBalance.store_id == store1.id,
            )
        ).first()
        if cement_bal:
            cement_bal.qty_on_hand = 50000
            session.add(cement_bal)
        rod_bal = session.exec(
            select(StockBalance).where(
                StockBalance.company_id == company.id,
                StockBalance.product_id == bm_rod.id,
                StockBalance.store_id == store1.id,
            )
        ).first()
        if rod_bal:
            rod_bal.qty_on_hand = 2000
            session.add(rod_bal)
        sand_bal = session.exec(
            select(StockBalance).where(
                StockBalance.company_id == company.id,
                StockBalance.product_id == bm_sand.id,
                StockBalance.store_id == store1.id,
            )
        ).first()
        if sand_bal:
            sand_bal.qty_on_hand = 5000
            session.add(sand_bal)

        # --- Bookstore seed ---
        pub_nctb = BookPublisher(
            company_id=company.id,
            publisher_code="NCTB",
            publisher_name="NCTB",
            contact_person="NCTB Desk",
            is_active=True,
        )
        pub_other = BookPublisher(
            company_id=company.id,
            publisher_code="OTHER-PUB",
            publisher_name="অন্য প্রকাশনী",
            is_active=True,
        )
        session.add(pub_nctb)
        session.add(pub_other)
        session.flush()

        author_nctb = BookAuthor(
            company_id=company.id,
            author_name="NCTB Author",
            sort_name="NCTB Author",
            country="BD",
            is_active=True,
        )
        author_humayun = BookAuthor(
            company_id=company.id,
            author_name="হুমায়ূন আহমেদ",
            sort_name="Ahmed, Humayun",
            country="BD",
            is_active=True,
        )
        session.add(author_nctb)
        session.add(author_humayun)
        session.flush()

        bk_phy = next(p for p in products if p.sku == "BK-PHY10")
        bk_math = next(p for p in products if p.sku == "BK-MATH12")
        bk_novel = next(p for p in products if p.sku == "BK-NOVEL")

        # Structurally valid ISBN-13 check digits (not registration claims)
        isbn_phy13, isbn_phy10 = "9780306406157", "0306406152"
        isbn_math13 = "9780134685991"
        isbn_novel13 = "9780141439518"

        session.add(
            BookProductProfile(
                company_id=company.id,
                product_id=bk_phy.id,
                isbn_10=isbn_phy10,
                isbn_13=isbn_phy13,
                title="Physics · Class 10 NCTB",
                publisher_id=pub_nctb.id,
                language="Bangla",
                subject="Physics",
                academic_level="Class 10",
                curriculum_code="NCTB",
                binding_type="paperback",
                publication_year=2026,
                is_active=True,
            )
        )
        session.add(
            BookProductProfile(
                company_id=company.id,
                product_id=bk_math.id,
                isbn_13=isbn_math13,
                title="Higher Math · Class 12",
                publisher_id=pub_nctb.id,
                language="Bangla",
                subject="Mathematics",
                academic_level="Class 12",
                curriculum_code="NCTB",
                binding_type="paperback",
                publication_year=2026,
                is_active=True,
            )
        )
        session.add(
            BookProductProfile(
                company_id=company.id,
                product_id=bk_novel.id,
                isbn_13=isbn_novel13,
                title="দোজখের ওম",
                publisher_id=pub_other.id,
                language="Bangla",
                subject="Fiction",
                binding_type="paperback",
                is_active=True,
            )
        )
        session.add(
            BookProductAuthor(
                company_id=company.id,
                product_id=bk_phy.id,
                author_id=author_nctb.id,
                author_order=1,
                role="author",
            )
        )
        session.add(
            BookProductAuthor(
                company_id=company.id,
                product_id=bk_math.id,
                author_id=author_nctb.id,
                author_order=1,
                role="author",
            )
        )
        session.add(
            BookProductAuthor(
                company_id=company.id,
                product_id=bk_novel.id,
                author_id=author_humayun.id,
                author_order=1,
                role="author",
            )
        )
        for product, isbn in (
            (bk_phy, isbn_phy13),
            (bk_math, isbn_math13),
            (bk_novel, isbn_novel13),
        ):
            session.add(
                ProductBarcode(
                    company_id=company.id,
                    product_id=product.id,
                    barcode=isbn,
                    barcode_type="ISBN13",
                    is_primary=True,
                    is_active=True,
                )
            )
        session.add(
            ProductBarcode(
                company_id=company.id,
                product_id=bk_phy.id,
                barcode=isbn_phy10,
                barcode_type="ISBN10",
                is_primary=False,
                is_active=True,
            )
        )

        acad_list = BookAcademicList(
            company_id=company.id,
            list_code="NCTB-C10-2026",
            list_name="Class 10 NCTB 2026",
            institution_name="NCTB",
            school_name="Demo High School",
            curriculum="NCTB",
            board="Dhaka",
            class_or_grade="10",
            academic_year="2026",
            language_version="Bangla",
            status="active",
            notes="Seed academic list",
        )
        session.add(acad_list)
        session.flush()
        session.add(
            BookAcademicListItem(
                list_id=acad_list.id,
                product_id=bk_phy.id,
                sequence_no=1,
                required_flag=True,
                recommended_qty=1,
            )
        )
        session.add(
            BookAcademicListItem(
                list_id=acad_list.id,
                product_id=bk_math.id,
                sequence_no=2,
                required_flag=True,
                recommended_qty=1,
            )
        )

        # --- Stationery seed ---
        u_pcs = session.exec(
            select(Unit).where(Unit.company_id == company.id, Unit.code == "PCS")
        ).first()
        u_box_st = session.exec(
            select(Unit).where(Unit.company_id == company.id, Unit.code == "BOX")
        ).first()
        u_doz = session.exec(
            select(Unit).where(Unit.company_id == company.id, Unit.code == "DOZ")
        ).first()
        if not u_pcs:
            u_pcs = Unit(company_id=company.id, code="PCS", name="Pieces", is_active=True)
            session.add(u_pcs)
        if not u_box_st:
            u_box_st = Unit(company_id=company.id, code="BOX", name="Box", is_active=True)
            session.add(u_box_st)
        if not u_doz:
            u_doz = Unit(company_id=company.id, code="DOZ", name="Dozen", is_active=True)
            session.add(u_doz)
        session.flush()

        def _brand(code: str, name: str) -> BrandMaster:
            existing_b = session.exec(
                select(BrandMaster).where(BrandMaster.company_id == company.id, BrandMaster.code == code)
            ).first()
            if existing_b:
                return existing_b
            b = BrandMaster(company_id=company.id, code=code, name=name, is_active=True)
            session.add(b)
            session.flush()
            return b

        brand_matador = _brand("MATADOR", "Matador")
        brand_fresh = _brand("FRESH", "Fresh")
        brand_double_a = _brand("DOUBLE-A", "Double A")

        st_pen = next(p for p in products if p.sku == "ST-PEN")
        st_khata = next(p for p in products if p.sku == "ST-KHATA")
        st_a4 = next(p for p in products if p.sku == "ST-A4")
        st_pen.brand_id = brand_matador.id
        st_pen.unit_id = u_pcs.id
        st_khata.brand_id = brand_fresh.id
        st_khata.unit_id = u_pcs.id
        st_a4.brand_id = brand_double_a.id
        st_a4.unit_id = u_pcs.id
        session.add(st_pen)
        session.add(st_khata)
        session.add(st_a4)

        session.add(
            StationeryProductProfile(
                company_id=company.id,
                product_id=st_pen.id,
                stationery_type="pen",
                brand_id=brand_matador.id,
                manufacturer_name="Matador Ballpoint Pen Industries",
                model_no="Hi-Speed",
                color="Blue",
                tip_size="0.7mm",
                ink_color="Blue",
                material="Plastic",
                base_uom_id=u_pcs.id,
                default_sales_uom_id=u_pcs.id,
                default_purchase_uom_id=u_box_st.id,
                fractional_qty_allowed=False,
                school_list_eligible=True,
                wholesale_enabled=True,
                is_active=True,
            )
        )
        session.add(
            StationeryProductProfile(
                company_id=company.id,
                product_id=st_khata.id,
                stationery_type="khata",
                brand_id=brand_fresh.id,
                manufacturer_name="Fresh Paper Mills",
                model_no="EX-80",
                paper_size="A4",
                page_count=80,
                paper_gsm=60,
                ruling_type="single",
                base_uom_id=u_pcs.id,
                default_sales_uom_id=u_pcs.id,
                default_purchase_uom_id=u_pcs.id,
                fractional_qty_allowed=False,
                school_list_eligible=True,
                wholesale_enabled=True,
                is_active=True,
            )
        )
        session.add(
            StationeryProductProfile(
                company_id=company.id,
                product_id=st_a4.id,
                stationery_type="paper",
                brand_id=brand_double_a.id,
                manufacturer_name="Double A",
                model_no="A4-80",
                paper_size="A4",
                paper_gsm=80,
                base_uom_id=u_pcs.id,
                default_sales_uom_id=u_pcs.id,
                default_purchase_uom_id=u_box_st.id,
                fractional_qty_allowed=False,
                school_list_eligible=False,
                wholesale_enabled=True,
                is_active=True,
            )
        )

        # Pen: 1 dozen = 12 pcs, 1 box = 50 pcs
        session.add(
            ProductUomConversion(
                company_id=company.id,
                product_id=st_pen.id,
                from_uom_id=u_doz.id,
                to_uom_id=u_pcs.id,
                conversion_factor=12,
                purchase_enabled=True,
                sales_enabled=True,
                is_active=True,
            )
        )
        session.add(
            ProductUomConversion(
                company_id=company.id,
                product_id=st_pen.id,
                from_uom_id=u_box_st.id,
                to_uom_id=u_pcs.id,
                conversion_factor=50,
                purchase_enabled=True,
                sales_enabled=True,
                is_default=True,
                is_active=True,
            )
        )
        # A4 ream/box: 1 box = 500 sheets
        session.add(
            ProductUomConversion(
                company_id=company.id,
                product_id=st_a4.id,
                from_uom_id=u_box_st.id,
                to_uom_id=u_pcs.id,
                conversion_factor=500,
                purchase_enabled=True,
                sales_enabled=True,
                is_default=True,
                is_active=True,
            )
        )

        session.add(
            ProductBarcode(
                company_id=company.id,
                product_id=st_pen.id,
                barcode="STPENPCS",
                uom_id=u_pcs.id,
                packaging_qty=1,
                is_primary=True,
                is_active=True,
            )
        )
        session.add(
            ProductBarcode(
                company_id=company.id,
                product_id=st_pen.id,
                barcode="STPENBOX",
                uom_id=u_box_st.id,
                packaging_qty=50,
                is_primary=False,
                is_active=True,
            )
        )

        for sku_prod, qty in ((st_pen, 2000), (st_khata, 500), (st_a4, 3000)):
            bal = session.exec(
                select(StockBalance).where(
                    StockBalance.company_id == company.id,
                    StockBalance.product_id == sku_prod.id,
                    StockBalance.store_id == store1.id,
                )
            ).first()
            if bal:
                bal.qty_on_hand = qty
                session.add(bal)

        dealer = next((c for c in customers if (c.customer_group or "").lower() == "dealer"), None)
        if dealer is None:
            # Reuse contractor customer for optional stationery dealer pricing (group already contractor/dealer-like)
            dealer = next((c for c in customers if c.code == "CUS-003"), None)
        if dealer:
            session.add(
                HardwareCustomerPrice(
                    company_id=company.id,
                    customer_id=dealer.id,
                    product_id=st_pen.id,
                    uom_id=u_box_st.id,
                    unit_price=550,
                    minimum_qty=1,
                    is_active=True,
                )
            )
        session.add(
            HardwareBulkPriceTier(
                company_id=company.id,
                product_id=st_pen.id,
                uom_id=u_pcs.id,
                min_qty=24,
                max_qty=None,
                unit_price=12.5,
                is_active=True,
            )
        )

        school_list = StationerySchoolList(
            company_id=company.id,
            list_code="CLASS6-SUPPLY-2026",
            list_name="Class 6 Supply 2026",
            institution_name="Demo Academy",
            school_name="Demo Academy",
            curriculum="NCTB",
            board="Dhaka",
            class_or_grade="6",
            academic_year="2026",
            language_version="Bangla",
            status="active",
            notes="Seed stationery school list",
        )
        session.add(school_list)
        session.flush()
        session.add(
            StationerySchoolListItem(
                list_id=school_list.id,
                product_id=st_pen.id,
                sequence_no=1,
                required_flag=True,
                recommended_qty=12,
                sales_uom_id=u_pcs.id,
            )
        )
        session.add(
            StationerySchoolListItem(
                list_id=school_list.id,
                product_id=st_khata.id,
                sequence_no=2,
                required_flag=True,
                recommended_qty=5,
                sales_uom_id=u_pcs.id,
            )
        )

        # --- Cosmetics vertical seed ---
        brand_unilever = _brand("UNILEVER", "Unilever")
        brand_marico = _brand("MARICO", "Marico")
        cos_lip = next(p for p in products if p.sku == "COS-LIP")
        cos_found = next(p for p in products if p.sku == "COS-FOUND")
        cos_cream = next(p for p in products if p.sku == "COS-CREAM")
        cos_lip.brand_id = brand_unilever.id
        cos_found.brand_id = brand_unilever.id
        cos_cream.brand_id = brand_marico.id
        session.add(cos_lip)
        session.add(cos_found)
        session.add(cos_cream)

        session.add(
            CosmeticsProductProfile(
                company_id=company.id,
                product_id=cos_lip.id,
                brand_id=brand_unilever.id,
                product_type="lipstick",
                product_category="color",
                finish="matte",
                shade_family="red",
                size_value=3.5,
                size_uom="g",
                batch_tracked=True,
                expiry_tracked=True,
                tester_allowed=True,
                sample_allowed=False,
                near_expiry_warning_days=90,
                manufacturer_name="Unilever BD",
                country_of_origin="BD",
                is_active=True,
            )
        )
        session.add(
            CosmeticsProductProfile(
                company_id=company.id,
                product_id=cos_found.id,
                brand_id=brand_unilever.id,
                product_type="foundation",
                product_category="color",
                finish="natural",
                shade_family="beige",
                size_value=30,
                size_uom="ml",
                batch_tracked=True,
                expiry_tracked=True,
                tester_allowed=True,
                near_expiry_warning_days=90,
                manufacturer_name="Unilever BD",
                is_active=True,
            )
        )
        session.add(
            CosmeticsProductProfile(
                company_id=company.id,
                product_id=cos_cream.id,
                brand_id=brand_marico.id,
                product_type="skincare",
                product_category="skincare",
                finish=None,
                shade_family=None,
                size_value=50,
                size_uom="g",
                batch_tracked=True,
                expiry_tracked=True,
                tester_allowed=False,
                near_expiry_warning_days=90,
                period_after_opening_months=12,
                manufacturer_name="Marico",
                is_active=True,
            )
        )

        shade_101 = ProductVariant(
            company_id=company.id,
            product_id=cos_found.id,
            variant_code="101",
            color="101 Natural Ivory",
            size="30ml",
            barcode="COSFOUND101",
            is_active=True,
        )
        shade_102 = ProductVariant(
            company_id=company.id,
            product_id=cos_found.id,
            variant_code="102",
            color="102 Classic Beige",
            size="30ml",
            barcode="COSFOUND102",
            is_active=True,
        )
        session.add(shade_101)
        session.add(shade_102)
        session.flush()

        session.add(
            ProductBarcode(
                company_id=company.id,
                product_id=cos_lip.id,
                barcode="COSLIP001",
                barcode_type="EAN13",
                is_primary=True,
                is_active=True,
            )
        )
        session.add(
            ProductBarcode(
                company_id=company.id,
                product_id=cos_found.id,
                variant_id=shade_101.id,
                barcode="COSFOUND101",
                barcode_type="EAN13",
                is_primary=True,
                is_active=True,
            )
        )
        session.add(
            ProductBarcode(
                company_id=company.id,
                product_id=cos_found.id,
                variant_id=shade_102.id,
                barcode="COSFOUND102",
                barcode_type="EAN13",
                is_primary=False,
                is_active=True,
            )
        )
        session.add(
            ProductBarcode(
                company_id=company.id,
                product_id=cos_cream.id,
                barcode="COSCREAM001",
                barcode_type="EAN13",
                is_primary=True,
                is_active=True,
            )
        )

        # Batches: create at qty 0 then post opening movements so StockBalance + batch reconcile
        from app.inventory.constants import OPENING
        from app.services.inventory_service import record_stock_movement

        now = datetime.now(timezone.utc)
        lip_batches = [
            ("COS-LIP-VALID", now + timedelta(days=200), 40),
            ("COS-LIP-NEAR", now + timedelta(days=45), 25),
            ("COS-LIP-EXP", now - timedelta(days=10), 10),
        ]
        # Override default 100 stock for cosmetics products — reset then open via movements
        for cos_p in (cos_lip, cos_found, cos_cream):
            bal = session.exec(
                select(StockBalance).where(
                    StockBalance.company_id == company.id,
                    StockBalance.product_id == cos_p.id,
                    StockBalance.store_id == store1.id,
                )
            ).first()
            if bal:
                bal.qty_on_hand = 0
                session.add(bal)
        session.flush()

        for batch_no, expiry, qty in lip_batches:
            batch = CosmeticsBatch(
                company_id=company.id,
                product_id=cos_lip.id,
                store_id=store1.id,
                batch_no=batch_no,
                expiry_date=expiry,
                manufacture_date=now - timedelta(days=90),
                received_date=now,
                qty_on_hand=0,
                status="available",
            )
            session.add(batch)
            session.flush()
            if batch_no == "COS-LIP-EXP":
                # Expired sample for FEFO exclusion — batch qty only; not in sellable StockBalance
                batch.qty_on_hand = qty
                batch.status = "expired"
                session.add(batch)
                continue
            if qty > 0:
                record_stock_movement(
                    session,
                    company_id=company.id,
                    product_id=cos_lip.id,
                    store_id=store1.id,
                    warehouse_id=None,
                    in_qty=qty,
                    transaction_type=OPENING,
                    transaction_ref=f"SEED-{batch_no}",
                    batch_id=batch.id,
                    note="cosmetics seed opening",
                )

        found_batch = CosmeticsBatch(
            company_id=company.id,
            product_id=cos_found.id,
            variant_id=shade_101.id,
            store_id=store1.id,
            batch_no="COS-FOUND-101-A",
            expiry_date=now + timedelta(days=180),
            manufacture_date=now - timedelta(days=30),
            received_date=now,
            qty_on_hand=0,
            status="available",
        )
        session.add(found_batch)
        session.flush()
        record_stock_movement(
            session,
            company_id=company.id,
            product_id=cos_found.id,
            store_id=store1.id,
            warehouse_id=None,
            in_qty=50,
            transaction_type=OPENING,
            transaction_ref="SEED-COS-FOUND",
            variant_id=shade_101.id,
            batch_id=found_batch.id,
            note="cosmetics seed opening",
        )

        cream_batch = CosmeticsBatch(
            company_id=company.id,
            product_id=cos_cream.id,
            store_id=store1.id,
            batch_no="COS-CREAM-A",
            expiry_date=now + timedelta(days=365),
            manufacture_date=now - timedelta(days=60),
            received_date=now,
            qty_on_hand=0,
            status="available",
        )
        session.add(cream_batch)
        session.flush()
        record_stock_movement(
            session,
            company_id=company.id,
            product_id=cos_cream.id,
            store_id=store1.id,
            warehouse_id=None,
            in_qty=60,
            transaction_type=OPENING,
            transaction_ref="SEED-COS-CREAM",
            batch_id=cream_batch.id,
            note="cosmetics seed opening",
        )

        session.add(
            TailoringAlterationJob(
                company_id=company.id,
                job_no="ALT-001",
                customer_name="Nabila C.",
                customer_phone="01711112222",
                garment_type="Shirt",
                alteration_task="Sleeve shorten",
                master_name="Karim Master",
                status="in-progress",
                due_date=datetime.now(timezone.utc) + timedelta(days=2),
                measurement_note="Sleeve 24 inch · chest 38",
                amount=120,
            )
        )
        session.add(
            TailoringAlterationJob(
                company_id=company.id,
                job_no="ALT-002",
                customer_name="Walk-in",
                garment_type="Panjabi",
                alteration_task="Full stitch",
                master_name="Salam Ustad",
                status="pending",
                due_date=datetime.now(timezone.utc) + timedelta(days=5),
                amount=850,
            )
        )
        for variety, grade, rate, qty, bags in [
            ("Miniket", "Premium", 72, 850, 17),
            ("Nazirshail", "Standard", 85, 620, 12),
            ("Atta", "Fresh", 48, 1200, 0),
        ]:
            session.add(
                RiceMillVarietyStock(
                    company_id=company.id,
                    store_id=store1.id,
                    variety=variety,
                    grade=grade,
                    rate_per_kg=rate,
                    qty_kg=qty,
                    bag_count=bags,
                    reorder_kg=200,
                )
            )
        session.add(
            FurnitureDeliveryOrder(
                company_id=company.id,
                delivery_no="DLV-001",
                customer_name="Rashid H.",
                customer_phone="01812345678",
                delivery_address="House 12, Road 5, Dhanmondi, Dhaka",
                items_summary="King Size Bed · Sheesham",
                assembly_required=True,
                assembly_fee=1500,
                scheduled_date=datetime.now(timezone.utc) + timedelta(days=1),
                status="scheduled",
            )
        )
        session.add(
            FurnitureDeliveryOrder(
                company_id=company.id,
                delivery_no="DLV-002",
                customer_name="Ayesha K.",
                customer_phone="01987654321",
                delivery_address="Flat 4B, Bashundhara R/A, Dhaka",
                items_summary="5-Seater Sofa Set",
                assembly_required=True,
                assembly_fee=2000,
                scheduled_date=datetime.now(timezone.utc) + timedelta(days=3),
                status="out-for-delivery",
                driver_note="Call before arrival",
            )
        )

        from app.services.subscription_service import ensure_plans, assign_plan
        ensure_plans(session)
        assign_plan(session, company.id, "enterprise")

        from app.services.platform_iam_service import ensure_platform_super_admin

        platform = session.exec(select(Company).where(Company.code == "PULSE-PLATFORM")).first()
        created_platform = platform is None
        ensure_platform_super_admin(session)
        platform = session.exec(select(Company).where(Company.code == "PULSE-PLATFORM")).first()
        if created_platform and platform:
            for pack_code in INDUSTRY_PACKS:
                session.add(
                    IndustryPack(
                        company_id=platform.id,
                        industry_code=pack_code,
                        enabled_company=True,
                        enabled_store=True,
                        enabled_counter=True,
                        updated_by="seed",
                    )
                )
            assign_plan(session, platform.id, "enterprise")

        seed_outfit_company(session)
        seed_eimama_company(session)
        seed_aura_jewelry_company(session)
        seed_volt_electronics_company(session)

        _ensure_demo_hr_full(session, company.id, store1.id)
        _ensure_demo_purchases_full(session, company.id, store1.id)

        session.commit()
        print("Seed data loaded successfully.")
    finally:
        if own_session:
            session.close()


def _ensure_demo_hr_full(session, company_id: str, store_id: str):
    """Seed comprehensive HR employees, attendance, leave requests, and shift rosters without deleting existing data."""
    existing_emps = session.exec(select(MiniHrEmployee).where(MiniHrEmployee.company_id == company_id)).all()
    if len(existing_emps) < 5:
        dept_sales = MiniHrDepartment(company_id=company_id, department_code="SALES", department_name="Sales & POS", description="Store Sales Counter")
        dept_inv = MiniHrDepartment(company_id=company_id, department_code="INV", department_name="Inventory & Store", description="Stock Management")
        dept_mgmt = MiniHrDepartment(company_id=company_id, department_code="MGMT", department_name="Management & Admin", description="Executive Operations")
        session.add(dept_sales)
        session.add(dept_inv)
        session.add(dept_mgmt)
        session.flush()

        desg_mgr = MiniHrDesignation(company_id=company_id, designation_code="MGR", designation_name="Store Manager", level=1)
        desg_csh = MiniHrDesignation(company_id=company_id, designation_code="CSH", designation_name="Senior Cashier", level=2)
        desg_inv = MiniHrDesignation(company_id=company_id, designation_code="INV", designation_name="Inventory Controller", level=2)
        session.add(desg_mgr)
        session.add(desg_csh)
        session.add(desg_inv)
        session.flush()

        demo_staff = [
            ("EMP-001", "Tanvir", "Rahman", "Tanvir Rahman", "01711223344", "tanvir@pulse.pos", "male", dept_sales.id, desg_mgr.id),
            ("EMP-002", "Nusrat", "Jahan", "Nusrat Jahan", "01822334455", "nusrat@pulse.pos", "female", dept_sales.id, desg_csh.id),
            ("EMP-003", "Rafiqul", "Islam", "Rafiqul Islam", "01933445566", "rafiq@pulse.pos", "male", dept_inv.id, desg_inv.id),
            ("EMP-004", "Farhana", "Akter", "Farhana Akter", "01644556677", "farhana@pulse.pos", "female", dept_mgmt.id, desg_mgr.id),
            ("EMP-005", "Mahmudul", "Hasan", "Mahmudul Hasan", "01555667788", "mahmud@pulse.pos", "male", dept_sales.id, desg_csh.id),
            ("EMP-006", "Shamima", "Nasrin", "Shamima Nasrin", "01766778899", "shamima@pulse.pos", "female", dept_sales.id, desg_csh.id),
            ("EMP-007", "Kazi", "Anwar", "Kazi Anwar", "01877889900", "anwar@pulse.pos", "male", dept_inv.id, desg_inv.id),
        ]
        emp_records = []
        for code, fn, ln, full_name, mobile, email, gender, dept_id, desg_id in demo_staff:
            emp = MiniHrEmployee(
                company_id=company_id,
                employee_code=code,
                first_name=fn,
                last_name=ln,
                full_name=full_name,
                display_name=full_name,
                mobile=mobile,
                email=email,
                gender=gender,
                joining_date=date(2025, 1, 15),
                department_id=dept_id,
                designation_id=desg_id,
                primary_store_id=store_id,
                employment_type="full_time",
                employee_status="active",
            )
            session.add(emp)
            emp_records.append(emp)
        session.flush()

        today = date.today()
        for idx, emp in enumerate(emp_records):
            session.add(MiniHrAttendance(company_id=company_id, store_id=store_id, employee_id=emp.id, attendance_date=today, clock_in=datetime.now(timezone.utc) - timedelta(hours=6), status="present"))
            session.add(MiniHrShiftRoster(company_id=company_id, store_id=store_id, employee_id=emp.id, shift_date=today, shift_type="morning" if idx % 2 == 0 else "evening"))
            if idx in (1, 3):
                session.add(MiniHrLeaveRequest(company_id=company_id, store_id=store_id, employee_id=emp.id, leave_type="sick" if idx == 1 else "annual", start_date=today, end_date=today + timedelta(days=2), total_days=3, reason="Medical checkup / family vacation", status="approved"))
        session.flush()


def _ensure_demo_purchases_full(session, company_id: str, store_id: str):
    """Seed demo suppliers and purchase records without deleting existing data."""
    from app.models.product import Supplier
    existing_sups = session.exec(select(Supplier).where(Supplier.company_id == company_id)).all()
    if len(existing_sups) < 3:
        suppliers = [
            ("SUP-001", "Square Pharmaceuticals Ltd", "01700000001", "orders@squarepharma.com.bd", "Dhaka, Bangladesh"),
            ("SUP-002", "Beximco Distributors", "01800000002", "sales@beximco-pharma.com", "Gazipur, Bangladesh"),
            ("SUP-003", "Apex Footwear Supply", "01900000003", "info@apexfootwear.com", "Dhaka, Bangladesh"),
            ("SUP-004", "Samsung Electronics BD", "01600000004", "b2b@samsung.com.bd", "Dhaka, Bangladesh"),
        ]
        for code, name, phone, email, addr in suppliers:
            session.add(Supplier(company_id=company_id, code=code, name=name, phone=phone, email=email, address=addr, is_active=True))
        session.flush()


if __name__ == "__main__":
    seed_demo_data(force=True)
