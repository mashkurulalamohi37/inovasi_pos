"""Master data CRUD — categories, brands, units with tenant isolation."""

from __future__ import annotations

from collections import defaultdict

from fastapi import HTTPException
from sqlmodel import Session, select, func

from app.dependencies import AuthContext, write_audit
from app.models.product import BrandMaster, Product, ProductCategory, Unit


def _dup_name(session: Session, model, company_id: str, name: str, exclude_id: str | None = None) -> None:
    q = select(model).where(model.company_id == company_id, func.lower(model.name) == name.lower())
    if exclude_id:
        q = q.where(model.id != exclude_id)
    if session.exec(q).first():
        raise HTTPException(status_code=409, detail="Name already exists for this company")


def _dup_code(session: Session, model, company_id: str, code: str, exclude_id: str | None = None) -> None:
    q = select(model).where(model.company_id == company_id, func.lower(model.code) == code.lower())
    if exclude_id:
        q = q.where(model.id != exclude_id)
    if session.exec(q).first():
        raise HTTPException(status_code=409, detail="Code already exists for this company")


def _product_count(session: Session, company_id: str, **filters) -> int:
    q = select(func.count()).select_from(Product).where(Product.company_id == company_id, Product.is_active == True)
    for key, val in filters.items():
        q = q.where(getattr(Product, key) == val)
    return session.exec(q).one()


def _active_child_count(session: Session, company_id: str, category_id: str) -> int:
    q = select(func.count()).select_from(ProductCategory).where(
        ProductCategory.company_id == company_id,
        ProductCategory.parent_id == category_id,
        ProductCategory.is_active == True,  # noqa: E712
    )
    return session.exec(q).one()


def _validate_parent_id(
    session: Session,
    company_id: str,
    parent_id: str | None,
    *,
    self_id: str | None = None,
) -> None:
    """Parent must exist, belong to this tenant, not be self, and not create a cycle."""
    if not parent_id:
        return
    if parent_id == self_id:
        raise HTTPException(status_code=400, detail="Category cannot be its own parent")
    seen: set[str] = {self_id} if self_id else set()
    current_id: str | None = parent_id
    depth = 0
    while current_id:
        if depth > 20:
            raise HTTPException(status_code=400, detail="Category hierarchy too deep")
        if current_id in seen:
            raise HTTPException(status_code=400, detail="Parent category would create a cycle")
        seen.add(current_id)
        row = session.get(ProductCategory, current_id)
        if not row or row.company_id != company_id:
            raise HTTPException(status_code=404, detail="Parent category not found")
        current_id = row.parent_id
        depth += 1



