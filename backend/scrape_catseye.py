import os
import sys
import json
import httpx
from sqlmodel import Session, select
from app.database import engine
from app.models.core import Company, Store
from app.models.product import Product, ProductCategory, BrandMaster, Unit, ProductVariant, ProductBarcode
from app.models.inventory import StockBalance

def download_image(url, filename):
    upload_dir = "/app/uploads/products"
    os.makedirs(upload_dir, exist_ok=True)
    filepath = os.path.join(upload_dir, filename)
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        res = httpx.get(url, headers=headers, timeout=10.0)
        if res.status_code == 200:
            with open(filepath, "wb") as f:
                f.write(res.content)
            print(f"  Downloaded image: {filename}")
            return f"/uploads/products/{filename}"
        else:
            print(f"  Unsplash returned status: {res.status_code}")
    except Exception as e:
        print(f"  Failed to download image {url}: {e}")
    return None

def main():
    print("====================================================")
    print("       Cats Eye Fashion Product Seeder Script       ")
    print("====================================================")
    
    with Session(engine) as session:
        companies = session.exec(select(Company)).all()
        non_demo = [c for c in companies if c.code not in ("PULSE-DEMO", "PULSE-PLATFORM")]
        
        if not non_demo:
            print("Error: No company account exists. Please register a company first!")
            return
            
        company = None
        if len(sys.argv) > 1:
            code = sys.argv[1].strip().upper()
            company = session.exec(select(Company).where(Company.code == code)).first()
            if company:
                print(f"Selected company by argument: {company.name} ({company.code})")
        
        if not company:
            if len(non_demo) == 1:
                company = non_demo[0]
                print(f"Auto-selected company: {company.name} ({company.code})")
            else:
                if sys.stdin.isatty():
                    print("Multiple companies found. Please choose:")
                    for idx, c in enumerate(non_demo):
                        print(f"[{idx}] {c.name} ({c.code})")
                    try:
                        val = input("Enter choice index (default 0): ").strip()
                        idx = int(val) if val.isdigit() and int(val) < len(non_demo) else 0
                    except:
                        idx = 0
                    company = non_demo[idx]
                else:
                    company = non_demo[0]
                    print(f"Non-interactive mode: selected first company: {company.name} ({company.code})")
        
        # 1. Create Brand and Unit
        brand = session.exec(select(BrandMaster).where(BrandMaster.company_id == company.id, BrandMaster.code == "CATSEYE")).first()
        if not brand:
            brand = BrandMaster(company_id=company.id, code="CATSEYE", name="Cats Eye")
            session.add(brand)
            session.flush()
            print("Created Cats Eye brand.")
            
        unit = session.exec(select(Unit).where(Unit.company_id == company.id, Unit.code == "PCS")).first()
        if not unit:
            unit = Unit(company_id=company.id, code="PCS", name="Pcs")
            session.add(unit)
            session.flush()
            print("Created Pcs unit.")

        # 2. Create Categories dynamically matching the screenshots
        categories = {}
        for cat_label in [
            "LAPEL PIN", "SOCKS", "TIES", "VEST", "WALLETS", "CUFFLINKS", "BELTS", "CAPS",
            "FULL SLEEVE SHIRTS", "PANTS", "CASUAL PANTS", "DENIMS", "CORD", "X SHIRT / HALF SHIRTS",
            "POLO SHIRTS", "ROUND NECKS"
        ]:
            code = cat_label.replace(" / ", "_").replace(" ", "_").upper()
            cat = session.exec(select(ProductCategory).where(ProductCategory.company_id == company.id, ProductCategory.code == code)).first()
            if not cat:
                cat = ProductCategory(company_id=company.id, code=code, name=cat_label)
                session.add(cat)
                session.flush()
            categories[cat_label] = cat
        print("Created/verified 16 fashion categories.")
            
        # Query stores to seed stock balances
        stores = session.exec(select(Store).where(Store.company_id == company.id)).all()
        if not stores:
            # Create a default store if none exists
            default_store = Store(company_id=company.id, code="STORE-01", name="Main Store", is_active=True)
            session.add(default_store)
            session.flush()
            stores = [default_store]

        products_to_create = [
            {
                "sku": "CE-PIN-01",
                "name": "Cats Eye Silver Flower Lapel Pin",
                "category": "LAPEL PIN",
                "base_price": 950.0,
                "cost_price": 400.0,
                "image_url": "https://images.unsplash.com/photo-1516257984-b1b4d707412e?w=500&auto=format&fit=crop&q=80",
                "image_name": "ce_lapel_pin.jpg",
                "sizes": ["ONESIZE"],
                "colors": ["Silver", "Gold"],
            },
            {
                "sku": "CE-SOCKS-02",
                "name": "Cats Eye Cotton Crew Socks",
                "category": "SOCKS",
                "base_price": 350.0,
                "cost_price": 150.0,
                "image_url": "https://images.unsplash.com/photo-1582966772680-860e372bb558?w=500&auto=format&fit=crop&q=80",
                "image_name": "ce_socks.jpg",
                "sizes": ["ONESIZE"],
                "colors": ["Black", "Navy", "Grey"],
            },
            {
                "sku": "CE-TIE-03",
                "name": "Cats Eye Premium Silk Necktie",
                "category": "TIES",
                "base_price": 1450.0,
                "cost_price": 600.0,
                "image_url": "https://images.unsplash.com/photo-1589756823695-278bc923f962?w=500&auto=format&fit=crop&q=80",
                "image_name": "ce_tie.jpg",
                "sizes": ["ONESIZE"],
                "colors": ["Navy Blue", "Maroon", "Black"],
            },
            {
                "sku": "CE-VEST-04",
                "name": "Cats Eye Cotton Undershirt Vest",
                "category": "VEST",
                "base_price": 650.0,
                "cost_price": 300.0,
                "image_url": "https://images.unsplash.com/photo-1618244972963-dbee1a7edc95?w=500&auto=format&fit=crop&q=80",
                "image_name": "ce_vest.jpg",
                "sizes": ["S", "M", "L", "XL"],
                "colors": ["White"],
            },
            {
                "sku": "CE-WALLET-05",
                "name": "Cats Eye Genuine Leather Wallet",
                "category": "WALLETS",
                "base_price": 1850.0,
                "cost_price": 850.0,
                "image_url": "https://images.unsplash.com/photo-1618220179428-22790b461013?w=500&auto=format&fit=crop&q=80",
                "image_name": "ce_wallet.jpg",
                "sizes": ["ONESIZE"],
                "colors": ["Brown", "Black"],
            },
            {
                "sku": "CE-CLINKS-06",
                "name": "Cats Eye Classic Silver Cufflinks",
                "category": "CUFFLINKS",
                "base_price": 1250.0,
                "cost_price": 550.0,
                "image_url": "https://images.unsplash.com/photo-1549037173-e3b717902c57?w=500&auto=format&fit=crop&q=80",
                "image_name": "ce_cufflinks.jpg",
                "sizes": ["ONESIZE"],
                "colors": ["Silver", "Metallic Black"],
            },
            {
                "sku": "CE-BELT-07",
                "name": "Cats Eye Genuine Leather Belt",
                "category": "BELTS",
                "base_price": 1950.0,
                "cost_price": 900.0,
                "image_url": "https://images.unsplash.com/photo-1485968579580-b6d095142e6e?w=500&auto=format&fit=crop&q=80",
                "image_name": "ce_belt.jpg",
                "sizes": ["32", "34", "36", "38"],
                "colors": ["Black", "Dark Brown"],
            },
            {
                "sku": "CE-CAP-08",
                "name": "Cats Eye Casual Baseball Cap",
                "category": "CAPS",
                "base_price": 850.0,
                "cost_price": 350.0,
                "image_url": "https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=500&auto=format&fit=crop&q=80",
                "image_name": "ce_cap.jpg",
                "sizes": ["ONESIZE"],
                "colors": ["Black", "Olive Green", "Navy"],
            },
            {
                "sku": "CE-FSHIRT-09",
                "name": "Cats Eye Full Sleeve Slim Fit Shirt",
                "category": "FULL SLEEVE SHIRTS",
                "base_price": 2490.0,
                "cost_price": 1200.0,
                "image_url": "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500&auto=format&fit=crop&q=80",
                "image_name": "ce_fshirt.jpg",
                "sizes": ["M", "L", "XL"],
                "colors": ["Blue", "White", "Navy"],
            },
            {
                "sku": "CE-PANTS-10",
                "name": "Cats Eye Premium Chino Pants",
                "category": "PANTS",
                "base_price": 2890.0,
                "cost_price": 1300.0,
                "image_url": "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=500&auto=format&fit=crop&q=80",
                "image_name": "ce_pants.jpg",
                "sizes": ["30", "32", "34", "36"],
                "colors": ["Khaki", "Black", "Olive"],
            },
            {
                "sku": "CE-CPANTS-11",
                "name": "Cats Eye Casual Jogger Pants",
                "category": "CASUAL PANTS",
                "base_price": 2690.0,
                "cost_price": 1200.0,
                "image_url": "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=500&auto=format&fit=crop&q=80",
                "image_name": "ce_cpants.jpg",
                "sizes": ["M", "L", "XL"],
                "colors": ["Grey", "Black"],
            },
            {
                "sku": "CE-DENIM-12",
                "name": "Cats Eye Slim Fit Denim Jeans",
                "category": "DENIMS",
                "base_price": 3290.0,
                "cost_price": 1500.0,
                "image_url": "https://images.unsplash.com/photo-1542272604-787c3835535d?w=500&auto=format&fit=crop&q=80",
                "image_name": "ce_denim.jpg",
                "sizes": ["30", "32", "34", "36"],
                "colors": ["Indigo Blue", "Charcoal Black"],
            },
            {
                "sku": "CE-CORD-13",
                "name": "Cats Eye Corduroy Casual Shirt",
                "category": "CORD",
                "base_price": 2790.0,
                "cost_price": 1300.0,
                "image_url": "https://images.unsplash.com/photo-1617137984095-74e4e5e3613f?w=500&auto=format&fit=crop&q=80",
                "image_name": "ce_cord.jpg",
                "sizes": ["M", "L", "XL"],
                "colors": ["Camel", "Olive Green"],
            },
            {
                "sku": "CE-HSHIRT-14",
                "name": "Cats Eye Half Sleeve Casual Shirt",
                "category": "X SHIRT / HALF SHIRTS",
                "base_price": 1990.0,
                "cost_price": 900.0,
                "image_url": "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?w=500&auto=format&fit=crop&q=80",
                "image_name": "ce_hshirt.jpg",
                "sizes": ["M", "L", "XL"],
                "colors": ["Floral Print", "Striped Blue"],
            },
            {
                "sku": "CE-POLO-15",
                "name": "Cats Eye Signature Polo Shirt",
                "category": "POLO SHIRTS",
                "base_price": 1650.0,
                "cost_price": 750.0,
                "image_url": "https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=500&auto=format&fit=crop&q=80",
                "image_name": "ce_polo.jpg",
                "sizes": ["M", "L", "XL"],
                "colors": ["Black", "Crimson", "White"],
            },
            {
                "sku": "CE-ROUND-16",
                "name": "Cats Eye Round Neck T-Shirt",
                "category": "ROUND NECKS",
                "base_price": 990.0,
                "cost_price": 450.0,
                "image_url": "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=500&auto=format&fit=crop&q=80",
                "image_name": "ce_round.jpg",
                "sizes": ["M", "L", "XL"],
                "colors": ["Navy Blue", "White", "Black"],
            },
        ]
        
        for p_info in products_to_create:
            # Check if product exists
            product = session.exec(select(Product).where(Product.company_id == company.id, Product.sku == p_info["sku"])).first()
            
            # Download image
            saved_img_path = download_image(p_info["image_url"], p_info["image_name"])
            is_accessory = p_info["category"] in ("LAPEL PIN", "SOCKS", "TIES", "WALLETS", "CUFFLINKS", "BELTS", "CAPS")
            meta = {
                "image": saved_img_path or "",
                "sizes": p_info["sizes"],
                "colors": p_info["colors"],
                "style": p_info["sku"],
                "gender": "Men",
                "department": "Accessories" if is_accessory else "Clothing"
            }
            
            cat_obj = categories[p_info["category"]]
            
            if not product:
                product = Product(
                    company_id=company.id,
                    sku=p_info["sku"],
                    name=p_info["name"],
                    industry_pack="fashion",
                    base_price=p_info["base_price"],
                    cost_price=p_info["cost_price"],
                    wholesale_price=p_info["base_price"],
                    category_id=cat_obj.id,
                    brand_id=brand.id,
                    unit_id=unit.id,
                    meta_json=json.dumps(meta),
                    is_active=True
                )
                session.add(product)
                session.flush()
                print(f"Created product: {p_info['name']}")
            else:
                product.meta_json = json.dumps(meta)
                product.base_price = p_info["base_price"]
                product.cost_price = p_info["cost_price"]
                product.wholesale_price = p_info["base_price"]
                product.category_id = cat_obj.id
                session.add(product)
                session.flush()
                print(f"Updated product: {p_info['name']}")
            
            # Create/update StockBalance for each store
            for store in stores:
                sb = session.exec(select(StockBalance).where(
                    StockBalance.company_id == company.id,
                    StockBalance.product_id == product.id,
                    StockBalance.store_id == store.id
                )).first()
                if not sb:
                    sb = StockBalance(
                        company_id=company.id,
                        product_id=product.id,
                        store_id=store.id,
                        qty_on_hand=100.0,
                        qty_reserved=0.0,
                        qty_damaged=0.0,
                        qty_in_transit=0.0,
                        unit_cost_avg=p_info["cost_price"]
                    )
                    session.add(sb)
                else:
                    sb.qty_on_hand = 100.0
                    session.add(sb)
            session.flush()
                
            # Create Variants & Barcodes
            for size in p_info["sizes"]:
                for color in p_info["colors"]:
                    variant_code = f"{product.sku}-{size.upper()}-{color.upper()}"
                    barcode = f"{product.sku.lower().replace('-', '')}{size.lower()}{color.lower()}"[:32]
                    
                    # Check if variant exists
                    variant = session.exec(select(ProductVariant).where(
                        ProductVariant.company_id == company.id,
                        ProductVariant.product_id == product.id,
                        ProductVariant.variant_code == variant_code
                    )).first()
                    
                    if not variant:
                        variant = ProductVariant(
                            company_id=company.id,
                            product_id=product.id,
                            variant_code=variant_code,
                            size=size,
                            color=color,
                            style=product.sku,
                            attributes_json=json.dumps({}),
                            barcode=barcode,
                            is_active=True
                        )
                        session.add(variant)
                        session.flush()
                        print(f"  Created variant: {variant_code}")
                        
                    # Ensure barcode is in ProductBarcode table
                    p_bc = session.exec(select(ProductBarcode).where(
                        ProductBarcode.company_id == company.id,
                        ProductBarcode.barcode == barcode
                    )).first()
                    
                    if not p_bc:
                        p_bc = ProductBarcode(
                            company_id=company.id,
                            product_id=product.id,
                            variant_id=variant.id,
                            barcode=barcode,
                            barcode_type="EAN13",
                            is_primary=False,
                            is_active=True
                        )
                        session.add(p_bc)
                        session.flush()
                        
        session.commit()
        print("Success: All products, variants and images imported successfully!")

if __name__ == "__main__":
    main()
