import json
from app.database import engine
from sqlmodel import Session, select
from app.models.core import Company, Store, Warehouse
from app.models.product import Product, ProductCategory, BrandMaster, Unit
from app.models.inventory import StockBalance
from app.models.config_engine import IndustryPack

session = Session(engine)
c = session.exec(select(Company).where(Company.code == 'PULSE-DEMO')).first()
cid = c.id

print("=" * 95)
print("           SUPER SHOP POS: INVENTORY, MASTER DATA & STOCK AUDIT")
print("=" * 95)

# 1. Company & Stores
stores = session.exec(select(Store).where(Store.company_id == cid)).all()
print(f"\n1. TENANT & STORES: {c.name} ({c.code})")
for s in stores:
    print(f"   • Store: {s.name:<25} (Code: {s.code})")

# 2. Industry Pack
pack = session.exec(select(IndustryPack).where(IndustryPack.company_id == cid, IndustryPack.industry_code == 'super-shop')).first()
is_enabled = pack is not None and pack.enabled_company
print(f"\n2. VERTICAL CONFIGURATION:")
print(f"   • 'super-shop' Pack Active: {'YES' if is_enabled else 'NO'}")

# 3. Master Categories
cats = session.exec(select(ProductCategory).where(ProductCategory.company_id == cid, ProductCategory.code.startswith('CAT-'))).all()
print(f"\n3. MASTER CATEGORIES ({len(cats)} categories):")
for cat in sorted(cats, key=lambda x: x.code):
    print(f"   • {cat.code:<12}: {cat.name}")

# 4. Master Brands
brands = session.exec(select(BrandMaster).where(BrandMaster.company_id == cid)).all()
print(f"\n4. MASTER BRANDS ({len(brands)} registered):")
print("   " + ", ".join([b.name for b in brands[:10]]))

# 5. Products, Barcodes, Pricing, Margins, and Stock
prods = session.exec(select(Product).where(Product.company_id == cid, Product.industry_pack == 'super-shop')).all()
print(f"\n5. PRODUCTS INVENTORY & MULTI-STORE STOCK ({len(prods)} products):")
print(f"{'SKU':<11} | {'Barcode':<13} | {'Dept':<7} | {'Price':<6} | {'Cost':<6} | {'Margin':<7} | {'Unit':<4} | {'Brand':<12} | {'Stock (DHK-01 / DHK-02 / WH)'}")
print("-" * 115)

for p in sorted(prods, key=lambda x: x.sku):
    cat = session.exec(select(ProductCategory).where(ProductCategory.id == p.category_id)).first()
    brand = session.exec(select(BrandMaster).where(BrandMaster.id == p.brand_id)).first()
    unit = session.exec(select(Unit).where(Unit.id == p.unit_id)).first()
    bals = session.exec(select(StockBalance).where(StockBalance.product_id == p.id)).all()
    
    st1 = 0
    st2 = 0
    wh = 0
    for b in bals:
        if b.store_id:
            s_obj = session.exec(select(Store).where(Store.id == b.store_id)).first()
            if s_obj and '01' in s_obj.code:
                st1 = b.qty_on_hand
            elif s_obj and '02' in s_obj.code:
                st2 = b.qty_on_hand
        elif b.warehouse_id:
            wh = b.qty_on_hand
            
    meta = json.loads(p.meta_json) if p.meta_json else {}
    dept = meta.get('departmentCode', 'N/A')
    cost = p.cost_price or 0.0
    margin_pct = f"{((p.base_price - cost) / p.base_price * 100):.1f}%" if p.base_price and cost else "N/A"
    
    unit_code = unit.code if unit else 'N/A'
    brand_name = (brand.name[:12] if brand else 'N/A')
    
    print(f"{p.sku:<11} | {str(p.barcode):<13} | {dept:<7} | BDT {p.base_price:<5.0f} | BDT {cost:<5.0f} | {margin_pct:<7} | {unit_code:<4} | {brand_name:<12} | {int(st1)} in Flagship, {int(st2)} in Gulshan, {int(wh)} in WH")

print("=" * 95)