DEFAULT_INDUSTRY_CATEGORIES: dict[str, list[tuple[str, str]]] = {
    "cosmetics": [
        ("COS-SKIN", "Skincare"),
        ("COS-MAKEUP", "Makeup"),
        ("COS-HAIR", "Hair Care"),
        ("COS-FRAG", "Fragrance"),
        ("COS-BATH", "Bath and Body"),
        ("COS-HIJAB", "Hijab and Personal Care"),
        ("COS-ORAL", "Oral Care"),
    ],
    "grocery": [
        ("GROC-STAPLE", "Grocery and Staples"),
        ("GROC-FRESH", "Fresh Produce"),
        ("GROC-MEAT", "Meat and Fish"),
        ("GROC-DAIRY", "Dairy and Eggs"),
        ("GROC-BEV", "Beverages"),
        ("GROC-SNACK", "Snacks and Confectionery"),
        ("GROC-CLEAN", "Cleaning and Household"),
    ],
    "super-shop": [
        ("CAT-FRESH", "Fresh Produce, Meat and Fish"),
        ("CAT-GROC", "Grocery and FMCG"),
        ("CAT-PHARM", "Pharmacy and Health (OTC)"),
        ("CAT-APPAREL", "Apparel and Footwear"),
        ("CAT-BEAUTY", "Cosmetics and Personal Care"),
        ("CAT-TECH", "Electronics and Home"),
        ("CAT-STAT", "Stationery and General"),
    ],
    "pharmacy": [
        ("PHARM-RX", "Prescription Medicines"),
        ("PHARM-OTC", "OTC and First Aid"),
        ("PHARM-ANTI", "Antibiotics and Anti-infectives"),
        ("PHARM-VIT", "Vitamins and Supplements"),
        ("PHARM-BABY", "Baby and Mother Care"),
        ("PHARM-HYG", "Personal Hygiene"),
        ("PHARM-DEV", "Medical Devices and Diagnostics"),
    ],
    "surgical-shop": [
        ("ORTHOPEDICS", "Orthopedics and Supports"),
        ("DIAGNOSTICS", "Rapid Diagnostic Kits"),
        ("SURG_PPE", "Surgical Disposables and PPE"),
        ("SURG_INSTRUMENTS", "Surgical Instruments and OT Tools"),
    ],
    "fashion": [
        ("FASH-TOPS", "Tops and Shirts"),
        ("FASH-BOTTOMS", "Bottoms and Trousers"),
        ("FASH-ETHNIC", "Panjabi and Ethnic Wear"),
        ("FASH-DRESS", "Dresses and Sarees"),
        ("FASH-OUTER", "Outerwear and Jackets"),
        ("FASH-ACC", "Accessories and Bags"),
        ("FASH-FOOT", "Footwear"),
    ],
    "electronics": [
        ("ELEC-PHONE", "Smartphones and Tablets"),
        ("ELEC-LAPTOP", "Laptops and Computers"),
        ("ELEC-AUDIO", "Audio and Headphones"),
        ("ELEC-TV", "Television and Smart Display"),
        ("ELEC-HOME", "Home Appliances"),
        ("ELEC-ACC", "Electronics Accessories"),
    ],
    "mobile-shop": [
        ("MOB-PHONE", "Smartphones"),
        ("MOB-FEAT", "Feature Phones"),
        ("MOB-ACC", "Phone Accessories"),
        ("MOB-CHARGE", "Chargers and Power Banks"),
        ("MOB-COVER", "Covers and Screen Protectors"),
        ("MOB-AUDIO", "Audio and Earphones"),
    ],
    "jewelry": [
        ("JEW-22K", "22K Gold"),
        ("JEW-21K", "21K Gold"),
        ("JEW-18K", "18K Gold"),
        ("JEW-DIAM", "Diamond Jewellery"),
        ("JEW-SILVER", "Silver and Platinum"),
        ("JEW-BRIDAL", "Bridal Sets"),
        ("JEW-COIN", "Gold Coins and Bars"),
    ],
    "hardware": [
        ("HW-PIPE", "Pipes and Fittings"),
        ("HW-ELEC", "Electrical and Wiring"),
        ("HW-TOOLS", "Power and Hand Tools"),
        ("HW-PAINT", "Paints and Solvents"),
        ("HW-SAN", "Sanitary and Bathroom"),
        ("HW-FAST", "Fasteners and Hardware"),
    ],
    "building-materials": [
        ("BM-CEMENT", "Cement"),
        ("BM-ROD", "TMT Steel Rods"),
        ("BM-SAND", "Sand and Aggregates"),
        ("BM-BRICK", "Bricks and Blocks"),
        ("BM-TILES", "Tiles and Ceramics"),
    ],
    "stationery": [
        ("STAT-SCHOOL", "School Supplies"),
        ("STAT-OFFICE", "Office Stationery"),
        ("STAT-KHATA", "Notebooks and Khatas"),
        ("STAT-PAPER", "Paper and Printing"),
        ("STAT-PEN", "Writing Instruments"),
        ("STAT-ART", "Art and Craft Supplies"),
    ],
    "bookstore": [
        ("BOOK-FIC", "Fiction and Literature"),
        ("BOOK-NONFIC", "Non-fiction"),
        ("BOOK-ACAD", "Academic and Textbooks"),
        ("BOOK-ISLAM", "Religious and Islamic"),
        ("BOOK-CHILD", "Children's Books"),
        ("BOOK-EXAM", "Competitive Exams"),
    ],
    "restaurant": [
        ("APPETISERS", "Appetisers and Starters"),
        ("BURGERS", "Burgers and Sandwiches"),
        ("RICE", "Rice and Main Courses"),
        ("CHICKEN", "Chicken and Meat"),
        ("CHOW_MEIN", "Pasta and Chow Mein"),
        ("BEVERAGES", "Beverages and Drinks"),
        ("SET_MENU", "Set Menu and Combos"),
    ],
    "crockery": [
        ("CRK-DINNER", "Dinnerware and Plates"),
        ("CRK-COOK", "Cookware and Pans"),
        ("CRK-GLASS", "Glassware and Drinkware"),
        ("CRK-TOOLS", "Kitchen Utensils"),
        ("CRK-STOR", "Food Storage"),
    ],
    "cycle-toys": [
        ("CYC-CYCLE", "Bicycles and Accessories"),
        ("TOY-RIDEON", "Ride-on Cars and Bikes"),
        ("TOY-BOARD", "Board Games and Puzzles"),
        ("TOY-ACTION", "Action Figures and Dolls"),
        ("TOY-RC", "RC Toys and Drones"),
    ],
    "salon": [
        ("SAL-HAIR", "Hair Care and Styling"),
        ("SAL-SKIN", "Skin and Facial"),
        ("SAL-BRIDAL", "Bridal and Party Makeover"),
        ("SAL-COLOR", "Hair Coloring"),
        ("SAL-SPA", "Spa and Wellness"),
    ],
    "optical-shop": [
        ("OPT-FRAME", "Eyeglass Frames"),
        ("OPT-LENS", "Prescription Lenses"),
        ("OPT-CONTACT", "Contact Lenses"),
        ("OPT-SUN", "Sunglasses"),
        ("OPT-ACC", "Accessories and Cleaning"),
    ],
    "beef-shop": [
        ("BEEF-BEEF", "Fresh Beef"),
        ("BEEF-MUTTON", "Fresh Mutton"),
        ("BEEF-CHICKEN", "Fresh Chicken"),
        ("BEEF-FISH", "Fresh Fish"),
        ("BEEF-FROZEN", "Frozen and Processed"),
    ],
    "furniture": [
        ("FURN-BED", "Bedroom Furniture"),
        ("FURN-LIVING", "Living Room Furniture"),
        ("FURN-DINING", "Dining Sets"),
        ("FURN-OFFICE", "Office Furniture"),
    ],
    "tailoring": [
        ("TAIL-SHIRT", "Formal Shirts and Suits"),
        ("TAIL-PANT", "Pants and Trousers"),
        ("TAIL-PANJABI", "Panjabi and Kurta"),
        ("TAIL-SAREE", "Sarees and Blouses"),
        ("TAIL-FABRIC", "Unstitched Fabrics"),
    ],
}

