"""Pack attribute master — industry-specific dropdown values for product forms."""

from __future__ import annotations

from fastapi import HTTPException
from sqlmodel import Session, select, func

from app.dependencies import AuthContext, write_audit
from app.models.config_engine import PackAttribute

# Default seed values when a company has none for a pack+type.
DEFAULT_PACK_ATTRIBUTES: dict[str, dict[str, list[tuple[str, str]]]] = {
    "fashion": {
        "season": [("SS", "SS"), ("FW", "FW"), ("ALL", "All season"), ("SUM", "Summer"), ("WIN", "Winter")],
        "gender": [("MEN", "Men"), ("WOM", "Women"), ("UNI", "Unisex"), ("BOY", "Boys"), ("GRL", "Girls"), ("KID", "Kids")],
        "fit": [("SLIM", "Slim"), ("REG", "Regular"), ("REL", "Relaxed"), ("OVR", "Oversized"), ("TAI", "Tailored")],
        "fabric": [("COT", "Cotton"), ("DEN", "Denim"), ("LIN", "Linen"), ("POL", "Polyester"), ("SIL", "Silk"), ("WOO", "Wool")],
        "product_type": [("POL", "Polo"), ("JEA", "Jeans"), ("SHR", "Shirt"), ("TEE", "T-Shirt"), ("DRS", "Dress"), ("JAC", "Jacket")],
        "category": [("TOP", "Tops"), ("BOT", "Bottoms"), ("OUT", "Outerwear"), ("ACC", "Accessories")],
        "color": [("BLK", "Black"), ("WHT", "White"), ("BLU", "Blue"), ("RED", "Red"), ("GRN", "Green"), ("NVY", "Navy")],
    },
    "pharmacy": {
        "dosage_form": [("TAB", "Tablet"), ("CAP", "Capsule"), ("SYR", "Syrup"), ("INJ", "Injection")],
    },
    "jewelry": {
        "metal": [("AU", "Gold"), ("AG", "Silver"), ("PT", "Platinum")],
        "karat": [("24K", "24K"), ("22K", "22K"), ("21K", "21K"), ("18K", "18K"), ("14K", "14K"), ("925", "925"), ("999", "999")],
    },
    "restaurant": {
        "course": [("ST", "Starter"), ("MN", "Main"), ("DS", "Dessert"), ("BV", "Beverage"), ("CB", "Combo")],
    },
    "beef-shop": {
        "category": [("BEEF", "Beef"), ("MUT", "Mutton"), ("CHK", "Chicken"), ("FSH", "Fish"), ("SAU", "Sausage"), ("FRZ", "Frozen")],
    },
    "crockery": {
        "category": [
            ("DIN", "Dinnerware"),
            ("CW", "Cookware & Cookers"),
            ("GW", "Glassware"),
            ("DW", "Drinkware & Flasks"),
            ("CUT", "Cutlery & Tools"),
            ("FS", "Food Storage"),
            ("SP", "Spare Parts"),
        ],
        "material": [
            ("OPAL", "Opal Glass"),
            ("BONE", "Fine Bone China"),
            ("CER", "Ceramic / Porcelain"),
            ("MEL", "Melamine"),
            ("SS304", "Stainless Steel 304"),
            ("ANOD", "Hard Anodized"),
            ("IRON", "Cast Iron"),
            ("GRAN", "Non-Stick Granite"),
            ("BORO", "Borosilicate Glass"),
        ],
        "heat_compatibility": [
            ("IND_GAS", "Induction & Gas"),
            ("GAS", "Gas Only"),
            ("MICRO", "Microwave Safe"),
            ("OVEN", "Oven Safe"),
            ("NONE", "Not Heat Resistant"),
        ],
    },
    "cycle-toys": {
        "category": [
            ("KIDS_CYCLES", "Kids Cycles & Tricycles"),
            ("GEARED_MTB", "Geared Mountain & Road Bicycles"),
            ("RIDE_ONS", "Electric Battery Ride-on Cars & Bikes"),
            ("TOYS_GAMES", "Action Toys, Blocks & Board Games"),
            ("BABY_GEAR", "Baby Strollers, Prams & Walkers"),
            ("SPARES_GEAR", "Helmets, Bells & Cycle Spares"),
            ("WORKSHOP", "Workshop Service & Assembly Charge"),
        ],
        "wheel_size": [
            ("12_INCH", '12" (Ages 2-4)'),
            ("14_INCH", '14" (Ages 3-5)'),
            ("16_INCH", '16" (Ages 4-6)'),
            ("18_INCH", '18" (Ages 5-8)'),
            ("20_INCH", '20" (Ages 6-9)'),
            ("24_INCH", '24" (Ages 8-12)'),
            ("26_INCH", '26" (Teen / Adult)'),
            ("27_5_INCH", '27.5" (Adult MTB)'),
            ("29_INCH", '29" (Adult MTB)'),
            ("NA", "N/A"),
        ],
        "age_group": [
            ("0_12M", "0-12 Months"),
            ("1_3Y", "1-3 Years"),
            ("3_5Y", "3-5 Years"),
            ("6_8Y", "6-8 Years"),
            ("9_12Y", "9-12 Years"),
            ("13_PLUS", "13+ / Adult"),
        ],
        "assembly_status": [
            ("ASSEMBLED", "Ready-to-Ride (Pre-Assembled)"),
            ("BOXED_SKD", "Boxed SKD (Unassembled Carton)"),
        ],
    },
}