DEFAULT_INDUSTRY_BRANDS: dict[str, list[tuple[str, str]]] = {
    "cosmetics": [
        ("UNILEVER", "Unilever"),
        ("MARICO", "Marico"),
        ("LAKME", "Lakme"),
        ("PONDS", "Pond's"),
        ("MAYBELLINE", "Maybelline"),
        ("LOREAL", "L'Oreal"),
        ("NIOR", "Nior"),
        ("NEUTROGENA", "Neutrogena"),
        ("GARNIER", "Garnier"),
        ("DOVE", "Dove"),
    ],
    "grocery": [
        ("PRAN", "Pran"),
        ("FRESH", "Fresh"),
        ("ACI", "ACI Consumer Brands"),
        ("SQUARE", "Square Consumer Products"),
        ("UNILEVER", "Unilever"),
        ("NESTLE", "Nestle"),
        ("RADHUNI", "Radhuni"),
        ("TEER", "Teer"),
        ("AARONG", "Aarong Dairy"),
        ("ISPAHANI", "Ispahani"),
    ],
    "super-shop": [
        ("PRAN", "Pran-RFL Group"),
        ("FRESH", "Fresh"),
        ("ACI", "ACI Consumer Brands"),
        ("SQUARE", "Square Group"),
        ("UNILEVER", "Unilever"),
        ("NESTLE", "Nestle"),
        ("BEXIMCO", "Beximco Pharma"),
        ("WALTON", "Walton Hi-Tech"),
        ("APEX", "Apex Footwear"),
    ],
    "pharmacy": [
        ("SQUARE", "Square Pharmaceuticals"),
        ("BEXIMCO", "Beximco Pharma"),
        ("INCEPTA", "Incepta Pharmaceuticals"),
        ("RENATA", "Renata Limited"),
        ("OPSONIN", "Opsonin Pharma"),
        ("ACME", "Acme Laboratories"),
        ("ESKAYEF", "Eskayef (SK+F)"),
        ("ARISTO", "Aristopharma"),
        ("TYNOR", "Tynor"),
    ],
    "surgical-shop": [
        ("TYNOR", "Tynor"),
        ("SDBIO", "SD Biosensor / Siddiky"),
        ("SIDDIKY", "Siddiky Precision"),
        ("MEDISAFE", "Medisafe / Siddiky"),
        ("QUICKCHECK", "QuickCheck / Siddiky"),
    ],
    "fashion": [
        ("CATSEYE", "Cat's Eye"),
        ("RICHMAN", "Richman"),
        ("YELLOW", "Yellow"),
        ("ECSTASY", "Ecstasy"),
        ("APEX", "Apex Footwear"),
        ("BATA", "Bata"),
        ("LOTTO", "Lotto"),
        ("INHOUSE-FASH", "In-house Fashion"),
    ],
    "electronics": [
        ("SAMSUNG", "Samsung"),
        ("APPLE", "Apple"),
        ("XIAOMI", "Xiaomi"),
        ("WALTON", "Walton Hi-Tech"),
        ("SONY", "Sony"),
        ("LG", "LG"),
        ("ANKER", "Anker"),
        ("DELL", "Dell"),
        ("LOGITECH", "Logitech"),
        ("JBL", "JBL"),
    ],
    "mobile-shop": [
        ("SAMSUNG", "Samsung"),
        ("APPLE", "Apple"),
        ("XIAOMI", "Xiaomi"),
        ("REALME", "Realme"),
        ("SYMPHONY", "Symphony"),
        ("VIVO", "Vivo"),
        ("OPPO", "Oppo"),
        ("ONEPLUS", "OnePlus"),
        ("ANKER", "Anker"),
        ("BASEUS", "Baseus"),
    ],
    "jewelry": [
        ("INHOUSE-JEW", "In-house Hallmark"),
        ("DIAMOND-W", "Diamond World"),
        ("AMIN-JEW", "Amin Jewellers"),
        ("ALAMIN-JEW", "Al-Amin Jewellers"),
        ("VENUS-JEW", "Venus Jewellers"),
    ],
    "hardware": [
        ("RFL", "RFL"),
        ("BRB", "BRB Cable"),
        ("BERGER", "Berger"),
        ("BSRM", "BSRM"),
        ("STANLEY", "Stanley"),
        ("ANCHOR", "Anchor"),
        ("NATIONAL", "National"),
    ],
    "building-materials": [
        ("HOLCIM", "Holcim"),
        ("BSRM", "BSRM"),
        ("SHAH", "Shah Cement"),
        ("RAK", "RAK Ceramics"),
        ("KSRM", "KSRM"),
        ("CROWN", "Crown Cement"),
        ("BASHUNDHARA", "Bashundhara"),
    ],
    "stationery": [
        ("MATADOR", "Matador"),
        ("FRESH", "Fresh"),
        ("OXFORD", "Oxford"),
        ("DOUBLE-A", "Double A"),
        ("GOODLUCK", "Good Luck"),
        ("DOMS", "Doms"),
    ],
    "bookstore": [
        ("NCTB", "NCTB"),
        ("DHAKA-BOARD", "Dhaka Board"),
        ("BANGLA-ACAD", "Bangla Academy"),
        ("SOMOY", "Somoy Prokashon"),
        ("PROTHOMA", "Prothoma"),
        ("OXFORD-UP", "Oxford University Press"),
    ],
    "crockery": [
        ("MILANO", "Milano"),
        ("KIAM", "Kiam"),
        ("HAWKINS", "Hawkins"),
        ("PRESTIGE", "Prestige"),
        ("LUMINARC", "Luminarc"),
        ("OCEAN", "Ocean"),
        ("CELLO", "Cello"),
    ],
    "cycle-toys": [
        ("HERO", "Hero Sprint"),
        ("PHOENIX", "Phoenix"),
        ("VELOCE", "Veloce"),
        ("CORE", "Core"),
        ("LEGO", "LEGO"),
        ("HOTWHEELS", "Hot Wheels"),
        ("WLTOYS", "WLToys"),
    ],
    "salon": [
        ("LOREAL-PRO", "L'Oreal Professional"),
        ("SCHWARZKOPF", "Schwarzkopf"),
        ("MATRIX", "Matrix"),
        ("WELLA", "Wella"),
        ("STREAX", "Streax"),
    ],
    "optical-shop": [
        ("VISIONSTYLE", "VisionStyle"),
        ("RAYBAN", "Ray-Ban Style"),
        ("ESSILOR", "Essilor"),
        ("HOYA", "Hoya"),
        ("BAUSCH", "Bausch+Lomb"),
    ],
    "beef-shop": [
        ("BENGAL-MEAT", "Bengal Meat"),
        ("DESHI-HALAL", "Deshi Halal"),
        ("KAZI-FARMS", "Kazi Farms"),
        ("CP", "CP Bangladesh"),
    ],
    "furniture": [
        ("AKHTAR", "Akhtar Furnishers"),
        ("HATIL", "Hatil"),
        ("OTOBI", "Otobi"),
        ("REGAL", "Regal"),
    ],
    "tailoring": [
        ("RAYMOND", "Raymond"),
        ("ARVIND", "Arvind"),
        ("SIYARAMS", "Siyarams"),
        ("PAKIZA", "Pakiza"),
        ("INHOUSE-TAILOR", "In-house Master Tailor"),
    ],
}


def _ensure_industry_master_data(session: Session, company_id: str, industry: str | None) -> None:
    if not industry or industry == "all":
        return

    # 1. Categories for industry
    cat_defs = DEFAULT_INDUSTRY_CATEGORIES.get(industry)
    if cat_defs:
        existing_pack_cats = session.exec(
            select(ProductCategory).where(
                ProductCategory.company_id == company_id,
                ProductCategory.industry_pack == industry,
            )
        ).all()
        if not existing_pack_cats:
            for code, name in cat_defs:
                exists = session.exec(
                    select(ProductCategory).where(
                        ProductCategory.company_id == company_id,
                        (func.lower(ProductCategory.code) == code.lower()) | (func.lower(ProductCategory.name) == name.lower()),
                    )
                ).first()
                if exists:
                    if not getattr(exists, "industry_pack", None):
                        exists.industry_pack = industry
                        session.add(exists)
                else:
                    new_cat = ProductCategory(
                        company_id=company_id,
                        code=code,
                        name=name,
                        industry_pack=industry,
                        is_active=True,
                    )
                    session.add(new_cat)
            session.flush()

    # 2. Brands for industry
    brand_defs = DEFAULT_INDUSTRY_BRANDS.get(industry)
    if brand_defs:
        existing_pack_brands = session.exec(
            select(BrandMaster).where(
                BrandMaster.company_id == company_id,
                BrandMaster.industry_pack == industry,
            )
        ).all()
        if not existing_pack_brands:
            for code, name in brand_defs:
                exists = session.exec(
                    select(BrandMaster).where(
                        BrandMaster.company_id == company_id,
                        (func.lower(BrandMaster.code) == code.lower()) | (func.lower(BrandMaster.name) == name.lower()),
                    )
                ).first()
                if exists:
                    if not getattr(exists, "industry_pack", None):
                        exists.industry_pack = industry
                        session.add(exists)
                else:
                    new_b = BrandMaster(
                        company_id=company_id,
                        code=code,
                        name=name,
                        industry_pack=industry,
                        is_active=True,
                    )
                    session.add(new_b)
            session.flush()