def _row_out(r: PackAttribute) -> dict:
    return {
        "id": r.id,
        "pack_code": r.pack_code,
        "attr_type": r.attr_type,
        "code": r.code,
        "name": r.name,
        "parent_id": r.parent_id,
        "sort_order": r.sort_order,
        "is_active": r.is_active,
    }


def list_pack_attributes(
    session: Session,
    company_id: str,
    pack_code: str,
    attr_type: str | None = None,
    parent_id: str | None = None,
    active_only: bool = True,
    seed_defaults: bool = True,
) -> list[dict]:
    if seed_defaults:
        if attr_type:
            existing = session.exec(
                select(func.count()).select_from(PackAttribute).where(
                    PackAttribute.company_id == company_id,
                    PackAttribute.pack_code == pack_code,
                    PackAttribute.attr_type == attr_type,
                )
            ).one()
            if existing == 0:
                _seed_defaults(session, company_id, pack_code, attr_type)
        else:
            pack_defaults = DEFAULT_PACK_ATTRIBUTES.get(pack_code, {})
            for t in list(pack_defaults.keys()) + (
                ["subcategory"] if pack_code == "fashion" else []
            ):
                existing = session.exec(
                    select(func.count()).select_from(PackAttribute).where(
                        PackAttribute.company_id == company_id,
                        PackAttribute.pack_code == pack_code,
                        PackAttribute.attr_type == t,
                    )
                ).one()
                if existing == 0:
                    _seed_defaults(session, company_id, pack_code, t)

    q = select(PackAttribute).where(
        PackAttribute.company_id == company_id,
        PackAttribute.pack_code == pack_code,
    )
    if attr_type:
        q = q.where(PackAttribute.attr_type == attr_type)
    if parent_id is not None:
        q = q.where(PackAttribute.parent_id == parent_id)
    if active_only:
        q = q.where(PackAttribute.is_active == True)  # noqa: E712
    q = q.order_by(PackAttribute.sort_order, PackAttribute.name)
    rows = session.exec(q).all()
    deduped: list[dict] = []
    seen_keys: set[tuple[str, str]] = set()
    for r in rows:
        dedup_key = (r.attr_type, (r.name or "").strip().lower())
        if dedup_key in seen_keys:
            continue
        seen_keys.add(dedup_key)
        deduped.append(_row_out(r))
    return deduped