def _category_industry_packs_map(session: Session, company_id: str) -> dict[str, set[str]]:
    mapping: dict[str, set[str]] = defaultdict(set)
    rows = session.exec(
        select(Product.category_id, Product.industry_pack).where(
            Product.company_id == company_id,
            Product.category_id != None,
        )
    ).all()
    for cat_id, p_pack in rows:
        if cat_id and p_pack:
            mapping[cat_id].add(p_pack)
    return mapping


def _brand_industry_packs_map(session: Session, company_id: str) -> dict[str, set[str]]:
    mapping: dict[str, set[str]] = defaultdict(set)
    rows = session.exec(
        select(Product.brand_id, Product.industry_pack).where(
            Product.company_id == company_id,
            Product.brand_id != None,
        )
    ).all()
    for b_id, p_pack in rows:
        if b_id and p_pack:
            mapping[b_id].add(p_pack)
    return mapping


def category_out(session: Session, company_id: str, row: ProductCategory, cat_packs_map: dict[str, set[str]] | None = None) -> dict:
    parent_name = None
    if row.parent_id:
        parent = session.get(ProductCategory, row.parent_id)
        parent_name = parent.name if parent else None

    packs = set()
    if getattr(row, "industry_pack", None):
        packs.add(row.industry_pack)
    if cat_packs_map and row.id in cat_packs_map:
        packs.update(cat_packs_map[row.id])

    return {
        "id": row.id,
        "code": row.code,
        "name": row.name,
        "parent_id": row.parent_id,
        "parent_name": parent_name,
        "industry_pack": getattr(row, "industry_pack", None),
        "industry_packs": sorted(list(packs)),
        "is_active": getattr(row, "is_active", True),
        "product_count": _product_count(session, company_id, category_id=row.id),
    }


def list_categories(session: Session, company_id: str, q: str | None = None, industry: str | None = None) -> list[dict]:
    if industry and industry != "all":
        _ensure_industry_master_data(session, company_id, industry)

    rows = session.exec(
        select(ProductCategory)
        .where(ProductCategory.company_id == company_id)
        .order_by(ProductCategory.code.asc())
    ).all()
    if q:
        ql = q.lower()
        rows = [r for r in rows if ql in r.name.lower() or ql in r.code.lower()]

    packs_map = _category_industry_packs_map(session, company_id)
    out = [category_out(session, company_id, r, packs_map) for r in rows]

    if industry and industry != "all":
        filtered = [
            c for c in out
            if industry in c["industry_packs"] or c.get("industry_pack") == industry
        ]
        if filtered:
            return filtered
    return out


def create_category(session: Session, auth: AuthContext, body: dict) -> dict:
    code = (body.get("code") or "").strip()
    name = (body.get("name") or "").strip()
    if not code or not name:
        raise HTTPException(status_code=400, detail="Code and name are required")
    _dup_code(session, ProductCategory, auth.company_id, code)
    _dup_name(session, ProductCategory, auth.company_id, name)
    parent_id = body.get("parent_id") or None
    _validate_parent_id(session, auth.company_id, parent_id)
    row = ProductCategory(
        company_id=auth.company_id,
        code=code,
        name=name,
        parent_id=parent_id,
        industry_pack=(body.get("industry_pack") or "").strip() or None,
        is_active=True,
    )
    session.add(row)
    session.flush()
    write_audit(session, auth, "category_create", "product_category", row.id)
    return category_out(session, auth.company_id, row)