def _seed_defaults(session: Session, company_id: str, pack_code: str, attr_type: str) -> None:
    defaults = DEFAULT_PACK_ATTRIBUTES.get(pack_code, {}).get(attr_type, [])
    # Fashion subcategories seeded under category parents after categories exist
    if pack_code == "fashion" and attr_type == "subcategory":
        cats = session.exec(
            select(PackAttribute).where(
                PackAttribute.company_id == company_id,
                PackAttribute.pack_code == pack_code,
                PackAttribute.attr_type == "category",
            )
        ).all()
        if not cats:
            _seed_defaults(session, company_id, pack_code, "category")
            cats = session.exec(
                select(PackAttribute).where(
                    PackAttribute.company_id == company_id,
                    PackAttribute.pack_code == pack_code,
                    PackAttribute.attr_type == "category",
                )
            ).all()
        sub_map = {
            "Tops": [("TSH", "T-Shirts"), ("SHI", "Shirts"), ("POL", "Polos")],
            "Bottoms": [("JEA", "Jeans"), ("TRO", "Trousers"), ("SHR", "Shorts")],
            "Outerwear": [("JAC", "Jackets"), ("HOO", "Hoodies")],
            "Accessories": [("BEL", "Belts"), ("CAP", "Caps")],
        }
        order = 0
        for cat in cats:
            for code, name in sub_map.get(cat.name, []):
                session.add(
                    PackAttribute(
                        company_id=company_id,
                        pack_code=pack_code,
                        attr_type="subcategory",
                        code=f"{cat.code}-{code}",
                        name=name,
                        parent_id=cat.id,
                        sort_order=order,
                    )
                )
                order += 1
        session.flush()
        return

    for i, (code, name) in enumerate(defaults):
        session.add(
            PackAttribute(
                company_id=company_id,
                pack_code=pack_code,
                attr_type=attr_type,
                code=code,
                name=name,
                sort_order=i,
            )
        )
    session.flush()


def create_pack_attribute(session: Session, auth: AuthContext, body: dict) -> dict:
    pack_code = str(body["pack_code"]).strip()
    attr_type = str(body["attr_type"]).strip()
    code = str(body["code"]).strip()
    name = str(body["name"]).strip()
    if not pack_code or not attr_type or not code or not name:
        raise HTTPException(status_code=400, detail="pack_code, attr_type, code, and name are required")

    dup = session.exec(
        select(PackAttribute).where(
            PackAttribute.company_id == auth.company_id,
            PackAttribute.pack_code == pack_code,
            PackAttribute.attr_type == attr_type,
            func.lower(PackAttribute.code) == code.lower(),
        )
    ).first()
    if dup:
        raise HTTPException(status_code=409, detail="Code already exists for this attribute type")

    parent_id = body.get("parent_id")
    if parent_id:
        parent = session.get(PackAttribute, parent_id)
        if not parent or parent.company_id != auth.company_id:
            raise HTTPException(status_code=400, detail="Invalid parent attribute")

    row = PackAttribute(
        company_id=auth.company_id,
        pack_code=pack_code,
        attr_type=attr_type,
        code=code,
        name=name,
        parent_id=parent_id,
        sort_order=int(body.get("sort_order") or 0),
        is_active=bool(body.get("is_active", True)),
    )
    session.add(row)
    session.flush()
    write_audit(session, auth, "pack_attribute_create", "pack_attribute", row.id, {"code": code, "attr_type": attr_type})
    return _row_out(row)


def update_pack_attribute(session: Session, auth: AuthContext, attr_id: str, body: dict) -> dict:
    row = session.get(PackAttribute, attr_id)
    if not row or row.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Attribute not found")
    if "name" in body and body["name"] is not None:
        row.name = str(body["name"]).strip()
    if "code" in body and body["code"] is not None:
        new_code = str(body["code"]).strip()
        dup = session.exec(
            select(PackAttribute).where(
                PackAttribute.company_id == auth.company_id,
                PackAttribute.pack_code == row.pack_code,
                PackAttribute.attr_type == row.attr_type,
                func.lower(PackAttribute.code) == new_code.lower(),
                PackAttribute.id != row.id,
            )
        ).first()
        if dup:
            raise HTTPException(status_code=409, detail="Code already exists for this attribute type")
        row.code = new_code
    if "parent_id" in body:
        row.parent_id = body["parent_id"]
    if "sort_order" in body and body["sort_order"] is not None:
        row.sort_order = int(body["sort_order"])
    if "is_active" in body and body["is_active"] is not None:
        row.is_active = bool(body["is_active"])
    session.add(row)
    session.flush()
    write_audit(session, auth, "pack_attribute_update", "pack_attribute", row.id, body)
    return _row_out(row)


def delete_pack_attribute(session: Session, auth: AuthContext, attr_id: str) -> dict:
    row = session.get(PackAttribute, attr_id)
    if not row or row.company_id != auth.company_id:
        raise HTTPException(status_code=404, detail="Attribute not found")
    children = session.exec(select(PackAttribute).where(PackAttribute.parent_id == row.id)).first()
    if children:
        raise HTTPException(status_code=409, detail="Remove child attributes first")
    session.delete(row)
    write_audit(session, auth, "pack_attribute_delete", "pack_attribute", attr_id, {"code": row.code})
    return {"ok": True}