def update_category(session: Session, auth: AuthContext, category_id: str, body: dict) -> dict:
    row = session.get(ProductCategory, category_id)
    if not row or row.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Category not found")
    if body.get("name") is not None:
        name = body["name"].strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name is required")
        _dup_name(session, ProductCategory, auth.company_id, name, exclude_id=row.id)
        row.name = name
    if body.get("parent_id") is not None:
        new_parent_id = body["parent_id"] or None
        _validate_parent_id(session, auth.company_id, new_parent_id, self_id=row.id)
        row.parent_id = new_parent_id
    if body.get("is_active") is False:
        if _product_count(session, auth.company_id, category_id=row.id) > 0:
            raise HTTPException(status_code=409, detail="Cannot deactivate category used by active products")
        if _active_child_count(session, auth.company_id, row.id) > 0:
            raise HTTPException(status_code=409, detail="Cannot deactivate category with active subcategories")
        row.is_active = False
    elif body.get("is_active") is True:
        row.is_active = True
    session.add(row)
    write_audit(session, auth, "category_update", "product_category", row.id)
    return category_out(session, auth.company_id, row)


def brand_out(session: Session, company_id: str, row: BrandMaster, brand_packs_map: dict[str, set[str]] | None = None) -> dict:
    packs = set()
    if getattr(row, "industry_pack", None):
        packs.add(row.industry_pack)
    if brand_packs_map and row.id in brand_packs_map:
        packs.update(brand_packs_map[row.id])

    return {
        "id": row.id,
        "code": row.code,
        "name": row.name,
        "industry_pack": getattr(row, "industry_pack", None),
        "industry_packs": sorted(list(packs)),
        "is_active": getattr(row, "is_active", True),
        "product_count": _product_count(session, company_id, brand_id=row.id),
    }


def list_brands(session: Session, company_id: str, q: str | None = None, industry: str | None = None) -> list[dict]:
    if industry and industry != "all":
        _ensure_industry_master_data(session, company_id, industry)

    rows = session.exec(
        select(BrandMaster)
        .where(BrandMaster.company_id == company_id)
        .order_by(BrandMaster.code.asc())
    ).all()
    if q:
        ql = q.lower()
        rows = [r for r in rows if ql in r.name.lower() or ql in r.code.lower()]

    packs_map = _brand_industry_packs_map(session, company_id)
    out = [brand_out(session, company_id, r, packs_map) for r in rows]

    if industry and industry != "all":
        filtered = [
            b for b in out
            if industry in b["industry_packs"] or b.get("industry_pack") == industry
        ]
        if filtered:
            return filtered
    return out


def create_brand(session: Session, auth: AuthContext, body: dict) -> dict:
    code = (body.get("code") or "").strip()
    name = (body.get("name") or "").strip()
    if not code or not name:
        raise HTTPException(status_code=400, detail="Code and name are required")
    _dup_code(session, BrandMaster, auth.company_id, code)
    _dup_name(session, BrandMaster, auth.company_id, name)
    industry_pack = (body.get("industry_pack") or "").strip() or None
    row = BrandMaster(company_id=auth.company_id, code=code, name=name, industry_pack=industry_pack, is_active=True)
    session.add(row)
    session.flush()
    write_audit(session, auth, "brand_create", "brand_master", row.id)
    return brand_out(session, auth.company_id, row)


def update_brand(session: Session, auth: AuthContext, brand_id: str, body: dict) -> dict:
    row = session.get(BrandMaster, brand_id)
    if not row or row.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Brand not found")
    if body.get("name") is not None:
        name = body["name"].strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name is required")
        _dup_name(session, BrandMaster, auth.company_id, name, exclude_id=row.id)
        row.name = name
    if body.get("is_active") is False:
        if _product_count(session, auth.company_id, brand_id=row.id) > 0:
            raise HTTPException(status_code=409, detail="Cannot deactivate brand used by active products")
        row.is_active = False
    elif body.get("is_active") is True:
        row.is_active = True
    session.add(row)
    write_audit(session, auth, "brand_update", "brand_master", row.id)
    return brand_out(session, auth.company_id, row)


def unit_out(session: Session, company_id: str, row: Unit) -> dict:
    return {
        "id": row.id,
        "code": row.code,
        "name": row.name,
        "is_active": getattr(row, "is_active", True),
        "product_count": _product_count(session, company_id, unit_id=row.id),
    }


def list_units(session: Session, company_id: str, q: str | None = None) -> list[dict]:
    rows = session.exec(
        select(Unit)
        .where(Unit.company_id == company_id)
        .order_by(Unit.code.asc())
    ).all()
    if q:
        ql = q.lower()
        rows = [r for r in rows if ql in r.name.lower() or ql in r.code.lower()]
    return [unit_out(session, company_id, r) for r in rows]


def create_unit(session: Session, auth: AuthContext, body: dict) -> dict:
    code = (body.get("code") or "").strip()
    name = (body.get("name") or "").strip()
    if not code or not name:
        raise HTTPException(status_code=400, detail="Code and name are required")
    _dup_code(session, Unit, auth.company_id, code)
    _dup_name(session, Unit, auth.company_id, name)
    row = Unit(company_id=auth.company_id, code=code, name=name, is_active=True)
    session.add(row)
    session.flush()
    write_audit(session, auth, "unit_create", "unit", row.id)
    return unit_out(session, auth.company_id, row)


def update_unit(session: Session, auth: AuthContext, unit_id: str, body: dict) -> dict:
    row = session.get(Unit, unit_id)
    if not row or row.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Unit not found")
    if body.get("name") is not None:
        name = body["name"].strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name is required")
        _dup_name(session, Unit, auth.company_id, name, exclude_id=row.id)
        row.name = name
    if body.get("is_active") is False:
        if _product_count(session, auth.company_id, unit_id=row.id) > 0:
            raise HTTPException(status_code=409, detail="Cannot deactivate unit used by active products")
        row.is_active = False
    elif body.get("is_active") is True:
        row.is_active = True
    session.add(row)
    write_audit(session, auth, "unit_update", "unit", row.id)
    return unit_out(session, auth.company_id, row)


def delete_category(session: Session, auth: AuthContext, category_id: str) -> dict:
    row = session.get(ProductCategory, category_id)
    if not row or row.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Category not found")
    prod_count = _product_count(session, auth.company_id, category_id=row.id)
    if prod_count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete category '{row.name}': {prod_count} product(s) are assigned to it. Reassign or delete those products first.",
        )
    child_count = _active_child_count(session, auth.company_id, row.id)
    if child_count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete category '{row.name}': It has {child_count} subcategories. Please reassign or delete them first.",
        )
    session.delete(row)
    write_audit(session, auth, "category_delete", "product_category", row.id)
    return {"ok": True, "id": category_id, "name": row.name}


def delete_brand(session: Session, auth: AuthContext, brand_id: str) -> dict:
    row = session.get(BrandMaster, brand_id)
    if not row or row.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Brand not found")
    prod_count = _product_count(session, auth.company_id, brand_id=row.id)
    if prod_count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete brand '{row.name}': {prod_count} product(s) are assigned to it. Reassign or delete those products first.",
        )
    session.delete(row)
    write_audit(session, auth, "brand_delete", "brand_master", row.id)
    return {"ok": True, "id": brand_id, "name": row.name}


def delete_unit(session: Session, auth: AuthContext, unit_id: str) -> dict:
    row = session.get(Unit, unit_id)
    if not row or row.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Unit not found")
    prod_count = _product_count(session, auth.company_id, unit_id=row.id)
    if prod_count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete unit '{row.name}': {prod_count} product(s) are assigned to it. Reassign or delete those products first.",
        )
    session.delete(row)
    write_audit(session, auth, "unit_delete", "unit", row.id)
    return {"ok": True, "id": unit_id, "name": row.name}

